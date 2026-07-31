// Prediction ledger — durable record of every forecast the site publishes.
//
// Talks to PostgREST directly rather than pulling in @supabase/supabase-js: we
// need six queries against one schema, and a dependency-free fetch wrapper is
// easier to reason about than an SDK whose schema handling for non-public
// schemas is a footgun. The tables live in the `marketforecast` schema of the
// Supabase project shared with statusworld, hence the explicit profile headers
// on every request — without them PostgREST silently targets `public`.
//
// Everything here degrades to null/empty rather than throwing. The ledger is
// an accountability feature; if it is down, pages must still render.

import type { QuantForecast } from '@/lib/forecast/quant';

const SCHEMA = 'marketforecast';

function config(): { url: string; key: string } | null {
  const url = process.env.SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) return null;
  return { url: url.replace(/\/$/, ''), key };
}

export function ledgerConfigured(): boolean {
  return config() !== null;
}

async function rest(
  path: string,
  init: RequestInit & { write?: boolean } = {}
): Promise<Response | null> {
  const cfg = config();
  if (!cfg) return null;
  const { write, headers, ...rest } = init;
  return fetch(`${cfg.url}/rest/v1/${path}`, {
    ...rest,
    cache: 'no-store',
    signal: AbortSignal.timeout(15000),
    headers: {
      apikey: cfg.key,
      Authorization: `Bearer ${cfg.key}`,
      'Content-Type': 'application/json',
      // PostgREST routes by profile header; omitting these targets `public`.
      ...(write ? { 'Content-Profile': SCHEMA } : { 'Accept-Profile': SCHEMA }),
      ...(headers as Record<string, string> | undefined),
    },
  });
}

// ---------------------------------------------------------------------------
// Writing
// ---------------------------------------------------------------------------

export interface PredictionInput {
  slug: string;
  category: 'crypto' | 'commodity';
  forecast: QuantForecast;
  indicators: Record<string, number>;
  regime: string;
  promptVersion?: string;
}

/**
 * Insert today's forecast for an asset.
 *
 * A unique index on (slug, horizon_days, issued_date) enforces one row per
 * asset per horizon per day, so re-running the cron is harmless — the conflict
 * is swallowed and reported as `false` rather than raised. That property is
 * what makes the job safe to retry.
 *
 * Returns true if a new row was written.
 */
export async function recordPrediction(input: PredictionInput): Promise<boolean> {
  const f = input.forecast;
  const resolvesAt = new Date(Date.now() + f.horizonDays * 86400_000).toISOString();

  const row = {
    slug: input.slug,
    category: input.category,
    issued_price: f.issuedPrice,
    horizon_days: f.horizonDays,
    resolves_at: resolvesAt,
    support: f.support,
    resistance: f.resistance,
    median: f.median,
    band80_low: f.interval80.low,
    band80_high: f.interval80.high,
    band50_low: f.interval50.low,
    band50_high: f.interval50.high,
    prob_bull: f.bull.probability,
    prob_base: f.base.probability,
    prob_bear: f.bear.probability,
    annualized_vol_pct: f.annualizedVolPct,
    horizon_sigma: f.horizonSigma,
    indicators: input.indicators,
    regime: input.regime,
    model_version: f.modelVersion,
    prompt_version: input.promptVersion ?? null,
  };

  try {
    const res = await rest('predictions', {
      method: 'POST',
      write: true,
      body: JSON.stringify(row),
      headers: { Prefer: 'return=minimal' },
    });
    if (!res) return false;
    if (res.status === 409) return false; // already logged today
    if (!res.ok) {
      console.error(`[ledger] insert failed for ${input.slug}: ${res.status} ${await res.text()}`);
      return false;
    }
    return true;
  } catch (err) {
    console.error(`[ledger] insert threw for ${input.slug}:`, err);
    return false;
  }
}

// ---------------------------------------------------------------------------
// Resolution
// ---------------------------------------------------------------------------

export interface MaturedPrediction {
  id: number;
  slug: string;
  category: 'crypto' | 'commodity';
  issued_price: number;
  median: number;
  support: number;
  resistance: number;
  band80_low: number;
  band80_high: number;
  band50_low: number;
  band50_high: number;
  prob_bull: number;
  prob_base: number;
  prob_bear: number;
}

/**
 * Predictions whose horizon has elapsed and which have no resolution row yet.
 * The `resolutions` left-join filter is expressed as a PostgREST embedded
 * resource with an `is.null` check on the child.
 */
export async function getMaturedPredictions(limit = 200): Promise<MaturedPrediction[]> {
  const cols = 'id,slug,category,issued_price,median,support,resistance,band80_low,band80_high,band50_low,band50_high,prob_bull,prob_base,prob_bear';
  const q = `predictions?select=${cols},resolutions!left(prediction_id)`
    + `&resolves_at=lte.${new Date().toISOString()}`
    + `&resolutions=is.null&limit=${limit}`;
  try {
    const res = await rest(q);
    if (!res || !res.ok) {
      if (res) console.error(`[ledger] matured query failed: ${res.status} ${await res.text()}`);
      return [];
    }
    return (await res.json()) as MaturedPrediction[];
  } catch (err) {
    console.error('[ledger] matured query threw:', err);
    return [];
  }
}

/** Score a matured prediction against what actually happened. */
export function scorePrediction(p: MaturedPrediction, actual: number) {
  const outcome: 'bull' | 'base' | 'bear' =
    actual > p.resistance ? 'bull' : actual < p.support ? 'bear' : 'base';

  // Multi-class Brier: sum of squared differences across all three scenarios.
  // Range 0 (perfect) to 2 (maximally wrong).
  const probs = { bull: p.prob_bull, base: p.prob_base, bear: p.prob_bear };
  let brier = 0;
  for (const k of ['bull', 'base', 'bear'] as const) {
    brier += (probs[k] - (outcome === k ? 1 : 0)) ** 2;
  }

  return {
    prediction_id: p.id,
    actual_price: actual,
    outcome,
    inside_band80: actual >= p.band80_low && actual <= p.band80_high,
    inside_band50: actual >= p.band50_low && actual <= p.band50_high,
    abs_pct_error: (Math.abs(p.median - actual) / actual) * 100,
    abs_pct_error_random_walk: (Math.abs(p.issued_price - actual) / actual) * 100,
    brier,
  };
}

export async function recordResolutions(
  rows: ReturnType<typeof scorePrediction>[]
): Promise<number> {
  if (rows.length === 0) return 0;
  try {
    const res = await rest('resolutions', {
      method: 'POST',
      write: true,
      body: JSON.stringify(rows),
      headers: { Prefer: 'return=minimal,resolution=ignore-duplicates' },
    });
    if (!res || !res.ok) {
      if (res) console.error(`[ledger] resolution insert failed: ${res.status} ${await res.text()}`);
      return 0;
    }
    return rows.length;
  } catch (err) {
    console.error('[ledger] resolution insert threw:', err);
    return 0;
  }
}

// ---------------------------------------------------------------------------
// Reading — powers /accuracy
// ---------------------------------------------------------------------------

export interface ScorecardRow {
  slug: string;
  category: 'crypto' | 'commodity';
  horizon_days: number;
  resolved_count: number;
  coverage80: number;
  coverage50: number;
  mean_abs_pct_error: number;
  median_abs_pct_error: number;
  median_ape_random_walk: number;
  mean_brier: number;
  rate_bull: number;
  rate_base: number;
  rate_bear: number;
  first_resolved_at: string;
  last_resolved_at: string;
}

export async function getScorecard(): Promise<ScorecardRow[]> {
  try {
    const res = await rest('scorecard?select=*&order=resolved_count.desc');
    if (!res || !res.ok) return [];
    return (await res.json()) as ScorecardRow[];
  } catch {
    return [];
  }
}

export interface CalibrationBin {
  bucket: number;
  n: number;
  mean_predicted: number;
  observed_frequency: number;
}

export async function getCalibrationBins(): Promise<CalibrationBin[]> {
  try {
    const res = await rest('calibration_bins?select=*');
    if (!res || !res.ok) return [];
    return (await res.json()) as CalibrationBin[];
  } catch {
    return [];
  }
}

/** Count of forecasts logged but not yet matured — shown while the record builds. */
export async function getPendingCount(): Promise<number> {
  try {
    const res = await rest(
      `predictions?select=id&resolves_at=gt.${new Date().toISOString()}`,
      { headers: { Prefer: 'count=exact', Range: '0-0' } }
    );
    if (!res || !res.ok) return 0;
    const cr = res.headers.get('content-range');
    return cr ? parseInt(cr.split('/')[1] ?? '0', 10) || 0 : 0;
  } catch {
    return 0;
  }
}

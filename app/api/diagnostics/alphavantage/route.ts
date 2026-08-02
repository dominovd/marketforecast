// Probe Alpha Vantage's commodity endpoints before trusting any of them.
//
// Two things must be true for a commodity to move off its ETF proxy and onto
// real spot data, and only one is obvious:
//
//   1. The endpoint returns data at all.
//   2. It returns DAILY data with enough history. The forecast model needs
//      ~180 daily closes to estimate EWMA volatility; several Alpha Vantage
//      commodity series are published monthly only. A monthly series cannot
//      feed the model, so adopting one would give a correct-looking price on a
//      page whose forecast silently degraded — worse than the current proxy,
//      which is at least internally consistent.
//
// The `unit` field is reported prominently because it is the single most
// valuable piece of metadata here: "dollars per barrel" vs "dollars per metric
// ton" vs an index level determines whether the number means what the page
// claims. Not having this for Twelve Data is what allowed the ETF/spot
// confusion to go unnoticed.
//
// Quota note: the free tier allows 25 requests/day and this probe spends one
// per commodity. Use ?only=<slug> to test a single series once the quota
// starts to matter.

import { NextResponse } from 'next/server';

export const dynamic = 'force-dynamic';
export const maxDuration = 120;

const BASE = 'https://www.alphavantage.co/query';

/** Slug -> Alpha Vantage commodity function name. */
const AV_FUNCTIONS: Record<string, string> = {
  oil:        'WTI',
  brent:      'BRENT',
  naturalgas: 'NATURAL_GAS',
  copper:     'COPPER',
  aluminum:   'ALUMINUM',
  wheat:      'WHEAT',
  corn:       'CORN',
  sugar:      'SUGAR',
  coffee:     'COFFEE',
};

/** Minimum daily observations the forecast model needs to fit. */
const MIN_DAILY_POINTS = 60;

interface AvResult {
  slug: string;
  fn: string;
  ok: boolean;
  usable: boolean;
  detail: string;
  unit?: string;
  name?: string;
  interval?: string;
  points?: number;
  firstDate?: string;
  latestDate?: string;
  latestValue?: number;
  /** Median days between observations — exposes a monthly series claiming daily. */
  medianSpacingDays?: number;
}

async function probe(slug: string, fn: string, key: string): Promise<AvResult> {
  const base: AvResult = { slug, fn, ok: false, usable: false, detail: '' };
  try {
    const qs = new URLSearchParams({ function: fn, interval: 'daily', apikey: key });
    const res = await fetch(`${BASE}?${qs}`, {
      cache: 'no-store',
      signal: AbortSignal.timeout(20000),
    });
    const j = await res.json();

    // Alpha Vantage signals problems with 200 OK and a prose field.
    if (j.Note) return { ...base, detail: `rate limited: ${String(j.Note).slice(0, 160)}` };
    if (j.Information) return { ...base, detail: `info: ${String(j.Information).slice(0, 200)}` };
    if (j['Error Message']) return { ...base, detail: `error: ${String(j['Error Message']).slice(0, 160)}` };

    const data: Array<{ date: string; value: string }> = j?.data ?? [];
    const clean = data
      .filter(d => d.value !== '.' && isFinite(parseFloat(d.value)))
      .map(d => ({ date: d.date, value: parseFloat(d.value) }));

    if (clean.length === 0) return { ...base, detail: 'no usable observations returned' };

    // Newest-first from AV; compute spacing to verify the claimed cadence.
    const spacings: number[] = [];
    for (let i = 1; i < Math.min(clean.length, 40); i++) {
      const a = new Date(clean[i - 1].date).getTime();
      const b = new Date(clean[i].date).getTime();
      spacings.push(Math.abs(a - b) / 86400_000);
    }
    spacings.sort((x, y) => x - y);
    const medianSpacing = spacings.length ? spacings[Math.floor(spacings.length / 2)] : NaN;

    const isDaily = medianSpacing <= 5;
    const enough = clean.length >= MIN_DAILY_POINTS;
    const usable = isDaily && enough;

    return {
      slug, fn, ok: true, usable,
      detail: usable
        ? 'daily series with sufficient history — usable by the forecast model'
        : !isDaily
          ? `median spacing ${medianSpacing} days — NOT daily, cannot feed the volatility model`
          : `only ${clean.length} observations, need >= ${MIN_DAILY_POINTS}`,
      unit: j.unit,
      name: j.name,
      interval: j.interval,
      points: clean.length,
      firstDate: clean[clean.length - 1]?.date,
      latestDate: clean[0]?.date,
      latestValue: clean[0]?.value,
      medianSpacingDays: medianSpacing,
    };
  } catch (err) {
    return { ...base, detail: err instanceof Error ? err.message : String(err) };
  }
}

export async function GET(req: Request) {
  const url = new URL(req.url);
  const secret = process.env.DIAGNOSTICS_SECRET;
  if (secret && url.searchParams.get('key') !== secret) {
    return NextResponse.json({ error: 'unauthorized' }, { status: 401 });
  }

  const apiKey = process.env.ALPHA_VANTAGE_API_KEY;
  if (!apiKey) {
    return NextResponse.json({ error: 'ALPHA_VANTAGE_API_KEY not set' }, { status: 503 });
  }

  const only = url.searchParams.get('only');
  const entries = Object.entries(AV_FUNCTIONS).filter(([slug]) => !only || slug === only);

  const results: AvResult[] = [];
  for (const [slug, fn] of entries) {
    results.push(await probe(slug, fn, apiKey));
    // Gentle spacing; AV throttles bursts even within the daily allowance.
    await new Promise(r => setTimeout(r, 1500));
  }

  const usable = results.filter(r => r.usable).map(r => r.slug);
  const notDaily = results.filter(r => r.ok && !r.usable).map(r => `${r.slug} (${r.detail})`);
  const failed = results.filter(r => !r.ok).map(r => `${r.slug}: ${r.detail}`);

  return NextResponse.json({
    checkedAt: new Date().toISOString(),
    requestsSpent: results.length,
    quotaNote: 'Free tier is 25 requests/day. Use ?only=<slug> to retest one series.',
    summary: {
      usableDaily: usable,
      unusable: notDaily,
      failed,
    },
    // Units are the point: they say what the number actually measures, which is
    // exactly the metadata whose absence let the ETF/spot mix-up through.
    units: Object.fromEntries(results.filter(r => r.unit).map(r => [r.slug, `${r.unit} — ${r.name}`])),
    results,
  }, { headers: { 'Cache-Control': 'no-store' } });
}

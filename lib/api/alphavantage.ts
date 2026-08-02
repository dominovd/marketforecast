// Alpha Vantage commodity client — real spot prices for energy.
//
// Scope is deliberately narrow. The probe at /api/diagnostics/alphavantage
// established that only WTI, BRENT and NATURAL_GAS are published daily; copper,
// aluminium, wheat, corn, sugar and coffee come back monthly with the newest
// observation two months old. A monthly series cannot feed a model that
// estimates volatility from daily returns, so those stay on their ETF proxies
// and only energy moves here.
//
// What this buys: WTI at ~$84/barrel instead of USO at ~$130/share. A number
// that means what the page says it means, with no proxy caveat needed.
//
// Quota is 25 requests/day. Three commodities on a 24h cache costs 3, leaving
// room for the occasional diagnostic run but not for much expansion.

import { getCached, setCached } from '@/lib/cache/redis';

const BASE = 'https://www.alphavantage.co/query';
const HISTORY_TTL = 24 * 60 * 60;

export interface AvPoint { date: string; price: number }

export interface AvSeries {
  points: AvPoint[];
  /** ISO date of the most recent observation. */
  asOf: string;
  /** e.g. "dollars per barrel" — what the number actually measures. */
  unit: string;
  name: string;
}

function apiKey(): string {
  const k = process.env.ALPHA_VANTAGE_API_KEY;
  if (!k) throw new Error('Missing ALPHA_VANTAGE_API_KEY');
  return k;
}

/**
 * Full daily history for one commodity function, cached 24h.
 *
 * Alpha Vantage returns newest-first and uses '.' for missing observations
 * (holidays, reporting gaps). Those must be filtered before any arithmetic —
 * parseFloat('.') is NaN and would silently poison every downstream indicator.
 */
async function fetchSeries(fn: string): Promise<AvSeries> {
  const cacheKey = `av:series:${fn}`;
  const cached = await getCached<AvSeries>(cacheKey);
  if (cached && cached.points.length > 0) return cached;

  const qs = new URLSearchParams({ function: fn, interval: 'daily', apikey: apiKey() });
  const res = await fetch(`${BASE}?${qs}`, {
    next: { revalidate: 3600 },
    signal: AbortSignal.timeout(20000),
  });
  if (!res.ok) throw new Error(`Alpha Vantage ${fn} → HTTP ${res.status}`);
  const j = await res.json();

  // AV reports problems with 200 OK and a prose field rather than a status code.
  if (j.Note) throw new Error(`Alpha Vantage rate limit on ${fn}: ${String(j.Note).slice(0, 120)}`);
  if (j.Information) throw new Error(`Alpha Vantage ${fn}: ${String(j.Information).slice(0, 160)}`);
  if (j['Error Message']) throw new Error(`Alpha Vantage ${fn}: ${String(j['Error Message']).slice(0, 120)}`);

  const raw: Array<{ date: string; value: string }> = j?.data ?? [];
  const points: AvPoint[] = raw
    .filter(d => d.value !== '.' && isFinite(parseFloat(d.value)))
    .map(d => ({ date: d.date, price: parseFloat(d.value) }))
    .reverse(); // oldest → newest, matching every other series in the app

  if (points.length === 0) throw new Error(`Alpha Vantage ${fn} returned no usable observations`);

  const series: AvSeries = {
    points,
    asOf: points[points.length - 1].date,
    unit: j.unit ?? '',
    name: j.name ?? fn,
  };
  await setCached(cacheKey, series, HISTORY_TTL);
  return series;
}

/** Daily closes for the last `days` observations, oldest → newest. */
export async function getAvHistory(fn: string, days: number): Promise<AvPoint[]> {
  const s = await fetchSeries(fn);
  const sliced = s.points.length <= days ? s.points : s.points.slice(s.points.length - days);
  // Reformat to the "MMM d" label the charts expect.
  return sliced.map(p => ({
    date: new Date(p.date).toLocaleDateString('en-US', { month: 'short', day: 'numeric' }),
    price: p.price,
  }));
}

export interface AvPrice {
  price: number;
  change24h: number;
  change7d: number;
  change30d: number;
  volume24h: string;
  /** ISO date of the latest observation — these series lag by several days. */
  asOf: string;
  unit: string;
}

/**
 * Latest price plus trailing changes.
 *
 * Note the lag: these are EIA-sourced series and the newest observation is
 * typically several days old. The page must not imply they are live, so asOf
 * is returned for display rather than quietly dropped.
 */
export async function getAvPrice(fn: string): Promise<AvPrice> {
  const s = await fetchSeries(fn);
  if (s.points.length < 2) throw new Error(`Alpha Vantage ${fn}: not enough observations`);

  const latest = s.points[s.points.length - 1];
  const current = latest.price;
  const latestMs = new Date(latest.date).getTime();

  /**
   * Price as of N CALENDAR days before the latest observation.
   *
   * Counting observations instead — p[length - 1 - n] — is wrong for these
   * series and was visibly so: EIA publishes on business days only, so 30
   * observations reach back about 42 calendar days and a "24h" step spans three
   * days across a weekend. The homepage duly showed crude at -8.16% "24h" and
   * -8.00% "30d", and the regime classifier, which keys off the 30-day figure,
   * inherited the error.
   *
   * Picking the observation nearest the target date keeps the label honest
   * regardless of how many trading days happen to fall in the window.
   */
  const at = (calendarDaysBack: number): number => {
    const target = latestMs - calendarDaysBack * 86400_000;
    let best = s.points[0];
    let bestGap = Math.abs(new Date(best.date).getTime() - target);
    for (const pt of s.points) {
      const gap = Math.abs(new Date(pt.date).getTime() - target);
      if (gap < bestGap) { best = pt; bestGap = gap; }
    }
    return best.price;
  };

  const pct = (a: number, b: number) => (b === 0 ? 0 : Math.round(((a - b) / b) * 10000) / 100);

  return {
    price: current,
    change24h: pct(current, at(1)),
    change7d: pct(current, at(7)),
    change30d: pct(current, at(30)),
    volume24h: '—', // not published for these series
    asOf: s.asOf,
    unit: s.unit,
  };
}

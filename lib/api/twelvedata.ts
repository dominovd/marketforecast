// Twelve Data API client.
//
// Free tier: 800 credits/day, 8 req/min, 5 years history.
// One slug → one /time_series call (1 credit), wrapped in 24h Redis cache.
// At 13 commodity slugs that's 13 credits/day — 1.6% of daily quota.
//
// Symbol families used:
//   - Forex pairs (precious metals):  'XAU/USD', 'XAG/USD', 'XPT/USD', 'XPD/USD'
//   - Commodity futures (CFDs):       'WTI/USD', 'XBR/USD', 'NG/USD', 'HG/USD', 'ALI/USD', 'KC/USD'
//   - Agri ETFs (NYSE-listed):         'WEAT', 'CORN', 'CANE'  (JJU delisted 2020, JO delisted 2023)
//
// ETF proxies trade with a small tracking error vs. the underlying commodity
// price, but they have reliable Twelve Data coverage. Swap to direct futures
// symbols later if precise levels matter.
import { getCached, setCached } from '@/lib/cache/redis';
import { getCommodityRouting } from '@/data/asset-registry';

const BASE = 'https://api.twelvedata.com';
const HISTORY_TTL = 24 * 60 * 60; // 24h
const HISTORY_OUTPUT_SIZE = 200;  // ~200 daily candles ≈ 9 months

export interface CommodityPrice {
  price: number;
  change24h: number;
  change7d: number;
  change30d: number;
  volume24h: string;
}

export interface PricePoint {
  date: string;
  price: number;
}

function apiKey(): string {
  const key = process.env.TWELVE_DATA_API_KEY;
  if (!key) throw new Error('Missing TWELVE_DATA_API_KEY');
  return key;
}

interface TDError {
  code?: number;
  status?: string;
  message?: string;
}

async function fetchTD<T>(path: string, params: Record<string, string>, attempt = 0): Promise<T> {
  const qs = new URLSearchParams({ ...params, apikey: apiKey() }).toString();
  const res = await fetch(`${BASE}${path}?${qs}`, {
    next: { revalidate: 3600 },
    signal: AbortSignal.timeout(15000),
  });
  if (!res.ok) throw new Error(`Twelve Data ${path} → ${res.status}`);
  const data = (await res.json()) as T & TDError;

  // Rate-limited: TD returns 200 OK with { code: 429, status: 'error' } when
  // the per-minute quota is exceeded. Back off and retry up to 3 times.
  if (data.code === 429) {
    // Retry budget kept deliberately small. The old ladder (1.5s + 3s + 4.5s)
    // spent 9 seconds per slug before giving up; five commodities fetched in
    // sequence therefore blocked for 45 seconds and blew Next's 60-second
    // per-page build timeout, failing the whole deployment. One short retry
    // absorbs a transient burst; anything worse should fail fast and fall back
    // to the last-good value instead of holding the render hostage.
    if (attempt < 1) {
      await new Promise(r => setTimeout(r, 1200));
      return fetchTD(path, params, attempt + 1);
    }
    throw new Error(`Twelve Data rate limit (429) after ${attempt + 1} attempts`);
  }

  // Other API-level errors (symbol not found, invalid key, etc.)
  if (data.status === 'error' || (typeof data.code === 'number' && data.code >= 400)) {
    throw new Error(`Twelve Data error (${data.code}): ${data.message ?? 'unknown'}`);
  }
  return data;
}

interface TDTimeSeriesResp {
  meta?: { symbol?: string; interval?: string };
  values?: { datetime: string; close: string; volume?: string }[];
}

// Pulls one wide window per slug per day. Slicing happens client-side in
// getCommodityHistory(slug, days), keeping AV-quota days behind us.
async function getFullHistory(slug: string): Promise<PricePoint[]> {
  const routing = getCommodityRouting(slug);
  if (!routing) throw new Error(`Unknown commodity slug: ${slug}`);

  const cacheKey = `td:history:${slug}`;
  const cached = await getCached<PricePoint[]>(cacheKey);
  if (cached && cached.length > 0) return cached;

  const data = await fetchTD<TDTimeSeriesResp>('/time_series', {
    symbol: routing.symbol,
    interval: '1day',
    outputsize: String(HISTORY_OUTPUT_SIZE),
    order: 'ASC', // oldest-first; default is DESC
  });

  const values = data.values ?? [];
  const points: PricePoint[] = values
    .map(v => ({
      date: new Date(v.datetime).toLocaleDateString('en-US', { month: 'short', day: 'numeric' }),
      price: parseFloat(v.close),
    }))
    .filter(p => !isNaN(p.price));

  if (points.length === 0) {
    throw new Error(`Twelve Data returned no data for ${slug} (symbol=${routing.symbol})`);
  }

  await setCached(cacheKey, points, HISTORY_TTL);
  return points;
}

export async function getCommodityHistory(slug: string, days: number): Promise<PricePoint[]> {
  const full = await getFullHistory(slug);
  if (full.length <= days) return full;
  return full.slice(full.length - days);
}

export async function getCommodityPrice(slug: string): Promise<CommodityPrice> {
  const history = await getCommodityHistory(slug, 35);
  if (history.length < 2) throw new Error(`Not enough data for ${slug}`);

  const prices = history.map(p => p.price);
  const current = prices[prices.length - 1];
  const prev1d = prices[prices.length - 2] ?? current;
  const prev7d = prices[Math.max(0, prices.length - 8)] ?? current;
  const prev30d = prices[0] ?? current;

  const pct = (a: number, b: number) =>
    b === 0 ? 0 : Math.round(((a - b) / b) * 10000) / 100;

  // Twelve Data's daily endpoint exposes volume but it's spotty for forex pairs;
  // keep static estimates per slug to avoid empty fields breaking the UI.
  const VOL_EST: Record<string, string> = {
    gold: '$182B', silver: '$24B', platinum: '$8B', palladium: '$3B',
    oil: '$890B', brent: '$620B', naturalgas: '$180B',
    copper: '$42B', aluminum: '$35B',
    wheat: '$28B', corn: '$31B', sugar: '$14B', coffee: '$22B',
  };

  return {
    price: current,
    change24h: pct(current, prev1d),
    change7d: pct(current, prev7d),
    change30d: pct(current, prev30d),
    volume24h: VOL_EST[slug] ?? '—',
  };
}

// Last known GOOD price per slug, kept for a week.
//
// Twelve Data's free tier allows 8 requests/minute. The homepage asks for five
// commodities at once, so a cold cache plus any concurrent asset-page traffic
// reliably trips a 429 on most of them. The old behaviour was to silently
// substitute hardcoded numbers from mock-assets.ts, which meant the site
// published invented prices that looked exactly like live ones.
//
// Real-but-stale beats fake-but-fresh, so we remember the last successful
// reading and serve that instead, flagged so the UI can say so.
const LAST_GOOD_TTL = 7 * 24 * 60 * 60;

export interface CommodityPriceResult extends CommodityPrice {
  /** True when this came from the last-good cache rather than a live fetch. */
  stale: boolean;
  /** When the underlying reading was taken. */
  asOf: string;
}

export async function getCommodityPriceResilient(slug: string): Promise<CommodityPriceResult | null> {
  const lastGoodKey = `td:lastgood:${slug}`;
  try {
    const fresh = await getCommodityPrice(slug);
    const result: CommodityPriceResult = { ...fresh, stale: false, asOf: new Date().toISOString() };
    await setCached(lastGoodKey, result, LAST_GOOD_TTL);
    return result;
  } catch (err) {
    console.error(`[twelvedata] live fetch failed for ${slug}, trying last-good:`, err);
    const lastGood = await getCached<CommodityPriceResult>(lastGoodKey);
    if (lastGood) return { ...lastGood, stale: true };
    // Nothing real has ever been recorded for this slug — say nothing rather
    // than make something up.
    return null;
  }
}

export async function getCommodityPriceArray(slug: string): Promise<number[]> {
  // Default to 180 daily points so MACD(26)/EMA50/ATR(14) all have headroom.
  const history = await getCommodityHistory(slug, 180);
  return history.map(p => p.price);
}

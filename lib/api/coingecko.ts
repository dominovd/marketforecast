// CoinGecko API client.
//
// Works with the free public endpoint (no key) AND the free Demo plan key
// (30 req/min, ~10x more reliable from datacenter IPs). Set
// COINGECKO_API_KEY in Vercel env to enable the Demo header — strongly
// recommended in production: serverless IPs frequently hit 429s on the
// keyless public tier.
//
// Slug → CoinGecko ID lookup is centralized in data/asset-registry.ts.
import { getCoingeckoId } from '@/data/asset-registry';
import { getCached, setCached } from '@/lib/cache/redis';

const PUBLIC_BASE = 'https://api.coingecko.com/api/v3';
const PRO_BASE = 'https://pro-api.coingecko.com/api/v3'; // for paid plans (unused for now)

export interface CoinPrice {
  price: number;
  change24h: number;
  change7d: number;
  change30d: number;
  marketCap: string;
  volume24h: string;
  fearGreed?: number;
}

export interface OHLCPoint {
  date: string;
  price: number;
  high: number;
  low: number;
}

function buildHeaders(): HeadersInit {
  const h: Record<string, string> = { Accept: 'application/json' };
  const key = process.env.COINGECKO_API_KEY;
  if (key) {
    // Demo plan uses x-cg-demo-api-key. Pro plan uses x-cg-pro-api-key, but
    // we'd also point at PRO_BASE in that case — keep simple for now.
    h['x-cg-demo-api-key'] = key;
  }
  return h;
}

async function fetchCG(path: string, attempt = 1): Promise<unknown> {
  const res = await fetch(`${PUBLIC_BASE}${path}`, {
    next: { revalidate: 300 }, // 5 min Next.js cache
    headers: buildHeaders(),
    signal: AbortSignal.timeout(12000),
  });
  if (res.status === 429 && attempt < 3) {
    // Back off and retry once or twice — keyless tier is bursty
    const wait = 1500 * attempt;
    await new Promise(r => setTimeout(r, wait));
    return fetchCG(path, attempt + 1);
  }
  if (!res.ok) throw new Error(`CoinGecko ${path} → ${res.status}`);
  return res.json();
}

function resolveId(slug: string): string {
  const id = getCoingeckoId(slug);
  if (!id) throw new Error(`Unknown coin slug: ${slug}`);
  return id;
}

export async function getCoinPrice(slug: string): Promise<CoinPrice> {
  const id = resolveId(slug);

  const data = await fetchCG(
    `/coins/markets?vs_currency=usd&ids=${id}&price_change_percentage=24h,7d,30d`
  ) as Array<{
    current_price: number;
    price_change_percentage_24h: number | null;
    price_change_percentage_7d_in_currency: number | null;
    price_change_percentage_30d_in_currency: number | null;
    market_cap: number;
    total_volume: number;
  }>;
  const coin = data[0];
  if (!coin) throw new Error(`CoinGecko returned no data for ${slug} (id=${id})`);

  return {
    price: coin.current_price,
    change24h: Math.round((coin.price_change_percentage_24h ?? 0) * 100) / 100,
    change7d: Math.round((coin.price_change_percentage_7d_in_currency ?? 0) * 100) / 100,
    change30d: Math.round((coin.price_change_percentage_30d_in_currency ?? 0) * 100) / 100,
    marketCap: formatLarge(coin.market_cap),
    volume24h: formatLarge(coin.total_volume),
  };
}

// Bulk fetcher — pulls prices for many slugs in a single CoinGecko call.
// Handy for the homepage and other places that need >1 asset at once,
// preventing N round-trips from rate-limiting the keyless tier.
export async function getCoinPricesBulk(slugs: string[]): Promise<Record<string, CoinPrice>> {
  const ids = slugs
    .map(s => ({ slug: s, id: getCoingeckoId(s) }))
    .filter((x): x is { slug: string; id: string } => Boolean(x.id));
  if (ids.length === 0) return {};

  const data = await fetchCG(
    `/coins/markets?vs_currency=usd&ids=${ids.map(x => x.id).join(',')}&price_change_percentage=24h,7d,30d`
  ) as Array<{
    id: string;
    current_price: number;
    price_change_percentage_24h: number | null;
    price_change_percentage_7d_in_currency: number | null;
    price_change_percentage_30d_in_currency: number | null;
    market_cap: number;
    total_volume: number;
  }>;
  const idToSlug = new Map(ids.map(x => [x.id, x.slug] as const));
  const out: Record<string, CoinPrice> = {};
  for (const coin of data) {
    const slug = idToSlug.get(coin.id);
    if (!slug) continue;
    out[slug] = {
      price: coin.current_price,
      change24h: Math.round((coin.price_change_percentage_24h ?? 0) * 100) / 100,
      change7d: Math.round((coin.price_change_percentage_7d_in_currency ?? 0) * 100) / 100,
      change30d: Math.round((coin.price_change_percentage_30d_in_currency ?? 0) * 100) / 100,
      marketCap: formatLarge(coin.market_cap),
      volume24h: formatLarge(coin.total_volume),
    };
  }
  return out;
}

export async function getCoinHistory(slug: string, days: number): Promise<OHLCPoint[]> {
  const id = resolveId(slug);

  // Always fetch 180 days and cache in Redis for 24 h (same pattern as TD).
  // This means 31 crypto slugs make at most 1 history call each per day
  // instead of 1 per ISR revalidation — prevents thundering-herd 429s.
  // We previously used /coins/{id}/ohlc — but on the free Demo plan that
  // endpoint returns 4-day candles when days > 30 (so days=90 → only ~22
  // points, not enough for MACD/EMA50/ATR). /market_chart returns daily
  // granularity automatically when days > 90, giving ~180 daily points.
  const FETCH_DAYS = 180;
  const cacheKey = `cg:history:${slug}`;

  const cachedFull = await getCached<OHLCPoint[]>(cacheKey);
  if (cachedFull && cachedFull.length > 0) {
    return cachedFull.length <= days ? cachedFull : cachedFull.slice(cachedFull.length - days);
  }

  const raw = await fetchCG(`/coins/${id}/market_chart?vs_currency=usd&days=${FETCH_DAYS}`) as {
    prices: [number, number][];
  };
  const full = raw.prices.map(([ts, price]) => ({
    date: new Date(ts).toLocaleDateString('en-US', { month: 'short', day: 'numeric' }),
    price,
    high: price, // market_chart doesn't expose OHLC; synthesize for type compat
    low: price,
  }));

  if (full.length > 0) {
    await setCached(cacheKey, full, 24 * 60 * 60); // 24 h (jittered in setCached)
  }

  return full.length <= days ? full : full.slice(full.length - days);
}

// Default to 180 days so all indicators (RSI/MACD/EMA50/ATR) get enough
// daily-granularity data points. Callers can override.
export async function getCoinPriceArray(slug: string, days: number = 180): Promise<number[]> {
  const history = await getCoinHistory(slug, days);
  return history.map(p => p.price);
}

function formatLarge(n: number): string {
  if (!n || isNaN(n)) return '$0';
  if (n >= 1e12) return `$${(n / 1e12).toFixed(2)}T`;
  if (n >= 1e9) return `$${(n / 1e9).toFixed(1)}B`;
  if (n >= 1e6) return `$${(n / 1e6).toFixed(1)}M`;
  return `$${n.toLocaleString()}`;
}

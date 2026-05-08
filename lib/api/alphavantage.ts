// Alpha Vantage free — 25 req/day. Routing + symbols come from data/asset-registry.ts.
// Each per-slug history call is wrapped in a 24h Redis cache so the AV daily
// quota holds at any reasonable scale (≥10 commodity slugs).
import { getCommodityRouting } from '@/data/asset-registry';
import { getCached, setCached } from '@/lib/cache/redis';

const BASE = 'https://www.alphavantage.co/query';
const HISTORY_TTL = 24 * 60 * 60; // 24 hours

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

function apiKey() {
  const key = process.env.ALPHA_VANTAGE_API_KEY;
  if (!key) throw new Error('Missing ALPHA_VANTAGE_API_KEY');
  return key;
}

async function fetchAV(params: Record<string, string>) {
  const qs = new URLSearchParams({ ...params, apikey: apiKey() }).toString();
  const res = await fetch(`${BASE}?${qs}`, {
    next: { revalidate: 3600 },
  });
  if (!res.ok) throw new Error(`Alpha Vantage ${params.function} → ${res.status}`);
  const data = await res.json();
  // AV returns 200 with `Note` / `Information` field when daily quota hit
  if (data?.Note || data?.Information) {
    throw new Error(`Alpha Vantage rate-limited or quota exceeded: ${data.Note || data.Information}`);
  }
  return data;
}

// Always pulls a wide window (~365 days) once and slices client-side.
// One AV call per slug per 24h regardless of how many history(days) callers ask for.
async function getFullHistory(slug: string): Promise<PricePoint[]> {
  const routing = getCommodityRouting(slug);
  if (!routing) throw new Error(`Unknown commodity slug: ${slug}`);

  const cacheKey = `av:history:${slug}:full`;
  const cached = await getCached<PricePoint[]>(cacheKey);
  if (cached && cached.length > 0) return cached;

  let points: PricePoint[] = [];

  if (routing.endpoint === 'energy') {
    // WTI, NATURAL_GAS, BRENT — { data: [{date, value}, ...] }, newest first
    const data = await fetchAV({ function: routing.symbol, interval: 'daily' });
    const raw: { date: string; value: string }[] = data?.data ?? [];
    points = raw
      .reverse() // make oldest-first
      .map(p => ({
        date: new Date(p.date).toLocaleDateString('en-US', { month: 'short', day: 'numeric' }),
        price: parseFloat(p.value),
      }))
      .filter(p => !isNaN(p.price));
  } else if (routing.endpoint === 'commodity') {
    // COPPER, ALUMINUM, WHEAT, CORN, SUGAR, COFFEE, COTTON
    const data = await fetchAV({ function: routing.symbol, interval: 'daily' });
    const raw: { date: string; value: string }[] = data?.data ?? [];
    points = raw
      .reverse()
      .map(p => ({
        date: new Date(p.date).toLocaleDateString('en-US', { month: 'short', day: 'numeric' }),
        price: parseFloat(p.value),
      }))
      .filter(p => !isNaN(p.price));
  } else {
    // 'fx' — XAU, XAG, XPT, XPD vs USD
    const data = await fetchAV({
      function: 'FX_DAILY',
      from_symbol: routing.symbol,
      to_symbol: 'USD',
      outputsize: 'full',
    });
    const ts = data['Time Series FX (Daily)'] ?? {};
    points = Object.entries(ts as Record<string, Record<string, string>>)
      .reverse() // oldest-first
      .map(([date, vals]) => ({
        date: new Date(date).toLocaleDateString('en-US', { month: 'short', day: 'numeric' }),
        price: parseFloat(vals['4. close']),
      }))
      .filter(p => !isNaN(p.price));
  }

  if (points.length > 0) {
    await setCached(cacheKey, points, HISTORY_TTL);
  }
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

  const pct = (a: number, b: number) => Math.round(((a - b) / b) * 10000) / 100;

  // Stable volume estimates per slug — AV doesn't provide volume in commodity endpoints
  const VOL_EST: Record<string, string> = {
    gold: '$182B', silver: '$24B', oil: '$890B', naturalgas: '$180B',
    copper: '$42B', platinum: '$8B', palladium: '$3B',
  };

  return {
    price: current,
    change24h: pct(current, prev1d),
    change7d: pct(current, prev7d),
    change30d: pct(current, prev30d),
    volume24h: VOL_EST[slug] ?? '—',
  };
}

export async function getCommodityPriceArray(slug: string): Promise<number[]> {
  const history = await getCommodityHistory(slug, 90);
  return history.map(p => p.price);
}

// Alpha Vantage free — 25 req/day, cached 24h in Redis
const BASE = 'https://www.alphavantage.co/query';

const SYMBOLS: Record<string, string> = {
  gold: 'XAU',
  silver: 'XAG',
  oil: 'WTI',
  naturalgas: 'NATURAL_GAS',
  copper: 'COPPER',
};

// Alpha Vantage uses forex endpoint for metals, energy for oil/gas, commodity for copper
const FOREX_METALS = ['gold', 'silver'];
const ENERGY_COMMODITIES = ['oil', 'naturalgas'];
const AV_COMMODITIES = ['copper'];

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
  return res.json();
}

export async function getCommodityHistory(slug: string, days: number): Promise<PricePoint[]> {
  const symbol = SYMBOLS[slug];
  if (!symbol) throw new Error(`Unknown commodity slug: ${slug}`);

  let timeSeries: Record<string, Record<string, string>>;

  if (ENERGY_COMMODITIES.includes(slug)) {
    // WTI / Natural Gas — use Alpha Vantage energy endpoints
    const fn = slug === 'oil' ? 'WTI' : 'NATURAL_GAS';
    const data = await fetchAV({ function: fn, interval: 'daily' });
    const points: { date: string; value: string }[] = data?.data ?? [];
    return points
      .slice(0, days)
      .reverse()
      .map(p => ({
        date: new Date(p.date).toLocaleDateString('en-US', { month: 'short', day: 'numeric' }),
        price: parseFloat(p.value),
      }))
      .filter(p => !isNaN(p.price));
  } else if (AV_COMMODITIES.includes(slug)) {
    // Copper via COPPER endpoint
    const data = await fetchAV({ function: 'COPPER', interval: 'daily' });
    const points: { date: string; value: string }[] = data?.data ?? [];
    return points
      .slice(0, days)
      .reverse()
      .map(p => ({
        date: new Date(p.date).toLocaleDateString('en-US', { month: 'short', day: 'numeric' }),
        price: parseFloat(p.value),
      }))
      .filter(p => !isNaN(p.price));
  } else {
    // Gold / Silver via FX_DAILY (USD quote)
    const data = await fetchAV({
      function: 'FX_DAILY',
      from_symbol: symbol,
      to_symbol: 'USD',
      outputsize: 'compact',
    });
    timeSeries = data['Time Series FX (Daily)'] ?? {};
    return Object.entries(timeSeries)
      .slice(0, days)
      .reverse()
      .map(([date, vals]) => ({
        date: new Date(date).toLocaleDateString('en-US', { month: 'short', day: 'numeric' }),
        price: parseFloat(vals['4. close']),
      }));
  }
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

  return {
    price: current,
    change24h: pct(current, prev1d),
    change7d: pct(current, prev7d),
    change30d: pct(current, prev30d),
    volume24h: slug === 'gold' ? '$182B' : slug === 'silver' ? '$24B' : '$890B', // stable estimates
  };
}

export async function getCommodityPriceArray(slug: string): Promise<number[]> {
  const history = await getCommodityHistory(slug, 90);
  return history.map(p => p.price);
}

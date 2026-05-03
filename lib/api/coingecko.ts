// CoinGecko free API — no key required, 30 req/min limit
const BASE = 'https://api.coingecko.com/api/v3';

const COIN_IDS: Record<string, string> = {
  bitcoin: 'bitcoin',
  ethereum: 'ethereum',
  solana: 'solana',
};

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

async function fetchCG(path: string) {
  const res = await fetch(`${BASE}${path}`, {
    next: { revalidate: 300 }, // 5 min Next.js cache
    headers: { 'Accept': 'application/json' },
  });
  if (!res.ok) throw new Error(`CoinGecko ${path} → ${res.status}`);
  return res.json();
}

export async function getCoinPrice(slug: string): Promise<CoinPrice> {
  const id = COIN_IDS[slug];
  if (!id) throw new Error(`Unknown coin slug: ${slug}`);

  const data = await fetchCG(
    `/coins/markets?vs_currency=usd&ids=${id}&price_change_percentage=24h,7d,30d`
  );
  const coin = data[0];

  return {
    price: coin.current_price,
    change24h: Math.round(coin.price_change_percentage_24h * 100) / 100,
    change7d: Math.round((coin.price_change_percentage_7d_in_currency ?? 0) * 100) / 100,
    change30d: Math.round((coin.price_change_percentage_30d_in_currency ?? 0) * 100) / 100,
    marketCap: formatLarge(coin.market_cap),
    volume24h: formatLarge(coin.total_volume),
  };
}

export async function getCoinHistory(slug: string, days: number): Promise<OHLCPoint[]> {
  const id = COIN_IDS[slug];
  if (!id) throw new Error(`Unknown coin slug: ${slug}`);

  // Use OHLC endpoint for richer data
  const raw = await fetchCG(`/coins/${id}/ohlc?vs_currency=usd&days=${days}`);
  // raw: [[timestamp, open, high, low, close], ...]
  return raw.map((point: number[]) => ({
    date: new Date(point[0]).toLocaleDateString('en-US', { month: 'short', day: 'numeric' }),
    price: point[4], // close
    high: point[2],
    low: point[3],
  }));
}

export async function getCoinPriceArray(slug: string, days: number): Promise<number[]> {
  const history = await getCoinHistory(slug, days);
  return history.map(p => p.price);
}

function formatLarge(n: number): string {
  if (n >= 1e12) return `$${(n / 1e12).toFixed(2)}T`;
  if (n >= 1e9) return `$${(n / 1e9).toFixed(1)}B`;
  if (n >= 1e6) return `$${(n / 1e6).toFixed(1)}M`;
  return `$${n.toLocaleString()}`;
}

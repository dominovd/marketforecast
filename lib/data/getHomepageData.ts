// Lightweight live-data fetcher for the homepage.
//
// Only pulls what the homepage actually renders: current price, 24h/30d
// change, and a simple regime per featured asset, plus a few topbar
// aggregates. Falls back to mock-assets values on any partial API failure
// so the page never blows up if CoinGecko / Twelve Data hiccup.
//
// Cached in Redis for 5 min; the homepage itself also runs under ISR
// (revalidate = 300) so even without Redis we get static caching.
import { getCached, setCached } from '@/lib/cache/redis';
import { getCoinPricesBulk } from '@/lib/api/coingecko';
import { getCommodityPrice } from '@/lib/api/twelvedata';
import { getFearGreed } from '@/lib/api/feargreed';
import { ASSETS, ALL_ASSETS_LIST, type Regime } from '@/data/mock-assets';

export interface HomepageRow {
  slug: string;
  name: string;
  symbol: string;
  category: 'crypto' | 'commodity';
  icon: string;
  price: number;
  change24h: number;
  change30d: number;
  regime: Regime;
}

export interface HomepageTopbar {
  totalMarketCap: string;
  btcDominance: string;
  fearGreed: { value: number; label: string };
  goldPrice: number;
}

export interface HomepageData {
  crypto: HomepageRow[];
  commodity: HomepageRow[];
  topbar: HomepageTopbar;
}

const CACHE_KEY = 'homepage:v1';
const CACHE_TTL = 5 * 60; // 5 min

// Cheap regime classifier — homepage only needs a label, not real indicator
// math. Uses 30d % change as a rough trend signal. Asset detail pages still
// use the full classifyRegime() over the 90d price array.
function regimeFromChange(change30d: number): Regime {
  if (change30d >= 7) return 'uptrend';
  if (change30d <= -7) return 'downtrend';
  return 'sideways';
}

function formatLargeUsd(n: number): string {
  if (!isFinite(n) || n <= 0) return '—';
  if (n >= 1e12) return `$${(n / 1e12).toFixed(2)}T`;
  if (n >= 1e9) return `$${(n / 1e9).toFixed(1)}B`;
  if (n >= 1e6) return `$${(n / 1e6).toFixed(1)}M`;
  return `$${Math.round(n)}`;
}

interface CGGlobalResp {
  data?: {
    total_market_cap?: { usd?: number };
    market_cap_percentage?: { btc?: number };
  };
}

async function getCryptoGlobals(): Promise<{ totalMarketCap: string; btcDominance: string }> {
  const res = await fetch('https://api.coingecko.com/api/v3/global', {
    next: { revalidate: 300 },
    headers: { Accept: 'application/json' },
    signal: AbortSignal.timeout(8000),
  });
  if (!res.ok) throw new Error(`CoinGecko /global → ${res.status}`);
  const json = (await res.json()) as CGGlobalResp;
  const mc = json.data?.total_market_cap?.usd ?? 0;
  const dom = json.data?.market_cap_percentage?.btc ?? 0;
  return {
    totalMarketCap: formatLargeUsd(mc),
    btcDominance: `${dom.toFixed(1)}%`,
  };
}

export async function getHomepageData(): Promise<HomepageData> {
  // 1. Redis cache
  try {
    const cached = await getCached<HomepageData>(CACHE_KEY);
    if (cached) return cached;
  } catch {
    // Redis unavailable — keep going
  }

  const cryptoSlugs = ALL_ASSETS_LIST.filter(a => a.category === 'crypto').map(a => a.slug);
  const commoditySlugs = ALL_ASSETS_LIST.filter(a => a.category === 'commodity').map(a => a.slug);

  // 2. Parallel fetch — everything is allSettled so a single API hiccup
  //    can't kill the whole page.
  const [cryptoBulkR, commoditiesR, fgR, globalsR] = await Promise.allSettled([
    getCoinPricesBulk(cryptoSlugs),
    Promise.allSettled(commoditySlugs.map(s => getCommodityPrice(s))),
    getFearGreed(),
    getCryptoGlobals(),
  ]);

  const cryptoBulk = cryptoBulkR.status === 'fulfilled' ? cryptoBulkR.value : {};
  const commoditiesSettled = commoditiesR.status === 'fulfilled' ? commoditiesR.value : [];

  // 3. Build rows — live data when available, mock fallback per asset.
  const crypto: HomepageRow[] = cryptoSlugs.map(slug => {
    const mock = ASSETS[slug];
    const live = cryptoBulk[slug];
    const price = live?.price ?? mock?.price ?? 0;
    const change24h = live?.change24h ?? mock?.change24h ?? 0;
    const change30d = live?.change30d ?? mock?.change30d ?? 0;
    return {
      slug,
      name: mock?.name ?? slug,
      symbol: mock?.symbol ?? slug.toUpperCase(),
      category: 'crypto',
      icon: mock?.icon ?? '💱',
      price,
      change24h,
      change30d,
      regime: live ? regimeFromChange(change30d) : (mock?.regime ?? 'sideways'),
    };
  });

  const commodity: HomepageRow[] = commoditySlugs.map((slug, i) => {
    const mock = ASSETS[slug];
    const r = commoditiesSettled[i];
    const live = r && r.status === 'fulfilled' ? r.value : null;
    const price = live?.price ?? mock?.price ?? 0;
    const change24h = live?.change24h ?? mock?.change24h ?? 0;
    const change30d = live?.change30d ?? mock?.change30d ?? 0;
    return {
      slug,
      name: mock?.name ?? slug,
      symbol: mock?.symbol ?? slug.toUpperCase(),
      category: 'commodity',
      icon: mock?.icon ?? '🛢️',
      price,
      change24h,
      change30d,
      regime: live ? regimeFromChange(change30d) : (mock?.regime ?? 'sideways'),
    };
  });

  // 4. Topbar — each field has its own fallback.
  const goldRow = commodity.find(c => c.slug === 'gold');
  const topbar: HomepageTopbar = {
    totalMarketCap: globalsR.status === 'fulfilled' ? globalsR.value.totalMarketCap : '$2.8T',
    btcDominance: globalsR.status === 'fulfilled' ? globalsR.value.btcDominance : '58.4%',
    fearGreed: fgR.status === 'fulfilled' ? fgR.value : { value: 50, label: 'Neutral' },
    goldPrice: goldRow?.price ?? 3342,
  };

  const data: HomepageData = { crypto, commodity, topbar };

  // 5. Persist for next request.
  try {
    await setCached(CACHE_KEY, data, CACHE_TTL);
  } catch {
    // ignore
  }

  return data;
}

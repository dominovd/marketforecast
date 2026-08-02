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
import { getAllCryptoPrices } from '@/lib/api/coingecko';
import { getCommodityPriceResilient, type CommodityPriceResult } from '@/lib/api/commodities';
import { lastGoodKey } from '@/lib/api/twelvedata';
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
  /** True when the reading is a cached last-good value rather than live. */
  stale?: boolean;
}

export interface HomepageTopbar {
  totalMarketCap: string | null;
  btcDominance: string | null;
  fearGreed: { value: number; label: string } | null;
  goldPrice: number | null;
}

export interface HomepageData {
  crypto: HomepageRow[];
  commodity: HomepageRow[];
  topbar: HomepageTopbar;
}

const CACHE_KEY = 'homepage:v1';
const CACHE_TTL = 10 * 60; // matches the 600s ISR on app/page.tsx

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

  // 2. Fetch. Crypto comes from the shared bulk snapshot (one CoinGecko call
  //    for every coin on the site). Commodities are fetched SEQUENTIALLY with a
  //    short gap: Twelve Data's free tier allows 8 requests/minute, and firing
  //    five at once was reliably tripping a 429 on four of them.
  const [cryptoBulkR, fgR, globalsR] = await Promise.allSettled([
    getAllCryptoPrices(),
    getFearGreed(),
    getCryptoGlobals(),
  ]);

  const cryptoBulk = cryptoBulkR.status === 'fulfilled' ? cryptoBulkR.value : {};

  // Hard wall-clock budget. Next aborts a page build that exceeds 60 seconds,
  // and a previous version of this loop — sequential, with a 9-second retry
  // ladder per slug — reliably blew past it and failed the entire deployment.
  // Whatever has not arrived by the deadline is simply absent; the rows are
  // dropped rather than faked, exactly as when a fetch fails outright.
  const COMMODITY_BUDGET_MS = 20000;
  const deadline = Date.now() + COMMODITY_BUDGET_MS;

  // Read the shared last-good cache FIRST, before contacting any provider.
  //
  // This is the fix for the homepage rendering with zero commodities. Twelve
  // Data allows 8 credits/minute and the site tracks 10 commodities on it, so a
  // full cold refresh cannot finish inside a minute. During a build — three
  // workers, 53 pages, every commodity page calling out — the homepage lost
  // that race on all five featured assets and the empty result was baked into
  // the static render. Competing for the same scarce quota was the mistake;
  // reading what other renders already observed costs one Redis round-trip and
  // wins every time.
  const cachedRows = await Promise.all(
    commoditySlugs.map(slug => getCached<CommodityPriceResult>(lastGoodKey(slug)).catch(() => null))
  );

  const commodityResults: (CommodityPriceResult | null)[] = [...cachedRows];
  const missing = commoditySlugs
    .map((slug, i) => ({ slug, i }))
    .filter(({ i }) => !commodityResults[i]);

  // Only fetch what the cache could not supply, still under a wall-clock budget
  // so a slow provider can never fail the build.
  for (const { slug, i } of missing) {
    if (Date.now() >= deadline) {
      console.warn(`[homepage] budget exhausted before ${slug}`);
      break;
    }
    if (i > 0) await new Promise(r => setTimeout(r, 300));
    try {
      const remaining = deadline - Date.now();
      commodityResults[i] = await Promise.race([
        getCommodityPriceResilient(slug),
        new Promise<null>(r => setTimeout(() => r(null), Math.max(1000, remaining))),
      ]);
    } catch {
      commodityResults[i] = null;
    }
  }

  // 3. Build rows — live data when available, mock fallback per asset.
  // Same rule as commodities: no live reading means no row. ASSETS is used only
  // for display metadata (name, symbol, icon) — never for prices.
  const crypto: HomepageRow[] = cryptoSlugs.flatMap(slug => {
    const meta = ASSETS[slug];
    const live = cryptoBulk[slug];
    if (!live) return [];
    return [{
      slug,
      name: meta?.name ?? slug,
      symbol: meta?.symbol ?? slug.toUpperCase(),
      category: 'crypto' as const,
      icon: meta?.icon ?? '💱',
      price: live.price,
      change24h: live.change24h,
      change30d: live.change30d,
      regime: regimeFromChange(live.change30d),
      stale: false,
    }];
  });

  // Rows with no real reading at all are DROPPED, not filled with mock data.
  // Publishing an invented price that is visually identical to a live one is
  // worse than showing one fewer row.
  const commodity: HomepageRow[] = commoditySlugs.flatMap((slug, i) => {
    const meta = ASSETS[slug];
    const live = commodityResults[i];
    if (!live) return [];
    return [{
      slug,
      name: meta?.name ?? slug,
      symbol: meta?.symbol ?? slug.toUpperCase(),
      category: 'commodity' as const,
      icon: meta?.icon ?? '🛢️',
      price: live.price,
      change24h: live.change24h,
      change30d: live.change30d,
      regime: regimeFromChange(live.change30d),
      stale: live.stale,
    }];
  });

  // 4. Topbar — each field has its own fallback.
  // Topbar fields are nulled rather than defaulted when unavailable — the UI
  // renders a dash. The old hardcoded '$2.8T' / '58.4%' / 3342 fallbacks were
  // indistinguishable from real figures once on screen.
  // Gold in the topbar was derived from the gold ROW, so when the row was
  // dropped the topbar silently showed an em-dash even though a perfectly good
  // cached price existed. Read the observation directly instead of depending on
  // whether a table row survived.
  const goldRow = commodity.find(c => c.slug === 'gold');
  const goldCached = goldRow ? null : await getCached<CommodityPriceResult>(lastGoodKey('gold')).catch(() => null);
  const topbar: HomepageTopbar = {
    totalMarketCap: globalsR.status === 'fulfilled' ? globalsR.value.totalMarketCap : null,
    btcDominance: globalsR.status === 'fulfilled' ? globalsR.value.btcDominance : null,
    fearGreed: fgR.status === 'fulfilled' ? fgR.value : null,
    goldPrice: goldRow?.price ?? goldCached?.price ?? null,
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

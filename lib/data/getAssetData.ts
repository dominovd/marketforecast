// Unified data fetcher — used by both crypto and commodity page routes.
// All slug → metadata lookups read from data/asset-registry.ts (single source of truth).
import { getCached, setCached } from '@/lib/cache/redis';
import { calcRSI, calcMACD, calcBBPosition, calcEMA50Distance, calcATR, classifyRegime } from '@/lib/indicators';
import { getAIAnalysis } from '@/lib/ai/analysis';
import { getNewsForAsset, NewsItem } from '@/lib/api/news';
import { getFearGreed } from '@/lib/api/feargreed';
import { ASSETS, type Asset } from '@/data/mock-assets';
import { getAssetMeta, CRYPTO_SLUGS, COMMODITY_SLUGS, type AssetMeta } from '@/data/asset-registry';

// Crypto-specific imports
import { getCoinPrice, getCoinPriceArray } from '@/lib/api/coingecko';
// Commodity-specific imports
import { getCommodityPrice, getCommodityPriceArray } from '@/lib/api/alphavantage';

// Note: priceHistory* fields are kept on the type for backwards compatibility
// (consumers may import the type), but we no longer fetch them — the AssetPage
// component generates its own client-side history via generatePriceHistory().
// Fetching unused 30/90/365-day history from CoinGecko/AV was the source of the
// 404s on new slugs: CoinGecko free API restricts /coins/{id}/ohlc?days=365 and
// any thrown error in Promise.all killed the whole render path.
export type AssetWithHistory = Asset & {
  priceHistory30?: { date: string; price: number }[];
  priceHistory90?: { date: string; price: number }[];
  priceHistory365?: { date: string; price: number }[];
};

// Helper: unwrap allSettled result with fallback
function settled<T>(r: PromiseSettledResult<T>, fallback: T, label: string): T {
  if (r.status === 'fulfilled') return r.value;
  console.error(`[getAssetData] ${label} failed:`, r.reason);
  return fallback;
}

export async function getAssetData(slug: string): Promise<AssetWithHistory | null> {
  const meta = getAssetMeta(slug);
  if (!meta) return null;

  const cacheKey = `asset:full:${slug}`;

  try {
    // Check cache first (5 min for prices, AI is separately cached 7d)
    const cached = await getCached<AssetWithHistory>(cacheKey);
    if (cached) return cached;
  } catch {
    // Redis unavailable — continue without cache
  }

  const isCrypto = meta.category === 'crypto';

  // Fetch only what we actually use:
  //   - current price + 24h/7d/30d changes  (REQUIRED — drives the hero block)
  //   - 90-day price array                  (REQUIRED — feeds indicators)
  //   - news, fear&greed                    (NICE-TO-HAVE — graceful fallback)
  const [pricesR, priceArrR, newsR, fgR] = await Promise.allSettled([
    isCrypto ? getCoinPrice(slug) : getCommodityPrice(slug),
    isCrypto ? getCoinPriceArray(slug, 180) : getCommodityPriceArray(slug),
    getNewsForAsset(slug),
    isCrypto ? getFearGreed() : Promise.resolve(null),
  ]);

  // If we can't even get the current price → fall back to a graceful surface.
  // Prefer the hand-curated ASSETS mock for the 11 original slugs (richer copy);
  // for newly-added slugs, build a minimal placeholder from registry meta.
  // CRITICAL: do NOT write the placeholder to Redis — otherwise a transient
  // CoinGecko 429 locks the page in placeholder mode for the full 5min TTL.
  if (pricesR.status !== 'fulfilled') {
    console.error(`[getAssetData] Critical: price fetch failed for ${slug}:`, pricesR.reason);
    const handCurated = ASSETS[slug];
    if (handCurated) return handCurated as AssetWithHistory;
    return buildPlaceholder(meta);
  }
  const prices = pricesR.value;

  const priceArr = settled(priceArrR, [], `priceArr ${slug}`);
  const news = settled(newsR, [] as NewsItem[], `news ${slug}`);
  const fearGreedData = settled(fgR, null, `f&g ${slug}`);

  // Indicators — if priceArr is empty/short, use neutral defaults
  const rsi = priceArr.length >= 15 ? calcRSI(priceArr) : 50;
  const macd = priceArr.length >= 26 ? calcMACD(priceArr) : 0;
  const bbPosition = priceArr.length >= 20 ? calcBBPosition(priceArr) : 0.5;
  const ema50Distance = priceArr.length >= 50 ? calcEMA50Distance(priceArr) : 0;
  const regime = priceArr.length >= 30 ? classifyRegime(priceArr) : 'sideways';
  const atr = priceArr.length >= 14 ? calcATR(
    priceArr.map(p => p * 1.005),
    priceArr.map(p => p * 0.995),
    priceArr,
  ) : 0;

  // AI analysis (cached 7d separately). On failure, fall back to a templated summary.
  let aiAnalysis;
  try {
    aiAnalysis = await getAIAnalysis(slug, {
      name: meta.name,
      symbol: meta.symbol,
      price: prices.price,
      change24h: prices.change24h,
      change7d: prices.change7d,
      change30d: prices.change30d,
      rsi, macd, bbPosition, ema50Distance, atr,
      regime,
      fearGreed: fearGreedData?.value,
    });
  } catch (err) {
    console.error(`[getAssetData] AI analysis failed for ${slug}:`, err);
    aiAnalysis = templatedAnalysis(meta, prices.price, regime, rsi);
  }

  const asset: AssetWithHistory = {
    slug,
    name: meta.name,
    symbol: meta.symbol,
    category: meta.category,
    icon: meta.icon,
    price: prices.price,
    change24h: prices.change24h,
    change7d: prices.change7d,
    change30d: prices.change30d,
    marketCap: (prices as { marketCap?: string }).marketCap,
    volume24h: prices.volume24h,
    indicators: { rsi, macd, bbPosition, ema50Distance, atr },
    regime,
    fearGreed: fearGreedData?.value,
    aiAnalysis,
    news,
    affiliates: meta.affiliates,
  };

  // Cache full asset for 5 minutes
  try {
    await setCached(cacheKey, asset, 300);
  } catch { /* ignore cache write errors */ }

  return asset;
}

// Last-resort placeholder so new slugs render with at least name/symbol/affiliates
// even when every API endpoint fails. Prevents 404 on transient outages.
function buildPlaceholder(meta: AssetMeta): AssetWithHistory {
  return {
    slug: meta.slug,
    name: meta.name,
    symbol: meta.symbol,
    category: meta.category,
    icon: meta.icon,
    price: 0,
    change24h: 0,
    change7d: 0,
    change30d: 0,
    volume24h: '—',
    indicators: { rsi: 50, macd: 0, bbPosition: 0.5, ema50Distance: 0, atr: 0 },
    regime: 'sideways',
    aiAnalysis: templatedAnalysis(meta, 0, 'sideways', 50),
    news: [],
    affiliates: meta.affiliates,
  };
}

function templatedAnalysis(meta: AssetMeta, price: number, regime: string, rsi: number) {
  const base = price > 0 ? price : 1;
  const fmt = (mult: number) => {
    const v = base * mult;
    if (v >= 1000) return `$${Math.round(v).toLocaleString()}`;
    if (v >= 1) return `$${v.toFixed(2)}`;
    return `$${v.toFixed(4)}`;
  };
  return {
    summary: `${meta.name} (${meta.symbol}) market data is being refreshed. Current regime: ${regime}, RSI: ${rsi}. Detailed AI analysis will appear after the next scheduled refresh cycle.`,
    bull: { condition: `If ${meta.name} breaks key resistance with volume confirmation`, target: `${fmt(1.15)}–${fmt(1.25)}`, probability: '30%' },
    base: { condition: `If ${meta.name} continues current trend without major macro shocks`, target: `${fmt(1.05)}–${fmt(1.12)}`, probability: '50%' },
    bear: { condition: `If ${meta.name} faces broader market weakness`, target: `${fmt(0.85)}–${fmt(0.90)}`, probability: '20%' },
    keyFactors: ['Market sentiment', 'Technical momentum', 'Macro conditions', 'Volume trends'],
  };
}

// Backwards-compatibility re-exports — some files still import these constants
export { CRYPTO_SLUGS, COMMODITY_SLUGS };

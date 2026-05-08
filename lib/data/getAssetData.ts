// Unified data fetcher — used by both crypto and commodity page routes.
// All slug → metadata lookups read from data/asset-registry.ts (single source of truth).
import { getCached, setCached } from '@/lib/cache/redis';
import { calcRSI, calcMACD, calcBBPosition, calcEMA50Distance, calcATR, classifyRegime } from '@/lib/indicators';
import { getAIAnalysis } from '@/lib/ai/analysis';
import { getNewsForAsset, NewsItem } from '@/lib/api/news';
import { getFearGreed } from '@/lib/api/feargreed';
import type { Asset } from '@/data/mock-assets';
import { getAssetMeta, CRYPTO_SLUGS, COMMODITY_SLUGS } from '@/data/asset-registry';

// Crypto-specific imports
import { getCoinPrice, getCoinHistory, getCoinPriceArray } from '@/lib/api/coingecko';
// Commodity-specific imports
import { getCommodityPrice, getCommodityHistory, getCommodityPriceArray } from '@/lib/api/alphavantage';

export type AssetWithHistory = Asset & {
  priceHistory30: { date: string; price: number }[];
  priceHistory90: { date: string; price: number }[];
  priceHistory365: { date: string; price: number }[];
};

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

  try {
    const isCrypto = meta.category === 'crypto';

    // Fetch price data and history in parallel
    const [prices, history30, history90, news, fearGreedData] = await Promise.all([
      isCrypto ? getCoinPrice(slug) : getCommodityPrice(slug),
      isCrypto ? getCoinHistory(slug, 30) : getCommodityHistory(slug, 30),
      isCrypto ? getCoinHistory(slug, 90) : getCommodityHistory(slug, 90),
      getNewsForAsset(slug),
      isCrypto ? getFearGreed() : Promise.resolve(null),
    ]);

    // Get longer history for indicators
    const priceArr = isCrypto
      ? await getCoinPriceArray(slug, 90)
      : await getCommodityPriceArray(slug);

    // Calculate indicators
    const rsi = calcRSI(priceArr);
    const macd = calcMACD(priceArr);
    const bbPosition = calcBBPosition(priceArr);
    const ema50Distance = calcEMA50Distance(priceArr);
    const regime = classifyRegime(priceArr);

    // ATR needs OHLC — approximate from close prices
    const atr = calcATR(
      priceArr.map(p => p * 1.005),
      priceArr.map(p => p * 0.995),
      priceArr
    );

    // AI analysis (cached 7d separately)
    const aiAnalysis = await getAIAnalysis(slug, {
      name: meta.name,
      symbol: meta.symbol,
      price: prices.price,
      change24h: prices.change24h,
      change7d: prices.change7d,
      change30d: prices.change30d,
      rsi,
      macd,
      bbPosition,
      ema50Distance,
      atr,
      regime,
      fearGreed: fearGreedData?.value,
    });

    // Build 365d history (approximate from 90d for commodities, reuse for crypto)
    const history365 = isCrypto
      ? await getCoinHistory(slug, 365)
      : await getCommodityHistory(slug, 365);

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
      // marketCap is only present on CoinPrice (commodity returns CommodityPrice without it)
      marketCap: (prices as { marketCap?: string }).marketCap,
      volume24h: prices.volume24h,
      indicators: { rsi, macd, bbPosition, ema50Distance, atr },
      regime,
      fearGreed: fearGreedData?.value,
      aiAnalysis,
      news: news as NewsItem[],
      affiliates: meta.affiliates,
      priceHistory30: history30,
      priceHistory90: history90,
      priceHistory365: history365,
    };

    // Cache full asset for 5 minutes
    try {
      await setCached(cacheKey, asset, 300);
    } catch { /* ignore cache write errors */ }

    return asset;
  } catch (err) {
    console.error(`[getAssetData] Error for ${slug}:`, err);
    return null;
  }
}

// Backwards-compatibility re-exports — some files still import these constants
export { CRYPTO_SLUGS, COMMODITY_SLUGS };

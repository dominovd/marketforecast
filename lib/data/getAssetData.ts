// Unified data fetcher — used by both crypto and commodity page routes
import { getCached, setCached } from '@/lib/cache/redis';
import { calcRSI, calcMACD, calcBBPosition, calcEMA50Distance, calcATR, classifyRegime } from '@/lib/indicators';
import { getAIAnalysis } from '@/lib/ai/analysis';
import { getNewsForAsset, NewsItem } from '@/lib/api/news';
import { getFearGreed } from '@/lib/api/feargreed';
import type { Asset } from '@/data/mock-assets';

// Crypto-specific imports
import { getCoinPrice, getCoinHistory, getCoinPriceArray } from '@/lib/api/coingecko';
// Commodity-specific imports
import { getCommodityPrice, getCommodityHistory, getCommodityPriceArray } from '@/lib/api/alphavantage';

const CRYPTO_SLUGS = ['bitcoin', 'ethereum', 'solana'];
const COMMODITY_SLUGS = ['gold', 'silver', 'oil'];

const AFFILIATES: Record<string, { name: string; url: string; label: string }[]> = {
  bitcoin: [{ name: 'Binance', url: 'https://www.binance.com/en/trade/BTC_USDT', label: 'Buy BTC on Binance' }, { name: 'Coinbase', url: 'https://www.coinbase.com/price/bitcoin', label: 'Buy on Coinbase' }],
  ethereum: [{ name: 'Binance', url: 'https://www.binance.com/en/trade/ETH_USDT', label: 'Buy ETH on Binance' }, { name: 'Coinbase', url: 'https://www.coinbase.com/price/ethereum', label: 'Buy on Coinbase' }],
  solana: [{ name: 'Binance', url: 'https://www.binance.com/en/trade/SOL_USDT', label: 'Buy SOL on Binance' }, { name: 'Coinbase', url: 'https://www.coinbase.com/price/solana', label: 'Buy on Coinbase' }],
  gold: [{ name: 'eToro', url: 'https://www.etoro.com/markets/gold', label: 'Trade Gold on eToro' }, { name: 'XTB', url: 'https://www.xtb.com/en/financial-data/gold', label: 'Trade on XTB' }],
  silver: [{ name: 'eToro', url: 'https://www.etoro.com/markets/silver', label: 'Trade Silver on eToro' }, { name: 'XTB', url: 'https://www.xtb.com/en/financial-data/silver', label: 'Trade on XTB' }],
  oil: [{ name: 'eToro', url: 'https://www.etoro.com/markets/oil', label: 'Trade Oil on eToro' }, { name: 'XTB', url: 'https://www.xtb.com/en/financial-data/crude-oil', label: 'Trade on XTB' }],
};

const ICONS: Record<string, string> = {
  bitcoin: '₿', ethereum: 'Ξ', solana: '◎', gold: '🥇', silver: '🥈', oil: '🛢️',
};

export type AssetWithHistory = Asset & {
  priceHistory30: { date: string; price: number }[];
  priceHistory90: { date: string; price: number }[];
  priceHistory365: { date: string; price: number }[];
};

export async function getAssetData(slug: string): Promise<AssetWithHistory | null> {
  const cacheKey = `asset:full:${slug}`;

  try {
    // Check cache first (5 min for prices, AI is separately cached 24h)
    const cached = await getCached<AssetWithHistory>(cacheKey);
    if (cached) return cached;
  } catch {
    // Redis unavailable — continue without cache
  }

  try {
    const isCrypto = CRYPTO_SLUGS.includes(slug);
    const isCommodity = COMMODITY_SLUGS.includes(slug);

    if (!isCrypto && !isCommodity) return null;

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

    // AI analysis (cached 24h separately)
    const aiAnalysis = await getAIAnalysis(slug, {
      name: slug.charAt(0).toUpperCase() + slug.slice(1),
      symbol: formatSymbol(slug),
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
      name: formatName(slug),
      symbol: formatSymbol(slug),
      category: isCrypto ? 'crypto' : 'commodity',
      icon: ICONS[slug] || '•',
      price: prices.price,
      change24h: prices.change24h,
      change7d: prices.change7d,
      change30d: prices.change30d,
      marketCap: (prices as any).marketCap,
      volume24h: prices.volume24h,
      indicators: { rsi, macd, bbPosition, ema50Distance, atr },
      regime,
      fearGreed: fearGreedData?.value,
      aiAnalysis,
      news: news as NewsItem[],
      affiliates: AFFILIATES[slug] || [],
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

function formatName(slug: string): string {
  const names: Record<string, string> = { bitcoin: 'Bitcoin', ethereum: 'Ethereum', solana: 'Solana', gold: 'Gold', silver: 'Silver', oil: 'Crude Oil' };
  return names[slug] || slug;
}

function formatSymbol(slug: string): string {
  const symbols: Record<string, string> = { bitcoin: 'BTC', ethereum: 'ETH', solana: 'SOL', gold: 'XAU/USD', silver: 'XAG/USD', oil: 'WTI' };
  return symbols[slug] || slug.toUpperCase();
}

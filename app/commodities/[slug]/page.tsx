import { notFound } from 'next/navigation';
import { getAssetData } from '@/lib/data/getAssetData';
import { getAssetMeta, COMMODITY_SLUGS } from '@/data/asset-registry';
import AssetPage from '@/components/AssetPage';
import AssetSeoExtras from '@/components/AssetSeoExtras';
import type { Metadata } from 'next';

// ISR: 15 minutes. Each regeneration costs ~5 Upstash commands, and the free
// tier (shared with the statusworld project) has ~288k commands/month left of
// its 500k. At 5 minutes across 43 assets a busy month would blow past that.
// A page titled "price prediction 2026" does not need tick-level freshness.
export const revalidate = 900;

export async function generateStaticParams() {
  return COMMODITY_SLUGS.map(slug => ({ slug: `${slug}-price-prediction-2026` }));
}

export async function generateMetadata({ params }: { params: Promise<{ slug: string }> }): Promise<Metadata> {
  const { slug } = await params;
  const key = slug.replace('-price-prediction-2026', '');
  const meta = getAssetMeta(key);
  if (!meta || meta.category !== 'commodity') return { title: 'Not Found' };
  return {
    title: `${meta.name} Price Prediction 2026: AI Analysis & Market Forecast | MarketForecast`,
    description: `Data-driven ${meta.name} (${meta.symbol}) price analysis for 2026. AI-generated market scenarios, technical indicators, and latest news. Not financial advice.`,
    alternates: { canonical: `https://marketforecast.io/commodities/${slug}` },
    openGraph: {
      title: `${meta.name} Price Prediction 2026 | MarketForecast`,
      description: `Real-time ${meta.name} price analysis, AI forecast scenarios, and technical indicators.`,
      url: `https://marketforecast.io/commodities/${slug}`,
      siteName: 'MarketForecast',
      type: 'article',
    },
  };
}

export default async function CommodityAssetPage({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  const key = slug.replace('-price-prediction-2026', '');

  const meta = getAssetMeta(key);
  if (!meta || meta.category !== 'commodity') notFound();

  // No mock fallback. getAssetData already degrades to a placeholder carrying
  // price 0, which AssetPage renders as an explicit unavailable state; reaching
  // for ASSETS here would reintroduce the hardcoded prices we just removed from
  // the data layer.
  let asset;
  try {
    asset = await getAssetData(key);
  } catch {
    asset = null;
  }
  if (!asset) notFound();

  // The FAQ block asserts probabilities, RSI values and price targets. With no
  // observations behind them those are placeholder defaults — the oil page
  // said "price data unavailable" at the top while the FAQ underneath confidently
  // claimed a 30% bull probability and an RSI of 50. Structured Q&A is also
  // exactly what search engines lift into results, so publishing it without data
  // is worse than publishing nothing.
  const hasData = asset.price > 0 && (asset.priceHistory?.length ?? 0) > 0;

  return (
    <>
      <AssetPage asset={asset} />
      {hasData && <AssetSeoExtras asset={asset} kind="commodity" />}
    </>
  );
}

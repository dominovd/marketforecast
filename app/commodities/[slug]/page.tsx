import { notFound } from 'next/navigation';
import { ASSETS } from '@/data/mock-assets';
import { getAssetData } from '@/lib/data/getAssetData';
import { getAssetMeta, COMMODITY_SLUGS } from '@/data/asset-registry';
import AssetPage from '@/components/AssetPage';
import AssetSeoExtras from '@/components/AssetSeoExtras';
import type { Metadata } from 'next';

export const revalidate = 300; // ISR: revalidate every 5 minutes

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

  // Try real data first, fall back to mock if available
  let asset;
  try {
    asset = await getAssetData(key);
  } catch {
    asset = null;
  }

  if (!asset) {
    const mock = ASSETS[key];
    if (mock) {
      asset = mock as Parameters<typeof AssetPage>[0]['asset'];
    } else {
      notFound();
    }
  }

  return (
    <>
      <AssetPage asset={asset} />
      <AssetSeoExtras asset={asset} kind="commodity" />
    </>
  );
}

import { notFound } from 'next/navigation';
import { ASSETS } from '@/data/mock-assets';
import { getAssetData } from '@/lib/data/getAssetData';
import { getAssetMeta, CRYPTO_SLUGS } from '@/data/asset-registry';
import AssetPage from '@/components/AssetPage';
import AssetSeoExtras from '@/components/AssetSeoExtras';
import type { Metadata } from 'next';

export const revalidate = 300; // ISR: revalidate every 5 minutes

export async function generateStaticParams() {
  return CRYPTO_SLUGS.map(slug => ({ slug: `${slug}-price-prediction-2026` }));
}

export async function generateMetadata({ params }: { params: Promise<{ slug: string }> }): Promise<Metadata> {
  const { slug } = await params;
  const key = slug.replace('-price-prediction-2026', '');
  const meta = getAssetMeta(key);
  if (!meta || meta.category !== 'crypto') return { title: 'Not Found' };
  return {
    title: `${meta.name} Price Prediction 2026: AI Analysis & Market Forecast | MarketForecast`,
    description: `Get data-driven ${meta.name} (${meta.symbol}) price analysis for 2026. Real-time indicators, AI-powered market scenarios, and latest news. Not financial advice.`,
    alternates: { canonical: `https://marketforecast.io/crypto/${slug}` },
    openGraph: {
      title: `${meta.name} Price Prediction 2026 | MarketForecast`,
      description: `Real-time ${meta.name} price analysis, AI forecast scenarios, and technical indicators.`,
      url: `https://marketforecast.io/crypto/${slug}`,
      siteName: 'MarketForecast',
      type: 'article',
    },
  };
}

export default async function CryptoAssetPage({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  const key = slug.replace('-price-prediction-2026', '');

  const meta = getAssetMeta(key);
  if (!meta || meta.category !== 'crypto') notFound();

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
      // No mock available for newly-added slugs — bail to 404 rather than render empty.
      // In practice CoinGecko free tier rarely fails; a transient miss will recover on next ISR.
      notFound();
    }
  }

  return (
    <>
      <AssetPage asset={asset} />
      <AssetSeoExtras asset={asset} kind="crypto" />
    </>
  );
}

import { notFound } from 'next/navigation';
import { ASSETS } from '@/data/mock-assets';
import { getAssetData } from '@/lib/data/getAssetData';
import AssetPage from '@/components/AssetPage';
import type { Metadata } from 'next';

export const revalidate = 300; // ISR: revalidate every 5 minutes

export async function generateStaticParams() {
  return ['bitcoin', 'ethereum', 'solana'].map(slug => ({ slug: `${slug}-price-prediction-2026` }));
}

export async function generateMetadata({ params }: { params: Promise<{ slug: string }> }): Promise<Metadata> {
  const { slug } = await params;
  const key = slug.replace('-price-prediction-2026', '');
  const asset = ASSETS[key];
  if (!asset) return { title: 'Not Found' };
  return {
    title: `${asset.name} Price Prediction 2026: AI Analysis & Market Forecast | MarketForecast`,
    description: `Get data-driven ${asset.name} price analysis for 2026. Real-time indicators, AI-powered market scenarios, and latest news. Not financial advice.`,
    alternates: { canonical: `https://marketforecast.io/crypto/${slug}` },
    openGraph: {
      title: `${asset.name} Price Prediction 2026 | MarketForecast`,
      description: `Real-time ${asset.name} price analysis, AI forecast scenarios, and technical indicators.`,
      url: `https://marketforecast.io/crypto/${slug}`,
      siteName: 'MarketForecast',
      type: 'article',
    },
  };
}

export default async function CryptoAssetPage({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  const key = slug.replace('-price-prediction-2026', '');

  // Try real data first, fall back to mock
  let asset;
  try {
    asset = await getAssetData(key);
  } catch {
    asset = null;
  }

  if (!asset) {
    const mock = ASSETS[key];
    if (!mock) notFound();
    asset = mock as any;
  }

  return <AssetPage asset={asset} />;
}

import type { MetadataRoute } from 'next';
import { CRYPTO_SLUGS, COMMODITY_SLUGS } from '@/data/asset-registry';

const BASE = 'https://marketforecast.io';

export default function sitemap(): MetadataRoute.Sitemap {
  const now = new Date();

  const cryptoPages = CRYPTO_SLUGS.map(slug => ({
    url: `${BASE}/crypto/${slug}-price-prediction-2026`,
    lastModified: now,
    changeFrequency: 'daily' as const,
    priority: 0.9,
  }));

  const commodityPages = COMMODITY_SLUGS.map(slug => ({
    url: `${BASE}/commodities/${slug}-price-prediction-2026`,
    lastModified: now,
    changeFrequency: 'daily' as const,
    priority: 0.9,
  }));

  const staticPages = [
    { url: BASE, lastModified: now, changeFrequency: 'daily' as const, priority: 1.0 },
    { url: `${BASE}/about`, lastModified: now, changeFrequency: 'monthly' as const, priority: 0.5 },
    { url: `${BASE}/methodology`, lastModified: now, changeFrequency: 'monthly' as const, priority: 0.6 },
    // Higher priority than methodology: a published track record is the main
    // thing distinguishing this site from generic price-prediction pages.
    { url: `${BASE}/accuracy`, lastModified: now, changeFrequency: 'daily' as const, priority: 0.8 },
  ];

  return [...staticPages, ...cryptoPages, ...commodityPages];
}

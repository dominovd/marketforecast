import type { MetadataRoute } from 'next';

const BASE = 'https://marketforecast.io';

const CRYPTO_SLUGS = ['bitcoin', 'ethereum', 'solana', 'xrp', 'bnb', 'cardano'];
const COMMODITY_SLUGS = ['gold', 'silver', 'oil', 'naturalgas', 'copper'];

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

  return [
    {
      url: BASE,
      lastModified: now,
      changeFrequency: 'daily',
      priority: 1.0,
    },
    ...cryptoPages,
    ...commodityPages,
  ];
}

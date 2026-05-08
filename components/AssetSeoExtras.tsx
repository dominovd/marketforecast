// Server-rendered SEO additions for asset pages:
//   - Visible FAQ block (matches JSON-LD content for rich-result eligibility)
//   - JSON-LD: FAQPage, FinancialProduct/Product, BreadcrumbList
//
// AssetPage.tsx is a client component, so keep this strictly server so the
// JSON-LD lives in the initial HTML response (which is what Google reads).
import type { Asset } from '@/data/mock-assets';

interface Props {
  asset: Asset;
  kind: 'crypto' | 'commodity';
}

function buildFaq(asset: Asset): { q: string; a: string }[] {
  const priceStr = asset.price >= 1
    ? `$${asset.price.toLocaleString(undefined, { maximumFractionDigits: 2 })}`
    : `$${asset.price}`;
  const change24Str = `${asset.change24h > 0 ? '+' : ''}${asset.change24h}%`;
  return [
    {
      q: `Will ${asset.name} (${asset.symbol}) go up in 2026?`,
      a: `Based on the current ${asset.regime} regime and RSI of ${asset.indicators.rsi}, our AI scenario analysis assigns ${asset.aiAnalysis.bull.probability} probability to a bullish outcome and ${asset.aiAnalysis.base.probability} to the base case. ${asset.aiAnalysis.summary}`,
    },
    {
      q: `What is the ${asset.name} price prediction for 2026?`,
      a: `MarketForecast presents three conditional scenarios. Bull case (${asset.aiAnalysis.bull.probability}): ${asset.aiAnalysis.bull.target}. Base case (${asset.aiAnalysis.base.probability}): ${asset.aiAnalysis.base.target}. Bear case (${asset.aiAnalysis.bear.probability}): ${asset.aiAnalysis.bear.target}. These are conditional ranges, not guaranteed outcomes.`,
    },
    {
      q: `What is the current ${asset.name} price today?`,
      a: `${asset.name} (${asset.symbol}) is trading at ${priceStr}, with a 24-hour change of ${change24Str} and a 30-day change of ${asset.change30d > 0 ? '+' : ''}${asset.change30d}%. Prices refresh every 5 minutes from market data APIs.`,
    },
    {
      q: `What factors influence the ${asset.name} forecast?`,
      a: `Key factors monitored by the model include: ${asset.aiAnalysis.keyFactors.join('; ')}. The forecast also incorporates RSI, MACD, Bollinger Band position, EMA50 distance, and ATR.`,
    },
    {
      q: `Is the ${asset.name} forecast on MarketForecast financial advice?`,
      a: `No. All scenarios are AI-generated for informational and educational purposes only. They are conditional analyses based on current data — not investment advice, not guaranteed predictions, and not a recommendation to buy, sell, or hold any asset.`,
    },
  ];
}

export default function AssetSeoExtras({ asset, kind }: Props) {
  const faqs = buildFaq(asset);
  const url = `https://marketforecast.io/${kind === 'crypto' ? 'crypto' : 'commodities'}/${asset.slug}-price-prediction-2026`;

  // Schema.org doesn't have a "Cryptocurrency" type yet; use Product for crypto
  // and FinancialProduct for commodities. Both are valid and rich-result eligible
  // when paired with offers.
  const productSchema = {
    '@context': 'https://schema.org',
    '@type': asset.category === 'crypto' ? 'Product' : 'FinancialProduct',
    name: `${asset.name} (${asset.symbol})`,
    description: `${asset.name} price analysis and AI-generated forecast scenarios for 2026 — technical indicators, conditional scenarios, and latest news.`,
    url,
    category: asset.category === 'crypto' ? 'Cryptocurrency' : 'Commodity',
    offers: {
      '@type': 'Offer',
      price: asset.price,
      priceCurrency: 'USD',
      availability: 'https://schema.org/InStock',
      url,
    },
  };

  const faqSchema = {
    '@context': 'https://schema.org',
    '@type': 'FAQPage',
    mainEntity: faqs.map(f => ({
      '@type': 'Question',
      name: f.q,
      acceptedAnswer: {
        '@type': 'Answer',
        text: f.a,
      },
    })),
  };

  const breadcrumbSchema = {
    '@context': 'https://schema.org',
    '@type': 'BreadcrumbList',
    itemListElement: [
      { '@type': 'ListItem', position: 1, name: 'MarketForecast', item: 'https://marketforecast.io' },
      {
        '@type': 'ListItem',
        position: 2,
        name: kind === 'crypto' ? 'Cryptocurrency Forecasts' : 'Commodity Forecasts',
        item: `https://marketforecast.io/#${kind === 'crypto' ? 'crypto' : 'commodities'}`,
      },
      { '@type': 'ListItem', position: 3, name: `${asset.name} Forecast 2026`, item: url },
    ],
  };

  return (
    <>
      {/* JSON-LD blocks — server-rendered, in initial HTML */}
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: JSON.stringify(productSchema) }}
      />
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: JSON.stringify(faqSchema) }}
      />
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: JSON.stringify(breadcrumbSchema) }}
      />

      {/* Visible FAQ — matches the JSON-LD so Google trusts it */}
      <section
        className="max-w-7xl mx-auto px-4 sm:px-6 mb-10"
        aria-labelledby="faq-heading"
      >
        <h2
          id="faq-heading"
          className="text-xl font-bold text-white mb-4"
        >
          Frequently Asked Questions about {asset.name} Price Prediction 2026
        </h2>
        <div className="space-y-3">
          {faqs.map((f, i) => (
            <details
              key={i}
              className="card p-4 group"
              open={i === 0}
            >
              <summary className="cursor-pointer flex items-center justify-between gap-3 list-none">
                <span className="text-sm font-semibold text-white">{f.q}</span>
                <span
                  className="text-xs"
                  style={{ color: '#64748b' }}
                >
                  ⌄
                </span>
              </summary>
              <p
                className="text-sm mt-3 leading-relaxed"
                style={{ color: '#94a3b8' }}
              >
                {f.a}
              </p>
            </details>
          ))}
        </div>
      </section>
    </>
  );
}

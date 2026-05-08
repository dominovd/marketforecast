// Single source of truth for all assets the site supports.
// Add a new asset → it appears in sitemap, generateStaticParams, API routing,
// homepage directory list, and SEO-bound name/symbol lookups automatically.
//
// Crypto IDs come from CoinGecko. Stable, longstanding IDs are preferred —
// avoid recently rebranded coins (e.g. matic-network → polygon-ecosystem-token)
// because the ID can change again.
//
// Commodity routing tracks Alpha Vantage's three endpoint families:
//   - 'fx'        → FX_DAILY (XAU, XAG, XPT, XPD vs USD)
//   - 'energy'    → WTI / NATURAL_GAS / BRENT
//   - 'commodity' → COPPER / ALUMINUM / WHEAT / CORN / SUGAR / COFFEE / COTTON
//
// Adding a new commodity is safe ONLY if `getCommodityHistory` has the Redis
// 24h cache wrapper (lib/api/alphavantage.ts) — without it, the AV free tier
// (25 req/day) blows up at >5 commodity slugs.

export type AssetCategory = 'crypto' | 'commodity';
export type AVEndpoint = 'fx' | 'energy' | 'commodity';

export interface AssetMeta {
  slug: string;
  name: string;
  symbol: string;
  category: AssetCategory;
  icon: string;
  // Crypto-only
  coingeckoId?: string;
  // Commodity-only
  avEndpoint?: AVEndpoint;
  avSymbol?: string; // e.g. 'XAU', 'WTI', 'COPPER', 'BRENT'
  // Affiliate links (footer of asset card)
  affiliates: { name: string; url: string; label: string }[];
  // Optional newsfeed keyword overrides (else derived from name+symbol)
  newsKeywords?: string[];
}

const CRYPTO_AFFILIATES = (sym: string, cgPath?: string) => [
  { name: 'Binance', url: `https://www.binance.com/en/trade/${sym}_USDT`, label: `Buy ${sym} on Binance` },
  ...(cgPath ? [{ name: 'Coinbase', url: `https://www.coinbase.com/price/${cgPath}`, label: 'Buy on Coinbase' }] : [{ name: 'KuCoin', url: `https://www.kucoin.com/trade/${sym}-USDT`, label: 'Buy on KuCoin' }]),
];

const COMMODITY_AFFILIATES = (slug: string) => [
  { name: 'eToro', url: `https://www.etoro.com/markets/${slug}`, label: `Trade on eToro` },
  { name: 'XTB', url: `https://www.xtb.com/en/financial-data/${slug}`, label: 'Trade on XTB' },
];

export const ASSET_REGISTRY: AssetMeta[] = [
  // ─── CRYPTO (existing 6) ─────────────────────────────────────────────
  { slug: 'bitcoin', name: 'Bitcoin', symbol: 'BTC', category: 'crypto', icon: '₿',
    coingeckoId: 'bitcoin',
    affiliates: CRYPTO_AFFILIATES('BTC', 'bitcoin') },
  { slug: 'ethereum', name: 'Ethereum', symbol: 'ETH', category: 'crypto', icon: 'Ξ',
    coingeckoId: 'ethereum',
    affiliates: CRYPTO_AFFILIATES('ETH', 'ethereum') },
  { slug: 'solana', name: 'Solana', symbol: 'SOL', category: 'crypto', icon: '◎',
    coingeckoId: 'solana',
    affiliates: CRYPTO_AFFILIATES('SOL', 'solana') },
  { slug: 'xrp', name: 'XRP', symbol: 'XRP', category: 'crypto', icon: '✕',
    coingeckoId: 'ripple',
    affiliates: CRYPTO_AFFILIATES('XRP', 'xrp') },
  { slug: 'bnb', name: 'BNB', symbol: 'BNB', category: 'crypto', icon: '◈',
    coingeckoId: 'binancecoin',
    affiliates: CRYPTO_AFFILIATES('BNB') },
  { slug: 'cardano', name: 'Cardano', symbol: 'ADA', category: 'crypto', icon: '₳',
    coingeckoId: 'cardano',
    affiliates: CRYPTO_AFFILIATES('ADA', 'cardano') },

  // ─── CRYPTO (24 new — top market cap, dedup, no stables/wrapped) ─────
  { slug: 'dogecoin', name: 'Dogecoin', symbol: 'DOGE', category: 'crypto', icon: 'Ð',
    coingeckoId: 'dogecoin',
    affiliates: CRYPTO_AFFILIATES('DOGE', 'dogecoin') },
  { slug: 'tron', name: 'TRON', symbol: 'TRX', category: 'crypto', icon: '◇',
    coingeckoId: 'tron',
    affiliates: CRYPTO_AFFILIATES('TRX', 'tron') },
  { slug: 'avalanche', name: 'Avalanche', symbol: 'AVAX', category: 'crypto', icon: '▲',
    coingeckoId: 'avalanche-2',
    affiliates: CRYPTO_AFFILIATES('AVAX', 'avalanche') },
  { slug: 'shiba-inu', name: 'Shiba Inu', symbol: 'SHIB', category: 'crypto', icon: '🐕',
    coingeckoId: 'shiba-inu',
    affiliates: CRYPTO_AFFILIATES('SHIB', 'shiba-inu') },
  { slug: 'polkadot', name: 'Polkadot', symbol: 'DOT', category: 'crypto', icon: '●',
    coingeckoId: 'polkadot',
    affiliates: CRYPTO_AFFILIATES('DOT', 'polkadot') },
  { slug: 'chainlink', name: 'Chainlink', symbol: 'LINK', category: 'crypto', icon: '⬡',
    coingeckoId: 'chainlink',
    affiliates: CRYPTO_AFFILIATES('LINK', 'chainlink') },
  { slug: 'near', name: 'NEAR Protocol', symbol: 'NEAR', category: 'crypto', icon: 'Ⓝ',
    coingeckoId: 'near',
    affiliates: CRYPTO_AFFILIATES('NEAR', 'near') },
  { slug: 'litecoin', name: 'Litecoin', symbol: 'LTC', category: 'crypto', icon: 'Ł',
    coingeckoId: 'litecoin',
    affiliates: CRYPTO_AFFILIATES('LTC', 'litecoin') },
  { slug: 'uniswap', name: 'Uniswap', symbol: 'UNI', category: 'crypto', icon: '🦄',
    coingeckoId: 'uniswap',
    affiliates: CRYPTO_AFFILIATES('UNI', 'uniswap') },
  { slug: 'internet-computer', name: 'Internet Computer', symbol: 'ICP', category: 'crypto', icon: '∞',
    coingeckoId: 'internet-computer',
    affiliates: CRYPTO_AFFILIATES('ICP', 'internet-computer') },
  { slug: 'stellar', name: 'Stellar', symbol: 'XLM', category: 'crypto', icon: '✦',
    coingeckoId: 'stellar',
    affiliates: CRYPTO_AFFILIATES('XLM', 'stellar') },
  { slug: 'monero', name: 'Monero', symbol: 'XMR', category: 'crypto', icon: 'ɱ',
    coingeckoId: 'monero',
    affiliates: CRYPTO_AFFILIATES('XMR') },
  { slug: 'aptos', name: 'Aptos', symbol: 'APT', category: 'crypto', icon: '◆',
    coingeckoId: 'aptos',
    affiliates: CRYPTO_AFFILIATES('APT', 'aptos') },
  { slug: 'cosmos', name: 'Cosmos', symbol: 'ATOM', category: 'crypto', icon: '⚛',
    coingeckoId: 'cosmos',
    affiliates: CRYPTO_AFFILIATES('ATOM', 'cosmos') },
  { slug: 'filecoin', name: 'Filecoin', symbol: 'FIL', category: 'crypto', icon: '⬢',
    coingeckoId: 'filecoin',
    affiliates: CRYPTO_AFFILIATES('FIL', 'filecoin') },
  { slug: 'hedera', name: 'Hedera', symbol: 'HBAR', category: 'crypto', icon: 'ℏ',
    coingeckoId: 'hedera-hashgraph',
    affiliates: CRYPTO_AFFILIATES('HBAR', 'hedera') },
  { slug: 'arbitrum', name: 'Arbitrum', symbol: 'ARB', category: 'crypto', icon: '◇',
    coingeckoId: 'arbitrum',
    affiliates: CRYPTO_AFFILIATES('ARB', 'arbitrum') },
  { slug: 'optimism', name: 'Optimism', symbol: 'OP', category: 'crypto', icon: '○',
    coingeckoId: 'optimism',
    affiliates: CRYPTO_AFFILIATES('OP', 'optimism') },
  { slug: 'mantle', name: 'Mantle', symbol: 'MNT', category: 'crypto', icon: '◊',
    coingeckoId: 'mantle',
    affiliates: CRYPTO_AFFILIATES('MNT') },
  { slug: 'injective', name: 'Injective', symbol: 'INJ', category: 'crypto', icon: '◈',
    coingeckoId: 'injective-protocol',
    affiliates: CRYPTO_AFFILIATES('INJ', 'injective') },
  { slug: 'render', name: 'Render', symbol: 'RENDER', category: 'crypto', icon: '◉',
    coingeckoId: 'render-token',
    affiliates: CRYPTO_AFFILIATES('RENDER', 'render-token') },
  { slug: 'sui', name: 'Sui', symbol: 'SUI', category: 'crypto', icon: '🌊',
    coingeckoId: 'sui',
    affiliates: CRYPTO_AFFILIATES('SUI', 'sui') },
  { slug: 'ethereum-classic', name: 'Ethereum Classic', symbol: 'ETC', category: 'crypto', icon: 'Ξ',
    coingeckoId: 'ethereum-classic',
    affiliates: CRYPTO_AFFILIATES('ETC', 'ethereum-classic') },
  { slug: 'tezos', name: 'Tezos', symbol: 'XTZ', category: 'crypto', icon: 'ꜩ',
    coingeckoId: 'tezos',
    affiliates: CRYPTO_AFFILIATES('XTZ', 'tezos') },

  // ─── COMMODITY (existing 5) ──────────────────────────────────────────
  { slug: 'gold', name: 'Gold', symbol: 'XAU/USD', category: 'commodity', icon: '🥇',
    avEndpoint: 'fx', avSymbol: 'XAU',
    affiliates: COMMODITY_AFFILIATES('gold'),
    newsKeywords: ['gold', 'xau', 'precious metal', 'central bank'] },
  { slug: 'silver', name: 'Silver', symbol: 'XAG/USD', category: 'commodity', icon: '🥈',
    avEndpoint: 'fx', avSymbol: 'XAG',
    affiliates: COMMODITY_AFFILIATES('silver'),
    newsKeywords: ['silver', 'xag', 'solar', 'precious metal'] },
  { slug: 'oil', name: 'Crude Oil', symbol: 'WTI', category: 'commodity', icon: '🛢️',
    avEndpoint: 'energy', avSymbol: 'WTI',
    affiliates: COMMODITY_AFFILIATES('oil'),
    newsKeywords: ['oil', 'crude', 'opec', 'wti', 'brent', 'energy'] },
  { slug: 'naturalgas', name: 'Natural Gas', symbol: 'NATGAS', category: 'commodity', icon: '🔥',
    avEndpoint: 'energy', avSymbol: 'NATURAL_GAS',
    affiliates: COMMODITY_AFFILIATES('natural-gas'),
    newsKeywords: ['natural gas', 'lng', 'natgas', 'gas price', 'energy'] },
  { slug: 'copper', name: 'Copper', symbol: 'HG/USD', category: 'commodity', icon: '🔶',
    avEndpoint: 'commodity', avSymbol: 'COPPER',
    affiliates: COMMODITY_AFFILIATES('copper'),
    newsKeywords: ['copper', 'hg', 'mining', 'electric vehicle', 'ev', 'green energy'] },

  // NOTE: platinum (XPT/USD) and palladium (XPD/USD) were attempted on AV's
  // FX_DAILY endpoint, but Alpha Vantage doesn't actually serve those pairs
  // reliably (XAU/XAG work because they're heavily quoted in FX; XPT/XPD aren't).
  // Will re-enable when commodities migrate to Twelve Data ($30/mo, full
  // precious-metals coverage). Keeping the registry honest in the meantime —
  // an empty/zero page is worse for SEO than no page at all.
];

// ─── DERIVED LOOKUPS ────────────────────────────────────────────────────

export const REGISTRY_BY_SLUG: Record<string, AssetMeta> = Object.fromEntries(
  ASSET_REGISTRY.map(a => [a.slug, a])
);

export const CRYPTO_REGISTRY = ASSET_REGISTRY.filter(a => a.category === 'crypto');
export const COMMODITY_REGISTRY = ASSET_REGISTRY.filter(a => a.category === 'commodity');

export const CRYPTO_SLUGS = CRYPTO_REGISTRY.map(a => a.slug);
export const COMMODITY_SLUGS = COMMODITY_REGISTRY.map(a => a.slug);
export const ALL_SLUGS = ASSET_REGISTRY.map(a => a.slug);

// Lookup helpers used by API clients
export function getCoingeckoId(slug: string): string | undefined {
  return REGISTRY_BY_SLUG[slug]?.coingeckoId;
}

export function getCommodityRouting(slug: string): { endpoint: AVEndpoint; symbol: string } | undefined {
  const a = REGISTRY_BY_SLUG[slug];
  if (!a || a.category !== 'commodity' || !a.avEndpoint || !a.avSymbol) return undefined;
  return { endpoint: a.avEndpoint, symbol: a.avSymbol };
}

export function getAssetMeta(slug: string): AssetMeta | undefined {
  return REGISTRY_BY_SLUG[slug];
}

// Single source of truth for all assets the site supports.
// Add a new asset → it appears in sitemap, generateStaticParams, API routing,
// homepage directory list, and SEO-bound name/symbol lookups automatically.
//
// Crypto IDs come from CoinGecko. Stable, longstanding IDs are preferred —
// avoid recently rebranded coins (e.g. matic-network → polygon-ecosystem-token)
// because the ID can change again.
//
// Commodities now route through Twelve Data (lib/api/twelvedata.ts).
// `tdSymbol` is the symbol Twelve Data expects on /time_series:
//   - Forex pairs (precious metals):  'XAU/USD', 'XAG/USD', 'XPT/USD', 'XPD/USD'
//   - Commodity futures (CFD):        'WTI/USD', 'BRENT/USD', 'NG/USD', 'HG/USD'
//   - ETF proxies (NYSE-listed):      'WEAT', 'CORN', 'CANE', 'JO', 'JJU'
//
// ETF proxies have a small tracking error vs. their underlying commodity, but
// they have reliable Twelve Data coverage. Direct futures symbols are tried
// first for energy/base metals; agri commodities use ETFs. Each entry in
// scope is verified at smoke-test — if Twelve Data returns no data for a
// symbol, we swap it.

export type AssetCategory = 'crypto' | 'commodity';

export interface AssetMeta {
  slug: string;
  name: string;
  symbol: string;
  category: AssetCategory;
  icon: string;
  // Crypto-only
  coingeckoId?: string;
  // Commodity-only — Twelve Data symbol
  tdSymbol?: string;
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

  // ─── COMMODITY — precious metals (forex pairs) ──────────────────────
  { slug: 'gold', name: 'Gold', symbol: 'XAU/USD', category: 'commodity', icon: '🥇',
    tdSymbol: 'XAU/USD',
    affiliates: COMMODITY_AFFILIATES('gold'),
    newsKeywords: ['gold', 'xau', 'precious metal', 'central bank'] },
  { slug: 'silver', name: 'Silver', symbol: 'XAG/USD', category: 'commodity', icon: '🥈',
    tdSymbol: 'XAG/USD',
    affiliates: COMMODITY_AFFILIATES('silver'),
    newsKeywords: ['silver', 'xag', 'solar', 'precious metal'] },
  { slug: 'platinum', name: 'Platinum', symbol: 'XPT/USD', category: 'commodity', icon: '⬜',
    tdSymbol: 'XPT/USD',
    affiliates: COMMODITY_AFFILIATES('platinum'),
    newsKeywords: ['platinum', 'xpt', 'precious metal', 'auto catalyst'] },
  { slug: 'palladium', name: 'Palladium', symbol: 'XPD/USD', category: 'commodity', icon: '◽',
    tdSymbol: 'XPD/USD',
    affiliates: COMMODITY_AFFILIATES('palladium'),
    newsKeywords: ['palladium', 'xpd', 'precious metal', 'auto catalyst'] },

  // ─── COMMODITY — energy (Twelve Data CFD symbols) ───────────────────
  { slug: 'oil', name: 'Crude Oil', symbol: 'WTI', category: 'commodity', icon: '🛢️',
    tdSymbol: 'WTI/USD',
    affiliates: COMMODITY_AFFILIATES('oil'),
    newsKeywords: ['oil', 'crude', 'opec', 'wti', 'energy'] },
  { slug: 'brent', name: 'Brent Crude Oil', symbol: 'XBR/USD', category: 'commodity', icon: '⛽',
    tdSymbol: 'XBR/USD', // Twelve Data: Brent Spot / US Dollar (BRENT/USD is not a valid TD symbol)
    affiliates: COMMODITY_AFFILIATES('brent'),
    newsKeywords: ['brent', 'oil', 'crude', 'opec', 'energy'] },
  { slug: 'naturalgas', name: 'Natural Gas', symbol: 'NATGAS', category: 'commodity', icon: '🔥',
    tdSymbol: 'NG/USD',
    affiliates: COMMODITY_AFFILIATES('natural-gas'),
    newsKeywords: ['natural gas', 'lng', 'natgas', 'gas price', 'energy'] },

  // ─── COMMODITY — base metals (Twelve Data CFD symbols) ──────────────
  { slug: 'copper', name: 'Copper', symbol: 'HG/USD', category: 'commodity', icon: '🔶',
    tdSymbol: 'HG/USD',
    affiliates: COMMODITY_AFFILIATES('copper'),
    newsKeywords: ['copper', 'hg', 'mining', 'electric vehicle', 'ev', 'green energy'] },
  { slug: 'aluminum', name: 'Aluminum', symbol: 'ALI/USD', category: 'commodity', icon: '⬛',
    tdSymbol: 'ALI/USD', // Aluminum futures CFD on Twelve Data (JJU ETF was delisted NYSE Oct 2020)
    affiliates: COMMODITY_AFFILIATES('aluminum'),
    newsKeywords: ['aluminum', 'aluminium', 'mining', 'lme', 'industrial metal'] },

  // ─── COMMODITY — agriculture (NYSE-listed ETF proxies) ──────────────
  { slug: 'wheat', name: 'Wheat', symbol: 'WEAT', category: 'commodity', icon: '🌾',
    tdSymbol: 'WEAT',
    affiliates: COMMODITY_AFFILIATES('wheat'),
    newsKeywords: ['wheat', 'grain', 'cbot', 'agriculture', 'usda'] },
  { slug: 'corn', name: 'Corn', symbol: 'CORN', category: 'commodity', icon: '🌽',
    tdSymbol: 'CORN',
    affiliates: COMMODITY_AFFILIATES('corn'),
    newsKeywords: ['corn', 'maize', 'grain', 'cbot', 'agriculture', 'ethanol'] },
  { slug: 'sugar', name: 'Sugar', symbol: 'CANE', category: 'commodity', icon: '🍬',
    tdSymbol: 'CANE',
    affiliates: COMMODITY_AFFILIATES('sugar'),
    newsKeywords: ['sugar', 'cane', 'soft commodity', 'brazil', 'agriculture'] },
  { slug: 'coffee', name: 'Coffee', symbol: 'KC/USD', category: 'commodity', icon: '☕',
    tdSymbol: 'KC/USD', // Coffee C futures CFD (JO ETN delisted NYSE June 2023)
    affiliates: COMMODITY_AFFILIATES('coffee'),
    newsKeywords: ['coffee', 'arabica', 'soft commodity', 'brazil', 'vietnam'] },
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

export function getCommodityRouting(slug: string): { symbol: string } | undefined {
  const a = REGISTRY_BY_SLUG[slug];
  if (!a || a.category !== 'commodity' || !a.tdSymbol) return undefined;
  return { symbol: a.tdSymbol };
}

export function getAssetMeta(slug: string): AssetMeta | undefined {
  return REGISTRY_BY_SLUG[slug];
}

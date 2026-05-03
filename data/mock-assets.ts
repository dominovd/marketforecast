export type Regime = 'uptrend' | 'downtrend' | 'sideways' | 'chaotic';
export type Sentiment = 'positive' | 'negative' | 'neutral';

export interface NewsItem {
  title: string;
  source: string;
  time: string;
  sentiment: Sentiment;
  url: string;
}

export interface Scenario {
  condition: string;
  target: string;
  probability: string;
}

export interface Asset {
  slug: string;
  name: string;
  symbol: string;
  category: 'crypto' | 'commodity';
  icon: string;
  price: number;
  change24h: number;
  change7d: number;
  change30d: number;
  marketCap?: string;
  volume24h: string;
  indicators: {
    rsi: number;
    macd: number;
    bbPosition: number;
    ema50Distance: number;
    atr: number;
  };
  regime: Regime;
  fearGreed?: number;
  aiAnalysis: {
    summary: string;
    bull: Scenario;
    base: Scenario;
    bear: Scenario;
    keyFactors: string[];
  };
  news: NewsItem[];
  affiliates: { name: string; url: string; label: string }[];
}

export function generatePriceHistory(basePrice: number, volatility: number, trend: number, days: number) {
  const data = [];
  let price = basePrice * (1 - trend * 0.6);
  for (let i = days; i >= 0; i--) {
    const date = new Date();
    date.setDate(date.getDate() - i);
    const change = (Math.random() - 0.48) * volatility + (trend / days) * basePrice;
    price = Math.max(price + change, basePrice * 0.3);
    data.push({
      date: date.toLocaleDateString('en-US', { month: 'short', day: 'numeric' }),
      price: Math.round(price * 100) / 100,
    });
  }
  data[data.length - 1].price = basePrice;
  return data;
}

export const ASSETS: Record<string, Asset> = {
  bitcoin: {
    slug: 'bitcoin', name: 'Bitcoin', symbol: 'BTC', category: 'crypto', icon: '₿',
    price: 97450, change24h: 2.34, change7d: -1.82, change30d: 18.6,
    marketCap: '$1.92T', volume24h: '$38.4B',
    indicators: { rsi: 62, macd: 1240, bbPosition: 0.68, ema50Distance: 4.2, atr: 2850 },
    regime: 'uptrend', fearGreed: 72,
    aiAnalysis: {
      summary: 'Bitcoin is showing bullish momentum with RSI at 62 and price trading above EMA50. Recent institutional inflows and ETF volume suggest continued accumulation. Short-term consolidation around $95K–$100K is likely before the next directional move.',
      bull: { condition: 'If BTC breaks and holds above $102K with volume confirmation', target: '$118,000–$125,000 range by Q3 2026', probability: '35%' },
      base: { condition: 'If BTC consolidates between $90K–$102K with no major macro shocks', target: '$105,000–$112,000 by mid-2026', probability: '45%' },
      bear: { condition: 'If macro headwinds increase or ETF outflows accelerate', target: 'Retest of $78,000–$82,000 support zone', probability: '20%' },
      keyFactors: ['ETF net flow momentum', 'Fed rate decision timeline', 'Bitcoin halving supply effect', 'Institutional adoption pace'],
    },
    news: [
      { title: 'BlackRock Bitcoin ETF sees record $624M inflows in single day', source: 'Bloomberg', time: '2h ago', sentiment: 'positive', url: '#' },
      { title: 'Fed signals two potential rate cuts in 2026, risk assets rally', source: 'Reuters', time: '5h ago', sentiment: 'positive', url: '#' },
      { title: 'Bitcoin dominance hits 58% as altcoins underperform', source: 'CoinDesk', time: '8h ago', sentiment: 'neutral', url: '#' },
      { title: 'Miners face selling pressure ahead of difficulty adjustment', source: 'The Block', time: '12h ago', sentiment: 'negative', url: '#' },
      { title: 'MicroStrategy adds 5,000 BTC to treasury, total reaches 214K', source: 'CoinTelegraph', time: '1d ago', sentiment: 'positive', url: '#' },
    ],
    affiliates: [{ name: 'Binance', url: '#', label: 'Buy BTC on Binance' }, { name: 'Coinbase', url: '#', label: 'Buy on Coinbase' }],
  },
  ethereum: {
    slug: 'ethereum', name: 'Ethereum', symbol: 'ETH', category: 'crypto', icon: 'Ξ',
    price: 3284, change24h: 1.87, change7d: 3.41, change30d: -4.2,
    marketCap: '$394B', volume24h: '$18.2B',
    indicators: { rsi: 55, macd: 42, bbPosition: 0.52, ema50Distance: 1.8, atr: 98 },
    regime: 'sideways', fearGreed: 68,
    aiAnalysis: {
      summary: 'Ethereum is consolidating near midpoint of its Bollinger Band range, with RSI indicating neutral momentum. The upcoming Pectra upgrade and growing L2 ecosystem activity provide fundamental support, though ETH/BTC ratio remains under pressure.',
      bull: { condition: 'If ETH/BTC ratio recovers and staking yields attract institutional capital', target: '$4,200–$4,800 range through 2026', probability: '30%' },
      base: { condition: 'If current L2 growth continues and upgrade catalysts materialize', target: '$3,500–$4,100 range by Q2 2026', probability: '50%' },
      bear: { condition: 'If competitive L1s continue gaining market share or macro deteriorates', target: 'Support retest at $2,600–$2,900', probability: '20%' },
      keyFactors: ['Pectra upgrade timeline', 'L2 TVL growth trajectory', 'ETH spot ETF flows', 'DeFi protocol revenue trends'],
    },
    news: [
      { title: 'Ethereum Pectra upgrade set for Q2 2026, devs confirm timeline', source: 'Ethereum.org', time: '3h ago', sentiment: 'positive', url: '#' },
      { title: 'Base L2 surpasses 5M daily active addresses milestone', source: 'The Block', time: '6h ago', sentiment: 'positive', url: '#' },
      { title: 'ETH staking ratio reaches 28% of total supply', source: 'Dune Analytics', time: '1d ago', sentiment: 'neutral', url: '#' },
      { title: 'Solana gains DeFi market share as ETH gas costs rise', source: 'DeFiLlama', time: '1d ago', sentiment: 'negative', url: '#' },
    ],
    affiliates: [{ name: 'Binance', url: '#', label: 'Buy ETH on Binance' }, { name: 'Coinbase', url: '#', label: 'Buy on Coinbase' }],
  },
  solana: {
    slug: 'solana', name: 'Solana', symbol: 'SOL', category: 'crypto', icon: '◎',
    price: 178, change24h: -1.24, change7d: 5.6, change30d: 22.4,
    marketCap: '$87B', volume24h: '$4.8B',
    indicators: { rsi: 58, macd: 3.2, bbPosition: 0.61, ema50Distance: 9.4, atr: 8.2 },
    regime: 'uptrend', fearGreed: 68,
    aiAnalysis: {
      summary: 'Solana continues to show relative strength versus the broader crypto market, driven by high DeFi and NFT activity. RSI at 58 leaves room for further upside. The 30-day gain of 22% reflects growing ecosystem adoption.',
      bull: { condition: 'If SOL maintains DeFi dominance and meme coin activity stays elevated', target: '$220–$260 range by Q2 2026', probability: '35%' },
      base: { condition: 'If broader crypto market maintains current levels', target: '$185–$210 through mid-2026', probability: '45%' },
      bear: { condition: 'If network congestion issues resurface or BTC pulls back sharply', target: 'Support at $130–$145', probability: '20%' },
      keyFactors: ['Firedancer client upgrade', 'DEX volume vs. Ethereum', 'Meme coin market sentiment', 'Validator network stability'],
    },
    news: [
      { title: 'Solana DEX volume hits $8B in 24 hours, surpasses Ethereum', source: 'DeFiLlama', time: '2h ago', sentiment: 'positive', url: '#' },
      { title: 'Firedancer validator client enters final testing phase', source: 'Solana Foundation', time: '1d ago', sentiment: 'positive', url: '#' },
      { title: 'SOL staking yield drops to 6.2% as network activity normalizes', source: 'The Block', time: '2d ago', sentiment: 'neutral', url: '#' },
    ],
    affiliates: [{ name: 'Binance', url: '#', label: 'Buy SOL on Binance' }, { name: 'Coinbase', url: '#', label: 'Buy on Coinbase' }],
  },
  gold: {
    slug: 'gold', name: 'Gold', symbol: 'XAU/USD', category: 'commodity', icon: '🥇',
    price: 3342, change24h: 0.42, change7d: 1.84, change30d: 8.3,
    volume24h: '$182B',
    indicators: { rsi: 67, macd: 18.4, bbPosition: 0.74, ema50Distance: 6.1, atr: 42 },
    regime: 'uptrend',
    aiAnalysis: {
      summary: 'Gold is in a confirmed uptrend, trading above key moving averages with RSI approaching overbought at 67. Central bank purchases remain a structural tailwind, while geopolitical uncertainty supports safe-haven demand. A short-term pullback to $3,200 would be technically healthy.',
      bull: { condition: 'If central bank buying accelerates and USD weakens further', target: '$3,600–$3,800 per oz in 2026', probability: '35%' },
      base: { condition: 'If Fed cuts rates twice and geopolitical tensions persist', target: '$3,400–$3,550 per oz through mid-2026', probability: '45%' },
      bear: { condition: 'If USD strengthens sharply or risk appetite surges', target: 'Correction toward $3,050–$3,150 support', probability: '20%' },
      keyFactors: ['Central bank reserve diversification', 'US Dollar Index (DXY) direction', 'Real interest rate trajectory', 'Geopolitical risk premium'],
    },
    news: [
      { title: 'Central banks bought 1,136 tonnes of gold in 2025, near record pace', source: 'World Gold Council', time: '4h ago', sentiment: 'positive', url: '#' },
      { title: 'Gold hits new ATH as dollar weakens on soft jobs data', source: 'Reuters', time: '7h ago', sentiment: 'positive', url: '#' },
      { title: 'SPDR Gold ETF sees $2.1B inflows over past two weeks', source: 'Bloomberg', time: '1d ago', sentiment: 'positive', url: '#' },
      { title: 'Analysts warn of short-term overbought conditions in gold', source: 'FT', time: '1d ago', sentiment: 'negative', url: '#' },
    ],
    affiliates: [{ name: 'eToro', url: '#', label: 'Trade Gold on eToro' }, { name: 'XTB', url: '#', label: 'Trade on XTB' }],
  },
  silver: {
    slug: 'silver', name: 'Silver', symbol: 'XAG/USD', category: 'commodity', icon: '🥈',
    price: 33.84, change24h: 0.78, change7d: 3.2, change30d: 5.8,
    volume24h: '$24B',
    indicators: { rsi: 61, macd: 0.42, bbPosition: 0.65, ema50Distance: 5.3, atr: 0.72 },
    regime: 'uptrend',
    aiAnalysis: {
      summary: 'Silver is benefiting from dual tailwinds: safe-haven demand alongside industrial demand from solar panels and EV batteries. The gold/silver ratio at ~98 suggests silver remains historically undervalued relative to gold.',
      bull: { condition: 'If green energy investment accelerates and gold continues higher', target: '$40–$45 per oz in 2026', probability: '30%' },
      base: { condition: 'If industrial demand stays steady and safe-haven bid persists', target: '$36–$39 per oz through mid-2026', probability: '50%' },
      bear: { condition: 'If global manufacturing slows or dollar strengthens', target: 'Pullback to $28–$31 range', probability: '20%' },
      keyFactors: ['Solar panel demand growth', 'Gold/silver ratio compression', 'Industrial vs. investment demand split', 'Mining supply constraints'],
    },
    news: [
      { title: 'Silver demand from solar industry to hit record 232Moz in 2026', source: 'Silver Institute', time: '6h ago', sentiment: 'positive', url: '#' },
      { title: 'Gold/silver ratio at 98 — analysts see silver as undervalued', source: 'Kitco', time: '1d ago', sentiment: 'positive', url: '#' },
    ],
    affiliates: [{ name: 'eToro', url: '#', label: 'Trade Silver on eToro' }, { name: 'XTB', url: '#', label: 'Trade on XTB' }],
  },
  oil: {
    slug: 'oil', name: 'Crude Oil', symbol: 'WTI', category: 'commodity', icon: '🛢️',
    price: 74.82, change24h: -0.94, change7d: -2.1, change30d: -6.4,
    volume24h: '$890B',
    indicators: { rsi: 41, macd: -0.84, bbPosition: 0.28, ema50Distance: -3.8, atr: 1.84 },
    regime: 'downtrend',
    aiAnalysis: {
      summary: 'WTI crude is under pressure, trading below EMA50 with RSI near oversold territory at 41. OPEC+ production increases and demand concerns from China weigh on prices. Bollinger Band position at 0.28 suggests approaching potential support levels.',
      bull: { condition: 'If OPEC+ reverses production hikes and demand recovers', target: '$82–$88 range by Q3 2026', probability: '25%' },
      base: { condition: 'If OPEC+ maintains current policy and global growth stays moderate', target: '$72–$78 range through mid-2026', probability: '50%' },
      bear: { condition: 'If China demand continues to disappoint and US shale output rises', target: 'Possible test of $62–$67 support', probability: '25%' },
      keyFactors: ['OPEC+ production policy', 'China economic activity data', 'US strategic reserve levels', 'Energy transition pace'],
    },
    news: [
      { title: 'OPEC+ confirms gradual production increase through H1 2026', source: 'OPEC', time: '3h ago', sentiment: 'negative', url: '#' },
      { title: 'China oil imports fall 4% YoY as EV adoption accelerates', source: 'Reuters', time: '8h ago', sentiment: 'negative', url: '#' },
      { title: 'IEA raises 2026 global oil demand forecast by 200kbd', source: 'IEA', time: '2d ago', sentiment: 'positive', url: '#' },
    ],
    affiliates: [{ name: 'eToro', url: '#', label: 'Trade Oil on eToro' }, { name: 'XTB', url: '#', label: 'Trade on XTB' }],
  },
  xrp: {
    slug: 'xrp', name: 'XRP', symbol: 'XRP', category: 'crypto', icon: '✕',
    price: 2.18, change24h: 1.42, change7d: -3.1, change30d: 12.4,
    marketCap: '$125B', volume24h: '$5.2B',
    indicators: { rsi: 54, macd: 0.018, bbPosition: 0.55, ema50Distance: 3.1, atr: 0.08 },
    regime: 'sideways', fearGreed: 68,
    aiAnalysis: {
      summary: 'XRP is consolidating near its Bollinger Band midpoint with RSI at 54 indicating neutral momentum. Ongoing regulatory clarity following SEC case resolution provides structural support, while cross-border payment adoption continues to grow.',
      bull: { condition: 'If institutional cross-border payment adoption accelerates and BTC rallies', target: '$3.20–$4.00 range by Q3 2026', probability: '35%' },
      base: { condition: 'If regulatory environment remains stable and current adoption pace continues', target: '$2.40–$3.00 through mid-2026', probability: '45%' },
      bear: { condition: 'If macro conditions deteriorate or new regulatory challenges emerge', target: 'Support retest at $1.60–$1.85', probability: '20%' },
      keyFactors: ['SEC lawsuit final resolution', 'Ripple ODL payment volume growth', 'Central bank digital currency competition', 'BTC market correlation'],
    },
    news: [
      { title: 'Ripple expands ODL corridors to Southeast Asia markets', source: 'Ripple', time: '4h ago', sentiment: 'positive', url: '#' },
      { title: 'XRP ETF applications filed by multiple asset managers', source: 'Bloomberg', time: '1d ago', sentiment: 'positive', url: '#' },
      { title: 'XRP trading volume surges 40% amid cross-border payment news', source: 'CoinDesk', time: '2d ago', sentiment: 'positive', url: '#' },
    ],
    affiliates: [{ name: 'Binance', url: 'https://www.binance.com/en/trade/XRP_USDT', label: 'Buy XRP on Binance' }, { name: 'Coinbase', url: 'https://www.coinbase.com/price/xrp', label: 'Buy on Coinbase' }],
  },
  bnb: {
    slug: 'bnb', name: 'BNB', symbol: 'BNB', category: 'crypto', icon: '◈',
    price: 612, change24h: 0.87, change7d: 2.3, change30d: 8.9,
    marketCap: '$88B', volume24h: '$1.8B',
    indicators: { rsi: 57, macd: 4.2, bbPosition: 0.59, ema50Distance: 5.8, atr: 14.2 },
    regime: 'uptrend', fearGreed: 68,
    aiAnalysis: {
      summary: 'BNB shows steady uptrend momentum with RSI at 57 and price above EMA50. Binance ecosystem growth, BNB burn mechanics, and increasing BNB Chain DeFi activity provide consistent demand pressure.',
      bull: { condition: 'If Binance exchange volume recovers to 2024 highs and BNB burns accelerate', target: '$780–$900 range by Q3 2026', probability: '30%' },
      base: { condition: 'If BNB Chain maintains TVL growth and quarterly burns continue', target: '$640–$720 through mid-2026', probability: '50%' },
      bear: { condition: 'If regulatory pressure on Binance intensifies or market-wide correction occurs', target: 'Support at $480–$540', probability: '20%' },
      keyFactors: ['Binance exchange regulatory status', 'Quarterly BNB burn rate', 'BNB Chain DeFi TVL', 'Crypto market correlation'],
    },
    news: [
      { title: 'Binance Q1 2026 BNB burn reaches record $950M equivalent', source: 'Binance', time: '3h ago', sentiment: 'positive', url: '#' },
      { title: 'BNB Chain TVL surpasses $8B as DeFi activity recovers', source: 'DeFiLlama', time: '1d ago', sentiment: 'positive', url: '#' },
      { title: 'Binance secures operating licenses in three new jurisdictions', source: 'Reuters', time: '2d ago', sentiment: 'positive', url: '#' },
    ],
    affiliates: [{ name: 'Binance', url: 'https://www.binance.com/en/trade/BNB_USDT', label: 'Buy BNB on Binance' }, { name: 'KuCoin', url: 'https://www.kucoin.com/trade/BNB-USDT', label: 'Buy on KuCoin' }],
  },
  cardano: {
    slug: 'cardano', name: 'Cardano', symbol: 'ADA', category: 'crypto', icon: '₳',
    price: 0.72, change24h: -0.54, change7d: 4.2, change30d: -8.1,
    marketCap: '$25B', volume24h: '$520M',
    indicators: { rsi: 49, macd: 0.004, bbPosition: 0.48, ema50Distance: -1.2, atr: 0.022 },
    regime: 'sideways', fearGreed: 68,
    aiAnalysis: {
      summary: 'Cardano is trading near its Bollinger Band midpoint with RSI at 49, reflecting genuine consolidation. The Chang hard fork and increasing DeFi ecosystem activity on Midnight provide potential catalysts, though price has underperformed broader market in 30-day timeframe.',
      bull: { condition: 'If Cardano DeFi TVL grows significantly and ADA staking demand increases', target: '$0.95–$1.20 range through 2026', probability: '30%' },
      base: { condition: 'If development milestones are met and crypto market stays stable', target: '$0.78–$0.92 through mid-2026', probability: '45%' },
      bear: { condition: 'If smart contract adoption stalls relative to competing L1s', target: 'Retest of $0.52–$0.60 support', probability: '25%' },
      keyFactors: ['Midnight sidechain launch', 'DeFi TVL growth on Cardano', 'ADA staking ratio', 'L1 competition from Solana/ETH'],
    },
    news: [
      { title: 'Cardano Chang hard fork successfully activated on mainnet', source: 'IOHK', time: '5h ago', sentiment: 'positive', url: '#' },
      { title: 'ADA staking participation reaches 68% of circulating supply', source: 'Cardano Foundation', time: '1d ago', sentiment: 'neutral', url: '#' },
      { title: 'Cardano DeFi TVL grows 28% in April 2026', source: 'DeFiLlama', time: '2d ago', sentiment: 'positive', url: '#' },
    ],
    affiliates: [{ name: 'Binance', url: 'https://www.binance.com/en/trade/ADA_USDT', label: 'Buy ADA on Binance' }, { name: 'Coinbase', url: 'https://www.coinbase.com/price/cardano', label: 'Buy on Coinbase' }],
  },
  naturalgas: {
    slug: 'naturalgas', name: 'Natural Gas', symbol: 'NATGAS', category: 'commodity', icon: '🔥',
    price: 3.42, change24h: 1.12, change7d: -4.2, change30d: 15.3,
    volume24h: '$180B',
    indicators: { rsi: 58, macd: 0.062, bbPosition: 0.62, ema50Distance: 8.4, atr: 0.14 },
    regime: 'uptrend',
    aiAnalysis: {
      summary: 'Natural gas is in an uptrend driven by LNG export demand and below-average storage levels. RSI at 58 suggests room for further upside. European demand recovery and AI data center energy consumption are emerging structural tailwinds.',
      bull: { condition: 'If summer heat waves drive power demand and LNG exports remain elevated', target: '$4.20–$4.80 per MMBtu by Q3 2026', probability: '30%' },
      base: { condition: 'If storage builds normally and LNG export capacity stays at current levels', target: '$3.40–$3.90 through mid-2026', probability: '50%' },
      bear: { condition: 'If mild summer reduces power demand or storage builds faster than expected', target: 'Pullback to $2.60–$2.90 range', probability: '20%' },
      keyFactors: ['US LNG export capacity utilization', 'European storage levels', 'Summer weather patterns', 'AI data center power demand'],
    },
    news: [
      { title: 'US LNG exports hit record 15 bcf/d as European demand surges', source: 'Reuters', time: '2h ago', sentiment: 'positive', url: '#' },
      { title: 'Natural gas storage deficit widens to 12% below 5-year average', source: 'EIA', time: '6h ago', sentiment: 'positive', url: '#' },
      { title: 'AI data centers driving 8% increase in US power consumption', source: 'Bloomberg', time: '1d ago', sentiment: 'positive', url: '#' },
    ],
    affiliates: [{ name: 'eToro', url: 'https://www.etoro.com/markets/natgas', label: 'Trade Nat Gas on eToro' }, { name: 'XTB', url: 'https://www.xtb.com/en/financial-data/natural-gas', label: 'Trade on XTB' }],
  },
  copper: {
    slug: 'copper', name: 'Copper', symbol: 'HG/USD', category: 'commodity', icon: '🔶',
    price: 4.82, change24h: 0.34, change7d: 2.8, change30d: 6.2,
    volume24h: '$42B',
    indicators: { rsi: 61, macd: 0.048, bbPosition: 0.66, ema50Distance: 4.9, atr: 0.098 },
    regime: 'uptrend',
    aiAnalysis: {
      summary: 'Copper is in a confirmed uptrend supported by green energy transition demand. RSI at 61 with price above EMA50 reflects steady accumulation. Electric vehicle production, renewable energy infrastructure, and AI data center buildout are structural demand drivers.',
      bull: { condition: 'If China stimulus accelerates infrastructure spending and EV demand beats forecasts', target: '$5.60–$6.20 per lb in 2026', probability: '35%' },
      base: { condition: 'If green energy transition continues at current pace and supply remains constrained', target: '$5.00–$5.50 through mid-2026', probability: '45%' },
      bear: { condition: 'If China economic slowdown deepens or new large mines come online', target: 'Correction to $4.00–$4.30 support', probability: '20%' },
      keyFactors: ['China infrastructure stimulus', 'EV production growth rate', 'Mine supply from Chile and Peru', 'AI/data center copper demand'],
    },
    news: [
      { title: 'Copper deficit forecast at 500,000 tonnes in 2026 — Goldman Sachs', source: 'Goldman Sachs', time: '3h ago', sentiment: 'positive', url: '#' },
      { title: 'Chile copper output falls 3% on water restrictions at key mines', source: 'Reuters', time: '8h ago', sentiment: 'positive', url: '#' },
      { title: 'EV manufacturers lock in long-term copper supply contracts', source: 'FT', time: '1d ago', sentiment: 'positive', url: '#' },
    ],
    affiliates: [{ name: 'eToro', url: 'https://www.etoro.com/markets/copper', label: 'Trade Copper on eToro' }, { name: 'XTB', url: 'https://www.xtb.com/en/financial-data/copper', label: 'Trade on XTB' }],
  },
};

export const ALL_ASSETS_LIST = [
  { slug: 'bitcoin', category: 'crypto' },
  { slug: 'ethereum', category: 'crypto' },
  { slug: 'solana', category: 'crypto' },
  { slug: 'xrp', category: 'crypto' },
  { slug: 'bnb', category: 'crypto' },
  { slug: 'cardano', category: 'crypto' },
  { slug: 'gold', category: 'commodity' },
  { slug: 'silver', category: 'commodity' },
  { slug: 'oil', category: 'commodity' },
  { slug: 'naturalgas', category: 'commodity' },
  { slug: 'copper', category: 'commodity' },
];

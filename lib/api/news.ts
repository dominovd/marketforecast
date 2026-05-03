// Free RSS news feeds — no API key required
// Sources: CoinDesk, CoinTelegraph, Decrypt (crypto) + Reuters commodities RSS
import { getCached, setCached } from '@/lib/cache/redis';

export interface NewsItem {
  title: string;
  source: string;
  time: string;
  sentiment: 'positive' | 'negative' | 'neutral';
  url: string;
}

const FEEDS: Record<string, { url: string; source: string }[]> = {
  bitcoin: [
    { url: 'https://www.coindesk.com/arc/outboundfeeds/rss/?category=markets', source: 'CoinDesk' },
    { url: 'https://cointelegraph.com/rss/tag/bitcoin', source: 'CoinTelegraph' },
  ],
  ethereum: [
    { url: 'https://www.coindesk.com/arc/outboundfeeds/rss/?category=tech', source: 'CoinDesk' },
    { url: 'https://cointelegraph.com/rss/tag/ethereum', source: 'CoinTelegraph' },
  ],
  xrp: [
    { url: 'https://cointelegraph.com/rss/tag/xrp', source: 'CoinTelegraph' },
    { url: 'https://www.coindesk.com/arc/outboundfeeds/rss/?category=markets', source: 'CoinDesk' },
  ],
  bnb: [
    { url: 'https://cointelegraph.com/rss/tag/bnb', source: 'CoinTelegraph' },
    { url: 'https://decrypt.co/feed', source: 'Decrypt' },
  ],
  cardano: [
    { url: 'https://cointelegraph.com/rss/tag/cardano', source: 'CoinTelegraph' },
    { url: 'https://decrypt.co/feed', source: 'Decrypt' },
  ],
  naturalgas: [
    { url: 'https://feeds.reuters.com/reuters/businessNews', source: 'Reuters' },
    { url: 'https://oilprice.com/rss/main', source: 'OilPrice' },
  ],
  copper: [
    { url: 'https://feeds.reuters.com/reuters/businessNews', source: 'Reuters' },
    { url: 'https://www.mining.com/feed/', source: 'Mining.com' },
  ],
  solana: [
    { url: 'https://cointelegraph.com/rss/tag/solana', source: 'CoinTelegraph' },
    { url: 'https://decrypt.co/feed', source: 'Decrypt' },
  ],
  gold: [
    { url: 'https://feeds.reuters.com/reuters/businessNews', source: 'Reuters' },
    { url: 'https://www.kitco.com/rss/kitconews.xml', source: 'Kitco' },
  ],
  silver: [
    { url: 'https://www.kitco.com/rss/kitconews.xml', source: 'Kitco' },
    { url: 'https://feeds.reuters.com/reuters/businessNews', source: 'Reuters' },
  ],
  oil: [
    { url: 'https://feeds.reuters.com/reuters/businessNews', source: 'Reuters' },
    { url: 'https://oilprice.com/rss/main', source: 'OilPrice' },
  ],
};

// Simple RSS XML parser (no external deps)
function parseRSSItems(xml: string, source: string, keyword: string): NewsItem[] {
  const items: NewsItem[] = [];
  const itemRegex = /<item>([\s\S]*?)<\/item>/g;
  let match;

  while ((match = itemRegex.exec(xml)) !== null && items.length < 5) {
    const block = match[1];
    const title = decodeXML(extractTag(block, 'title'));
    const link = extractTag(block, 'link') || extractCDATA(block, 'link');
    const pubDate = extractTag(block, 'pubDate');

    if (!title) continue;

    // Filter by keyword relevance for generic feeds
    const lower = title.toLowerCase();
    const kw = keyword.toLowerCase();
    if (!lower.includes(kw) && !isRelated(lower, kw)) continue;

    items.push({
      title,
      source,
      time: formatRelativeTime(pubDate),
      sentiment: guessSentiment(title),
      url: link || '#',
    });
  }
  return items;
}

function extractTag(xml: string, tag: string): string {
  const m = xml.match(new RegExp(`<${tag}[^>]*><!\\[CDATA\\[([\\s\\S]*?)\\]\\]><\\/${tag}>|<${tag}[^>]*>([^<]*)<\\/${tag}>`));
  return (m?.[1] || m?.[2] || '').trim();
}

function extractCDATA(xml: string, tag: string): string {
  const m = xml.match(new RegExp(`<${tag}[^>]*><!\\[CDATA\\[([\\s\\S]*?)\\]\\]>`));
  return (m?.[1] || '').trim();
}

function decodeXML(s: string): string {
  return s.replace(/&amp;/g, '&').replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&quot;/g, '"').replace(/&#39;/g, "'");
}

function isRelated(title: string, keyword: string): boolean {
  const related: Record<string, string[]> = {
    bitcoin: ['btc', 'crypto', 'cryptocurrency', 'blockchain', 'etf', 'microstrategy'],
    ethereum: ['eth', 'defi', 'erc-20', 'layer 2', 'l2', 'pectra'],
    solana: ['sol', 'solana', 'dex', 'firedancer'],
    xrp: ['xrp', 'ripple', 'odl', 'cross-border', 'sec'],
    bnb: ['bnb', 'binance', 'bsc', 'bnb chain'],
    cardano: ['cardano', 'ada', 'iohk', 'midnight', 'chang'],
    gold: ['gold', 'xau', 'precious metal', 'central bank'],
    silver: ['silver', 'xag', 'solar', 'precious metal'],
    oil: ['oil', 'crude', 'opec', 'wti', 'brent', 'energy'],
    naturalgas: ['natural gas', 'lng', 'natgas', 'gas price', 'energy'],
    copper: ['copper', 'hg', 'mining', 'electric vehicle', 'ev', 'green energy'],
  };
  return (related[keyword] || []).some(kw => title.includes(kw));
}

function formatRelativeTime(pubDate: string): string {
  if (!pubDate) return 'recently';
  const date = new Date(pubDate);
  if (isNaN(date.getTime())) return 'recently';
  const diffMs = Date.now() - date.getTime();
  const diffH = Math.floor(diffMs / 3600000);
  if (diffH < 1) return `${Math.floor(diffMs / 60000)}m ago`;
  if (diffH < 24) return `${diffH}h ago`;
  return `${Math.floor(diffH / 24)}d ago`;
}

const POSITIVE_WORDS = ['surge', 'rally', 'gain', 'bullish', 'record', 'high', 'boost', 'growth', 'inflow', 'rises', 'soars', 'breaks', 'hit new', 'upgrade', 'buy', 'adoption'];
const NEGATIVE_WORDS = ['drop', 'fall', 'crash', 'bearish', 'loss', 'decline', 'sell', 'outflow', 'concern', 'risk', 'warn', 'pressure', 'plunge', 'fear', 'ban', 'restrict'];

function guessSentiment(title: string): 'positive' | 'negative' | 'neutral' {
  const lower = title.toLowerCase();
  const posScore = POSITIVE_WORDS.filter(w => lower.includes(w)).length;
  const negScore = NEGATIVE_WORDS.filter(w => lower.includes(w)).length;
  if (posScore > negScore) return 'positive';
  if (negScore > posScore) return 'negative';
  return 'neutral';
}

async function fetchFeed(url: string, source: string, keyword: string): Promise<NewsItem[]> {
  try {
    const res = await fetch(url, {
      next: { revalidate: 3600 },
      headers: { 'User-Agent': 'MarketForecast/1.0 RSS Reader' },
      signal: AbortSignal.timeout(5000),
    });
    if (!res.ok) return [];
    const xml = await res.text();
    return parseRSSItems(xml, source, keyword);
  } catch {
    return [];
  }
}

export async function getNewsForAsset(slug: string): Promise<NewsItem[]> {
  const cacheKey = `news:${slug}`;
  const cached = await getCached<NewsItem[]>(cacheKey);
  if (cached && cached.length > 0) return cached;

  const feeds = FEEDS[slug] || [];
  const results = await Promise.allSettled(
    feeds.map(f => fetchFeed(f.url, f.source, slug))
  );

  let items: NewsItem[] = [];
  for (const r of results) {
    if (r.status === 'fulfilled') items = items.concat(r.value);
  }

  // Deduplicate by title similarity, take top 5
  const seen = new Set<string>();
  const unique = items.filter(item => {
    const key = item.title.slice(0, 40).toLowerCase();
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  }).slice(0, 5);

  if (unique.length > 0) {
    await setCached(cacheKey, unique, 3600); // 1h cache for news
  }

  return unique;
}

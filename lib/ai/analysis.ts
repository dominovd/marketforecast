// Claude API for AI market analysis, cached 24h in Upstash Redis
import Anthropic from '@anthropic-ai/sdk';
import { getCached, setCached } from '@/lib/cache/redis';

export interface Scenario {
  condition: string;
  target: string;
  probability: string;
}

export interface AIAnalysis {
  summary: string;
  bull: Scenario;
  base: Scenario;
  bear: Scenario;
  keyFactors: string[];
}

interface AssetContext {
  name: string;
  symbol: string;
  price: number;
  change24h: number;
  change7d: number;
  change30d: number;
  rsi: number;
  macd: number;
  bbPosition: number;
  ema50Distance: number;
  atr: number;
  regime: string;
  fearGreed?: number;
}

function buildPrompt(ctx: AssetContext): string {
  return `You are a professional quantitative market analyst. Analyze this asset and provide a structured forecast.

Asset: ${ctx.name} (${ctx.symbol})
Current Price: $${ctx.price.toLocaleString()}
24h Change: ${ctx.change24h > 0 ? '+' : ''}${ctx.change24h}%
7d Change: ${ctx.change7d > 0 ? '+' : ''}${ctx.change7d}%
30d Change: ${ctx.change30d > 0 ? '+' : ''}${ctx.change30d}%

Technical Indicators:
- RSI(14): ${ctx.rsi} ${ctx.rsi > 70 ? '(overbought)' : ctx.rsi < 30 ? '(oversold)' : '(neutral)'}
- MACD: ${ctx.macd}
- Bollinger Band Position: ${ctx.bbPosition} (0=lower, 1=upper band)
- Distance from EMA50: ${ctx.ema50Distance}%
- ATR(14): ${ctx.atr}
- Market Regime: ${ctx.regime}
${ctx.fearGreed !== undefined ? `- Fear & Greed Index: ${ctx.fearGreed}/100` : ''}

Respond ONLY with valid JSON in this exact format, no markdown, no extra text:
{
  "summary": "2-3 sentence technical analysis summary mentioning key indicators and near-term outlook",
  "bull": {
    "condition": "specific bullish trigger condition",
    "target": "price target range and timeframe",
    "probability": "percentage like 35%"
  },
  "base": {
    "condition": "base case conditions",
    "target": "price target range and timeframe",
    "probability": "percentage like 45%"
  },
  "bear": {
    "condition": "bearish trigger conditions",
    "target": "support levels and downside target",
    "probability": "percentage like 20%"
  },
  "keyFactors": ["factor 1", "factor 2", "factor 3", "factor 4"]
}

Important: probabilities must sum to 100%. Be specific with price levels based on current price. Use analytical language.`;
}

export async function getAIAnalysis(slug: string, ctx: AssetContext): Promise<AIAnalysis> {
  const cacheKey = `ai:analysis:${slug}`;

  // Try cache first
  const cached = await getCached<AIAnalysis>(cacheKey);
  if (cached) return cached;

  // Generate via Claude API
  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) throw new Error('Missing ANTHROPIC_API_KEY');

  const client = new Anthropic({ apiKey });

  const message = await client.messages.create({
    model: 'claude-haiku-4-5-20251001',
    max_tokens: 1024,
    messages: [
      {
        role: 'user',
        content: buildPrompt(ctx),
      },
    ],
  });

  const text = message.content[0].type === 'text' ? message.content[0].text : '';

  let analysis: AIAnalysis;
  try {
    // Strip any markdown code fences just in case
    const cleaned = text.replace(/```json\n?/g, '').replace(/```\n?/g, '').trim();
    analysis = JSON.parse(cleaned);
  } catch {
    // Fallback if JSON parse fails
    analysis = {
      summary: `${ctx.name} is currently in a ${ctx.regime} regime with RSI at ${ctx.rsi}. Price is ${ctx.ema50Distance > 0 ? 'above' : 'below'} EMA50 by ${Math.abs(ctx.ema50Distance)}%. Monitor key support and resistance levels.`,
      bull: { condition: 'If price breaks above resistance with volume', target: `${Math.round(ctx.price * 1.15).toLocaleString()}–${Math.round(ctx.price * 1.25).toLocaleString()}`, probability: '30%' },
      base: { condition: 'If current trend maintains', target: `${Math.round(ctx.price * 1.05).toLocaleString()}–${Math.round(ctx.price * 1.12).toLocaleString()}`, probability: '50%' },
      bear: { condition: 'If macro conditions deteriorate', target: `${Math.round(ctx.price * 0.85).toLocaleString()}–${Math.round(ctx.price * 0.90).toLocaleString()}`, probability: '20%' },
      keyFactors: ['Market sentiment', 'Technical momentum', 'Macro conditions', 'Volume trends'],
    };
  }

  // Cache for 24 hours
  await setCached(cacheKey, analysis, 86400);

  return analysis;
}

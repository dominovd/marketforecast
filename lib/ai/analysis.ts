// Claude API for AI market commentary, cached in Upstash Redis.
//
// IMPORTANT — role of the LLM changed in prompt-v2.
//
// Previously Claude invented the price targets AND the scenario probabilities.
// That was the single biggest credibility problem on the site: an LLM cannot
// produce calibrated probabilities, so a "35%" meant nothing, and because the
// targets were free-text prose they could never be scored against reality.
//
// Now the numbers come from lib/forecast/quant.ts, which is backtested and
// calibrated (see scripts/calibrate-forecast.ts). The model is handed those
// numbers and asked to do the thing it is actually good at: explain WHY the
// technical picture looks the way it does, and describe what would have to
// happen for each scenario to play out. It is explicitly forbidden from
// inventing its own levels or probabilities.
import Anthropic from '@anthropic-ai/sdk';
import { getCached, setCached, isBuildPhase } from '@/lib/cache/redis';
import type { QuantForecast } from '@/lib/forecast/quant';

// Bump when the prompt changes so ledger rows stay attributable.
export const PROMPT_VERSION = 'prompt-v2';

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

export interface AssetContext {
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

/** Price formatter that survives both BTC ($97,450) and SHIB ($0.00002341). */
export function fmtPrice(v: number): string {
  if (!isFinite(v)) return '—';
  if (v >= 1000) return `$${Math.round(v).toLocaleString('en-US')}`;
  if (v >= 1) return `$${v.toFixed(2)}`;
  if (v >= 0.01) return `$${v.toFixed(4)}`;
  return `$${v.toFixed(8)}`;
}

function pct(p: number): string {
  return `${Math.round(p * 100)}%`;
}

function buildPrompt(ctx: AssetContext, f: QuantForecast): string {
  return `You are a quantitative market analyst writing commentary for a public markets site.

A calibrated statistical model has ALREADY produced the forecast numbers below.
Your job is to explain them — NOT to produce your own. Do not invent price
targets, do not invent probabilities, do not contradict the ranges given.

ASSET
${ctx.name} (${ctx.symbol})
Spot: ${fmtPrice(ctx.price)}
Change: 24h ${ctx.change24h > 0 ? '+' : ''}${ctx.change24h}%, 7d ${ctx.change7d > 0 ? '+' : ''}${ctx.change7d}%, 30d ${ctx.change30d > 0 ? '+' : ''}${ctx.change30d}%

TECHNICAL STATE
RSI(14): ${ctx.rsi} ${ctx.rsi > 70 ? '(overbought)' : ctx.rsi < 30 ? '(oversold)' : '(neutral)'}
MACD: ${ctx.macd}
Bollinger position: ${ctx.bbPosition} (0 = lower band, 1 = upper band)
Distance from EMA50: ${ctx.ema50Distance}%
Market regime: ${ctx.regime}
Annualized volatility: ${f.annualizedVolPct.toFixed(0)}%
${ctx.fearGreed !== undefined ? `Fear & Greed: ${ctx.fearGreed}/100` : ''}

MODEL FORECAST — ${f.horizonDays} day horizon (FIXED, do not alter)
Key resistance: ${fmtPrice(f.resistance)}
Key support:    ${fmtPrice(f.support)}
Bull scenario:  above ${fmtPrice(f.resistance)}, probability ${pct(f.bull.probability)}
Base scenario:  ${fmtPrice(f.support)} to ${fmtPrice(f.resistance)}, probability ${pct(f.base.probability)}
Bear scenario:  below ${fmtPrice(f.support)}, probability ${pct(f.bear.probability)}
80% confidence band: ${fmtPrice(f.interval80.low)} to ${fmtPrice(f.interval80.high)}

Write the commentary. Respond ONLY with valid JSON, no markdown fences:
{
  "summary": "3-4 sentences. What the indicators say about current positioning, what the volatility regime implies for how wide the range is, and what to watch. Reference the actual numbers above. Do not state a single 'prediction' — describe the distribution.",
  "bull": { "condition": "what would have to happen for price to clear the resistance level" },
  "base": { "condition": "what keeps price inside the support-resistance corridor" },
  "bear": { "condition": "what would have to break for price to lose the support level" },
  "keyFactors": ["factor 1", "factor 2", "factor 3", "factor 4"]
}

Each condition: one sentence, specific, referencing real levels or indicators.
Never write "guaranteed", "will", or "certain" — these are conditional scenarios.`;
}

interface RawNarrative {
  summary: string;
  bull: { condition: string };
  base: { condition: string };
  bear: { condition: string };
  keyFactors: string[];
}

/**
 * Merge the LLM's prose with the model's numbers. Targets and probabilities
 * always come from the forecast — the LLM cannot override them even if it
 * ignores instructions and emits its own.
 */
function assemble(n: RawNarrative, f: QuantForecast): AIAnalysis {
  return {
    summary: n.summary,
    bull: {
      condition: n.bull.condition,
      target: `${fmtPrice(f.bull.low)} – ${fmtPrice(f.bull.high)} (${f.horizonDays}d)`,
      probability: pct(f.bull.probability),
    },
    base: {
      condition: n.base.condition,
      target: `${fmtPrice(f.base.low)} – ${fmtPrice(f.base.high)} (${f.horizonDays}d)`,
      probability: pct(f.base.probability),
    },
    bear: {
      condition: n.bear.condition,
      target: `${fmtPrice(f.bear.low)} – ${fmtPrice(f.bear.high)} (${f.horizonDays}d)`,
      probability: pct(f.bear.probability),
    },
    keyFactors: Array.isArray(n.keyFactors) && n.keyFactors.length
      ? n.keyFactors.slice(0, 6)
      : ['Volatility regime', 'Momentum', 'Macro conditions', 'Volume trends'],
  };
}

/** Deterministic commentary used when the API key is missing or Claude fails. */
export function templatedNarrative(ctx: AssetContext, f: QuantForecast): AIAnalysis {
  const dir = ctx.ema50Distance > 0 ? 'above' : 'below';
  return assemble(
    {
      summary:
        `${ctx.name} is trading in a ${ctx.regime} regime with RSI at ${ctx.rsi} and price ${dir} its EMA50 by ` +
        `${Math.abs(ctx.ema50Distance)}%. Annualized volatility of ${f.annualizedVolPct.toFixed(0)}% implies an 80% ` +
        `chance the ${f.horizonDays}-day close lands between ${fmtPrice(f.interval80.low)} and ${fmtPrice(f.interval80.high)}. ` +
        `Key levels to watch are support at ${fmtPrice(f.support)} and resistance at ${fmtPrice(f.resistance)}.`,
      bull: { condition: `A sustained break above ${fmtPrice(f.resistance)} on rising volume` },
      base: { condition: `Price continues to oscillate between ${fmtPrice(f.support)} and ${fmtPrice(f.resistance)}` },
      bear: { condition: `A decisive loss of ${fmtPrice(f.support)} with follow-through selling` },
      keyFactors: ['Volatility regime', 'Momentum', 'Macro conditions', 'Volume trends'],
    },
    f
  );
}

export async function getAIAnalysis(
  slug: string,
  ctx: AssetContext,
  forecast: QuantForecast
): Promise<AIAnalysis> {
  // Cache key includes the prompt version so a prompt change invalidates
  // cleanly instead of serving stale narratives written under the old rules.
  const cacheKey = `ai:narrative:${PROMPT_VERSION}:${slug}`;

  const cached = await getCached<RawNarrative>(cacheKey);
  // Re-assemble on every request: the prose is cached for 7 days but the
  // NUMBERS must stay fresh, since the forecast is recomputed from live prices.
  if (cached) return assemble(cached, forecast);

  // Never pay for a result we cannot keep.
  //
  // Redis is unavailable during `next build`, so getCached returns null and
  // setCached is a no-op. Every one of the 43 prerendered pages therefore called
  // Claude and threw the answer away — 43 calls per deployment, discarded. Two
  // days of frequent deploys cost $1.98 against a projected $0.46 per MONTH, and
  // the arithmetic matches almost exactly: ~15 builds x 43 assets x ~970 tokens.
  //
  // The templated narrative is built from the same model numbers, so a
  // build-time render is accurate — just plainer. The first real request
  // generates the prose properly and caches it for a week.
  if (isBuildPhase()) {
    return templatedNarrative(ctx, forecast);
  }

  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) return templatedNarrative(ctx, forecast);

  const client = new Anthropic({ apiKey });
  const message = await client.messages.create({
    model: 'claude-haiku-4-5-20251001',
    max_tokens: 1024,
    messages: [{ role: 'user', content: buildPrompt(ctx, forecast) }],
  });

  const text = message.content[0].type === 'text' ? message.content[0].text : '';

  let narrative: RawNarrative;
  try {
    const cleaned = text.replace(/```json\n?/g, '').replace(/```\n?/g, '').trim();
    const parsed = JSON.parse(cleaned) as RawNarrative;
    if (!parsed.summary || !parsed.bull?.condition) throw new Error('incomplete narrative');
    narrative = parsed;
  } catch {
    return templatedNarrative(ctx, forecast);
  }

  await setCached(cacheKey, narrative, 604800); // 7 days
  return assemble(narrative, forecast);
}

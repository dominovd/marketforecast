// Technical indicator calculations from price history arrays

export function calcRSI(prices: number[], period = 14): number {
  if (prices.length < period + 1) return 50;
  let gains = 0;
  let losses = 0;
  for (let i = prices.length - period; i < prices.length; i++) {
    const diff = prices[i] - prices[i - 1];
    if (diff >= 0) gains += diff;
    else losses -= diff;
  }
  const avgGain = gains / period;
  const avgLoss = losses / period;
  if (avgLoss === 0) return 100;
  const rs = avgGain / avgLoss;
  return Math.round(100 - 100 / (1 + rs));
}

export function calcEMA(prices: number[], period: number): number {
  if (prices.length < period) return prices[prices.length - 1];
  const k = 2 / (period + 1);
  let ema = prices.slice(0, period).reduce((a, b) => a + b, 0) / period;
  for (let i = period; i < prices.length; i++) {
    ema = prices[i] * k + ema * (1 - k);
  }
  return ema;
}

export function calcMACD(prices: number[]): number {
  const ema12 = calcEMA(prices, 12);
  const ema26 = calcEMA(prices, 26);
  return Math.round((ema12 - ema26) * 100) / 100;
}

export function calcBBPosition(prices: number[], period = 20): number {
  if (prices.length < period) return 0.5;
  const slice = prices.slice(-period);
  const mean = slice.reduce((a, b) => a + b, 0) / period;
  const variance = slice.reduce((a, b) => a + Math.pow(b - mean, 2), 0) / period;
  const std = Math.sqrt(variance);
  const upper = mean + 2 * std;
  const lower = mean - 2 * std;
  const current = prices[prices.length - 1];
  if (upper === lower) return 0.5;
  return Math.round(((current - lower) / (upper - lower)) * 100) / 100;
}

export function calcEMA50Distance(prices: number[]): number {
  const ema50 = calcEMA(prices, 50);
  const current = prices[prices.length - 1];
  return Math.round(((current - ema50) / ema50) * 1000) / 10; // percent, 1dp
}

export function calcATR(highs: number[], lows: number[], closes: number[], period = 14): number {
  if (highs.length < 2) return 0;
  const trs: number[] = [];
  for (let i = 1; i < highs.length; i++) {
    const tr = Math.max(
      highs[i] - lows[i],
      Math.abs(highs[i] - closes[i - 1]),
      Math.abs(lows[i] - closes[i - 1])
    );
    trs.push(tr);
  }
  const slice = trs.slice(-period);
  const atr = slice.reduce((a, b) => a + b, 0) / slice.length;
  return Math.round(atr * 100) / 100;
}

export type Regime = 'uptrend' | 'downtrend' | 'sideways' | 'chaotic';

export function classifyRegime(prices: number[]): Regime {
  if (prices.length < 30) return 'sideways';
  const ema20 = calcEMA(prices, 20);
  const ema50 = calcEMA(prices.length >= 50 ? prices : prices, Math.min(50, prices.length));
  const current = prices[prices.length - 1];
  const rsi = calcRSI(prices);

  // Volatility: ATR as % of price
  const slice = prices.slice(-20);
  const mean = slice.reduce((a, b) => a + b, 0) / slice.length;
  const swings = slice.map((p, i) => i > 0 ? Math.abs(p - slice[i-1]) / slice[i-1] : 0);
  const avgSwing = swings.slice(1).reduce((a, b) => a + b, 0) / (swings.length - 1);

  if (avgSwing > 0.04) return 'chaotic';
  if (current > ema20 && ema20 > ema50 && rsi > 52) return 'uptrend';
  if (current < ema20 && ema20 < ema50 && rsi < 48) return 'downtrend';
  return 'sideways';
}

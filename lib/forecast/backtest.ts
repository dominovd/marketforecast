// Walk-forward backtest for the quant forecast model.
//
// The point of this file is that the accuracy numbers published on /accuracy
// are reproducible from public price history, not asserted. For every eligible
// historical date we rebuild the forecast using ONLY the closes available on
// that date, then score it against what actually happened `horizonDays` later.
//
// No lookahead: buildForecast() receives prices.slice(0, t + 1) and nothing
// past index t. The actual outcome is read at index t + horizonDays, which the
// model never sees.
//
// Scoring philosophy — we forecast a DISTRIBUTION, not a single number, so the
// honest metrics are calibration (does the 80% band contain the truth ~80% of
// the time?) and sharpness (how tight is that band?), plus a proper scoring
// rule (Brier) for the three scenario probabilities. A point-forecast MAPE is
// reported too, but with the caveat that beating a random walk on point error
// at these horizons is close to impossible and is not what the model claims.

import { buildForecast, classifyOutcome, MODEL_VERSION } from './quant';

export interface BacktestMetrics {
  /** Number of scored forecasts. */
  samples: number;
  horizonDays: number;
  /** Share of outcomes that fell inside the 80% interval. Ideal ≈ 0.80. */
  coverage80: number;
  /** Share of outcomes that fell inside the 50% interval. Ideal ≈ 0.50. */
  coverage50: number;
  /** Mean width of the 80% band as % of spot. Lower = sharper, at equal coverage. */
  meanBand80Pct: number;
  /** Multi-class Brier score over {bull, base, bear}. Lower is better, 0–2. */
  brier: number;
  /** Brier of a climatology baseline that always predicts the observed base rates. */
  brierClimatology: number;
  /** Brier skill score vs climatology: 1 = perfect, 0 = no better, <0 = worse. */
  brierSkill: number;
  /** Median absolute % error of the model's median forecast. */
  medianApeModel: number;
  /** Same, for a "price stays flat" random walk. */
  medianApeRandomWalk: number;
  /** Same, for naive momentum: last 30d % change extrapolated forward. */
  medianApeMomentum: number;
  /** Share of scored dates where the actual landed in each scenario. */
  outcomeRates: { bull: number; base: number; bear: number };
  modelVersion: string;
}

export interface BacktestPoint {
  index: number;
  issuedPrice: number;
  actual: number;
  median: number;
  low80: number;
  high80: number;
  inside80: boolean;
  inside50: boolean;
  /** Width of the 80% band as a % of spot — the sharpness term. */
  band80Pct: number;
  outcome: 'bull' | 'base' | 'bear';
  probs: { bull: number; base: number; bear: number };
}

export interface BacktestResult {
  metrics: BacktestMetrics;
  points: BacktestPoint[];
}

function median(xs: number[]): number {
  if (xs.length === 0) return 0;
  const s = [...xs].sort((a, b) => a - b);
  const mid = Math.floor(s.length / 2);
  return s.length % 2 ? s[mid] : (s[mid - 1] + s[mid]) / 2;
}

export interface BacktestOptions {
  horizonDays?: number;
  /** Minimum history required before the first forecast is issued. */
  warmup?: number;
  /** Issue a forecast every N days. 1 = every day (overlapping windows). */
  step?: number;
  driftShrink?: number;
  /** Passed through to the model — used by the calibration sweep. */
  dof?: number;
  /** Passed through to the model — used by the calibration sweep. */
  volInflation?: number;
}

/**
 * Run the walk-forward backtest over a daily close series (oldest → newest).
 *
 * Note on overlapping windows: with step=1 consecutive forecasts share most of
 * their horizon, so the scored samples are autocorrelated and the effective
 * sample size is far below `samples`. That inflates apparent precision, not the
 * metrics themselves. We default to step=5 to cut the overlap down.
 */
export function runBacktest(prices: number[], opts: BacktestOptions = {}): BacktestResult {
  const horizonDays = opts.horizonDays ?? 30;
  const warmup = opts.warmup ?? 60;
  const step = opts.step ?? 5;

  const points: BacktestPoint[] = [];

  for (let t = warmup; t + horizonDays < prices.length; t += step) {
    // Strictly past data only.
    const window = prices.slice(0, t + 1);
    const f = buildForecast(window, {
      horizonDays,
      driftShrink: opts.driftShrink,
      dof: opts.dof,
      volInflation: opts.volInflation,
    });
    if (!f) continue;

    const actual = prices[t + horizonDays];
    if (!isFinite(actual) || actual <= 0) continue;

    points.push({
      index: t,
      issuedPrice: f.issuedPrice,
      actual,
      median: f.median,
      low80: f.interval80.low,
      high80: f.interval80.high,
      inside80: actual >= f.interval80.low && actual <= f.interval80.high,
      inside50: actual >= f.interval50.low && actual <= f.interval50.high,
      band80Pct: ((f.interval80.high - f.interval80.low) / f.issuedPrice) * 100,
      outcome: classifyOutcome(f, actual),
      probs: {
        bull: f.bull.probability,
        base: f.base.probability,
        bear: f.bear.probability,
      },
    });
  }

  const n = points.length;
  if (n === 0) {
    return {
      metrics: {
        samples: 0, horizonDays,
        coverage80: 0, coverage50: 0, meanBand80Pct: 0,
        brier: 0, brierClimatology: 0, brierSkill: 0,
        medianApeModel: 0, medianApeRandomWalk: 0, medianApeMomentum: 0,
        outcomeRates: { bull: 0, base: 0, bear: 0 },
        modelVersion: MODEL_VERSION,
      },
      points: [],
    };
  }

  const outcomeCount = { bull: 0, base: 0, bear: 0 };
  for (const p of points) outcomeCount[p.outcome]++;
  const rates = {
    bull: outcomeCount.bull / n,
    base: outcomeCount.base / n,
    bear: outcomeCount.bear / n,
  };

  // Multi-class Brier: mean over samples of Σ_k (forecast_k − outcome_k)².
  let brier = 0;
  let brierClim = 0;
  for (const p of points) {
    for (const k of ['bull', 'base', 'bear'] as const) {
      const o = p.outcome === k ? 1 : 0;
      brier += (p.probs[k] - o) ** 2;
      brierClim += (rates[k] - o) ** 2;
    }
  }
  brier /= n;
  brierClim /= n;

  const apeModel: number[] = [];
  const apeRW: number[] = [];
  const apeMom: number[] = [];
  for (const p of points) {
    apeModel.push(Math.abs(p.median - p.actual) / p.actual * 100);
    apeRW.push(Math.abs(p.issuedPrice - p.actual) / p.actual * 100);
    // Naive momentum: whatever the trailing 30d return was, assume it repeats.
    const i0 = Math.max(0, p.index - 30);
    const trailing = prices[p.index] / prices[i0];
    const momForecast = p.issuedPrice * trailing;
    apeMom.push(Math.abs(momForecast - p.actual) / p.actual * 100);
  }

  return {
    metrics: {
      samples: n,
      horizonDays,
      coverage80: points.filter(p => p.inside80).length / n,
      coverage50: points.filter(p => p.inside50).length / n,
      meanBand80Pct: points.reduce((a, p) => a + p.band80Pct, 0) / n,
      brier,
      brierClimatology: brierClim,
      brierSkill: brierClim > 0 ? 1 - brier / brierClim : 0,
      medianApeModel: median(apeModel),
      medianApeRandomWalk: median(apeRW),
      medianApeMomentum: median(apeMom),
      outcomeRates: rates,
      modelVersion: MODEL_VERSION,
    },
    points,
  };
}

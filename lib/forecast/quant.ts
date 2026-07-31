// Quantitative forecast model.
//
// This module produces the NUMBERS behind every scenario on the site. The LLM
// no longer invents price targets or probabilities — it only writes prose
// around the output of this file. That split matters because an LLM cannot
// produce calibrated probabilities, whereas this model can be backtested over
// years of history in milliseconds (see ./backtest.ts).
//
// Model, in one paragraph:
//   Daily log returns → EWMA volatility (RiskMetrics λ=0.94) → scale to the
//   forecast horizon by √h → assume a standardized Student-t(ν=4) shape for
//   the horizon return (fat tails; a normal badly under-prices crypto tail
//   moves) → read scenario boundaries off that distribution, and read scenario
//   PROBABILITIES off the same distribution evaluated at real technical levels
//   (recent swing high / swing low).
//
// Drift is deliberately near-zero. Short-horizon drift estimated from a
// trailing sample is dominated by noise, and a zero-drift random walk is a
// notoriously hard benchmark to beat. We allow a small shrunk momentum tilt
// (DRIFT_SHRINK) and the backtest reports whether it actually helps, rather
// than assuming it does.

export interface ForecastScenario {
  /** Lower bound of the price range, in quote currency. */
  low: number;
  /** Upper bound of the price range. */
  high: number;
  /** Model probability that the horizon close lands in this scenario, 0–1. */
  probability: number;
}

export interface QuantForecast {
  /** Price at the moment the forecast was issued. */
  issuedPrice: number;
  /** Forecast horizon in calendar days. */
  horizonDays: number;
  /** Median (50th percentile) horizon price. */
  median: number;
  /** Annualized volatility implied by the EWMA daily estimate, as a percent. */
  annualizedVolPct: number;
  /** Std-dev of the horizon log return (σ_daily · √h). */
  horizonSigma: number;
  /** Technical level above spot that separates "base" from "bull". */
  resistance: number;
  /** Technical level below spot that separates "base" from "bear". */
  support: number;
  bull: ForecastScenario;
  base: ForecastScenario;
  bear: ForecastScenario;
  /** 80% central prediction interval — the band drawn as the forecast cone. */
  interval80: { low: number; high: number };
  /** 50% central prediction interval — the inner, darker cone band. */
  interval50: { low: number; high: number };
  /** Identifies the exact model logic that produced this row. Bump on change. */
  modelVersion: string;
}

// Bump whenever the math below changes, so historical ledger rows stay
// attributable to the model that actually generated them.
export const MODEL_VERSION = 'quant-v1';

const EWMA_LAMBDA = 0.94;   // RiskMetrics standard
const DRIFT_SHRINK = 0.15;  // how much trailing drift we trust, 0 = pure random walk
const LEVEL_LOOKBACK = 60;  // days of history used for swing high/low

// Shape of the HORIZON return distribution.
//
// Daily crypto returns are strongly fat-tailed (ν≈4 territory), but we forecast
// the 30-day aggregate, and summing 30 draws pulls the distribution back toward
// normal by the CLT. Using ν=4 at the horizon was measurably wrong: it produces
// a distribution that is fat in the tails but NARROW IN THE SHOULDERS at equal
// variance, which under-covered the 80% band (0.71 observed vs 0.80 nominal on
// synthetic random-walk data). ν=8 keeps a mild tail premium while restoring
// shoulder width.
const T_DOF = 8;

// Variance inflation for estimation error and volatility-of-volatility.
// σ is estimated from a finite trailing sample and volatility itself moves;
// both make a naive band too tight.
//
// Calibrated by scripts/calibrate-forecast.ts against a GARCH(1,1)+jump process
// (volatility clustering and fat tails — what crypto actually looks like).
// Measured coverage at ν=8, inflation=1.10: 80.7% for the nominal-80% band and
// 50.4% for the nominal-50% band, i.e. calibrated to within half a point on
// both. Raising inflation to 1.20 overshoots to 84.0%/54.3%.
const VOL_INFLATION = 1.10;

// ---------------------------------------------------------------------------
// Distribution helpers — Student-t CDF / quantile, standardized to unit variance
// ---------------------------------------------------------------------------

function logGamma(x: number): number {
  // Lanczos approximation
  const c = [
    76.18009172947146, -86.50532032941677, 24.01409824083091,
    -1.231739572450155, 0.1208650973866179e-2, -0.5395239384953e-5,
  ];
  let y = x;
  let tmp = x + 5.5;
  tmp -= (x + 0.5) * Math.log(tmp);
  let ser = 1.000000000190015;
  for (let j = 0; j < 6; j++) ser += c[j] / ++y;
  return -tmp + Math.log((2.5066282746310005 * ser) / x);
}

/** Continued-fraction expansion for the incomplete beta function. */
function betacf(a: number, b: number, x: number): number {
  const MAXIT = 200;
  const EPS = 3e-14;
  const FPMIN = 1e-300;
  const qab = a + b;
  const qap = a + 1;
  const qam = a - 1;
  let c = 1;
  let d = 1 - (qab * x) / qap;
  if (Math.abs(d) < FPMIN) d = FPMIN;
  d = 1 / d;
  let h = d;
  for (let m = 1; m <= MAXIT; m++) {
    const m2 = 2 * m;
    let aa = (m * (b - m) * x) / ((qam + m2) * (a + m2));
    d = 1 + aa * d;
    if (Math.abs(d) < FPMIN) d = FPMIN;
    c = 1 + aa / c;
    if (Math.abs(c) < FPMIN) c = FPMIN;
    d = 1 / d;
    h *= d * c;
    aa = (-(a + m) * (qab + m) * x) / ((a + m2) * (qap + m2));
    d = 1 + aa * d;
    if (Math.abs(d) < FPMIN) d = FPMIN;
    c = 1 + aa / c;
    if (Math.abs(c) < FPMIN) c = FPMIN;
    d = 1 / d;
    const del = d * c;
    h *= del;
    if (Math.abs(del - 1) < EPS) break;
  }
  return h;
}

/** Regularized incomplete beta I_x(a,b). */
function incompleteBeta(a: number, b: number, x: number): number {
  if (x <= 0) return 0;
  if (x >= 1) return 1;
  const bt = Math.exp(
    logGamma(a + b) - logGamma(a) - logGamma(b) + a * Math.log(x) + b * Math.log(1 - x)
  );
  if (x < (a + 1) / (a + b + 2)) return (bt * betacf(a, b, x)) / a;
  return 1 - (bt * betacf(b, a, 1 - x)) / b;
}

/** CDF of Student-t with `df` degrees of freedom. */
function studentTCdf(t: number, df: number): number {
  const x = df / (df + t * t);
  const p = 0.5 * incompleteBeta(df / 2, 0.5, x);
  return t > 0 ? 1 - p : p;
}

/**
 * CDF of a Student-t rescaled to unit variance. A raw t(ν) has variance
 * ν/(ν−2), so we stretch the input by the inverse of that factor. This lets us
 * treat σ as a genuine standard deviation while keeping t's fat tails.
 */
function stdTCdf(z: number, df = T_DOF): number {
  const scale = Math.sqrt(df / (df - 2));
  return studentTCdf(z * scale, df);
}

/** Inverse of stdTCdf, by bisection. Robust and fast enough at our volumes. */
function stdTQuantile(p: number, df = T_DOF): number {
  if (p <= 0) return -Infinity;
  if (p >= 1) return Infinity;
  let lo = -40;
  let hi = 40;
  for (let i = 0; i < 200; i++) {
    const mid = (lo + hi) / 2;
    if (stdTCdf(mid, df) < p) lo = mid;
    else hi = mid;
  }
  return (lo + hi) / 2;
}

// ---------------------------------------------------------------------------
// Volatility & levels
// ---------------------------------------------------------------------------

export function logReturns(prices: number[]): number[] {
  const out: number[] = [];
  for (let i = 1; i < prices.length; i++) {
    if (prices[i - 1] > 0 && prices[i] > 0) out.push(Math.log(prices[i] / prices[i - 1]));
  }
  return out;
}

/**
 * EWMA volatility of daily log returns (RiskMetrics). Recent moves get more
 * weight than a flat trailing window, so the model reacts to volatility
 * regime changes instead of averaging them away.
 */
export function ewmaVol(returns: number[], lambda = EWMA_LAMBDA): number {
  if (returns.length < 2) return 0;
  // Seed with the sample variance of the first chunk, then update forward.
  const seedLen = Math.min(20, returns.length);
  const seed = returns.slice(0, seedLen);
  const seedMean = seed.reduce((a, b) => a + b, 0) / seedLen;
  let variance = seed.reduce((a, r) => a + (r - seedMean) ** 2, 0) / seedLen;
  for (let i = seedLen; i < returns.length; i++) {
    variance = lambda * variance + (1 - lambda) * returns[i] ** 2;
  }
  return Math.sqrt(Math.max(variance, 0));
}

/**
 * Swing high / swing low over the lookback, forced to sit strictly outside the
 * current price. If spot is at an all-time high the raw "resistance" would be
 * below spot, which would make the bull probability nonsense; in that case we
 * fall back to a volatility-scaled level.
 */
export function keyLevels(
  prices: number[],
  horizonSigma: number,
  lookback = LEVEL_LOOKBACK
): { support: number; resistance: number } {
  const spot = prices[prices.length - 1];
  const window = prices.slice(-Math.min(lookback, prices.length));
  const rawHigh = Math.max(...window);
  const rawLow = Math.min(...window);

  // Minimum separation: half a horizon-sigma move. Prevents degenerate levels
  // sitting a fraction of a percent away from spot in very quiet markets.
  const minGap = Math.max(0.5 * horizonSigma, 0.02);
  const floorResistance = spot * Math.exp(minGap);
  const ceilSupport = spot * Math.exp(-minGap);

  return {
    resistance: Math.max(rawHigh, floorResistance),
    support: Math.min(rawLow, ceilSupport),
  };
}

// ---------------------------------------------------------------------------
// The forecast
// ---------------------------------------------------------------------------

export interface ForecastOptions {
  /** Forecast horizon in days. Default 30. */
  horizonDays?: number;
  /** Override drift shrinkage — 0 forces a pure random walk. Used by backtest. */
  driftShrink?: number;
  /** Override Student-t degrees of freedom. Used by the calibration harness. */
  dof?: number;
  /** Override the variance inflation factor. Used by the calibration harness. */
  volInflation?: number;
}

/**
 * Build a distributional forecast from a daily close series (oldest → newest).
 *
 * Returns null when there is not enough history to estimate volatility, so
 * callers can fall back rather than publish a garbage forecast.
 */
export function buildForecast(
  prices: number[],
  opts: ForecastOptions = {}
): QuantForecast | null {
  const horizonDays = opts.horizonDays ?? 30;
  const driftShrink = opts.driftShrink ?? DRIFT_SHRINK;
  const dof = opts.dof ?? T_DOF;
  const inflation = opts.volInflation ?? VOL_INFLATION;

  if (prices.length < 40) return null;
  const spot = prices[prices.length - 1];
  if (!isFinite(spot) || spot <= 0) return null;

  const rets = logReturns(prices);
  if (rets.length < 30) return null;

  const sigmaDaily = ewmaVol(rets) * inflation;
  if (!isFinite(sigmaDaily) || sigmaDaily <= 0) return null;

  // Trailing mean log return, heavily shrunk. Full-strength momentum
  // extrapolation is what makes naive models blow up after a big run.
  const rawDrift = rets.reduce((a, b) => a + b, 0) / rets.length;
  const driftDaily = rawDrift * driftShrink;

  const horizonSigma = sigmaDaily * Math.sqrt(horizonDays);
  const horizonDrift = driftDaily * horizonDays;

  // Price at a given probability level of the horizon distribution.
  const priceAtQuantile = (p: number) =>
    spot * Math.exp(horizonDrift + horizonSigma * stdTQuantile(p, dof));

  // Probability that the horizon close ends up ABOVE a given price level.
  const probAbove = (level: number) => {
    const z = (Math.log(level / spot) - horizonDrift) / horizonSigma;
    return 1 - stdTCdf(z, dof);
  };

  const { support, resistance } = keyLevels(prices, horizonSigma);

  const pBull = probAbove(resistance);
  const pBear = 1 - probAbove(support);
  const pBase = Math.max(0, 1 - pBull - pBear);

  return {
    issuedPrice: spot,
    horizonDays,
    median: priceAtQuantile(0.5),
    annualizedVolPct: sigmaDaily * Math.sqrt(365) * 100,
    horizonSigma,
    resistance,
    support,
    // Bull: from resistance up to the 95th percentile.
    bull: { low: resistance, high: Math.max(resistance, priceAtQuantile(0.95)), probability: pBull },
    // Base: the corridor between the two technical levels.
    base: { low: support, high: resistance, probability: pBase },
    // Bear: from the 5th percentile up to support.
    bear: { low: Math.min(support, priceAtQuantile(0.05)), high: support, probability: pBear },
    interval80: { low: priceAtQuantile(0.1), high: priceAtQuantile(0.9) },
    interval50: { low: priceAtQuantile(0.25), high: priceAtQuantile(0.75) },
    modelVersion: MODEL_VERSION,
  };
}

/** Which scenario did the actual price land in? Used by the resolver. */
export function classifyOutcome(
  f: Pick<QuantForecast, 'support' | 'resistance'>,
  actual: number
): 'bull' | 'base' | 'bear' {
  if (actual > f.resistance) return 'bull';
  if (actual < f.support) return 'bear';
  return 'base';
}

/**
 * Calibration harness for the quant forecast model.
 *
 *   npx tsx scripts/calibrate-forecast.ts
 *
 * Why this exists: the constants T_DOF and VOL_INFLATION in lib/forecast/quant.ts
 * are not guesses — they are picked so that the model's stated confidence bands
 * actually contain the truth as often as they claim. This script is what picks
 * them, and re-running it is how you check that a change to the model did not
 * quietly break calibration.
 *
 * Test bed: a GARCH(1,1) process with occasional jump innovations. Constant-vol
 * GBM is too easy — it has none of the volatility clustering or fat tails that
 * make real crypto forecasting hard, and a model tuned on GBM will be
 * over-confident in the real world. We also run plain GBM as a sanity check
 * that the distribution math itself is correct (with ν→∞ and no inflation,
 * coverage on GBM must land on the nominal level).
 *
 * A note on what "good" means here. We are forecasting a DISTRIBUTION, not a
 * single number. The right scoring is:
 *   - calibration: does the 80% band contain the outcome ~80% of the time?
 *   - sharpness:   subject to that, how narrow is the band?
 *   - proper score: Brier, against a climatology baseline.
 * Point-forecast error (APE) is reported for context, but beating a random walk
 * on point error at a 30-day horizon is not something this model claims to do,
 * and any model that claims it should be treated with suspicion.
 */

import { runBacktest, type BacktestOptions } from '../lib/forecast/backtest';

// Deterministic RNG so calibration runs are reproducible across machines.
function mkRng(seed: number): () => number {
  let s = seed >>> 0;
  return () => {
    s = (1664525 * s + 1013904223) >>> 0;
    return s / 4294967296;
  };
}

function normal(rnd: () => number): number {
  const u1 = Math.max(rnd(), 1e-12);
  const u2 = rnd();
  return Math.sqrt(-2 * Math.log(u1)) * Math.cos(2 * Math.PI * u2);
}

/** Constant-volatility geometric Brownian motion — the "easy world" sanity check. */
export function gbm(n: number, sigma: number, seed: number): number[] {
  const rnd = mkRng(seed);
  const p = [100];
  for (let i = 1; i < n; i++) p.push(p[i - 1] * Math.exp(sigma * normal(rnd)));
  return p;
}

/**
 * GARCH(1,1) with jump innovations — volatility clusters, tails are fat.
 * The variance is capped at 25× its long-run level purely to keep the
 * simulation numerically finite; without it a jump can send the recursion to
 * infinity and the whole sweep becomes meaningless.
 */
export function garchJumps(n: number, seed: number, drift = 0): number[] {
  const rnd = mkRng(seed);
  const omega = 0.000008, alpha = 0.08, beta = 0.90;
  const vLongRun = omega / (1 - alpha - beta);
  let v = vLongRun;
  const p = [100];
  for (let i = 1; i < n; i++) {
    let z = normal(rnd);
    if (rnd() < 0.02) z *= 3.0;              // ~2% of days are shocks
    const r = drift + Math.sqrt(v) * z;
    v = Math.min(omega + alpha * r * r + beta * v, vLongRun * 25);
    p.push(p[i - 1] * Math.exp(r));
  }
  return p;
}

interface Agg {
  n: number; cov80: number; cov50: number; band80: number;
  brier: number; climatology: number;
  apeModel: number; apeRandomWalk: number; apeMomentum: number;
}

function aggregate(gen: (n: number, seed: number) => number[], opts: BacktestOptions, runs = 60): Agg {
  let n = 0, cov80 = 0, cov50 = 0, band = 0, brier = 0, clim = 0;
  let apeM = 0, apeR = 0, apeMom = 0;
  for (let s = 1; s <= runs; s++) {
    const m = runBacktest(gen(900, s * 7919), { horizonDays: 30, step: 5, ...opts }).metrics;
    const w = m.samples;
    n += w;
    cov80 += m.coverage80 * w;
    cov50 += m.coverage50 * w;
    band += m.meanBand80Pct * w;
    brier += m.brier * w;
    clim += m.brierClimatology * w;
    apeM += m.medianApeModel * w;
    apeR += m.medianApeRandomWalk * w;
    apeMom += m.medianApeMomentum * w;
  }
  return {
    n, cov80: cov80 / n, cov50: cov50 / n, band80: band / n,
    brier: brier / n, climatology: clim / n,
    apeModel: apeM / n, apeRandomWalk: apeR / n, apeMomentum: apeMom / n,
  };
}

function pct(x: number): string { return (x * 100).toFixed(1) + '%'; }

function main() {
  console.log('=== 1. Distribution math check on constant-vol GBM ===');
  console.log('With ν→∞ (normal) and no inflation, coverage must hit the nominal level.\n');
  for (const dof of [4, 8, 50]) {
    const r = aggregate((n, s) => gbm(n, 0.02, s), { driftShrink: 0, dof, volInflation: 1.0 });
    console.log(`  ν=${String(dof).padStart(2)}  cov80=${pct(r.cov80)} (nom 80.0%)  cov50=${pct(r.cov50)} (nom 50.0%)`);
  }

  console.log('\n=== 2. Calibration sweep on GARCH + jumps (the realistic case) ===\n');
  for (const dof of [4, 8, 50]) {
    for (const infl of [1.0, 1.1, 1.2]) {
      const r = aggregate(garchJumps, { driftShrink: 0, dof, volInflation: infl });
      console.log(
        `  ν=${String(dof).padStart(2)} infl=${infl.toFixed(2)}  ` +
        `cov80=${pct(r.cov80)}  cov50=${pct(r.cov50)}  band80=${r.band80.toFixed(1)}%`
      );
    }
  }

  console.log('\n=== 3. Shipping config (defaults from quant.ts) ===\n');
  const d = aggregate(garchJumps, {});
  console.log(`  samples           : ${d.n}`);
  console.log(`  coverage 80% band : ${pct(d.cov80)}   (nominal 80.0%)`);
  console.log(`  coverage 50% band : ${pct(d.cov50)}   (nominal 50.0%)`);
  console.log(`  Brier             : ${d.brier.toFixed(4)}  vs climatology ${d.climatology.toFixed(4)}`);
  console.log(`  median APE model  : ${d.apeModel.toFixed(2)}%`);
  console.log(`  median APE rand.w.: ${d.apeRandomWalk.toFixed(2)}%   <- we should MATCH, not beat, this`);
  console.log(`  median APE moment.: ${d.apeMomentum.toFixed(2)}%   <- naive trend extrapolation`);

  console.log('\n=== 4. Is the shrunk drift term safe? ===');
  console.log('Synthetic series have zero true drift, so drift can only hurt here.');
  console.log('This bounds the downside; the upside must be judged on live data.\n');
  for (const ds of [0, 0.15, 0.5, 1.0]) {
    const r = aggregate(garchJumps, { driftShrink: ds });
    console.log(`  driftShrink=${ds.toFixed(2)}  cov80=${pct(r.cov80)}  medAPE=${r.apeModel.toFixed(2)}%`);
  }
}

main();

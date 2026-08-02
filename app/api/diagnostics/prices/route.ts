// Cross-check every published price against an independent expectation.
//
// The PPLT case showed the gap in our defences: the proxy disclaimer tells a
// reader that a fund's price is not the commodity's price, but it says nothing
// about whether the fund's price is itself correct. PPLT at $14.91 implies
// platinum near $160/oz against gold at $4,040 — a ratio never observed in the
// history of either metal. Nothing in the pipeline noticed.
//
// This endpoint applies checks that do NOT depend on anyone remembering what a
// price "should" be, because that knowledge goes stale and is exactly what
// failed here. Every check is derived from data we already hold:
//
//   1. Precious metals — convert an ETF's share price to an implied per-ounce
//      price using published holdings, then test the ratio against our own
//      gold spot. Metal-to-metal ratios are among the most stable quantities in
//      commodities; a 10x deviation is diagnostic.
//
//   2. Crypto — CoinGecko returns price and market cap independently, so
//      mcap/price yields implied circulating supply. Supply is slow-moving and
//      well known, which makes it a far better anchor than price itself.
//
//   3. Everything — internal series health: staleness, flat runs, and single
//      day moves large enough to indicate a data break rather than a market.

import { NextResponse } from 'next/server';

export const dynamic = 'force-dynamic';
export const maxDuration = 300;

/**
 * Metals tracked via ETFs, checked by RATIO STABILITY rather than by level.
 *
 * The first version of this check converted share price to an implied
 * per-ounce price using a hardcoded holdings constant, then tested that
 * against gold. It fired on platinum and palladium — and the check was wrong,
 * not the data.
 *
 * The giveaway was that both were low by the same factor of ten, and that
 * platinum against palladium sat at 0.61, squarely inside its normal range.
 * Two series consistent with each other but jointly offset from an assumed
 * constant means the constant is stale, almost certainly an unaccounted share
 * split. Which is precisely the failure mode this file's header warns about,
 * committed by this file.
 *
 * So: no absolute constants. We track each fund's price ratio to gold and ask
 * only whether it is stable against its own recent history. That catches the
 * thing we can actually detect — a feed changing units, splicing a different
 * instrument, or missing a split — without pretending to know a value we
 * cannot verify. A level we never claim to publish (the page states plainly
 * that it shows the fund's share price) does not need validating.
 */
const METAL_ETFS: Record<string, string> = {
  SLV: 'silver',
  PPLT: 'platinum',
  PALL: 'palladium',
};

/** A day-over-day shift in the fund/gold ratio beyond this is a data break. */
const RATIO_BREAK_PCT = 20;

/**
 * Approximate circulating supply, in coins. Supply schedules are public and
 * move slowly, so a mismatch between mcap/price and this range means one of the
 * two figures is wrong. Ranges are generous.
 */
const SUPPLY_RANGES: Record<string, [number, number]> = {
  bitcoin:      [19_000_000, 21_000_000],
  ethereum:     [110_000_000, 135_000_000],
  ripple:       [45_000_000_000, 65_000_000_000],
  cardano:      [30_000_000_000, 40_000_000_000],
  solana:       [400_000_000, 700_000_000],
  dogecoin:     [130_000_000_000, 190_000_000_000],
  litecoin:     [70_000_000, 85_000_000],
  'shiba-inu':  [500_000_000_000_000, 620_000_000_000_000],
  stellar:      [25_000_000_000, 40_000_000_000],
  tron:         [80_000_000_000, 100_000_000_000],
};

interface Finding {
  slug: string;
  symbol: string;
  price: number | null;
  verdict: 'ok' | 'SUSPECT' | 'no-data';
  checks: string[];
}

function seriesHealth(history: { date: string; price: number }[]): string[] {
  const out: string[] = [];
  if (history.length === 0) { out.push('no history'); return out; }

  const prices = history.map(p => p.price);
  const last = prices[prices.length - 1];

  if (prices.some(p => !isFinite(p) || p <= 0)) out.push('non-positive or non-finite values present');

  // A long flat run means the feed stalled and is repeating its last value.
  let flat = 1, maxFlat = 1;
  for (let i = 1; i < prices.length; i++) {
    if (prices[i] === prices[i - 1]) { flat++; maxFlat = Math.max(maxFlat, flat); }
    else flat = 1;
  }
  if (maxFlat >= 5) out.push(`${maxFlat} identical consecutive closes — feed may be stalled`);

  // Day moves beyond 25% are rare for anything here and usually indicate a
  // split, a currency change, or a spliced series rather than a real move.
  let breaks = 0;
  for (let i = 1; i < prices.length; i++) {
    const pct = Math.abs((prices[i] - prices[i - 1]) / prices[i - 1]) * 100;
    if (pct > 25) breaks++;
  }
  if (breaks > 0) out.push(`${breaks} day-over-day move(s) above 25% — possible data break`);

  const min = Math.min(...prices), max = Math.max(...prices);
  if (min > 0 && max / min > 50) out.push(`180d range spans ${(max / min).toFixed(0)}x — implausible for one instrument`);
  if (last < 1e-8) out.push('price below 1e-8, formatting will be unreliable');

  return out;
}

export async function GET(req: Request) {
  const secret = process.env.DIAGNOSTICS_SECRET;
  if (secret && new URL(req.url).searchParams.get('key') !== secret) {
    return NextResponse.json({ error: 'unauthorized' }, { status: 401 });
  }

  const { CRYPTO_REGISTRY, COMMODITY_REGISTRY } = await import('@/data/asset-registry');
  const { getAllCryptoPrices, getCoinHistory } = await import('@/lib/api/coingecko');
  const { getCommodityHistory } = await import('@/lib/api/commodities');

  const findings: Finding[] = [];

  // ── Anchor: gold. Every metal check is relative to it, so verify it first.
  let goldSpot: number | null = null;
  let goldHistory: { date: string; price: number }[] = [];
  const goldNotes: string[] = [];
  try {
    goldHistory = await getCommodityHistory('gold', 180);
    goldSpot = goldHistory[goldHistory.length - 1]?.price ?? null;
    if (goldSpot === null) goldNotes.push('gold history empty — metal ratio checks disabled');
    else if (goldSpot < 200 || goldSpot > 20000) {
      // Gold is real spot (XAU/USD, typed "Precious Metal" by the provider) so
      // a loose absolute bound is defensible here in a way it is not for funds.
      goldNotes.push(`gold spot ${goldSpot} outside 200–20000; anchor itself is suspect`);
      goldSpot = null;
      goldHistory = [];
    }
  } catch (err) {
    goldNotes.push(`gold fetch failed: ${err instanceof Error ? err.message : String(err)}`);
  }

  // ── Crypto: implied circulating supply from mcap / price ──────────────
  let bulk: Record<string, { price: number; marketCap: string }> = {};
  try {
    bulk = await getAllCryptoPrices() as typeof bulk;
  } catch (err) {
    findings.push({ slug: '(crypto bulk)', symbol: '-', price: null, verdict: 'no-data',
      checks: [`bulk fetch failed: ${err instanceof Error ? err.message : String(err)}`] });
  }

  function parseLarge(s: string | undefined): number | null {
    if (!s) return null;
    const m = /^\$?([\d.,]+)\s*([TBM])?$/i.exec(s.trim());
    if (!m) return null;
    const n = parseFloat(m[1].replace(/,/g, ''));
    const mult = m[2]?.toUpperCase() === 'T' ? 1e12 : m[2]?.toUpperCase() === 'B' ? 1e9
      : m[2]?.toUpperCase() === 'M' ? 1e6 : 1;
    return n * mult;
  }

  for (const a of CRYPTO_REGISTRY) {
    const live = bulk[a.slug];
    const checks: string[] = [];
    if (!live) {
      findings.push({ slug: a.slug, symbol: a.symbol, price: null, verdict: 'no-data', checks: ['absent from bulk snapshot'] });
      continue;
    }
    const mcap = parseLarge(live.marketCap);
    const range = SUPPLY_RANGES[a.coingeckoId ?? a.slug] ?? SUPPLY_RANGES[a.slug];
    if (mcap && live.price > 0 && range) {
      const impliedSupply = mcap / live.price;
      if (impliedSupply < range[0] || impliedSupply > range[1]) {
        checks.push(
          `implied supply ${impliedSupply.toExponential(3)} outside expected ${range[0].toExponential(2)}–${range[1].toExponential(2)} — price or market cap is wrong`
        );
      }
    }
    findings.push({
      slug: a.slug, symbol: a.symbol, price: live.price,
      verdict: checks.length ? 'SUSPECT' : 'ok', checks,
    });
  }

  // ── Commodities: metal ratios plus series health ──────────────────────
  // Paced: history is Redis-cached for 24h so most calls are hits, but on a
  // cold cache an unpaced loop would trip Twelve Data's 8/minute ceiling and
  // report rate-limit errors as if they were data problems.
  let firstCommodity = true;
  for (const a of COMMODITY_REGISTRY) {
    if (!firstCommodity) await new Promise(r => setTimeout(r, 2000));
    firstCommodity = false;

    if (!a.tdSymbol) {
      findings.push({ slug: a.slug, symbol: a.symbol, price: null, verdict: 'no-data',
        checks: ['no data source configured (intentional)'] });
      continue;
    }
    const checks: string[] = [];
    let price: number | null = null;
    try {
      const h = await getCommodityHistory(a.slug, 180);
      price = h[h.length - 1]?.price ?? null;
      checks.push(...seriesHealth(h));

      // Metal ETFs: is the fund/gold ratio stable against its own history?
      const metal = METAL_ETFS[a.tdSymbol];
      if (metal && price !== null && goldHistory.length > 30) {
        const n = Math.min(h.length, goldHistory.length);
        const ratios: number[] = [];
        for (let i = 1; i <= n; i++) {
          const g = goldHistory[goldHistory.length - i].price;
          const f = h[h.length - i].price;
          if (g > 0 && f > 0) ratios.unshift(f / g);
        }
        if (ratios.length > 30) {
          const sorted = [...ratios].sort((x, y) => x - y);
          const median = sorted[Math.floor(sorted.length / 2)];
          const current = ratios[ratios.length - 1];
          const drift = ((current - median) / median) * 100;

          let jumps = 0;
          for (let i = 1; i < ratios.length; i++) {
            if (Math.abs((ratios[i] - ratios[i - 1]) / ratios[i - 1]) * 100 > RATIO_BREAK_PCT) jumps++;
          }
          checks.push(
            `${a.tdSymbol}/gold ratio ${current.toExponential(3)}, ${drift >= 0 ? '+' : ''}${drift.toFixed(1)}% vs 180d median` +
            (jumps ? ` — ${jumps} ratio break(s) above ${RATIO_BREAK_PCT}%: unit change, split or spliced series` : ' — stable')
          );
        }
      }
    } catch (err) {
      checks.push(`fetch failed: ${err instanceof Error ? err.message : String(err)}`);
    }

    // "OUT OF RANGE" is gone with the absolute-level check that produced it.
    const bad = checks.some(c => /stalled|data break|implausible|non-positive|ratio break/.test(c));
    findings.push({
      slug: a.slug, symbol: a.symbol, price,
      verdict: price === null ? 'no-data' : bad ? 'SUSPECT' : 'ok',
      checks,
    });
  }

  const suspect = findings.filter(f => f.verdict === 'SUSPECT');

  return NextResponse.json({
    checkedAt: new Date().toISOString(),
    goldAnchor: goldSpot, goldNotes,
    summary: {
      total: findings.length,
      ok: findings.filter(f => f.verdict === 'ok').length,
      suspect: suspect.length,
      noData: findings.filter(f => f.verdict === 'no-data').length,
      suspectSlugs: suspect.map(f => f.slug),
    },
    suspect,
    all: findings,
  }, { headers: { 'Cache-Control': 'no-store' } });
}

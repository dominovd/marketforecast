// Daily ledger job: record today's forecasts, then resolve matured ones.
//
// Recording happens HERE rather than during page rendering, deliberately:
//   - exactly one forecast per asset per day, regardless of traffic
//   - page renders stay independent of database availability
//   - a page that nobody visits still gets its forecast logged, so the track
//     record is not biased toward popular assets
//
// Safe to retry. Recording is protected by a unique index on
// (slug, horizon_days, issued_date) and resolution by a primary key on
// prediction_id, so a second run in the same day writes nothing.

import { NextResponse } from 'next/server';
import { CRYPTO_REGISTRY, COMMODITY_REGISTRY } from '@/data/asset-registry';
import { getCoinPriceCached, getCoinHistory } from '@/lib/api/coingecko';
import { getCommodityPriceResilient, getCommodityHistory } from '@/lib/api/commodities';
import { buildForecast } from '@/lib/forecast/quant';
import {
  calcRSI, calcMACD, calcBBPosition, calcEMA50Distance, calcATR, classifyRegime,
} from '@/lib/indicators';
import {
  recordPrediction, getMaturedPredictions, scorePrediction, recordResolutions,
  ledgerConfigured,
} from '@/lib/db/ledger';
import { PROMPT_VERSION } from '@/lib/ai/analysis';

export const dynamic = 'force-dynamic';
export const maxDuration = 300;

// Twelve Data allows 8 requests/minute on the free tier, so commodity work is
// paced. CoinGecko is fine because history is Redis-cached for 24h and prices
// come from one shared bulk call.
const COMMODITY_GAP_MS = 8000;

function authorized(req: Request): boolean {
  const secret = process.env.CRON_SECRET;
  if (!secret) return true; // not configured — allow, nothing destructive here
  const header = req.headers.get('authorization');
  if (header === `Bearer ${secret}`) return true; // Vercel Cron sends this
  return new URL(req.url).searchParams.get('key') === secret;
}

export async function GET(req: Request) {
  if (!authorized(req)) {
    return NextResponse.json({ error: 'unauthorized' }, { status: 401 });
  }
  if (!ledgerConfigured()) {
    return NextResponse.json(
      { error: 'SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY not set' },
      { status: 503 }
    );
  }

  const startedAt = Date.now();
  const recorded: string[] = [];
  const skipped: string[] = [];
  const failed: Record<string, string> = {};

  // --- 1. Record today's forecasts -----------------------------------------
  const assets = [
    ...CRYPTO_REGISTRY.map(a => ({ ...a, isCrypto: true })),
    ...COMMODITY_REGISTRY.map(a => ({ ...a, isCrypto: false })),
  ];

  for (const asset of assets) {
    // Assets with no data source are a deliberate configuration choice, not a
    // fault: aluminium has no proxy that is actually aluminium (DBB is a
    // three-metal basket) and coffee lost its free source when the JO ETN was
    // delisted. Reporting them as failures would mean this job cries wolf on
    // every single run, and a real failure would be lost in the noise.
    if (!asset.isCrypto && !asset.tdSymbol && !asset.avFunction) {
      skipped.push(`${asset.slug} (no data source configured — intentional)`);
      continue;
    }

    try {
      let prices: number[];
      if (asset.isCrypto) {
        prices = (await getCoinHistory(asset.slug, 180)).map(p => p.price);
      } else {
        await new Promise(r => setTimeout(r, COMMODITY_GAP_MS));
        prices = (await getCommodityHistory(asset.slug, 180)).map(p => p.price);
      }

      // Warm the shared price cache while the history is hot.
      //
      // This costs nothing upstream: getCommodityPriceResilient derives its
      // figures from the same 24h-cached series we just pulled, so the call
      // lands in Redis rather than at the provider. Doing it here means the
      // homepage — which reads that cache first — never has to compete for
      // Twelve Data's 8 credits/minute, which is what left it rendering two
      // commodities out of five.
      if (!asset.isCrypto) {
        try {
          await getCommodityPriceResilient(asset.slug);
        } catch (err) {
          console.error(`[cron] price cache warm failed for ${asset.slug}:`, err);
        }
      }

      const forecast = buildForecast(prices, { horizonDays: 30 });
      if (!forecast) {
        skipped.push(`${asset.slug} (insufficient history: ${prices.length}pts)`);
        continue;
      }

      // Same indicator snapshot the asset page shows, stored alongside the
      // forecast so a later post-mortem can ask "what did the model see?".
      const indicators = {
        rsi: prices.length >= 15 ? calcRSI(prices) : 50,
        macd: prices.length >= 26 ? calcMACD(prices) : 0,
        bbPosition: prices.length >= 20 ? calcBBPosition(prices) : 0.5,
        ema50Distance: prices.length >= 50 ? calcEMA50Distance(prices) : 0,
        atr: prices.length >= 14
          ? calcATR(prices.map(p => p * 1.005), prices.map(p => p * 0.995), prices)
          : 0,
      };
      const regime = prices.length >= 30 ? classifyRegime(prices) : 'sideways';

      const wrote = await recordPrediction({
        slug: asset.slug,
        category: asset.isCrypto ? 'crypto' : 'commodity',
        forecast,
        indicators,
        regime,
        promptVersion: PROMPT_VERSION,
      });
      if (wrote) recorded.push(asset.slug);
      else skipped.push(`${asset.slug} (already logged today)`);
    } catch (err) {
      failed[asset.slug] = err instanceof Error ? err.message : String(err);
    }
  }

  // --- 2. Resolve matured forecasts ----------------------------------------
  let resolvedCount = 0;
  const resolveErrors: Record<string, string> = {};
  try {
    const matured = await getMaturedPredictions();

    // Group by slug so each asset's current price is fetched once even when
    // several of its predictions matured on the same day.
    const bySlug = new Map<string, typeof matured>();
    for (const m of matured) {
      const list = bySlug.get(m.slug) ?? [];
      list.push(m);
      bySlug.set(m.slug, list);
    }

    const scored: ReturnType<typeof scorePrediction>[] = [];
    for (const [slug, group] of bySlug) {
      try {
        const isCrypto = group[0].category === 'crypto';
        let actual: number | null;
        if (isCrypto) {
          actual = (await getCoinPriceCached(slug)).price;
        } else {
          await new Promise(r => setTimeout(r, COMMODITY_GAP_MS));
          actual = (await getCommodityPriceResilient(slug))?.price ?? null;
        }
        if (actual === null || !isFinite(actual) || actual <= 0) {
          // Leave it unresolved; the next run will retry rather than record a
          // bogus outcome against a price we could not confirm.
          resolveErrors[slug] = 'no confirmed price available';
          continue;
        }
        for (const p of group) scored.push(scorePrediction(p, actual));
      } catch (err) {
        resolveErrors[slug] = err instanceof Error ? err.message : String(err);
      }
    }

    resolvedCount = await recordResolutions(scored);
  } catch (err) {
    resolveErrors._query = err instanceof Error ? err.message : String(err);
  }

  return NextResponse.json({
    ranAt: new Date().toISOString(),
    durationMs: Date.now() - startedAt,
    recorded: { count: recorded.length, slugs: recorded },
    skipped,
    failed,
    resolved: { count: resolvedCount, errors: resolveErrors },
  }, { headers: { 'Cache-Control': 'no-store' } });
}

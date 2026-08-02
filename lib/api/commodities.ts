// Single entry point for commodity data, routing each asset to its source.
//
// Two providers, chosen per asset by what actually works rather than by
// preference:
//
//   Alpha Vantage — energy only (WTI, Brent, Henry Hub). Genuine spot prices in
//   real units, daily, decades of history. Everything else AV publishes is
//   monthly and two months stale, which cannot feed the volatility model.
//
//   Twelve Data — gold spot plus the ETF proxies for metals and agriculture.
//   Its free plan gates spot metals behind paid tiers, so those stay on funds
//   with an explicit on-page disclosure.
//
// Callers import from here and stay ignorant of which provider answered. That
// matters because the routing is empirical and will change as plans and
// coverage change; nothing upstream should have to care.

import { getAssetMeta } from '@/data/asset-registry';
import { getAvHistory, getAvPrice } from '@/lib/api/alphavantage';
import {
  getCommodityHistory as tdHistory,
  getCommodityPrice as tdPrice,
  getCommodityPriceResilient as tdPriceResilient,
  type CommodityPriceResult,
} from '@/lib/api/twelvedata';

export type { CommodityPriceResult };

export interface PricePoint { date: string; price: number }

/** Alpha Vantage function name for an asset, when it has one. */
function avFunction(slug: string): string | undefined {
  return getAssetMeta(slug)?.avFunction;
}

export async function getCommodityHistory(slug: string, days: number): Promise<PricePoint[]> {
  const fn = avFunction(slug);
  if (fn) return getAvHistory(fn, days);
  return tdHistory(slug, days);
}

export async function getCommodityPrice(slug: string) {
  const fn = avFunction(slug);
  if (fn) return getAvPrice(fn);
  return tdPrice(slug);
}

/**
 * Price with a last-good fallback, used where a failure must degrade rather
 * than throw. Alpha Vantage assets fall back through the same mechanism so the
 * behaviour is uniform regardless of provider.
 */
export async function getCommodityPriceResilient(slug: string): Promise<CommodityPriceResult | null> {
  const fn = avFunction(slug);
  if (!fn) return tdPriceResilient(slug);

  const { getCached, setCached } = await import('@/lib/cache/redis');
  const lastGoodKey = `av:lastgood:${slug}`;
  try {
    const fresh = await getAvPrice(fn);
    const result: CommodityPriceResult = {
      price: fresh.price,
      change24h: fresh.change24h,
      change7d: fresh.change7d,
      change30d: fresh.change30d,
      volume24h: fresh.volume24h,
      stale: false,
      asOf: fresh.asOf,
    };
    await setCached(lastGoodKey, result, 7 * 24 * 60 * 60);
    return result;
  } catch (err) {
    console.error(`[commodities] Alpha Vantage failed for ${slug}, trying last-good:`, err);
    const lastGood = await getCached<CommodityPriceResult>(lastGoodKey);
    return lastGood ? { ...lastGood, stale: true } : null;
  }
}

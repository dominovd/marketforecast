import { Redis } from '@upstash/redis';

// Every key this app touches is namespaced. The Upstash database is SHARED with
// the statusworld project, and several of our keys were generic enough to
// collide outright — `homepage:v1` and `news:${slug}` in particular. A
// collision would not error; it would silently serve one site's cached payload
// to the other, which is the worst possible failure mode because it looks like
// data corruption rather than a cache bug.
//
// Prefixing here rather than at each call site means new code cannot forget it.
const NAMESPACE = 'mf:';

function nsKey(key: string): string {
  return key.startsWith(NAMESPACE) ? key : NAMESPACE + key;
}

/**
 * Redis is unusable during `next build` static generation.
 *
 * The Upstash REST client issues its fetch with `cache: 'no-store'`, which Next
 * treats as an opt-out of static rendering — every call throws
 * DYNAMIC_SERVER_USAGE instead of returning data. The catch blocks below
 * swallowed it, so the failure was invisible except as hundreds of lines of log
 * noise, but the effect was severe: with no cache, all 53 prerendered pages hit
 * the upstream APIs directly, which is what exhausted the Twelve Data rate
 * limit and ultimately timed out the homepage build.
 *
 * Skipping cleanly here costs nothing — a build-time render has no warm cache
 * to hit anyway — and removes both the wasted round-trip and the log spam.
 */
function isBuildPhase(): boolean {
  return process.env.NEXT_PHASE === 'phase-production-build';
}

let redis: Redis | null = null;

export function getRedis(): Redis {
  if (!redis) {
    if (!process.env.UPSTASH_REDIS_REST_URL || !process.env.UPSTASH_REDIS_REST_TOKEN) {
      throw new Error('Missing UPSTASH_REDIS_REST_URL or UPSTASH_REDIS_REST_TOKEN');
    }
    redis = new Redis({
      url: process.env.UPSTASH_REDIS_REST_URL,
      token: process.env.UPSTASH_REDIS_REST_TOKEN,
    });
  }
  return redis;
}

export async function getCached<T>(key: string): Promise<T | null> {
  if (isBuildPhase()) return null;
  try {
    const r = getRedis();
    const data = await r.get<T>(nsKey(key));
    return data;
  } catch (e) {
    console.error('[Redis] getCached error:', e);
    return null;
  }
}

export async function setCached<T>(key: string, value: T, ttlSeconds: number): Promise<void> {
  // ±15 % random jitter prevents thundering herd: when many caches are
  // populated in the same deployment burst they won't all expire together.
  if (isBuildPhase()) return;
  const jittered = Math.round(ttlSeconds * (0.85 + 0.30 * Math.random()));
  try {
    const r = getRedis();
    await r.set(nsKey(key), value, { ex: jittered });
  } catch (e) {
    console.error('[Redis] setCached error:', e);
  }
}

import { Redis } from '@upstash/redis';

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
  try {
    const r = getRedis();
    const data = await r.get<T>(key);
    return data;
  } catch (e) {
    console.error('[Redis] getCached error:', e);
    return null;
  }
}

export async function setCached<T>(key: string, value: T, ttlSeconds: number): Promise<void> {
  // ±15 % random jitter prevents thundering herd: when many caches are
  // populated in the same deployment burst they won't all expire together.
  const jittered = Math.round(ttlSeconds * (0.85 + 0.30 * Math.random()));
  try {
    const r = getRedis();
    await r.set(key, value, { ex: jittered });
  } catch (e) {
    console.error('[Redis] setCached error:', e);
  }
}

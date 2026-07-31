// Operational diagnostics — answers "why is this asset showing fallback data?"
// without guessing from the outside.
//
// Reports, for each dependency: whether the env var exists (NEVER its value),
// and what the upstream actually returns right now when probed live. The whole
// point is that a fallback render looks identical to a healthy render from the
// outside except for the numbers, so we need the server to say what it saw.
//
// Access: if DIAGNOSTICS_SECRET is set, ?key= must match it. If it is not set,
// the route still runs but only because the payload deliberately contains no
// secret material — just booleans, HTTP statuses, and array lengths.

import { NextResponse } from 'next/server';

export const dynamic = 'force-dynamic';
export const revalidate = 0;

interface Probe {
  ok: boolean;
  detail: string;
  ms?: number;
}

async function timed(fn: () => Promise<string>): Promise<Probe> {
  const t0 = Date.now();
  try {
    const detail = await fn();
    return { ok: true, detail, ms: Date.now() - t0 };
  } catch (err) {
    return {
      ok: false,
      detail: err instanceof Error ? err.message : String(err),
      ms: Date.now() - t0,
    };
  }
}

export async function GET(req: Request) {
  const secret = process.env.DIAGNOSTICS_SECRET;
  if (secret) {
    const key = new URL(req.url).searchParams.get('key');
    if (key !== secret) {
      return NextResponse.json({ error: 'unauthorized' }, { status: 401 });
    }
  }

  // 1. Which env vars are configured. Booleans only — never the values.
  const env = {
    COINGECKO_API_KEY: Boolean(process.env.COINGECKO_API_KEY),
    TWELVE_DATA_API_KEY: Boolean(process.env.TWELVE_DATA_API_KEY),
    ANTHROPIC_API_KEY: Boolean(process.env.ANTHROPIC_API_KEY),
    UPSTASH_REDIS_REST_URL: Boolean(process.env.UPSTASH_REDIS_REST_URL),
    UPSTASH_REDIS_REST_TOKEN: Boolean(process.env.UPSTASH_REDIS_REST_TOKEN),
    SUPABASE_URL: Boolean(process.env.SUPABASE_URL),
    SUPABASE_SERVICE_ROLE_KEY: Boolean(process.env.SUPABASE_SERVICE_ROLE_KEY),
  };

  // Surface any env var whose name merely LOOKS like one we need. Catches the
  // classic "set it in Vercel but spelled it differently" failure, which is
  // otherwise invisible because the code just sees undefined.
  const relevant = Object.keys(process.env).filter(k =>
    /SUPA|SUPABASE|UPSTASH|REDIS|COINGECKO|TWELVE|ANTHROPIC|CLAUDE/i.test(k)
  ).sort();

  // 2. Live probes of every upstream the asset pages depend on.
  const probes: Record<string, Probe> = {};

  probes.coingecko_markets = await timed(async () => {
    const h: Record<string, string> = { Accept: 'application/json' };
    if (process.env.COINGECKO_API_KEY) h['x-cg-demo-api-key'] = process.env.COINGECKO_API_KEY;
    const r = await fetch(
      'https://api.coingecko.com/api/v3/coins/markets?vs_currency=usd&ids=bitcoin',
      { headers: h, cache: 'no-store', signal: AbortSignal.timeout(10000) }
    );
    if (!r.ok) throw new Error(`HTTP ${r.status}: ${(await r.text()).slice(0, 200)}`);
    const j = await r.json();
    return `${Array.isArray(j) ? j.length : 0} row(s), price=${j?.[0]?.current_price}`;
  });

  // This is the call that actually feeds the indicators and the forecast.
  probes.coingecko_market_chart = await timed(async () => {
    const h: Record<string, string> = { Accept: 'application/json' };
    if (process.env.COINGECKO_API_KEY) h['x-cg-demo-api-key'] = process.env.COINGECKO_API_KEY;
    const r = await fetch(
      'https://api.coingecko.com/api/v3/coins/bitcoin/market_chart?vs_currency=usd&days=180',
      { headers: h, cache: 'no-store', signal: AbortSignal.timeout(15000) }
    );
    if (!r.ok) throw new Error(`HTTP ${r.status}: ${(await r.text()).slice(0, 300)}`);
    const j = await r.json();
    const n = j?.prices?.length ?? 0;
    if (n < 40) throw new Error(`only ${n} points returned — forecast needs >= 40`);
    return `${n} daily points`;
  });

  probes.twelvedata = await timed(async () => {
    const key = process.env.TWELVE_DATA_API_KEY;
    if (!key) throw new Error('TWELVE_DATA_API_KEY not set');
    const r = await fetch(
      `https://api.twelvedata.com/time_series?symbol=XAU/USD&interval=1day&outputsize=10&apikey=${key}`,
      { cache: 'no-store', signal: AbortSignal.timeout(15000) }
    );
    const j = await r.json();
    if (j.status === 'error') throw new Error(`code ${j.code}: ${j.message}`);
    return `${j?.values?.length ?? 0} candles`;
  });

  probes.redis = await timed(async () => {
    if (!process.env.UPSTASH_REDIS_REST_URL || !process.env.UPSTASH_REDIS_REST_TOKEN) {
      throw new Error('UPSTASH_REDIS_REST_URL / _TOKEN not set — every request refetches upstream, which burns the CoinGecko quota fast');
    }
    const { Redis } = await import('@upstash/redis');
    const redis = new Redis({
      url: process.env.UPSTASH_REDIS_REST_URL,
      token: process.env.UPSTASH_REDIS_REST_TOKEN,
    });
    const probeKey = 'diag:ping';
    await redis.set(probeKey, Date.now(), { ex: 60 });
    const got = await redis.get(probeKey);
    return `read/write ok (${got})`;
  });

  probes.anthropic = await timed(async () => {
    if (!process.env.ANTHROPIC_API_KEY) {
      throw new Error('ANTHROPIC_API_KEY not set — scenario NUMBERS still come from the quant model, but the written commentary falls back to the deterministic template');
    }
    const r = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
        'x-api-key': process.env.ANTHROPIC_API_KEY,
        'anthropic-version': '2023-06-01',
      },
      body: JSON.stringify({
        model: 'claude-haiku-4-5-20251001',
        max_tokens: 8,
        messages: [{ role: 'user', content: 'Reply with the single word: ok' }],
      }),
      signal: AbortSignal.timeout(20000),
    });
    if (!r.ok) throw new Error(`HTTP ${r.status}: ${(await r.text()).slice(0, 200)}`);
    return 'reachable';
  });

  probes.supabase = await timed(async () => {
    const url = process.env.SUPABASE_URL;
    const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
    if (!url || !key) throw new Error('SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY not set');
    // Count rows in the ledger via PostgREST against the marketforecast schema.
    const r = await fetch(`${url}/rest/v1/predictions?select=id&limit=1`, {
      headers: {
        apikey: key,
        Authorization: `Bearer ${key}`,
        'Accept-Profile': 'marketforecast',
        Prefer: 'count=exact',
      },
      cache: 'no-store',
      signal: AbortSignal.timeout(10000),
    });
    if (!r.ok) throw new Error(`HTTP ${r.status}: ${(await r.text()).slice(0, 300)}`);
    return `ledger reachable, ${r.headers.get('content-range') ?? '?'} row(s)`;
  });

  // 3. End-to-end: does a real asset actually produce a forecast right now?
  const endToEnd: Record<string, string> = {};
  try {
    const { getAssetData } = await import('@/lib/data/getAssetData');
    for (const slug of ['bitcoin', 'gold']) {
      const a = await getAssetData(slug);
      endToEnd[slug] = a
        ? `history=${a.priceHistory?.length ?? 0}pts, forecast=${a.forecast ? 'YES' : 'NO (fallback)'}, rsi=${a.indicators.rsi}, atr=${a.indicators.atr.toFixed(4)}`
        : 'null';
    }
  } catch (err) {
    endToEnd.error = err instanceof Error ? err.message : String(err);
  }

  const failing = Object.entries(probes).filter(([, p]) => !p.ok).map(([k]) => k);

  return NextResponse.json(
    {
      checkedAt: new Date().toISOString(),
      summary: failing.length ? `FAILING: ${failing.join(', ')}` : 'all probes ok',
      env,
      relevantEnvVarNamesPresent: relevant,
      probes,
      endToEnd,
    },
    { headers: { 'Cache-Control': 'no-store' } }
  );
}

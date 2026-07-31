// Symbol probe for the commodity data source.
//
// Nine commodities return 404 from Twelve Data while gold and the three agri
// ETFs work. The pattern suggests the free plan covers US-listed equities/ETFs
// and forex but not futures or CFDs — but that is a hypothesis, and the last
// few hypotheses in this project were wrong. So: test it.
//
// For each affected slug this tries the currently-configured symbol plus a set
// of exchange-traded proxy candidates, and reports which resolve along with the
// latest price, so the price LEVEL can be sanity-checked too. An ETF that
// resolves is only useful if we also know it trades near the underlying — SLV
// is not silver, and publishing an ETF share price on a page titled "Silver
// Price Prediction" would be its own kind of wrong.
//
// Also queries /symbol_search so we discover what the provider actually offers
// rather than guessing names.

import { NextResponse } from 'next/server';

export const dynamic = 'force-dynamic';
export const maxDuration = 300;

const BASE = 'https://api.twelvedata.com';

// Currently configured -> candidate replacements, in preference order.
const CANDIDATES: Record<string, { current: string; tryList: string[]; searchTerm: string }> = {
  silver:     { current: 'XAG/USD', tryList: ['XAG/USD', 'SLV', 'SIVR'],        searchTerm: 'silver' },
  platinum:   { current: 'XPT/USD', tryList: ['XPT/USD', 'PPLT', 'PLTM'],       searchTerm: 'platinum' },
  palladium:  { current: 'XPD/USD', tryList: ['XPD/USD', 'PALL'],               searchTerm: 'palladium' },
  oil:        { current: 'WTI',     tryList: ['WTI', 'WTI/USD', 'CL', 'USO', 'USL'], searchTerm: 'crude oil' },
  brent:      { current: 'XBR/USD', tryList: ['XBR/USD', 'BZ', 'BNO'],          searchTerm: 'brent' },
  naturalgas: { current: 'NATGAS',  tryList: ['NATGAS', 'NG/USD', 'UNG', 'UNL'], searchTerm: 'natural gas' },
  copper:     { current: 'HG/USD',  tryList: ['HG/USD', 'CPER', 'COPX'],        searchTerm: 'copper' },
  aluminum:   { current: 'ALI/USD', tryList: ['ALI/USD', 'DBB', 'JJU'],         searchTerm: 'aluminum' },
  coffee:     { current: 'KC/USD',  tryList: ['KC/USD', 'JO', 'COFF'],          searchTerm: 'coffee' },
};

// Known-good controls. If these ever fail the probe itself is suspect.
const CONTROLS = ['XAU/USD', 'WEAT', 'CORN', 'CANE'];

interface SymbolResult {
  symbol: string;
  ok: boolean;
  detail: string;
  latestPrice?: number;
  latestDate?: string;
}

async function probeSymbol(symbol: string, key: string): Promise<SymbolResult> {
  try {
    const qs = new URLSearchParams({
      symbol, interval: '1day', outputsize: '3', order: 'DESC', apikey: key,
    });
    const res = await fetch(`${BASE}/time_series?${qs}`, {
      cache: 'no-store',
      signal: AbortSignal.timeout(12000),
    });
    const j = await res.json();
    if (j.status === 'error' || typeof j.code === 'number') {
      return { symbol, ok: false, detail: `code ${j.code}: ${j.message ?? 'error'}` };
    }
    const v = j?.values?.[0];
    if (!v) return { symbol, ok: false, detail: 'no values returned' };
    return {
      symbol,
      ok: true,
      detail: `${j.values.length} candles, exchange=${j?.meta?.exchange ?? '?'}, type=${j?.meta?.type ?? '?'}`,
      latestPrice: parseFloat(v.close),
      latestDate: v.datetime,
    };
  } catch (err) {
    return { symbol, ok: false, detail: err instanceof Error ? err.message : String(err) };
  }
}

async function searchSymbols(term: string, key: string): Promise<string[]> {
  try {
    const qs = new URLSearchParams({ symbol: term, outputsize: '12', apikey: key });
    const res = await fetch(`${BASE}/symbol_search?${qs}`, {
      cache: 'no-store',
      signal: AbortSignal.timeout(12000),
    });
    const j = await res.json();
    const data: Array<{ symbol?: string; instrument_name?: string; exchange?: string; instrument_type?: string }> =
      j?.data ?? [];
    return data.map(d =>
      `${d.symbol} — ${d.instrument_name ?? '?'} (${d.exchange ?? '?'}, ${d.instrument_type ?? '?'})`
    );
  } catch (err) {
    return [`search failed: ${err instanceof Error ? err.message : String(err)}`];
  }
}

export async function GET(req: Request) {
  const secret = process.env.DIAGNOSTICS_SECRET;
  if (secret && new URL(req.url).searchParams.get('key') !== secret) {
    return NextResponse.json({ error: 'unauthorized' }, { status: 401 });
  }

  const apiKey = process.env.TWELVE_DATA_API_KEY;
  if (!apiKey) {
    return NextResponse.json({ error: 'TWELVE_DATA_API_KEY not set' }, { status: 503 });
  }

  // Free tier allows 8 requests/minute; pace everything so the probe does not
  // manufacture the very 429s it is trying to distinguish from real 404s.
  const GAP_MS = 8000;
  const pace = () => new Promise(r => setTimeout(r, GAP_MS));

  const controls: SymbolResult[] = [];
  for (const c of CONTROLS) {
    controls.push(await probeSymbol(c, apiKey));
    await pace();
  }

  const results: Record<string, { current: string; probes: SymbolResult[]; search?: string[] }> = {};
  const only = new URL(req.url).searchParams.get('slug');

  for (const [slug, cfg] of Object.entries(CANDIDATES)) {
    if (only && slug !== only) continue;
    const probes: SymbolResult[] = [];
    for (const sym of cfg.tryList) {
      probes.push(await probeSymbol(sym, apiKey));
      await pace();
      // Stop at the first working candidate — no point burning quota.
      if (probes[probes.length - 1].ok) break;
    }
    const entry: { current: string; probes: SymbolResult[]; search?: string[] } = {
      current: cfg.current,
      probes,
    };
    if (!probes.some(p => p.ok)) {
      entry.search = await searchSymbols(cfg.searchTerm, apiKey);
      await pace();
    }
    results[slug] = entry;
  }

  const working = Object.entries(results)
    .map(([slug, r]) => {
      const hit = r.probes.find(p => p.ok);
      return hit ? `${slug} -> ${hit.symbol} @ ${hit.latestPrice}` : null;
    })
    .filter(Boolean);

  return NextResponse.json({
    checkedAt: new Date().toISOString(),
    note: 'A resolving ETF is only usable if its price level is comparable to the underlying commodity. Check latestPrice before adopting.',
    controls,
    summary: { resolved: working, unresolved: Object.keys(results).filter(s => !results[s].probes.some(p => p.ok)) },
    results,
  }, { headers: { 'Cache-Control': 'no-store' } });
}

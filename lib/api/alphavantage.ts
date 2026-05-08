// DEPRECATED — replaced by lib/api/twelvedata.ts.
// Alpha Vantage's FX_DAILY endpoint did not reliably cover XPT/XPD, and the
// 25 req/day quota would have made any real commodity expansion impossible.
// Twelve Data Free (800 req/day, full precious-metals + futures + ETF coverage)
// replaces it across the board (see data/asset-registry.ts → tdSymbol).
//
// This file is kept as a placeholder so any stale `import` referencing it
// doesn't break the build during migration. Safe to delete once you've
// confirmed nothing imports from here.
export {};

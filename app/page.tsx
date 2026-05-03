import Link from 'next/link';
import { ASSETS, ALL_ASSETS_LIST } from '@/data/mock-assets';

function ChangeChip({ value }: { value: number }) {
  const up = value >= 0;
  return (
    <span className={`text-xs font-medium px-2 py-0.5 rounded-full ${up ? 'badge-up' : 'badge-down'}`}>
      {up ? '▲' : '▼'} {Math.abs(value).toFixed(2)}%
    </span>
  );
}

function RegimeLabel({ regime }: { regime: string }) {
  const cls = `badge-${regime}`;
  const labels: Record<string, string> = { uptrend: '↑ Uptrend', downtrend: '↓ Downtrend', sideways: '→ Sideways', chaotic: '⚡ Chaotic' };
  return <span className={`${cls} text-xs px-2 py-0.5 rounded-full`}>{labels[regime] || regime}</span>;
}

function MiniSparkline({ change }: { change: number }) {
  const up = change >= 0;
  const points = Array.from({ length: 12 }, (_, i) => {
    const noise = (Math.sin(i * 2.3 + change) + Math.random() * 0.4) * 10;
    return 30 - (i / 11) * change * 0.8 + noise;
  });
  const min = Math.min(...points);
  const max = Math.max(...points);
  const norm = points.map(p => ((p - min) / (max - min)) * 30 + 5);
  const d = norm.map((y, i) => `${i === 0 ? 'M' : 'L'} ${(i / 11) * 80} ${40 - y}`).join(' ');
  return (
    <svg width="80" height="40" viewBox="0 0 80 40">
      <path d={d} fill="none" stroke={up ? '#10b981' : '#ef4444'} strokeWidth="1.5" />
    </svg>
  );
}

export default function HomePage() {
  const cryptoAssets = ALL_ASSETS_LIST.filter(a => a.category === 'crypto').map(a => ASSETS[a.slug]);
  const commodityAssets = ALL_ASSETS_LIST.filter(a => a.category === 'commodity').map(a => ASSETS[a.slug]);

  const totalMarketCap = '$2.8T';
  const btcDominance = '58.4%';

  return (
    <div className="max-w-7xl mx-auto px-4 sm:px-6 py-10">

      {/* Hero */}
      <div className="text-center mb-12">
        <div className="inline-flex items-center gap-2 text-xs px-3 py-1.5 rounded-full mb-4"
          style={{ background: 'rgba(59,130,246,0.1)', color: '#60a5fa', border: '1px solid rgba(59,130,246,0.2)' }}>
          <span className="w-1.5 h-1.5 rounded-full bg-blue-400 animate-pulse"></span>
          Live market data · AI analysis updated every 24h
        </div>
        <h1 className="text-4xl sm:text-5xl font-bold text-white mb-4">
          Market Price Forecast <span style={{ color: '#3b82f6' }}>2026</span>
        </h1>
        <p className="text-lg max-w-2xl mx-auto" style={{ color: '#64748b' }}>
          AI-powered analysis and conditional price scenarios for crypto and commodities. Data-driven insights, not financial advice.
        </p>
      </div>

      {/* Market overview bar */}
      <div className="card p-4 mb-10 flex flex-wrap gap-6 items-center">
        <div>
          <p className="text-xs" style={{ color: '#64748b' }}>Total Crypto Market Cap</p>
          <p className="text-lg font-bold text-white">{totalMarketCap}</p>
        </div>
        <div className="w-px h-8" style={{ background: '#1e2a3a' }} />
        <div>
          <p className="text-xs" style={{ color: '#64748b' }}>BTC Dominance</p>
          <p className="text-lg font-bold text-white">{btcDominance}</p>
        </div>
        <div className="w-px h-8" style={{ background: '#1e2a3a' }} />
        <div>
          <p className="text-xs" style={{ color: '#64748b' }}>Fear & Greed</p>
          <p className="text-lg font-bold" style={{ color: '#10b981' }}>72 — Greed</p>
        </div>
        <div className="w-px h-8" style={{ background: '#1e2a3a' }} />
        <div>
          <p className="text-xs" style={{ color: '#64748b' }}>Gold Price</p>
          <p className="text-lg font-bold text-white">$3,342</p>
        </div>
        <div className="ml-auto text-xs" style={{ color: '#475569' }}>
          ⚠️ Not financial advice. Analysis only.
        </div>
      </div>

      {/* Crypto Section */}
      <section id="crypto" className="mb-12">
        <div className="flex items-center gap-3 mb-6">
          <h2 className="text-xl font-bold text-white">Cryptocurrency Predictions 2026</h2>
          <span className="text-xs px-2 py-1 rounded-full" style={{ background: '#1e2a3a', color: '#64748b' }}>
            {cryptoAssets.length} assets
          </span>
        </div>
        <div className="card overflow-hidden">
          <div className="grid grid-cols-12 px-4 py-3 text-xs font-medium" style={{ color: '#475569', borderBottom: '1px solid #1e2a3a' }}>
            <div className="col-span-4">Asset</div>
            <div className="col-span-2 text-right">Price</div>
            <div className="col-span-2 text-right">24h</div>
            <div className="col-span-2 text-right hidden sm:block">30d</div>
            <div className="col-span-2 text-right hidden md:block">Regime</div>
          </div>
          {cryptoAssets.filter(Boolean).map((asset, i) => {
            const href = `/crypto/${asset.slug}-price-prediction-2026`;
            return (
              <Link key={asset.slug} href={href}
                className="grid grid-cols-12 px-4 py-4 items-center hover:bg-white/[0.02] transition-all"
                style={{ borderBottom: i < cryptoAssets.length - 1 ? '1px solid #1e2a3a' : 'none' }}>
                <div className="col-span-4 flex items-center gap-3">
                  <div className="w-9 h-9 rounded-xl flex items-center justify-center text-xl"
                    style={{ background: '#1e2a3a' }}>{asset.icon}</div>
                  <div>
                    <p className="text-sm font-semibold text-white">{asset.name}</p>
                    <p className="text-xs" style={{ color: '#64748b' }}>{asset.symbol}</p>
                  </div>
                </div>
                <div className="col-span-2 text-right">
                  <p className="text-sm font-semibold text-white">
                    ${asset.price >= 1000 ? asset.price.toLocaleString() : asset.price}
                  </p>
                </div>
                <div className="col-span-2 text-right">
                  <ChangeChip value={asset.change24h} />
                </div>
                <div className="col-span-2 text-right hidden sm:block">
                  <ChangeChip value={asset.change30d} />
                </div>
                <div className="col-span-2 text-right hidden md:flex justify-end">
                  <RegimeLabel regime={asset.regime} />
                </div>
              </Link>
            );
          })}
        </div>
      </section>

      {/* Commodities Section */}
      <section id="commodities" className="mb-12">
        <div className="flex items-center gap-3 mb-6">
          <h2 className="text-xl font-bold text-white">Commodities Price Forecast 2026</h2>
          <span className="text-xs px-2 py-1 rounded-full" style={{ background: '#1e2a3a', color: '#64748b' }}>
            {commodityAssets.length} assets
          </span>
        </div>
        <div className="card overflow-hidden">
          <div className="grid grid-cols-12 px-4 py-3 text-xs font-medium" style={{ color: '#475569', borderBottom: '1px solid #1e2a3a' }}>
            <div className="col-span-4">Asset</div>
            <div className="col-span-2 text-right">Price</div>
            <div className="col-span-2 text-right">24h</div>
            <div className="col-span-2 text-right hidden sm:block">30d</div>
            <div className="col-span-2 text-right hidden md:block">Regime</div>
          </div>
          {commodityAssets.filter(Boolean).map((asset, i) => {
            const href = `/commodities/${asset.slug}-price-prediction-2026`;
            return (
              <Link key={asset.slug} href={href}
                className="grid grid-cols-12 px-4 py-4 items-center hover:bg-white/[0.02] transition-all"
                style={{ borderBottom: i < commodityAssets.length - 1 ? '1px solid #1e2a3a' : 'none' }}>
                <div className="col-span-4 flex items-center gap-3">
                  <div className="w-9 h-9 rounded-xl flex items-center justify-center text-xl"
                    style={{ background: '#1e2a3a' }}>{asset.icon}</div>
                  <div>
                    <p className="text-sm font-semibold text-white">{asset.name}</p>
                    <p className="text-xs" style={{ color: '#64748b' }}>{asset.symbol}</p>
                  </div>
                </div>
                <div className="col-span-2 text-right">
                  <p className="text-sm font-semibold text-white">${asset.price}</p>
                </div>
                <div className="col-span-2 text-right">
                  <ChangeChip value={asset.change24h} />
                </div>
                <div className="col-span-2 text-right hidden sm:block">
                  <ChangeChip value={asset.change30d} />
                </div>
                <div className="col-span-2 text-right hidden md:flex justify-end">
                  <RegimeLabel regime={asset.regime} />
                </div>
              </Link>
            );
          })}
        </div>
      </section>

      {/* How it works */}
      <section className="card p-6 mb-10">
        <h2 className="text-lg font-bold text-white mb-6 text-center">How MarketForecast Works</h2>
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-6">
          {[
            { icon: '📡', title: 'Live Market Data', desc: 'Price, volume, and indicators pulled from market APIs every 5 minutes across 15+ assets.' },
            { icon: '🤖', title: 'AI Analysis', desc: 'Claude AI analyzes technical indicators, price action, and news sentiment to generate conditional scenarios — refreshed every 24 hours.' },
            { icon: '📊', title: 'Market Regimes', desc: 'Each asset is classified into uptrend, downtrend, sideways, or chaotic regime based on momentum and volatility metrics.' },
          ].map(item => (
            <div key={item.title} className="text-center">
              <div className="text-3xl mb-3">{item.icon}</div>
              <h3 className="font-semibold text-white mb-2">{item.title}</h3>
              <p className="text-sm" style={{ color: '#64748b' }}>{item.desc}</p>
            </div>
          ))}
        </div>
      </section>

      {/* Disclaimer */}
      <div className="rounded-xl p-5 text-center" style={{ background: 'rgba(245,158,11,0.06)', border: '1px solid rgba(245,158,11,0.15)' }}>
        <p className="text-sm" style={{ color: '#94a3b8' }}>
          <strong style={{ color: '#f59e0b' }}>⚠️ Important Disclaimer:</strong> All content on MarketForecast is for informational and educational purposes only. Nothing here constitutes financial, investment, or trading advice. AI-generated scenarios are conditional analyses based on current data, not guaranteed predictions. Always conduct thorough research and consult a qualified financial advisor before making investment decisions.
        </p>
      </div>
    </div>
  );
}

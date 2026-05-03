'use client';

import { useState, useMemo } from 'react';
import { LineChart, Line, XAxis, YAxis, Tooltip, ResponsiveContainer, ReferenceLine } from 'recharts';
import { Asset, generatePriceHistory, Regime, Sentiment } from '@/data/mock-assets';

function fmt(n: number, decimals = 2) {
  if (n >= 1000) return n.toLocaleString('en-US', { maximumFractionDigits: decimals });
  return n.toFixed(decimals);
}

function ChangeChip({ value }: { value: number }) {
  const up = value >= 0;
  return (
    <span className={`inline-flex items-center gap-1 text-sm font-medium px-2 py-0.5 rounded-full ${up ? 'badge-up' : 'badge-down'}`}>
      {up ? '▲' : '▼'} {Math.abs(value).toFixed(2)}%
    </span>
  );
}

function RegimeBadge({ regime }: { regime: Regime }) {
  const labels: Record<Regime, string> = { uptrend: '↑ Uptrend', downtrend: '↓ Downtrend', sideways: '→ Sideways', chaotic: '⚡ Chaotic' };
  return <span className={`badge-${regime} text-sm font-medium px-3 py-1 rounded-full`}>{labels[regime]}</span>;
}

function SentimentDot({ s }: { s: Sentiment }) {
  const c = s === 'positive' ? '#10b981' : s === 'negative' ? '#ef4444' : '#94a3b8';
  return <span className="w-2 h-2 rounded-full flex-shrink-0 mt-1.5" style={{ background: c, display: 'inline-block' }} />;
}

function RSIBar({ value }: { value: number }) {
  const color = value > 70 ? '#ef4444' : value < 30 ? '#10b981' : '#3b82f6';
  const label = value > 70 ? 'Overbought' : value < 30 ? 'Oversold' : 'Neutral';
  return (
    <div>
      <div className="flex justify-between items-center mb-1">
        <span className="text-xs" style={{ color: '#64748b' }}>RSI (14)</span>
        <span className="text-xs font-medium" style={{ color }}>{label}</span>
      </div>
      <div className="h-2 rounded-full" style={{ background: '#1e2a3a' }}>
        <div className="h-2 rounded-full transition-all" style={{ width: `${value}%`, background: color }} />
      </div>
      <div className="text-right mt-1">
        <span className="text-sm font-bold" style={{ color }}>{value}</span>
      </div>
    </div>
  );
}

function BBBar({ value }: { value: number }) {
  const pct = Math.round(value * 100);
  const color = value > 0.8 ? '#ef4444' : value < 0.2 ? '#10b981' : '#3b82f6';
  return (
    <div>
      <div className="flex justify-between items-center mb-1">
        <span className="text-xs" style={{ color: '#64748b' }}>BB Position</span>
        <span className="text-xs font-medium" style={{ color }}>{pct}%</span>
      </div>
      <div className="h-2 rounded-full relative" style={{ background: '#1e2a3a' }}>
        <div className="h-2 rounded-full" style={{ width: `${pct}%`, background: `linear-gradient(90deg, #10b981, #3b82f6, #ef4444)` }} />
      </div>
      <div className="flex justify-between mt-1">
        <span className="text-xs" style={{ color: '#475569' }}>Lower Band</span>
        <span className="text-xs" style={{ color: '#475569' }}>Upper Band</span>
      </div>
    </div>
  );
}

function FearGreedGauge({ value }: { value: number }) {
  const label = value >= 75 ? 'Extreme Greed' : value >= 55 ? 'Greed' : value >= 45 ? 'Neutral' : value >= 25 ? 'Fear' : 'Extreme Fear';
  const color = value >= 55 ? '#10b981' : value >= 45 ? '#f59e0b' : '#ef4444';
  return (
    <div className="card p-4 flex flex-col items-center">
      <p className="text-xs mb-2" style={{ color: '#64748b' }}>Fear & Greed Index</p>
      <div className="relative w-24 h-12 overflow-hidden">
        <div className="w-24 h-24 rounded-full border-8 absolute top-0" style={{ borderColor: '#1e2a3a' }} />
        <div className="w-24 h-24 rounded-full border-8 absolute top-0"
          style={{ borderColor: color, borderTopColor: 'transparent', borderRightColor: 'transparent', transform: `rotate(${(value / 100) * 180 - 90}deg)`, transformOrigin: 'center center' }} />
        <div className="absolute bottom-0 w-full text-center">
          <span className="text-xl font-bold" style={{ color }}>{value}</span>
        </div>
      </div>
      <p className="text-sm font-medium mt-2" style={{ color }}>{label}</p>
    </div>
  );
}

const CustomTooltip = ({ active, payload, label }: any) => {
  if (active && payload && payload.length) {
    return (
      <div className="card px-3 py-2 text-xs">
        <p style={{ color: '#64748b' }}>{label}</p>
        <p className="font-bold text-white">${payload[0].value.toLocaleString()}</p>
      </div>
    );
  }
  return null;
};

export default function AssetPage({ asset }: { asset: Asset }) {
  const [period, setPeriod] = useState<30 | 90 | 365>(90);

  const priceHistory = useMemo(() =>
    generatePriceHistory(asset.price, asset.price * 0.028, asset.change30d / 100, 365),
    [asset.slug]
  );

  const chartData = priceHistory.slice(-period);
  const chartMin = Math.min(...chartData.map(d => d.price)) * 0.985;
  const chartMax = Math.max(...chartData.map(d => d.price)) * 1.015;
  const isUp = asset.change24h >= 0;
  const chartColor = isUp ? '#10b981' : '#ef4444';

  const indicatorCards = [
    { label: 'MACD Signal', value: asset.indicators.macd > 0 ? `+${fmt(asset.indicators.macd)}` : fmt(asset.indicators.macd), color: asset.indicators.macd > 0 ? '#10b981' : '#ef4444', sub: asset.indicators.macd > 0 ? 'Bullish signal' : 'Bearish signal' },
    { label: 'EMA50 Distance', value: `${asset.indicators.ema50Distance > 0 ? '+' : ''}${asset.indicators.ema50Distance}%`, color: asset.indicators.ema50Distance > 0 ? '#10b981' : '#ef4444', sub: asset.indicators.ema50Distance > 0 ? 'Above EMA50' : 'Below EMA50' },
    { label: 'ATR (14)', value: fmt(asset.indicators.atr), color: '#f59e0b', sub: 'Average daily range' },
    { label: 'Market Cap', value: asset.marketCap || '—', color: '#3b82f6', sub: 'Total market value' },
    { label: '24h Volume', value: asset.volume24h, color: '#8b5cf6', sub: 'Trading volume' },
  ];

  return (
    <div className="max-w-7xl mx-auto px-4 sm:px-6 py-8">

      {/* Disclaimer */}
      <div className="rounded-lg px-4 py-3 mb-6 flex items-start gap-3" style={{ background: 'rgba(245,158,11,0.08)', border: '1px solid rgba(245,158,11,0.2)' }}>
        <span className="text-yellow-400 mt-0.5">⚠️</span>
        <p className="text-xs" style={{ color: '#94a3b8' }}>
          <strong style={{ color: '#f59e0b' }}>Not Financial Advice.</strong> This page provides AI-generated data analysis and market scenarios for informational purposes only. Past performance does not guarantee future results. Always do your own research before making investment decisions.
        </p>
      </div>

      {/* Hero */}
      <div className="flex flex-col sm:flex-row sm:items-start sm:justify-between gap-4 mb-8">
        <div className="flex items-center gap-4">
          <div className="w-14 h-14 rounded-2xl flex items-center justify-center text-2xl font-bold"
            style={{ background: 'linear-gradient(135deg, #1e2a3a, #0f1a2e)', border: '1px solid #1e2a3a' }}>
            {asset.icon}
          </div>
          <div>
            <div className="flex items-center gap-3 mb-1">
              <h1 className="text-2xl font-bold text-white">{asset.name}</h1>
              <span className="text-sm px-2 py-0.5 rounded" style={{ background: '#1e2a3a', color: '#64748b' }}>{asset.symbol}</span>
              <RegimeBadge regime={asset.regime} />
            </div>
            <p className="text-sm" style={{ color: '#64748b' }}>{asset.name} Price Prediction & Analysis 2026</p>
          </div>
        </div>
        <div className="text-right">
          <div className="text-3xl font-bold text-white mb-1">${fmt(asset.price)}</div>
          <div className="flex items-center justify-end gap-3">
            <div className="flex flex-col items-end gap-1">
              <div className="flex items-center gap-2">
                <span className="text-xs" style={{ color: '#64748b' }}>24h</span>
                <ChangeChip value={asset.change24h} />
              </div>
              <div className="flex items-center gap-2">
                <span className="text-xs" style={{ color: '#64748b' }}>7d</span>
                <ChangeChip value={asset.change7d} />
              </div>
              <div className="flex items-center gap-2">
                <span className="text-xs" style={{ color: '#64748b' }}>30d</span>
                <ChangeChip value={asset.change30d} />
              </div>
            </div>
          </div>
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        <div className="lg:col-span-2 space-y-6">

          {/* Chart */}
          <div className="card p-5">
            <div className="flex items-center justify-between mb-4">
              <h2 className="font-semibold text-white">Price Chart</h2>
              <div className="flex gap-1">
                {([30, 90, 365] as const).map(p => (
                  <button key={p} onClick={() => setPeriod(p)}
                    className="text-xs px-3 py-1.5 rounded-lg transition-all"
                    style={{ background: period === p ? '#3b82f6' : '#1e2a3a', color: period === p ? 'white' : '#64748b' }}>
                    {p === 30 ? '1M' : p === 90 ? '3M' : '1Y'}
                  </button>
                ))}
              </div>
            </div>
            <ResponsiveContainer width="100%" height={260}>
              <LineChart data={chartData} margin={{ top: 5, right: 5, bottom: 5, left: 0 }}>
                <defs>
                  <linearGradient id="lineGrad" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="0%" stopColor={chartColor} stopOpacity={0.3} />
                    <stop offset="100%" stopColor={chartColor} stopOpacity={0} />
                  </linearGradient>
                </defs>
                <XAxis dataKey="date" tick={{ fill: '#475569', fontSize: 11 }} tickLine={false} axisLine={false}
                  interval={Math.floor(chartData.length / 6)} />
                <YAxis domain={[chartMin, chartMax]} tick={{ fill: '#475569', fontSize: 11 }} tickLine={false}
                  axisLine={false} width={70}
                  tickFormatter={v => v >= 1000 ? `$${(v / 1000).toFixed(0)}K` : `$${v.toFixed(1)}`} />
                <Tooltip content={<CustomTooltip />} />
                <ReferenceLine y={asset.price} stroke={chartColor} strokeDasharray="3 3" strokeOpacity={0.4} />
                <Line type="monotone" dataKey="price" stroke={chartColor} strokeWidth={2} dot={false} />
              </LineChart>
            </ResponsiveContainer>
          </div>

          {/* Indicators grid */}
          <div>
            <h2 className="font-semibold text-white mb-3">Technical Indicators</h2>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 mb-4">
              <div className="card p-4 space-y-4">
                <RSIBar value={asset.indicators.rsi} />
                <BBBar value={asset.indicators.bbPosition} />
              </div>
              <div className="grid grid-cols-1 gap-3">
                {indicatorCards.slice(0, 3).map(c => (
                  <div key={c.label} className="card p-4 flex items-center justify-between">
                    <div>
                      <p className="text-xs" style={{ color: '#64748b' }}>{c.label}</p>
                      <p className="text-xs mt-0.5" style={{ color: '#475569' }}>{c.sub}</p>
                    </div>
                    <p className="text-lg font-bold" style={{ color: c.color }}>{c.value}</p>
                  </div>
                ))}
              </div>
            </div>
            <div className="grid grid-cols-2 gap-3">
              {indicatorCards.slice(3).map(c => (
                <div key={c.label} className="card p-4 flex items-center justify-between">
                  <div>
                    <p className="text-xs" style={{ color: '#64748b' }}>{c.label}</p>
                    <p className="text-xs mt-0.5" style={{ color: '#475569' }}>{c.sub}</p>
                  </div>
                  <p className="text-lg font-bold" style={{ color: c.color }}>{c.value}</p>
                </div>
              ))}
            </div>
          </div>

          {/* AI Analysis Block */}
          <div className="card p-5" style={{ borderColor: 'rgba(139,92,246,0.3)' }}>
            <div className="flex items-center gap-2 mb-4">
              <div className="w-6 h-6 rounded flex items-center justify-center text-xs"
                style={{ background: 'rgba(139,92,246,0.2)', color: '#a78bfa' }}>AI</div>
              <h2 className="font-semibold text-white">AI-Generated Analysis</h2>
              <span className="text-xs px-2 py-0.5 rounded-full ml-auto"
                style={{ background: 'rgba(139,92,246,0.15)', color: '#a78bfa', border: '1px solid rgba(139,92,246,0.3)' }}>
                Updated 2h ago
              </span>
            </div>
            <div className="rounded-lg p-4 mb-5" style={{ background: 'rgba(139,92,246,0.06)', border: '1px solid rgba(139,92,246,0.15)' }}>
              <p className="text-sm leading-relaxed" style={{ color: '#cbd5e1' }}>{asset.aiAnalysis.summary}</p>
            </div>

            {/* Scenarios */}
            <h3 className="text-sm font-medium text-white mb-3">2026 Conditional Scenarios</h3>
            <div className="space-y-3">
              {[
                { key: 'bull', label: 'Bull Case', color: '#10b981', bg: 'rgba(16,185,129,0.08)', border: 'rgba(16,185,129,0.2)', scenario: asset.aiAnalysis.bull },
                { key: 'base', label: 'Base Case', color: '#3b82f6', bg: 'rgba(59,130,246,0.08)', border: 'rgba(59,130,246,0.2)', scenario: asset.aiAnalysis.base },
                { key: 'bear', label: 'Bear Case', color: '#ef4444', bg: 'rgba(239,68,68,0.08)', border: 'rgba(239,68,68,0.2)', scenario: asset.aiAnalysis.bear },
              ].map(({ label, color, bg, border, scenario }) => (
                <div key={label} className="rounded-lg p-4" style={{ background: bg, border: `1px solid ${border}` }}>
                  <div className="flex items-center justify-between mb-2">
                    <span className="text-xs font-semibold" style={{ color }}>{label}</span>
                    <span className="text-xs px-2 py-0.5 rounded-full" style={{ background: bg, color, border: `1px solid ${border}` }}>
                      {scenario.probability}
                    </span>
                  </div>
                  <p className="text-xs mb-2" style={{ color: '#94a3b8' }}><strong style={{ color: '#cbd5e1' }}>If:</strong> {scenario.condition}</p>
                  <p className="text-sm font-semibold" style={{ color }}>{scenario.target}</p>
                </div>
              ))}
            </div>

            {/* Key Factors */}
            <div className="mt-4">
              <h3 className="text-xs font-medium mb-2" style={{ color: '#64748b' }}>Key Factors to Watch</h3>
              <div className="flex flex-wrap gap-2">
                {asset.aiAnalysis.keyFactors.map(f => (
                  <span key={f} className="text-xs px-3 py-1 rounded-full"
                    style={{ background: '#1e2a3a', color: '#94a3b8', border: '1px solid #2d3f52' }}>{f}</span>
                ))}
              </div>
            </div>
            <p className="text-xs mt-4" style={{ color: '#475569' }}>
              ⚠️ AI-generated analysis based on current market data. Scenarios are conditional, not predictions. Not financial advice.
            </p>
          </div>

          {/* News */}
          <div>
            <h2 className="font-semibold text-white mb-3">Latest News</h2>
            <div className="space-y-2">
              {asset.news.map((n, i) => (
                <a key={i} href={n.url} className="card p-4 flex items-start gap-3 hover:border-blue-500/40 transition-all block">
                  <SentimentDot s={n.sentiment} />
                  <div className="flex-1 min-w-0">
                    <p className="text-sm text-white leading-snug">{n.title}</p>
                    <div className="flex items-center gap-2 mt-1">
                      <span className="text-xs font-medium" style={{ color: '#3b82f6' }}>{n.source}</span>
                      <span className="text-xs" style={{ color: '#475569' }}>·</span>
                      <span className="text-xs" style={{ color: '#475569' }}>{n.time}</span>
                    </div>
                  </div>
                  <span className={`text-xs px-2 py-0.5 rounded-full flex-shrink-0 badge-${n.sentiment === 'positive' ? 'up' : n.sentiment === 'negative' ? 'down' : 'neutral'}`}>
                    {n.sentiment}
                  </span>
                </a>
              ))}
            </div>
          </div>
        </div>

        {/* Sidebar */}
        <div className="space-y-4">
          {asset.fearGreed !== undefined && <FearGreedGauge value={asset.fearGreed} />}

          {/* Where to buy */}
          <div className="card p-5">
            <h3 className="font-semibold text-white mb-1">Where to Buy / Trade</h3>
            <p className="text-xs mb-4" style={{ color: '#64748b' }}>Trusted platforms to get exposure to {asset.name}</p>
            <div className="space-y-3">
              {asset.affiliates.map(a => (
                <a key={a.name} href={a.url}
                  className="flex items-center justify-between w-full rounded-lg px-4 py-3 text-sm font-medium text-white transition-all hover:opacity-90"
                  style={{ background: 'linear-gradient(135deg, #1d4ed8, #2563eb)', border: '1px solid rgba(59,130,246,0.3)' }}>
                  {a.label}
                  <span>→</span>
                </a>
              ))}
            </div>
            <p className="text-xs mt-3" style={{ color: '#475569' }}>
              ⚠️ Trading involves risk. These are affiliate links. Not financial advice.
            </p>
          </div>

          {/* Quick stats */}
          <div className="card p-4">
            <h3 className="text-sm font-semibold text-white mb-3">Market Data</h3>
            <div className="space-y-2">
              {[
                ['Category', asset.category === 'crypto' ? 'Cryptocurrency' : 'Commodity'],
                ['Symbol', asset.symbol],
                ['Regime', asset.regime],
                ['RSI (14)', asset.indicators.rsi.toString()],
                ['BB Position', `${Math.round(asset.indicators.bbPosition * 100)}%`],
                ['ATR (14)', fmt(asset.indicators.atr)],
              ].map(([k, v]) => (
                <div key={k} className="flex justify-between">
                  <span className="text-xs" style={{ color: '#64748b' }}>{k}</span>
                  <span className="text-xs font-medium" style={{ color: '#cbd5e1' }}>{v}</span>
                </div>
              ))}
            </div>
          </div>

          {/* Methodology note */}
          <div className="rounded-lg p-4" style={{ background: 'rgba(59,130,246,0.06)', border: '1px solid rgba(59,130,246,0.2)' }}>
            <p className="text-xs font-medium mb-1" style={{ color: '#60a5fa' }}>How this analysis works</p>
            <p className="text-xs" style={{ color: '#64748b' }}>
              Data is fetched from market APIs every 5 minutes. AI analysis is regenerated every 24 hours using current indicators, price action, and news sentiment. Scenarios are conditional, not predictions.
            </p>
          </div>
        </div>
      </div>
    </div>
  );
}

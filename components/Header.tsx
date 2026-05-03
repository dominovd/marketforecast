'use client';
import Link from 'next/link';
import { useState } from 'react';

export default function Header() {
  const [open, setOpen] = useState(false);
  return (
    <header style={{ background: '#0a0e1a', borderBottom: '1px solid #1e2a3a' }} className="sticky top-0 z-50">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 h-16 flex items-center justify-between">
        <Link href="/" className="flex items-center gap-2">
          <div className="w-8 h-8 rounded-lg flex items-center justify-center text-white font-bold text-sm"
            style={{ background: 'linear-gradient(135deg, #3b82f6, #8b5cf6)' }}>MF</div>
          <span className="font-semibold text-white text-lg">MarketForecast</span>
          <span className="text-xs px-2 py-0.5 rounded-full ml-1" style={{ background: 'rgba(59,130,246,0.2)', color: '#60a5fa', border: '1px solid rgba(59,130,246,0.3)' }}>Beta</span>
        </Link>
        <nav className="hidden md:flex items-center gap-6">
          <Link href="/" className="text-sm" style={{ color: '#94a3b8' }}>Markets</Link>
          <Link href="/#crypto" className="text-sm" style={{ color: '#94a3b8' }}>Crypto</Link>
          <Link href="/#commodities" className="text-sm" style={{ color: '#94a3b8' }}>Commodities</Link>
          <Link href="/methodology" className="text-sm" style={{ color: '#94a3b8' }}>Methodology</Link>
        </nav>
        <div className="flex items-center gap-3">
          <span className="hidden sm:flex items-center gap-1.5 text-xs px-3 py-1.5 rounded-full"
            style={{ background: 'rgba(16,185,129,0.1)', color: '#10b981', border: '1px solid rgba(16,185,129,0.2)' }}>
            <span className="w-1.5 h-1.5 rounded-full bg-green-400 animate-pulse"></span>
            Live Data
          </span>
          <button className="md:hidden text-gray-400" onClick={() => setOpen(!open)}>☰</button>
        </div>
      </div>
      {open && (
        <div className="md:hidden px-4 py-3 space-y-2" style={{ borderTop: '1px solid #1e2a3a' }}>
          <Link href="/" className="block text-sm py-2" style={{ color: '#94a3b8' }}>Markets</Link>
          <Link href="/methodology" className="block text-sm py-2" style={{ color: '#94a3b8' }}>Methodology</Link>
        </div>
      )}
    </header>
  );
}

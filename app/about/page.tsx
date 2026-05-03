import type { Metadata } from 'next';
import Link from 'next/link';

export const metadata: Metadata = {
  title: 'About MarketForecast | AI-Powered Market Analysis',
  description: 'MarketForecast delivers AI-powered price analysis and market scenarios for crypto and commodities. Learn about our mission and get in touch.',
  alternates: { canonical: 'https://marketforecast.io/about' },
};

export default function AboutPage() {
  return (
    <div className="max-w-2xl mx-auto px-4 py-12">
      <div className="mb-10">
        <Link href="/" className="text-cyan-400 text-sm hover:underline">← Back to home</Link>
        <h1 className="text-3xl font-bold text-white mt-4 mb-3">About MarketForecast</h1>
        <p className="text-slate-400 text-lg">
          AI-powered market data analysis and scenario planning for crypto and commodities.
        </p>
      </div>

      <section className="mb-10">
        <h2 className="text-xl font-semibold text-white mb-4 pb-2 border-b border-slate-700">What We Do</h2>
        <div className="text-slate-300 space-y-3 leading-relaxed">
          <p>
            MarketForecast aggregates real-time price data, computes standard technical indicators,
            and generates structured market scenarios using AI — all in one place. We cover major
            cryptocurrencies and commodity markets including Bitcoin, Ethereum, Gold, Oil, and more.
          </p>
          <p>
            Our goal is to give retail investors a clear, data-driven picture of current market
            conditions without the noise — no clickbait headlines, no sponsored calls, just
            clean analysis updated automatically every day.
          </p>
        </div>
      </section>

      <section className="mb-10">
        <h2 className="text-xl font-semibold text-white mb-4 pb-2 border-b border-slate-700">How It Works</h2>
        <div className="text-slate-300 space-y-3 leading-relaxed">
          <p>
            Each asset page pulls live price data, calculates RSI, MACD, Bollinger Bands, and other
            indicators from scratch, then feeds that data into an AI model to generate bull, base,
            and bear scenarios for the year ahead.
          </p>
          <p>
            For the full technical breakdown, see our{' '}
            <Link href="/methodology" className="text-cyan-400 hover:underline">Methodology page</Link>.
          </p>
        </div>
      </section>

      <section className="mb-10">
        <h2 className="text-xl font-semibold text-white mb-4 pb-2 border-b border-slate-700">Disclaimer</h2>
        <p className="text-slate-400 leading-relaxed">
          MarketForecast provides data analysis and AI-generated market scenarios for{' '}
          <strong className="text-slate-300">informational purposes only</strong>. Nothing on this
          site constitutes financial advice. Always do your own research before making any investment
          decisions.
        </p>
      </section>

      <section id="contact">
        <h2 className="text-xl font-semibold text-white mb-4 pb-2 border-b border-slate-700">Contact</h2>
        <p className="text-slate-400 leading-relaxed mb-4">
          Have a question, found an issue, or want to discuss a partnership? Reach out — we read every message.
        </p>
        <a
          href="mailto:info@marketforecast.io"
          className="inline-flex items-center gap-2 px-5 py-3 rounded-lg text-white font-medium transition-opacity hover:opacity-90"
          style={{ background: 'linear-gradient(135deg, #3b82f6, #8b5cf6)' }}
        >
          <svg xmlns="http://www.w3.org/2000/svg" className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M3 8l7.89 5.26a2 2 0 002.22 0L21 8M5 19h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v10a2 2 0 002 2z" />
          </svg>
          info@marketforecast.io
        </a>
      </section>
    </div>
  );
}

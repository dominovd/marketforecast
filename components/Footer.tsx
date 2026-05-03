import Link from 'next/link';

export default function Footer() {
  return (
    <footer style={{ background: '#0a0e1a', borderTop: '1px solid #1e2a3a' }} className="mt-20">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 py-12">
        <div className="grid grid-cols-1 md:grid-cols-3 gap-8 mb-8">
          <div>
            <div className="flex items-center gap-2 mb-3">
              <div className="w-7 h-7 rounded-lg flex items-center justify-center text-white font-bold text-xs"
                style={{ background: 'linear-gradient(135deg, #3b82f6, #8b5cf6)' }}>MF</div>
              <span className="font-semibold text-white">MarketForecast</span>
            </div>
            <p className="text-sm" style={{ color: '#64748b' }}>AI-powered market data analysis and scenario planning for crypto and commodities.</p>
          </div>
          <div>
            <h4 className="text-sm font-medium text-white mb-3">Markets</h4>
            <div className="space-y-2">
              {[
                { name: 'Bitcoin', cat: 'crypto' }, { name: 'Ethereum', cat: 'crypto' },
                { name: 'Solana', cat: 'crypto' }, { name: 'XRP', cat: 'crypto' },
                { name: 'BNB', cat: 'crypto' }, { name: 'Cardano', cat: 'crypto' },
                { name: 'Gold', cat: 'commodities' }, { name: 'Silver', cat: 'commodities' },
                { name: 'Oil', cat: 'commodities' }, { name: 'Natural Gas', cat: 'commodities' },
                { name: 'Copper', cat: 'commodities' },
              ].map(a => (
                <Link key={a.name} href={`/${a.cat}/${a.name.toLowerCase().replace(' ', '')}-price-prediction-2026`}
                  className="block text-sm" style={{ color: '#64748b' }}>{a.name} Price Prediction 2026</Link>
              ))}
            </div>
          </div>
          <div>
            <h4 className="text-sm font-medium text-white mb-3">Info</h4>
            <div className="space-y-2">
              <Link href="/methodology" className="block text-sm" style={{ color: '#64748b' }}>How Our Analysis Works</Link>
              <Link href="/about" className="block text-sm" style={{ color: '#64748b' }}>About</Link>
            </div>
          </div>
        </div>
        <div className="pt-6" style={{ borderTop: '1px solid #1e2a3a' }}>
          <p className="text-xs text-center" style={{ color: '#475569' }}>
            ⚠️ <strong style={{ color: '#64748b' }}>Disclaimer:</strong> MarketForecast provides data analysis and AI-generated market scenarios for informational purposes only.
            This is <strong style={{ color: '#64748b' }}>not financial advice</strong>. Past performance does not guarantee future results.
            Always conduct your own research before making any investment decisions. © 2026 MarketForecast
          </p>
        </div>
      </div>
    </footer>
  );
}

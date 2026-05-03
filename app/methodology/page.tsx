import type { Metadata } from 'next';
import Link from 'next/link';

export const metadata: Metadata = {
  title: 'Methodology — How MarketForecast Works | MarketForecast',
  description: 'Learn how MarketForecast generates price analysis and AI-powered market scenarios. Data sources, technical indicators, and important disclaimers explained.',
  alternates: { canonical: 'https://marketforecast.io/methodology' },
};

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section className="mb-10">
      <h2 className="text-xl font-semibold text-white mb-4 pb-2 border-b border-slate-700">{title}</h2>
      <div className="text-slate-300 space-y-3 leading-relaxed">{children}</div>
    </section>
  );
}


function IndicatorRow({ name, formula, interpretation }: { name: string; formula: string; interpretation: string }) {
  return (
    <div className="border-b border-slate-700 py-3 last:border-0">
      <div className="flex flex-col sm:flex-row sm:items-center gap-1 sm:gap-4">
        <span className="text-white font-medium w-40 shrink-0">{name}</span>
        <code className="text-cyan-400 text-sm bg-slate-800 px-2 py-0.5 rounded w-48 shrink-0">{formula}</code>
        <span className="text-slate-400 text-sm">{interpretation}</span>
      </div>
    </div>
  );
}

export default function MethodologyPage() {
  return (
    <div className="max-w-3xl mx-auto px-4 py-12">
      <div className="mb-10">
        <Link href="/" className="text-cyan-400 text-sm hover:underline">← Back to home</Link>
        <h1 className="text-3xl font-bold text-white mt-4 mb-3">Methodology</h1>
        <p className="text-slate-400 text-lg">
          How MarketForecast collects data, calculates technical indicators, and generates AI-powered market scenarios.
        </p>
      </div>

      <Section title="Overview">
        <p>
          MarketForecast aggregates real-time market data from multiple public APIs, computes standard technical indicators
          from price history, and generates structured market analysis using a large language model (Claude by Anthropic).
          All analysis is refreshed on a scheduled basis and cached to ensure consistent, up-to-date information.
        </p>
        <p>
          This platform is designed for informational and educational purposes. It presents data and model-generated
          analysis — not investment advice. See the <a href="#disclaimer" className="text-cyan-400 hover:underline">disclaimer section</a> below.
        </p>
      </Section>

      <Section title="Technical Indicators">
        <p>All indicators are computed from the closing price history fetched from the data sources above. No third-party indicator libraries are used — calculations are implemented directly from standard definitions.</p>
        <div className="mt-4">
          <IndicatorRow
            name="RSI (14)"
            formula="RSI = 100 − 100/(1+RS)"
            interpretation="Relative Strength Index over 14 periods. Above 70 = overbought, below 30 = oversold."
          />
          <IndicatorRow
            name="MACD"
            formula="EMA(12) − EMA(26)"
            interpretation="Moving Average Convergence Divergence. Positive = bullish momentum, negative = bearish."
          />
          <IndicatorRow
            name="Bollinger Band Position"
            formula="(Price − Lower) / (Upper − Lower)"
            interpretation="Where price sits within the 20-period Bollinger Bands. 0 = lower band, 1 = upper band, 0.5 = midpoint."
          />
          <IndicatorRow
            name="EMA50 Distance"
            formula="(Price − EMA50) / EMA50 × 100"
            interpretation="Percentage distance of current price from the 50-period Exponential Moving Average. Positive = price above EMA50."
          />
          <IndicatorRow
            name="ATR (14)"
            formula="Avg of True Range over 14 periods"
            interpretation="Average True Range measures market volatility. Higher ATR = larger expected daily price movement."
          />
        </div>
      </Section>

      <Section title="Market Regime Classification">
        <p>Each asset is assigned one of four market regimes based on the relationship between current price, EMA20, EMA50, RSI, and average daily volatility:</p>
        <ul className="mt-3 space-y-2">
          <li className="flex gap-3"><span className="badge-uptrend text-xs px-2 py-0.5 rounded-full shrink-0 self-start mt-0.5">↑ Uptrend</span><span>Price above EMA20 and EMA50, RSI above 52, low volatility. Consistent directional movement upward.</span></li>
          <li className="flex gap-3"><span className="badge-downtrend text-xs px-2 py-0.5 rounded-full shrink-0 self-start mt-0.5">↓ Downtrend</span><span>Price below EMA20 and EMA50, RSI below 48, low volatility. Consistent directional movement downward.</span></li>
          <li className="flex gap-3"><span className="badge-sideways text-xs px-2 py-0.5 rounded-full shrink-0 self-start mt-0.5">→ Sideways</span><span>No clear trend — price near moving averages with RSI in neutral zone (48–52).</span></li>
          <li className="flex gap-3"><span className="badge-chaotic text-xs px-2 py-0.5 rounded-full shrink-0 self-start mt-0.5">⚡ Chaotic</span><span>Average daily swing exceeds 4% — high volatility with no clear directional bias.</span></li>
        </ul>
      </Section>

      <Section title="AI-Generated Analysis">
        <p>
          Market scenario analysis (bull, base, bear cases) and the written summary are generated by{' '}
          <a href="https://www.anthropic.com" target="_blank" rel="noopener noreferrer" className="text-cyan-400 hover:underline">Claude</a>
          {' '}(Anthropic), a large language model. The model receives a structured prompt containing the current price,
          percentage changes, and all computed technical indicators for each asset.
        </p>
        <p>
          The AI is instructed to produce analysis in the style of a quantitative market analyst — using the provided
          data to identify conditions and plausible price targets. The three scenario probabilities (bull/base/bear)
          are model-generated estimates and must sum to 100%.
        </p>
        <p>
          AI analysis is regenerated weekly per asset and cached in Redis to control API costs and ensure consistency.
          The generation date is not currently displayed but this feature is planned.
        </p>
        <div className="bg-amber-950 border border-amber-800 rounded-lg p-4 mt-4">
          <p className="text-amber-300 text-sm font-medium mb-1">Important limitation</p>
          <p className="text-amber-400 text-sm">
            Large language models can produce plausible-sounding but incorrect analysis. AI-generated scenarios
            are not backtested, do not account for unknown future events, and should not be treated as forecasts
            with quantified accuracy. They represent one possible interpretation of the current technical picture.
          </p>
        </div>
      </Section>

      <Section title="What This Site Does Not Do">
        <ul className="space-y-2 list-disc list-inside text-slate-400">
          <li>Provide personalised investment advice or recommendations</li>
          <li>Predict future prices with any guaranteed accuracy</li>
          <li>Account for tax implications of any transactions</li>
          <li>Consider individual financial circumstances or risk tolerance</li>
          <li>Offer brokerage, custody, or trading services</li>
        </ul>
      </Section>

      <section id="disclaimer" className="bg-slate-800 border border-slate-600 rounded-xl p-6">
        <h2 className="text-lg font-semibold text-white mb-3">Disclaimer</h2>
        <p className="text-slate-400 text-sm leading-relaxed mb-3">
          All content on MarketForecast is provided for <strong className="text-slate-300">informational and educational purposes only</strong>.
          Nothing on this website constitutes financial, investment, legal, or tax advice.
        </p>
        <p className="text-slate-400 text-sm leading-relaxed mb-3">
          Investing in cryptocurrencies and commodities involves substantial risk of loss. Past performance is not
          indicative of future results. Price predictions and scenario analyses are speculative by nature and may
          not reflect future market conditions.
        </p>
        <p className="text-slate-400 text-sm leading-relaxed">
          Always conduct your own research and consult a qualified financial advisor before making any investment
          decision. MarketForecast is not a registered investment advisor and does not hold any financial regulatory licence.
        </p>
      </section>
    </div>
  );
}

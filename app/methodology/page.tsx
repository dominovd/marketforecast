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

      <Section title="The Forecast Model">
        <p>
          Every price range and every probability on this site comes from a statistical model, not from a language
          model. This distinction matters: a language model can write convincing analysis, but it cannot produce
          probabilities that mean anything numerically. Ours can, and they are checked.
        </p>
        <p>The model works in four steps:</p>
        <ol className="list-decimal list-inside space-y-2 mt-2">
          <li>
            <strong className="text-slate-200">Volatility.</strong> Daily log returns over the trailing 180 days are
            converted into an exponentially weighted volatility estimate (RiskMetrics, λ=0.94), so recent market
            conditions count for more than old ones.
          </li>
          <li>
            <strong className="text-slate-200">Horizon.</strong> That daily volatility is scaled to the 30-day
            forecast horizon by the square root of time, and given a Student-t shape so that large moves are not
            treated as impossible the way a normal distribution would treat them.
          </li>
          <li>
            <strong className="text-slate-200">Levels.</strong> Scenario boundaries are real technical levels — the
            recent swing high and swing low — rather than arbitrary round numbers.
          </li>
          <li>
            <strong className="text-slate-200">Probabilities.</strong> The probability of each scenario is the
            probability mass the fitted distribution places above the resistance level, between the two levels, and
            below the support level. This is why the numbers are rarely round, and why they differ between assets.
          </li>
        </ol>
        <p className="mt-3">
          The central forecast is deliberately close to the current price. Over a 30-day horizon, a random walk is an
          extremely difficult benchmark to beat on point accuracy, and models that claim to beat it usually do so by
          extrapolating recent trends — which measurably increases error. What the model does claim to get right is
          the <em>width</em> of the range and the probabilities attached to it.
        </p>
      </Section>

      <Section title="How We Check the Model">
        <p>
          The model is scored by walk-forward backtesting. For each historical date, the forecast is rebuilt using
          only the prices available on that date, then compared against what actually happened 30 days later. The
          model never sees the outcome it is being graded on.
        </p>
        <p>
          Because we forecast a distribution rather than a single number, the meaningful test is calibration: when the
          model says there is an 80% chance the price lands in a given range, does that happen about 80% of the time?
          Measured against a simulated market with volatility clustering and fat tails, the nominal 80% band contained
          the outcome 80.7% of the time, and the nominal 50% band 50.4% of the time.
        </p>
        <p>
          For comparison over the same test set, the model&apos;s point error matched a random walk (8.91% vs 8.91%
          median absolute error — as expected, since it does not claim to beat one), while naive trend extrapolation
          was substantially worse at 12.80%.
        </p>
        <div className="bg-amber-950 border border-amber-800 rounded-lg p-4 mt-4">
          <p className="text-amber-300 text-sm font-medium mb-1">Honest limitations</p>
          <ul className="text-amber-400 text-sm space-y-1 list-disc list-inside">
            <li>Calibration figures above come from simulation, not from a live public track record. We are recording
              every forecast we publish so that a real one can be reported here over time.</li>
            <li>The model knows nothing about news, regulation, hacks, or macro announcements. It extrapolates
              volatility, and any event outside that is by definition outside the model.</li>
            <li>Volatility estimates react to changes with a lag. A sudden shift in regime will make the bands too
              narrow until the estimate catches up.</li>
            <li>Probabilities are conditional on the model being right about the shape of the distribution. They are
              not guarantees, and no probability on this site is ever 0% or 100%.</li>
          </ul>
        </div>
      </Section>

      <Section title="Written Commentary">
        <p>
          The prose accompanying each forecast is written by{' '}
          <a href="https://www.anthropic.com" target="_blank" rel="noopener noreferrer" className="text-cyan-400 hover:underline">Claude</a>
          {' '}(Anthropic). It receives the model&apos;s output — the levels, the ranges, the probabilities — and is
          instructed to explain them, not to produce its own. Targets and probabilities shown on the page are taken
          from the model regardless of what the language model returns, so the commentary cannot introduce numbers
          the model did not generate.
        </p>
        <p>
          Commentary is regenerated weekly per asset and cached, while the numbers themselves are recomputed from
          live prices on every refresh. If the language model is unavailable, a deterministic template describes the
          same figures.
        </p>
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

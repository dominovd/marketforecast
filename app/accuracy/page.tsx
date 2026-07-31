import type { Metadata } from 'next';
import Link from 'next/link';
import { getScorecard, getCalibrationBins, getPendingCount, ledgerConfigured } from '@/lib/db/ledger';

export const revalidate = 3600;

export const metadata: Metadata = {
  title: 'Forecast Accuracy — Our Public Track Record | MarketForecast',
  description:
    'Every forecast MarketForecast publishes is recorded and scored against what actually happened. Calibration, hit rates, and comparison against a random-walk baseline.',
  alternates: { canonical: 'https://marketforecast.io/accuracy' },
};

function pct(x: number | null | undefined, digits = 1): string {
  if (x === null || x === undefined || !isFinite(x)) return '—';
  return `${(x * 100).toFixed(digits)}%`;
}

function num(x: number | null | undefined, digits = 2): string {
  if (x === null || x === undefined || !isFinite(x)) return '—';
  return x.toFixed(digits);
}

/** Colour a coverage figure by how far it sits from its nominal target. */
function coverageColor(observed: number, nominal: number): string {
  const gap = Math.abs(observed - nominal);
  if (gap <= 0.05) return '#10b981';
  if (gap <= 0.12) return '#f59e0b';
  return '#ef4444';
}

function Empty({ pending }: { pending: number }) {
  return (
    <div className="card p-6" style={{ borderColor: 'rgba(59,130,246,0.3)' }}>
      <h2 className="font-semibold text-white mb-2">The record is still being built</h2>
      <p className="text-sm mb-3" style={{ color: '#94a3b8' }}>
        {pending > 0 ? (
          <>
            <strong className="text-white">{pending}</strong> forecast{pending === 1 ? ' has' : 's have'} been logged
            and {pending === 1 ? 'is' : 'are'} waiting out their 30-day horizon. The first scores will appear here
            once those horizons elapse.
          </>
        ) : (
          <>No forecasts have been logged yet. Once the daily job runs, every published forecast is written to an
            append-only ledger and scored automatically when its horizon elapses.</>
        )}
      </p>
      <p className="text-sm" style={{ color: '#64748b' }}>
        We are not backfilling this table with simulated results. It will stay empty until real published forecasts
        have actually matured — a scorecard you can only populate by waiting is the only kind worth showing.
      </p>
    </div>
  );
}

export default async function AccuracyPage() {
  const configured = ledgerConfigured();
  const [scorecard, bins, pending] = configured
    ? await Promise.all([getScorecard(), getCalibrationBins(), getPendingCount()])
    : [[], [], 0];

  const totalResolved = scorecard.reduce((a, r) => a + Number(r.resolved_count), 0);

  // Sample-weighted aggregates across every asset.
  const agg = totalResolved > 0 ? {
    coverage80: scorecard.reduce((a, r) => a + Number(r.coverage80) * Number(r.resolved_count), 0) / totalResolved,
    coverage50: scorecard.reduce((a, r) => a + Number(r.coverage50) * Number(r.resolved_count), 0) / totalResolved,
    brier: scorecard.reduce((a, r) => a + Number(r.mean_brier) * Number(r.resolved_count), 0) / totalResolved,
    ape: scorecard.reduce((a, r) => a + Number(r.median_abs_pct_error) * Number(r.resolved_count), 0) / totalResolved,
    apeRw: scorecard.reduce((a, r) => a + Number(r.median_ape_random_walk) * Number(r.resolved_count), 0) / totalResolved,
  } : null;

  return (
    <div className="max-w-5xl mx-auto px-4 sm:px-6 py-12">
      <div className="mb-8">
        <Link href="/" className="text-sm hover:underline" style={{ color: '#60a5fa' }}>← Back to home</Link>
        <h1 className="text-3xl font-bold text-white mt-4 mb-3">Forecast Accuracy</h1>
        <p className="text-lg" style={{ color: '#94a3b8' }}>
          Every forecast published on this site is written to an append-only ledger the moment it is generated, then
          scored against what actually happened once its 30-day horizon elapses. This page is that record.
        </p>
      </div>

      {/* What "accurate" means here — placed before the numbers on purpose. */}
      <div className="card p-5 mb-8">
        <h2 className="font-semibold text-white mb-3">What is being measured</h2>
        <div className="space-y-3 text-sm" style={{ color: '#94a3b8' }}>
          <p>
            We forecast a <strong className="text-slate-200">range with a probability</strong>, not a single number.
            So the question is not &quot;was the price right&quot; — it is <strong className="text-slate-200">calibration</strong>:
            when we say 80%, does it happen 80% of the time?
          </p>
          <p>
            The central estimate deliberately sits close to the current price. Over a 30-day horizon a random walk is
            very hard to beat, and models that appear to beat it usually do so by extrapolating recent trends, which
            measurably increases error. We report our point error next to a random walk&apos;s so you can see we are
            matching it rather than claiming to beat it.
          </p>
        </div>
      </div>

      {!configured || totalResolved === 0 ? (
        <Empty pending={pending} />
      ) : (
        <>
          {/* Headline aggregates */}
          <div className="grid grid-cols-2 lg:grid-cols-4 gap-4 mb-8">
            <div className="card p-4">
              <p className="text-xs mb-1" style={{ color: '#64748b' }}>80% band coverage</p>
              <p className="text-2xl font-bold" style={{ color: coverageColor(agg!.coverage80, 0.8) }}>
                {pct(agg!.coverage80)}
              </p>
              <p className="text-xs mt-1" style={{ color: '#475569' }}>target 80.0%</p>
            </div>
            <div className="card p-4">
              <p className="text-xs mb-1" style={{ color: '#64748b' }}>50% band coverage</p>
              <p className="text-2xl font-bold" style={{ color: coverageColor(agg!.coverage50, 0.5) }}>
                {pct(agg!.coverage50)}
              </p>
              <p className="text-xs mt-1" style={{ color: '#475569' }}>target 50.0%</p>
            </div>
            <div className="card p-4">
              <p className="text-xs mb-1" style={{ color: '#64748b' }}>Median error</p>
              <p className="text-2xl font-bold text-white">{num(agg!.ape)}%</p>
              <p className="text-xs mt-1" style={{ color: '#475569' }}>random walk {num(agg!.apeRw)}%</p>
            </div>
            <div className="card p-4">
              <p className="text-xs mb-1" style={{ color: '#64748b' }}>Resolved forecasts</p>
              <p className="text-2xl font-bold text-white">{totalResolved}</p>
              <p className="text-xs mt-1" style={{ color: '#475569' }}>{pending} pending</p>
            </div>
          </div>

          {/* Reliability curve */}
          {bins.length > 0 && (
            <div className="card p-5 mb-8">
              <h2 className="font-semibold text-white mb-1">Reliability</h2>
              <p className="text-xs mb-4" style={{ color: '#64748b' }}>
                Forecasts grouped by the probability we stated. Perfect calibration means observed frequency equals
                stated probability in every bucket.
              </p>
              <div className="space-y-2">
                {bins.filter(b => Number(b.n) > 0).map(b => {
                  const predicted = Number(b.mean_predicted);
                  const observed = Number(b.observed_frequency);
                  return (
                    <div key={b.bucket} className="flex items-center gap-3 text-xs">
                      <span className="w-20 shrink-0" style={{ color: '#94a3b8' }}>
                        {pct(predicted, 0)} stated
                      </span>
                      <div className="flex-1 h-5 rounded relative" style={{ background: '#1e2a3a' }}>
                        <div className="h-5 rounded" style={{
                          width: `${Math.min(100, observed * 100)}%`,
                          background: coverageColor(observed, predicted),
                          opacity: 0.75,
                        }} />
                        <div className="absolute top-0 h-5 w-px" style={{
                          left: `${Math.min(100, predicted * 100)}%`, background: '#e2e8f0',
                        }} />
                      </div>
                      <span className="w-24 shrink-0 text-right" style={{ color: '#cbd5e1' }}>
                        {pct(observed, 0)} actual
                      </span>
                      <span className="w-14 shrink-0 text-right" style={{ color: '#475569' }}>n={b.n}</span>
                    </div>
                  );
                })}
              </div>
              <p className="text-xs mt-3" style={{ color: '#475569' }}>
                The white tick marks where the bar would end under perfect calibration.
              </p>
            </div>
          )}

          {/* Per-asset breakdown */}
          <div className="card overflow-hidden mb-8">
            <div className="px-4 py-3" style={{ borderBottom: '1px solid #1e2a3a' }}>
              <h2 className="font-semibold text-white">By asset</h2>
            </div>
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="text-xs" style={{ color: '#475569' }}>
                    <th className="text-left px-4 py-2 font-medium">Asset</th>
                    <th className="text-right px-3 py-2 font-medium">n</th>
                    <th className="text-right px-3 py-2 font-medium">80% band</th>
                    <th className="text-right px-3 py-2 font-medium">50% band</th>
                    <th className="text-right px-3 py-2 font-medium">Med. error</th>
                    <th className="text-right px-3 py-2 font-medium">vs walk</th>
                    <th className="text-right px-4 py-2 font-medium">Brier</th>
                  </tr>
                </thead>
                <tbody>
                  {scorecard.map(r => (
                    <tr key={`${r.slug}-${r.horizon_days}`} style={{ borderTop: '1px solid #1e2a3a' }}>
                      <td className="px-4 py-2.5">
                        <Link
                          href={`/${r.category === 'crypto' ? 'crypto' : 'commodities'}/${r.slug}-price-prediction-2026`}
                          className="text-white hover:underline capitalize"
                        >
                          {r.slug.replace(/-/g, ' ')}
                        </Link>
                      </td>
                      <td className="text-right px-3 py-2.5" style={{ color: '#64748b' }}>{r.resolved_count}</td>
                      <td className="text-right px-3 py-2.5 font-medium"
                        style={{ color: coverageColor(Number(r.coverage80), 0.8) }}>
                        {pct(Number(r.coverage80))}
                      </td>
                      <td className="text-right px-3 py-2.5 font-medium"
                        style={{ color: coverageColor(Number(r.coverage50), 0.5) }}>
                        {pct(Number(r.coverage50))}
                      </td>
                      <td className="text-right px-3 py-2.5 text-white">{num(Number(r.median_abs_pct_error))}%</td>
                      <td className="text-right px-3 py-2.5" style={{ color: '#64748b' }}>
                        {num(Number(r.median_ape_random_walk))}%
                      </td>
                      <td className="text-right px-4 py-2.5" style={{ color: '#94a3b8' }}>
                        {num(Number(r.mean_brier), 3)}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        </>
      )}

      {/* Caveats */}
      <div className="rounded-xl p-5 mt-8"
        style={{ background: 'rgba(245,158,11,0.06)', border: '1px solid rgba(245,158,11,0.15)' }}>
        <p className="text-sm font-medium mb-2" style={{ color: '#f59e0b' }}>How to read this honestly</p>
        <ul className="text-sm space-y-1.5 list-disc list-inside" style={{ color: '#94a3b8' }}>
          <li>Small samples mean little. A coverage figure over a handful of resolved forecasts is noise; treat
            anything under ~30 samples per asset as indicative only.</li>
          <li>Overlapping horizons are correlated. Consecutive daily forecasts share most of their 30-day window, so
            the effective sample size is well below the raw count.</li>
          <li>Good calibration in a calm market says little about a violent one. Volatility estimates lag regime
            changes, and the bands will be too narrow until they catch up.</li>
          <li>None of this makes any individual forecast reliable. A well-calibrated 70% is still wrong 30% of the
            time, and that is the point of publishing the number rather than a headline price.</li>
        </ul>
      </div>

      <p className="text-xs mt-6" style={{ color: '#475569' }}>
        Methodology and model details are on the <Link href="/methodology" className="hover:underline" style={{ color: '#60a5fa' }}>methodology page</Link>.
        Forecasts are logged daily and scored automatically; nothing on this page is entered by hand.
      </p>
    </div>
  );
}

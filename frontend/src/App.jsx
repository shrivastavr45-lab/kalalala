import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  Activity, AlertCircle, ArrowDownRight, ArrowUpRight, BarChart3, CheckCircle2,
  Clock3, Database, Download, ExternalLink, Gauge, GitCompareArrows, Printer,
  RefreshCw, Wind,
} from 'lucide-react';
import {
  Bar, BarChart, CartesianGrid, Cell, ComposedChart, Legend, Line, LineChart, ReferenceLine,
  ResponsiveContainer, Tooltip, XAxis, YAxis,
} from 'recharts';
import { fetchAnalysis, fetchCutoffComparison, fetchMonthlyOverview } from './services/api.js';
import { serializeCsv } from './services/csv.js';
import { dailyIntervalExport, monthlySummaryExport, cutoffComparisonExport } from './services/reports.js';

const DAY_OPTIONS = Array.from({ length: 31 }, (_, index) => {
  const day = String(index + 1).padStart(2, '0');
  return { value: `2026-01-${day}`, label: new Date(Date.UTC(2026, 0, index + 1)).toLocaleDateString('en-GB', { day: '2-digit', month: 'short', timeZone: 'UTC' }) };
});
const CUTOFF_OPTIONS = Array.from({ length: 24 }, (_, hour) => `${String(hour).padStart(2, '0')}:00`).concat(['16:30', '17:30', '18:00', '19:00', '20:00', '21:00', '22:00', '23:00']).filter((value, index, all) => all.indexOf(value) === index).sort();
const DEFAULT_COMPARISON_CUTOFFS = ['12:00', '14:00', '16:00', '18:00'];

const fmt = (value, digits = 0) => value == null || !Number.isFinite(Number(value))
  ? 'N/A'
  : Number(value).toLocaleString('en-GB', { maximumFractionDigits: digits, minimumFractionDigits: digits });
const fmtMetric = (value) => value == null ? 'N/A' : fmt(value, 1);
const fmtDateTime = (value) => {
  if (!value) return 'N/A';
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return 'N/A';
  return date.toLocaleString('en-GB', { day: '2-digit', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit', timeZone: 'Europe/London', timeZoneName: 'short' });
};


function downloadCsv(filename, headers, rows) {
  const csv = serializeCsv(headers, rows);
  const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.download = filename;
  document.body.appendChild(link);
  link.click();
  link.remove();
  window.setTimeout(() => URL.revokeObjectURL(url), 1000);
}

function StatusText({ status }) {
  const label = status === 'error' ? 'Retrieval failed' : status === 'not_attempted' ? 'Not attempted' : 'Retrieved';
  return <span className={`report-status report-status-${status || 'unknown'}`}>{label}</span>;
}

function MetricCell({ value }) {
  return <>{value == null ? 'N/A' : fmt(value, 1)}</>;
}

function MetricCard({ icon: Icon, label, value, unit, helper, tone = 'navy' }) {
  return (
    <article className="metric-card">
      <div className={`metric-icon ${tone}`}><Icon size={18} strokeWidth={2.1} /></div>
      <div className="metric-label">{label}</div>
      <div className="metric-value">{value}<span>{unit}</span></div>
      <div className="metric-helper">{helper}</div>
    </article>
  );
}

function SectionTitle({ eyebrow, title, description, trailing }) {
  return (
    <div className="section-title-row">
      <div>
        <div className="eyebrow">{eyebrow}</div>
        <h2>{title}</h2>
        {description && <p>{description}</p>}
      </div>
      {trailing}
    </div>
  );
}

function ChartTooltip({ active, payload, label }) {
  if (!active || !payload?.length) return null;
  const row = payload[0]?.payload ?? {};
  return (
    <div className="chart-tooltip">
      <strong>{label}</strong>
      <div className="tooltip-row"><span className="dot forecast-dot" />Forecast <b>{fmt(row.forecast_mw, 0)} MW</b></div>
      <div className="tooltip-row"><span className="dot actual-dot" />Actual <b>{fmt(row.actual_mw, 0)} MW</b></div>
      <div className="tooltip-divider" />
      <div className="tooltip-row"><span>Forecast error</span><b>{row.error_mw == null ? 'N/A' : `${row.error_mw > 0 ? '+' : ''}${fmt(row.error_mw, 0)} MW`}</b></div>
      <div className="tooltip-published">Forecast published: {row.forecast_publish_time_display || 'No eligible forecast'}</div>
    </div>
  );
}

function EmptyChart({ title = 'No data to chart yet' }) {
  return <div className="empty-chart"><div className="empty-chart-icon"><BarChart3 size={24} /></div><strong>{title}</strong><span>When Elexon data is returned, the chart will appear here.</span></div>;
}

export default function App() {
  const [deliveryDate, setDeliveryDate] = useState('2026-01-14');
  const [cutoffTime, setCutoffTime] = useState('16:00');
  const [viewMode, setViewMode] = useState('daily');
  const [monthCutoff, setMonthCutoff] = useState('16:00');
  const [monthlyRequest, setMonthlyRequest] = useState(null);
  const [monthlyData, setMonthlyData] = useState(null);
  const [monthlyLoading, setMonthlyLoading] = useState(false);
  const [monthlyError, setMonthlyError] = useState('');
  const [compareCutoffText, setCompareCutoffText] = useState(DEFAULT_COMPARISON_CUTOFFS.join(', '));
  const [comparisonRequest, setComparisonRequest] = useState(null);
  const [comparisonData, setComparisonData] = useState(null);
  const [comparisonLoading, setComparisonLoading] = useState(false);
  const [comparisonError, setComparisonError] = useState('');
  const [comparisonInputError, setComparisonInputError] = useState('');
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState('');
  const dailyControllerRef = useRef(null);

  const load = useCallback(async (force = false, suppliedController = null) => {
    dailyControllerRef.current?.abort();
    const controller = suppliedController ?? new AbortController();
    const signal = controller.signal;
    dailyControllerRef.current = controller;
    if (force) setRefreshing(true); else { setLoading(true); setRefreshing(false); setData(null); }
    setError('');
    try {
      const result = await fetchAnalysis({ date: deliveryDate, cutoffTime, refresh: force, signal });
      if (!signal.aborted && dailyControllerRef.current === controller) setData(result);
    } catch (err) {
      if (err.name !== 'AbortError' && !signal.aborted && dailyControllerRef.current === controller) {
        setError(err.message || 'Unable to load Elexon data.');
        setData(null);
      }
    } finally {
      if (!signal.aborted && dailyControllerRef.current === controller) {
        setLoading(false);
        setRefreshing(false);
        dailyControllerRef.current = null;
      }
    }
  }, [deliveryDate, cutoffTime]);

  useEffect(() => {
    if (viewMode !== 'daily') return undefined;
    const controller = new AbortController();
    load(false, controller);
    return () => {
      controller.abort();
      dailyControllerRef.current?.abort();
      if (dailyControllerRef.current === controller) dailyControllerRef.current = null;
    };
  }, [load, viewMode]);

  useEffect(() => {
    if (viewMode !== 'monthly' || !monthlyRequest) return undefined;
    const controller = new AbortController();
    setMonthlyLoading(true);
    setMonthlyError('');
    fetchMonthlyOverview({ cutoffTime: monthlyRequest.cutoffTime, refresh: monthlyRequest.refresh, signal: controller.signal })
      .then((result) => { if (!controller.signal.aborted) setMonthlyData(result); })
      .catch((err) => {
        if (err.name !== 'AbortError') {
          setMonthlyError(err.message || 'Unable to load the monthly overview.');
          setMonthlyData(null);
        }
      })
      .finally(() => { if (!controller.signal.aborted) setMonthlyLoading(false); });
    return () => controller.abort();
  }, [viewMode, monthlyRequest]);

  useEffect(() => {
    if (viewMode !== 'comparison' || !comparisonRequest) return undefined;
    const controller = new AbortController();
    setComparisonLoading(true);
    setComparisonError('');
    fetchCutoffComparison({ ...comparisonRequest, signal: controller.signal })
      .then((result) => { if (!controller.signal.aborted) setComparisonData(result); })
      .catch((err) => {
        if (err.name !== 'AbortError') {
          setComparisonError(err.message || 'Unable to load cutoff comparison.');
          setComparisonData(null);
        }
      })
      .finally(() => { if (!controller.signal.aborted) setComparisonLoading(false); });
    return () => controller.abort();
  }, [viewMode, comparisonRequest]);

  const observations = data?.observations ?? [];
  const metrics = data?.metrics ?? {};
  const coverage = data?.coverage ?? {};
  const provenance = data?.provenance ?? {};
  const matchPercent = coverage.expected_intervals ? Math.round((coverage.matched_intervals / coverage.expected_intervals) * 100) : 0;
  const chartData = useMemo(() => observations.map((row) => ({ ...row, time: row.delivery_time, forecast: row.forecast_mw, actual: row.actual_mw, error: row.error_mw })), [observations]);

  const exportCsv = () => {
    if (!data || !observations.length) return;
    const report = dailyIntervalExport(data);
    downloadCsv(report.filename, report.headers, report.rows);
  };

  const exportMonthlyCsv = () => {
    if (!monthlyData?.daily?.length) return;
    const report = monthlySummaryExport(monthlyData);
    downloadCsv(report.filename, report.headers, report.rows);
  };

  const exportComparisonCsv = () => {
    if (!comparisonData?.cutoffs?.length) return;
    const report = cutoffComparisonExport(comparisonData);
    downloadCsv(report.filename, report.headers, report.rows);
  };

  const chooseView = (nextView) => {
    setViewMode(nextView);
    if (nextView === 'monthly') {
      setMonthlyRequest({ cutoffTime: monthCutoff, refresh: false, key: Date.now() });
    }
    if (nextView === 'comparison') {
      const parsed = compareCutoffText.split(',').map((value) => value.trim()).filter(Boolean);
      setComparisonRequest({ date: deliveryDate, cutoffTimes: parsed.length ? parsed : DEFAULT_COMPARISON_CUTOFFS, refresh: false, key: Date.now() });
    }
  };

  const runComparison = (refresh = false) => {
    const parsed = compareCutoffText.split(',').map((value) => value.trim()).filter(Boolean);
    const format = /^(?:[01]\d|2[0-3]):[0-5]\d$/;
    if (parsed.length < 2 || parsed.length > 8) {
      setComparisonInputError('Enter between 2 and 8 cutoff times.');
      return;
    }
    if (parsed.some((value) => !format.test(value))) {
      setComparisonInputError('Use 24-hour HH:MM times, separated by commas.');
      return;
    }
    if (new Set(parsed).size !== parsed.length) {
      setComparisonInputError('Cutoff times must be unique. Remove duplicates before comparing.');
      return;
    }
    setComparisonInputError('');
    setComparisonRequest({ date: deliveryDate, cutoffTimes: parsed, refresh, key: Date.now() });
  };

  return (
    <div className="app-shell" data-view={viewMode}>
      <a className="skip-link" href="#main-content">Skip to analysis</a>
      <aside className="sidebar" aria-label="Wind Forecast Intelligence workspace">
        <div className="brand-lockup">
          <div className="brand-mark"><Wind size={23} strokeWidth={2.4} /></div>
          <div className="brand-name">Wind Forecast<span>Intelligence</span></div>
        </div>
        <div className="sidebar-kicker">ANALYSIS WORKSPACE</div>
        <nav className="workspace-nav" aria-label="Analysis workspace">
          <button type="button" className={`side-link ${viewMode === 'daily' ? 'active' : ''}`} aria-current={viewMode === 'daily' ? 'page' : undefined} onClick={() => chooseView('daily')}><Activity size={17} /><span>Daily analysis</span>{viewMode === 'daily' && <span className="side-active-dot" />}</button>
          <button type="button" className={`side-link ${viewMode === 'monthly' ? 'active' : ''}`} aria-current={viewMode === 'monthly' ? 'page' : undefined} onClick={() => chooseView('monthly')}><BarChart3 size={17} /><span>January overview</span>{viewMode === 'monthly' && <span className="side-active-dot" />}</button>
          <button type="button" className={`side-link ${viewMode === 'comparison' ? 'active' : ''}`} aria-current={viewMode === 'comparison' ? 'page' : undefined} onClick={() => chooseView('comparison')}><GitCompareArrows size={17} /><span>Cutoff comparison</span>{viewMode === 'comparison' && <span className="side-active-dot" />}</button>
        </nav>
        <div className="sidebar-kicker sidebar-kicker-spaced">SOURCE DATASETS</div>
        <div className="side-link muted static-link"><Database size={17} /><span>FUELHH and WINDFOR</span></div>
        <div className="sidebar-bottom">
          <div className="live-indicator"><span className="live-dot" /><span>Elexon API</span><b>Public</b></div>
          <div className="sidebar-footer">ANALYTICS ENVIRONMENT<br /><span>Historical review · Jan 2026</span></div>
        </div>
      </aside>

      <main className="main-content" id="main-content" tabIndex={-1}>
        <header className="topbar">
          <div className="breadcrumbs"><span>Energy analytics</span><span className="crumb-slash">/</span><strong>Wind Forecast Intelligence</strong></div>
          <div className="topbar-right"><span className="topbar-period"><span className="period-dot" />JANUARY 2026 DATASET</span><span className="topbar-divider" /><span className="timezone-label"><Clock3 size={14} /> Europe/London</span></div>
        </header>

        <div className="page-wrap">
          <section className="page-intro editorial-intro" aria-labelledby="page-title">
            <div className="intro-copy">
              <div className="eyebrow">UK WIND GENERATION <span className="eyebrow-line" /> HISTORICAL REVIEW</div>
              <h1 id="page-title">Forecasts against <span>actual generation</span></h1>
              <p>Evaluate January 2026 wind forecasts at a defined decision cutoff. Review interval errors, missing data, coverage, and source provenance in one place.</p>
            </div>
            <aside className="intro-badge" aria-label="Analysis scope">
              <div className="intro-badge-icon"><Gauge size={20} /></div>
              <div className="intro-badge-copy"><span className="scope-label">ANALYSIS PERIOD</span><strong>01 to 31 January 2026</strong><span>30-minute delivery intervals</span><span>Business timezone: Europe/London</span></div>
            </aside>
          </section>

          <nav className="analysis-tabs" aria-label="Analysis views">
            <button type="button" className={viewMode === 'daily' ? 'selected' : ''} aria-current={viewMode === 'daily' ? 'page' : undefined} aria-pressed={viewMode === 'daily'} onClick={() => chooseView('daily')}>Daily Analysis</button>
            <button type="button" className={viewMode === 'monthly' ? 'selected' : ''} aria-current={viewMode === 'monthly' ? 'page' : undefined} aria-pressed={viewMode === 'monthly'} onClick={() => chooseView('monthly')}>January Overview</button>
            <button type="button" className={viewMode === 'comparison' ? 'selected' : ''} aria-current={viewMode === 'comparison' ? 'page' : undefined} aria-pressed={viewMode === 'comparison'} onClick={() => chooseView('comparison')}>Cutoff Comparison</button>
            <button type="button" className="print-button" onClick={() => window.print()}><Printer size={15} /> Print report</button>
          </nav>
          <section className="print-report-heading" aria-label="Printed report context">
            <h1>Wind Forecast Intelligence</h1>
            {viewMode === 'daily' && <p>Daily analysis. Delivery date: {deliveryDate}. Previous-day cutoff: {cutoffTime} Europe/London. Metrics use forecast minus actual over valid matched pairs.</p>}
            {viewMode === 'monthly' && <p>January 2026 performance overview. Previous-day cutoff: {monthCutoff} Europe/London. Monthly metrics pool all valid interval-level pairs, not averages of daily metrics.</p>}
            {viewMode === 'comparison' && <p>Forecast cutoff comparison. Delivery date: {deliveryDate}. Cutoff scenarios: {compareCutoffText}. Each scenario selects eligible forecasts independently. Metrics use forecast minus actual over valid matched pairs.</p>}
          </section>

          {viewMode === 'daily' && <section className="control-panel" aria-label="Daily analysis controls">
            <div className="control-title"><div className="control-heading-icon"><Activity size={18} /></div><div><strong>Analysis parameters</strong><span>Choose the delivery day and forecast decision cutoff.</span></div></div>
            <div className="control-fields">
              <label className="control-group"><span>DELIVERY DATE</span><select value={deliveryDate} onChange={(event) => setDeliveryDate(event.target.value)}>{DAY_OPTIONS.map((day) => <option key={day.value} value={day.value}>{day.value} · {day.label}</option>)}</select></label>
              <label className="control-group cutoff-control"><span>DECISION CUTOFF <span className="info-dot" title="Cutoff is interpreted on the previous day in Europe/London time.">i</span></span><select value={cutoffTime} onChange={(event) => setCutoffTime(event.target.value)}>{CUTOFF_OPTIONS.map((option) => <option key={option} value={option}>{option} UK time</option>)}</select></label>
              <button className="refresh-button" onClick={() => load(true)} disabled={loading || refreshing}><RefreshCw size={16} className={refreshing ? 'spin' : ''} />{refreshing ? 'Refreshing…' : 'Refresh data'}</button>
            </div>
            <div className="cutoff-note"><Clock3 size={13} /><span>Eligible forecast publications: <b>on or before {data?.cutoff_datetime ? fmtDateTime(data.cutoff_datetime) : `${new Date(new Date(`${deliveryDate}T00:00:00Z`).getTime() - 86400000).toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric', timeZone: 'UTC' })} at ${cutoffTime} UK time`}</b>. Publications after this time are excluded.</span></div>
          </section>}

          {viewMode === 'monthly' && <section className="report-view" aria-labelledby="monthly-title">
            <div className="report-heading"><div><div className="eyebrow">JANUARY 2026 / 31 DELIVERY DATES</div><h2 id="monthly-title">Monthly performance overview</h2><p>Daily errors, pooled monthly metrics, matched-pair coverage, and explicitly flagged incomplete or high-error days.</p></div><div className="report-actions"><label className="report-control"><span>Previous-day cutoff</span><select value={monthCutoff} onChange={(event) => { setMonthCutoff(event.target.value); setMonthlyData(null); setMonthlyRequest({ cutoffTime: event.target.value, refresh: false, key: Date.now() }); }}>{CUTOFF_OPTIONS.map((option) => <option key={option} value={option}>{option} UK time</option>)}</select></label><button type="button" className="export-button" onClick={() => { setMonthlyData(null); setMonthlyRequest({ cutoffTime: monthCutoff, refresh: true, key: Date.now() }); }} disabled={monthlyLoading}><RefreshCw size={14} /> Refresh</button><button type="button" className="export-button" onClick={exportMonthlyCsv} disabled={!monthlyData?.daily?.length}><Download size={14} /> Daily summary CSV</button></div></div>
            {monthlyError && <div className="error-banner" role="alert"><div className="error-icon"><AlertCircle size={19} /></div><div className="error-text"><strong>Could not load monthly overview</strong><p>{monthlyError}</p><span>No substitute data is displayed.</span></div></div>}
            {monthlyLoading && <div className="report-state"><span className="status-spinner" /> Retrieving January data with bounded concurrency. This view does not substitute sample values.</div>}
            {monthlyData && <>
              {monthlyData.partial && <div className="report-warning" role="status"><AlertCircle size={16} /><div><strong>Partial month retrieval</strong><p>{monthlyData.coverage.days_retrieved} of 31 delivery dates returned successfully. Monthly metrics use only valid interval pairs from retrieved dates. Missing dates remain visible below.</p></div></div>}
              <div className="report-metric-grid">
                <MetricCard icon={Activity} label="Pooled monthly MAE" value={fmtMetric(monthlyData.monthly_metrics?.mae)} unit={monthlyData.monthly_metrics?.mae == null ? '' : ' MW'} helper={`${monthlyData.monthly_metrics?.valid_count ?? 0} valid matched pairs`} tone="blue" />
                <MetricCard icon={Gauge} label="Pooled monthly RMSE" value={fmtMetric(monthlyData.monthly_metrics?.rmse)} unit={monthlyData.monthly_metrics?.rmse == null ? '' : ' MW'} helper="Calculated from interval errors, not daily RMSE averages" tone="navy" />
                <MetricCard icon={monthlyData.monthly_metrics?.bias == null ? Activity : monthlyData.monthly_metrics.bias >= 0 ? ArrowUpRight : ArrowDownRight} label="Pooled monthly bias" value={monthlyData.monthly_metrics?.bias == null ? 'N/A' : `${monthlyData.monthly_metrics.bias > 0 ? '+' : ''}${fmt(monthlyData.monthly_metrics.bias, 1)}`} unit={monthlyData.monthly_metrics?.bias == null ? '' : ' MW'} helper="Forecast minus actual, pooled by interval" tone="green" />
                <article className="metric-card coverage-card"><div className="metric-topline"><div className="metric-icon teal"><CheckCircle2 size={18} /></div><span className="coverage-percent">{fmt(monthlyData.coverage?.coverage_pct, 1)}%</span></div><div className="metric-label">Month matched coverage</div><div className="metric-value coverage-value">{monthlyData.coverage?.valid_matched_intervals ?? 0}<span> / {monthlyData.coverage?.expected_intervals ?? 1488}</span></div><div className="coverage-track"><span style={{ width: `${Math.min(100, monthlyData.coverage?.coverage_pct ?? 0)}%` }} /></div><div className="metric-helper">{monthlyData.coverage?.days_retrieved ?? 0} / 31 dates retrieved</div></article>
              </div>
              <div className="report-chart-grid">
                <article className="panel report-panel"><SectionTitle eyebrow="DAILY ERROR TREND" title="MAE, RMSE and bias" description="Each point represents one delivery date. Gaps indicate dates that could not be retrieved." trailing={<span className="chart-unit-pill">MW</span>} /><div className="report-chart"><ResponsiveContainer width="100%" height="100%"><LineChart data={monthlyData.daily} margin={{ top: 12, right: 12, left: 5, bottom: 6 }}><CartesianGrid stroke="#dce8de" vertical={false} strokeDasharray="3 4"/><XAxis dataKey="delivery_date" tick={{ fill: '#61796c', fontSize: 9 }} tickLine={false} axisLine={false} interval={2} tickFormatter={(value) => value.slice(-2)}/><YAxis tick={{ fill: '#61796c', fontSize: 10 }} tickLine={false} axisLine={false} width={48}/><Tooltip labelFormatter={(value) => `Delivery date ${value}`} formatter={(value) => [value == null ? 'N/A' : `${fmt(value, 1)} MW`]} contentStyle={{ borderRadius: 4, border: '1px solid #cfe0d3', fontSize: 12 }}/><Legend/><Line dataKey="metrics.mae" name="MAE" type="monotone" stroke="#2e7484" connectNulls={false} dot={false} strokeWidth={2}/><Line dataKey="metrics.rmse" name="RMSE" type="monotone" stroke="#16846f" connectNulls={false} dot={false} strokeWidth={2}/><Line dataKey="metrics.bias" name="Bias" type="monotone" stroke="#bd7c39" connectNulls={false} dot={false} strokeWidth={2}/></LineChart></ResponsiveContainer></div></article>
                <article className="panel report-panel"><SectionTitle eyebrow="MATCHED COVERAGE" title="Coverage by date" description="Valid forecast and actual pairs divided by 48 expected delivery intervals."/><div className="report-chart"><ResponsiveContainer width="100%" height="100%"><ComposedChart data={monthlyData.daily} margin={{ top: 12, right: 8, left: 4, bottom: 6 }}><CartesianGrid stroke="#dce8de" vertical={false} strokeDasharray="3 4"/><XAxis dataKey="delivery_date" tick={{ fill: '#61796c', fontSize: 9 }} tickLine={false} axisLine={false} interval={2} tickFormatter={(value) => value.slice(-2)}/><YAxis domain={[0, 100]} tick={{ fill: '#61796c', fontSize: 10 }} tickLine={false} axisLine={false} width={42} tickFormatter={(value) => `${value}%`}/><Tooltip labelFormatter={(value) => `Delivery date ${value}`} formatter={(value) => [value == null ? 'N/A' : `${fmt(value, 1)}%`, 'Matched coverage']}/><ReferenceLine y={90} stroke="#b77935" strokeDasharray="4 4"/><Bar dataKey="coverage_pct" name="Coverage" fill="#70aa91" maxBarSize={16} radius={[2, 2, 0, 0]}/></ComposedChart></ResponsiveContainer></div><p className="threshold-note">Coverage warning rule: less than 90% of expected intervals. Reference line at 90%.</p></article>
              </div>
              <section className="panel table-panel report-table-panel"><div className="table-panel-heading"><SectionTitle eyebrow="31-DAY REVIEW" title="Daily metrics and data quality" description="High error means MAE at least 1,000 MW. Low coverage means less than 90%. These are explicit review rules, not statistical anomaly claims."/><button type="button" className="export-button" onClick={exportMonthlyCsv}><Download size={14} /> Export CSV</button></div><div className="table-scroll"><table><thead><tr><th>DELIVERY DATE</th><th>STATUS / FLAGS</th><th className="numeric">MAE MW</th><th className="numeric">RMSE MW</th><th className="numeric">BIAS MW</th><th className="numeric">VALID PAIRS</th><th className="numeric">EXPECTED</th><th className="numeric">SELECTED FORECASTS</th><th className="numeric">COVERAGE</th><th className="numeric">FORECAST MISSING</th><th className="numeric">ACTUAL MISSING</th></tr></thead><tbody>{monthlyData.daily.map((day) => { const high = monthlyData.flags?.high_error_dates?.includes(day.delivery_date); const low = monthlyData.flags?.low_coverage_dates?.includes(day.delivery_date); return <tr key={day.delivery_date}><td>{day.delivery_date}</td><td><StatusText status={day.status}/>{high && <span className="report-flag">High MAE</span>}{low && <span className="report-flag">Low coverage</span>}</td><td className="numeric"><MetricCell value={day.metrics?.mae}/></td><td className="numeric"><MetricCell value={day.metrics?.rmse}/></td><td className="numeric"><MetricCell value={day.metrics?.bias}/></td><td className="numeric">{day.valid_matched_intervals ?? 'N/A'}</td><td className="numeric">{day.expected_intervals}</td><td className="numeric">{day.eligible_forecast_intervals ?? 'N/A'}</td><td className="numeric">{day.coverage_pct == null ? 'N/A' : `${fmt(day.coverage_pct, 1)}%`}</td><td className="numeric">{day.forecast_missing_intervals ?? 'N/A'}</td><td className="numeric">{day.actual_missing_intervals ?? 'N/A'}</td></tr>; })}</tbody></table></div></section>
              <section className="panel provenance-panel report-provenance"><SectionTitle eyebrow="SOURCE TRACEABILITY" title="Monthly retrieval provenance" description="The overview uses only the two permitted Elexon data streams."/><div className="provenance-facts"><div><span>Retrieved at</span><strong>{fmtDateTime(monthlyData.provenance?.retrieved_at)}</strong></div><div><span>Actual rows fetched</span><strong>{monthlyData.provenance?.actual_records_retrieved ?? 'N/A'}</strong></div><div><span>Forecast rows fetched</span><strong>{monthlyData.provenance?.forecast_records_retrieved ?? 'N/A'}</strong></div><div><span>Duplicate actual rows</span><strong>{monthlyData.provenance?.actual_duplicate_rows ?? 'N/A'}</strong></div><div><span>Duplicate eligible forecast rows</span><strong>{monthlyData.provenance?.forecast_duplicate_rows ?? 'N/A'}</strong></div><div><span>Invalid actual timestamp rows</span><strong>{monthlyData.provenance?.invalid_actual_timestamp_records ?? 'N/A'}</strong></div><div><span>Invalid forecast timestamp rows</span><strong>{monthlyData.provenance?.invalid_forecast_timestamp_records ?? 'N/A'}</strong></div><div><span>Cache TTL</span><strong>{monthlyData.provenance?.cache_ttl_seconds ?? 300} seconds</strong></div></div>{monthlyData.warnings?.length > 0 && <ul className="report-warning-list">{monthlyData.warnings.map((warning, index) => <li key={`${index}-${warning}`}>{warning}</li>)}</ul>}</section>
            </>}
          </section>}

          {viewMode === 'comparison' && <section className="report-view" aria-labelledby="comparison-title">
            <div className="report-heading"><div><div className="eyebrow">CUTOFF SCENARIO ANALYSIS</div><h2 id="comparison-title">Compare forecast publication cutoffs</h2><p>For the same delivery date, select each cutoff independently and compare matched-pair metrics and coverage.</p></div></div>
            <div className="panel comparison-controls"><label className="report-control"><span>Delivery date</span><select value={deliveryDate} onChange={(event) => { setDeliveryDate(event.target.value); setComparisonData(null); setComparisonRequest(null); setComparisonLoading(false); }}>{DAY_OPTIONS.map((day) => <option key={day.value} value={day.value}>{day.value} · {day.label}</option>)}</select></label><label className="report-control cutoff-list-control"><span>Cutoff times (comma-separated, 2 to 8 unique values)</span><input value={compareCutoffText} onChange={(event) => { setCompareCutoffText(event.target.value); setComparisonData(null); setComparisonRequest(null); setComparisonLoading(false); }} aria-describedby="cutoff-help"/><small id="cutoff-help">Example: 12:00, 14:00, 16:00, 18:00. Each is interpreted on the preceding UK-local day.</small></label><button type="button" className="refresh-button" onClick={() => runComparison(false)} disabled={comparisonLoading}><GitCompareArrows size={15}/>{comparisonLoading ? 'Comparing...' : 'Run comparison'}</button><button type="button" className="export-button" onClick={() => runComparison(true)} disabled={comparisonLoading}><RefreshCw size={14}/> Refresh sources</button></div>
            {comparisonInputError && <div className="report-input-error" role="alert">{comparisonInputError}</div>}
            {comparisonError && <div className="error-banner" role="alert"><div className="error-icon"><AlertCircle size={19}/></div><div className="error-text"><strong>Could not load cutoff comparison</strong><p>{comparisonError}</p><span>No substitute data is displayed.</span></div></div>}
            {comparisonLoading && <div className="report-state"><span className="status-spinner"/> Selecting forecast vintages independently for each cutoff.</div>}
            {comparisonData && <>
              <div className="report-warning" role="note"><AlertCircle size={16}/><div><strong>Scenario interpretation</strong><p>These cutoff times are analytical scenarios, not official market deadlines. The latest publication at or before each cutoff is selected separately for every delivery interval. Pair counts and coverage can differ across scenarios.</p></div></div>
              <section className="panel report-panel comparison-chart-panel"><div className="table-panel-heading"><SectionTitle eyebrow="METRIC COMPARISON" title="Accuracy by cutoff" description="Bars show metrics calculated from all valid pairs for each cutoff. Pair counts are shown in the table below." trailing={<span className="chart-unit-pill">MW</span>}/><button type="button" className="export-button" onClick={exportComparisonCsv} disabled={!comparisonData.cutoffs?.length}><Download size={14}/> Export CSV</button></div><div className="report-chart comparison-chart"><ResponsiveContainer width="100%" height="100%"><BarChart data={comparisonData.cutoffs} margin={{top: 12, right: 12, left: 8, bottom: 8}}><CartesianGrid stroke="#dce8de" vertical={false} strokeDasharray="3 4"/><XAxis dataKey="cutoff_time" tick={{fill:'#61796c',fontSize:11}} tickLine={false} axisLine={false}/><YAxis tick={{fill:'#61796c',fontSize:10}} tickLine={false} axisLine={false} width={48}/><Tooltip formatter={(value) => [value == null ? 'N/A' : `${fmt(value,1)} MW`]}/><Legend/><Bar dataKey="metrics.mae" name="MAE" fill="#2e7484" radius={[2,2,0,0]}/><Bar dataKey="metrics.rmse" name="RMSE" fill="#16846f" radius={[2,2,0,0]}/></BarChart></ResponsiveContainer></div></section>
              <section className="panel table-panel report-table-panel"><div className="table-panel-heading"><SectionTitle eyebrow="ALL VALID MATCHED PAIRS" title="Cutoff metrics and coverage" description="Required metrics use every valid forecast and actual pair available at that cutoff."/></div><div className="table-scroll"><table><thead><tr><th>CUTOFF (UK)</th><th>APPLIED CUTOFF TIMESTAMP</th><th className="numeric">MAE MW</th><th className="numeric">RMSE MW</th><th className="numeric">BIAS MW</th><th className="numeric">VALID PAIRS</th><th className="numeric">EXPECTED</th><th className="numeric">COVERAGE</th></tr></thead><tbody>{comparisonData.cutoffs.map((item) => <tr key={item.cutoff_time}><td>{item.cutoff_time}</td><td>{fmtDateTime(item.cutoff_datetime)}</td><td className="numeric"><MetricCell value={item.metrics?.mae}/></td><td className="numeric"><MetricCell value={item.metrics?.rmse}/></td><td className="numeric"><MetricCell value={item.metrics?.bias}/></td><td className="numeric">{item.valid_matched_intervals}</td><td className="numeric">{item.expected_intervals}</td><td className="numeric">{fmt(item.coverage_pct,1)}%</td></tr>)}</tbody></table></div></section>
              <section className="panel table-panel report-table-panel"><div className="table-panel-heading"><SectionTitle eyebrow="SEPARATE LIKE-FOR-LIKE VIEW" title="Common-interval comparison" description={comparisonData.common_interval_comparison?.definition}/></div><p className="common-count">Shared valid intervals across every cutoff: <strong>{comparisonData.common_interval_comparison?.valid_matched_intervals ?? 0}</strong> / 48 ({fmt(comparisonData.common_interval_comparison?.coverage_pct,1)}%).</p><div className="table-scroll"><table><thead><tr><th>CUTOFF (UK)</th><th className="numeric">COMMON MAE MW</th><th className="numeric">COMMON RMSE MW</th><th className="numeric">COMMON BIAS MW</th><th className="numeric">COMMON PAIRS</th></tr></thead><tbody>{(comparisonData.common_interval_comparison?.metrics_by_cutoff ?? []).map((item) => <tr key={item.cutoff_time}><td>{item.cutoff_time}</td><td className="numeric"><MetricCell value={item.mae}/></td><td className="numeric"><MetricCell value={item.rmse}/></td><td className="numeric"><MetricCell value={item.bias}/></td><td className="numeric">{item.valid_count}</td></tr>)}</tbody></table></div></section>
              <section className="panel provenance-panel report-provenance"><SectionTitle eyebrow="SOURCE TRACEABILITY" title="Comparison provenance"/><div className="provenance-facts"><div><span>Delivery date</span><strong>{comparisonData.delivery_date}</strong></div><div><span>Retrieved at</span><strong>{fmtDateTime(comparisonData.provenance?.retrieved_at)}</strong></div><div><span>Source datasets</span><strong>FUELHH and WINDFOR</strong></div><div><span>Cache TTL</span><strong>{comparisonData.provenance?.cache_ttl_seconds ?? 300} seconds</strong></div></div><ul className="report-warning-list">{comparisonData.warnings?.map((warning, index) => <li key={`${index}-${warning}`}>{warning}</li>)}</ul></section>
            </>}
          </section>}

          {viewMode === 'daily' && <div className="daily-view">
          {error && (
            <div className="error-banner" role="alert"><div className="error-icon"><AlertCircle size={19} /></div><div className="error-text"><strong>Could not load live Elexon data</strong><p>{error}</p><span>No sample values are being displayed. Check your connection or retry once the API is reachable.</span></div><button onClick={() => load(true)} disabled={refreshing}><RefreshCw size={15} /> Retry</button></div>
          )}

          <div className="section-heading metrics-heading"><SectionTitle eyebrow="DAY AT A GLANCE" title="Forecast accuracy" description={loading && !data ? 'Retrieving the selected day from Elexon…' : 'All metrics use matched half-hour intervals with an eligible forecast.'} trailing={<div className="retrieval-state">{loading || refreshing ? <><span className="status-spinner" /> Updating</> : data ? <><CheckCircle2 size={15} /> Analysis loaded</> : <><AlertCircle size={15} /> Awaiting data</>}</div>} /></div>

          <section className="metric-grid">
            <MetricCard icon={Activity} label="Mean absolute error" value={fmtMetric(metrics.mae)} unit={metrics.mae == null ? '' : ' MW'} helper="Average magnitude of forecast error" tone="blue" />
            <MetricCard icon={Gauge} label="Root mean squared error" value={fmtMetric(metrics.rmse)} unit={metrics.rmse == null ? '' : ' MW'} helper="Penalizes larger misses more heavily" tone="violet" />
            <MetricCard icon={metrics.bias == null ? Activity : metrics.bias >= 0 ? ArrowUpRight : ArrowDownRight} label="Mean forecast bias" value={metrics.bias == null ? 'N/A' : `${metrics.bias > 0 ? '+' : ''}${fmt(metrics.bias, 1)}`} unit={metrics.bias == null ? '' : ' MW'} helper={metrics.bias == null ? 'Unavailable without matched intervals' : metrics.bias > 0 ? 'Net overforecasting' : metrics.bias < 0 ? 'Net underforecasting' : 'No average directional bias'} tone={metrics.bias == null ? 'navy' : metrics.bias > 0 ? 'amber' : 'green'} />
            <article className="metric-card coverage-card">
              <div className="metric-topline"><div className="metric-icon teal"><CheckCircle2 size={18} /></div><span className="coverage-percent">{data ? `${matchPercent}%` : 'N/A'}</span></div>
              <div className="metric-label">Interval coverage</div>
              <div className="metric-value coverage-value">{coverage.matched_intervals ?? 'N/A'}<span> / 48</span></div>
              <div className="coverage-track"><span style={{ width: `${data ? matchPercent : 0}%` }} /></div>
              <div className="metric-helper">Valid forecast / actual pairs</div>
            </article>
          </section>

          <section className="panel daily-quality-panel" aria-labelledby="quality-title">
            <SectionTitle eyebrow="DATA QUALITY MONITOR" title="Coverage and source completeness" description="Counts describe records actually returned and intervals selected after the cutoff. No missing values are filled." />
            <div className="quality-count-grid">
              <div><span>Expected delivery intervals</span><strong>{coverage.expected_intervals ?? 48}</strong></div>
              <div><span>Intervals with an eligible selected forecast</span><strong>{coverage.selected_forecast_intervals ?? 'N/A'}</strong></div>
              <div><span>Intervals with numeric forecast values</span><strong>{data?.data_quality?.forecast_value_intervals ?? coverage.eligible_forecast_intervals ?? 'N/A'}</strong></div>
              <div><span>Intervals with actual values</span><strong>{coverage.actual_intervals_available ?? 'N/A'}</strong></div>
              <div><span>Valid matched pairs</span><strong>{coverage.matched_intervals ?? 'N/A'}</strong></div>
              <div><span>Forecast-missing intervals</span><strong>{coverage.missing_forecast_intervals ?? 'N/A'}</strong></div>
              <div><span>Actual-missing intervals</span><strong>{coverage.missing_actual_intervals ?? 'N/A'}</strong></div>
              <div><span>Duplicate actual rows resolved</span><strong>{provenance.actual_duplicate_rows ?? 'N/A'}</strong></div>
              <div><span>Duplicate eligible forecast rows resolved</span><strong>{provenance.forecast_duplicate_rows ?? 'N/A'}</strong></div>
              <div><span>Actual rows ignored for invalid timestamps</span><strong>{data?.data_quality?.invalid_actual_timestamp_records ?? 'N/A'}</strong></div>
              <div><span>Forecast rows ignored for invalid timestamps</span><strong>{data?.data_quality?.invalid_forecast_timestamp_records ?? 'N/A'}</strong></div>
              <div><span>Forecast rows excluded after cutoff</span><strong>{provenance.forecast_rows_after_cutoff_excluded ?? 'N/A'}</strong></div>
            </div>
            <div className="quality-provenance"><div><span>Applied cutoff timestamp</span><strong>{data?.cutoff_datetime ? fmtDateTime(data.cutoff_datetime) : 'N/A'}</strong></div><div><span>Delivery-period timestamp</span><strong>Observation start time in Europe/London</strong></div><div><span>Source datasets</span><strong>FUELHH actuals and WINDFOR forecasts</strong></div><div><span>Last retrieval time</span><strong>{provenance.retrieved_at ? fmtDateTime(provenance.retrieved_at) : 'N/A'}</strong></div></div>
            {provenance.warnings?.length > 0 && <div className="quality-warnings"><strong><AlertCircle size={14}/> Data-quality warnings</strong><ul>{provenance.warnings.map((warning, index) => <li key={`${index}-${warning}`}>{warning}</li>)}</ul></div>}
          </section>

          <section className="chart-grid">
            <article className="panel main-chart-panel">
              <SectionTitle eyebrow="TIME SERIES" title="Forecast vs actual" description="National wind generation by half-hour delivery interval." trailing={<div className="chart-unit-pill">MW</div>} />
              {chartData.length ? <div className="chart-frame"><ResponsiveContainer width="100%" height="100%"><LineChart data={chartData} margin={{ top: 15, right: 12, left: 0, bottom: 4 }}>
                <CartesianGrid stroke="#dce8de" vertical={false} strokeDasharray="3 4" />
                <XAxis dataKey="time" tick={{ fill: '#61796c', fontSize: 10 }} tickLine={false} axisLine={false} interval={5} minTickGap={18} />
                <YAxis tick={{ fill: '#61796c', fontSize: 10 }} tickLine={false} axisLine={false} width={52} tickFormatter={(value) => fmt(value)} />
                <Tooltip content={<ChartTooltip />} />
                <Legend verticalAlign="top" align="right" iconType="circle" iconSize={7} wrapperStyle={{ fontSize: 11, paddingBottom: 14, color: '#547164' }} />
                <Line name="Forecast" type="monotone" dataKey="forecast" stroke="#2e7484" strokeWidth={2.4} dot={false} activeDot={{ r: 4, strokeWidth: 0 }} connectNulls={false} />
                <Line name="Actual" type="monotone" dataKey="actual" stroke="#299873" strokeWidth={2.4} dot={false} activeDot={{ r: 4, strokeWidth: 0 }} connectNulls={false} />
              </LineChart></ResponsiveContainer></div> : <EmptyChart title={loading ? 'Loading generation series…' : 'No forecast / actual series'} />}
              <div className="chart-footnote"><span className="footnote-dot blue-dot" />Forecast vintage selected using the cutoff <span className="footnote-separator">·</span><span className="footnote-dot green-dot" />Actuals from FUELHH</div>
            </article>

            <article className="panel error-chart-panel">
              <SectionTitle eyebrow="ERROR DISTRIBUTION" title="Forecast error" description="Forecast minus actual, by delivery interval." trailing={<div className="chart-unit-pill">MW</div>} />
              <div className="error-legend"><span><i className="legend-swatch positive" />Overforecast</span><span><i className="legend-swatch negative" />Underforecast</span></div>
              {chartData.length ? <div className="error-chart-frame"><ResponsiveContainer width="100%" height="100%"><ComposedChart data={chartData} margin={{ top: 12, right: 4, left: -6, bottom: 4 }}>
                <CartesianGrid stroke="#dce8de" vertical={false} strokeDasharray="3 4" />
                <XAxis dataKey="time" tick={{ fill: '#61796c', fontSize: 10 }} tickLine={false} axisLine={false} interval={7} />
                <YAxis tick={{ fill: '#61796c', fontSize: 10 }} tickLine={false} axisLine={false} width={48} tickFormatter={(value) => fmt(value)} />
                <ReferenceLine y={0} stroke="#809588" strokeWidth={1.2} />
                <Tooltip formatter={(value) => [value == null ? 'N/A' : `${fmt(value, 0)} MW`, 'Error']} labelFormatter={(label) => `Delivery ${label}`} contentStyle={{ borderRadius: 9, border: '1px solid #d4e3d7', fontSize: 12 }} />
                <Bar dataKey="error" name="Forecast error" maxBarSize={12} radius={[2, 2, 0, 0]}>{chartData.map((entry, index) => <Cell key={`bar-${index}`} fill={entry.error == null ? '#dbe7dd' : entry.error >= 0 ? '#d89240' : '#4d8798'} />)}</Bar>
              </ComposedChart></ResponsiveContainer></div> : <EmptyChart title={loading ? 'Loading error series…' : 'No error series'} />}
              <div className="error-explainer"><div className="explain-sign plus">+</div><div><b>Positive</b><span>Forecast above actual</span></div><div className="explain-sign minus">−</div><div><b>Negative</b><span>Forecast below actual</span></div></div>
            </article>
          </section>

          <section className="panel table-panel">
            <div className="table-panel-heading"><SectionTitle eyebrow="INTERVAL-LEVEL DETAIL" title="Delivery period breakdown" description="Each row is a 30-minute interval; missing observations stay blank." /><button className="export-button" onClick={exportCsv} disabled={!observations.length}><Download size={15} /> Export CSV</button></div>
            <div className="table-meta"><span><span className="small-live-dot" />{observations.length ? `${observations.length} intervals` : 'Waiting for records'}</span><span>Sorted by delivery time · local UK time</span></div>
            <div className="table-scroll"><table><thead><tr><th>DELIVERY TIME</th><th>FORECAST PUBLISHED</th><th className="numeric">FORECAST (MW)</th><th className="numeric">ACTUAL (MW)</th><th className="numeric">ERROR (MW)</th><th>DATA STATUS</th></tr></thead><tbody>
              {observations.length ? observations.map((row) => <tr key={row.start_time}><td><div className="time-cell"><span className="time-marker" />{row.delivery_time}</div><span className="subcell">{deliveryDate}</span></td><td className="published-cell">{row.forecast_publish_time_display || <span className="missing-value">No eligible forecast</span>}</td><td className="numeric value-cell">{fmt(row.forecast_mw)}</td><td className="numeric value-cell">{fmt(row.actual_mw)}</td><td className={`numeric error-value ${row.error_mw == null ? 'muted-value' : row.error_mw > 0 ? 'positive-value' : row.error_mw < 0 ? 'negative-value' : ''}`}>{row.error_mw == null ? 'N/A' : `${row.error_mw > 0 ? '+' : ''}${fmt(row.error_mw)}`}</td><td><span className={`status-pill ${row.status === 'Matched' ? 'matched' : 'missing'}`}>{row.status === 'Matched' ? <CheckCircle2 size={12} /> : <AlertCircle size={12} />}{row.status}</span></td></tr>) : <tr><td colSpan="6" className="table-empty">{loading ? 'Retrieving records from the Elexon API…' : 'No records are available. Check the error message above and retry.'}</td></tr>}
            </tbody></table></div>
            <div className="table-footer"><span>Showing {observations.length ? `1–${observations.length}` : '0'} of 48 expected delivery periods</span><span>Missing values are not treated as zero</span></div>
          </section>

          <section className="provenance-grid">
            <article className="panel provenance-panel"><SectionTitle eyebrow="SOURCE TRACEABILITY" title="Data provenance" description="Data is fetched from the permitted Elexon sources only." />
              <div className="source-list">
                <div className="source-row"><div className="source-icon fuel"><Database size={17} /></div><div className="source-info"><strong>FUELHH</strong><span>Half-hourly generation outturn by fuel type · WIND</span><a href="https://bmrs.elexon.co.uk/api-documentation/endpoint/datasets/FUELHH/stream" target="_blank" rel="noreferrer">API documentation <ExternalLink size={11} /></a></div><span className="source-tag">Actual</span></div>
                <div className="source-row"><div className="source-icon wind"><Wind size={17} /></div><div className="source-info"><strong>WINDFOR</strong><span>Wind generation forecast · publication timestamp retained</span><a href="https://bmrs.elexon.co.uk/api-documentation/endpoint/datasets/WINDFOR/stream" target="_blank" rel="noreferrer">API documentation <ExternalLink size={11} /></a></div><span className="source-tag forecast-tag">Forecast</span></div>
              </div>
              <div className="provenance-facts"><div><span>Last successful retrieval</span><strong>{provenance.retrieved_at ? fmtDateTime(provenance.retrieved_at) : 'N/A'}</strong></div><div><span>Actual records fetched</span><strong>{provenance.actual_records_retrieved ?? 'N/A'}</strong></div><div><span>Forecast records fetched</span><strong>{provenance.forecast_records_retrieved ?? 'N/A'}</strong></div><div><span>Matched intervals</span><strong>{coverage.matched_intervals ?? 'N/A'} / 48</strong></div></div>
            </article>
            <article className="panel methodology-panel"><SectionTitle eyebrow="METHOD NOTES" title="How to read this analysis" />
              <div className="method-note"><span className="method-number">01</span><div><strong>Decision-time forecast vintage</strong><p>For each delivery interval, the latest forecast published at or before the selected cutoff is used. Later publications are excluded.</p></div></div>
              <div className="method-note"><span className="method-number">02</span><div><strong>Error sign convention</strong><p>Error = forecast − actual. Positive values indicate overforecasting; negative values indicate underforecasting.</p></div></div>
              <div className="method-note"><span className="method-number">03</span><div><strong>Metrics use matched data only</strong><p>MAE, RMSE and bias are computed from intervals with both a selected forecast and a non-missing actual value.</p></div></div>
              <div className="assumption-callout"><Clock3 size={15} /><span><b>Cutoff assumption:</b> the chosen time is on the preceding day in Europe/London. 16:00 is a configurable demonstration default, not an asserted market deadline.</span></div>
            </article>
          </section>

          {provenance.warnings?.length > 0 && <section className="panel warning-panel"><div className="warning-heading"><AlertCircle size={17} /><strong>Data quality notes</strong><span>{provenance.warnings.length}</span></div><ul>{provenance.warnings.map((warning, index) => <li key={`${index}-${warning}`}>{warning}</li>)}</ul></section>}
          </div>}

          <footer className="page-footer"><span>WIND INTEL <span className="footer-dot">·</span> HISTORICAL ANALYTICS</span><span className="footer-data-note">Data source: Elexon Insights API <span className="footer-dot">·</span> January 2026 delivery dates only</span><span className="footer-legal-links"><a href="/privacy">Privacy Policy</a><a href="/terms">Terms and Conditions</a></span></footer>
        </div>
      </main>
    </div>
  );
}

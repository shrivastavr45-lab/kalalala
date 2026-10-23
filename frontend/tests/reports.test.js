import test from 'node:test';
import assert from 'node:assert/strict';
import { dailyIntervalExport, monthlySummaryExport, cutoffComparisonExport } from '../src/services/reports.js';

const observation = {
  start_time: '2026-01-14T00:00:00+00:00',
  forecast_publish_time: '2026-01-13T15:00:00+00:00',
  forecast_mw: 120,
  actual_mw: null,
  error_mw: null,
  status: 'Missing actual',
};

const baseDay = {
  delivery_date: '2026-01-14',
  cutoff_time: '16:00',
  cutoff_datetime: '2026-01-13T16:00:00+00:00',
  observations: [observation],
  provenance: { retrieved_at: '2026-01-15T12:00:00+00:00' },
};

test('daily interval export has stable columns, applied cutoff, sources, and deterministic filename', () => {
  const report = dailyIntervalExport(baseDay);
  assert.equal(report.filename, 'wind-forecast-intervals-2026-01-14-cutoff-1600.csv');
  assert.equal(report.headers.length, report.rows[0].length);
  assert.ok(report.headers.includes('delivery_period_start_uk'));
  assert.ok(report.headers.includes('forecast_publish_time_uk'));
  assert.ok(report.headers.includes('applied_cutoff_timestamp_uk'));
  assert.ok(report.headers.includes('retrieved_at_uk'));
  assert.equal(report.rows[0][6], null, 'missing actual should remain null until CSV serialization');
});

test('monthly summary export has stable columns and retains errors and missing-day fields', () => {
  const report = monthlySummaryExport({
    cutoff_time: '14:00',
    provenance: { retrieved_at: '2026-02-01T00:00:00+00:00' },
    daily: [{
      delivery_date: '2026-01-01', status: 'error', metrics: { mae: null, rmse: null, bias: null },
      valid_matched_intervals: null, expected_intervals: 48, coverage_pct: null,
      eligible_forecast_intervals: null, forecast_value_intervals: null,
      actual_intervals_available: null, forecast_missing_intervals: null,
      actual_missing_intervals: null, invalid_actual_timestamp_records: null, invalid_forecast_timestamp_records: null, warnings: ['source unavailable'], error: 'source unavailable',
    }],
  });
  assert.equal(report.filename, 'wind-forecast-january-2026-daily-summary-cutoff-1400.csv');
  assert.equal(report.headers.length, report.rows[0].length);
  assert.equal(report.rows[0][3], null);
  assert.equal(report.rows[0][17], 'source unavailable');
  assert.ok(report.headers.includes('mae_definition'));
  assert.ok(report.headers.includes('forecast_source_dataset'));
  assert.ok(report.headers.includes('invalid_actual_timestamp_records'));
  assert.ok(report.headers.includes('day_retrieved_at_uk'));
  assert.ok(report.headers.includes('report_generated_at_uk'));
});

test('cutoff export includes all-pair and separate common-interval metrics', () => {
  const report = cutoffComparisonExport({
    delivery_date: '2026-01-14',
    provenance: { retrieved_at: '2026-01-15T12:00:00+00:00' },
    cutoffs: [{ cutoff_time: '12:00', cutoff_datetime: '2026-01-13T12:00:00+00:00', metrics: { mae: 10, rmse: 10, bias: -10 }, valid_matched_intervals: 1, expected_intervals: 48, coverage_pct: 2.08, eligible_forecast_intervals: 1 }],
    common_interval_comparison: { metrics_by_cutoff: [{ cutoff_time: '12:00', mae: 10, rmse: 10, bias: -10, valid_count: 1 }] },
  });
  assert.equal(report.filename, 'wind-forecast-cutoff-comparison-2026-01-14.csv');
  assert.equal(report.headers.length, report.rows[0].length);
  assert.equal(report.rows[0][10], 10);
  assert.equal(report.rows[0][13], 1);
  assert.ok(report.headers.includes('coverage_pct'));
  assert.ok(report.headers.includes('retrieved_at_uk'));
});

const SOURCES = {
  actual: 'Elexon FUELHH',
  forecast: 'Elexon WINDFOR',
};

function safeCutoff(cutoff) {
  return String(cutoff ?? '').replace(':', '');
}

/** Build the actual selected-day interval export from the API payload. */
export function dailyIntervalExport(data) {
  const headers = [
    'delivery_date', 'cutoff_time_uk', 'applied_cutoff_timestamp_uk',
    'delivery_period_start_uk', 'forecast_publish_time_uk', 'forecast_mw',
    'actual_mw', 'error_mw', 'error_definition', 'status',
    'actual_source_dataset', 'forecast_source_dataset', 'retrieved_at_uk',
  ];
  const rows = (data?.observations ?? []).map((row) => [
    data.delivery_date,
    data.cutoff_time,
    data.cutoff_datetime,
    row.start_time,
    row.forecast_publish_time,
    row.forecast_mw,
    row.actual_mw,
    row.error_mw,
    'forecast_mw - actual_mw',
    row.status,
    SOURCES.actual,
    SOURCES.forecast,
    data.provenance?.retrieved_at,
  ]);
  return {
    filename: `wind-forecast-intervals-${data?.delivery_date ?? 'unavailable'}-cutoff-${safeCutoff(data?.cutoff_time)}.csv`,
    headers,
    rows,
  };
}

/** Build the 31-date overview export with pooled-report provenance attached. */
export function monthlySummaryExport(data) {
  const headers = [
    'delivery_date', 'cutoff_time_uk', 'status', 'mae_mw', 'rmse_mw', 'bias_mw',
    'valid_matched_intervals', 'expected_intervals', 'coverage_pct',
    'eligible_selected_forecast_intervals', 'numeric_forecast_value_intervals',
    'actual_intervals_available', 'forecast_missing_intervals', 'actual_missing_intervals',
    'invalid_actual_timestamp_records', 'invalid_forecast_timestamp_records', 'warning_count', 'error',
    'mae_definition', 'rmse_definition', 'bias_definition',
    'actual_source_dataset', 'forecast_source_dataset', 'day_retrieved_at_uk', 'report_generated_at_uk',
  ];
  const rows = (data?.daily ?? []).map((day) => [
    day.delivery_date,
    data.cutoff_time,
    day.status,
    day.metrics?.mae,
    day.metrics?.rmse,
    day.metrics?.bias,
    day.valid_matched_intervals,
    day.expected_intervals,
    day.coverage_pct,
    day.eligible_forecast_intervals,
    day.forecast_value_intervals,
    day.actual_intervals_available,
    day.forecast_missing_intervals,
    day.actual_missing_intervals,
    day.invalid_actual_timestamp_records,
    day.invalid_forecast_timestamp_records,
    day.warnings?.length ?? 0,
    day.error,
    'mean(abs(forecast_mw - actual_mw)) over valid pairs',
    'sqrt(mean((forecast_mw - actual_mw)^2)) over valid pairs',
    'mean(forecast_mw - actual_mw) over valid pairs',
    SOURCES.actual,
    SOURCES.forecast,
    day.retrieved_at,
    data.provenance?.retrieved_at,
  ]);
  return {
    filename: `wind-forecast-january-2026-daily-summary-cutoff-${safeCutoff(data?.cutoff_time)}.csv`,
    headers,
    rows,
  };
}

/** Build a cutoff-scenario export, keeping each independent scenario and its provenance. */
export function cutoffComparisonExport(data) {
  const commonByCutoff = new Map(
    (data?.common_interval_comparison?.metrics_by_cutoff ?? []).map((item) => [item.cutoff_time, item]),
  );
  const headers = [
    'delivery_date', 'cutoff_time_uk', 'applied_cutoff_timestamp_uk',
    'mae_mw', 'rmse_mw', 'bias_mw', 'valid_matched_intervals',
    'expected_intervals', 'coverage_pct', 'eligible_forecast_intervals',
    'common_interval_mae_mw', 'common_interval_rmse_mw', 'common_interval_bias_mw',
    'common_valid_matched_intervals', 'actual_source_dataset', 'forecast_source_dataset', 'retrieved_at_uk',
  ];
  const rows = (data?.cutoffs ?? []).map((item) => {
    const common = commonByCutoff.get(item.cutoff_time) ?? {};
    return [
      data.delivery_date,
      item.cutoff_time,
      item.cutoff_datetime,
      item.metrics?.mae,
      item.metrics?.rmse,
      item.metrics?.bias,
      item.valid_matched_intervals,
      item.expected_intervals,
      item.coverage_pct,
      item.eligible_forecast_intervals,
      common.mae,
      common.rmse,
      common.bias,
      common.valid_count,
      SOURCES.actual,
      SOURCES.forecast,
      data.provenance?.retrieved_at,
    ];
  });
  return {
    filename: `wind-forecast-cutoff-comparison-${data?.delivery_date ?? 'unavailable'}.csv`,
    headers,
    rows,
  };
}

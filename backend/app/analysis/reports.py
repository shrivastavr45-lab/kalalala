"""Pure aggregation helpers for monthly and cutoff-comparison reports."""
from __future__ import annotations

from datetime import date, datetime, time, timezone
from math import isfinite
from typing import Any

from app.analysis.metrics import calculate_metrics

MONTH_START = date(2026, 1, 1)
MONTH_END = date(2026, 1, 31)
EXPECTED_INTERVALS_PER_DAY = 48
HIGH_ERROR_MAE_MW = 1000.0
LOW_COVERAGE_PERCENT = 90.0


def january_dates() -> list[date]:
    return [date(2026, 1, day) for day in range(1, 32)]


def _number(value: Any) -> float | None:
    if value is None:
        return None
    try:
        parsed = float(value)
    except (TypeError, ValueError, OverflowError):
        return None
    return parsed if isfinite(parsed) else None


def _valid_pairs(result: dict[str, Any]) -> list[tuple[float, float]]:
    pairs: list[tuple[float, float]] = []
    for observation in result.get("observations", []):
        forecast = _number(observation.get("forecast_mw"))
        actual = _number(observation.get("actual_mw"))
        if forecast is not None and actual is not None:
            pairs.append((forecast, actual))
    return pairs


def build_month_overview(
    day_results: dict[date, dict[str, Any] | Exception],
    cutoff_clock: time,
    retrieved_at: datetime | None = None,
) -> dict[str, Any]:
    """Aggregate daily analyses using pooled interval-level matched pairs."""
    daily: list[dict[str, Any]] = []
    pooled_pairs: list[tuple[float, float]] = []
    days_retrieved = 0
    total_actual_rows = 0
    total_forecast_rows = 0
    actual_duplicate_rows = 0
    forecast_duplicate_rows = 0
    invalid_actual_timestamp_records = 0
    invalid_forecast_timestamp_records = 0
    warnings: list[str] = []

    for delivery_date in january_dates():
        result = day_results.get(delivery_date)
        base = {
            "delivery_date": delivery_date.isoformat(),
            "status": "ok" if isinstance(result, dict) else "error",
            "expected_intervals": EXPECTED_INTERVALS_PER_DAY,
            "metrics": {"mae": None, "rmse": None, "bias": None, "valid_count": 0},
            "valid_matched_intervals": None,
            "eligible_forecast_intervals": None,
            "forecast_value_intervals": None,
            "actual_intervals_available": None,
            "forecast_missing_intervals": None,
            "actual_missing_intervals": None,
            "invalid_actual_timestamp_records": None,
            "invalid_forecast_timestamp_records": None,
            "coverage_pct": None,
            "warnings": [],
            "error": None,
            "retrieved_at": None,
        }
        if not isinstance(result, dict):
            message = str(result) if result is not None else "No result was returned for this date."
            base["error"] = message
            base["warnings"] = [message]
            daily.append(base)
            warnings.append(f"{delivery_date.isoformat()} could not be retrieved: {message}")
            continue

        days_retrieved += 1
        metrics = result.get("metrics") or {}
        coverage = result.get("coverage") or {}
        provenance = result.get("provenance") or {}
        valid_count = int(metrics.get("valid_count") or 0)
        matched = int(coverage.get("matched_intervals") or 0)
        daily_pairs = _valid_pairs(result)
        pooled_pairs.extend(daily_pairs)
        day_warnings = list(provenance.get("warnings") or [])
        daily_row = {
            **base,
            "metrics": metrics,
            "valid_matched_intervals": valid_count,
            "eligible_forecast_intervals": coverage.get("selected_forecast_intervals", coverage.get("eligible_forecast_intervals")),
            "forecast_value_intervals": coverage.get("eligible_forecast_intervals"),
            "actual_intervals_available": coverage.get("actual_intervals_available"),
            "forecast_missing_intervals": coverage.get("missing_forecast_intervals"),
            "actual_missing_intervals": coverage.get("missing_actual_intervals"),
            "invalid_actual_timestamp_records": (result.get("data_quality") or {}).get("invalid_actual_timestamp_records", provenance.get("invalid_actual_timestamp_records", 0)),
            "invalid_forecast_timestamp_records": (result.get("data_quality") or {}).get("invalid_forecast_timestamp_records", provenance.get("invalid_forecast_timestamp_records", 0)),
            "coverage_pct": round(100.0 * matched / EXPECTED_INTERVALS_PER_DAY, 2),
            "warnings": day_warnings,
            "retrieved_at": provenance.get("retrieved_at"),
        }
        if valid_count != len(daily_pairs):
            day_warnings.append("Metric pair count differed from observation-level matched pairs; pooled metrics use the observation-level pairs.")
        daily.append(daily_row)
        total_actual_rows += int(provenance.get("actual_records_retrieved") or 0)
        total_forecast_rows += int(provenance.get("forecast_records_retrieved") or 0)
        actual_duplicate_rows += int(provenance.get("actual_duplicate_rows") or 0)
        forecast_duplicate_rows += int(provenance.get("forecast_duplicate_rows") or 0)
        invalid_actual_timestamp_records += int(provenance.get("invalid_actual_timestamp_records") or 0)
        invalid_forecast_timestamp_records += int(provenance.get("invalid_forecast_timestamp_records") or 0)

    pooled_metrics = calculate_metrics(pooled_pairs)
    expected_total = 31 * EXPECTED_INTERVALS_PER_DAY
    valid_total = int(pooled_metrics["valid_count"])
    coverage_pct = round(100.0 * valid_total / expected_total, 2)
    if days_retrieved < 31:
        warnings.insert(0, f"Partial month: {days_retrieved} of 31 dates were retrieved successfully. Monthly metrics use valid pairs from retrieved dates only.")
    if valid_total == 0:
        warnings.append("No valid matched interval pairs were available across the month; monthly accuracy metrics are unavailable.")

    return {
        "period_start": MONTH_START.isoformat(),
        "period_end": MONTH_END.isoformat(),
        "timezone": "Europe/London",
        "cutoff_time": cutoff_clock.strftime("%H:%M"),
        "expected_intervals_total": expected_total,
        "daily": daily,
        "monthly_metrics": pooled_metrics,
        "coverage": {
            "expected_intervals": expected_total,
            "valid_matched_intervals": valid_total,
            "coverage_pct": coverage_pct,
            "days_requested": 31,
            "days_retrieved": days_retrieved,
            "days_failed": 31 - days_retrieved,
        },
        "flags": {
            "high_error_mae_mw_threshold": HIGH_ERROR_MAE_MW,
            "low_coverage_percent_threshold": LOW_COVERAGE_PERCENT,
            "rule": "High error means daily MAE >= 1000 MW. Low coverage means valid matched intervals < 90% of the 48 expected intervals. These are transparent review thresholds, not statistical anomaly detection.",
            "high_error_dates": [day["delivery_date"] for day in daily if day["status"] == "ok" and _number(day["metrics"].get("mae")) is not None and day["metrics"]["mae"] >= HIGH_ERROR_MAE_MW],
            "low_coverage_dates": [day["delivery_date"] for day in daily if day["status"] == "ok" and day["coverage_pct"] is not None and day["coverage_pct"] < LOW_COVERAGE_PERCENT],
        },
        "partial": days_retrieved < 31,
        "warnings": warnings,
        "provenance": {
            "sources": ["Elexon FUELHH (wind actual generation)", "Elexon WINDFOR (wind generation forecasts)"],
            "retrieved_at": (retrieved_at or datetime.now(timezone.utc)).isoformat(),
            "actual_records_retrieved": total_actual_rows,
            "forecast_records_retrieved": total_forecast_rows,
            "actual_duplicate_rows": actual_duplicate_rows,
            "forecast_duplicate_rows": forecast_duplicate_rows,
            "invalid_actual_timestamp_records": invalid_actual_timestamp_records,
            "invalid_forecast_timestamp_records": invalid_forecast_timestamp_records,
            "cache_ttl_seconds": 300,
            "bounded_concurrency": 4,
        },
    }


def build_cutoff_comparison(
    delivery_date: date,
    results: dict[str, dict[str, Any]],
    cutoff_times: list[str],
) -> dict[str, Any]:
    """Compare independently selected cutoff analyses and their common subset."""
    comparisons: list[dict[str, Any]] = []
    common_by_cutoff: dict[str, dict[str, tuple[float, float]]] = {}
    retrieved_at: list[str] = []

    for cutoff in cutoff_times:
        result = results[cutoff]
        metrics = result.get("metrics") or calculate_metrics([])
        coverage = result.get("coverage") or {}
        provenance = result.get("provenance") or {}
        pairs = {
            observation["start_time"]: (float(observation["forecast_mw"]), float(observation["actual_mw"]))
            for observation in result.get("observations", [])
            if _number(observation.get("forecast_mw")) is not None and _number(observation.get("actual_mw")) is not None
        }
        common_by_cutoff[cutoff] = pairs
        if provenance.get("retrieved_at"):
            retrieved_at.append(provenance["retrieved_at"])
        matched = int(coverage.get("matched_intervals") or 0)
        comparisons.append({
            "cutoff_time": cutoff,
            "cutoff_datetime": result.get("cutoff_datetime"),
            "metrics": metrics,
            "valid_matched_intervals": int(metrics.get("valid_count") or 0),
            "expected_intervals": int(coverage.get("expected_intervals") or EXPECTED_INTERVALS_PER_DAY),
            "eligible_forecast_intervals": coverage.get("eligible_forecast_intervals"),
            "coverage_pct": round(100.0 * matched / EXPECTED_INTERVALS_PER_DAY, 2),
            "warnings": list(provenance.get("warnings") or []),
        })

    common_starts: set[str] | None = None
    for pairs in common_by_cutoff.values():
        common_starts = set(pairs) if common_starts is None else common_starts & set(pairs)
    common_starts = common_starts or set()
    common_metrics_by_cutoff: list[dict[str, Any]] = []
    for cutoff in cutoff_times:
        pairs = common_by_cutoff[cutoff]
        common_pairs = [pairs[start] for start in sorted(common_starts)]
        common_metrics_by_cutoff.append({"cutoff_time": cutoff, **calculate_metrics(common_pairs)})

    return {
        "delivery_date": delivery_date.isoformat(),
        "timezone": "Europe/London",
        "cutoffs": comparisons,
        "common_interval_comparison": {
            "valid_matched_intervals": len(common_starts),
            "expected_intervals": EXPECTED_INTERVALS_PER_DAY,
            "coverage_pct": round(100.0 * len(common_starts) / EXPECTED_INTERVALS_PER_DAY, 2),
            "metrics_by_cutoff": common_metrics_by_cutoff,
            "definition": "Metrics are recalculated for the intersection of delivery intervals with valid forecast and actual values at every requested cutoff. These are separate from the mandatory all-valid-pairs metrics above.",
        },
        "provenance": {
            "sources": ["Elexon FUELHH (wind actual generation)", "Elexon WINDFOR (wind generation forecasts)"],
            "retrieved_at": max(retrieved_at) if retrieved_at else None,
        },
        "warnings": ["Cutoff scenarios are analysis settings, not official decision deadlines.", "Valid-pair counts and coverage can differ by cutoff."],
    }

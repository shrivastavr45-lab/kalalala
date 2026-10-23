from datetime import date, datetime, time, timezone

from app.analysis.reports import build_cutoff_comparison, build_month_overview, january_dates


def analysis_result(rows, *, mae=None, rmse=None, bias=None):
    paired = sum(row.get("forecast_mw") is not None and row.get("actual_mw") is not None for row in rows)
    errors = [row["forecast_mw"] - row["actual_mw"] for row in rows if row.get("forecast_mw") is not None and row.get("actual_mw") is not None]
    metrics = {
        "mae": sum(abs(value) for value in errors) / len(errors) if errors else None,
        "rmse": (sum(value * value for value in errors) / len(errors)) ** 0.5 if errors else None,
        "bias": sum(errors) / len(errors) if errors else None,
        "valid_count": paired,
    }
    return {
        "observations": rows,
        "metrics": metrics,
        "coverage": {
            "matched_intervals": paired,
            "expected_intervals": 48,
            "missing_actual_intervals": 48 - sum(row.get("actual_mw") is not None for row in rows),
            "missing_forecast_intervals": 48 - sum(row.get("forecast_mw") is not None for row in rows),
            "actual_intervals_available": sum(row.get("actual_mw") is not None for row in rows),
            "eligible_forecast_intervals": sum(row.get("forecast_mw") is not None for row in rows),
        },
        "provenance": {
            "sources": ["Elexon FUELHH", "Elexon WINDFOR"],
            "retrieved_at": "2026-02-01T00:00:00+00:00",
            "actual_records_retrieved": len(rows),
            "forecast_records_retrieved": len(rows),
            "actual_duplicate_rows": 0,
            "forecast_duplicate_rows": 0,
            "invalid_actual_timestamp_records": 2,
            "invalid_forecast_timestamp_records": 3,
            "forecast_rows_after_cutoff_excluded": 0,
            "warnings": [],
        },
    }


def interval(start, forecast, actual):
    return {"start_time": start, "forecast_mw": forecast, "actual_mw": actual}


def test_january_dates_have_exactly_31_delivery_days():
    dates = january_dates()
    assert len(dates) == 31
    assert dates[0] == date(2026, 1, 1)
    assert dates[-1] == date(2026, 1, 31)


def test_month_metrics_are_pooled_across_interval_pairs_not_daily_averages():
    day_one = analysis_result([interval(f"2026-01-01T{i:02}:00+00:00", 100.0, 100.0) for i in range(47)])
    day_two = analysis_result([interval("2026-01-02T00:00+00:00", 110.0, 100.0)])
    overview = build_month_overview(
        {date(2026, 1, 1): day_one, date(2026, 1, 2): day_two},
        time(16, 0),
        datetime(2026, 2, 1, tzinfo=timezone.utc),
    )
    assert overview["monthly_metrics"]["valid_count"] == 48
    assert overview["monthly_metrics"]["mae"] == 10 / 48
    assert round(overview["monthly_metrics"]["rmse"], 6) == round((100 / 48) ** 0.5, 6)
    assert overview["monthly_metrics"]["bias"] == 10 / 48
    assert overview["monthly_metrics"]["mae"] != 5.0  # Not the average of daily MAEs (0 and 10).
    assert overview["monthly_metrics"]["rmse"] < 5.0  # Not the average of daily RMSEs (0 and 10).


def test_month_overview_keeps_all_dates_and_marks_missing_dates_partial():
    first_day_rows = [interval("2026-01-01T00:00+00:00", 120.0, 100.0)]
    result = analysis_result(first_day_rows)
    overview = build_month_overview({date(2026, 1, 1): result}, time(14, 0))
    assert len(overview["daily"]) == 31
    assert overview["daily"][0]["coverage_pct"] == round(100 / 48, 2)
    assert overview["daily"][1]["status"] == "error"
    assert overview["daily"][1]["valid_matched_intervals"] is None
    assert overview["coverage"]["expected_intervals"] == 1488
    assert overview["coverage"]["days_retrieved"] == 1
    assert overview["coverage"]["days_failed"] == 30
    assert overview["daily"][0]["invalid_actual_timestamp_records"] == 2
    assert overview["daily"][0]["invalid_forecast_timestamp_records"] == 3
    assert overview["provenance"]["invalid_actual_timestamp_records"] == 2
    assert overview["provenance"]["invalid_forecast_timestamp_records"] == 3
    assert overview["partial"] is True


def test_month_overview_metrics_are_null_when_no_pairs_exist():
    overview = build_month_overview({}, time(16, 0))
    assert overview["monthly_metrics"] == {"mae": None, "rmse": None, "bias": None, "valid_count": 0}


def test_cutoff_comparison_recomputes_metrics_and_common_interval_metrics():
    early = analysis_result([
        interval("2026-01-14T00:00:00+00:00", 120.0, 100.0),
    ])
    late = analysis_result([
        interval("2026-01-14T00:00:00+00:00", 110.0, 100.0),
        interval("2026-01-14T00:30:00+00:00", 150.0, 100.0),
    ])
    comparison = build_cutoff_comparison(
        date(2026, 1, 14), {"12:00": early, "16:00": late}, ["12:00", "16:00"]
    )
    assert comparison["cutoffs"][0]["metrics"]["mae"] == 20.0
    assert comparison["cutoffs"][1]["metrics"]["mae"] == 30.0
    assert comparison["cutoffs"][0]["valid_matched_intervals"] == 1
    assert comparison["cutoffs"][1]["valid_matched_intervals"] == 2
    common = comparison["common_interval_comparison"]
    assert common["valid_matched_intervals"] == 1
    assert common["metrics_by_cutoff"][0]["mae"] == 20.0
    assert common["metrics_by_cutoff"][1]["mae"] == 10.0


def test_comparison_missing_values_do_not_become_zero():
    result = analysis_result([interval("2026-01-14T00:00:00+00:00", None, 100.0)])
    comparison = build_cutoff_comparison(date(2026, 1, 14), {"12:00": result, "16:00": result}, ["12:00", "16:00"])
    assert comparison["cutoffs"][0]["metrics"]["mae"] is None
    assert comparison["common_interval_comparison"]["valid_matched_intervals"] == 0
    assert comparison["common_interval_comparison"]["metrics_by_cutoff"][0]["mae"] is None

"""Orchestration, bounded monthly retrieval, and parameter-aware caching."""
from __future__ import annotations

from concurrent.futures import ThreadPoolExecutor, as_completed
from copy import deepcopy
from datetime import date, datetime, time, timedelta, timezone
from threading import RLock
from typing import Any

from zoneinfo import ZoneInfo

from app.analysis.normalization import analyze_day
from app.analysis.reports import build_cutoff_comparison, build_month_overview, january_dates
from app.services.elexon_client import ElexonAPIError, fetch_day_actuals, fetch_day_forecasts

UK = ZoneInfo("Europe/London")
CACHE_TTL_SECONDS = 300
MAX_MONTH_WORKERS = 4
_cache: dict[str, tuple[float, Any]] = {}
_cache_lock = RLock()


def _cache_get(key: str) -> Any | None:
    import time as clock
    with _cache_lock:
        found = _cache.get(key)
        if not found:
            return None
        expires_at, value = found
        if clock.monotonic() >= expires_at:
            _cache.pop(key, None)
            return None
        return deepcopy(value)


def _cache_set(key: str, value: Any) -> None:
    import time as clock
    with _cache_lock:
        _cache[key] = (clock.monotonic() + CACHE_TTL_SECONDS, deepcopy(value))


def _invalidate_derived_cache(delivery_date: date) -> None:
    """Invalidate reports derived from a date after a successful source refresh."""
    date_token = delivery_date.isoformat()
    with _cache_lock:
        stale_keys = [
            key for key in _cache
            if key.startswith(f"analysis:{date_token}:")
            or key.startswith(f"comparison:{date_token}:")
            or key.startswith("overview:2026-01:")
        ]
        for key in stale_keys:
            _cache.pop(key, None)


def _rows_for_date(
    delivery_date: date, refresh: bool = False
) -> tuple[list[dict[str, Any]], list[dict[str, Any]], datetime]:
    key = f"raw:{delivery_date.isoformat()}"
    if not refresh:
        cached = _cache_get(key)
        if cached is not None:
            return cached
    actuals = fetch_day_actuals(delivery_date)
    forecasts = fetch_day_forecasts(delivery_date)
    retrieved_at = datetime.now(timezone.utc)
    result = (actuals, forecasts, retrieved_at)
    if refresh:
        # A successful source refresh must not leave an older non-refresh derived
        # result available under the normal cache key on the next request.
        _invalidate_derived_cache(delivery_date)
    _cache_set(key, result)
    return result


def _analysis_key(delivery_date: date, cutoff_clock: time, refresh: bool) -> str:
    return f"analysis:{delivery_date.isoformat()}:{cutoff_clock.strftime('%H:%M')}:refresh={int(refresh)}"


def get_analysis(delivery_date: date, cutoff_clock: time, refresh: bool = False) -> dict[str, Any]:
    key = _analysis_key(delivery_date, cutoff_clock, refresh)
    if not refresh:
        cached = _cache_get(key)
        if cached is not None:
            return cached
    actual_rows, forecast_rows, retrieved_at = _rows_for_date(delivery_date, refresh=refresh)
    result = analyze_day(
        delivery_date=delivery_date,
        cutoff_clock=cutoff_clock,
        actual_rows=actual_rows,
        forecast_rows=forecast_rows,
        retrieved_at=retrieved_at,
    )
    result["provenance"]["cache_ttl_seconds"] = CACHE_TTL_SECONDS
    result["provenance"]["cache_bypassed"] = bool(refresh)
    _cache_set(key, result)
    return result


def get_month_overview(cutoff_clock: time, refresh: bool = False) -> dict[str, Any]:
    """Retrieve 31 delivery dates with bounded concurrency and aggregate actual pairs."""
    key = f"overview:2026-01:{cutoff_clock.strftime('%H:%M')}:refresh={int(refresh)}"
    if not refresh:
        cached = _cache_get(key)
        if cached is not None:
            return cached

    day_results: dict[date, dict[str, Any] | Exception] = {}
    with ThreadPoolExecutor(max_workers=MAX_MONTH_WORKERS, thread_name_prefix="elexon-day") as pool:
        futures = {
            pool.submit(get_analysis, delivery_date, cutoff_clock, refresh): delivery_date
            for delivery_date in january_dates()
        }
        for future in as_completed(futures):
            delivery_date = futures[future]
            try:
                day_results[delivery_date] = future.result()
            except Exception as exc:  # Keep each retrieval failure explicit in the partial-month response.
                day_results[delivery_date] = exc

    result = build_month_overview(day_results, cutoff_clock, datetime.now(timezone.utc))
    result["provenance"]["cache_ttl_seconds"] = CACHE_TTL_SECONDS
    result["provenance"]["cache_bypassed"] = bool(refresh)
    if not result.get("partial"):
        _cache_set(key, result)
    return result


def get_cutoff_comparison(
    delivery_date: date, cutoff_times: list[time], refresh: bool = False
) -> dict[str, Any]:
    cutoff_labels = [cutoff.strftime("%H:%M") for cutoff in cutoff_times]
    key = f"comparison:{delivery_date.isoformat()}:{','.join(cutoff_labels)}:refresh={int(refresh)}"
    if not refresh:
        cached = _cache_get(key)
        if cached is not None:
            return cached

    # Fetch the source windows once, then apply each cutoff independently to the same
    # source snapshot. This avoids redundant network requests without reusing selected vintages.
    actual_rows, forecast_rows, retrieved_at = _rows_for_date(delivery_date, refresh=refresh)
    results: dict[str, dict[str, Any]] = {}
    for cutoff in cutoff_times:
        label = cutoff.strftime("%H:%M")
        analysis = analyze_day(
            delivery_date=delivery_date,
            cutoff_clock=cutoff,
            actual_rows=actual_rows,
            forecast_rows=forecast_rows,
            retrieved_at=retrieved_at,
        )
        analysis["provenance"]["cache_ttl_seconds"] = CACHE_TTL_SECONDS
        analysis["provenance"]["cache_bypassed"] = bool(refresh)
        results[label] = analysis
    result = build_cutoff_comparison(delivery_date, results, cutoff_labels)
    result["provenance"]["cache_ttl_seconds"] = CACHE_TTL_SECONDS
    result["provenance"]["cache_bypassed"] = bool(refresh)
    _cache_set(key, result)
    return result


def clear_cache() -> None:
    with _cache_lock:
        _cache.clear()

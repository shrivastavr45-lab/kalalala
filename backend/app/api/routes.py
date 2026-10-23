"""Validated application API routes."""
from __future__ import annotations

import re
from datetime import date, time

from fastapi import APIRouter, HTTPException, Query

from app.services.analysis_service import get_analysis, get_cutoff_comparison, get_month_overview
from app.services.elexon_client import ElexonAPIError

router = APIRouter(prefix="/api")
DATE_PATTERN = re.compile(r"^2026-01-(0[1-9]|[12][0-9]|3[01])$")
TIME_PATTERN = re.compile(r"^(?:[01]\d|2[0-3]):[0-5]\d$")
DEFAULT_COMPARISON_CUTOFFS = "12:00,14:00,16:00,18:00"


def _parse_date(value: str) -> date:
    if not DATE_PATTERN.fullmatch(value):
        raise HTTPException(status_code=422, detail="The delivery date must be between 2026-01-01 and 2026-01-31.")
    try:
        parsed = date.fromisoformat(value)
    except ValueError as exc:
        raise HTTPException(status_code=422, detail="The delivery date must be a valid January 2026 calendar date.") from exc
    if parsed.month != 1 or parsed.year != 2026:
        raise HTTPException(status_code=422, detail="The delivery date must be within January 2026.")
    return parsed


def _parse_cutoff(value: str) -> time:
    if not TIME_PATTERN.fullmatch(value):
        raise HTTPException(status_code=422, detail="Cutoff times must use 24-hour HH:MM format, for example 16:00.")
    return time.fromisoformat(value)


@router.get("/health")
def health() -> dict[str, str]:
    return {"status": "ok", "service": "wind-forecast-intelligence", "data_mode": "live-elexon-only"}


@router.get("/dates")
def dates() -> dict[str, list[str]]:
    return {"dates": [date(2026, 1, day).isoformat() for day in range(1, 32)]}


@router.get("/analysis")
def analysis(
    delivery_date: str = Query(alias="date", description="Delivery date within January 2026"),
    cutoff_time: str = Query(default="16:00", pattern=r"^(?:[01]\d|2[0-3]):[0-5]\d$"),
    refresh: bool = Query(default=False),
) -> dict:
    selected_date = _parse_date(delivery_date)
    cutoff = _parse_cutoff(cutoff_time)
    try:
        return get_analysis(selected_date, cutoff, refresh=refresh)
    except ElexonAPIError as exc:
        raise HTTPException(status_code=502, detail=str(exc)) from exc
    except Exception as exc:
        import logging
        logging.getLogger(__name__).exception("Unexpected analysis failure")
        raise HTTPException(status_code=500, detail="Unexpected analysis error. Check the server logs and retry.") from exc


@router.get("/overview")
def overview(
    cutoff_time: str = Query(default="16:00", pattern=r"^(?:[01]\d|2[0-3]):[0-5]\d$"),
    refresh: bool = Query(default=False),
) -> dict:
    cutoff = _parse_cutoff(cutoff_time)
    try:
        # Per-day source failures are represented in the explicit partial-month schema.
        return get_month_overview(cutoff, refresh=refresh)
    except ElexonAPIError as exc:
        raise HTTPException(status_code=502, detail=str(exc)) from exc
    except Exception as exc:
        import logging
        logging.getLogger(__name__).exception("Unexpected monthly overview failure")
        raise HTTPException(status_code=500, detail="Unexpected monthly overview error. Check the server logs and retry.") from exc


@router.get("/cutoff-comparison")
def cutoff_comparison(
    delivery_date: str = Query(alias="date", description="Delivery date within January 2026"),
    cutoff_times: str = Query(default=DEFAULT_COMPARISON_CUTOFFS, max_length=64,
                              description="Comma-separated unique HH:MM scenario cutoffs, two to eight values"),
    refresh: bool = Query(default=False),
) -> dict:
    selected_date = _parse_date(delivery_date)
    raw_values = [item.strip() for item in cutoff_times.split(",") if item.strip()]
    if not 2 <= len(raw_values) <= 8:
        raise HTTPException(status_code=422, detail="Provide between 2 and 8 distinct cutoff times.")
    if any(not TIME_PATTERN.fullmatch(item) for item in raw_values):
        raise HTTPException(status_code=422, detail="Each cutoff must use 24-hour HH:MM format, for example 14:00.")
    if len(set(raw_values)) != len(raw_values):
        raise HTTPException(status_code=422, detail="Cutoff times must be unique. Duplicate scenarios are not evaluated twice.")
    parsed_cutoffs = [_parse_cutoff(item) for item in raw_values]
    try:
        return get_cutoff_comparison(selected_date, parsed_cutoffs, refresh=refresh)
    except ElexonAPIError as exc:
        raise HTTPException(status_code=502, detail=str(exc)) from exc
    except Exception as exc:
        import logging
        logging.getLogger(__name__).exception("Unexpected cutoff comparison failure")
        raise HTTPException(status_code=500, detail="Unexpected cutoff comparison error. Check the server logs and retry.") from exc

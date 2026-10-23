"""FastAPI application serving JSON endpoints and built React assets."""
from __future__ import annotations

import logging
import os
from pathlib import Path

from fastapi import FastAPI, Request
from fastapi.responses import FileResponse, JSONResponse
from fastapi.staticfiles import StaticFiles

from fastapi.middleware.cors import CORSMiddleware

from app.api.routes import router

logging.basicConfig(level=os.getenv("LOG_LEVEL", "INFO"))
logger = logging.getLogger("wind_forecast_intelligence")
app = FastAPI(
    title="Wind Forecast Intelligence API",
    description="Evaluates Elexon wind forecasts against actual generation for January 2026.",
    version="1.0.0",
)

allowed_origins_raw = os.getenv("CORS_ORIGINS", "*")
allowed_origins = [o.strip() for o in allowed_origins_raw.split(",") if o.strip()]
app.add_middleware(
    CORSMiddleware,
    allow_origins=allowed_origins if allowed_origins else ["*"],
    allow_origin_regex=r"https://.*\.vercel\.app",
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

app.include_router(router)

STATIC_DIR = Path(os.getenv("STATIC_DIR", str(Path(__file__).parent / "static")))
if STATIC_DIR.exists():
    app.mount("/assets", StaticFiles(directory=STATIC_DIR / "assets", check_dir=False), name="assets")


@app.exception_handler(Exception)
async def unexpected_exception_handler(request: Request, exc: Exception):
    logger.exception("Unhandled request error on %s", request.url.path)
    return JSONResponse(status_code=500, content={"detail": "Unexpected server error. Check application logs."})


@app.get("/wind-mark.svg", include_in_schema=False)
def frontend_favicon():
    favicon = STATIC_DIR / "wind-mark.svg"
    if favicon.exists():
        return FileResponse(favicon, media_type="image/svg+xml", headers={"Cache-Control": "public, max-age=3600"})
    return JSONResponse(status_code=404, content={"detail": "Favicon asset not found."})


@app.get("/", include_in_schema=False)
def frontend_root():
    index = STATIC_DIR / "index.html"
    if index.exists():
        return FileResponse(index)
    return {
        "message": "Frontend assets are not built yet.",
        "development": "Run the Vite frontend on port 5173 and FastAPI on port 8000.",
        "api_docs": "/docs",
    }


@app.get("/{full_path:path}", include_in_schema=False)
def frontend_fallback(full_path: str):
    # Do not turn unknown API paths into HTML.
    if full_path.startswith("api/") or full_path in {"api", "docs", "redoc", "openapi.json"}:
        return JSONResponse(status_code=404, content={"detail": "Not found"})
    index = STATIC_DIR / "index.html"
    if index.exists():
        return FileResponse(index)
    return JSONResponse(status_code=404, content={"detail": "Frontend build not found. See README.md."})

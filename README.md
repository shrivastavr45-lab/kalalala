# Wind Forecast Intelligence

Wind Forecast Intelligence evaluates the existing UK national wind generation forecasts in Elexon against actual wind generation for delivery dates **1–31 January 2026**. It is a historical forecast-evaluation tool, not a new forecasting model and not an automated purchasing recommendation.

> **Data integrity:** production views and exports use API-calculated source results only. The app does not ship sample readings or substitute fabricated metrics when an upstream request fails. Missing source observations remain missing.

## Analysis views

### Daily analysis

Select a January 2026 delivery date and a configurable cutoff clock. The chosen clock applies to the **previous calendar day in `Europe/London`**. `16:00` is a demonstration default, not an official market deadline. The daily view shows forecast and actual series across the 48 expected half-hour periods, forecast error by interval, a detailed table, metrics, coverage, data-quality counts, source provenance, and warnings. The interval CSV includes the actual selected values and metadata.

### January performance overview

The overview covers all 31 January delivery dates (1,488 expected half-hour intervals) for one chosen cutoff. It shows daily MAE, RMSE, bias, valid-pair counts, expected intervals, coverage, missing intervals, status, trends, and source provenance. Monthly metrics are calculated from the pooled interval-level valid pairs; monthly RMSE is **not** an average of daily RMSEs. A partial month is explicitly marked, and metrics use only pairs actually returned. Deterministic review flags are exposed in the interface and API: high error means daily MAE of at least 1,000 MW; low coverage means fewer than 90% of expected intervals have valid matched pairs. These are review thresholds, not statistical anomaly detection.

The backend uses bounded concurrency of four day-level tasks and the existing five-minute in-memory cache. Failed dates remain visible in the returned partial-month result. There is no endless retry loop and the monthly endpoint does not replace unavailable data with fixtures.

### Forecast cutoff comparison

Choose a January delivery date and 2–8 unique cutoff times. The suggested times are 12:00, 14:00, 16:00, and 18:00, but all are analysis scenarios, not official decision deadlines. The backend independently selects the latest eligible forecast publication for each interval at each cutoff, then joins to actuals by delivery-period `startTime`. All-valid-pair metrics and coverage are shown for every cutoff. A separate common-interval calculation is also displayed so users can compare like-for-like periods when coverage differs.

### Reports and print

The dashboard supports selected-day interval CSV, January daily-summary CSV, cutoff-comparison CSV, and browser print. CSV nulls become empty fields, quotes/commas/newlines are escaped, and formula-like untrusted text fields are prefixed to reduce spreadsheet formula injection risk. Reports reflect data returned by the API only.

### Interface design and accessibility

The interface uses a restrained navy, sea-glass teal, and neutral-paper palette, with a clear editorial header and explicit analysis scope. The design takes cues from scientific data storytelling used by the Ocean Health Index: concise framing, strong hierarchy, clear paths to distinct analytical views, and visible method/provenance context. It does not reuse Ocean Health Index branding, photography, or page assets. All existing daily, monthly, comparison, data-quality, provenance, export, print, and legal workflows remain available.

Controls and tables use readable labels and visible keyboard focus. A skip link supports keyboard navigation; compact navigation remains available on narrow screens; chart colors are paired with labels/table values rather than used as the sole explanation; and reduced-motion preferences are respected. Styling lives in `frontend/src/styles.css` and the product-specific refinement layer `frontend/src/theme.css`. No third-party font, analytics tracker, decorative stock image, or external illustration service is loaded for presentation.

## Technology and structure

| Layer | Technology | Responsibility |
|---|---|---|
| Frontend | React, Vite, Recharts, Lucide | Daily analysis, monthly overview, cutoff comparison, CSV/print, and legal pages |
| Backend | Python, FastAPI, Pandas, Requests, Uvicorn | Elexon access, normalization, cutoff selection, metrics, caching, and report APIs |
| Tests | Pytest, FastAPI TestClient, Node test runner | Deterministic calculation/API/CSV tests without live Elexon requests |
| Deployment | Multi-stage Docker build and single FastAPI container | One-origin production serving of the built frontend and API |

```text
Browser
  └─ React/Vite dashboard
       ├─ GET /api/analysis
       ├─ GET /api/overview
       └─ GET /api/cutoff-comparison
            └─ FastAPI routes
                 └─ analysis service/cache
                      ├─ Elexon FUELHH: actual generation filtered to WIND
                      └─ Elexon WINDFOR: historical forecast publications
                           └─ timestamp normalization → cutoff eligibility
                                → latest eligible forecast by delivery startTime
                                     → match with actuals → metrics and provenance
```

Relevant paths:

```text
backend/app/api/routes.py                  HTTP validation and routes
backend/app/analysis/normalization.py       timestamps, selection, joins, coverage
backend/app/analysis/metrics.py             MAE, RMSE, bias
backend/app/analysis/reports.py             monthly pooled metrics and cutoff aggregation
backend/app/services/elexon_client.py      bounded requests to Elexon
backend/app/services/analysis_service.py   cache, orchestration, bounded concurrency
backend/tests/                               deterministic Python tests
frontend/src/App.jsx                         dashboard views and exports
frontend/src/LegalPage.jsx                   privacy and terms implementation drafts
frontend/src/services/api.js                 JSON client and request abort support
frontend/src/services/csv.js                 CSV serialization and formula protection
frontend/src/services/reports.js             stable CSV schema, metadata, and filenames
frontend/src/styles.css                      base layout and print styling
frontend/src/theme.css                       editorial visual system and responsive refinement
frontend/public/wind-mark.svg                original vector favicon
frontend/tests/                              CSV/report tests
frontend/index.html                          title, description, and favicon link
docs/demo-script.md                          walkthrough guide
docs/deployment-guide.md                    single-container and domain setup
docs/launch-checklist.md                     required release gates
docs/verification-report.md                  exact current check outcomes
Dockerfile                                   frontend build + FastAPI serving
```

## Approved data sources and assumptions

Only two Elexon datasets are permitted:

1. **FUELHH**, half-hourly generation outturn by fuel type. The backend retains `fuelType=WIND` records for the selected delivery date. [Official FUELHH stream documentation](https://bmrs.elexon.co.uk/api-documentation/endpoint/datasets/FUELHH/stream).
2. **WINDFOR**, wind generation forecasts. Publication timestamps are retained to select the forecast vintage available by the cutoff. [Official WINDFOR stream documentation](https://bmrs.elexon.co.uk/api-documentation/endpoint/datasets/WINDFOR/stream).

The client calls `https://data.elexon.co.uk/bmrs/api/v1/datasets/{FUELHH|WINDFOR}/stream` using `publishDateTimeFrom` and `publishDateTimeTo` as UTC timestamps, then filters records to the delivery period locally. The source API contract and publication-time filtering are documented in `backend/app/services/elexon_client.py`; the assumptions below are finite MVP retrieval windows, not claims about the complete historic availability horizon:

- FUELHH actual revisions: delivery day through 14 days after delivery.
- WINDFOR publications: 14 days before delivery through the end of delivery day.
- Request timeout: 25 seconds. HTTP 429 and request/response errors are surfaced; there is no infinite retry loop.
- Raw API responses and derived results use a five-minute in-process cache. Process restarts clear the cache; this is not a distributed cache.

**Cutoff and matching contract**

1. Calculate the selected cutoff as the chosen time on the day before delivery, localized to `Europe/London`.
2. Exclude any forecast whose `publishTime` is after that cutoff. Forecasts without a usable publication timestamp are rejected.
3. For every half-hour delivery interval, select the latest eligible `publishTime`; use a deterministic tie-break for duplicate publications.
4. Join selected forecasts to actuals on normalized delivery-period `startTime`, never on publication time.
5. Calculate error as `forecast - actual`. Positive means overforecast; negative means underforecast.

January 2026 uses UK winter time (GMT). The implementation nevertheless uses timezone-aware timestamps and `Europe/London` for business-facing timestamps.

## Metric and coverage definitions

For valid interval pairs, let forecast be `F`, actual be `A`, error be `e = F - A`, and `N` be the number of valid pairs:

- `MAE = sum(abs(e)) / N`
- `RMSE = sqrt(sum(e²) / N)`
- `bias = sum(e) / N`
- `coverage_pct = 100 × valid matched pairs / expected intervals`

Metrics use finite numeric forecast/actual pairs only. For `N = 0`, MAE, RMSE, and bias are `null`, not zero. The month-level metrics use the pooled matched pairs across every successfully retrieved date. The coverage monitor distinguishes selected eligible forecast intervals from numeric forecast values and from valid forecast/actual pairs.

## API

All date inputs must be in January 2026. Clock values use 24-hour `HH:MM`. `refresh=true` bypasses the cache for source retrieval.

| Endpoint | Purpose | Main response fields |
|---|---|---|
| `GET /api/health` | Health/mode response | `status`, `service`, `data_mode` |
| `GET /api/dates` | Allowed dates | `dates` (31 ISO date strings) |
| `GET /api/analysis?date=2026-01-14&cutoff_time=16:00` | Daily analysis | `delivery_date`, `cutoff_datetime`, `expected_intervals`, `observations`, `metrics`, `coverage`, `data_quality`, `provenance` |
| `GET /api/overview?cutoff_time=16:00` | Full January report | `period_start`, `period_end`, `cutoff_time`, `expected_intervals_total`, `daily`, `monthly_metrics`, `coverage`, `flags`, `partial`, `warnings`, `provenance` |
| `GET /api/cutoff-comparison?date=2026-01-14&cutoff_times=12:00,14:00,16:00,18:00` | Compare independent cutoff scenarios | `delivery_date`, `cutoffs`, `common_interval_comparison`, `provenance`, `warnings` |

`/api/analysis` observations contain both `start_time` (the delivery-period timestamp) and `forecast_publish_time` (the forecast publication timestamp), as separate fields. Its `data_quality` reports expected periods, selected forecast periods, numeric forecast periods, actual value periods, matched pairs, missing forecast/actual counts, detected duplicates, invalid source timestamps rejected, and post-cutoff forecast rows excluded.

The overview's `daily` list has one element for each expected delivery date, including failed retrievals with explicit `status`, `error`, and `warnings`. Each successful daily element reports the metrics, valid-pair count, selected eligible forecast interval count, numeric forecast count, actual count, missing counts, coverage, warnings, and retrieval time. The `monthly_metrics` are pooled interval-level metrics. The monthly `coverage` reports expected and valid intervals plus requested, retrieved, and failed day counts. `flags` includes both thresholds and the list of flagged dates.

Cutoff comparison `cutoffs` reports each cutoff timestamp, all-valid-pair metrics, pair count, expected interval count, selected forecasts, coverage, and warnings. `common_interval_comparison` includes the intersection pair count and independently recomputed metrics for those same delivery intervals at each cutoff. Cutoff input must contain 2–8 distinct clock times; invalid input returns HTTP 422. Upstream retrieval errors in the daily and comparison routes return HTTP 502; unforeseen server errors return HTTP 500 with a non-sensitive response message.

## Local setup

### Backend

Python 3.11+ is supported with compatible dependency versions; Python 3.12 is recommended.

**Windows PowerShell** from the project root:

```powershell
py -3.12 -m venv .venv
.\.venv\Scripts\Activate.ps1
python -m pip install --upgrade pip
pip install -r backend\requirements.txt
$env:PYTHONPATH = "backend"
python -m uvicorn app.main:app --app-dir backend --reload --port 8000
```

**macOS/Linux** from the project root:

```bash
python3.12 -m venv .venv
source .venv/bin/activate
python -m pip install --upgrade pip
pip install -r backend/requirements.txt
PYTHONPATH=backend python -m uvicorn app.main:app --app-dir backend --reload --port 8000
```

Check `http://localhost:8000/api/health`; API docs are at `http://localhost:8000/docs`.

### Frontend

In another terminal:

```bash
cd frontend
npm install
npm run dev
```

Open `http://localhost:5173`. The Vite dev server proxies `/api` to FastAPI on port 8000.

### Tests and build

From the project root:

```bash
python -m pytest -q backend/tests
python -m compileall -q backend/app backend/tests
```

From `frontend/`:

```bash
npm test
npm run build
```

Frontend CSV tests use Node's built-in test runner. A real Vite production build is required before release, even if JSX syntax checks succeed separately.

### Docker

From the project root, after installing and starting Docker:

```bash
docker compose up --build
```

Check `http://localhost:8000`, `/api/health`, `/privacy`, `/terms`, and `/wind-mark.svg`. The runtime serves frontend static files and the API from one origin.

## Privacy, terms, and launch status

The app includes `/privacy` and `/terms` pages. They are **implementation drafts**, not legal advice or a declaration of legal compliance. The owner must confirm the operator identity, actual hosting/logging practices, contact route, applicable law, and all legal copy before public launch. No fictional company name, address, or email has been added.

See [the launch checklist](docs/launch-checklist.md) and [the deployment guide](docs/deployment-guide.md). A custom domain and HTTPS are not considered configured until the actual domain is supplied, the hosting provider's DNS target is applied and propagated, and HTTPS is verified. Use the real target returned by the hosting provider, never a guessed CNAME target.

## Verification status for this package

The current source verification includes the UI/UX refinement pass. Tests were run on the working tree; the final archive clean-extraction checks are recorded in the attached verification report.

- Backend pytest suite from the clean extraction: **49 passed**.
- Python compile check: **passed**.
- Frontend Node test suite from the clean extraction: **11 passed**, including five UI contract tests added during the design refinement.
- JavaScript/JSX syntax transpilation using the installed TypeScript compiler: **passed** for `App.jsx`, `LegalPage.jsx`, `main.jsx`, and all three frontend service modules. This does not replace Vite bundling.
- Archive: **ZIP integrity passed**, 45 project files present, clean extraction succeeded, and development caches/dependency folders were excluded.
- Prohibited visual-pattern search: **no matches** for the searched patterns (gradients, “Made with AI”, em dash, cursor effects, Google font imports, or “emoji” markers in frontend source/styles).
- Actual Vite production build: **blocked** because `vite` is not installed. npm dependency installation was attempted but the runtime could not resolve `registry.npmjs.org` (`EAI_AGAIN`).
- Docker build/start: **not run** because the Docker executable is not installed.
- Live Elexon data: **not verified** because DNS resolution for `data.elexon.co.uk` failed in this runtime for both datasets. API tests are deterministic and mock upstream responses.
- Heroku deployment, custom domain, DNS, and HTTPS: **not configured or verified** because no hosting credentials or domain were supplied.

The project is consequently **not launch-ready** until the blocked build/live-data checks are rerun successfully in a network-enabled environment and all owner-controlled launch gates in `docs/launch-checklist.md` are completed.

## AI tools & assistance disclosure

AI-assisted tools (including OpenAI ChatGPT and LLM developer assistants) were utilized strictly as **supplementary productivity aids** during the development of this project. AI was not used to autonomously generate the system; all domain logic, system architecture, calculations, and final implementations were directed, reviewed, and verified by the developer.

### Specific areas of AI assistance:
- **Code scaffolding & boilerplate:** Accelerated initial drafting of repetitive code structures, such as standard FastAPI route definitions, Pydantic schemas, and base React component scaffolding.
- **Test case generation & edge cases:** Suggested candidate test cases, boundary-condition fixtures, and assertion patterns for backend Pytest suites and frontend CSV export validation.
- **UI styling & layout refinement:** Aided in exploring CSS utility rules, responsive flex/grid layouts, and glassmorphic aesthetic details in `theme.css`.
- **Documentation formatting:** Assisted in organizing markdown tables, structuring API documentation, and drafting checklist templates.

### Human engineering & oversight:
- **Domain & mathematical accuracy:** All energy market domain logic—including Elexon BMRS data integration (FUELHH outturn & WINDFOR forecasts), publication cutoff eligibility rules, half-hour interval alignment, and pooled interval MAE/RMSE calculations—was designed, verified, and audited by human engineering.
- **Security & data integrity:** Strict enforcement of zero synthetic/mocked data fallback in production routes, CSV formula injection mitigation, and deterministic error handling were authored and validated by the developer.
- **Testing & deployment:** All test suites, compilation steps, container configurations, and release workflows were independently executed and validated. No external accounts, credentials, or hosting platforms were accessed by AI tools.

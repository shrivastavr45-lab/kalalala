# Wind Forecast Intelligence: demo script

Maximum recording length: ten minutes. Use real API results only. If the current environment cannot retrieve Elexon data, show the exact error and explain that no fixture values are substituted.

## 1. Product walkthrough (up to five minutes)

**0:00–0:35 | Scope and date range**
Explain that Wind Forecast Intelligence evaluates forecasts for UK national wind generation against actual wind generation for delivery dates 1–31 January 2026. It does not train or run a new forecast model.

**0:35–1:15 | Daily analysis**
Choose a delivery date and cutoff. State that the cutoff clock is on the preceding day in `Europe/London`, and that 16:00 is a configurable scenario, not an official market deadline. Point out delivery `startTime` versus forecast `publishTime` in the table.

**1:15–2:00 | Metrics and coverage**
Define MAE, RMSE, and bias using error = forecast minus actual. Explain that only finite numeric matched pairs contribute. Show expected intervals, selected forecasts, actual values, matched pairs, missing counts, duplicate counts, invalid-timestamp rejections, excluded after-cutoff forecast rows, applied cutoff, retrieval time, and warnings.

**2:00–3:00 | January overview**
Select the month view and choose a cutoff. Show daily trends and all 31 dates, including failed/unavailable dates when relevant. Explain that monthly metrics pool the valid interval pairs; they are not computed by averaging daily metrics. State the explicit review flags: MAE at least 1,000 MW and coverage below 90%.

**3:00–3:50 | Cutoff comparison**
Pick a January delivery date and compare at least two cutoff times. Explain that each cutoff re-selects the latest forecast publication available by that scenario. Compare the all-valid-pair table and its pair counts, then show the separate common-interval metrics if the shared set is non-empty.

**3:50–4:30 | Export and print**
Export a selected-day interval CSV, monthly daily-summary CSV, or cutoff-comparison CSV. Explain blank fields for missing numbers and the print-friendly view. Use actual API-backed results only.

**4:30–5:00 | Legal and provenance**
Show the two Elexon sources, Privacy Policy, Terms and Conditions, and the note that the legal pages require owner/legal review. Mention that availability and retrieval-window assumptions affect what is observable.

## 2. Technical review (up to five minutes)

**0:00–0:50 | Code map**
Show `frontend/src/App.jsx`, `frontend/src/services/api.js`, `frontend/src/services/csv.js`, `backend/app/api/routes.py`, `backend/app/analysis/normalization.py`, `backend/app/analysis/reports.py`, `backend/app/services/analysis_service.py`, and `backend/app/services/elexon_client.py`.

**0:50–1:50 | Source selection**
Explain the 25-second request timeout, five-minute in-process cache, 14-day bounded FUELHH revision window, and 14-day WINDFOR lookback. These are explicit MVP assumptions. Show how eligible forecast publications are filtered before latest-vintage selection and how values are joined on delivery `startTime`.

**1:50–2:40 | Monthly/cutoff semantics**
Show `build_month_overview` pooling interval-level pairs and `build_cutoff_comparison` computing cutoff-specific metrics and the separate common-interval subset. The monthly retrieval worker pool is bounded to four workers.

**2:40–3:35 | Deterministic tests**
Run `python -m pytest -q backend/tests` and `cd frontend; npm test`. Tests do not depend on live Elexon network calls. Explain the exact observed output rather than claiming unrun build or deployment checks.

**3:35–4:20 | Static/legal checks**
Show the original SVG favicon at `/wind-mark.svg`, and pages at `/privacy` and `/terms`. Note that a Vite build and production-like browser checks are still required if they have not passed in the presenting environment.

**4:20–5:00 | Deployment gate**
Show the deployment guide and launch checklist. Do not claim Docker build, a Heroku release, custom domain, DNS, HTTPS, or live API retrieval unless each was actually verified. Report any external/network blockers clearly.

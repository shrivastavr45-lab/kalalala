# Launch checklist

**Current release status: NOT LAUNCH-READY.** The code includes the implementation work listed below, but the frontend production build, Docker runtime verification, live Elexon retrieval, custom domain, DNS, HTTPS, and owner-approved legal copy have not been verified in this work session.

## Application and analytics

- [x] January 2026 scope remains 1–31 January only in API date validation.
- [x] Forecast eligibility uses `publishTime <= cutoff` before latest-vintage selection.
- [x] Forecasts are matched to actuals by delivery-period `startTime`.
- [x] Error sign is forecast minus actual.
- [x] Monthly metrics pool valid interval pairs, not daily metric averages.
- [x] Daily coverage distinguishes selected forecast intervals, numeric forecast values, actual values, and valid matched pairs.
- [x] Invalid/missing source timestamps are counted as rejected records as well as described by warnings.
- [x] Cutoff comparisons independently select each cutoff scenario and report pair counts/coverage.
- [x] Missing values remain null in APIs and become empty fields in CSV.
- [x] No production fixtures, sample values, or fallback metrics are intentionally supplied.
- [x] Deterministic backend and CSV tests pass in the current work session.
- [x] Source-code search for specified prohibited visual patterns returned no matches.
- [x] Ocean Health Index-inspired scientific hierarchy and restrained navy/teal visual system applied without reusing its logo, photography, or site assets.
- [x] UI contract tests cover navigation/view retention, data/export actions, explicit scope, keyboard skip link, focus styling, narrow-screen breakpoints, and reduced motion.
- [ ] Frontend `npm run build` passes with dependencies installed.
- [ ] `docker compose up --build` succeeds and the running container serves UI, API, favicon, `/privacy`, and `/terms` after direct navigation and refresh.
- [ ] Responsive browser review at desktop, tablet, and narrow mobile widths.
- [ ] Verify full rendered text contrast, chart axes/legends, warnings, and status combinations using browser and accessibility tooling.
- [ ] Keyboard and screen-reader review verifies all tab controls, inputs, charts/tables, export controls, links, warnings, and focus indicators.

## Data and operations

- [ ] From a normal internet-connected host, make a small live FUELHH request and WINDFOR request and inspect their real response shapes, timestamps, and units.
- [ ] Load January 2026 daily and monthly analyses from live Elexon data. Confirm coverage, warnings, source counts, cutoff selection, and metric values.
- [ ] Review the finite request windows in `backend/app/services/elexon_client.py`: 14 days after delivery for FUELHH revisions and 14 days before delivery for WINDFOR publications. Adjust only if source documentation/assignment requirements justify it.
- [ ] Check logs and response handling for upstream timeout, malformed JSON, HTTP 429, unavailable source data, and partial month retrieval.
- [ ] Run the full commands listed in `docs/verification-report.md` on a build-capable, network-enabled machine and record the exact output.

## Security, legal, favicon, and site metadata

- [x] Original vector SVG favicon asset created at `frontend/public/wind-mark.svg` and linked in `frontend/index.html`.
- [x] Specific page title and meta description added.
- [x] No “Made with AI” or equivalent visible badge was found in the inspected frontend source.
- [x] `/privacy` and `/terms` paths and footer links are implemented; direct-route behaviour is covered by unit tests.
- [ ] Confirm the favicon path in a successful Vite build and the deployed single-container app.
- [ ] Verify `/privacy`, `/terms`, browser refresh, back/forward navigation, and footer links in the built app and deployed host.
- [ ] Owner supplies actual operator/legal-entity identity and a real contact route, if required.
- [ ] Owner confirms deployment provider's actual logging, access, backup, and retention behaviour and edits the Privacy Policy to match.
- [ ] Owner/legal reviewer approves or revises Privacy Policy and Terms. Current pages are implementation drafts and do not establish legal compliance.
- [ ] Owner confirms legal jurisdiction/governing law and any required terms clauses; no jurisdiction was fabricated in the draft.

## Hosting, custom domain, and HTTPS

- [ ] Owner identifies the exact hosting app and supplies a domain they control.
- [ ] Deploy and verify the container using the current Heroku deployment guide or the actual hosting provider's instructions.
- [ ] Add the domain using the hosting provider/CLI and copy the exact DNS target reported by the provider. Do not guess or copy a target from another app.
- [ ] Configure the returned DNS target at the DNS provider. For an apex/root domain, use the provider-supported ALIAS/ANAME or equivalent; do not assume a CNAME is supported at the root.
- [ ] Verify DNS resolution after propagation (for example, `nslookup app.example.com` or `dig app.example.com CNAME`).
- [ ] Enable/verify HTTPS using the hosting provider's certificate-management workflow. For Heroku ACM, check `heroku certs:auto --app ACTUAL_APP_NAME`; the certificate must report an issued/healthy state.
- [ ] Verify `https://YOUR_REAL_DOMAIN/`, `/api/health`, `/wind-mark.svg`, `/privacy`, and `/terms` from a browser or `curl`.
- [ ] Update submission/demo material with only the real, verified deployed URL.

Official Heroku references:

- [Custom Domain Names](https://devcenter.heroku.com/articles/custom-domains)
- [Automated Certificate Management](https://devcenter.heroku.com/articles/automated-certificate-management)
- [Container Registry and Runtime](https://devcenter.heroku.com/articles/container-registry-and-runtime)

## Current-session blockers

- **Vite build:** blocked because `vite` is not installed; npm installation failed because this environment could not resolve `registry.npmjs.org` (`EAI_AGAIN`).
- **Docker:** not run because the Docker executable is unavailable.
- **Live Elexon:** not verified because DNS resolution for `data.elexon.co.uk` failed for both allowed datasets in this environment.
- **Domain/DNS/HTTPS:** not configured. No domain or account credentials were supplied or modified.

Keep this checklist marked **NOT LAUNCH-READY** until the unresolved required gates above are verified, not merely attempted.

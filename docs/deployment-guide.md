# Deployment Guide — Windows-first, beginner-friendly

This guide deploys the single-container app to Heroku. You will need to sign in to your own accounts; no account credentials are included in the project. Heroku account plans and billing can change, so review the current options in your Heroku dashboard before creating a hosted app.

## Overview

1. Run the app locally and verify tests.
2. Put the source code in a GitHub repository.
3. Install Docker Desktop and Heroku CLI.
4. Build and deploy the Docker web container to Heroku.
5. Verify health, live data, and logs.

## Part A — Prepare the project locally

1. Download and extract the delivered `wind-forecast-intelligence-enhanced.zip` archive.
2. Open the extracted `wind-forecast-intelligence` folder in VS Code.
3. Install Python 3.12, Node.js 22 LTS, Git, and Docker Desktop if you have not already.
4. Open the VS Code terminal at the project root.
5. Install backend dependencies and run tests:

   **PowerShell**

   ```powershell
   py -3.12 -m venv .venv
   .\.venv\Scripts\Activate.ps1
   python -m pip install --upgrade pip
   pip install -r backend\requirements.txt
   python -m pytest -q backend\tests
   ```

6. Run the frontend locally in a different terminal:

   ```powershell
   cd frontend
   npm install
   npm run dev
   ```

7. In the first terminal, start the backend from the project root with:

   ```powershell
   $env:PYTHONPATH = "backend"
   python -m uvicorn app.main:app --app-dir backend --reload --port 8000
   ```

8. Open `http://localhost:5173`. If the Elexon API is unavailable, read the error message shown in the dashboard; do not make up screenshots or results.

## Part B — Create the GitHub repository

1. Sign in to GitHub and create a **new empty repository**. Suggested name: `uk-wind-forecast-intelligence`.
2. For a public assignment repository, check whether the brief requires an anonymous repository. Do not add your name, college ID, API credentials, `.env` files, or private information to the repository.
3. Leave “Add a README” unchecked because this project already has one.
4. In the terminal at the project root, run:

   ```powershell
   git init
   git add .
   git status
   git commit -m "Build Wind Forecast Intelligence MVP"
   git branch -M main
   git remote add origin https://github.com/YOUR-GITHUB-USERNAME/uk-wind-forecast-intelligence.git
   git push -u origin main
   ```

5. Replace `YOUR-GITHUB-USERNAME` with your GitHub username. Confirm the push succeeded by refreshing the repository page.
6. Before pushing, inspect `git status` and confirm `.env`, virtual environments, `node_modules`, `dist`, and secrets are not included. `.gitignore` excludes them.

## Part C — Verify the Docker image locally

1. Make sure Docker Desktop is running.
2. From the project root, run:

   ```powershell
   docker compose up --build
   ```

3. Wait for the image build to finish, then open `http://localhost:8000`.
4. Check `http://localhost:8000/api/health`. You should see a JSON response with `status` set to `ok`.
5. Test a selected day from the API docs at `http://localhost:8000/docs` or open:

   `http://localhost:8000/api/analysis?date=2026-01-14&cutoff_time=16:00`

6. If data retrieval fails, inspect the backend error in the container logs. Common causes are network/DNS restrictions, temporary Elexon failure, invalid response shape, or an endpoint-parameter mismatch that must be resolved against the current official docs. Do not deploy until the app works in a normal internet-connected environment.
7. Stop the container with `Ctrl+C`; optionally run `docker compose down` in another terminal.

## Part D — Deploy to Heroku using Container Registry

Heroku requires account access and may require an eligible paid plan. Confirm account eligibility before proceeding. Official instructions: [Heroku Container Registry & Runtime](https://devcenter.heroku.com/articles/container-registry-and-runtime).

1. Install the Heroku CLI from the official installation page and sign in:

   ```powershell
   heroku login
   ```

2. From the project root, create a new app. Replace `YOUR-UNIQUE-APP-NAME` with a globally available name using lowercase letters and hyphens:

   ```powershell
   heroku create YOUR-UNIQUE-APP-NAME --stack container
   ```

   If you already created the Heroku app, skip this step and use `heroku apps` to confirm its exact name.

3. Log in to Heroku's Docker registry:

   ```powershell
   heroku container:login
   ```

4. Build and push the web image from the project root (where the root `Dockerfile` lives):

   ```powershell
   heroku container:push web --app YOUR-UNIQUE-APP-NAME
   ```

5. Release the image:

   ```powershell
   heroku container:release web --app YOUR-UNIQUE-APP-NAME
   ```

6. Open the app:

   ```powershell
   heroku open --app YOUR-UNIQUE-APP-NAME
   ```

7. Verify the app root and health endpoint. The URL is usually `https://YOUR-UNIQUE-APP-NAME.herokuapp.com`, but use the URL printed by Heroku rather than assuming it.

The application reads the `$PORT` environment variable that Heroku injects into the runtime. The container contains both the static React build and the FastAPI backend, so no separate frontend app or CORS setup is required.

## Part E — Check logs and diagnose failures

View recent logs:

```powershell
heroku logs --tail --app YOUR-UNIQUE-APP-NAME
```

Check app information:

```powershell
heroku apps:info --app YOUR-UNIQUE-APP-NAME
```

Common failures:

- **Build fails at `npm install`:** confirm Node registry access and rerun `heroku container:push web`.
- **Container starts but does not become healthy:** check that the process binds to `$PORT` and review the logs. The supplied Dockerfile already uses the platform port.
- **Homepage loads but charts are empty:** inspect the dashboard's Elexon error and logs. The app intentionally does not ship fake production values.
- **HTTP 422:** the selected date must be from January 1–31, 2026; cutoff uses 24-hour `HH:MM`.
- **HTTP 502:** the backend could not retrieve a usable Elexon response. Check the official endpoint documentation and retry.
- **HTTP 429:** Elexon rate-limited the request; wait briefly and retry.

## Part F — Submission checklist

- [ ] GitHub repository contains the project, README, tests, demo script, and deployment guide.
- [ ] `python -m pytest -q backend/tests` passes in your environment.
- [ ] `docker compose up --build` starts locally.
- [ ] `/api/health` returns `status: ok` in the deployed app.
- [ ] `/api/overview` and `/api/cutoff-comparison` return explicit live-data or upstream-error responses, never fabricated values.
- [ ] `/privacy`, `/terms`, and `/wind-mark.svg` load directly and survive refresh in the deployed app.
- [ ] Live January 2026 data actually loads from the official Elexon endpoints.
- [ ] Daily, monthly, and cutoff-comparison views, refresh, missing-value states, provenance, all CSV exports, and print output are demonstrated.
- [ ] Custom domain DNS and HTTPS are verified as described in Part G.
- [ ] Privacy Policy and Terms have been reviewed and approved by the owner/legal reviewer.
- [ ] Deployed URL in submission is the actual URL, not a placeholder.
- [ ] AI assistance disclosure reflects all tools actually used.
- [ ] The demo video is under ten minutes: customer presentation ≤5 minutes and technical review ≤5 minutes.

Do not claim that deployment is complete until you have released the container and verified it in a browser.

## Part G — Configure a custom domain and verify HTTPS

**This is a release blocker, not an assumed feature.** No domain should be called connected until DNS resolves to the actual host target and HTTPS presents a valid certificate for that domain.

1. Deploy and smoke-test the app on the hosting provider's assigned hostname first. Confirm `/`, `/api/health`, `/wind-mark.svg`, `/privacy`, and `/terms` respond correctly.
2. Purchase or identify a domain that you control. Do not put a guessed domain into this repository or claim that account settings have been changed.
3. In the provider dashboard/CLI, add your chosen hostname and inspect the resulting custom-domain configuration. For Heroku, official reference: [Custom Domain Names](https://devcenter.heroku.com/articles/custom-domains). Use the exact DNS target that Heroku reports for the actual app. Do **not** copy a CNAME target from a tutorial or another app because targets can be app-specific.
4. At the DNS provider, set the record type/value the hosting provider specifies. A subdomain such as `app.example.com` commonly uses the returned CNAME target. A root/apex domain may need the DNS provider's ALIAS/ANAME or equivalent because ordinary CNAME records generally cannot be used at the apex. Follow the authoritative provider instructions for the actual configuration.
5. Wait for DNS propagation, then query the records. Examples (substitute the real hostname):

   ```powershell
   nslookup app.example.com
   ```

   ```bash
   dig app.example.com CNAME
   dig app.example.com A
   ```

   Compare the results with the exact configuration shown by the hosting provider. DNS can use different record types depending on the provider and domain setup; do not treat a single query alone as proof that the app is serving correctly.
6. Enable/verify HTTPS using the provider's certificate manager. On Heroku, see [Automated Certificate Management](https://devcenter.heroku.com/articles/automated-certificate-management). Inspect certificate status with:

   ```powershell
   heroku certs:auto --app ACTUAL_APP_NAME
   ```

   If ACM is not enabled and your plan/app configuration supports it, follow Heroku's current documentation to enable it, then wait for the issued certificate status. Do not treat a pending certificate as a pass.
7. Verify over HTTPS from a browser and command line. Substitute only the real hostname:

   ```bash
   curl -I https://app.example.com/
   curl -fsS https://app.example.com/api/health
   curl -I https://app.example.com/wind-mark.svg
   curl -I https://app.example.com/privacy
   curl -I https://app.example.com/terms
   ```

   Open `/privacy` and `/terms` directly, refresh each page, and verify the footer links. Inspect the certificate validity and that the requested host name appears in the certificate.
8. Record the real domain, DNS target source, timestamp checked, TLS/certificate status, and actual HTTP results in the launch checklist. Do not commit provider secrets or access tokens.

A correct domain DNS setup alone does not prove deployment correctness. A successful homepage response alone does not prove Elexon retrieval. Both application routes and live upstream access must be checked independently.

## Part H — Release gates and project-specific endpoints

Before public release, follow `docs/launch-checklist.md` and read `docs/verification-report.md` for the exact current-session status. At minimum, a fresh environment must pass the Python tests, frontend Node tests, real Vite production build, and Docker build/start. The live Elexon source test and deployment smoke test are separate checks.

The additional reporting endpoints are:

- `GET /api/overview?cutoff_time=16:00`
- `GET /api/cutoff-comparison?date=2026-01-14&cutoff_times=12:00,14:00,16:00,18:00`

Use only January 2026 delivery dates. All cutoff scenarios are analysis settings, not asserted official market deadlines. Inspect pair counts and coverage before interpreting any metric. Privacy Policy and Terms pages at `/privacy` and `/terms` are implementation drafts and need owner/legal review; do not describe them as evidence of legal compliance.

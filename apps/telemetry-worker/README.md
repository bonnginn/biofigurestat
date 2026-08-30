# BioFigureStat Alpha telemetry deployment

This Worker hosts two deliberately separate Alpha collectors:

- `/v1/usage` accepts only fixed research-data-free usage/error events from `src/schema.ts`.
- `/v1/problem-reports` accepts only explicit user-reviewed reports from
  `src/problemReportSchema.ts`.

Neither route is a project-data, file, screenshot, or generic upload endpoint.

## Problem-report contract

- JSON only; exact schema; unknown fields are rejected.
- Maximum request body: 16 KiB, enforced before JSON parsing when `Content-Length` is present and
  again on the actual UTF-8 body.
- Required text: `attempted` 1–1,500 characters and `observed` 1–2,000 characters.
- Optional reply email: maximum 254 characters and encrypted with AES-256-GCM using
  `REPORT_CONTACT_ENCRYPTION_KEY`.
- Optional diagnostics use their own exact privacy-reduced schema. No arbitrary detail object is
  accepted.
- CORS permits only the exact native origins in `ALLOWED_ORIGINS`.
- A public `REPORT_INGEST_KEY` separates report ingestion from usage ingestion.
- The Workers Rate Limiting binding permits 5 report attempts per reporter ID per minute per
  Cloudflare location. D1 additionally permits 10 accepted reports per reporter ID per UTC day.
- `submissionId` is unique and makes explicit retry idempotent. An exact normalized-content hash
  returns the existing report ID for duplicates received within 24 hours.
- Reports and append-only status history expire after 90 days. Reply email expires 30 days after a
  terminal status or with the report, whichever is earlier.
- The database has no source-IP column. Cloudflare can process ordinary HTTP transport metadata.

Admin HTML at `/admin` and `/v1/admin/*` require a verified Cloudflare Access JWT with the exact
configured audience. Missing `ACCESS_TEAM_DOMAIN` or `ADMIN_ACCESS_AUD` returns 503. Lists and the
daily `/v1/admin/triage` feed never decrypt reply email; `/contact` is a separate explicit request.

## Deployment gate

Do not deploy or enable the client until all of these are owned and approved:

- Cloudflare account and deployment region
- privacy/deletion contact displayed to researchers
- exact Worker URL and public ingestion key
- 90-day retention and scheduled deletion
- exact Tauri origins in Worker CORS
- exact Worker origin in the packaged Tauri CSP

## One-time setup

From this directory, authenticate Wrangler and create the D1 database. Copy the returned database
UUID into `wrangler.jsonc`; never commit an API token or the ingestion key.

```text
npx wrangler login
npx wrangler d1 create biofigurestat-telemetry
npx wrangler secret put INGEST_KEY
npx wrangler secret put REPORT_INGEST_KEY
npx wrangler secret put REPORT_CONTACT_ENCRYPTION_KEY
npx wrangler d1 migrations apply biofigurestat-telemetry --remote
npx wrangler deploy
```

The ingestion key is a public application key, not an authentication secret. The collector still
enforces exact origin, schema, request-size and per-installation limits. Cloudflare account tokens
remain server-side and must never be compiled into the application.

## Current Alpha deployment

- Endpoint: `https://biofigurestat-telemetry.biofigurestat.workers.dev/v1/usage`
- Health: `https://biofigurestat-telemetry.biofigurestat.workers.dev/health`
- D1 region observed during deployment smoke: APAC / NRT
- Event retention: 90 days

Never add the ingestion key to this file or commit it to the repository.

## Release preflight

Set the following only in the release environment:

```text
VITE_USAGE_TELEMETRY_ENDPOINT=https://<worker-host>/v1/usage
VITE_USAGE_TELEMETRY_INGEST_KEY=<same public key configured as INGEST_KEY>
BIOFIGURESTAT_PRIVACY_CONTACT=<email or https URL>
VITE_USAGE_TELEMETRY_PRIVACY_CONTACT=<same email or https URL shown in the consent UI>
VITE_PROBLEM_REPORT_ENDPOINT=https://<worker-host>/v1/problem-reports
VITE_PROBLEM_REPORT_INGEST_KEY=<same public key configured as REPORT_INGEST_KEY>
```

Run `pnpm telemetry:release-config`. It fails if the D1 ID is still a placeholder, the endpoint is
not exact HTTPS, CORS contains a wildcard, required native origins are missing, or the privacy
contact is absent. It writes `.tmp/telemetry-release-config.json`; pass that overlay to the Tauri
release build in addition to the ordinary config. The overlay contains only the endpoint origin,
never the key or privacy contact.

Before distribution, verify `/health`, an opted-in usage `202`, an explicitly previewed report
`201` with returned report ID, report replay idempotency, rejected extra/upload fields, encrypted
contact shape, Access fail-closed behavior, retry after an offline launch, opt-out queue deletion,
D1 row shape, and scheduled expiry deletion. A browser preview cannot close this native release
gate.

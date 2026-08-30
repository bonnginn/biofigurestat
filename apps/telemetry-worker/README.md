# BioFigureStat Alpha telemetry deployment

This Worker is the only supported remote usage-telemetry collector for the Alpha build. It accepts
the fixed research-data-free schema in `src/schema.ts`; it is not a project-data or support-report
endpoint.

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
```

Run `pnpm telemetry:release-config`. It fails if the D1 ID is still a placeholder, the endpoint is
not exact HTTPS, CORS contains a wildcard, required native origins are missing, or the privacy
contact is absent. It writes `.tmp/telemetry-release-config.json`; pass that overlay to the Tauri
release build in addition to the ordinary config. The overlay contains only the endpoint origin,
never the key or privacy contact.

Before distribution, verify `/health`, an opted-in `202` upload, retry after an offline launch,
opt-out queue deletion, D1 row shape, and scheduled expiry deletion. A browser preview cannot close
this native release gate.

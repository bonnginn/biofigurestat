# ADR 0056 — Explicit Public Alpha problem reporting and append-only triage

Date: 2026-08-30
Status: Accepted with deployment gate

## Context

The Alpha telemetry collector accepts only fixed usage events and fixed error codes. It is not a
support-report endpoint. Public Alpha needs user-authored reports without weakening the local-first
research-data boundary or coupling reports to usage-telemetry consent.

## Decision

Problem reporting is a separate, per-report explicit workflow. The application first collects a
bounded closed-schema description, then shows the complete outbound content, and sends only after a
second explicit action. It never automatically attaches measurements, tables, project content,
names or IDs entered by the researcher, files, paths, clipboard content, screenshots, or project
packages. Failed submission retains the form and never blocks ordinary application work.

Optional privacy-reduced diagnostics are attached only when selected. Their separate closed schema
contains application/build version, coarse platform and architecture, current fixed route, fixed
error codes, and general error classes. It excludes project summaries, structural counts,
fingerprints, unstructured error messages, and usage-telemetry identifiers.

The Worker exposes `POST /v1/problem-reports` with an exact JSON schema and a 16 KiB application
limit. It uses a separate public ingestion key, exact native-origin CORS, short-window and per-day
limits, submission-id idempotency, and 24-hour exact-content deduplication. It is not a generic
upload endpoint.

Reports live in `problem_reports`; append-only state changes live in
`problem_report_status_history`. Report bodies are immutable. Current status is a query cache over
the authoritative history and is limited to `new`, `needs_review`, `approved_for_fix`,
`in_progress`, `resolved`, `duplicate`, and `not_actionable`.

Optional reply email is encrypted with AES-256-GCM using a Worker secret. Lists and daily triage do
not decrypt it; an authenticated administrator must explicitly request it. Contact is deleted 30
days after a terminal status or with the report, whichever is earlier. Reports and history expire
90 days after receipt.

Admin HTML and APIs require a valid Cloudflare Access JWT for the configured audience. Missing
Access configuration fails closed. Automated triage uses an Access service token and read-only
triage endpoint.

## Consequences

- Usage-telemetry consent neither authorizes nor prevents a problem report.
- No background report queue or automatic retry exists.
- A successful response displays an opaque `BFS-*` report ID.
- Cloudflare can process ordinary transport metadata, but source IP is not stored in D1 report rows.
- Deployment requires D1 migration, report/contact secrets, native build variables, and Access
  configuration before the admin surface becomes available.

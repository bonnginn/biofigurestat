# Diagnostics and Error Architecture

## Purpose

Alpha reports must be diagnosable without automatically exporting unpublished measurements. The diagnostic report is a production-side, user-controlled export and does not depend on benchmark infrastructure.

## Default report

The default report contains app/build/schema/environment metadata, structural counts, route, local feature flags, stable error IDs, opaque request/Graph fingerprints, and at most 50 recent metadata-only events.

It excludes raw measurements, condition/project/readout labels, free-text project notes, personal file paths, paper/Gold data, bearer tokens, API keys, and secrets. It is never uploaded automatically.

An explicit `詳細な診断情報を含める` choice adds redacted recent error messages. The UI explains the difference before export. A user-entered problem description is included only when the user types it and warns against entering research data.

## Error categories

User-correctable errors explain what happened, why the structure matters, and a scientifically safe correction. Application failures preserve input where possible, offer a safe next action, and point to diagnostic export. Python stack traces are not the primary UI message.

Stable codes are centralized in `apps/ui/src/app/errorCatalog.ts`. Diagnostic redaction and event retention are centralized in `apps/ui/src/app/diagnostics.ts`.

## Local events

Events exist only in process memory until the user explicitly copies or saves a report. No remote telemetry endpoint is configured. Current event classes include route changes, analysis execution metadata, Graph-state fingerprints, and stable error IDs.

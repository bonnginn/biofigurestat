# Diagnostics and Error Architecture

## Purpose

Alpha reports must be diagnosable without automatically exporting unpublished measurements. The diagnostic report is a production-side, user-controlled export and does not depend on benchmark infrastructure.

## Default report

The default report contains app/build/schema/environment metadata, structural counts, route, local feature flags, stable error IDs, opaque request/Graph fingerprints, and at most 50 recent metadata-only events.

An optional problem description is researcher-entered support content, not automatic diagnostics. The report labels whether that field is present, warns against including research data or secrets, and is copied or saved only after an explicit action.

It excludes raw measurements, condition/project/readout labels, free-text project notes, personal file paths, paper/Gold data, bearer tokens, API keys, and secrets. It is never uploaded automatically.

An explicit `詳細な診断情報を含める` choice adds recent fixed error codes and general error classes. Unstructured `error.message` text is deliberately excluded because it can echo researcher-entered labels, values, paths, or secrets in forms that cannot be reliably redacted. The UI explains the difference before export. A user-entered problem description is included only when the user types it and warns against entering research data.

## Error categories

User-correctable errors explain what happened, why the structure matters, and a scientifically safe correction. Application failures preserve input where possible, offer a safe next action, and point to diagnostic export. Python stack traces are not the primary UI message.

Stable codes are centralized in `apps/ui/src/app/errorCatalog.ts`. Diagnostic redaction and event retention are centralized in `apps/ui/src/app/diagnostics.ts`.

Project compatibility failures use typed boundary errors rather than parsing display strings. Newer,
unsupported, missing, invalid and wrong-kind project files receive researcher-facing recovery
guidance while parser details remain in the local cause chain. The desktop analysis sidecar is
bounded to 120 seconds and can be cancelled by the active request ID; both paths terminate the
child process, preserve entered data and return a fixed safe-stop message. Numerical-library
reliability warnings emitted during a successful run are retained in the canonical result warnings
instead of being discarded with stderr.

## Local events

Diagnostic events exist only in process memory until the user explicitly copies or saves a report. They are never placed in the product-usage queue and are never uploaded automatically. Current diagnostic event classes include route changes, analysis execution metadata, Graph-state fingerprints, and stable error IDs.

This diagnostic report is separate from consent-based product-usage telemetry. Product-usage telemetry has its own exact allowlist and bounded local queue, never accepts a generic detail object or researcher-entered string, and records nothing until an explicit Yes. Opt-out purges the unsent queue. Remote upload additionally requires both a configured credential-free HTTPS endpoint and a compiled `remote-*` consent-notice version; the current `local-only-*` notice is fail-closed. The user may explicitly copy the privacy-safe local usage report from About.

Public Alpha problem reports are a third, separate channel. They require a preview and explicit
send for every report regardless of usage-telemetry consent. Selecting privacy-reduced diagnostics
creates a smaller report-specific diagnostic object; the existing local diagnostic export is never
uploaded wholesale.

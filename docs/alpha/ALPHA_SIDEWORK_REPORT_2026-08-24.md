# Alpha-readiness sidework report

Date: 2026-08-24  
Scope: preparation performed while the expanded literature benchmark is pending  
Assessment: **ALPHA SIDEWORK READY WITH MINOR GAPS**

This assessment covers the sidework only. It does not declare the product Alpha-ready; the expanded
scientific benchmark and native packaging gates remain authoritative.

## P0 — diagnostics, errors, privacy, isolation

- Added an explicit local `診断` surface with copy and JSON save actions.
- Default reports contain versions, schema/environment metadata, structural counts, route, local
  feature flags, opaque analysis/Graph fingerprints, stable error IDs, recent metadata-only events,
  save/open state events, and timestamps.
- Raw measurements, researcher labels/notes, personal paths, paper/Gold material, credentials, and
  tokens are excluded by default. Detailed export is explicit and described before use. Nothing is
  uploaded automatically.
- Centralized stable researcher-facing errors and safe next actions. Engine, save/open, and Graph
  failures record technical details locally without presenting Python traces as the primary message.
- Added a restrictive desktop CSP, tightened evaluation-bridge responses, and removed filesystem
  paths and token values from browser-visible/logged evaluation responses.
- Benchmark UI and literature loaders are development-gated. A production bundle scan rejects
  benchmark-sensitive markers, tunnel addresses, and source maps.

Minor gap: some older validation messages have not yet migrated to the central error catalogue.
This does not weaken their existing safe-refusal behavior.

## P1 — Help and onboarding

- Added context-aware, read-only Help for design/data/statistics/Graph surfaces.
- Added a provider-neutral boundary with a deterministic local provider. A future external provider
  cannot run without explicit opt-in and receives only an allow-listed structural context; no
  provider, API key, or paid dependency was selected.
- Added 33 short scientific Help topics covering the requested experimental-unit, replicate,
  statistical-method, multiplicity, repeated, and transformation concepts.
- Curated six five-minute synthetic demos at the top of New experiment: independent two-group,
  multi-group, paired, nested microscopy, longitudinal, and Western blot target/reference. Existing
  optional correlation and proportion demos remain available. Synthetic data is explicitly marked
  as artificial and unsuitable as a research result.

## P2 — identity and brand study

- Centralized the development name, Japanese display name, short mark, app version, build revision,
  expected engine version, repository placeholder, and license status.
- Added a compact About surface with local-processing/privacy wording and expandable build details.
- Produced a 20-name longlist, seven-name shortlist, and top-three recommendation: **AssayArc**,
  **AssayWeave**, and **Unitara**.
- Documented linked-units, observations-to-summary, and structured-experiment-arc icon directions.

No name or mark is selected or legally cleared. The repository, package identity, and exported
Methods retain the development identity.

## P3 — accessibility, feedback, packaging, docs

- Set the document language to Japanese and improved muted-text contrast.
- Added proper tablist/tab/tabpanel relationships, roving keyboard tabs, and Arrow/Home/End
  navigation.
- Added Escape, focus trapping, initial focus, and trigger-focus restoration to the Graph-choice and
  Help dialogs.
- The diagnostic export doubles as an explicit user-controlled Alpha feedback bundle with an
  optional short problem description and local-only recent event metadata.
- Added README, quick start, privacy, known limitations, diagnostic architecture, Help architecture,
  packaging checklist, release checklist, and this report.
- Audited current macOS and Windows packaging readiness. macOS has the strongest existing foundation;
  signing/notarization and an external-machine smoke remain. Windows still needs an enabled bundle
  override, packaged x64 sidecar mapping, installer/WebView2 decision, signing decision, and native
  PNG clipboard implementation or explicit deferral.

Minor gap: packaged-build keyboard/high-DPI/1360×900 smoke tests remain open.

## Validation

- TypeScript typecheck: PASS
- ESLint: PASS
- Prettier check: PASS
- JavaScript/TypeScript: **458 tests PASS**
- Python engine: **46 tests PASS**
- Python scripts/infrastructure: **79 tests PASS, 1 environment-dependent skip**
- Production UI build: PASS
- Production web-bundle sensitive-marker/source-map scan: PASS
- Frozen 15-case deterministic preflight: **overall PASS**, 15/15 hierarchy unblocked
- Rust: not rerun after workstation restart because no Rust/Cargo toolchain was available in the
  restored environment. The new Rust command is small and includes a source-level unit test, but native compile
  verification remains a packaging gate.

No numerical analysis behavior, recommendation logic, scientific data, project schema, raw-data
semantics, or preserved benchmark evidence was changed by this program.

## Human decisions deferred

Human judgment is still required for the final product name and mark, trademark/legal clearance,
license, public repository URL, bundle identifier ownership, signing identities, installer format,
and any future cloud LLM provider or external data transfer. Automatic telemetry remains absent.

## Git checkpoints

- `91a4ca1` — local diagnostics, error UX, Help/onboarding, identity surface, accessibility, and
  development-only evaluation isolation
- The release-verification/documentation checkpoint containing this report follows it in history.

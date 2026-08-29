# Production UX Acceptance Gate — 2026-08-28

## Purpose

Evaluate the researcher workflow as a production product, not as an isolated UI demo:

`entry choice → biological setup → generated worksheet → data entry → Graph → Statistics → save/reopen`

Scientific meaning takes priority over task speed. A fast path that merges biological units,
implies pairing from row alignment, or accepts data for an unperformed condition fails this gate.

## Evaluation environments

- **Browser UX preview**: entry comprehension, worksheet layout, keyboard/paste behavior, view switching,
  Graph creation preview, terminology, focus, and responsive layout. It is not save/open or engine evidence.
- **Native application**: all browser checks plus Statistics execution, save/reopen, raw lineage,
  canonical observation identity, and analysis invalidation after structure changes.

## Hard failure rules

- Unsupported or ambiguous structure is converted to another supported design.
- Independent rows acquire matched/session linkage from row position.
- A `not_performed` or `unknown` condition accepts a measurement value.
- Switching between worksheet views changes or duplicates canonical observation IDs.
- Paste partially commits after one invalid value.
- A structure change retains an analysis result that no longer describes the data.
- Save/reopen changes biological n, matching, nesting, repeated identity, or source lineage.

## Production evaluation cases

| Case | Researcher task | Required worksheet behavior | Gate |
| --- | --- | --- | --- |
| UX-01 | Separate culture dishes; Control, Drug A, Drug B; unequal n; scalar value | Continuous condition sheet, condition-specific editable Unit ID + value columns, rectangular paste, blank cells retained without implied pairing | Ready for browser + native evaluation |
| UX-02 | Ciliated-cell count recorded as positive cells and total cells | Raw count columns plus read-only calculated percentage on the same sheet | Ready for browser + native evaluation |
| UX-03 | siRNA × Dox factorial experiment | Excel-like multi-row headers; factor names at left; merged condition groups; no flattened labels | Ready for browser + native evaluation |
| UX-04 | One combination was not performed and another is still unconfirmed | Keep every designed combination visible; show `実施していない` / `未確認`; block value entry; Graph may use available observations | Ready for browser evaluation; native Statistics warning needs revalidation |
| UX-05 | Same identified subject measured across conditions | Identity names the rows; missing partner stays visible; paired Graph is available only from explicit matching | Ready for browser + native evaluation |
| UX-06 | Each experimental run contains separate dishes for several conditions | Ask an explicit shared-run question, represent a complete one-factor shared-source run as matched with an explicit block-role identity, keep editable Run IDs through save/reopen, and never treat the dishes as one entity | Ready for browser + native evaluation within the one-factor boundary; true blocked/partial matching remains a safe-stop |
| UX-07 | Dish → field/Cell nested measurements or repeated time points | Preserve child/time identity and route to a non-lossy detailed surface; never flatten into condition cells; an empty table can add its first typed record | Ready for browser evaluation; production usability still requires human evaluation |
| UX-08 | Existing table used first for Graph, then promoted to Statistics | Keep the original raw text/mapping, ask only the missing biological facts, generate local IDs only after independent rows are explicitly confirmed, and converge on the editable canonical worksheet | Ready for browser + native save/reopen evaluation; matched data still require an explicit source ID column |

## Measured outcomes

For each case record:

- task completion without assistance;
- wrong turns and backtracks;
- clicks plus paste operations;
- manual cell operations;
- preprocessing outside the app;
- identity re-entry;
- whether the user can state what one row and one column mean;
- whether Graph and Statistics use the intended biological n;
- whether save/reopen preserves the same canonical observation IDs.

Initial acceptance thresholds:

- scientific/data-structure error: **0**;
- unsafe coercion: **0**;
- valid rectangular paste committed atomically: **100%**;
- canonical ID parity across view switching and save/reopen: **100%**;
- common scalar/proportion case completed without help: **at least 4 of 5 first-time users**;
- common case median external preprocessing: **0 operations**;
- unresolved wording may remain only if it cannot change the selected structure.

## Automated evidence

- `CanonicalMatrixWorksheet.test.tsx`: unequal n, atomic paste, matching, factorial headers,
  performed/unperformed/unknown combinations, typed proportions, view-ID parity, duplicate safe-stop.
- `adaptiveProductionPath.regression.test.tsx`: production path, Graph, Statistics, save/open,
  lineage, typed data, and unsupported boundaries.
- `experimentWorkspaceProject.test.ts`: canonical persistence and prohibition of ordinal session linkage
  for independent conditions.
- `ExperimentWorkspaceStructureRevision.test.tsx`: structure revision and analysis invalidation.
- `graphOnlyStatisticsBridge.test.ts` and `NewExperimentDedicatedEntry.test.tsx`: source-table preservation,
  cancellation/backtracking, explicit-ID matching, confirmed-independent generated IDs, and safe stop for
  matched data without IDs.
- `adaptiveRecordEntry.test.ts`: first typed record for ordered, nested, multi-readout and missing data.
- `usageTelemetry.test.ts` and `UsageTelemetryController.test.tsx`: explicit consent, fixed allowlist,
  bounded local queue, fail-closed remote transport, and fixed-enum interview-area interaction counts.

Automated checks establish deterministic behavior. They do not replace first-time researcher testing.

The 65-case result is evidence that `StructureContract` and canonical observations retain the Gold
semantics. It is not evidence that a first-time researcher can navigate to the right contract, and it
must not be reported as 65 production-workspace-ready cases. In the current legacy projection,
31 cases are workspace-ready, 2 use an explicit dedicated route, and 32 stop safely rather than lose
identity or structure.

## Current decision boundary

The continuous condition sheet is eligible for production UX evaluation for one-readout scalar and
positive/total-count experiments. Independent designs create a separate stable Unit ID for each
condition's value; the ordinary entry view hides those auto-generated IDs to keep the sheet compact,
and `対象・試料IDを表示／編集` reveals them when the researcher needs to inspect or replace them.
Those IDs are never shared merely because rows align. Multiple readouts, nested
observations, and ordered axes use the detailed typed surface when the wide projection could hide
identity.

Imported raw text and its confirmed mapping remain immutable lineage, while the canonical working
table is editable. A canonical edit appends `canonical_observations_edited_after_import` to the
transformation history instead of rewriting the imported raw text. A Graph-only table without an ID
column can proceed only after the researcher explicitly confirms that each source row is a distinct
independent unit; the application then assigns stable local IDs without creating pairing. Matched or
repeated designs still stop until a source ID column identifies the same unit across conditions.

For a complete one-factor shared-source design, an explicit biological answer now generates matched
semantics with a block-role identity. The researcher-facing Run ID is editable, persists through
save/reopen, and is not inferred from row order or date.

True `matching.kind=blocked`, factor-specific or multi-factor partial matching, and canonical per-unit
date provenance remain bounded representation gaps. The independent condition matrix therefore does
not expose one common row date: horizontal alignment is presentation only, not evidence of a shared
date, run, or pair. These structures must stop safely; the application must not coerce them into
ordinary matched or independent designs. Human blind navigation and manual native save/reopen remain
separate acceptance evidence.

## Reduced Alpha human revalidation

The eight cases above remain the semantic acceptance set, but they are not all repeated manually
after every generic fix. Automated regressions cover their structure, ID, paste, save/open, and
safe-stop invariants. The next researcher pass is limited to four composite tasks:

1. **Independent/factorial worksheet** — enter unequal-n scalar data, then a 2×2 condition table;
   verify keyboard flow, optional ID reveal, Graph, Statistics, save/reopen, and complete adjusted
   comparisons.
2. **Matched/nested typed data** — one same-entity Dark/Lit case and one dish→Cell positive/total or
   continuous case; verify that paired identity and biological n remain distinct from child rows.
3. **Specialist routes** — paste one Survival table and one ordered X/Y table; verify their common
   Data/Graph/Statistics/File shell, native engine execution, export, and save/reopen.
4. **Lifecycle and support** — edit a saved project, attempt Home/New/Open/close, verify the unsaved
   choice, copy an external-LLM consultation prompt, and export a privacy-reduced diagnostic.

Re-run all eight manually only if a change alters StructureContract mapping, canonical observation
identity, condition-combination status, or save/open migration. Pure appearance or wording fixes use
the smallest composite task that displays the changed behavior.

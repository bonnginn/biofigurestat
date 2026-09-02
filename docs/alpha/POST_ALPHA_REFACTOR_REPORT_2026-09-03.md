# BioFigureStat Post-Alpha refactor report — 2026-09-03

This report records the maintenance/refactor batch based on product source commit
`ecdb2748314153cb83e159efb60d662b53883c88` and ending at product source commit
`e2cc364`. Reference coverage tooling continues through
`35e3431`. This report does not nominate or publish a release artifact.

## 1. BASELINE

- Public compatibility baseline: every `.lsa` written by `v0.1.0-alpha.1` and
  `v0.1.0-alpha.2` remains in scope.
- Working branch: `codex/native-ui-regression-automation-2026-08-31`.
- Product-source batch base: `ecdb2748314153cb83e159efb60d662b53883c88`.
- Product-source batch tip: `e2cc364`.
- The working tree was clean before each increment. No reset, discard, overwrite, push,
  publication, installer build, or native installation was performed.
- Pool D, historical benchmark evidence, and external evaluation corpora were not opened.

## 2. DUPLICATION_MAP

- Graph appearance controls had repeated checkbox, numeric-range, and color-input markup across
  Bar, distribution, connecting-line, error-bar, raw-point, series, axis, and legend editors.
- Native SVG/PNG actions were invoking the same Save-dialog/cancellation boundary through several
  local `try/catch` flows with route-specific error handling.
- Graph Statistics mixed number formatting, condition-label resolution, diagnostic translation,
  result rendering, request execution, and planning UI in one component.
- Legacy, canonical, Graph-only, proportion, categorical, WB, correlation, and new-condition tables
  used more than one Arrow/Enter/Tab focus engine.
- Graph-only mixed delimited-input interpretation, saved-state migration defaults, column mapping,
  editor orchestration, and Statistics handoff in one route component.
- `ExperimentWorkspace` mixed Graph-reference integrity, analysis invalidation, and table-cell
  scaffolding with route-level React orchestration.
- Common Coverage kept ordered X/Y parsing, missing-value retention, stable unit/series identity,
  legacy-project restoration, and raw-revision construction inside its route component.

## 3. CHANGES_BY_COMMIT

- `89c8900`, `13c01cf`, `740ac8b`: created and adopted shared Graph visibility, range, color,
  axis, and legend controls while keeping Graph-specific semantic choices separate.
- `d091144`, `424182a`: tightened Graph-only editing chrome and aligned its route regression.
- `8a22c27`, `e3d9255`: separated Statistics presentation rules and the read-only result panel
  from request execution and scientific planning.
- `98c8d4a`, `5bfb9bb`: routed general and specialist Graph exports through one cancellation/error
  controller without changing visible filenames or route-specific messages.
- `745b88c`, `d842734`, `2906549`, `b222a1b`: converged legacy, canonical, proportion, X/Y,
  Graph-only, and condition-setup grids on one Arrow/Enter/Tab navigation engine.
- `191a63d`, `b1e76e9`: separated Graph-only input/mapping rules and saved-state compatibility
  rules from the route component.
- `212d311`, `4b016a3`: extracted Graph-only column mapping and Statistics handoff as controlled
  components. The route remains the owner of biological-unit decisions and safe-stop behavior.
- `ccc9dd3`, `2d9fba6`: separated workspace Graph-integrity/analysis-invalidation rules and table
  scaffolding from the 5,000-line route coordinator.
- `e2cc364`: moved the ordered X/Y import, identity, missingness, compatibility, and raw-revision
  rules behind one pure Common Coverage workflow boundary; the route retains orchestration only.
- `56af9f9`, `52bda30`: recorded the maintenance Alpha strategy, gate, and bilingual draft notes.

## 4. BEHAVIOR_PRESERVED

- No saved-project schema, Graph schema, analysis protocol, engine algorithm, recommendation, or
  expected scientific value changed in this batch.
- Biological `n`, experimental-unit identity, pairing, shared-source topology, nesting, censoring,
  ordered identity, missingness, and raw lineage remain owned by their existing typed models.
- Graph-only remains descriptive until the researcher explicitly confirms experimental structure;
  row order is never promoted to pairing or biological identity.
- Structure revision retains a Graph only when referenced condition attributes, readout shape,
  time points, and factors remain stable. A retained Graph loses its previous analysis and
  Statistics annotations rather than displaying stale inference.
- Native Save cancellation remains silent; failures retain the visible Graph and entered data.
- Researcher-entered labels are not translated. Application-generated default labels remain
  locale-aware.
- Lexical entries such as `1.00` and their canonical numeric values continue to use the existing
  separate storage and export paths.
- Ordered X/Y rows retain their original order, exact raw text, explicit missing values, stable
  Unit/Series identities, and append-only raw-revision numbering after the extraction.

## 5. REGRESSION_COVERAGE

- Focused Graph-only route: 16/16 PASS; input rules: 4/4 PASS.
- Focused Graph export paths: 2/2 specialist cases plus existing export-controller suites PASS.
- Common Coverage route: 41/41 PASS after extracting the ordered X/Y workflow, including exact
  raw lineage, missing rows, save/reopen, D17, model safe-stops, and Japanese/English rendering.
- Workspace structure revision/idempotence: 14/14 PASS.
- Main Experiment workspace: 56/56 PASS.
- English application-copy gate: 39 files / 362 tests PASS.
- Project package and Public Alpha migration fixtures: 9 files / 73 tests PASS.
- Graph-spec package: 7 files / 32 tests PASS.
- Analysis-contract package: 14 files / 55 tests PASS.
- Engine unit suite: 75/75 PASS.
- Existing Windows x64 sidecar smoke: 18/18 implemented protocols PASS, including Welch TOST,
  paired TOST, Survival, and D17. The sidecar was built after the last engine-source change; it is
  not a current desktop-app bundle.
- Existing frozen engine reference suite: 14/14 PASS at `rtol=1e-10`, `atol=1e-12`.
- Full UI milestone gate: 211 files / 1,400 tests PASS in 280.69 seconds.
- All eight TypeScript project checks PASS; full UI lint PASS.
- Final production UI build PASS; initial chunk 266.38 kB (gzip 81.75 kB), no size advisory.
- Release bundle verifier PASS with zero forbidden evaluation markers.

The full UI gate was run once at the batch boundary. Focused suites were used between commits so
the approximately five-minute milestone test was not repeated after every extraction.

## 6. REMOVED_OR_QUARANTINED_CODE

- Four independent Spreadsheet navigation implementations were removed; callers now use
  `moveSpreadsheetFocus`.
- Route-local Graph export `try/catch` duplication was removed in favor of the shared controller.
- Route-local Graph-only input, saved-state, mapping, and Statistics-handoff implementations were
  moved behind named boundaries.
- Route-local ordered X/Y parsing, example generation, legacy restoration, and raw-revision
  construction were moved to `commonCoverageOrderedCurve.ts`.
- No historical evidence or evaluation material was read, moved, deleted, or copied.
- No production capability was quarantined or disabled.

## 7. REMAINING_STRUCTURAL_DEBT

- `ExperimentWorkspace.tsx` is still about 4,900 physical lines and owns several experiment-tab
  table renderers. Further work should extract one concrete table responsibility at a time.
- `CommonCoveragePage.tsx` is now about 2,900 lines. Regression, distribution, contingency, and
  the remaining ordered X/Y orchestration still share one route coordinator.
- `NewExperimentPage.tsx` remains about 3,100 lines. Its interview-state transitions need a typed
  state-machine boundary before more UI extraction.
- `GeneralExperimentGraphSvg.tsx` remains a large renderer. Kaplan–Meier risk-table geometry and
  family-specific scientific layers must not be folded into it merely to reduce file count.
- The existing frozen cross-platform reference set predates the two TOST protocols. Engine and
  contract tests cover them. The new coverage gate also reports missing Survival and D17 cases.
  Adding all four reviewed Darwin-arm64 results is a release-gate improvement, not something to
  synthesize from Windows output or by changing expected values in this refactor.

## 8. NATIVE_VERIFICATION

- No native binary was rebuilt from `e2cc364`; therefore this source tip does not yet have a current
  executable-level PASS.
- The existing Windows engine sidecar passed all 18 smoke requests. This verifies the unchanged
  engine executable boundary, not the current desktop UI bundle.
- The previously reviewed Windows and macOS Alpha paths remain historical evidence only and are
  not relabeled as evidence for this source tip.
- The next candidate must build Windows x64 and Apple Silicon macOS artifacts from the same clean
  source authority, then run bundle verification, the exact-executable native verifier, and the
  bounded manual fallback only where macOS Accessibility policy blocks automation.
- No user interaction is required until that candidate build/review step.

## 9. RECOMMENDED_NEXT_REFACTOR

1. Stop structural extraction for this batch and cut an `alpha.3` candidate from a clean recorded
   source commit; do not add the broader Beta Excel/panel/Prism roadmap to this maintenance release.
2. Add reviewed frozen Welch TOST and paired TOST cross-platform reference cases without changing
   engine output or fitting expected values to the implementation. Use the Darwin-arm64-only
   append-missing command so the existing 14 results cannot be silently replaced.
3. After `alpha.3`, continue Common Coverage one responsibility at a time. The ordered X/Y pure
   workflow is now isolated; the next safe boundary is regression request/presentation logic,
   without merging correlation or nonlinear-fit semantics.
4. Treat further `ExperimentWorkspace` decomposition as responsibility extraction, not a line-count
   target. Preserve the now-separated Graph-integrity boundary as the sole authority for stale
   analysis invalidation.

## Size interpretation

Across this batch, production TypeScript/TSX/CSS changed by +2,996 / -2,923 lines (net +73), while
tests changed by +300 / -27 lines (net +273). This is primarily redistribution into explicit
boundaries, not source-code shrinkage. The three large coordinators that were directly addressed
became smaller: Graph-only -681 physical lines, Graph Statistics -383, Experiment workspace -278,
and Common Coverage -342 (total -1,684). The added modules make responsibilities independently
reviewable and reduce
the chance that a later fix reaches only one route.

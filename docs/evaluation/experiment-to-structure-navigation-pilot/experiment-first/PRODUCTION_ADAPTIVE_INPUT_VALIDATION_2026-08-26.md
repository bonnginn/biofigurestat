# Production adaptive-input validation — 2026-08-26

## Verdict

**ADAPTIVE INPUT IMPLEMENTED WITH BOUNDED GAPS**

The experiment-first path is implemented behind `experiment_first_adaptive_input_alpha`. The
current wizard remains available. The production boundary is:

```text
confirmed/inferred biological facts
  → StructureContract 0.1.0
  → deterministic surface selector
  → five adaptive paste/file surfaces
  → canonical observations + mapping + raw lineage
  → existing ExperimentDesign 0.3.0 companion
  → equivalence assertion
  → ProjectState save/open
```

## Measured result

| Gate | Result |
|---|---:|
| 65 Gold contract/compiler/selector/canonical/dual-write | 65/65 |
| 65 Gold save/open | 65/65 (63 workspace, 2 dedicated survival) |
| Dual-write mismatches | 0; injected mismatch stopped |
| Messy raw declarative mappings | 12/12 |
| Human Manual Validation cases | 5/5 automated Graph/Statistics/save/reopen |
| Real browser smoke | Case 2: entry → compact matrix → 12/12 cells → paired Graph → Statistics |
| Low-ambiguity cases with no contract confirmation | 44/65 |
| Cases with a semantic-changing contract confirmation | 21/65 (32.3%) |
| UI regression | 62 files / 443 tests |
| Domain/project/adaptive regression | 8 files / 40 tests |
| Typecheck configurations | 7/7 |
| Lint | pass |
| Production build | pass; existing large-chunk warning remains |

Surface coverage is unchanged from the frozen evidence: factor-aware observation table 21,
compact matrix 5, repeated-axis matrix 8, nested observation table 18, and typed record table 13.

The historical burden comparator remains the appropriate directional baseline: adaptive entry
used 65 paste/file operations, 83 context switches, no scalar-by-scalar entry, identity re-entry,
or preprocessing; the modeled current route used 2,553 manual cell operations, 230 context
switches, 50 preprocessing steps, 85 identity re-entries, 68 workarounds, and lost 59 fields. No
new timed researcher study was performed in this implementation pass.

## Implemented production behavior

- Versioned semantic contract separates unit, identity, factors, matching, ordered axes, nesting,
  typed readouts, reference roles, and missingness.
- The selector contains no case IDs and chooses one of five generic surfaces deterministically.
- Clipboard, CSV, TSV, generic delimited files, header aliases, filename tokens, header-row
  detection, wide axes, missing tokens, and elapsed-day derivation share declarative adapters.
- Wide matrices persist fixed factor/axis bindings in their column mapping instead of recording
  value columns as untyped metadata.
- Canonical rows and source text remain in the versioned snapshot. Both workspace and top-level
  save state validate that the snapshot contract equals the active design companion.
- Existing 0.2 designs and projects without an adaptive snapshot remain readable. No migration is
  performed merely by opening an old project.
- Mixed between/within factors are retained. Human entry can add generic factor rows rather than
  encoding a factorial experiment as one combined group label.
- Event/censoring records are handed to the dedicated survival route; they are never converted to
  scalar outcomes.
- Japanese and English labels persist the same semantic enums. Unicode labels generate stable,
  collision-resistant keys.
- Tables expose row/column headers; controls are labelled; dialog focus and keyboard navigation
  continue to use the existing workspace behavior; adaptive focus and file/clipboard flows have
  component regression tests.
- The URL feature flag is preserved across internal navigation. Environment, URL, and durable
  local flag activation remain available, while the current entry stays visible.

## Failure clusters resolved

1. Fixed legacy unit-level IDs conflicted with contract-defined biological hierarchies. Canonical
   record generation now uses the active contract and preserves parent identity.
2. Analysis incompatibility was incorrectly treated as inability to enter/save data. Entry
   representability and legacy-engine compatibility are now separate.
3. Wide-surface mappings lost the factor/axis meaning encoded by a column. Fixed bindings are now
   persisted.
4. Survival handoff used incompatible headers and a hard-coded outcome ID. It now emits explicit
   Event/Censored records and uses the projected outcome.
5. Japanese-only labels could collapse to the same fallback key. Unicode semantic-key generation
   removes the collision.
6. The URL feature flag disappeared on route changes. Navigation now preserves the narrow flag.
7. A single factor row could not author the 2×2 manual case. Generic add/remove factor rows now
   preserve factorial structure.

## Bounded gaps and separate P0 tracks

- Fifteen Gold structures are lossless in StructureContract/canonical save state but have an
  explicit legacy-analysis diagnostic (mixed/crossover details, multiple axes, heterogeneous
  readout grains, or typed bundles not fully accepted by the current analysis engine). They are
  not silently converted. Two additional event/censoring cases use the supported dedicated
  survival route.
- The common human question UI now supports multiple factors, but multi-axis authoring and deeper
  arbitrary hierarchy authoring still rely on the contract compiler/import path. The 65 fixtures
  verify those contracts and save/open behavior; they do not constitute 65 observed human entry
  sessions.
- Real-browser preview deliberately disables native save and the local statistics engine. Case 2
  reached Statistics with correct paired interpretation and no console errors; save/reopen for all
  65 and Manual Cases 1–5 is automated. Native desktop save/engine defects remain a separate P0
  track and were not reclassified as adaptive-input failures.
- Screen-reader announcements and 200% zoom still need a human accessibility pass. Automated
  semantics, focus, keyboard, Japanese/English, clipboard, and file tests pass.
- Vendor-specific importers, free-text metadata extraction, DAG/crossed hierarchy, many-to-many
  matching, and automatic arbitrary narrative extraction remain out of Alpha scope.

## Migration readiness

Ready for a feature-flagged human revalidation cohort, not for default-on replacement. Keep the
current wizard as rollback. Human approval is still required for: (1) whether the 15 explicit
legacy-analysis stops are acceptable for Alpha, (2) whether multi-axis/deep-hierarchy authoring
must precede cohort exposure, and (3) native desktop save/engine P0 closure. Default-on migration
should wait for those decisions plus a timed researcher task study.

# Regression test policy

BioFigureStat does not treat a larger test count as a quality goal. A regression test is retained
or added only when it protects a distinct product contract at the cheapest reliable layer.

## Contracts that require durable coverage

- project schema, migration, save/reopen, and Public Alpha `.lsa` compatibility;
- biological `n`, experimental-unit identity, pairing, nesting, censoring, ordered identity, and
  raw-data lineage;
- statistical request/result mapping, adjusted comparisons, warnings, and stale-analysis removal;
- canonical Spreadsheet values, visible drafts, keyboard commit, paste, and mode transitions;
- native open/save/export and unsaved-work guards where browser tests cannot provide evidence;
- Japanese/English boundaries on production routes.

These contracts may need coverage at more than one layer when each layer can fail independently.
For example, a pure migration test proves the transformation, a project test proves container
round-tripping, and one route test proves that the migrated project is actually wired into the UI.

## Tests that should not multiply

- repeated assertions of the same helper result through several visually similar routes;
- snapshots that only record incidental DOM or pixel structure;
- tests of private implementation details, hook placement, or component file boundaries;
- a full route render for every input variant when a pure contract table covers the variants;
- a new test solely because code moved without changing a contract.

After extracting a shared boundary, prefer one direct contract test plus the minimum route-level
wiring test needed to prove that the boundary is used. Existing broad regression cases should be
deleted or merged only after their assertion inventory shows that no unique persistence,
scientific, accessibility, localization, or native behavior would be lost.

## Review checklist

For each proposed regression test, record the failure it distinguishes:

1. Which user-visible or scientific contract can regress?
2. Is that contract already asserted at the same or a cheaper layer?
3. Can a pure test replace a slower jsdom/native scenario?
4. Does a route/native test add wiring evidence that a pure test cannot provide?
5. Will the assertion survive a safe refactor without testing implementation details?

If questions 1 and 4 have no concrete answer, the test should normally not be added. Runtime,
warning noise, flakiness, and maintenance cost are part of the decision, not afterthoughts.

## Current rationalization direction

The largest jsdom suites (`ExperimentGraphWorkbench`, `App`, `CommonCoveragePage`, and the adaptive
production path) are reviewed by contract rather than deleted by line count. Extracted Graph and
Spreadsheet primitives reuse their existing route suites; new direct tests are added only for a
newly explicit decision boundary. Persistence and scientific-semantics cases remain layered.
React scheduling warnings are treated as test-harness debt and are not silenced by weakening or
removing assertions.

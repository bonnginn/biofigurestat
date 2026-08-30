# English Alpha Localization Status

Date: 2026-08-31 (JST)

Branch: `codex/english-alpha-localization-2026-08-31`

## Scope completed

The application now has a persistent Japanese / English application-language setting. Japanese
remains the compatibility default. The setting is stored outside project state and is not written
to `.lsa` files.

Reviewed English copy is implemented for the main Public Alpha path:

- first-use language selection and privacy/usage notice;
- application header and Home;
- task-oriented New Experiment hub;
- simple independent-group entry;
- general Biological Interview and its live summary;
- common experiment-workspace shell and File / Data / Graph / Statistics navigation;
- canonical worksheet view controls, zoom, expanded-record headings, row actions, and paste errors;
- common Graph creation dialog and core Graph editor controls;
- Statistics recommendation, comparison intent, diagnostics, and results chrome;
- Graph-only table import, column mapping, Graph creation, and safe Statistics handoff;
- Survival and Heatmap common workspace shell;
- local project open, recent/favorite projects, native Open/Save dialog titles;
- Help, About, external-LLM consultation, and problem reporting.

Scientific semantic keys, analysis request IDs, biological-unit identity, pairing, nesting,
censoring, ordered-axis identity, raw lineage, and the project schema remain language-independent.

## Verification

- UI full test: 129 files, 1,103 tests passed.
- English localization focused tests cover Home, entry hub, simple entry, Biological Interview,
  project discovery, Help/About/reporting, Graph-only safe handoff, common Graph creation,
  Statistics, and canonical worksheet records.
- UI typecheck: pass.
- UI lint: pass.
- production UI build: pass.
- Locale/project boundary test confirms that switching language does not add locale data to the
  serialized project object.

## Not yet an English native candidate

Some less common or legacy surfaces still contain Japanese copy, especially:

- legacy `DataSheetPage` and `MultiConditionDataSheetPage` workflows;
- detailed experiment-specific editors for proportion, WB, categorical, and nested raw data;
- advanced Survival / ordered-curve / Heatmap guidance and validation messages;
- some specialist Graph inspector explanations and generated Methods text;
- low-level validation and recovery messages emitted by older adapters.

These gaps do not alter scientific data, but a mixed-language UI is not acceptable as a finished
English release. Do not label this branch `ENGLISH ALPHA READY` or publish native English assets
until the remaining production-reachable copy is audited, translated, and checked on both Windows
and macOS. The existing Japanese `v0.1.0-alpha.1` release is unaffected.

## Next gate

1. Build a route inventory that distinguishes production-reachable surfaces from compatibility and
   development-only surfaces.
2. Complete reviewed English copy for all production-reachable data-entry and specialist routes.
3. Add English smoke tests for scalar, nested, Survival, ordered X/Y, Heatmap, save/reopen, and
   export.
4. Build Windows and macOS native candidates and run the native lifecycle/export verifier.
5. Perform a short human language review for terminology, clipping, and layout before publishing.

# English Alpha Localization Status

Date: 2026-08-31 (JST)

Branch: `codex/native-ui-regression-automation-2026-08-31`

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
- canonical condition-matrix file import, condition/status headings, IDs, and validation boundaries;
- compact and expanded nested Cell/ROI measurement entry;
- existing Excel/CSV/TSV table preview and explicit column assignment;
- condition/ordered-axis structure preview;
- common Graph creation dialog and core Graph editor controls;
- Statistics recommendation, comparison intent, diagnostics, and results chrome;
- Graph-only table import, column mapping, Graph creation, and safe Statistics handoff;
- Survival and Heatmap common workspace shell;
- local project open, recent/favorite projects, native Open/Save dialog titles;
- one shared localized file-input control across canonical matrices, existing-data import,
  Graph-only, ordered X/Y, Survival, and Heatmap;
- ordered X/Y analysis, save, export, diagnostic, and nonlinear-result action messages;
- legacy matched-analysis runtime diagnostics and incomplete-pair notices;
- the generic new-measurement record form and dynamic save/analysis/validation failures;
- specialist save, open, analysis, and workspace-exit status messages;
- Help, About, external-LLM consultation, and problem reporting.

Scientific semantic keys, analysis request IDs, biological-unit identity, pairing, nesting,
censoring, ordered-axis identity, raw lineage, and the project schema remain language-independent.

Application-generated Japanese copy is not rendered on the covered English surfaces. User-entered
content and labels stored in a project are preserved verbatim and may of course contain Japanese.

Legacy D01-D05 project files remain valid and unchanged. In English mode, opening a project that
predates the common experiment workspace shows an English compatibility notice instead of opening
the untranslated legacy editor. Switching the application language to Japanese opens that editor;
the application does not convert, discard, or overwrite the project.

## Verification

- UI full test: 162 files, 1,213 tests passed.
- Shared packages and telemetry worker: 278 tests passed.
- English localization focused tests cover Home, entry hub, simple entry, Biological Interview,
  project discovery, Help/About/reporting, Graph-only safe handoff, common Graph creation,
  Statistics, canonical worksheet records and matrices, nested measurement entry, existing-data
  import, Survival, Heatmap, ordered X/Y, and every currently exposed specialist surface.
- UI typecheck: pass.
- UI lint: pass.
- production UI build: pass.
- Locale/project boundary test confirms that switching language does not add locale data to the
  serialized project object.

The 2026-09-01 post-review pass also tests the state-dependent paths that a static screen audit can
miss. Legacy Japanese runtime messages are reconstructed from semantic counts, and Japanese
internal exception text is not surfaced in an English save, analysis, validation, or experiment-
structure failure. Researcher-authored Japanese labels remain verbatim. No project schema,
scientific role, identity, pairing, nesting, censoring, ordered-axis meaning, or raw lineage was
changed.

## Windows native candidate

The source-level production paths have automated no-Japanese rendering coverage. A Windows x64
candidate was built with revision `4041e85-alpha.20260901.win-review3`:

- installer: `apps/desktop/src-tauri/target/release/bundle/nsis/BioFigureStat_0.1.0_x64-setup.exe`;
- size: 47,884,996 bytes;
- SHA-256: `4382BA7A7534D74270C7E362320CBF2102AC9AAE64B13FEB3CB6310BA01FE8E2`;
- Windows bundle verification: pass;
- release bundle verification: pass;
- packaged statistical-engine smoke checks: pass;
- exact packaged-executable native UI regression: pass. This includes an isolated English
  session, application-copy audit, architecture IPC, exact export bytes, real Graph-only input,
  Statistics validation visibility/focus, native Close, Cancel retention, and explicit discard.

The Windows review also found and fixed two Graph-only gaps before this candidate: the English
default Graph title no longer starts in Japanese, and a saved Graph that explicitly allowed one
series per source row reopens with Graph and Statistics available. Save and Save As are now visible
beside the Graph-only workspace tabs. The regression uses the same sample-ID/Treatment/Measurement
shape that exposed the issue and verifies table, mapping, active Graph, and enabled tabs after
reopen.
Legacy projects whose title is one of the canonical app-generated Japanese/English defaults now
display that default in the active UI language; user-authored titles remain unchanged.

This candidate completed the short Windows human review on 2026-09-01. Language switching,
fresh Graph-only entry, legacy save/reopen, enabled Graph/Statistics tabs, visible Save/Save As,
localized app-generated defaults, preserved user-authored titles, and both-language terminology,
clipping, and layout checks passed. A macOS candidate has not been built. Do not publish English
assets until the corresponding macOS native and bounded human checks pass. The existing Japanese
`v0.1.0-alpha.1` release is unaffected.

## Next gate

1. Build a macOS candidate from the latest localization revision and run non-interactive bundle,
   release, and engine verification.
2. When convenient, perform one bounded human review: open an older Japanese-authored `.lsa` in
   English and confirm that Analysis set, incomplete matched-set diagnostics, and New measurement
   record are English while researcher-authored Japanese labels remain unchanged.

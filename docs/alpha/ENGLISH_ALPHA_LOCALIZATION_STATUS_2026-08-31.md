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
- canonical condition-matrix file import, condition/status headings, IDs, and validation boundaries;
- compact and expanded nested Cell/ROI measurement entry;
- existing Excel/CSV/TSV table preview and explicit column assignment;
- condition/ordered-axis structure preview;
- common Graph creation dialog and core Graph editor controls;
- Statistics recommendation, comparison intent, diagnostics, and results chrome;
- Graph-only table import, column mapping, Graph creation, and safe Statistics handoff;
- Survival and Heatmap common workspace shell;
- local project open, recent/favorite projects, native Open/Save dialog titles;
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

- UI full test: 131 files, 1,116 tests passed after the final advanced-surface additions.
- English localization focused tests cover Home, entry hub, simple entry, Biological Interview,
  project discovery, Help/About/reporting, Graph-only safe handoff, common Graph creation,
  Statistics, canonical worksheet records and matrices, nested measurement entry, existing-data
  import, Survival, Heatmap, ordered X/Y, and every currently exposed specialist surface.
- UI typecheck: pass.
- UI lint: pass.
- production UI build: pass.
- Locale/project boundary test confirms that switching language does not add locale data to the
  serialized project object.

## Not yet an English native candidate

The source-level production paths now have automated no-Japanese rendering coverage, but no English
Windows or macOS native candidate has been built or manually reviewed. Do not publish native
English assets until the final full suite, native lifecycle/export verification, and a short human
review for terminology, clipping, and layout all pass. The existing Japanese `v0.1.0-alpha.1`
release is unaffected.

## Next gate

1. Build Windows and macOS native candidates and run the native lifecycle/export verifier.
2. Exercise language switching, fresh entry, save/reopen, and export on both native candidates.
3. Perform a short human language review for terminology, clipping, and layout before publishing.

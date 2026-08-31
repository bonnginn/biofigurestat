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

## Windows native candidate

The source-level production paths have automated no-Japanese rendering coverage. A Windows x64
candidate was built with revision `8dec615-alpha.20260831.win-en1`:

- installer: `apps/desktop/src-tauri/target/release/bundle/nsis/BioFigureStat_0.1.0_x64-setup.exe`;
- size: 47,883,753 bytes;
- SHA-256: `B4A30A4288D0DF164766C0B99027E5CC36C4EE7D04AD381659CDD29AC4071554`;
- Windows bundle verification: pass;
- release bundle verification: pass;
- packaged statistical-engine smoke checks: pass.

This candidate has not yet received a short human English-language review. A macOS candidate has
not been built. Do not publish English assets until native lifecycle/export checks and human review
for terminology, clipping, and layout pass on the relevant platform. The existing Japanese
`v0.1.0-alpha.1` release is unaffected.

## Next gate

1. Install the Windows candidate and exercise language switching, fresh entry, save/reopen, and
   PNG/SVG/CSV export.
2. Perform a short human Windows language review for terminology, clipping, and layout.
3. Build and verify the macOS candidate, then repeat the same bounded review.

# Core Completion + Graph UX acceptance record

Updated: 2026-08-21

Source of truth: `Core Completion + Graph UX Consolidation Pass` (items 1–45).

## Graph UX (1–23)

| Items | Accepted behavior                                                                                                                                                                                                                                          |
| ----- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 1–3   | Longitudinal graphs use explicit stable unit IDs for subtle individual trajectories plus a stronger summary; cross-sectional time never draws per-unit trajectories. Pairing is never inferred from date, tab, cell line, passage, or batch.               |
| 4–7   | Recommendations may be plural; recommended and compatible alternatives use schematic thumbnails, a selected current-data preview, reasons, and genuine disabled reasons.                                                                                   |
| 8–10  | Initial layers are adjustable, and `カスタムグラフ` exposes only compatible layer combinations. Publication defaults retain biological-unit points; nested views distinguish raw observations from experiment summaries.                                   |
| 11–12 | Small-n Box remains available with a warning and Dot recommendation. Violin is recommended only when underlying nested observations justify a distribution view.                                                                                           |
| 13–17 | Category slots account for label/font/mark width; readable scroll and explicit `全体表示` are separate modes. Generated axis defaults are English, user labels are unchanged, typography and legend controls persist.                                      |
| 18–21 | Per-series colors, restrained/grayscale/colorblind palettes, line widths, nice/manual Y ticks, canvas presets, side padding, and reset behavior are Graph-local and persisted.                                                                             |
| 22    | SVG-first clipboard with transparent-image/text fallback, SVG export, and visible-data CSV are separate from project Save. Native PowerPoint/Keynote/Illustrator/Affinity/Word interoperability remains the explicitly requested later platform checklist. |
| 23    | The Graph modal keeps thumbnail selection, one live preview, warnings, and a visible sticky Create action.                                                                                                                                                 |

## Statistics (24–33)

| Items | Accepted behavior                                                                                                                                                                                                                          |
| ----- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| 24–27 | The redesigned UX routes only to the existing versioned deterministic contracts/engine. Expected family is shown before data; final recommendation uses actual completeness and design. No variance/normality pre-test gatekeeper is used. |
| 28–29 | Analysis is optional and Graph-local. Graph display subsets and selected-time/derived-metric analysis specifications persist separately.                                                                                                   |
| 30    | Results show available test, experimental-unit n, estimate, SE/CI, p-value, adjusted status, df, effect size, interaction/main-effect output, diagnostics, and limitations without fabricating absent fields.                              |
| 31    | Exact-p/symbol/hidden annotations are selected from saved analysis tests. Data/subset changes remove stale results and annotations.                                                                                                        |
| 32    | Methods are generated deterministically from design, request, result, Graph specification, normalization, and engine metadata.                                                                                                             |
| 33    | Zero, missing, and not-planned remain distinct. Incomplete repeated units are reported; unsupported mixed-model situations remain Graph-only rather than silently changing tests.                                                          |

## Common Core workflows (34–41)

| Item | Accepted behavior                                                                                                                                                                                           |
| ---- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 34   | Two-condition matched entry, paired points/lines, paired t recommendation, stable IDs, Methods, and save/open are end-to-end.                                                                               |
| 35   | X/Y entry/import, Scatter, explicit linear vs rank-language choice, Pearson/Spearman, results, Methods, and persistence are end-to-end.                                                                     |
| 36   | Experiment→Condition→Category counts derive percentages and support stacked, 100%-stacked, and category-percentage graphs without continuous-data tests.                                                    |
| 37   | Multiple readouts retain separate cells, outcomes, Graphs, and Graph-linked analyses in one experiment set.                                                                                                 |
| 38   | Selected time, endpoint, maximum, minimum, trapezoidal AUC, baseline change, and F/F0 retain parameters, common windows, raw lineage, and a full-trace Graph separate from the analysis metric.             |
| 39   | Design-only reuse and local Favorites copy conditions, attributes, time, readouts, expected family, and compatible Graph defaults while excluding measurements, sources, results, annotations, and history. |
| 40   | Local paste/file import previews tidy and wide Excel/Prism tables, requires explicit mappings, preserves source row/column provenance, and refuses ambiguous condition structure.                           |
| 41   | WB supports custom/total-protein/GAPDH references, reference-free intensity, target/reference, and explicit OFF-by-default within-experiment control=1 or max=1 normalization without overwriting bands.    |

## Regression and scope (42–45)

- Deterministic synthetic fixtures cover independent, paired, hierarchical, nested, cross-sectional time, longitudinal, XY, categorical, multiple-readout, time-derived, and WB paths.
- Core preprocessing remains limited to transparent arithmetic and summaries. Segmentation, tracking, event/lane detection, qPCR-specific preprocessing, and complex image processing remain external.
- Cryo-ET-specific analysis, omics, survival, dose-response/kinetics, advanced mixed models, panel assembly, plugin ecosystems, and public-release polish remain out of this milestone.

## Verification

- 284 JavaScript/TypeScript tests
- 25 previously validated Python engine tests; no Python engine code changed in this pass
- 7 Rust storage tests passed; 1 development-environment integration test remains intentionally ignored
- workspace lint passed
- TypeScript production build passed

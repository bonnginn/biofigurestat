# Literature benchmark v1.1 integration QC

Validated on Windows against source SHA-256
`028c6f5639c98bf50e4a6a87c25b04defa1c89ddda8b063624d6746188aa5bf5`.

## Workbook structure

The authoritative workbook contains ten sheets:

- `README` (`A1:H35`)
- `Cases` (`A1:P51`)
- `Synthetic_Raw` (`A1:N2692`)
- `Gold_Analysis` (`A1:G51`)
- `Coverage` (`A1:H30`)
- `QC` (`A1:F14`)
- `Researcher_Packets` (`A1:P51`)
- `Paper_Reference` (`A1:N51`)
- `Gold_Metadata` (`A1:O51`)
- `Benchmark_Index_v1_1` (`A1:O51`)

All sheets were imported and visually rendered with the bundled spreadsheet artifact runtime. The
original workbook was not edited.

## Structural QC

- cases: 50; unique case IDs: 50; unique DOIs: 50;
- common/diverse coverage: 25 / 25;
- synthetic rows: 2,691; per-case range: 10–200;
- all 50 case IDs occur in every required source/runtime layer;
- duplicate case IDs and duplicate observation identities: 0;
- missing required raw fields: 0;
- all raw rows have `synthetic=true` and one stable per-case seed;
- numerator/denominator rows: 10, all internally consistent with the derived fraction;
- undocumented zero-variance condition/time/readout groups: 0;
- paired identity failures: 0;
- nested parent identity failures: 0;
- longitudinal stable-unit failures: 0;
- cross-sectional rows acquiring repeated identity: 0.

The workbook has no explicit `not_planned` column; its 2,691 rows represent planned synthetic
observations only. There are no zero-valued response rows, so this version does not exercise the
zero-versus-missing distinction directly.

## Representative independent gold verification

The verifier recomputes these analyses from runtime synthetic rows:

| Case   | Check                                                 | Result |
| ------ | ----------------------------------------------------- | ------ |
| JCB003 | Welch independent t                                   | PASS   |
| JCB002 | paired t preserving unit identity                     | PASS   |
| JCB005 | one-way ANOVA                                         | PASS   |
| JCB004 | nested parent-summary Welch t                         | PASS   |
| JCB011 | stable-unit AUC then Welch t                          | PASS   |
| JCB010 | Mann–Whitney U                                        | PASS   |
| JCB023 | Welch interaction contrast from session-level changes | PASS   |
| JCB024 | Friedman repeated blocks                              | PASS   |

Run `.\engine\python\.venv\Scripts\python.exe scripts\verify_literature_benchmark.py` to repeat
the runtime, blinding and gold checks.

## Track separation

The source `Researcher_Packets` sheet includes `scope_expectation`. That field reveals expected
support scope and is therefore deliberately omitted from the Track B runtime view, together with
coverage tier, seed/location bookkeeping and the source-only blind rule. The original workbook is
unchanged and the omission is recorded in `runtime/manifest.json`.

Track A receives the filtered scientific researcher packet, paper reference and synthetic rows.
Track B receives only the filtered scientific researcher packet and identical synthetic rows.
Gold and benchmark-judgment layers are stored in server-side integrator files and are not exposed
by the Experimenter API. Automated checks cover all 50 Track B payloads.

## Scope/frontier distribution

The source includes `core`, `core-challenge`, and `frontier` cases. Unsupported/frontier outcomes
must be recorded safely rather than treated as automatic product defects. No scientific source
content was altered to fit current application support.

Phase 1 result: **PASS**. No Critical benchmark-integrity issue was found. The documented Track B
field filtering is required before evaluation and is implemented in the runtime conversion.

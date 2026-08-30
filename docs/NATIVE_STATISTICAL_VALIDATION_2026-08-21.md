# macOS native statistical validation — 2026-08-21

## Environment

- Host: macOS Apple Silicon (`darwin-arm64`)
- Application: Life Science Analysis App `0.1.0`
- Packaged local sidecar: `lsaa-python 0.5.0`
- Returned packages: NumPy `2.3.5`, SciPy `1.18.0`
- No application window or browser was opened for this CLI validation.

## Packaged-sidecar end-to-end cases

Command:

```sh
engine/python/.venv/bin/python engine/python/smoke_sidecar.py \
  engine/python/dist/darwin-arm64/lsaa-engine/lsaa-engine
```

| Contract    | Method                         | Observations | Statistical units / pairs | Native result evidence                                                                                                      |
| ----------- | ------------------------------ | -----------: | ------------------------: | --------------------------------------------------------------------------------------------------------------------------- |
| D01 `0.1.0` | Welch t                        |            8 |                     8 / 0 | `welch_two_sample_t_test`, p=0.010513608369054                                                                              |
| D02 `0.1.0` | Paired t                       |            8 |                     4 / 4 | `paired_t_test`, p=0.023981199790656674                                                                                     |
| D03 `0.2.0` | Welch ANOVA + Games–Howell     |           10 |                    10 / 0 | omnibus p=0.02789952270433744 plus 3 pairwise results                                                                       |
| D04 `0.3.0` | Repeated-measures ANOVA + Holm |           12 |                     4 / 4 | omnibus p=0.002449054273929557 plus 3 paired Holm results                                                                   |
| D05 `0.4.0` | Type III two-way ANOVA + Holm  |           12 |                    12 / 0 | interaction p=0.004232682289427547, factor A p=0.0005533172616011807, factor B p=0.00013130330937942528 plus 6 Holm results |
| D09 `0.5.0` | Pearson                        |           10 |                     5 / 5 | `pearson_correlation`, p=0.0021229877979470546                                                                              |
| D09 `0.5.0` | Spearman                       |           10 |                     5 / 5 | `spearman_correlation`, p=1.4042654220543602e-24                                                                            |

Every response returned the expected protocol version, `status=ok`, engine version `0.5.0`, and
the package versions above.

## Desktop bridge and project storage

The Tauri/Rust test suite passed 7 storage/database tests. The ignored native-engine bridge test
was run explicitly and passed, confirming a JSON round trip through the pinned Python environment
and checking the returned SciPy/engine versions.

```text
cargo test: 7 passed, 0 failed, 1 ignored
development_python_round_trip_returns_versioned_json: 1 passed
```

Project-level TypeScript regressions verify:

- raw values, stable unit IDs, Graph source, analysis request/result, package metadata, annotation,
  and Methods state survive canonical project creation and rehydration;
- distinct readouts remain attached to distinct Graphs after reopen;
- AUC source lineage is persisted as a derived dataset even before statistics are run;
- new raw revisions retain old revisions and invalidate old upstream-dependent executions;
- imported source rows and confirmed mapping survive reopen separately from canonical cells.

## Remaining release-level manual check

This evidence validates the native numerical executable and desktop bridge without opening the
application. Before distributing an Internal Alpha binary, perform one signed/notarized bundle
smoke check of the visible save → close → reopen workflow. This is a packaging/release check, not a
known numerical or identity-model blocker.

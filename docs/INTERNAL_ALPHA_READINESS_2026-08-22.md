# Internal Alpha readiness — scientific safety pass

This checklist evaluates the milestone “Scientific Identity, Import Safety, Graph Independence,
and Statistical Trust”. It deliberately does not expand the statistical catalog.

## Code-level gate

### Scientific identity — pass

- Experiment/session ID and stable biological-unit ID are separate persisted fields.
- Graph trajectories, paired dots, paired/repeated engine requests, Methods, and derived lineage use
  the stable unit identity.
- Session identity alone does not create pairing.
- Deterministic cross-sectional, longitudinal, paired, and session-plus-unit fixtures lock the
  semantics.
- Save/open regression verifies both identities survive project-schema parsing and rehydration.

### Import safety — pass

- Tidy and wide/Prism imports map session, biological unit, and optional source date independently.
- Duplicate mapped keys stop import. They are retained as nested raw observations only after an
  explicit researcher decision; no automatic averaging occurs.
- A final structure summary is confirmed before the workspace is created.
- Original headers/rows, source label, import timestamp, mapping, exclusions, duplicate decision,
  transformations, and source-row locations remain inspectable.
- Missing source experiment dates remain blank and are never replaced by the import timestamp.

### Multiple readouts and Graph ownership — pass

- Graph creation explicitly selects a readout when more than one exists.
- Every Graph persists its own readout/derived source, condition/time subsets, layers, appearance,
  annotation, and linked analysis.
- Recommendations and Methods use that Graph's readout.
- Changing one Graph's readout or subset removes its incompatible result, annotation, and Methods;
  unrelated Graphs remain unchanged.
- Save/open regression covers two Graphs with different readouts, types, subsets, and analyses.

### Statistics and derived metrics — pass for the bounded Core

- Pearson and Spearman are executable choices. Methods not implemented by the validated backend are
  labelled as non-executable references rather than controls.
- Multi-attribute plus Time designs disclose the interpreted factor candidates and explicitly state
  when a selected-time analysis does not test the complete factor-by-time interaction.
- AUC, endpoint, maximum, minimum, baseline change, and F/F0 can be persisted as separate derived
  Graph sources while the complete raw trace remains intact.
- Derived lineage shows source unit, condition, raw trace, metric/window/formula, and result.
- Result details expose the returned engine, package versions, application version, correction, and
  implementation/protocol version.
- The supported-method/package/limitation table is maintained in
  `docs/STATISTICAL_METHODS_REFERENCE.md`.

## Native evidence

- Packaged macOS arm64 sidecar: D01, D02, D03, D04, D05, Pearson, and Spearman all returned
  versioned successful results.
- Python reference suite: 25 tests passed, including statsmodels-backed comparisons.
- Rust desktop storage/database suite and the explicit local-engine bridge test passed.
- Canonical package and SQLite round trips preserve project state, analysis metadata, Graph state,
  stable identities, and source provenance.
- Exact versions and numerical evidence are recorded in
  `docs/NATIVE_STATISTICAL_VALIDATION_2026-08-21.md`.

## Distribution gate still required

Before giving an Internal Alpha build to another user, run one visible save → close → reopen smoke
test on the final signed/notarized `.app` bundle. This is a release-packaging check: the numerical
sidecar, native bridge, atomic storage, SQLite codec, and canonical rehydration are already tested,
but the final signed bundle does not yet exist in this workspace.

The deterministic researcher-facing steps and copy-ready synthetic values are in
`docs/NATIVE_INTERNAL_ALPHA_VALIDATION.md`. Start with the built-in “Simple 3群（連続値）” fixture,
then use “Internal Alpha Core確認” for the shortest multi-readout, stable-unit, derived-lineage, and
save/restart/reopen check.

## Decision

The source tree meets the code-level scientific-safety gate for cautious Internal Alpha use. A
redistributable Alpha binary is not declared ready until the final signed-bundle smoke check above
is recorded. Missing future statistical families do not block this decision; silent identity
mixing, import merging, or Graph/readout association would.

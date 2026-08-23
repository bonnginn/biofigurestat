# 500-case benchmark hierarchy QC addendum

## Purpose

This addendum makes observational hierarchy a release gate for every future benchmark case. It applies to source curation, deterministic runtime conversion, Gold analysis, blind packaging, and scoring. It does not change product statistical behavior.

## Required case contract

Every case must state and encode:

- the biological experimental unit and biological n in each analysis cell;
- whether each row is a biological-unit summary or a lower-level observation;
- `unit_id` for the analyzed unit, `parent_unit_id` for nested rows, and `experiment_id` for the independent session or preparation;
- whether identity is independent, paired across conditions, longitudinal across time, matched across methods/readouts, or cross-sectional;
- the number of cells, fields, images, ROIs, or technical repeats nested in each biological unit;
- the intended aggregation level before inference;
- the Gold method, statistic, p-value, multiplicity rule, decision, and graph at that same analysis level;
- source evidence precise enough to distinguish the target figure/panel from other designs in the paper.

Null parent IDs are permitted only when each row is itself the analyzed unit. Reused IDs must mean actual shared identity; convenience numbering must be qualified by condition/time/factor cell.

## Automated semantic checks

The hierarchy auditor must fail a case for any of the following:

- declared biological n differs from packet, runtime-derived, loader-required, or Gold n;
- nested cells/images/ROIs lack a valid parent or duplicate an identity inside an analysis cell;
- lower-level observations inflate biological n;
- a paired, matched, or longitudinal design lacks complete shared identities;
- an independent or cross-sectional design falsely reuses identities across conditions, times, or factorial cells;
- multi-readout identity is incomplete or changes analysis level across readouts;
- the source does not distinguish replicate summaries from nested observations;
- Gold is computed at a different level from the runtime loader;
- a correction lacks immutable source hash, before/after structure, scientific reason, source evidence, old/new n and analysis levels, Gold changes, and correction version.

Mutation tests must cover n mismatch, missing parents, pseudoreplication, false repeated identity, missing matched identity, ambiguous summary-versus-nested rows, independent factorial labels, and nested-count inflation.

## Dispositions

Each case receives exactly one hierarchy disposition:

- `HIERARCHY_PASS`: internally consistent and eligible for packaging/scoring;
- `HIERARCHY_CONFLICT`: contradictory facts; blocked until corrected;
- `HIERARCHY_AMBIGUOUS`: insufficient evidence; blocked pending review;
- `HIERARCHY_EXCLUDED`: ambiguity cannot be resolved without guessing; retained as provenance but unavailable to automated packaging/scoring;
- `NOT_APPLICABLE`: reserved for a documented design with no inferential unit hierarchy.

An exclusion must be explicit in correction metadata and the runtime manifest. Excluded cases must not appear in the public/scorable index, and package generation must refuse them. Source rows and source Gold may remain for provenance but are not certified.

## Batch workflow for 500 cases

Curate and accept cases in ten frozen batches of 50. For each batch:

1. Freeze the source workbook hash and case IDs.
2. Complete source-to-packet-to-synthetic-to-loader-to-Gold review for all 50 cases.
3. Run the semantic audit and mutation suite.
4. Recompute every corrected Gold reference independently and record the effective correction version.
5. Generate Track A and Track B packages twice and prove deterministic byte identity.
6. Run leakage, allow-list, manifest, loader, statistics-route, graph serialization, artifact, and queue preflight gates.
7. Publish batch counts and every exclusion reason before adding the next 50 cases.

No later batch may conceal a failure in an earlier batch. Corrections are additive, source-hash-bound, and versioned; the authoritative source workbook is never silently overwritten.

## Acceptance gates

A 50-case batch is accepted only when:

- every scorable case is `HIERARCHY_PASS`;
- conflict and ambiguous counts are zero;
- every exclusion is evidence-backed and packaging refusal is tested;
- packet n, runtime-derived n, loader n, and Gold n agree for every scorable analysis cell;
- all corrected Gold values reproduce within declared numerical tolerance;
- effective runtime version and correction SHA-256 appear in the manifest and researcher-visible package version;
- frozen preflight has no hierarchy-blocked cases and all other infrastructure gates pass;
- the source workbook SHA-256 remains unchanged.

Only after the relevant frozen batch passes these gates may external blinded evaluation begin or resume.

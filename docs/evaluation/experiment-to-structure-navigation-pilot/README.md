# Experiment-to-Structure Navigation Benchmark — pilot

## Purpose

This benchmark tests whether a model can translate a biologically plausible experiment description into the design structure that the current LSA experiment-entry choice system can express. It does **not** test browser operation, statistical-test selection, or analysis recommendations.

The assessed translation is:

`experiment → measurement → experimental unit → identity → condition/factor → repeated/paired → nested structure → ordered axis`

A scientifically correct `unsupported` decision is a successful outcome. Converting an unsupported design into a superficially similar supported design is a critical failure.

## Separation of materials

- `blind/` is the only directory supplied to the tested model. It contains user-visible choices, task instructions, and the answer schema. It contains no source paths, internal IDs, expected route, Gold answer, or analysis recommendation.
- `evaluator/` is held back. It defines Gold records, scoring, failure classification, and provenance.
- Case prompts and Gold records must be stored separately. Never concatenate Gold or evaluator notes into a blind prompt.

## Pilot size and expansion

The pilot manifest contains 60 case slots distributed across supported, unsupported, and intentionally ambiguous structures. Case IDs are opaque and do not encode the expected route or support status. The schemas impose no 60-case limit, so the same format can be extended to 150–200 cases.

## Unit of evaluation

Each case contains one standalone life-science experiment description. The model receives:

1. `blind/task-instructions.md`;
2. `blind/choice-tree.json`;
3. `blind/answer.schema.json`;
4. one case's `prompt_text`.

The model returns one JSON object conforming to `blind/answer.schema.json`. The evaluator compares its semantic structure and declared support status with the held-back Gold record. Choice-path comparison is secondary and allows multiple equivalent paths.

## Scope rules

- Do not score knowledge of a named statistical test.
- Do not expose analysis-template names or recommendations to the model.
- Do not infer pairing from date, cell line, passage, plate, or row order alone.
- Do not count cells, fields, ROIs, wells, technical repeats, or aliquots as biological `n` unless the prompt explicitly makes that level the independently assigned experimental unit.
- Preserve distinct intervention levels such as siRNA sequences, guides, clones, or constructs; a scientific parent grouping must not silently pool them.
- A missing fact that is necessary to identify the unit or identity structure is `insufficient_information`, not automatically `unsupported`.
- A design is `unsupported` when the facts are sufficiently clear but the exported choices cannot faithfully encode them.

## Files

- `blind/choice-tree.json`: implementation-independent export of currently selectable choices.
- `blind/semantic-design.schema.json`: semantic structure contract.
- `blind/answer.schema.json`: exact model response contract.
- `blind/task-instructions.md`: blind prompt preamble.
- `evaluator/gold-case.schema.json`: held-back case and Gold contract.
- `evaluator/comparison-rubric.json`: machine-readable scoring and gates.
- `evaluator/COMPARISON_RUBRIC.md`: scorer guidance.
- `evaluator/failure-taxonomy.json`: structured failure labels.
- `evaluator/FAILURE_TAXONOMY.md`: annotation guidance.
- `evaluator/pilot-manifest.json`: 60 opaque case slots and stratum targets.
- `evaluator/canonical-field-map.md`: mapping from benchmark semantics to the current final design object.
- `evaluator/provenance.json`: source snapshot used for this export.
- `case-drafts/batch-01-15.json`: first 15 biology-only prompt drafts and author review notes.
- `case-drafts/batch-01-input-surface-assessment.json`: realistic data scale, natural raw-table shape, expected paste payload, and current-surface fit for the 15 drafts.

## Versioning

`choice_tree_version`, `semantic_schema_version`, `answer_schema_version`, and `rubric_version` are independently versioned. Freeze all four for a run. If the wizard changes, create a new choice-tree version and retain the old bundle for reproducibility.

Run `powershell -ExecutionPolicy Bypass -File evaluator/validate-bundle.ps1` from this directory to check JSON parsing, choice-key references, the 60-slot allocation, duplicate IDs, required blind files, and common blind-data leakage patterns.

## End-to-end input fit

Gold records must evaluate design translation and input practicality as separate axes. Every Gold case carries `data_profile`, `expected_raw_table`, `expected_paste_payloads`, and `input_surface_fit`. The four fit classes are `FIT`, `POSSIBLE_BUT_AWKWARD`, `NOT_PRACTICAL`, and `NOT_REPRESENTABLE`.

A semantic pass is not a full product success unless the case is also `FIT` at its realistic data scale. Toy subsets and preaggregation that discard required raw identity do not count as successful input workflows.

## Pool isolation

This pilot was prepared without using Pool D. Pilot authors must record source-pool provenance per case and reject any case whose origin cannot be shown to be outside Pool D.

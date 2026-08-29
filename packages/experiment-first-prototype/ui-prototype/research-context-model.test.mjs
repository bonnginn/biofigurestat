import assert from "node:assert/strict";
import test from "node:test";

import {
  RESEARCH_CONTEXT_IDS,
  normalizeResearchContext,
  researchContextIngress,
  researchContextPresentation,
  selectResearchContext,
} from "./research-context-model.js";
import {
  GUIDED_ENTRY_VERSION,
  buildGuidedPrototypeDefinition,
} from "./guided-entry-model.js";

const BIOLOGICAL_ANSWERS = Object.freeze({
  schemaVersion: GUIDED_ENTRY_VERSION,
  experimentLabel: "Drug response",
  conditionChangeCount: "2",
  dimensions: Object.freeze([
    Object.freeze({ label: "siRNA", valuesText: "Control\nGene A", kind: "nominal" }),
    Object.freeze({ label: "Dox", valuesText: "−\n+", kind: "nominal" }),
  ]),
  combinationAnswer: "all_performed",
  measurement: Object.freeze({ label: "positive cells", form: "positive_total" }),
  observation: Object.freeze({
    shape: "multiple_inside",
    sourceRelation: "separate",
    sourceLinkage: "unknown",
    sequenceIdentity: "unknown",
  }),
});

test("optional research context cannot change generated experiment semantics", () => {
  const baseline = buildGuidedPrototypeDefinition(BIOLOGICAL_ANSWERS);
  assert.equal(baseline.status, "ready");
  const baselineSemantics = JSON.parse(JSON.stringify(baseline));

  for (const researchContext of ["", ...RESEARCH_CONTEXT_IDS]) {
    const result = buildGuidedPrototypeDefinition({ ...BIOLOGICAL_ANSWERS, researchContext });
    assert.deepEqual(
      JSON.parse(JSON.stringify(result)),
      baselineSemantics,
      researchContext || "unspecified",
    );
  }
});

test("switching research context preserves answers, cells, observations, and surface selection", () => {
  const answers = { dimensions: [{ label: "Drug", valuesText: "Vehicle\nDrug A" }] };
  const conditionGrid = { cells: [["Drug", "Vehicle", "Drug A"]] };
  const model = { observations: [{ id: "obs-1", fields: { value: 12.5 } }] };
  const state = {
    researchContext: "cell_culture",
    guideAnswers: answers,
    guideLevelGrids: conditionGrid,
    models: { custom: model },
    selectedPatterns: { custom: "nested_records" },
    entryMode: "guided",
  };

  const next = selectResearchContext(state, "microscopy");

  assert.equal(next.researchContext, "microscopy");
  assert.strictEqual(next.guideAnswers, answers);
  assert.strictEqual(next.guideLevelGrids, conditionGrid);
  assert.strictEqual(next.models.custom, model);
  assert.strictEqual(next.selectedPatterns, state.selectedPatterns);
  assert.equal(next.entryMode, "guided");
  assert.equal(state.researchContext, "cell_culture");
});

test("legacy shell contexts map only to optional vocabulary and existing data maps to direct entry", () => {
  assert.equal(normalizeResearchContext("microscopy_imaging"), "microscopy");
  assert.equal(normalizeResearchContext("protein_biochemical"), "protein_biochemistry");
  assert.equal(normalizeResearchContext("general_assay"), "general");
  assert.equal(normalizeResearchContext("existing_data"), "");
  assert.deepEqual(researchContextIngress("existing_data"), {
    researchContext: "",
    entryMode: "direct",
  });
});

test("context presentation contains copy only, not semantic defaults", () => {
  const allowedKeys = [
    "contextHint",
    "contextLabel",
    "experimentPlaceholder",
    "measurementPlaceholder",
    "sourcePlaceholder",
  ];

  for (const researchContext of ["", ...RESEARCH_CONTEXT_IDS]) {
    assert.deepEqual(
      Object.keys(researchContextPresentation(researchContext)).sort(),
      allowedKeys,
    );
  }
});

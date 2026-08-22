import { describe, expect, it } from "vitest";

import { createDraftForEntryRoute, ENTRY_ROUTES, flowStepsFor } from "./NewExperimentPage";

function route(context: keyof typeof ENTRY_ROUTES, id: string) {
  const found = ENTRY_ROUTES[context].find((candidate) => candidate.id === id);
  if (!found) throw new Error(`Missing route ${context}/${id}`);
  return createDraftForEntryRoute(context, found);
}

describe("context-specific experiment routes", () => {
  it.each([
    ["cell_culture", "cell_count_growth", "nested_continuous"],
    ["cell_culture", "cell_positive_proportion", "proportion"],
    ["microscopy_imaging", "microscopy_fluorescence", "nested_continuous"],
    ["protein_biochemical", "protein_wb", "wb_ratio"],
    ["protein_biochemical", "protein_activity", "nested_continuous"],
    ["animal", "animal_numeric", "nested_continuous"],
    ["general_assay", "general_continuous", "nested_continuous"],
  ] as const)("maps %s/%s to the expected Core shape", (context, id, shape) => {
    const draft = route(context, id);
    expect(draft.entryRoute).toBe(id);
    expect(draft.readouts[0]?.shape).toBe(shape);
    expect(draft.analysisIntent.kind).toBe("group_comparison");
  });

  it("maps tracking and repeated-animal shortcuts to same-unit time", () => {
    expect(route("microscopy_imaging", "microscopy_tracking").time.sampling).toBe("longitudinal");
    const animal = route("animal", "animal_longitudinal");
    expect(animal.time.sampling).toBe("longitudinal");
    expect(animal.conditionAssignment.unitLabel).toBe("動物");
  });

  it.each([
    ["cell_culture", "cell_count_growth", [0, 2, 1, 3, 4]],
    ["cell_culture", "cell_positive_proportion", [0, 1, 2, 3, 4]],
    ["microscopy_imaging", "microscopy_fluorescence", [0, 2, 1, 3, 4]],
    ["microscopy_imaging", "microscopy_tracking", [0, 2, 1, 3, 4]],
    ["protein_biochemical", "protein_wb", [0, 1, 3, 4]],
    ["protein_biochemical", "protein_activity", [0, 1, 2, 3, 4]],
    ["animal", "animal_longitudinal", [0, 2, 1, 3, 4]],
    ["animal", "animal_numeric", [0, 2, 1, 3, 4]],
    ["general_assay", "general_continuous", [0, 1, 2, 3, 4]],
  ] as const)("uses only relevant questions for %s/%s", (context, id, expected) => {
    expect(flowStepsFor(route(context, id))).toEqual(expected);
  });

  it("maps relationship shortcuts without asking for a statistical method", () => {
    const draft = route("general_assay", "general_xy");
    expect(draft.analysisIntent).toEqual({ kind: "correlation", relationshipForm: "linear" });
    expect(draft.conditions.map(({ label }) => label)).toEqual(["X", "Y"]);
    expect(draft.conditionAssignment.kind).toBe("matched");
  });

  it("makes microscopy nested observations explicit without turning Cell/ROI into n", () => {
    const draft = route("microscopy_imaging", "microscopy_fluorescence");
    expect(draft.readouts[0]?.nestedInputMode).toBe("nested_observations");
    expect(draft.conditionAssignment.unitLabel).toBe("実験単位");
  });
});

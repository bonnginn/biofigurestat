import { describe, expect, it } from "vitest";

import {
  createEntryModuleTargetedFactsState,
  entryModuleTargetedFactsViewModel,
  updateEntryModuleOrderedAxisCount,
  updateEntryModuleTargetedFact,
  validateEntryModuleTargetedFactsState,
  type EntryModuleTargetedFactsState,
} from "./entryModuleTargetedFacts";

function answer(
  state: EntryModuleTargetedFactsState,
  key: "ordered_axis_meaning" | "axis_material_relationship" | "axis_point_parent_relationship",
  value: string,
): EntryModuleTargetedFactsState {
  const result = updateEntryModuleTargetedFact(state, key, value);
  expect(result.ok).toBe(true);
  return result.state;
}

describe("entry-module targeted facts", () => {
  it("starts a single-axis ordered curve with only the two structure-changing questions", () => {
    const state = createEntryModuleTargetedFactsState("ordered_curve_kinetics");
    const view = entryModuleTargetedFactsViewModel(state, "ja");

    expect(state.facts.orderedAxisCount).toBe(1);
    expect(view.status).toBe("needs_answer");
    expect(view.canOpenPreferredSurface).toBe(false);
    expect(view.canCompileStructureContract).toBe(false);
    expect(view.questions.map(({ key }) => key)).toEqual([
      "ordered_axis_meaning",
      "axis_material_relationship",
    ]);
    expect(view.questions[0]?.question).toBe("横方向に順番に変えたものは何ですか？");
    expect(view.orderedAxisCountControl).toMatchObject({
      label: "順番をもつ量はいくつありますか？",
      value: 1,
    });
    expect(view.safeStop).toBeNull();
  });

  it("resolves a same-material time course to a repeated-axis input surface", () => {
    let state = createEntryModuleTargetedFactsState("ordered_curve_kinetics");
    state = answer(state, "ordered_axis_meaning", "elapsed_time");
    state = answer(state, "axis_material_relationship", "same_physical_material_across_axis");

    const ja = entryModuleTargetedFactsViewModel(state, "ja");
    const en = entryModuleTargetedFactsViewModel(state, "en");
    expect(ja.status).toBe("ready");
    expect(ja.preferredSurface).toMatchObject({
      entrySurfaceId: "ordered_curve_table",
      adaptiveSurfaceId: "repeated_axis_matrix",
      label: "同じ対象を順序点に沿って記録する表",
    });
    expect(ja.summary).toContain("経過時間");
    expect(ja.summary).toContain("同じ対象を追えるID");
    expect(en.summary).toContain("Elapsed time");
    expect(ja.canOpenPreferredSurface).toBe(true);
    expect(ja.canCompileStructureContract).toBe(true);
    expect(ja.safeStop).toBeNull();
  });

  it.each([
    ["substrate_concentration", "基質濃度"],
    ["treatment_concentration", "薬剤・処理の濃度"],
    ["distance", "距離・位置"],
    ["temperature", "温度"],
  ] as const)(
    "uses a generic observation table for separately prepared material along %s",
    (axisMeaning, expectedLabel) => {
      let state = createEntryModuleTargetedFactsState("ordered_curve_kinetics");
      state = answer(state, "ordered_axis_meaning", axisMeaning);
      state = answer(state, "axis_material_relationship", "separate_material_per_axis_value");

      const beforeParent = entryModuleTargetedFactsViewModel(state, "ja");
      expect(beforeParent.status).toBe("needs_answer");
      expect(beforeParent.questions.map(({ key }) => key)).toEqual([
        "ordered_axis_meaning",
        "axis_material_relationship",
        "axis_point_parent_relationship",
      ]);
      state = answer(state, "axis_point_parent_relationship", "no_shared_parent_or_matching");

      const view = entryModuleTargetedFactsViewModel(state, "ja");
      expect(view.status).toBe("ready");
      expect(view.preferredSurface.adaptiveSurfaceId).toBe("factor_observation_table");
      expect(view.summary).toContain(expectedLabel);
      expect(view.summary).toContain("各Unit IDを別の実験単位");
    },
  );

  it("safe-stops a separate-point curve with shared donor, run, batch, or matching", () => {
    let state = createEntryModuleTargetedFactsState("ordered_curve_kinetics");
    state = answer(state, "ordered_axis_meaning", "substrate_concentration");
    state = answer(state, "axis_material_relationship", "separate_material_per_axis_value");
    state = answer(state, "axis_point_parent_relationship", "shared_parent_or_matching");

    const view = entryModuleTargetedFactsViewModel(state, "ja");
    expect(view.status).toBe("safe_unsupported");
    expect(view.canCompileStructureContract).toBe(false);
    expect(view.summary).toContain("独立した試料へ読み替えず");
    expect(view.safeStop).toMatchObject({
      kind: "unsupported_structure",
      reasonCodes: ["SEPARATE_AXIS_MATERIAL_HAS_SHARED_PARENT_REQUIRES_HIERARCHY"],
      preserveEnteredData: true,
      suggestedAlternative: { moduleId: "condition_canvas_general", autoNavigate: false },
    });
  });

  it("treats an explicit unknown material relationship as a human decision, not a guess", () => {
    let state = createEntryModuleTargetedFactsState("ordered_curve_kinetics");
    state = answer(state, "ordered_axis_meaning", "substrate_concentration");
    state = answer(state, "axis_material_relationship", "unknown");

    const view = entryModuleTargetedFactsViewModel(state, "ja");
    expect(view.status).toBe("human_decision_required");
    expect(view.canOpenPreferredSurface).toBe(false);
    expect(view.canCompileStructureContract).toBe(false);
    expect(view.safeStop).toMatchObject({
      kind: "human_decision_required",
      reasonCodes: ["AXIS_MATERIAL_RELATIONSHIP_UNRESOLVED"],
      preserveEnteredData: true,
      suggestedAlternative: null,
    });
    expect(view.summary).toContain("推測せずここで止め");
    expect(view.questions.find(({ key }) => key === "axis_material_relationship")).toMatchObject({
      selectedValue: "unknown",
      unresolved: true,
    });
  });

  it("safe-stops multiple ordered axes without automatically changing entry modules", () => {
    let state = createEntryModuleTargetedFactsState("ordered_curve_kinetics", {
      orderedAxisMeaning: "elapsed_time",
      axisMaterialRelationship: "same_physical_material_across_axis",
    });
    const countUpdate = updateEntryModuleOrderedAxisCount(state, 2);
    expect(countUpdate.ok).toBe(true);
    state = countUpdate.state;

    const view = entryModuleTargetedFactsViewModel(state, "en");
    expect(view.status).toBe("safe_unsupported");
    expect(view.canOpenPreferredSurface).toBe(false);
    expect(view.safeStop).toMatchObject({
      kind: "unsupported_structure",
      reasonCodes: ["MULTIPLE_ORDERED_AXES_REQUIRE_GENERAL_ENTRY"],
      preserveEnteredData: true,
      suggestedAlternative: {
        moduleId: "condition_canvas_general",
        autoNavigate: false,
      },
    });
    expect(view.summary).toContain("will not be collapsed into one axis");
  });

  it("rejects invalid or inapplicable updates without overwriting the last valid state", () => {
    const state = createEntryModuleTargetedFactsState("ordered_curve_kinetics", {
      orderedAxisMeaning: "distance",
    });
    const invalidChoice = updateEntryModuleTargetedFact(
      state,
      "ordered_axis_meaning",
      "enzyme_model",
    );
    expect(invalidChoice).toMatchObject({
      ok: false,
      state,
      issue: { code: "TARGETED_FACT_VALUE_INVALID" },
    });
    expect(invalidChoice.state.facts.orderedAxisMeaning).toBe("distance");

    const wrongModule = createEntryModuleTargetedFactsState("time_to_event");
    expect(updateEntryModuleOrderedAxisCount(wrongModule, 2)).toMatchObject({
      ok: false,
      issue: { code: "ORDERED_AXIS_COUNT_NOT_APPLICABLE" },
    });
    expect(
      updateEntryModuleTargetedFact(wrongModule, "ordered_axis_meaning", "elapsed_time"),
    ).toMatchObject({
      ok: false,
      issue: { code: "TARGETED_FACT_NOT_DECLARED_FOR_MODULE" },
    });
  });

  it("blocks invalid loaded axis counts before calling the semantic resolver", () => {
    const state = createEntryModuleTargetedFactsState("ordered_curve_kinetics", {
      orderedAxisCount: 0,
      orderedAxisMeaning: "elapsed_time",
      axisMaterialRelationship: "same_physical_material_across_axis",
    });
    expect(validateEntryModuleTargetedFactsState(state)).toEqual([
      expect.objectContaining({ code: "ORDERED_AXIS_COUNT_INVALID" }),
    ]);

    const view = entryModuleTargetedFactsViewModel(state, "ja");
    expect(view.status).toBe("invalid");
    expect(view.resolution).toBeNull();
    expect(view.safeStop).toMatchObject({
      kind: "invalid_state",
      preserveEnteredData: true,
    });
  });

  it("returns explicit contract deferral for graph-first ingress", () => {
    const state = createEntryModuleTargetedFactsState("graph_only_advanced");
    const view = entryModuleTargetedFactsViewModel(state, "en");

    expect(view.status).toBe("contract_deferred");
    expect(view.canOpenPreferredSurface).toBe(true);
    expect(view.canCompileStructureContract).toBe(false);
    expect(view.safeStop).toBeNull();
    expect(view.contractDeferral).toMatchObject({
      until: "experiment_structure_is_required",
      preserveEnteredData: true,
      reasonCodes: ["GRAPH_FIRST_STRUCTURE_DEFERRED"],
    });
  });

  it("keeps researcher-facing copy free of statistical method selection", () => {
    const variants: EntryModuleTargetedFactsState[] = [
      createEntryModuleTargetedFactsState("ordered_curve_kinetics"),
      createEntryModuleTargetedFactsState("ordered_curve_kinetics", {
        orderedAxisMeaning: "distance",
        axisMaterialRelationship: "same_physical_material_across_axis",
      }),
      createEntryModuleTargetedFactsState("ordered_curve_kinetics", {
        orderedAxisMeaning: "treatment_concentration",
        axisMaterialRelationship: "separate_material_per_axis_value",
      }),
      createEntryModuleTargetedFactsState("graph_only_advanced"),
    ];
    const copy = variants
      .flatMap((state) =>
        (["ja", "en"] as const).flatMap((locale) => {
          const view = entryModuleTargetedFactsViewModel(state, locale);
          return [
            view.researcherIntent,
            view.statusLabel,
            view.summary,
            view.preferredSurface.label,
            view.safeStop?.title ?? "",
            view.safeStop?.message ?? "",
            view.contractDeferral?.title ?? "",
            view.contractDeferral?.message ?? "",
            ...view.questions.flatMap(({ question, choices }) => [
              question,
              ...choices.map(({ label }) => label),
            ]),
          ];
        }),
      )
      .join(" ");

    expect(copy).not.toMatch(/ANOVA|Fisher|Friedman|Kaplan|regression|t-test|回帰|検定/iu);
  });
});

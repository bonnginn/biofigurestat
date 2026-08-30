import { describe, expect, it } from "vitest";

import {
  ENTRY_MODULE_IDS,
  ENTRY_MODULE_REGISTRY_VERSION,
  ENTRY_MODULE_UNSUPPORTED_POLICY,
  getEntryModule,
  listEntryModules,
  parseEntryModuleId,
  resolveEntryModule,
} from "./entry-module-registry";

describe("entry module registry", () => {
  it("is versioned, complete, unique, and independent of statistical method names", () => {
    const modules = listEntryModules();
    expect(modules).toHaveLength(5);
    expect(modules.map(({ moduleId }) => moduleId)).toEqual(ENTRY_MODULE_IDS);
    expect(new Set(modules.map(({ moduleId }) => moduleId)).size).toBe(modules.length);
    expect(
      modules.every(({ schemaVersion }) => schemaVersion === ENTRY_MODULE_REGISTRY_VERSION),
    ).toBe(true);
    expect(
      modules.every(
        ({ contractCapability }) =>
          contractCapability.unsupportedPolicy === ENTRY_MODULE_UNSUPPORTED_POLICY,
      ),
    ).toBe(true);

    const researcherFacingText = modules
      .flatMap(({ researcherIntent, requiredTargetedFacts }) => [
        researcherIntent.ja,
        researcherIntent.en,
        ...requiredTargetedFacts.flatMap(({ question, choices }) => [
          question.ja,
          question.en,
          ...choices.flatMap(({ label }) => [label.ja, label.en]),
        ]),
      ])
      .join(" ");
    expect(researcherFacingText).not.toMatch(/ANOVA|Fisher|Friedman|Kaplan|regression|回帰|検定/i);
  });

  it("declares the five distinct entry intents and their preferred surfaces", () => {
    expect(getEntryModule("condition_canvas_general").preferredSurface).toEqual({
      entrySurfaceId: "condition_canvas",
      adaptiveSurfaceId: "factor_observation_table",
    });
    expect(getEntryModule("time_to_event").preferredSurface).toEqual({
      entrySurfaceId: "time_to_event_table",
      adaptiveSurfaceId: "typed_record_table",
    });
    expect(getEntryModule("ordered_curve_kinetics").preferredSurface).toEqual({
      entrySurfaceId: "ordered_curve_table",
      adaptiveSurfaceId: "factor_observation_table",
    });
    expect(getEntryModule("matrix_visualization").ingress).toBe("advanced_schema_first");
    expect(getEntryModule("graph_only_advanced").ingress).toBe("advanced_schema_first");
  });

  it("parses only registered module IDs", () => {
    expect(parseEntryModuleId("time_to_event")).toBe("time_to_event");
    expect(() => parseEntryModuleId("kaplan_meier")).toThrow("UNKNOWN_ENTRY_MODULE:kaplan_meier");
  });

  it("compiles standard time-to-event with zero extra questions when each subject is explicitly one case", () => {
    const result = resolveEntryModule("time_to_event", {
      timeToEventPattern: "single_terminal_event_or_censoring",
      subjectUnitRelationship: "subject_is_experimental_unit",
    });

    expect(result.status).toBe("surface_ready");
    expect(result.unresolvedTargetedFacts).toEqual([]);
    expect(result.safeAutoInferences).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          semanticPath: "experimentalUnitLevelKey",
          value: "subject_identity_level_from_surface",
        }),
        expect.objectContaining({
          semanticPath: "matching.kind",
          value: "independent",
        }),
        expect.objectContaining({
          semanticPath: "readouts[].representation",
          value: "event_censoring",
        }),
        expect.objectContaining({
          semanticPath: "orderedAxes[].sampling",
          value: "event_follow_up",
        }),
      ]),
    );
  });

  it("opens the time-to-event surface for Graph but defers independent n when the subject relationship is absent", () => {
    const result = resolveEntryModule("time_to_event", {
      timeToEventPattern: "single_terminal_event_or_censoring",
    });

    expect(result.status).toBe("contract_deferred");
    expect(result.unresolvedTargetedFacts).toEqual([]);
    expect(result.preferredSurface.entrySurfaceId).toBe("time_to_event_table");
    expect(result.safeAutoInferences).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          semanticPath: "readouts[].representation",
          value: "event_censoring",
        }),
      ]),
    );
    expect(
      result.safeAutoInferences.some(
        ({ semanticPath }) =>
          semanticPath === "experimentalUnitLevelKey" || semanticPath === "matching.kind",
      ),
    ).toBe(false);
  });

  it("asks the subject-vs-experimental-unit fact only when Statistics needs it", () => {
    const result = resolveEntryModule("time_to_event", {
      timeToEventPattern: "single_terminal_event_or_censoring",
      statisticsRequested: true,
    });

    expect(result.status).toBe("needs_targeted_facts");
    expect(result.unresolvedTargetedFacts.map(({ key }) => key)).toEqual([
      "subject_unit_relationship",
    ]);
    expect(
      result.safeAutoInferences.some(({ semanticPath }) => semanticPath === "matching.kind"),
    ).toBe(false);
  });

  it("never promotes nested Cell or ROI event subjects to independent n", () => {
    const graph = resolveEntryModule("time_to_event", {
      subjectUnitRelationship: "nested_in_parent",
    });
    expect(graph.status).toBe("contract_deferred");
    expect(graph.capabilityReasonCodes).toEqual(["NESTED_EVENT_SUBJECT_REQUIRES_PARENT_STRUCTURE"]);
    expect(
      graph.safeAutoInferences.some(
        ({ semanticPath }) =>
          semanticPath === "experimentalUnitLevelKey" || semanticPath === "matching.kind",
      ),
    ).toBe(false);

    const statistics = resolveEntryModule("time_to_event", {
      subjectUnitRelationship: "nested_in_parent",
      statisticsRequested: true,
    });
    expect(statistics.status).toBe("needs_targeted_facts");
    expect(statistics.unresolvedTargetedFacts.map(({ key }) => key)).toEqual([
      "biological_structure_before_statistics",
    ]);
    expect(statistics.suggestedAlternativeModuleId).toBe("condition_canvas_general");
  });

  it.each([
    ["recurrent_events", "RECURRENT_EVENTS_NOT_REPRESENTABLE"],
    ["competing_events", "COMPETING_EVENTS_NOT_REPRESENTABLE"],
    ["interval_censoring", "INTERVAL_CENSORING_NOT_REPRESENTABLE"],
    ["multi_state", "MULTI_STATE_EVENT_PROCESS_NOT_REPRESENTABLE"],
  ] as const)("safe-stops unsupported time-to-event pattern %s", (pattern, reason) => {
    const result = resolveEntryModule("time_to_event", { timeToEventPattern: pattern });
    expect(result.status).toBe("safe_unsupported");
    expect(result.capabilityReasonCodes).toEqual([reason]);
    expect(result.suggestedAlternativeModuleId).toBeNull();
  });

  it("asks only the two structure-changing facts for ordered curves", () => {
    const result = resolveEntryModule("ordered_curve_kinetics");

    expect(result.status).toBe("needs_targeted_facts");
    expect(result.unresolvedTargetedFacts.map(({ key }) => key)).toEqual([
      "ordered_axis_meaning",
      "axis_material_relationship",
    ]);
    expect(
      result.unresolvedTargetedFacts.every(
        ({ whenUnresolved }) => whenUnresolved === "human_decision_required",
      ),
    ).toBe(true);
  });

  it("maps same-reaction kinetics to retained identity across the ordered axis", () => {
    const result = resolveEntryModule("ordered_curve_kinetics", {
      orderedAxisMeaning: "elapsed_time",
      axisMaterialRelationship: "same_physical_material_across_axis",
    });

    expect(result.status).toBe("surface_ready");
    expect(result.preferredSurface.adaptiveSurfaceId).toBe("repeated_axis_matrix");
    expect(result.unresolvedTargetedFacts).toEqual([]);
    expect(result.safeAutoInferences).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          semanticPath: "orderedAxes[].sampling",
          value: "repeated_same_identity",
          provenance: "explicit_targeted_fact",
        }),
        expect.objectContaining({
          semanticPath: "orderedAxes[].identityRetained",
          value: true,
        }),
      ]),
    );
  });

  it("requires the parent relationship before treating separate point material as ready", () => {
    const unresolved = resolveEntryModule("ordered_curve_kinetics", {
      orderedAxisMeaning: "substrate_concentration",
      axisMaterialRelationship: "separate_material_per_axis_value",
    });

    expect(unresolved.status).toBe("needs_targeted_facts");
    expect(unresolved.unresolvedTargetedFacts.map(({ key }) => key)).toEqual([
      "axis_point_parent_relationship",
    ]);
    expect(unresolved.capabilityReasonCodes).toEqual(["AXIS_POINT_PARENT_RELATIONSHIP_UNRESOLVED"]);

    const result = resolveEntryModule("ordered_curve_kinetics", {
      orderedAxisMeaning: "substrate_concentration",
      axisMaterialRelationship: "separate_material_per_axis_value",
      axisPointParentRelationship: "no_shared_parent_or_matching",
    });

    expect(result.status).toBe("surface_ready");
    expect(result.preferredSurface.adaptiveSurfaceId).toBe("factor_observation_table");
    expect(result.safeAutoInferences).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          semanticPath: "orderedAxes[].sampling",
          value: "cross_sectional",
        }),
        expect.objectContaining({
          semanticPath: "orderedAxes[].identityRetained",
          value: false,
        }),
      ]),
    );
  });

  it("safe-stops separate point material with a shared parent instead of coercing independence", () => {
    const result = resolveEntryModule("ordered_curve_kinetics", {
      orderedAxisMeaning: "substrate_concentration",
      axisMaterialRelationship: "separate_material_per_axis_value",
      axisPointParentRelationship: "shared_parent_or_matching",
    });

    expect(result.status).toBe("safe_unsupported");
    expect(result.capabilityReasonCodes).toEqual([
      "SEPARATE_AXIS_MATERIAL_HAS_SHARED_PARENT_REQUIRES_HIERARCHY",
    ]);
    expect(result.suggestedAlternativeModuleId).toBe("condition_canvas_general");
  });

  it("does not guess when the same-vs-separate reaction fact is unknown", () => {
    const result = resolveEntryModule("ordered_curve_kinetics", {
      orderedAxisMeaning: "substrate_concentration",
      axisMaterialRelationship: "unknown",
    });

    expect(result.status).toBe("needs_targeted_facts");
    expect(result.unresolvedTargetedFacts.map(({ key }) => key)).toEqual([
      "axis_material_relationship",
    ]);
    expect(result.capabilityReasonCodes).toEqual(["AXIS_MATERIAL_RELATIONSHIP_UNRESOLVED"]);
  });

  it("safe-stops multi-axis curves instead of coercing them into the single-axis surface", () => {
    const result = resolveEntryModule("ordered_curve_kinetics", {
      orderedAxisCount: 2,
      orderedAxisMeaning: "elapsed_time",
      axisMaterialRelationship: "same_physical_material_across_axis",
    });

    expect(result.status).toBe("safe_unsupported");
    expect(result.capabilityReasonCodes).toEqual(["MULTIPLE_ORDERED_AXES_REQUIRE_GENERAL_ENTRY"]);
    expect(result.suggestedAlternativeModuleId).toBe("condition_canvas_general");
  });

  it("keeps graph-first and matrix ingress graphable without claiming a StructureContract", () => {
    for (const moduleId of ["matrix_visualization", "graph_only_advanced"] as const) {
      const graphOnly = resolveEntryModule(moduleId);
      expect(graphOnly.status).toBe("contract_deferred");
      expect(graphOnly.safeAutoInferences).toEqual([]);
      expect(graphOnly.unresolvedTargetedFacts).toEqual([]);

      const statistics = resolveEntryModule(moduleId, { statisticsRequested: true });
      expect(statistics.status).toBe("needs_targeted_facts");
      expect(statistics.unresolvedTargetedFacts.map(({ key }) => key)).toEqual([
        "biological_structure_before_statistics",
      ]);
      expect(statistics.suggestedAlternativeModuleId).toBe("condition_canvas_general");
    }
  });

  it("safe-stops current StructureContract boundaries in the general canvas", () => {
    expect(
      resolveEntryModule("condition_canvas_general", {
        conditionPlan: "explicit_sparse_combinations",
      }),
    ).toMatchObject({
      status: "safe_unsupported",
      capabilityReasonCodes: ["SPARSE_CONDITION_PLAN_NOT_REPRESENTABLE"],
    });
    expect(
      resolveEntryModule("condition_canvas_general", { hierarchyShape: "many_to_many" }),
    ).toMatchObject({
      status: "safe_unsupported",
      capabilityReasonCodes: ["MANY_TO_MANY_HIERARCHY_NOT_REPRESENTABLE"],
    });
  });
});

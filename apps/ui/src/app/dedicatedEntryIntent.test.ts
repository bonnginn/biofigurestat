import { describe, expect, it } from "vitest";

import {
  createDedicatedEntryIntent,
  dedicatedEntryHistoryState,
  dedicatedEntryIntentForRoute,
  dedicatedEntryIntentFromHistoryState,
} from "./dedicatedEntryIntent";

describe("dedicated experiment entry intents", () => {
  it("retains animal row identity without guessing the independent assignment unit", () => {
    const intent = createDedicatedEntryIntent({
      moduleId: "time_to_event",
      destination: "survival",
      sourceContext: "animal",
      entryRouteId: "animal_time_to_event",
      experimentName: "Animal survival",
      experimentDescription: "Each animal was followed to an event or censoring.",
    });
    expect(intent.subjectUnitLabel).toBe("Animal");
    expect(intent.facts.subjectUnitRelationship).toBe("unknown");
  });

  it("does not promote tracked cells to biological n", () => {
    const intent = createDedicatedEntryIntent({
      moduleId: "time_to_event",
      destination: "survival",
      sourceContext: "cell_culture",
      entryRouteId: "cell_time_to_event",
      experimentName: "Cell event timing",
      experimentDescription: "Tracked cells were followed to an event or censoring.",
    });
    expect(intent.subjectUnitLabel).toBe("Cell");
    expect(intent.facts.subjectUnitRelationship).toBe("unknown");
  });

  it("opens ordered curves without guessing axis or material continuity", () => {
    const intent = createDedicatedEntryIntent({
      moduleId: "ordered_curve_kinetics",
      destination: "nonlinear-fit",
      sourceContext: "protein_biochemical",
      entryRouteId: "protein_kinetic_fit",
      experimentName: "Reaction curve",
      experimentDescription: "A response was measured along an ordered quantity.",
    });
    expect(intent.facts).toEqual({ orderedAxisCount: 1 });
    expect(intent.subjectUnitLabel).toMatch(/reaction/iu);
  });

  it("opens a matrix visualization without treating columns as biological units", () => {
    const intent = createDedicatedEntryIntent({
      moduleId: "matrix_visualization",
      destination: "heatmap",
      sourceContext: "general_assay",
      entryRouteId: "direct_heatmap",
      experimentName: "Heatmap",
      experimentDescription: "Visualize a numeric matrix while preserving its layout.",
    });

    expect(intent.facts).toEqual({});
    expect(intent.subjectUnitLabel).toMatch(/not a biological unit/iu);
    expect(dedicatedEntryIntentForRoute(intent, "heatmap")).toBe(intent);
  });

  it("consumes an intent after leaving its dedicated destination", () => {
    const intent = createDedicatedEntryIntent({
      moduleId: "time_to_event",
      destination: "survival",
      sourceContext: "animal",
      entryRouteId: "animal_time_to_event",
      experimentName: "Animal survival",
      experimentDescription: "Each animal was followed to an event or censoring.",
    });

    expect(dedicatedEntryIntentForRoute(intent, "survival")).toBe(intent);
    expect(dedicatedEntryIntentForRoute(intent, "nonlinear-fit")).toBeNull();
    expect(dedicatedEntryIntentForRoute(intent, "new-experiment")).toBeNull();
    expect(dedicatedEntryIntentForRoute(null, "survival")).toBeNull();
  });

  it("safe-stops a mismatched legacy destination instead of coercing the module", () => {
    expect(() =>
      createDedicatedEntryIntent({
        moduleId: "time_to_event",
        destination: "nonlinear-fit",
        sourceContext: "animal",
        entryRouteId: "invalid_legacy_route",
        experimentName: "Invalid route",
        experimentDescription: "A time-to-event entry was wired to a curve page.",
      }),
    ).toThrow("DEDICATED_ENTRY_DESTINATION_MISMATCH:time_to_event:nonlinear-fit");
  });

  it("restores a direct entry after reload without trusting stored semantic facts", () => {
    const intent = createDedicatedEntryIntent({
      moduleId: "time_to_event",
      destination: "survival",
      sourceContext: "animal",
      entryRouteId: "direct_time_to_event",
      experimentName: "生存時間",
      experimentDescription: "各対象のeventまたは観察終了までの期間を記録する実験",
    });
    const historyState = dedicatedEntryHistoryState({
      ...intent,
      facts: { subjectUnitRelationship: "subject_is_experimental_unit" },
    });

    expect(dedicatedEntryIntentFromHistoryState(historyState, "survival")).toMatchObject({
      destination: "survival",
      facts: { subjectUnitRelationship: "unknown" },
    });
    expect(dedicatedEntryIntentFromHistoryState(historyState, "nonlinear-fit")).toBeNull();
    expect(
      dedicatedEntryIntentFromHistoryState({ lsaaDedicatedEntryIntent: "invalid" }, "survival"),
    ).toBeNull();
  });
});

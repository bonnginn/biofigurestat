import { describe, expect, it } from "vitest";

import { createSimpleIndependentContinuousFixture } from "../../app/syntheticFixtures";
import { selectExperimentGraphActiveScope } from "./experimentGraphActiveScope";

describe("selectExperimentGraphActiveScope", () => {
  it("keeps displayed and analyzed conditions separate by stable ID", () => {
    const { draft } = createSimpleIndependentContinuousFixture();
    const scope = selectExperimentGraphActiveScope({
      draft,
      selectedReadoutId: draft.readouts[0]!.id,
      selectedConditionIds: draft.conditions.map(({ id }) => id),
      analysisConditionIds: [draft.conditions[0]!.id],
      selectedTimePointIds: [],
      sourceMode: "raw_readout",
      timeAnalysis: { kind: "selected_timepoint" },
      locale: "en",
    });

    expect(scope.activeConditions.map(({ id }) => id)).toEqual(
      draft.conditions.map(({ id }) => id),
    );
    expect(scope.activeAnalysisConditions.map(({ id }) => id)).toEqual([
      draft.conditions[0]!.id,
    ]);
  });

  it("localizes an unresolved time selection without changing the axis", () => {
    const fixture = createSimpleIndependentContinuousFixture();
    const draft = {
      ...fixture.draft,
      time: {
        ...fixture.draft.time,
        sampling: "cross_sectional" as const,
        unit: "h" as const,
        points: [{ id: "time.24", value: 24 }],
      },
    };
    const scope = selectExperimentGraphActiveScope({
      draft,
      selectedReadoutId: draft.readouts[0]!.id,
      selectedConditionIds: draft.conditions.map(({ id }) => id),
      analysisConditionIds: draft.conditions.map(({ id }) => id),
      selectedTimePointIds: [],
      sourceMode: "raw_readout",
      timeAnalysis: { kind: "selected_timepoint" },
      locale: "en",
    });

    expect(scope.timeLabel).toBe("No time point selected");
    expect(scope.activeTimePoints).toEqual([]);
    expect(draft.time.points[0]).toEqual({ id: "time.24", value: 24 });
  });

  it("labels derived metrics without translating their identities", () => {
    const { draft } = createSimpleIndependentContinuousFixture();
    const scope = selectExperimentGraphActiveScope({
      draft,
      selectedReadoutId: draft.readouts[0]!.id,
      selectedConditionIds: draft.conditions.map(({ id }) => id),
      analysisConditionIds: draft.conditions.map(({ id }) => id),
      selectedTimePointIds: [],
      sourceMode: "derived_metric",
      timeAnalysis: { kind: "auc", windowStart: 0, windowEnd: 24 },
      locale: "en",
    });

    expect(scope.timeLabel).toBe("Derived value: AUC (trapezoidal rule)");
  });
});

import { describe, expect, it } from "vitest";

import type { Observation } from "@lsaa/domain";

import { normalizeByLoadingControl } from "./loading-control-normalization";

function observations(): Observation[] {
  return [
    ["unit.control.1", "condition.control", 120, 30],
    ["unit.control.2", "condition.control", 100, 25],
    ["unit.light.1", "condition.light", 180, 30],
  ].flatMap(([unitInstanceId, conditionId, target, control]) => [
    {
      id: `observation.${unitInstanceId}.target`,
      rawRevisionId: "raw.wb.1",
      unitInstanceId: String(unitInstanceId),
      conditionId: String(conditionId),
      outcomeId: "outcome.target-band",
      measurement: { kind: "scalar" as const, value: Number(target) },
      sourceLocation: `sheet:${unitInstanceId}:target`,
    },
    {
      id: `observation.${unitInstanceId}.loading`,
      rawRevisionId: "raw.wb.1",
      unitInstanceId: String(unitInstanceId),
      conditionId: String(conditionId),
      outcomeId: "outcome.loading-control",
      measurement: { kind: "scalar" as const, value: Number(control) },
      sourceLocation: `sheet:${unitInstanceId}:loading`,
    },
  ]);
}

describe("WB loading-control normalization", () => {
  it("derives one traceable ratio per biological replicate and preserves raw values", () => {
    const raw = observations();
    const original = structuredClone(raw);
    const result = normalizeByLoadingControl({
      transformationId: "transform.wb-ratio.1",
      rawRevisionId: "raw.wb.1",
      targetOutcomeId: "outcome.target-band",
      loadingControlOutcomeId: "outcome.loading-control",
      observations: raw,
    });

    expect(result.ratios.map((ratio) => ratio.value)).toEqual([4, 4, 6]);
    expect(result.transformation.method).toBe("loading_control_ratio");
    expect(result.transformation.inputRevisionIds).toEqual(["raw.wb.1"]);
    expect(result.ratios[0]).toMatchObject({
      targetObservationId: "observation.unit.control.1.target",
      loadingControlObservationId: "observation.unit.control.1.loading",
    });
    expect(raw).toEqual(original);
  });

  it("rejects missing or duplicate bands and zero loading-control intensity", () => {
    const missing = observations().filter(
      (observation) => observation.id !== "observation.unit.control.1.loading",
    );
    expect(() =>
      normalizeByLoadingControl({
        transformationId: "transform.wb-ratio.1",
        rawRevisionId: "raw.wb.1",
        targetOutcomeId: "outcome.target-band",
        loadingControlOutcomeId: "outcome.loading-control",
        observations: missing,
      }),
    ).toThrow(/exactly one target and one loading-control/);

    const zero = observations().map((observation) =>
      observation.id === "observation.unit.control.1.loading"
        ? { ...observation, measurement: { kind: "scalar" as const, value: 0 } }
        : observation,
    );
    expect(() =>
      normalizeByLoadingControl({
        transformationId: "transform.wb-ratio.1",
        rawRevisionId: "raw.wb.1",
        targetOutcomeId: "outcome.target-band",
        loadingControlOutcomeId: "outcome.loading-control",
        observations: zero,
      }),
    ).toThrow(/cannot be zero/);
  });
});

import { describe, expect, it } from "vitest";
import { createD13EngineRequest } from "./d13-request-builder";

const states = [
  { id: "state.baseline", label: "Baseline", order: 0 },
  { id: "state.challenge", label: "Challenge", order: 1 },
];
const rows = ["A", "B"].flatMap((conditionId) =>
  [1, 2].flatMap((unit) =>
    states.map((state, stateIndex) => ({
      observationId: `o.${conditionId}.${unit}.${stateIndex}`,
      conditionId,
      biologicalUnitId: `u.${conditionId}.${unit}`,
      stateLevelId: state.id,
      value: unit + stateIndex,
    })),
  ),
);

describe("D13 categorical repeated state", () => {
  it("preserves stable identity, ordered labels, and no numeric time field", () => {
    const request = createD13EngineRequest({
      requestId: "request.1",
      projectId: "project.1",
      analysisId: "analysis.1",
      conditionIds: ["A", "B"],
      factorTitle: "Experimental phase",
      states,
      observations: rows,
    });
    expect(request).toMatchObject({
      protocolVersion: "0.10.0",
      withinFactor: { role: "categorical", title: "Experimental phase" },
      stateLevels: states.map(({ id, label, order }) => ({ levelId: id, label, order })),
    });
    expect("timePoints" in request).toBe(false);
    expect(request.observations.every((row) => row.experimentalUnitId === row.pairId)).toBe(true);
  });
  it("rejects an incomplete unit instead of inventing a state", () => {
    expect(() =>
      createD13EngineRequest({
        requestId: "r",
        projectId: "p",
        analysisId: "a",
        conditionIds: ["A", "B"],
        factorTitle: "State",
        states,
        observations: rows.slice(1),
      }),
    ).toThrow(/incomplete/u);
  });
});

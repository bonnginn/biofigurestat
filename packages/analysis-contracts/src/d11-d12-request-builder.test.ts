import { describe, expect, it } from "vitest";
import type { ExperimentDesign, Observation, UnitInstance } from "@lsaa/domain";

import { createD11EngineRequest } from "./d11-request-builder";
import { createD12EngineRequest } from "./d12-request-builder";

const now = "2026-08-24T00:00:00.000Z";
function design(
  conditionIds: string[],
  outcomeType: "continuous" | "time_to_event",
): ExperimentDesign {
  return {
    schemaVersion: "0.2.0",
    id: "design.1",
    name: "Generic design",
    purpose: "custom",
    outcomes: [
      {
        id: "outcome.1",
        key: "outcome",
        label: "Outcome",
        type: outcomeType,
        unit: outcomeType === "time_to_event" ? "days" : "a.u.",
      },
    ],
    factors: [
      {
        id: "factor.group",
        key: "group",
        label: "Group",
        levels: conditionIds.map((id, order) => ({ id: `level.${id}`, label: id, order })),
      },
    ],
    conditions: conditionIds.map((id) => ({
      id,
      label: id,
      factorLevels: { "factor.group": `level.${id}` },
    })),
    unitLevels: [
      {
        id: "level.unit",
        key: "unit",
        label: "Biological unit",
        role: "experimental_unit",
        parentLevelId: null,
      },
    ],
    experimentalUnitLevelId: "level.unit",
    pairing: { kind: "independent" },
    plannedN: 2,
    normalizationPlans: [],
    primaryContrast:
      conditionIds.length === 1
        ? null
        : {
            id: "contrast.1",
            label: "Primary",
            conditionIds: [conditionIds[0]!, conditionIds[1]!],
          },
    wizardRuleVersion: "test",
    wizardDecisions: [],
    createdAt: now,
  };
}
const units: UnitInstance[] = ["u1", "u2", "u3", "u4"].map((id) => ({
  id,
  levelId: "level.unit",
  parentUnitId: null,
  label: id,
  metadata: {},
}));

describe("D11/D12 request builders", () => {
  it("preserves survival follow-up and censor status", () => {
    const observations: Observation[] = units.map((unit, index) => ({
      id: `o${index + 1}`,
      rawRevisionId: "raw.1",
      unitInstanceId: unit.id,
      conditionId: index < 2 ? "A" : "B",
      outcomeId: "outcome.1",
      measurement: { kind: "time_to_event", followUpTime: index + 1, eventObserved: index !== 1 },
    }));
    const request = createD11EngineRequest({
      requestId: "request.1",
      projectId: "project.1",
      analysisId: "analysis.1",
      design: design(["A", "B"], "time_to_event"),
      observations,
      unitInstances: units,
      outcomeId: "outcome.1",
    });
    expect(request.protocolVersion).toBe("0.8.0");
    expect(request.observations[1]).toMatchObject({ followUpTime: 2, eventObserved: false });
  });

  it("uses one cohort and the supplied nonzero reference", () => {
    const observations: Observation[] = units.slice(0, 3).map((unit, index) => ({
      id: `o${index + 1}`,
      rawRevisionId: "raw.1",
      unitInstanceId: unit.id,
      conditionId: "Cohort",
      outcomeId: "outcome.1",
      measurement: { kind: "scalar", value: index + 4 },
    }));
    const request = createD12EngineRequest({
      requestId: "request.2",
      projectId: "project.1",
      analysisId: "analysis.2",
      design: design(["Cohort"], "continuous"),
      observations,
      unitInstances: units.slice(0, 3),
      nullValue: 3.5,
    });
    expect(request).toMatchObject({
      protocolVersion: "0.9.0",
      conditionId: "Cohort",
      nullValue: 3.5,
    });
    expect(request.observations).toHaveLength(3);
  });

  it("rejects scalar survival data and duplicate one-sample units", () => {
    expect(() =>
      createD11EngineRequest({
        requestId: "r",
        projectId: "p",
        analysisId: "a",
        design: design(["A", "B"], "time_to_event"),
        observations: [
          {
            id: "o",
            rawRevisionId: "raw",
            unitInstanceId: "u1",
            conditionId: "A",
            outcomeId: "outcome.1",
            measurement: { kind: "scalar", value: 1 },
          },
        ],
        unitInstances: units,
        outcomeId: "outcome.1",
      }),
    ).toThrow(/ordinary continuous/u);
  });
});

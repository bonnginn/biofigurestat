import { describe, expect, it } from "vitest";

import { createIndependentTwoGroupFixture } from "./syntheticFixtures";
import {
  isLiteratureCaseId,
  mapLiteratureMeasurements,
  type LiteratureExperimenterCase,
} from "./literatureBenchmark";

const source: LiteratureExperimenterCase = {
  benchmarkVersion: "LSA50_v1_1",
  caseId: "JCB003",
  researcherPacket: {
    case_id: "JCB003",
    blind_experiment_summary: "Two independent groups",
    measurement_context: "cell count",
    conditions: "Control | Treatment",
    timepoints: "(none)",
    readouts: "value",
    experimental_unit_description: "independent cells",
    independent_session_count: 3,
    repeated_identity_note: "none",
    nested_observation_note: "none",
  },
  syntheticData: [
    ["Control", "C1", 1],
    ["Control", "C2", 2],
    ["Treatment", "T1", 3],
    ["Treatment", "T2", 4],
  ].map(([condition, unit, value], index) => ({
    case_id: "JCB003",
    experiment_id: `Exp${(index % 2) + 1}`,
    unit_id: String(unit),
    parent_unit_id: null,
    condition: String(condition),
    time: null,
    readout: "value",
    value: Number(value),
    numerator: null,
    denominator: null,
    x_value: null,
    event: null,
    synthetic: true as const,
    seed: 1,
  })),
};

function compatibleDraft(experimentCount: number) {
  const fixture = createIndependentTwoGroupFixture();
  return {
    ...fixture.draft,
    experiments: fixture.draft.experiments.slice(0, experimentCount),
    conditions: fixture.draft.conditions.map((condition, index) => ({
      ...condition,
      label: index === 0 ? "Control" : "Treatment",
      attributes: { "attribute.group": index === 0 ? "Control" : "Treatment" },
    })),
  };
}

const nestedSource: LiteratureExperimenterCase = {
  ...source,
  researcherPacket: {
    ...source.researcherPacket,
    experimental_unit_description:
      "Independent experimental session; cell observations nested within each session",
    nested_observation_note:
      "Cell-level observations are nested within independent experimental sessions.",
  },
  syntheticData: ["Control", "Treatment"].flatMap((condition) =>
    [1, 2, 3].flatMap((session) =>
      [1, 2].map((cell) => ({
        ...source.syntheticData[0],
        condition,
        experiment_id: `Exp${session}`,
        unit_id: `${condition}-Exp${session}-Cell${cell}`,
        parent_unit_id: `Exp${session}`,
        value: session + cell / 10,
      })),
    ),
  ),
};

describe("literature benchmark experimenter boundary", () => {
  it("recognizes only stable literature IDs", () => {
    expect(isLiteratureCaseId("JCB003")).toBe(true);
    expect(isLiteratureCaseId("../JCB003")).toBe(false);
    expect(isLiteratureCaseId("pilot_independent_2group")).toBe(false);
  });

  it("maps values only after design compatibility", () => {
    const draft = compatibleDraft(2);
    const result = mapLiteratureMeasurements(source, draft);
    expect(result.compatible).toBe(true);
    expect(Object.values(result.cells)).toHaveLength(4);
    expect(
      Object.values(result.cells).flatMap((cell) =>
        cell.kind === "nested_continuous" ? cell.rawValues : [],
      ),
    ).toEqual([1, 2, 3, 4]);
  });

  it("maps nested observations to session-level statistical units", () => {
    const result = mapLiteratureMeasurements(nestedSource, compatibleDraft(3));
    expect(result.compatible).toBe(true);
    expect(Object.values(result.cells)).toHaveLength(6);
    expect(
      Object.values(result.cells).flatMap((cell) =>
        cell.kind === "nested_continuous" ? cell.rawValues : [],
      ),
    ).toHaveLength(12);
  });

  it("does not inflate biological n when another nested observation is added", () => {
    const extraObservation = {
      ...nestedSource.syntheticData[0],
      unit_id: "Control-Exp1-Cell3",
      value: 1.3,
    };
    const result = mapLiteratureMeasurements(
      { ...nestedSource, syntheticData: [...nestedSource.syntheticData, extraObservation] },
      compatibleDraft(3),
    );
    expect(result.compatible).toBe(true);
    expect(Object.values(result.cells)).toHaveLength(6);
  });

  it("refuses a nested packet with a missing parent mapping", () => {
    const broken = nestedSource.syntheticData.map((row, index) =>
      index === 0 ? { ...row, parent_unit_id: null } : row,
    );
    const result = mapLiteratureMeasurements(
      { ...nestedSource, syntheticData: broken },
      compatibleDraft(3),
    );
    expect(result.compatible).toBe(false);
    expect(result.reason).toContain("parent unit");
  });

  it("refuses mismatched condition assignment", () => {
    const fixture = createIndependentTwoGroupFixture();
    const result = mapLiteratureMeasurements(source, {
      ...fixture.draft,
      conditionAssignment: { kind: "matched", unitLabel: "cell" },
    });
    expect(result.compatible).toBe(false);
    expect(result.cells).toEqual({});
  });
});

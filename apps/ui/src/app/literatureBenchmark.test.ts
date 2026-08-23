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

  it("preserves an explicitly described Sholl radius as the graph X semantic", () => {
    const radiusSource: LiteratureExperimenterCase = {
      ...source,
      researcherPacket: {
        ...source.researcherPacket,
        blind_experiment_summary: "Radius-dependent Sholl intersections in two conditions",
        measurement_context: "Sholl intersection radius",
      },
      syntheticData: ["Control", "Treatment"].flatMap((condition) =>
        [10, 20].flatMap((time) =>
          [1, 2].map((replicate) => ({
            ...source.syntheticData[0],
            condition,
            time,
            unit_id: `${condition}-${time}-${replicate}`,
            value: time + replicate,
          })),
        ),
      ),
    };
    const draft = compatibleDraft(2);
    const timeCoercion = mapLiteratureMeasurements(radiusSource, {
      ...draft,
      time: {
        sampling: "cross_sectional",
        unit: "h",
        points: [
          { id: "time.1", value: 10 },
          { id: "time.2", value: 20 },
        ],
      },
    });
    expect(timeCoercion.compatible).toBe(false);
    expect(timeCoercion.message).toContain("時間以外の数値軸");
    expect(timeCoercion.message).toContain("時間として入力しません");

    const result = mapLiteratureMeasurements(radiusSource, {
      ...draft,
      time: {
        sampling: "cross_sectional",
        axisSemantic: "numeric_covariate",
        axisTitle: "Radius",
        axisUnit: "µm",
        unit: "h",
        points: [
          { id: "time.1", value: 10 },
          { id: "time.2", value: 20 },
        ],
      },
    });

    expect(result.compatible).toBe(true);
    expect(result.xAxis).toEqual({
      semantic: "numeric_covariate",
      title: "Radius",
      unit: "µm",
      source: "researcher_packet",
    });
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

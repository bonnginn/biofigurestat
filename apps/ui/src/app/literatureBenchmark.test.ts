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

describe("literature benchmark experimenter boundary", () => {
  it("recognizes only stable literature IDs", () => {
    expect(isLiteratureCaseId("JCB003")).toBe(true);
    expect(isLiteratureCaseId("../JCB003")).toBe(false);
    expect(isLiteratureCaseId("pilot_independent_2group")).toBe(false);
  });

  it("maps values only after design compatibility", () => {
    const fixture = createIndependentTwoGroupFixture();
    const draft = {
      ...fixture.draft,
      experiments: fixture.draft.experiments.slice(0, 2),
      conditions: fixture.draft.conditions.map((condition, index) => ({
        ...condition,
        label: index === 0 ? "Control" : "Treatment",
        attributes: { "attribute.group": index === 0 ? "Control" : "Treatment" },
      })),
    };
    const result = mapLiteratureMeasurements(source, draft);
    expect(result.compatible).toBe(true);
    expect(Object.values(result.cells)).toHaveLength(4);
    expect(
      Object.values(result.cells).flatMap((cell) =>
        cell.kind === "nested_continuous" ? cell.rawValues : [],
      ),
    ).toEqual([1, 2, 3, 4]);
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

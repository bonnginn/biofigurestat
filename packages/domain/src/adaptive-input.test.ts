import { describe, expect, it } from "vitest";

import { CanonicalAdaptiveObservationSchema, StructureContractSchema } from "./adaptive-input";
import { ExperimentDesignSchema } from "./design";

const baseContract = {
  schemaVersion: "0.1.0" as const,
  contractId: "contract.test",
  experimentName: "Test experiment",
  experimentDescription: "Independent samples were measured.",
  unitLevels: [
    {
      key: "sample",
      label: "Sample",
      role: "experimental_unit" as const,
      parentKey: null,
    },
  ],
  experimentalUnitLevelKey: "sample",
  identities: [
    { key: "sample_id", label: "Sample ID", unitLevelKey: "sample", required: true },
  ],
  factors: [
    {
      key: "treatment",
      label: "Treatment",
      levels: ["Control", "Drug"],
      unitRole: "between_unit" as const,
      relationship: "independent" as const,
      ordered: false,
      referenceLevel: "Control",
    },
  ],
  matching: { kind: "independent" as const, identityKey: null, completeSetsRequired: null },
  orderedAxes: [
    {
      key: "time",
      label: "Time",
      unit: "h",
      levels: [0, 1],
      sampling: "cross_sectional" as const,
      identityRetained: false,
    },
  ],
  readouts: [
    {
      key: "signal",
      label: "Signal",
      valueType: "scalar",
      representation: "scalar" as const,
      componentKeys: ["value"],
      referenceRole: "none" as const,
      observationLevelKey: "sample",
      axisKeys: ["time"],
    },
  ],
  allowedMissingness: ["unknown" as const],
  rawObservationGrain: "one sample observation",
};

describe("adaptive semantic invariants", () => {
  it("keeps experiment-session provenance optional and separate from observation identity", () => {
    const legacy = CanonicalAdaptiveObservationSchema.parse({
      observationId: "observation.legacy",
      readoutKey: "signal",
      identities: { sample_id: "sample.1" },
      factors: { treatment: "Control" },
      axes: {},
      hierarchy: {},
      values: { signal: 1 },
      missingness: {},
      sourceRow: null,
    });
    expect(legacy.experimentSessionId).toBeUndefined();

    const linked = CanonicalAdaptiveObservationSchema.parse({
      ...legacy,
      experimentSessionId: "experiment.3",
    });
    expect(linked.experimentSessionId).toBe("experiment.3");
    expect(linked.identities).toEqual(legacy.identities);
  });

  it("rejects factor levels that collide after string normalization", () => {
    expect(() =>
      StructureContractSchema.parse({
        ...baseContract,
        factors: [{ ...baseContract.factors[0], levels: ["A", "Ａ"], referenceLevel: "A" }],
      }),
    ).toThrow(/Factor levels must be unique/);
  });

  it("rejects ordered-axis levels that collide after string normalization", () => {
    expect(() =>
      StructureContractSchema.parse({
        ...baseContract,
        orderedAxes: [{ ...baseContract.orderedAxes[0], levels: [1, "1"] }],
      }),
    ).toThrow(/Ordered-axis levels must be unique/);
  });

  it("requires a factor reference to be one of the declared levels", () => {
    expect(() =>
      StructureContractSchema.parse({
        ...baseContract,
        factors: [{ ...baseContract.factors[0], referenceLevel: "Untreated" }],
      }),
    ).toThrow(/reference level must be one of/);
  });

  it("rejects duplicate readout component keys", () => {
    expect(() =>
      StructureContractSchema.parse({
        ...baseContract,
        readouts: [{ ...baseContract.readouts[0], componentKeys: ["value", "value"] }],
      }),
    ).toThrow(/component keys must be unique/);
  });

  it("allows experiment structure to precede selection of a statistical contrast", () => {
    expect(() =>
      ExperimentDesignSchema.parse({
        schemaVersion: "0.2.0",
        id: "design.graph-first",
        name: "Graph-first design",
        purpose: "custom",
        outcomes: [{ id: "outcome.signal", key: "signal", label: "Signal", type: "continuous" }],
        factors: [
          {
            id: "factor.treatment",
            key: "treatment",
            label: "Treatment",
            levels: [
              { id: "level.control", label: "Control", order: 0 },
              { id: "level.drug", label: "Drug", order: 1 },
            ],
          },
        ],
        conditions: [
          {
            id: "condition.control",
            label: "Control",
            factorLevels: { "factor.treatment": "level.control" },
          },
          {
            id: "condition.drug",
            label: "Drug",
            factorLevels: { "factor.treatment": "level.drug" },
          },
        ],
        unitLevels: [
          {
            id: "unit.sample",
            key: "sample",
            label: "Sample",
            role: "experimental_unit",
            parentLevelId: null,
          },
        ],
        experimentalUnitLevelId: "unit.sample",
        pairing: { kind: "independent" },
        plannedN: 2,
        normalizationPlans: [],
        primaryContrast: null,
        wizardRuleVersion: "adaptive-input-alpha",
        wizardDecisions: [],
        createdAt: "2026-08-28T00:00:00.000Z",
      }),
    ).not.toThrow();
  });
});

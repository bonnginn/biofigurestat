import { describe, expect, it } from "vitest";
import { CanonicalAdaptiveObservationSchema, StructureContractSchema } from "@lsaa/domain";

import { buildStructureContract } from "./contract-builder";
import {
  canonicalizeAdaptiveRows,
  parseAdaptiveDelimited,
  suggestAdaptiveColumnMapping,
} from "./import-adapter";
import { validateCanonicalObservationsForContract } from "./observation-validator";

const contract = buildStructureContract({
  experimentName: "Axis treatment",
  experimentDescription: "Independent samples were measured at declared times.",
  experimentalUnitLabel: "sample",
  identityLabel: "Sample ID",
  readoutLabel: "Signal",
  readoutRepresentation: "scalar",
  factorName: "Treatment",
  factorLevels: ["Control", "Drug"],
  sameIdentityAcrossConditions: false,
  orderedAxis: { label: "Time", unit: "h", levels: [0, 1], sameIdentity: false },
});

const validObservation = CanonicalAdaptiveObservationSchema.parse({
  observationId: "observation.1",
  readoutKey: "signal",
  identities: { sampleid: "S1" },
  factors: { treatment: "Control" },
  axes: { time: 0 },
  hierarchy: {},
  values: { signal: 1 },
  missingness: {},
  sourceRow: 2,
});

describe("canonical observation contract validation", () => {
  it("accepts a row with one known condition and all readout coordinates", () => {
    expect(validateCanonicalObservationsForContract(contract, [validObservation])).toEqual([]);
  });

  it("safe-stops scalar aliases without rejecting explicit missing values", () => {
    const ambiguous = CanonicalAdaptiveObservationSchema.parse({
      ...validObservation,
      observationId: "ambiguous.scalar",
      values: { signal: 1, value: 1 },
    });
    const explicitNull = CanonicalAdaptiveObservationSchema.parse({
      ...validObservation,
      observationId: "missing.scalar.null",
      identities: { sampleid: "S2" },
      values: { signal: null },
      missingness: { signal: "not_collected" },
    });
    const explicitMissingness = CanonicalAdaptiveObservationSchema.parse({
      ...validObservation,
      observationId: "missing.scalar.reason",
      identities: { sampleid: "S3" },
      values: {},
      missingness: { value: "assay_failed" },
    });
    const omitted = CanonicalAdaptiveObservationSchema.parse({
      ...validObservation,
      observationId: "omitted.scalar",
      identities: { sampleid: "S4" },
      values: {},
      missingness: {},
    });

    expect(validateCanonicalObservationsForContract(contract, [ambiguous])).toContain(
      "adaptive_observation:ambiguous.scalar:ambiguous_readout_component_alias:signal:value:signal,value",
    );
    expect(validateCanonicalObservationsForContract(contract, [explicitNull])).toEqual([]);
    expect(validateCanonicalObservationsForContract(contract, [explicitMissingness])).toEqual([]);
    expect(validateCanonicalObservationsForContract(contract, [omitted])).toContain(
      "adaptive_observation:omitted.scalar:missing_readout_component:signal:value",
    );
  });

  it("safe-stops a typed component represented by both namespaced and legacy aliases", () => {
    const typedContract = StructureContractSchema.parse({
      ...contract,
      contractId: "contract.typed-alias",
      readouts: [
        {
          ...contract.readouts[0]!,
          representation: "proportion_counts",
          componentKeys: ["numerator", "denominator"],
        },
      ],
    });
    const ambiguous = CanonicalAdaptiveObservationSchema.parse({
      ...validObservation,
      observationId: "ambiguous.typed",
      values: {
        signal_numerator: 3,
        numerator: 3,
        signal_denominator: 10,
      },
    });
    const explicitMissingComponent = CanonicalAdaptiveObservationSchema.parse({
      ...validObservation,
      observationId: "missing.typed.explicit",
      identities: { sampleid: "S2" },
      values: { signal_numerator: 3 },
      missingness: { denominator: "not_collected" },
    });
    const omittedComponent = CanonicalAdaptiveObservationSchema.parse({
      ...validObservation,
      observationId: "missing.typed.omitted",
      identities: { sampleid: "S3" },
      values: { signal_numerator: 3 },
      missingness: {},
    });

    expect(validateCanonicalObservationsForContract(typedContract, [ambiguous])).toContain(
      "adaptive_observation:ambiguous.typed:ambiguous_readout_component_alias:signal:numerator:signal_numerator,numerator",
    );
    expect(
      validateCanonicalObservationsForContract(typedContract, [explicitMissingComponent]),
    ).toEqual([]);
    expect(validateCanonicalObservationsForContract(typedContract, [omittedComponent])).toContain(
      "adaptive_observation:missing.typed.omitted:missing_readout_component:signal:denominator",
    );
  });

  it("rejects two scalar rows at the same complete semantic coordinate", () => {
    const duplicate = CanonicalAdaptiveObservationSchema.parse({
      ...validObservation,
      observationId: "observation.duplicate",
      values: { signal: 2 },
      sourceRow: 3,
    });

    expect(
      validateCanonicalObservationsForContract(contract, [validObservation, duplicate]),
    ).toContain(
      "adaptive_observation:observation.duplicate:duplicate_semantic_coordinate:observation.1",
    );
  });

  it("accepts nested rows with distinct explicit child identities", () => {
    const nestedContract = buildStructureContract({
      experimentName: "Cell observations",
      experimentDescription: "Distinct cells were measured within each culture dish.",
      experimentalUnitLabel: "Culture dish",
      identityLabel: "Dish ID",
      readoutLabel: "Signal",
      readoutRepresentation: "scalar",
      factorName: "Treatment",
      factorLevels: ["Control", "Drug"],
      sameIdentityAcrossConditions: false,
      nestedObservationLabel: "Cell",
    });
    const nestedRows = ["Cell-1", "Cell-2"].map((cellId, index) =>
      CanonicalAdaptiveObservationSchema.parse({
        observationId: `nested.${index + 1}`,
        readoutKey: "signal",
        identities: { dishid: "Dish-1", cell_id: cellId },
        factors: { treatment: "Control" },
        axes: {},
        hierarchy: {},
        values: { signal: index + 1 },
        missingness: {},
        sourceRow: index + 2,
      }),
    );

    expect(validateCanonicalObservationsForContract(nestedContract, nestedRows)).toEqual([]);
  });

  it("reports unknown readout, missing/unknown factors, and missing/unknown axes", () => {
    const diagnostics = validateCanonicalObservationsForContract(contract, [
      { ...validObservation, observationId: "unknown.readout", readoutKey: "other" },
      { ...validObservation, observationId: "missing.factor", factors: {} },
      {
        ...validObservation,
        observationId: "unknown.factor",
        factors: { treatment: "Other" },
      },
      { ...validObservation, observationId: "missing.axis", axes: {} },
      { ...validObservation, observationId: "unknown.axis", axes: { time: 9 } },
    ]);

    expect(diagnostics).toContain("adaptive_observation:unknown.readout:unknown_readout:other");
    expect(diagnostics).toContain("adaptive_observation:missing.factor:missing_factor:treatment");
    expect(diagnostics).toContain(
      "adaptive_observation:missing.factor:condition_projection_count:0",
    );
    expect(diagnostics).toContain(
      "adaptive_observation:unknown.factor:unknown_factor_level:treatment:Other",
    );
    expect(diagnostics).toContain("adaptive_observation:missing.axis:missing_axis:time");
    expect(diagnostics).toContain("adaptive_observation:unknown.axis:unknown_axis_level:time:9");
  });

  it("rejects unknown and known-but-unbound axis coordinates", () => {
    const contractWithSecondAxis = {
      ...contract,
      orderedAxes: [
        ...contract.orderedAxes,
        {
          key: "dose",
          label: "Dose",
          unit: "nM",
          levels: [1, 10],
          sampling: "cross_sectional" as const,
          identityRetained: false,
        },
      ],
    };
    const diagnostics = validateCanonicalObservationsForContract(contractWithSecondAxis, [
      { ...validObservation, observationId: "unknown.axis.key", axes: { time: 0, batch: 1 } },
      { ...validObservation, observationId: "unbound.axis", axes: { time: 0, dose: 1 } },
    ]);

    expect(diagnostics).toContain("adaptive_observation:unknown.axis.key:unknown_axis:batch");
    expect(diagnostics).toContain("adaptive_observation:unbound.axis:unbound_axis:dose");
  });

  it("requires an explicitly declared run or source identity instead of inferring it from row order", () => {
    const runContract = StructureContractSchema.parse({
      ...contract,
      contractId: "contract.explicit-run",
      unitLevels: [
        { key: "run", label: "Experimental run", role: "block", parentKey: null },
        {
          key: "sample",
          label: "Sample",
          role: "experimental_unit",
          parentKey: "run",
        },
      ],
      identities: [
        { key: "run_id", label: "Run ID", unitLevelKey: "run", required: true },
        { key: "sampleid", label: "Sample ID", unitLevelKey: "sample", required: true },
      ],
      experimentalUnitLevelKey: "sample",
      matching: { kind: "independent", identityKey: null, completeSetsRequired: null },
      readouts: contract.readouts.map((readout) => ({
        ...readout,
        observationLevelKey: "sample",
      })),
    });
    const missingRun = CanonicalAdaptiveObservationSchema.parse({
      ...validObservation,
      observationId: "missing.run",
      identities: { sampleid: "S1" },
    });
    const explicitRun = CanonicalAdaptiveObservationSchema.parse({
      ...validObservation,
      observationId: "explicit.run",
      identities: { run_id: "run-2026-08-28-a", sampleid: "S1" },
    });

    expect(validateCanonicalObservationsForContract(runContract, [missingRun])).toContain(
      "adaptive_observation:missing.run:missing_required_identity:run_id",
    );
    expect(validateCanonicalObservationsForContract(runContract, [explicitRun])).toEqual([]);
  });

  it("does not require a duplicate coordinate for event follow-up typed records", () => {
    const eventContract = {
      ...contract,
      orderedAxes: [
        {
          key: "followup",
          label: "Follow-up",
          unit: "day",
          levels: [],
          sampling: "event_follow_up" as const,
          identityRetained: false,
        },
      ],
      readouts: [
        {
          ...contract.readouts[0]!,
          representation: "event_censoring" as const,
          componentKeys: ["follow_up", "event_observed"],
          axisKeys: ["followup"],
        },
      ],
    };
    const eventObservation = {
      ...validObservation,
      readoutKey: eventContract.readouts[0]!.key,
      axes: {},
      values: { follow_up: 12, event_observed: true },
    };

    expect(validateCanonicalObservationsForContract(eventContract, [eventObservation])).toEqual([]);
  });

  it("makes the import adapter reject a row whose required factor is absent", () => {
    const parsed = parseAdaptiveDelimited("Sample ID\tTime\tSignal\nS1\t0\t1");
    const mapping = suggestAdaptiveColumnMapping(
      contract,
      parsed,
      "missing-factor.tsv",
      "2026-08-28T00:00:00.000Z",
    );

    expect(() => canonicalizeAdaptiveRows(contract, parsed, mapping)).toThrow(
      /missing_factor:treatment/,
    );
  });
});

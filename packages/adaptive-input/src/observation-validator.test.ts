import { describe, expect, it } from "vitest";
import { CanonicalAdaptiveObservationSchema } from "@lsaa/domain";

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
    expect(diagnostics).toContain(
      "adaptive_observation:unknown.axis:unknown_axis_level:time:9",
    );
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

    expect(validateCanonicalObservationsForContract(eventContract, [eventObservation])).toEqual(
      [],
    );
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

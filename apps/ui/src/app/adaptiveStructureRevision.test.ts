import { describe, expect, it } from "vitest";
import { buildStructureContract } from "@lsaa/adaptive-input";
import {
  AdaptiveColumnMappingSchema,
  StructureContractSchema,
  type CanonicalAdaptiveObservation,
  type StructureContract,
} from "@lsaa/domain";

import {
  buildConditionCombinations,
  safelyBuildBiologicalSetup,
  type ConditionEntryBlock,
} from "../components/BiologicalExperimentSetup";
import {
  checkAdaptiveStructureRevisionCompatibility,
  createBiologicalSetupPresentation,
  createBiologicalSetupPrefill,
} from "./adaptiveStructureRevision";

const block = (
  id: string,
  name: string,
  levels: readonly string[],
  groups: readonly string[] = [],
): ConditionEntryBlock => ({
  id,
  name,
  showGroups: groups.length > 0,
  groupLabels: Array.from({ length: 5 }, (_, index) => groups[index] ?? ""),
  values: [
    Array.from({ length: 5 }, (_, index) => levels[index] ?? ""),
    ...Array.from({ length: 4 }, () => Array.from({ length: 5 }, () => "")),
  ],
});

function fullSetupResult() {
  const blocks = [
    block("condition-block.1", "Dox", ["Vehicle", "Dox"], ["Dose"]),
    block("condition-block.2", "siRNA", ["Control", "Target"]),
  ];
  const combinations = buildConditionCombinations(blocks);
  const built = safelyBuildBiologicalSetup({
    title: "Paired donor experiment",
    measurementLabel: "Intensity",
    valueForm: "single",
    measurementUsesNestedObservation: true,
    measurementUsesOrderedAxis: true,
    additionalReadouts: [
      {
        label: "Target / reference",
        valueForm: "target_reference",
        usesNestedObservation: false,
        usesOrderedAxis: true,
      },
    ],
    blocks,
    combinations,
    statuses: {},
    receiverLabel: "Dish",
    receiverIdLabel: "Dish stable ID",
    relationship: "shared_source",
    sourceLabel: "Donor",
    sourceIdLabel: "Donor stable ID",
    sharedSourcePairedBlockId: "condition-block.2",
    childLabel: "Cell",
    orderedAxis: {
      label: "Time",
      unit: "h",
      levels: [0, 24],
      sameIdentity: true,
    },
  });
  if (built.status !== "ready") throw new Error(built.reason);
  return built.result;
}

function baseContract(): StructureContract {
  return buildStructureContract({
    experimentName: "Level revision",
    experimentDescription: "Conditionを組み合わせ、Responseを測定",
    experimentalUnitLabel: "Dish",
    identityLabel: "Dish ID",
    readoutLabel: "Response",
    readoutRepresentation: "scalar",
    factorName: "Condition",
    factorLevels: ["Control", "Drug", "Unused"],
    sameIdentityAcrossConditions: false,
    orderedAxis: {
      label: "Time",
      unit: "h",
      levels: [0, 24, 48],
      sameIdentity: false,
    },
  });
}

function observations(contract: StructureContract): CanonicalAdaptiveObservation[] {
  const identityKey = contract.identities[0]!.key;
  const factorKey = contract.factors[0]!.key;
  const axisKey = contract.orderedAxes[0]!.key;
  const readoutKey = contract.readouts[0]!.key;
  return [
    {
      observationId: "observation.one",
      readoutKey,
      identities: { [identityKey]: "dish-1" },
      factors: { [factorKey]: "Control" },
      axes: { [axisKey]: 0 },
      hierarchy: {},
      values: { [readoutKey]: 1.5 },
      missingness: {},
      sourceRow: 2,
    },
    {
      observationId: "observation.two",
      readoutKey,
      identities: { [identityKey]: "dish-2" },
      factors: { [factorKey]: "Drug" },
      axes: { [axisKey]: 24 },
      hierarchy: {},
      values: { [readoutKey]: 2.5 },
      missingness: {},
      sourceRow: 3,
    },
  ];
}

describe("createBiologicalSetupPrefill", () => {
  it("retains a full versioned canvas only when it reproduces the contract", () => {
    const original = fullSetupResult();
    const retained = createBiologicalSetupPresentation(original);
    expect(retained.status).toBe("ready");
    if (retained.status !== "ready") return;
    expect(retained.presentation).toMatchObject({
      schemaVersion: "0.1.0",
      answers: original.answers,
      conditionBlocks: original.conditionBlocks,
      conditionCombinations: original.conditionCombinations,
    });
    expect(retained.presentation.answers).toMatchObject({
      readoutUsesNestedObservation: true,
      readoutUsesOrderedAxis: true,
      additionalReadouts: [
        expect.objectContaining({
          label: "Target / reference",
          usesNestedObservation: false,
          usesOrderedAxis: true,
        }),
      ],
    });

    const inconsistentAnswers = createBiologicalSetupPresentation({
      ...original,
      answers: { ...original.answers, identityLabel: "Different identity" },
    });
    expect(inconsistentAnswers.status).toBe("stopped");

    const inconsistentCanvas = createBiologicalSetupPresentation({
      ...original,
      conditionCombinations: original.conditionCombinations.map((combination, index) =>
        index === 0 ? { ...combination, displayLabel: "Wrong display" } : combination,
      ),
    });
    expect(inconsistentCanvas.status).toBe("stopped");
  });

  it("round-trips the full current Setup result without losing block order or semantics", () => {
    const original = fullSetupResult();
    const adapted = createBiologicalSetupPrefill(original);

    expect(adapted.status).toBe("ready");
    if (adapted.status !== "ready") return;
    const { prefill } = adapted;
    expect(prefill).toMatchObject({
      title: "Paired donor experiment",
      experimentDescription: original.contract.experimentDescription,
      measurementLabel: "Intensity",
      valueForm: "single",
      measurementUsesNestedObservation: true,
      measurementUsesOrderedAxis: true,
      receiverLabel: "Dish",
      receiverIdLabel: "Dish stable ID",
      relationship: "shared_source",
      sourceLabel: "Donor",
      sourceIdLabel: "Donor stable ID",
      sharedSourcePairedBlockId: "condition-block.2",
      childLabel: "Cell",
      orderedAxis: { label: "Time", unit: "h", levels: [0, 24], sameIdentity: true },
    });
    expect(prefill.additionalReadouts).toEqual([
      {
        id: "readout.additional.1",
        label: "Target / reference",
        valueForm: "target_reference",
        usesNestedObservation: false,
        usesOrderedAxis: true,
      },
    ]);
    expect(prefill.conditionBlocks).toEqual(original.conditionBlocks);

    const combinations = buildConditionCombinations(prefill.conditionBlocks);
    const rebuilt = safelyBuildBiologicalSetup({
      title: prefill.title,
      measurementLabel: prefill.measurementLabel,
      valueForm: prefill.valueForm,
      measurementUsesNestedObservation: prefill.measurementUsesNestedObservation,
      measurementUsesOrderedAxis: prefill.measurementUsesOrderedAxis,
      additionalReadouts: prefill.additionalReadouts,
      blocks: prefill.conditionBlocks,
      combinations,
      statuses: prefill.statuses,
      receiverLabel: prefill.receiverLabel,
      receiverIdLabel: prefill.receiverIdLabel,
      relationship: prefill.relationship,
      sourceLabel: prefill.sourceLabel,
      sourceIdLabel: prefill.sourceIdLabel,
      sharedSourcePairedBlockId: prefill.sharedSourcePairedBlockId,
      childLabel: prefill.childLabel,
      orderedAxis: prefill.orderedAxis,
    });
    expect(rebuilt.status).toBe("ready");
    if (rebuilt.status !== "ready") return;
    expect(rebuilt.result.contract).toEqual(prefill.originalContract);
  });

  it("builds a complete contract-only prefill and does not invent presentation groups", () => {
    const contract = buildStructureContract({
      experimentName: "Count experiment",
      experimentDescription: "Treatmentを組み合わせ、Positive cells、Ratioを測定",
      experimentalUnitLabel: "Well",
      identityLabel: "Well ID",
      readoutLabel: "Positive cells",
      readoutRepresentation: "proportion_counts",
      additionalReadouts: [{ label: "Ratio", representation: "target_reference" }],
      factorName: "Treatment",
      factorLevels: ["Control", "Drug"],
      sameIdentityAcrossConditions: false,
    });

    const adapted = createBiologicalSetupPrefill(contract);
    expect(adapted.status).toBe("ready");
    if (adapted.status !== "ready") return;
    expect(adapted.prefill.valueForm).toBe("positive_total");
    expect(adapted.prefill.additionalReadouts[0]?.valueForm).toBe("target_reference");
    expect(adapted.prefill.conditionBlocks[0]).toMatchObject({
      id: "condition-block.1",
      name: "Treatment",
      showGroups: false,
      groupLabels: ["", "", "", "", ""],
    });
    expect(adapted.prefill.conditionBlocks[0]?.values[0]).toEqual(["Control", "Drug", "", "", ""]);
  });

  it("retains an aggregate-only child fact from a Setup result but never invents it from a contract", () => {
    const blocks = [block("condition-block.1", "Treatment", ["Control", "Drug"])];
    const built = safelyBuildBiologicalSetup({
      title: "Aggregate records",
      measurementLabel: "Positive count",
      valueForm: "positive_total",
      blocks,
      combinations: buildConditionCombinations(blocks),
      statuses: {},
      receiverLabel: "Well",
      receiverIdLabel: "Well ID",
      relationship: "separate",
      sourceLabel: "",
      sourceIdLabel: "",
      childLabel: "Cell",
    });
    if (built.status !== "ready") throw new Error(built.reason);

    const fromResult = createBiologicalSetupPrefill(built.result);
    const fromContract = createBiologicalSetupPrefill(built.result.contract);
    expect(fromResult.status).toBe("ready");
    expect(fromContract.status).toBe("ready");
    if (fromResult.status !== "ready" || fromContract.status !== "ready") return;
    expect(fromResult.prefill.childLabel).toBe("Cell");
    expect(fromContract.prefill.childLabel).toBe("");
  });

  it("safe-stops readout, matching, and empty-axis profiles the Setup cannot produce", () => {
    const unsupportedReadout = buildStructureContract({
      experimentName: "Paired values",
      experimentDescription: "unsupported",
      experimentalUnitLabel: "Dish",
      identityLabel: "Dish ID",
      readoutLabel: "XY",
      readoutRepresentation: "paired_readouts",
      factorName: "Condition",
      factorLevels: ["A", "B"],
      sameIdentityAcrossConditions: false,
    });
    const mixed = buildStructureContract({
      experimentName: "Mixed",
      experimentDescription: "unsupported",
      experimentalUnitLabel: "Dish",
      identityLabel: "Dish ID",
      readoutLabel: "Response",
      readoutRepresentation: "scalar",
      factorName: "Period",
      factorLevels: ["Before", "After"],
      additionalFactors: [
        { name: "Treatment", levels: ["A", "B"], sameIdentityAcrossConditions: false },
      ],
      sameIdentityAcrossConditions: true,
    });
    const emptyAxis = buildStructureContract({
      experimentName: "Empty axis",
      experimentDescription: "unsupported",
      experimentalUnitLabel: "Dish",
      identityLabel: "Dish ID",
      readoutLabel: "Response",
      readoutRepresentation: "scalar",
      factorName: "Condition",
      factorLevels: ["A", "B"],
      sameIdentityAcrossConditions: false,
      orderedAxis: { label: "Time", unit: "h", levels: [], sameIdentity: false },
    });

    expect(createBiologicalSetupPrefill(unsupportedReadout)).toMatchObject({
      status: "stopped",
      code: "UNSUPPORTED_READOUT_REPRESENTATION",
    });
    expect(createBiologicalSetupPrefill(mixed)).toMatchObject({
      status: "stopped",
      code: "UNSUPPORTED_MATCHING_PROFILE",
    });
    expect(createBiologicalSetupPrefill(emptyAxis)).toMatchObject({
      status: "stopped",
      code: "UNSUPPORTED_ORDERED_AXIS_PROFILE",
    });
  });
});

describe("checkAdaptiveStructureRevisionCompatibility", () => {
  it("allows display edits and additions/removals of levels unused by rows or mapping", () => {
    const previousContract = baseContract();
    const nextContract = StructureContractSchema.parse({
      ...previousContract,
      contractId: "contract.renamed",
      experimentName: "Renamed experiment",
      experimentDescription: "Updated description",
      unitLevels: previousContract.unitLevels.map((level) => ({
        ...level,
        label: level.key === previousContract.experimentalUnitLevelKey ? "DISH" : level.label,
      })),
      identities: previousContract.identities.map((identity) => ({
        ...identity,
        label: "DISH ID",
      })),
      factors: previousContract.factors.map((factor) => ({
        ...factor,
        label: "CONDITION",
        levels: ["Control", "Drug", "New"],
      })),
      orderedAxes: previousContract.orderedAxes.map((axis) => ({
        ...axis,
        label: "TIME",
        levels: [0, 24, 72],
      })),
      readouts: previousContract.readouts.map((readout) => ({
        ...readout,
        label: "RESPONSE",
      })),
    });
    const before = JSON.stringify({ previousContract, rows: observations(previousContract) });

    expect(
      checkAdaptiveStructureRevisionCompatibility({
        previousContract,
        nextContract,
        canonicalObservations: observations(previousContract),
      }),
    ).toEqual({ status: "compatible" });
    expect(JSON.stringify({ previousContract, rows: observations(previousContract) })).toBe(before);
  });

  it("rejects deletion of an observed factor level", () => {
    const previousContract = baseContract();
    const nextContract = StructureContractSchema.parse({
      ...previousContract,
      factors: previousContract.factors.map((factor) => ({
        ...factor,
        levels: ["Drug", "Unused"],
        referenceLevel: null,
      })),
    });

    expect(
      checkAdaptiveStructureRevisionCompatibility({
        previousContract,
        nextContract,
        canonicalObservations: observations(previousContract),
      }),
    ).toMatchObject({ status: "stopped", code: "OBSERVED_FACTOR_LEVEL_REMOVED" });
  });

  it("rejects deletion of an observed axis level", () => {
    const previousContract = baseContract();
    const nextContract = StructureContractSchema.parse({
      ...previousContract,
      orderedAxes: previousContract.orderedAxes.map((axis) => ({
        ...axis,
        levels: [24, 48],
      })),
    });

    expect(
      checkAdaptiveStructureRevisionCompatibility({
        previousContract,
        nextContract,
        canonicalObservations: observations(previousContract),
      }),
    ).toMatchObject({ status: "stopped", code: "OBSERVED_AXIS_LEVEL_REMOVED" });
  });

  it("rejects a removed level that remains fixed in the retained raw-column mapping", () => {
    const previousContract = baseContract();
    const factor = previousContract.factors[0]!;
    const axis = previousContract.orderedAxes[0]!;
    const readout = previousContract.readouts[0]!;
    const nextContract = StructureContractSchema.parse({
      ...previousContract,
      factors: [{ ...factor, levels: ["Control", "Drug"] }],
      orderedAxes: [{ ...axis, levels: [0, 24] }],
    });
    const mapping = AdaptiveColumnMappingSchema.parse({
      schemaVersion: "0.1.0",
      sourceLabel: "clipboard",
      delimiter: "tab",
      headerRow: 1,
      confirmedAt: "2026-08-28T00:00:00.000Z",
      columns: {
        Unused: {
          role: "value",
          semanticKey: readout.key,
          fixedFactors: { [factor.key]: "Unused" },
          fixedAxes: { [axis.key]: 48 },
        },
      },
    });

    expect(
      checkAdaptiveStructureRevisionCompatibility({
        previousContract,
        nextContract,
        canonicalObservations: observations(previousContract),
        mapping,
      }),
    ).toMatchObject({ status: "stopped", code: "MAPPING_SEMANTIC_KEY_INVALID" });
  });

  it("rejects relationship, nesting, representation, and axis-retention changes", () => {
    const previousContract = baseContract();
    const factorRelationship = StructureContractSchema.parse({
      ...previousContract,
      factors: previousContract.factors.map((factor) => ({
        ...factor,
        unitRole: "within_unit",
        relationship: "repeated",
      })),
    });
    const nested = buildStructureContract({
      experimentName: previousContract.experimentName,
      experimentDescription: previousContract.experimentDescription,
      experimentalUnitLabel: "Dish",
      identityLabel: "Dish ID",
      readoutLabel: "Response",
      readoutRepresentation: "scalar",
      factorName: "Condition",
      factorLevels: ["Control", "Drug", "Unused"],
      sameIdentityAcrossConditions: false,
      nestedObservationLabel: "Cell",
      orderedAxis: {
        label: "Time",
        unit: "h",
        levels: [0, 24, 48],
        sameIdentity: false,
      },
    });
    const representation = buildStructureContract({
      experimentName: previousContract.experimentName,
      experimentDescription: previousContract.experimentDescription,
      experimentalUnitLabel: "Dish",
      identityLabel: "Dish ID",
      readoutLabel: "Response",
      readoutRepresentation: "proportion_counts",
      factorName: "Condition",
      factorLevels: ["Control", "Drug", "Unused"],
      sameIdentityAcrossConditions: false,
      orderedAxis: {
        label: "Time",
        unit: "h",
        levels: [0, 24, 48],
        sameIdentity: false,
      },
    });
    const axisRetention = StructureContractSchema.parse({
      ...previousContract,
      orderedAxes: previousContract.orderedAxes.map((axis) => ({
        ...axis,
        sampling: "repeated_same_identity",
        identityRetained: true,
      })),
    });

    const assess = (nextContract: StructureContract) =>
      checkAdaptiveStructureRevisionCompatibility({
        previousContract,
        nextContract,
        canonicalObservations: observations(previousContract),
      });
    expect(assess(factorRelationship)).toMatchObject({
      status: "stopped",
      code: "FACTOR_RELATIONSHIP_CHANGED",
    });
    expect(assess(nested)).toMatchObject({ status: "stopped", code: "NESTING_CHANGED" });
    expect(assess(representation)).toMatchObject({
      status: "stopped",
      code: "READOUT_REPRESENTATION_CHANGED",
    });
    expect(assess(axisRetention)).toMatchObject({
      status: "stopped",
      code: "AXIS_RETENTION_CHANGED",
    });
  });

  it("rejects independent-to-matched identity reassignment", () => {
    const previousContract = baseContract();
    const matched = StructureContractSchema.parse({
      ...previousContract,
      matching: {
        kind: "matched",
        identityKey: previousContract.identities[0]!.key,
        completeSetsRequired: true,
      },
    });

    expect(
      checkAdaptiveStructureRevisionCompatibility({
        previousContract,
        nextContract: matched,
        canonicalObservations: observations(previousContract),
      }),
    ).toMatchObject({ status: "stopped", code: "MATCHING_CHANGED" });
  });

  it("rejects factor, readout, and axis semantic-key changes", () => {
    const previousContract = baseContract();
    const factorKey = StructureContractSchema.parse({
      ...previousContract,
      factors: previousContract.factors.map((factor) => ({ ...factor, key: "group" })),
    });
    const readoutKey = StructureContractSchema.parse({
      ...previousContract,
      readouts: previousContract.readouts.map((readout) => ({ ...readout, key: "signal" })),
    });
    const axisKey = StructureContractSchema.parse({
      ...previousContract,
      orderedAxes: previousContract.orderedAxes.map((axis) => ({ ...axis, key: "elapsed" })),
      readouts: previousContract.readouts.map((readout) => ({
        ...readout,
        axisKeys: ["elapsed"],
      })),
    });
    const assess = (nextContract: StructureContract) =>
      checkAdaptiveStructureRevisionCompatibility({
        previousContract,
        nextContract,
        canonicalObservations: observations(previousContract),
      });

    expect(assess(factorKey)).toMatchObject({ status: "stopped", code: "FACTOR_KEYS_CHANGED" });
    expect(assess(readoutKey)).toMatchObject({ status: "stopped", code: "READOUT_KEYS_CHANGED" });
    expect(assess(axisKey)).toMatchObject({ status: "stopped", code: "AXIS_KEYS_CHANGED" });
  });

  it("rejects a malformed retained snapshot across identity, hierarchy, typed values, and missingness", () => {
    const contract = buildStructureContract({
      experimentName: "Typed canonical validation",
      experimentDescription: "validate retained rows",
      experimentalUnitLabel: "Well",
      identityLabel: "Well ID",
      readoutLabel: "Fraction",
      readoutRepresentation: "proportion_counts",
      factorName: "Treatment",
      factorLevels: ["Control", "Drug"],
      sameIdentityAcrossConditions: false,
    });
    const identityKey = contract.identities[0]!.key;
    const unitKey = contract.experimentalUnitLevelKey;
    const factorKey = contract.factors[0]!.key;
    const readout = contract.readouts[0]!;
    const numeratorKey = `${readout.key}_${readout.componentKeys[0]!}`;
    const denominatorKey = `${readout.key}_${readout.componentKeys[1]!}`;
    const valid: CanonicalAdaptiveObservation = {
      observationId: "typed.valid",
      readoutKey: readout.key,
      identities: { [identityKey]: "well-1" },
      factors: { [factorKey]: "Control" },
      axes: {},
      hierarchy: { [unitKey]: "well-1" },
      values: { [numeratorKey]: 5, [denominatorKey]: 10 },
      missingness: {},
      sourceRow: 2,
    };
    const assess = (row: CanonicalAdaptiveObservation, rowContract: StructureContract = contract) =>
      checkAdaptiveStructureRevisionCompatibility({
        previousContract: rowContract,
        nextContract: rowContract,
        canonicalObservations: [row],
      });

    expect(assess(valid)).toEqual({ status: "compatible" });
    const malformed: readonly Readonly<{
      label: string;
      row: CanonicalAdaptiveObservation;
    }>[] = [
      {
        label: "unknown identity key",
        row: { ...valid, identities: { ...valid.identities, rogue_identity: "rogue" } },
      },
      { label: "missing required identity", row: { ...valid, identities: {} } },
      {
        label: "unknown hierarchy key",
        row: { ...valid, hierarchy: { ...valid.hierarchy, rogue_level: "rogue" } },
      },
      {
        label: "empty hierarchy value",
        row: { ...valid, hierarchy: { [unitKey]: "" } },
      },
      {
        label: "unknown and incorrectly typed value",
        row: {
          ...valid,
          values: { [numeratorKey]: "five", [denominatorKey]: 10, rogue_value: 5 },
        },
      },
      {
        label: "missingness with no matching value key",
        row: { ...valid, missingness: { rogue_value: "unknown" } },
      },
    ];
    malformed.forEach(({ label, row }) => {
      const result = assess(row);
      expect(result, label).toMatchObject({
        status: "stopped",
        code: "CANONICAL_OBSERVATIONS_INVALID",
      });
      if (result.status === "stopped") {
        expect(result.diagnostics?.some((diagnostic) => diagnostic.startsWith("previous:"))).toBe(
          true,
        );
      }
    });

    const restrictedMissingness = StructureContractSchema.parse({
      ...contract,
      allowedMissingness: ["unknown"],
    });
    expect(
      assess(
        {
          ...valid,
          values: { [numeratorKey]: null, [denominatorKey]: 10 },
          missingness: { [numeratorKey]: "censored" },
        },
        restrictedMissingness,
      ),
    ).toMatchObject({
      status: "stopped",
      code: "CANONICAL_OBSERVATIONS_INVALID",
    });
  });
});

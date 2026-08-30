import { describe, expect, it, vi } from "vitest";

import { StructureContractSchema, type StructureContract } from "@lsaa/domain";

import {
  buildAdaptiveRecordEntryObservation,
  createEmptyAdaptiveRecordEntryDraft,
  recordEntryIdentityFields,
  recordEntryHierarchyFields,
  type AdaptiveRecordEntryDraft,
} from "./adaptiveRecordEntry";

function makeContract(overrides: Partial<StructureContract> = {}): StructureContract {
  return StructureContractSchema.parse({
    schemaVersion: "0.1.0",
    contractId: "record-entry.fixture",
    experimentName: "Record entry fixture",
    experimentDescription: "A contract used to exercise generic record entry.",
    unitLevels: [
      {
        key: "unit",
        label: "Culture dish",
        role: "experimental_unit",
        parentKey: null,
      },
    ],
    experimentalUnitLevelKey: "unit",
    identities: [
      {
        key: "unit_id",
        label: "Dish ID",
        unitLevelKey: "unit",
        required: true,
      },
    ],
    factors: [
      {
        key: "condition",
        label: "Condition",
        levels: ["control", "drug"],
        unitRole: "between_unit",
        relationship: "independent",
        ordered: false,
        referenceLevel: "control",
      },
    ],
    matching: {
      kind: "independent",
      identityKey: null,
      completeSetsRequired: null,
    },
    orderedAxes: [],
    readouts: [
      {
        key: "signal",
        label: "Signal",
        valueType: "scalar",
        representation: "scalar",
        componentKeys: ["value"],
        referenceRole: "none",
        observationLevelKey: "unit",
        axisKeys: [],
      },
    ],
    allowedMissingness: ["unknown", "not_collected", "assay_failed"],
    rawObservationGrain: "one culture dish observation",
    ...overrides,
  });
}

type DraftPatch = Readonly<{
  readoutKey?: string;
  identities?: Readonly<Record<string, string>>;
  factors?: Readonly<Record<string, string>>;
  axes?: Readonly<Record<string, string>>;
  hierarchy?: Readonly<Record<string, string>>;
  values?: Readonly<Record<string, string>>;
  missingness?: AdaptiveRecordEntryDraft["missingness"];
}>;

function draftFor(
  contract: StructureContract,
  patch: DraftPatch = {},
): AdaptiveRecordEntryDraft {
  const empty = createEmptyAdaptiveRecordEntryDraft(contract, patch.readoutKey);
  return {
    ...empty,
    ...patch,
    identities: { ...empty.identities, ...patch.identities },
    factors: { ...empty.factors, ...patch.factors },
    axes: { ...empty.axes, ...patch.axes },
    hierarchy: { ...empty.hierarchy, ...patch.hierarchy },
    values: { ...empty.values, ...patch.values },
    missingness: { ...empty.missingness, ...patch.missingness },
  };
}

function nextId({ ordinal }: { ordinal: number }): string {
  return `record.${ordinal}`;
}

function add(
  contract: StructureContract,
  draft: AdaptiveRecordEntryDraft,
  observations: Parameters<typeof buildAdaptiveRecordEntryObservation>[0]["observations"] = [],
) {
  return buildAdaptiveRecordEntryObservation({
    contract,
    observations,
    draft,
    nextObservationId: nextId,
    ordinal: observations.length + 1,
  });
}

describe("generic adaptive record entry", () => {
  it("creates a first ordered-axis record without hiding identity or time", () => {
    const contract = makeContract({
      orderedAxes: [
        {
          key: "time",
          label: "Time",
          unit: "hour",
          levels: [0, 24, 48],
          sampling: "repeated_same_identity",
          identityRetained: true,
        },
      ],
      readouts: [
        {
          key: "signal",
          label: "Signal",
          valueType: "scalar",
          representation: "scalar",
          componentKeys: ["value"],
          referenceRole: "none",
          observationLevelKey: "unit",
          axisKeys: ["time"],
        },
      ],
    });
    const draft = draftFor(contract, {
      identities: { unit_id: "dish-01" },
      factors: { condition: "drug" },
      axes: { time: "24" },
      values: { signal: "3.5" },
    });

    const observation = add(contract, draft);

    expect(observation.identities).toEqual({ unit_id: "dish-01" });
    expect(observation.hierarchy).toEqual({ unit: "dish-01" });
    expect(observation.axes).toEqual({ time: 24 });
    expect(observation.factors).toEqual({ condition: "drug" });
    expect(observation.values).toEqual({ signal: 3.5 });
  });

  it("creates a nested child record with parent and child identities intact", () => {
    const contract = makeContract({
      unitLevels: [
        {
          key: "dish",
          label: "Culture dish",
          role: "experimental_unit",
          parentKey: null,
        },
        {
          key: "cell",
          label: "Cell",
          role: "subsample",
          parentKey: "dish",
        },
      ],
      experimentalUnitLevelKey: "dish",
      identities: [
        { key: "dish_id", label: "Dish ID", unitLevelKey: "dish", required: true },
        { key: "cell_id", label: "Cell ID", unitLevelKey: "cell", required: true },
      ],
      readouts: [
        {
          key: "signal",
          label: "Cell signal",
          valueType: "scalar",
          representation: "scalar",
          componentKeys: ["value"],
          referenceRole: "none",
          observationLevelKey: "cell",
          axisKeys: [],
        },
      ],
      rawObservationGrain: "one cell observation",
    });

    expect(recordEntryHierarchyFields(contract, "signal")).toEqual([]);
    expect(recordEntryIdentityFields(contract, "signal").map(({ key }) => key)).toEqual([
      "dish_id",
      "cell_id",
    ]);
    const observation = add(
      contract,
      draftFor(contract, {
        identities: { dish_id: "dish-01", cell_id: "cell-07" },
        factors: { condition: "control" },
        values: { signal: "7" },
      }),
    );

    expect(observation.identities).toEqual({ dish_id: "dish-01", cell_id: "cell-07" });
    expect(observation.hierarchy).toEqual({ cell: "cell-07", dish: "dish-01" });
    expect(observation.values).toEqual({ signal: 7 });
  });

  it("keeps a matched/repeated condition tied to the entered identity", () => {
    const contract = makeContract({
      factors: [
        {
          key: "condition",
          label: "Condition",
          levels: ["control", "drug"],
          unitRole: "within_unit",
          relationship: "repeated",
          ordered: false,
          referenceLevel: "control",
        },
      ],
      matching: { kind: "matched", identityKey: "unit_id", completeSetsRequired: true },
    });
    const observation = add(
      contract,
      draftFor(contract, {
        identities: { unit_id: "dish-paired-01" },
        factors: { condition: "drug" },
        values: { signal: "2" },
      }),
    );

    expect(observation.identities.unit_id).toBe("dish-paired-01");
    expect(observation.factors.condition).toBe("drug");
    expect(observation.hierarchy.unit).toBe("dish-paired-01");
  });

  it("selects one of multiple readouts while retaining its canonical address", () => {
    const contract = makeContract({
      readouts: [
        {
          key: "signal",
          label: "Signal",
          valueType: "scalar",
          representation: "scalar",
          componentKeys: ["value"],
          referenceRole: "none",
          observationLevelKey: "unit",
          axisKeys: [],
        },
        {
          key: "viability",
          label: "Viability",
          valueType: "scalar",
          representation: "scalar",
          componentKeys: ["value"],
          referenceRole: "none",
          observationLevelKey: "unit",
          axisKeys: [],
        },
      ],
    });
    const empty = createEmptyAdaptiveRecordEntryDraft(contract);
    expect(empty.readoutKey).toBe("");
    const observation = add(
      contract,
      draftFor(contract, {
        readoutKey: "viability",
        identities: { unit_id: "dish-02" },
        factors: { condition: "control" },
        values: { viability: "0.91" },
      }),
    );

    expect(observation.readoutKey).toBe("viability");
    expect(observation.values).toEqual({ viability: 0.91 });
  });

  it("accepts an explicitly missing component and preserves the reason", () => {
    const contract = makeContract();
    const observation = add(
      contract,
      draftFor(contract, {
        identities: { unit_id: "dish-missing" },
        factors: { condition: "control" },
        missingness: { signal: "not_collected" },
      }),
    );

    expect(observation.values).toEqual({ signal: null });
    expect(observation.missingness).toEqual({ signal: "not_collected" });
  });

  it("rejects duplicate coordinates atomically without changing the source rows", () => {
    const contract = makeContract();
    const draft = draftFor(contract, {
      identities: { unit_id: "dish-duplicate" },
      factors: { condition: "control" },
      values: { signal: "1" },
    });
    const first = add(contract, draft);
    const observations = [first];
    const nextObservationId = vi.fn(nextId);

    expect(() =>
      buildAdaptiveRecordEntryObservation({
        contract,
        observations,
        draft,
        nextObservationId,
        ordinal: 2,
      }),
    ).toThrow(/duplicate_semantic_coordinate/iu);
    expect(observations).toEqual([first]);
    expect(nextObservationId).toHaveBeenCalledTimes(1);
  });

  it("rejects a duplicate generated observation ID before publishing", () => {
    const contract = makeContract();
    const first = add(
      contract,
      draftFor(contract, {
        identities: { unit_id: "dish-id-01" },
        factors: { condition: "control" },
        values: { signal: "1" },
      }),
    );
    const observations = [first];

    expect(() =>
      buildAdaptiveRecordEntryObservation({
        contract,
        observations,
        draft: draftFor(contract, {
          identities: { unit_id: "dish-id-02" },
          factors: { condition: "drug" },
          values: { signal: "2" },
        }),
        nextObservationId: () => first.observationId,
        ordinal: 2,
      }),
    ).toThrow("新しい記録IDが重複しています。");
    expect(observations).toEqual([first]);
  });

  it("rejects invalid typed counts before publishing a row", () => {
    const contract = makeContract({
      readouts: [
        {
          key: "rate",
          label: "Positive rate",
          valueType: "proportion_counts",
          representation: "proportion_counts",
          componentKeys: ["positive", "total"],
          referenceRole: "none",
          observationLevelKey: "unit",
          axisKeys: [],
        },
      ],
    });
    const draft = draftFor(contract, {
      identities: { unit_id: "dish-invalid" },
      factors: { condition: "drug" },
      values: { rate_positive: "8", rate_total: "5" },
    });

    expect(() => add(contract, draft)).toThrow("該当数は総数以下にしてください。");
  });

  it("parses target and reference channels as numeric values even when valueType is assay-specific", () => {
    const contract = makeContract({
      readouts: [
        {
          key: "perk",
          label: "pERK",
          valueType: "western_blot_target_reference",
          representation: "target_reference",
          componentKeys: ["target", "reference"],
          referenceRole: "loading_control",
          observationLevelKey: "unit",
          axisKeys: [],
        },
      ],
    });

    const observation = add(
      contract,
      draftFor(contract, {
        identities: { unit_id: "lane-01" },
        factors: { condition: "control" },
        values: { perk_target: "128.5", perk_reference: "96" },
      }),
    );

    expect(observation.values).toEqual({ perk_target: 128.5, perk_reference: 96 });
  });
});

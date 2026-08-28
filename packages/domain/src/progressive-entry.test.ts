import { describe, expect, it } from "vitest";

import { StructureContractSchema, type StructureContract } from "./adaptive-input";
import {
  EXPERIMENT_CANVAS_SCHEMA_VERSION,
  ExperimentCanvasSchema,
  OBSERVATION_PATTERN_SET_SCHEMA_VERSION,
  ObservationPatternSetSchema,
  PROGRESSIVE_ENTRY_SNAPSHOT_SCHEMA_VERSION,
  ProgressiveEntrySnapshotSchema,
  createProgressiveEntrySnapshot,
  parseProgressiveEntrySnapshot,
  serializeProgressiveEntrySnapshot,
  type ExperimentCanvas,
  type ObservationPatternSet,
  type StagedObservationRecord,
} from "./progressive-entry";

const now = "2026-08-28T05:30:00.000Z";

function sparseCanvas(): ExperimentCanvas {
  const siRnaValues = [
    { key: "control", label: "Control", parentValueKey: null, groupKey: null },
    { key: "gene_a_1", label: "#1", parentValueKey: null, groupKey: "gene_a" },
    { key: "gene_a_2", label: "#2", parentValueKey: null, groupKey: "gene_a" },
    { key: "gene_a_3", label: "#3", parentValueKey: null, groupKey: "gene_a" },
    { key: "gene_b_1", label: "#1", parentValueKey: null, groupKey: "gene_b" },
    { key: "gene_b_2", label: "#2", parentValueKey: null, groupKey: "gene_b" },
    { key: "gene_b_3", label: "#3", parentValueKey: null, groupKey: "gene_b" },
  ];
  const conditionCells = siRnaValues.flatMap((siRna) =>
    ["minus", "plus"].map((dox) => ({
      conditionCellId: `cell.${siRna.key}.${dox}`,
      values: { sirna: siRna.key, dox },
      status:
        siRna.key === "control" && dox === "plus"
          ? ("not_performed" as const)
          : ("performed" as const),
    })),
  );
  return ExperimentCanvasSchema.parse({
    schemaVersion: EXPERIMENT_CANVAS_SCHEMA_VERSION,
    canvasId: "canvas.sirna_dox",
    experimentLabel: "siRNAとDoxによるciliation実験",
    dimensions: [
      {
        key: "sirna",
        label: "siRNA",
        kind: "intervention",
        groups: [
          { key: "gene_a", label: "Gene A" },
          { key: "gene_b", label: "Gene B" },
        ],
        values: siRnaValues,
      },
      {
        key: "dox",
        label: "Dox",
        kind: "intervention",
        groups: [],
        values: [
          { key: "minus", label: "−", parentValueKey: null, groupKey: null },
          { key: "plus", label: "+", parentValueKey: null, groupKey: null },
        ],
      },
    ],
    conditionCells,
    readouts: [
      {
        key: "viability",
        label: "Dish viability",
        representation: "scalar",
        componentKeys: ["value"],
      },
      {
        key: "cell_area",
        label: "Cell area",
        representation: "scalar",
        componentKeys: ["value"],
      },
    ],
  });
}

function mixedGrainPattern(canvas = sparseCanvas()): ObservationPatternSet {
  return ObservationPatternSetSchema.parse({
    schemaVersion: OBSERVATION_PATTERN_SET_SCHEMA_VERSION,
    patternSetId: "pattern.sirna_dox",
    canvasId: canvas.canvasId,
    levels: [
      {
        key: "dish",
        label: "Culture dish",
        kind: "biological_or_experimental_entity",
        parentKey: null,
        plannedMultiplicity: { mode: "from_input" },
      },
      {
        key: "cell",
        label: "Cell",
        kind: "observed_entity",
        parentKey: "dish",
        plannedMultiplicity: { mode: "variable", suggestedCount: null },
      },
    ],
    identities: [
      {
        key: "dish_id",
        label: "Dish ID",
        levelKey: "dish",
        uniquenessScopeLevelKey: null,
        purpose: "both",
        availability: "available",
        origin: "researcher_supplied",
      },
      {
        key: "cell_id",
        label: "Cell ID",
        levelKey: "cell",
        uniquenessScopeLevelKey: "dish",
        purpose: "instance_key",
        availability: "to_be_collected",
        origin: "app_assigned_before_entry",
      },
    ],
    axes: [],
    recordSets: [
      {
        key: "dish_records",
        label: "One dish-level value",
        observedLevelKey: "dish",
        axisUses: [],
        coordinatePlan: "sparse_explicit",
        recordGrain: "one record per culture dish",
        entryAlignment: { mode: "separate_lists", identityKey: null, completeSets: null },
      },
      {
        key: "cell_records",
        label: "Individual Cell observations",
        observedLevelKey: "cell",
        axisUses: [],
        coordinatePlan: "sparse_explicit",
        recordGrain: "one record per Cell within a dish",
        entryAlignment: { mode: "separate_lists", identityKey: null, completeSets: null },
      },
    ],
    readoutBindings: canvas.readouts.flatMap((readout) =>
      canvas.conditionCells.map((cell) => ({
        readoutKey: readout.key,
        conditionCellId: cell.conditionCellId,
        componentKeys: readout.componentKeys,
        status: cell.status === "performed" ? "measured" : "not_measured",
        recordSetKey:
          cell.status !== "performed"
            ? null
            : readout.key === "viability"
              ? "dish_records"
              : "cell_records",
      })),
    ),
  });
}

function contractForDoxOnly(): StructureContract {
  return StructureContractSchema.parse({
    schemaVersion: "0.1.0",
    contractId: "contract.gene_a_1_dox",
    experimentName: "Gene A #1 Dox comparison",
    experimentDescription: "Gene A #1のDox−とDox+を比較する",
    unitLevels: [
      { key: "dish", label: "Culture dish", role: "experimental_unit", parentKey: null },
    ],
    experimentalUnitLevelKey: "dish",
    identities: [
      { key: "dish_id", label: "Dish ID", unitLevelKey: "dish", required: true },
    ],
    factors: [
      {
        key: "dox",
        label: "Dox",
        levels: ["minus", "plus"],
        unitRole: "between_unit",
        relationship: "independent",
        ordered: false,
        referenceLevel: "minus",
      },
    ],
    matching: { kind: "independent", identityKey: null, completeSetsRequired: null },
    orderedAxes: [],
    readouts: [
      {
        key: "viability",
        label: "Dish viability",
        valueType: "scalar",
        representation: "scalar",
        componentKeys: ["value"],
        referenceRole: "none",
        observationLevelKey: "dish",
        axisKeys: [],
      },
    ],
    allowedMissingness: ["not_collected", "unknown"],
    rawObservationGrain: "one record per culture dish",
  });
}

function stagedRecord(input: {
  recordId: string;
  conditionCellId: string;
  readoutKey: "viability" | "cell_area";
  recordSetKey: "dish_records" | "cell_records";
  value: number;
  mappingState?: "mapped" | "pending_mapping";
  factors?: Readonly<{ sirna: string; dox: string }>;
}): Omit<StagedObservationRecord, "eligibility"> {
  return {
    recordId: input.recordId,
    conditionCellId: input.conditionCellId,
    recordSetKey: input.recordSetKey,
    mappingState: input.mappingState ?? "mapped",
    observation: {
      observationId: `observation.${input.recordId}`,
      readoutKey: input.readoutKey,
      identities: { dish_id: `dish-${input.recordId}` },
      factors: input.factors ?? { sirna: "gene_a_1", dox: "minus" },
      axes: {},
      hierarchy: input.readoutKey === "cell_area" ? { cell: `cell-${input.recordId}` } : {},
      values: { value: input.value },
      missingness: {},
      sourceRow: null,
    },
  };
}

function snapshotInput(overrides: Record<string, unknown> = {}) {
  const canvas = sparseCanvas();
  const activePattern = mixedGrainPattern(canvas);
  return {
    snapshotId: "snapshot.sirna_dox",
    projectId: "project.sirna_dox",
    savedAt: now,
    canvas,
    activePattern,
    pendingPattern: null,
    mapping: null,
    rawLineage: {
      schemaVersion: "0.1.0" as const,
      sourceKind: "clipboard" as const,
      sourceLabel: "ImageJ export",
      capturedAt: now,
      rawText: "Dish\tCondition\tCell\tArea\nD1\tGene A #1 / Dox -\tC1\t12.4",
      sha256: null,
      transformations: ["preserved_exact_source_text"],
    },
    stagedRecords: [
      stagedRecord({
        recordId: "dish.1",
        conditionCellId: "cell.gene_a_1.minus",
        readoutKey: "viability",
        recordSetKey: "dish_records",
        value: 0.8,
      }),
      stagedRecord({
        recordId: "cell.1",
        conditionCellId: "cell.gene_a_1.minus",
        readoutKey: "cell_area",
        recordSetKey: "cell_records",
        value: 12.4,
      }),
      stagedRecord({
        recordId: "excluded.control_plus",
        conditionCellId: "cell.control.plus",
        readoutKey: "viability",
        recordSetKey: "dish_records",
        value: 0.7,
        factors: { sirna: "control", dox: "plus" },
      }),
    ],
    fullContract: null,
    scopedContracts: [],
    provenance: [
      {
        eventId: "event.canvas_created",
        occurredAt: now,
        actor: "researcher" as const,
        kind: "canvas_created" as const,
        details: { source: "guided_questions" },
      },
    ],
    ...overrides,
  };
}

describe("production progressive-entry semantic foundation", () => {
  it("retains a sparse grouped siRNA × Dox Canvas without turning group headers into conditions", () => {
    const canvas = sparseCanvas();
    expect(canvas.dimensions[0]?.groups.map(({ label }) => label)).toEqual(["Gene A", "Gene B"]);
    expect(canvas.conditionCells).toHaveLength(14);
    expect(canvas.conditionCells.find(({ conditionCellId }) => conditionCellId === "cell.control.plus")?.status).toBe(
      "not_performed",
    );
    expect(canvas.conditionCells.some(({ values }) => Object.values(values).includes("gene_a"))).toBe(false);
  });

  it("represents mixed readout grains with separate generic record sets", () => {
    const pattern = mixedGrainPattern();
    expect(pattern.recordSets.map(({ observedLevelKey }) => observedLevelKey)).toEqual([
      "dish",
      "cell",
    ]);
    expect(
      pattern.readoutBindings.find(
        ({ readoutKey, conditionCellId }) =>
          readoutKey === "viability" && conditionCellId === "cell.gene_a_1.minus",
      )?.recordSetKey,
    ).toBe("dish_records");
    expect(
      pattern.readoutBindings.find(
        ({ readoutKey, conditionCellId }) =>
          readoutKey === "cell_area" && conditionCellId === "cell.gene_a_1.minus",
      )?.recordSetKey,
    ).toBe("cell_records");
  });

  it("rejects a measured binding on a condition that was not performed", () => {
    const input = snapshotInput();
    const activePattern = structuredClone(input.activePattern);
    const binding = activePattern.readoutBindings.find(
      ({ readoutKey, conditionCellId }) =>
        readoutKey === "viability" && conditionCellId === "cell.control.plus",
    )!;
    binding.status = "measured";
    binding.recordSetKey = "dish_records";
    expect(() => createProgressiveEntrySnapshot({ ...input, activePattern })).toThrow(
      /not-performed or unresolved condition/i,
    );
  });

  it("keeps Graph ready for sparse active records while Statistics waits for a complete scope", () => {
    const snapshot = createProgressiveEntrySnapshot(snapshotInput());
    expect(snapshot.readiness).toMatchObject({
      dataRetention: { status: "READY" },
      adaptiveInput: { status: "READY" },
      graph: { status: "READY" },
      statistics: { status: "NEED_MORE_INFORMATION" },
    });
    expect(snapshot.stagedRecords.map(({ eligibility }) => eligibility)).toEqual([
      "active",
      "active",
      "excluded_condition_or_binding",
    ]);
    expect(snapshot.stagedRecords).toHaveLength(3);
  });

  it("keeps Statistics gated after scope completion until replication and comparison are validated", () => {
    const input = snapshotInput();
    const canvas = structuredClone(input.canvas);
    canvas.dimensions[0]!.groups = [];
    canvas.dimensions[0]!.values.forEach((value) => {
      value.groupKey = null;
    });
    const snapshot = createProgressiveEntrySnapshot(
      {
        ...input,
        canvas,
        stagedRecords: [
          ...input.stagedRecords,
          stagedRecord({
            recordId: "dish.2",
            conditionCellId: "cell.gene_a_1.plus",
            readoutKey: "viability",
            recordSetKey: "dish_records",
            value: 0.9,
            factors: { sirna: "gene_a_1", dox: "plus" },
          }),
        ],
        scopedContracts: [
          {
            scopeId: "scope.gene_a_1_dox",
            conditionCellIds: ["cell.gene_a_1.minus", "cell.gene_a_1.plus"],
            contract: contractForDoxOnly(),
          },
        ],
      },
    );
    expect(snapshot.readiness.statistics).toEqual({
      status: "NEED_MORE_INFORMATION",
      reasons: ["analysis_specific_replication_and_comparison_required"],
    });
    expect(snapshot.fullContract).toBeNull();
    expect(snapshot.canvas.conditionCells).toHaveLength(14);
  });

  it("does not treat an empty selected condition as Statistics-ready", () => {
    const snapshot = createProgressiveEntrySnapshot(
      snapshotInput({
        scopedContracts: [
          {
            scopeId: "scope.gene_a_1_dox",
            conditionCellIds: ["cell.gene_a_1.minus", "cell.gene_a_1.plus"],
            contract: contractForDoxOnly(),
          },
        ],
      }),
    );
    expect(snapshot.readiness.statistics).toEqual({
      status: "NEED_MORE_INFORMATION",
      reasons: ["active_record_for_each_scope_binding_required"],
    });
  });

  it("does not mark an asymmetric multi-readout scope READY when Contract 0.1 cannot express applicability", () => {
    const input = snapshotInput();
    const activePattern = structuredClone(input.activePattern);
    const intentionallyUnmeasured = activePattern.readoutBindings.find(
      ({ readoutKey, conditionCellId }) =>
        readoutKey === "cell_area" && conditionCellId === "cell.gene_a_1.plus",
    )!;
    intentionallyUnmeasured.status = "not_measured";
    intentionallyUnmeasured.recordSetKey = null;
    const contract = contractForDoxOnly();
    contract.readouts.push({
      ...contract.readouts[0]!,
      key: "cell_area",
      label: "Cell area",
    });
    const stagedRecords = [
      ...input.stagedRecords,
      stagedRecord({
        recordId: "dish.plus",
        conditionCellId: "cell.gene_a_1.plus",
        readoutKey: "viability",
        recordSetKey: "dish_records",
        value: 0.9,
        factors: { sirna: "gene_a_1", dox: "plus" },
      }),
    ];
    const conservativeStop = createProgressiveEntrySnapshot({
      ...input,
      activePattern,
      stagedRecords,
      scopedContracts: [
        {
          scopeId: "scope.asymmetric_readouts",
          conditionCellIds: ["cell.gene_a_1.minus", "cell.gene_a_1.plus"],
          contract,
        },
      ],
    });
    expect(conservativeStop.readiness.statistics).toEqual({
      status: "NEED_MORE_INFORMATION",
      reasons: ["active_record_for_each_scope_binding_required"],
    });

    const missingCellArea = createProgressiveEntrySnapshot({
      ...input,
      activePattern,
      stagedRecords: stagedRecords.filter(
        ({ observation }) => observation.readoutKey !== "cell_area",
      ),
      scopedContracts: [
        {
          scopeId: "scope.asymmetric_readouts",
          conditionCellIds: ["cell.gene_a_1.minus", "cell.gene_a_1.plus"],
          contract,
        },
      ],
    });
    expect(missingCellArea.readiness.statistics).toEqual({
      status: "NEED_MORE_INFORMATION",
      reasons: ["active_record_for_each_scope_binding_required"],
    });
  });

  it("limits identity safety checks to record sets selected by the Statistics scope", () => {
    const input = snapshotInput();
    const activePattern = structuredClone(input.activePattern);
    const cellIdentity = activePattern.identities.find(({ key }) => key === "cell_id")!;
    cellIdentity.availability = "irrecoverable";
    cellIdentity.purpose = "both";
    const cellRecords = activePattern.recordSets.find(({ key }) => key === "cell_records")!;
    cellRecords.entryAlignment = {
      mode: "shared_linkage",
      identityKey: "cell_id",
      completeSets: true,
    };
    const plusRecords = [
      stagedRecord({
        recordId: "dish.scope.plus",
        conditionCellId: "cell.gene_a_1.plus",
        readoutKey: "viability",
        recordSetKey: "dish_records",
        value: 0.9,
        factors: { sirna: "gene_a_1", dox: "plus" },
      }),
      stagedRecord({
        recordId: "cell.scope.plus",
        conditionCellId: "cell.gene_a_1.plus",
        readoutKey: "cell_area",
        recordSetKey: "cell_records",
        value: 13.1,
        factors: { sirna: "gene_a_1", dox: "plus" },
      }),
    ];
    const viabilityScope = createProgressiveEntrySnapshot({
      ...input,
      activePattern,
      stagedRecords: [...input.stagedRecords, ...plusRecords],
      scopedContracts: [
        {
          scopeId: "scope.viability_only",
          conditionCellIds: ["cell.gene_a_1.minus", "cell.gene_a_1.plus"],
          contract: contractForDoxOnly(),
        },
      ],
    });
    expect(viabilityScope.readiness.statistics).toEqual({
      status: "NEED_MORE_INFORMATION",
      reasons: ["condition_value_grouping_requires_reviewed_scope_mapper"],
    });

    const cellAreaContract = contractForDoxOnly();
    cellAreaContract.readouts[0] = {
      ...cellAreaContract.readouts[0]!,
      key: "cell_area",
      label: "Cell area",
    };
    const unsupportedCellScope = createProgressiveEntrySnapshot({
      ...input,
      activePattern,
      stagedRecords: [...input.stagedRecords, ...plusRecords],
      scopedContracts: [
        {
          scopeId: "scope.cell_area_only",
          conditionCellIds: ["cell.gene_a_1.minus", "cell.gene_a_1.plus"],
          contract: cellAreaContract,
        },
      ],
    });
    expect(unsupportedCellScope.readiness.statistics).toEqual({
      status: "SAFE_UNSUPPORTED",
      reasons: ["scientific_linkage_identity_is_irrecoverable"],
    });
  });

  it("requires an active record inside the selected Statistics scope", () => {
    const input = snapshotInput();
    const stagedRecords = input.stagedRecords.filter(
      ({ conditionCellId }) => conditionCellId !== "cell.gene_a_1.minus",
    );
    const snapshot = createProgressiveEntrySnapshot({
      ...input,
      stagedRecords,
      scopedContracts: [
        {
          scopeId: "scope.gene_a_1_dox",
          conditionCellIds: ["cell.gene_a_1.minus", "cell.gene_a_1.plus"],
          contract: contractForDoxOnly(),
        },
      ],
    });
    expect(snapshot.readiness.graph.status).toBe("NEED_MORE_INFORMATION");
    expect(snapshot.readiness.statistics).toEqual({
      status: "NEED_MORE_INFORMATION",
      reasons: ["active_record_in_contract_scope_required"],
    });
  });

  it("does not let an unrelated complete contract masquerade as the selected Canvas scope", () => {
    const unrelated = {
      ...contractForDoxOnly(),
      factors: [
        {
          ...contractForDoxOnly().factors[0]!,
          key: "treatment",
          label: "Treatment",
        },
      ],
    };
    expect(() =>
      createProgressiveEntrySnapshot(
        snapshotInput({
          scopedContracts: [
            {
              scopeId: "scope.gene_a_1_dox",
              conditionCellIds: ["cell.gene_a_1.minus", "cell.gene_a_1.plus"],
              contract: unrelated,
            },
          ],
        }),
      ),
    ).toThrow(/does not match its Canvas condition subset/i);
  });

  it("never serializes a sparse Canvas as if a complete full StructureContract existed", () => {
    expect(() =>
      createProgressiveEntrySnapshot(
        snapshotInput({ fullContract: contractForDoxOnly(), scopedContracts: [] }),
      ),
    ).toThrow(/full StructureContract cannot replace a sparse or unresolved Canvas/i);
  });

  it("rejects an incomplete object rather than treating it as a partial StructureContract", () => {
    const invalid = snapshotInput({
      fullContract: {
        schemaVersion: "0.1.0",
        contractId: "contract.partial",
        experimentName: "Partial",
      },
    });
    expect(() => createProgressiveEntrySnapshot(invalid)).toThrow();
  });

  it("round-trips sparse statuses, staged raw records, lineage, readiness, and provenance", () => {
    const snapshot = createProgressiveEntrySnapshot(snapshotInput());
    expect(snapshot.schemaVersion).toBe(PROGRESSIVE_ENTRY_SNAPSHOT_SCHEMA_VERSION);
    const reopened = parseProgressiveEntrySnapshot(serializeProgressiveEntrySnapshot(snapshot));
    expect(reopened).toEqual(snapshot);
    expect(reopened.rawLineage?.sourceLabel).toBe("ImageJ export");
    expect(reopened.rawLineage?.rawText).toContain("D1\tGene A #1 / Dox -\tC1\t12.4");
    expect(reopened.canvas.conditionCells.find(({ conditionCellId }) => conditionCellId === "cell.control.plus")?.status).toBe(
      "not_performed",
    );
    expect(reopened.stagedRecords.find(({ recordId }) => recordId === "excluded.control_plus")?.eligibility).toBe(
      "excluded_condition_or_binding",
    );
  });

  it("rejects duplicate canonical observation IDs even when staged record IDs differ", () => {
    const input = snapshotInput();
    const stagedRecords = structuredClone(input.stagedRecords);
    stagedRecords[1]!.observation.observationId = stagedRecords[0]!.observation.observationId;
    expect(() => createProgressiveEntrySnapshot({ ...input, stagedRecords })).toThrow(
      /Staged observation IDs must be unique/,
    );
  });

  it("asks for a Statistics scope before judging an unrelated irrecoverable identity", () => {
    const input = snapshotInput();
    const activePattern = structuredClone(input.activePattern);
    activePattern.axes.push({
      key: "time",
      label: "Time",
      unit: "min",
      source: { kind: "within_condition_record" },
      kind: "ordered_quantity",
      ordering: "ordered",
      valuePlan: { mode: "fixed_global", values: [0, 30] },
    });
    activePattern.identities[0]!.availability = "irrecoverable";
    activePattern.recordSets[0]!.axisUses.push({
      axisKey: "time",
      identityBehavior: {
        kind: "same_entity",
        retainedLevelKey: "dish",
        identityKey: "dish_id",
      },
      materialContinuity: "same_material",
    });
    const snapshot = createProgressiveEntrySnapshot({ ...input, activePattern });
    expect(snapshot.readiness.graph.status).toBe("READY");
    expect(snapshot.readiness.statistics).toEqual({
      status: "NEED_MORE_INFORMATION",
      reasons: ["complete_or_scoped_contract_required"],
    });
  });

  it("keeps Graph available while an unknown material or alignment relation blocks Statistics", () => {
    const input = snapshotInput();
    const activePattern = structuredClone(input.activePattern);
    activePattern.recordSets[0]!.entryAlignment = {
      mode: "unknown",
      identityKey: null,
      completeSets: null,
    };
    const snapshot = createProgressiveEntrySnapshot({
      ...input,
      activePattern,
      scopedContracts: [
        {
          scopeId: "scope.gene_a_1_dox",
          conditionCellIds: ["cell.gene_a_1.minus", "cell.gene_a_1.plus"],
          contract: contractForDoxOnly(),
        },
      ],
    });
    expect(snapshot.readiness.graph.status).toBe("READY");
    expect(snapshot.readiness.statistics).toEqual({
      status: "NEED_MORE_INFORMATION",
      reasons: ["record_relationship_is_unknown"],
    });
  });

  it("detects stale eligibility and stale readiness on direct schema parsing", () => {
    const snapshot = createProgressiveEntrySnapshot(snapshotInput());
    const staleEligibility = structuredClone(snapshot);
    staleEligibility.stagedRecords[2]!.eligibility = "active";
    expect(() => ProgressiveEntrySnapshotSchema.parse(staleEligibility)).toThrow(
      /eligibility is stale/i,
    );
    const staleReadiness = structuredClone(snapshot);
    staleReadiness.readiness.statistics = { status: "READY", reasons: [] };
    expect(() => ProgressiveEntrySnapshotSchema.parse(staleReadiness)).toThrow(
      /readiness is stale/i,
    );
  });
});

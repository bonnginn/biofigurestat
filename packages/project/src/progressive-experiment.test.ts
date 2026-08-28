import { describe, expect, it } from "vitest";
import {
  EXPERIMENT_CANVAS_SCHEMA_VERSION,
  OBSERVATION_PATTERN_SET_SCHEMA_VERSION,
  ExperimentCanvasSchema,
  ObservationPatternSetSchema,
  createProgressiveEntrySnapshot,
  StructureContractSchema,
} from "@lsaa/domain";

import {
  decodeProjectManifest,
  encodeProjectManifest,
  type AtomicProjectWrite,
  type ProjectPackageStorage,
} from "./package-io";
import {
  ProgressiveExperimentProjectStateSchema,
  createProgressiveExperimentSetupProjectState,
  createProgressiveExperimentProjectState,
  deserializeProgressiveExperimentProjectState,
  progressiveLineageHashMatches,
  serializeProgressiveCanonicalDraft,
  serializeProgressiveExperimentProjectState,
  serializeProgressiveExperimentSetupRecovery,
  transitionProgressiveExperimentSetupToData,
} from "./progressive-experiment";
import {
  openProgressiveExperimentProjectPackage,
  openProjectStatePackage,
  saveProgressiveExperimentProjectPackage,
} from "./round-trip";

const now = "2026-08-28T06:00:00.000Z";

function fixture() {
  const canvas = ExperimentCanvasSchema.parse({
    schemaVersion: EXPERIMENT_CANVAS_SCHEMA_VERSION,
    canvasId: "canvas.sparse",
    experimentLabel: "Known sparse experiment",
    dimensions: [
      {
        key: "treatment",
        label: "Treatment",
        kind: "intervention",
        groups: [],
        values: [
          { key: "control", label: "Control", parentValueKey: null, groupKey: null },
          { key: "drug", label: "Drug", parentValueKey: null, groupKey: null },
        ],
      },
      {
        key: "stimulus",
        label: "Stimulus",
        kind: "intervention",
        groups: [],
        values: [
          { key: "minus", label: "−", parentValueKey: null, groupKey: null },
          { key: "plus", label: "+", parentValueKey: null, groupKey: null },
        ],
      },
    ],
    conditionCells: [
      {
        conditionCellId: "cell.control.minus",
        values: { treatment: "control", stimulus: "minus" },
        status: "performed",
      },
      {
        conditionCellId: "cell.control.plus",
        values: { treatment: "control", stimulus: "plus" },
        status: "not_performed",
      },
      {
        conditionCellId: "cell.drug.minus",
        values: { treatment: "drug", stimulus: "minus" },
        status: "performed",
      },
      {
        conditionCellId: "cell.drug.plus",
        values: { treatment: "drug", stimulus: "plus" },
        status: "performed",
      },
    ],
    readouts: [
      { key: "intensity", label: "Intensity", representation: "scalar", componentKeys: ["value"] },
      {
        key: "positive_rate",
        label: "Positive rate",
        representation: "proportion_counts",
        componentKeys: ["positive", "total"],
      },
    ],
  });
  const pattern = ObservationPatternSetSchema.parse({
    schemaVersion: OBSERVATION_PATTERN_SET_SCHEMA_VERSION,
    patternSetId: "pattern.sparse",
    canvasId: canvas.canvasId,
    levels: [
      {
        key: "dish",
        label: "Culture dish",
        kind: "biological_or_experimental_entity",
        parentKey: null,
        plannedMultiplicity: { mode: "from_input" },
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
    ],
    axes: [],
    recordSets: [
      {
        key: "dish_records",
        label: "Dish records",
        observedLevelKey: "dish",
        axisUses: [],
        coordinatePlan: "sparse_explicit",
        recordGrain: "one row per culture dish",
        entryAlignment: { mode: "separate_lists", identityKey: null, completeSets: null },
      },
    ],
    readoutBindings: canvas.readouts.flatMap((readout) =>
      canvas.conditionCells.map((cell) => ({
        readoutKey: readout.key,
        conditionCellId: cell.conditionCellId,
        componentKeys: readout.componentKeys,
        status: cell.status === "performed" ? "measured" : "not_measured",
        recordSetKey: cell.status === "performed" ? "dish_records" : null,
      })),
    ),
  });
  const progressiveEntry = createProgressiveEntrySnapshot({
    snapshotId: "snapshot.sparse",
    projectId: "project.sparse",
    savedAt: now,
    canvas,
    activePattern: pattern,
    pendingPattern: null,
    mapping: null,
    rawLineage: {
      schemaVersion: "0.1.0",
      sourceKind: "clipboard",
      sourceLabel: "clipboard",
      capturedAt: now,
      rawText:
        "condition_cell\treadout\tidentity\tcomponent_1\tcomponent_2\n" +
        "cell.control.minus\tintensity\tdish-1\t1.2\n" +
        "cell.drug.plus\tpositive_rate\tdish-2\t8\t10",
      sha256: null,
      transformations: ["rectangular_clipboard_to_staged_records"],
    },
    stagedRecords: [
      {
        recordId: "record.scalar.1",
        conditionCellId: "cell.control.minus",
        recordSetKey: "dish_records",
        mappingState: "mapped",
        observation: {
          observationId: "observation.scalar.1",
          readoutKey: "intensity",
          identities: { dish_id: "dish-1" },
          factors: { treatment: "control", stimulus: "minus" },
          axes: {},
          hierarchy: {},
          values: { value: 1.2 },
          missingness: {},
          sourceRow: 1,
        },
      },
      {
        recordId: "record.proportion.1",
        conditionCellId: "cell.drug.plus",
        recordSetKey: "dish_records",
        mappingState: "mapped",
        observation: {
          observationId: "observation.proportion.1",
          readoutKey: "positive_rate",
          identities: { dish_id: "dish-2" },
          factors: { treatment: "drug", stimulus: "plus" },
          axes: {},
          hierarchy: {},
          values: { positive: 8, total: 10 },
          missingness: {},
          sourceRow: 2,
        },
      },
    ],
    fullContract: null,
    scopedContracts: [],
    provenance: [
      {
        eventId: "event.sparse.canvas",
        occurredAt: now,
        actor: "researcher",
        kind: "canvas_created",
        details: { source: "condition_canvas" },
      },
    ],
  });
  progressiveEntry.rawLineage!.rawText = serializeProgressiveCanonicalDraft(progressiveEntry);
  return createProgressiveExperimentProjectState({
    metadata: {
      projectId: "project.sparse",
      projectName: "Sparse experiment",
      experimentDate: "",
      createdAt: now,
      updatedAt: now,
    },
    progressiveEntry,
    graphSettings: [
      {
        schemaVersion: "0.1.0",
        graphId: "graph.sparse.intensity",
        readoutKey: "intensity",
        title: "Intensity by condition",
        yLabel: "Intensity",
        showIndividualPoints: true,
        conditionCellIds: ["cell.control.minus", "cell.drug.minus", "cell.drug.plus"],
      },
    ],
    activeGraphId: "graph.sparse.intensity",
  });
}

function setupFixture() {
  const dataState = fixture();
  const canvas = structuredClone(dataState.progressiveEntry.canvas);
  const pattern = structuredClone(dataState.progressiveEntry.activePattern!);
  const unresolvedCell = canvas.conditionCells.find(
    ({ conditionCellId }) => conditionCellId === "cell.drug.plus",
  )!;
  unresolvedCell.status = "unknown";
  pattern.readoutBindings
    .filter(({ conditionCellId }) => conditionCellId === unresolvedCell.conditionCellId)
    .forEach((binding) => {
      binding.status = "unknown";
      binding.recordSetKey = null;
    });
  const progressiveEntry = createProgressiveEntrySnapshot({
    snapshotId: "snapshot.setup",
    projectId: "project.setup",
    savedAt: now,
    canvas,
    activePattern: pattern,
    pendingPattern: null,
    mapping: null,
    rawLineage: null,
    stagedRecords: [],
    fullContract: null,
    scopedContracts: [],
    provenance: [
      {
        eventId: "event.setup.canvas",
        occurredAt: now,
        actor: "researcher",
        kind: "canvas_created",
        details: { source: "condition_canvas" },
      },
      {
        eventId: "event.setup.pattern",
        occurredAt: now,
        actor: "researcher",
        kind: "pattern_confirmed",
        details: { source: "biological_questions" },
      },
    ],
  });
  return createProgressiveExperimentSetupProjectState({
    metadata: {
      projectId: "project.setup",
      projectName: "Unresolved condition setup",
      experimentDate: "",
      createdAt: now,
      updatedAt: now,
    },
    progressiveEntry,
  });
}

function setupToDataInput(setup = setupFixture()) {
  const data = fixture();
  const canvas = structuredClone(setup.progressiveEntry.canvas);
  const activePattern = structuredClone(setup.progressiveEntry.activePattern!);
  const unresolvedCell = canvas.conditionCells.find(
    ({ conditionCellId }) => conditionCellId === "cell.drug.plus",
  )!;
  unresolvedCell.status = "performed";
  activePattern.readoutBindings
    .filter(({ conditionCellId }) => conditionCellId === unresolvedCell.conditionCellId)
    .forEach((binding) => {
      binding.status = "measured";
      binding.recordSetKey = "dish_records";
    });
  const records = data.progressiveEntry.stagedRecords.map(
    ({ eligibility: _eligibility, ...record }) => record,
  );
  return {
    setupState: setup,
    snapshotId: "snapshot.setup.data.1",
    savedAt: "2026-08-28T08:00:00.000Z",
    canvas,
    activePattern,
    pendingPattern: setup.progressiveEntry.pendingPattern,
    mapping: data.progressiveEntry.mapping,
    rawLineage: data.progressiveEntry.rawLineage,
    stagedRecords: records,
    provenanceEventId: "event.setup.to-data.1",
    sha256,
    actor: "researcher" as const,
  };
}

function singleConditionContract() {
  return StructureContractSchema.parse({
    schemaVersion: "0.1.0",
    contractId: "contract.fabricated.pre-sheet",
    experimentName: "Fabricated pre-sheet contract",
    experimentDescription: "Must not be persisted before the setup is resolved",
    unitLevels: [
      { key: "dish", label: "Culture dish", role: "experimental_unit", parentKey: null },
    ],
    experimentalUnitLevelKey: "dish",
    identities: [{ key: "dish_id", label: "Dish ID", unitLevelKey: "dish", required: true }],
    factors: [],
    matching: { kind: "independent", identityKey: null, completeSetsRequired: null },
    orderedAxes: [],
    readouts: [
      {
        key: "intensity",
        label: "Intensity",
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

class MemoryStorage implements ProjectPackageStorage {
  readonly packages = new Map<string, Map<string, Uint8Array>>();
  async readFile(target: string, relativePath: string): Promise<Uint8Array> {
    const file = this.packages.get(target)?.get(relativePath);
    if (!file) throw new Error(`missing ${relativePath}`);
    return file;
  }
  async beginAtomicWrite(target: string): Promise<AtomicProjectWrite> {
    const staged = new Map<string, Uint8Array>();
    return {
      writeFile: async (path, data) => void staged.set(path, data),
      commit: async () => void this.packages.set(target, staged),
      rollback: async () => undefined,
    };
  }
}

const sha256 = async (data: Uint8Array) => {
  let checksum = 0;
  for (const byte of data) checksum = (checksum * 31 + byte) % 0xffffffff;
  return checksum.toString(16).padStart(64, "0");
};

describe("progressive experiment project", () => {
  it("transitions a resolved setup revision to data without replacing setup recovery", async () => {
    const setup = setupFixture();
    const setupBefore = structuredClone(setup);
    const recoveryBefore = serializeProgressiveExperimentSetupRecovery(setup);
    const result = await transitionProgressiveExperimentSetupToData(setupToDataInput(setup));

    expect(result.status).toBe("transitioned");
    if (result.status !== "transitioned") return;
    expect(setup).toEqual(setupBefore);
    expect(result.setupState).toBe(setup);
    expect(serializeProgressiveExperimentSetupRecovery(result.setupState)).toEqual(recoveryBefore);
    expect(result.state.entryStage).toBe("data");
    expect(result.state.entryIntent).toBe("known_sparse_general_experiment");
    expect(result.state.progressiveEntry.snapshotId).toBe("snapshot.setup.data.1");
    expect(result.state.progressiveEntry.canvas.canvasId).toBe(
      setup.progressiveEntry.canvas.canvasId,
    );
    expect(result.state.progressiveEntry.activePattern?.patternSetId).toBe(
      setup.progressiveEntry.activePattern?.patternSetId,
    );
    expect(result.state.progressiveEntry.stagedRecords).toHaveLength(2);
    expect(result.state.progressiveEntry.rawLineage?.rawText).not.toBeNull();
    expect(result.state.progressiveEntry.fullContract).toBeNull();
    expect(result.state.progressiveEntry.scopedContracts).toEqual([]);
    expect(result.state.progressiveEntry.readiness.adaptiveInput.status).toBe("READY");
    expect(result.state.progressiveEntry.readiness.graph.status).toBe("READY");
    expect(result.state.progressiveEntry.readiness.statistics.status).toBe("NEED_MORE_INFORMATION");
    expect(result.state.progressiveEntry.provenance.slice(0, -1)).toEqual(
      setup.progressiveEntry.provenance,
    );
    expect(result.state.progressiveEntry.provenance.at(-1)).toMatchObject({
      eventId: "event.setup.to-data.1",
      kind: "raw_staged",
      details: {
        transition: "setup_to_data",
        previousSnapshotId: "snapshot.setup",
        nextSnapshotId: "snapshot.setup.data.1",
      },
    });
    expect(
      deserializeProgressiveExperimentProjectState(
        serializeProgressiveExperimentProjectState(result.state),
      ),
    ).toEqual(result.state);
  });

  it("safe-stops unresolved or semantically changed setup transitions without mutation", async () => {
    const setup = setupFixture();
    const setupBefore = structuredClone(setup);
    const unresolved = setupToDataInput(setup);
    unresolved.canvas = structuredClone(setup.progressiveEntry.canvas);
    unresolved.activePattern = structuredClone(setup.progressiveEntry.activePattern!);
    const unresolvedResult = await transitionProgressiveExperimentSetupToData(unresolved);
    expect(unresolvedResult).toMatchObject({
      status: "stopped",
      reasons: expect.arrayContaining(["unknown_condition_remains"]),
    });
    expect(unresolvedResult.state).toBe(setup);

    const changed = setupToDataInput(setup);
    changed.canvas.experimentLabel = "A different experiment";
    const changedResult = await transitionProgressiveExperimentSetupToData(changed);
    expect(changedResult).toMatchObject({
      status: "stopped",
      reasons: expect.arrayContaining(["canvas_semantic_identity_changed"]),
    });
    expect(changedResult.state).toBe(setup);
    expect(setup).toEqual(setupBefore);
  });

  it("requires new recoverable records and deterministic lineage before setup-to-data transition", async () => {
    const setup = setupFixture();
    const noInput = setupToDataInput(setup);
    noInput.stagedRecords = [];
    noInput.rawLineage = null;
    const noInputResult = await transitionProgressiveExperimentSetupToData(noInput);
    expect(noInputResult).toMatchObject({
      status: "stopped",
      reasons: expect.arrayContaining(["input_records_required", "input_lineage_required"]),
    });
    expect(noInputResult.state).toBe(setup);

    const excludedOnly = setupToDataInput(setup);
    excludedOnly.stagedRecords = [
      {
        recordId: "record.excluded.1",
        conditionCellId: "cell.control.plus",
        recordSetKey: null,
        mappingState: "pending_mapping",
        observation: {
          observationId: "observation.excluded.1",
          readoutKey: "intensity",
          identities: { dish_id: "dish-excluded" },
          factors: { treatment: "control", stimulus: "plus" },
          axes: {},
          hierarchy: {},
          values: { value: 1 },
          missingness: {},
          sourceRow: 1,
        },
      },
    ];
    const excludedResult = await transitionProgressiveExperimentSetupToData(excludedOnly);
    expect(excludedResult).toMatchObject({
      status: "stopped",
      reasons: ["lineage_records_mismatch"],
    });
    expect(excludedResult.state).toBe(setup);
  });

  it("does not transition data-stage projects or reuse the setup snapshot revision", async () => {
    const setup = setupFixture();
    const reusedRevision = setupToDataInput(setup);
    reusedRevision.snapshotId = setup.progressiveEntry.snapshotId;
    await expect(transitionProgressiveExperimentSetupToData(reusedRevision)).resolves.toMatchObject(
      {
        status: "stopped",
        reasons: expect.arrayContaining(["snapshot_revision_required"]),
        state: setup,
      },
    );

    const data = fixture();
    await expect(
      transitionProgressiveExperimentSetupToData({
        ...setupToDataInput(setup),
        setupState: data,
      }),
    ).resolves.toMatchObject({ status: "stopped", reasons: ["source_is_not_setup"], state: data });
  });

  it("safe-stops a mismatched lineage hash and a backwards transition timestamp", async () => {
    const setup = setupFixture();
    const badHash = setupToDataInput(setup);
    badHash.rawLineage = { ...badHash.rawLineage!, sha256: "0".repeat(64) };
    await expect(transitionProgressiveExperimentSetupToData(badHash)).resolves.toMatchObject({
      status: "stopped",
      reasons: ["lineage_hash_mismatch"],
      state: setup,
    });

    const backwards = setupToDataInput(setup);
    backwards.savedAt = "2026-08-28T05:59:59.000Z";
    await expect(transitionProgressiveExperimentSetupToData(backwards)).resolves.toMatchObject({
      status: "stopped",
      reasons: expect.arrayContaining(["transition_time_precedes_setup"]),
      state: setup,
    });
  });

  it("rejects legacy data states whose retained draft is empty or cannot reproduce records", () => {
    const empty = structuredClone(fixture());
    empty.progressiveEntry.rawLineage!.rawText = "";
    expect(ProgressiveExperimentProjectStateSchema.safeParse(empty).success).toBe(false);

    const unrelated = structuredClone(fixture());
    unrelated.progressiveEntry.rawLineage!.rawText =
      "condition_cell\treadout\tidentity\tcomponent_1\tcomponent_2\n" +
      "cell.control.minus\tintensity\tother-dish\t999";
    expect(ProgressiveExperimentProjectStateSchema.safeParse(unrelated).success).toBe(false);

    const formerlyMatchingTsv = structuredClone(fixture());
    formerlyMatchingTsv.progressiveEntry.rawLineage!.rawText =
      "condition_cell\treadout\tidentity\tcomponent_1\tcomponent_2\n" +
      "cell.control.minus\tintensity\tdish-1\t1.2\n" +
      "cell.drug.plus\tpositive_rate\tdish-2\t8\t10";
    const rejected = ProgressiveExperimentProjectStateSchema.safeParse(formerlyMatchingTsv);
    expect(rejected.success).toBe(false);
    if (!rejected.success) {
      expect(rejected.error.issues).toEqual(
        expect.arrayContaining([
          expect.objectContaining({
            message:
              "Progressive canonical recovery must exactly match Canvas, Pattern, mapping, and every staged record",
          }),
        ]),
      );
    }
  });

  it("binds full Canvas and Pattern semantics even when rawText is coherently rehashed", async () => {
    const state = structuredClone(fixture());
    state.progressiveEntry.rawLineage!.sha256 = await sha256(
      new TextEncoder().encode(state.progressiveEntry.rawLineage!.rawText!),
    );
    expect(await progressiveLineageHashMatches(state.progressiveEntry, sha256)).toBe(true);

    state.progressiveEntry.canvas.experimentLabel = "Changed semantics under the same canvas ID";
    state.progressiveEntry.activePattern!.levels[0]!.label =
      "Changed observation semantics under the same pattern ID";
    expect(await progressiveLineageHashMatches(state.progressiveEntry, sha256)).toBe(true);
    expect(ProgressiveExperimentProjectStateSchema.safeParse(state).success).toBe(false);
  });

  it("binds imported mapping metadata to the recoverable canonical draft", () => {
    const state = structuredClone(fixture());
    state.progressiveEntry.mapping = {
      schemaVersion: "0.1.0",
      sourceLabel: "researcher-table.tsv",
      delimiter: "tab",
      headerRow: 1,
      columns: {
        dish_id: {
          role: "identity",
          semanticKey: "dish_id",
          fixedFactors: {},
          fixedAxes: {},
        },
        intensity: {
          role: "value",
          semanticKey: "value",
          fixedFactors: {},
          fixedAxes: {},
        },
      },
      confirmedAt: now,
    };
    state.progressiveEntry.rawLineage!.rawText = serializeProgressiveCanonicalDraft(
      state.progressiveEntry,
    );
    expect(ProgressiveExperimentProjectStateSchema.safeParse(state).success).toBe(true);

    state.progressiveEntry.mapping.confirmedAt = "2026-08-28T07:00:00.000Z";
    expect(ProgressiveExperimentProjectStateSchema.safeParse(state).success).toBe(false);
  });

  it("rejects backwards saves and declared lineage hashes that do not match raw text", async () => {
    const storage = new MemoryStorage();
    await expect(
      saveProgressiveExperimentProjectPackage({
        storage,
        target: "backwards.lsa",
        state: fixture(),
        sha256,
        appVersion: "0.1.0",
        savedAt: "2026-08-28T05:59:59.000Z",
      }),
    ).rejects.toThrow(/cannot precede persisted history/i);

    const badHash = structuredClone(fixture());
    badHash.progressiveEntry.rawLineage!.sha256 = "0".repeat(64);
    await expect(
      saveProgressiveExperimentProjectPackage({
        storage,
        target: "bad-lineage-hash.lsa",
        state: badHash,
        sha256,
        appVersion: "0.1.0",
        savedAt: "2026-08-28T08:00:00.000Z",
      }),
    ).rejects.toThrow(/lineage hash/i);
  });

  it("rejects snapshots and saves that predate raw capture or mapping confirmation", async () => {
    const futureLineage = structuredClone(fixture());
    futureLineage.progressiveEntry.rawLineage!.capturedAt = "2026-08-28T09:00:00.000Z";
    futureLineage.progressiveEntry.rawLineage!.rawText = serializeProgressiveCanonicalDraft(
      futureLineage.progressiveEntry,
    );
    expect(ProgressiveExperimentProjectStateSchema.safeParse(futureLineage).success).toBe(false);

    const futureMapping = structuredClone(fixture());
    futureMapping.progressiveEntry.mapping = {
      schemaVersion: "0.1.0",
      sourceLabel: "future-confirmed.tsv",
      delimiter: "tab",
      headerRow: 1,
      columns: {},
      confirmedAt: "2026-08-28T10:00:00.000Z",
    };
    futureMapping.progressiveEntry.rawLineage!.rawText = serializeProgressiveCanonicalDraft(
      futureMapping.progressiveEntry,
    );
    expect(ProgressiveExperimentProjectStateSchema.safeParse(futureMapping).success).toBe(false);

    await expect(
      saveProgressiveExperimentProjectPackage({
        storage: new MemoryStorage(),
        target: "future-lineage.lsa",
        state: futureLineage,
        sha256,
        appVersion: "0.1.0",
        savedAt: "2026-08-28T08:30:00.000Z",
      }),
    ).rejects.toThrow(/cannot precede persisted history/i);
  });

  it("round-trips an unresolved pre-sheet Canvas and Pattern without fabricating data or design", () => {
    const state = setupFixture();
    const reopened = deserializeProgressiveExperimentProjectState(
      serializeProgressiveExperimentProjectState(state),
    );
    expect(reopened).toEqual(state);
    expect(reopened.entryStage).toBe("setup");
    expect(reopened.entryIntent).toBe("progressive_experiment_setup");
    expect(reopened.progressiveEntry.canvas.conditionCells.map(({ status }) => status)).toEqual([
      "performed",
      "not_performed",
      "performed",
      "unknown",
    ]);
    expect(reopened.progressiveEntry.activePattern?.patternSetId).toBe("pattern.sparse");
    expect(reopened.progressiveEntry.stagedRecords).toEqual([]);
    expect(reopened.progressiveEntry.fullContract).toBeNull();
    expect(reopened.progressiveEntry.readiness.graph.status).toBe("NEED_MORE_INFORMATION");
    expect(reopened.progressiveEntry.readiness.statistics.status).toBe("NEED_MORE_INFORMATION");
    expect(reopened.progressiveEntry.provenance.map(({ kind }) => kind)).toEqual([
      "canvas_created",
      "pattern_confirmed",
    ]);
  });

  it("rejects observations, contracts, Graph settings, and design-shaped extras in setup stage", () => {
    const setup = setupFixture();
    const data = fixture();
    expect(() =>
      createProgressiveExperimentProjectState({
        metadata: data.metadata,
        progressiveEntry: {
          ...data.progressiveEntry,
          rawLineage: null,
          mapping: null,
        },
        entryStage: "setup",
      }),
    ).toThrow(/must not contain observation records/i);

    const contractEntry = createProgressiveEntrySnapshot({
      ...setup.progressiveEntry,
      scopedContracts: [
        {
          scopeId: "scope.fabricated.pre-sheet",
          conditionCellIds: ["cell.control.minus"],
          contract: singleConditionContract(),
        },
      ],
    });
    expect(() =>
      createProgressiveExperimentSetupProjectState({
        metadata: setup.metadata,
        progressiveEntry: contractEntry,
      }),
    ).toThrow(/must not contain a StructureContract/i);
    expect(
      ProgressiveExperimentProjectStateSchema.safeParse({
        ...setup,
        experimentDesign: { designId: "fabricated.design" },
      }).success,
    ).toBe(false);
    expect(
      ProgressiveExperimentProjectStateSchema.safeParse({
        ...setup,
        graphSettings: data.graphSettings,
        activeGraphId: data.activeGraphId,
      }).success,
    ).toBe(false);
    expect(
      ProgressiveExperimentProjectStateSchema.safeParse({
        ...setup,
        entryIntent: "known_sparse_general_experiment",
      }).success,
    ).toBe(false);
  });

  it("defaults a legacy 0.1.0 progressive package without entryStage to the data stage", () => {
    const legacy = JSON.parse(
      new TextDecoder().decode(serializeProgressiveExperimentProjectState(fixture())),
    ) as Record<string, unknown>;
    delete legacy.entryStage;
    const reopened = deserializeProgressiveExperimentProjectState(
      new TextEncoder().encode(JSON.stringify(legacy)),
    );
    expect(reopened.entryStage).toBe("data");
    expect(reopened.entryIntent).toBe("known_sparse_general_experiment");
  });

  it("retains sparse cells, mixed readouts, readiness, lineage, and Graph settings in JSON", () => {
    const state = fixture();
    const reopened = deserializeProgressiveExperimentProjectState(
      serializeProgressiveExperimentProjectState(state),
    );
    expect(reopened).toEqual(state);
    expect(
      reopened.progressiveEntry.canvas.conditionCells.find(
        ({ conditionCellId }) => conditionCellId === "cell.control.plus",
      )?.status,
    ).toBe("not_performed");
    expect(reopened.progressiveEntry.fullContract).toBeNull();
    expect(reopened.progressiveEntry.readiness.graph.status).toBe("READY");
    expect(reopened.progressiveEntry.readiness.statistics.status).toBe("NEED_MORE_INFORMATION");
    expect(reopened.progressiveEntry.stagedRecords[1]?.observation.values).toEqual({
      positive: 8,
      total: 10,
    });
  });

  it("rejects unknown cells, missing lineage, non-performed Graph cells, and fabricated contracts", () => {
    const state = fixture();
    const unknown = structuredClone(state);
    unknown.progressiveEntry.canvas.conditionCells[0]!.status = "unknown";
    expect(ProgressiveExperimentProjectStateSchema.safeParse(unknown).success).toBe(false);
    const missingRawDraft = structuredClone(state);
    missingRawDraft.progressiveEntry.rawLineage!.rawText = null;
    expect(ProgressiveExperimentProjectStateSchema.safeParse(missingRawDraft).success).toBe(false);
    expect(
      ProgressiveExperimentProjectStateSchema.safeParse({
        ...state,
        graphSettings: [{ ...state.graphSettings[0]!, conditionCellIds: ["cell.control.plus"] }],
      }).success,
    ).toBe(false);
    expect(
      ProgressiveExperimentProjectStateSchema.safeParse({
        ...state,
        progressiveEntry: {
          ...state.progressiveEntry,
          readiness: {
            ...state.progressiveEntry.readiness,
            statistics: { status: "READY", reasons: [] },
          },
        },
      }).success,
    ).toBe(false);
  });

  it("saves and reopens under its own package kind while the ordinary reader refuses it", async () => {
    const storage = new MemoryStorage();
    const saved = await saveProgressiveExperimentProjectPackage({
      storage,
      target: "sparse.lsa",
      state: fixture(),
      sha256,
      appVersion: "0.1.0",
      savedAt: "2026-08-28T07:00:00.000Z",
    });
    const reopened = await openProgressiveExperimentProjectPackage({
      storage,
      target: "sparse.lsa",
      sha256,
    });
    expect(reopened).toEqual(saved);
    expect(storage.packages.get("sparse.lsa")?.has("progressive-project.json")).toBe(true);
    expect(
      storage.packages.get("sparse.lsa")?.has("raw/exports/progressive-entry-recovery.json"),
    ).toBe(true);
    await expect(
      openProjectStatePackage({
        storage,
        databaseCodec: { encode: async () => new Uint8Array(), decode: async () => ({}) },
        target: "sparse.lsa",
        sha256,
      }),
    ).rejects.toThrow(/REQUIRES_UNRESOLVED/);
  });

  it("rejects a coherently rehashed data package whose same Canvas ID has changed semantics", async () => {
    const storage = new MemoryStorage();
    await saveProgressiveExperimentProjectPackage({
      storage,
      target: "data-semantic-tamper.lsa",
      state: fixture(),
      sha256,
      appVersion: "0.1.0",
      savedAt: "2026-08-28T07:15:00.000Z",
    });

    const files = storage.packages.get("data-semantic-tamper.lsa");
    if (!files) throw new Error("missing saved data package");
    const manifestBytes = files.get("manifest.json");
    const databaseBytes = files.get("progressive-project.json");
    if (!manifestBytes || !databaseBytes) throw new Error("missing data package authority");
    const manifest = decodeProjectManifest(manifestBytes);
    const database = JSON.parse(new TextDecoder().decode(databaseBytes)) as {
      progressiveEntry: { canvas: { experimentLabel: string } };
    };
    database.progressiveEntry.canvas.experimentLabel =
      "Changed semantics under the retained canvas ID";
    const tamperedDatabase = new TextEncoder().encode(`${JSON.stringify(database, null, 2)}\n`);
    const coherentManifest = {
      ...manifest,
      files: await Promise.all(
        manifest.files.map(async (file) =>
          file.path === "progressive-project.json"
            ? {
                ...file,
                sizeBytes: tamperedDatabase.byteLength,
                sha256: await sha256(tamperedDatabase),
              }
            : file,
        ),
      ),
    };
    files.set("progressive-project.json", tamperedDatabase);
    files.set("manifest.json", encodeProjectManifest(coherentManifest));

    await expect(
      openProgressiveExperimentProjectPackage({
        storage,
        target: "data-semantic-tamper.lsa",
        sha256,
      }),
    ).rejects.toThrow(/exactly match Canvas, Pattern, mapping/i);
  });

  it("saves and reopens setup stage with an exact Canvas/Pattern recovery export", async () => {
    const storage = new MemoryStorage();
    const saved = await saveProgressiveExperimentProjectPackage({
      storage,
      target: "pre-sheet.lsa",
      state: setupFixture(),
      sha256,
      appVersion: "0.1.0",
      savedAt: "2026-08-28T07:30:00.000Z",
    });
    const reopened = await openProgressiveExperimentProjectPackage({
      storage,
      target: "pre-sheet.lsa",
      sha256,
    });
    expect(reopened).toEqual(saved);
    expect(
      storage.packages.get("pre-sheet.lsa")?.has("raw/exports/pre-sheet-semantic-state.json"),
    ).toBe(true);
    expect(
      storage.packages.get("pre-sheet.lsa")?.has("raw/exports/progressive-entry-recovery.json"),
    ).toBe(false);
    const recoveryBytes = storage.packages
      .get("pre-sheet.lsa")
      ?.get("raw/exports/pre-sheet-semantic-state.json");
    if (!recoveryBytes) throw new Error("missing pre-sheet recovery export");
    const recoveryText = new TextDecoder().decode(recoveryBytes);
    expect(recoveryText).toContain('"status": "unknown"');
    expect(recoveryText).toContain('"patternSetId": "pattern.sparse"');
    expect(recoveryText).toContain('"kind": "canvas_created"');
    expect(reopened.progressiveEntry.canvas.conditionCells.at(-1)?.status).toBe("unknown");
    expect(reopened.progressiveEntry.stagedRecords).toEqual([]);
    await expect(
      openProjectStatePackage({
        storage,
        databaseCodec: { encode: async () => new Uint8Array(), decode: async () => ({}) },
        target: "pre-sheet.lsa",
        sha256,
      }),
    ).rejects.toThrow(/REQUIRES_UNRESOLVED/);
  });

  it("rejects a coherently rehashed setup recovery export that differs from the database state", async () => {
    const storage = new MemoryStorage();
    await saveProgressiveExperimentProjectPackage({
      storage,
      target: "pre-sheet-mismatch.lsa",
      state: setupFixture(),
      sha256,
      appVersion: "0.1.0",
      savedAt: "2026-08-28T07:45:00.000Z",
    });

    const files = storage.packages.get("pre-sheet-mismatch.lsa");
    if (!files) throw new Error("missing saved setup package");
    const manifestBytes = files.get("manifest.json");
    if (!manifestBytes) throw new Error("missing setup manifest");
    const manifest = decodeProjectManifest(manifestBytes);
    const recoveryPath = manifest.recovery.canonicalRawExportPath;
    const recoveryBytes = files.get(recoveryPath);
    if (!recoveryBytes) throw new Error("missing setup recovery export");

    const tamperedRecovery = new Uint8Array(recoveryBytes.byteLength + 1);
    tamperedRecovery.set(recoveryBytes);
    tamperedRecovery[tamperedRecovery.byteLength - 1] = 0x20;
    const coherentManifest = {
      ...manifest,
      files: await Promise.all(
        manifest.files.map(async (file) =>
          file.path === recoveryPath
            ? {
                ...file,
                sizeBytes: tamperedRecovery.byteLength,
                sha256: await sha256(tamperedRecovery),
              }
            : file,
        ),
      ),
    };
    files.set(recoveryPath, tamperedRecovery);
    files.set("manifest.json", encodeProjectManifest(coherentManifest));

    await expect(
      openProgressiveExperimentProjectPackage({
        storage,
        target: "pre-sheet-mismatch.lsa",
        sha256,
      }),
    ).rejects.toThrow(/recovery export does not match retained state/i);
  });
});

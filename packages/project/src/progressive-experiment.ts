import { z } from "zod";
import {
  EntityIdSchema,
  ProgressiveEntrySnapshotSchema,
  ProjectMetadataSchema,
  createProgressiveEntrySnapshot,
  type ProgressiveEntrySnapshot,
} from "@lsaa/domain";
import type { Sha256Function } from "./package-io";

export const PROGRESSIVE_EXPERIMENT_PROJECT_KIND = "progressive_experiment" as const;
export const PROGRESSIVE_EXPERIMENT_PROJECT_VERSION = "0.1.0" as const;
export const PROGRESSIVE_EXPERIMENT_SETUP_INTENT = "progressive_experiment_setup" as const;
export const PROGRESSIVE_EXPERIMENT_DATA_INTENT = "known_sparse_general_experiment" as const;
export const PROGRESSIVE_CANONICAL_DRAFT_KIND = "progressive_experiment_recovery" as const;
export const PROGRESSIVE_CANONICAL_DRAFT_VERSION = "0.2.0" as const;

/** Lossless recovery authority for progressive Canvas, Pattern, mapping, and staged records. */
export function serializeProgressiveCanonicalDraft(snapshot: ProgressiveEntrySnapshot): string {
  return `${JSON.stringify(
    {
      formatVersion: PROGRESSIVE_CANONICAL_DRAFT_VERSION,
      kind: PROGRESSIVE_CANONICAL_DRAFT_KIND,
      snapshotSchemaVersion: snapshot.schemaVersion,
      canvas: snapshot.canvas,
      activePattern: snapshot.activePattern,
      pendingPattern: snapshot.pendingPattern,
      mapping: snapshot.mapping,
      stagedRecords: snapshot.stagedRecords,
    },
    null,
    2,
  )}\n`;
}

export function progressiveLineageMatchesStagedRecords(
  snapshot: ProgressiveEntrySnapshot,
): boolean {
  const rawText = snapshot.rawLineage?.rawText;
  if (!rawText?.trim()) return false;
  return rawText === serializeProgressiveCanonicalDraft(snapshot);
}

export async function progressiveLineageHashMatches(
  snapshot: ProgressiveEntrySnapshot,
  sha256: Sha256Function,
): Promise<boolean> {
  const rawText = snapshot.rawLineage?.rawText;
  if (!rawText?.trim()) return false;
  const declared = snapshot.rawLineage?.sha256;
  return declared === null || declared === (await sha256(new TextEncoder().encode(rawText)));
}

function latestProgressiveTimestamp(state: {
  metadata: { createdAt: string; updatedAt: string };
  progressiveEntry: Pick<
    ProgressiveEntrySnapshot,
    "savedAt" | "provenance" | "rawLineage" | "mapping"
  >;
}): number {
  const lineageTimestamp = state.progressiveEntry.rawLineage?.capturedAt;
  const mappingTimestamp = state.progressiveEntry.mapping?.confirmedAt;
  return Math.max(
    Date.parse(state.metadata.createdAt),
    Date.parse(state.metadata.updatedAt),
    Date.parse(state.progressiveEntry.savedAt),
    ...(lineageTimestamp ? [Date.parse(lineageTimestamp)] : []),
    ...(mappingTimestamp ? [Date.parse(mappingTimestamp)] : []),
    ...state.progressiveEntry.provenance.map(({ occurredAt }) => Date.parse(occurredAt)),
  );
}

export function isMonotonicProgressiveTimestamp(
  state: Parameters<typeof latestProgressiveTimestamp>[0],
  nextTimestamp: string,
): boolean {
  return Date.parse(nextTimestamp) >= latestProgressiveTimestamp(state);
}

export const ProgressiveSparseGraphSettingsSchema = z
  .object({
    schemaVersion: z.literal(PROGRESSIVE_EXPERIMENT_PROJECT_VERSION),
    graphId: EntityIdSchema,
    readoutKey: z.string().min(1),
    title: z.string(),
    yLabel: z.string(),
    showIndividualPoints: z.boolean(),
    conditionCellIds: z.array(z.string().min(1)).min(1),
  })
  .strict();

export const ProgressiveExperimentProjectStateSchema = z
  .object({
    projectKind: z.literal(PROGRESSIVE_EXPERIMENT_PROJECT_KIND),
    schemaVersion: z.literal(PROGRESSIVE_EXPERIMENT_PROJECT_VERSION),
    metadata: ProjectMetadataSchema,
    /** Missing in legacy 0.1.0 packages means the original data-entry stage. */
    entryStage: z.enum(["setup", "data"]).default("data"),
    entryIntent: z.enum([PROGRESSIVE_EXPERIMENT_SETUP_INTENT, PROGRESSIVE_EXPERIMENT_DATA_INTENT]),
    progressiveEntry: ProgressiveEntrySnapshotSchema,
    graphSettings: z.array(ProgressiveSparseGraphSettingsSchema),
    activeGraphId: EntityIdSchema.nullable(),
  })
  .strict()
  .superRefine((state, ctx) => {
    const isSetup = state.entryStage === "setup";
    if (!isMonotonicProgressiveTimestamp(state, state.progressiveEntry.savedAt)) {
      ctx.addIssue({
        code: "custom",
        path: ["progressiveEntry", "savedAt"],
        message:
          "Progressive snapshot time cannot precede project, lineage, mapping, or provenance history",
      });
    }
    if (state.metadata.projectId !== state.progressiveEntry.projectId) {
      ctx.addIssue({
        code: "custom",
        path: ["progressiveEntry", "projectId"],
        message: "Progressive entry and project metadata must identify the same project",
      });
    }
    if (
      (isSetup && state.entryIntent !== PROGRESSIVE_EXPERIMENT_SETUP_INTENT) ||
      (!isSetup && state.entryIntent !== PROGRESSIVE_EXPERIMENT_DATA_INTENT)
    ) {
      ctx.addIssue({
        code: "custom",
        path: ["entryIntent"],
        message: "Progressive experiment stage and entry intent must agree",
      });
    }
    if (
      !isSetup &&
      state.progressiveEntry.canvas.conditionCells.some(({ status }) => status === "unknown")
    ) {
      ctx.addIssue({
        code: "custom",
        path: ["progressiveEntry", "canvas", "conditionCells"],
        message: "Known sparse entry cannot open a value sheet while condition status is unknown",
      });
    }
    if (
      state.progressiveEntry.fullContract !== null ||
      state.progressiveEntry.scopedContracts.length > 0 ||
      state.progressiveEntry.readiness.statistics.status === "READY"
    ) {
      ctx.addIssue({
        code: "custom",
        path: ["progressiveEntry", "readiness", "statistics"],
        message: isSetup
          ? "Pre-sheet experiment setup must not contain a StructureContract"
          : "Known sparse entry must remain pre-contract until a separately validated Statistics scope exists",
      });
    }
    if (isSetup) {
      if (state.progressiveEntry.stagedRecords.length > 0) {
        ctx.addIssue({
          code: "custom",
          path: ["progressiveEntry", "stagedRecords"],
          message: "Pre-sheet experiment setup must not contain observation records",
        });
      }
      if (state.progressiveEntry.mapping !== null || state.progressiveEntry.rawLineage !== null) {
        ctx.addIssue({
          code: "custom",
          path: ["progressiveEntry", "rawLineage"],
          message: "Pre-sheet experiment setup must not claim measurement mapping or raw data",
        });
      }
      if (state.graphSettings.length > 0 || state.activeGraphId !== null) {
        ctx.addIssue({
          code: "custom",
          path: ["graphSettings"],
          message: "Pre-sheet experiment setup must not contain Graph settings",
        });
      }
      if (
        state.progressiveEntry.readiness.graph.status === "READY" ||
        state.progressiveEntry.readiness.statistics.status === "READY"
      ) {
        ctx.addIssue({
          code: "custom",
          path: ["progressiveEntry", "readiness"],
          message: "Pre-sheet experiment setup cannot make Graph or Statistics ready",
        });
      }
      if (
        !state.progressiveEntry.provenance.some(
          ({ kind }) => kind === "canvas_created" || kind === "canvas_revised",
        )
      ) {
        ctx.addIssue({
          code: "custom",
          path: ["progressiveEntry", "provenance"],
          message: "Pre-sheet experiment setup requires Canvas provenance",
        });
      }
      if (
        state.progressiveEntry.provenance.some(({ kind }) =>
          ["raw_staged", "mapping_revised", "contract_completed", "scope_completed"].includes(kind),
        )
      ) {
        ctx.addIssue({
          code: "custom",
          path: ["progressiveEntry", "provenance"],
          message: "Pre-sheet provenance cannot claim data mapping or contract completion",
        });
      }
    } else if (!state.progressiveEntry.rawLineage) {
      ctx.addIssue({
        code: "custom",
        path: ["progressiveEntry", "rawLineage"],
        message: "Progressive experiment projects must retain data-entry lineage",
      });
    } else if (!state.progressiveEntry.rawLineage.rawText?.trim()) {
      ctx.addIssue({
        code: "custom",
        path: ["progressiveEntry", "rawLineage", "rawText"],
        message: "Progressive experiment projects require a recoverable canonical draft export",
      });
    } else if (!progressiveLineageMatchesStagedRecords(state.progressiveEntry)) {
      ctx.addIssue({
        code: "custom",
        path: ["progressiveEntry", "rawLineage", "rawText"],
        message:
          "Progressive canonical recovery must exactly match Canvas, Pattern, mapping, and every staged record",
      });
    }
    if (!isSetup && !state.progressiveEntry.activePattern) {
      ctx.addIssue({
        code: "custom",
        path: ["progressiveEntry", "activePattern"],
        message: "Known sparse entry requires a confirmed observation pattern",
      });
    }

    const performed = new Set(
      state.progressiveEntry.canvas.conditionCells
        .filter(({ status }) => status === "performed")
        .map(({ conditionCellId }) => conditionCellId),
    );
    const readouts = new Set(state.progressiveEntry.canvas.readouts.map(({ key }) => key));
    const graphIds = new Set<string>();
    state.graphSettings.forEach((graph, index) => {
      if (graphIds.has(graph.graphId)) {
        ctx.addIssue({
          code: "custom",
          path: ["graphSettings", index, "graphId"],
          message: "Progressive Graph IDs must be unique",
        });
      }
      graphIds.add(graph.graphId);
      if (!readouts.has(graph.readoutKey)) {
        ctx.addIssue({
          code: "custom",
          path: ["graphSettings", index, "readoutKey"],
          message: "Progressive Graph must reference a Canvas readout",
        });
      }
      graph.conditionCellIds.forEach((conditionCellId) => {
        if (!performed.has(conditionCellId)) {
          ctx.addIssue({
            code: "custom",
            path: ["graphSettings", index, "conditionCellIds"],
            message: "Progressive Graph cannot treat a non-performed condition as observed",
          });
        }
        const binding = state.progressiveEntry.activePattern?.readoutBindings.find(
          (candidate) =>
            candidate.conditionCellId === conditionCellId &&
            candidate.readoutKey === graph.readoutKey,
        );
        if (binding?.status !== "measured") {
          ctx.addIssue({
            code: "custom",
            path: ["graphSettings", index, "conditionCellIds"],
            message: "Progressive Graph can include only measured readout-condition bindings",
          });
        }
      });
    });
    if (state.activeGraphId !== null && !graphIds.has(state.activeGraphId)) {
      ctx.addIssue({
        code: "custom",
        path: ["activeGraphId"],
        message: "Active Graph must reference persisted progressive Graph settings",
      });
    }
  });

export type ProgressiveSparseGraphSettings = z.infer<typeof ProgressiveSparseGraphSettingsSchema>;
export type ProgressiveExperimentProjectState = z.infer<
  typeof ProgressiveExperimentProjectStateSchema
>;

export const ProgressiveExperimentSetupToDataStopReasonSchema = z.enum([
  "source_project_invalid",
  "source_is_not_setup",
  "snapshot_revision_required",
  "canvas_semantic_identity_changed",
  "active_pattern_required",
  "active_pattern_semantic_identity_changed",
  "pending_pattern_changed",
  "unknown_condition_remains",
  "input_records_required",
  "input_lineage_required",
  "recoverable_input_required",
  "lineage_hash_mismatch",
  "lineage_records_mismatch",
  "transition_time_precedes_setup",
  "data_readiness_not_ready",
  "data_project_invalid",
]);

export type ProgressiveExperimentSetupToDataStopReason = z.infer<
  typeof ProgressiveExperimentSetupToDataStopReasonSchema
>;

type ProgressiveSetupToDataInputRecord = Omit<
  ProgressiveEntrySnapshot["stagedRecords"][number],
  "eligibility"
>;

export type ProgressiveExperimentSetupToDataInput = Readonly<{
  setupState: ProgressiveExperimentProjectState;
  snapshotId: string;
  savedAt: string;
  canvas: ProgressiveEntrySnapshot["canvas"];
  activePattern: ProgressiveEntrySnapshot["activePattern"];
  pendingPattern: ProgressiveEntrySnapshot["pendingPattern"];
  mapping: ProgressiveEntrySnapshot["mapping"];
  rawLineage: ProgressiveEntrySnapshot["rawLineage"];
  stagedRecords: readonly ProgressiveSetupToDataInputRecord[];
  provenanceEventId: string;
  sha256: Sha256Function;
  actor?: "researcher" | "application" | "import_adapter";
}>;

export type ProgressiveExperimentSetupToDataTransitionResult =
  | Readonly<{
      status: "transitioned";
      /** The immutable setup revision remains available for recovery/history. */
      setupState: ProgressiveExperimentProjectState;
      state: ProgressiveExperimentProjectState;
    }>
  | Readonly<{
      status: "stopped";
      reasons: readonly ProgressiveExperimentSetupToDataStopReason[];
      /** Exact input reference: a stopped transition never mutates or replaces setup recovery. */
      state: ProgressiveExperimentProjectState;
    }>;

function sameJson(left: unknown, right: unknown): boolean {
  return JSON.stringify(left) === JSON.stringify(right);
}

function canvasSemanticIdentity(canvas: ProgressiveEntrySnapshot["canvas"]): unknown {
  return {
    ...canvas,
    conditionCells: canvas.conditionCells.map(({ status: _status, ...cell }) => cell),
  };
}

function patternSemanticIdentity(
  pattern: NonNullable<ProgressiveEntrySnapshot["activePattern"]>,
): unknown {
  return {
    ...pattern,
    readoutBindings: pattern.readoutBindings.map(
      ({ status: _status, recordSetKey: _recordSetKey, ...binding }) => binding,
    ),
  };
}

function concreteSetupFactsWerePreserved(
  setup: ProgressiveEntrySnapshot,
  nextCanvas: ProgressiveEntrySnapshot["canvas"],
  nextPattern: NonNullable<ProgressiveEntrySnapshot["activePattern"]>,
): boolean {
  const nextCells = new Map(nextCanvas.conditionCells.map((cell) => [cell.conditionCellId, cell]));
  const concreteCellsPreserved = setup.canvas.conditionCells.every((cell) => {
    const next = nextCells.get(cell.conditionCellId);
    return Boolean(next) && (cell.status === "unknown" || next!.status === cell.status);
  });
  if (!concreteCellsPreserved || !setup.activePattern) return false;
  const nextBindings = new Map(
    nextPattern.readoutBindings.map((binding) => [
      `${binding.conditionCellId}\u0000${binding.readoutKey}`,
      binding,
    ]),
  );
  return setup.activePattern.readoutBindings.every((binding) => {
    const next = nextBindings.get(`${binding.conditionCellId}\u0000${binding.readoutKey}`);
    return (
      Boolean(next) &&
      (binding.status === "unknown" ||
        (next!.status === binding.status && next!.recordSetKey === binding.recordSetKey))
    );
  });
}

/**
 * Validates and creates the isolated setup -> data revision. The setup revision
 * remains immutable and is returned alongside the new data revision. Canvas and
 * Pattern structure cannot be rewritten during this transition; only explicit
 * unknown statuses may be resolved. Contracts and Statistics readiness are not
 * inputs and therefore cannot be fabricated by the transition.
 */
export async function transitionProgressiveExperimentSetupToData(
  input: ProgressiveExperimentSetupToDataInput,
): Promise<ProgressiveExperimentSetupToDataTransitionResult> {
  const parsedSetup = ProgressiveExperimentProjectStateSchema.safeParse(input.setupState);
  if (!parsedSetup.success) {
    return { status: "stopped", reasons: ["source_project_invalid"], state: input.setupState };
  }
  const setupState = parsedSetup.data;
  if (setupState.entryStage !== "setup") {
    return { status: "stopped", reasons: ["source_is_not_setup"], state: input.setupState };
  }

  const reasons: ProgressiveExperimentSetupToDataStopReason[] = [];
  if (input.snapshotId === setupState.progressiveEntry.snapshotId) {
    reasons.push("snapshot_revision_required");
  }
  if (!isMonotonicProgressiveTimestamp(setupState, input.savedAt)) {
    reasons.push("transition_time_precedes_setup");
  }
  if (
    !sameJson(
      canvasSemanticIdentity(setupState.progressiveEntry.canvas),
      canvasSemanticIdentity(input.canvas),
    )
  ) {
    reasons.push("canvas_semantic_identity_changed");
  }
  if (!setupState.progressiveEntry.activePattern || !input.activePattern) {
    reasons.push("active_pattern_required");
  } else if (
    !sameJson(
      patternSemanticIdentity(setupState.progressiveEntry.activePattern),
      patternSemanticIdentity(input.activePattern),
    ) ||
    !concreteSetupFactsWerePreserved(setupState.progressiveEntry, input.canvas, input.activePattern)
  ) {
    reasons.push("active_pattern_semantic_identity_changed");
  }
  if (!sameJson(setupState.progressiveEntry.pendingPattern, input.pendingPattern)) {
    reasons.push("pending_pattern_changed");
  }
  if (input.canvas.conditionCells.some(({ status }) => status === "unknown")) {
    reasons.push("unknown_condition_remains");
  }
  if (input.stagedRecords.length === 0) reasons.push("input_records_required");
  if (!input.rawLineage) {
    reasons.push("input_lineage_required");
  } else if (input.rawLineage.rawText === null) {
    reasons.push("recoverable_input_required");
  }
  if (reasons.length > 0) {
    return { status: "stopped", reasons, state: input.setupState };
  }

  let progressiveEntry: ProgressiveEntrySnapshot;
  try {
    progressiveEntry = createProgressiveEntrySnapshot({
      snapshotId: input.snapshotId,
      projectId: setupState.progressiveEntry.projectId,
      savedAt: input.savedAt,
      canvas: input.canvas,
      activePattern: input.activePattern,
      pendingPattern: input.pendingPattern,
      mapping: input.mapping,
      rawLineage: input.rawLineage,
      stagedRecords: input.stagedRecords,
      fullContract: null,
      scopedContracts: [],
      provenance: [
        ...setupState.progressiveEntry.provenance,
        {
          eventId: input.provenanceEventId,
          occurredAt: input.savedAt,
          actor: input.actor ?? "researcher",
          kind: "raw_staged",
          details: {
            transition: "setup_to_data",
            previousSnapshotId: setupState.progressiveEntry.snapshotId,
            nextSnapshotId: input.snapshotId,
          },
        },
      ],
    });
  } catch {
    return { status: "stopped", reasons: ["data_project_invalid"], state: input.setupState };
  }

  if (!progressiveLineageMatchesStagedRecords(progressiveEntry)) {
    return { status: "stopped", reasons: ["lineage_records_mismatch"], state: input.setupState };
  }
  if (!(await progressiveLineageHashMatches(progressiveEntry, input.sha256))) {
    return { status: "stopped", reasons: ["lineage_hash_mismatch"], state: input.setupState };
  }

  if (
    progressiveEntry.readiness.dataRetention.status !== "READY" ||
    progressiveEntry.readiness.adaptiveInput.status !== "READY" ||
    progressiveEntry.readiness.graph.status !== "READY"
  ) {
    return { status: "stopped", reasons: ["data_readiness_not_ready"], state: input.setupState };
  }

  const nextState = ProgressiveExperimentProjectStateSchema.safeParse({
    ...setupState,
    metadata: { ...setupState.metadata, updatedAt: input.savedAt },
    entryStage: "data",
    entryIntent: PROGRESSIVE_EXPERIMENT_DATA_INTENT,
    progressiveEntry,
    graphSettings: [],
    activeGraphId: null,
  });
  if (!nextState.success) {
    return { status: "stopped", reasons: ["data_project_invalid"], state: input.setupState };
  }
  return { status: "transitioned", setupState: input.setupState, state: nextState.data };
}

export function createProgressiveExperimentProjectState(input: {
  metadata: z.infer<typeof ProjectMetadataSchema>;
  progressiveEntry: ProgressiveEntrySnapshot;
  graphSettings?: readonly ProgressiveSparseGraphSettings[];
  activeGraphId?: string | null;
  entryStage?: "setup" | "data";
}): ProgressiveExperimentProjectState {
  const entryStage = input.entryStage ?? "data";
  return ProgressiveExperimentProjectStateSchema.parse({
    projectKind: PROGRESSIVE_EXPERIMENT_PROJECT_KIND,
    schemaVersion: PROGRESSIVE_EXPERIMENT_PROJECT_VERSION,
    metadata: input.metadata,
    entryStage,
    entryIntent:
      entryStage === "setup"
        ? PROGRESSIVE_EXPERIMENT_SETUP_INTENT
        : PROGRESSIVE_EXPERIMENT_DATA_INTENT,
    progressiveEntry: input.progressiveEntry,
    graphSettings: input.graphSettings ? [...input.graphSettings] : [],
    activeGraphId: input.activeGraphId ?? null,
  });
}

export function createProgressiveExperimentSetupProjectState(input: {
  metadata: z.infer<typeof ProjectMetadataSchema>;
  progressiveEntry: ProgressiveEntrySnapshot;
}): ProgressiveExperimentProjectState {
  return createProgressiveExperimentProjectState({
    ...input,
    entryStage: "setup",
    graphSettings: [],
    activeGraphId: null,
  });
}

export function parseProgressiveExperimentProjectState(
  input: unknown,
): ProgressiveExperimentProjectState {
  return ProgressiveExperimentProjectStateSchema.parse(input);
}

export function serializeProgressiveExperimentProjectState(
  stateInput: ProgressiveExperimentProjectState,
): Uint8Array {
  const state = ProgressiveExperimentProjectStateSchema.parse(stateInput);
  return new TextEncoder().encode(`${JSON.stringify(state, null, 2)}\n`);
}

export function deserializeProgressiveExperimentProjectState(
  data: Uint8Array,
): ProgressiveExperimentProjectState {
  return parseProgressiveExperimentProjectState(
    JSON.parse(new TextDecoder("utf-8", { fatal: true }).decode(data)),
  );
}

/** Independent recovery export for the pre-sheet Canvas/Pattern authority. */
export function serializeProgressiveExperimentSetupRecovery(
  stateInput: ProgressiveExperimentProjectState,
): Uint8Array {
  const state = ProgressiveExperimentProjectStateSchema.parse(stateInput);
  if (state.entryStage !== "setup") {
    throw new Error("Progressive experiment setup recovery requires a setup-stage project");
  }
  return new TextEncoder().encode(
    `${JSON.stringify(
      {
        schemaVersion: state.schemaVersion,
        projectId: state.metadata.projectId,
        canvas: state.progressiveEntry.canvas,
        activePattern: state.progressiveEntry.activePattern,
        pendingPattern: state.progressiveEntry.pendingPattern,
        readiness: state.progressiveEntry.readiness,
        provenance: state.progressiveEntry.provenance,
      },
      null,
      2,
    )}\n`,
  );
}

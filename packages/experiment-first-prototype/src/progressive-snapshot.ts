import { validateStructureContract, type StructureContract } from "./contract.ts";
import {
  validateExperimentCanvas,
  type ExperimentCanvas,
} from "./experiment-canvas.ts";
import {
  validateObservationPatternSet,
  type ObservationPatternSet,
} from "./observation-pattern.ts";
import {
  selectSurfacePlanFromCanvasAndPattern,
  type AdaptiveSurfacePlan,
} from "./observation-surface.ts";
import type { ForwardMappingIssue } from "./forward-mapper.ts";
import {
  createAnalysisScope,
  type AnalysisScopeIssue,
  type AnalysisScopeProvenance,
  type AnalysisScopeRequest,
} from "./analysis-scope.ts";

export const PROGRESSIVE_ENTRY_SNAPSHOT_VERSION = "0.2.0-prototype" as const;

export type StagedValue = string | number | boolean | null;

export interface StagedObservationRecord {
  recordId: string;
  readoutKey: string;
  recordSetKey: string;
  conditionCellKey: string;
  identities: Record<string, string>;
  coordinates: Record<string, string | number>;
  hierarchy: Record<string, string>;
  values: Record<string, StagedValue>;
  missingness: Record<string, string>;
  sourceRow: number | null;
  mappingState: "mapped" | "pending_remap";
  eligibility: "active" | "excluded_condition_or_binding" | "pending_remap";
}

export interface StagedObservationInput extends Omit<StagedObservationRecord, "eligibility"> {}

export interface ProgressiveRawLineage {
  sourceKind: "direct_entry" | "clipboard" | "csv" | "tsv" | "generic_file";
  sourceLabel: string;
  rawText: string | null;
  sha256: string | null;
  transformations: string[];
}

export type ProgressiveDesignProjection =
  | { status: "not_requested" }
  | { status: "mapped"; contract: StructureContract }
  | { status: "stopped"; issues: ForwardMappingIssue[] };

export interface ProgressiveAnalysisScopeInput {
  request: AnalysisScopeRequest;
  designProjection?: ProgressiveDesignProjection;
  previousProvenance?: AnalysisScopeProvenance | null;
}

export type ProgressiveAnalysisScopeSnapshot =
  | {
      state: "active";
      request: AnalysisScopeRequest;
      provenance: AnalysisScopeProvenance;
      designProjection: ProgressiveDesignProjection;
    }
  | {
      state: "invalidated";
      request: AnalysisScopeRequest;
      issues: AnalysisScopeIssue[];
      previousProvenance: AnalysisScopeProvenance | null;
      retainedDesignProjection: ProgressiveDesignProjection;
    };

export interface ProgressiveEntrySnapshot {
  schemaVersion: typeof PROGRESSIVE_ENTRY_SNAPSHOT_VERSION;
  projectId: string;
  savedAt: string;
  canvas: ExperimentCanvas;
  activePattern: ObservationPatternSet;
  pendingPattern: ObservationPatternSet | null;
  surfacePlan: AdaptiveSurfacePlan;
  records: StagedObservationRecord[];
  rawLineage: ProgressiveRawLineage;
  designProjection: ProgressiveDesignProjection;
  analysisScopes: ProgressiveAnalysisScopeSnapshot[];
}

function unique(values: string[]): boolean {
  return new Set(values).size === values.length;
}

function recordEligibility(
  canvas: ExperimentCanvas,
  pattern: ObservationPatternSet,
  record: StagedObservationInput,
): StagedObservationRecord["eligibility"] {
  if (record.mappingState === "pending_remap") return "pending_remap";
  const condition = canvas.conditionCells.find((cell) => cell.key === record.conditionCellKey);
  const binding = pattern.bindings.find((candidate) =>
    candidate.readoutKey === record.readoutKey && candidate.conditionCellKeys.includes(record.conditionCellKey)
  );
  return condition?.status === "performed" && binding?.status === "measured" && binding.recordSetKey === record.recordSetKey
    ? "active"
    : "excluded_condition_or_binding";
}

function validateProjection(projection: ProgressiveDesignProjection): void {
  if (projection.status === "mapped") validateStructureContract(projection.contract);
}

export function validateProgressiveEntrySnapshot(snapshot: ProgressiveEntrySnapshot): ProgressiveEntrySnapshot {
  if (snapshot.schemaVersion !== PROGRESSIVE_ENTRY_SNAPSHOT_VERSION) throw new Error("Unsupported progressive snapshot version");
  if (!snapshot.projectId.trim() || !snapshot.savedAt.trim()) throw new Error("Project ID and saved time are required");
  validateExperimentCanvas(snapshot.canvas);
  validateObservationPatternSet(snapshot.activePattern, snapshot.canvas);
  if (snapshot.pendingPattern) validateObservationPatternSet(snapshot.pendingPattern, snapshot.canvas);
  const expectedPlan = selectSurfacePlanFromCanvasAndPattern(snapshot.canvas, snapshot.activePattern);
  if (JSON.stringify(snapshot.surfacePlan) !== JSON.stringify(expectedPlan)) throw new Error("Surface plan is stale or does not match the active pattern");
  if (!unique(snapshot.records.map((record) => record.recordId))) throw new Error("Staged record IDs must be unique");
  validateProjection(snapshot.designProjection);
  if (!unique(snapshot.analysisScopes.map((scope) => scope.request.scopeId))) throw new Error("Analysis scope IDs must be unique");
  for (const savedScope of snapshot.analysisScopes) {
    const current = createAnalysisScope(snapshot.canvas, snapshot.activePattern, savedScope.request);
    if (savedScope.state === "active") {
      if (current.status !== "ready") throw new Error(`Active analysis scope is no longer valid: ${savedScope.request.scopeId}`);
      if (JSON.stringify(savedScope.provenance) !== JSON.stringify(current.provenance)) throw new Error(`Analysis scope provenance is stale: ${savedScope.request.scopeId}`);
      validateProjection(savedScope.designProjection);
    } else {
      if (current.status !== "safe_stop") throw new Error(`Invalidated analysis scope is currently valid: ${savedScope.request.scopeId}`);
      if (JSON.stringify(savedScope.issues) !== JSON.stringify(current.issues)) throw new Error(`Analysis scope invalidation diagnostics are stale: ${savedScope.request.scopeId}`);
      validateProjection(savedScope.retainedDesignProjection);
    }
  }
  const readoutKeys = new Set(snapshot.canvas.readouts.map((readout) => readout.key));
  const conditionKeys = new Set(snapshot.canvas.conditionCells.map((cell) => cell.key));
  const recordSetKeys = new Set(snapshot.activePattern.recordSets.map((recordSet) => recordSet.key));
  for (const record of snapshot.records) {
    if (!readoutKeys.has(record.readoutKey)) throw new Error(`Staged record references unknown readout: ${record.recordId}`);
    if (!conditionKeys.has(record.conditionCellKey)) throw new Error(`Staged record references unknown condition: ${record.recordId}`);
    if (!recordSetKeys.has(record.recordSetKey)) throw new Error(`Staged record references unknown record set: ${record.recordId}`);
    const expected = recordEligibility(snapshot.canvas, snapshot.activePattern, record);
    if (record.eligibility !== expected) throw new Error(`Staged record eligibility is stale: ${record.recordId}`);
  }
  return snapshot;
}

export function createProgressiveEntrySnapshot(input: {
  projectId: string;
  savedAt: string;
  canvas: ExperimentCanvas;
  activePattern: ObservationPatternSet;
  pendingPattern?: ObservationPatternSet | null;
  records: StagedObservationInput[];
  rawLineage: ProgressiveRawLineage;
  designProjection?: ProgressiveDesignProjection;
  analysisScopes?: ProgressiveAnalysisScopeInput[];
}): ProgressiveEntrySnapshot {
  validateExperimentCanvas(input.canvas);
  validateObservationPatternSet(input.activePattern, input.canvas);
  if (input.pendingPattern) validateObservationPatternSet(input.pendingPattern, input.canvas);
  const analysisScopes: ProgressiveAnalysisScopeSnapshot[] = (input.analysisScopes ?? []).map((savedScope) => {
    const current = createAnalysisScope(input.canvas, input.activePattern, savedScope.request);
    if (current.status === "ready") {
      return {
        state: "active",
        request: structuredClone(savedScope.request),
        provenance: current.provenance,
        designProjection: structuredClone(savedScope.designProjection ?? { status: "not_requested" }),
      };
    }
    return {
      state: "invalidated",
      request: structuredClone(savedScope.request),
      issues: current.issues,
      previousProvenance: structuredClone(savedScope.previousProvenance ?? null),
      retainedDesignProjection: structuredClone(savedScope.designProjection ?? { status: "not_requested" }),
    };
  });
  const snapshot: ProgressiveEntrySnapshot = {
    schemaVersion: PROGRESSIVE_ENTRY_SNAPSHOT_VERSION,
    projectId: input.projectId,
    savedAt: input.savedAt,
    canvas: input.canvas,
    activePattern: input.activePattern,
    pendingPattern: input.pendingPattern ?? null,
    surfacePlan: selectSurfacePlanFromCanvasAndPattern(input.canvas, input.activePattern),
    records: input.records.map((record) => ({
      ...record,
      eligibility: recordEligibility(input.canvas, input.activePattern, record),
    })),
    rawLineage: input.rawLineage,
    designProjection: input.designProjection ?? { status: "not_requested" },
    analysisScopes,
  };
  return validateProgressiveEntrySnapshot(snapshot);
}

export function serializeProgressiveEntrySnapshot(snapshot: ProgressiveEntrySnapshot): string {
  return JSON.stringify(validateProgressiveEntrySnapshot(snapshot));
}

export function parseProgressiveEntrySnapshot(text: string): ProgressiveEntrySnapshot {
  const parsed = JSON.parse(text) as ProgressiveEntrySnapshot;
  return validateProgressiveEntrySnapshot(parsed);
}

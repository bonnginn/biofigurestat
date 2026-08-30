import { assembleProjectPackage } from "./assembly";
import { ProjectCompatibilityError } from "./compatibility-error";
import {
  openProjectPackage,
  saveProjectPackage,
  type ProjectPackageStorage,
  type Sha256Function,
} from "./package-io";
import { ProjectManifestSchema } from "./manifest";
import { migrateProjectState, ProjectStateSchema, type ProjectState } from "./state";
import {
  deserializeUnresolvedVisualizationProjectState,
  parseUnresolvedVisualizationProjectState,
  serializeUnresolvedVisualizationProjectState,
  type UnresolvedVisualizationProjectState,
} from "./unresolved-visualization";
import {
  deserializeProgressiveExperimentProjectState,
  isMonotonicProgressiveTimestamp,
  parseProgressiveExperimentProjectState,
  progressiveLineageHashMatches,
  serializeProgressiveExperimentSetupRecovery,
  serializeProgressiveExperimentProjectState,
  type ProgressiveExperimentProjectState,
} from "./progressive-experiment";
import {
  deserializeSpecializedEntryDraftProjectState,
  serializeSpecializedEntryDraftProjectState,
  SpecializedEntryDraftProjectStateSchema,
  type SpecializedEntryDraftProjectState,
} from "./specialized-entry-draft";

export interface ProjectDatabaseCodec {
  encode(state: ProjectState): Promise<Uint8Array>;
  decode(database: Uint8Array): Promise<unknown>;
}

function unresolvedVisualizationRevisionRawPath(revisionId: string): string {
  const safeRevisionId = revisionId.replace(/[^A-Za-z0-9._-]/g, "_");
  return `raw/exports/visualization-revisions/${safeRevisionId}.txt`;
}

function retainedTextMatches(bytes: Uint8Array, expected: string): boolean {
  return new TextDecoder("utf-8", { fatal: true }).decode(bytes) === expected;
}

export async function saveProjectStatePackage(input: {
  storage: ProjectPackageStorage;
  databaseCodec: ProjectDatabaseCodec;
  target: string;
  state: ProjectState;
  sha256: Sha256Function;
  appVersion: string;
  savedAt: string;
}): Promise<ProjectState> {
  const state = ProjectStateSchema.parse({
    ...input.state,
    metadata: { ...input.state.metadata, updatedAt: input.savedAt },
  });
  const database = await input.databaseCodec.encode(state);
  const assembled = await assembleProjectPackage(
    state,
    database,
    input.sha256,
    input.appVersion,
    input.savedAt,
  );
  await saveProjectPackage(
    input.storage,
    input.target,
    assembled.manifest,
    assembled.payloads,
    input.sha256,
  );
  return state;
}

export async function openProjectStatePackage(input: {
  storage: ProjectPackageStorage;
  databaseCodec: ProjectDatabaseCodec;
  target: string;
  sha256: Sha256Function;
}): Promise<ProjectState> {
  const opened = await openProjectPackage(input.storage, input.target, input.sha256);
  if (opened.manifest.projectKind !== "experiment") {
    throw new ProjectCompatibilityError("PROJECT_KIND_MISMATCH");
  }
  const database = opened.files[opened.manifest.recovery.databasePath];
  if (!database) throw new Error("The project database declared by the manifest is missing");
  const migrated = migrateProjectState(await input.databaseCodec.decode(database));
  const parsed = ProjectStateSchema.safeParse(migrated);
  if (!parsed.success) {
    throw new ProjectCompatibilityError("PROJECT_CONTENT_INVALID", { cause: parsed.error });
  }
  const state = parsed.data;
  if (
    state.metadata.projectId !== opened.manifest.projectId ||
    state.metadata.projectName !== opened.manifest.metadata.projectName
  ) {
    throw new Error(
      "Project manifest and relational project state do not describe the same project",
    );
  }
  return state;
}

/**
 * Save an unresolved visualization/table project without routing it through
 * the relational ExperimentDesign database. The JSON database path is
 * intentional: the desktop container accepts arbitrary declared payloads,
 * while the normal SQLite encoder must continue to receive only ProjectState.
 */
export async function saveUnresolvedVisualizationProjectPackage(input: {
  storage: ProjectPackageStorage;
  target: string;
  state: UnresolvedVisualizationProjectState;
  sha256: Sha256Function;
  appVersion: string;
  savedAt: string;
}): Promise<UnresolvedVisualizationProjectState> {
  const state = parseUnresolvedVisualizationProjectState({
    ...input.state,
    metadata: { ...input.state.metadata, updatedAt: input.savedAt },
  });
  const database = serializeUnresolvedVisualizationProjectState(state);
  const rawExports = state.dataRevisions.map((revision) => ({
    path: unresolvedVisualizationRevisionRawPath(revision.id),
    bytes: new TextEncoder().encode(revision.rawLineage.rawText),
  }));
  const activeRawPath = unresolvedVisualizationRevisionRawPath(state.activeDataRevisionId);
  const rawManifestFiles = await Promise.all(
    rawExports.map(async ({ path, bytes }) => ({
      path,
      role: "raw_export" as const,
      sha256: await input.sha256(bytes),
      sizeBytes: bytes.byteLength,
    })),
  );
  const manifest = ProjectManifestSchema.parse({
    format: "life-science-analysis-project",
    formatVersion: "0.2.0",
    projectKind: "unresolved_visualization",
    projectId: state.metadata.projectId,
    metadata: state.metadata,
    appVersion: input.appVersion,
    schemaVersions: {
      design: "unresolved",
      data: state.schemaVersion,
      analysis: "unresolved",
      graph: "0.1.0",
    },
    createdAt: state.metadata.createdAt,
    savedAt: input.savedAt,
    files: [
      {
        path: "project.json",
        role: "database",
        sha256: await input.sha256(database),
        sizeBytes: database.byteLength,
      },
      ...rawManifestFiles,
    ],
    recovery: {
      canonicalRawExportPath: activeRawPath,
      databasePath: "project.json",
    },
  });
  const payloads: Record<string, Uint8Array> = { "project.json": database };
  rawExports.forEach(({ path, bytes }) => {
    payloads[path] = bytes;
  });
  await saveProjectPackage(input.storage, input.target, manifest, payloads, input.sha256);
  return state;
}

export async function openUnresolvedVisualizationProjectPackage(input: {
  storage: ProjectPackageStorage;
  target: string;
  sha256: Sha256Function;
}): Promise<UnresolvedVisualizationProjectState> {
  const opened = await openProjectPackage(input.storage, input.target, input.sha256);
  if (opened.manifest.projectKind !== "unresolved_visualization") {
    throw new ProjectCompatibilityError("PROJECT_KIND_MISMATCH");
  }
  const database = opened.files[opened.manifest.recovery.databasePath];
  if (!database) throw new Error("The unresolved visualization database is missing");
  const state = deserializeUnresolvedVisualizationProjectState(database);
  if (JSON.stringify(state.metadata) !== JSON.stringify(opened.manifest.metadata)) {
    throw new Error("Project manifest and unresolved visualization state do not match");
  }
  if (
    opened.manifest.createdAt !== state.metadata.createdAt ||
    opened.manifest.savedAt !== state.metadata.updatedAt
  ) {
    throw new Error("Unresolved visualization manifest timestamps do not match the saved state");
  }
  if (
    opened.manifest.schemaVersions.design !== "unresolved" ||
    opened.manifest.schemaVersions.analysis !== "unresolved" ||
    (opened.manifest.schemaVersions.data !== state.schemaVersion &&
      !(
        opened.manifest.schemaVersions.data === "0.1.0" &&
        state.schemaVersion === "0.2.0" &&
        state.dataRevisions.length === 1
      ))
  ) {
    throw new Error("Unresolved visualization manifest declares incompatible schema semantics");
  }
  const rawExport = opened.files[opened.manifest.recovery.canonicalRawExportPath];
  if (!rawExport) throw new Error("The unresolved visualization raw export is missing");
  if (!retainedTextMatches(rawExport, state.rawLineage.rawText)) {
    throw new Error("Unresolved visualization raw export does not match retained lineage");
  }
  const isLegacySingleExport =
    opened.manifest.schemaVersions.data === "0.1.0" && state.dataRevisions.length === 1;
  state.dataRevisions.forEach((revision) => {
    const revisionPath = unresolvedVisualizationRevisionRawPath(revision.id);
    const revisionExport = opened.files[revisionPath];
    if (!revisionExport) {
      if (isLegacySingleExport) return;
      throw new Error(`Unresolved visualization raw revision export is missing: ${revision.id}`);
    }
    if (!retainedTextMatches(revisionExport, revision.rawLineage.rawText)) {
      throw new Error(
        `Unresolved visualization raw revision export does not match retained lineage: ${revision.id}`,
      );
    }
  });
  return state;
}

export async function saveProgressiveExperimentProjectPackage(input: {
  storage: ProjectPackageStorage;
  target: string;
  state: ProgressiveExperimentProjectState;
  sha256: Sha256Function;
  appVersion: string;
  savedAt: string;
}): Promise<ProgressiveExperimentProjectState> {
  if (!isMonotonicProgressiveTimestamp(input.state, input.savedAt)) {
    throw new Error("Progressive experiment save time cannot precede persisted history");
  }
  const state = parseProgressiveExperimentProjectState({
    ...input.state,
    metadata: { ...input.state.metadata, updatedAt: input.savedAt },
    progressiveEntry: { ...input.state.progressiveEntry, savedAt: input.savedAt },
  });
  if (
    state.entryStage === "data" &&
    !(await progressiveLineageHashMatches(state.progressiveEntry, input.sha256))
  ) {
    throw new Error("Progressive experiment lineage hash does not match retained raw text");
  }
  const database = serializeProgressiveExperimentProjectState(state);
  const isSetup = state.entryStage === "setup";
  const recoveryExport = isSetup
    ? serializeProgressiveExperimentSetupRecovery(state)
    : new TextEncoder().encode(state.progressiveEntry.rawLineage?.rawText ?? "");
  const recoveryPath = isSetup
    ? "raw/exports/pre-sheet-semantic-state.json"
    : "raw/exports/progressive-entry-recovery.json";
  const manifest = ProjectManifestSchema.parse({
    format: "life-science-analysis-project",
    formatVersion: "0.2.0",
    projectKind: "progressive_experiment",
    projectId: state.metadata.projectId,
    metadata: state.metadata,
    appVersion: input.appVersion,
    schemaVersions: {
      design: "progressive-unresolved",
      data: isSetup ? "pre-observation" : state.schemaVersion,
      analysis: "unresolved",
      graph: isSetup ? "unresolved" : state.schemaVersion,
    },
    createdAt: state.metadata.createdAt,
    savedAt: input.savedAt,
    files: [
      {
        path: "progressive-project.json",
        role: "database",
        sha256: await input.sha256(database),
        sizeBytes: database.byteLength,
      },
      {
        path: recoveryPath,
        role: "raw_export",
        sha256: await input.sha256(recoveryExport),
        sizeBytes: recoveryExport.byteLength,
      },
    ],
    recovery: {
      canonicalRawExportPath: recoveryPath,
      databasePath: "progressive-project.json",
    },
  });
  await saveProjectPackage(
    input.storage,
    input.target,
    manifest,
    { "progressive-project.json": database, [recoveryPath]: recoveryExport },
    input.sha256,
  );
  return state;
}

export async function openProgressiveExperimentProjectPackage(input: {
  storage: ProjectPackageStorage;
  target: string;
  sha256: Sha256Function;
}): Promise<ProgressiveExperimentProjectState> {
  const opened = await openProjectPackage(input.storage, input.target, input.sha256);
  if (opened.manifest.projectKind !== "progressive_experiment") {
    throw new ProjectCompatibilityError("PROJECT_KIND_MISMATCH");
  }
  const database = opened.files[opened.manifest.recovery.databasePath];
  if (!database) throw new Error("The progressive experiment database is missing");
  const state = deserializeProgressiveExperimentProjectState(database);
  if (
    state.entryStage === "data" &&
    !(await progressiveLineageHashMatches(state.progressiveEntry, input.sha256))
  ) {
    throw new Error("Progressive experiment lineage hash does not match retained raw text");
  }
  if (JSON.stringify(state.metadata) !== JSON.stringify(opened.manifest.metadata)) {
    throw new Error("Project manifest and progressive experiment state do not match");
  }
  if (
    opened.manifest.createdAt !== state.metadata.createdAt ||
    opened.manifest.savedAt !== state.metadata.updatedAt ||
    opened.manifest.savedAt !== state.progressiveEntry.savedAt
  ) {
    throw new Error("Progressive experiment manifest timestamps do not match the saved state");
  }
  if (
    opened.manifest.schemaVersions.design !== "progressive-unresolved" ||
    opened.manifest.schemaVersions.analysis !== "unresolved" ||
    opened.manifest.schemaVersions.data !==
      (state.entryStage === "setup" ? "pre-observation" : state.schemaVersion) ||
    opened.manifest.schemaVersions.graph !==
      (state.entryStage === "setup" ? "unresolved" : state.schemaVersion)
  ) {
    throw new Error("Progressive experiment manifest declares incompatible schema semantics");
  }
  const recoveryExport = opened.files[opened.manifest.recovery.canonicalRawExportPath];
  if (!recoveryExport) throw new Error("The progressive experiment recovery export is missing");
  const expectedRecovery =
    state.entryStage === "setup"
      ? serializeProgressiveExperimentSetupRecovery(state)
      : new TextEncoder().encode(state.progressiveEntry.rawLineage?.rawText ?? "");
  if (
    recoveryExport.byteLength !== expectedRecovery.byteLength ||
    recoveryExport.some((byte, index) => byte !== expectedRecovery[index])
  ) {
    throw new Error("Progressive experiment recovery export does not match retained state");
  }
  return state;
}

const SPECIALIZED_ENTRY_DRAFT_DATABASE_PATH = "specialized-entry-draft.json";
const SPECIALIZED_ENTRY_DRAFT_RECOVERY_PATH = "raw/exports/specialized-entry-draft.txt";

export async function saveSpecializedEntryDraftProjectPackage(input: {
  storage: ProjectPackageStorage;
  target: string;
  state: SpecializedEntryDraftProjectState;
  sha256: Sha256Function;
  appVersion: string;
  savedAt: string;
}): Promise<SpecializedEntryDraftProjectState> {
  const state = SpecializedEntryDraftProjectStateSchema.parse({
    ...input.state,
    metadata: { ...input.state.metadata, updatedAt: input.savedAt },
    provenanceEvents: [
      ...input.state.provenanceEvents,
      {
        id: `specialized-draft.save.${input.state.provenanceEvents.length + 1}`,
        kind: "specialized_entry_draft_saved",
        occurredAt: input.savedAt,
        actor: "researcher",
      },
    ],
  });
  const database = serializeSpecializedEntryDraftProjectState(state);
  const recovery = new TextEncoder().encode(state.rawLineage.rawText);
  const manifest = ProjectManifestSchema.parse({
    format: "life-science-analysis-project",
    formatVersion: "0.2.0",
    projectKind: "specialized_entry_draft",
    projectId: state.metadata.projectId,
    metadata: state.metadata,
    appVersion: input.appVersion,
    schemaVersions: {
      design: "specialized-entry-unresolved",
      data: state.schemaVersion,
      analysis: "unresolved",
      graph: "unresolved",
    },
    createdAt: state.metadata.createdAt,
    savedAt: input.savedAt,
    files: [
      {
        path: SPECIALIZED_ENTRY_DRAFT_DATABASE_PATH,
        role: "database",
        sha256: await input.sha256(database),
        sizeBytes: database.byteLength,
      },
      {
        path: SPECIALIZED_ENTRY_DRAFT_RECOVERY_PATH,
        role: "raw_export",
        sha256: await input.sha256(recovery),
        sizeBytes: recovery.byteLength,
      },
    ],
    recovery: {
      canonicalRawExportPath: SPECIALIZED_ENTRY_DRAFT_RECOVERY_PATH,
      databasePath: SPECIALIZED_ENTRY_DRAFT_DATABASE_PATH,
    },
  });
  await saveProjectPackage(
    input.storage,
    input.target,
    manifest,
    {
      [SPECIALIZED_ENTRY_DRAFT_DATABASE_PATH]: database,
      [SPECIALIZED_ENTRY_DRAFT_RECOVERY_PATH]: recovery,
    },
    input.sha256,
  );
  return state;
}

export async function openSpecializedEntryDraftProjectPackage(input: {
  storage: ProjectPackageStorage;
  target: string;
  sha256: Sha256Function;
}): Promise<SpecializedEntryDraftProjectState> {
  const opened = await openProjectPackage(input.storage, input.target, input.sha256);
  if (opened.manifest.projectKind !== "specialized_entry_draft") {
    throw new ProjectCompatibilityError("PROJECT_KIND_MISMATCH");
  }
  const database = opened.files[opened.manifest.recovery.databasePath];
  if (!database) throw new Error("The specialized entry draft database is missing");
  const state = deserializeSpecializedEntryDraftProjectState(database);
  if (JSON.stringify(state.metadata) !== JSON.stringify(opened.manifest.metadata)) {
    throw new Error("Project manifest and specialized entry draft state do not match");
  }
  if (
    opened.manifest.createdAt !== state.metadata.createdAt ||
    opened.manifest.savedAt !== state.metadata.updatedAt
  ) {
    throw new Error("Specialized entry draft manifest timestamps do not match the saved state");
  }
  if (
    opened.manifest.schemaVersions.design !== "specialized-entry-unresolved" ||
    opened.manifest.schemaVersions.data !== state.schemaVersion ||
    opened.manifest.schemaVersions.analysis !== "unresolved" ||
    opened.manifest.schemaVersions.graph !== "unresolved"
  ) {
    throw new Error("Specialized entry draft manifest declares incompatible schema semantics");
  }
  const recovery = opened.files[opened.manifest.recovery.canonicalRawExportPath];
  if (!recovery || !retainedTextMatches(recovery, state.rawLineage.rawText)) {
    throw new Error("Specialized entry draft recovery text does not match retained lineage");
  }
  return state;
}

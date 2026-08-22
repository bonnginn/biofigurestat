import { assembleProjectPackage } from "./assembly";
import {
  openProjectPackage,
  saveProjectPackage,
  type ProjectPackageStorage,
  type Sha256Function,
} from "./package-io";
import { migrateProjectState, ProjectStateSchema, type ProjectState } from "./state";

export interface ProjectDatabaseCodec {
  encode(state: ProjectState): Promise<Uint8Array>;
  decode(database: Uint8Array): Promise<unknown>;
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
  const database = opened.files[opened.manifest.recovery.databasePath];
  if (!database) throw new Error("The project database declared by the manifest is missing");
  const state = ProjectStateSchema.parse(
    migrateProjectState(await input.databaseCodec.decode(database)),
  );
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

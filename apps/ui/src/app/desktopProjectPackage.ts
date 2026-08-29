import { invoke, isTauri } from "@tauri-apps/api/core";
import { open, save } from "@tauri-apps/plugin-dialog";
import {
  decodeProjectManifest,
  openProjectStatePackage,
  openSpecializedEntryDraftProjectPackage,
  openUnresolvedVisualizationProjectPackage,
  saveProjectStatePackage,
  saveSpecializedEntryDraftProjectPackage,
  saveUnresolvedVisualizationProjectPackage,
  type AtomicProjectWrite,
  type ProjectDatabaseCodec,
  type ProjectPackageStorage,
  type ProjectState,
  type Sha256Function,
  type SpecializedEntryDraftProjectState,
  type UnresolvedVisualizationProjectState,
} from "@lsaa/project";
import { defaultProjectFileName } from "./projectFileName";
import type { OpenedAnyProject } from "./projectActions";

const APP_VERSION = "0.1.0";

type ProjectIoStage =
  | "checksum"
  | "database_encode"
  | "container_begin"
  | "container_write"
  | "container_commit"
  | "package_assembly";

function projectIoStageError(stage: ProjectIoStage, error: unknown): Error {
  const detail = error instanceof Error ? error.message : String(error);
  return new Error(`PROJECT_IO_STAGE[${stage}]: ${detail}`, { cause: error });
}

export class TauriProjectContainerStorage implements ProjectPackageStorage {
  async readFile(target: string, relativePath: string): Promise<Uint8Array> {
    const data = await invoke<number[]>("read_project_file", { target, relativePath });
    return Uint8Array.from(data);
  }

  async beginAtomicWrite(target: string): Promise<AtomicProjectWrite> {
    let transactionId: string;
    try {
      transactionId = await invoke<string>("begin_atomic_project_write", { target });
    } catch (error) {
      throw projectIoStageError("container_begin", error);
    }
    let closed = false;
    return {
      writeFile: async (relativePath, data) => {
        if (closed) throw new Error("Project save transaction is already closed");
        try {
          await invoke("write_project_file", {
            transactionId,
            relativePath,
            data: Array.from(data),
          });
        } catch (error) {
          throw projectIoStageError("container_write", error);
        }
      },
      commit: async () => {
        if (closed) throw new Error("Project save transaction is already closed");
        try {
          await invoke("commit_project_write", { transactionId });
        } catch (error) {
          throw projectIoStageError("container_commit", error);
        }
        closed = true;
      },
      rollback: async () => {
        if (closed) return;
        await invoke("rollback_project_write", { transactionId });
        closed = true;
      },
    };
  }
}

export const browserSha256: Sha256Function = async (data) => {
  const bytes = Uint8Array.from(data);
  if (isTauri()) {
    try {
      return await invoke<string>("sha256_bytes", { data: Array.from(bytes) });
    } catch (error) {
      throw projectIoStageError("checksum", error);
    }
  }
  const digest = await crypto.subtle.digest("SHA-256", bytes);
  return Array.from(new Uint8Array(digest), (byte) => byte.toString(16).padStart(2, "0")).join("");
};

class TauriProjectDatabaseCodec implements ProjectDatabaseCodec {
  async encode(state: ProjectState): Promise<Uint8Array> {
    try {
      return Uint8Array.from(await invoke<number[]>("encode_project_database", { state }));
    } catch (error) {
      throw projectIoStageError("database_encode", error);
    }
  }

  async decode(database: Uint8Array): Promise<unknown> {
    return invoke<unknown>("decode_project_database", { data: Array.from(database) });
  }
}

export type OpenedLocalProject = {
  state: ProjectState;
  target: string;
};

export async function openLocalProjectPackageAt(target: string): Promise<OpenedLocalProject> {
  if (!isTauri()) throw new Error("Local project opening is available in the desktop app only.");
  const state = await openProjectStatePackage({
    storage: new TauriProjectContainerStorage(),
    databaseCodec: new TauriProjectDatabaseCodec(),
    target,
    sha256: browserSha256,
  });
  return { state, target };
}

export async function openLocalProjectPackage(): Promise<OpenedLocalProject | null> {
  if (!isTauri()) throw new Error("Local project opening is available in the desktop app only.");
  const selected = await open({
    directory: false,
    multiple: false,
    title: "Open Life Science Analysis project",
    filters: [{ name: "Life Science Analysis project", extensions: ["lsa"] }],
  });
  if (selected === null) return null;

  return openLocalProjectPackageAt(selected);
}

/**
 * Read the package discriminator before selecting a state reader. This keeps
 * the common .lsa entry point bounded: exactly one file picker is shown, and a
 * package is never coerced into another project kind based on its contents.
 */
export async function openLocalAnyProjectPackageAt(target: string): Promise<OpenedAnyProject> {
  if (!isTauri()) throw new Error("Local project opening is available in the desktop app only.");
  const storage = new TauriProjectContainerStorage();
  let manifest: ReturnType<typeof decodeProjectManifest>;
  try {
    manifest = decodeProjectManifest(await storage.readFile(target, "manifest.json"));
  } catch (error) {
    throw new Error(
      "この .lsa ファイルの manifest.json を確認できません。ファイルが破損しているか、対応していない形式です。",
      { cause: error },
    );
  }

  switch (manifest.projectKind) {
    case "experiment":
      return {
        kind: "experiment",
        project: await openLocalProjectPackageAt(target),
      };
    case "unresolved_visualization":
      return {
        kind: "unresolved_visualization",
        project: await openLocalUnresolvedVisualizationProjectPackageAt(target),
      };
    case "progressive_experiment":
      throw new Error(
        "この .lsa ファイルは入力途中の実験です。通常のプロジェクト画面からは開けません。元の保存場所を確認するか、対応する復旧手順を使用してください。",
      );
    case "specialized_entry_draft":
      return {
        kind: "specialized_entry_draft",
        project: await openLocalSpecializedEntryDraftProjectPackageAt(target),
      };
    default: {
      const unreachable: never = manifest.projectKind;
      throw new Error(`対応していない .lsa projectKind: ${String(unreachable)}`);
    }
  }
}

export async function openLocalAnyProjectPackage(): Promise<OpenedAnyProject | null> {
  if (!isTauri()) throw new Error("Local project opening is available in the desktop app only.");
  const selected = await open({
    directory: false,
    multiple: false,
    title: "Life Science Analysis projectを開く",
    filters: [{ name: "Life Science Analysis project", extensions: ["lsa"] }],
  });
  if (selected === null) return null;

  return openLocalAnyProjectPackageAt(selected);
}

export type OpenedLocalUnresolvedVisualizationProject = {
  state: UnresolvedVisualizationProjectState;
  target: string;
};

export async function openLocalUnresolvedVisualizationProjectPackageAt(
  target: string,
): Promise<OpenedLocalUnresolvedVisualizationProject> {
  if (!isTauri()) throw new Error("Local project opening is available in the desktop app only.");
  const state = await openUnresolvedVisualizationProjectPackage({
    storage: new TauriProjectContainerStorage(),
    target,
    sha256: browserSha256,
  });
  return { state, target };
}

export async function openLocalUnresolvedVisualizationProjectPackage(): Promise<OpenedLocalUnresolvedVisualizationProject | null> {
  if (!isTauri()) throw new Error("Local project opening is available in the desktop app only.");
  const selected = await open({
    directory: false,
    multiple: false,
    title: "Open visualization Life Science Analysis project",
    filters: [{ name: "Life Science Analysis project", extensions: ["lsa"] }],
  });
  if (selected === null) return null;

  return openLocalUnresolvedVisualizationProjectPackageAt(selected);
}

export async function openLegacyLocalProjectPackage(): Promise<OpenedLocalProject | null> {
  if (!isTauri()) throw new Error("Local project opening is available in the desktop app only.");
  const selected = await open({
    directory: true,
    multiple: false,
    title: "旧形式のLife Science Analysis projectフォルダを取り込む",
  });
  if (selected === null) return null;

  return openLocalProjectPackageAt(selected);
}

export type SavedLocalProject = {
  state: ProjectState;
  target: string;
};

export async function saveLocalProjectPackage(
  stateInput: ProjectState,
  existingTarget?: string,
): Promise<SavedLocalProject | null> {
  if (!isTauri()) throw new Error("Local project saving is available in the desktop app only.");
  const state = stateInput;
  const selected =
    existingTarget ??
    (await save({
      title: "Life Science Analysisプロジェクトを保存",
      defaultPath: defaultProjectFileName(state.metadata.projectName),
      filters: [{ name: "Life Science Analysis project", extensions: ["lsa"] }],
    }));
  if (selected === null) return null;

  const savedAt = new Date().toISOString();
  let savedState: ProjectState;
  try {
    savedState = await saveProjectStatePackage({
      storage: new TauriProjectContainerStorage(),
      databaseCodec: new TauriProjectDatabaseCodec(),
      target: selected,
      state,
      sha256: browserSha256,
      appVersion: APP_VERSION,
      savedAt,
    });
  } catch (error) {
    if (error instanceof Error && error.message.startsWith("PROJECT_IO_STAGE[")) throw error;
    throw projectIoStageError("package_assembly", error);
  }
  return { state: savedState, target: selected };
}

export type SavedLocalUnresolvedVisualizationProject = {
  state: UnresolvedVisualizationProjectState;
  target: string;
};

export async function saveLocalUnresolvedVisualizationProjectPackage(
  state: UnresolvedVisualizationProjectState,
  existingTarget?: string,
): Promise<SavedLocalUnresolvedVisualizationProject | null> {
  if (!isTauri()) throw new Error("Local project saving is available in the desktop app only.");
  const selected =
    existingTarget ??
    (await save({
      title: "Visualization Life Science Analysisプロジェクトを保存",
      defaultPath: defaultProjectFileName(state.metadata.projectName),
      filters: [{ name: "Life Science Analysis project", extensions: ["lsa"] }],
    }));
  if (selected === null) return null;

  const savedAt = new Date().toISOString();
  let savedState: UnresolvedVisualizationProjectState;
  try {
    savedState = await saveUnresolvedVisualizationProjectPackage({
      storage: new TauriProjectContainerStorage(),
      target: selected,
      state,
      sha256: browserSha256,
      appVersion: APP_VERSION,
      savedAt,
    });
  } catch (error) {
    if (error instanceof Error && error.message.startsWith("PROJECT_IO_STAGE[")) throw error;
    throw projectIoStageError("package_assembly", error);
  }
  return { state: savedState, target: selected };
}

export type OpenedLocalSpecializedEntryDraftProject = {
  state: SpecializedEntryDraftProjectState;
  target: string;
};

export async function openLocalSpecializedEntryDraftProjectPackageAt(
  target: string,
): Promise<OpenedLocalSpecializedEntryDraftProject> {
  if (!isTauri()) throw new Error("Local project opening is available in the desktop app only.");
  const state = await openSpecializedEntryDraftProjectPackage({
    storage: new TauriProjectContainerStorage(),
    target,
    sha256: browserSha256,
  });
  return { state, target };
}

export async function saveLocalSpecializedEntryDraftProjectPackage(
  state: SpecializedEntryDraftProjectState,
  existingTarget?: string,
): Promise<OpenedLocalSpecializedEntryDraftProject | null> {
  if (!isTauri()) throw new Error("Local project saving is available in the desktop app only.");
  const selected =
    existingTarget ??
    (await save({
      title: "入力途中のLife Science Analysisプロジェクトを保存",
      defaultPath: defaultProjectFileName(state.metadata.projectName),
      filters: [{ name: "Life Science Analysis project", extensions: ["lsa"] }],
    }));
  if (selected === null) return null;

  const savedAt = new Date().toISOString();
  let savedState: SpecializedEntryDraftProjectState;
  try {
    savedState = await saveSpecializedEntryDraftProjectPackage({
      storage: new TauriProjectContainerStorage(),
      target: selected,
      state,
      sha256: browserSha256,
      appVersion: APP_VERSION,
      savedAt,
    });
  } catch (error) {
    if (error instanceof Error && error.message.startsWith("PROJECT_IO_STAGE[")) throw error;
    throw projectIoStageError("package_assembly", error);
  }
  return { state: savedState, target: selected };
}

import { invoke, isTauri } from "@tauri-apps/api/core";
import { open, save } from "@tauri-apps/plugin-dialog";
import {
  openProjectStatePackage,
  saveProjectStatePackage,
  type AtomicProjectWrite,
  type ProjectDatabaseCodec,
  type ProjectPackageStorage,
  type ProjectState,
  type Sha256Function,
} from "@lsaa/project";

const APP_VERSION = "0.1.0";

export class TauriProjectContainerStorage implements ProjectPackageStorage {
  async readFile(target: string, relativePath: string): Promise<Uint8Array> {
    const data = await invoke<number[]>("read_project_file", { target, relativePath });
    return Uint8Array.from(data);
  }

  async beginAtomicWrite(target: string): Promise<AtomicProjectWrite> {
    const transactionId = await invoke<string>("begin_atomic_project_write", { target });
    let closed = false;
    return {
      writeFile: async (relativePath, data) => {
        if (closed) throw new Error("Project save transaction is already closed");
        await invoke("write_project_file", {
          transactionId,
          relativePath,
          data: Array.from(data),
        });
      },
      commit: async () => {
        if (closed) throw new Error("Project save transaction is already closed");
        await invoke("commit_project_write", { transactionId });
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
  const digest = await crypto.subtle.digest("SHA-256", bytes);
  return Array.from(new Uint8Array(digest), (byte) => byte.toString(16).padStart(2, "0")).join("");
};

class TauriProjectDatabaseCodec implements ProjectDatabaseCodec {
  async encode(state: ProjectState): Promise<Uint8Array> {
    return Uint8Array.from(await invoke<number[]>("encode_project_database", { state }));
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
      defaultPath: `${state.metadata.projectName}.lsa`,
      filters: [{ name: "Life Science Analysis project", extensions: ["lsa"] }],
    }));
  if (selected === null) return null;

  const savedAt = new Date().toISOString();
  const savedState = await saveProjectStatePackage({
    storage: new TauriProjectContainerStorage(),
    databaseCodec: new TauriProjectDatabaseCodec(),
    target: selected,
    state,
    sha256: browserSha256,
    appVersion: APP_VERSION,
    savedAt,
  });
  return { state: savedState, target: selected };
}

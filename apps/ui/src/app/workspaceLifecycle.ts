import type { OpenedAnyProject } from "./projectActions";

export type WorkspaceSaveHandler = (saveAs?: boolean) => Promise<boolean>;

export type WorkspaceLifecycleRegistration = Readonly<{
  save: WorkspaceSaveHandler;
  /**
   * Returns the current validated project without writing it to disk.  This is
   * used only to keep a dirty, already-saved project alive while Home, New, or
   * Open is shown in the same application window.
   */
  checkpoint?: () => OpenedAnyProject | null;
}>;

export type RegisterWorkspaceSaveHandler = (
  handler: WorkspaceSaveHandler | WorkspaceLifecycleRegistration | null,
) => void;

export type WorkspaceExitRequest = Readonly<{
  actionLabel: string;
  proceed: () => void | Promise<void>;
}>;

export type RequestWorkspaceExit = (request: WorkspaceExitRequest) => void;

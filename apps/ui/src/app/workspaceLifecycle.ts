export type WorkspaceSaveHandler = (saveAs?: boolean) => Promise<boolean>;

export type RegisterWorkspaceSaveHandler = (
  handler: WorkspaceSaveHandler | null,
) => void;

export type WorkspaceExitRequest = Readonly<{
  actionLabel: string;
  proceed: () => void | Promise<void>;
}>;

export type RequestWorkspaceExit = (request: WorkspaceExitRequest) => void;

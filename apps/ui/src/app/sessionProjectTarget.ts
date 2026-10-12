import { createWorkspaceProjectId } from "./workspaceProjectIdentity";

const SESSION_PREFIX = "session:workspace:";

/** Process-local tab identity. It must never reach the native file-save adapter. */
export function newSessionProjectTarget(): string {
  return `${SESSION_PREFIX}${createWorkspaceProjectId()}`;
}

export function isSessionProjectTarget(target: string | undefined): boolean {
  return target?.startsWith(SESSION_PREFIX) ?? false;
}

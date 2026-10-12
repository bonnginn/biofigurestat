/** New project identities are independent of names, measurements and wall-clock time. */
export function createWorkspaceProjectId(): string {
  const entropy = globalThis.crypto.getRandomValues(new Uint8Array(16));
  const uniqueId = Array.from(entropy, (value) => value.toString(16).padStart(2, "0")).join("");
  return `project.workspace.${uniqueId}`;
}

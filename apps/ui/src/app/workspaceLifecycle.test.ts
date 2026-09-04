import { describe, expect, it, vi } from "vitest";

import { coalesceWorkspaceExitRequest, type WorkspaceExitRequest } from "./workspaceLifecycle";

function request(actionLabel: string): WorkspaceExitRequest {
  return { actionLabel, proceed: vi.fn() };
}

describe("workspace exit request coalescing", () => {
  it("keeps one pending request when native exit signals overlap", () => {
    const first = request("first");
    const duplicate = request("duplicate");

    expect(coalesceWorkspaceExitRequest(first, duplicate)).toBe(first);
  });

  it("accepts a new exit request after cancellation clears the pending request", () => {
    const retried = request("retry after cancel");

    expect(coalesceWorkspaceExitRequest(null, retried)).toBe(retried);
  });
});

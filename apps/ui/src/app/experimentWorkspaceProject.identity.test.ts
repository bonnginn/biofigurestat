import { afterEach, describe, expect, it, vi } from "vitest";
import { ProjectStateSchema } from "@lsaa/project";
import { createInternalAlphaCoreFixture } from "./syntheticFixtures";
import { createExperimentWorkspaceProject } from "./experimentWorkspaceProject";

const now = "2026-10-07T17:00:00.000Z";
const fixture = createInternalAlphaCoreFixture();
const input = { draft: fixture.draft, cells: fixture.cells, graphs: [], now };

afterEach(() => vi.restoreAllMocks());

describe("new workspace project identity", () => {
  it("keeps separately created projects distinct even when names, data and save times match", () => {
    const first = createExperimentWorkspaceProject(input);
    const second = createExperimentWorkspaceProject(input);
    expect(second.metadata.projectId).not.toBe(first.metadata.projectId);
    expect(second.metadata.projectName).toBe(first.metadata.projectName);
    expect(second.rawRevisions).toEqual(first.rawRevisions);
    expect(() => ProjectStateSchema.parse(first)).not.toThrow();
    expect(() => ProjectStateSchema.parse(second)).not.toThrow();
  });

  it("retains the saved project ID and old history when saving again at the same timestamp", () => {
    const first = createExperimentWorkspaceProject(input);
    const before = JSON.stringify(first);
    const next = createExperimentWorkspaceProject({ ...input, existingState: first });
    expect(next.metadata.projectId).toBe(first.metadata.projectId);
    expect(next.rawRevisions.slice(0, first.rawRevisions.length)).toEqual(first.rawRevisions);
    expect(next.designRevisions.slice(0, first.designRevisions.length)).toEqual(
      first.designRevisions,
    );
    expect(next.analysisRuns.slice(0, first.analysisRuns.length)).toEqual(first.analysisRuns);
    expect(JSON.stringify(first)).toBe(before);
  });

  it("preserves a legacy timestamp project ID without any identity migration", () => {
    const created = createExperimentWorkspaceProject(input);
    const legacyId = "project.workspace.1780851600000";
    const legacy = ProjectStateSchema.parse({
      ...created,
      metadata: { ...created.metadata, projectId: legacyId },
    });
    const next = createExperimentWorkspaceProject({ ...input, existingState: legacy });
    expect(next.metadata.projectId).toBe(legacyId);
  });

  it("does not require new entropy when retaining an existing project", () => {
    const saved = createExperimentWorkspaceProject(input);
    const random = vi.spyOn(globalThis.crypto, "getRandomValues").mockImplementation(() => {
      throw new Error("entropy unavailable");
    });
    const next = createExperimentWorkspaceProject({ ...input, existingState: saved });
    expect(next.metadata.projectId).toBe(saved.metadata.projectId);
    expect(random).not.toHaveBeenCalled();
  });

  it("stops new state creation when secure entropy is unavailable", () => {
    const before = JSON.stringify(input);
    vi.spyOn(globalThis.crypto, "getRandomValues").mockImplementation(() => {
      throw new Error("entropy unavailable");
    });
    expect(() => createExperimentWorkspaceProject(input)).toThrow("entropy unavailable");
    expect(JSON.stringify(input)).toBe(before);
  });
});

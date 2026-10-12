import { describe, expect, it } from "vitest";
import { ProjectStateSchema } from "@lsaa/project";

import { createExperimentWorkspaceProject } from "./experimentWorkspaceProject";
import { createInternalAlphaCoreFixture } from "./syntheticFixtures";
import { createWorkspaceProjectId } from "./workspaceProjectIdentity";

describe("unsaved serialization identity without a saved revision baseline", () => {
  it("retains identity and creation time without accumulating cancelled-attempt revisions", () => {
    const fixture = createInternalAlphaCoreFixture();
    const before = JSON.stringify(fixture);
    const input = { draft: fixture.draft, cells: fixture.cells, graphs: [] };
    const first = createExperimentWorkspaceProject({ ...input, now: "2026-10-08T01:00:00.000Z" });
    const retry = createExperimentWorkspaceProject({
      ...input,
      now: "2026-10-08T02:00:00.000Z",
      newProjectIdentity: {
        projectId: first.metadata.projectId,
        createdAt: first.metadata.createdAt,
      },
    });
    expect(retry.metadata.projectId).toBe(first.metadata.projectId);
    expect(retry.metadata.createdAt).toBe(first.metadata.createdAt);
    expect(retry.metadata.updatedAt).toBe("2026-10-08T02:00:00.000Z");
    expect(retry.rawRevisions).toHaveLength(1);
    expect(retry.designRevisions).toHaveLength(1);
    expect(retry.rawRevisions[0]?.previousRevisionId).toBeNull();
    expect(retry.observations).toHaveLength(first.observations.length);
    expect(retry.analysisRuns).toEqual([]);
    expect(ProjectStateSchema.parse(retry)).toEqual(retry);
    expect(JSON.stringify(fixture)).toBe(before);
  });

  it("keeps the existing project's entire state authoritative over another identity seed", () => {
    const fixture = createInternalAlphaCoreFixture();
    const input = { draft: fixture.draft, cells: fixture.cells, graphs: [] };
    const existing = createExperimentWorkspaceProject({ ...input, now: "2026-10-08T01:00:00.000Z" });
    const before = JSON.stringify(existing);
    const ordinary = createExperimentWorkspaceProject({
      ...input, existingState: existing, now: "2026-10-08T02:00:00.000Z",
    });
    const withOtherSeed = createExperimentWorkspaceProject({
      ...input,
      existingState: existing,
      now: "2026-10-08T02:00:00.000Z",
      newProjectIdentity: {
        projectId: createWorkspaceProjectId(),
        createdAt: "2025-01-01T00:00:00.000Z",
      },
    });
    expect(withOtherSeed).toEqual(ordinary);
    expect(withOtherSeed.metadata.projectId).toBe(existing.metadata.projectId);
    expect(withOtherSeed.metadata.createdAt).toBe(existing.metadata.createdAt);
    expect(JSON.stringify(existing)).toBe(before);
  });
});

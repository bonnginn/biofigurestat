import type { ProjectActions } from "./projectActions";
import { projectPersistenceCapabilities } from "./projectPersistenceCapabilities";

const openProject: ProjectActions["openProject"] = async () => null;

describe("project persistence capability pairing", () => {
  it("requires both unresolved-visualization save and reopen actions", () => {
    for (const [name, save, open, expected] of [
      ["none", false, false, false],
      ["save only", true, false, false],
      ["open only", false, true, false],
      ["both", true, true, true],
    ] as const) {
      const actions: ProjectActions = {
        openProject,
        ...(save ? { saveUnresolvedVisualizationProject: async () => null } : {}),
        ...(open ? { openUnresolvedVisualizationProject: async () => null } : {}),
      };
      expect(
        projectPersistenceCapabilities(actions).unresolvedVisualization,
        name,
      ).toBe(expected);
    }
  });

  it("requires both specialized-draft save and generic reopen actions", () => {
    for (const [name, save, open, expected] of [
      ["none", false, false, false],
      ["save only", true, false, false],
      ["open only", false, true, false],
      ["both", true, true, true],
    ] as const) {
      const actions: ProjectActions = {
        openProject,
        ...(save ? { saveSpecializedEntryDraftProject: async () => null } : {}),
        ...(open ? { openAnyProject: async () => null } : {}),
      };
      expect(projectPersistenceCapabilities(actions).specializedEntryDraft, name).toBe(expected);
    }
  });
});

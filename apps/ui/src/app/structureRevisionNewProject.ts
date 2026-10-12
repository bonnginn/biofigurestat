import type { ProjectState } from "@lsaa/project";
import type { BiologicalExperimentSetupResult } from "../components/BiologicalExperimentSetup";
import { createBiologicalSetupPresentation } from "./adaptiveStructureRevision";
import { createAdaptiveWorkspace } from "./adaptiveWorkspace";
import { createExperimentWorkspaceProject } from "./experimentWorkspaceProject";

export type StructureRevisionNewProject = Readonly<{
  sourceState: ProjectState;
  sourceTarget?: string;
  nextState: ProjectState;
}>;

/** Only edited design facts enter this new project; source data and history cannot leak. */
export function createProjectFromEditedConditions(result: BiologicalExperimentSetupResult): ProjectState {
  const presentation = createBiologicalSetupPresentation(result);
  if (presentation.status !== "ready") throw new Error("NEW_CONDITIONS_PRESENTATION_INVALID");
  const workspace = createAdaptiveWorkspace({
    contract: result.contract,
    observations: [],
    mapping: null,
    lineage: null,
    biologicalSetup: presentation.presentation,
  });
  if (workspace.status !== "ready" || !workspace.draft) {
    throw new Error("NEW_CONDITIONS_WORKSPACE_UNAVAILABLE");
  }
  // The existing factory owns secure 128-bit project identity and validated persisted state.
  return createExperimentWorkspaceProject({ draft: workspace.draft, cells: workspace.cells, graphs: [] });
}

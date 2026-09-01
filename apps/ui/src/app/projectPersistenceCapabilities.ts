import type { ProjectActions } from "./projectActions";

export type ProjectPersistenceCapabilities = Readonly<{
  unresolvedVisualization: boolean;
  specializedEntryDraft: boolean;
}>;

/** A persistence surface is available only when both save and reopen paths exist. */
export function projectPersistenceCapabilities(
  actions: ProjectActions,
): ProjectPersistenceCapabilities {
  return {
    unresolvedVisualization: Boolean(
      actions.saveUnresolvedVisualizationProject && actions.openUnresolvedVisualizationProject,
    ),
    specializedEntryDraft: Boolean(
      actions.saveSpecializedEntryDraftProject && actions.openAnyProject,
    ),
  };
}

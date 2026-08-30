import type {
  OpenProjectAction,
  OpenUnresolvedVisualizationProjectAction,
  ProjectActions,
  SaveProjectAction,
  SaveSpecializedEntryDraftProjectAction,
  SaveUnresolvedVisualizationProjectAction,
} from "./projectActions";
import {
  openLocalProjectPackage,
  openLocalProjectPackageAt,
  openLocalAnyProjectPackage,
  openLocalAnyProjectPackageAt,
  openLegacyLocalProjectPackage,
  saveLocalProjectPackage,
  openLocalUnresolvedVisualizationProjectPackage,
  saveLocalUnresolvedVisualizationProjectPackage,
  saveLocalSpecializedEntryDraftProjectPackage,
} from "./desktopProjectPackage";

export const openLocalProject: OpenProjectAction = openLocalProjectPackage;
export const saveLocalProject: SaveProjectAction = saveLocalProjectPackage;
export const openLocalUnresolvedVisualizationProject: OpenUnresolvedVisualizationProjectAction =
  openLocalUnresolvedVisualizationProjectPackage;
export const saveLocalUnresolvedVisualizationProject: SaveUnresolvedVisualizationProjectAction =
  saveLocalUnresolvedVisualizationProjectPackage;
export const saveLocalSpecializedEntryDraftProject: SaveSpecializedEntryDraftProjectAction =
  saveLocalSpecializedEntryDraftProjectPackage;

export const defaultProjectActions: ProjectActions = {
  openProject: openLocalProject,
  openLegacyProject: openLegacyLocalProjectPackage,
  openProjectTarget: openLocalProjectPackageAt,
  saveProject: saveLocalProject,
  openUnresolvedVisualizationProject: openLocalUnresolvedVisualizationProject,
  saveUnresolvedVisualizationProject: saveLocalUnresolvedVisualizationProject,
  saveSpecializedEntryDraftProject: saveLocalSpecializedEntryDraftProject,
  openAnyProject: openLocalAnyProjectPackage,
  openAnyProjectTarget: openLocalAnyProjectPackageAt,
};

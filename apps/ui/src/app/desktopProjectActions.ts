import type {
  OpenProjectAction,
  OpenUnresolvedVisualizationProjectAction,
  ProjectActions,
  SaveProjectAction,
  SaveUnresolvedVisualizationProjectAction,
} from "./projectActions";
import {
  openLocalProjectPackage,
  openLocalProjectPackageAt,
  openLegacyLocalProjectPackage,
  saveLocalProjectPackage,
  openLocalUnresolvedVisualizationProjectPackage,
  saveLocalUnresolvedVisualizationProjectPackage,
} from "./desktopProjectPackage";

export const openLocalProject: OpenProjectAction = openLocalProjectPackage;
export const saveLocalProject: SaveProjectAction = saveLocalProjectPackage;
export const openLocalUnresolvedVisualizationProject: OpenUnresolvedVisualizationProjectAction =
  openLocalUnresolvedVisualizationProjectPackage;
export const saveLocalUnresolvedVisualizationProject: SaveUnresolvedVisualizationProjectAction =
  saveLocalUnresolvedVisualizationProjectPackage;

export const defaultProjectActions: ProjectActions = {
  openProject: openLocalProject,
  openLegacyProject: openLegacyLocalProjectPackage,
  openProjectTarget: openLocalProjectPackageAt,
  saveProject: saveLocalProject,
  openUnresolvedVisualizationProject: openLocalUnresolvedVisualizationProject,
  saveUnresolvedVisualizationProject: saveLocalUnresolvedVisualizationProject,
};

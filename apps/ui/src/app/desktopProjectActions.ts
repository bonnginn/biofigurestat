import type { OpenProjectAction, ProjectActions, SaveProjectAction } from "./projectActions";
import {
  openLocalProjectPackage,
  openLocalProjectPackageAt,
  openLegacyLocalProjectPackage,
  saveLocalProjectPackage,
} from "./desktopProjectPackage";

export const openLocalProject: OpenProjectAction = openLocalProjectPackage;
export const saveLocalProject: SaveProjectAction = saveLocalProjectPackage;

export const defaultProjectActions: ProjectActions = {
  openProject: openLocalProject,
  openLegacyProject: openLegacyLocalProjectPackage,
  openProjectTarget: openLocalProjectPackageAt,
  saveProject: saveLocalProject,
};

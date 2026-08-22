import type { ProjectState } from "@lsaa/project";

/**
 * The only state a desktop save adapter may receive is a fully validated
 * canonical project state. The UI must not pass a sheet-shaped draft across
 * the persistence boundary.
 */
export type ProjectSaveRequest = ProjectState;

/** A validated project selected by the user, or null when the dialog is cancelled. */
export type OpenedProject = Readonly<{
  state: ProjectState;
  target: string;
}>;

export type OpenProjectAction = () => Promise<OpenedProject | null>;
export type OpenProjectTargetAction = (target: string) => Promise<OpenedProject>;

/** A local desktop action that persists the currently visible data sheet. */
export type SaveProjectAction = (
  request: ProjectSaveRequest,
  existingTarget?: string,
) => Promise<OpenedProject | null>;

export type ProjectActions = Readonly<{
  openProject: OpenProjectAction;
  openLegacyProject?: OpenProjectAction;
  openProjectTarget?: OpenProjectTargetAction;
  saveProject?: SaveProjectAction;
}>;

/**
 * The browser preview still exposes the local-open affordance while making
 * the missing desktop bridge explicit. No project data is fabricated here.
 */
export function actionErrorMessage(error: unknown, fallback: string): string {
  return error instanceof Error && error.message.trim() ? error.message : fallback;
}

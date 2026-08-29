import type {
  ProjectState,
  SpecializedEntryDraftProjectState,
  UnresolvedVisualizationProjectState,
} from "@lsaa/project";

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

/** A graph/table project deliberately has no experiment design or analysis request. */
export type OpenedUnresolvedVisualizationProject = Readonly<{
  state: UnresolvedVisualizationProjectState;
  target: string;
}>;

export type OpenUnresolvedVisualizationProjectAction =
  () => Promise<OpenedUnresolvedVisualizationProject | null>;

export type SaveUnresolvedVisualizationProjectAction = (
  request: UnresolvedVisualizationProjectState,
  existingTarget?: string,
) => Promise<OpenedUnresolvedVisualizationProject | null>;

/** An editable safe-stop from a dedicated Survival or ordered-curve entry. */
export type OpenedSpecializedEntryDraftProject = Readonly<{
  state: SpecializedEntryDraftProjectState;
  target: string;
}>;

export type SaveSpecializedEntryDraftProjectAction = (
  request: SpecializedEntryDraftProjectState,
  existingTarget?: string,
) => Promise<OpenedSpecializedEntryDraftProject | null>;

/**
 * A single .lsa open operation may yield an authoritative experiment, a
 * deliberately unresolved visualization/table, or an editable safe-stop from
 * a dedicated entry. The validated manifest discriminator is authoritative;
 * callers must not infer a design from retained table contents.
 */
export type OpenedAnyProject =
  | Readonly<{
      kind: "experiment";
      project: OpenedProject;
    }>
  | Readonly<{
      kind: "unresolved_visualization";
      project: OpenedUnresolvedVisualizationProject;
    }>
  | Readonly<{
      kind: "specialized_entry_draft";
      project: OpenedSpecializedEntryDraftProject;
    }>;

export type OpenAnyProjectAction = () => Promise<OpenedAnyProject | null>;
export type OpenAnyProjectTargetAction = (target: string) => Promise<OpenedAnyProject>;

export type ProjectActions = Readonly<{
  openProject: OpenProjectAction;
  openLegacyProject?: OpenProjectAction;
  openProjectTarget?: OpenProjectTargetAction;
  saveProject?: SaveProjectAction;
  openUnresolvedVisualizationProject?: OpenUnresolvedVisualizationProjectAction;
  saveUnresolvedVisualizationProject?: SaveUnresolvedVisualizationProjectAction;
  saveSpecializedEntryDraftProject?: SaveSpecializedEntryDraftProjectAction;
  /** Opens one .lsa picker and dispatches the validated manifest kind. */
  openAnyProject?: OpenAnyProjectAction;
  /** Opens a known target using the same kind-dispatching reader. */
  openAnyProjectTarget?: OpenAnyProjectTargetAction;
}>;

/**
 * The browser preview still exposes the local-open affordance while making
 * the missing desktop bridge explicit. No project data is fabricated here.
 */
export function actionErrorMessage(error: unknown, fallback: string): string {
  return error instanceof Error && error.message.trim() ? error.message : fallback;
}

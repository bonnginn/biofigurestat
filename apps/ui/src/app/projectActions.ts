import type {
  ProjectState,
  SpecializedEntryDraftProjectState,
  UnresolvedVisualizationProjectState,
} from "@lsaa/project";
import { ProjectCompatibilityError } from "@lsaa/project";

import type { AppLocale } from "./appLocale";

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
export function actionErrorMessage(
  error: unknown,
  fallback: string,
  locale: AppLocale = "ja",
): string {
  if (error instanceof ProjectCompatibilityError) {
    switch (error.code) {
      case "PROJECT_SCHEMA_VERSION_NEWER_THAN_APP":
        return locale === "ja"
          ? `このプロジェクトは新しいBioFigureStat（保存形式 ${error.foundVersion ?? "不明"}）で作成されています。ファイルを変更せず、アプリを更新してから開いてください。`
          : `This project was created by a newer BioFigureStat (project format ${error.foundVersion ?? "unknown"}). Leave the file unchanged, update the application, and then open it again.`;
      case "PROJECT_SCHEMA_VERSION_UNSUPPORTED":
        return locale === "ja"
          ? `このプロジェクトの保存形式（${error.foundVersion ?? "不明"}）には対応していません。元ファイルを変更せず、対応するBioFigureStatのversionを確認してください。`
          : `This project format (${error.foundVersion ?? "unknown"}) is not supported. Leave the source file unchanged and check which BioFigureStat version supports it.`;
      case "PROJECT_SCHEMA_VERSION_MISSING":
      case "PROJECT_CONTENT_INVALID":
        return locale === "ja"
          ? "このプロジェクトの保存形式または内容を安全に確認できません。元ファイルを変更せず、診断情報とともに保管してください。"
          : "The project format or contents could not be verified safely. Leave the source file unchanged and retain it together with the diagnostic information.";
      case "PROJECT_KIND_MISMATCH":
        return locale === "ja"
          ? "このプロジェクトは、現在の編集画面とは別の種類です。Homeの「開く」から開き直してください。"
          : "This project belongs to a different editor. Open it again from Open on Home.";
    }
  }
  if (!(error instanceof Error) || !error.message.trim()) return fallback;
  const message = error.message.trim();
  if (
    /(?:Zod|PROJECT_[A-Z_]+|Workspace|manifest|database|lineage|project contains)/iu.test(message)
  ) {
    return fallback;
  }
  if (locale === "en" && /[\u3040-\u30ff\u3400-\u9fff]/u.test(message)) return fallback;
  return message;
}

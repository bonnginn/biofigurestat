import type { ProjectMetadataDraft } from "../app/projectMetadata";
import { metadataDraftIsComplete } from "../app/projectMetadata";
import { localizedText, useAppLocale } from "../app/appLocale";
import { LegacyProjectMetadataForm } from "./LegacyProjectMetadataForm";

type Props = {
  idPrefix: string;
  metadata: ProjectMetadataDraft;
  onMetadataChange: Dispatch<SetStateAction<ProjectMetadataDraft>>;
  canSave: boolean;
  validated: boolean;
  saveStatus: "idle" | "saving" | "success" | "error";
  saveError: string | null;
  onSave: () => void;
  mode: "two-condition" | "multi-condition";
  activeRawRevisionId?: string;
};

export function LegacyProjectSavePanel({
  idPrefix,
  metadata,
  onMetadataChange,
  canSave,
  validated,
  saveStatus,
  saveError,
  onSave,
  mode,
  activeRawRevisionId,
}: Props) {
  const locale = useAppLocale();
  const t = (ja: string, en: string) => localizedText(locale, ja, en);
  const isMultiCondition = mode === "multi-condition";

  return (
    <div
      id={`${idPrefix}-panel-save`}
      className="workflow-panel-stack"
      role="tabpanel"
      aria-labelledby={`${idPrefix}-tab-save`}
    >
      <details className="metadata-disclosure" open>
        <summary>{t("プロジェクト情報", "Project information")}</summary>
        <LegacyProjectMetadataForm value={metadata} onChange={onMetadataChange} />
      </details>
      <section className="sheet-actions" aria-label={t("プロジェクトの保存", "Save project")}>
        <div>
          <strong>{t("プロジェクトを保存", "Save project")}</strong>
          <p>
            {isMultiCondition
              ? t(
                  "検証済みデータと実行済み解析を保存し、後から編集できます。",
                  "Save the validated data and completed analysis so you can edit them later.",
                )
              : t(
                  "検証済みデータと実行済み解析を、再現可能なプロジェクトとして保存します。",
                  "Save the validated data and completed analysis as a reproducible project.",
                )}
          </p>
          {isMultiCondition && (
            <p className="project-action-note">
              {t(
                "保存後の入力編集は新しいデータ履歴として記録され、以前の解析は再計算が必要になります。",
                "Edits after saving are recorded as a new data revision and require the previous analysis to be recalculated.",
              )}
            </p>
          )}
        </div>
        <button
          className="save-project-button"
          type="button"
          disabled={!canSave || !validated || !metadataDraftIsComplete(metadata) || saveStatus === "saving"}
          onClick={onSave}
        >
          {saveStatus === "saving" ? t("保存中…", "Saving…") : t("プロジェクトを保存", "Save project")}
        </button>
      </section>
      {!canSave && !isMultiCondition && (
        <p className="project-action-note" role="status">
          {t(
            "デスクトップのプロジェクト保存機能が未接続のため、保存できません。入力シートはメモリ上に保持されています。",
            "Desktop project saving is unavailable. The data sheet remains in memory.",
          )}
        </p>
      )}
      {saveStatus === "success" && (
        <p className="project-action-message project-action-message--success" role="status">
          {t("プロジェクトを保存しました。", "Project saved.")}
        </p>
      )}
      {saveError && (
        <p className="project-action-message project-action-message--error" role="alert">
          {saveError}
          {!isMultiCondition && ` ${t("入力したデータは保持されています。", "Your entered data is still retained.")}`}
        </p>
      )}
      {activeRawRevisionId && !isMultiCondition && (
        <p className="project-action-note" role="note">
          {t(
            `保存履歴：現在の生データ改訂 ${activeRawRevisionId}。入力を編集すると、既存の解析とグラフは再計算が必要になります。`,
            `Save history: current raw-data revision ${activeRawRevisionId}. Editing the data requires the existing analysis and graph to be recalculated.`,
          )}
        </p>
      )}
    </div>
  );
}
import type { Dispatch, SetStateAction } from "react";

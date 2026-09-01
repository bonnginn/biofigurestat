import type { Dispatch, SetStateAction } from "react";

import { localizedText, useAppLocale } from "../app/appLocale";
import type { ProjectMetadataDraft } from "../app/projectMetadata";

type LegacyProjectMetadataFormProps = Readonly<{
  value: ProjectMetadataDraft;
  onChange: Dispatch<SetStateAction<ProjectMetadataDraft>>;
}>;

export function LegacyProjectMetadataForm({ value, onChange }: LegacyProjectMetadataFormProps) {
  const locale = useAppLocale();
  const t = (ja: string, en: string) => localizedText(locale, ja, en);
  const update = (field: keyof ProjectMetadataDraft, next: string) => {
    onChange((previous) => ({ ...previous, [field]: next }));
  };

  return (
    <div className="metadata-form-grid">
      <label className="field-label">
        {t("プロジェクト名", "Project name")} <span aria-hidden="true">*</span>
        <input
          required
          value={value.projectName}
          onChange={(event) => update("projectName", event.currentTarget.value)}
        />
      </label>
      <label className="field-label">
        {t("最初の実験日", "First experiment date")} <span aria-hidden="true">*</span>
        <input
          required
          type="date"
          value={value.experimentDate}
          onChange={(event) => update("experimentDate", event.currentTarget.value)}
        />
        <small>
          {t(
            "各実験単位の日付は「データ入力」で個別に記録されています。",
            "Dates for individual experimental units are recorded separately under Data entry.",
          )}
        </small>
      </label>
      <label className="field-label">
        {t("実施者（任意）", "Operator (optional)")}
        <input
          value={value.operator ?? ""}
          onChange={(event) => update("operator", event.currentTarget.value)}
        />
      </label>
      <label className="field-label">
        {t("バッチ／ロット（任意）", "Batch / lot (optional)")}
        <input
          value={value.batch ?? ""}
          onChange={(event) => update("batch", event.currentTarget.value)}
        />
      </label>
      <label className="field-label metadata-note-field">
        {t("メモ（任意）", "Note (optional)")}
        <textarea
          rows={2}
          value={value.note ?? ""}
          onChange={(event) => update("note", event.currentTarget.value)}
        />
      </label>
    </div>
  );
}

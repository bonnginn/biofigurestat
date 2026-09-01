import type { Dispatch, SetStateAction } from "react";

import type { ProjectMetadataDraft } from "../app/projectMetadata";

type LegacyProjectMetadataFormProps = Readonly<{
  value: ProjectMetadataDraft;
  onChange: Dispatch<SetStateAction<ProjectMetadataDraft>>;
}>;

export function LegacyProjectMetadataForm({ value, onChange }: LegacyProjectMetadataFormProps) {
  const update = (field: keyof ProjectMetadataDraft, next: string) => {
    onChange((previous) => ({ ...previous, [field]: next }));
  };

  return (
    <div className="metadata-form-grid">
      <label className="field-label">
        プロジェクト名 <span aria-hidden="true">*</span>
        <input
          required
          value={value.projectName}
          onChange={(event) => update("projectName", event.currentTarget.value)}
        />
      </label>
      <label className="field-label">
        最初の実験日 <span aria-hidden="true">*</span>
        <input
          required
          type="date"
          value={value.experimentDate}
          onChange={(event) => update("experimentDate", event.currentTarget.value)}
        />
        <small>各実験単位の日付は「データ入力」で個別に記録されています。</small>
      </label>
      <label className="field-label">
        実施者（任意）
        <input
          value={value.operator ?? ""}
          onChange={(event) => update("operator", event.currentTarget.value)}
        />
      </label>
      <label className="field-label">
        バッチ／ロット（任意）
        <input
          value={value.batch ?? ""}
          onChange={(event) => update("batch", event.currentTarget.value)}
        />
      </label>
      <label className="field-label metadata-note-field">
        メモ（任意）
        <textarea
          rows={2}
          value={value.note ?? ""}
          onChange={(event) => update("note", event.currentTarget.value)}
        />
      </label>
    </div>
  );
}

import { useEffect, useRef } from "react";

import "./UnsavedChangesDialog.css";
import { useAppLocale } from "../app/appLocale";

type UnsavedChangesDialogProps = Readonly<{
  actionLabel: string;
  canSave: boolean;
  saving: boolean;
  error: string | null;
  onSaveAndContinue: () => void;
  onDiscard: () => void;
  onCancel: () => void;
}>;

export function UnsavedChangesDialog({
  actionLabel,
  canSave,
  saving,
  error,
  onSaveAndContinue,
  onDiscard,
  onCancel,
}: UnsavedChangesDialogProps) {
  const ja = useAppLocale() === "ja";
  const cancelRef = useRef<HTMLButtonElement>(null);

  useEffect(() => {
    cancelRef.current?.focus();
  }, []);

  useEffect(() => {
    const handleEscape = (event: KeyboardEvent) => {
      if (event.key !== "Escape" || saving) return;
      event.preventDefault();
      onCancel();
    };
    document.addEventListener("keydown", handleEscape);
    return () => document.removeEventListener("keydown", handleEscape);
  }, [onCancel, saving]);

  return (
    <div className="unsaved-changes-backdrop">
      <section
        className="unsaved-changes-dialog"
        role="dialog"
        aria-modal="true"
        aria-labelledby="unsaved-changes-title"
        aria-describedby="unsaved-changes-description"
      >
        <p className="overline">{ja ? "未保存の変更" : "Unsaved changes"}</p>
        <h2 id="unsaved-changes-title">
          {ja ? "この実験を保存しますか？" : "Save this experiment?"}
        </h2>
        <p id="unsaved-changes-description">
          {ja
            ? `「${actionLabel}」へ進む前に、入力したデータとGraphの変更を保存できます。`
            : "You can save entered data and Graph changes before continuing."}
        </p>
        {error ? <p className="unsaved-changes-error" role="alert">{ja ? error : "Saving did not complete. Your work remains open."}</p> : null}
        <div className="unsaved-changes-actions">
          <button
            className="primary-button"
            type="button"
            disabled={!canSave || saving}
            onClick={onSaveAndContinue}
          >
            {saving ? (ja ? "保存しています…" : "Saving…") : ja ? "保存して続ける" : "Save and continue"}
          </button>
          <button type="button" disabled={saving} onClick={onDiscard}>
            {ja ? "変更を破棄して続ける" : "Discard changes and continue"}
          </button>
          <button ref={cancelRef} type="button" disabled={saving} onClick={onCancel}>
            {ja ? "キャンセル" : "Cancel"}
          </button>
        </div>
        {!canSave ? (
          <p className="unsaved-changes-note">
            {ja
              ? "この環境では保存を利用できません。戻るにはキャンセル、内容を破棄する場合だけ「変更を破棄して続ける」を選んでください。"
              : "Saving is unavailable in this environment. Choose Cancel to return, or discard changes only if you intend to lose them."}
          </p>
        ) : null}
      </section>
    </div>
  );
}

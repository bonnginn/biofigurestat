import { useEffect, useRef } from "react";

import "./UnsavedChangesDialog.css";

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
        <p className="overline">未保存の変更</p>
        <h2 id="unsaved-changes-title">この実験を保存しますか？</h2>
        <p id="unsaved-changes-description">
          「{actionLabel}」へ進む前に、入力したデータとGraphの変更を保存できます。
        </p>
        {error ? <p className="unsaved-changes-error" role="alert">{error}</p> : null}
        <div className="unsaved-changes-actions">
          <button
            className="primary-button"
            type="button"
            disabled={!canSave || saving}
            onClick={onSaveAndContinue}
          >
            {saving ? "保存しています…" : "保存して続ける"}
          </button>
          <button type="button" disabled={saving} onClick={onDiscard}>
            変更を破棄して続ける
          </button>
          <button ref={cancelRef} type="button" disabled={saving} onClick={onCancel}>
            キャンセル
          </button>
        </div>
        {!canSave ? (
          <p className="unsaved-changes-note">
            この環境では保存を利用できません。戻るにはキャンセル、内容を破棄する場合だけ「変更を破棄して続ける」を選んでください。
          </p>
        ) : null}
      </section>
    </div>
  );
}

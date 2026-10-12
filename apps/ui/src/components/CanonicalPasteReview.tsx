import { useEffect, useId, useRef } from "react";
import { createPortal } from "react-dom";
import type { CanonicalAdaptiveObservation, StructureContract } from "@lsaa/domain";
import "./CanonicalPasteReview.css";

export type CanonicalPastePlan = Readonly<{
  text: string;
  base: string;
  context: string;
  before: readonly CanonicalAdaptiveObservation[];
  after: readonly CanonicalAdaptiveObservation[];
  origin: HTMLInputElement;
}>;
export function CanonicalPasteReview({
  plan,
  contract,
  error,
  onConfirm,
  onCancel,
}: Readonly<{
  plan: CanonicalPastePlan;
  contract: StructureContract;
  error: string | null;
  onConfirm: () => void;
  onCancel: () => void;
}>) {
  const title = useId();
  const cancel = useRef<HTMLButtonElement>(null);
  const sourceText = useRef<HTMLTextAreaElement>(null);
  const confirm = useRef<HTMLButtonElement>(null);
  useEffect(() => {
    cancel.current?.focus({ preventScroll: true });
    return () => {
      if (plan.origin.isConnected) plan.origin.focus({ preventScroll: true });
    };
  }, [plan]);
  const changes = plan.after.flatMap((after, index) => {
    const before = plan.before[index];
    if (!before || JSON.stringify(before) === JSON.stringify(after)) return [];
    const fields = [
      ...contract.identities.map(({ key, label }) => ({
        label,
        before: before.identities[key],
        after: after.identities[key],
      })),
      ...Object.keys(after.values).map((key) => ({
        label: contract.readouts.find((r) => r.key === after.readoutKey)?.label + ` (${key})`,
        before: before.values[key],
        after: after.values[key],
      })),
    ].filter((field) => field.before !== field.after);
    const coordinate = [
      ...Object.values(before.identities),
      ...Object.values(before.factors),
      ...Object.entries(before.axes).map(([key, value]) => `${key}=${value}`),
    ].join(" / ");
    return fields.map((field) => ({
      ...field,
      coordinate,
      key: `${after.observationId}:${field.label}`,
    }));
  });
  return createPortal(
    <div className="canonical-paste-review__overlay">
      <div
        className="canonical-paste-review"
        role="dialog"
        aria-modal="true"
        aria-labelledby={title}
        onKeyDown={(event) => {
          if (event.key === "Escape") {
            event.preventDefault();
            onCancel();
          }
          if (event.key !== "Tab") return;
          if (event.shiftKey && document.activeElement === sourceText.current) {
            event.preventDefault();
            confirm.current?.focus();
          } else if (!event.shiftKey && document.activeElement === confirm.current) {
            event.preventDefault();
            sourceText.current?.focus();
          }
        }}
      >
        <h2 id={title}>貼り付けを確認</h2>
        <p>
          確定するまで入力表は変更しません。関連する同じ対象のID変更も下に表示します。確定後は「入力を元に戻す」で一括取消できます。
        </p>
        <label>
          貼り付け元のテキスト
          <textarea
            ref={sourceText}
            aria-label="貼り付け元のテキスト"
            value={plan.text}
            readOnly
            rows={3}
          />
        </label>
        <div className="canonical-paste-review__changes">
          <table aria-label="貼り付けによる変更">
            <thead>
              <tr>
                <th>対象・条件</th>
                <th>項目</th>
                <th>変更前</th>
                <th>変更後</th>
              </tr>
            </thead>
            <tbody>
              {changes.map((change) => (
                <tr key={change.key}>
                  <th scope="row">{change.coordinate}</th>
                  <td>{change.label}</td>
                  <td>{change.before ?? "空欄"}</td>
                  <td>{change.after ?? "空欄"}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        {error ? <p role="alert">{error}</p> : null}
        <div className="canonical-paste-review__actions">
          <button type="button" ref={cancel} onClick={onCancel}>
            キャンセル
          </button>
          <button type="button" ref={confirm} onClick={onConfirm}>
            貼り付けを確定
          </button>
        </div>
      </div>
    </div>,
    document.body,
  );
}

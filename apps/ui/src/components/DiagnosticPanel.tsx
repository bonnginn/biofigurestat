import { useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import type { ProjectState } from "@lsaa/project";

import type { AppRoute } from "../app/routes";
import {
  copyDiagnosticReport,
  createDiagnosticReport,
  recordDiagnosticError,
  saveDiagnosticReport,
} from "../app/diagnostics";
import { researcherError } from "../app/errorCatalog";

export function DiagnosticPanel({
  route,
  project,
}: {
  route: AppRoute;
  project: ProjectState | null;
}) {
  const [open, setOpen] = useState(false);
  const [expanded, setExpanded] = useState(false);
  const [description, setDescription] = useState("");
  const [status, setStatus] = useState<string | null>(null);
  const menuRef = useRef<HTMLDivElement>(null);
  const panelRef = useRef<HTMLElement>(null);

  useEffect(() => {
    if (!open) return;
    const closeOutside = (event: PointerEvent) => {
      const target = event.target as Node;
      if (!menuRef.current?.contains(target) && !panelRef.current?.contains(target)) setOpen(false);
    };
    document.addEventListener("pointerdown", closeOutside);
    return () => document.removeEventListener("pointerdown", closeOutside);
  }, [open]);

  const report = () =>
    createDiagnosticReport({
      route,
      project,
      includeTechnicalDetails: expanded,
      userDescription: description,
    });
  const handleFailure = (error: unknown) => {
    recordDiagnosticError("DIAGNOSTIC_EXPORT_FAILED", error);
    setStatus(`${researcherError("DIAGNOSTIC_EXPORT_FAILED").title}（DIAGNOSTIC_EXPORT_FAILED）`);
  };

  return (
    <div className="diagnostic-menu" ref={menuRef}>
      <button type="button" onClick={() => setOpen((current) => !current)} aria-expanded={open}>
        診断
      </button>
      {open
        ? createPortal(
            <section ref={panelRef} className="diagnostic-panel" aria-label="診断情報">
              <button
                className="diagnostic-panel__close"
                type="button"
                aria-label="診断を閉じる"
                onClick={() => setOpen(false)}
              >
                ×
              </button>
              <div>
                <strong>問題の報告に使う診断情報</strong>
                <p>
                  raw測定値、実験名・条件名・notes、個人path、秘密情報は通常reportに含めません。自動送信は行いません。
                </p>
              </div>
              <label className="diagnostic-expanded-option">
                <input
                  type="checkbox"
                  checked={expanded}
                  onChange={(event) => setExpanded(event.target.checked)}
                />
                <span>
                  詳細な診断情報を含める
                  <small>redact済みの直近error messageを追加します。raw dataは追加しません。</small>
                </span>
              </label>
              <label>
                <span>問題の説明（任意）</span>
                <textarea
                  value={description}
                  maxLength={1000}
                  placeholder="何をしていたときに起きたか。研究データや秘密情報は書かないでください。"
                  onChange={(event) => setDescription(event.currentTarget.value)}
                />
              </label>
              <div className="diagnostic-actions">
                <button
                  type="button"
                  onClick={() => {
                    void copyDiagnosticReport(report())
                      .then(() => setStatus("診断reportをコピーしました。自動送信はしていません。"))
                      .catch(handleFailure);
                  }}
                >
                  Copy diagnostic report
                </button>
                <button
                  type="button"
                  onClick={() => {
                    void saveDiagnosticReport(report())
                      .then((saved) => setStatus(saved ? "診断情報を保存しました。" : null))
                      .catch(handleFailure);
                  }}
                >
                  診断情報を保存
                </button>
              </div>
              {status ? <p role="status">{status}</p> : null}
            </section>,
            document.body,
          )
        : null}
    </div>
  );
}

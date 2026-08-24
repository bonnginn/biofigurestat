import { useState } from "react";
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
    <div className="diagnostic-menu">
      <button type="button" onClick={() => setOpen((current) => !current)} aria-expanded={open}>
        診断
      </button>
      {open ? (
        <section className="diagnostic-panel" aria-label="診断情報">
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
        </section>
      ) : null}
    </div>
  );
}

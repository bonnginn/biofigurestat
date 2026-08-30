import { useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import type { ProjectState } from "@lsaa/project";

import type { AppRoute } from "../app/routes";
import {
  copyDiagnosticReport,
  createDiagnosticReport,
  createPrivacyReducedDiagnostic,
  recordDiagnosticError,
  saveDiagnosticReport,
} from "../app/diagnostics";
import { researcherError } from "../app/errorCatalog";
import {
  configuredProblemReportEndpoint,
  createProblemReportSubmission,
  submitProblemReport,
  type ProblemReportDraft,
  type ProblemReportSubmission,
} from "../app/problemReports";

const TYPE_LABELS = {
  bug: "不具合",
  usability: "使いにくさ",
  feature_request: "要望",
  scientific_concern: "統計・科学的懸念",
} as const;
const REPRO_LABELS = {
  always: "毎回",
  sometimes: "ときどき",
  once: "1回だけ",
  not_retried: "再試行していない",
  unknown: "わからない",
} as const;
const SEVERITY_LABELS = {
  cannot_continue: "操作を続けられない",
  possible_data_integrity_risk: "結果やデータの正しさが心配",
  workaround_available: "回避策はある",
  minor: "軽微",
} as const;

function initialDraft(route: AppRoute): ProblemReportDraft {
  return {
    type: "bug",
    screen: route,
    attempted: "",
    observed: "",
    reproducibility: "unknown",
    severity: "minor",
    contactEmail: "",
    includeDiagnostic: false,
  };
}

export function DiagnosticPanel({
  route,
  project,
}: {
  route: AppRoute;
  project: ProjectState | null;
}) {
  const [open, setOpen] = useState(false);
  const [draft, setDraft] = useState<ProblemReportDraft>(() => initialDraft(route));
  const [submission, setSubmission] = useState<ProblemReportSubmission | null>(null);
  const [sending, setSending] = useState(false);
  const [reportId, setReportId] = useState<string | null>(null);
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

  const update = <Key extends keyof ProblemReportDraft>(
    key: Key,
    value: ProblemReportDraft[Key],
  ) => {
    setDraft((current) => ({ ...current, [key]: value }));
    setSubmission(null);
    setReportId(null);
    setStatus(null);
  };
  const contactValid =
    !draft.contactEmail.trim() || /^[^\s@]+@[^\s@]+\.[^\s@]+$/u.test(draft.contactEmail.trim());
  const canPreview = Boolean(draft.attempted.trim() && draft.observed.trim() && contactValid);
  const localReport = () =>
    createDiagnosticReport({ route, project, includeTechnicalDetails: false });
  const localFailure = (error: unknown) => {
    recordDiagnosticError("DIAGNOSTIC_EXPORT_FAILED", error);
    setStatus(`${researcherError("DIAGNOSTIC_EXPORT_FAILED").title}（DIAGNOSTIC_EXPORT_FAILED）`);
  };

  return (
    <div className="diagnostic-menu" ref={menuRef}>
      <button type="button" onClick={() => setOpen((current) => !current)} aria-expanded={open}>
        問題を報告
      </button>
      {open
        ? createPortal(
            <section ref={panelRef} className="diagnostic-panel" aria-label="不具合報告">
              <button
                className="diagnostic-panel__close"
                type="button"
                aria-label="報告を閉じる"
                onClick={() => setOpen(false)}
              >
                ×
              </button>
              <div>
                <strong>BioFigureStat Public Alphaへの報告</strong>
                <p className="diagnostic-warning">
                  研究情報を書かないでください。測定値、表、実験名、条件名、readout名、試料ID、ファイル名・path、clipboard、project内容、秘密情報は送信しないでください。
                </p>
                <p>
                  自動送信はしません。次の画面で送信内容を確認してから、報告ごとに明示的に送信します。
                </p>
              </div>

              {reportId ? (
                <div className="problem-report-result" role="status">
                  <strong>報告を受け付けました</strong>
                  <p>
                    Report ID: <code>{reportId}</code>
                  </p>
                  <button
                    type="button"
                    onClick={() => {
                      setDraft(initialDraft(route));
                      setSubmission(null);
                      setReportId(null);
                    }}
                  >
                    別の報告を作成
                  </button>
                </div>
              ) : submission ? (
                <>
                  <div>
                    <strong>送信内容の確認</strong>
                    <p>以下だけを送信します。screenshotやファイルは含まれません。</p>
                  </div>
                  <dl className="problem-report-preview">
                    <div>
                      <dt>種類</dt>
                      <dd>{TYPE_LABELS[submission.type]}</dd>
                    </div>
                    <div>
                      <dt>画面</dt>
                      <dd>{submission.screen}</dd>
                    </div>
                    <div>
                      <dt>しようとしたこと</dt>
                      <dd>{submission.attempted}</dd>
                    </div>
                    <div>
                      <dt>起きたこと</dt>
                      <dd>{submission.observed}</dd>
                    </div>
                    <div>
                      <dt>再現性</dt>
                      <dd>{REPRO_LABELS[submission.reproducibility]}</dd>
                    </div>
                    <div>
                      <dt>重大度</dt>
                      <dd>{SEVERITY_LABELS[submission.severity]}</dd>
                    </div>
                    <div>
                      <dt>返信先</dt>
                      <dd>{submission.contactEmail ?? "送信しない"}</dd>
                    </div>
                    <div>
                      <dt>privacy-reduced診断</dt>
                      <dd>
                        {submission.diagnostic ? (
                          <pre>{JSON.stringify(submission.diagnostic, null, 2)}</pre>
                        ) : (
                          "添付しない"
                        )}
                      </dd>
                    </div>
                    <div>
                      <dt>報告用client ID</dt>
                      <dd>
                        <code>{submission.reporterId}</code>
                      </dd>
                    </div>
                  </dl>
                  <div className="diagnostic-actions">
                    <button
                      type="button"
                      className="secondary-button"
                      disabled={sending}
                      onClick={() => setSubmission(null)}
                    >
                      入力へ戻る
                    </button>
                    <button
                      type="button"
                      disabled={sending}
                      onClick={() => {
                        setSending(true);
                        setStatus(null);
                        void submitProblemReport(submission)
                          .then(setReportId)
                          .catch(() =>
                            setStatus(
                              "送信できませんでした。入力内容は保持されています。通常の操作はそのまま続けられます。",
                            ),
                          )
                          .finally(() => setSending(false));
                      }}
                    >
                      {sending ? "送信中…" : "この内容を送信"}
                    </button>
                  </div>
                </>
              ) : (
                <>
                  <label>
                    <span>種類</span>
                    <select
                      value={draft.type}
                      onChange={(event) =>
                        update("type", event.currentTarget.value as ProblemReportDraft["type"])
                      }
                    >
                      {Object.entries(TYPE_LABELS).map(([value, label]) => (
                        <option key={value} value={value}>
                          {label}
                        </option>
                      ))}
                    </select>
                  </label>
                  <label>
                    <span>発生した画面</span>
                    <input value={draft.screen} readOnly />
                  </label>
                  <label>
                    <span>何をしようとしたか</span>
                    <textarea
                      required
                      maxLength={1500}
                      value={draft.attempted}
                      onChange={(event) => update("attempted", event.currentTarget.value)}
                      placeholder="研究内容や名称を使わず、操作だけを書いてください。"
                    />
                  </label>
                  <label>
                    <span>何が起きたか</span>
                    <textarea
                      required
                      maxLength={2000}
                      value={draft.observed}
                      onChange={(event) => update("observed", event.currentTarget.value)}
                      placeholder="測定値や表を貼り付けず、画面上の挙動を書いてください。"
                    />
                  </label>
                  <label>
                    <span>再現するか</span>
                    <select
                      value={draft.reproducibility}
                      onChange={(event) =>
                        update(
                          "reproducibility",
                          event.currentTarget.value as ProblemReportDraft["reproducibility"],
                        )
                      }
                    >
                      {Object.entries(REPRO_LABELS).map(([value, label]) => (
                        <option key={value} value={value}>
                          {label}
                        </option>
                      ))}
                    </select>
                  </label>
                  <label>
                    <span>重大度についての認識</span>
                    <select
                      value={draft.severity}
                      onChange={(event) =>
                        update(
                          "severity",
                          event.currentTarget.value as ProblemReportDraft["severity"],
                        )
                      }
                    >
                      {Object.entries(SEVERITY_LABELS).map(([value, label]) => (
                        <option key={value} value={value}>
                          {label}
                        </option>
                      ))}
                    </select>
                  </label>
                  <label>
                    <span>返信を希望する場合のみメールアドレス</span>
                    <input
                      type="email"
                      maxLength={254}
                      value={draft.contactEmail}
                      onChange={(event) => update("contactEmail", event.currentTarget.value)}
                    />
                    {!contactValid ? (
                      <small role="alert">メールアドレスを確認してください。</small>
                    ) : null}
                  </label>
                  <label className="diagnostic-expanded-option">
                    <input
                      type="checkbox"
                      checked={draft.includeDiagnostic}
                      onChange={(event) => update("includeDiagnostic", event.currentTarget.checked)}
                    />
                    <span>
                      privacy-reduced診断を添付する
                      <small>
                        アプリ版、OS種別、現在の画面、固定error
                        codeだけです。project内容や利用telemetry IDは含みません。
                      </small>
                    </span>
                  </label>
                  <button
                    type="button"
                    disabled={!canPreview}
                    onClick={() =>
                      setSubmission(
                        createProblemReportSubmission(draft, createPrivacyReducedDiagnostic(route)),
                      )
                    }
                  >
                    送信内容を確認
                  </button>
                  {!configuredProblemReportEndpoint() ? (
                    <p className="diagnostic-form-note">
                      このビルドには報告受付先が設定されていません。入力後も外部送信されません。
                    </p>
                  ) : null}
                </>
              )}

              <details>
                <summary>ローカル診断レポートをコピー・保存</summary>
                <p>この操作だけでは外部送信しません。</p>
                <div className="diagnostic-actions">
                  <button
                    type="button"
                    onClick={() =>
                      void copyDiagnosticReport(localReport())
                        .then(() =>
                          setStatus("診断レポートをコピーしました。自動送信はしていません。"),
                        )
                        .catch(localFailure)
                    }
                  >
                    診断レポートをコピー
                  </button>
                  <button
                    type="button"
                    onClick={() =>
                      void saveDiagnosticReport(localReport())
                        .then((saved) => setStatus(saved ? "診断情報を保存しました。" : null))
                        .catch(localFailure)
                    }
                  >
                    診断情報を保存
                  </button>
                </div>
              </details>
              {status ? <p role="status">{status}</p> : null}
            </section>,
            document.body,
          )
        : null}
    </div>
  );
}

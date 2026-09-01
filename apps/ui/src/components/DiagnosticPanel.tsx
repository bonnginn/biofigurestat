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
  PROBLEM_REPORT_PREFILL_EVENT,
  submitProblemReport,
  type ProblemReportDraft,
  type ProblemReportPrefill,
  type ProblemReportSubmission,
} from "../app/problemReports";
import { useAppLocale } from "../app/appLocale";

const TYPE_LABELS = {
  bug: ["不具合", "Bug"],
  usability: ["使いにくさ", "Usability"],
  feature_request: ["要望", "Feature request"],
  scientific_concern: ["統計・科学的懸念", "Statistical or scientific concern"],
} as const;
const REPRO_LABELS = {
  always: ["毎回", "Every time"],
  sometimes: ["ときどき", "Sometimes"],
  once: ["1回だけ", "Once"],
  not_retried: ["再試行していない", "Not retried"],
  unknown: ["わからない", "Unknown"],
} as const;
const SEVERITY_LABELS = {
  cannot_continue: ["操作を続けられない", "Cannot continue"],
  possible_data_integrity_risk: ["結果やデータの正しさが心配", "Possible data-integrity risk"],
  workaround_available: ["回避策はある", "Workaround available"],
  minor: ["軽微", "Minor"],
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
  const ja = useAppLocale() === "ja";
  const label = (value: readonly [string, string]) => value[ja ? 0 : 1];
  const [open, setOpen] = useState(false);
  const [draft, setDraft] = useState<ProblemReportDraft>(() => initialDraft(route));
  const [submission, setSubmission] = useState<ProblemReportSubmission | null>(null);
  const [sending, setSending] = useState(false);
  const [reportId, setReportId] = useState<string | null>(null);
  const [status, setStatus] = useState<string | null>(null);
  const menuRef = useRef<HTMLDivElement>(null);
  const panelRef = useRef<HTMLElement>(null);

  useEffect(() => {
    const applyPrefill = (event: Event) => {
      const detail = (event as CustomEvent<ProblemReportPrefill>).detail;
      if (!detail?.attempted.trim() || !detail.observed.trim()) return;
      setDraft({
        ...initialDraft(route),
        type: detail.type ?? "feature_request",
        attempted: detail.attempted.trim(),
        observed: detail.observed.trim(),
      });
      setSubmission(null);
      setReportId(null);
      setStatus(null);
      setOpen(true);
    };
    window.addEventListener(PROBLEM_REPORT_PREFILL_EVENT, applyPrefill);
    return () => window.removeEventListener(PROBLEM_REPORT_PREFILL_EVENT, applyPrefill);
  }, [route]);

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
    setStatus(
      ja
        ? `${researcherError("DIAGNOSTIC_EXPORT_FAILED").title}（DIAGNOSTIC_EXPORT_FAILED）`
        : `${researcherError("DIAGNOSTIC_EXPORT_FAILED", "en").title} (DIAGNOSTIC_EXPORT_FAILED).`,
    );
  };

  return (
    <div className="diagnostic-menu" ref={menuRef}>
      <button type="button" onClick={() => setOpen((current) => !current)} aria-expanded={open}>
        {ja ? "問題を報告" : "Report a problem"}
      </button>
      {open
        ? createPortal(
            <section
              ref={panelRef}
              className="diagnostic-panel"
              aria-label={ja ? "不具合報告" : "Problem report"}
            >
              <button
                className="diagnostic-panel__close"
                type="button"
                aria-label={ja ? "報告を閉じる" : "Close report"}
                onClick={() => setOpen(false)}
              >
                ×
              </button>
              <div>
                <strong>
                  {ja
                    ? "BioFigureStat Public Alphaへの報告"
                    : "Report to BioFigureStat Public Alpha"}
                </strong>
                <p className="diagnostic-warning">
                  {ja
                    ? "研究情報を書かないでください。測定値、表、実験名、条件名、readout名、試料ID、ファイル名・path、clipboard、project内容、秘密情報は送信しないでください。"
                    : "Do not include research information. Do not send measurements, tables, experiment or condition names, readout names, sample IDs, file names or paths, clipboard contents, project contents, or secrets."}
                </p>
                <p>
                  {ja
                    ? "自動送信はしません。次の画面で送信内容を確認してから、報告ごとに明示的に送信します。"
                    : "Nothing is sent automatically. Review the exact submission first, then explicitly send each report."}
                </p>
              </div>

              {reportId ? (
                <div className="problem-report-result" role="status">
                  <strong>{ja ? "報告を受け付けました" : "Report received"}</strong>
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
                    {ja ? "別の報告を作成" : "Create another report"}
                  </button>
                </div>
              ) : submission ? (
                <>
                  <div>
                    <strong>{ja ? "送信内容の確認" : "Review submission"}</strong>
                    <p>
                      {ja
                        ? "以下だけを送信します。screenshotやファイルは含まれません。"
                        : "Only the fields below will be sent. Screenshots and files are not included."}
                    </p>
                  </div>
                  <dl className="problem-report-preview">
                    <div>
                      <dt>{ja ? "種類" : "Type"}</dt>
                      <dd>{label(TYPE_LABELS[submission.type])}</dd>
                    </div>
                    <div>
                      <dt>{ja ? "画面" : "Screen"}</dt>
                      <dd>{submission.screen}</dd>
                    </div>
                    <div>
                      <dt>{ja ? "しようとしたこと" : "What you tried to do"}</dt>
                      <dd>{submission.attempted}</dd>
                    </div>
                    <div>
                      <dt>{ja ? "起きたこと" : "What happened"}</dt>
                      <dd>{submission.observed}</dd>
                    </div>
                    <div>
                      <dt>{ja ? "再現性" : "Reproducibility"}</dt>
                      <dd>{label(REPRO_LABELS[submission.reproducibility])}</dd>
                    </div>
                    <div>
                      <dt>{ja ? "重大度" : "Severity"}</dt>
                      <dd>{label(SEVERITY_LABELS[submission.severity])}</dd>
                    </div>
                    <div>
                      <dt>{ja ? "返信先" : "Reply address"}</dt>
                      <dd>{submission.contactEmail ?? (ja ? "送信しない" : "Not provided")}</dd>
                    </div>
                    <div>
                      <dt>{ja ? "privacy-reduced診断" : "Privacy-reduced diagnostics"}</dt>
                      <dd>
                        {submission.diagnostic ? (
                          <pre>{JSON.stringify(submission.diagnostic, null, 2)}</pre>
                        ) : ja ? (
                          "添付しない"
                        ) : (
                          "Not attached"
                        )}
                      </dd>
                    </div>
                    <div>
                      <dt>{ja ? "報告用client ID" : "Report client ID"}</dt>
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
                      {ja ? "入力へ戻る" : "Back to editing"}
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
                              ja
                                ? "送信できませんでした。入力内容は保持されています。通常の操作はそのまま続けられます。"
                                : "The report could not be sent. Your text is retained and normal app use can continue.",
                            ),
                          )
                          .finally(() => setSending(false));
                      }}
                    >
                      {sending
                        ? ja
                          ? "送信中…"
                          : "Sending…"
                        : ja
                          ? "この内容を送信"
                          : "Send this report"}
                    </button>
                  </div>
                </>
              ) : (
                <>
                  <label>
                    <span>{ja ? "種類" : "Type"}</span>
                    <select
                      value={draft.type}
                      onChange={(event) =>
                        update("type", event.currentTarget.value as ProblemReportDraft["type"])
                      }
                    >
                      {Object.entries(TYPE_LABELS).map(([value, labels]) => (
                        <option key={value} value={value}>
                          {label(labels)}
                        </option>
                      ))}
                    </select>
                  </label>
                  <label>
                    <span>{ja ? "発生した画面" : "Screen"}</span>
                    <input value={draft.screen} readOnly />
                  </label>
                  <label>
                    <span>{ja ? "何をしようとしたか" : "What were you trying to do?"}</span>
                    <textarea
                      required
                      maxLength={1500}
                      value={draft.attempted}
                      onChange={(event) => update("attempted", event.currentTarget.value)}
                      placeholder={
                        ja
                          ? "研究内容や名称を使わず、操作だけを書いてください。"
                          : "Describe the operation without research content or names."
                      }
                    />
                  </label>
                  <label>
                    <span>{ja ? "何が起きたか" : "What happened?"}</span>
                    <textarea
                      required
                      maxLength={2000}
                      value={draft.observed}
                      onChange={(event) => update("observed", event.currentTarget.value)}
                      placeholder={
                        ja
                          ? "測定値や表を貼り付けず、画面上の挙動を書いてください。"
                          : "Describe the interface behavior without pasting measurements or tables."
                      }
                    />
                  </label>
                  <label>
                    <span>{ja ? "再現するか" : "Does it reproduce?"}</span>
                    <select
                      value={draft.reproducibility}
                      onChange={(event) =>
                        update(
                          "reproducibility",
                          event.currentTarget.value as ProblemReportDraft["reproducibility"],
                        )
                      }
                    >
                      {Object.entries(REPRO_LABELS).map(([value, labels]) => (
                        <option key={value} value={value}>
                          {label(labels)}
                        </option>
                      ))}
                    </select>
                  </label>
                  <label>
                    <span>{ja ? "重大度についての認識" : "How severe is it?"}</span>
                    <select
                      value={draft.severity}
                      onChange={(event) =>
                        update(
                          "severity",
                          event.currentTarget.value as ProblemReportDraft["severity"],
                        )
                      }
                    >
                      {Object.entries(SEVERITY_LABELS).map(([value, labels]) => (
                        <option key={value} value={value}>
                          {label(labels)}
                        </option>
                      ))}
                    </select>
                  </label>
                  <label>
                    <span>
                      {ja
                        ? "返信を希望する場合のみメールアドレス"
                        : "Email address only if you want a reply"}
                    </span>
                    <input
                      type="email"
                      maxLength={254}
                      value={draft.contactEmail}
                      onChange={(event) => update("contactEmail", event.currentTarget.value)}
                    />
                    {!contactValid ? (
                      <small role="alert">
                        {ja ? "メールアドレスを確認してください。" : "Check the email address."}
                      </small>
                    ) : null}
                  </label>
                  <label className="diagnostic-expanded-option">
                    <input
                      type="checkbox"
                      checked={draft.includeDiagnostic}
                      onChange={(event) => update("includeDiagnostic", event.currentTarget.checked)}
                    />
                    <span>
                      {ja ? "privacy-reduced診断を添付する" : "Attach privacy-reduced diagnostics"}
                      <small>
                        {ja
                          ? "アプリ版、OS種別、現在の画面、固定error codeだけです。project内容や利用telemetry IDは含みません。"
                          : "Includes only app version, OS type, current screen, and fixed error codes. Project contents and usage-telemetry IDs are excluded."}
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
                    {ja ? "送信内容を確認" : "Review submission"}
                  </button>
                  {!configuredProblemReportEndpoint() ? (
                    <p className="diagnostic-form-note">
                      {ja
                        ? "このビルドには報告受付先が設定されていません。入力後も外部送信されません。"
                        : "This build has no report endpoint configured. Nothing will be sent externally."}
                    </p>
                  ) : null}
                </>
              )}

              <details>
                <summary>
                  {ja
                    ? "ローカル診断レポートをコピー・保存"
                    : "Copy or save a local diagnostic report"}
                </summary>
                <p>
                  {ja
                    ? "この操作だけでは外部送信しません。"
                    : "These actions do not send anything externally."}
                </p>
                <div className="diagnostic-actions">
                  <button
                    type="button"
                    onClick={() =>
                      void copyDiagnosticReport(localReport())
                        .then(() =>
                          setStatus(
                            ja
                              ? "診断レポートをコピーしました。自動送信はしていません。"
                              : "Copied the diagnostic report. Nothing was sent automatically.",
                          ),
                        )
                        .catch(localFailure)
                    }
                  >
                    {ja ? "診断レポートをコピー" : "Copy diagnostic report"}
                  </button>
                  <button
                    type="button"
                    onClick={() =>
                      void saveDiagnosticReport(localReport())
                        .then((saved) =>
                          setStatus(
                            saved
                              ? ja
                                ? "診断情報を保存しました。"
                                : "Saved diagnostic information."
                              : null,
                          ),
                        )
                        .catch(localFailure)
                    }
                  >
                    {ja ? "診断情報を保存" : "Save diagnostic information"}
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

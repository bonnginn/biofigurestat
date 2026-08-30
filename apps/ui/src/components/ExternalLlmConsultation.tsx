import { useState } from "react";

import {
  createExternalLlmImprovementRequest,
  EXTERNAL_LLM_GUIDE_URL,
} from "../app/externalLlmConsultation";
import { openProblemReportWithPrefill } from "../app/problemReports";
import { localizedText, useAppLocale } from "../app/appLocale";
import "./ExternalLlmConsultation.css";

export function ExternalLlmConsultation({
  prompt,
  placement,
}: Readonly<{
  prompt: string;
  placement: "experiment_setup" | "statistics";
}>) {
  const locale = useAppLocale();
  const t = (ja: string, en: string) => localizedText(locale, ja, en);
  const [open, setOpen] = useState(false);
  const [editablePrompt, setEditablePrompt] = useState(prompt);
  const [copyStatus, setCopyStatus] = useState<string | null>(null);
  const [externalLlmResponse, setExternalLlmResponse] = useState("");
  const [requestedChange, setRequestedChange] = useState("");
  const [requestCopyStatus, setRequestCopyStatus] = useState<string | null>(null);

  const reveal = () => {
    setEditablePrompt(prompt);
    setCopyStatus(null);
    setRequestCopyStatus(null);
    setOpen(true);
  };

  const copyImprovementRequest = async () => {
    const request = createExternalLlmImprovementRequest({
      placement,
      requestedChange,
      externalLlmResponse,
    });
    try {
      await navigator.clipboard.writeText(request);
      setRequestCopyStatus(
        t("実装要望をコピーしました。内容を確認し、問題報告フォームや開発タスクへ自分で貼り付けてください。", "Improvement request copied. Review it, then paste it into the problem-report form or a development task yourself."),
      );
    } catch {
      setRequestCopyStatus(
        t("自動コピーできませんでした。入力内容を選択して手動でコピーしてください。", "Automatic copy failed. Select the text and copy it manually."),
      );
    }
  };

  const reportImprovementRequest = () => {
    const request = createExternalLlmImprovementRequest({
      placement,
      requestedChange,
      externalLlmResponse,
    });
    openProblemReportWithPrefill({
      type: "feature_request",
      attempted: t("外部LLMへの相談結果をもとに、BioFigureStatの改善を依頼したい", "Request a BioFigureStat improvement based on an external LLM consultation"),
      observed: request,
    });
    setRequestCopyStatus(
      t("問題報告フォームへ引き継ぎました。送信内容とprivacyを確認するまで送信されません。", "Transferred to the problem-report form. Nothing is sent until you review the content and privacy options."),
    );
  };

  const copy = async () => {
    try {
      await navigator.clipboard.writeText(editablePrompt);
      setCopyStatus(t("相談文をコピーしました。利用する外部LLMへ貼り付けてください。", "Consultation prompt copied. Paste it into the external LLM you choose."));
    } catch {
      setCopyStatus(t("自動コピーできませんでした。文章を選択してコピーしてください。", "Automatic copy failed. Select the prompt and copy it manually."));
    }
  };

  return (
    <section
      className="external-llm-consultation"
      aria-label={placement === "statistics" ? t("統計を外部LLMに相談", "Consult an external LLM about statistics") : t("実験入力を外部LLMに相談", "Consult an external LLM about experiment entry")}
    >
      {!open ? (
        <div className="external-llm-consultation__entry">
          <button className="secondary-button" type="button" onClick={reveal}>
            {t("外部LLMに相談する", "Consult an external LLM")}
          </button>
          <small>
            {t("アプリ内AIではありません。測定値を含まない相談文を表示するだけで、自動送信しません。", "This is not in-app AI. It only prepares a prompt without measurement values and never sends it automatically.")}
          </small>
        </div>
      ) : (
        <div className="external-llm-consultation__panel">
          <div className="external-llm-consultation__heading">
            <div>
              <strong>{t("外部LLMへ渡す相談文", "Prompt for an external LLM")}</strong>
              <p>
                {t("アプリから外部サイトを開いたり送信したりしません。標準では測定値を含まない相談文だけを作ります。内容を確認・編集し、自分で選んだ外部LLMへ貼り付けてください。", "BioFigureStat does not open an external site or send anything. By default it prepares only a prompt without measurement values. Review and edit it, then paste it into the external LLM you choose.")}
              </p>
            </div>
            <button type="button" onClick={() => setOpen(false)}>
              {t("閉じる", "Close")}
            </button>
          </div>
          <textarea
            aria-label={t("外部LLMへ渡す相談文", "Prompt for an external LLM")}
            value={editablePrompt}
            onChange={(event) => setEditablePrompt(event.currentTarget.value)}
            rows={14}
          />
          <div className="external-llm-consultation__actions">
            <button className="primary-button" type="button" onClick={() => void copy()}>
              {t("相談文をコピー", "Copy prompt")}
            </button>
            <a href={EXTERNAL_LLM_GUIDE_URL} target="_blank" rel="noreferrer">
              {t("BioFigureStat使用ガイドを開く", "Open the BioFigureStat guide")}
            </a>
          </div>
          {copyStatus ? <p role="status">{copyStatus}</p> : null}
          <details className="external-llm-consultation__improvement">
            <summary>{t("相談結果から改善要望を作る", "Create an improvement request from the consultation")}</summary>
            <p>
              {t("外部LLMの回答は自動実行しません。必要な部分だけ貼り付け、実装してほしい内容を自分の言葉で確認してください。研究データを含める必要はありません。アプリから送信もしません。", "External LLM responses are never executed automatically. Paste only the relevant portion and confirm the requested change in your own words. Research data are not needed, and the app does not send this automatically.")}
            </p>
            <label>
              <span>{t("外部LLMの回答（任意）", "External LLM response (optional)")}</span>
              <textarea
                aria-label={t("外部LLMの回答（任意）", "External LLM response (optional)")}
                value={externalLlmResponse}
                onChange={(event) => {
                  setExternalLlmResponse(event.currentTarget.value);
                  setRequestCopyStatus(null);
                }}
                rows={6}
              />
            </label>
            <label>
              <span>{t("実装してほしい内容", "Requested change")}</span>
              <textarea
                aria-label={t("実装してほしい内容", "Requested change")}
                value={requestedChange}
                onChange={(event) => {
                  setRequestedChange(event.currentTarget.value);
                  setRequestCopyStatus(null);
                }}
                rows={4}
                placeholder={t("例：この説明では実験者が選択肢を区別しにくいため、実験上の事実で選べる表現にしてほしい", "Example: These options are difficult to distinguish; please rewrite them so a researcher can choose based on experimental facts.")}
              />
            </label>
            <button
              className="secondary-button"
              type="button"
              disabled={!requestedChange.trim() && !externalLlmResponse.trim()}
              onClick={() => void copyImprovementRequest()}
            >
              {t("実装要望をコピー", "Copy improvement request")}
            </button>
            <button
              className="secondary-button"
              type="button"
              disabled={!requestedChange.trim() && !externalLlmResponse.trim()}
              onClick={reportImprovementRequest}
            >
              {t("改善要望として報告", "Report as an improvement request")}
            </button>
            {requestCopyStatus ? <p role="status">{requestCopyStatus}</p> : null}
          </details>
        </div>
      )}
    </section>
  );
}

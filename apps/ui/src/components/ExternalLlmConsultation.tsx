import { useState } from "react";

import {
  createExternalLlmImprovementRequest,
  EXTERNAL_LLM_GUIDE_URL,
} from "../app/externalLlmConsultation";
import "./ExternalLlmConsultation.css";

export function ExternalLlmConsultation({
  prompt,
  placement,
}: Readonly<{
  prompt: string;
  placement: "experiment_setup" | "statistics";
}>) {
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
        "実装要望をコピーしました。内容を確認し、問題報告フォームや開発タスクへ自分で貼り付けてください。",
      );
    } catch {
      setRequestCopyStatus(
        "自動コピーできませんでした。入力内容を選択して手動でコピーしてください。",
      );
    }
  };

  const copy = async () => {
    try {
      await navigator.clipboard.writeText(editablePrompt);
      setCopyStatus("相談文をコピーしました。利用する外部LLMへ貼り付けてください。");
    } catch {
      setCopyStatus("自動コピーできませんでした。文章を選択してコピーしてください。");
    }
  };

  return (
    <section
      className="external-llm-consultation"
      aria-label={placement === "statistics" ? "統計を外部LLMに相談" : "実験入力を外部LLMに相談"}
    >
      {!open ? (
        <div className="external-llm-consultation__entry">
          <button className="secondary-button" type="button" onClick={reveal}>
            外部LLMに相談する
          </button>
          <small>
            アプリ内AIではありません。測定値を含まない相談文を表示するだけで、自動送信しません。
          </small>
        </div>
      ) : (
        <div className="external-llm-consultation__panel">
          <div className="external-llm-consultation__heading">
            <div>
              <strong>外部LLMへ渡す相談文</strong>
              <p>
                アプリから外部サイトを開いたり送信したりしません。標準では測定値を含まない相談文だけを作ります。内容を確認・編集し、自分で選んだ外部LLMへ貼り付けてください。
              </p>
            </div>
            <button type="button" onClick={() => setOpen(false)}>
              閉じる
            </button>
          </div>
          <textarea
            aria-label="外部LLMへ渡す相談文"
            value={editablePrompt}
            onChange={(event) => setEditablePrompt(event.currentTarget.value)}
            rows={14}
          />
          <div className="external-llm-consultation__actions">
            <button className="primary-button" type="button" onClick={() => void copy()}>
              相談文をコピー
            </button>
            <a href={EXTERNAL_LLM_GUIDE_URL} target="_blank" rel="noreferrer">
              LSA使用ガイドを開く
            </a>
          </div>
          {copyStatus ? <p role="status">{copyStatus}</p> : null}
          <details className="external-llm-consultation__improvement">
            <summary>相談結果から改善要望を作る</summary>
            <p>
              外部LLMの回答は自動実行しません。必要な部分だけ貼り付け、実装してほしい内容を自分の言葉で確認してください。研究データを含める必要はありません。アプリから送信もしません。
            </p>
            <label>
              <span>外部LLMの回答（任意）</span>
              <textarea
                aria-label="外部LLMの回答（任意）"
                value={externalLlmResponse}
                onChange={(event) => {
                  setExternalLlmResponse(event.currentTarget.value);
                  setRequestCopyStatus(null);
                }}
                rows={6}
              />
            </label>
            <label>
              <span>実装してほしい内容</span>
              <textarea
                aria-label="実装してほしい内容"
                value={requestedChange}
                onChange={(event) => {
                  setRequestedChange(event.currentTarget.value);
                  setRequestCopyStatus(null);
                }}
                rows={4}
                placeholder="例：この説明では実験者が選択肢を区別しにくいため、実験上の事実で選べる表現にしてほしい"
              />
            </label>
            <button
              className="secondary-button"
              type="button"
              disabled={!requestedChange.trim() && !externalLlmResponse.trim()}
              onClick={() => void copyImprovementRequest()}
            >
              実装要望をコピー
            </button>
            {requestCopyStatus ? <p role="status">{requestCopyStatus}</p> : null}
          </details>
        </div>
      )}
    </section>
  );
}

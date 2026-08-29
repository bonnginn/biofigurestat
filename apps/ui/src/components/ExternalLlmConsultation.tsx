import { useState } from "react";

import { EXTERNAL_LLM_GUIDE_URL } from "../app/externalLlmConsultation";
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

  const reveal = () => {
    setEditablePrompt(prompt);
    setCopyStatus(null);
    setOpen(true);
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
        </div>
      )}
    </section>
  );
}

import { useEffect, useId, useMemo, useRef, useState } from "react";

import { contextualHelpSuggestions, type ContextualHelpContext } from "../app/contextualHelp";
import {
  createReadOnlyHelpRequest,
  deterministicHelpProvider,
  helpProviderMayRun,
  type ReadOnlyHelpProvider,
} from "../app/readOnlyHelpProvider";
import {
  scientificHelpTopics,
  scientificHelpTopic,
  type ScientificHelpTopicId,
} from "../app/scientificHelpGlossary";

import "./contextual-help.css";

type ContextualHelpProps = Readonly<{
  context: ContextualHelpContext;
  provider?: ReadOnlyHelpProvider;
  label?: string;
  initialTopicId?: ScientificHelpTopicId;
  externalProviderOptIn?: boolean;
}>;

export function ContextualHelp({
  context,
  provider = deterministicHelpProvider,
  label = "ヘルプ",
  initialTopicId,
  externalProviderOptIn = false,
}: ContextualHelpProps) {
  const titleId = useId();
  const triggerRef = useRef<HTMLButtonElement>(null);
  const panelRef = useRef<HTMLElement>(null);
  const [open, setOpen] = useState(false);
  const [topicId, setTopicId] = useState<ScientificHelpTopicId | null>(initialTopicId ?? null);
  const [answer, setAnswer] = useState<string | null>(null);
  const [pending, setPending] = useState(false);
  const suggestions = useMemo(() => contextualHelpSuggestions(context), [context]);
  const selectedTopic = topicId ? scientificHelpTopic(topicId) : null;
  const providerEnabled = helpProviderMayRun(provider, externalProviderOptIn);

  useEffect(() => {
    if (!open) return;
    const panel = panelRef.current;
    const focusable = () =>
      Array.from(
        panel?.querySelectorAll<HTMLElement>(
          'button:not([disabled]), select:not([disabled]), [tabindex]:not([tabindex="-1"])',
        ) ?? [],
      );
    focusable()[0]?.focus();
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        event.preventDefault();
        setOpen(false);
        return;
      }
      if (event.key !== "Tab") return;
      const controls = focusable();
      if (!controls.length) return;
      const first = controls[0];
      const last = controls[controls.length - 1];
      if (event.shiftKey && document.activeElement === first) {
        event.preventDefault();
        last.focus();
      } else if (!event.shiftKey && document.activeElement === last) {
        event.preventDefault();
        first.focus();
      }
    };
    document.addEventListener("keydown", onKeyDown);
    return () => {
      document.removeEventListener("keydown", onKeyDown);
      triggerRef.current?.focus();
    };
  }, [open]);

  const selectTopic = (nextTopicId: ScientificHelpTopicId) => {
    setTopicId(nextTopicId);
    setAnswer(null);
  };

  const explain = async () => {
    if (!providerEnabled) return;
    setPending(true);
    try {
      const response = await provider.explain(
        createReadOnlyHelpRequest({ context, ...(topicId ? { topicId } : {}) }),
      );
      setAnswer(response.answer);
    } finally {
      setPending(false);
    }
  };

  return (
    <>
      <button
        ref={triggerRef}
        className="contextual-help-trigger"
        type="button"
        aria-haspopup="dialog"
        aria-expanded={open}
        onClick={() => setOpen(true)}
      >
        <span aria-hidden="true">?</span> {label}
      </button>
      {open ? (
        <div className="contextual-help-backdrop" role="presentation">
          <section
            ref={panelRef}
            className="contextual-help-panel"
            role="dialog"
            aria-modal="true"
            aria-labelledby={titleId}
          >
            <header>
              <div>
                <span className="contextual-help-kicker">この画面のHelp</span>
                <h2 id={titleId}>用語と解析の考え方</h2>
              </div>
              <button type="button" aria-label="ヘルプを閉じる" onClick={() => setOpen(false)}>
                ×
              </button>
            </header>
            <p className="contextual-help-privacy">
              {provider.processing === "local"
                ? "この説明は端末内の固定Helpから表示します。データは送信されません。"
                : providerEnabled
                  ? "外部providerへ最小限の画面文脈を送ります。rawデータは送信せず、統計結果はローカルで生成されます。"
                  : "外部providerは無効です。初回利用前に、送信内容を確認して明示的にopt-inする必要があります。"}
            </p>

            <section aria-labelledby={`${titleId}-suggestions`}>
              <h3 id={`${titleId}-suggestions`}>現在の文脈に関連する項目</h3>
              <div className="contextual-help-suggestions">
                {suggestions.map(({ topic, reason }) => (
                  <button
                    key={topic.id}
                    type="button"
                    className={topic.id === topicId ? "is-selected" : ""}
                    onClick={() => selectTopic(topic.id)}
                  >
                    <strong>{topic.title}</strong>
                    <span>{reason}</span>
                  </button>
                ))}
              </div>
            </section>

            <label className="contextual-help-topic-select">
              <span>用語集から選ぶ</span>
              <select
                value={topicId ?? ""}
                onChange={(event) =>
                  setTopicId((event.currentTarget.value || null) as ScientificHelpTopicId | null)
                }
              >
                <option value="">選択してください</option>
                {scientificHelpTopics.map((topic) => (
                  <option key={topic.id} value={topic.id}>
                    {topic.title}
                  </option>
                ))}
              </select>
            </label>

            {selectedTopic ? (
              <article className="contextual-help-answer" aria-live="polite">
                <h3>{selectedTopic.title}</h3>
                <p>{selectedTopic.summary}</p>
                {selectedTopic.limitation ? <p>注意：{selectedTopic.limitation}</p> : null}
              </article>
            ) : null}
            {answer ? <pre className="contextual-help-provider-answer">{answer}</pre> : null}

            <footer>
              <span>Helpは説明専用で、実験設計・データ・統計・Graphを変更しません。</span>
              <button
                type="button"
                onClick={() => void explain()}
                disabled={pending || !providerEnabled}
              >
                {pending ? "説明を準備中…" : "文脈に合わせて説明"}
              </button>
            </footer>
          </section>
        </div>
      ) : null}
    </>
  );
}

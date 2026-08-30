import { useEffect, useId, useMemo, useRef, useState } from "react";
import { createPortal } from "react-dom";

import { contextualHelpSuggestions, type ContextualHelpContext } from "../app/contextualHelp";
import {
  createReadOnlyHelpRequest,
  deterministicHelpProvider,
  helpProviderMayRun,
  type ReadOnlyHelpProvider,
} from "../app/readOnlyHelpProvider";
import {
  localizedScientificHelpTopic,
  scientificHelpTopics,
  type ScientificHelpTopicId,
} from "../app/scientificHelpGlossary";
import { useAppLocale } from "../app/appLocale";

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
  const locale = useAppLocale();
  const ja = locale === "ja";
  const titleId = useId();
  const triggerRef = useRef<HTMLButtonElement>(null);
  const panelRef = useRef<HTMLElement>(null);
  const [open, setOpen] = useState(false);
  const [topicId, setTopicId] = useState<ScientificHelpTopicId | null>(initialTopicId ?? null);
  const [answer, setAnswer] = useState<string | null>(null);
  const [pending, setPending] = useState(false);
  const suggestions = useMemo(() => contextualHelpSuggestions(context), [context]);
  const selectedTopic = topicId ? localizedScientificHelpTopic(topicId, locale) : null;
  const providerEnabled = helpProviderMayRun(provider, externalProviderOptIn);
  const closeHelp = () => setOpen(false);

  useEffect(() => {
    if (!open) return;
    const previousBodyOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
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
      document.body.style.overflow = previousBodyOverflow;
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
        createReadOnlyHelpRequest({ context, locale, ...(topicId ? { topicId } : {}) }),
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
        onClick={() => setOpen((current) => !current)}
      >
        <span aria-hidden="true">?</span> {label === "ヘルプ" && !ja ? "Help" : label}
      </button>
      {open
        ? createPortal(
            <div
              className="contextual-help-backdrop"
              role="presentation"
              onPointerDown={(event) => {
                if (event.target === event.currentTarget) closeHelp();
              }}
            >
              <section
                ref={panelRef}
                className="contextual-help-panel"
                role="dialog"
                aria-modal="true"
                aria-labelledby={titleId}
              >
                <header>
                  <div>
                    <span className="contextual-help-kicker">
                      {ja ? "この画面のHelp" : "Help for this screen"}
                    </span>
                    <h2 id={titleId}>{ja ? "用語と解析の考え方" : "Terms and analysis concepts"}</h2>
                  </div>
                  <button
                    type="button"
                    aria-label={ja ? "ヘルプを閉じる" : "Close Help"}
                    onClick={closeHelp}
                  >
                    ×
                  </button>
                </header>
                <p className="contextual-help-privacy">
                  {provider.processing === "local"
                    ? ja
                      ? "この説明は端末内の固定Helpから表示します。データは送信されません。"
                      : "This explanation comes from fixed local Help. No data are sent."
                    : providerEnabled
                      ? ja
                        ? "外部providerへ最小限の画面文脈を送ります。rawデータは送信せず、統計結果はローカルで生成されます。"
                        : "Only minimal screen context is sent to the external provider. Raw data are excluded and statistical results remain local."
                      : ja
                        ? "外部providerは無効です。初回利用前に、送信内容を確認して明示的にopt-inする必要があります。"
                        : "The external provider is disabled. Review what would be sent and explicitly opt in before first use."}
                </p>

                <section aria-labelledby={`${titleId}-suggestions`}>
                  <h3 id={`${titleId}-suggestions`}>
                    {ja ? "現在の文脈に関連する項目" : "Relevant to the current context"}
                  </h3>
                  <div className="contextual-help-suggestions">
                    {suggestions.map(({ topic, reason }) => (
                      <button
                        key={topic.id}
                        type="button"
                        className={topic.id === topicId ? "is-selected" : ""}
                        onClick={() => selectTopic(topic.id)}
                      >
                        <strong>{localizedScientificHelpTopic(topic.id, locale).title}</strong>
                        <span>{ja ? reason : "Relevant to the current experiment or analysis context"}</span>
                      </button>
                    ))}
                  </div>
                </section>

                <label className="contextual-help-topic-select">
                  <span>{ja ? "用語集から選ぶ" : "Choose from the glossary"}</span>
                  <select
                    value={topicId ?? ""}
                    onChange={(event) =>
                      setTopicId(
                        (event.currentTarget.value || null) as ScientificHelpTopicId | null,
                      )
                    }
                  >
                    <option value="">{ja ? "選択してください" : "Select a topic"}</option>
                    {scientificHelpTopics.map((topic) => (
                      <option key={topic.id} value={topic.id}>
                        {localizedScientificHelpTopic(topic.id, locale).title}
                      </option>
                    ))}
                  </select>
                </label>

                {selectedTopic ? (
                  <article className="contextual-help-answer" aria-live="polite">
                    <h3>{selectedTopic.title}</h3>
                    <p>{selectedTopic.summary}</p>
                    {selectedTopic.limitation ? (
                      <p>
                        {ja ? "注意：" : "Caution: "}
                        {selectedTopic.limitation}
                      </p>
                    ) : null}
                  </article>
                ) : null}
                {answer ? <pre className="contextual-help-provider-answer">{answer}</pre> : null}

                <footer>
                  <span>
                    {ja
                      ? "Helpは説明専用で、実験設計・データ・統計・Graphを変更しません。"
                      : "Help is explanatory only. It does not change the design, data, Statistics, or Graph."}
                  </span>
                  <div className="contextual-help-footer-actions">
                    <button
                      type="button"
                      onClick={() => void explain()}
                      disabled={pending || !providerEnabled}
                    >
                      {pending
                        ? ja
                          ? "説明を準備中…"
                          : "Preparing explanation…"
                        : ja
                          ? "文脈に合わせて説明"
                          : "Explain for this context"}
                    </button>
                    <button type="button" className="is-secondary" onClick={closeHelp}>
                      {ja ? "閉じる" : "Close"}
                    </button>
                  </div>
                </footer>
              </section>
            </div>,
            document.body,
          )
        : null}
    </>
  );
}

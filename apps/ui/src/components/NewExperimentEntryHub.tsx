import "./NewExperimentEntryHub.css";

export const NEW_EXPERIMENT_ENTRY_IDS = [
  "simple",
  "general",
  "graphOnly",
  "survival",
  "orderedCurve",
  "heatmap",
  "compatibility",
] as const;

export type NewExperimentEntryId = (typeof NEW_EXPERIMENT_ENTRY_IDS)[number];

export type EntryAvailability = Readonly<{
  available: boolean;
  reason?: string;
}>;

export type NewExperimentEntryHubProps = Readonly<{
  onSimple: () => void;
  onGeneral: () => void;
  onGraphOnly: () => void;
  onSurvival: () => void;
  onOrderedCurve: () => void;
  onHeatmap: () => void;
  onCompatibility?: () => void;
  availability?: Partial<Record<NewExperimentEntryId, EntryAvailability>>;
}>;

type EntryCard = Readonly<{
  id: Exclude<NewExperimentEntryId, "compatibility">;
  title: string;
  description: string;
  actionLabel: string;
  recommended?: boolean;
}>;

const PRIMARY_ENTRY_CARDS: readonly EntryCard[] = [
  {
    id: "general",
    title: "実験から始める",
    description: "処理条件、同じ試料の繰り返し、Cell・ROIなどの階層を短い質問で確認します。",
    actionLabel: "質問に答えて始める",
    recommended: true,
  },
  {
    id: "graphOnly",
    title: "手元の表からGraphを作る",
    description:
      "既存の表を貼り付けてGraphへ進みます。Statisticsを使う時だけ実験情報を追加します。",
    actionLabel: "表を貼り付ける",
  },
];

const DEDICATED_ENTRY_CARDS: readonly EntryCard[] = [
  {
    id: "simple",
    title: "単純な独立群比較",
    description: "1測定項目・独立した2〜4条件・1実験単位に1つの値を入力します。",
    actionLabel: "条件別シートを開く",
  },
  {
    id: "survival",
    title: "生存時間（Kaplan–Meier）",
    description: "対象ID、群、観察期間、event・打ち切りを専用の表へ入力します。",
    actionLabel: "専用シートを開く",
  },
  {
    id: "orderedCurve",
    title: "濃度–反応・酵素反応",
    description:
      "基質濃度–計算済み反応初速度と、時間–応答・飽和カーブのX/Yデータを入力します。",
    actionLabel: "専用シートを開く",
  },
  {
    id: "heatmap",
    title: "ヒートマップ",
    description: "数値行列の配置を保ったまま可視化します。",
    actionLabel: "専用シートを開く",
  },
];

function availabilityFor(
  id: NewExperimentEntryId,
  availability: NewExperimentEntryHubProps["availability"],
): EntryAvailability {
  return availability?.[id] ?? { available: true };
}

export function NewExperimentEntryHub({
  onSimple,
  onGeneral,
  onGraphOnly,
  onSurvival,
  onOrderedCurve,
  onHeatmap,
  onCompatibility,
  availability,
}: NewExperimentEntryHubProps) {
  const callbacks: Record<Exclude<NewExperimentEntryId, "compatibility">, () => void> = {
    simple: onSimple,
    general: onGeneral,
    graphOnly: onGraphOnly,
    survival: onSurvival,
    orderedCurve: onOrderedCurve,
    heatmap: onHeatmap,
  };
  const compatibility = availabilityFor("compatibility", availability);
  const renderEntryCard = (entry: EntryCard, compact = false) => {
    const state = availabilityFor(entry.id, availability);
    const reasonId = `new-entry-${entry.id}-reason`;
    return (
      <article
        className={`new-entry-hub__card${entry.recommended ? " is-recommended" : ""}${compact ? " new-entry-hub__card--compact" : ""}`}
        key={entry.id}
        data-entry-id={entry.id}
      >
        <button
          className="new-entry-hub__card-action"
          type="button"
          disabled={!state.available}
          aria-label={`${entry.title}を開く`}
          aria-describedby={!state.available ? reasonId : undefined}
          onClick={callbacks[entry.id]}
        >
          <span className="new-entry-hub__title-row">
            <span className="new-entry-hub__card-title" role="heading" aria-level={3}>
              {entry.title}
            </span>
            {entry.recommended ? (
              <span className="new-entry-hub__recommended">通常はこちら</span>
            ) : null}
          </span>
          <span className="new-entry-hub__card-description">{entry.description}</span>
          <span className="new-entry-hub__action-label" aria-hidden="true">
            {entry.actionLabel}
            <span>→</span>
          </span>
        </button>
        {!state.available ? (
          <p className="new-entry-hub__unavailable" id={reasonId} role="note">
            {state.reason?.trim() || "この入口は現在利用できません。"}
          </p>
        ) : null}
      </article>
    );
  };

  return (
    <section
      className="new-entry-hub"
      aria-labelledby="new-entry-hub-heading"
      data-usage-area="entry_choice"
    >
      <header className="new-entry-hub__heading">
        <h1 id="new-entry-hub-heading">何から始めますか？</h1>
        <p>実験内容から始めるか、すでにある表・専用形式から始めるかを選びます。</p>
      </header>

      <section className="new-entry-hub__primary" aria-labelledby="new-entry-primary-heading">
        <h2 id="new-entry-primary-heading">主な始め方</h2>
        <div className="new-entry-hub__grid new-entry-hub__grid--primary">
          {PRIMARY_ENTRY_CARDS.map((entry) => renderEntryCard(entry))}
        </div>
      </section>

      <section className="new-entry-hub__dedicated" aria-labelledby="new-entry-dedicated-heading">
        <div className="new-entry-hub__section-heading">
          <h2 id="new-entry-dedicated-heading">入力形式が決まっている実験・データ</h2>
          <p>追加のインタビューを省き、専用シートへ直接進みます。</p>
        </div>
        <div className="new-entry-hub__grid new-entry-hub__grid--dedicated">
          {DEDICATED_ENTRY_CARDS.map((entry) => renderEntryCard(entry, true))}
        </div>
      </section>

      {onCompatibility ? (
        <div className="new-entry-hub__compatibility">
          <p>
            <strong>以前の入口が必要ですか？</strong>
            <span>検証期間中のみ、従来の実験分野から始める画面を利用できます。</span>
          </p>
          <button
            type="button"
            disabled={!compatibility.available}
            aria-describedby={
              !compatibility.available ? "new-entry-compatibility-reason" : undefined
            }
            onClick={onCompatibility}
          >
            以前の入口を使う
          </button>
          {!compatibility.available ? (
            <p
              className="new-entry-hub__unavailable"
              id="new-entry-compatibility-reason"
              role="note"
            >
              {compatibility.reason?.trim() || "以前の入口は現在利用できません。"}
            </p>
          ) : null}
        </div>
      ) : null}
    </section>
  );
}

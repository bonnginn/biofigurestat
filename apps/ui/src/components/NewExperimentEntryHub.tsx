import "./NewExperimentEntryHub.css";

export const NEW_EXPERIMENT_ENTRY_IDS = [
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
  accent: "blue" | "violet" | "green" | "orange";
}>;

const PRIMARY_ENTRY_CARDS: readonly EntryCard[] = [
  {
    id: "general",
    title: "実験から始める",
    description: "条件・対応・反復・階層を確認して、実験に合う入力表を作ります。",
    accent: "blue",
  },
  {
    id: "graphOnly",
    title: "手元の表からGraphを作る",
    description: "表を貼ってGraphへ。統計が必要な時だけ実験構造を確認します。",
    accent: "violet",
  },
];

const DEDICATED_ENTRY_CARDS: readonly EntryCard[] = [
  {
    id: "survival",
    title: "生存時間（Kaplan–Meier）",
    description: "各対象の観察期間とevent・打ち切りを入力します。",
    accent: "green",
  },
  {
    id: "orderedCurve",
    title: "酵素反応・飽和カーブ",
    description:
      "基質濃度–初速度、または時間–応答を入力します。対応するmodelを選んだ後だけfitします。",
    accent: "blue",
  },
  {
    id: "heatmap",
    title: "ヒートマップ",
    description: "数値行列の配置を保ったまま可視化します。",
    accent: "orange",
  },
];

function availabilityFor(
  id: NewExperimentEntryId,
  availability: NewExperimentEntryHubProps["availability"],
): EntryAvailability {
  return availability?.[id] ?? { available: true };
}

export function NewExperimentEntryHub({
  onGeneral,
  onGraphOnly,
  onSurvival,
  onOrderedCurve,
  onHeatmap,
  onCompatibility,
  availability,
}: NewExperimentEntryHubProps) {
  const callbacks: Record<Exclude<NewExperimentEntryId, "compatibility">, () => void> = {
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
        className={`new-entry-hub__card new-entry-hub__card--${entry.accent}${compact ? " new-entry-hub__card--compact" : ""}`}
        key={entry.id}
        data-entry-id={entry.id}
      >
        <h3>{entry.title}</h3>
        <p>{entry.description}</p>
        <button
          type="button"
          disabled={!state.available}
          aria-label={`${entry.title}を開く`}
          aria-describedby={!state.available ? reasonId : undefined}
          onClick={callbacks[entry.id]}
        >
          開く
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
    <section className="new-entry-hub" aria-labelledby="new-entry-hub-heading">
      <header className="new-entry-hub__heading">
        <p className="new-entry-hub__eyebrow">新しい実験</p>
        <h1 id="new-entry-hub-heading">何から始めますか？</h1>
        <p>
          目的に近い入口を選んでください。データの貼り付けやファイル取込は、それぞれの入口の中で行えます。
        </p>
      </header>

      <section className="new-entry-hub__primary" aria-labelledby="new-entry-primary-heading">
        <h2 id="new-entry-primary-heading">主な始め方</h2>
        <div className="new-entry-hub__grid new-entry-hub__grid--primary">
          {PRIMARY_ENTRY_CARDS.map((entry) => renderEntryCard(entry))}
        </div>
      </section>

      <section className="new-entry-hub__dedicated" aria-labelledby="new-entry-dedicated-heading">
        <div className="new-entry-hub__section-heading">
          <h2 id="new-entry-dedicated-heading">専用の入力形式</h2>
          <p>記録形式が決まっているデータは、専用シートへ直接進めます。</p>
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

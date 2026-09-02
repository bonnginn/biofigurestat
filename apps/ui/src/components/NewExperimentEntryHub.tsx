import "./NewExperimentEntryHub.css";
import { useAppLocale } from "../app/appLocale";

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
  titleEn: string;
  description: string;
  descriptionEn: string;
  actionLabel: string;
  actionLabelEn: string;
  recommended?: boolean;
}>;

const PRIMARY_ENTRY_CARDS: readonly EntryCard[] = [
  {
    id: "general",
    title: "実験から始める",
    titleEn: "Start from an experiment",
    description: "処理条件、同じ試料の繰り返し、Cell・ROIなどの階層を短い質問で確認します。",
    descriptionEn:
      "Answer short questions about treatments, repeated measurements, and Cell or ROI hierarchy.",
    actionLabel: "質問に答えて始める",
    actionLabelEn: "Answer questions and start",
    recommended: true,
  },
  {
    id: "graphOnly",
    title: "手元の表からGraphを作る",
    titleEn: "Create a graph from an existing table",
    description:
      "既存の表を貼り付けてGraphへ進みます。Statisticsを使う時だけ実験情報を追加します。",
    descriptionEn:
      "Paste an existing table and proceed to Graph. Add experiment information only when Statistics requires it.",
    actionLabel: "表を貼り付ける",
    actionLabelEn: "Paste a table",
  },
];

const DEDICATED_ENTRY_CARDS: readonly EntryCard[] = [
  {
    id: "simple",
    title: "単純な独立群比較",
    titleEn: "Simple independent-group comparison",
    description: "1測定項目・独立した2条件以上・1実験単位に1つの値を入力します。",
    descriptionEn:
      "Enter one readout for two or more independent conditions, with one value per experimental unit.",
    actionLabel: "条件別シートを開く",
    actionLabelEn: "Open grouped worksheet",
  },
  {
    id: "survival",
    title: "生存時間（Kaplan–Meier）",
    titleEn: "Survival (Kaplan–Meier)",
    description: "対象ID、群、観察期間、event・打ち切りを専用の表へ入力します。",
    descriptionEn:
      "Enter subject ID, group, follow-up time, and event or censoring status in a dedicated worksheet.",
    actionLabel: "専用シートを開く",
    actionLabelEn: "Open dedicated worksheet",
  },
  {
    id: "orderedCurve",
    title: "濃度–反応・酵素反応",
    titleEn: "Dose-response and enzyme kinetics",
    description: "基質濃度–計算済み反応初速度と、時間–応答・飽和カーブのX/Yデータを入力します。",
    descriptionEn:
      "Enter substrate concentration–calculated initial velocity or time–response X/Y data.",
    actionLabel: "専用シートを開く",
    actionLabelEn: "Open dedicated worksheet",
  },
  {
    id: "heatmap",
    title: "ヒートマップ",
    titleEn: "Heatmap",
    description: "数値行列の配置を保ったまま可視化します。",
    descriptionEn: "Visualize a numeric matrix without changing its arrangement.",
    actionLabel: "専用シートを開く",
    actionLabelEn: "Open dedicated worksheet",
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
  const locale = useAppLocale();
  const ja = locale === "ja";
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
    const title = ja ? entry.title : entry.titleEn;
    const description = ja ? entry.description : entry.descriptionEn;
    const actionLabel = ja ? entry.actionLabel : entry.actionLabelEn;
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
          aria-label={ja ? `${title}を開く` : `Open ${title}`}
          aria-describedby={!state.available ? reasonId : undefined}
          onClick={callbacks[entry.id]}
        >
          <span className="new-entry-hub__title-row">
            <span className="new-entry-hub__card-title" role="heading" aria-level={3}>
              {title}
            </span>
            {entry.recommended ? (
              <span className="new-entry-hub__recommended">
                {ja ? "通常はこちら" : "Recommended"}
              </span>
            ) : null}
          </span>
          <span className="new-entry-hub__card-description">{description}</span>
          <span className="new-entry-hub__action-label" aria-hidden="true">
            {actionLabel}
            <span>→</span>
          </span>
        </button>
        {!state.available ? (
          <p className="new-entry-hub__unavailable" id={reasonId} role="note">
            {state.reason?.trim() ||
              (ja ? "この入口は現在利用できません。" : "This entry is currently unavailable.")}
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
        <h1 id="new-entry-hub-heading">
          {ja ? "何から始めますか？" : "Where would you like to start?"}
        </h1>
        <p>
          {ja
            ? "実験内容から始めるか、すでにある表・専用形式から始めるかを選びます。"
            : "Start from the experiment, an existing table, or a dedicated data format."}
        </p>
      </header>

      <section className="new-entry-hub__primary" aria-labelledby="new-entry-primary-heading">
        <h2 id="new-entry-primary-heading">{ja ? "主な始め方" : "Main entry points"}</h2>
        <div className="new-entry-hub__grid new-entry-hub__grid--primary">
          {PRIMARY_ENTRY_CARDS.map((entry) => renderEntryCard(entry))}
        </div>
      </section>

      <section className="new-entry-hub__dedicated" aria-labelledby="new-entry-dedicated-heading">
        <div className="new-entry-hub__section-heading">
          <h2 id="new-entry-dedicated-heading">
            {ja ? "入力形式が決まっている実験・データ" : "Experiments with a defined data format"}
          </h2>
          <p>
            {ja
              ? "追加のインタビューを省き、専用シートへ直接進みます。"
              : "Skip the general interview and open a dedicated worksheet."}
          </p>
        </div>
        <div className="new-entry-hub__grid new-entry-hub__grid--dedicated">
          {DEDICATED_ENTRY_CARDS.map((entry) => renderEntryCard(entry, true))}
        </div>
      </section>

      {onCompatibility ? (
        <div className="new-entry-hub__compatibility">
          <p>
            <strong>{ja ? "以前の入口が必要ですか？" : "Need the previous entry screen?"}</strong>
            <span>
              {ja
                ? "検証期間中のみ、従来の実験分野から始める画面を利用できます。"
                : "The legacy experiment-category screen remains available during validation."}
            </span>
          </p>
          <button
            type="button"
            disabled={!compatibility.available}
            aria-describedby={
              !compatibility.available ? "new-entry-compatibility-reason" : undefined
            }
            onClick={onCompatibility}
          >
            {ja ? "以前の入口を使う" : "Use previous entry"}
          </button>
          {!compatibility.available ? (
            <p
              className="new-entry-hub__unavailable"
              id="new-entry-compatibility-reason"
              role="note"
            >
              {compatibility.reason?.trim() ||
                (ja
                  ? "以前の入口は現在利用できません。"
                  : "The previous entry is currently unavailable.")}
            </p>
          ) : null}
        </div>
      ) : null}
    </section>
  );
}

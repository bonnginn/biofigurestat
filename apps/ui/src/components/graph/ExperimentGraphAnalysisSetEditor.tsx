import {
  sharedSourceConditionTopology,
  type ExperimentSetDraft,
} from "../../app/experimentDraft";
import { localizedText, useAppLocale } from "../../app/appLocale";

type Props = Readonly<{
  draft: ExperimentSetDraft;
  selectedReadoutId: string;
  selectedConditionIds: readonly string[];
  onReadoutChange: (readoutId: string) => void;
  onConditionChange: (conditionId: string, checked: boolean) => void;
}>;

export function ExperimentGraphAnalysisSetEditor({
  draft,
  selectedReadoutId,
  selectedConditionIds,
  onReadoutChange,
  onConditionChange,
}: Props) {
  const locale = useAppLocale();
  const t = (ja: string, en: string) => localizedText(locale, ja, en);
  const selected = new Set(selectedConditionIds);
  const sharedSourceTopology = sharedSourceConditionTopology(draft);

  return (
    <section className="experiment-graph-inspector-section experiment-statistics-source">
      <h3>{t("解析対象", "Analysis set")}</h3>
      <label className="experiment-graph-field">
        <span>{t("測定項目", "Measured readout")}</span>
        <select
          value={selectedReadoutId}
          disabled={draft.readouts.length <= 1}
          aria-label={t("統計の測定項目", "Measured readout for statistics")}
          onChange={(event) => onReadoutChange(event.target.value)}
        >
          {draft.readouts.map((item) => (
            <option key={item.id} value={item.id}>
              {item.label}
            </option>
          ))}
        </select>
      </label>
      <fieldset className="experiment-graph-condition-fieldset">
        <legend>{t("統計に含める条件", "Conditions included in statistics")}</legend>
        {draft.conditions.map((condition) => (
          <label className="experiment-graph-checkbox" key={condition.id}>
            <input
              type="checkbox"
              value={condition.id}
              checked={selected.has(condition.id)}
              disabled={draft.analysisIntent.kind === "correlation"}
              aria-label={t(
                `統計の条件：${condition.label}`,
                `Statistical condition: ${condition.label}`,
              )}
              onChange={(event) => onConditionChange(condition.id, event.target.checked)}
            />
            <span>
              {condition.label}
              {condition.id === draft.controlConditionId ? t("（対照群）", " (control)") : ""}
              {condition.role === "auxiliary_reference"
                ? t("（図のみのreference）", " (Graph-only reference)")
                : ""}
            </span>
          </label>
        ))}
      </fieldset>
      <p className="experiment-graph-help">
        {t(
          "図に表示する条件とは独立して選べます。referenceを図に残したまま、事前に決めた比較だけを解析できます。",
          "Choose these independently from the conditions shown in the Graph. You can retain a reference in the Graph while analyzing only prespecified comparisons.",
        )}
      </p>
      <dl className="experiment-statistics-design-summary">
        <div>
          <dt>{t("統計上の単位", "Statistical unit")}</dt>
          <dd>
            {sharedSourceTopology
              ? t(
                  `条件別${draft.conditionAssignment.unitLabel}`,
                  `Condition-specific ${draft.conditionAssignment.unitLabel}`,
                )
              : draft.conditionAssignment.unitLabel}
          </dd>
        </div>
        <div>
          <dt>{t("設計の解釈", "Design interpretation")}</dt>
          <dd>
            {sharedSourceTopology
              ? t(
                  `同じ${sharedSourceTopology.sourceUnitLabel}に由来する条件別${draft.conditionAssignment.unitLabel}を対応づけて比較`,
                  `Compare matched condition-specific ${draft.conditionAssignment.unitLabel}s from the same ${sharedSourceTopology.sourceUnitLabel}`,
                )
              : draft.conditionAssignment.kind === "matched"
                ? t(
                    "同じ実験単位を条件間で比較",
                    "Compare the same experimental units across conditions",
                  )
                : t("条件ごとに別の実験単位", "Separate experimental units for each condition")}
          </dd>
        </div>
        <div>
          <dt>{t("対照群", "Control condition")}</dt>
          <dd>
            {draft.controlConditionId
              ? (draft.conditions.find(({ id }) => id === draft.controlConditionId)?.label ??
                t("指定済み", "Specified"))
              : t(
                  "未指定（表示名からは推測しません）",
                  "Not specified (not inferred from the display name)",
                )}
          </dd>
        </div>
      </dl>
    </section>
  );
}

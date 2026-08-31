import type { ExperimentSetDraft } from "../app/experimentDraft";
import {
  orderedAxisSemantic,
  orderedAxisTitle,
  orderedAxisUnit,
  timePointLabel,
} from "../app/experimentDraft";
import "./ConditionTimePreview.css";
import { localizedText, useAppLocale, type AppLocale } from "../app/appLocale";

type ConditionTimePreviewProps = Readonly<{
  draft: ExperimentSetDraft;
  compact?: boolean;
}>;

function samplingLabel(draft: ExperimentSetDraft, locale: AppLocale): string {
  if (draft.time.sampling === "none") return localizedText(locale, "順序のある測定軸なし", "No ordered measurement axis");
  const axis = orderedAxisSemantic(draft.time) === "time"
    ? localizedText(locale, "時間点", "time point")
    : localizedText(locale, "軸水準", "axis level");
  return draft.time.sampling === "cross_sectional"
    ? locale === "ja" ? `${axis}ごとに別のサンプル` : `Separate samples at each ${axis}`
    : locale === "ja" ? `同じ単位を${axis}ごとに反復測定` : `Repeated measurements of the same unit at each ${axis}`;
}

/**
 * A structure-only preview for the design confirmation step.
 *
 * It deliberately does not draw observations, means, trends, or replicate
 * dots. The purpose of this component is to confirm labels and the time
 * layout before the researcher starts entering measurements.
 */
export function ConditionTimePreview({ draft, compact = false }: ConditionTimePreviewProps) {
  const locale = useAppLocale();
  const t = (ja: string, en: string) => localizedText(locale, ja, en);
  const primaryAttribute = draft.attributes[0];
  const conditionGroups = draft.conditions.reduce<
    Array<{ key: string; value: string; conditionIds: string[] }>
  >((groups, condition) => {
    const value = primaryAttribute
      ? condition.attributes[primaryAttribute.id]?.trim() || t("未分類", "Unclassified")
      : t("条件", "Condition");
    const existing = groups.find((group) => group.value === value);
    if (existing) {
      existing.conditionIds.push(condition.id);
    } else {
      groups.push({
        key: `${primaryAttribute?.id ?? "condition"}:${value}`,
        value,
        conditionIds: [condition.id],
      });
    }
    return groups;
  }, []);

  return (
    <section
      className={`condition-time-preview${compact ? " condition-time-preview--compact" : ""}`}
      aria-label={t("条件と測定軸の配置プレビュー", "Condition and measurement-axis layout preview")}
    >
      <div className="condition-time-preview__heading">
        <div>
          <p className="condition-time-preview__eyebrow">{t("入力前に確認", "Review before data entry")}</p>
          <h2>{t("条件と測定軸の配置", "Condition and measurement-axis layout")}</h2>
        </div>
        <span className="condition-time-preview__badge">{t("配置のみ", "Structure only")}</span>
      </div>
      <p className="condition-time-preview__note">
        {t("実際の測定値や傾向は表示していません。条件名と時間の並びだけを確認します。", "No measurements or trends are shown. Review only the condition names and ordered-axis layout.")}
      </p>

      <div className="condition-time-preview__body">
        <div className="condition-time-preview__block">
          <p className="condition-time-preview__label">{t("条件", "Conditions")}</p>
          {primaryAttribute ? (
            <p className="condition-time-preview__group-note">
              {locale === "ja"
                ? `同じ「${primaryAttribute.label || "第1列"}」の値は同じ上位項目としてまとめています。その中の各カードは別々の条件のままで、統計上のn（実験反復）として混ぜません。`
                : `Values that share “${primaryAttribute.label || "the first column"}” are grouped under the same parent item. Each card remains a separate condition and is not combined as statistical n (experimental replicates).`}
            </p>
          ) : null}
          <div className="condition-time-preview__groups">
            {conditionGroups.map((group) => (
              <section
                className="condition-time-preview__group"
                data-condition-group={group.value}
                key={group.key}
                aria-label={`${primaryAttribute?.label || t("条件", "Condition")}: ${group.value}`}
              >
                <div className="condition-time-preview__group-heading">
                  <strong>
                    {primaryAttribute?.label || t("条件", "Condition")}: {group.value}
                  </strong>
                  <span>{t("同じ項目", "Same item")} · {group.conditionIds.length} {t("条件", "conditions")}</span>
                </div>
                <div className="condition-time-preview__conditions">
                  {draft.conditions
                    .filter((condition) => group.conditionIds.includes(condition.id))
                    .map((condition) => (
                      <div className="condition-time-preview__condition" key={condition.id}>
                        <span className="condition-time-preview__condition-name">
                          {condition.label || t("名前未入力", "Name not entered")}
                        </span>
                        {draft.attributes.slice(1).map((attribute) => {
                          const value = condition.attributes[attribute.id]?.trim();
                          if (!value) return null;
                          return (
                            <span className="condition-time-preview__attribute" key={attribute.id}>
                              {attribute.label || t("属性", "Attribute")}: {value}
                            </span>
                          );
                        })}
                      </div>
                    ))}
                </div>
              </section>
            ))}
          </div>
        </div>

        <div className="condition-time-preview__block">
          <p className="condition-time-preview__label">
            {draft.time.sampling === "none" ? t("順序のある測定軸", "Ordered measurement axis") : orderedAxisTitle(draft.time)}
          </p>
          {draft.time.sampling === "none" ? (
            <p className="condition-time-preview__empty">{t("順序のある測定軸を設定していません", "No ordered measurement axis is configured")}</p>
          ) : (
            <>
              <div className="condition-time-preview__timeline" aria-label={t("測定軸の水準", "Measurement-axis levels")}>
                {draft.time.points.map((point) => (
                  <span className="condition-time-preview__time" key={point.id}>
                    {timePointLabel(point, orderedAxisUnit(draft.time))}
                  </span>
                ))}
              </div>
              <p className="condition-time-preview__sampling">{samplingLabel(draft, locale)}</p>
            </>
          )}
        </div>

        {!compact && (
          <div className="condition-time-preview__block condition-time-preview__block--experiments">
            <p className="condition-time-preview__label">{t("実験回", "Experiment sessions")}</p>
            <div className="condition-time-preview__experiments">
              {draft.experiments.map((experiment) => (
                <span className="condition-time-preview__experiment" key={experiment.id}>
                  {experiment.label || t("実験回", "Experiment session")}
                </span>
              ))}
            </div>
          </div>
        )}
      </div>
    </section>
  );
}

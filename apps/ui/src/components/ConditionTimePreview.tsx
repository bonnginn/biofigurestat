import type { ExperimentSetDraft } from "../app/experimentDraft";
import { timePointLabel } from "../app/experimentDraft";
import "./ConditionTimePreview.css";

type ConditionTimePreviewProps = Readonly<{
  draft: ExperimentSetDraft;
  compact?: boolean;
}>;

const SAMPLING_LABELS = {
  none: "時間点なし",
  cross_sectional: "時間点ごとに別のサンプル",
  longitudinal: "同じ単位を時間ごとに追う",
} as const;

/**
 * A structure-only preview for the design confirmation step.
 *
 * It deliberately does not draw observations, means, trends, or replicate
 * dots. The purpose of this component is to confirm labels and the time
 * layout before the researcher starts entering measurements.
 */
export function ConditionTimePreview({ draft, compact = false }: ConditionTimePreviewProps) {
  const primaryAttribute = draft.attributes[0];
  const conditionGroups = draft.conditions.reduce<
    Array<{ key: string; value: string; conditionIds: string[] }>
  >((groups, condition) => {
    const value = primaryAttribute
      ? condition.attributes[primaryAttribute.id]?.trim() || "未分類"
      : "条件";
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
      aria-label="条件と時間の配置プレビュー"
    >
      <div className="condition-time-preview__heading">
        <div>
          <p className="condition-time-preview__eyebrow">入力前に確認</p>
          <h2>条件と時間の配置</h2>
        </div>
        <span className="condition-time-preview__badge">配置のみ</span>
      </div>
      <p className="condition-time-preview__note">
        実際の測定値や傾向は表示していません。条件名と時間の並びだけを確認します。
      </p>

      <div className="condition-time-preview__body">
        <div className="condition-time-preview__block">
          <p className="condition-time-preview__label">条件</p>
          {primaryAttribute ? (
            <p className="condition-time-preview__group-note">
              {`同じ「${primaryAttribute.label || "第1列"}」の値は同じ上位項目としてまとめています。その中の各カードは別々の条件のままで、統計上のn（実験反復）として混ぜません。`}
            </p>
          ) : null}
          <div className="condition-time-preview__groups">
            {conditionGroups.map((group) => (
              <section
                className="condition-time-preview__group"
                data-condition-group={group.value}
                key={group.key}
                aria-label={`${primaryAttribute?.label || "条件"}: ${group.value}`}
              >
                <div className="condition-time-preview__group-heading">
                  <strong>
                    {primaryAttribute?.label || "条件"}: {group.value}
                  </strong>
                  <span>同じ項目 · {group.conditionIds.length}条件</span>
                </div>
                <div className="condition-time-preview__conditions">
                  {draft.conditions
                    .filter((condition) => group.conditionIds.includes(condition.id))
                    .map((condition) => (
                      <div className="condition-time-preview__condition" key={condition.id}>
                        <span className="condition-time-preview__condition-name">
                          {condition.label || "名前未入力"}
                        </span>
                        {draft.attributes.slice(1).map((attribute) => {
                          const value = condition.attributes[attribute.id]?.trim();
                          if (!value) return null;
                          return (
                            <span className="condition-time-preview__attribute" key={attribute.id}>
                              {attribute.label || "属性"}: {value}
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
          <p className="condition-time-preview__label">時間</p>
          {draft.time.sampling === "none" ? (
            <p className="condition-time-preview__empty">時間点を設定していません</p>
          ) : (
            <>
              <div className="condition-time-preview__timeline" aria-label="時間点">
                {draft.time.points.map((point) => (
                  <span className="condition-time-preview__time" key={point.id}>
                    {timePointLabel(point, draft.time.unit)}
                  </span>
                ))}
              </div>
              <p className="condition-time-preview__sampling">
                {SAMPLING_LABELS[draft.time.sampling]}
              </p>
            </>
          )}
        </div>

        {!compact && (
          <div className="condition-time-preview__block condition-time-preview__block--experiments">
            <p className="condition-time-preview__label">実験回</p>
            <div className="condition-time-preview__experiments">
              {draft.experiments.map((experiment) => (
                <span className="condition-time-preview__experiment" key={experiment.id}>
                  {experiment.label || "実験回"}
                </span>
              ))}
            </div>
          </div>
        )}
      </div>
    </section>
  );
}

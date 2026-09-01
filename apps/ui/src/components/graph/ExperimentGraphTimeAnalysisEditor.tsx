import type { ExperimentSetDraft, TimeAnalysisPlan } from "../../app/experimentDraft";
import { isDerivedTimeMetric } from "../../app/experimentDraftAnalysis";
import { localizedText, useAppLocale } from "../../app/appLocale";

type Props = Readonly<{
  time: ExperimentSetDraft["time"];
  plan: TimeAnalysisPlan;
  analysisTimePointId: string | null;
  onKindChange: (kind: TimeAnalysisPlan["kind"]) => void;
  onPlanChange: (plan: TimeAnalysisPlan) => void;
  onAnalysisTimePointChange: (timePointId: string | null) => void;
}>;

function optionalTime(value: string): number | undefined {
  return value === "" ? undefined : Number(value);
}

export function ExperimentGraphTimeAnalysisEditor({
  time,
  plan,
  analysisTimePointId,
  onKindChange,
  onPlanChange,
  onAnalysisTimePointChange,
}: Props) {
  const locale = useAppLocale();
  const t = (ja: string, en: string) => localizedText(locale, ja, en);
  const longitudinal = time.sampling === "longitudinal";
  const timeOptions = time.points.map((point) => (
    <option key={point.id} value={point.value}>
      {point.value} {time.unit}
    </option>
  ));

  return (
    <section className="experiment-graph-statistics-section">
      <h3>{t("時系列から何を比較するか", "What to compare from the time series")}</h3>
      <label className="experiment-graph-field">
        <span>{t("解析に使う値", "Value used for analysis")}</span>
        <select
          aria-label={t("時系列の解析値", "Time-series analysis value")}
          value={plan.kind}
          onChange={(event) => onKindChange(event.target.value as TimeAnalysisPlan["kind"])}
        >
          <option value="selected_timepoint">{t("選んだ時点の値", "Selected time point")}</option>
          <option value="full_time_course">
            {longitudinal
              ? t("条件×時間（反復測定の全体モデル）", "Condition × time (repeated-measures model)")
              : t(
                  "条件×時間（時点ごとに独立な全体モデル）",
                  "Condition × time (independent units at each time point)",
                )}
          </option>
          <option value="endpoint" disabled={!longitudinal}>
            {t("最後の時点（endpoint）", "Last time point (endpoint)")}
          </option>
          <option value="maximum" disabled={!longitudinal}>
            {t("最大値", "Maximum")}
          </option>
          <option value="minimum" disabled={!longitudinal}>
            {t("最小値", "Minimum")}
          </option>
          <option value="auc" disabled={!longitudinal}>
            {t("AUC（台形法）", "AUC (trapezoidal rule)")}
          </option>
          <option value="change_from_baseline" disabled={!longitudinal}>
            {t("baselineからの変化量", "Change from baseline")}
          </option>
          <option value="f_over_f0" disabled={!longitudinal}>
            {t("F/F0（最初の時点を基準）", "F/F0 (relative to the first time point)")}
          </option>
        </select>
      </label>

      {!longitudinal ? (
        <p className="experiment-graph-help">
          {t(
            "時点ごとに別サンプルのため、AUCやbaseline変化は選べません。",
            "AUC and baseline changes are unavailable because each time point uses different samples.",
          )}
        </p>
      ) : null}
      {plan.kind === "auc" ? (
        <p className="experiment-graph-help">
          {t(
            `AUCは時間曲線の下の面積です。選んだ範囲の応答の大きさと持続時間を1つの値にまとめます。単位は「測定値 ×${time.unit}」で、時間経過の形や開始値の違いは別に確認が必要です。`,
            `AUC is the area under the time curve. It combines response magnitude and duration over the selected window. Its unit is measured value × ${time.unit}; curve shape and baseline differences should be reviewed separately.`,
          )}
        </p>
      ) : null}

      {plan.kind === "selected_timepoint" ? (
        <label className="experiment-graph-field">
          <span>{t("グラフとは別に選択", "Select independently of the Graph")}</span>
          <select
            aria-label={t("解析する時点", "Time point for analysis")}
            value={analysisTimePointId ?? ""}
            onChange={(event) => onAnalysisTimePointChange(event.target.value || null)}
          >
            <option value="">{t("時点を選択", "Select a time point")}</option>
            {time.points.map((point) => (
              <option key={point.id} value={point.id}>
                {point.value} {time.unit}
              </option>
            ))}
          </select>
        </label>
      ) : null}

      {isDerivedTimeMetric(plan) ? (
        <div className="experiment-graph-field-grid">
          <label className="experiment-graph-field">
            <span>{t("解析windowの開始", "Analysis-window start")}</span>
            <select
              aria-label={t("解析windowの開始", "Analysis-window start")}
              value={plan.windowStart ?? ""}
              onChange={(event) =>
                onPlanChange({ ...plan, windowStart: optionalTime(event.target.value) })
              }
            >
              <option value="">{t("最初の時点", "First time point")}</option>
              {timeOptions}
            </select>
          </label>
          <label className="experiment-graph-field">
            <span>{t("解析windowの終了", "Analysis-window end")}</span>
            <select
              aria-label={t("解析windowの終了", "Analysis-window end")}
              value={plan.windowEnd ?? ""}
              onChange={(event) =>
                onPlanChange({ ...plan, windowEnd: optionalTime(event.target.value) })
              }
            >
              <option value="">{t("最後の時点", "Last time point")}</option>
              {timeOptions}
            </select>
          </label>
          {plan.kind === "change_from_baseline" || plan.kind === "f_over_f0" ? (
            <label className="experiment-graph-field">
              <span>{t("baseline時点", "Baseline time point")}</span>
              <select
                aria-label={t("baseline時点", "Baseline time point")}
                value={plan.baselineTime ?? ""}
                onChange={(event) =>
                  onPlanChange({ ...plan, baselineTime: optionalTime(event.target.value) })
                }
              >
                <option value="">{t("最初の時点", "First time point")}</option>
                {timeOptions}
              </select>
            </label>
          ) : null}
        </div>
      ) : null}

      {plan.kind === "full_time_course" ? (
        <p className="experiment-graph-help">
          {longitudinal
            ? t(
                "全時点と実験単位identityを保持し、条件×時間の交互作用を最初に評価します。欠測のないbalanced設計に限定します。",
                "All time points and experimental-unit identities are retained, and the condition × time interaction is evaluated first. This is limited to balanced designs without missing values.",
              )
            : t(
                "各条件×時点で別々の実験単位を使い、交互作用と両主効果を評価します。反復測定とは扱わず、欠測のないbalanced設計に限定します。",
                "Separate experimental units are used for each condition × time cell. The interaction and both main effects are evaluated without treating the design as repeated measures. This is limited to balanced designs without missing values.",
              )}
        </p>
      ) : null}
      <p className="experiment-graph-help">
        {t(
          "図には全時間を表示したまま、特定時点または各実験単位から求めた派生値を解析できます。",
          "The Graph can keep all time points visible while analysis uses a selected time point or a derived value calculated for each experimental unit.",
        )}
      </p>
    </section>
  );
}

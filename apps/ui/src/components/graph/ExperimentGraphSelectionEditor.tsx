import { localizedText, useAppLocale } from "../../app/appLocale";
import type { ExperimentSetDraft, TimeAnalysisPlan } from "../../app/experimentDraft";
import { timeMetricLabel } from "./experimentGraphAnnotations";
import { formatGraphNumber } from "./graphValueFormatting";

export type GraphSourceMode = "raw_readout" | "derived_metric";

export type DerivedGraphLineageRow = Readonly<{
  id: string;
  unit: string;
  condition: string;
  sourceTrace: readonly string[];
  value: number;
}>;

type ExperimentGraphSelectionEditorProps = Readonly<{
  draft: ExperimentSetDraft;
  sourceMode: GraphSourceMode;
  timeAnalysis: TimeAnalysisPlan;
  readoutLabel: string;
  derivedLineageRows: readonly DerivedGraphLineageRow[];
  selectedTimePointIds: readonly string[];
  activeConditionIds: ReadonlySet<string>;
  onSourceModeChange: (mode: GraphSourceMode) => void;
  onAllTimePointsChange: (checked: boolean) => void;
  onTimePointChange: (timePointId: string, checked: boolean) => void;
  onConditionChange: (conditionId: string, checked: boolean) => void;
}>;

export function ExperimentGraphSelectionEditor({
  draft,
  sourceMode,
  timeAnalysis,
  readoutLabel,
  derivedLineageRows,
  selectedTimePointIds,
  activeConditionIds,
  onSourceModeChange,
  onAllTimePointsChange,
  onTimePointChange,
  onConditionChange,
}: ExperimentGraphSelectionEditorProps) {
  const locale = useAppLocale();
  const t = (ja: string, en: string) => localizedText(locale, ja, en);
  const metricLabel = timeMetricLabel(timeAnalysis, locale);

  return (
    <>
      {draft.time.sampling === "longitudinal" && draft.time.points.length > 1 ? (
        <>
          <label className="experiment-graph-field">
            <span>{t("グラフのデータソース", "Graph data source")}</span>
            <select
              aria-label={t("グラフのデータソース", "Graph data source")}
              value={sourceMode}
              onChange={(event) => onSourceModeChange(event.currentTarget.value as GraphSourceMode)}
            >
              <option value="raw_readout">{t("元の時系列", "Original time series")}</option>
              <option value="derived_metric">
                {t("各単位から求めた派生値", "Derived value for each unit")}
              </option>
            </select>
          </label>
          {sourceMode === "derived_metric" ? (
            <details>
              <summary>
                {t("派生値の計算根拠を確認", "Review how derived values were calculated")}
              </summary>
              <p>
                {t("元の測定項目：", "Original readout: ")}
                {readoutLabel}
                {t("。指標：", ". Metric: ")}
                {metricLabel}
                {t("。window：", ". Window: ")}
                {timeAnalysis.windowStart ?? t("最初", "first")}–
                {timeAnalysis.windowEnd ?? t("最後", "last")}
                {t("。時間単位：", ". Time unit: ")}
                {draft.time.unit}
                {t("。", ". ")}
                {timeAnalysis.kind === "auc"
                  ? t("台形法で計算。", "Calculated with the trapezoidal rule.")
                  : t(
                      "元の時系列から単位ごとに計算。",
                      "Calculated for each unit from its original time series.",
                    )}
              </p>
              <table aria-label={t("派生値のラインネージ", "Derived-value lineage")}>
                <thead>
                  <tr>
                    <th scope="col">{t("生物学的単位", "Biological unit")}</th>
                    <th scope="col">{t("条件", "Condition")}</th>
                    <th scope="col">
                      {t("元のトレース（時間: 値）", "Original trace (time: value)")}
                    </th>
                    <th scope="col">{t("派生値", "Derived value")}</th>
                  </tr>
                </thead>
                <tbody>
                  {derivedLineageRows.map((row) => (
                    <tr key={row.id}>
                      <th scope="row">{row.unit}</th>
                      <td>{row.condition}</td>
                      <td>{row.sourceTrace.join(t("、", ", "))}</td>
                      <td>{formatGraphNumber(row.value)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </details>
          ) : null}
        </>
      ) : null}
      {draft.time.points.length > 0 ? (
        <fieldset className="experiment-graph-condition-fieldset">
          <legend>{t("時点（複数選択可）", "Time points (multiple selection allowed)")}</legend>
          <label className="experiment-graph-checkbox">
            <input
              type="checkbox"
              aria-label={t("すべての時点", "All time points")}
              checked={selectedTimePointIds.length === draft.time.points.length}
              onChange={(event) => onAllTimePointsChange(event.target.checked)}
            />
            <span>{t("すべて", "All")}</span>
          </label>
          <div className="experiment-graph-time-grid">
            {draft.time.points.map((point) => (
              <label className="experiment-graph-checkbox" key={point.id}>
                <input
                  type="checkbox"
                  value={point.id}
                  checked={selectedTimePointIds.includes(point.id)}
                  aria-label={`${point.value} ${draft.time.unit}`}
                  onChange={(event) => onTimePointChange(point.id, event.target.checked)}
                />
                <span>
                  {point.value} {draft.time.unit}
                </span>
              </label>
            ))}
          </div>
        </fieldset>
      ) : null}
      <fieldset className="experiment-graph-condition-fieldset">
        <legend>
          {draft.analysisIntent.kind === "correlation" ? "X / Y" : t("条件", "Conditions")}
        </legend>
        {draft.conditions.map((condition) => (
          <label className="experiment-graph-checkbox" key={condition.id}>
            <input
              type="checkbox"
              value={condition.id}
              checked={activeConditionIds.has(condition.id)}
              disabled={draft.analysisIntent.kind === "correlation"}
              aria-label={condition.label}
              onChange={(event) => onConditionChange(condition.id, event.target.checked)}
            />
            <span>
              {condition.label}
              {condition.role === "auxiliary_reference" ? " (reference)" : ""}
            </span>
          </label>
        ))}
      </fieldset>
    </>
  );
}

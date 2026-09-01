import type { Dispatch, SetStateAction } from "react";

import { localizedText, useAppLocale } from "../../app/appLocale";
import type { ExperimentSetDraft } from "../../app/experimentDraft";
import {
  normalizeGraphGroupingChannels,
  swapSingleXFactorAndSeries,
} from "../../app/graphGrouping";
import type { WorkspaceGraphState } from "../../app/experimentWorkspaceProject";

type GraphAppearance = WorkspaceGraphState["appearance"];
type AxisSettings = WorkspaceGraphState["axes"];
type GraphGrouping = NonNullable<WorkspaceGraphState["grouping"]>;

type ExperimentGraphGroupingEditorProps = Readonly<{
  draft: ExperimentSetDraft;
  axes: AxisSettings;
  grouping: GraphGrouping;
  setGrouping: Dispatch<SetStateAction<GraphGrouping>>;
  setAppearance: Dispatch<SetStateAction<GraphAppearance>>;
  visualSeriesCount: number;
  onEditSeriesStyles: () => void;
}>;

function xFactorIds(grouping: GraphGrouping): readonly string[] {
  if (grouping.x.source !== "factor") return [];
  if (grouping.x.factorIds?.length) return grouping.x.factorIds;
  return grouping.x.factorId ? [grouping.x.factorId] : [];
}

export function ExperimentGraphGroupingEditor({
  draft,
  axes,
  grouping,
  setGrouping,
  setAppearance,
  visualSeriesCount,
  onEditSeriesStyles,
}: ExperimentGraphGroupingEditorProps) {
  const locale = useAppLocale();
  const t = (ja: string, en: string) => localizedText(locale, ja, en);
  const selectedXFactorIds = xFactorIds(grouping);

  return (
    <>
      <fieldset className="experiment-graph-condition-fieldset">
        <legend>{t("実験要因の表示割り当て", "Map experimental factors to the display")}</legend>
        <label className="experiment-graph-field">
          <span>{t("X軸", "X axis")}</span>
          <select
            aria-label={t("X軸に使う要因", "Factor used on the X axis")}
            value={
              axes.xSemantic !== "categorical"
                ? "time"
                : grouping.x.source === "factor"
                  ? `factor:${grouping.x.factorId ?? ""}`
                  : "condition"
            }
            disabled={axes.xSemantic !== "categorical"}
            onChange={(event) => {
              const value = event.target.value;
              setGrouping((current) => ({
                ...current,
                x: value.startsWith("factor:")
                  ? {
                      source: "factor",
                      factorId: value.slice(7),
                      factorIds: [value.slice(7)],
                    }
                  : { source: "condition" },
              }));
            }}
          >
            {axes.xSemantic !== "categorical" || draft.time.points.length > 0 ? (
              <option value="time">
                {axes.xSemantic === "numeric_covariate"
                  ? axes.xTitle || t("数値X", "Numeric X")
                  : t("時間", "Time")}
              </option>
            ) : null}
            <option value="condition">{t("条件の組み合わせ", "Condition combination")}</option>
            {draft.attributes
              .filter(
                ({ id }) =>
                  id !==
                    (grouping.series.source === "factor" ? grouping.series.factorId : undefined) &&
                  id !== grouping.facet?.factorId,
              )
              .map((factor) => (
                <option key={factor.id} value={`factor:${factor.id}`}>
                  {factor.label}
                </option>
              ))}
          </select>
        </label>
        {grouping.x.source === "factor" && draft.attributes.length > 1 ? (
          <label className="experiment-graph-field">
            <span>{t("X階層（複数選択可）", "X hierarchy (multiple selection allowed)")}</span>
            <select
              multiple
              aria-label={t("X階層に使う要因", "Factors used in the X hierarchy")}
              value={selectedXFactorIds}
              onChange={(event) => {
                const factorIds = [...event.target.selectedOptions].map(({ value }) => value);
                setGrouping((current) => ({
                  ...current,
                  x: {
                    source: "factor",
                    factorId: factorIds[0],
                    factorIds,
                  },
                }));
              }}
            >
              {draft.attributes
                .filter(
                  ({ id }) =>
                    id !==
                      (grouping.series.source === "factor"
                        ? grouping.series.factorId
                        : undefined) && id !== grouping.facet?.factorId,
                )
                .map((factor) => (
                  <option key={factor.id} value={factor.id}>
                    {factor.label || factor.id}
                  </option>
                ))}
            </select>
          </label>
        ) : null}
        <label className="experiment-graph-field">
          <span>{t("系列（色・記号）", "Series (color and symbol)")}</span>
          <select
            aria-label={t("系列に使う要因", "Factor used for series")}
            value={
              axes.xSemantic !== "categorical"
                ? "condition"
                : grouping.series.source === "factor"
                  ? `factor:${grouping.series.factorId ?? ""}`
                  : grouping.series.source
            }
            disabled={axes.xSemantic !== "categorical"}
            onChange={(event) => {
              const value = event.target.value;
              setGrouping((current) => {
                const nextSeries = value.startsWith("factor:")
                  ? ({ source: "factor", factorId: value.slice(7) } as const)
                  : value === "time"
                    ? ({ source: "time" } as const)
                    : ({ source: "none" } as const);
                return normalizeGraphGroupingChannels({
                  ...current,
                  series: nextSeries,
                  color: nextSeries,
                  shape: nextSeries,
                  facet:
                    nextSeries.source === "factor" &&
                    current.facet?.factorId === nextSeries.factorId
                      ? null
                      : current.facet,
                });
              });
              if (value !== "none") {
                setAppearance((current) => ({
                  ...current,
                  legendPosition:
                    current.legendPosition === "hidden" ? "right" : current.legendPosition,
                  palette: current.palette === "single" ? "condition" : current.palette,
                }));
              }
            }}
          >
            {axes.xSemantic !== "categorical" ? (
              <option value="condition">{t("条件の組み合わせ", "Condition combination")}</option>
            ) : null}
            <option value="none">{t("なし", "None")}</option>
            {draft.time.points.length > 0 ? (
              <option value="time">{t("時間 / numeric X", "Time / numeric X")}</option>
            ) : null}
            {draft.attributes
              .filter(
                ({ id }) => !selectedXFactorIds.includes(id) && id !== grouping.facet?.factorId,
              )
              .map((factor) => (
                <option key={factor.id} value={`factor:${factor.id}`}>
                  {factor.label}
                </option>
              ))}
          </select>
        </label>
        {axes.xSemantic === "categorical" && swapSingleXFactorAndSeries(grouping) ? (
          <button
            type="button"
            className="experiment-graph-series-style-shortcut"
            onClick={() => setGrouping((current) => swapSingleXFactorAndSeries(current) ?? current)}
          >
            {t("X軸と系列を入れ替える", "Swap X axis and series")}
          </button>
        ) : null}
        {axes.xSemantic !== "categorical" ? (
          <p className="experiment-graph-help">
            {t(
              `X軸は${axes.xSemantic === "time" ? "時間" : axes.xTitle || "数値"}、各条件は色と記号で区別します。`,
              `The X axis shows ${axes.xSemantic === "time" ? "time" : axes.xTitle || "numeric values"}; conditions are distinguished by color and symbol.`,
            )}
          </p>
        ) : null}
        <label className="experiment-graph-field">
          <span>{t("パネル分割", "Panel split")}</span>
          <select
            aria-label={t("パネル分割に使う要因", "Factor used to split panels")}
            value={grouping.facet?.factorId ?? "none"}
            onChange={(event) =>
              setGrouping((current) => ({
                ...current,
                facet:
                  event.target.value === "none"
                    ? null
                    : {
                        source: "factor",
                        factorId: event.target.value,
                        axisPolicy: "shared",
                        levelOrder: [],
                      },
              }))
            }
          >
            <option value="none">{t("なし", "None")}</option>
            {draft.attributes
              .filter(({ id }) => {
                const seriesFactorId =
                  grouping.series.source === "factor" ? grouping.series.factorId : undefined;
                return !selectedXFactorIds.includes(id) && id !== seriesFactorId;
              })
              .map((factor) => (
                <option key={factor.id} value={factor.id}>
                  {factor.label}
                </option>
              ))}
          </select>
        </label>
        <p className="experiment-graph-help">
          {t(
            "見た目の系列・Facetは、paired / repeated / independentの統計的関係を変更しません。",
            "Visual series and facets do not change the paired, repeated, or independent statistical relationship.",
          )}
        </p>
      </fieldset>
      {visualSeriesCount > 1 ? (
        <button
          type="button"
          className="experiment-graph-series-style-shortcut"
          onClick={onEditSeriesStyles}
        >
          {t("系列の色・線・点を編集", "Edit series colors, lines, and points")}
        </button>
      ) : null}
    </>
  );
}

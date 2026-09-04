import type { Dispatch, SetStateAction } from "react";

import { localizedText, useAppLocale } from "../../app/appLocale";
import type { WorkspaceGraphState } from "../../app/experimentWorkspaceProject";
import type { GraphSeries } from "./experimentGraphDataExport";
import { GRAPH_PALETTES } from "./graphAppearance";
import {
  ExperimentGraphColorControl,
  ExperimentGraphRangeControl,
  ExperimentGraphVisibilityControl,
} from "./ExperimentGraphControlPrimitives";

type LayerState = WorkspaceGraphState["layers"];
type GraphAppearance = WorkspaceGraphState["appearance"];

type ExperimentGraphSeriesEditorProps = Readonly<{
  mode: "experiment-summary" | "series-style";
  layers: LayerState;
  appearance: GraphAppearance;
  visualSeriesOptions: readonly GraphSeries[];
  setLayers: Dispatch<SetStateAction<LayerState>>;
  setAppearance: Dispatch<SetStateAction<GraphAppearance>>;
}>;

export function ExperimentGraphSeriesEditor({
  mode,
  layers,
  appearance,
  visualSeriesOptions,
  setLayers,
  setAppearance,
}: ExperimentGraphSeriesEditorProps) {
  const locale = useAppLocale();
  const t = (ja: string, en: string) => localizedText(locale, ja, en);

  return (
    <section className="experiment-graph-inspector-section">
      <h3>
        {mode === "series-style"
          ? t("系列の色・線・点", "Series colors, lines, and points")
          : t("実験単位の要約", "Experimental-unit summary")}
      </h3>
      {mode === "experiment-summary" ? (
        <>
          <ExperimentGraphVisibilityControl
            label={t("個々の生物学的反復を表示", "Show individual biological replicates")}
            ariaLabel={t("実験単位の点を表示", "Show experimental-unit points")}
            checked={layers.experiment}
            onChange={(experiment) => setLayers((current) => ({ ...current, experiment }))}
          />
          <ExperimentGraphVisibilityControl
            label={t("全体平均を表示", "Show overall mean")}
            checked={layers.overall}
            onChange={(overall) => setLayers((current) => ({ ...current, overall }))}
          />
          <ExperimentGraphRangeControl
            label={t("点の大きさ", "Point size")}
            ariaLabel={t("実験単位点の大きさ", "Experimental-unit point size")}
            value={appearance.pointSize}
            min={4}
            max={10}
            step={1}
            suffix="px"
            onChange={(pointSize) => setAppearance((current) => ({ ...current, pointSize }))}
          />
          <ExperimentGraphRangeControl
            label={t("平均線", "Mean line")}
            ariaLabel={t("平均線の太さ", "Mean-line width")}
            value={appearance.summaryLineWidth}
            min={0.6}
            max={4}
            step={0.1}
            suffix="px"
            formatValue={(value) => value.toFixed(1)}
            onChange={(summaryLineWidth) =>
              setAppearance((current) => ({ ...current, summaryLineWidth }))
            }
          />
          <ExperimentGraphColorControl
            label={t("平均線の色", "Mean-line color")}
            ariaLabel={t("平均線の色", "Mean-line color")}
            value={appearance.summaryColor}
            showPresets
            onChange={(summaryColor) => setAppearance((current) => ({ ...current, summaryColor }))}
          />
        </>
      ) : (
        <p className="experiment-graph-help">
          {t(
            "凡例に出る各系列の色、線種、線幅、点、表示順をまとめて編集します。",
            "Edit the color, line style, line width, point symbol, and display order for each legend series.",
          )}
        </p>
      )}
      {mode === "series-style"
        ? visualSeriesOptions.map((item, index) => {
            const style = appearance.seriesStyles[item.visualSeriesKey] ?? {};
            const updateStyle = (
              update: Partial<NonNullable<GraphAppearance["seriesStyles"]>[string]>,
            ) =>
              setAppearance((current) => ({
                ...current,
                seriesStyles: {
                  ...current.seriesStyles,
                  [item.visualSeriesKey]: {
                    ...current.seriesStyles[item.visualSeriesKey],
                    ...update,
                  },
                },
              }));
            const applyAppearanceToAllSeries = () =>
              setAppearance((current) => {
                const currentStyle = current.seriesStyles[item.visualSeriesKey] ?? {};
                const sourceAppearance = {
                  color:
                    currentStyle.color ??
                    GRAPH_PALETTES[current.palette][index % GRAPH_PALETTES[current.palette].length],
                  lineStyle: currentStyle.lineStyle ?? "solid",
                  lineWidth: currentStyle.lineWidth ?? current.summaryLineWidth,
                  pointStyle: currentStyle.pointStyle ?? "circle",
                } as const;
                return {
                  ...current,
                  seriesStyles: visualSeriesOptions.reduce(
                    (styles, option) => ({
                      ...styles,
                      [option.visualSeriesKey]: {
                        ...styles[option.visualSeriesKey],
                        ...sourceAppearance,
                      },
                    }),
                    { ...current.seriesStyles },
                  ),
                };
              });
            return (
              <fieldset className="experiment-graph-condition-fieldset" key={item.visualSeriesKey}>
                <legend>{item.visualSeriesLabel}</legend>
                <ExperimentGraphVisibilityControl
                  label={t("表示", "Show")}
                  ariaLabel={t(`${item.visualSeriesLabel}を表示`, `Show ${item.visualSeriesLabel}`)}
                  checked={style.visible !== false}
                  onChange={(visible) => updateStyle({ visible })}
                />
                <label className="experiment-graph-field">
                  <span>{t("凡例ラベル", "Legend label")}</span>
                  <input
                    aria-label={t(
                      `${item.visualSeriesLabel}の凡例ラベル`,
                      `Legend label for ${item.visualSeriesLabel}`,
                    )}
                    value={style.legendLabel ?? item.visualSeriesLabel}
                    onChange={(event) =>
                      updateStyle({ legendLabel: event.target.value || item.visualSeriesLabel })
                    }
                  />
                </label>
                <ExperimentGraphColorControl
                  label={t("色", "Color")}
                  ariaLabel={t(
                    `${item.visualSeriesLabel}の色`,
                    `Color for ${item.visualSeriesLabel}`,
                  )}
                  value={
                    style.color ??
                    GRAPH_PALETTES[appearance.palette][
                      index % GRAPH_PALETTES[appearance.palette].length
                    ]
                  }
                  onChange={(color) => updateStyle({ color })}
                />
                <label className="experiment-graph-field">
                  <span>{t("線", "Line")}</span>
                  <select
                    aria-label={t(
                      `${item.visualSeriesLabel}の線種`,
                      `Line style for ${item.visualSeriesLabel}`,
                    )}
                    value={style.lineStyle ?? "solid"}
                    onChange={(event) =>
                      updateStyle({
                        lineStyle: event.target.value as "solid" | "dashed" | "dotted",
                      })
                    }
                  >
                    <option value="solid">{t("実線", "Solid")}</option>
                    <option value="dashed">{t("破線", "Dashed")}</option>
                    <option value="dotted">{t("点線", "Dotted")}</option>
                  </select>
                </label>
                <ExperimentGraphRangeControl
                  label={t("線幅", "Line width")}
                  ariaLabel={t(
                    `${item.visualSeriesLabel}の線幅`,
                    `Line width for ${item.visualSeriesLabel}`,
                  )}
                  value={style.lineWidth ?? appearance.summaryLineWidth}
                  min={0.5}
                  max={8}
                  step={0.5}
                  formatValue={(value) => value.toFixed(1)}
                  onChange={(lineWidth) => updateStyle({ lineWidth })}
                />
                <label className="experiment-graph-field">
                  <span>{t("点", "Point")}</span>
                  <select
                    aria-label={t(
                      `${item.visualSeriesLabel}の点`,
                      `Point symbol for ${item.visualSeriesLabel}`,
                    )}
                    value={style.pointStyle ?? "circle"}
                    onChange={(event) =>
                      updateStyle({
                        pointStyle: event.target.value as
                          "circle" | "square" | "triangle" | "diamond",
                      })
                    }
                  >
                    <option value="circle">{t("丸", "Circle")}</option>
                    <option value="square">{t("四角", "Square")}</option>
                    <option value="triangle">{t("三角", "Triangle")}</option>
                    <option value="diamond">{t("菱形", "Diamond")}</option>
                  </select>
                </label>
                <label className="experiment-graph-field">
                  <span>{t("順序", "Order")}</span>
                  <input
                    type="number"
                    aria-label={t(
                      `${item.visualSeriesLabel}の順序`,
                      `Order for ${item.visualSeriesLabel}`,
                    )}
                    value={style.order ?? index}
                    onChange={(event) => updateStyle({ order: Number(event.target.value) })}
                  />
                </label>
                {visualSeriesOptions.length > 1 ? (
                  <button type="button" onClick={applyAppearanceToAllSeries}>
                    {t("この見た目を全系列へ適用", "Apply this appearance to all series")}
                  </button>
                ) : null}
              </fieldset>
            );
          })
        : null}
    </section>
  );
}

import type { Dispatch, SetStateAction } from "react";

import { localizedText, useAppLocale } from "../../app/appLocale";
import type { WorkspaceGraphState } from "../../app/experimentWorkspaceProject";
import type { GraphSeries } from "./experimentGraphDataExport";
import { GRAPH_PALETTES } from "./graphAppearance";

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
          <label className="experiment-graph-checkbox">
            <input
              type="checkbox"
              checked={layers.experiment}
              aria-label={t("実験単位の点を表示", "Show experimental-unit points")}
              onChange={(event) =>
                setLayers((current) => ({ ...current, experiment: event.target.checked }))
              }
            />
            <span>{t("個々の生物学的反復を表示", "Show individual biological replicates")}</span>
          </label>
          <label className="experiment-graph-checkbox">
            <input
              type="checkbox"
              checked={layers.overall}
              aria-label={t("全体平均を表示", "Show overall mean")}
              onChange={(event) =>
                setLayers((current) => ({ ...current, overall: event.target.checked }))
              }
            />
            <span>{t("全体平均を表示", "Show overall mean")}</span>
          </label>
          <label className="experiment-graph-field">
            <span>
              {t("点の大きさ", "Point size")}: {appearance.pointSize}px
            </span>
            <input
              aria-label={t("実験単位点の大きさ", "Experimental-unit point size")}
              type="range"
              min="4"
              max="10"
              step="1"
              value={appearance.pointSize}
              onChange={(event) =>
                setAppearance((current) => ({
                  ...current,
                  pointSize: Number(event.target.value),
                }))
              }
            />
          </label>
          <label className="experiment-graph-field">
            <span>
              {t("平均線", "Mean line")}: {appearance.summaryLineWidth.toFixed(1)}px
            </span>
            <input
              type="range"
              min="0.6"
              max="4"
              step="0.1"
              aria-label={t("平均線の太さ", "Mean-line width")}
              value={appearance.summaryLineWidth}
              onChange={(event) =>
                setAppearance((current) => ({
                  ...current,
                  summaryLineWidth: Number(event.target.value),
                }))
              }
            />
          </label>
          <label className="experiment-graph-color-field">
            <span>{t("平均線の色", "Mean-line color")}</span>
            <input
              type="color"
              aria-label={t("平均線の色", "Mean-line color")}
              value={appearance.summaryColor}
              onChange={(event) =>
                setAppearance((current) => ({
                  ...current,
                  summaryColor: event.target.value,
                }))
              }
            />
          </label>
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
            return (
              <fieldset className="experiment-graph-condition-fieldset" key={item.visualSeriesKey}>
                <legend>{item.visualSeriesLabel}</legend>
                <label className="experiment-graph-checkbox">
                  <input
                    type="checkbox"
                    checked={style.visible !== false}
                    aria-label={t(
                      `${item.visualSeriesLabel}を表示`,
                      `Show ${item.visualSeriesLabel}`,
                    )}
                    onChange={(event) => updateStyle({ visible: event.target.checked })}
                  />
                  <span>{t("表示", "Show")}</span>
                </label>
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
                <label className="experiment-graph-field">
                  <span>{t("色", "Color")}</span>
                  <input
                    type="color"
                    aria-label={t(
                      `${item.visualSeriesLabel}の色`,
                      `Color for ${item.visualSeriesLabel}`,
                    )}
                    value={
                      style.color ??
                      GRAPH_PALETTES[appearance.palette][
                        index % GRAPH_PALETTES[appearance.palette].length
                      ]
                    }
                    onChange={(event) => updateStyle({ color: event.target.value })}
                  />
                </label>
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
                <label className="experiment-graph-field">
                  <span>
                    {t("線幅", "Line width")}:{" "}
                    {(style.lineWidth ?? appearance.summaryLineWidth).toFixed(1)}
                  </span>
                  <input
                    aria-label={t(
                      `${item.visualSeriesLabel}の線幅`,
                      `Line width for ${item.visualSeriesLabel}`,
                    )}
                    type="range"
                    min="0.5"
                    max="8"
                    step="0.5"
                    value={style.lineWidth ?? appearance.summaryLineWidth}
                    onChange={(event) => updateStyle({ lineWidth: Number(event.target.value) })}
                  />
                </label>
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
              </fieldset>
            );
          })
        : null}
    </section>
  );
}

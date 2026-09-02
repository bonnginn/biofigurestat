import type { Dispatch, SetStateAction } from "react";

import { localizedText, useAppLocale } from "../../app/appLocale";
import type { ExperimentSetDraft } from "../../app/experimentDraft";
import type { WorkspaceGraphState } from "../../app/experimentWorkspaceProject";

type AxisSettings = WorkspaceGraphState["axes"];
type GraphAppearance = WorkspaceGraphState["appearance"];
type GraphGrouping = NonNullable<WorkspaceGraphState["grouping"]>;

export type ExperimentGraphXAxisEditorProps = Readonly<{
  axes: AxisSettings;
  appearance: GraphAppearance;
  attributes: ExperimentSetDraft["attributes"];
  hasOrderedAxis: boolean;
  groupingXSource: GraphGrouping["x"]["source"];
  graphType: WorkspaceGraphState["graphType"];
  setAxes: Dispatch<SetStateAction<AxisSettings>>;
  setAppearance: Dispatch<SetStateAction<GraphAppearance>>;
}>;

export function ExperimentGraphXAxisEditor({
  axes,
  appearance,
  attributes,
  hasOrderedAxis,
  groupingXSource,
  graphType,
  setAxes,
  setAppearance,
}: ExperimentGraphXAxisEditorProps) {
  const locale = useAppLocale();
  const t = (ja: string, en: string) => localizedText(locale, ja, en);
  const moveHierarchy = (attributeId: string, direction: -1 | 1) => {
    setAxes((current) => {
      const order =
        current.hierarchyOrder.length > 0
          ? [...current.hierarchyOrder]
          : attributes.map(({ id }) => id);
      const index = order.indexOf(attributeId);
      const nextIndex = index + direction;
      if (index < 0 || nextIndex < 0 || nextIndex >= order.length) return current;
      [order[index], order[nextIndex]] = [order[nextIndex], order[index]];
      return { ...current, hierarchyOrder: order };
    });
  };

  return (
    <>
      {hasOrderedAxis ? (
        <>
          <label className="experiment-graph-field">
            <span>{t("X軸の意味", "X-axis meaning")}</span>
            <select
              aria-label={t("X軸の意味", "X-axis meaning")}
              value={axes.xSemantic}
              onChange={(event) =>
                setAxes((current) => ({
                  ...current,
                  xSemantic: event.target.value as AxisSettings["xSemantic"],
                  xTitle:
                    event.target.value === "time"
                      ? "Time"
                      : event.target.value === "numeric_covariate"
                        ? "Covariate"
                        : "",
                }))
              }
            >
              <option value="time">{t("時間", "Time")}</option>
              <option value="numeric_covariate">{t("数値共変量", "Numeric covariate")}</option>
              <option value="categorical">{t("カテゴリ", "Category")}</option>
            </select>
          </label>
          <label className="experiment-graph-field">
            <span>{t("X軸タイトル", "X-axis title")}</span>
            <input
              aria-label={t("X軸タイトル", "X-axis title")}
              type="text"
              value={axes.xTitle}
              onChange={(event) =>
                setAxes((current) => ({ ...current, xTitle: event.target.value }))
              }
            />
          </label>
          <label className="experiment-graph-field">
            <span>{t("X軸単位", "X-axis unit")}</span>
            <input
              aria-label={t("X軸単位", "X-axis unit")}
              type="text"
              value={axes.xUnit}
              onChange={(event) =>
                setAxes((current) => ({ ...current, xUnit: event.target.value }))
              }
            />
          </label>
          {axes.xSemantic !== "categorical" ? (
            <>
              <label className="experiment-graph-field">
                <span>{t("Xスケール", "X scale")}</span>
                <select
                  value={axes.xScale ?? "linear"}
                  onChange={(event) =>
                    setAxes((current) => ({
                      ...current,
                      xScale: event.target.value as "linear" | "log10",
                    }))
                  }
                >
                  <option value="linear">Linear</option>
                  <option value="log10">Log10</option>
                </select>
              </label>
              <label className="experiment-graph-field">
                <span>{t("X範囲", "X range")}</span>
                <select
                  value={axes.xRangeMode ?? "auto"}
                  onChange={(event) =>
                    setAxes((current) => ({
                      ...current,
                      xRangeMode: event.target.value as "auto" | "manual",
                    }))
                  }
                >
                  <option value="auto">{t("自動", "Automatic")}</option>
                  <option value="manual">{t("手動", "Manual")}</option>
                </select>
              </label>
              {axes.xRangeMode === "manual" ? (
                <div className="experiment-graph-range-grid">
                  <label className="experiment-graph-field">
                    <span>{t("最小", "Minimum")}</span>
                    <input
                      type="number"
                      value={axes.xMin ?? ""}
                      onChange={(event) =>
                        setAxes((current) => ({
                          ...current,
                          xMin: event.target.value === "" ? null : Number(event.target.value),
                        }))
                      }
                    />
                  </label>
                  <label className="experiment-graph-field">
                    <span>{t("最大", "Maximum")}</span>
                    <input
                      type="number"
                      value={axes.xMax ?? ""}
                      onChange={(event) =>
                        setAxes((current) => ({
                          ...current,
                          xMax: event.target.value === "" ? null : Number(event.target.value),
                        }))
                      }
                    />
                  </label>
                </div>
              ) : null}
              <label className="experiment-graph-field">
                <span>{t("X目盛", "X ticks")}</span>
                <select
                  value={axes.xTickMode ?? "auto"}
                  onChange={(event) =>
                    setAxes((current) => ({
                      ...current,
                      xTickMode: event.target.value as "auto" | "manual",
                    }))
                  }
                >
                  <option value="auto">{t("自動", "Automatic")}</option>
                  <option value="manual">{t("手動間隔", "Manual interval")}</option>
                </select>
              </label>
              {axes.xTickMode === "manual" ? (
                <label className="experiment-graph-field">
                  <span>{t("目盛間隔", "Tick interval")}</span>
                  <input
                    type="number"
                    min="0"
                    step="any"
                    value={axes.xTickInterval ?? ""}
                    onChange={(event) =>
                      setAxes((current) => ({
                        ...current,
                        xTickInterval:
                          event.target.value === "" ? null : Number(event.target.value),
                      }))
                    }
                  />
                </label>
              ) : null}
              <label className="experiment-graph-checkbox">
                <input
                  type="checkbox"
                  checked={axes.showMinorTicks ?? true}
                  aria-label={t("補助目盛を表示", "Show minor ticks")}
                  onChange={(event) =>
                    setAxes((current) => ({
                      ...current,
                      showMinorTicks: event.target.checked,
                    }))
                  }
                />
                <span>
                  {t("補助目盛を表示（グリッド線なし）", "Show minor ticks (without grid lines)")}
                </span>
              </label>
            </>
          ) : null}
        </>
      ) : null}
      <label className="experiment-graph-checkbox">
        <input
          type="checkbox"
          checked={appearance.hierarchicalLabels}
          aria-label={t("条件属性を階層表示", "Show condition attributes as hierarchy")}
          onChange={(event) =>
            setAppearance((current) => ({
              ...current,
              hierarchicalLabels: event.target.checked,
            }))
          }
        />
        <span>
          {t(
            "条件属性を個別の階層として表示",
            "Show condition attributes as separate hierarchy levels",
          )}
        </span>
      </label>
      <label className="experiment-graph-checkbox">
        <input
          type="checkbox"
          checked={axes.showCategoryLabels}
          aria-label={t("カテゴリラベルを表示", "Show category labels")}
          onChange={(event) =>
            setAxes((current) => ({
              ...current,
              showCategoryLabels: event.target.checked,
            }))
          }
        />
        <span>{t("カテゴリと階層ラベルを表示", "Show category and hierarchy labels")}</span>
      </label>
      <label className="experiment-graph-field">
        <span>{t("軸目盛の向き", "Tick direction")}</span>
        <select
          aria-label={t("軸目盛の向き", "Tick direction")}
          value={axes.tickDirection ?? "outside"}
          onChange={(event) =>
            setAxes((current) => ({
              ...current,
              tickDirection: event.target.value as "inside" | "outside",
            }))
          }
        >
          <option value="outside">{t("グラフの外側", "Outside the graph")}</option>
          <option value="inside">{t("グラフの内側", "Inside the graph")}</option>
        </select>
      </label>
      {axes.xSemantic === "categorical" && groupingXSource === "factor" ? (
        <label className="experiment-graph-checkbox">
          <input
            type="checkbox"
            checked={axes.showCategoryGroupSeparators ?? false}
            aria-label={t("X軸のグループ境界を表示", "Show X-axis group boundaries")}
            onChange={(event) =>
              setAxes((current) => ({
                ...current,
                showCategoryGroupSeparators: event.target.checked,
              }))
            }
          />
          <span>{t("X軸のグループ境界を表示", "Show X-axis group boundaries")}</span>
        </label>
      ) : null}
      <label className="experiment-graph-field">
        <span>{t("カテゴリラベル角度", "Category-label angle")}</span>
        <select
          value={axes.categoryLabelRotation ?? "none"}
          onChange={(event) =>
            setAxes((current) => ({
              ...current,
              categoryLabelRotation: event.target.value as NonNullable<
                AxisSettings["categoryLabelRotation"]
              >,
            }))
          }
        >
          <option value="none">{t("水平", "Horizontal")}</option>
          <option value="minus_30">−30°</option>
          <option value="minus_45">−45°</option>
          <option value="minus_90">−90°</option>
        </select>
      </label>
      <label className="experiment-graph-checkbox">
        <input
          type="checkbox"
          checked={appearance.barOutline ?? true}
          disabled={graphType !== "bar"}
          aria-label={t("棒の輪郭線を表示", "Show bar outlines")}
          onChange={(event) =>
            setAppearance((current) => ({
              ...current,
              barOutline: event.target.checked,
            }))
          }
        />
        <span>{t("棒の輪郭線を表示", "Show bar outlines")}</span>
      </label>
      {graphType === "bar" && (appearance.barOutline ?? true) ? (
        <>
          <label className="experiment-graph-field">
            <span>{t("棒の外枠色", "Bar outline color")}</span>
            <select
              aria-label={t("棒の外枠色", "Bar outline color")}
              value={appearance.barOutlineMode ?? "series"}
              onChange={(event) =>
                setAppearance((current) => ({
                  ...current,
                  barOutlineMode: event.target.value as NonNullable<
                    GraphAppearance["barOutlineMode"]
                  >,
                }))
              }
            >
              <option value="series">{t("塗り色に合わせる", "Match fill color")}</option>
              <option value="black">{t("黒", "Black")}</option>
              <option value="custom">{t("任意色", "Custom color")}</option>
            </select>
          </label>
          {appearance.barOutlineMode === "custom" ? (
            <label className="experiment-graph-color-field">
              <span>{t("棒の外枠の任意色", "Custom bar outline color")}</span>
              <input
                type="color"
                aria-label={t("棒の外枠の任意色", "Custom bar outline color")}
                value={appearance.barOutlineColor ?? "#111111"}
                onChange={(event) =>
                  setAppearance((current) => ({
                    ...current,
                    barOutlineColor: event.target.value,
                  }))
                }
              />
            </label>
          ) : null}
          <label className="experiment-graph-field">
            <span>
              {t("棒の外枠の太さ：", "Bar outline width: ")}
              {(appearance.barOutlineWidth ?? appearance.distributionLineWidth ?? 1.2).toFixed(1)}px
            </span>
            <input
              type="range"
              min="0.5"
              max="4"
              step="0.1"
              aria-label={t("棒の外枠の太さ", "Bar outline width")}
              value={appearance.barOutlineWidth ?? appearance.distributionLineWidth ?? 1.2}
              onChange={(event) =>
                setAppearance((current) => ({
                  ...current,
                  barOutlineWidth: Number(event.target.value),
                }))
              }
            />
          </label>
        </>
      ) : null}
      <label className="experiment-graph-checkbox">
        <input
          type="checkbox"
          checked={appearance.barMeanMarker ?? false}
          disabled={graphType !== "bar"}
          aria-label={t("棒に平均マーカーを重ねる", "Overlay mean markers on bars")}
          onChange={(event) =>
            setAppearance((current) => ({
              ...current,
              barMeanMarker: event.target.checked,
            }))
          }
        />
        <span>{t("棒に平均マーカーを重ねる", "Overlay mean markers on bars")}</span>
      </label>
      <label className="experiment-graph-field">
        <span>
          {t("カテゴリ間隔：", "Category spacing: ")}
          {axes.spacing.toFixed(1)}
        </span>
        <input
          aria-label={t("カテゴリ間隔", "Category spacing")}
          type="range"
          min="0.7"
          max="1.6"
          step="0.1"
          value={axes.spacing}
          onChange={(event) =>
            setAxes((current) => ({
              ...current,
              spacing: Number(event.target.value),
            }))
          }
        />
      </label>
      <label className="experiment-graph-field">
        <span>
          {t("棒の幅：", "Bar width: ")}
          {appearance.barWidth.toFixed(2)}
        </span>
        <input
          aria-label={t("棒の幅", "Bar width")}
          type="range"
          min="0.25"
          max="1"
          step="0.05"
          value={appearance.barWidth}
          disabled={graphType !== "bar"}
          onChange={(event) =>
            setAppearance((current) => ({
              ...current,
              barWidth: Number(event.target.value),
            }))
          }
        />
      </label>
      <label className="experiment-graph-field">
        <span>
          {t("系列内：", "Within series: ")}
          {appearance.withinGroupSpacing.toFixed(2)}
        </span>
        <input
          aria-label={t("系列内の間隔", "Within-series spacing")}
          type="range"
          min="0.4"
          max="1.4"
          step="0.05"
          value={appearance.withinGroupSpacing}
          onChange={(event) =>
            setAppearance((current) => ({
              ...current,
              withinGroupSpacing: Number(event.target.value),
            }))
          }
        />
      </label>
      <label className="experiment-graph-field">
        <span>
          {t("X群間：", "Between X groups: ")}
          {appearance.betweenGroupSpacing.toFixed(2)}
        </span>
        <input
          aria-label={t("X群間の間隔", "Between-X-group spacing")}
          type="range"
          min="0.8"
          max="2.4"
          step="0.05"
          value={appearance.betweenGroupSpacing}
          onChange={(event) =>
            setAppearance((current) => ({
              ...current,
              betweenGroupSpacing: Number(event.target.value),
            }))
          }
        />
      </label>
      <label className="experiment-graph-field">
        <span>
          {t("階層ラベル文字：", "Hierarchy-label text: ")}
          {appearance.hierarchyFontSize}px
        </span>
        <input
          type="range"
          min="9"
          max="24"
          aria-label={t("階層ラベルの文字サイズ", "Hierarchy-label font size")}
          value={appearance.hierarchyFontSize}
          onChange={(event) =>
            setAppearance((current) => ({
              ...current,
              hierarchyFontSize: Number(event.target.value),
            }))
          }
        />
      </label>
      <div className="experiment-graph-hierarchy-order">
        <strong>{t("階層の順序", "Hierarchy order")}</strong>
        {(axes.hierarchyOrder.length > 0
          ? axes.hierarchyOrder
          : attributes.map(({ id }) => id)
        ).map((attributeId, index, order) => {
          const attribute = attributes.find(({ id }) => id === attributeId);
          if (!attribute) return null;
          return (
            <div key={attributeId}>
              <span>{attribute.label}</span>
              <button
                type="button"
                disabled={index === 0}
                aria-label={t(`${attribute.label}を上へ`, `Move ${attribute.label} up`)}
                onClick={() => moveHierarchy(attributeId, -1)}
              >
                ↑
              </button>
              <button
                type="button"
                disabled={index === order.length - 1}
                aria-label={t(`${attribute.label}を下へ`, `Move ${attribute.label} down`)}
                onClick={() => moveHierarchy(attributeId, 1)}
              >
                ↓
              </button>
            </div>
          );
        })}
      </div>
    </>
  );
}

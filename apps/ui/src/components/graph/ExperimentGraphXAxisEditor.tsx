import type { Dispatch, SetStateAction } from "react";

import { localizedText, useAppLocale } from "../../app/appLocale";
import type { ExperimentSetDraft } from "../../app/experimentDraft";
import type { WorkspaceGraphState } from "../../app/experimentWorkspaceProject";
import {
  ExperimentGraphRangeControl,
  ExperimentGraphVisibilityControl,
} from "./ExperimentGraphControlPrimitives";

type AxisSettings = WorkspaceGraphState["axes"];
type GraphAppearance = WorkspaceGraphState["appearance"];
type GraphGrouping = NonNullable<WorkspaceGraphState["grouping"]>;

export type ExperimentGraphXAxisEditorProps = Readonly<{
  axes: AxisSettings;
  appearance: GraphAppearance;
  attributes: ExperimentSetDraft["attributes"];
  hasOrderedAxis: boolean;
  groupingXSource: GraphGrouping["x"]["source"];
  setAxes: Dispatch<SetStateAction<AxisSettings>>;
  setAppearance: Dispatch<SetStateAction<GraphAppearance>>;
}>;

export function ExperimentGraphXAxisEditor({
  axes,
  appearance,
  attributes,
  hasOrderedAxis,
  groupingXSource,
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
              <ExperimentGraphVisibilityControl
                label={t(
                  "補助目盛を表示（グリッド線なし）",
                  "Show minor ticks (without grid lines)",
                )}
                ariaLabel={t("補助目盛を表示", "Show minor ticks")}
                checked={axes.showMinorTicks ?? true}
                onChange={(showMinorTicks) =>
                  setAxes((current) => ({ ...current, showMinorTicks }))
                }
              />
            </>
          ) : null}
        </>
      ) : null}
      <ExperimentGraphVisibilityControl
        label={t(
          "条件属性を個別の階層として表示",
          "Show condition attributes as separate hierarchy levels",
        )}
        ariaLabel={t("条件属性を階層表示", "Show condition attributes as hierarchy")}
        checked={appearance.hierarchicalLabels}
        onChange={(hierarchicalLabels) =>
          setAppearance((current) => ({ ...current, hierarchicalLabels }))
        }
      />
      <ExperimentGraphVisibilityControl
        label={t("カテゴリと階層ラベルを表示", "Show category and hierarchy labels")}
        ariaLabel={t("カテゴリラベルを表示", "Show category labels")}
        checked={axes.showCategoryLabels}
        onChange={(showCategoryLabels) =>
          setAxes((current) => ({ ...current, showCategoryLabels }))
        }
      />
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
        <ExperimentGraphVisibilityControl
          label={t("X軸のグループ境界を表示", "Show X-axis group boundaries")}
          checked={axes.showCategoryGroupSeparators ?? false}
          onChange={(showCategoryGroupSeparators) =>
            setAxes((current) => ({ ...current, showCategoryGroupSeparators }))
          }
        />
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
      <ExperimentGraphRangeControl
        label={t("カテゴリ間隔", "Category spacing")}
        ariaLabel={t("カテゴリ間隔", "Category spacing")}
        value={axes.spacing}
        min={0.7}
        max={1.6}
        step={0.1}
        separator={t("：", ": ")}
        formatValue={(value) => value.toFixed(1)}
        onChange={(spacing) => setAxes((current) => ({ ...current, spacing }))}
      />
      <ExperimentGraphRangeControl
        label={t("系列内", "Within series")}
        ariaLabel={t("系列内の間隔", "Within-series spacing")}
        value={appearance.withinGroupSpacing}
        min={0.4}
        max={1.4}
        step={0.05}
        separator={t("：", ": ")}
        formatValue={(value) => value.toFixed(2)}
        onChange={(withinGroupSpacing) =>
          setAppearance((current) => ({ ...current, withinGroupSpacing }))
        }
      />
      <ExperimentGraphRangeControl
        label={t("X群間", "Between X groups")}
        ariaLabel={t("X群間の間隔", "Between-X-group spacing")}
        value={appearance.betweenGroupSpacing}
        min={0.8}
        max={2.4}
        step={0.05}
        separator={t("：", ": ")}
        formatValue={(value) => value.toFixed(2)}
        onChange={(betweenGroupSpacing) =>
          setAppearance((current) => ({ ...current, betweenGroupSpacing }))
        }
      />
      <ExperimentGraphRangeControl
        label={t("階層ラベル文字", "Hierarchy-label text")}
        ariaLabel={t("階層ラベルの文字サイズ", "Hierarchy-label font size")}
        value={appearance.hierarchyFontSize}
        min={9}
        max={24}
        step={1}
        suffix="px"
        separator={t("：", ": ")}
        onChange={(hierarchyFontSize) =>
          setAppearance((current) => ({ ...current, hierarchyFontSize }))
        }
      />
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

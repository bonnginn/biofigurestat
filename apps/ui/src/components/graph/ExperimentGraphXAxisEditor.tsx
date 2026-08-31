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
            <span>X軸の意味</span>
            <select
              aria-label="X軸の意味"
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
              <option value="time">時間</option>
              <option value="numeric_covariate">数値共変量</option>
              <option value="categorical">カテゴリ</option>
            </select>
          </label>
          <label className="experiment-graph-field">
            <span>{t("X軸タイトル", "X-axis title")}</span>
            <input
              aria-label="X軸タイトル"
              type="text"
              value={axes.xTitle}
              onChange={(event) =>
                setAxes((current) => ({ ...current, xTitle: event.target.value }))
              }
            />
          </label>
          <label className="experiment-graph-field">
            <span>X軸単位</span>
            <input
              aria-label="X軸単位"
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
                <span>Xスケール</span>
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
                <span>X範囲</span>
                <select
                  value={axes.xRangeMode ?? "auto"}
                  onChange={(event) =>
                    setAxes((current) => ({
                      ...current,
                      xRangeMode: event.target.value as "auto" | "manual",
                    }))
                  }
                >
                  <option value="auto">自動</option>
                  <option value="manual">手動</option>
                </select>
              </label>
              {axes.xRangeMode === "manual" ? (
                <div className="experiment-graph-range-grid">
                  <label className="experiment-graph-field">
                    <span>最小</span>
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
                    <span>最大</span>
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
                <span>X目盛</span>
                <select
                  value={axes.xTickMode ?? "auto"}
                  onChange={(event) =>
                    setAxes((current) => ({
                      ...current,
                      xTickMode: event.target.value as "auto" | "manual",
                    }))
                  }
                >
                  <option value="auto">自動</option>
                  <option value="manual">手動間隔</option>
                </select>
              </label>
              {axes.xTickMode === "manual" ? (
                <label className="experiment-graph-field">
                  <span>目盛間隔</span>
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
                  aria-label="補助目盛を表示"
                  onChange={(event) =>
                    setAxes((current) => ({
                      ...current,
                      showMinorTicks: event.target.checked,
                    }))
                  }
                />
                <span>補助目盛を表示（グリッド線なし）</span>
              </label>
            </>
          ) : null}
        </>
      ) : null}
      <label className="experiment-graph-checkbox">
        <input
          type="checkbox"
          checked={appearance.hierarchicalLabels}
          aria-label="条件属性を階層表示"
          onChange={(event) =>
            setAppearance((current) => ({
              ...current,
              hierarchicalLabels: event.target.checked,
            }))
          }
        />
        <span>条件属性を個別の階層として表示</span>
      </label>
      <label className="experiment-graph-checkbox">
        <input
          type="checkbox"
          checked={axes.showCategoryLabels}
          aria-label="カテゴリラベルを表示"
          onChange={(event) =>
            setAxes((current) => ({
              ...current,
              showCategoryLabels: event.target.checked,
            }))
          }
        />
        <span>カテゴリと階層ラベルを表示</span>
      </label>
      <label className="experiment-graph-field">
        <span>軸目盛の向き</span>
        <select
          aria-label="軸目盛の向き"
          value={axes.tickDirection ?? "outside"}
          onChange={(event) =>
            setAxes((current) => ({
              ...current,
              tickDirection: event.target.value as "inside" | "outside",
            }))
          }
        >
          <option value="outside">グラフの外側</option>
          <option value="inside">グラフの内側</option>
        </select>
      </label>
      {axes.xSemantic === "categorical" && groupingXSource === "factor" ? (
        <label className="experiment-graph-checkbox">
          <input
            type="checkbox"
            checked={axes.showCategoryGroupSeparators ?? false}
            aria-label="X軸のグループ境界を表示"
            onChange={(event) =>
              setAxes((current) => ({
                ...current,
                showCategoryGroupSeparators: event.target.checked,
              }))
            }
          />
          <span>X軸のグループ境界を表示</span>
        </label>
      ) : null}
      <label className="experiment-graph-field">
        <span>カテゴリラベル角度</span>
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
          <option value="none">水平</option>
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
          aria-label="棒の輪郭線を表示"
          onChange={(event) =>
            setAppearance((current) => ({
              ...current,
              barOutline: event.target.checked,
            }))
          }
        />
        <span>棒の輪郭線を表示</span>
      </label>
      <label className="experiment-graph-checkbox">
        <input
          type="checkbox"
          checked={appearance.barMeanMarker ?? false}
          disabled={graphType !== "bar"}
          aria-label="棒に平均マーカーを重ねる"
          onChange={(event) =>
            setAppearance((current) => ({
              ...current,
              barMeanMarker: event.target.checked,
            }))
          }
        />
        <span>棒に平均マーカーを重ねる</span>
      </label>
      <label className="experiment-graph-field">
        <span>カテゴリ間隔：{axes.spacing.toFixed(1)}</span>
        <input
          aria-label="カテゴリ間隔"
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
        <span>棒の幅：{appearance.barWidth.toFixed(2)}</span>
        <input
          aria-label="棒の幅"
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
        <span>系列内：{appearance.withinGroupSpacing.toFixed(2)}</span>
        <input
          aria-label="系列内の間隔"
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
        <span>X群間：{appearance.betweenGroupSpacing.toFixed(2)}</span>
        <input
          aria-label="X群間の間隔"
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
        <span>階層ラベル文字：{appearance.hierarchyFontSize}px</span>
        <input
          type="range"
          min="9"
          max="24"
          aria-label="階層ラベルの文字サイズ"
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
        <strong>階層の順序</strong>
        {(axes.hierarchyOrder.length > 0 ? axes.hierarchyOrder : attributes.map(({ id }) => id)).map(
          (attributeId, index, order) => {
            const attribute = attributes.find(({ id }) => id === attributeId);
            if (!attribute) return null;
            return (
              <div key={attributeId}>
                <span>{attribute.label}</span>
                <button
                  type="button"
                  disabled={index === 0}
                  aria-label={`${attribute.label}を上へ`}
                  onClick={() => moveHierarchy(attributeId, -1)}
                >
                  ↑
                </button>
                <button
                  type="button"
                  disabled={index === order.length - 1}
                  aria-label={`${attribute.label}を下へ`}
                  onClick={() => moveHierarchy(attributeId, 1)}
                >
                  ↓
                </button>
              </div>
            );
          },
        )}
      </div>
    </>
  );
}

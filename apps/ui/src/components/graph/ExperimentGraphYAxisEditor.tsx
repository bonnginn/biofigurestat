import type { Dispatch, SetStateAction } from "react";

import { localizedText, useAppLocale } from "../../app/appLocale";
import type { ReadoutDraft } from "../../app/experimentDraft";
import type { WorkspaceGraphState } from "../../app/experimentWorkspaceProject";

type AxisSettings = WorkspaceGraphState["axes"];
type GraphAppearance = WorkspaceGraphState["appearance"];

export type ExperimentGraphYAxisEditorProps = Readonly<{
  axes: AxisSettings;
  appearance: GraphAppearance;
  readoutShape: ReadoutDraft["shape"];
  setAxes: Dispatch<SetStateAction<AxisSettings>>;
  setAppearance: Dispatch<SetStateAction<GraphAppearance>>;
}>;

export function ExperimentGraphYAxisEditor({
  axes,
  appearance,
  readoutShape,
  setAxes,
  setAppearance,
}: ExperimentGraphYAxisEditorProps) {
  const locale = useAppLocale();
  const t = (ja: string, en: string) => localizedText(locale, ja, en);

  return (
    <>
      <label className="experiment-graph-field">
        <span>{t("軸タイトル", "Axis title")}</span>
        <input
          aria-label="Y軸タイトル"
          type="text"
          value={axes.yTitle}
          onChange={(event) =>
            setAxes((current) => ({ ...current, yTitle: event.target.value }))
          }
        />
      </label>
      <label className="experiment-graph-field">
        <span>軸タイトル文字：{appearance.axisTitleFontSize}px</span>
        <input
          type="range"
          min="10"
          max="28"
          aria-label="軸タイトルの文字サイズ"
          value={appearance.axisTitleFontSize}
          onChange={(event) =>
            setAppearance((current) => ({
              ...current,
              axisTitleFontSize: Number(event.target.value),
            }))
          }
        />
      </label>
      <label className="experiment-graph-field">
        <span>目盛文字：{appearance.tickFontSize}px</span>
        <input
          type="range"
          min="9"
          max="24"
          aria-label="目盛ラベルの文字サイズ"
          value={appearance.tickFontSize}
          onChange={(event) =>
            setAppearance((current) => ({
              ...current,
              tickFontSize: Number(event.target.value),
            }))
          }
        />
      </label>
      <label className="experiment-graph-field">
        <span>範囲</span>
        <select
          aria-label="Y軸の範囲"
          value={axes.yRangeMode}
          onChange={(event) =>
            setAxes((current) => ({
              ...current,
              yRangeMode: event.target.value as AxisSettings["yRangeMode"],
            }))
          }
        >
          <option value="auto">自動</option>
          <option value="manual">手動</option>
        </select>
      </label>
      {axes.yRangeMode === "manual" ? (
        <div className="experiment-graph-range-grid">
          <label className="experiment-graph-field">
            <span>最小</span>
            <input
              aria-label="Y軸の最小値"
              type="number"
              value={axes.yMin ?? ""}
              onChange={(event) =>
                setAxes((current) => ({
                  ...current,
                  yMin: event.target.value === "" ? null : Number(event.target.value),
                }))
              }
            />
          </label>
          <label className="experiment-graph-field">
            <span>最大</span>
            <input
              aria-label="Y軸の最大値"
              type="number"
              value={axes.yMax ?? ""}
              onChange={(event) =>
                setAxes((current) => ({
                  ...current,
                  yMax: event.target.value === "" ? null : Number(event.target.value),
                }))
              }
            />
          </label>
        </div>
      ) : null}
      <label className="experiment-graph-field">
        <span>スケール</span>
        <select
          aria-label="Y軸スケール"
          value={axes.yScale}
          disabled={readoutShape === "proportion"}
          onChange={(event) =>
            setAxes((current) => ({
              ...current,
              yScale: event.target.value as AxisSettings["yScale"],
            }))
          }
        >
          <option value="linear">Linear</option>
          <option value="log10">Log10</option>
        </select>
      </label>
      <label className="experiment-graph-field">
        <span>目盛間隔</span>
        <select
          aria-label="Y軸の目盛間隔"
          value={axes.yTickMode}
          disabled={axes.yScale === "log10"}
          onChange={(event) =>
            setAxes((current) => ({
              ...current,
              yTickMode: event.target.value as AxisSettings["yTickMode"],
            }))
          }
        >
          <option value="auto">自動（丸い数値）</option>
          <option value="manual">手動</option>
        </select>
      </label>
      {axes.yTickMode === "manual" && axes.yScale === "linear" ? (
        <label className="experiment-graph-field">
          <span>目盛間隔の値</span>
          <input
            type="number"
            min="0"
            step="any"
            aria-label="Y軸目盛の間隔値"
            value={axes.yTickInterval ?? ""}
            onChange={(event) =>
              setAxes((current) => ({
                ...current,
                yTickInterval: event.target.value === "" ? null : Number(event.target.value),
              }))
            }
          />
        </label>
      ) : null}
    </>
  );
}

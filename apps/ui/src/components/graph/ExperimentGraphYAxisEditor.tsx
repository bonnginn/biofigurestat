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
          aria-label={t("Y軸タイトル", "Y-axis title")}
          type="text"
          value={axes.yTitle}
          onChange={(event) => setAxes((current) => ({ ...current, yTitle: event.target.value }))}
        />
      </label>
      <label className="experiment-graph-field">
        <span>
          {t("軸タイトル文字：", "Axis-title text: ")}
          {appearance.axisTitleFontSize}px
        </span>
        <input
          type="range"
          min="10"
          max="28"
          aria-label={t("軸タイトルの文字サイズ", "Axis-title font size")}
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
        <span>
          {t("目盛文字：", "Tick text: ")}
          {appearance.tickFontSize}px
        </span>
        <input
          type="range"
          min="9"
          max="24"
          aria-label={t("目盛ラベルの文字サイズ", "Tick-label font size")}
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
        <span>{t("範囲", "Range")}</span>
        <select
          aria-label={t("Y軸の範囲", "Y-axis range")}
          value={axes.yRangeMode}
          onChange={(event) =>
            setAxes((current) => ({
              ...current,
              yRangeMode: event.target.value as AxisSettings["yRangeMode"],
            }))
          }
        >
          <option value="auto">{t("自動", "Automatic")}</option>
          <option value="manual">{t("手動", "Manual")}</option>
        </select>
      </label>
      {axes.yRangeMode === "manual" ? (
        <div className="experiment-graph-range-grid">
          <label className="experiment-graph-field">
            <span>{t("最小", "Minimum")}</span>
            <input
              aria-label={t("Y軸の最小値", "Y-axis minimum")}
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
            <span>{t("最大", "Maximum")}</span>
            <input
              aria-label={t("Y軸の最大値", "Y-axis maximum")}
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
        <span>{t("スケール", "Scale")}</span>
        <select
          aria-label={t("Y軸スケール", "Y-axis scale")}
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
        <span>{t("目盛間隔", "Tick interval")}</span>
        <select
          aria-label={t("Y軸の目盛間隔", "Y-axis tick interval")}
          value={axes.yTickMode}
          disabled={axes.yScale === "log10"}
          onChange={(event) =>
            setAxes((current) => ({
              ...current,
              yTickMode: event.target.value as AxisSettings["yTickMode"],
            }))
          }
        >
          <option value="auto">{t("自動（丸い数値）", "Automatic (rounded values)")}</option>
          <option value="manual">{t("手動", "Manual")}</option>
        </select>
      </label>
      {axes.yTickMode === "manual" && axes.yScale === "linear" ? (
        <label className="experiment-graph-field">
          <span>{t("目盛間隔の値", "Tick-interval value")}</span>
          <input
            type="number"
            min="0"
            step="any"
            aria-label={t("Y軸目盛の間隔値", "Y-axis tick-interval value")}
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

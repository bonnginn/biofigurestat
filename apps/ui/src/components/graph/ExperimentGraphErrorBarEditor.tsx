import type { Dispatch, SetStateAction } from "react";

import { localizedText, useAppLocale } from "../../app/appLocale";
import type { WorkspaceGraphState } from "../../app/experimentWorkspaceProject";
import {
  ExperimentGraphColorControl,
  ExperimentGraphRangeControl,
  ExperimentGraphVisibilityControl,
} from "./ExperimentGraphControlPrimitives";

type LayerState = WorkspaceGraphState["layers"];
type GraphAppearance = WorkspaceGraphState["appearance"];
type ErrorBarMode = "sd" | "sem" | "none";

export type ExperimentGraphErrorBarEditorProps = Readonly<{
  layers: LayerState;
  appearance: GraphAppearance;
  setLayers: Dispatch<SetStateAction<LayerState>>;
  setAppearance: Dispatch<SetStateAction<GraphAppearance>>;
}>;

export function ExperimentGraphErrorBarEditor({
  layers,
  appearance,
  setLayers,
  setAppearance,
}: ExperimentGraphErrorBarEditorProps) {
  const locale = useAppLocale();
  const t = (ja: string, en: string) => localizedText(locale, ja, en);

  return (
    <section className="experiment-graph-inspector-section">
      <h3>{t("誤差線", "Error bars")}</h3>
      <ExperimentGraphVisibilityControl
        label={t("誤差線を表示", "Show error bars")}
        checked={layers.errorBar}
        onChange={(errorBar) => setLayers((current) => ({ ...current, errorBar }))}
      />
      <label className="experiment-graph-field">
        <span>{t("要約方法", "Summary method")}</span>
        <select
          aria-label={t("誤差線の要約方法", "Error-bar summary method")}
          value={appearance.errorBar}
          onChange={(event) =>
            setAppearance((current) => ({
              ...current,
              errorBar: event.target.value as ErrorBarMode,
            }))
          }
        >
          <option value="sd">{t("SD（標準偏差）", "SD (standard deviation)")}</option>
          <option value="sem">{t("SEM（標準誤差）", "SEM (standard error)")}</option>
          <option value="none">{t("なし", "None")}</option>
        </select>
      </label>
      <label className="experiment-graph-field">
        <span>{t("不確実性の表示", "Uncertainty display")}</span>
        <select
          aria-label={t("不確実性の表示形式", "Uncertainty display style")}
          value={appearance.uncertaintyStyle ?? "error_bars"}
          onChange={(event) =>
            setAppearance((current) => ({
              ...current,
              uncertaintyStyle: event.target.value as "error_bars" | "ribbon" | "none",
            }))
          }
        >
          <option value="error_bars">{t("誤差線", "Error bars")}</option>
          <option value="ribbon">{t("リボン", "Ribbon")}</option>
          <option value="none">{t("なし", "None")}</option>
        </select>
      </label>
      {(appearance.uncertaintyStyle ?? "error_bars") === "ribbon" ? (
        <label className="experiment-graph-field">
          <span>
            {t("リボン透明度：", "Ribbon opacity: ")}
            {(appearance.ribbonOpacity ?? 0.18).toFixed(2)}
          </span>
          <input
            type="range"
            min="0.05"
            max="0.6"
            step="0.01"
            aria-label={t("リボン透明度", "Ribbon opacity")}
            value={appearance.ribbonOpacity ?? 0.18}
            onChange={(event) =>
              setAppearance((current) => ({
                ...current,
                ribbonOpacity: Number(event.target.value),
              }))
            }
          />
        </label>
      ) : null}
      <ExperimentGraphRangeControl
        label={t("線幅", "Line width")}
        ariaLabel={t("誤差線の太さ", "Error-bar width")}
        value={appearance.errorBarLineWidth}
        min={0.6}
        max={4}
        step={0.1}
        suffix="px"
        separator={t("：", ": ")}
        formatValue={(value) => value.toFixed(1)}
        onChange={(errorBarLineWidth) =>
          setAppearance((current) => ({ ...current, errorBarLineWidth }))
        }
      />
      <ExperimentGraphColorControl
        label={t("誤差線の色", "Error-bar color")}
        ariaLabel={t("誤差線の色", "Error-bar color")}
        value={appearance.errorBarColor}
        showPresets
        onChange={(errorBarColor) => setAppearance((current) => ({ ...current, errorBarColor }))}
      />
    </section>
  );
}

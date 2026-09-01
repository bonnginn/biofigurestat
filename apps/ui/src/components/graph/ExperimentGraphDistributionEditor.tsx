import type { Dispatch, SetStateAction } from "react";

import { localizedText, useAppLocale } from "../../app/appLocale";
import type { ReadoutDraft } from "../../app/experimentDraft";
import type { WorkspaceGraphState } from "../../app/experimentWorkspaceProject";

type LayerState = WorkspaceGraphState["layers"];
type GraphAppearance = WorkspaceGraphState["appearance"];

type ExperimentGraphDistributionEditorProps = Readonly<{
  mode: "violin" | "box";
  shape: ReadoutDraft["shape"];
  layers: LayerState;
  appearance: GraphAppearance;
  setLayers: Dispatch<SetStateAction<LayerState>>;
  setAppearance: Dispatch<SetStateAction<GraphAppearance>>;
}>;

export function ExperimentGraphDistributionEditor({
  mode,
  shape,
  layers,
  appearance,
  setLayers,
  setAppearance,
}: ExperimentGraphDistributionEditorProps) {
  const locale = useAppLocale();
  const t = (ja: string, en: string) => localizedText(locale, ja, en);
  const isViolin = mode === "violin";

  return (
    <section className="experiment-graph-inspector-section">
      <h3>{isViolin ? t("バイオリン分布", "Violin distribution") : t("箱ひげ", "Box plot")}</h3>
      <label className="experiment-graph-checkbox">
        <input
          type="checkbox"
          checked={
            isViolin
              ? layers.violin
              : shape === "nested_continuous"
                ? layers.distribution || layers.box
                : layers.box
          }
          aria-label={
            isViolin ? t("バイオリンを表示", "Show violin") : t("箱ひげを表示", "Show box plot")
          }
          onChange={(event) =>
            setLayers((current) =>
              isViolin
                ? { ...current, violin: event.target.checked }
                : {
                    ...current,
                    distribution: event.target.checked,
                    box: event.target.checked,
                  },
            )
          }
        />
        <span>
          {isViolin
            ? t("観測値の分布を表示", "Show the observed-value distribution")
            : t("中央値と四分位範囲を表示", "Show the median and interquartile range")}
        </span>
      </label>
      {isViolin ? (
        <p className="experiment-graph-help">
          {t(
            "バイオリンは細胞・ROIなど、十分な観測値がある場合の分布表示です。",
            "Violin plots show distributions when enough observations, such as cells or ROIs, are available.",
          )}
        </p>
      ) : null}
      <label className="experiment-graph-field">
        <span>{t("塗り", "Fill")}</span>
        <select
          aria-label={t("分布の塗り", "Distribution fill")}
          value={appearance.distributionFill}
          onChange={(event) =>
            setAppearance((current) => ({
              ...current,
              distributionFill: event.target.value as GraphAppearance["distributionFill"],
            }))
          }
        >
          <option value="none">{t("透明", "Transparent")}</option>
          <option value="white">{t("白", "White")}</option>
          <option value="series">{t("系列色", "Series color")}</option>
          <option value="custom">{t("指定色", "Custom color")}</option>
        </select>
      </label>
      {isViolin && appearance.distributionFill === "custom" ? (
        <label className="experiment-graph-field">
          <span>{t("塗り色", "Fill color")}</span>
          <input
            type="color"
            aria-label={t("分布の塗り色", "Distribution fill color")}
            value={appearance.distributionFillColor}
            onChange={(event) =>
              setAppearance((current) => ({
                ...current,
                distributionFillColor: event.target.value,
              }))
            }
          />
        </label>
      ) : null}
      {isViolin ? (
        <label className="experiment-graph-field">
          <span>{t("ひげの定義", "Whisker definition")}</span>
          <select
            aria-label={t("箱ひげの定義", "Box-plot whisker definition")}
            value={appearance.boxWhiskerMode ?? "tukey_1_5_iqr"}
            onChange={(event) =>
              setAppearance((current) => ({
                ...current,
                boxWhiskerMode: event.target.value as "tukey_1_5_iqr" | "min_max",
              }))
            }
          >
            <option value="tukey_1_5_iqr">Tukey 1.5×IQR</option>
            <option value="min_max">{t("最小–最大", "Minimum–maximum")}</option>
          </select>
        </label>
      ) : null}
      <label className="experiment-graph-field">
        <span>
          {t("輪郭線", "Outline")}: {appearance.distributionLineWidth.toFixed(1)}px
        </span>
        <input
          type="range"
          min="0.6"
          max="4"
          step="0.1"
          aria-label={
            isViolin
              ? t("分布輪郭線の太さ", "Distribution outline width")
              : t("箱ひげ輪郭線の太さ", "Box-plot outline width")
          }
          value={appearance.distributionLineWidth}
          onChange={(event) =>
            setAppearance((current) => ({
              ...current,
              distributionLineWidth: Number(event.target.value),
            }))
          }
        />
      </label>
    </section>
  );
}

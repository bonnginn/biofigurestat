import type { Dispatch, SetStateAction } from "react";

import { localizedText, useAppLocale } from "../../app/appLocale";
import type { ExperimentSetDraft, ReadoutDraft } from "../../app/experimentDraft";
import type { WorkspaceGraphState } from "../../app/experimentWorkspaceProject";
import { GRAPH_PALETTES, type GraphPaletteMode } from "./graphAppearance";

type AxisSettings = WorkspaceGraphState["axes"];
type GraphAppearance = WorkspaceGraphState["appearance"];
type GraphType = WorkspaceGraphState["graphType"];

export type GraphDisplayPreset = "simple" | "publication" | "presentation" | "raw" | "replicate";

export type ExperimentGraphAppearanceEditorProps = Readonly<{
  graphType: GraphType;
  appearance: GraphAppearance;
  readoutShape: ReadoutDraft["shape"];
  analysisIntentKind: ExperimentSetDraft["analysisIntent"]["kind"];
  conditionAssignmentKind: ExperimentSetDraft["conditionAssignment"]["kind"];
  timeSampling: ExperimentSetDraft["time"]["sampling"];
  activeConditions: ExperimentSetDraft["conditions"];
  onGraphTypeChange: (graphType: GraphType) => void;
  onApplyPreset: (preset: GraphDisplayPreset) => void;
  setAxes: Dispatch<SetStateAction<AxisSettings>>;
  setAppearance: Dispatch<SetStateAction<GraphAppearance>>;
}>;

export function ExperimentGraphAppearanceEditor({
  graphType,
  appearance,
  readoutShape,
  analysisIntentKind,
  conditionAssignmentKind,
  timeSampling,
  activeConditions,
  onGraphTypeChange,
  onApplyPreset,
  setAxes,
  setAppearance,
}: ExperimentGraphAppearanceEditorProps) {
  const locale = useAppLocale();
  const t = (ja: string, en: string) => localizedText(locale, ja, en);

  return (
    <section className="experiment-graph-inspector-section">
      <h3>{t("グラフの外観", "Graph appearance")}</h3>
      <label className="experiment-graph-field">
        <span>{t("基本形", "Graph type")}</span>
        <select
          aria-label={t("グラフの基本形", "Graph type")}
          value={graphType}
          onChange={(event) => onGraphTypeChange(event.target.value as GraphType)}
        >
          {readoutShape === "categorical_counts" ? (
            <>
              <option value="stacked">Stacked count</option>
              <option value="stacked_100">100% stacked</option>
              <option value="category_percentage">Category percentage</option>
            </>
          ) : analysisIntentKind === "correlation" ? (
            <option value="scatter">Scatter</option>
          ) : (
            <>
              <option value="dot">Dot</option>
              <option value="box">Box</option>
              <option value="violin">Violin</option>
              <option value="bar">Bar</option>
              <option value="line">Line / Time course</option>
              <option
                value="paired_dot"
                disabled={conditionAssignmentKind !== "matched" && timeSampling !== "longitudinal"}
              >
                {t("対応を線で結ぶ", "Connect matched observations")}
              </option>
            </>
          )}
        </select>
      </label>
      <label className="experiment-graph-field">
        <span>{t("表示プリセット", "Display preset")}</span>
        <select
          aria-label={t("表示プリセット", "Display preset")}
          defaultValue="simple"
          onChange={(event) => onApplyPreset(event.target.value as GraphDisplayPreset)}
        >
          <option value="simple">{t("シンプル", "Simple")}</option>
          <option value="publication">{t("論文", "Publication")}</option>
          <option value="presentation">{t("発表", "Presentation")}</option>
          {readoutShape === "nested_continuous" ? (
            <>
              <option value="raw">
                {t("生データ分布を重視", "Emphasize raw-data distribution")}
              </option>
              <option value="replicate">
                {t("実験単位だけを表示", "Show experimental units only")}
              </option>
            </>
          ) : null}
        </select>
      </label>
      <label className="experiment-graph-field">
        <span>{t("色", "Color")}</span>
        <select
          aria-label={t("色の使い方", "Color scheme")}
          value={appearance.palette}
          onChange={(event) =>
            setAppearance((current) => ({
              ...current,
              palette: event.target.value as GraphPaletteMode,
            }))
          }
        >
          <option value="single">{t("抑えた単色", "Muted single color")}</option>
          <option value="condition">{t("条件ごとに色分け", "Color by condition")}</option>
          <option value="publication">{t("論文向け", "Publication palette")}</option>
          <option value="colorblind">{t("色覚多様性対応", "Colorblind-accessible palette")}</option>
          <option value="grayscale">{t("グレースケール", "Grayscale")}</option>
        </select>
      </label>
      {appearance.palette !== "single" ? (
        <details className="experiment-graph-color-details">
          <summary>{t("条件ごとの色", "Colors by condition")}</summary>
          {activeConditions.map((condition, index) => (
            <label className="experiment-graph-color-field" key={condition.id}>
              <span>{condition.label}</span>
              <input
                type="color"
                aria-label={t(`${condition.label}の色`, `${condition.label} color`)}
                value={
                  appearance.seriesColors[condition.id] ??
                  GRAPH_PALETTES[appearance.palette][
                    index % GRAPH_PALETTES[appearance.palette].length
                  ]
                }
                onChange={(event) =>
                  setAppearance((current) => ({
                    ...current,
                    seriesColors: {
                      ...current.seriesColors,
                      [condition.id]: event.target.value,
                    },
                  }))
                }
              />
            </label>
          ))}
          <button
            type="button"
            onClick={() => setAppearance((current) => ({ ...current, seriesColors: {} }))}
          >
            {t("パレット色に戻す", "Restore palette colors")}
          </button>
        </details>
      ) : null}
      <label className="experiment-graph-field">
        <span>{t("フォント", "Font")}</span>
        <select
          aria-label={t("グラフのフォント", "Graph font")}
          value={appearance.fontFamily}
          onChange={(event) =>
            setAppearance((current) => ({
              ...current,
              fontFamily: event.target.value as GraphAppearance["fontFamily"],
            }))
          }
        >
          <option value="arial">Arial</option>
          <option value="helvetica">Helvetica</option>
          <option value="system">System Sans Serif</option>
        </select>
      </label>
      <label className="experiment-graph-field">
        <span>
          {t("グラフタイトル：", "Graph title: ")}
          {appearance.graphTitleFontSize}px
        </span>
        <input
          aria-label={t("グラフタイトルの文字サイズ", "Graph-title font size")}
          type="range"
          min="12"
          max="32"
          value={appearance.graphTitleFontSize}
          onChange={(event) =>
            setAppearance((current) => ({
              ...current,
              graphTitleFontSize: Number(event.target.value),
            }))
          }
        />
      </label>
      <label className="experiment-graph-field">
        <span>{t("キャンバス", "Canvas")}</span>
        <select
          aria-label={t("グラフの大きさ", "Graph size")}
          value={appearance.canvasPreset}
          onChange={(event) =>
            setAppearance((current) => ({
              ...current,
              canvasPreset: event.target.value as GraphAppearance["canvasPreset"],
            }))
          }
        >
          <option value="compact">Compact</option>
          <option value="standard">Standard</option>
          <option value="wide">Wide</option>
        </select>
      </label>
      <label className="experiment-graph-field">
        <span>
          {t("左右の余白：", "Side padding: ")}
          {appearance.sidePadding}px
        </span>
        <input
          aria-label={t("グラフ左右の余白", "Graph side padding")}
          type="range"
          min="56"
          max="180"
          step="4"
          value={appearance.sidePadding}
          onChange={(event) =>
            setAppearance((current) => ({
              ...current,
              sidePadding: Number(event.target.value),
            }))
          }
        />
      </label>
      <label className="experiment-graph-field">
        <span>
          {t("軸線：", "Axis line: ")}
          {appearance.axisLineWidth.toFixed(1)}px
        </span>
        <input
          aria-label={t("軸線の太さ", "Axis-line width")}
          type="range"
          min="0.8"
          max="2.4"
          step="0.2"
          value={appearance.axisLineWidth}
          onChange={(event) =>
            setAppearance((current) => ({
              ...current,
              axisLineWidth: Number(event.target.value),
            }))
          }
        />
      </label>
      <button
        type="button"
        className="experiment-graph-reset-layout"
        onClick={() => {
          setAppearance((current) => ({
            ...current,
            canvasPreset: "standard",
            sidePadding: 72,
          }));
          setAxes((current) => ({ ...current, spacing: 1 }));
        }}
      >
        {t("レイアウトを自動設定に戻す", "Restore automatic layout")}
      </button>
    </section>
  );
}

import type { Dispatch, SetStateAction } from "react";

import { localizedText, useAppLocale } from "../../app/appLocale";
import type { ReadoutDraft } from "../../app/experimentDraft";
import type { WorkspaceGraphState } from "../../app/experimentWorkspaceProject";
import {
  ExperimentGraphColorControl,
  ExperimentGraphRangeControl,
  ExperimentGraphVisibilityControl,
} from "./ExperimentGraphControlPrimitives";

type LayerState = WorkspaceGraphState["layers"];
type GraphAppearance = WorkspaceGraphState["appearance"];

export type ExperimentGraphRawDotsEditorProps = Readonly<{
  shape: ReadoutDraft["shape"];
  layers: LayerState;
  appearance: GraphAppearance;
  setLayers: Dispatch<SetStateAction<LayerState>>;
  setAppearance: Dispatch<SetStateAction<GraphAppearance>>;
}>;

export function ExperimentGraphRawDotsEditor({
  shape,
  layers,
  appearance,
  setLayers,
  setAppearance,
}: ExperimentGraphRawDotsEditorProps) {
  const locale = useAppLocale();
  const t = (ja: string, en: string) => localizedText(locale, ja, en);
  const nested = shape === "nested_continuous";
  const layer = nested ? "raw" : "experiment";

  return (
    <section className="experiment-graph-inspector-section">
      <h3>
        {nested
          ? t("細胞・ROIの生データ", "Raw cell/ROI data")
          : t("実験単位の点", "Experimental-unit points")}
      </h3>
      <ExperimentGraphVisibilityControl
        label={
          nested
            ? t("細胞・ROIの生データ", "Raw cell/ROI data")
            : t("実験単位の点", "Experimental-unit points")
        }
        ariaLabel={
          nested
            ? t("生データの点を表示", "Show raw-data points")
            : t("実験単位の点を表示", "Show experimental-unit points")
        }
        checked={layers[layer]}
        onChange={(visible) => setLayers((current) => ({ ...current, [layer]: visible }))}
      />
      <ExperimentGraphRangeControl
        label={t("点の大きさ", "Point size")}
        ariaLabel={t("生データ点の大きさ", "Raw-data point size")}
        value={appearance.pointSize}
        min={4}
        max={10}
        step={1}
        suffix="px"
        separator={t("：", ": ")}
        onChange={(pointSize) => setAppearance((current) => ({ ...current, pointSize }))}
      />
      <ExperimentGraphRangeControl
        label={t("横方向のばらし幅", "Horizontal jitter")}
        ariaLabel={t("生データ点のjitter", "Raw-data point jitter")}
        value={appearance.jitter}
        min={0}
        max={24}
        step={1}
        suffix="px"
        separator={t("：", ": ")}
        onChange={(jitter) => setAppearance((current) => ({ ...current, jitter }))}
      />
      {nested ? (
        <ExperimentGraphColorControl
          label={t("生データ点の色", "Raw-data point color")}
          ariaLabel={t("生データ点の色", "Raw-data point color")}
          value={appearance.rawPointColor}
          showPresets
          onChange={(rawPointColor) => setAppearance((current) => ({ ...current, rawPointColor }))}
        />
      ) : null}
      <p className="experiment-graph-help">
        {t(
          "細胞・ROIの点は観測分布の表示用で、統計上のnとしては扱いません。",
          "Cell and ROI points show the observed distribution and are not treated as the statistical n.",
        )}
      </p>
    </section>
  );
}

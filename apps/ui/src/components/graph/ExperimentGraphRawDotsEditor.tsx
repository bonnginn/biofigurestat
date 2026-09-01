import type { Dispatch, SetStateAction } from "react";

import { localizedText, useAppLocale } from "../../app/appLocale";
import type { ReadoutDraft } from "../../app/experimentDraft";
import type { WorkspaceGraphState } from "../../app/experimentWorkspaceProject";

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
      <label className="experiment-graph-checkbox">
        <input
          type="checkbox"
          checked={layers[layer]}
          aria-label={
            nested
              ? t("生データの点を表示", "Show raw-data points")
              : t("実験単位の点を表示", "Show experimental-unit points")
          }
          onChange={(event) =>
            setLayers((current) => ({ ...current, [layer]: event.target.checked }))
          }
        />
        <span>
          {nested
            ? t("細胞・ROIの生データ", "Raw cell/ROI data")
            : t("実験単位の点", "Experimental-unit points")}
        </span>
      </label>
      <label className="experiment-graph-field">
        <span>
          {t("点の大きさ：", "Point size: ")}
          {appearance.pointSize}px
        </span>
        <input
          aria-label={t("生データ点の大きさ", "Raw-data point size")}
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
          {t("横方向のばらし幅：", "Horizontal jitter: ")}
          {appearance.jitter}px
        </span>
        <input
          aria-label={t("生データ点のjitter", "Raw-data point jitter")}
          type="range"
          min="0"
          max="24"
          step="1"
          value={appearance.jitter}
          onChange={(event) =>
            setAppearance((current) => ({
              ...current,
              jitter: Number(event.target.value),
            }))
          }
        />
      </label>
      {nested ? (
        <label className="experiment-graph-color-field">
          <span>{t("生データ点の色", "Raw-data point color")}</span>
          <input
            type="color"
            aria-label={t("生データ点の色", "Raw-data point color")}
            value={appearance.rawPointColor}
            onChange={(event) =>
              setAppearance((current) => ({
                ...current,
                rawPointColor: event.target.value,
              }))
            }
          />
        </label>
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

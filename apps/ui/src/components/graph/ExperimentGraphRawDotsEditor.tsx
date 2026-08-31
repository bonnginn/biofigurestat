import type { Dispatch, SetStateAction } from "react";

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
  const nested = shape === "nested_continuous";
  const layer = nested ? "raw" : "experiment";

  return (
    <section className="experiment-graph-inspector-section">
      <h3>{nested ? "細胞・ROIの生データ" : "実験単位の点"}</h3>
      <label className="experiment-graph-checkbox">
        <input
          type="checkbox"
          checked={layers[layer]}
          aria-label={nested ? "生データの点を表示" : "実験単位の点を表示"}
          onChange={(event) =>
            setLayers((current) => ({ ...current, [layer]: event.target.checked }))
          }
        />
        <span>{nested ? "細胞・ROIの生データ" : "実験単位の点"}</span>
      </label>
      <label className="experiment-graph-field">
        <span>点の大きさ：{appearance.pointSize}px</span>
        <input
          aria-label="生データ点の大きさ"
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
        <span>横方向のばらし幅：{appearance.jitter}px</span>
        <input
          aria-label="生データ点のjitter"
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
          <span>生データ点の色</span>
          <input
            type="color"
            aria-label="生データ点の色"
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
        細胞・ROIの点は観測分布の表示用で、統計上のnとしては扱いません。
      </p>
    </section>
  );
}

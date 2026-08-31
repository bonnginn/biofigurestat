import type { Dispatch, SetStateAction } from "react";

import { localizedText, useAppLocale } from "../../app/appLocale";
import type { WorkspaceGraphState } from "../../app/experimentWorkspaceProject";

type LayerState = WorkspaceGraphState["layers"];
type GraphAppearance = WorkspaceGraphState["appearance"];

export type ExperimentGraphConnectingLineEditorProps = Readonly<{
  layers: LayerState;
  appearance: GraphAppearance;
  setLayers: Dispatch<SetStateAction<LayerState>>;
  setAppearance: Dispatch<SetStateAction<GraphAppearance>>;
}>;

export function ExperimentGraphConnectingLineEditor({
  layers,
  appearance,
  setLayers,
  setAppearance,
}: ExperimentGraphConnectingLineEditorProps) {
  const locale = useAppLocale();
  const t = (ja: string, en: string) => localizedText(locale, ja, en);

  return (
    <section className="experiment-graph-inspector-section">
      <h3>{t("接続線", "Connecting lines")}</h3>
      <label className="experiment-graph-checkbox">
        <input
          type="checkbox"
          checked={layers.connectingLine}
          aria-label="接続線を表示"
          onChange={(event) =>
            setLayers((current) => ({ ...current, connectingLine: event.target.checked }))
          }
        />
        <span>条件または時点の要約を線で結ぶ</span>
      </label>
      <label className="experiment-graph-field">
        <span>線幅：{appearance.connectingLineWidth.toFixed(1)}px</span>
        <input
          type="range"
          min="0.6"
          max="4"
          step="0.1"
          aria-label="接続線の太さ"
          value={appearance.connectingLineWidth}
          onChange={(event) =>
            setAppearance((current) => ({
              ...current,
              connectingLineWidth: Number(event.target.value),
            }))
          }
        />
      </label>
      <label className="experiment-graph-color-field">
        <span>接続線の色</span>
        <input
          type="color"
          aria-label="接続線の色"
          value={appearance.connectingLineColor}
          onChange={(event) =>
            setAppearance((current) => ({
              ...current,
              connectingLineColor: event.target.value,
            }))
          }
        />
      </label>
    </section>
  );
}

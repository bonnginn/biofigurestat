import type { Dispatch, SetStateAction } from "react";

import { localizedText, useAppLocale } from "../../app/appLocale";
import type { WorkspaceGraphState } from "../../app/experimentWorkspaceProject";

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
      <label className="experiment-graph-checkbox">
        <input
          type="checkbox"
          checked={layers.errorBar}
          aria-label="誤差線を表示"
          onChange={(event) =>
            setLayers((current) => ({ ...current, errorBar: event.target.checked }))
          }
        />
        <span>誤差線を表示</span>
      </label>
      <label className="experiment-graph-field">
        <span>要約方法</span>
        <select
          aria-label="誤差線の要約方法"
          value={appearance.errorBar}
          onChange={(event) =>
            setAppearance((current) => ({
              ...current,
              errorBar: event.target.value as ErrorBarMode,
            }))
          }
        >
          <option value="sd">SD（標準偏差）</option>
          <option value="sem">SEM（標準誤差）</option>
          <option value="none">なし</option>
        </select>
      </label>
      <label className="experiment-graph-field">
        <span>不確実性の表示</span>
        <select
          aria-label="不確実性の表示形式"
          value={appearance.uncertaintyStyle ?? "error_bars"}
          onChange={(event) =>
            setAppearance((current) => ({
              ...current,
              uncertaintyStyle: event.target.value as "error_bars" | "ribbon" | "none",
            }))
          }
        >
          <option value="error_bars">誤差線</option>
          <option value="ribbon">リボン</option>
          <option value="none">なし</option>
        </select>
      </label>
      {(appearance.uncertaintyStyle ?? "error_bars") === "ribbon" ? (
        <label className="experiment-graph-field">
          <span>リボン透明度：{(appearance.ribbonOpacity ?? 0.18).toFixed(2)}</span>
          <input
            type="range"
            min="0.05"
            max="0.6"
            step="0.01"
            aria-label="リボン透明度"
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
      <label className="experiment-graph-field">
        <span>線幅：{appearance.errorBarLineWidth.toFixed(1)}px</span>
        <input
          type="range"
          min="0.6"
          max="4"
          step="0.1"
          aria-label="誤差線の太さ"
          value={appearance.errorBarLineWidth}
          onChange={(event) =>
            setAppearance((current) => ({
              ...current,
              errorBarLineWidth: Number(event.target.value),
            }))
          }
        />
      </label>
      <label className="experiment-graph-color-field">
        <span>誤差線の色</span>
        <input
          type="color"
          aria-label="誤差線の色"
          value={appearance.errorBarColor}
          onChange={(event) =>
            setAppearance((current) => ({
              ...current,
              errorBarColor: event.target.value,
            }))
          }
        />
      </label>
    </section>
  );
}

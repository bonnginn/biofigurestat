import type { Dispatch, SetStateAction } from "react";

import { localizedText, useAppLocale } from "../../app/appLocale";
import type { WorkspaceGraphState } from "../../app/experimentWorkspaceProject";

type GraphAppearance = WorkspaceGraphState["appearance"];

export type ExperimentGraphLegendEditorProps = Readonly<{
  appearance: GraphAppearance;
  setAppearance: Dispatch<SetStateAction<GraphAppearance>>;
}>;

export function ExperimentGraphLegendEditor({
  appearance,
  setAppearance,
}: ExperimentGraphLegendEditorProps) {
  const locale = useAppLocale();
  const t = (ja: string, en: string) => localizedText(locale, ja, en);

  return (
    <section className="experiment-graph-inspector-section">
      <h3>{t("凡例", "Legend")}</h3>
      <label className="experiment-graph-field">
        <span>位置</span>
        <select
          aria-label="凡例の位置"
          value={appearance.legendPosition}
          onChange={(event) =>
            setAppearance((current) => ({
              ...current,
              legendPosition: event.target.value as GraphAppearance["legendPosition"],
              palette:
                event.target.value === "hidden" || current.palette !== "single"
                  ? current.palette
                  : "condition",
            }))
          }
        >
          <option value="hidden">なし</option>
          <option value="top">上</option>
          <option value="right">右</option>
          <option value="inside">内側</option>
        </select>
      </label>
      <label className="experiment-graph-field">
        <span>文字：{appearance.legendFontSize}px</span>
        <input
          type="range"
          min="9"
          max="24"
          aria-label="凡例の文字サイズ"
          value={appearance.legendFontSize}
          onChange={(event) =>
            setAppearance((current) => ({
              ...current,
              legendFontSize: Number(event.target.value),
            }))
          }
        />
      </label>
    </section>
  );
}

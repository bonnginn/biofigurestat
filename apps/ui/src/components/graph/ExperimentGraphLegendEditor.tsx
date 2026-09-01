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
        <span>{t("位置", "Position")}</span>
        <select
          aria-label={t("凡例の位置", "Legend position")}
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
          <option value="hidden">{t("なし", "None")}</option>
          <option value="top">{t("上", "Top")}</option>
          <option value="right">{t("右", "Right")}</option>
          <option value="inside">{t("内側", "Inside")}</option>
        </select>
      </label>
      <label className="experiment-graph-field">
        <span>
          {t("文字：", "Text: ")}
          {appearance.legendFontSize}px
        </span>
        <input
          type="range"
          min="9"
          max="24"
          aria-label={t("凡例の文字サイズ", "Legend font size")}
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

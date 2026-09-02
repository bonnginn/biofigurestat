import type { Dispatch, SetStateAction } from "react";

import { localizedText, useAppLocale } from "../../app/appLocale";
import type { WorkspaceGraphState } from "../../app/experimentWorkspaceProject";
import {
  ExperimentGraphColorControl,
  ExperimentGraphRangeControl,
  ExperimentGraphVisibilityControl,
} from "./ExperimentGraphControlPrimitives";

type GraphAppearance = WorkspaceGraphState["appearance"];

export function ExperimentGraphBarAppearanceEditor({
  appearance,
  setAppearance,
}: Readonly<{
  appearance: GraphAppearance;
  setAppearance: Dispatch<SetStateAction<GraphAppearance>>;
}>) {
  const locale = useAppLocale();
  const t = (ja: string, en: string) => localizedText(locale, ja, en);

  return (
    <div className="experiment-graph-subsection">
      <h4>{t("棒", "Bars")}</h4>
      <ExperimentGraphVisibilityControl
        label={t("棒の輪郭線を表示", "Show bar outlines")}
        checked={appearance.barOutline ?? true}
        onChange={(barOutline) => setAppearance((current) => ({ ...current, barOutline }))}
      />
      {(appearance.barOutline ?? true) ? (
        <>
          <label className="experiment-graph-field">
            <span>{t("棒の外枠色", "Bar outline color")}</span>
            <select
              aria-label={t("棒の外枠色", "Bar outline color")}
              value={appearance.barOutlineMode ?? "series"}
              onChange={(event) =>
                setAppearance((current) => ({
                  ...current,
                  barOutlineMode: event.target.value as NonNullable<
                    GraphAppearance["barOutlineMode"]
                  >,
                }))
              }
            >
              <option value="series">{t("塗り色に合わせる", "Match fill color")}</option>
              <option value="black">{t("黒", "Black")}</option>
              <option value="custom">{t("色を選ぶ", "Choose color")}</option>
            </select>
          </label>
          {appearance.barOutlineMode === "custom" ? (
            <ExperimentGraphColorControl
              label={t("任意色", "Custom color")}
              ariaLabel={t("棒の外枠の任意色", "Custom bar outline color")}
              value={appearance.barOutlineColor ?? "#111111"}
              showPresets
              presetsAriaLabel={t("棒の外枠のプリセット色", "Bar outline preset colors")}
              onChange={(barOutlineColor) =>
                setAppearance((current) => ({ ...current, barOutlineColor }))
              }
            />
          ) : null}
          <ExperimentGraphRangeControl
            label={t("棒の外枠の太さ", "Bar outline width")}
            ariaLabel={t("棒の外枠の太さ", "Bar outline width")}
            value={appearance.barOutlineWidth ?? appearance.distributionLineWidth ?? 1.2}
            min={0.5}
            max={4}
            step={0.1}
            suffix="px"
            separator={t("：", ": ")}
            formatValue={(value) => value.toFixed(1)}
            onChange={(barOutlineWidth) =>
              setAppearance((current) => ({ ...current, barOutlineWidth }))
            }
          />
        </>
      ) : null}
      <ExperimentGraphVisibilityControl
        label={t("棒に平均マーカーを重ねる", "Overlay mean markers on bars")}
        checked={appearance.barMeanMarker ?? false}
        onChange={(barMeanMarker) => setAppearance((current) => ({ ...current, barMeanMarker }))}
      />
      <ExperimentGraphRangeControl
        label={t("棒の幅", "Bar width")}
        ariaLabel={t("棒の幅", "Bar width")}
        value={appearance.barWidth}
        min={0.25}
        max={1}
        step={0.05}
        separator={t("：", ": ")}
        formatValue={(value) => value.toFixed(2)}
        onChange={(barWidth) => setAppearance((current) => ({ ...current, barWidth }))}
      />
    </div>
  );
}

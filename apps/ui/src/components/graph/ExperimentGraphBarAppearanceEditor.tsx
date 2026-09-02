import type { Dispatch, SetStateAction } from "react";

import { localizedText, useAppLocale } from "../../app/appLocale";
import type { WorkspaceGraphState } from "../../app/experimentWorkspaceProject";

type GraphAppearance = WorkspaceGraphState["appearance"];

const BAR_OUTLINE_COLOR_PRESETS = [
  { color: "#111111", ja: "黒", en: "Black" },
  { color: "#245c8a", ja: "青", en: "Blue" },
  { color: "#c26532", ja: "オレンジ", en: "Orange" },
  { color: "#3e7c67", ja: "緑", en: "Green" },
  { color: "#735a8d", ja: "紫", en: "Purple" },
  { color: "#b42318", ja: "赤", en: "Red" },
  { color: "#6b7280", ja: "グレー", en: "Gray" },
] as const;

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
      <label className="experiment-graph-checkbox">
        <input
          type="checkbox"
          checked={appearance.barOutline ?? true}
          aria-label={t("棒の輪郭線を表示", "Show bar outlines")}
          onChange={(event) =>
            setAppearance((current) => ({ ...current, barOutline: event.target.checked }))
          }
        />
        <span>{t("棒の輪郭線を表示", "Show bar outlines")}</span>
      </label>
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
            <div className="experiment-graph-custom-color">
              <div
                className="experiment-graph-color-presets"
                role="group"
                aria-label={t("棒の外枠のプリセット色", "Bar outline preset colors")}
              >
                {BAR_OUTLINE_COLOR_PRESETS.map((preset) => {
                  const label = t(preset.ja, preset.en);
                  return (
                    <button
                      type="button"
                      key={preset.color}
                      className="experiment-graph-color-preset"
                      style={{ backgroundColor: preset.color }}
                      aria-label={t(`${label}を選択`, `Choose ${label}`)}
                      aria-pressed={appearance.barOutlineColor === preset.color}
                      onClick={() =>
                        setAppearance((current) => ({
                          ...current,
                          barOutlineMode: "custom",
                          barOutlineColor: preset.color,
                        }))
                      }
                    />
                  );
                })}
              </div>
              <label className="experiment-graph-color-field">
                <span>{t("任意色", "Custom color")}</span>
                <input
                  type="color"
                  aria-label={t("棒の外枠の任意色", "Custom bar outline color")}
                  value={appearance.barOutlineColor ?? "#111111"}
                  onChange={(event) =>
                    setAppearance((current) => ({
                      ...current,
                      barOutlineColor: event.target.value,
                    }))
                  }
                />
              </label>
            </div>
          ) : null}
          <label className="experiment-graph-field">
            <span>
              {t("棒の外枠の太さ：", "Bar outline width: ")}
              {(appearance.barOutlineWidth ?? appearance.distributionLineWidth ?? 1.2).toFixed(1)}px
            </span>
            <input
              type="range"
              min="0.5"
              max="4"
              step="0.1"
              aria-label={t("棒の外枠の太さ", "Bar outline width")}
              value={appearance.barOutlineWidth ?? appearance.distributionLineWidth ?? 1.2}
              onChange={(event) =>
                setAppearance((current) => ({
                  ...current,
                  barOutlineWidth: Number(event.target.value),
                }))
              }
            />
          </label>
        </>
      ) : null}
      <label className="experiment-graph-checkbox">
        <input
          type="checkbox"
          checked={appearance.barMeanMarker ?? false}
          aria-label={t("棒に平均マーカーを重ねる", "Overlay mean markers on bars")}
          onChange={(event) =>
            setAppearance((current) => ({ ...current, barMeanMarker: event.target.checked }))
          }
        />
        <span>{t("棒に平均マーカーを重ねる", "Overlay mean markers on bars")}</span>
      </label>
      <label className="experiment-graph-field">
        <span>
          {t("棒の幅：", "Bar width: ")}
          {appearance.barWidth.toFixed(2)}
        </span>
        <input
          aria-label={t("棒の幅", "Bar width")}
          type="range"
          min="0.25"
          max="1"
          step="0.05"
          value={appearance.barWidth}
          onChange={(event) =>
            setAppearance((current) => ({ ...current, barWidth: Number(event.target.value) }))
          }
        />
      </label>
    </div>
  );
}

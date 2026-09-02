import type { ReactNode } from "react";

import { localizedText, useAppLocale } from "../../app/appLocale";

export const GRAPH_COLOR_PRESETS = [
  { color: "#111111", ja: "黒", en: "Black" },
  { color: "#245c8a", ja: "青", en: "Blue" },
  { color: "#c26532", ja: "オレンジ", en: "Orange" },
  { color: "#3e7c67", ja: "緑", en: "Green" },
  { color: "#735a8d", ja: "紫", en: "Purple" },
  { color: "#b42318", ja: "赤", en: "Red" },
  { color: "#6b7280", ja: "グレー", en: "Gray" },
] as const;

export function ExperimentGraphVisibilityControl({
  label,
  ariaLabel,
  checked,
  disabled = false,
  onChange,
}: Readonly<{
  label: ReactNode;
  ariaLabel?: string;
  checked: boolean;
  disabled?: boolean;
  onChange: (checked: boolean) => void;
}>) {
  return (
    <label className="experiment-graph-checkbox">
      <input
        type="checkbox"
        checked={checked}
        disabled={disabled}
        aria-label={ariaLabel ?? (typeof label === "string" ? label : undefined)}
        onChange={(event) => onChange(event.target.checked)}
      />
      <span>{label}</span>
    </label>
  );
}

export function ExperimentGraphRangeControl({
  label,
  ariaLabel,
  value,
  min,
  max,
  step,
  suffix = "",
  separator = ": ",
  formatValue = String,
  disabled = false,
  onChange,
}: Readonly<{
  label: string;
  ariaLabel: string;
  value: number;
  min: number;
  max: number;
  step: number;
  suffix?: string;
  separator?: string;
  formatValue?: (value: number) => string;
  disabled?: boolean;
  onChange: (value: number) => void;
}>) {
  return (
    <label className="experiment-graph-field">
      <span>
        {label}
        {separator}
        {formatValue(value)}
        {suffix}
      </span>
      <input
        type="range"
        min={min}
        max={max}
        step={step}
        value={value}
        disabled={disabled}
        aria-label={ariaLabel}
        onChange={(event) => onChange(Number(event.target.value))}
      />
    </label>
  );
}

export function ExperimentGraphColorControl({
  label,
  ariaLabel,
  value,
  showPresets = false,
  presetsAriaLabel,
  onChange,
}: Readonly<{
  label: string;
  ariaLabel: string;
  value: string;
  showPresets?: boolean;
  presetsAriaLabel?: string;
  onChange: (value: string) => void;
}>) {
  const locale = useAppLocale();
  const t = (ja: string, en: string) => localizedText(locale, ja, en);

  return (
    <div className="experiment-graph-custom-color">
      {showPresets ? (
        <div
          className="experiment-graph-color-presets"
          role="group"
          aria-label={presetsAriaLabel ?? t(`${label}のプリセット色`, `${label} preset colors`)}
        >
          {GRAPH_COLOR_PRESETS.map((preset) => {
            const presetLabel = t(preset.ja, preset.en);
            return (
              <button
                type="button"
                key={preset.color}
                className="experiment-graph-color-preset"
                style={{ backgroundColor: preset.color }}
                aria-label={t(`${presetLabel}を選択`, `Choose ${presetLabel}`)}
                aria-pressed={value.toLowerCase() === preset.color.toLowerCase()}
                onClick={() => onChange(preset.color)}
              />
            );
          })}
        </div>
      ) : null}
      <label className="experiment-graph-color-field">
        <span>{label}</span>
        <input
          type="color"
          aria-label={ariaLabel}
          value={value}
          onChange={(event) => onChange(event.target.value)}
        />
      </label>
    </div>
  );
}

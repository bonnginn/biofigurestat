import { useId, useState, type ChangeEventHandler, type RefObject } from "react";

import { localizedText, useAppLocale } from "../app/appLocale";
import "./LocalizedFileInput.css";

type LocalizedFileInputProps = Readonly<{
  accept: string;
  ariaLabel: string;
  className?: string;
  disabled?: boolean;
  inputRef?: RefObject<HTMLInputElement | null>;
  label: string;
  onChange: ChangeEventHandler<HTMLInputElement>;
}>;

/**
 * Hides the operating-system supplied file-input caption so the application
 * language remains consistent even when the OS language differs.
 */
export function LocalizedFileInput({
  accept,
  ariaLabel,
  className,
  disabled = false,
  inputRef,
  label,
  onChange,
}: LocalizedFileInputProps) {
  const locale = useAppLocale();
  const t = (ja: string, en: string) => localizedText(locale, ja, en);
  const generatedId = useId();
  const [selectedFileName, setSelectedFileName] = useState("");

  return (
    <div className={`localized-file-input${className ? ` ${className}` : ""}`}>
      <span className="localized-file-input__label">{label}</span>
      <label
        className={`localized-file-input__button${disabled ? " localized-file-input__button--disabled" : ""}`}
        htmlFor={generatedId}
      >
        {t("ファイルを選択", "Choose file")}
      </label>
      <input
        ref={inputRef}
        id={generatedId}
        className="localized-file-input__native"
        type="file"
        accept={accept}
        aria-label={ariaLabel}
        disabled={disabled}
        onChange={(event) => {
          setSelectedFileName(event.currentTarget.files?.[0]?.name ?? "");
          onChange(event);
        }}
      />
      <span className="localized-file-input__selection" aria-live="polite">
        {selectedFileName || t("ファイル未選択", "No file selected")}
      </span>
    </div>
  );
}

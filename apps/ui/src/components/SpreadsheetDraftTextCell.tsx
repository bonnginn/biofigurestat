import { useId, type InputHTMLAttributes } from "react";

import { moveSpreadsheetFocus } from "./spreadsheetGrid";
import { useSpreadsheetCellDraft } from "./useSpreadsheetCellDraft";

export type SpreadsheetDraftTextCellProps = Omit<
  InputHTMLAttributes<HTMLInputElement>,
  "defaultValue" | "onBlur" | "onChange" | "value"
> &
  Readonly<{
    canonicalText: string;
    wrapperClassName: string;
    preserveDirtyOnCanonicalChange?: boolean;
    onDraftChange?: (text: string) => void;
    onCommit: (text: string) => string | null;
  }>;

/** Shared identity/text-cell lifecycle. Scientific validation remains in the caller. */
export function SpreadsheetDraftTextCell({
  canonicalText,
  wrapperClassName,
  preserveDirtyOnCanonicalChange = false,
  onDraftChange,
  onCommit,
  onKeyDown,
  ...inputProps
}: SpreadsheetDraftTextCellProps) {
  const errorId = useId();
  const { text, dirty, error, edit, accept, reportError } = useSpreadsheetCellDraft(
    canonicalText,
    { preserveDirtyOnCanonicalChange },
  );
  const describedBy = [inputProps["aria-describedby"], error ? errorId : null]
    .filter(Boolean)
    .join(" ");

  const commit = (visibleText: string) => {
    if (!dirty && visibleText === canonicalText) return;
    const problem = onCommit(visibleText);
    if (problem) {
      reportError(problem);
      return;
    }
    accept(visibleText);
  };

  return (
    <div className={wrapperClassName}>
      <input
        {...inputProps}
        type="text"
        aria-describedby={describedBy || undefined}
        aria-invalid={error ? "true" : inputProps["aria-invalid"]}
        value={text}
        data-spreadsheet-cell="true"
        onChange={(event) => {
          const next = event.currentTarget.value;
          edit(next);
          onDraftChange?.(next);
        }}
        onKeyDown={(event) => {
          moveSpreadsheetFocus(event);
          onKeyDown?.(event);
        }}
        onBlur={(event) => commit(event.currentTarget.value)}
      />
      {error ? (
        <small id={errorId} role="alert">
          {error}
        </small>
      ) : null}
    </div>
  );
}

import { useId, type TextareaHTMLAttributes } from "react";

import { moveSpreadsheetFocus } from "./spreadsheetGrid";
import { useSpreadsheetCellDraft } from "./useSpreadsheetCellDraft";

export type SpreadsheetDraftTextareaCellProps = Omit<
  TextareaHTMLAttributes<HTMLTextAreaElement>,
  "defaultValue" | "onBlur" | "onChange" | "onPaste" | "value"
> &
  Readonly<{
    canonicalText: string;
    wrapperClassName: string;
    preserveDirtyOnCanonicalChange?: boolean;
    onCommit: (text: string) => string | null;
    onStructuredPaste: (text: string) => string | null;
  }>;

/** Shared multiline-value lifecycle. Parsing and scientific updates remain in the caller. */
export function SpreadsheetDraftTextareaCell({
  canonicalText,
  wrapperClassName,
  preserveDirtyOnCanonicalChange = false,
  onCommit,
  onStructuredPaste,
  onKeyDown,
  ...textareaProps
}: SpreadsheetDraftTextareaCellProps) {
  const errorId = useId();
  const { text, dirty, error, edit, accept, reportError, clearError } =
    useSpreadsheetCellDraft(canonicalText, { preserveDirtyOnCanonicalChange });
  const describedBy = [textareaProps["aria-describedby"], error ? errorId : null]
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
      <textarea
        {...textareaProps}
        aria-describedby={describedBy || undefined}
        aria-invalid={error ? "true" : textareaProps["aria-invalid"]}
        value={text}
        data-spreadsheet-cell="true"
        data-spreadsheet-dirty={dirty ? "true" : "false"}
        onChange={(event) => edit(event.currentTarget.value)}
        onKeyDown={(event) => {
          moveSpreadsheetFocus(event);
          onKeyDown?.(event);
        }}
        onBlur={(event) => commit(event.currentTarget.value)}
        onPaste={(event) => {
          const pasted = event.clipboardData.getData("text");
          if (!pasted.includes("\t") && !/[\r\n]/u.test(pasted)) return;
          event.preventDefault();
          const problem = onStructuredPaste(pasted);
          if (problem) reportError(problem);
          else {
            clearError();
            accept();
          }
        }}
      />
      {error ? (
        <small id={errorId} role="alert">
          {error}
        </small>
      ) : null}
    </div>
  );
}

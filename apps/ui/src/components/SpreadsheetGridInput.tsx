import type { InputHTMLAttributes } from "react";
import { moveSpreadsheetFocus } from "./spreadsheetGrid";

export type SpreadsheetGridInputProps = InputHTMLAttributes<HTMLInputElement> & {
  gridRow: number;
  gridColumn: number;
  baseClassName: string;
};

export function SpreadsheetGridInput({
  gridRow,
  gridColumn,
  baseClassName,
  className,
  onKeyDown,
  ...props
}: SpreadsheetGridInputProps) {
  return (
    <input
      {...props}
      className={`${baseClassName}${className ? ` ${className}` : ""}`}
      data-grid-input="true"
      data-grid-row={gridRow}
      data-grid-column={gridColumn}
      data-spreadsheet-arrow-navigation="cell"
      data-spreadsheet-cell="true"
      data-spreadsheet-row={gridRow}
      data-spreadsheet-column={gridColumn}
      onKeyDown={(event) => {
        moveSpreadsheetFocus(event);
        onKeyDown?.(event);
      }}
    />
  );
}

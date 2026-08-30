import type { InputHTMLAttributes, KeyboardEvent } from "react";

export type SpreadsheetGridInputProps = InputHTMLAttributes<HTMLInputElement> & {
  gridRow: number;
  gridColumn: number;
  baseClassName: string;
};

/** Shared legacy-grid keyboard navigation; scientific row/column meaning stays with each sheet. */
export function moveSpreadsheetGridFocus(event: KeyboardEvent<HTMLInputElement>): void {
  if (!["Enter", "ArrowLeft", "ArrowRight", "ArrowUp", "ArrowDown"].includes(event.key)) {
    return;
  }
  const grid = event.currentTarget.closest<HTMLElement>("[data-unit-grid]");
  if (!grid) return;
  const currentRow = Number(event.currentTarget.dataset.gridRow);
  const currentColumn = Number(event.currentTarget.dataset.gridColumn);
  if (!Number.isInteger(currentRow) || !Number.isInteger(currentColumn)) return;

  let nextRow = currentRow;
  let nextColumn = currentColumn;
  if (event.key === "Enter") nextRow += event.shiftKey ? -1 : 1;
  if (event.key === "ArrowLeft") nextColumn -= 1;
  if (event.key === "ArrowRight") nextColumn += 1;
  if (event.key === "ArrowUp") nextRow -= 1;
  if (event.key === "ArrowDown") nextRow += 1;
  const next = grid.querySelector<HTMLInputElement>(
    `[data-grid-row="${nextRow}"][data-grid-column="${nextColumn}"]`,
  );
  if (!next) return;
  event.preventDefault();
  next.focus();
  next.select();
}

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
      onKeyDown={(event) => {
        moveSpreadsheetGridFocus(event);
        onKeyDown?.(event);
      }}
    />
  );
}

import type { InputHTMLAttributes, KeyboardEvent } from "react";

export type SpreadsheetGridInputProps = InputHTMLAttributes<HTMLInputElement> & {
  gridRow: number;
  gridColumn: number;
  baseClassName: string;
};

function gridCoordinate(input: HTMLInputElement) {
  const row = Number(input.dataset.gridRow);
  const column = Number(input.dataset.gridColumn);
  return Number.isInteger(row) && Number.isInteger(column) ? { row, column } : null;
}

function focusGridInput(input: HTMLInputElement) {
  input.focus({ preventScroll: true });
  input.scrollIntoView?.({ block: "nearest", inline: "nearest" });
  input.select();
}

/** Shared legacy-grid keyboard navigation; scientific row/column meaning stays with each sheet. */
export function moveSpreadsheetGridFocus(event: KeyboardEvent<HTMLInputElement>): void {
  if (!["Tab", "Enter", "ArrowLeft", "ArrowRight", "ArrowUp", "ArrowDown"].includes(event.key)) {
    return;
  }
  const grid = event.currentTarget.closest<HTMLElement>("[data-unit-grid]");
  if (!grid) return;
  const currentCoordinate = gridCoordinate(event.currentTarget);
  if (!currentCoordinate) return;

  if (event.key === "Tab") {
    const inputs = [...grid.querySelectorAll<HTMLInputElement>('[data-grid-input="true"]')]
      .filter((input) => !input.disabled && gridCoordinate(input) !== null)
      .sort((left, right) => {
        const leftCoordinate = gridCoordinate(left)!;
        const rightCoordinate = gridCoordinate(right)!;
        return leftCoordinate.row - rightCoordinate.row || leftCoordinate.column - rightCoordinate.column;
      });
    const currentIndex = inputs.indexOf(event.currentTarget);
    const next = inputs[currentIndex + (event.shiftKey ? -1 : 1)];
    if (!next) return;
    event.preventDefault();
    focusGridInput(next);
    return;
  }

  let nextRow = currentCoordinate.row;
  let nextColumn = currentCoordinate.column;
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
  focusGridInput(next);
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

import type { KeyboardEvent } from "react";

export type ClipboardMatrix = readonly (readonly string[])[];

/** Preserve interior empty cells while removing only the clipboard's final empty line. */
export function parseClipboardMatrix(text: string): ClipboardMatrix {
  const normalized = text.replace(/\r\n?/gu, "\n");
  const withoutTerminalLine = normalized.endsWith("\n") ? normalized.slice(0, -1) : normalized;
  if (withoutTerminalLine === "") return [[""]];
  return withoutTerminalLine.split("\n").map((row) => row.split("\t"));
}

type SpreadsheetControl = HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement;

function controlsFor(control: SpreadsheetControl): SpreadsheetControl[] {
  return [
    ...(control
      .closest("table")
      ?.querySelectorAll<SpreadsheetControl>('[data-spreadsheet-cell="true"]:not(:disabled)') ??
      []),
  ];
}

function coordinate(control: SpreadsheetControl): { row: number; column: number } | null {
  const row = Number(control.dataset.spreadsheetRow);
  const column = Number(control.dataset.spreadsheetColumn);
  return Number.isInteger(row) && Number.isInteger(column) ? { row, column } : null;
}

function focusControl(control: SpreadsheetControl) {
  // Native focus may horizontally recenter a wide worksheet even when the
  // adjacent cell is already visible. Preserve the current viewport first,
  // then request only the minimum movement needed for an off-screen target.
  control.focus({ preventScroll: true });
  const scrollContainer = control.closest<HTMLElement>(
    ".adaptive-canonical-spreadsheet__table-wrap, .delimited-spreadsheet__scroll",
  );
  if (scrollContainer) {
    const cellRect = control.getBoundingClientRect();
    const containerRect = scrollContainer.getBoundingClientRect();
    if (cellRect.left < containerRect.left) {
      scrollContainer.scrollLeft -= containerRect.left - cellRect.left;
    } else if (cellRect.right > containerRect.right) {
      scrollContainer.scrollLeft += cellRect.right - containerRect.right;
    }
    if (cellRect.top < containerRect.top) {
      scrollContainer.scrollTop -= containerRect.top - cellRect.top;
    } else if (cellRect.bottom > containerRect.bottom) {
      scrollContainer.scrollTop += cellRect.bottom - containerRect.bottom;
    }
  } else {
    control.scrollIntoView?.({ block: "nearest", inline: "nearest" });
  }
  if (control instanceof HTMLInputElement) control.select();
}

function restoreFocusAfterCommit(
  table: HTMLTableElement | null,
  targetCoordinate: { row: number; column: number },
) {
  if (!table) return;
  queueMicrotask(() => {
    const active = document.activeElement;
    if (
      active instanceof HTMLInputElement ||
      active instanceof HTMLTextAreaElement ||
      active instanceof HTMLSelectElement
    ) {
      const activeCoordinate = coordinate(active);
      if (
        activeCoordinate?.row === targetCoordinate.row &&
        activeCoordinate.column === targetCoordinate.column
      )
        return;
      if (table.contains(active)) return;
    }
    const replacement = table.querySelector<SpreadsheetControl>(
      `[data-spreadsheet-cell="true"][data-spreadsheet-row="${targetCoordinate.row}"][data-spreadsheet-column="${targetCoordinate.column}"]:not(:disabled)`,
    );
    if (replacement) focusControl(replacement);
  });
}

/**
 * Excel-like movement for editable cells. Read-only table columns are skipped.
 * Returning false leaves native focus movement in place at the edge of a grid.
 */
export function moveSpreadsheetFocus(event: KeyboardEvent<SpreadsheetControl>): boolean {
  if (event.altKey || event.ctrlKey || event.metaKey) return false;
  const current = event.currentTarget;
  const currentCoordinate = coordinate(current);
  if (!currentCoordinate) return false;
  const controls = controlsFor(current);
  const currentIndex = controls.indexOf(current);
  let target: SpreadsheetControl | undefined;

  if (event.key === "Tab") {
    target = controls[currentIndex + (event.shiftKey ? -1 : 1)];
  } else if (event.key === "ArrowLeft" || event.key === "ArrowRight") {
    if (current instanceof HTMLSelectElement) return false;
    const selectionStart = current.selectionStart;
    const selectionEnd = current.selectionEnd;
    const supportsCaretNavigation = selectionStart !== null && selectionEnd !== null;
    if (
      supportsCaretNavigation &&
      (selectionStart !== selectionEnd ||
        (event.key === "ArrowLeft" && selectionStart > 0) ||
        (event.key === "ArrowRight" && selectionEnd < current.value.length))
    ) {
      return false;
    }
    const direction = event.key === "ArrowLeft" ? -1 : 1;
    target = controls
      .filter((candidate) => coordinate(candidate)?.row === currentCoordinate.row)
      .filter((candidate) => {
        const candidateColumn = coordinate(candidate)!.column;
        return direction < 0
          ? candidateColumn < currentCoordinate.column
          : candidateColumn > currentCoordinate.column;
      })
      .sort((left, right) =>
        direction < 0
          ? coordinate(right)!.column - coordinate(left)!.column
          : coordinate(left)!.column - coordinate(right)!.column,
      )[0];
  } else if (event.key === "ArrowUp" || event.key === "ArrowDown" || event.key === "Enter") {
    const direction = event.key === "ArrowUp" || (event.key === "Enter" && event.shiftKey) ? -1 : 1;
    const currentRowControls = controls
      .filter((candidate) => coordinate(candidate)?.row === currentCoordinate.row)
      .sort((left, right) => coordinate(left)!.column - coordinate(right)!.column);
    const wrapEnter =
      event.key === "Enter" &&
      (event.shiftKey
        ? current === currentRowControls[0]
        : current === currentRowControls[currentRowControls.length - 1]);
    const candidateRows = [
      ...new Set(
        controls
          .map((candidate) => coordinate(candidate)!.row)
          .filter((row) =>
            direction < 0 ? row < currentCoordinate.row : row > currentCoordinate.row,
          ),
      ),
    ].sort((left, right) => (direction < 0 ? right - left : left - right));
    for (const row of candidateRows) {
      const rowControls = controls
        .filter((candidate) => coordinate(candidate)!.row === row)
        .sort((left, right) => coordinate(left)!.column - coordinate(right)!.column);
      target = wrapEnter
        ? event.shiftKey
          ? rowControls.at(-1)
          : rowControls[0]
        : (rowControls.find(
            (candidate) => coordinate(candidate)!.column === currentCoordinate.column,
          ) ??
          rowControls.sort(
            (left, right) =>
              Math.abs(coordinate(left)!.column - currentCoordinate.column) -
              Math.abs(coordinate(right)!.column - currentCoordinate.column),
          )[0]);
      if (target) break;
    }
  }

  if (!target) return false;
  event.preventDefault();
  const targetCoordinate = coordinate(target);
  const table = current.closest("table");
  focusControl(target);
  if (targetCoordinate) restoreFocusAfterCommit(table, targetCoordinate);
  return true;
}

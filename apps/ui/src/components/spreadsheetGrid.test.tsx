import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";

import { moveSpreadsheetFocus, parseClipboardMatrix } from "./spreadsheetGrid";

function Grid() {
  return (
    <table>
      <tbody>
        {[0, 1].map((row) => (
          <tr key={row}>
            {[0, 2].map((column) => (
              <td key={column}>
                <input
                  aria-label={`${row}:${column}`}
                  data-spreadsheet-cell="true"
                  data-spreadsheet-column={column}
                  data-spreadsheet-row={row}
                  onKeyDown={moveSpreadsheetFocus}
                />
              </td>
            ))}
          </tr>
        ))}
      </tbody>
    </table>
  );
}

function MixedControlGrid() {
  return (
    <table>
      <tbody>
        <tr>
          <td>
            <input
              aria-label="date-cell"
              type="date"
              defaultValue="2026-08-28"
              data-spreadsheet-cell="true"
              data-spreadsheet-column={0}
              data-spreadsheet-row={0}
              onKeyDown={moveSpreadsheetFocus}
            />
          </td>
          <td>
            <input
              aria-label="text-cell"
              defaultValue="Response"
              data-spreadsheet-cell="true"
              data-spreadsheet-column={1}
              data-spreadsheet-row={0}
              onKeyDown={moveSpreadsheetFocus}
            />
          </td>
        </tr>
      </tbody>
    </table>
  );
}

function ScrollableGrid() {
  return (
    <div className="delimited-spreadsheet__scroll" data-testid="scroll-container">
      <Grid />
    </div>
  );
}

describe("spreadsheet grid interaction", () => {
  it("preserves rectangular cells and interior blanks from clipboard text", () => {
    expect(parseClipboardMatrix("1\t\n3\t4\n")).toEqual([
      ["1", ""],
      ["3", "4"],
    ]);
  });

  it("moves with arrows, Enter, Shift+Enter, and Tab while skipping read-only gaps", () => {
    render(<Grid />);
    const first = screen.getByRole("textbox", { name: "0:0" });
    first.focus();
    fireEvent.keyDown(first, { key: "ArrowRight" });
    expect(screen.getByRole("textbox", { name: "0:2" })).toHaveFocus();
    fireEvent.keyDown(document.activeElement!, { key: "Enter" });
    expect(screen.getByRole("textbox", { name: "1:2" })).toHaveFocus();
    fireEvent.keyDown(document.activeElement!, { key: "Enter", shiftKey: true });
    expect(screen.getByRole("textbox", { name: "0:2" })).toHaveFocus();
    fireEvent.keyDown(document.activeElement!, { key: "Tab" });
    expect(screen.getByRole("textbox", { name: "1:0" })).toHaveFocus();
  });

  it("wraps Enter only after continuous left-to-right entry", () => {
    render(<Grid />);
    const firstRowLeft = screen.getByRole("textbox", { name: "0:0" });
    const firstRowRight = screen.getByRole("textbox", { name: "0:2" });
    const nextRowLeft = screen.getByRole("textbox", { name: "1:0" });
    const nextRowRight = screen.getByRole("textbox", { name: "1:2" });

    firstRowLeft.focus();
    fireEvent.keyDown(firstRowLeft, { key: "Tab" });
    expect(firstRowRight).toHaveFocus();
    fireEvent.keyDown(firstRowRight, { key: "Enter" });
    expect(nextRowLeft).toHaveFocus();

    fireEvent.pointerDown(firstRowRight);
    firstRowRight.focus();
    fireEvent.keyDown(firstRowRight, { key: "Enter" });
    expect(nextRowRight).toHaveFocus();
  });

  it("moves focus without changing the worksheet scroll position", () => {
    render(<Grid />);
    const first = screen.getByRole("textbox", { name: "0:0" });
    const next = screen.getByRole("textbox", { name: "0:2" });
    const focus = vi.spyOn(next, "focus");
    const scrollIntoView = vi.fn();
    next.scrollIntoView = scrollIntoView;

    first.focus();
    fireEvent.keyDown(first, { key: "Tab" });

    expect(focus).toHaveBeenCalledWith({ preventScroll: true });
    expect(scrollIntoView).toHaveBeenCalledWith({ block: "nearest", inline: "nearest" });
    expect(next).toHaveFocus();
  });

  it("does not invoke page-level scrolling for an adjacent visible worksheet cell", () => {
    render(<ScrollableGrid />);
    const container = screen.getByTestId("scroll-container");
    const first = screen.getByRole("textbox", { name: "0:0" });
    const next = screen.getByRole("textbox", { name: "0:2" });
    const scrollIntoView = vi.fn();
    next.scrollIntoView = scrollIntoView;
    vi.spyOn(container, "getBoundingClientRect").mockReturnValue({
      left: 0,
      right: 400,
      top: 0,
      bottom: 200,
      width: 400,
      height: 200,
      x: 0,
      y: 0,
      toJSON: () => ({}),
    });
    vi.spyOn(next, "getBoundingClientRect").mockReturnValue({
      left: 120,
      right: 220,
      top: 20,
      bottom: 60,
      width: 100,
      height: 40,
      x: 120,
      y: 20,
      toJSON: () => ({}),
    });

    first.focus();
    fireEvent.keyDown(first, { key: "Tab" });

    expect(scrollIntoView).not.toHaveBeenCalled();
    expect(container.scrollLeft).toBe(0);
    expect(next).toHaveFocus();
  });

  it("uses horizontal arrows for date-like cells without a caret API", () => {
    render(<MixedControlGrid />);
    const date = screen.getByLabelText("date-cell") as HTMLInputElement;
    const text = screen.getByRole("textbox", { name: "text-cell" }) as HTMLInputElement;
    expect(date.selectionStart).toBeNull();

    date.focus();
    fireEvent.keyDown(date, { key: "ArrowRight" });
    expect(text).toHaveFocus();
  });

  it("keeps horizontal arrows native inside text and moves only at a caret boundary", () => {
    render(<MixedControlGrid />);
    const date = screen.getByLabelText("date-cell") as HTMLInputElement;
    const text = screen.getByRole("textbox", { name: "text-cell" }) as HTMLInputElement;

    text.focus();
    text.setSelectionRange(3, 3);
    fireEvent.keyDown(text, { key: "ArrowLeft" });
    expect(text).toHaveFocus();

    text.setSelectionRange(0, 0);
    fireEvent.keyDown(text, { key: "ArrowLeft" });
    expect(date).toHaveFocus();
  });
});

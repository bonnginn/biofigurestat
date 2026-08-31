import { fireEvent, render, screen } from "@testing-library/react";
import type { KeyboardEventHandler } from "react";
import { describe, expect, it, vi } from "vitest";
import { SpreadsheetGridInput } from "./SpreadsheetGridInput";

function TestGrid({ onKeyDown }: { onKeyDown?: KeyboardEventHandler<HTMLInputElement> }) {
  return (
    <div data-unit-grid="true">
      <SpreadsheetGridInput
        aria-label="row 1 value"
        baseClassName="cell"
        gridRow={0}
        gridColumn={1}
        onKeyDown={onKeyDown}
      />
      <SpreadsheetGridInput
        aria-label="row 1 note"
        baseClassName="cell"
        gridRow={0}
        gridColumn={2}
      />
      <SpreadsheetGridInput
        aria-label="row 2 date"
        baseClassName="cell"
        gridRow={1}
        gridColumn={0}
      />
      <SpreadsheetGridInput
        aria-label="row 2 value"
        baseClassName="cell"
        gridRow={1}
        gridColumn={1}
      />
    </div>
  );
}

describe("SpreadsheetGridInput", () => {
  it("moves Tab through editable cells in row-major order", () => {
    render(<TestGrid />);
    const first = screen.getByRole("textbox", { name: "row 1 value" });
    const second = screen.getByRole("textbox", { name: "row 1 note" });
    const third = screen.getByRole("textbox", { name: "row 2 date" });

    first.focus();
    fireEvent.keyDown(first, { key: "Tab" });
    expect(second).toHaveFocus();

    fireEvent.keyDown(second, { key: "Tab" });
    expect(third).toHaveFocus();
  });

  it("moves Shift+Tab backward and leaves the grid edge to native focus handling", () => {
    render(<TestGrid />);
    const first = screen.getByRole("textbox", { name: "row 1 value" });
    const second = screen.getByRole("textbox", { name: "row 1 note" });

    second.focus();
    fireEvent.keyDown(second, { key: "Tab", shiftKey: true });
    expect(first).toHaveFocus();

    const edgeEvent = new KeyboardEvent("keydown", { key: "Tab", shiftKey: true, cancelable: true });
    first.dispatchEvent(edgeEvent);
    expect(edgeEvent.defaultPrevented).toBe(false);
  });

  it("keeps Enter column navigation and composes the caller handler", () => {
    const onKeyDown = vi.fn();
    render(<TestGrid onKeyDown={onKeyDown} />);
    const first = screen.getByRole("textbox", { name: "row 1 value" });
    const target = screen.getByRole("textbox", { name: "row 2 value" });

    first.focus();
    fireEvent.keyDown(first, { key: "Enter" });

    expect(target).toHaveFocus();
    expect(onKeyDown).toHaveBeenCalledOnce();
  });
});

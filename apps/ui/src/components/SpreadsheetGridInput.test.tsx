import { fireEvent, render, screen } from "@testing-library/react";
import type { KeyboardEventHandler } from "react";
import { describe, expect, it, vi } from "vitest";
import { SpreadsheetGridInput } from "./SpreadsheetGridInput";

function TestGrid({
  onKeyDown,
  scrollable = false,
}: {
  onKeyDown?: KeyboardEventHandler<HTMLInputElement>;
  scrollable?: boolean;
}) {
  return (
    <div
      className={scrollable ? "multi-sheet-grid-scroll" : undefined}
      data-testid={scrollable ? "scroll-container" : undefined}
      data-unit-grid="true"
    >
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

  it("does not recenter an adjacent visible cell in a scrollable legacy grid", () => {
    render(<TestGrid scrollable />);
    const container = screen.getByTestId("scroll-container");
    const first = screen.getByRole("textbox", { name: "row 1 value" });
    const next = screen.getByRole("textbox", { name: "row 1 note" });
    const scrollIntoView = vi.fn();
    next.scrollIntoView = scrollIntoView;
    vi.spyOn(container, "getBoundingClientRect").mockReturnValue({
      left: 0,
      right: 500,
      top: 0,
      bottom: 300,
      width: 500,
      height: 300,
      x: 0,
      y: 0,
      toJSON: () => ({}),
    });
    vi.spyOn(next, "getBoundingClientRect").mockReturnValue({
      left: 120,
      right: 240,
      top: 30,
      bottom: 70,
      width: 120,
      height: 40,
      x: 120,
      y: 30,
      toJSON: () => ({}),
    });

    first.focus();
    fireEvent.keyDown(first, { key: "Tab" });

    expect(scrollIntoView).not.toHaveBeenCalled();
    expect(container.scrollLeft).toBe(0);
    expect(container.scrollTop).toBe(0);
    expect(next).toHaveFocus();
  });
});

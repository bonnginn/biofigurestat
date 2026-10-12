import { fireEvent, render, screen } from "@testing-library/react";
import { expect, it, vi } from "vitest";
import { SpreadsheetDraftTextCell } from "./SpreadsheetDraftTextCell";
it("keeps rejected text but displays canonical after normalization to an unchanged ID", () => {
  const commit = vi.fn((text: string) => (text.trim() === "A" ? null : "duplicate"));
  render(
    <SpreadsheetDraftTextCell
      wrapperClassName="cell"
      canonicalText="A"
      aria-label="ID"
      onCommit={commit}
    />,
  );
  const cell = screen.getByRole("textbox", { name: "ID" });
  fireEvent.change(cell, { target: { value: " A " } });
  fireEvent.blur(cell);
  expect(commit).toHaveBeenCalledWith(" A ");
  expect(cell).toHaveValue("A");
  fireEvent.change(cell, { target: { value: "B" } });
  fireEvent.blur(cell);
  expect(cell).toHaveValue("B");
  expect(cell).toHaveAttribute("aria-invalid", "true");
});
it("resets an existing ID draft when its authoritative value is replaced", () => {
  const commit = vi.fn(() => null);
  const { rerender } = render(
    <SpreadsheetDraftTextCell
      wrapperClassName="cell"
      canonicalText="A"
      aria-label="ID"
      onCommit={commit}
    />,
  );
  const cell = screen.getByRole("textbox", { name: "ID" });
  fireEvent.change(cell, { target: { value: "uncommitted" } });
  rerender(
    <SpreadsheetDraftTextCell
      wrapperClassName="cell"
      canonicalText="restored"
      aria-label="ID"
      onCommit={commit}
    />,
  );
  expect(cell).toHaveValue("restored");
  fireEvent.blur(cell);
  expect(commit).not.toHaveBeenCalled();
});

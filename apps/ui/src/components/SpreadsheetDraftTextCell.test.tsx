import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";

import { SpreadsheetDraftTextCell } from "./SpreadsheetDraftTextCell";

describe("SpreadsheetDraftTextCell", () => {
  it("retains invalid identity text and commits a corrected value through one lifecycle", () => {
    const onCommit = vi
      .fn<(text: string) => string | null>()
      .mockReturnValueOnce("Use a unique ID")
      .mockReturnValueOnce(null);
    render(
      <SpreadsheetDraftTextCell
        aria-label="Sample ID"
        aria-describedby="sample-id-help"
        canonicalText="S01"
        wrapperClassName="cell"
        data-spreadsheet-row={0}
        data-spreadsheet-column={0}
        onCommit={onCommit}
      />,
    );

    const input = screen.getByRole("textbox", { name: "Sample ID" });
    fireEvent.change(input, { target: { value: "duplicate" } });
    fireEvent.blur(input);
    expect(input).toHaveValue("duplicate");
    expect(input).toHaveAttribute("aria-invalid", "true");
    expect(input.getAttribute("aria-describedby")).toContain("sample-id-help");
    expect(screen.getByRole("alert")).toHaveTextContent("Use a unique ID");

    fireEvent.change(input, { target: { value: "S02" } });
    fireEvent.blur(input);
    expect(onCommit).toHaveBeenLastCalledWith("S02");
    expect(screen.queryByRole("alert")).not.toBeInTheDocument();
  });
});

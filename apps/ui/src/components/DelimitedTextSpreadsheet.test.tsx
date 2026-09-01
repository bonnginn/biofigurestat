// @vitest-environment jsdom

import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { useState } from "react";
import { beforeEach, describe, expect, it, vi } from "vitest";

import { DelimitedTextSpreadsheet } from "./DelimitedTextSpreadsheet";

describe("DelimitedTextSpreadsheet", () => {
  beforeEach(() => {
    window.localStorage.removeItem("lsaa.delimited-spreadsheet.zoom.v1");
  });

  it("undoes and redoes ordered-curve cell edits through the shared spreadsheet history", () => {
    function Harness() {
      const [value, setValue] = useState("Unit ID\tSeries\tX\tY\nr1\tA\t0\t0.5");
      return (
        <DelimitedTextSpreadsheet
          ariaLabel="Curve sheet"
          value={value}
          onChange={(next) => setValue(next)}
        />
      );
    }
    render(<Harness />);
    const yCell = screen.getByLabelText("Curve sheet 行2 列4");

    fireEvent.change(yCell, { target: { value: "0.75" } });
    expect(yCell).toHaveValue("0.75");
    expect(fireEvent.keyDown(yCell, { key: "z", ctrlKey: true })).toBe(false);
    expect(yCell).toHaveValue("0.5");
    expect(fireEvent.keyDown(yCell, { key: "y", ctrlKey: true })).toBe(false);
    expect(yCell).toHaveValue("0.75");
  });

  it("edits a cell while retaining the delimited table", () => {
    const onChange = vi.fn();
    render(
      <DelimitedTextSpreadsheet
        ariaLabel="Survival sheet"
        value={"Unit ID\tGroup\tTime\tStatus\nm1\tControl\t4\tEvent"}
        onChange={onChange}
      />,
    );
    fireEvent.change(screen.getByLabelText("Survival sheet 行2 列3"), {
      target: { value: "5" },
    });
    expect(onChange).toHaveBeenCalledWith(
      "Unit ID\tGroup\tTime\tStatus\nm1\tControl\t5\tEvent",
      "cell_edit",
    );
  });

  it("uses a constrained Event/Censored status cell while retaining spreadsheet navigation", () => {
    const onChange = vi.fn();
    render(
      <DelimitedTextSpreadsheet
        ariaLabel="Survival sheet"
        value={"Unit ID\tGroup\tTime\tStatus\nm1\tControl\t4\tEvent"}
        onChange={onChange}
        columnOptions={{ 3: ["Event", "Censored"] }}
      />,
    );

    const status = screen.getByLabelText("Survival sheet 行2 列4");
    expect(status).toHaveRole("combobox");
    fireEvent.change(status, { target: { value: "Censored" } });
    expect(onChange).toHaveBeenCalledWith(
      "Unit ID\tGroup\tTime\tStatus\nm1\tControl\t4\tCensored",
      "cell_edit",
    );
    status.focus();
    fireEvent.keyDown(status, { key: "Tab", shiftKey: true });
    expect(screen.getByLabelText("Survival sheet 行2 列3")).toHaveFocus();
  });

  it("pastes a rectangular Excel range including empty cells", () => {
    const onChange = vi.fn();
    render(
      <DelimitedTextSpreadsheet
        ariaLabel="Curve sheet"
        value={"Unit ID\tSeries\tX\tY"}
        onChange={onChange}
      />,
    );
    fireEvent.paste(screen.getByLabelText("Curve sheet 行2 列1"), {
      clipboardData: { getData: () => "r1\tA\t0\t\nr1\tA\t1\t0.5" },
    });
    expect(onChange).toHaveBeenCalledWith(
      "Unit ID\tSeries\tX\tY\nr1\tA\t0\t\nr1\tA\t1\t0.5",
      "clipboard",
    );
    expect(onChange).toHaveBeenCalledTimes(1);
  });

  it("can replace a starter template when a complete table is pasted at the origin", () => {
    const onChange = vi.fn();
    render(
      <DelimitedTextSpreadsheet
        ariaLabel="Graph sheet"
        value={"X / condition\tY / value\tGroup (optional)\tID (optional)"}
        onChange={onChange}
        replaceOnPasteAtOrigin
        testIdPrefix="graph"
      />,
    );

    fireEvent.paste(screen.getByTestId("graph-cell-0-0"), {
      clipboardData: { getData: () => "Condition\tValue\nControl\t10" },
    });

    expect(onChange).toHaveBeenCalledOnce();
    expect(onChange).toHaveBeenCalledWith("Condition\tValue\nControl\t10", "clipboard");
  });

  it("selects a heading cell on click so typing replaces the starter label", () => {
    render(
      <DelimitedTextSpreadsheet
        ariaLabel="Graph sheet"
        value={"X / condition\tY / value"}
        onChange={vi.fn()}
      />,
    );

    const heading = screen.getByLabelText("Graph sheet 行1 列1") as HTMLInputElement;
    fireEvent.click(heading);

    expect(heading.selectionStart).toBe(0);
    expect(heading.selectionEnd).toBe(heading.value.length);
  });

  it("moves through the rectangular sheet with arrows, Enter, Shift+Enter, and Tab", () => {
    render(
      <DelimitedTextSpreadsheet
        ariaLabel="Curve sheet"
        value={"Unit ID\tSeries\tX\tY\nr1\tA\t0\t0.5"}
        onChange={vi.fn()}
      />,
    );
    const first = screen.getByLabelText("Curve sheet 行1 列1");
    first.focus();
    (first as HTMLInputElement).setSelectionRange(
      (first as HTMLInputElement).value.length,
      (first as HTMLInputElement).value.length,
    );
    fireEvent.keyDown(first, { key: "ArrowRight" });
    expect(screen.getByLabelText("Curve sheet 行1 列2")).toHaveFocus();
    fireEvent.keyDown(document.activeElement!, { key: "Enter" });
    expect(screen.getByLabelText("Curve sheet 行2 列2")).toHaveFocus();
    fireEvent.keyDown(document.activeElement!, { key: "Enter", shiftKey: true });
    expect(screen.getByLabelText("Curve sheet 行1 列2")).toHaveFocus();
    fireEvent.keyDown(document.activeElement!, { key: "Tab" });
    expect(screen.getByLabelText("Curve sheet 行1 列3")).toHaveFocus();
  });

  it("zooms the table in 10% steps within 70–130% without changing data", () => {
    const onChange = vi.fn();
    render(
      <DelimitedTextSpreadsheet
        ariaLabel="Survival sheet"
        value={"Unit ID\tGroup\tTime\tStatus\nm1\tControl\t4\tEvent"}
        onChange={onChange}
      />,
    );

    const table = screen.getByRole("table");
    const decrease = screen.getByRole("button", { name: "シートを縮小" });
    const increase = screen.getByRole("button", { name: "シートを拡大" });
    expect(screen.getByText("100%")).toBeInTheDocument();
    expect(table).toHaveStyle("--delimited-sheet-zoom: 1");

    fireEvent.click(decrease);
    expect(screen.getByText("90%")).toBeInTheDocument();
    expect(table).toHaveStyle("--delimited-sheet-zoom: 0.9");
    fireEvent.click(decrease);
    fireEvent.click(decrease);
    expect(screen.getByText("70%")).toBeInTheDocument();
    expect(decrease).toBeDisabled();

    for (let index = 0; index < 6; index += 1) fireEvent.click(increase);
    expect(screen.getByText("130%")).toBeInTheDocument();
    expect(increase).toBeDisabled();
    expect(screen.getByLabelText("Survival sheet 行2 列3")).toHaveValue("4");
    expect(onChange).not.toHaveBeenCalled();
  });

  it("restores the shared spreadsheet zoom preference without changing paste or edit output", () => {
    window.localStorage.setItem("lsaa.delimited-spreadsheet.zoom.v1", "120");
    const onChange = vi.fn();
    const { unmount } = render(
      <DelimitedTextSpreadsheet
        ariaLabel="Curve sheet"
        value={"Unit ID\tSeries\tX\tY"}
        onChange={onChange}
      />,
    );
    expect(screen.getByText("120%")).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "シートを拡大" }));
    expect(window.localStorage.getItem("lsaa.delimited-spreadsheet.zoom.v1")).toBe("130");
    unmount();

    render(
      <DelimitedTextSpreadsheet
        ariaLabel="Curve sheet"
        value={"Unit ID\tSeries\tX\tY"}
        onChange={onChange}
      />,
    );
    expect(screen.getByText("130%")).toBeInTheDocument();
    fireEvent.paste(screen.getByLabelText("Curve sheet 行2 列1"), {
      clipboardData: { getData: () => "r1\tA\t0\t\nr1\tA\t1\t0.5" },
    });
    expect(onChange).toHaveBeenLastCalledWith(
      "Unit ID\tSeries\tX\tY\nr1\tA\t0\t\nr1\tA\t1\t0.5",
      "clipboard",
    );
    fireEvent.change(screen.getByLabelText("Curve sheet 行1 列4"), {
      target: { value: "Response" },
    });
    expect(onChange).toHaveBeenLastCalledWith("Unit ID\tSeries\tX\tResponse", "cell_edit");
  });

  it("imports XLS/XLSX worksheets into the same authoritative grid and lets the user switch sheets", async () => {
    const onChange = vi.fn();
    const workbookImporter = vi.fn(async () => ({
      fileName: "experiment.xlsx",
      sheets: [
        {
          name: "Summary",
          rows: [
            ["Condition", "Value"],
            ["Control", "1.2"],
          ],
          formulaCellCount: 1,
        },
        {
          name: "Raw",
          rows: [
            ["ID", "Value"],
            ["cell-1", "4.5"],
          ],
        },
      ],
    }));
    render(
      <DelimitedTextSpreadsheet
        ariaLabel="Graph sheet"
        value={"X\tY"}
        onChange={onChange}
        workbookImporter={workbookImporter}
      />,
    );

    fireEvent.click(screen.getByRole("button", { name: "XLS / XLSXを直接読み込む" }));
    await waitFor(() => expect(workbookImporter).toHaveBeenCalledOnce());
    expect(onChange).toHaveBeenCalledWith("Condition\tValue\nControl\t1.2", "workbook_import");
    expect(screen.getByRole("status")).toHaveTextContent("experiment.xlsx / Summary");
    expect(screen.getByRole("note")).toHaveTextContent("数式セル 1件");

    fireEvent.change(screen.getByRole("combobox", { name: "読み込むworksheet" }), {
      target: { value: "1" },
    });
    expect(onChange).toHaveBeenLastCalledWith("ID\tValue\ncell-1\t4.5", "workbook_import");
  });

  it("explicitly stacks matching worksheets as Exp while retaining worksheet provenance", async () => {
    const onChange = vi.fn();
    const workbookImporter = vi.fn(async () => ({
      fileName: "three-runs.xlsx",
      sheets: [
        {
          name: "Exp 1",
          rows: [
            ["Condition", "Value"],
            ["Control", "1.2"],
          ],
        },
        {
          name: "Exp 2",
          rows: [
            ["Condition", "Value"],
            ["Control", "1.4"],
          ],
        },
        {
          name: "Exp 3",
          rows: [
            ["Condition", "Value"],
            ["Drug", "2.1"],
          ],
        },
      ],
    }));
    render(
      <DelimitedTextSpreadsheet
        ariaLabel="Graph sheet"
        value={"X\tY"}
        onChange={onChange}
        workbookImporter={workbookImporter}
        allowWorkbookSheetStacking
      />,
    );

    fireEvent.click(screen.getByRole("button", { name: "XLS / XLSXを直接読み込む" }));
    await waitFor(() => expect(workbookImporter).toHaveBeenCalledOnce());
    fireEvent.click(screen.getByRole("button", { name: "全worksheetをExpとしてまとめる" }));

    expect(onChange).toHaveBeenLastCalledWith(
      [
        "Experiment / worksheet\tCondition\tValue",
        "Exp 1\tControl\t1.2",
        "Exp 2\tControl\t1.4",
        "Exp 3\tDrug\t2.1",
      ].join("\n"),
      "workbook_import",
    );
    expect(screen.getByRole("note")).toHaveTextContent("統計的なnであることは自動判定しません");
  });

  it("imports a selected A1 range and flattens two header rows", async () => {
    const onChange = vi.fn();
    const workbookImporter = vi.fn(async () => ({
      fileName: "layout.xlsx",
      sheets: [
        {
          name: "Plate export",
          rows: [
            ["notes", "Metadata", "", "Treatment", ""],
            ["ignore", "Sample ID", "Date", "Vehicle", "Drug A"],
            ["outside", "S01", "2026-09-01", "1.0", "1.5"],
            ["outside", "S02", "2026-09-02", "1.1", "1.6"],
          ],
        },
      ],
    }));
    render(
      <DelimitedTextSpreadsheet
        ariaLabel="Graph sheet"
        value={"X\tY"}
        onChange={onChange}
        workbookImporter={workbookImporter}
      />,
    );

    fireEvent.click(screen.getByRole("button", { name: "XLS / XLSXを直接読み込む" }));
    await waitFor(() => expect(workbookImporter).toHaveBeenCalledOnce());
    fireEvent.change(screen.getByLabelText("読み込む表範囲"), {
      target: { value: "B1:E4" },
    });
    fireEvent.change(screen.getByLabelText("見出し行の数"), { target: { value: "2" } });
    fireEvent.click(screen.getByRole("button", { name: "この範囲を読み込む" }));

    expect(onChange).toHaveBeenLastCalledWith(
      [
        "Metadata / Sample ID\tMetadata / Date\tTreatment / Vehicle\tTreatment / Drug A",
        "S01\t2026-09-01\t1.0\t1.5",
        "S02\t2026-09-02\t1.1\t1.6",
      ].join("\n"),
      "workbook_import",
    );
  });

  it("shows multi-file provenance without treating file count as statistical n", async () => {
    const workbookImporter = vi.fn(async () => ({
      fileName: "run-1.xlsx +1",
      sourceFiles: ["run-1.xlsx", "run-2.xlsx"],
      sheets: [
        { name: "run-1.xlsx / Data", rows: [["ID", "Value"], ["S01", "1"]] },
        { name: "run-2.xlsx / Data", rows: [["ID", "Value"], ["S02", "2"]] },
      ],
    }));
    render(
      <DelimitedTextSpreadsheet
        ariaLabel="Graph sheet"
        value={"X\tY"}
        onChange={vi.fn()}
        workbookImporter={workbookImporter}
        allowWorkbookSheetStacking
      />,
    );

    fireEvent.click(screen.getByRole("button", { name: "XLS / XLSXを直接読み込む" }));
    await waitFor(() => expect(workbookImporter).toHaveBeenCalledOnce());

    expect(screen.getByRole("status")).toHaveTextContent("2ファイル");
    expect(screen.getByText(/ファイル数を統計上のnとはみなしません/)).toBeVisible();
    expect(screen.getByRole("option", { name: "run-2.xlsx / Data" })).toBeVisible();
  });

  it("keeps the existing grid when workbook selection is cancelled or fails", async () => {
    const onChange = vi.fn();
    const workbookImporter = vi
      .fn<() => Promise<null>>()
      .mockResolvedValueOnce(null)
      .mockRejectedValueOnce(new Error("Workbook is encrypted"));
    render(
      <DelimitedTextSpreadsheet
        ariaLabel="Graph sheet"
        value={"X\tY"}
        onChange={onChange}
        workbookImporter={workbookImporter}
      />,
    );

    const button = screen.getByRole("button", { name: "XLS / XLSXを直接読み込む" });
    fireEvent.click(button);
    await waitFor(() => expect(workbookImporter).toHaveBeenCalledTimes(1));
    expect(onChange).not.toHaveBeenCalled();

    fireEvent.click(button);
    expect(await screen.findByRole("alert")).toHaveTextContent("Workbook is encrypted");
    expect(onChange).not.toHaveBeenCalled();
  });
});

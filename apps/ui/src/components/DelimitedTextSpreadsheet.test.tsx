// @vitest-environment jsdom

import { act, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";

import { DelimitedTextSpreadsheet } from "./DelimitedTextSpreadsheet";

describe("DelimitedTextSpreadsheet", () => {
  it("reports a failed workbook read without losing edits made during reading", async () => {
    let reject!: (reason: Error) => void;
    const importer = vi.fn(
      () =>
        new Promise<null>((_resolve, fail) => {
          reject = fail;
        }),
    );
    const onChange = vi.fn();
    render(
      <DelimitedTextSpreadsheet
        ariaLabel="Graph sheet"
        value={"X\tY\nnew\t10"}
        onChange={onChange}
        workbookImporter={importer}
      />,
    );
    const button = screen.getByRole("button", { name: "XLS / XLSXを直接読み込む" });
    fireEvent.click(button);
    fireEvent.change(screen.getByLabelText("Graph sheet 行2 列2"), { target: { value: "99" } });
    await act(async () => reject(new Error("synthetic read failure")));
    expect(onChange).toHaveBeenCalledTimes(1);
    expect(onChange).toHaveBeenCalledWith("X\tY\nnew\t99", "cell_edit");
    expect(screen.getByText(/Excelの読込に失敗.*保全/)).toBeVisible();
    expect(button).toBeEnabled();
  });
  it("preserves a cell edit while an Excel workbook is pending and allows retry", async () => {
    const onChange = vi.fn();
    const workbook = {
      fileName: "old.xlsx",
      sheets: [
        {
          name: "Sheet1",
          rows: [
            ["X", "Y"],
            ["old", "1"],
          ],
        },
      ],
    };
    let finish!: (value: typeof workbook) => void;
    const importer = vi
      .fn()
      .mockImplementationOnce(
        () =>
          new Promise<typeof workbook>((resolve) => {
            finish = resolve;
          }),
      )
      .mockResolvedValue(workbook);
    render(
      <DelimitedTextSpreadsheet
        ariaLabel="Graph sheet"
        value={"X\tY\nnew\t10"}
        onChange={onChange}
        workbookImporter={importer}
      />,
    );
    const button = screen.getByRole("button", { name: "XLS / XLSXを直接読み込む" });
    fireEvent.click(button);
    fireEvent.click(button);
    expect(importer).toHaveBeenCalledTimes(1);
    fireEvent.change(screen.getByLabelText("Graph sheet 行2 列2"), { target: { value: "99" } });
    await act(async () => finish(workbook));
    expect(onChange).toHaveBeenCalledTimes(1);
    expect(onChange).toHaveBeenCalledWith("X\tY\nnew\t99", "cell_edit");
    expect(screen.getByText(/読込中の入力変更を保全/)).toBeVisible();
    expect(button).toBeEnabled();
    fireEvent.click(button);
    await waitFor(() =>
      expect(onChange).toHaveBeenLastCalledWith("X\tY\nold\t1", "workbook_import"),
    );
  });
  beforeEach(() => {
    window.localStorage.removeItem("lsaa.delimited-spreadsheet.zoom.v1");
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

describe("quoted record integrity", () => {
  it("keeps multiline CSV labels when a neighboring value is edited and the table is reloaded", () => {
    const onChange = vi.fn();
    const original = 'Condition,Value\r\n" first\r\nsecond, ""quoted"" ",1';
    const { rerender } = render(
      <DelimitedTextSpreadsheet ariaLabel="Quoted" value={original} onChange={onChange} />,
    );
    const label = screen.getByLabelText("Quoted 行2 列1");
    expect(label.tagName).toBe("TEXTAREA");
    expect(label).toHaveValue(' first\nsecond, "quoted" ');
    fireEvent.change(screen.getByLabelText("Quoted 行2 列2"), { target: { value: "2" } });
    expect(onChange).toHaveBeenLastCalledWith(
      'Condition,Value\n" first\nsecond, ""quoted"" ",2',
      "cell_edit",
    );
    rerender(
      <DelimitedTextSpreadsheet
        ariaLabel="Quoted"
        value={onChange.mock.calls[0]![0]}
        onChange={onChange}
      />,
    );
    expect(screen.getByLabelText("Quoted 行2 列1")).toHaveValue(' first\nsecond, "quoted" ');
    expect(screen.getByLabelText("Quoted 行2 列2")).toHaveValue("2");
    const multiline = screen.getByLabelText("Quoted 行2 列1");
    multiline.focus();
    fireEvent.keyDown(multiline, { key: "Enter" });
    expect(multiline).toHaveFocus();
    fireEvent.keyDown(multiline, { key: "Tab" });
    expect(screen.getByLabelText("Quoted 行2 列2")).toHaveFocus();
  });

  it("pastes quoted multiline TSV including embedded tabs and empty cells as logical rows", () => {
    const onChange = vi.fn();
    const { rerender } = render(
      <DelimitedTextSpreadsheet
        ariaLabel="Paste"
        value={"Label\tEmpty\tValue"}
        onChange={onChange}
      />,
    );
    fireEvent.paste(screen.getByLabelText("Paste 行2 列1"), {
      clipboardData: { getData: () => '"a\nb\tc"\t\t1\r\nplain\t\t2\r\n' },
    });
    expect(onChange).toHaveBeenLastCalledWith(
      'Label\tEmpty\tValue\n"a\nb\tc"\t\t1\nplain\t\t2',
      "clipboard",
    );
    rerender(
      <DelimitedTextSpreadsheet
        ariaLabel="Paste"
        value={onChange.mock.calls[0]![0]}
        onChange={onChange}
      />,
    );
    expect(screen.getByLabelText("Paste 行2 列1")).toHaveValue("a\nb\tc");
    expect(screen.getByLabelText("Paste 行2 列2")).toHaveValue("");
    expect(screen.getByLabelText("Paste 行3 列3")).toHaveValue("2");
  });

  it("rejects an unterminated quoted paste without calling onChange", () => {
    const onChange = vi.fn();
    render(
      <DelimitedTextSpreadsheet
        ariaLabel="Invalid paste"
        value={"Label,Value\na,1"}
        onChange={onChange}
      />,
    );
    fireEvent.paste(screen.getByLabelText("Invalid paste 行2 列1"), {
      clipboardData: { getData: () => '"broken\nlabel,2' },
    });
    expect(screen.getByRole("alert")).toHaveTextContent("貼り付け前の表を保持");
    expect(onChange).not.toHaveBeenCalled();
    expect(screen.getByLabelText("Invalid paste 行2 列2")).toHaveValue("1");
  });

  it("shows invalid input safely and resumes editing after replacement without changing its source", () => {
    const onChange = vi.fn(),
      original = 'Label,Value\n"unfinished\n1';
    const importer = vi.fn().mockResolvedValue(null);
    const { rerender } = render(
      <DelimitedTextSpreadsheet
        ariaLabel="Invalid"
        value={original}
        onChange={onChange}
        workbookImporter={importer}
      />,
    );
    expect(screen.getByRole("alert")).toHaveTextContent("原文を保持");
    expect(screen.getByLabelText("Invalid 読込できなかった原文")).toHaveValue(original);
    expect(screen.getByLabelText("Invalid 行1 列1")).toBeDisabled();
    expect(screen.getByRole("button", { name: "XLS / XLSXを直接読み込む" })).toBeEnabled();
    expect(onChange).not.toHaveBeenCalled();
    rerender(
      <DelimitedTextSpreadsheet
        ariaLabel="Invalid"
        value={"Label,Value\nfixed,2"}
        onChange={onChange}
      />,
    );
    expect(screen.queryByRole("alert")).toBeNull();
    expect(screen.getByLabelText("Invalid 行2 列1")).toHaveValue("fixed");
    expect(screen.getByLabelText("Invalid 行2 列1")).toBeEnabled();
  });
});

it("imports a selected Excel range and preserves the table after an invalid range", async () => {
  const onChange = vi.fn();
  const importer = vi.fn().mockResolvedValue({fileName:"range.xlsx",sheets:[{name:"Sheet",rows:[["ignored","Treatment",""],["ignored","Value","Note"],["ignored","1.000","quoted\tvalue"]]}]});
  render(<DelimitedTextSpreadsheet ariaLabel="Range sheet" value="old" onChange={onChange} workbookImporter={importer} />);
  fireEvent.click(screen.getByRole("button", {name:"XLS / XLSXを直接読み込む"}));
  await waitFor(() => expect(screen.getByLabelText("読み込む表範囲")).toBeVisible());
  fireEvent.change(screen.getByLabelText("読み込む表範囲"), {target:{value:"B1:C3"}});
  fireEvent.change(screen.getByLabelText("見出し行の数"), {target:{value:"2"}});
  fireEvent.click(screen.getByRole("button", {name:"この範囲を読み込む"}));
  expect(onChange).toHaveBeenLastCalledWith('Treatment / Value\tTreatment / Note\n1.000\t"quoted\tvalue"', "workbook_import");
  const calls = onChange.mock.calls.length;
  fireEvent.change(screen.getByLabelText("読み込む表範囲"), {target:{value:"A1:Z100"}});
  fireEvent.click(screen.getByRole("button", {name:"この範囲を読み込む"}));
  expect(screen.getByRole("alert")).toHaveTextContent("使用範囲を超えています");
  expect(onChange).toHaveBeenCalledTimes(calls);
});

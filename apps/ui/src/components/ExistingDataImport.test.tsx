import { act, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { ExistingDataImport } from "./ExistingDataImport";

function pendingFile() {
  let resolve!: (contents: string) => void;
  const file = new File([], "old.tsv");
  Object.defineProperty(file, "text", {
    value: () =>
      new Promise<string>((done) => {
        resolve = done;
      }),
  });
  return { file, finish: (contents: string) => resolve(contents) };
}

describe("existing data file reading", () => {
  it("preserves data and column assignments changed during reading", async () => {
    render(<ExistingDataImport onReady={vi.fn()} />);
    const newer = "Experiment\tCondition\tMean\nE1\tControl\t99";
    fireEvent.change(screen.getByLabelText("既存データの表"), { target: { value: newer } });
    const pending = pendingFile();
    fireEvent.change(screen.getByLabelText("既存データファイル"), {
      target: { files: [pending.file] },
    });
    fireEvent.change(screen.getByLabelText("実験回／sessionの列"), { target: { value: "0" } });
    await act(async () => pending.finish("Experiment\tCondition\tMean\nE2\tDrug\t1"));
    expect(screen.getByLabelText("既存データの表")).toHaveValue(newer);
    expect(screen.getByLabelText("実験回／sessionの列")).toHaveValue("0");
    expect(screen.getByText(/読込中の入力・列の割り当ての変更を保全/)).toBeVisible();
  });

  it("adopts the latest selected file and ignores an older read finishing later", async () => {
    render(<ExistingDataImport onReady={vi.fn()} />);
    const pending = pendingFile();
    fireEvent.change(screen.getByLabelText("既存データファイル"), {
      target: { files: [pending.file] },
    });
    const newer = "Condition\tMean\nControl\t99";
    const file = new File([], "new.tsv");
    Object.defineProperty(file, "text", { value: async () => newer });
    fireEvent.change(screen.getByLabelText("既存データファイル"), { target: { files: [file] } });
    await waitFor(() => expect(screen.getByLabelText("既存データの表")).toHaveValue(newer));
    await act(async () => pending.finish("Condition\tMean\nDrug\t1"));
    expect(screen.getByLabelText("既存データの表")).toHaveValue(newer);
  });
});

it('shows excluded rows before accepting the import', () => {
 const onReady = vi.fn(); render(<ExistingDataImport onReady={onReady} />);
 fireEvent.change(screen.getByLabelText('既存データの表'), {target:{value:'Unit\tCondition\tValue\nU1\tControl\t1.000\nU2\tTreatment\t2\nU3\tControl\t<0.1'}});
 fireEvent.change(screen.getByLabelText('実験回／sessionの列'), {target:{value:'0'}});
 fireEvent.change(screen.getByLabelText('生物学的単位IDの列'), {target:{value:'0'}});
 fireEvent.change(screen.getByLabelText('条件の列'), {target:{value:'1'}});
 fireEvent.change(screen.getByLabelText('測定値の列'), {target:{value:'2'}});
 fireEvent.click(screen.getByRole('button',{name:'この割り当てで入力画面を作る'}));
 expect(onReady).not.toHaveBeenCalled();
 expect(screen.getByText(/元データ 3 行／取込対象 2 行／除外 1 行/)).toBeVisible();
 expect(screen.getByText('3行：測定値が有限の数値ではない')).toBeVisible();
 fireEvent.click(screen.getByRole('button',{name:'この構造で取り込む'}));
 expect(onReady).toHaveBeenCalledOnce();
});

import { fireEvent, render, screen } from "@testing-library/react";
import { vi } from "vitest";

import { BulkPasteScalar } from "./BulkPasteScalar";

describe("BulkPasteScalar", () => {
  it("貼り付け値が実験単位ごとのまとめであることを案内する", () => {
    const onApply = vi.fn();
    render(
      <BulkPasteScalar
        sheet={{
          conditions: [
            { id: "condition.control", label: "対照" },
            { id: "condition.treatment", label: "処理" },
          ],
        }}
        onApply={onApply}
      />,
    );

    expect(screen.getByText("1つの値 = 1つの実験単位のまとめ")).toBeVisible();
    expect(screen.getByText(/どの実験単位（ディッシュ、試料、動物など）/)).toBeVisible();
    expect(screen.getByText("まとめ済みの値を貼り付け")).toBeVisible();

    fireEvent.click(screen.getByText("サンプルと対応範囲を表示"));
    expect(screen.getByText(/実験単位ごとにまとめた平均値/)).toBeVisible();

    fireEvent.change(screen.getByRole("textbox", { name: "スカラー値を貼り付け" }), {
      target: { value: "Sample\tMean\nA\t10\nB\t12" },
    });
    fireEvent.click(screen.getByRole("button", { name: "選択した条件に適用" }));

    expect(onApply).toHaveBeenCalledWith("condition.control", [10, 12], {
      columnLabel: "Mean",
      rowNumbers: [1, 2],
    });
  });
});

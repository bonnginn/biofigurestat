import { fireEvent, render, screen, within } from "@testing-library/react";
import { useState } from "react";
import { describe, expect, it } from "vitest";
import type { CanonicalAdaptiveObservation } from "@lsaa/domain";
import { nestedContract, nestedObservations } from "../test/windowsDetailedFixture";
import { AdaptiveCanonicalSpreadsheet } from "./AdaptiveCanonicalSpreadsheet";

function Harness() {
  const [observations, setObservations] =
    useState<readonly CanonicalAdaptiveObservation[]>(nestedObservations);
  const [mode, setMode] = useState<"compact" | "expanded">("expanded");
  const [contract, setContract] = useState(nestedContract);
  return (
    <>
      <button
        onClick={() =>
          setObservations(nestedObservations.map((o) => ({ ...o, values: { signal: 999 } })))
        }
      >
        外部更新
      </button>
      <button onClick={() => setContract({ ...nestedContract, contractId: "changed-context" })}>
        構造変更
      </button>
      <AdaptiveCanonicalSpreadsheet
        contract={contract}
        observations={observations}
        mode={mode}
        onModeChange={setMode}
        onObservationsChange={setObservations}
        nextObservationId={() => "obs.added"}
      />
      <output aria-label="canonical records">{JSON.stringify(observations)}</output>
    </>
  );
}
const records = () =>
  JSON.parse(
    screen.getByLabelText("canonical records").textContent!,
  ) as CanonicalAdaptiveObservation[];
function paste(text: string) {
  fireEvent.paste(screen.getByRole("textbox", { name: "obs.c1.0のSignal" }), {
    clipboardData: { getData: () => text },
  });
}
describe("Windows detailed worksheet user flow", () => {
  it("allows child names under different parents, synchronizes hierarchy, and rejects same-parent collisions", () => {
    render(<Harness />);
    const cell = screen.getByRole("textbox", { name: "obs.c1.0のCell ID" });
    fireEvent.change(cell, { target: { value: "new" } });
    fireEvent.blur(cell);
    expect(records()[0].identities.cell_id).toBe("new");
    expect(records()[0].hierarchy.cell).toBe("new");
    expect(records()[2]).toEqual(nestedObservations[2]);
    fireEvent.change(cell, { target: { value: "sibling" } });
    fireEvent.blur(cell);
    expect(records()[0].identities.cell_id).toBe("new");
    expect(screen.getByRole("alert")).toHaveTextContent("同じ名前");
  });
  it("reviews a rectangle before committing, cancels safely, and restores exact records with Undo/Redo", () => {
    render(<Harness />);
    paste("101\n102");
    expect(records()).toEqual(nestedObservations);
    const review = screen.getByRole("dialog", { name: "貼り付けを確認" });
    expect(within(review).getByText("101")).toBeVisible();
    fireEvent.click(within(review).getByRole("button", { name: "キャンセル" }));
    expect(records()).toEqual(nestedObservations);
    paste("101\n102");
    fireEvent.click(screen.getByRole("button", { name: "貼り付けを確定" }));
    const updated = records();
    expect(updated.slice(0, 2).map((o) => o.values.signal)).toEqual([101, 102]);
    expect(updated.map((o) => o.observationId)).toEqual(
      nestedObservations.map((o) => o.observationId),
    );
    fireEvent.click(screen.getByRole("button", { name: "入力を元に戻す" }));
    expect(records()).toEqual(nestedObservations);
    fireEvent.click(screen.getByRole("button", { name: "入力をやり直す" }));
    expect(records()).toEqual(updated);
    fireEvent.click(screen.getByRole("button", { name: "外部更新" }));
    expect(screen.getByRole("button", { name: "入力を元に戻す" })).toBeDisabled();
  });
  it("rejects ragged, invalid, and overflowing rectangles without partial changes", () => {
    render(<Harness />);
    // Start at the child identity so both columns would fit. This distinguishes
    // the shape failure from a range overflow and from numeric validation.
    fireEvent.paste(screen.getByRole("textbox", { name: "obs.c1.0のCell ID" }), {
      clipboardData: { getData: () => "alpha\t11\nbeta" },
    });
    expect(screen.getByRole("alert")).toHaveTextContent("列数");
    expect(records()).toEqual(nestedObservations);
    for (const text of ["11\ninvalid", "11\t12\n13\t14"]) {
      paste(text);
      expect(records()).toEqual(nestedObservations);
      expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
      expect(screen.getByRole("alert")).toHaveTextContent("変更していません");
    }
  });
  it("refuses a pending paste after an external change and keeps the clipboard text visible", () => {
    render(<Harness />);
    paste("101\n102");
    fireEvent.click(screen.getByRole("button", { name: "外部更新" }));
    fireEvent.click(screen.getByRole("button", { name: "貼り付けを確定" }));
    expect(records().every((o) => o.values.signal === 999)).toBe(true);
    expect(screen.getByRole("alert")).toHaveTextContent("更新");
    expect(screen.getByRole("textbox", { name: "貼り付け元のテキスト" })).toHaveValue("101\n102");
  });
  it("updates all child rows for a parent rename while retaining child n and rejects a root collision", () => {
    render(<Harness />);
    const parent = screen.getByRole("textbox", { name: "obs.c1.0のDish ID" });
    fireEvent.change(parent, { target: { value: "C2" } });
    fireEvent.blur(parent);
    expect(records()).toEqual(nestedObservations);
    fireEvent.change(parent, { target: { value: "Renamed parent" } });
    fireEvent.blur(parent);
    const edited = records();
    expect(
      edited
        .slice(0, 2)
        .every(
          (o) => o.identities.dish_id === "Renamed parent" && o.hierarchy.dish === "Renamed parent",
        ),
    ).toBe(true);
    expect(edited.map((o) => o.identities.cell_id)).toEqual(
      nestedObservations.map((o) => o.identities.cell_id),
    );
    expect(new Set(edited.map((o) => o.identities.dish_id)).size).toBe(4);
    fireEvent.click(screen.getByRole("button", { name: "まとめて入力" }));
    fireEvent.click(screen.getByRole("button", { name: "入力を元に戻す" }));
    expect(records()).toEqual(nestedObservations);
    fireEvent.click(screen.getByRole("button", { name: "入力をやり直す" }));
    expect(records()).toEqual(edited);
  });
  it("traps review focus, cancels with Escape, restores the target, and stops on structure changes", () => {
    render(<Harness />);
    const target = screen.getByRole("textbox", { name: "obs.c1.0のSignal" });
    target.focus();
    paste("11\n12");
    const cancel = screen.getByRole("button", { name: "キャンセル" });
    expect(cancel).toHaveFocus();
    const first = screen.getByRole("textbox", { name: "貼り付け元のテキスト" });
    first.focus();
    fireEvent.keyDown(first, { key: "Tab", shiftKey: true });
    expect(screen.getByRole("button", { name: "貼り付けを確定" })).toHaveFocus();
    fireEvent.keyDown(screen.getByRole("dialog"), { key: "Escape" });
    expect(target).toHaveFocus();
    expect(records()).toEqual(nestedObservations);
    paste("11\n12");
    fireEvent.click(screen.getByRole("button", { name: "構造変更" }));
    fireEvent.click(screen.getByRole("button", { name: "貼り付けを確定" }));
    expect(screen.getByRole("alert")).toHaveTextContent("実験条件が更新");
    expect(records()).toEqual(nestedObservations);
  });
});

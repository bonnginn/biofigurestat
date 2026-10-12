import { fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { useState } from "react";
import { describe, expect, it } from "vitest";
import { StructureContractSchema, type CanonicalAdaptiveObservation } from "@lsaa/domain";
import { nestedContract, nestedObservations } from "../test/windowsDetailedFixture";
import { AdaptiveCanonicalSpreadsheet } from "./AdaptiveCanonicalSpreadsheet";

function Harness({ empty = false, ordered = false }: { empty?: boolean; ordered?: boolean }) {
  const contract = ordered
    ? StructureContractSchema.parse({
        ...nestedContract,
        orderedAxes: [
          {
            key: "time",
            label: "Time",
            unit: "hour",
            levels: [0, 24],
            sampling: "repeated_same_identity",
            identityRetained: true,
          },
        ],
        readouts: nestedContract.readouts.map((readout) => ({ ...readout, axisKeys: ["time"] })),
      })
    : nestedContract;
  const [observations, setObservations] = useState<readonly CanonicalAdaptiveObservation[]>(
    empty ? [] : nestedObservations.map((o) => (ordered ? { ...o, axes: { time: 24 } } : o)),
  );
  const [mode, setMode] = useState<"compact" | "expanded">("expanded");
  return (
    <>
      <button onClick={() => setObservations([])}>外部でデータを空にする</button>
      <AdaptiveCanonicalSpreadsheet
        contract={contract}
        observations={observations}
        mode={mode}
        onModeChange={setMode}
        onObservationsChange={setObservations}
        nextObservationId={() => "obs.synthetic.added"}
      />
      <output aria-label="records">{JSON.stringify(observations)}</output>
    </>
  );
}
const records = () =>
  JSON.parse(screen.getByLabelText("records").textContent!) as CanonicalAdaptiveObservation[];
function summary() {
  return screen.getByText("新しい測定記録を追加", { selector: "summary span" }).closest("summary")!;
}
async function openEntry() {
  fireEvent.click(summary());
  await waitFor(() =>
    expect(screen.getByRole("form", { name: "新しい測定記録を追加" })).toBeVisible(),
  );
}
function fillEntry() {
  const form = screen.getByRole("form", { name: "新しい測定記録を追加" });
  fireEvent.change(within(form).getByRole("textbox", { name: "Dish ID" }), {
    target: { value: "C1" },
  });
  fireEvent.change(within(form).getByRole("textbox", { name: "Cell ID" }), {
    target: { value: "third" },
  });
  fireEvent.change(within(form).getByRole("combobox", { name: "Condition" }), {
    target: { value: "control" },
  });
  fireEvent.change(within(form).getByRole("textbox", { name: "Signal・signal" }), {
    target: { value: "7.25" },
  });
  return form;
}
describe("existing input visibility and retained record-entry draft", () => {
  it("starts collapsed when records exist and exposes an explicit entry action without hiding existing values", async () => {
    render(<Harness />);
    expect(screen.getByRole("form", { name: "新しい測定記録を追加" })).not.toBeVisible();
    expect(summary().closest("details")).not.toHaveAttribute("open");
    expect(screen.getByRole("textbox", { name: "obs.c1.0のSignal" })).toHaveValue("1");
    expect(records()).toEqual(nestedObservations);
    await openEntry();
    expect(summary().closest("details")).toHaveAttribute("open");
    fireEvent.click(summary());
    await waitFor(() => expect(summary().closest("details")).not.toHaveAttribute("open"));
    expect(records()).toEqual(nestedObservations);
  });
  it("starts open for empty data and permits the first explicit parent/child record immediately", () => {
    render(<Harness empty />);
    const form = fillEntry();
    fireEvent.click(within(form).getByRole("button", { name: "測定行を追加" }));
    expect(records()).toHaveLength(1);
    expect(records()[0]).toMatchObject({
      observationId: "obs.synthetic.added",
      identities: { dish_id: "C1", cell_id: "third" },
      hierarchy: { dish: "C1", cell: "third" },
      factors: { condition: "control" },
      values: { signal: 7.25 },
    });
    expect(form).toBeVisible();
  });
  it("retains a partially typed draft when collapsed, reopened and committed once with canonical Undo", async () => {
    render(<Harness />);
    await openEntry();
    const form = fillEntry();
    fireEvent.click(summary());
    await waitFor(() => expect(form).not.toBeVisible());
    expect(records()).toEqual(nestedObservations);
    expect(screen.getByText("入力途中の内容を保持しています")).toBeVisible();
    await openEntry();
    expect(within(form).getByRole("textbox", { name: "Dish ID" })).toHaveValue("C1");
    expect(within(form).getByRole("textbox", { name: "Cell ID" })).toHaveValue("third");
    expect(within(form).getByRole("combobox", { name: "Condition" })).toHaveValue("control");
    expect(within(form).getByRole("textbox", { name: "Signal・signal" })).toHaveValue("7.25");
    fireEvent.click(within(form).getByRole("button", { name: "測定行を追加" }));
    expect(records()).toHaveLength(9);
    expect(new Set(records().map((o) => o.identities.dish_id)).size).toBe(4);
    fireEvent.click(screen.getByRole("button", { name: "入力を元に戻す" }));
    expect(records()).toEqual(nestedObservations);
  });
  it("automatically opens after external data becomes empty while retaining an unfinished draft", async () => {
    render(<Harness />);
    await openEntry();
    const form = fillEntry();
    fireEvent.click(summary());
    await waitFor(() => expect(form).not.toBeVisible());
    fireEvent.click(screen.getByRole("button", { name: "外部でデータを空にする" }));
    await waitFor(() => expect(form).toBeVisible());
    expect(within(form).getByRole("textbox", { name: "Cell ID" })).toHaveValue("third");
    expect(records()).toEqual([]);
  });
  it("retains explicit time and missingness when the form is folded", async () => {
    render(<Harness ordered />);
    await openEntry();
    const form = fillEntry();
    fireEvent.change(within(form).getByRole("combobox", { name: "Time" }), {
      target: { value: "24" },
    });
    fireEvent.change(within(form).getByRole("textbox", { name: "Signal・signal" }), {
      target: { value: "" },
    });
    fireEvent.change(within(form).getByRole("combobox", { name: "Signal・signalの欠測理由" }), {
      target: { value: "not_collected" },
    });
    fireEvent.click(summary());
    await waitFor(() => expect(form).not.toBeVisible());
    await openEntry();
    expect(within(form).getByRole("combobox", { name: "Time" })).toHaveValue("24");
    expect(within(form).getByRole("combobox", { name: "Signal・signalの欠測理由" })).toHaveValue(
      "not_collected",
    );
    expect(within(form).getByRole("textbox", { name: "Signal・signal" })).toHaveValue("");
    fireEvent.click(within(form).getByRole("button", { name: "測定行を追加" }));
    expect(records().at(-1)).toMatchObject({
      axes: { time: 24 },
      values: { signal: null },
      missingness: { signal: "not_collected" },
    });
  });
});

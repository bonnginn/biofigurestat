import { fireEvent, render, screen, within } from "@testing-library/react";
import { useState } from "react";
import { afterEach, describe, expect, it } from "vitest";

import {
  createExperimentSetDraft,
  experimentCellKey,
  type ExperimentCellMap,
  type ExperimentSetDraft,
  type NestedContinuousCellDraft,
} from "../app/experimentDraft";
import { WorkspaceNestedMeasurementSheet } from "./WorkspaceNestedMeasurementSheet";
import { resetAppLocaleForTests, setAppLocale } from "../app/appLocale";
import { expectNoJapaneseUi } from "../test/expectNoJapaneseUi";

afterEach(() => resetAppLocaleForTests("ja"));

function fixture(): { draft: ExperimentSetDraft; cells: ExperimentCellMap; keys: string[] } {
  const base = createExperimentSetDraft("microscopy_imaging", "nested_continuous");
  const draft: ExperimentSetDraft = {
    ...base,
    name: "Nested microscopy",
    experiments: [
      { ...base.experiments[0]!, id: "experiment.1", label: "Exp 1", stableUnitId: "dish.1" },
    ],
    readouts: [
      {
        ...base.readouts[0]!,
        id: "readout.intensity",
        label: "蛍光強度",
        nestedInputMode: "nested_observations",
      },
    ],
    conditions: [
      {
        id: "condition.control",
        label: "Control",
        attributes: { "attribute.1": "Control" },
      },
      {
        id: "condition.drug",
        label: "Drug",
        attributes: { "attribute.1": "Drug" },
      },
    ],
  };
  const keys = draft.conditions.map((condition) =>
    experimentCellKey({
      experimentId: draft.experiments[0]!.id,
      conditionId: condition.id,
      readoutId: draft.readouts[0]!.id,
    }),
  );
  return {
    draft,
    keys,
    cells: {
      [keys[0]!]: {
        kind: "nested_continuous",
        rawValues: [10, 12, 11],
        source: "paste",
      },
      [keys[1]!]: {
        kind: "nested_continuous",
        rawValues: [20],
        source: "paste",
      },
    },
  };
}

function Harness({ initialCells }: { initialCells: ExperimentCellMap }) {
  const { draft } = fixture();
  const [cells, setCells] = useState(initialCells);
  const [mode, setMode] = useState<"compact" | "expanded">("compact");
  return (
    <WorkspaceNestedMeasurementSheet
      draft={draft}
      cells={cells}
      mode={mode}
      onModeChange={setMode}
      onCellChange={(key, cell) => setCells((current) => ({ ...current, [key]: cell }))}
    />
  );
}

describe("WorkspaceNestedMeasurementSheet", () => {
  it("shows compact and expanded nested measurement entry without Japanese application copy in English mode", () => {
    setAppLocale("en");
    const data = fixture();
    const draft = {
      ...data.draft,
      conditionAssignment: { ...data.draft.conditionAssignment, unitLabel: "Experimental unit" },
      attributes: data.draft.attributes.map((attribute) => ({ ...attribute, label: "Condition" })),
      readouts: data.draft.readouts.map((readout) => ({ ...readout, label: "Fluorescence intensity" })),
    };
    const view = render(
      <WorkspaceNestedMeasurementSheet
        draft={draft}
        cells={data.cells}
        mode="compact"
        onModeChange={() => undefined}
        onCellChange={() => undefined}
      />,
    );
    expectNoJapaneseUi(view.container);
    view.rerender(
      <WorkspaceNestedMeasurementSheet
        draft={draft}
        cells={data.cells}
        mode="expanded"
        onModeChange={() => undefined}
        onCellChange={() => undefined}
      />,
    );
    expectNoJapaneseUi(view.container);
  });
  it("edits unequal condition lists without padding or creating positional pairing", () => {
    const data = fixture();
    render(<Harness initialCells={data.cells} />);

    const table = screen.getByRole("table", {
      name: "条件ごとに複数の測定値をまとめて入力",
    });
    expect(screen.getByText(/各条件の欄は別々の実験単位です/)).toBeVisible();
    const control = within(table).getByRole("textbox", {
      name: "入力行 1・Controlの蛍光強度",
    });
    const drug = within(table).getByRole("textbox", { name: "入力行 1・Drugの蛍光強度" });
    expect(control).toHaveValue("10\n12\n11");
    expect(drug).toHaveValue("20");

    fireEvent.change(drug, { target: { value: "20\n22" } });
    fireEvent.blur(drug);
    expect(drug).toHaveValue("20\n22");
    expect(control).toHaveValue("10\n12\n11");
  });

  it("shows every measurement and its stable child identity in the expanded spreadsheet", () => {
    const data = fixture();
    const identified: ExperimentCellMap = {
      ...data.cells,
      [data.keys[0]!]: {
        ...(data.cells[data.keys[0]!] as NestedContinuousCellDraft),
        observationUnitIds: ["Cell-1", "Cell-2", "Cell-3"],
        sourceLocations: ["image-01.tif", "image-01.tif", "image-02.tif"],
      },
    };
    render(<Harness initialCells={identified} />);

    const compactControl = screen.getByRole("textbox", {
      name: "入力行 1・Controlの蛍光強度",
    });
    expect(compactControl).toBeDisabled();
    expect(screen.getByText(/IDがあるため/)).toBeVisible();

    fireEvent.click(screen.getByRole("button", { name: "すべての値" }));
    const expanded = screen.getByRole("table", { name: "個々の測定値をすべて表示" });
    expect(within(expanded).getByDisplayValue("Cell-1")).toBeVisible();
    expect(within(expanded).getByDisplayValue("image-02.tif")).toBeVisible();
    expect(
      within(expanded).getByRole("textbox", { name: "Control・Exp 1・測定1の値" }),
    ).toHaveValue("10");
  });

  it("adds a new canonical-position row from the trailing spreadsheet row", () => {
    const data = fixture();
    render(<Harness initialCells={data.cells} />);
    fireEvent.click(screen.getByRole("button", { name: "すべての値" }));

    const newDrugValue = screen.getByRole("textbox", {
      name: "Drug・Exp 1・測定2の値",
    });
    fireEvent.change(newDrugValue, { target: { value: "24" } });
    fireEvent.blur(newDrugValue);

    fireEvent.click(screen.getByRole("button", { name: "まとめて入力" }));
    expect(screen.getByRole("textbox", { name: "入力行 1・Drugの蛍光強度" })).toHaveValue("20\n24");
  });

  it("exposes captions and keeps the keyboard-activated view switch focused", () => {
    const data = fixture();
    render(<Harness initialCells={data.cells} />);

    const compact = screen.getByRole("table", {
      name: "条件ごとに複数の測定値をまとめて入力",
    });
    const compactButton = screen.getByRole("button", { name: "まとめて入力" });
    const expandedButton = screen.getByRole("button", { name: "すべての値" });
    expect(compact.querySelector("caption")).toHaveTextContent(
      "条件ごとに複数の測定値をまとめて入力",
    );
    expect(compactButton).toHaveAttribute("aria-controls", compact.id);
    expect(expandedButton).toHaveAttribute("aria-controls", compact.id);

    expandedButton.focus();
    fireEvent.keyDown(expandedButton, { key: "Enter" });
    fireEvent.click(expandedButton, { detail: 0 });
    expect(expandedButton).toHaveFocus();
    expect(expandedButton).toHaveAttribute("aria-pressed", "true");

    const expanded = screen.getByRole("table", { name: "個々の測定値をすべて表示" });
    expect(expanded.id).toBe(compact.id);
    expect(expanded.querySelector("caption")).toHaveTextContent("個々の測定値をすべて表示");
    expect(within(expanded).getAllByRole("rowheader").length).toBeGreaterThan(0);
  });

  it("applies multi-line paste and associates validation with the compact editor", () => {
    const data = fixture();
    render(<Harness initialCells={data.cells} />);
    const drug = screen.getByRole("textbox", { name: "入力行 1・Drugの蛍光強度" });

    drug.focus();
    expect(
      fireEvent.paste(drug, {
        clipboardData: { getData: () => "20\n22\n24" },
      }),
    ).toBe(false);
    expect(drug).toHaveValue("20\n22\n24");

    fireEvent.change(drug, { target: { value: "20\ninvalid" } });
    fireEvent.blur(drug);
    const alert = screen.getByRole("alert");
    expect(drug).toHaveAttribute("aria-invalid", "true");
    expect(drug.getAttribute("aria-describedby")?.split(" ")).toContain(alert.id);
    expect(drug).toHaveValue("20\ninvalid");
  });

  it("distributes rectangular paste across conditions and supports spreadsheet navigation", () => {
    const data = fixture();
    render(<Harness initialCells={data.cells} />);
    const control = screen.getByRole("textbox", { name: "入力行 1・Controlの蛍光強度" });
    const drug = screen.getByRole("textbox", { name: "入力行 1・Drugの蛍光強度" });

    fireEvent.paste(control, {
      clipboardData: { getData: () => "1\t3\n2\t4" },
    });
    expect(control).toHaveValue("1\n2");
    expect(drug).toHaveValue("3\n4");

    control.focus();
    fireEvent.keyDown(control, { key: "ArrowRight" });
    expect(drug).toHaveFocus();
  });

  it("pastes measurement and source columns together in the all-values sheet", () => {
    const data = fixture();
    render(<Harness initialCells={data.cells} />);
    fireEvent.click(screen.getByRole("button", { name: "すべての値" }));
    const firstValue = screen.getByRole("textbox", { name: "Control・Exp 1・測定1の値" });

    fireEvent.paste(firstValue, {
      clipboardData: { getData: () => "100\timage-a.tif\n101\timage-b.tif" },
    });

    expect(screen.getByRole("textbox", { name: "Control・Exp 1・測定1の値" })).toHaveValue("100");
    expect(screen.getByRole("textbox", { name: "Control・Exp 1・測定2の値" })).toHaveValue("101");
    expect(screen.getByDisplayValue("image-a.tif")).toBeVisible();
    expect(screen.getByDisplayValue("image-b.tif")).toBeVisible();
    expect(screen.getByRole("status")).toHaveTextContent("IDと出典の対応は保持");
  });

  it("extends a value column through the trailing all-values row", () => {
    const data = fixture();
    render(<Harness initialCells={data.cells} />);
    fireEvent.click(screen.getByRole("button", { name: "すべての値" }));

    fireEvent.paste(screen.getByRole("textbox", { name: "Control・Exp 1・測定1の値" }), {
      clipboardData: { getData: () => "100\n101\n102\n103" },
    });

    expect(screen.getByRole("textbox", { name: "Control・Exp 1・測定4の値" })).toHaveValue("103");
    fireEvent.click(screen.getByRole("button", { name: "まとめて入力" }));
    expect(screen.getByRole("textbox", { name: "入力行 1・Controlの蛍光強度" })).toHaveValue(
      "100\n101\n102\n103",
    );
  });

  it("exposes why compact and trailing-row fields are disabled", () => {
    const data = fixture();
    const identified: ExperimentCellMap = {
      ...data.cells,
      [data.keys[0]!]: {
        ...(data.cells[data.keys[0]!] as NestedContinuousCellDraft),
        observationUnitIds: ["Cell-1", "Cell-2", "Cell-3"],
      },
    };
    render(<Harness initialCells={identified} />);

    const compactControl = screen.getByRole("textbox", {
      name: "入力行 1・Controlの蛍光強度",
    });
    const compactReasonId = compactControl.getAttribute("aria-describedby");
    expect(compactControl).toBeDisabled();
    expect(compactReasonId).toBeTruthy();
    expect(document.getElementById(compactReasonId!)).toHaveTextContent("IDがあるため");

    fireEvent.click(screen.getByRole("button", { name: "すべての値" }));
    const newDrugIdentity = screen.getByRole("textbox", {
      name: "Drug・Exp 1・測定2のID",
    });
    const newDrugSource = screen.getByRole("textbox", {
      name: "Drug・Exp 1・測定2の出典",
    });
    expect(newDrugIdentity).toBeDisabled();
    expect(newDrugSource).toBeDisabled();
    const trailingReasonId = newDrugIdentity.getAttribute("aria-describedby");
    expect(trailingReasonId).toBeTruthy();
    expect(document.getElementById(trailingReasonId!)).toHaveTextContent(
      "測定値を入力するとIDと出典を入力できます",
    );
    expect(newDrugSource).toHaveAttribute("aria-describedby", trailingReasonId);

    const newDrugValue = screen.getByRole("textbox", {
      name: "Drug・Exp 1・測定2の値",
    });
    newDrugValue.focus();
    fireEvent.change(newDrugValue, { target: { value: "24" } });
    fireEvent.blur(newDrugValue);
    expect(screen.getByRole("textbox", { name: "Drug・Exp 1・測定2のID" })).toBeEnabled();
    expect(screen.getByRole("textbox", { name: "Drug・Exp 1・測定2の出典" })).toBeEnabled();
  });

  it("describes not-planned cells instead of presenting an unexplained disabled control", () => {
    const data = fixture();
    const cells: ExperimentCellMap = {
      ...data.cells,
      [data.keys[1]!]: {
        ...(data.cells[data.keys[1]!] as NestedContinuousCellDraft),
        availability: "not_planned",
      },
    };
    render(<Harness initialCells={cells} />);

    const drug = screen.getByRole("textbox", { name: "入力行 1・Drugの蛍光強度" });
    const reasonId = drug.getAttribute("aria-describedby");
    expect(drug).toBeDisabled();
    expect(reasonId).toBeTruthy();
    expect(document.getElementById(reasonId!)).toHaveTextContent("測定予定なし");
  });
});

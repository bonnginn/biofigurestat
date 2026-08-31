import { fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { useState, type ComponentProps } from "react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import {
  CanonicalAdaptiveObservationSchema,
  StructureContractSchema,
  type CanonicalAdaptiveObservation,
  type StructureContract,
} from "@lsaa/domain";
import { validateCanonicalObservationsForContract } from "@lsaa/adaptive-input";

import { AdaptiveCanonicalSpreadsheet } from "./AdaptiveCanonicalSpreadsheet";
import {
  CanonicalMatrixWorksheet,
  canEditCanonicalMatrix,
  canonicalWorksheetFileLayout,
  type CanonicalMatrixConditionCombination,
  type CanonicalWorksheetRow,
} from "./CanonicalMatrixWorksheet";
import { resetAppLocaleForTests, setAppLocale } from "../app/appLocale";
import { expectNoJapaneseUi } from "../test/expectNoJapaneseUi";

afterEach(() => resetAppLocaleForTests("ja"));

function makeContract(overrides: Partial<StructureContract> = {}): StructureContract {
  return StructureContractSchema.parse({
    schemaVersion: "0.1.0",
    contractId: "canonical.matrix.fixture",
    experimentName: "Canonical matrix fixture",
    experimentDescription: "A continuous scalar worksheet fixture.",
    unitLevels: [
      {
        key: "unit",
        label: "Culture dish",
        role: "experimental_unit",
        parentKey: null,
      },
    ],
    experimentalUnitLevelKey: "unit",
    identities: [
      {
        key: "unit_id",
        label: "Dish ID",
        unitLevelKey: "unit",
        required: true,
      },
    ],
    factors: [
      {
        key: "condition",
        label: "Condition",
        levels: ["control", "drug"],
        unitRole: "between_unit",
        relationship: "independent",
        ordered: false,
        referenceLevel: "control",
      },
    ],
    matching: {
      kind: "independent",
      identityKey: null,
      completeSetsRequired: null,
    },
    orderedAxes: [],
    readouts: [
      {
        key: "value",
        label: "Response",
        valueType: "scalar",
        representation: "scalar",
        componentKeys: ["value"],
        referenceRole: "none",
        observationLevelKey: "unit",
        axisKeys: [],
      },
    ],
    allowedMissingness: ["unknown", "not_collected"],
    rawObservationGrain: "one culture dish observation",
    ...overrides,
  });
}

function makeObservation(input: {
  id: string;
  value: number | null;
  factors: Readonly<Record<string, string>>;
  identities: Readonly<Record<string, string>>;
}): CanonicalAdaptiveObservation {
  return CanonicalAdaptiveObservationSchema.parse({
    observationId: input.id,
    readoutKey: "value",
    identities: input.identities,
    factors: input.factors,
    axes: {},
    hierarchy: {},
    values: { value: input.value },
    missingness: input.value === null ? { value: "unknown" } : {},
    sourceRow: null,
  });
}

const independentObservations = [
  makeObservation({
    id: "obs.control.1",
    value: 10,
    factors: { condition: "control" },
    identities: { unit_id: "control-1" },
  }),
  makeObservation({
    id: "obs.control.2",
    value: 11,
    factors: { condition: "control" },
    identities: { unit_id: "control-2" },
  }),
  makeObservation({
    id: "obs.drug.1",
    value: 20,
    factors: { condition: "drug" },
    identities: { unit_id: "drug-1" },
  }),
] as const;

type WorksheetProps = ComponentProps<typeof CanonicalMatrixWorksheet>;
type WorksheetConditionCombinations = readonly CanonicalMatrixConditionCombination[];

const nextObservationId: WorksheetProps["nextObservationId"] = ({ targetCoordinates, ordinal }) =>
  `generated.${targetCoordinates.factors.condition}.${ordinal}`;

const nextExperimentalUnitIdentity: NonNullable<WorksheetProps["nextExperimentalUnitIdentity"]> = ({
  targetCoordinates,
  ordinal,
}) => `unit.${targetCoordinates.factors.condition}.${ordinal}`;

function WorksheetHarness({
  contract = makeContract(),
  initialObservations = independentObservations,
  rows,
  conditionCombinations,
  onChange,
}: Readonly<{
  contract?: StructureContract;
  initialObservations?: readonly CanonicalAdaptiveObservation[];
  rows?: readonly CanonicalWorksheetRow[];
  conditionCombinations?: WorksheetConditionCombinations;
  onChange?: (observations: readonly CanonicalAdaptiveObservation[]) => void;
}>) {
  const [observations, setObservations] = useState(initialObservations);
  return (
    <>
      <CanonicalMatrixWorksheet
        tableId="canonical-matrix-fixture"
        contract={contract}
        observations={observations}
        rows={rows}
        conditionCombinations={conditionCombinations}
        onObservationsChange={(next) => {
          setObservations(next);
          onChange?.(next);
        }}
        nextObservationId={nextObservationId}
        nextExperimentalUnitIdentity={nextExperimentalUnitIdentity}
      />
      <output data-testid="canonical-observations">{JSON.stringify(observations)}</output>
    </>
  );
}

function currentObservations(): CanonicalAdaptiveObservation[] {
  return JSON.parse(
    screen.getByTestId("canonical-observations").textContent ?? "[]",
  ) as CanonicalAdaptiveObservation[];
}

describe("CanonicalMatrixWorksheet", () => {
  it("shows the canonical matrix without Japanese application copy in English mode", () => {
    setAppLocale("en");
    const view = render(<WorksheetHarness />);
    expectNoJapaneseUi(view.container);
  });
  beforeEach(() => {
    window.localStorage.removeItem("lsaa.adaptive-worksheet.zoom.v1");
  });

  it("generates one required experimental-unit ID column beside each independent condition", () => {
    const layout = canonicalWorksheetFileLayout(makeContract(), [], false);
    const independentColumns = layout.columns.filter(({ role }) => role !== "row_label");
    expect(independentColumns.map(({ role }) => role)).toEqual([
      "identity",
      "value",
      "identity",
      "value",
    ]);
    expect(independentColumns[0]).toMatchObject({
      header: "control / Dish ID",
      semanticKey: "unit_id",
    });
    expect(independentColumns[1]).toMatchObject({
      header: "control / Response",
      semanticKey: "value",
    });
    expect(independentColumns[2]).toMatchObject({
      header: "drug / Dish ID",
      semanticKey: "unit_id",
    });
    expect(independentColumns[3]).toMatchObject({
      header: "drug / Response",
      semanticKey: "value",
    });
    expect(independentColumns[0]?.groupKey).toBe(independentColumns[1]?.groupKey);
    expect(independentColumns[2]?.groupKey).toBe(independentColumns[3]?.groupKey);
    expect(independentColumns[0]?.groupKey).not.toBe(independentColumns[2]?.groupKey);
    expect(
      canonicalWorksheetFileLayout(makeContract(), [], true).columns.some(
        ({ role }) => role === "date",
      ),
    ).toBe(false);

    const matchedLayout = canonicalWorksheetFileLayout(
      makeContract({
        factors: [
          {
            key: "condition",
            label: "Condition",
            levels: ["control", "drug"],
            unitRole: "within_unit",
            relationship: "paired",
            ordered: false,
            referenceLevel: "control",
          },
        ],
        matching: { kind: "matched", identityKey: "unit_id", completeSetsRequired: true },
      }),
      [],
      false,
    );
    expect(matchedLayout.columns.filter(({ role }) => role === "identity")).toHaveLength(1);
    expect(matchedLayout.columns.map(({ role }) => role)).toEqual(["identity", "value", "value"]);
    expect(
      canonicalWorksheetFileLayout(
        makeContract({
          matching: { kind: "matched", identityKey: "unit_id", completeSetsRequired: true },
        }),
        [],
        true,
      ).columns.find(({ role }) => role === "date")?.header,
    ).toBe("この組に共通する実験日");
  });

  it("shows independent unequal-n values in one continuous grid without implying pairing", () => {
    render(<WorksheetHarness />);

    const table = screen.getByRole("table", { name: "条件別連続入力表" });
    expect(table.querySelectorAll("tbody tr")).toHaveLength(5);
    expect(within(table).getByRole("columnheader", { name: "行" })).toBeVisible();
    expect(within(table).getByRole("textbox", { name: "入力行 1・control・Response" })).toHaveValue(
      "10",
    );
    expect(within(table).getByRole("textbox", { name: "入力行 2・control・Response" })).toHaveValue(
      "11",
    );
    expect(within(table).getByRole("textbox", { name: "入力行 1・drug・Response" })).toHaveValue(
      "20",
    );
    expect(within(table).getByRole("textbox", { name: "入力行 2・drug・Response" })).toHaveValue(
      "",
    );
  });

  it("shows editable condition-specific IDs and keeps them separate from row position", () => {
    const onChange = vi.fn();
    render(<WorksheetHarness initialObservations={[]} onChange={onChange} />);
    expect(screen.queryByRole("textbox", { name: /Dish ID/ })).toBeNull();
    fireEvent.click(screen.getByRole("button", { name: "対象・試料IDを表示／編集" }));

    const controlId = screen.getByRole("textbox", {
      name: "入力行 1・control・Dish ID",
    });
    const drugId = screen.getByRole("textbox", {
      name: "入力行 1・drug・Dish ID",
    });
    expect(controlId).toHaveAttribute("data-spreadsheet-row", "0");
    expect(controlId).toHaveAttribute("data-spreadsheet-column", "0");
    expect(drugId).toHaveAttribute("data-spreadsheet-column", "2");
    expect(controlId).toHaveAttribute("placeholder", "値の入力時に自動作成");

    fireEvent.change(controlId, { target: { value: "dish-control-A" } });
    fireEvent.blur(controlId);
    const controlValue = screen.getByRole("textbox", {
      name: "入力行 1・control・Response",
    });
    fireEvent.change(controlValue, { target: { value: "10" } });
    fireEvent.blur(controlValue);

    expect(currentObservations()).toEqual([
      expect.objectContaining({
        factors: { condition: "control" },
        identities: { unit_id: "dish-control-A" },
        values: { value: 10 },
      }),
    ]);
    expect(screen.getByRole("textbox", { name: "入力行 1・control・Dish ID" })).toHaveValue(
      "dish-control-A",
    );
    expect(onChange).toHaveBeenCalledTimes(1);
  });

  it("rejects an independent ID collision without changing the canonical observations", () => {
    const onChange = vi.fn();
    render(<WorksheetHarness onChange={onChange} />);
    fireEvent.click(screen.getByRole("button", { name: "対象・試料IDを表示／編集" }));
    const controlId = screen.getByRole("textbox", {
      name: "入力行 1・control・Dish ID",
    });
    fireEvent.change(controlId, { target: { value: "drug-1" } });
    fireEvent.blur(controlId);

    expect(screen.getByRole("alert")).toHaveTextContent("同じIDがすでにあります");
    expect(currentObservations()).toEqual(independentObservations);
    expect(controlId).toHaveValue("drug-1");
    expect(onChange).not.toHaveBeenCalled();
  });

  it("rejects clearing an ID after its value exists without changing the canonical observations", () => {
    const onChange = vi.fn();
    render(<WorksheetHarness onChange={onChange} />);
    fireEvent.click(screen.getByRole("button", { name: "対象・試料IDを表示／編集" }));
    const controlId = screen.getByRole("textbox", {
      name: "入力行 1・control・Dish ID",
    });
    fireEvent.change(controlId, { target: { value: "" } });
    fireEvent.blur(controlId);

    expect(screen.getByRole("alert")).toHaveTextContent("IDは空にできません");
    expect(currentObservations()).toEqual(independentObservations);
    expect(controlId).toHaveValue("");
    expect(onChange).not.toHaveBeenCalled();
  });

  it("applies a rectangular paste once and rejects an invalid rectangle atomically", () => {
    const onChange = vi.fn();
    render(<WorksheetHarness initialObservations={[]} onChange={onChange} />);
    const start = screen.getByRole("textbox", {
      name: "入力行 1・control・Response",
    });

    fireEvent.paste(start, {
      clipboardData: { getData: () => "10\t30\n20\t40" },
    });

    expect(onChange).toHaveBeenCalledTimes(1);
    expect(screen.getByRole("textbox", { name: "入力行 1・control・Response" })).toHaveValue("10");
    expect(screen.getByRole("textbox", { name: "入力行 1・drug・Response" })).toHaveValue("30");
    expect(screen.getByRole("textbox", { name: "入力行 2・control・Response" })).toHaveValue("20");
    expect(screen.getByRole("textbox", { name: "入力行 2・drug・Response" })).toHaveValue("40");
    const beforeInvalidPaste = currentObservations();

    fireEvent.paste(start, {
      clipboardData: { getData: () => "100\tnot-a-number\n200\t400" },
    });

    expect(onChange).toHaveBeenCalledTimes(1);
    expect(screen.getByRole("alert")).toHaveTextContent("既存の値は変更していません");
    expect(currentObservations()).toEqual(beforeInvalidPaste);
    expect(screen.getByRole("textbox", { name: "入力行 1・control・Response" })).toHaveValue("10");
  });

  it("commits the exact visible value when blur occurs before a React draft render", () => {
    render(<WorksheetHarness initialObservations={[]} />);
    const cell = screen.getByRole("textbox", {
      name: "入力行 1・control・Response",
    }) as HTMLInputElement;
    const nativeValueSetter = Object.getOwnPropertyDescriptor(
      HTMLInputElement.prototype,
      "value",
    )?.set;
    expect(nativeValueSetter).toBeDefined();

    // Reproduce the integrity boundary directly: the browser-visible value
    // has advanced, while React has not yet rendered an onChange update.
    nativeValueSetter!.call(cell, "101");
    expect(cell).toHaveValue("101");
    fireEvent.blur(cell);

    expect(cell).toHaveValue("101");
    expect(currentObservations()).toEqual([
      expect.objectContaining({
        factors: { condition: "control" },
        values: { value: 101 },
      }),
    ]);
  });

  it("keeps keyboard, overwrite, decimal, and view values identical to canonical observations", () => {
    function IntegrityHarness() {
      const [observations, setObservations] = useState<readonly CanonicalAdaptiveObservation[]>([]);
      const [mode, setMode] = useState<"compact" | "expanded">("compact");
      return (
        <>
          <AdaptiveCanonicalSpreadsheet
            contract={makeContract()}
            observations={observations}
            mode={mode}
            onModeChange={setMode}
            onObservationsChange={setObservations}
            nextObservationId={nextObservationId}
            nextExperimentalUnitIdentity={nextExperimentalUnitIdentity}
            worksheetRows={[]}
          />
          <output data-testid="canonical-observations">{JSON.stringify(observations)}</output>
        </>
      );
    }
    render(<IntegrityHarness />);
    const labels = [
      "入力行 1・control・Response",
      "入力行 1・drug・Response",
      "入力行 2・control・Response",
      "入力行 2・drug・Response",
    ];
    const values = ["97", "60", "101", "55"];

    labels.forEach((label, index) => {
      const input = screen.getByRole("textbox", { name: label });
      input.focus();
      fireEvent.change(input, { target: { value: values[index] } });
      fireEvent.keyDown(input, { key: "Tab" });
    });

    const overwrite = screen.getByRole("textbox", { name: labels[0] });
    fireEvent.change(overwrite, { target: { value: "12.5" } });
    fireEvent.blur(overwrite);

    const canonicalValues = currentObservations().map(({ values: rowValues }) => rowValues.value);
    expect(canonicalValues).toEqual([12.5, 60, 101, 55]);
    ["12.5", "60", "101", "55"].forEach((value, index) => {
      expect(screen.getByRole("textbox", { name: labels[index] })).toHaveValue(value);
    });

    fireEvent.click(screen.getByRole("button", { name: "1測定1行" }));
    const expanded = screen.getByRole("table", { name: "すべての値を表示" });
    expect(within(expanded).getByDisplayValue("12.5")).toBeVisible();
    expect(within(expanded).getByDisplayValue("60")).toBeVisible();
    expect(within(expanded).getByDisplayValue("101")).toBeVisible();
    expect(within(expanded).getByDisplayValue("55")).toBeVisible();
    expect(within(expanded).queryByDisplayValue("97101")).toBeNull();
  });

  it("uses an independent ID entered before a rectangular value paste", () => {
    render(<WorksheetHarness initialObservations={[]} />);
    fireEvent.click(screen.getByRole("button", { name: "対象・試料IDを表示／編集" }));
    const controlId = screen.getByRole("textbox", {
      name: "入力行 1・control・Dish ID",
    });
    fireEvent.change(controlId, { target: { value: "dish-control-A" } });
    fireEvent.blur(controlId);

    fireEvent.paste(screen.getByRole("textbox", { name: "入力行 1・control・Response" }), {
      clipboardData: { getData: () => "10\t30" },
    });

    expect(currentObservations()).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          factors: { condition: "control" },
          identities: { unit_id: "dish-control-A" },
          values: { value: 10 },
        }),
        expect.objectContaining({
          factors: { condition: "drug" },
          identities: { unit_id: "unit.drug.1" },
          values: { value: 30 },
        }),
      ]),
    );
  });

  it("imports a CSV against the generated headers and keeps source lineage in the commit", async () => {
    const onFileImport = vi.fn();
    function FileHarness() {
      const [observations, setObservations] = useState<readonly CanonicalAdaptiveObservation[]>([]);
      return (
        <CanonicalMatrixWorksheet
          tableId="canonical-file-fixture"
          contract={makeContract()}
          observations={observations}
          onObservationsChange={setObservations}
          onFileImport={(result) => {
            onFileImport(result);
            setObservations(result.observations);
          }}
          nextObservationId={nextObservationId}
          nextExperimentalUnitIdentity={nextExperimentalUnitIdentity}
        />
      );
    }
    render(<FileHarness />);
    const layout = canonicalWorksheetFileLayout(makeContract(), [], false);
    const headers = layout.columns.map(({ header }) => header).join(",");
    const file = new File(
      [`${headers}\n1,control-1,10,,\n2,control-2,11,drug-1,20`],
      "worksheet.csv",
      { type: "text/csv" },
    );
    Object.defineProperty(file, "text", {
      value: async () => `${headers}\n1,control-1,10,,\n2,control-2,11,drug-1,20`,
    });
    fireEvent.change(screen.getByLabelText("CSV / TSV / TXTファイルを読み込む"), {
      target: { files: [file] },
    });

    await waitFor(() => expect(onFileImport).toHaveBeenCalledTimes(1));
    expect(onFileImport.mock.calls[0]![0]).toMatchObject({
      rawLineage: { sourceKind: "csv", sourceLabel: "worksheet.csv" },
      mapping: { delimiter: "comma", headerRow: 1 },
    });
    expect(onFileImport.mock.calls[0]![0].observations).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          factors: { condition: "control" },
          values: { value: 10 },
          identities: { unit_id: "control-1" },
          sourceRow: 2,
        }),
        expect.objectContaining({
          factors: { condition: "control" },
          values: { value: 11 },
          identities: { unit_id: "control-2" },
          sourceRow: 3,
        }),
        expect.objectContaining({
          factors: { condition: "drug" },
          values: { value: 20 },
          identities: { unit_id: "drug-1" },
          sourceRow: 3,
        }),
      ]),
    );
    expect(screen.getByRole("status")).toHaveTextContent("worksheet.csvを読み込みました");
  });

  it("rejects a missing independent-unit ID when that condition has a value, atomically", async () => {
    const onChange = vi.fn();
    render(<WorksheetHarness initialObservations={[]} onChange={onChange} />);
    const layout = canonicalWorksheetFileLayout(makeContract(), [], false);
    const headers = layout.columns.map(({ header }) => header).join(",");
    const fileText = `${headers}\n1,,10,drug-1,20`;
    const file = new File([fileText], "missing-id.csv", { type: "text/csv" });
    Object.defineProperty(file, "text", { value: async () => fileText });
    fireEvent.change(screen.getByLabelText("CSV / TSV / TXTファイルを読み込む"), {
      target: { files: [file] },
    });

    await waitFor(() => expect(screen.getByRole("alert")).toHaveTextContent("IDがありません"));
    expect(onChange).not.toHaveBeenCalled();
    expect(currentObservations()).toEqual([]);
  });

  it("rejects duplicate independent-unit IDs within or across conditions atomically", async () => {
    const onChange = vi.fn();
    render(<WorksheetHarness initialObservations={[]} onChange={onChange} />);
    const layout = canonicalWorksheetFileLayout(makeContract(), [], false);
    const headers = layout.columns.map(({ header }) => header).join(",");
    const duplicateWithinCondition = `${headers}\n1,control-1,10,drug-1,20\n2,control-1,11,,`;
    const firstFile = new File([duplicateWithinCondition], "duplicate-within.csv", {
      type: "text/csv",
    });
    Object.defineProperty(firstFile, "text", { value: async () => duplicateWithinCondition });
    fireEvent.change(screen.getByLabelText("CSV / TSV / TXTファイルを読み込む"), {
      target: { files: [firstFile] },
    });
    await waitFor(() => expect(screen.getByRole("alert")).toHaveTextContent("ID「control-1」"));
    expect(onChange).not.toHaveBeenCalled();
    expect(currentObservations()).toEqual([]);

    const duplicateAcrossConditions = `${headers}\n1,same-id,10,same-id,20`;
    const secondFile = new File([duplicateAcrossConditions], "duplicate-across.csv", {
      type: "text/csv",
    });
    Object.defineProperty(secondFile, "text", { value: async () => duplicateAcrossConditions });
    fireEvent.change(screen.getByLabelText("CSV / TSV / TXTファイルを読み込む"), {
      target: { files: [secondFile] },
    });
    await waitFor(() => expect(screen.getByRole("alert")).toHaveTextContent("ID「same-id」"));
    expect(onChange).not.toHaveBeenCalled();
    expect(currentObservations()).toEqual([]);
  });

  it("uses independent IDs rather than row alignment when updating existing observations", async () => {
    const onFileImport = vi.fn();
    function FileHarness() {
      const [observations, setObservations] =
        useState<readonly CanonicalAdaptiveObservation[]>(independentObservations);
      return (
        <CanonicalMatrixWorksheet
          tableId="identity-reorder-fixture"
          contract={makeContract()}
          observations={observations}
          onObservationsChange={setObservations}
          onFileImport={(result) => {
            onFileImport(result);
            setObservations(result.observations);
          }}
          nextObservationId={nextObservationId}
          nextExperimentalUnitIdentity={nextExperimentalUnitIdentity}
        />
      );
    }
    render(<FileHarness />);
    const layout = canonicalWorksheetFileLayout(makeContract(), independentObservations, false);
    const headers = layout.columns.map(({ header }) => header).join(",");
    const fileText = `${headers}\n1,control-2,101,drug-1,201\n2,control-1,102,,`;
    const file = new File([fileText], "reordered.csv", { type: "text/csv" });
    Object.defineProperty(file, "text", { value: async () => fileText });
    fireEvent.change(screen.getByLabelText("CSV / TSV / TXTファイルを読み込む"), {
      target: { files: [file] },
    });

    await waitFor(() => expect(onFileImport).toHaveBeenCalledTimes(1));
    const imported = onFileImport.mock.calls[0]![0]
      .observations as readonly CanonicalAdaptiveObservation[];
    expect(
      imported
        .filter(({ factors }) => factors.condition === "control")
        .map(({ identities, values, sourceRow }) => [identities.unit_id, values.value, sourceRow]),
    ).toEqual([
      ["control-1", 102, 3],
      ["control-2", 101, 2],
    ]);
    expect(
      imported
        .filter(({ factors }) => factors.condition === "drug")
        .map(({ identities, values, sourceRow }) => [identities.unit_id, values.value, sourceRow]),
    ).toEqual([["drug-1", 201, 2]]);
  });

  it("rejects a non-numeric performed cell atomically", async () => {
    const onChange = vi.fn();
    render(<WorksheetHarness onChange={onChange} />);
    const layout = canonicalWorksheetFileLayout(makeContract(), [], false);
    const headers = layout.columns.map(({ header }) => header).join(",");
    const fileText = `${headers}\n1,control-1,10,drug-1,not-a-number`;
    const file = new File([fileText], "invalid.csv", { type: "text/csv" });
    Object.defineProperty(file, "text", {
      value: async () => fileText,
    });
    fireEvent.change(screen.getByLabelText("CSV / TSV / TXTファイルを読み込む"), {
      target: { files: [file] },
    });

    await waitFor(() => expect(screen.getByRole("alert")).toHaveTextContent("数値として読めない"));
    expect(onChange).not.toHaveBeenCalled();
    expect(currentObservations()).toEqual(independentObservations);
  });

  it("rejects a value in a not-performed condition without changing any other cell", async () => {
    const factorialContract = makeContract({
      factors: [
        {
          key: "sirna",
          label: "siRNA",
          levels: ["Control", "Gene A"],
          unitRole: "between_unit",
          relationship: "independent",
          ordered: false,
          referenceLevel: "Control",
        },
        {
          key: "dox",
          label: "Dox",
          levels: ["−", "+"],
          unitRole: "between_unit",
          relationship: "independent",
          ordered: false,
          referenceLevel: "−",
        },
      ],
    });
    const combinations = [
      { labels: ["Control", "−"], displayLabel: "Control × −", status: "performed" },
      { labels: ["Control", "+"], displayLabel: "Control × +", status: "not_performed" },
      { labels: ["Gene A", "−"], displayLabel: "Gene A × −", status: "performed" },
      { labels: ["Gene A", "+"], displayLabel: "Gene A × +", status: "performed" },
    ] as const;
    const onChange = vi.fn();
    render(
      <WorksheetHarness
        contract={factorialContract}
        conditionCombinations={combinations}
        initialObservations={[]}
        onChange={onChange}
      />,
    );
    const layout = canonicalWorksheetFileLayout(factorialContract, [], false);
    const headers = layout.columns.map(({ header }) => header).join(",");
    const fileText = `${headers}\n1,control-minus,10,control-plus,99,gene-minus,20,gene-plus,30`;
    const file = new File([fileText], "inactive.csv", { type: "text/csv" });
    Object.defineProperty(file, "text", { value: async () => fileText });
    fireEvent.change(screen.getByLabelText("CSV / TSV / TXTファイルを読み込む"), {
      target: { files: [file] },
    });

    await waitFor(() => expect(screen.getByRole("alert")).toHaveTextContent("実施していない条件"));
    expect(onChange).not.toHaveBeenCalled();
    expect(currentObservations()).toEqual([]);
  });

  it("shares the declared matched identity across condition cells in the same row", () => {
    const matchedContract = makeContract({
      factors: [
        {
          key: "condition",
          label: "Condition",
          levels: ["control", "drug"],
          unitRole: "within_unit",
          relationship: "paired",
          ordered: false,
          referenceLevel: "control",
        },
      ],
      matching: {
        kind: "matched",
        identityKey: "unit_id",
        completeSetsRequired: true,
      },
    });
    const matchedObservations = [
      makeObservation({
        id: "obs.animal.1.control",
        value: 10,
        factors: { condition: "control" },
        identities: { unit_id: "animal-1" },
      }),
      makeObservation({
        id: "obs.animal.1.drug",
        value: 12,
        factors: { condition: "drug" },
        identities: { unit_id: "animal-1" },
      }),
      makeObservation({
        id: "obs.animal.2.control",
        value: 20,
        factors: { condition: "control" },
        identities: { unit_id: "animal-2" },
      }),
    ];
    render(
      <WorksheetHarness contract={matchedContract} initialObservations={matchedObservations} />,
    );

    expect(screen.getByText("同じIDの条件は対応")).toBeVisible();
    const missingDrug = screen.getByRole("textbox", {
      name: "animal-2・drug・Response",
    });
    fireEvent.change(missingDrug, { target: { value: "22" } });
    fireEvent.blur(missingDrug);

    const observations = currentObservations();
    const secondRow = observations.filter(({ identities }) => identities.unit_id === "animal-2");
    expect(secondRow).toHaveLength(2);
    expect(secondRow.map(({ factors }) => factors.condition)).toEqual(["control", "drug"]);
    expect(secondRow.map(({ observationId }) => observationId)).toContain("obs.animal.2.control");
  });

  it("keeps Tab focus in the second matched row after committing its first condition", () => {
    const matchedContract = makeContract({
      factors: [
        {
          key: "condition",
          label: "Condition",
          levels: ["control", "drug"],
          unitRole: "within_unit",
          relationship: "paired",
          ordered: false,
          referenceLevel: "control",
        },
      ],
      matching: {
        kind: "matched",
        identityKey: "unit_id",
        completeSetsRequired: false,
      },
    });
    const matchedObservations = [
      makeObservation({
        id: "obs.cell.1.control",
        value: 10,
        factors: { condition: "control" },
        identities: { unit_id: "Cell 1" },
      }),
      makeObservation({
        id: "obs.cell.1.drug",
        value: 12,
        factors: { condition: "drug" },
        identities: { unit_id: "Cell 1" },
      }),
      makeObservation({
        id: "obs.cell.2.control",
        value: 20,
        factors: { condition: "control" },
        identities: { unit_id: "Cell 2" },
      }),
    ];
    render(
      <WorksheetHarness contract={matchedContract} initialObservations={matchedObservations} />,
    );

    const secondIdentity = screen.getByRole("textbox", { name: "Dish ID 2" });
    const secondControl = screen.getByRole("textbox", { name: "Cell 2・control・Response" });
    const secondDrug = screen.getByRole("textbox", { name: "Cell 2・drug・Response" });

    secondIdentity.focus();
    fireEvent.keyDown(secondIdentity, { key: "Tab" });
    expect(secondControl).toHaveFocus();
    fireEvent.change(secondControl, { target: { value: "20.5" } });
    fireEvent.keyDown(secondControl, { key: "Tab" });

    expect(secondDrug).toHaveFocus();
    expect(currentObservations()).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          identities: { unit_id: "Cell 2" },
          factors: { condition: "control" },
          values: { value: 20.5 },
        }),
      ]),
    );
  });

  it("edits an explicit matched row ID across every condition without using row alignment", () => {
    const matchedContract = makeContract({
      factors: [
        {
          key: "condition",
          label: "Condition",
          levels: ["control", "drug"],
          unitRole: "within_unit",
          relationship: "paired",
          ordered: false,
          referenceLevel: "control",
        },
      ],
      matching: {
        kind: "matched",
        identityKey: "unit_id",
        completeSetsRequired: true,
      },
    });
    const matchedObservations = [
      makeObservation({
        id: "obs.animal.1.control",
        value: 10,
        factors: { condition: "control" },
        identities: { unit_id: "animal-1" },
      }),
      makeObservation({
        id: "obs.animal.1.drug",
        value: 12,
        factors: { condition: "drug" },
        identities: { unit_id: "animal-1" },
      }),
      makeObservation({
        id: "obs.animal.2.control",
        value: 20,
        factors: { condition: "control" },
        identities: { unit_id: "animal-2" },
      }),
    ];
    render(
      <WorksheetHarness contract={matchedContract} initialObservations={matchedObservations} />,
    );

    const firstIdentity = screen.getByRole("textbox", { name: "Dish ID 1" });
    expect(firstIdentity).toHaveValue("animal-1");
    fireEvent.change(firstIdentity, { target: { value: "Animal A" } });
    fireEvent.blur(firstIdentity);

    const renamed = currentObservations().filter(
      ({ identities }) => identities.unit_id === "Animal A",
    );
    expect(renamed).toHaveLength(2);
    expect(renamed.map(({ factors }) => factors.condition)).toEqual(["control", "drug"]);
    expect(renamed.map(({ observationId }) => observationId)).toEqual([
      "obs.animal.1.control",
      "obs.animal.1.drug",
    ]);

    fireEvent.change(firstIdentity, { target: { value: "animal-2" } });
    fireEvent.blur(firstIdentity);
    expect(screen.getByRole("alert")).toHaveTextContent("同じIDがすでにあります");
    expect(
      currentObservations().filter(({ identities }) => identities.unit_id === "Animal A"),
    ).toHaveLength(2);
  });

  it("renders each factor as a separate multi-level header without flattening combinations", () => {
    const factorialContract = makeContract({
      factors: [
        {
          key: "sirna",
          label: "siRNA",
          levels: ["Control", "Gene A"],
          unitRole: "between_unit",
          relationship: "independent",
          ordered: false,
          referenceLevel: "Control",
        },
        {
          key: "dox",
          label: "Dox",
          levels: ["−", "+"],
          unitRole: "between_unit",
          relationship: "independent",
          ordered: false,
          referenceLevel: "−",
        },
      ],
    });
    render(<WorksheetHarness contract={factorialContract} initialObservations={[]} />);

    const table = screen.getByRole("table", { name: "条件別連続入力表" });
    const headerRows = [...table.querySelectorAll("thead tr")];
    expect(headerRows).toHaveLength(3);

    const sirnaHeaders = [...headerRows[0]!.querySelectorAll("th")];
    expect(sirnaHeaders.map(({ textContent }) => textContent)).toEqual([
      "siRNA",
      "Control",
      "Gene A",
    ]);
    expect(sirnaHeaders[1]).toHaveAttribute("colspan", "2");
    expect(sirnaHeaders[2]).toHaveAttribute("colspan", "2");

    const doxHeaders = [...headerRows[1]!.querySelectorAll("th")];
    expect(doxHeaders.map(({ textContent }) => textContent)).toEqual(["Dox", "−", "+", "−", "+"]);
    expect([...headerRows[2]!.querySelectorAll("th")]).toHaveLength(5);
  });

  it("only exposes performed condition combinations as editable worksheet cells", () => {
    const factorialContract = makeContract({
      factors: [
        {
          key: "sirna",
          label: "siRNA",
          levels: ["Control", "Gene A"],
          unitRole: "between_unit",
          relationship: "independent",
          ordered: false,
          referenceLevel: "Control",
        },
        {
          key: "dox",
          label: "Dox",
          levels: ["−", "+"],
          unitRole: "between_unit",
          relationship: "independent",
          ordered: false,
          referenceLevel: "−",
        },
      ],
    });
    const conditionCombinations = [
      {
        labels: ["Control", "−"],
        displayLabel: "Control × −",
        status: "performed",
      },
      {
        labels: ["Control", "+"],
        displayLabel: "Control × +",
        status: "not_performed",
      },
      {
        labels: ["Gene A", "−"],
        displayLabel: "Gene A × −",
        status: "unknown",
      },
      {
        labels: ["Gene A", "+"],
        displayLabel: "Gene A × +",
        status: "performed",
      },
    ] as const satisfies WorksheetConditionCombinations;
    const onChange = vi.fn();
    render(
      <WorksheetHarness
        contract={factorialContract}
        initialObservations={[]}
        conditionCombinations={conditionCombinations}
        onChange={onChange}
      />,
    );

    const table = screen.getByRole("table", { name: "条件別連続入力表" });
    const firstRow = table.querySelector("tbody tr");
    expect(firstRow).not.toBeNull();
    const cells = within(firstRow as HTMLTableRowElement).getAllByRole("cell");

    const firstPerformed = within(cells[0]!).getByRole("textbox", {
      name: "入力行 1・Control・−・Response",
    });
    expect(firstPerformed).toBeEnabled();
    expect(within(cells[1]!).queryByRole("textbox")).toBeNull();
    expect(cells[1]).toHaveTextContent("実施していない");
    expect(within(cells[2]!).queryByRole("textbox")).toBeNull();
    expect(cells[2]).toHaveTextContent("未確認");
    expect(
      within(cells[3]!).getByRole("textbox", {
        name: "入力行 1・Gene A・+・Response",
      }),
    ).toBeEnabled();

    fireEvent.change(firstPerformed, { target: { value: "17" } });
    fireEvent.blur(firstPerformed);
    expect(onChange).toHaveBeenCalledTimes(1);
    expect(currentObservations()).toEqual([
      expect.objectContaining({
        factors: { sirna: "Control", dox: "−" },
        values: { value: 17 },
      }),
    ]);
  });

  it("reports an edited experiment date through the row callback", () => {
    const onRowChange = vi.fn();
    const runContract = makeContract({
      unitLevels: [
        { key: "run", label: "Experiment run", role: "block", parentKey: null },
        { key: "unit", label: "Culture dish", role: "experimental_unit", parentKey: "run" },
      ],
      identities: [
        { key: "run_id", label: "Run ID", unitLevelKey: "run", required: true },
        { key: "unit_id", label: "Dish ID", unitLevelKey: "unit", required: true },
      ],
      matching: { kind: "matched", identityKey: "run_id", completeSetsRequired: true },
    });
    const runObservations = independentObservations.map((observation, index) =>
      CanonicalAdaptiveObservationSchema.parse({
        ...observation,
        identities: {
          unit_id: observation.identities.unit_id,
          run_id: index === 1 ? "run-2" : "run-1",
        },
      }),
    );
    const rows: readonly CanonicalWorksheetRow[] = [
      { key: "experiment.1", label: "Exp 1", date: "2026-08-21" },
      { key: "experiment.2", label: "Exp 2", date: "" },
    ];
    render(
      <CanonicalMatrixWorksheet
        tableId="dated-canonical-matrix"
        contract={runContract}
        observations={runObservations}
        rows={rows}
        showExperimentDate
        onRowChange={onRowChange}
        onObservationsChange={vi.fn()}
        nextObservationId={nextObservationId}
        nextExperimentalUnitIdentity={nextExperimentalUnitIdentity}
      />,
    );

    expect(
      screen.getByRole("columnheader", { name: /この組に共通する実験日/ }),
    ).toHaveTextContent(
      "任意・行内の全条件が同じ日の場合のみ。日付から対応関係は決めません",
    );
    const date = screen.getByLabelText("run-1のこの組に共通する実験日");
    expect(date).toHaveValue("2026-08-21");
    fireEvent.change(date, { target: { value: "2026-08-29" } });
    expect(onRowChange).toHaveBeenCalledWith(0, { date: "2026-08-29" });

    const firstValue = screen.getByRole("textbox", {
      name: "run-1・control・Response",
    }) as HTMLInputElement;
    date.focus();
    fireEvent.keyDown(date, { key: "ArrowRight" });
    expect(firstValue).toHaveFocus();
    firstValue.setSelectionRange(0, 0);
    fireEvent.keyDown(firstValue, { key: "ArrowLeft" });
    expect(date).toHaveFocus();
    fireEvent.keyDown(date, { key: "Enter" });
    expect(screen.getByLabelText("run-2のこの組に共通する実験日")).toHaveFocus();
  });

  it("keeps canonical observation IDs unchanged while switching worksheet views", () => {
    const idFactory = vi.fn(nextObservationId);
    const onChange = vi.fn();

    function ViewHarness() {
      const [observations, setObservations] =
        useState<readonly CanonicalAdaptiveObservation[]>(independentObservations);
      const [mode, setMode] = useState<"compact" | "expanded">("compact");
      return (
        <>
          <AdaptiveCanonicalSpreadsheet
            contract={makeContract()}
            observations={observations}
            mode={mode}
            onModeChange={setMode}
            onObservationsChange={(next) => {
              setObservations(next);
              onChange(next);
            }}
            nextObservationId={idFactory}
            nextExperimentalUnitIdentity={nextExperimentalUnitIdentity}
            worksheetRows={[]}
          />
          <output data-testid="view-observation-ids">
            {observations.map(({ observationId }) => observationId).join(",")}
          </output>
        </>
      );
    }

    const rendered = render(<ViewHarness />);
    const initialIds = screen.getByTestId("view-observation-ids").textContent;
    expect(screen.getByRole("table", { name: "条件別連続入力表" })).toBeVisible();
    expect(screen.queryByRole("textbox", { name: "入力行 1・control・Dish ID" })).toBeNull();
    fireEvent.click(screen.getByRole("button", { name: "対象・試料IDを表示／編集" }));
    expect(screen.getByRole("textbox", { name: "入力行 1・control・Dish ID" })).toHaveValue(
      "control-1",
    );

    const zoom = screen.getByRole("combobox", { name: "表の表示倍率" });
    expect(zoom).toHaveValue("100");
    fireEvent.change(zoom, { target: { value: "80" } });
    expect(zoom).toHaveValue("80");
    expect(document.querySelector(".adaptive-canonical-spreadsheet__zoom-surface")).toHaveStyle(
      "--adaptive-sheet-zoom: 0.8",
    );
    fireEvent.click(screen.getByRole("button", { name: "シートを縮小" }));
    expect(zoom).toHaveValue("70");
    expect(screen.getByRole("button", { name: "シートを縮小" })).toBeDisabled();
    expect(
      screen.getByText("表の表示倍率 70%", {
        selector: ".adaptive-canonical-spreadsheet__zoom-status",
      }),
    ).toHaveAttribute("aria-live", "polite");
    fireEvent.click(screen.getByRole("button", { name: "シートを拡大" }));
    expect(zoom).toHaveValue("80");

    fireEvent.click(screen.getByRole("button", { name: "1測定1行" }));
    const expanded = screen.getByRole("table", { name: "すべての値を表示" });
    expect(screen.getByRole("combobox", { name: "表の表示倍率" })).toHaveValue("80");
    expect(within(expanded).getByText("obs.control.1")).toBeVisible();
    expect(within(expanded).getByText("obs.control.2")).toBeVisible();
    expect(within(expanded).getByText("obs.drug.1")).toBeVisible();

    fireEvent.click(screen.getByRole("button", { name: "条件別シート" }));
    fireEvent.click(screen.getByRole("button", { name: "1測定1行" }));
    expect(screen.getByTestId("view-observation-ids")).toHaveTextContent(initialIds ?? "");
    fireEvent.click(screen.getByRole("button", { name: "条件別シート" }));
    fireEvent.click(screen.getByRole("button", { name: "対象・試料IDを表示／編集" }));
    expect(screen.getByRole("textbox", { name: "入力行 1・control・Dish ID" })).toHaveValue(
      "control-1",
    );
    expect(idFactory).not.toHaveBeenCalled();
    expect(onChange).not.toHaveBeenCalled();

    rendered.unmount();
    render(<ViewHarness />);
    expect(screen.getByRole("combobox", { name: "表の表示倍率" })).toHaveValue("80");
  });

  it("keeps an edited matched identity through compact and all-values view changes", () => {
    const matchedContract = makeContract({
      factors: [
        {
          key: "condition",
          label: "Condition",
          levels: ["control", "drug"],
          unitRole: "within_unit",
          relationship: "paired",
          ordered: false,
          referenceLevel: "control",
        },
      ],
      matching: { kind: "matched", identityKey: "unit_id", completeSetsRequired: true },
    });
    const initial = [
      makeObservation({
        id: "obs.matched.control",
        value: 10,
        factors: { condition: "control" },
        identities: { unit_id: "animal-1" },
      }),
      makeObservation({
        id: "obs.matched.drug",
        value: 12,
        factors: { condition: "drug" },
        identities: { unit_id: "animal-1" },
      }),
    ];

    function MatchedViewHarness() {
      const [observations, setObservations] =
        useState<readonly CanonicalAdaptiveObservation[]>(initial);
      const [mode, setMode] = useState<"compact" | "expanded">("compact");
      return (
        <AdaptiveCanonicalSpreadsheet
          contract={matchedContract}
          observations={observations}
          mode={mode}
          onModeChange={setMode}
          onObservationsChange={setObservations}
          nextObservationId={nextObservationId}
          nextExperimentalUnitIdentity={nextExperimentalUnitIdentity}
          worksheetRows={[]}
        />
      );
    }

    render(<MatchedViewHarness />);
    const identity = screen.getByRole("textbox", { name: "Dish ID 1" });
    fireEvent.change(identity, { target: { value: "Animal A" } });
    fireEvent.blur(identity);

    fireEvent.click(screen.getByRole("button", { name: "1測定1行" }));
    expect(screen.getByRole("textbox", { name: "obs.matched.controlのDish ID" })).toHaveValue(
      "Animal A",
    );
    expect(screen.getByRole("textbox", { name: "obs.matched.drugのDish ID" })).toHaveValue(
      "Animal A",
    );
    fireEvent.click(screen.getByRole("button", { name: "条件別シート" }));
    expect(screen.getByRole("textbox", { name: "Dish ID 1" })).toHaveValue("Animal A");
  });

  it("keeps proportion counts editable and shows the calculated percentage as read-only", () => {
    const contract = makeContract({
      readouts: [
        {
          key: "ciliated_rate",
          label: "Ciliated cells",
          valueType: "proportion_counts",
          representation: "proportion_counts",
          componentKeys: ["numerator", "denominator"],
          referenceRole: "none",
          observationLevelKey: "unit",
          axisKeys: [],
        },
      ],
    });
    const observation = CanonicalAdaptiveObservationSchema.parse({
      observationId: "obs.rate.control.1",
      readoutKey: "ciliated_rate",
      identities: { unit_id: "control-1" },
      factors: { condition: "control" },
      axes: {},
      hierarchy: {},
      values: { ciliated_rate_numerator: 4, ciliated_rate_denominator: 10 },
      missingness: {},
      sourceRow: null,
    });
    render(<WorksheetHarness contract={contract} initialObservations={[observation]} />);

    expect(screen.getAllByRole("columnheader", { name: "該当数" })).toHaveLength(2);
    expect(screen.getAllByRole("columnheader", { name: "総数" })).toHaveLength(2);
    expect(screen.getAllByRole("columnheader", { name: "計算値 (%)" })).toHaveLength(2);
    expect(
      screen.getByLabelText("入力行 1・control・Ciliated cells・計算値 (%)"),
    ).toHaveTextContent("40.0%");

    const total = screen.getByRole("textbox", {
      name: "入力行 1・control・Ciliated cells・総数",
    });
    fireEvent.change(total, { target: { value: "8" } });
    fireEvent.blur(total);
    expect(
      screen.getByLabelText("入力行 1・control・Ciliated cells・計算値 (%)"),
    ).toHaveTextContent("50.0%");
  });

  it("keeps a newly entered proportion row contract-valid between the two cell edits", () => {
    const contract = makeContract({
      readouts: [
        {
          key: "positive_cells",
          label: "Positive cells",
          valueType: "proportion_counts",
          representation: "proportion_counts",
          componentKeys: ["numerator", "denominator"],
          referenceRole: "none",
          observationLevelKey: "unit",
          axisKeys: [],
        },
      ],
    });
    let latest: readonly CanonicalAdaptiveObservation[] = [];
    render(
      <WorksheetHarness
        contract={contract}
        initialObservations={[]}
        onChange={(observations) => {
          latest = observations;
        }}
      />,
    );

    const positive = screen.getByRole("textbox", {
      name: "入力行 1・control・Positive cells・該当数",
    });
    fireEvent.change(positive, { target: { value: "12" } });
    fireEvent.blur(positive);

    expect(latest).toHaveLength(1);
    expect(latest[0]?.values).toEqual({
      positive_cells_numerator: 12,
      positive_cells_denominator: null,
    });
    expect(validateCanonicalObservationsForContract(contract, latest)).toEqual([]);

    const total = screen.getByRole("textbox", {
      name: "入力行 1・control・Positive cells・総数",
    });
    fireEvent.change(total, { target: { value: "20" } });
    fireEvent.blur(total);
    expect(
      screen.getByLabelText("入力行 1・control・Positive cells・計算値 (%)"),
    ).toHaveTextContent("60.0%");
  });

  it("refuses a matrix projection that would hide duplicate canonical records", () => {
    const duplicate = makeObservation({
      id: "obs.control.duplicate",
      value: 99,
      factors: { condition: "control" },
      identities: { unit_id: "control-1" },
    });
    const observations = [independentObservations[0], duplicate];
    const contract = makeContract();
    expect(canEditCanonicalMatrix(contract, observations)).toBe(false);

    render(<WorksheetHarness contract={contract} initialObservations={observations} />);
    expect(screen.queryByRole("table")).toBeNull();
    expect(screen.getByRole("note")).toHaveTextContent("1測定1行");
  });
});

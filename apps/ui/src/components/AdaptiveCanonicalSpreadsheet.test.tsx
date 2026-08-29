import { fireEvent, render, screen, within } from "@testing-library/react";
import { useState } from "react";
import { describe, expect, it, vi } from "vitest";

import {
  CanonicalAdaptiveObservationSchema,
  StructureContractSchema,
  type CanonicalAdaptiveObservation,
  type StructureContract,
} from "@lsaa/domain";
import { AdaptiveCanonicalSpreadsheet } from "./AdaptiveCanonicalSpreadsheet";

function makeContract(overrides: Partial<StructureContract> = {}): StructureContract {
  return StructureContractSchema.parse({
    schemaVersion: "0.1.0",
    contractId: "component.fixture",
    experimentName: "Component fixture",
    experimentDescription: "A scalar component fixture.",
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
        required: false,
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

function makeObservation(
  observationId: string,
  value: number | null,
  condition: string,
  overrides: Partial<CanonicalAdaptiveObservation> = {},
): CanonicalAdaptiveObservation {
  return CanonicalAdaptiveObservationSchema.parse({
    observationId,
    readoutKey: "value",
    identities: {},
    factors: { condition },
    axes: {},
    hierarchy: {},
    values: { value },
    missingness: value === null ? { value: "unknown" } : {},
    sourceRow: null,
    ...overrides,
  });
}

const scalarObservations = [
  makeObservation("obs.c1", 1, "control"),
  makeObservation("obs.c2", 2, "control"),
  makeObservation("obs.d1", 3, "drug"),
];

function Harness({
  initialObservations = scalarObservations,
  contract = makeContract(),
  nextObservationId = ({ targetCoordinates, ordinal }) =>
    `generated.${targetCoordinates.factors.condition}.${ordinal}`,
  nextExperimentalUnitIdentity,
  embedded = false,
  readOnly = false,
}: Readonly<{
  initialObservations?: readonly CanonicalAdaptiveObservation[];
  contract?: StructureContract;
  nextObservationId?: (
    context: Parameters<
      React.ComponentProps<typeof AdaptiveCanonicalSpreadsheet>["nextObservationId"]
    >[0],
  ) => string;
  nextExperimentalUnitIdentity?: NonNullable<
    React.ComponentProps<typeof AdaptiveCanonicalSpreadsheet>["nextExperimentalUnitIdentity"]
  >;
  embedded?: boolean;
  readOnly?: boolean;
}>) {
  const [observations, setObservations] = useState(initialObservations);
  const [mode, setMode] = useState<"compact" | "expanded">("compact");
  return (
    <AdaptiveCanonicalSpreadsheet
      contract={contract}
      observations={observations}
      mode={mode}
      onModeChange={setMode}
      onObservationsChange={setObservations}
      nextObservationId={nextObservationId}
      nextExperimentalUnitIdentity={nextExperimentalUnitIdentity}
      embedded={embedded}
      readOnly={readOnly}
    />
  );
}

function ContinuousHarness({
  initialObservations = [
    makeObservation("obs.c1", 1, "control", { identities: { unit_id: "dish-c1" } }),
    makeObservation("obs.c2", 2, "control", { identities: { unit_id: "dish-c2" } }),
    makeObservation("obs.d1", 3, "drug", { identities: { unit_id: "dish-d1" } }),
  ],
  contract = makeContract(),
  conditionCombinations,
  readOnly = false,
}: Readonly<{
  initialObservations?: readonly CanonicalAdaptiveObservation[];
  contract?: StructureContract;
  conditionCombinations?: React.ComponentProps<
    typeof AdaptiveCanonicalSpreadsheet
  >["conditionCombinations"];
  readOnly?: boolean;
}>) {
  const [observations, setObservations] = useState(initialObservations);
  const [mode, setMode] = useState<"compact" | "expanded">("compact");
  return (
    <AdaptiveCanonicalSpreadsheet
      contract={contract}
      observations={observations}
      mode={mode}
      onModeChange={setMode}
      onObservationsChange={setObservations}
      nextObservationId={({ targetCoordinates, ordinal }) =>
        `generated.${targetCoordinates.factors.condition}.${ordinal}`
      }
      nextExperimentalUnitIdentity={({ targetCoordinates, ordinal }) =>
        `${targetCoordinates.factors.condition} ${ordinal}`
      }
      worksheetRows={[{ key: "run-1", label: "Run 1", date: "" }]}
      conditionCombinations={conditionCombinations}
      readOnly={readOnly}
    />
  );
}

describe("AdaptiveCanonicalSpreadsheet", () => {
  it("shows every independent condition before values exist and creates stable unit identities", () => {
    render(<Harness initialObservations={[]} />);

    const compact = screen.getByRole("table", { name: "条件ごとにまとめて入力" });
    const control = within(compact).getByRole("textbox", {
      name: "Response・Condition=controlの測定値",
    });
    const drug = within(compact).getByRole("textbox", {
      name: "Response・Condition=drugの測定値",
    });
    expect(control).toHaveValue("");
    expect(drug).toHaveValue("");

    fireEvent.change(control, { target: { value: "10\n20" } });
    fireEvent.blur(control);
    fireEvent.click(screen.getByRole("button", { name: "すべての値" }));

    const expanded = screen.getByRole("table", { name: "すべての値を表示" });
    expect(within(expanded).getByText("generated.control.1")).toBeVisible();
    expect(within(expanded).getByDisplayValue("generated.control.1")).toBeVisible();
    expect(within(expanded).getByText("generated.control.2")).toBeVisible();
    expect(within(expanded).getByDisplayValue("generated.control.2")).toBeVisible();
  });

  it("shows one compact row per condition with declared readouts as columns", () => {
    const multiReadoutContract = makeContract({
      factors: [
        {
          key: "condition",
          label: "Condition",
          levels: ["control", "drug", "rescue"],
          unitRole: "between_unit",
          relationship: "independent",
          ordered: false,
          referenceLevel: "control",
        },
      ],
      readouts: [
        {
          key: "response",
          label: "Response",
          valueType: "scalar",
          representation: "scalar",
          componentKeys: ["value"],
          referenceRole: "none",
          observationLevelKey: "unit",
          axisKeys: [],
        },
        {
          key: "count",
          label: "Cell count",
          valueType: "scalar",
          representation: "scalar",
          componentKeys: ["value"],
          referenceRole: "none",
          observationLevelKey: "unit",
          axisKeys: [],
        },
      ],
    });
    const observations = [
      makeObservation("obs.control.response", 1, "control", {
        readoutKey: "response",
        values: { response: 1 },
        identities: { unit_id: "control-1" },
      }),
      makeObservation("obs.control.count", 10, "control", {
        readoutKey: "count",
        values: { count: 10 },
        identities: { unit_id: "control-1" },
      }),
      makeObservation("obs.drug.response", 2, "drug", {
        readoutKey: "response",
        values: { response: 2 },
        identities: { unit_id: "drug-1" },
      }),
      makeObservation("obs.drug.count.1", 20, "drug", {
        readoutKey: "count",
        values: { count: 20 },
        identities: { unit_id: "drug-1" },
      }),
      makeObservation("obs.drug.count.2", 21, "drug", {
        readoutKey: "count",
        values: { count: 21 },
        identities: { unit_id: "drug-2" },
      }),
      makeObservation("obs.rescue.response", 3, "rescue", {
        readoutKey: "response",
        values: { response: 3 },
        identities: { unit_id: "rescue-1" },
      }),
      makeObservation("obs.rescue.count", 30, "rescue", {
        readoutKey: "count",
        values: { count: 30 },
        identities: { unit_id: "rescue-1" },
      }),
    ];
    render(<Harness contract={multiReadoutContract} initialObservations={observations} />);

    const compact = screen.getByRole("table", { name: "条件ごとにまとめて入力" });
    expect(within(compact).getAllByRole("row")).toHaveLength(4);
    expect(
      within(compact)
        .getAllByRole("columnheader")
        .map((header) => header.textContent),
    ).toEqual(["記録ID", "Dish ID", "Condition", "Response", "Cell count", "元データ行"]);
    expect(
      within(compact).getByRole("textbox", {
        name: "Response・Condition=controlの測定値",
      }),
    ).toHaveValue("1");
    expect(
      within(compact).getByRole("textbox", {
        name: "Cell count・Condition=controlの測定値",
      }),
    ).toHaveValue("10");
    expect(
      within(compact).getByRole("textbox", {
        name: "Cell count・Condition=drugの測定値",
      }),
    ).toHaveValue("20\n21");

    fireEvent.click(screen.getByRole("button", { name: "すべての値" }));
    const expanded = screen.getByRole("table", { name: "すべての値を表示" });
    expect(within(expanded).getByRole("columnheader", { name: "測定項目" })).toBeVisible();
    expect(
      expanded.querySelectorAll("tbody tr:not(.adaptive-canonical-spreadsheet__entry-row)"),
    ).toHaveLength(7);
    expect(
      expanded.querySelectorAll("tbody tr.adaptive-canonical-spreadsheet__entry-row"),
    ).toHaveLength(6);
    expect(
      within(expanded).getByRole("textbox", { name: "obs.drug.count.2のCell count" }),
    ).toHaveValue("21");
  });

  it("supports newline/tab paste with unequal group-local n and preserves IDs", () => {
    render(<Harness />);

    const compact = screen.getByRole("table", { name: "条件ごとにまとめて入力" });
    const control = within(compact).getByRole("textbox", {
      name: "Response・Condition=controlの測定値",
    });
    const drug = within(compact).getByRole("textbox", {
      name: "Response・Condition=drugの測定値",
    });
    expect(control).toHaveValue("1\n2");
    expect(drug).toHaveValue("3");

    fireEvent.change(control, { target: { value: "10\t20\t30" } });
    fireEvent.blur(control);

    fireEvent.click(screen.getByRole("button", { name: "すべての値" }));
    const expanded = screen.getByRole("table", { name: "すべての値を表示" });
    expect(within(expanded).getByRole("columnheader", { name: "記録ID" })).toBeVisible();
    expect(within(expanded).getByRole("columnheader", { name: "元データ行" })).toBeVisible();
    expect(within(expanded).getByText("obs.c1")).toBeVisible();
    expect(within(expanded).getByText("obs.c2")).toBeVisible();
    expect(within(expanded).getByText("generated.control.3")).toBeVisible();
    expect(within(expanded).getByDisplayValue("generated.control.3")).toBeVisible();
    expect(within(expanded).getByText("obs.d1")).toBeVisible();
    expect(
      [
        ...expanded.querySelectorAll("tbody tr:not(.adaptive-canonical-spreadsheet__entry-row)"),
      ].some((row) => row.textContent?.includes("drug")),
    ).toBe(true);
    expect(within(expanded).getByRole("textbox", { name: "obs.d1のResponse" })).toHaveValue("3");
    expect(within(expanded).getByRole("textbox", { name: "obs.c1のResponse" })).toHaveValue("10");
    expect(within(expanded).getByRole("textbox", { name: "obs.c2のResponse" })).toHaveValue("20");
    expect(
      within(expanded).getByRole("textbox", { name: "generated.control.3のResponse" }),
    ).toHaveValue("30");
  });

  it("distributes a rectangular paste across adjacent condition rows without regenerating IDs", () => {
    render(<Harness />);
    const control = screen.getByRole("textbox", {
      name: "Response・Condition=controlの測定値",
    });

    fireEvent.paste(control, {
      clipboardData: { getData: () => "10\t30\n20\t40" },
    });

    expect(control).toHaveValue("10\n20");
    expect(screen.getByRole("textbox", { name: "Response・Condition=drugの測定値" })).toHaveValue(
      "30\n40",
    );
    fireEvent.click(screen.getByRole("button", { name: "すべての値" }));
    expect(screen.getByRole("textbox", { name: "obs.c1のResponse" })).toHaveValue("10");
    expect(screen.getByRole("textbox", { name: "obs.c2のResponse" })).toHaveValue("20");
    expect(screen.getByRole("textbox", { name: "obs.d1のResponse" })).toHaveValue("30");
    expect(screen.getByRole("textbox", { name: "generated.drug.2のResponse" })).toHaveValue("40");
  });

  it("moves between canonical cells with spreadsheet keys", () => {
    render(<Harness />);
    const control = screen.getByRole("textbox", {
      name: "Response・Condition=controlの測定値",
    });
    control.focus();
    fireEvent.keyDown(control, { key: "Enter" });
    expect(screen.getByRole("textbox", { name: "Response・Condition=drugの測定値" })).toHaveFocus();
  });

  it("creates the first canonical record directly from the all-values spreadsheet", () => {
    render(<Harness initialObservations={[]} />);
    fireEvent.click(screen.getByRole("button", { name: "すべての値" }));
    const entry = screen.getByRole("textbox", {
      name: "Condition=controlの新しい測定値",
    });
    fireEvent.change(entry, { target: { value: "42" } });
    fireEvent.blur(entry);

    expect(screen.getByRole("textbox", { name: "generated.control.1のResponse" })).toHaveValue(
      "42",
    );
    expect(screen.getByDisplayValue("generated.control.1")).toBeVisible();
  });

  it("offers a contract-driven row form for an empty ordered-axis surface", () => {
    const orderedContract = makeContract({
      identities: [{ key: "unit_id", label: "Dish ID", unitLevelKey: "unit", required: true }],
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
      readouts: [
        {
          key: "signal",
          label: "Signal",
          valueType: "scalar",
          representation: "scalar",
          componentKeys: ["value"],
          referenceRole: "none",
          observationLevelKey: "unit",
          axisKeys: ["time"],
        },
      ],
    });
    render(<Harness contract={orderedContract} initialObservations={[]} />);

    expect(screen.getByRole("form", { name: "新しい測定記録を追加" })).toBeVisible();
    fireEvent.change(screen.getByRole("textbox", { name: "Dish ID" }), {
      target: { value: "dish-ordered-01" },
    });
    fireEvent.change(screen.getByRole("combobox", { name: "Condition" }), {
      target: { value: "control" },
    });
    fireEvent.change(screen.getByRole("combobox", { name: "Time" }), {
      target: { value: "24" },
    });
    fireEvent.change(screen.getByRole("textbox", { name: "Signal・value" }), {
      target: { value: "5.5" },
    });
    fireEvent.click(screen.getByRole("button", { name: "測定行を追加" }));

    fireEvent.click(screen.getByRole("button", { name: "すべての値" }));
    const expanded = screen.getByRole("table", { name: "すべての値を表示" });
    expect(within(expanded).getByDisplayValue("dish-ordered-01")).toBeVisible();
    expect(within(expanded).getByDisplayValue("5.5")).toBeVisible();
    expect(within(expanded).getByText("24")).toBeVisible();
  });

  it("pastes identity and measurement rectangles in the all-values spreadsheet", () => {
    render(<Harness />);
    fireEvent.click(screen.getByRole("button", { name: "すべての値" }));
    const firstIdentity = screen.getByRole("textbox", { name: "obs.c1のDish ID" });
    fireEvent.paste(firstIdentity, {
      clipboardData: { getData: () => "dish-A\t101\ndish-B\t102" },
    });

    expect(screen.getByDisplayValue("dish-A")).toBeVisible();
    expect(screen.getByDisplayValue("dish-B")).toBeVisible();
    expect(screen.getByRole("textbox", { name: "obs.c1のResponse" })).toHaveValue("101");
    expect(screen.getByRole("textbox", { name: "obs.c2のResponse" })).toHaveValue("102");
  });

  it("keeps the same canonical IDs when switching between compact and expanded views", () => {
    render(<Harness />);

    const compact = screen.getByRole("table", { name: "条件ごとにまとめて入力" });
    const compactIdCells = within(compact)
      .getAllByRole("rowheader")
      .filter((cell) => cell.textContent?.includes("obs.c1"));
    expect(compactIdCells).toHaveLength(1);
    expect(compactIdCells[0]).toHaveTextContent("obs.c1");

    fireEvent.click(screen.getByRole("button", { name: "すべての値" }));
    const expanded = screen.getByRole("table", { name: "すべての値を表示" });
    expect(within(expanded).getByText("obs.c1")).toBeVisible();
    expect(within(expanded).getByText("obs.c2")).toBeVisible();
    expect(within(expanded).getByText("obs.d1")).toBeVisible();

    fireEvent.click(screen.getByRole("button", { name: "まとめて入力" }));
    const compactAgain = screen.getByRole("table", { name: "条件ごとにまとめて入力" });
    expect(
      within(compactAgain)
        .getAllByRole("rowheader")
        .find((cell) => cell.textContent?.includes("obs.c1")),
    ).toBeTruthy();
  });

  it("edits and removes individual independent scalar records in the expanded sheet", () => {
    render(<Harness />);
    fireEvent.click(screen.getByRole("button", { name: "すべての値" }));

    const value = screen.getByRole("textbox", { name: "obs.c1のResponse" });
    fireEvent.change(value, { target: { value: "11" } });
    fireEvent.blur(value);
    fireEvent.click(screen.getByRole("button", { name: "obs.c2を削除" }));
    fireEvent.click(screen.getByRole("button", { name: "まとめて入力" }));

    expect(
      screen.getByRole("textbox", { name: "Response・Condition=controlの測定値" }),
    ).toHaveValue("11");
    expect(screen.queryByText("obs.c2")).not.toBeInTheDocument();
  });

  it("moves focus to the next, previous, then compact-entry control after row deletion", () => {
    render(<Harness />);
    fireEvent.click(screen.getByRole("button", { name: "すべての値" }));

    const middleDelete = screen.getByRole("button", { name: "obs.c2を削除" });
    middleDelete.focus();
    fireEvent.click(middleDelete);
    expect(screen.getByRole("button", { name: "obs.d1を削除" })).toHaveFocus();

    fireEvent.click(screen.getByRole("button", { name: "obs.d1を削除" }));
    expect(screen.getByRole("button", { name: "obs.c1を削除" })).toHaveFocus();

    fireEvent.click(screen.getByRole("button", { name: "obs.c1を削除" }));
    expect(screen.getByRole("button", { name: "まとめて入力" })).toHaveFocus();
  });

  it("does not expose compact editing for matched records and keeps identity in expanded view", () => {
    const contract = makeContract({
      identities: [{ key: "unit_id", label: "Dish ID", unitLevelKey: "unit", required: true }],
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
    const observations = [
      makeObservation("obs.pair.control", 10, "control", {
        identities: { unit_id: "dish-1" },
      }),
      makeObservation("obs.pair.drug", 12, "drug", {
        identities: { unit_id: "dish-1" },
      }),
    ];
    render(<Harness contract={contract} initialObservations={observations} />);

    const compact = screen.getByRole("table", { name: "条件ごとにまとめて表示" });
    expect(within(compact).queryByRole("textbox")).toBeNull();
    expect(within(compact).getByText("10")).toBeVisible();
    expect(screen.getByRole("status")).toHaveTextContent("すべての値");

    fireEvent.click(screen.getByRole("button", { name: "すべての値" }));
    const expanded = screen.getByRole("table", { name: "すべての値を表示" });
    expect(within(expanded).getAllByDisplayValue("dish-1")).toHaveLength(2);
    expect(within(expanded).getByText("obs.pair.control")).toBeVisible();
    expect(within(expanded).getByText("obs.pair.drug")).toBeVisible();
    expect(within(expanded).queryByPlaceholderText("新しい値")).toBeNull();
  });

  it("shows identity, factor, axis, hierarchy, typed values, missingness, source row, and ID", () => {
    const contract = makeContract({
      unitLevels: [
        { key: "dish", label: "Dish", role: "experimental_unit", parentKey: null },
        { key: "cell", label: "Cell", role: "subsample", parentKey: "dish" },
      ],
      experimentalUnitLevelKey: "dish",
      identities: [
        { key: "dish_id", label: "Dish ID", unitLevelKey: "dish", required: true },
        { key: "cell_id", label: "Cell ID", unitLevelKey: "cell", required: true },
      ],
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
      readouts: [
        {
          key: "rate",
          label: "Positive rate",
          valueType: "proportion_counts",
          representation: "proportion_counts",
          componentKeys: ["positive", "total"],
          referenceRole: "none",
          observationLevelKey: "cell",
          axisKeys: ["time"],
        },
      ],
      matching: { kind: "matched", identityKey: "dish_id", completeSetsRequired: false },
      allowedMissingness: ["unknown", "not_collected"],
    });
    const observation = CanonicalAdaptiveObservationSchema.parse({
      observationId: "obs.rich.1",
      readoutKey: "rate",
      identities: { dish_id: "dish-1", cell_id: "cell-7" },
      factors: { condition: "control" },
      axes: { time: 24 },
      hierarchy: { dish: "dish-1", cell: "cell-7" },
      values: { positive: 2, total: null },
      missingness: { total: "not_collected" },
      sourceRow: 8,
    });
    render(<Harness contract={contract} initialObservations={[observation]} />);

    fireEvent.click(screen.getByRole("button", { name: "すべての値" }));
    const expanded = screen.getByRole("table", { name: "すべての値を表示" });
    const expandedText = expanded.textContent ?? "";
    expect(expandedText).toContain("obs.rich.1");
    expect(expandedText).toContain("dish-1");
    expect(expandedText).toContain("cell-7");
    expect(expandedText).toContain("control");
    expect(expandedText).toContain("24");
    expect(expandedText).toContain("2");
    expect(expandedText).toContain("not_collected");
    expect(expandedText).toContain("8");
    expect(within(expanded).getByRole("columnheader", { name: "元データ行" })).toBeVisible();
  });

  it("does not call the ID factory while only changing the displayed view", () => {
    const nextObservationId = vi.fn(() => "should-not-be-used");
    render(<Harness nextObservationId={nextObservationId} />);
    fireEvent.click(screen.getByRole("button", { name: "すべての値" }));
    fireEvent.click(screen.getByRole("button", { name: "まとめて入力" }));
    expect(nextObservationId).not.toHaveBeenCalled();
  });

  it("does not delete an untouched missing record when its blank editor loses focus", () => {
    render(<Harness initialObservations={[makeObservation("obs.missing", null, "control")]} />);
    fireEvent.click(screen.getByRole("button", { name: "すべての値" }));
    expect(screen.getByRole("table", { name: "すべての値を表示" })).toHaveTextContent(
      "obs.missing",
    );
  });

  it("keeps internal columns out of embedded views and uses the human unit identity for actions", () => {
    const observations = [
      makeObservation("obs.control.1", 10, "control", {
        identities: { unit_id: "control 1" },
      }),
    ];
    render(<Harness initialObservations={observations} embedded />);

    const compact = screen.getByRole("table", { name: "条件ごとにまとめて入力" });
    expect(within(compact).queryByRole("columnheader", { name: "記録ID" })).toBeNull();
    expect(within(compact).queryByRole("columnheader", { name: "元データ行" })).toBeNull();
    expect(within(compact).queryByRole("columnheader", { name: "Dish ID" })).toBeNull();
    expect(within(compact).getByRole("columnheader", { name: "Condition" })).toBeVisible();

    fireEvent.click(screen.getByRole("button", { name: "すべての値" }));
    const expanded = screen.getByRole("table", { name: "すべての値を表示" });
    expect(within(expanded).queryByRole("columnheader", { name: "記録ID" })).toBeNull();
    expect(within(expanded).queryByRole("columnheader", { name: "元データ行" })).toBeNull();
    expect(within(expanded).getByRole("columnheader", { name: "Dish ID" })).toBeVisible();
    const identity = within(expanded).getByRole("textbox", { name: "control 1のDish ID" });
    expect(identity).toHaveValue("control 1");
    fireEvent.change(identity, { target: { value: "dish-A" } });
    fireEvent.blur(identity);
    expect(within(expanded).getByRole("textbox", { name: "dish-AのResponse" })).toHaveValue("10");
    expect(within(expanded).getByRole("button", { name: "dish-Aを削除" })).toBeVisible();
  });

  it("does not collapse independent n by accepting duplicate researcher-facing identities", () => {
    const observations = [
      makeObservation("obs.control.1", 10, "control", {
        identities: { unit_id: "dish-A" },
      }),
      makeObservation("obs.control.2", 11, "control", {
        identities: { unit_id: "dish-B" },
      }),
    ];
    render(<Harness initialObservations={observations} embedded />);
    fireEvent.click(screen.getByRole("button", { name: "すべての値" }));

    const secondIdentity = screen.getByRole("textbox", { name: "dish-BのDish ID" });
    fireEvent.change(secondIdentity, { target: { value: "dish-A" } });
    fireEvent.blur(secondIdentity);

    expect(screen.getByRole("alert")).toHaveTextContent("同じ名前がすでにあります");
    expect(screen.getByRole("textbox", { name: "dish-BのResponse" })).toHaveValue("11");
  });

  it("propagates an identity correction across readouts for the same biological unit", () => {
    const contract = makeContract({
      readouts: [
        {
          key: "response",
          label: "Response",
          valueType: "scalar",
          representation: "scalar",
          componentKeys: ["value"],
          referenceRole: "none",
          observationLevelKey: "unit",
          axisKeys: [],
        },
        {
          key: "count",
          label: "Cell count",
          valueType: "scalar",
          representation: "scalar",
          componentKeys: ["value"],
          referenceRole: "none",
          observationLevelKey: "unit",
          axisKeys: [],
        },
      ],
    });
    const observations = [
      makeObservation("obs.unit.response", 10, "control", {
        readoutKey: "response",
        values: { response: 10 },
        identities: { unit_id: "dish-1" },
      }),
      makeObservation("obs.unit.count", 100, "control", {
        readoutKey: "count",
        values: { count: 100 },
        identities: { unit_id: "dish-1" },
      }),
    ];
    render(<Harness contract={contract} initialObservations={observations} embedded />);
    fireEvent.click(screen.getByRole("button", { name: "すべての値" }));

    const identities = screen.getAllByRole("textbox", { name: "dish-1のDish ID" });
    expect(identities).toHaveLength(2);
    fireEvent.change(identities[0]!, { target: { value: "dish-renamed" } });
    fireEvent.blur(identities[0]!);

    expect(screen.getAllByRole("textbox", { name: "dish-renamedのDish ID" })).toHaveLength(2);
    expect(screen.queryByRole("alert")).toBeNull();
  });

  it("passes the caller's human identity factory only to newly added independent units", () => {
    const nextExperimentalUnitIdentity = vi.fn(
      ({
        targetCoordinates,
        ordinal,
      }: Parameters<
        NonNullable<
          React.ComponentProps<typeof AdaptiveCanonicalSpreadsheet>["nextExperimentalUnitIdentity"]
        >
      >[0]) => `${targetCoordinates.factors.condition} ${ordinal}`,
    );
    render(<Harness embedded nextExperimentalUnitIdentity={nextExperimentalUnitIdentity} />);
    const compact = screen.getByRole("table", { name: "条件ごとにまとめて入力" });
    const control = within(compact).getByRole("textbox", {
      name: "Response・Condition=controlの測定値",
    });
    fireEvent.change(control, { target: { value: "1\n2\n3" } });
    fireEvent.blur(control);
    fireEvent.click(screen.getByRole("button", { name: "すべての値" }));

    const expanded = screen.getByRole("table", { name: "すべての値を表示" });
    expect(nextExperimentalUnitIdentity).toHaveBeenCalledTimes(1);
    expect(within(expanded).getByRole("textbox", { name: "control 3のDish ID" })).toHaveValue(
      "control 3",
    );
    expect(within(expanded).getByRole("textbox", { name: "control 3のResponse" })).toHaveValue("3");
  });

  it("keeps internal IDs hidden but exposes source-row lineage in the expanded embedded view", () => {
    render(
      <Harness
        embedded
        readOnly
        initialObservations={[makeObservation("obs.raw.4", 4, "control", { sourceRow: 4 })]}
      />,
    );

    const compact = screen.getByRole("table", { name: "条件ごとにまとめて表示" });
    expect(within(compact).queryByRole("textbox")).toBeNull();
    expect(within(compact).queryByRole("columnheader", { name: "記録ID" })).toBeNull();
    expect(within(compact).queryByRole("columnheader", { name: "元データ行" })).toBeNull();
    expect(screen.getByRole("status")).toHaveTextContent("元の表との対応と取込履歴");
    fireEvent.click(screen.getByRole("button", { name: "すべての値" }));
    const expanded = screen.getByRole("table", { name: "すべての値を表示" });
    expect(within(expanded).queryByRole("columnheader", { name: "記録ID" })).toBeNull();
    expect(within(expanded).getByRole("columnheader", { name: "元データ行" })).toBeVisible();
    expect(expanded.querySelector('[data-column-role="source_row"]')).toHaveTextContent("4");
    expect(within(expanded).queryByRole("textbox")).toBeNull();
    expect(within(expanded).queryByRole("button", { name: /削除/ })).toBeNull();
    expect(screen.getByRole("status")).toHaveTextContent("元の表との対応と取込履歴");
  });

  it("honors explicit read-only provenance even when canonical rows have no source-row number", () => {
    render(<Harness embedded readOnly />);

    const compact = screen.getByRole("table", { name: "条件ごとにまとめて表示" });
    expect(within(compact).queryByRole("textbox")).toBeNull();
    expect(compact).toHaveTextContent("1");
    expect(compact).toHaveTextContent("2");
    fireEvent.click(screen.getByRole("button", { name: "すべての値" }));
    const expanded = screen.getByRole("table", { name: "すべての値を表示" });
    expect(within(expanded).queryByRole("textbox")).toBeNull();
    expect(within(expanded).queryByRole("button", { name: /削除/ })).toBeNull();
  });

  it("exposes table semantics and keeps the active view switch focused", () => {
    render(<Harness />);

    const compactButton = screen.getByRole("button", { name: "まとめて入力" });
    const expandedButton = screen.getByRole("button", { name: "すべての値" });
    const compact = screen.getByRole("table", { name: "条件ごとにまとめて入力" });
    expect(compact.querySelector("caption")).toHaveTextContent("条件ごとにまとめて入力");
    expect(within(compact).getAllByRole("rowheader")).toHaveLength(2);
    expect(compactButton).toHaveAttribute("aria-controls", compact.id);
    expect(expandedButton).toHaveAttribute("aria-controls", compact.id);

    expandedButton.focus();
    fireEvent.keyDown(expandedButton, { key: "Enter" });
    fireEvent.click(expandedButton, { detail: 0 });
    expect(expandedButton).toHaveFocus();
    expect(expandedButton).toHaveAttribute("aria-pressed", "true");

    const expanded = screen.getByRole("table", { name: "すべての値を表示" });
    expect(expanded.id).toBe(compact.id);
    expect(expanded.querySelector("caption")).toHaveTextContent("すべての値を表示");
    expect(within(expanded).getAllByRole("rowheader")).toHaveLength(5);
  });

  it("associates a compact validation error with the editor without moving focus", () => {
    render(<Harness />);
    const control = screen.getByRole("textbox", {
      name: "Response・Condition=controlの測定値",
    });

    control.focus();
    fireEvent.change(control, { target: { value: "not-a-number" } });
    fireEvent.blur(control);
    const alert = screen.getByRole("alert");
    expect(control).toHaveAttribute("aria-invalid", "true");
    expect(control).toHaveAttribute("aria-describedby", alert.id);

    control.focus();
    expect(control).toHaveFocus();
    expect(control).toHaveValue("not-a-number");
  });

  it("offers a safe third presentation for continuous scalar data and keeps IDs across views", () => {
    render(<ContinuousHarness />);

    expect(screen.getByRole("table", { name: "条件別連続入力表" })).toBeVisible();
    expect(screen.getByRole("status")).toHaveTextContent(
      "横一行は条件ごとの値を見やすく並べる表示位置",
    );
    expect(screen.getByRole("status")).toHaveTextContent(
      "同じ実験日・実験回・pairを意味しません",
    );
    expect(screen.getByRole("status")).toHaveTextContent(
      "この表示では条件ごとの実験日は入力できません",
    );
    expect(screen.queryByRole("columnheader", { name: /実験日/ })).toBeNull();
    const compactButton = screen.getByRole("button", { name: "まとめて入力" });
    expect(compactButton).toBeVisible();
    expect(screen.getByRole("button", { name: "1測定1行" })).toBeVisible();

    fireEvent.click(compactButton);
    const compact = screen.getByRole("table", { name: "条件ごとにまとめて入力" });
    expect(screen.getByRole("status")).toHaveTextContent("これは平均や統合を行う機能ではなく");
    const control = within(compact).getByRole("textbox", {
      name: "Response・Condition=controlの測定値",
    });
    expect(control).toHaveValue("1\n2");
    fireEvent.change(control, { target: { value: "10\n20\n30" } });
    fireEvent.blur(control);

    fireEvent.click(screen.getByRole("button", { name: "条件別シート" }));
    expect(screen.getByRole("table", { name: "条件別連続入力表" })).toBeVisible();
    fireEvent.click(screen.getByRole("button", { name: "1測定1行" }));
    const expanded = screen.getByRole("table", { name: "すべての値を表示" });
    expect(within(expanded).getByText("obs.c1")).toBeVisible();
    expect(within(expanded).getByText("obs.c2")).toBeVisible();
    expect(within(expanded).getByDisplayValue("10")).toBeVisible();
    expect(within(expanded).getByDisplayValue("20")).toBeVisible();
    expect(within(expanded).getByDisplayValue("30")).toBeVisible();
  });

  it("does not expose compact entry for typed proportion or non-performed conditions", () => {
    const proportionContract = makeContract({
      readouts: [
        {
          key: "rate",
          label: "Positive rate",
          valueType: "proportion_counts",
          representation: "proportion_counts",
          componentKeys: ["positive", "total"],
          referenceRole: "none",
          observationLevelKey: "unit",
          axisKeys: [],
        },
      ],
    });
    render(
      <ContinuousHarness
        contract={proportionContract}
        initialObservations={[
          makeObservation("obs.p1", 1, "control", {
            readoutKey: "rate",
            identities: { unit_id: "dish-p1" },
            values: { rate_positive: 1, rate_total: 2 },
          }),
          makeObservation("obs.p2", 2, "drug", {
            readoutKey: "rate",
            identities: { unit_id: "dish-p2" },
            values: { rate_positive: 2, rate_total: 3 },
          }),
        ]}
      />,
    );
    expect(screen.queryByRole("button", { name: "まとめて入力" })).toBeNull();
    expect(screen.getByRole("table", { name: "条件別連続入力表" })).toBeVisible();

    expect(() => {
      // The compact editor is intentionally also hidden when the condition
      // list says that at least one combination was not performed.
      render(
        <ContinuousHarness
          conditionCombinations={[
            { labels: ["control"], displayLabel: "control", status: "performed" },
            { labels: ["drug"], displayLabel: "drug", status: "not_performed" },
          ]}
        />,
      );
    }).not.toThrow();
    expect(screen.queryAllByRole("button", { name: "まとめて入力" })).toHaveLength(0);
  });
});

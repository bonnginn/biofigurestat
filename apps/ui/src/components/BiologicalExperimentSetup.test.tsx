import { fireEvent, render, screen, within } from "@testing-library/react";
import { vi } from "vitest";
import { selectAdaptiveSurface } from "@lsaa/adaptive-input";

import {
  BiologicalExperimentSetup,
  buildBiologicalExperimentSummary,
  buildConditionCombinations,
  safelyBuildBiologicalSetup,
  type ConditionEntryBlock,
} from "./BiologicalExperimentSetup";

const block = (id: string, name: string, values: string[]): ConditionEntryBlock => ({
  id,
  name,
  showGroups: false,
  groupLabels: ["", "", "", "", ""],
  values: [
    values,
    ["", "", "", "", ""],
    ["", "", "", "", ""],
    ["", "", "", "", ""],
    ["", "", "", "", ""],
  ],
});

describe("BiologicalExperimentSetup pure safety boundary", () => {
  it("summarizes factor levels, biological-unit relation, nested observations, and axis identity", () => {
    const summary = buildBiologicalExperimentSummary({
      blocks: [
        block("treatment", "処理", ["Control", "Drug", "", "", ""]),
        block("stimulus", "刺激", ["なし", "あり", "", "", ""]),
      ],
      receiverLabel: "culture dish",
      readoutLabels: ["細胞面積", "細胞数"],
      relationship: "shared_source",
      sourceLabel: "donor culture",
      sharedSourcePairedBlockId: "stimulus",
      childLabel: "Cell",
      orderedAxis: {
        label: "時間",
        levels: [0, 24],
        sameIdentity: true,
      },
    });

    expect(summary).toContain("処理: Control、Drug");
    expect(summary).toContain("細胞面積、細胞数");
    expect(summary).toContain("donor cultureから分けた別々のculture dish");
    expect(summary).toContain("材料を分けた後に変えた「刺激」");
    expect(summary).toContain(
      "Cellは個別の測定値として残しますが、独立した生物学的なnには数えません",
    );
    expect(summary).toContain("時間（0、24）に沿って、同じculture dishを追って測定します");
  });

  it("does not claim child or axis coverage before multi-readout bindings are chosen", () => {
    const summary = buildBiologicalExperimentSummary({
      blocks: [block("treatment", "処理", ["Control", "Drug", "", "", ""])],
      receiverLabel: "culture dish",
      readoutLabels: ["Viability", "Cell morphology"],
      relationship: "separate",
      sourceLabel: "",
      childLabel: "Cell",
      nestedReadoutLabels: [],
      orderedAxis: {
        label: "時間",
        levels: [0, 24],
        sameIdentity: true,
        readoutLabels: [],
      },
    });
    expect(summary).toContain("Cellごとに測った項目は未選択です");
    expect(summary).toContain("時間（0、24）の系列で測った項目は未選択です");
    expect(summary).not.toContain("Cellは個別の測定値として残します");
  });

  it("creates the complete Cartesian combinations without using empty cells", () => {
    const combinations = buildConditionCombinations([
      block("a", "薬剤", ["0", "10", "", "", ""]),
      block("b", "刺激", ["なし", "あり", "", "", ""]),
    ]);
    expect(combinations.map(({ displayLabel }) => displayLabel)).toEqual([
      "0 × なし",
      "0 × あり",
      "10 × なし",
      "10 × あり",
    ]);
  });

  it("builds a supported shared-source plan and retains every entered combination", () => {
    const blocks = [block("a", "薬剤", ["0", "10", "", "", ""])];
    const combinations = buildConditionCombinations(blocks);
    const built = safelyBuildBiologicalSetup({
      title: "生存率",
      measurementLabel: "細胞生存率",
      valueForm: "single",
      blocks,
      combinations,
      statuses: {},
      receiverLabel: "dish",
      receiverIdLabel: "Dish ID",
      relationship: "shared_source",
      sourceLabel: "実験run",
      sourceIdLabel: "Run ID",
      childLabel: "",
    });
    expect(built.status).toBe("ready");
    if (built.status === "ready") {
      expect(built.result.contract.matching.kind).toBe("matched");
      expect(built.result.conditionCombinations).toHaveLength(2);
      expect(built.result.conditionCombinations.every(({ status }) => status === "performed")).toBe(
        true,
      );
    }
  });

  it("keeps multiple scalar measurements joined to the same structure", () => {
    const blocks = [block("treatment", "処理", ["Control", "Drug", "", "", ""])];
    const combinations = buildConditionCombinations(blocks);
    const built = safelyBuildBiologicalSetup({
      title: "細胞応答",
      measurementLabel: "細胞面積",
      valueForm: "single",
      additionalReadouts: [{ label: "細胞数", valueForm: "single" }],
      blocks,
      combinations,
      statuses: {},
      receiverLabel: "culture dish",
      receiverIdLabel: "Dish ID",
      relationship: "separate",
      sourceLabel: "",
      sourceIdLabel: "",
      childLabel: "",
    });

    expect(built.status).toBe("ready");
    if (built.status === "ready") {
      expect(
        built.result.contract.readouts.map(({ label, representation }) => ({
          label,
          representation,
        })),
      ).toEqual([
        { label: "細胞面積", representation: "scalar" },
        { label: "細胞数", representation: "scalar" },
      ]);
      expect(
        built.result.contract.readouts.every(
          ({ observationLevelKey }) => observationLevelKey === "culturedish",
        ),
      ).toBe(true);
      expect(selectAdaptiveSurface(built.result.contract).surfaceId).toBe(
        "factor_observation_table",
      );
    }
  });

  it("preserves mixed typed measurements and selects the typed record surface", () => {
    const blocks = [block("treatment", "処理", ["Control", "Drug", "", "", ""])];
    const combinations = buildConditionCombinations(blocks);
    const built = safelyBuildBiologicalSetup({
      title: "細胞応答と陽性率",
      measurementLabel: "細胞面積",
      valueForm: "single",
      additionalReadouts: [{ label: "陽性率", valueForm: "positive_total" }],
      blocks,
      combinations,
      statuses: {},
      receiverLabel: "culture dish",
      receiverIdLabel: "Dish ID",
      relationship: "separate",
      sourceLabel: "",
      sourceIdLabel: "",
      childLabel: "",
    });

    expect(built.status).toBe("ready");
    if (built.status === "ready") {
      expect(built.result.contract.readouts.map(({ representation }) => representation)).toEqual([
        "scalar",
        "proportion_counts",
      ]);
      expect(selectAdaptiveSurface(built.result.contract)).toEqual({
        surfaceId: "typed_record_table",
        reasonCodes: ["typed_measurement_bundle"],
      });
    }
  });

  it("stops until mixed dish/Cell readouts are bound, then preserves each grain", () => {
    const blocks = [block("treatment", "処理", ["Control", "Drug", "", "", ""])];
    const combinations = buildConditionCombinations(blocks);
    const common = {
      title: "Viability and morphology",
      measurementLabel: "Viability",
      valueForm: "single" as const,
      additionalReadouts: [{ label: "Cell morphology", valueForm: "single" as const }],
      blocks,
      combinations,
      statuses: {},
      receiverLabel: "culture dish",
      receiverIdLabel: "Dish ID",
      relationship: "separate" as const,
      sourceLabel: "",
      sourceIdLabel: "",
      childLabel: "Cell",
    };
    const unresolved = safelyBuildBiologicalSetup(common);
    expect(unresolved.status).toBe("stopped");
    if (unresolved.status === "stopped") expect(unresolved.reason).toContain("推測せず");

    const built = safelyBuildBiologicalSetup({
      ...common,
      measurementUsesNestedObservation: false,
      additionalReadouts: [
        {
          label: "Cell morphology",
          valueForm: "single",
          usesNestedObservation: true,
        },
      ],
    });
    expect(built.status).toBe("ready");
    if (built.status === "ready") {
      expect(
        built.result.contract.readouts.map(({ label, observationLevelKey }) => ({
          label,
          observationLevelKey,
        })),
      ).toEqual([
        { label: "Viability", observationLevelKey: "culturedish" },
        { label: "Cell morphology", observationLevelKey: "cell" },
      ]);
    }
  });

  it("binds a time-course readout without silently putting an endpoint on the axis", () => {
    const blocks = [block("treatment", "処理", ["Control", "Drug", "", "", ""])];
    const combinations = buildConditionCombinations(blocks);
    const common = {
      title: "Signal time course and endpoint",
      measurementLabel: "Live signal",
      valueForm: "single" as const,
      additionalReadouts: [{ label: "Endpoint viability", valueForm: "single" as const }],
      blocks,
      combinations,
      statuses: {},
      receiverLabel: "culture dish",
      receiverIdLabel: "Dish ID",
      relationship: "separate" as const,
      sourceLabel: "",
      sourceIdLabel: "",
      childLabel: "",
      orderedAxis: { label: "Time", unit: "h", levels: [0, 6, 24], sameIdentity: true as const },
    };
    expect(safelyBuildBiologicalSetup(common).status).toBe("stopped");
    const built = safelyBuildBiologicalSetup({
      ...common,
      measurementUsesOrderedAxis: true,
      additionalReadouts: [
        { label: "Endpoint viability", valueForm: "single", usesOrderedAxis: false },
      ],
    });
    expect(built.status).toBe("ready");
    if (built.status === "ready") {
      expect(built.result.contract.readouts.map(({ axisKeys }) => axisKeys)).toEqual([
        ["time"],
        [],
      ]);
    }
  });

  it("safely keeps aggregate typed readouts at dish level in a mixed nested experiment", () => {
    const blocks = [block("treatment", "処理", ["Control", "Drug", "", "", ""])];
    const combinations = buildConditionCombinations(blocks);
    const built = safelyBuildBiologicalSetup({
      title: "Cell morphology and dish fraction",
      measurementLabel: "Cell morphology",
      valueForm: "single",
      measurementUsesNestedObservation: true,
      additionalReadouts: [{ label: "Positive fraction", valueForm: "positive_total" }],
      blocks,
      combinations,
      statuses: {},
      receiverLabel: "culture dish",
      receiverIdLabel: "Dish ID",
      relationship: "separate",
      sourceLabel: "",
      sourceIdLabel: "",
      childLabel: "Cell",
    });
    expect(built.status).toBe("ready");
    if (built.status === "ready") {
      expect(
        built.result.contract.readouts.map(({ observationLevelKey }) => observationLevelKey),
      ).toEqual(["cell", "culturedish"]);
    }
  });

  it("allows all scalar readouts to share one child and axis only after explicit binding", () => {
    const blocks = [block("treatment", "処理", ["Control", "Drug", "", "", ""])];
    const combinations = buildConditionCombinations(blocks);
    const built = safelyBuildBiologicalSetup({
      title: "Shared Cell time course",
      measurementLabel: "Area",
      valueForm: "single",
      measurementUsesNestedObservation: true,
      measurementUsesOrderedAxis: true,
      additionalReadouts: [
        {
          label: "Intensity",
          valueForm: "single",
          usesNestedObservation: true,
          usesOrderedAxis: true,
        },
      ],
      blocks,
      combinations,
      statuses: {},
      receiverLabel: "culture dish",
      receiverIdLabel: "Dish ID",
      relationship: "separate",
      sourceLabel: "",
      sourceIdLabel: "",
      childLabel: "Cell",
      orderedAxis: { label: "Time", unit: "h", levels: [0, 24], sameIdentity: true },
    });
    expect(built.status).toBe("ready");
    if (built.status === "ready") {
      expect(
        built.result.contract.readouts.every(
          ({ observationLevelKey, axisKeys }) =>
            observationLevelKey === "cell" && axisKeys[0] === "time",
        ),
      ).toBe(true);
    }
  });

  it("keeps the established single-readout nesting and axis inference", () => {
    const blocks = [block("treatment", "処理", ["Control", "Drug", "", "", ""])];
    const combinations = buildConditionCombinations(blocks);
    const built = safelyBuildBiologicalSetup({
      title: "Single Cell signal",
      measurementLabel: "Cell signal",
      valueForm: "single",
      blocks,
      combinations,
      statuses: {},
      receiverLabel: "culture dish",
      receiverIdLabel: "Dish ID",
      relationship: "separate",
      sourceLabel: "",
      sourceIdLabel: "",
      childLabel: "Cell",
      orderedAxis: { label: "Time", unit: "h", levels: [0, 24], sameIdentity: true },
    });
    expect(built.status).toBe("ready");
    if (built.status === "ready") {
      expect(built.result.contract.readouts[0]).toMatchObject({
        observationLevelKey: "cell",
        axisKeys: ["time"],
      });
    }
  });

  it("stops safely for sparse or unknown relationships without changing the supplied blocks", () => {
    const blocks = [block("a", "薬剤", ["0", "10", "", "", ""])];
    const combinations = buildConditionCombinations(blocks);
    const before = JSON.stringify(blocks);
    const sparse = safelyBuildBiologicalSetup({
      title: "",
      measurementLabel: "生存率",
      valueForm: "single",
      blocks,
      combinations,
      statuses: { [combinations[1]!.id]: "not_performed" },
      receiverLabel: "dish",
      receiverIdLabel: "Dish ID",
      relationship: "separate",
      sourceLabel: "",
      sourceIdLabel: "",
      childLabel: "",
    });
    expect(sparse.status).toBe("stopped");
    if (sparse.status === "stopped") expect(sparse.reason).toMatch(/値を残したまま/);
    expect(JSON.stringify(blocks)).toBe(before);
  });
});

describe("BiologicalExperimentSetup researcher-facing UI", () => {
  it("is feature gated and starts with one five-by-five editable block", () => {
    const onReady = vi.fn();
    const { rerender } = render(<BiologicalExperimentSetup enabled={false} onReady={onReady} />);
    expect(screen.queryByRole("heading", { name: "実験の条件と測定内容" })).toBeNull();
    rerender(<BiologicalExperimentSetup enabled onReady={onReady} />);
    expect(screen.getByRole("textbox", { name: "処理・群分け 1の名前" })).toBeVisible();
    expect(screen.getAllByRole("textbox", { name: /行 \d+ 列 \d+/ })).toHaveLength(25);
    expect(screen.getByRole("button", { name: "＋ 処理・群分けを追加" })).toBeVisible();
    expect(
      screen.queryByText(/StructureContract|factor|level|identity|ordered axis|nested|統計/i),
    ).toBeNull();
  });

  it("keeps required questions visible with a labelled live action rail and progressive details", () => {
    render(<BiologicalExperimentSetup enabled onReady={vi.fn()} />);

    expect(screen.getByLabelText("実験タイトル（任意）")).toBeVisible();
    expect(screen.getByRole("heading", { name: "測定した値" })).toBeVisible();
    expect(screen.getByRole("heading", { name: "条件を受けたものと材料のつながり" })).toBeVisible();
    const rail = screen.getByRole("complementary", { name: "現在の実験と操作" });
    expect(within(rail).getByText("現在の実験")).toBeVisible();
    expect(within(rail).getByRole("button", { name: "この内容で入力表を作る" })).toBeVisible();
    expect(screen.getByLabelText("対象・試料の入力について詳しく見る")).toBeVisible();

    expect(screen.queryByLabelText("順序の値 1")).toBeNull();
    fireEvent.click(
      screen.getByRole("checkbox", {
        name: "同じ条件の中で、時間・距離などの順序に沿って測った",
      }),
    );
    expect(screen.getByLabelText("順序の値 1")).toBeVisible();
  });

  it("asks readout-specific child and axis questions only for multiple measurements", () => {
    render(
      <BiologicalExperimentSetup
        enabled
        onReady={vi.fn()}
        initial={{
          measurementLabel: "Cell morphology",
          valueForm: "single",
          additionalReadouts: [{ label: "Endpoint viability", valueForm: "single" }],
          childLabel: "Cell",
          orderedAxis: { label: "時間", unit: "h", levels: [0, 24], sameIdentity: true },
        }}
      />,
    );

    expect(screen.getByText("Cellごとに測った項目")).toBeVisible();
    expect(screen.getByText("この時間で測った項目")).toBeVisible();
    expect(screen.getAllByRole("checkbox", { name: "Cell morphology" })).toHaveLength(2);
    expect(screen.getAllByRole("checkbox", { name: "Endpoint viability" })).toHaveLength(2);
    expect(screen.getByText(/Cellごとに測った項目は未選択です/)).toBeVisible();
    expect(screen.getByText(/時間（0、24）の系列で測った項目は未選択です/)).toBeVisible();
  });

  it("asks only missing biological facts after a Graph-only Statistics handoff", () => {
    render(
      <BiologicalExperimentSetup
        enabled
        onReady={vi.fn()}
        initial={{
          title: "表から作成したGraph",
          measurementLabel: "Cell area",
          conditionBlocks: [{ name: "Condition", levels: ["Control", "Drug"] }],
          statisticsHandoff: true,
          notice: "元表を保持しています。",
        }}
      />,
    );

    expect(screen.getByRole("heading", { name: "統計に必要な実験情報" })).toBeVisible();
    expect(screen.getByText("Condition: Control、Drug。測定: Cell area")).toBeVisible();
    expect(screen.getByRole("heading", { name: "条件を受けたものと材料のつながり" })).toBeVisible();
    expect(screen.queryByRole("heading", { name: "処理・群分け" })).toBeNull();
    expect(screen.queryByRole("heading", { name: "測定した値" })).toBeNull();

    fireEvent.click(screen.getByRole("button", { name: "条件・測定を修正" }));
    expect(screen.getByRole("heading", { name: "処理・群分け" })).toBeVisible();
    expect(screen.getByRole("textbox", { name: "行 1 列 1" })).toHaveValue("Control");
    expect(screen.getByRole("textbox", { name: "行 1 列 2" })).toHaveValue("Drug");
  });

  it("does not announce workspace creation when the retained-table handoff is rejected", () => {
    render(
      <BiologicalExperimentSetup
        enabled
        externalError="IDの対応を確認してください。元の表は保持されています。"
        onReady={() => false}
        initial={{
          title: "表から作成したGraph",
          measurementLabel: "Cell area",
          conditionBlocks: [{ name: "Condition", levels: ["Control", "Drug"] }],
          statisticsHandoff: true,
        }}
      />,
    );
    fireEvent.change(
      screen.getByRole("textbox", { name: "各条件を実験するために用いた対象・試料は？" }),
      { target: { value: "culture dish" } },
    );
    fireEvent.click(screen.getByRole("radio", { name: /条件ごとに別々のもの/ }));
    fireEvent.click(screen.getByRole("button", { name: "この内容で入力表を作る" }));

    expect(screen.getByRole("alert")).toHaveTextContent("IDの対応を確認してください");
    expect(
      screen.queryByText("条件と材料のつながりを確認できました。入力表を作成します。"),
    ).toBeNull();
  });

  it("defaults to all combinations and reveals individual statuses only for exceptions", () => {
    render(<BiologicalExperimentSetup enabled onReady={vi.fn()} />);
    fireEvent.change(screen.getByRole("textbox", { name: "処理・群分け 1の名前" }), {
      target: { value: "薬剤" },
    });
    fireEvent.change(screen.getByRole("textbox", { name: "行 1 列 1" }), {
      target: { value: "0" },
    });

    const allCombinations = screen.getByRole("checkbox", {
      name: "作った組み合わせはすべて実施した",
    });
    expect(allCombinations).toBeChecked();
    expect(screen.queryByRole("combobox", { name: "0の実施状況" })).toBeNull();
    fireEvent.click(allCombinations);
    expect(screen.getByRole("combobox", { name: "0の実施状況" })).toBeVisible();
  });

  it("lets researchers add another readout without redefining conditions", () => {
    const onReady = vi.fn();
    render(<BiologicalExperimentSetup enabled onReady={onReady} />);
    fireEvent.change(screen.getByRole("textbox", { name: "処理・群分け 1の名前" }), {
      target: { value: "処理" },
    });
    fireEvent.change(screen.getByRole("textbox", { name: "行 1 列 1" }), {
      target: { value: "Control" },
    });
    fireEvent.change(screen.getByPlaceholderText("例：細胞生存率"), {
      target: { value: "細胞面積" },
    });
    fireEvent.change(
      screen.getByRole("textbox", { name: "各条件を実験するために用いた対象・試料は？" }),
      {
        target: { value: "culture dish" },
      },
    );
    fireEvent.click(screen.getByRole("radio", { name: /条件ごとに別々のもの/ }));
    fireEvent.click(screen.getByRole("button", { name: "＋ 測定項目を追加" }));
    fireEvent.change(screen.getByRole("textbox", { name: "追加の測定項目 2の名前" }), {
      target: { value: "細胞数" },
    });

    expect(
      within(screen.getByRole("group", { name: "追加の測定項目 2" })).getByRole("radio", {
        name: /1つの数値/,
      }),
    ).toBeChecked();
    fireEvent.click(screen.getByRole("button", { name: "この内容で入力表を作る" }));

    expect(onReady).toHaveBeenCalledTimes(1);
    expect(
      onReady.mock.calls[0]?.[0].contract.readouts.map(
        (readout: { label: string }) => readout.label,
      ),
    ).toEqual(["細胞面積", "細胞数"]);
  });

  it("supports rectangular paste, adding rows and columns, and preserves a stopped plan", () => {
    const onReady = vi.fn();
    render(<BiologicalExperimentSetup enabled onReady={onReady} />);
    fireEvent.change(screen.getByRole("textbox", { name: "処理・群分け 1の名前" }), {
      target: { value: "薬剤" },
    });
    fireEvent.paste(screen.getByRole("textbox", { name: "行 1 列 1" }), {
      clipboardData: { getData: () => "0\t10\n30\t100" },
    });
    expect(screen.getByRole("textbox", { name: "行 2 列 2" })).toHaveValue("100");
    fireEvent.click(screen.getByRole("button", { name: "処理・群分け 1（薬剤）に行を追加" }));
    fireEvent.click(screen.getByRole("button", { name: "処理・群分け 1（薬剤）に列を追加" }));
    expect(screen.getByRole("textbox", { name: "行 6 列 6" })).toBeVisible();
    fireEvent.click(screen.getByRole("button", { name: "この内容で入力表を作る" }));
    expect(screen.getByText(/測定項目と、各条件を実験するために用いた対象・試料/)).toBeVisible();
    expect(screen.getByRole("textbox", { name: "行 2 列 2" })).toHaveValue("100");
    expect(onReady).not.toHaveBeenCalled();
  });

  it("keeps condition-cell labels unique when more than one factor is entered", () => {
    render(<BiologicalExperimentSetup enabled onReady={vi.fn()} />);
    fireEvent.change(screen.getByRole("textbox", { name: "処理・群分け 1の名前" }), {
      target: { value: "siRNA" },
    });
    fireEvent.click(screen.getByRole("button", { name: "＋ 処理・群分けを追加" }));
    fireEvent.change(screen.getByRole("textbox", { name: "処理・群分け 2の名前" }), {
      target: { value: "Dox" },
    });

    expect(screen.getByRole("textbox", { name: "siRNA：行 1 列 1" })).toBeVisible();
    expect(screen.getByRole("textbox", { name: "Dox：行 1 列 1" })).toBeVisible();
    expect(
      screen.getByRole("checkbox", {
        name: "処理・群分け 1（siRNA）の値をまとまり別に表示する",
      }),
    ).toBeVisible();
    expect(
      screen.getByRole("checkbox", {
        name: "処理・群分け 2（Dox）の値をまとまり別に表示する",
      }),
    ).toBeVisible();
    expect(screen.getByRole("button", { name: "処理・群分け 1（siRNA）を削除" })).toBeVisible();
    expect(screen.getByRole("button", { name: "処理・群分け 2（Dox）を削除" })).toBeVisible();
    expect(screen.getByRole("button", { name: "処理・群分け 1（siRNA）に行を追加" })).toBeVisible();
    expect(screen.getByRole("button", { name: "処理・群分け 2（Dox）に列を追加" })).toBeVisible();
  });

  it("moves factor deletion focus to the next, previous, then add control", () => {
    render(<BiologicalExperimentSetup enabled onReady={vi.fn()} />);
    fireEvent.change(screen.getByRole("textbox", { name: "処理・群分け 1の名前" }), {
      target: { value: "A" },
    });
    fireEvent.click(screen.getByRole("button", { name: "＋ 処理・群分けを追加" }));
    fireEvent.change(screen.getByRole("textbox", { name: "処理・群分け 2の名前" }), {
      target: { value: "B" },
    });
    fireEvent.click(screen.getByRole("button", { name: "＋ 処理・群分けを追加" }));
    fireEvent.change(screen.getByRole("textbox", { name: "処理・群分け 3の名前" }), {
      target: { value: "C" },
    });

    fireEvent.click(screen.getByRole("button", { name: "処理・群分け 2（B）を削除" }));
    expect(screen.getByRole("button", { name: "処理・群分け 2（C）を削除" })).toHaveFocus();

    fireEvent.click(screen.getByRole("button", { name: "＋ 処理・群分けを追加" }));
    fireEvent.change(screen.getByRole("textbox", { name: "処理・群分け 3の名前" }), {
      target: { value: "D" },
    });
    fireEvent.click(screen.getByRole("button", { name: "処理・群分け 3（D）を削除" }));
    expect(screen.getByRole("button", { name: "処理・群分け 2（C）を削除" })).toHaveFocus();

    fireEvent.click(screen.getByRole("button", { name: "処理・群分け 2（C）を削除" }));
    expect(screen.getByRole("button", { name: "＋ 処理・群分けを追加" })).toHaveFocus();
  });

  it("moves additional-readout deletion focus to the next, previous, then add control", () => {
    render(<BiologicalExperimentSetup enabled onReady={vi.fn()} />);
    const addReadout = screen.getByRole("button", { name: "＋ 測定項目を追加" });
    fireEvent.click(addReadout);
    fireEvent.click(addReadout);
    fireEvent.click(addReadout);

    fireEvent.click(screen.getByRole("button", { name: "追加の測定項目 3を削除" }));
    expect(screen.getByRole("button", { name: "追加の測定項目 3を削除" })).toHaveFocus();

    fireEvent.click(screen.getByRole("button", { name: "追加の測定項目 3を削除" }));
    expect(screen.getByRole("button", { name: "追加の測定項目 2を削除" })).toHaveFocus();

    fireEvent.click(screen.getByRole("button", { name: "追加の測定項目 2を削除" }));
    expect(screen.getByRole("button", { name: "＋ 測定項目を追加" })).toHaveFocus();
  });

  it("preserves repeated subgroup labels as distinct condition values", () => {
    const grouped: ConditionEntryBlock = {
      ...block("sirna", "siRNA", ["#1", "#2", "", "", ""]),
      showGroups: true,
      groupLabels: ["Gene A", "Gene B", "", "", ""],
      values: [
        ["#1", "#2", "", "", ""],
        ["#1", "#2", "", "", ""],
        ["", "", "", "", ""],
        ["", "", "", "", ""],
        ["", "", "", "", ""],
      ],
    };
    const combinations = buildConditionCombinations([grouped]);
    const built = safelyBuildBiologicalSetup({
      title: "siRNA",
      measurementLabel: "陽性率",
      valueForm: "positive_total",
      blocks: [grouped],
      combinations,
      statuses: {},
      receiverLabel: "culture dish",
      receiverIdLabel: "",
      relationship: "separate",
      sourceLabel: "",
      sourceIdLabel: "",
      childLabel: "Cell",
    });
    expect(built.status).toBe("ready");
    if (built.status === "ready") {
      expect(built.result.contract.factors[0]?.levels).toEqual([
        "Gene A / #1",
        "Gene A / #2",
        "Gene B / #1",
        "Gene B / #2",
      ]);
      expect(built.result.contract.identities[0]?.label).toBe("culture dish ID");
    }
  });

  it("stops rather than silently dropping an unnamed additional measurement", () => {
    const blocks = [block("treatment", "処理", ["Control", "", "", "", ""])];
    const combinations = buildConditionCombinations(blocks);
    const built = safelyBuildBiologicalSetup({
      title: "細胞応答",
      measurementLabel: "細胞面積",
      valueForm: "single",
      additionalReadouts: [{ label: "  ", valueForm: "single" }],
      blocks,
      combinations,
      statuses: {},
      receiverLabel: "culture dish",
      receiverIdLabel: "Dish ID",
      relationship: "separate",
      sourceLabel: "",
      sourceIdLabel: "",
      childLabel: "",
    });

    expect(built).toEqual({
      status: "stopped",
      reason: "追加した測定項目にも名前を入力してください。入力内容は保持されています。",
    });
  });

  it("requires the post-split factor for multi-factor shared-source experiments", () => {
    const sirna = block("sirna", "siRNA", ["Control", "Gene A", "", "", ""]);
    const dox = block("dox", "Dox", ["−", "+", "", "", ""]);
    const blocks = [sirna, dox];
    const combinations = buildConditionCombinations(blocks);
    const common = {
      title: "siRNA × Dox",
      measurementLabel: "陽性率",
      valueForm: "positive_total" as const,
      blocks,
      combinations,
      statuses: {},
      receiverLabel: "culture dish",
      receiverIdLabel: "",
      relationship: "shared_source" as const,
      sourceLabel: "siRNA処理後の細胞懸濁液",
      sourceIdLabel: "",
      childLabel: "Cell",
    };

    const unresolved = safelyBuildBiologicalSetup(common);
    expect(unresolved.status).toBe("stopped");
    if (unresolved.status === "stopped") expect(unresolved.reason).toMatch(/分けた後/);

    const resolved = safelyBuildBiologicalSetup({
      ...common,
      sharedSourcePairedBlockId: "dox",
    });
    expect(resolved.status).toBe("ready");
    if (resolved.status === "ready") {
      expect(
        resolved.result.contract.factors.map(({ label, relationship }) => ({
          label,
          relationship,
        })),
      ).toEqual([
        { label: "Dox", relationship: "paired" },
        { label: "siRNA", relationship: "independent" },
      ]);
    }
  });
});

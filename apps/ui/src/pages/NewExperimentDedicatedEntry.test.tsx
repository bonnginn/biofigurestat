import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { ADAPTIVE_INPUT_FEATURE_FLAG } from "../app/adaptiveInputFeature";
import type { DedicatedEntryIntent } from "../app/dedicatedEntryIntent";
import type { ProjectState } from "@lsaa/project";
import { NewExperimentPage } from "./NewExperimentPage";

function pasteGraphOnlyTable(value: string): void {
  fireEvent.paste(screen.getByTestId("graph-only-cell-0-0"), {
    clipboardData: { getData: () => value },
  });
}

function chooseDedicatedEntry(
  context: "cell_culture" | "protein_biochemical" | "animal" | "general_assay",
  routeName: RegExp,
  adaptiveEnabled = true,
): {
  onDedicatedEntryReady: ReturnType<typeof vi.fn<(intent: DedicatedEntryIntent) => void>>;
  onNavigate: ReturnType<typeof vi.fn>;
} {
  if (adaptiveEnabled) window.localStorage.setItem(ADAPTIVE_INPUT_FEATURE_FLAG, "enabled");
  else window.localStorage.removeItem(ADAPTIVE_INPUT_FEATURE_FLAG);
  const onDedicatedEntryReady = vi.fn<(intent: DedicatedEntryIntent) => void>();
  const onNavigate = vi.fn();
  render(
    <NewExperimentPage
      onNavigate={onNavigate}
      onDedicatedEntryReady={onDedicatedEntryReady}
      specializedEntryAvailable
      showCompatibilityEntry={adaptiveEnabled}
    />,
  );
  if (adaptiveEnabled) {
    fireEvent.click(screen.getByRole("button", { name: "以前の入口を使う" }));
  }
  fireEvent.click(document.querySelector(`[data-context="${context}"]`)!);
  fireEvent.click(screen.getByRole("button", { name: routeName }));
  return { onDedicatedEntryReady, onNavigate };
}

describe("New Experiment dedicated entry handoff", () => {
  beforeEach(() => {
    // The page tests exercise both modes explicitly. A developer's shell-level
    // production rollback must not silently choose a different test surface.
    vi.stubEnv("VITE_EXPERIMENT_FIRST_ADAPTIVE_INPUT", "");
    window.history.replaceState({}, "", "/");
    window.localStorage.clear();
  });

  afterEach(() => {
    window.localStorage.clear();
    vi.unstubAllEnvs();
  });

  it("keeps the legacy destination available when the adaptive feature flag is off", () => {
    const { onDedicatedEntryReady, onNavigate } = chooseDedicatedEntry(
      "animal",
      /humane endpoint・eventまでの期間/,
      false,
    );

    expect(onDedicatedEntryReady).not.toHaveBeenCalled();
    expect(onNavigate).toHaveBeenCalledWith("survival");
  });

  it("hands the direct Survival task to a semantic intent without a legacy fallback", () => {
    window.localStorage.setItem(ADAPTIVE_INPUT_FEATURE_FLAG, "enabled");
    const onDedicatedEntryReady = vi.fn<(intent: DedicatedEntryIntent) => void>();
    const onNavigate = vi.fn();
    render(
      <NewExperimentPage
        onNavigate={onNavigate}
        onDedicatedEntryReady={onDedicatedEntryReady}
        specializedEntryAvailable
        saveUnresolvedVisualizationProject={vi.fn(async () => null)}
        openUnresolvedVisualizationProject={vi.fn(async () => null)}
      />,
    );

    fireEvent.click(screen.getByRole("button", { name: "生存時間（Kaplan–Meier）を開く" }));

    expect(onDedicatedEntryReady).toHaveBeenCalledWith(
      expect.objectContaining({
        moduleId: "time_to_event",
        destination: "survival",
        sourceContext: "general_assay",
        entryRouteId: "direct_time_to_event",
        facts: {
          timeToEventPattern: "single_terminal_event_or_censoring",
          subjectUnitRelationship: "unknown",
        },
      }),
    );
    expect(onNavigate).not.toHaveBeenCalled();
  });

  it("単純な独立群は一般インタビューを開かず条件別シートへ進む", () => {
    window.localStorage.setItem(ADAPTIVE_INPUT_FEATURE_FLAG, "enabled");
    render(<NewExperimentPage onNavigate={vi.fn()} onDedicatedEntryReady={vi.fn()} />);

    fireEvent.click(screen.getByRole("button", { name: "単純な独立群比較を開く" }));
    expect(screen.getByRole("heading", { name: "単純な独立群比較" })).toHaveFocus();
    expect(screen.queryByRole("heading", { name: "実験の条件と測定内容" })).toBeNull();

    fireEvent.change(screen.getByLabelText("単純な群比較の条件 1"), {
      target: { value: "Vehicle" },
    });
    fireEvent.change(screen.getByLabelText("単純な群比較の条件 2"), {
      target: { value: "Drug" },
    });
    fireEvent.change(screen.getByPlaceholderText("例：Relative protein amount"), {
      target: { value: "Relative protein amount" },
    });
    fireEvent.change(screen.getByPlaceholderText("例：culture dish、mouse"), {
      target: { value: "culture dish" },
    });
    fireEvent.click(screen.getByRole("checkbox", { name: /条件ごとに別々の実験単位/ }));
    fireEvent.click(
      screen.getByRole("button", { name: "条件別スプレッドシートを作る" }),
    );

    expect(screen.getByText("実験ワークスペース")).toBeVisible();
    expect(screen.getByText("Vehicle")).toBeVisible();
    expect(screen.getByText("Drug")).toBeVisible();
    expect(screen.queryByText("条件を受けたものと材料のつながり")).toBeNull();
  });

  it.each([
    {
      button: "濃度–反応・酵素反応を開く",
      moduleId: "ordered_curve_kinetics",
      destination: "nonlinear-fit",
      entryRouteId: "direct_ordered_curve",
      facts: { orderedAxisCount: 1 },
    },
    {
      button: "ヒートマップを開く",
      moduleId: "matrix_visualization",
      destination: "heatmap",
      entryRouteId: "direct_heatmap",
      facts: {},
    },
  ] as const)("hands $button over in one click without inventing structure facts", (example) => {
    window.localStorage.setItem(ADAPTIVE_INPUT_FEATURE_FLAG, "enabled");
    const onDedicatedEntryReady = vi.fn<(intent: DedicatedEntryIntent) => void>();
    const onNavigate = vi.fn();
    render(
      <NewExperimentPage
        onNavigate={onNavigate}
        onDedicatedEntryReady={onDedicatedEntryReady}
        specializedEntryAvailable
        saveUnresolvedVisualizationProject={vi.fn(async () => null)}
        openUnresolvedVisualizationProject={vi.fn(async () => null)}
      />,
    );

    fireEvent.click(screen.getByRole("button", { name: example.button }));

    expect(onDedicatedEntryReady).toHaveBeenCalledOnce();
    expect(onDedicatedEntryReady).toHaveBeenCalledWith(
      expect.objectContaining({
        moduleId: example.moduleId,
        destination: example.destination,
        entryRouteId: example.entryRouteId,
        facts: example.facts,
      }),
    );
    expect(onNavigate).not.toHaveBeenCalled();
  });

  it("keeps Graph-only input and descriptive Graph available without persistence handlers", () => {
    window.localStorage.setItem(ADAPTIVE_INPUT_FEATURE_FLAG, "enabled");
    const onNavigate = vi.fn();
    render(
      <NewExperimentPage browserPreview onNavigate={onNavigate} onDedicatedEntryReady={vi.fn()} />,
    );

    const graphOnly = screen.getByRole("button", { name: "手元の表からGraphを作るを開く" });
    expect(graphOnly).toBeEnabled();
    fireEvent.click(graphOnly);
    expect(screen.getByRole("heading", { name: "手元の表からGraphを作る" })).toHaveFocus();
    expect(screen.getByRole("region", { name: "Graph用データシート" })).toBeVisible();
    expect(screen.getByTestId("graph-only-cell-0-0")).toHaveValue("X / condition");
    expect(screen.getByTestId("graph-only-cell-1-0")).toBeEnabled();
    expect(screen.queryByRole("button", { name: "保存したGraph用データを開く" })).toBeNull();
    expect(screen.getByRole("button", { name: "Graph" })).toBeDisabled();
    expect(screen.getByRole("button", { name: "Statistics" })).toBeDisabled();
    expect(onNavigate).not.toHaveBeenCalled();

    fireEvent.click(screen.getByRole("button", { name: "入口へ戻る" }));
    expect(screen.getByRole("button", { name: "手元の表からGraphを作るを開く" })).toHaveFocus();
  });

  it("keeps a Graph-only table while adding the biological facts needed for Statistics", () => {
    window.localStorage.setItem(ADAPTIVE_INPUT_FEATURE_FLAG, "enabled");
    render(
      <NewExperimentPage browserPreview onNavigate={vi.fn()} onDedicatedEntryReady={vi.fn()} />,
    );
    fireEvent.click(screen.getByRole("button", { name: "手元の表からGraphを作るを開く" }));
    pasteGraphOnlyTable("Condition\tValue\nControl\t10\nDrug\t14");
    fireEvent.change(screen.getByRole("combobox", { name: "Graphの横軸" }), {
      target: { value: "0" },
    });
    fireEvent.change(screen.getByRole("combobox", { name: "Graphの測定値" }), {
      target: { value: "1" },
    });

    fireEvent.click(screen.getByRole("button", { name: "Statistics" }));
    fireEvent.click(
      screen.getByRole("radio", { name: /処理・群分け（Control、Drug A、genotypeなど）/ }),
    );
    fireEvent.change(screen.getByRole("combobox", { name: "統計で使う対象ID" }), {
      target: { value: "no_id" },
    });
    fireEvent.click(
      screen.getByRole("radio", {
        name: /はい。各行が別々のanimal・dish・wellなどです/,
      }),
    );
    fireEvent.click(screen.getByRole("button", { name: "実験構造の確認へ" }));

    expect(screen.getByRole("heading", { name: "統計に必要な実験情報" })).toBeVisible();
    expect(screen.getByRole("status")).toHaveTextContent("Graph用の元表は保持");
    expect(screen.getByText("Condition: Control、Drug。測定: Value")).toBeVisible();
    expect(screen.queryByRole("textbox", { name: "処理・群分け 1の名前" })).toBeNull();
    fireEvent.click(screen.getByRole("button", { name: "条件・測定を修正" }));
    expect(screen.getByRole("textbox", { name: "処理・群分け 1の名前" })).toHaveValue("Condition");
    expect(screen.getByRole("textbox", { name: "行 1 列 1" })).toHaveValue("Control");
    expect(screen.getByRole("textbox", { name: "行 1 列 2" })).toHaveValue("Drug");
    expect(screen.getByPlaceholderText("例：細胞生存率")).toHaveValue("Value");

    fireEvent.change(screen.getByPlaceholderText("例：culture dish、mouse、donor由来試料"), {
      target: { value: "culture dish" },
    });
    fireEvent.click(screen.getByRole("radio", { name: /条件ごとに別々のもの/ }));
    fireEvent.click(screen.getByRole("button", { name: "この内容で入力表を作る" }));

    expect(screen.getByText("実験ワークスペース")).toBeVisible();
    expect(screen.getByRole("button", { name: "グラフ (1)" })).toBeVisible();
    fireEvent.click(screen.getByRole("button", { name: "対象・試料IDを表示／編集" }));
    expect(screen.getByDisplayValue("unit-001")).toBeVisible();
    expect(screen.getByDisplayValue("unit-002")).toBeVisible();
  });

  it("keeps explicit X/Y/ID mapping and raw rows when Statistics setup is canceled", () => {
    window.localStorage.setItem(ADAPTIVE_INPUT_FEATURE_FLAG, "enabled");
    const source = ["Condition\tValue\tDishID", "Control\t10\tdish-c1", "Drug\t14\tdish-d1"].join(
      "\n",
    );
    render(
      <NewExperimentPage browserPreview onNavigate={vi.fn()} onDedicatedEntryReady={vi.fn()} />,
    );
    fireEvent.click(screen.getByRole("button", { name: "手元の表からGraphを作るを開く" }));
    pasteGraphOnlyTable(source);
    fireEvent.change(screen.getByRole("combobox", { name: "Graphの横軸" }), {
      target: { value: "0" },
    });
    fireEvent.change(screen.getByRole("combobox", { name: "Graphの測定値" }), {
      target: { value: "1" },
    });
    fireEvent.click(screen.getByRole("button", { name: "Statistics" }));
    fireEvent.click(
      screen.getByRole("radio", { name: /処理・群分け（Control、Drug A、genotypeなど）/ }),
    );
    fireEvent.change(screen.getByRole("combobox", { name: "統計で使う対象ID" }), {
      target: { value: "2" },
    });
    fireEvent.click(screen.getByRole("button", { name: "実験構造の確認へ" }));
    expect(screen.getByRole("heading", { name: "統計に必要な実験情報" })).toBeVisible();

    fireEvent.click(screen.getByRole("button", { name: "戻る" }));

    expect(screen.getByRole("heading", { name: "手元の表からGraphを作る" })).toBeVisible();
    fireEvent.click(screen.getByRole("button", { name: "データ" }));
    expect(screen.getByTestId("graph-only-cell-0-0")).toHaveValue("Condition");
    expect(screen.getByTestId("graph-only-cell-0-1")).toHaveValue("Value");
    expect(screen.getByTestId("graph-only-cell-0-2")).toHaveValue("DishID");
    expect(screen.getByTestId("graph-only-cell-1-0")).toHaveValue("Control");
    expect(screen.getByTestId("graph-only-cell-1-1")).toHaveValue("10");
    expect(screen.getByTestId("graph-only-cell-1-2")).toHaveValue("dish-c1");
    expect(screen.getByTestId("graph-only-cell-2-0")).toHaveValue("Drug");
    expect(screen.getByTestId("graph-only-cell-2-1")).toHaveValue("14");
    expect(screen.getByTestId("graph-only-cell-2-2")).toHaveValue("dish-d1");
    expect(screen.getByRole("combobox", { name: "Graphの横軸" })).toHaveValue("0");
    expect(screen.getByRole("combobox", { name: "Graphの測定値" })).toHaveValue("1");

    fireEvent.click(screen.getByRole("button", { name: "Statistics" }));
    fireEvent.click(
      screen.getByRole("radio", { name: /処理・群分け（Control、Drug A、genotypeなど）/ }),
    );
    expect(screen.getByRole("combobox", { name: "統計で使う対象ID" })).toHaveValue("2");
  });

  it("promotes an explicit-ID Graph table to the generated worksheet without changing values", async () => {
    window.localStorage.setItem(ADAPTIVE_INPUT_FEATURE_FLAG, "enabled");
    const source = "Condition\tValue\tDishID\nControl\t10\tdish-c1\nDrug\t14\tdish-d1";
    const saveProject = vi.fn(async (state: ProjectState, target?: string) => ({
      state,
      target: target ?? "C:/tmp/graph-promoted.lsa",
    }));
    render(
      <NewExperimentPage
        browserPreview
        onNavigate={vi.fn()}
        onDedicatedEntryReady={vi.fn()}
        saveProject={saveProject}
      />,
    );
    fireEvent.click(screen.getByRole("button", { name: "手元の表からGraphを作るを開く" }));
    pasteGraphOnlyTable(source);
    fireEvent.change(screen.getByRole("combobox", { name: "Graphの横軸" }), {
      target: { value: "0" },
    });
    fireEvent.change(screen.getByRole("combobox", { name: "Graphの測定値" }), {
      target: { value: "1" },
    });
    fireEvent.click(screen.getByRole("button", { name: "Statistics" }));
    fireEvent.click(
      screen.getByRole("radio", { name: /処理・群分け（Control、Drug A、genotypeなど）/ }),
    );
    fireEvent.change(screen.getByRole("combobox", { name: "統計で使う対象ID" }), {
      target: { value: "2" },
    });
    fireEvent.click(screen.getByRole("button", { name: "実験構造の確認へ" }));
    fireEvent.change(screen.getByPlaceholderText("例：culture dish、mouse、donor由来試料"), {
      target: { value: "culture dish" },
    });
    fireEvent.click(screen.getByRole("radio", { name: /条件ごとに別々のもの/ }));
    fireEvent.click(screen.getByRole("button", { name: "この内容で入力表を作る" }));

    expect(screen.getByText("実験ワークスペース")).toBeVisible();
    expect(screen.getByRole("button", { name: "グラフ (1)" })).toBeEnabled();
    expect(screen.getByText("2件の測定値")).toBeVisible();
    expect(screen.getByDisplayValue("10")).toBeVisible();
    expect(screen.getByDisplayValue("14")).toBeVisible();

    fireEvent.click(screen.getByRole("button", { name: "プロジェクトを保存" }));
    await waitFor(() => expect(saveProject).toHaveBeenCalledOnce());
    const saved = saveProject.mock.calls[0]![0];
    expect(saved.adaptiveInput?.rawLineage?.rawText).toBe(source);
    expect(saved.adaptiveInput?.mapping?.columns.DishID).toMatchObject({
      role: "identity",
    });
    const identityKey = saved.adaptiveInput?.contract.identities.find(
      ({ unitLevelKey }) => unitLevelKey === saved.adaptiveInput?.contract.experimentalUnitLevelKey,
    )?.key;
    expect(
      saved.adaptiveInput?.canonicalObservations.map(({ identities }) =>
        identityKey ? identities[identityKey] : undefined,
      ),
    ).toEqual(["dish-c1", "dish-d1"]);
  });

  it("guards Heatmap when its dedicated-entry handoff is unavailable", () => {
    window.localStorage.setItem(ADAPTIVE_INPUT_FEATURE_FLAG, "enabled");
    render(<NewExperimentPage browserPreview onNavigate={vi.fn()} />);

    expect(screen.getByRole("button", { name: "手元の表からGraphを作るを開く" })).toBeEnabled();
    expect(screen.getByRole("button", { name: "生存時間（Kaplan–Meier）を開く" })).toBeDisabled();
    expect(screen.getByRole("button", { name: "濃度–反応・酵素反応を開く" })).toBeDisabled();
    expect(screen.getByRole("button", { name: "ヒートマップを開く" })).toBeDisabled();
    expect(
      screen.getByText(
        "この版では行列を保つ専用シートを安全に開けません。別の実験形式へは自動変換しません。",
      ),
    ).toBeVisible();
  });

  it("keeps native Survival and ordered-curve entries closed until draft save and reopen are paired", () => {
    window.localStorage.setItem(ADAPTIVE_INPUT_FEATURE_FLAG, "enabled");
    const onDedicatedEntryReady = vi.fn();
    render(
      <NewExperimentPage onNavigate={vi.fn()} onDedicatedEntryReady={onDedicatedEntryReady} />,
    );

    const survival = screen.getByRole("button", {
      name: "生存時間（Kaplan–Meier）を開く",
    });
    const ordered = screen.getByRole("button", { name: "濃度–反応・酵素反応を開く" });
    expect(survival).toBeDisabled();
    expect(ordered).toBeDisabled();
    expect(screen.getByText(/生存時間データを保存して再開できない/)).toBeVisible();
    expect(screen.getByText(/濃度–反応・酵素反応データを保存して再開できない/)).toBeVisible();
    fireEvent.click(survival);
    fireEvent.click(ordered);
    expect(onDedicatedEntryReady).not.toHaveBeenCalled();
  });

  it("opens the biological general setup from the feature-flagged hub without internal labels", () => {
    window.localStorage.setItem(ADAPTIVE_INPUT_FEATURE_FLAG, "enabled");
    render(<NewExperimentPage onNavigate={vi.fn()} onDedicatedEntryReady={vi.fn()} />);

    const generalEntry = screen.getByRole("button", { name: "実験から始めるを開く" });
    fireEvent.click(generalEntry);

    expect(screen.getByRole("heading", { name: "実験の条件と測定内容" })).toHaveFocus();
    expect(screen.getByText("処理・群分け")).toBeVisible();
    expect(screen.queryByText(/StructureContract|identity column|factor|ordered axis/i)).toBeNull();

    fireEvent.click(screen.getByRole("button", { name: "戻る" }));
    expect(screen.getByRole("button", { name: "実験から始めるを開く" })).toHaveFocus();
  });

  it("hands a ready common biological plan to the existing experiment workspace", () => {
    window.localStorage.setItem(ADAPTIVE_INPUT_FEATURE_FLAG, "enabled");
    render(<NewExperimentPage onNavigate={vi.fn()} onDedicatedEntryReady={vi.fn()} />);
    fireEvent.click(screen.getByRole("button", { name: "実験から始めるを開く" }));

    fireEvent.change(screen.getByRole("textbox", { name: "処理・群分け 1の名前" }), {
      target: { value: "薬剤" },
    });
    fireEvent.change(screen.getByRole("textbox", { name: "行 1 列 1" }), {
      target: { value: "0 nM" },
    });
    fireEvent.change(screen.getByRole("textbox", { name: "行 1 列 2" }), {
      target: { value: "10 nM" },
    });
    fireEvent.change(screen.getByPlaceholderText("例：細胞生存率"), {
      target: { value: "細胞生存率" },
    });
    fireEvent.change(screen.getByPlaceholderText("例：culture dish、mouse、donor由来試料"), {
      target: { value: "dish" },
    });
    fireEvent.click(screen.getByRole("radio", { name: /条件ごとに別々のもの/ }));
    fireEvent.click(screen.getByRole("button", { name: "この内容で入力表を作る" }));

    expect(screen.getByRole("heading", { name: "細胞生存率の実験" })).toHaveFocus();
    expect(screen.getByText("実験ワークスペース")).toBeVisible();
  });

  it("keeps the established context-first screen unchanged when the feature flag is off", () => {
    window.localStorage.removeItem(ADAPTIVE_INPUT_FEATURE_FLAG);
    render(<NewExperimentPage onNavigate={vi.fn()} onDedicatedEntryReady={vi.fn()} />);

    expect(screen.getByRole("heading", { name: "何をした実験ですか？" })).toBeVisible();
    expect(screen.queryByRole("button", { name: "実験から始める" })).toBeNull();
    expect(screen.queryByRole("heading", { name: "実験の条件と測定内容" })).toBeNull();
  });

  it("hands animal survival to time-to-event without guessing the assignment unit", () => {
    const { onDedicatedEntryReady, onNavigate } = chooseDedicatedEntry(
      "animal",
      /humane endpoint・eventまでの期間/,
    );

    expect(onDedicatedEntryReady).toHaveBeenCalledTimes(1);
    expect(onDedicatedEntryReady).toHaveBeenCalledWith(
      expect.objectContaining({
        moduleId: "time_to_event",
        destination: "survival",
        sourceContext: "animal",
        entryRouteId: "animal_time_to_event",
        facts: {
          timeToEventPattern: "single_terminal_event_or_censoring",
          subjectUnitRelationship: "unknown",
        },
      }),
    );
    expect(onNavigate).not.toHaveBeenCalled();
  });

  it.each([
    ["cell_culture", /Cellの最初のevent発生までの時間/, "cell_time_to_event"],
    ["general_assay", /^最初のevent発生までの時間/, "general_time_to_event"],
  ] as const)(
    "keeps the subject unit unresolved for %s time-to-event entry",
    (context, routeName, entryRouteId) => {
      const { onDedicatedEntryReady } = chooseDedicatedEntry(context, routeName);

      expect(onDedicatedEntryReady).toHaveBeenCalledWith(
        expect.objectContaining({
          moduleId: "time_to_event",
          destination: "survival",
          entryRouteId,
          facts: {
            timeToEventPattern: "single_terminal_event_or_censoring",
            subjectUnitRelationship: "unknown",
          },
        }),
      );
    },
  );

  it.each([
    ["protein_biochemical", /時間・濃度に対する反応曲線/, "protein_kinetic_fit"],
    ["general_assay", /Xに対する非線形な応答/, "general_nonlinear_fit"],
  ] as const)(
    "hands %s ordered curves over without guessing axis or material continuity",
    (context, routeName, entryRouteId) => {
      const { onDedicatedEntryReady } = chooseDedicatedEntry(context, routeName);
      const intent = onDedicatedEntryReady.mock.calls[0]?.[0];

      expect(intent).toMatchObject({
        moduleId: "ordered_curve_kinetics",
        destination: "nonlinear-fit",
        entryRouteId,
        facts: { orderedAxisCount: 1 },
      });
      expect(intent?.facts.orderedAxisMeaning).toBeUndefined();
      expect(intent?.facts.axisMaterialRelationship).toBeUndefined();
      expect(Object.keys(intent?.facts ?? {})).toEqual(["orderedAxisCount"]);
    },
  );
});

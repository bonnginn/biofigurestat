import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

import {
  createUnresolvedVisualizationProjectState,
  type UnresolvedVisualizationProjectState,
} from "@lsaa/project";
import { ADAPTIVE_INPUT_FEATURE_FLAG } from "../app/adaptiveInputFeature";
import { NewExperimentPage } from "./NewExperimentPage";
import { GraphOnlyVisualizationPage } from "./GraphOnlyVisualizationPage";

const rawText = [
  "Condition\tValue\tBatch",
  "Control\t12.4\tA",
  "Drug A\t18.1\tA",
  "Drug A\t19.2\tB",
  "Drug B\t20.0\tA",
].join("\n");

function stateWithMapping(): UnresolvedVisualizationProjectState {
  const state = createUnresolvedVisualizationProjectState({
    metadata: {
      projectId: "visualization.test-project",
      projectName: "表から作成したGraph",
      experimentDate: "",
      createdAt: "2026-08-28T00:00:00.000Z",
      updatedAt: "2026-08-28T00:00:00.000Z",
    },
    entryIntent: "graph_only",
    table: {
      id: "visualization.test-table",
      headers: ["Condition", "Value", "Batch"],
      rows: [
        ["Control", "12.4", "A"],
        ["Drug A", "18.1", "A"],
        ["Drug A", "19.2", "B"],
        ["Drug B", "20.0", "A"],
      ],
      delimiter: "tab",
      headerRow: 1,
    },
    rawLineage: {
      sourceKind: "tsv",
      sourceLabel: "table.tsv",
      importedAt: "2026-08-28T00:00:00.000Z",
      rawText,
      sha256: null,
      transformations: ["delimiter_detection"],
    },
    mapping: {
      schemaVersion: "0.1.0",
      sourceLabel: "table.tsv",
      delimiter: "tab",
      headerRow: 1,
      columns: [
        { index: 0, header: "Condition", role: "x" },
        { index: 1, header: "Value", role: "y" },
        { index: 2, header: "Batch", role: "series" },
      ],
      confirmedAt: "2026-08-28T00:00:00.000Z",
    },
    actor: "test",
  });
  return state;
}

describe("Graph-only visualization entry", () => {
  afterEach(() => window.localStorage.removeItem(ADAPTIVE_INPUT_FEATURE_FLAG));

  it("keeps the explicitly labeled browser preview usable without production bridges", () => {
    window.localStorage.setItem(ADAPTIVE_INPUT_FEATURE_FLAG, "enabled");
    render(
      <NewExperimentPage browserPreview onNavigate={vi.fn()} onDedicatedEntryReady={vi.fn()} />,
    );

    expect(screen.getByRole("button", { name: "手元の表からGraphを作るを開く" })).toBeEnabled();
    fireEvent.click(screen.getByRole("button", { name: "手元の表からGraphを作るを開く" }));
    expect(screen.getByRole("heading", { name: "手元の表からGraphを作る" })).toBeVisible();
    expect(screen.getAllByRole("button", { name: /入口へ戻る|実験の種類を変更/ })).toHaveLength(1);
    expect(screen.getByRole("textbox", { name: "Graph用の表" })).toBeEnabled();
    expect(screen.queryByRole("button", { name: "保存したGraph用データを開く" })).toBeNull();
    const saveButton = screen.getByRole("button", { name: "このGraph用データを保存" });
    expect(saveButton).toBeDisabled();
    const unavailableNote = screen.getByText(
      "このブラウザレビューではGraph用データを保存できません。デスクトップ版で利用できます。",
    );
    expect(saveButton).toHaveAttribute("aria-describedby", unavailableNote.id);
    window.localStorage.removeItem(ADAPTIVE_INPUT_FEATURE_FLAG);
  });

  it("requires explicit X/Y mapping, renders a descriptive Graph, and saves unresolved state", async () => {
    const saveProject = vi.fn(
      async (state: UnresolvedVisualizationProjectState, target?: string) => ({
        state,
        target: target ?? "C:/tmp/graph-only.lsa",
      }),
    );
    render(<GraphOnlyVisualizationPage onNavigate={vi.fn()} saveProject={saveProject} />);

    fireEvent.change(screen.getByRole("textbox", { name: "Graph用の表" }), {
      target: { value: rawText },
    });
    expect(screen.getByText("列の指定を待っています")).toBeVisible();

    fireEvent.change(screen.getByRole("combobox", { name: "Graphの横軸" }), {
      target: { value: "0" },
    });
    fireEvent.change(screen.getByRole("combobox", { name: "Graphの測定値" }), {
      target: { value: "1" },
    });
    fireEvent.change(screen.getByRole("combobox", { name: "Graphのグループ" }), {
      target: { value: "2" },
    });

    expect(screen.getByRole("img", { name: /ValueをConditionごと/ })).toBeVisible();
    fireEvent.click(screen.getByRole("button", { name: "このGraph用データを保存" }));
    await waitFor(() => expect(saveProject).toHaveBeenCalledOnce());

    const savedState = saveProject.mock.calls[0]![0];
    expect(savedState.projectKind).toBe("unresolved_visualization");
    expect(savedState.table.rows).toHaveLength(4);
    expect(savedState.rawLineage.rawText).toBe(rawText);
    expect(savedState.mapping?.columns.find(({ role }) => role === "x")?.header).toBe("Condition");
    expect(savedState.mapping?.columns.find(({ role }) => role === "y")?.header).toBe("Value");
    expect(savedState.statisticsReadiness.status).toBe("unresolved");
    expect(savedState.graphSpecs[0]?.analysisResultId).toBeNull();
    expect(savedState.graphSpecs[0]?.dataSource.kind).toBe("visualization_table");
    expect("design" in savedState).toBe(false);
    expect("analysisRequest" in savedState).toBe(false);

    fireEvent.click(screen.getByRole("button", { name: "統計を確認" }));
    expect(screen.getByRole("alert")).toHaveTextContent("実験構造が未確定");
  });

  it("reopens a saved table and keeps its explicit mapping without creating design facts", async () => {
    const state = stateWithMapping();
    const openProject = vi.fn(async () => ({ state, target: "C:/tmp/graph-only.lsa" }));
    render(<GraphOnlyVisualizationPage onNavigate={vi.fn()} openProject={openProject} />);

    fireEvent.click(screen.getByRole("button", { name: "保存したGraph用データを開く" }));
    await waitFor(() => expect(openProject).toHaveBeenCalledOnce());

    expect(screen.getByRole("textbox", { name: "Graph用の表" })).toHaveValue(rawText);
    expect(screen.getByRole("img", { name: /ValueをConditionごと/ })).toBeVisible();
    expect(screen.getByRole("combobox", { name: "Graphの横軸" })).toHaveValue("0");
    expect(screen.getByRole("combobox", { name: "Graphの測定値" })).toHaveValue("1");
    expect(screen.getByRole("combobox", { name: "Graphのグループ" })).toHaveValue("2");
    expect(screen.queryByText(/ExperimentDesign|biological n|identity column/i)).toBeNull();
  });

  it("preserves mapping, Graph history, and lineage on an unchanged open-save cycle", async () => {
    const savedStates: UnresolvedVisualizationProjectState[] = [];
    const saveProject = vi.fn(
      async (state: UnresolvedVisualizationProjectState, target?: string) => {
        savedStates.push(state);
        return { state, target: target ?? "C:/tmp/stable-graph-only.lsa" };
      },
    );
    const first = render(
      <GraphOnlyVisualizationPage
        onNavigate={vi.fn()}
        initialState={stateWithMapping()}
        saveProject={saveProject}
      />,
    );
    fireEvent.click(screen.getByRole("button", { name: "このGraph用データを保存" }));
    await waitFor(() => expect(savedStates).toHaveLength(1));
    const persisted = savedStates[0]!;
    first.unmount();

    const openProject = vi.fn(async () => ({
      state: persisted,
      target: "C:/tmp/stable-graph-only.lsa",
    }));
    render(
      <GraphOnlyVisualizationPage
        onNavigate={vi.fn()}
        openProject={openProject}
        saveProject={saveProject}
      />,
    );
    fireEvent.click(screen.getByRole("button", { name: "保存したGraph用データを開く" }));
    await waitFor(() => expect(openProject).toHaveBeenCalledOnce());
    fireEvent.click(screen.getByRole("button", { name: "このGraph用データを保存" }));
    await waitFor(() => expect(savedStates).toHaveLength(2));
    const resaved = savedStates[1]!;

    expect(resaved.entryIntent).toBe("graph_only");
    expect(resaved.table).toEqual(persisted.table);
    expect(resaved.rawLineage).toEqual(persisted.rawLineage);
    expect(resaved.mapping).toEqual(persisted.mapping);
    expect(resaved.graphSpecs).toEqual(persisted.graphSpecs);
    expect(resaved.activeGraphId).toBe(persisted.activeGraphId);
    expect(resaved.provenanceEvents).toEqual(persisted.provenanceEvents);
  });

  it("appends edited data and keeps old and new Graphs bound to their own revisions", async () => {
    const savedStates: UnresolvedVisualizationProjectState[] = [];
    const saveProject = vi.fn(async (state: UnresolvedVisualizationProjectState) => {
      savedStates.push(state);
      return { state, target: "C:/tmp/revised-graph-only.lsa" };
    });
    const first = render(
      <GraphOnlyVisualizationPage
        onNavigate={vi.fn()}
        initialState={stateWithMapping()}
        saveProject={saveProject}
      />,
    );
    fireEvent.click(screen.getByRole("button", { name: "このGraph用データを保存" }));
    await waitFor(() => expect(savedStates).toHaveLength(1));
    const original = savedStates[0]!;
    const originalRevisionId = original.activeDataRevisionId;
    const originalGraphId = original.activeGraphId!;
    first.unmount();

    render(
      <GraphOnlyVisualizationPage
        onNavigate={vi.fn()}
        initialState={original}
        saveProject={saveProject}
      />,
    );
    fireEvent.change(screen.getByTestId("graph-only-cell-1-1"), {
      target: { value: "88.8" },
    });
    fireEvent.click(screen.getByRole("button", { name: "このGraph用データを保存" }));
    await waitFor(() => expect(savedStates).toHaveLength(2));
    const revised = savedStates[1]!;

    expect(revised.dataRevisions).toHaveLength(2);
    expect(revised.dataRevisions[0]?.rawLineage.rawText).toBe(rawText);
    expect(revised.dataRevisions[1]?.rawLineage.rawText).toContain("Drug A\t88.8\tA");
    expect(revised.graphSpecs.find(({ id }) => id === originalGraphId)?.dataSource.revision).toBe(
      originalRevisionId,
    );
    expect(
      revised.graphSpecs.find(({ id }) => id === revised.activeGraphId)?.dataSource.revision,
    ).toBe(revised.activeDataRevisionId);
  });

  it("refuses a matrix-visualization project instead of changing its entry intent", async () => {
    const matrixState: UnresolvedVisualizationProjectState = {
      ...stateWithMapping(),
      entryIntent: "matrix_visualization",
    };
    const openProject = vi.fn(async () => ({
      state: matrixState,
      target: "C:/tmp/heatmap.lsa",
    }));
    render(<GraphOnlyVisualizationPage onNavigate={vi.fn()} openProject={openProject} />);

    fireEvent.click(screen.getByRole("button", { name: "保存したGraph用データを開く" }));

    expect(await screen.findByRole("alert")).toHaveTextContent(
      "このファイルは表からGraph用のprojectではありません。",
    );
    expect(screen.getByRole("textbox", { name: "Graph用の表" })).toHaveValue("");
  });

  it("also refuses a wrong-intent state supplied by an internal handoff", () => {
    const matrixState: UnresolvedVisualizationProjectState = {
      ...stateWithMapping(),
      entryIntent: "matrix_visualization",
    };
    render(
      <GraphOnlyVisualizationPage
        onNavigate={vi.fn()}
        initialState={matrixState}
        saveProject={vi.fn()}
      />,
    );

    expect(screen.getByRole("alert")).toHaveTextContent(
      "このファイルは表からGraph用のprojectではありません。",
    );
    expect(screen.getByRole("textbox", { name: "Graph用の表" })).toHaveValue("");
    expect(screen.getByRole("button", { name: "このGraph用データを保存" })).toBeDisabled();
  });

  it("loads a CSV file into the same editable table and preserves file lineage", async () => {
    const saveProject = vi.fn(async (state: UnresolvedVisualizationProjectState) => ({
      state,
      target: "C:/tmp/file-import.lsa",
    }));
    render(<GraphOnlyVisualizationPage onNavigate={vi.fn()} saveProject={saveProject} />);
    const csvText = ["Condition,Value", "Control,10", "Drug,14"].join("\n");
    const file = {
      name: "plate-summary.csv",
      text: vi.fn(async () => csvText),
    } as unknown as File;

    fireEvent.change(screen.getByLabelText("Graph用の表ファイル"), {
      target: { files: [file] },
    });
    await waitFor(() =>
      expect(screen.getByRole("textbox", { name: "Graph用の表" })).toHaveValue(csvText),
    );
    expect(screen.getByTestId("graph-only-cell-1-1")).toHaveValue("14");

    fireEvent.change(screen.getByRole("combobox", { name: "Graphの横軸" }), {
      target: { value: "0" },
    });
    fireEvent.change(screen.getByRole("combobox", { name: "Graphの測定値" }), {
      target: { value: "1" },
    });
    fireEvent.click(screen.getByRole("button", { name: "このGraph用データを保存" }));
    await waitFor(() => expect(saveProject).toHaveBeenCalledOnce());

    expect(saveProject.mock.calls[0]![0].rawLineage).toMatchObject({
      sourceKind: "csv",
      sourceLabel: "plate-summary.csv",
      rawText: csvText,
    });
  });

  it("edits any parsed cell without truncating the full table and serializes it to raw text", () => {
    const longRawText = [
      "Condition\tValue",
      ...Array.from({ length: 14 }, (_, index) => `Drug ${index + 1}\t${index + 1}`),
    ].join("\n");
    render(<GraphOnlyVisualizationPage onNavigate={vi.fn()} />);

    fireEvent.change(screen.getByRole("textbox", { name: "Graph用の表" }), {
      target: { value: longRawText },
    });
    const editedCell = screen.getByTestId("graph-only-cell-13-1");
    fireEvent.change(editedCell, { target: { value: "edited" } });

    expect(editedCell).toHaveValue("edited");
    expect(screen.getByTestId("graph-only-cell-13-0")).toHaveValue("Drug 14");
    expect(screen.getByTestId("graph-only-cell-13-1")).toHaveValue("edited");
    expect(screen.getByRole("textbox", { name: "Graph用の表" })).toHaveValue(
      longRawText.replace("Drug 14\t14", "Drug 14\tedited"),
    );
  });

  it("adds a row and column as editable raw table values", () => {
    render(<GraphOnlyVisualizationPage onNavigate={vi.fn()} />);
    fireEvent.change(screen.getByRole("textbox", { name: "Graph用の表" }), {
      target: { value: rawText },
    });

    fireEvent.click(screen.getByRole("button", { name: "行を追加" }));
    fireEvent.click(screen.getByRole("button", { name: "列を追加" }));

    expect(screen.getByTestId("graph-only-header-3")).toHaveValue("");
    expect(screen.getByTestId("graph-only-cell-4-3")).toHaveValue("");
    fireEvent.change(screen.getByTestId("graph-only-header-3"), {
      target: { value: "Replicate" },
    });
    fireEvent.change(screen.getByTestId("graph-only-cell-4-3"), {
      target: { value: "R1" },
    });

    expect(screen.getByRole("textbox", { name: "Graph用の表" })).toHaveValue(
      [
        "Condition\tValue\tBatch\tReplicate",
        "Control\t12.4\tA\t",
        "Drug A\t18.1\tA\t",
        "Drug A\t19.2\tB\t",
        "Drug B\t20.0\tA\t",
        "\t\t\tR1",
      ].join("\n"),
    );
  });

  it("keeps edited cells in the unresolved state built for saving", async () => {
    const saveProject = vi.fn(
      async (state: UnresolvedVisualizationProjectState, target?: string) => ({
        state,
        target: target ?? "C:/tmp/graph-only-edited.lsa",
      }),
    );
    render(<GraphOnlyVisualizationPage onNavigate={vi.fn()} saveProject={saveProject} />);
    fireEvent.change(screen.getByRole("textbox", { name: "Graph用の表" }), {
      target: { value: rawText },
    });
    fireEvent.change(screen.getByTestId("graph-only-cell-1-1"), {
      target: { value: "18.9" },
    });
    fireEvent.change(screen.getByRole("combobox", { name: "Graphの横軸" }), {
      target: { value: "0" },
    });
    fireEvent.change(screen.getByRole("combobox", { name: "Graphの測定値" }), {
      target: { value: "1" },
    });

    fireEvent.click(screen.getByRole("button", { name: "このGraph用データを保存" }));
    await waitFor(() => expect(saveProject).toHaveBeenCalledOnce());

    const savedState = saveProject.mock.calls[0]![0];
    expect(savedState.table.rows[1]).toEqual(["Drug A", "18.9", "A"]);
    expect(savedState.rawLineage.rawText).toContain("Drug A\t18.9\tA");
    expect(savedState.mapping?.columns.find(({ role }) => role === "x")?.index).toBe(0);
    expect(savedState.mapping?.columns.find(({ role }) => role === "y")?.index).toBe(1);
    expect(savedState.statisticsReadiness.status).toBe("unresolved");
    expect("design" in savedState).toBe(false);
    expect("analysisRequest" in savedState).toBe(false);
  });

  it("does not promote a condition table until the researcher answers whether an ID column exists", () => {
    const onStatisticsStructureRequested = vi.fn();
    render(
      <GraphOnlyVisualizationPage
        onNavigate={vi.fn()}
        onStatisticsStructureRequested={onStatisticsStructureRequested}
      />,
    );
    fireEvent.change(screen.getByRole("textbox", { name: "Graph用の表" }), {
      target: {
        value: "Condition\tValue\tDishID\nControl\t10\tdish-1\nDrug\t14\tdish-2",
      },
    });
    fireEvent.change(screen.getByRole("combobox", { name: "Graphの横軸" }), {
      target: { value: "0" },
    });
    fireEvent.change(screen.getByRole("combobox", { name: "Graphの測定値" }), {
      target: { value: "1" },
    });
    fireEvent.click(screen.getByRole("button", { name: "統計を確認" }));
    fireEvent.click(screen.getByRole("radio", { name: /処理・群分け/ }));

    expect(screen.getByRole("combobox", { name: "統計で使う対象ID" })).toHaveValue("");
    expect(screen.getByRole("status")).toHaveTextContent("IDの列があるか回答");
    expect(screen.getByRole("button", { name: "実験構造の確認へ" })).toBeDisabled();
    expect(onStatisticsStructureRequested).not.toHaveBeenCalled();
  });

  it("promotes only after an explicit no-ID answer and persists that decision", () => {
    const onStatisticsStructureRequested = vi.fn();
    render(
      <GraphOnlyVisualizationPage
        onNavigate={vi.fn()}
        onStatisticsStructureRequested={onStatisticsStructureRequested}
      />,
    );
    fireEvent.change(screen.getByRole("textbox", { name: "Graph用の表" }), {
      target: { value: "Condition\tValue\nControl\t10\nDrug\t14" },
    });
    fireEvent.change(screen.getByRole("combobox", { name: "Graphの横軸" }), {
      target: { value: "0" },
    });
    fireEvent.change(screen.getByRole("combobox", { name: "Graphの測定値" }), {
      target: { value: "1" },
    });
    fireEvent.click(screen.getByRole("button", { name: "統計を確認" }));
    fireEvent.click(screen.getByRole("radio", { name: /処理・群分け/ }));
    fireEvent.change(screen.getByRole("combobox", { name: "統計で使う対象ID" }), {
      target: { value: "no_id" },
    });
    fireEvent.click(screen.getByRole("button", { name: "実験構造の確認へ" }));

    expect(onStatisticsStructureRequested).toHaveBeenCalledOnce();
    const handedOff = onStatisticsStructureRequested.mock
      .calls[0]![0] as UnresolvedVisualizationProjectState;
    expect(handedOff.mapping?.identityDecision).toBe("no_id");
    expect(handedOff.mapping?.columns.some(({ role }) => role === "id")).toBe(false);
  });

  it("retains an explicit sample ID through structure handoff and unresolved save/open", async () => {
    const onStatisticsStructureRequested = vi.fn();
    const savedStates: UnresolvedVisualizationProjectState[] = [];
    const saveProject = vi.fn(async (state: UnresolvedVisualizationProjectState) => {
      savedStates.push(state);
      return { state, target: "C:/tmp/graph-only-with-id.lsa" };
    });
    const source = ["Condition\tValue\tDishID", "Control\t10\tdish-1", "Drug\t14\tdish-2"].join(
      "\n",
    );
    const first = render(
      <GraphOnlyVisualizationPage
        onNavigate={vi.fn()}
        saveProject={saveProject}
        onStatisticsStructureRequested={onStatisticsStructureRequested}
      />,
    );
    fireEvent.change(screen.getByRole("textbox", { name: "Graph用の表" }), {
      target: { value: source },
    });
    fireEvent.change(screen.getByRole("combobox", { name: "Graphの横軸" }), {
      target: { value: "0" },
    });
    fireEvent.change(screen.getByRole("combobox", { name: "Graphの測定値" }), {
      target: { value: "1" },
    });
    fireEvent.click(screen.getByRole("button", { name: "統計を確認" }));
    fireEvent.click(screen.getByRole("radio", { name: /処理・群分け/ }));
    fireEvent.change(screen.getByRole("combobox", { name: "統計で使う対象ID" }), {
      target: { value: "2" },
    });
    fireEvent.click(screen.getByRole("button", { name: "実験構造の確認へ" }));

    expect(onStatisticsStructureRequested).toHaveBeenCalledOnce();
    const handedOff = onStatisticsStructureRequested.mock
      .calls[0]![0] as UnresolvedVisualizationProjectState;
    expect(handedOff.rawLineage.rawText).toBe(source);
    expect(handedOff.table.rows).toEqual([
      ["Control", "10", "dish-1"],
      ["Drug", "14", "dish-2"],
    ]);
    expect(handedOff.mapping?.columns.find(({ role }) => role === "id")).toMatchObject({
      index: 2,
      header: "DishID",
    });
    expect(handedOff.mapping?.identityDecision).toBe("selected_column");
    expect(handedOff.statisticsReadiness.status).toBe("unresolved");

    fireEvent.click(screen.getByRole("button", { name: "このGraph用データを保存" }));
    await waitFor(() => expect(savedStates).toHaveLength(1));
    expect(savedStates[0]?.mapping?.columns.find(({ role }) => role === "id")).toMatchObject({
      index: 2,
      header: "DishID",
    });
    expect(savedStates[0]?.mapping?.identityDecision).toBe("selected_column");
    first.unmount();

    render(
      <GraphOnlyVisualizationPage
        onNavigate={vi.fn()}
        initialState={savedStates[0]}
        saveProject={saveProject}
        onStatisticsStructureRequested={vi.fn()}
      />,
    );
    fireEvent.click(screen.getByRole("button", { name: "統計を確認" }));
    fireEvent.click(screen.getByRole("radio", { name: /処理・群分け/ }));
    expect(screen.getByRole("combobox", { name: "統計で使う対象ID" })).toHaveValue("2");
    expect(screen.getByText(/独立した実験でも保持/)).toBeVisible();
  });

  it("moves focus through headers and cells while preserving horizontal caret editing", () => {
    render(<GraphOnlyVisualizationPage onNavigate={vi.fn()} />);
    fireEvent.change(screen.getByRole("textbox", { name: "Graph用の表" }), {
      target: { value: rawText },
    });
    const header = screen.getByTestId("graph-only-header-0");
    const firstCell = screen.getByTestId<HTMLInputElement>("graph-only-cell-0-0");
    const nextCell = screen.getByTestId<HTMLInputElement>("graph-only-cell-0-1");
    const nextRowCell = screen.getByTestId<HTMLInputElement>("graph-only-cell-1-0");

    header.focus();
    fireEvent.keyDown(header, { key: "Tab" });
    expect(screen.getByTestId("graph-only-header-1")).toHaveFocus();
    fireEvent.keyDown(screen.getByTestId("graph-only-header-1"), { key: "Tab" });
    expect(screen.getByTestId("graph-only-header-2")).toHaveFocus();
    fireEvent.keyDown(screen.getByTestId("graph-only-header-2"), { key: "Tab" });
    expect(firstCell).toHaveFocus();
    firstCell.setSelectionRange(2, 2);
    fireEvent.keyDown(firstCell, { key: "ArrowRight" });
    expect(firstCell).toHaveFocus();
    firstCell.setSelectionRange(firstCell.value.length, firstCell.value.length);
    fireEvent.keyDown(firstCell, { key: "ArrowRight" });
    expect(nextCell).toHaveFocus();
    fireEvent.keyDown(nextCell, { key: "Enter" });
    expect(screen.getByTestId("graph-only-cell-1-1")).toHaveFocus();
    const secondRowSecondCell = screen.getByTestId<HTMLInputElement>("graph-only-cell-1-1");
    secondRowSecondCell.setSelectionRange(0, 0);
    fireEvent.keyDown(secondRowSecondCell, { key: "ArrowLeft" });
    expect(nextRowCell).toHaveFocus();
  });
});

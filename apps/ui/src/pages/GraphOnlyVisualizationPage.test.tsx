import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

import {
  createUnresolvedVisualizationProjectState,
  type UnresolvedVisualizationProjectState,
} from "@lsaa/project";
import { ADAPTIVE_INPUT_FEATURE_FLAG } from "../app/adaptiveInputFeature";
import type { WorkspaceExitRequest } from "../app/workspaceLifecycle";
import { NewExperimentPage } from "./NewExperimentPage";
import { GraphOnlyVisualizationPage } from "./GraphOnlyVisualizationPage";
import { recordUsageGraphConfiguration, recordUsageMilestone } from "../app/usageTelemetry";

vi.mock("../app/usageTelemetry", () => ({
  recordUsageEntry: vi.fn(),
  recordUsageGraphConfiguration: vi.fn(),
  recordUsageMilestone: vi.fn(),
}));

const rawText = [
  "Condition\tValue\tBatch",
  "Control\t12.4\tA",
  "Drug A\t18.1\tA",
  "Drug A\t19.2\tB",
  "Drug B\t20.0\tA",
].join("\n");

function pasteGraphOnlyTable(value: string): void {
  fireEvent.paste(screen.getByTestId("graph-only-cell-0-0"), {
    clipboardData: { getData: () => value },
  });
}

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

  it("records privacy-safe first-data, first-Graph, and statistics handoff transitions once", async () => {
    const onStatisticsStructureRequested = vi.fn();
    vi.mocked(recordUsageMilestone).mockClear();
    vi.mocked(recordUsageGraphConfiguration).mockClear();
    render(
      <GraphOnlyVisualizationPage
        onNavigate={vi.fn()}
        onStatisticsStructureRequested={onStatisticsStructureRequested}
      />,
    );

    pasteGraphOnlyTable(rawText);
    fireEvent.change(screen.getByRole("combobox", { name: "Graphの横軸" }), {
      target: { value: "0" },
    });
    fireEvent.change(screen.getByRole("combobox", { name: "Graphの測定値" }), {
      target: { value: "1" },
    });

    await waitFor(() => {
      expect(recordUsageMilestone).toHaveBeenCalledWith("home", "data_entry_started");
      expect(recordUsageMilestone).toHaveBeenCalledWith("home", "graph_created");
      expect(recordUsageGraphConfiguration).toHaveBeenCalledWith("home", {
        graphFamily: "dot",
        origin: "direct_table",
        uncertainty: "none",
        rawPointsVisible: true,
        summaryVisible: false,
      });
    });
    fireEvent.click(screen.getByRole("button", { name: "統計を確認" }));
    fireEvent.click(screen.getByRole("radio", { name: /時間・濃度・距離/ }));
    fireEvent.click(screen.getByRole("radio", { name: /その他、または分からない/ }));

    expect(recordUsageMilestone).toHaveBeenCalledWith("home", "statistics_requested");
    expect(recordUsageMilestone).toHaveBeenCalledWith("home", "safe_stop");
    expect(
      vi
        .mocked(recordUsageMilestone)
        .mock.calls.filter(([, milestone]) =>
          ["data_entry_started", "graph_created", "statistics_requested", "safe_stop"].includes(
            milestone,
          ),
        ),
    ).toHaveLength(4);
  });

  it("keeps the explicitly labeled browser preview usable without production bridges", () => {
    window.localStorage.setItem(ADAPTIVE_INPUT_FEATURE_FLAG, "enabled");
    render(
      <NewExperimentPage browserPreview onNavigate={vi.fn()} onDedicatedEntryReady={vi.fn()} />,
    );

    expect(screen.getByRole("button", { name: "手元の表からGraphを作るを開く" })).toBeEnabled();
    fireEvent.click(screen.getByRole("button", { name: "手元の表からGraphを作るを開く" }));
    expect(screen.getByRole("heading", { name: "手元の表からGraphを作る" })).toBeVisible();
    expect(screen.getAllByRole("button", { name: /入口へ戻る|実験の種類を変更/ })).toHaveLength(1);
    expect(screen.getByRole("region", { name: "Graph用データシート" })).toBeVisible();
    expect(screen.getByTestId("graph-only-cell-0-0")).toHaveValue("X / condition");
    expect(screen.getByTestId("graph-only-cell-5-0")).toBeVisible();
    expect(screen.queryByTestId("graph-only-cell-6-0")).toBeNull();
    expect(screen.getByText(/直接入力用のX列とY列だけを最初からGraphへ対応付け/)).toBeVisible();
    expect(
      screen.getByText(/貼り付け・ファイル読込では列の意味を推測せず指定を解除/),
    ).toBeVisible();
    expect(screen.queryByRole("button", { name: "保存したGraph用データを開く" })).toBeNull();
    const saveButton = screen.getByRole("button", { name: "このGraph用データを保存" });
    expect(saveButton).toBeDisabled();
    const unavailableNote = screen.getByText(
      "このブラウザレビューではGraph用データを保存できません。デスクトップ版で利用できます。",
    );
    expect(saveButton).toHaveAttribute("aria-describedby", unavailableNote.id);
    window.localStorage.removeItem(ADAPTIVE_INPUT_FEATURE_FLAG);
  });

  it("resets imported X/Y mapping, renders after explicit mapping, and saves unresolved state", async () => {
    const saveProject = vi.fn(
      async (state: UnresolvedVisualizationProjectState, target?: string) => ({
        state,
        target: target ?? "C:/tmp/graph-only.lsa",
      }),
    );
    render(<GraphOnlyVisualizationPage onNavigate={vi.fn()} saveProject={saveProject} />);

    pasteGraphOnlyTable(rawText);
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
    expect(recordUsageMilestone).toHaveBeenCalledWith("home", "project_saved");

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
    expect(recordUsageMilestone).toHaveBeenCalledWith("home", "project_opened");

    expect(screen.getByTestId("graph-only-cell-0-0")).toHaveValue("Condition");
    expect(screen.getByTestId("graph-only-cell-4-2")).toHaveValue("A");
    expect(screen.getByRole("img", { name: /ValueをConditionごと/ })).toBeVisible();
    expect(screen.getByRole("combobox", { name: "Graphの横軸" })).toHaveValue("0");
    expect(screen.getByRole("combobox", { name: "Graphの測定値" })).toHaveValue("1");
    expect(screen.getByRole("combobox", { name: "Graphのグループ" })).toHaveValue("2");
    expect(screen.queryByText(/ExperimentDesign|biological n|identity column/i)).toBeNull();
  });

  it("keeps numeric X values on a numeric axis instead of spacing them as categories", () => {
    render(<GraphOnlyVisualizationPage onNavigate={vi.fn()} />);

    pasteGraphOnlyTable("Dose\tResponse\n0\t1\n1\t2\n10\t3");
    fireEvent.change(screen.getByRole("combobox", { name: "Graphの横軸" }), {
      target: { value: "0" },
    });
    fireEvent.change(screen.getByRole("combobox", { name: "Graphの測定値" }), {
      target: { value: "1" },
    });

    const graph = screen.getByRole("img", { name: /ResponseをDoseごと/ });
    expect(graph).toHaveAttribute("data-x-scale", "numeric");
    const xPositions = Array.from(
      graph.querySelectorAll<SVGCircleElement>("[data-graph-only-point='true']"),
      (point) => Number(point.getAttribute("cx")),
    );
    expect(xPositions).toHaveLength(3);
    expect(xPositions[2]! - xPositions[1]!).toBeGreaterThan((xPositions[1]! - xPositions[0]!) * 7);
    expect(screen.getByText(/横軸の数値間隔を保って表示/)).toBeVisible();
    expect(screen.getByRole("button", { name: "グラフをコピー" })).toBeEnabled();
    expect(screen.getByRole("button", { name: "SVGを書き出す" })).toBeEnabled();
    expect(screen.getByRole("button", { name: "PNGを書き出す" })).toBeEnabled();
  });

  it("persists title, axes, legend labels, and appearance without resolving statistics", async () => {
    const savedStates: UnresolvedVisualizationProjectState[] = [];
    const saveProject = vi.fn(async (state: UnresolvedVisualizationProjectState) => {
      savedStates.push(state);
      return { state, target: "C:/tmp/presented-graph-only.lsa" };
    });
    const view = render(
      <GraphOnlyVisualizationPage onNavigate={vi.fn()} saveProject={saveProject} />,
    );

    pasteGraphOnlyTable(rawText);
    fireEvent.change(screen.getByRole("combobox", { name: "Graphの横軸" }), {
      target: { value: "0" },
    });
    fireEvent.change(screen.getByRole("combobox", { name: "Graphの測定値" }), {
      target: { value: "1" },
    });
    fireEvent.change(screen.getByRole("combobox", { name: "Graphのグループ" }), {
      target: { value: "2" },
    });
    fireEvent.change(screen.getByRole("textbox", { name: "Graphタイトル" }), {
      target: { value: "Drug response overview" },
    });
    fireEvent.change(screen.getByRole("textbox", { name: "横軸の表示名" }), {
      target: { value: "Treatment" },
    });
    fireEvent.change(screen.getByRole("textbox", { name: "縦軸の表示名" }), {
      target: { value: "Signal (AU)" },
    });
    fireEvent.change(screen.getByRole("slider", { name: "点の大きさ" }), {
      target: { value: "8" },
    });
    fireEvent.change(screen.getByRole("textbox", { name: "Aの凡例名" }), {
      target: { value: "Batch alpha" },
    });
    fireEvent.click(screen.getByRole("checkbox", { name: "縦軸を0から始める" }));
    fireEvent.click(screen.getByRole("button", { name: "このGraph用データを保存" }));

    await waitFor(() => expect(savedStates).toHaveLength(1));
    const saved = savedStates[0]!;
    const activeGraph = saved.graphSpecs.find(({ id }) => id === saved.activeGraphId)!;
    expect(saved.metadata.projectName).toBe("Drug response overview");
    expect(activeGraph.axes).toMatchObject({
      xLabel: "Treatment",
      yLabel: "Signal (AU)",
      yStartAtZero: true,
    });
    expect(activeGraph.appearance.pointSize).toBe(8);
    expect(activeGraph.appearance.seriesStyles.A?.legendLabel).toBe("Batch alpha");
    expect(saved.rawLineage.rawText).toBe(rawText);
    expect(saved.statisticsReadiness.status).toBe("unresolved");
    expect(activeGraph.analysisResultId).toBeNull();
    expect("design" in saved).toBe(false);

    view.unmount();
    render(
      <GraphOnlyVisualizationPage
        onNavigate={vi.fn()}
        initialState={saved}
        initialTarget="C:/tmp/presented-graph-only.lsa"
      />,
    );
    expect(screen.getByRole("textbox", { name: "Graphタイトル" })).toHaveValue(
      "Drug response overview",
    );
    expect(screen.getByRole("textbox", { name: "横軸の表示名" })).toHaveValue("Treatment");
    expect(screen.getByRole("textbox", { name: "縦軸の表示名" })).toHaveValue("Signal (AU)");
    expect(screen.getByRole("textbox", { name: "Aの凡例名" })).toHaveValue("Batch alpha");
    expect(screen.getByRole("img", { name: /Signal \(AU\)をTreatmentごと/ })).toHaveTextContent(
      "Drug response overview",
    );
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
    fireEvent.change(screen.getByTestId("graph-only-cell-2-1"), {
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
    expect(screen.getByTestId("graph-only-cell-0-0")).toHaveValue("X / condition");
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
    expect(screen.getByTestId("graph-only-cell-0-0")).toHaveValue("X / condition");
    expect(screen.getByRole("button", { name: "このGraph用データを保存" })).toBeDisabled();
  });

  it("loads a CSV file into the same editable table and preserves file lineage after editing", async () => {
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
    await waitFor(() => expect(screen.getByTestId("graph-only-cell-2-1")).toHaveValue("14"));
    expect(screen.getByTestId("graph-only-cell-0-0")).toHaveValue("Condition");
    expect(screen.getByRole("combobox", { name: "Graphの横軸" })).toHaveValue("");
    expect(screen.getByRole("combobox", { name: "Graphの測定値" })).toHaveValue("");
    fireEvent.change(screen.getByTestId("graph-only-cell-2-1"), {
      target: { value: "15" },
    });

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
      rawText: ["Condition,Value", "Control,10", "Drug,15"].join("\n"),
    });
  });

  it("starts as direct entry with only X/Y mapped and retains that source after cell edits", async () => {
    const saveProject = vi.fn(async (state: UnresolvedVisualizationProjectState) => ({
      state,
      target: "C:/tmp/direct-entry.lsa",
    }));
    render(<GraphOnlyVisualizationPage onNavigate={vi.fn()} saveProject={saveProject} />);

    expect(screen.getByRole("combobox", { name: "Graphの横軸" })).toHaveValue("0");
    expect(screen.getByRole("combobox", { name: "Graphの測定値" })).toHaveValue("1");
    expect(screen.getByRole("combobox", { name: "Graphのグループ" })).toHaveValue("");
    fireEvent.change(screen.getByTestId("graph-only-cell-1-0"), {
      target: { value: "Control" },
    });
    fireEvent.change(screen.getByTestId("graph-only-cell-1-1"), {
      target: { value: "10" },
    });
    fireEvent.change(screen.getByTestId("graph-only-cell-2-0"), {
      target: { value: "Drug" },
    });
    fireEvent.change(screen.getByTestId("graph-only-cell-2-1"), {
      target: { value: "14" },
    });

    expect(screen.getByRole("img", { name: /Y \/ valueをX \/ conditionごと/ })).toBeVisible();
    fireEvent.click(screen.getByRole("button", { name: "このGraph用データを保存" }));
    await waitFor(() => expect(saveProject).toHaveBeenCalledOnce());

    const saved = saveProject.mock.calls[0]![0];
    expect(saved.rawLineage).toMatchObject({
      sourceKind: "direct_entry",
      sourceLabel: "direct-entry",
    });
    expect(saved.table.rows).toEqual([
      ["Control", "10", "", ""],
      ["Drug", "14", "", ""],
    ]);
    expect(saved.mapping?.columns.filter(({ role }) => role !== "metadata")).toMatchObject([
      { index: 0, role: "x" },
      { index: 1, role: "y" },
    ]);
  });

  it("keeps the direct X/Y mapping when values are pasted below unchanged headers", () => {
    render(<GraphOnlyVisualizationPage onNavigate={vi.fn()} />);

    fireEvent.paste(screen.getByTestId("graph-only-cell-1-0"), {
      clipboardData: {
        getData: () => ["Control\t10", "Control\t11", "Drug\t14", "Drug\t15"].join("\n"),
      },
    });

    expect(screen.getByRole("combobox", { name: "Graphの横軸" })).toHaveValue("0");
    expect(screen.getByRole("combobox", { name: "Graphの測定値" })).toHaveValue("1");
    expect(screen.getByRole("img", { name: /Y \/ valueをX \/ conditionごと/ })).toBeVisible();
  });

  it("edits any parsed cell without truncating the full table and serializes it to raw text", () => {
    const longRawText = [
      "Condition\tValue",
      ...Array.from({ length: 14 }, (_, index) => `Drug ${index + 1}\t${index + 1}`),
    ].join("\n");
    render(<GraphOnlyVisualizationPage onNavigate={vi.fn()} />);

    pasteGraphOnlyTable(longRawText);
    const editedCell = screen.getByTestId("graph-only-cell-14-1");
    fireEvent.change(editedCell, { target: { value: "edited" } });

    expect(editedCell).toHaveValue("edited");
    expect(screen.getByTestId("graph-only-cell-14-0")).toHaveValue("Drug 14");
    expect(screen.getByTestId("graph-only-cell-14-1")).toHaveValue("edited");
  });

  it("keeps a wide, long pasted rectangle in the single editable sheet", () => {
    render(<GraphOnlyVisualizationPage onNavigate={vi.fn()} />);
    const wideText = [
      "Condition\tValue\tBatch\tReplicate\tNote",
      ...Array.from({ length: 10 }, (_, index) => `Drug ${index + 1}\t${index + 1}\tA\tR1\tok`),
    ].join("\n");
    pasteGraphOnlyTable(wideText);

    expect(screen.getByTestId("graph-only-cell-0-4")).toHaveValue("Note");
    expect(screen.getByTestId("graph-only-cell-10-0")).toHaveValue("Drug 10");
    fireEvent.change(screen.getByTestId("graph-only-cell-10-4"), {
      target: { value: "R1" },
    });
    expect(screen.getByTestId("graph-only-cell-10-4")).toHaveValue("R1");
  });

  it("keeps edited cells in the unresolved state built for saving", async () => {
    const saveProject = vi.fn(
      async (state: UnresolvedVisualizationProjectState, target?: string) => ({
        state,
        target: target ?? "C:/tmp/graph-only-edited.lsa",
      }),
    );
    render(<GraphOnlyVisualizationPage onNavigate={vi.fn()} saveProject={saveProject} />);
    pasteGraphOnlyTable(rawText);
    fireEvent.change(screen.getByTestId("graph-only-cell-2-1"), {
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
    pasteGraphOnlyTable("Condition\tValue\tDishID\nControl\t10\tdish-1\nDrug\t14\tdish-2");
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

  it("promotes a no-ID table only after confirming that each row is a distinct unit", () => {
    const onStatisticsStructureRequested = vi.fn();
    render(
      <GraphOnlyVisualizationPage
        onNavigate={vi.fn()}
        onStatisticsStructureRequested={onStatisticsStructureRequested}
      />,
    );
    pasteGraphOnlyTable("Condition\tValue\nControl\t10\nDrug\t14");
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
    expect(screen.getByRole("button", { name: "実験構造の確認へ" })).toBeDisabled();
    fireEvent.click(
      screen.getByRole("radio", {
        name: /はい。各行が別々のanimal・dish・wellなどです/,
      }),
    );
    fireEvent.click(screen.getByRole("button", { name: "実験構造の確認へ" }));

    expect(onStatisticsStructureRequested).toHaveBeenCalledOnce();
    const handedOff = onStatisticsStructureRequested.mock
      .calls[0]![0] as UnresolvedVisualizationProjectState;
    expect(handedOff.mapping?.identityDecision).toBe("no_id");
    expect(handedOff.mapping?.sourceRowUnitDecision).toBe("each_row_distinct_unit");
    expect(handedOff.mapping?.columns.some(({ role }) => role === "id")).toBe(false);
  });

  it.each([
    [
      /いいえ。同じ対象内のCell・ROI・視野などを複数行に記録しています/,
      /Cell・ROI・視野を独立したnには変換しません/,
    ],
    [/^分からない$/, /1行が何を表すか確認できるまで統計へ進みません/],
  ] as const)("retains the source table and safe-stops unresolved row grain", (choice, message) => {
    const onStatisticsStructureRequested = vi.fn();
    render(
      <GraphOnlyVisualizationPage
        onNavigate={vi.fn()}
        onStatisticsStructureRequested={onStatisticsStructureRequested}
      />,
    );
    const source = "Condition\tValue\nControl\t10\nDrug\t14";
    pasteGraphOnlyTable(source);
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
    fireEvent.click(screen.getByRole("radio", { name: choice }));

    expect(screen.getByRole("alert")).toHaveTextContent(message);
    expect(screen.getByRole("button", { name: "実験構造の確認へ" })).toBeDisabled();
    expect(screen.getByTestId("graph-only-cell-1-0")).toHaveValue("Control");
    expect(screen.getByTestId("graph-only-cell-2-1")).toHaveValue("14");
    expect(onStatisticsStructureRequested).not.toHaveBeenCalled();
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
    pasteGraphOnlyTable(source);
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
    pasteGraphOnlyTable(rawText);
    const header = screen.getByTestId("graph-only-cell-0-0");
    const firstCell = screen.getByTestId<HTMLInputElement>("graph-only-cell-1-0");
    const nextCell = screen.getByTestId<HTMLInputElement>("graph-only-cell-1-1");
    const nextRowCell = screen.getByTestId<HTMLInputElement>("graph-only-cell-2-0");

    header.focus();
    fireEvent.keyDown(header, { key: "Tab" });
    expect(screen.getByTestId("graph-only-cell-0-1")).toHaveFocus();
    fireEvent.keyDown(screen.getByTestId("graph-only-cell-0-1"), { key: "Tab" });
    expect(screen.getByTestId("graph-only-cell-0-2")).toHaveFocus();
    fireEvent.keyDown(screen.getByTestId("graph-only-cell-0-2"), { key: "Tab" });
    expect(screen.getByTestId("graph-only-cell-0-3")).toHaveFocus();
    fireEvent.keyDown(screen.getByTestId("graph-only-cell-0-3"), { key: "Tab" });
    expect(screen.getByTestId("graph-only-cell-1-0")).toHaveFocus();
    firstCell.setSelectionRange(2, 2);
    fireEvent.keyDown(firstCell, { key: "ArrowRight" });
    expect(firstCell).toHaveFocus();
    firstCell.setSelectionRange(firstCell.value.length, firstCell.value.length);
    fireEvent.keyDown(firstCell, { key: "ArrowRight" });
    expect(nextCell).toHaveFocus();
    fireEvent.keyDown(nextCell, { key: "Enter" });
    expect(screen.getByTestId("graph-only-cell-2-1")).toHaveFocus();
    const secondRowSecondCell = screen.getByTestId<HTMLInputElement>("graph-only-cell-2-1");
    secondRowSecondCell.setSelectionRange(0, 0);
    fireEvent.keyDown(secondRowSecondCell, { key: "ArrowLeft" });
    expect(nextRowCell).toHaveFocus();
  });

  it("reports unsaved table edits and delegates Back to the shared discard lifecycle", async () => {
    const onBack = vi.fn();
    const onDirtyChange = vi.fn();
    let pendingExit: WorkspaceExitRequest | null = null;
    render(
      <GraphOnlyVisualizationPage
        onNavigate={vi.fn()}
        onBack={onBack}
        onDirtyChange={onDirtyChange}
        onRequestExit={(request) => {
          pendingExit = request;
        }}
      />,
    );

    pasteGraphOnlyTable(rawText);
    await waitFor(() => expect(onDirtyChange).toHaveBeenLastCalledWith(true));
    fireEvent.click(screen.getByRole("button", { name: /入口へ戻る/ }));

    expect(onBack).not.toHaveBeenCalled();
    const capturedExit = pendingExit as WorkspaceExitRequest | null;
    expect(capturedExit).toMatchObject({ actionLabel: "入口へ戻る" });
    if (!capturedExit) throw new Error("Expected the shared exit request to be captured");
    await capturedExit.proceed();
    expect(onBack).toHaveBeenCalledOnce();
  });
});

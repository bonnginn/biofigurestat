import { readFileSync } from "node:fs";
import { act, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

import {
  createUnresolvedVisualizationProjectState,
  UnresolvedVisualizationProjectStateSchema,
  type UnresolvedVisualizationProjectState,
} from "@lsaa/project";
import { recordUsageGraphConfiguration, recordUsageMilestone } from "../app/usageTelemetry";
import type { WorkspaceExitRequest } from "../app/workspaceLifecycle";
import { GraphOnlyVisualizationPage } from "./GraphOnlyVisualizationPage";

vi.mock("../app/usageTelemetry", () => ({
  recordUsageEntry: vi.fn(),
  recordUsageGraphEdit: vi.fn(),
  recordUsageGraphConfiguration: vi.fn(),
  recordUsageMilestone: vi.fn(),
}));

const rawText = [
  "Condition\tValue\tBatch\tDishID",
  "Control\t12.4\tA\tdish-1",
  "Drug A\t18.1\tA\tdish-2",
  "Drug A\t19.2\tB\tdish-3",
  "Drug B\t20.0\tA\tdish-4",
].join("\n");

function pasteTable(value = rawText): void {
  fireEvent.paste(screen.getByTestId("graph-only-cell-0-0"), {
    clipboardData: { getData: () => value },
  });
}

function mapColumns(input: { x?: string; y?: string; series?: string; id?: string } = {}): void {
  fireEvent.change(screen.getByRole("combobox", { name: "Graphの横軸" }), {
    target: { value: input.x ?? "0" },
  });
  fireEvent.change(screen.getByRole("combobox", { name: "Graphの測定値" }), {
    target: { value: input.y ?? "1" },
  });
  if (input.series !== undefined) {
    fireEvent.change(screen.getByRole("combobox", { name: "Graphの系列" }), {
      target: { value: input.series },
    });
  }
  if (input.id !== undefined) {
    fireEvent.change(screen.getByRole("combobox", { name: "Graph用データの対象ID" }), {
      target: { value: input.id },
    });
  }
}

function openGraph(): HTMLElement {
  fireEvent.click(screen.getByRole("button", { name: "Graphを作成" }));
  return screen.getByRole("region", { name: "表からグラフを作成" });
}

function mappedState(): UnresolvedVisualizationProjectState {
  return createUnresolvedVisualizationProjectState({
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
      headers: ["Condition", "Value", "Batch", "DishID"],
      rows: rawText
        .split("\n")
        .slice(1)
        .map((row) => row.split("\t")),
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
        { index: 3, header: "DishID", role: "id" },
      ],
      confirmedAt: "2026-08-28T00:00:00.000Z",
    },
    actor: "test",
  });
}

describe("Graph-only production workspace", () => {
  it("keeps the actual alpha4 table clean through hydration and no-op save/reopen, while graph edits remain dirty", async () => {
    const original = UnresolvedVisualizationProjectStateSchema.parse(
      JSON.parse(readFileSync("src/test-fixtures/alpha4-table-repaired-anonymous.json", "utf8")),
    );
    const originalJson = JSON.stringify(original);
    const onDirtyChange = vi.fn();
    const saveProject = vi.fn(async (state: UnresolvedVisualizationProjectState) => ({
      state: UnresolvedVisualizationProjectStateSchema.parse(JSON.parse(JSON.stringify(state))),
      target: "C:/tmp/table-noop.lsa",
    }));
    const view = render(
      <GraphOnlyVisualizationPage
        onNavigate={vi.fn()}
        initialState={original}
        initialTarget="C:/tmp/table.lsa"
        onDirtyChange={onDirtyChange}
        saveProject={saveProject}
      />,
    );
    await act(async () => {});
    expect(onDirtyChange).toHaveBeenLastCalledWith(false);
    fireEvent.click(screen.getByRole("button", { name: "このGraph用データを保存" }));
    await waitFor(() => expect(saveProject).toHaveBeenCalledOnce());
    await act(async () => {});
    expect(onDirtyChange).toHaveBeenLastCalledWith(false);
    const saved = saveProject.mock.calls[0]![0];
    expect(saved.table).toEqual(original.table);
    expect(saved.rawLineage).toEqual(original.rawLineage);
    expect(saved.mapping).toEqual(original.mapping);
    expect(saved.dataRevisions).toEqual(original.dataRevisions);
    expect(saved.graphSpecs).toEqual(original.graphSpecs);
    expect(saved.provenanceEvents).toEqual(original.provenanceEvents);
    expect(JSON.stringify(original)).toBe(originalJson);
    view.unmount();
    onDirtyChange.mockClear();
    render(
      <GraphOnlyVisualizationPage
        onNavigate={vi.fn()}
        initialState={saved}
        initialTarget="C:/tmp/table-noop.lsa"
        onDirtyChange={onDirtyChange}
      />,
    );
    await act(async () => {});
    expect(onDirtyChange).toHaveBeenLastCalledWith(false);
    fireEvent.change(screen.getByRole("textbox", { name: "Graphタイトル" }), {
      target: { value: "Edited graph" },
    });
    expect(onDirtyChange).toHaveBeenLastCalledWith(true);
  });

  it("keeps a saved alpha4 table clean when opened through the file command", async () => {
    const state = UnresolvedVisualizationProjectStateSchema.parse(
      JSON.parse(readFileSync("src/test-fixtures/alpha4-table-repaired-anonymous.json", "utf8")),
    );
    const onDirtyChange = vi.fn();
    render(
      <GraphOnlyVisualizationPage
        onNavigate={vi.fn()}
        openProject={async () => ({ state, target: "C:/tmp/alpha4-table.lsa" })}
        onDirtyChange={onDirtyChange}
      />,
    );
    fireEvent.click(screen.getByRole("button", { name: "保存したGraph用データを開く" }));
    await screen.findByRole("textbox", { name: "Graphタイトル" });
    await act(async () => {});
    expect(onDirtyChange).toHaveBeenLastCalledWith(false);
    fireEvent.change(screen.getByRole("textbox", { name: "Graphタイトル" }), {
      target: { value: "Changed" },
    });
    expect(onDirtyChange).toHaveBeenLastCalledWith(true);
  });

  it("preserves input edited while opening a saved project and blocks duplicate opens", async () => {
    let finish!: (value: { state: UnresolvedVisualizationProjectState; target: string }) => void;
    const openProject = vi.fn(
      () =>
        new Promise<{ state: UnresolvedVisualizationProjectState; target: string }>((resolve) => {
          finish = resolve;
        }),
    );
    render(<GraphOnlyVisualizationPage onNavigate={vi.fn()} openProject={openProject} />);
    const button = screen.getByRole("button", { name: "保存したGraph用データを開く" });
    fireEvent.click(button);
    fireEvent.click(button);
    expect(openProject).toHaveBeenCalledTimes(1);
    fireEvent.change(screen.getByTestId("graph-only-cell-1-1"), { target: { value: "99" } });
    await act(async () => finish({ state: mappedState(), target: "C:/tmp/other.lsa" }));
    expect(screen.getByTestId("graph-only-cell-1-1")).toHaveValue("99");
    expect(screen.getByRole("alert")).toHaveTextContent("保全しました");
  });

  it("preserves real edits and row order when a delayed clipboard read returns stale data", async () => {
    let finish!: (text: string) => void;
    const readText = vi.fn(
      () =>
        new Promise<string>((resolve) => {
          finish = resolve;
        }),
    );
    const previousClipboard = Object.getOwnPropertyDescriptor(navigator, "clipboard");
    Object.defineProperty(navigator, "clipboard", { configurable: true, value: { readText } });
    try {
      const onDirtyChange = vi.fn();
      render(<GraphOnlyVisualizationPage onNavigate={vi.fn()} onDirtyChange={onDirtyChange} />);
      pasteTable();
      fireEvent.click(screen.getByRole("button", { name: "クリップボードから貼り付け" }));
      expect(readText).toHaveBeenCalledOnce();
      const lines = rawText.split("\n");
      const editedRows = [lines[0], lines[2], lines[1]!.replace("12.4", "99"), ...lines.slice(3)];
      pasteTable(editedRows.join("\n"));
      await act(async () => finish(rawText));
      expect(screen.getByTestId("graph-only-cell-1-0")).toHaveValue("Drug A");
      expect(screen.getByTestId("graph-only-cell-2-0")).toHaveValue("Control");
      expect(screen.getByTestId("graph-only-cell-2-1")).toHaveValue("99");
      expect(screen.getByRole("alert")).toHaveTextContent("保全しました");
      expect(onDirtyChange).toHaveBeenLastCalledWith(true);
    } finally {
      if (previousClipboard) Object.defineProperty(navigator, "clipboard", previousClipboard);
      else Reflect.deleteProperty(navigator, "clipboard");
    }
  });

  afterEach(() => vi.clearAllMocks());

  it("keeps Data, Graph, and Statistics as separate workspace tabs", () => {
    render(<GraphOnlyVisualizationPage onNavigate={vi.fn()} />);
    expect(screen.getByRole("button", { name: "データ" })).toHaveAttribute("aria-current", "page");
    expect(screen.getByRole("button", { name: "Graph" })).toBeDisabled();
    expect(screen.getByRole("button", { name: "Statistics" })).toBeDisabled();

    pasteTable();
    mapColumns({ id: "3" });
    const workbench = openGraph();
    expect(screen.getByRole("button", { name: "Graph" })).toHaveAttribute("aria-current", "page");
    expect(within(workbench).getByRole("region", { name: "グラフプレビュー" })).toBeVisible();
    expect(within(workbench).getByRole("button", { name: "グラフをコピー" })).toBeEnabled();
    expect(within(workbench).getByRole("button", { name: "SVGを書き出す" })).toBeEnabled();
    expect(within(workbench).getByRole("button", { name: "PNGを書き出す" })).toBeEnabled();
    expect(
      within(workbench).getByText(/実験単位と統計的なnは未確認/, { selector: "p" }),
    ).toBeVisible();
    expect(within(workbench).getByRole("heading", { name: "元表の行" })).toBeVisible();
  });

  it("uses an ID column only as a row label and never as a legend series", () => {
    render(<GraphOnlyVisualizationPage onNavigate={vi.fn()} />);
    pasteTable();
    mapColumns({ id: "3" });
    const workbench = openGraph();
    expect(within(workbench).queryByText("dish-1")).toBeNull();
    fireEvent.click(screen.getByRole("button", { name: "データ" }));
    expect(screen.getByRole("combobox", { name: "Graph用データの対象ID" })).toHaveValue("3");
    expect(screen.getByRole("combobox", { name: "Graphの系列" })).toHaveValue("");
  });

  it("blocks a likely sample-ID column from silently becoming one series per row", () => {
    render(<GraphOnlyVisualizationPage onNavigate={vi.fn()} />);
    pasteTable();
    mapColumns({ series: "3" });
    expect(screen.getByRole("alert")).toHaveTextContent("各行で値がすべて異なります");
    expect(screen.getByRole("button", { name: "Graphを作成" })).toBeDisabled();
    fireEvent.click(screen.getByRole("checkbox", { name: "各行を別系列として表示する意図である" }));
    expect(screen.getByRole("button", { name: "Graphを作成" })).toBeEnabled();
  });

  it("retains ordinary grouping while keeping sample ID separate", () => {
    render(<GraphOnlyVisualizationPage onNavigate={vi.fn()} />);
    pasteTable();
    mapColumns({ series: "2", id: "3" });
    const workbench = openGraph();
    expect(within(workbench).getByRole("region", { name: "グラフプレビュー" })).toBeVisible();
    expect(screen.queryByRole("alert")).toBeNull();
  });

  it("saves source, mapping, and full editor presentation without analysis facts", async () => {
    const saveProject = vi.fn(async (state: UnresolvedVisualizationProjectState) => ({
      state,
      target: "C:/tmp/graph-only.lsa",
    }));
    render(<GraphOnlyVisualizationPage onNavigate={vi.fn()} saveProject={saveProject} />);
    pasteTable();
    mapColumns({ series: "2", id: "3" });
    const workbench = openGraph();

    fireEvent.click(within(workbench).getByRole("img", { name: /Valueの表の行ごとのグラフ/ }));
    fireEvent.change(within(workbench).getByRole("combobox", { name: "グラフの基本形" }), {
      target: { value: "box" },
    });
    fireEvent.click(screen.getByRole("button", { name: "このGraph用データを保存" }));

    await waitFor(() => expect(saveProject).toHaveBeenCalledOnce());
    const saved = saveProject.mock.calls[0]![0];
    expect(saved.mapping?.columns.find(({ role }) => role === "id")?.header).toBe("DishID");
    expect(saved.rawLineage.rawText).toBe(rawText);
    expect(saved.statisticsReadiness.status).toBe("unresolved");
    expect(saved.graphSpecs.at(-1)?.editorPresentation?.graphType).toBe("box");
    expect(saved.graphSpecs.at(-1)?.analysisResultId).toBeNull();
    expect("design" in saved).toBe(false);
    expect("analysisRequest" in saved).toBe(false);
  });

  it("keeps edits made during a pending save dirty and saves them on the next request", async () => {
    let finish!: () => void;
    const onDirtyChange = vi.fn();
    const saveProject = vi.fn(
      (state: UnresolvedVisualizationProjectState) =>
        new Promise<{ state: UnresolvedVisualizationProjectState; target: string }>((resolve) => {
          finish = () => resolve({ state, target: "C:/tmp/graph-only.lsa" });
        }),
    );
    render(
      <GraphOnlyVisualizationPage
        onNavigate={vi.fn()}
        saveProject={saveProject}
        onDirtyChange={onDirtyChange}
      />,
    );
    pasteTable();
    mapColumns();
    openGraph();
    fireEvent.click(screen.getByRole("button", { name: "このGraph用データを保存" }));
    await waitFor(() => expect(saveProject).toHaveBeenCalledTimes(1));
    const changedText = rawText.replace("12.4", "14.8");
    fireEvent.click(screen.getByRole("button", { name: "データ" }));
    pasteTable(changedText);
    mapColumns();
    await act(async () => finish());
    expect(saveProject.mock.calls[0]![0].rawLineage.rawText).toBe(rawText);
    expect(onDirtyChange).toHaveBeenLastCalledWith(true);
    openGraph();
    fireEvent.click(screen.getByRole("button", { name: "このGraph用データを保存" }));
    await waitFor(() => expect(saveProject).toHaveBeenCalledTimes(2));
    expect(saveProject.mock.calls[1]![0].rawLineage.rawText).toBe(changedText);
    await act(async () => finish());
    expect(onDirtyChange).toHaveBeenLastCalledWith(false);
  });

  it("reopens a mapped project and keeps the normal editor available", async () => {
    const state = mappedState();
    const openProject = vi.fn(async () => ({ state, target: "C:/tmp/graph-only.lsa" }));
    render(<GraphOnlyVisualizationPage onNavigate={vi.fn()} openProject={openProject} />);
    fireEvent.click(screen.getByRole("button", { name: "保存したGraph用データを開く" }));
    await waitFor(() => expect(openProject).toHaveBeenCalledOnce());
    await waitFor(() =>
      expect(screen.getByRole("combobox", { name: "Graphの系列" })).toHaveValue("2"),
    );
    expect(screen.getByRole("combobox", { name: "Graph用データの対象ID" })).toHaveValue("3");
    openGraph();
    expect(screen.getByRole("region", { name: "表からグラフを作成" })).toBeVisible();
  });

  it("keeps Statistics behind an explicit experimental-structure handoff", () => {
    const onStatisticsStructureRequested = vi.fn();
    render(
      <GraphOnlyVisualizationPage
        onNavigate={vi.fn()}
        onStatisticsStructureRequested={onStatisticsStructureRequested}
      />,
    );
    pasteTable();
    mapColumns({ id: "3" });
    fireEvent.click(screen.getByRole("button", { name: "Statistics" }));
    fireEvent.click(screen.getByRole("radio", { name: /処理・群分け/ }));
    fireEvent.change(screen.getByRole("combobox", { name: "統計で使う対象ID" }), {
      target: { value: "3" },
    });
    fireEvent.click(screen.getByRole("button", { name: "実験構造の確認へ" }));
    expect(onStatisticsStructureRequested).toHaveBeenCalledWith(
      expect.objectContaining({
        mapping: expect.objectContaining({
          columns: expect.arrayContaining([
            expect.objectContaining({ index: 3, header: "DishID", role: "id" }),
          ]),
        }),
      }),
    );
  });

  it("records privacy-safe graph and statistics milestones", async () => {
    render(<GraphOnlyVisualizationPage onNavigate={vi.fn()} />);
    pasteTable();
    mapColumns({ id: "3" });
    await waitFor(() => {
      expect(recordUsageMilestone).toHaveBeenCalledWith("home", "data_entry_started");
      expect(recordUsageMilestone).toHaveBeenCalledWith("home", "graph_created");
      expect(recordUsageGraphConfiguration).toHaveBeenCalledWith(
        "home",
        expect.objectContaining({ origin: "direct_table" }),
      );
    });
    fireEvent.click(screen.getByRole("button", { name: "Statistics" }));
    expect(recordUsageMilestone).toHaveBeenCalledWith("home", "statistics_requested");
  });

  it("keeps spreadsheet edits and the visible value synchronized", () => {
    render(<GraphOnlyVisualizationPage onNavigate={vi.fn()} />);
    pasteTable("Condition\tValue\nControl\t1\nDrug\t2");
    const valueCell = screen.getByTestId("graph-only-cell-2-1");
    fireEvent.change(valueCell, { target: { value: "2.75" } });
    fireEvent.blur(valueCell);
    expect(screen.getByTestId("graph-only-cell-2-1")).toHaveValue("2.75");
  });

  it("delegates dirty Back navigation to the shared lifecycle", () => {
    const onDirtyChange = vi.fn();
    let pendingExit: WorkspaceExitRequest | null = null;
    render(
      <GraphOnlyVisualizationPage
        onNavigate={vi.fn()}
        onDirtyChange={onDirtyChange}
        onRequestExit={(request) => {
          pendingExit = request;
        }}
      />,
    );
    pasteTable();
    fireEvent.click(screen.getByRole("button", { name: "入口へ戻る" }));
    expect(onDirtyChange).toHaveBeenLastCalledWith(true);
    expect(pendingExit).toEqual(expect.objectContaining({ actionLabel: "入口へ戻る" }));
  });
});

describe("quoted record import", () => {
  it("preserves a cell edited while a table file is reading", async () => {
    render(<GraphOnlyVisualizationPage onNavigate={vi.fn()} />);
    let finish!: (contents: string) => void;
    const file = new File([], "old.tsv");
    Object.defineProperty(file, "text", {
      value: () =>
        new Promise<string>((resolve) => {
          finish = resolve;
        }),
    });
    fireEvent.change(screen.getByLabelText("Graph用の表ファイル"), { target: { files: [file] } });
    fireEvent.change(screen.getByTestId("graph-only-cell-1-1"), { target: { value: "99" } });
    await act(async () => finish("X\tY\nold\t1"));
    expect(screen.getByTestId("graph-only-cell-1-1")).toHaveValue("99");
    expect(screen.getByRole("alert")).toHaveTextContent("保全しました");
  });
  it.each([
    { label: "unclosed quotes", text: 'Condition,Value\n"A\nB,1.25' },
    { label: "space after closing quote", text: 'Condition,Value\n"Drug" ,1.25' },
    { label: "tab after closing quote", text: 'Condition,Value\n"Drug"\t,1.25' },
    { label: "NBSP after closing quote", text: 'Condition,Value\n"Drug"\u00a0,1.25' },
  ])("keeps the current table and mapping when a file has $label", async ({ text }) => {
    const { container } = render(<GraphOnlyVisualizationPage onNavigate={vi.fn()} />);
    pasteTable();
    mapColumns();
    const file = new File([], "invalid.csv", { type: "text/csv" });
    Object.defineProperty(file, "text", { value: async () => text });
    fireEvent.change(container.querySelector('input[type="file"]')!, { target: { files: [file] } });
    await waitFor(() =>
      expect(screen.getByRole("alert")).toHaveTextContent("現在の表は変更していません"),
    );
    expect(screen.getByTestId("graph-only-cell-1-0")).toHaveValue("Control");
    expect(screen.getByRole("combobox", { name: "Graphの測定値" })).toHaveValue("1");
  });
  it("imports multiline CSV and retains the label while editing a neighboring value", async () => {
    const { container } = render(<GraphOnlyVisualizationPage onNavigate={vi.fn()} />);
    const file = new File([], "multiline.csv", { type: "text/csv" });
    Object.defineProperty(file, "text", {
      value: async () => 'Condition,Value\r\n"A\r\nB",1.25\r\nC,\r\nD,-2.5',
    });
    fireEvent.change(container.querySelector('input[type="file"]')!, { target: { files: [file] } });
    await waitFor(() => expect(screen.getByTestId("graph-only-cell-1-0")).toHaveValue("A\nB"));
    fireEvent.change(screen.getByTestId("graph-only-cell-3-1"), { target: { value: "-3.5" } });
    expect(screen.getByTestId("graph-only-cell-1-0")).toHaveValue("A\nB");
    expect(screen.getByTestId("graph-only-cell-2-1")).toHaveValue("");
    mapColumns();
    expect(openGraph()).toBeInTheDocument();
  });
  it("passes exact imported raw text and multiline cells through save and reopen", async () => {
    const source =
      '\uFEFFCondition,Value,Note\r\n"A\r\nB",1.25,"  raw  "\r\nC,,missing\r\nD,-2.5,last\r\n';
    const saveProject = vi.fn(async (state: UnresolvedVisualizationProjectState) => ({
      state,
      target: "C:/tmp/multiline.lsa",
    }));
    const view = render(
      <GraphOnlyVisualizationPage onNavigate={vi.fn()} saveProject={saveProject} />,
    );
    const file = new File([], "multiline.csv");
    Object.defineProperty(file, "text", { value: async () => source });
    fireEvent.change(screen.getByLabelText("Graph用の表ファイル"), { target: { files: [file] } });
    await waitFor(() => expect(screen.getByTestId("graph-only-cell-1-0")).toHaveValue("A\nB"));
    mapColumns();
    openGraph();
    fireEvent.click(screen.getByRole("button", { name: "このGraph用データを保存" }));
    await waitFor(() => expect(saveProject).toHaveBeenCalledOnce());
    const saved = saveProject.mock.calls[0]![0];
    expect(saved.rawLineage.rawText).toBe(source);
    expect(saved.table.rows).toEqual([
      ["A\nB", "1.25", "raw"],
      ["C", "", "missing"],
      ["D", "-2.5", "last"],
    ]);
    view.unmount();
    render(
      <GraphOnlyVisualizationPage
        onNavigate={vi.fn()}
        openProject={async () => ({ state: saved, target: "C:/tmp/multiline.lsa" })}
      />,
    );
    fireEvent.click(screen.getByRole("button", { name: "保存したGraph用データを開く" }));
    await waitFor(() => expect(screen.getByTestId("graph-only-cell-1-0")).toHaveValue("A\nB"));
    expect(screen.getByTestId("graph-only-cell-1-2")).toHaveValue("  raw  ");
    expect(screen.getByTestId("graph-only-cell-2-1")).toHaveValue("");
  });
});

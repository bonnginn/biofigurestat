import { act, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

import {
  createUnresolvedVisualizationProjectState,
  type UnresolvedVisualizationProjectState,
} from "@lsaa/project";
import { recordUsageGraphConfiguration, recordUsageMilestone } from "../app/usageTelemetry";
import type { WorkspaceExitRequest } from "../app/workspaceLifecycle";
import { GraphOnlyVisualizationPage } from "./GraphOnlyVisualizationPage";
import { resetAppLocaleForTests, setAppLocale } from "../app/appLocale";
import { expectNoJapaneseUi } from "../test/expectNoJapaneseUi";

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
  afterEach(() => {
    vi.clearAllMocks();
    act(() => resetAppLocaleForTests("ja"));
  });

  it("shows the table mapping workflow in English", () => {
    act(() => setAppLocale("en"));
    const view = render(<GraphOnlyVisualizationPage onNavigate={vi.fn()} />);

    expect(screen.getByRole("heading", { name: "Create a Graph from your table" })).toBeVisible();
    expect(screen.getByRole("heading", { name: "1. Enter or paste a table" })).toBeVisible();
    expect(screen.getByRole("heading", { name: "2. Map columns to the Graph" })).toBeVisible();
    expect(screen.getByRole("button", { name: "Create Graph" })).toBeDisabled();
    expectNoJapaneseUi(view.container);
  });

  it("keeps the Graph-only statistics handoff in English without inferring biological n", () => {
    act(() => setAppLocale("en"));
    const view = render(
      <GraphOnlyVisualizationPage
        onNavigate={vi.fn()}
        onStatisticsStructureRequested={vi.fn()}
      />,
    );

    pasteTable();
    fireEvent.change(screen.getByRole("combobox", { name: "Graph X axis" }), {
      target: { value: "0" },
    });
    fireEvent.change(screen.getByRole("combobox", { name: "Graph measured value" }), {
      target: { value: "1" },
    });
    fireEvent.change(screen.getByRole("combobox", { name: "Subject ID for Graph data" }), {
      target: { value: "3" },
    });
    fireEvent.click(screen.getByRole("button", { name: "Create Graph" }));
    fireEvent.click(screen.getByRole("button", { name: "Review statistics" }));

    expect(
      screen.getByRole("heading", {
        name: "Add experiment information required for statistics",
      }),
    ).toBeVisible();
    expect(
      screen.getByText(/What does the X axis .*Condition.* represent/),
    ).toBeVisible();
    expect(screen.getByRole("button", { name: "Continue to experiment structure" })).toBeDisabled();
    expectNoJapaneseUi(view.container);
  });

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
    expect(within(workbench).getByText(/実験単位と統計的なnは未確認/)).toBeVisible();
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

    fireEvent.click(within(workbench).getByRole("img", { name: /Valueの実験単位ごとのグラフ/ }));
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

  it("reopens a mapped project and keeps the normal editor available", async () => {
    const state = mappedState();
    const openProject = vi.fn(async () => ({ state, target: "C:/tmp/graph-only.lsa" }));
    render(<GraphOnlyVisualizationPage onNavigate={vi.fn()} openProject={openProject} />);
    fireEvent.click(screen.getByRole("button", { name: "保存したGraph用データを開く" }));
    await waitFor(() => expect(openProject).toHaveBeenCalledOnce());
    expect(screen.getByRole("combobox", { name: "Graphの系列" })).toHaveValue("2");
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

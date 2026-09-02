import { act, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { createUnresolvedVisualizationProjectState, ProjectStateSchema } from "@lsaa/project";
import type * as BenchmarkEvaluation from "../app/benchmarkEvaluation";
import type * as GraphExport from "../app/graphExport";
import type * as SpecializedGraphExport from "../app/specializedGraphExport";
import type { DedicatedEntryIntent } from "../app/dedicatedEntryIntent";
import type {
  OpenedUnresolvedVisualizationProject,
  SaveProjectAction,
  SaveUnresolvedVisualizationProjectAction,
} from "../app/projectActions";
import type { SpecializedCoreDraft } from "../app/specializedAnalysisDrafts";
import { createTimeToEventContractProjection } from "../app/timeToEventProjection";
import type { RequestWorkspaceExit } from "../app/workspaceLifecycle";
import { SpecializedCorePage } from "./SpecializedCorePage";
import { resetAppLocaleForTests, setAppLocale } from "../app/appLocale";
import { expectNoJapaneseUi } from "../test/expectNoJapaneseUi";

afterEach(() => act(() => resetAppLocaleForTests("ja")));

const recordBenchmarkEvent = vi.hoisted(() => vi.fn());
const recordUsageMilestone = vi.hoisted(() => vi.fn());
const recordUsageGraphEdit = vi.hoisted(() => vi.fn());
const recordUsageGraphConfiguration = vi.hoisted(() => vi.fn());
const exportRenderedGraphPng = vi.hoisted(() => vi.fn(async () => undefined));
const exportGraphPng = vi.hoisted(() => vi.fn(async () => undefined));
vi.mock("../app/benchmarkEvaluation", async (importOriginal) => ({
  ...(await importOriginal<typeof BenchmarkEvaluation>()),
  recordBenchmarkEvent,
}));
vi.mock("../app/specializedGraphExport", async (importOriginal) => ({
  ...(await importOriginal<typeof SpecializedGraphExport>()),
  exportRenderedGraphPng,
}));
vi.mock("../app/graphExport", async (importOriginal) => ({
  ...(await importOriginal<typeof GraphExport>()),
  exportGraphPng,
}));
vi.mock("../app/usageTelemetry", () => ({
  recordUsageGraphConfiguration,
  recordUsageGraphEdit,
  recordUsageMilestone,
}));

const survivalExample = [
  "Unit ID\tGroup\tFollow-up time\tStatus",
  "mouse-1\tControl\t4\tEvent",
  "mouse-2\tControl\t7\tCensored",
  "mouse-3\tTreatment\t6\tEvent",
  "mouse-4\tTreatment\t9\tCensored",
].join("\n");

const cellTimeToEventIntent: DedicatedEntryIntent = {
  schemaVersion: "0.1.0",
  moduleId: "time_to_event",
  destination: "survival",
  sourceContext: "cell_culture",
  entryRouteId: "cell_first_terminal_event",
  experimentName: "Cell time-to-first-event",
  experimentDescription: "Each identified cell is followed until its first event or censoring.",
  subjectUnitLabel: "Cell",
  facts: {
    timeToEventPattern: "single_terminal_event_or_censoring",
    subjectUnitRelationship: "unknown",
  },
};

const directHeatmapIntent: DedicatedEntryIntent = {
  schemaVersion: "0.1.0",
  moduleId: "matrix_visualization",
  destination: "heatmap",
  sourceContext: "general_assay",
  entryRouteId: "direct_heatmap",
  experimentName: "ヒートマップ",
  experimentDescription: "数値行列を、その配置を保ったまま可視化する",
  subjectUnitLabel: "Matrix row",
  facts: {},
};

const expandAdaptiveStatistics = () =>
  fireEvent.click(screen.getByRole("button", { name: "統計解析を設定" }));

describe("specialized Core entry pages", () => {
  it("shows the shared Survival workspace and censoring instructions in English", () => {
    act(() => setAppLocale("en"));
    const view = render(
      <SpecializedCorePage
        mode="survival"
        onBack={vi.fn()}
        entryIntent={cellTimeToEventIntent}
        initialText={survivalExample}
      />,
    );

    expect(screen.getByRole("button", { name: "Data" })).toBeVisible();
    expect(screen.getByRole("button", { name: "Graph" })).toBeVisible();
    expect(screen.getByRole("button", { name: "Statistics" })).toBeVisible();
    expect(screen.getByText(/Censoring is not converted to missingness/)).toBeVisible();
    expectNoJapaneseUi(view.container);
  });

  it("shows the Heatmap workspace without Japanese application copy in English mode", () => {
    act(() => setAppLocale("en"));
    const view = render(<SpecializedCorePage mode="heatmap" onBack={vi.fn()} />);

    expect(screen.getByRole("heading", { name: "Heatmap" })).toBeVisible();
    expectNoJapaneseUi(view.container);
  });

  it("keeps invalid specialist data errors in English", () => {
    act(() => setAppLocale("en"));
    const survivalView = render(
      <SpecializedCorePage
        mode="survival"
        onBack={vi.fn()}
        entryIntent={cellTimeToEventIntent}
        initialText={
          "Unit ID\tGroup\tFollow-up time\tStatus\nmouse-1\tControl\tnot-a-number\tEvent"
        }
      />,
    );

    expect(screen.getByText("Check the time-to-event data and required columns.")).toBeVisible();
    expectNoJapaneseUi(survivalView.container);
    survivalView.unmount();

    const heatmapView = render(
      <SpecializedCorePage
        mode="heatmap"
        onBack={vi.fn()}
        initialText={"Feature\tSample A\nProtein A\tnot-a-number"}
      />,
    );

    expect(screen.getByText("Check the matrix data and numeric cells.")).toBeVisible();
    expectNoJapaneseUi(heatmapView.container);
  });

  it("keeps Heatmap save failures in English even when an internal error is Japanese", async () => {
    act(() => setAppLocale("en"));
    const saveUnresolvedVisualizationProject = vi.fn<SaveUnresolvedVisualizationProjectAction>(
      async () => {
        throw new Error("保存先へ書き込めませんでした");
      },
    );
    const view = render(
      <SpecializedCorePage
        mode="heatmap"
        onBack={vi.fn()}
        saveUnresolvedVisualizationProject={saveUnresolvedVisualizationProject}
      />,
    );

    fireEvent.change(screen.getByLabelText("Matrix data"), {
      target: { value: "Feature\tSample A\nProtein A\t1" },
    });
    fireEvent.click(screen.getByRole("button", { name: "Save project" }));

    expect(
      await screen.findByText(
        "The project could not be saved. Your current entries were retained.",
      ),
    ).toBeVisible();
    expectNoJapaneseUi(view.container);
  });

  it("provides English exit-guard action labels in English mode", () => {
    act(() => setAppLocale("en"));
    const requests: Parameters<RequestWorkspaceExit>[0][] = [];
    render(
      <SpecializedCorePage
        mode="survival"
        onBack={vi.fn()}
        onRequestExit={(request) => requests.push(request)}
      />,
    );

    fireEvent.click(screen.getByRole("button", { name: /Back/u }));

    expect(requests).toHaveLength(1);
    expect(requests[0]?.actionLabel).toBe("Go back");
  });

  it("生存時間はData・Graph・Statisticsを同じワークスペースの別面として切り替える", () => {
    render(
      <SpecializedCorePage
        mode="survival"
        onBack={vi.fn()}
        entryIntent={cellTimeToEventIntent}
        initialText={survivalExample}
      />,
    );
    const dataPanel = document.getElementById("survival-data")?.closest(".workspace-panel");
    const graphPanel = document.getElementById("survival-graph");
    expect(screen.getByRole("button", { name: "データ" })).toHaveAttribute("aria-pressed", "true");
    expect(graphPanel).toHaveClass("workspace-tab-panel--inactive");

    fireEvent.click(screen.getByRole("button", { name: "グラフ" }));
    expect(dataPanel).toHaveClass("workspace-tab-panel--inactive");
    expect(graphPanel).not.toHaveClass("workspace-tab-panel--inactive");

    fireEvent.click(screen.getByRole("button", { name: "統計" }));
    expect(screen.getByRole("button", { name: "統計" })).toHaveAttribute("aria-pressed", "true");
    expect(screen.getByLabelText("time-to-eventの1行と独立した実験例の関係")).toBeVisible();
  });

  it("development audit switcher routes through the workspace exit guard", () => {
    const onNavigate = vi.fn();
    const onDirtyChange = vi.fn();
    const requests: Parameters<RequestWorkspaceExit>[0][] = [];
    const onRequestExit: RequestWorkspaceExit = (request) => {
      requests.push(request);
    };
    render(
      <SpecializedCorePage
        mode="survival"
        onBack={vi.fn()}
        onNavigate={onNavigate}
        analysisRouteSwitcherAccess="development_audit"
        onDirtyChange={onDirtyChange}
        onRequestExit={onRequestExit}
      />,
    );

    fireEvent.change(screen.getByRole("combobox", { name: "専門解析を切り替える" }), {
      target: { value: "heatmap" },
    });

    expect(onNavigate).not.toHaveBeenCalled();
    expect(requests).toHaveLength(1);
    expect(requests[0]?.actionLabel).toBe("別の専門解析へ切り替える");
    requests[0]?.proceed();
    expect(onDirtyChange).toHaveBeenCalledWith(false);
    expect(onNavigate).toHaveBeenCalledWith("heatmap");
  });

  it("browser previewでは利用できないproject保存をdisabledで示す", () => {
    render(<SpecializedCorePage mode="survival" onBack={vi.fn()} />);
    expect(screen.getByRole("button", { name: "プロジェクトを保存" })).toBeDisabled();
  });

  it("does not treat opening the optional statistics disclosure as unsaved scientific work", async () => {
    const onDirtyChange = vi.fn();
    render(
      <SpecializedCorePage
        mode="survival"
        onBack={vi.fn()}
        entryIntent={cellTimeToEventIntent}
        initialText={survivalExample}
        onDirtyChange={onDirtyChange}
      />,
    );

    await waitFor(() => expect(onDirtyChange).toHaveBeenCalledWith(false));
    fireEvent.click(screen.getByRole("button", { name: "統計解析を設定" }));

    expect(onDirtyChange).not.toHaveBeenCalledWith(true);

    fireEvent.change(screen.getByLabelText("time-to-eventの1行と独立した実験例の関係"), {
      target: { value: "subject_is_experimental_unit" },
    });
    await waitFor(() => expect(onDirtyChange).toHaveBeenLastCalledWith(true));
  });

  it("keeps the direct survival route empty until the researcher explicitly loads an example", () => {
    render(<SpecializedCorePage mode="survival" onBack={vi.fn()} analysisRunner={vi.fn()} />);
    expect(screen.getByText("専門解析")).toBeVisible();
    expect(screen.getByRole("heading", { name: "生存時間" })).toBeVisible();
    expect(screen.getByText(/生存時間（time-to-event）/)).toBeVisible();
    expect(screen.queryByLabelText("time-to-eventの1行と独立した実験例の関係")).toBeNull();
    expect(screen.getByLabelText("Survival data")).toHaveValue(
      "Unit ID\tGroup\tFollow-up time\tStatus",
    );
    expect(screen.getByRole("button", { name: "Kaplan–Meier + log-rankを実行" })).toBeDisabled();
    expect(screen.queryByRole("img", { name: "Kaplan–Meier survival graph" })).toBeNull();

    fireEvent.click(screen.getByRole("button", { name: "入力形式の例を読み込む（合成値）" }));

    expect(screen.getByRole("button", { name: "Kaplan–Meier + log-rankを実行" })).toBeEnabled();
    expect(screen.getByRole("img", { name: "Kaplan–Meier survival graph" })).toBeVisible();
    expect(screen.queryByText(/Records at risk/iu)).toBeNull();
    expect(screen.getByText("Number at risk")).toBeVisible();
  });

  it("Case 5 PNG export reports rasterization failure without replacing the rendered Graph", async () => {
    exportGraphPng.mockRejectedValueOnce(new Error("rasterization failed"));
    render(<SpecializedCorePage mode="survival" onBack={vi.fn()} />);
    fireEvent.click(screen.getByRole("button", { name: "入力形式の例を読み込む（合成値）" }));
    const graph = await screen.findByRole("img", { name: "Kaplan–Meier survival graph" });

    fireEvent.click(screen.getByRole("button", { name: "PNGを書き出す" }));

    expect(await screen.findByRole("alert")).toHaveTextContent(
      "PNGを保存できませんでした。Graphは保持されています。SVG書き出しを利用してください。",
    );
    expect(graph).toBeVisible();
    expect(exportGraphPng).toHaveBeenCalledWith(graph, "Kaplan–Meier survival.png");
  });

  it("shows the Graph before statistics while an unresolved or nested row grain stays out of n", () => {
    render(
      <SpecializedCorePage
        mode="survival"
        onBack={vi.fn()}
        analysisRunner={vi.fn()}
        entryIntent={cellTimeToEventIntent}
        initialText={survivalExample}
      />,
    );
    expect(screen.getByRole("img", { name: "Kaplan–Meier survival graph" })).toBeVisible();
    expect(screen.queryByLabelText("time-to-eventの1行と独立した実験例の関係")).toBeNull();
    expect(screen.queryByRole("button", { name: "Kaplan–Meier + log-rankを実行" })).toBeNull();
    expandAdaptiveStatistics();
    expect(screen.getByRole("button", { name: "Kaplan–Meier + log-rankを実行" })).toBeDisabled();

    fireEvent.change(screen.getByLabelText("time-to-eventの1行と独立した実験例の関係"), {
      target: { value: "nested_in_parent" },
    });
    expect(screen.getByRole("img", { name: "Kaplan–Meier survival graph" })).toBeVisible();
    expect(screen.getByRole("button", { name: "Kaplan–Meier + log-rankを実行" })).toBeDisabled();
    expect(screen.getByText(/親試料.*IDを含む入力へ進む必要があります/u)).toBeVisible();
  });

  it("asks the structure-changing assignment-unit question for animal survival", () => {
    const entryIntent: DedicatedEntryIntent = {
      schemaVersion: "0.1.0",
      moduleId: "time_to_event",
      destination: "survival",
      sourceContext: "animal",
      entryRouteId: "animal_time_to_event",
      experimentName: "humane endpoint・eventまでの期間",
      experimentDescription: "Each animal is followed to one event or the end of observation.",
      subjectUnitLabel: "Animal",
      facts: {
        timeToEventPattern: "single_terminal_event_or_censoring",
        subjectUnitRelationship: "unknown",
      },
    };
    render(
      <SpecializedCorePage
        mode="survival"
        onBack={vi.fn()}
        analysisRunner={vi.fn()}
        entryIntent={entryIntent}
      />,
    );

    expect(screen.queryByText("群分けと個体間のまとまりはどれですか？")).toBeNull();
    const statisticsSetupButton = screen.getByRole("button", { name: "統計解析を設定" });
    expect(statisticsSetupButton).toBeDisabled();
    expect(statisticsSetupButton).toHaveAttribute(
      "aria-describedby",
      "survival-graph-setup-disabled-reason",
    );
    expect(
      screen.getByText("あと1項目：対象ID・群・観察期間・Statusを入力してください。"),
    ).toBeVisible();
    expect(screen.queryByRole("img", { name: "Kaplan–Meier survival graph" })).toBeNull();
    fireEvent.click(screen.getByRole("button", { name: "入力形式の例を読み込む（合成値）" }));
    expect(screen.getByRole("img", { name: "Kaplan–Meier survival graph" })).toBeVisible();
    expandAdaptiveStatistics();
    expect(screen.getByText("群分けと個体間のまとまりはどれですか？")).toBeVisible();
    expect(screen.getByLabelText("time-to-eventの1行と独立した実験例の関係")).toHaveValue(
      "unknown",
    );
    expect(screen.getByRole("button", { name: "Kaplan–Meier + log-rankを実行" })).toBeDisabled();

    fireEvent.change(screen.getByLabelText("time-to-eventの1行と独立した実験例の関係"), {
      target: { value: "subject_is_experimental_unit" },
    });
    expect(screen.getByLabelText("time-to-eventの1行と独立した実験例の関係")).toHaveValue(
      "subject_is_experimental_unit",
    );
    expect(screen.getByText("1匹を独立した1例として扱います。")).toBeVisible();
  });

  it("saves typed time-to-event data and structure before statistics are requested", async () => {
    let savedState: Parameters<SaveProjectAction>[0] | null = null;
    const saveProject = vi.fn<SaveProjectAction>(async (state) => {
      savedState = state;
      return { state, target: "C:/tmp/time-to-event.lsa" };
    });
    render(
      <SpecializedCorePage
        mode="survival"
        onBack={vi.fn()}
        saveProject={saveProject}
        entryIntent={cellTimeToEventIntent}
        initialText={survivalExample}
      />,
    );
    expandAdaptiveStatistics();
    fireEvent.change(screen.getByLabelText("time-to-eventの1行と独立した実験例の関係"), {
      target: { value: "subject_is_experimental_unit" },
    });
    fireEvent.click(screen.getByRole("button", { name: "プロジェクトを保存" }));

    await waitFor(() => expect(saveProject).toHaveBeenCalledTimes(1));
    const state = savedState!;
    expect(state.analysisRuns).toHaveLength(0);
    expect(state.adaptiveInput?.canonicalObservations).toHaveLength(4);
    expect(state.adaptiveInput?.contract.orderedAxes[0]?.sampling).toBe("event_follow_up");
    expect(await screen.findByText(/統計は必要になった時に実行できます/u)).toBeVisible();
  });

  it("saves a one-group survival graph without fabricating a D11 analysis", async () => {
    const oneGroup = [
      "Unit ID\tGroup\tFollow-up time\tStatus",
      "M01\tUntreated\t4\tEvent",
      "M02\tUntreated\t7\tEvent",
      "M03\tUntreated\t9\tCensored",
    ].join("\n");
    let savedState: Parameters<SaveProjectAction>[0] | null = null;
    const saveProject = vi.fn<SaveProjectAction>(async (state) => {
      savedState = state;
      return { state, target: "C:/tmp/one-group-survival.lsa" };
    });
    render(
      <SpecializedCorePage
        mode="survival"
        onBack={vi.fn()}
        saveProject={saveProject}
        entryIntent={cellTimeToEventIntent}
        initialText={oneGroup}
      />,
    );
    expect(screen.getByRole("img", { name: "Kaplan–Meier survival graph" })).toBeVisible();
    expandAdaptiveStatistics();
    fireEvent.change(screen.getByLabelText("time-to-eventの1行と独立した実験例の関係"), {
      target: { value: "subject_is_experimental_unit" },
    });
    expect(screen.getByRole("button", { name: "Kaplan–Meier + log-rankを実行" })).toBeDisabled();
    expect(screen.getByText(/2つ以上の条件を比較/u)).toBeVisible();

    fireEvent.click(screen.getByRole("button", { name: "プロジェクトを保存" }));
    await waitFor(() => expect(saveProject).toHaveBeenCalledTimes(1));
    const state = ProjectStateSchema.parse(savedState);
    expect(state.analysisRuns).toHaveLength(0);
    expect(state.adaptiveInput?.canonicalObservations).toHaveLength(3);
    expect(state.observations).toHaveLength(3);
  });

  it("saves all-censored survival data and keeps Statistics stopped", async () => {
    const allCensored = [
      "Unit ID\tGroup\tFollow-up time\tStatus",
      "M01\tVehicle\t4\tCensored",
      "M02\tVehicle\t7\tCensored",
      "M03\tDrug\t6\tCensored",
      "M04\tDrug\t9\tCensored",
    ].join("\n");
    let savedState: Parameters<SaveProjectAction>[0] | null = null;
    const saveProject = vi.fn<SaveProjectAction>(async (state) => {
      savedState = state;
      return { state, target: "C:/tmp/all-censored-survival.lsa" };
    });
    render(
      <SpecializedCorePage
        mode="survival"
        onBack={vi.fn()}
        saveProject={saveProject}
        entryIntent={cellTimeToEventIntent}
        initialText={allCensored}
      />,
    );
    expect(screen.getByRole("img", { name: "Kaplan–Meier survival graph" })).toBeVisible();
    expandAdaptiveStatistics();
    fireEvent.change(screen.getByLabelText("time-to-eventの1行と独立した実験例の関係"), {
      target: { value: "subject_is_experimental_unit" },
    });
    expect(screen.getByRole("button", { name: "Kaplan–Meier + log-rankを実行" })).toBeDisabled();
    expect(screen.getByText(/Eventが1件もない/u)).toBeVisible();

    fireEvent.click(screen.getByRole("button", { name: "プロジェクトを保存" }));
    await waitFor(() => expect(saveProject).toHaveBeenCalledTimes(1));
    const state = ProjectStateSchema.parse(savedState);
    expect(state.analysisRuns).toHaveLength(0);
    expect(state.adaptiveInput?.canonicalObservations).toHaveLength(4);
    expect(
      state.adaptiveInput?.canonicalObservations.every(
        ({ values }) => values.time_to_event_event_observed === false,
      ),
    ).toBe(true);
  });

  it("imports a CSV file and retains its file lineage in the adaptive project", async () => {
    let savedState: Parameters<SaveProjectAction>[0] | null = null;
    const saveProject = vi.fn<SaveProjectAction>(async (state) => {
      savedState = state;
      return { state, target: "C:/tmp/imported-survival.lsa" };
    });
    render(
      <SpecializedCorePage
        mode="survival"
        onBack={vi.fn()}
        saveProject={saveProject}
        entryIntent={cellTimeToEventIntent}
      />,
    );
    const csv = [
      "Unit ID,Group,Follow-up time,Status",
      "マウス甲,Control,4,Event",
      "マウス乙,Treatment,7,Censored",
    ].join("\r\n");
    const file = Object.assign(new File([csv], "animal-survival.csv", { type: "text/csv" }), {
      text: vi.fn(async () => csv),
    });

    fireEvent.change(screen.getByLabelText("time-to-eventデータファイル"), {
      target: { files: [file] },
    });
    await waitFor(() =>
      expect(screen.getByLabelText("Survival data")).toHaveValue(csv.replaceAll("\r\n", "\n")),
    );
    fireEvent.change(screen.getByLabelText("Follow-up time unit"), {
      target: { value: "day" },
    });
    expandAdaptiveStatistics();
    fireEvent.change(screen.getByLabelText("time-to-eventの1行と独立した実験例の関係"), {
      target: { value: "subject_is_experimental_unit" },
    });
    fireEvent.click(screen.getByRole("button", { name: "プロジェクトを保存" }));

    await waitFor(() => expect(saveProject).toHaveBeenCalledTimes(1));
    const state = savedState as Parameters<SaveProjectAction>[0] | null;
    expect(state?.adaptiveInput?.rawLineage).toMatchObject({
      sourceKind: "csv",
      sourceLabel: "animal-survival.csv",
      rawText: csv,
    });
    expect(state?.adaptiveInput?.mapping?.delimiter).toBe("comma");
    expect(state?.adaptiveInput?.contract.orderedAxes[0]?.unit).toBe("day");
    expect(screen.getByText("Follow-up time (day)")).toBeVisible();
  });

  it("previews and saves quoted semicolon time-to-event rows from one parsed table", async () => {
    const semicolonText = [
      "Unit ID;Group;Follow-up time;Status;Note",
      '"cell,1";"Control, baseline";4;Event;"north, cage"',
      '"cell,2";Treatment;7;Censored;"south, cage"',
    ].join("\n");
    let savedState: Parameters<SaveProjectAction>[0] | null = null;
    const saveProject = vi.fn<SaveProjectAction>(async (state) => {
      savedState = state;
      return { state, target: "C:/tmp/semicolon-survival.lsa" };
    });
    render(
      <SpecializedCorePage
        mode="survival"
        onBack={vi.fn()}
        saveProject={saveProject}
        entryIntent={cellTimeToEventIntent}
        initialText={semicolonText}
      />,
    );

    expect(screen.getByRole("img", { name: "Kaplan–Meier survival graph" })).toBeVisible();
    expandAdaptiveStatistics();
    fireEvent.change(screen.getByLabelText("time-to-eventの1行と独立した実験例の関係"), {
      target: { value: "subject_is_experimental_unit" },
    });
    fireEvent.click(screen.getByRole("button", { name: "プロジェクトを保存" }));

    await waitFor(() => expect(saveProject).toHaveBeenCalledTimes(1));
    const state = ProjectStateSchema.parse(savedState);
    expect(state.adaptiveInput?.mapping?.delimiter).toBe("semicolon");
    expect(state.adaptiveInput?.canonicalObservations[0]).toMatchObject({
      identities: { cell_id: "cell,1" },
      factors: { group: "Control, baseline" },
      values: { time_to_event_event_observed: true },
    });
    expect(state.designRevisions[0]?.design.observationFactors?.[0]?.scientificRole).toBe("time");
  });

  it("requires an explicit 0/1 event mapping before drawing or compiling", async () => {
    const numericText =
      "Unit ID\tGroup\tFollow-up time\tStatus\nM1\tControl\t4\t1\nM2\tTreatment\t7\t0";
    let savedState: Parameters<SaveProjectAction>[0] | null = null;
    const saveProject = vi.fn<SaveProjectAction>(async (state) => {
      savedState = state;
      return { state, target: "C:/tmp/numeric-status.lsa" };
    });
    const firstRender = render(
      <SpecializedCorePage
        mode="survival"
        onBack={vi.fn()}
        saveProject={saveProject}
        entryIntent={cellTimeToEventIntent}
      />,
    );
    fireEvent.change(screen.getByLabelText("Survival data"), {
      target: { value: numericText },
    });

    expect(screen.getByLabelText("Status列の0/1 mapping")).toHaveValue("");
    expect(screen.queryByRole("img", { name: "Kaplan–Meier survival graph" })).toBeNull();
    fireEvent.change(screen.getByLabelText("Status列の0/1 mapping"), {
      target: { value: "event_is_1" },
    });
    expect(screen.getByRole("img", { name: "Kaplan–Meier survival graph" })).toBeVisible();
    expandAdaptiveStatistics();
    fireEvent.change(screen.getByLabelText("time-to-eventの1行と独立した実験例の関係"), {
      target: { value: "subject_is_experimental_unit" },
    });
    fireEvent.click(screen.getByRole("button", { name: "プロジェクトを保存" }));

    await waitFor(() => expect(saveProject).toHaveBeenCalledTimes(1));
    const state = ProjectStateSchema.parse(savedState);
    expect(
      state.adaptiveInput?.canonicalObservations.map(
        ({ values }) => values.time_to_event_event_observed,
      ),
    ).toEqual([true, false]);
    expect(state.adaptiveInput?.targetedConfirmations).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          key: "time_to_event_status_mapping",
          answer: "1=event;0=censored",
        }),
      ]),
    );
    expect(state.designRevisions[0]?.design.observationFactors?.[0]?.scientificRole).toBe("time");

    firstRender.unmount();
    render(
      <SpecializedCorePage
        mode="survival"
        onBack={vi.fn()}
        saveProject={saveProject}
        initialProject={{ state, target: "C:/tmp/numeric-status.lsa" }}
        initialText={numericText}
      />,
    );
    expect(screen.getByRole("img", { name: "Kaplan–Meier survival graph" })).toBeVisible();
    expect(screen.queryByLabelText("Status列の0/1 mapping")).toBeNull();
    fireEvent.click(screen.getByRole("button", { name: "プロジェクトを保存" }));
    await waitFor(() => expect(saveProject).toHaveBeenCalledTimes(2));
    const synchronized = ProjectStateSchema.parse(savedState);
    expect(synchronized.designRevisions).toEqual(state.designRevisions);
    expect(synchronized.designRevisions[0]?.design.observationFactors?.[0]?.scientificRole).toBe(
      "time",
    );
  });

  it("adopts each successful save as the baseline for consecutive raw revisions", async () => {
    const savedProjects: Array<NonNullable<Awaited<ReturnType<SaveProjectAction>>>> = [];
    const saveProject = vi.fn<SaveProjectAction>(async (state, target) => {
      const saved = {
        state: ProjectStateSchema.parse(state),
        target: target ?? "C:/tmp/consecutive-survival.lsa",
      };
      savedProjects.push(saved);
      return saved;
    });
    render(
      <SpecializedCorePage
        mode="survival"
        onBack={vi.fn()}
        saveProject={saveProject}
        entryIntent={cellTimeToEventIntent}
        initialText={survivalExample}
      />,
    );
    expandAdaptiveStatistics();
    fireEvent.change(screen.getByLabelText("time-to-eventの1行と独立した実験例の関係"), {
      target: { value: "subject_is_experimental_unit" },
    });
    const editor = screen.getByRole("textbox", { name: "Survival data" });

    fireEvent.click(screen.getByRole("button", { name: "プロジェクトを保存" }));
    await waitFor(() => expect(savedProjects).toHaveLength(1));
    await screen.findByText(/統計は必要になった時に実行できます/u);
    fireEvent.change(editor, {
      target: {
        value: String((editor as HTMLTextAreaElement).value).replace("\t4\tEvent", "\t5\tEvent"),
      },
    });
    fireEvent.click(screen.getByRole("button", { name: "プロジェクトを保存" }));
    await waitFor(() => expect(savedProjects).toHaveLength(2));
    await screen.findByText(/統計は必要になった時に実行できます/u);
    fireEvent.change(editor, {
      target: {
        value: String((editor as HTMLTextAreaElement).value).replace(
          "mouse-2\tControl\t7\tCensored",
          "mouse-2\tControl\t8\tCensored",
        ),
      },
    });
    fireEvent.click(screen.getByRole("button", { name: "プロジェクトを保存" }));
    await waitFor(() => expect(savedProjects).toHaveLength(3));

    expect(savedProjects.map(({ state }) => state.rawRevisions.length)).toEqual([1, 2, 3]);
    expect(
      savedProjects[2]?.state.rawRevisions.map(({ previousRevisionId }) => previousRevisionId),
    ).toEqual([null, "raw.adaptive.1", "raw.adaptive.2"]);
    expect(saveProject.mock.calls[1]?.[1]).toBe("C:/tmp/consecutive-survival.lsa");
    expect(saveProject.mock.calls[2]?.[1]).toBe("C:/tmp/consecutive-survival.lsa");
  });

  it("keeps an unsupported event process stopped after a route draft is restored", async () => {
    const entryIntent: DedicatedEntryIntent = {
      schemaVersion: "0.1.0",
      moduleId: "time_to_event",
      destination: "survival",
      sourceContext: "animal",
      entryRouteId: "animal_recurrent_event",
      experimentName: "Recurrent event study",
      experimentDescription: "Each animal may experience the same event more than once.",
      subjectUnitLabel: "Animal",
      facts: {
        timeToEventPattern: "recurrent_events",
        subjectUnitRelationship: "subject_is_experimental_unit",
      },
    };
    let restoredDraft: SpecializedCoreDraft | undefined;
    const first = render(
      <SpecializedCorePage
        mode="survival"
        onBack={vi.fn()}
        saveProject={vi.fn()}
        entryIntent={entryIntent}
        onDraftChange={(draft) => {
          restoredDraft = draft;
        }}
      />,
    );
    expect(screen.getByText(/現在の専用入口では構造化できません/u)).toBeVisible();
    expect(screen.getByRole("button", { name: "プロジェクトを保存" })).toBeDisabled();
    await waitFor(() =>
      expect(restoredDraft?.entryIntent?.facts.timeToEventPattern).toBe("recurrent_events"),
    );
    first.unmount();

    render(
      <SpecializedCorePage
        mode="survival"
        onBack={vi.fn()}
        saveProject={vi.fn()}
        initialDraft={restoredDraft}
      />,
    );
    expect(screen.getByText(/現在の専用入口では構造化できません/u)).toBeVisible();
    expect(screen.queryByRole("button", { name: "Kaplan–Meier + log-rankを実行" })).toBeNull();
    const statisticsSetupButton = screen.getByRole("button", { name: "統計解析を設定" });
    expect(statisticsSetupButton).toBeDisabled();
    expect(statisticsSetupButton).toHaveAttribute(
      "aria-describedby",
      "survival-graph-setup-disabled-reason",
    );
    expect(screen.getByText("このevent経過は現在の専用入口では解析できません。")).toBeVisible();
    expect(screen.getByRole("button", { name: "プロジェクトを保存" })).toBeDisabled();
  });

  it("makes a rerun the sole current analysis and keeps its active input fingerprint", async () => {
    let completedIndex = 0;
    const analysisRunner = vi.fn(async (request) => {
      completedIndex += 1;
      return {
        protocolVersion: "0.8.0" as const,
        requestId: request.requestId,
        status: "ok" as const,
        engine: { name: "fixture", version: "1", packages: {} },
        estimates: [],
        tests: [
          {
            name: "log_rank",
            statisticName: "chi-square",
            statistic: completedIndex,
            degreesOfFreedom: [1],
            pValue: 0.3,
            adjustedPValue: null,
            effectSizeName: null,
            effectSize: null,
          },
        ],
        survival: {
          groups: [
            {
              conditionId: "condition.1",
              n: 2,
              events: 1,
              censored: 1,
              curve: [],
              censorTimes: [7],
            },
            {
              conditionId: "condition.2",
              n: 2,
              events: 1,
              censored: 1,
              curve: [],
              censorTimes: [9],
            },
          ],
        },
        diagnostics: [],
        warnings: [],
        completedAt: `2026-08-27T0${completedIndex}:00:00.000Z`,
      };
    });
    const savedProjects: Array<NonNullable<Awaited<ReturnType<SaveProjectAction>>>> = [];
    const saveProject = vi.fn<SaveProjectAction>(async (state, target) => {
      const saved = {
        state: ProjectStateSchema.parse(state),
        target: target ?? "C:/tmp/rerun-survival.lsa",
      };
      savedProjects.push(saved);
      return saved;
    });
    const rendered = render(
      <SpecializedCorePage
        mode="survival"
        onBack={vi.fn()}
        saveProject={saveProject}
        analysisRunner={analysisRunner}
        entryIntent={cellTimeToEventIntent}
        initialText={survivalExample}
      />,
    );
    fireEvent.change(screen.getByLabelText("Survival Graph title"), {
      target: { value: "Tumor-free survival" },
    });
    fireEvent.change(screen.getByLabelText("Survival X axis title"), {
      target: { value: "Days after treatment" },
    });
    fireEvent.change(screen.getByLabelText("Survival Y axis title"), {
      target: { value: "Tumor-free probability" },
    });
    fireEvent.change(screen.getByLabelText("ControlのSurvival曲線色"), {
      target: { value: "#123456" },
    });
    fireEvent.change(screen.getByLabelText("Survival font size"), {
      target: { value: "16" },
    });
    fireEvent.change(screen.getByLabelText("Survival legend position"), {
      target: { value: "top" },
    });
    fireEvent.change(screen.getByLabelText("Survival legend font size"), {
      target: { value: "14" },
    });
    expect(
      screen
        .getByRole("img", { name: "Kaplan–Meier survival graph" })
        .querySelector('[data-condition-id="condition.1"]'),
    ).toHaveAttribute("stroke", "#123456");
    const editedLegend = screen
      .getByRole("img", { name: "Kaplan–Meier survival graph" })
      .querySelector('[data-graph-layer="series-legend"]');
    expect(editedLegend).toHaveAttribute("data-legend-position", "top");
    expect(editedLegend?.querySelector("text")).toHaveAttribute("font-size", "14");
    expandAdaptiveStatistics();
    fireEvent.change(screen.getByLabelText("time-to-eventの1行と独立した実験例の関係"), {
      target: { value: "subject_is_experimental_unit" },
    });
    const runButton = screen.getByRole("button", { name: "Kaplan–Meier + log-rankを実行" });
    const saveButton = screen.getByRole("button", { name: "プロジェクトを保存" });

    fireEvent.click(runButton);
    await waitFor(() => expect(analysisRunner).toHaveBeenCalledTimes(1));
    await screen.findByText(/log-rank検定が完了/u);
    fireEvent.click(saveButton);
    await waitFor(() => expect(savedProjects).toHaveLength(1));

    fireEvent.click(runButton);
    await waitFor(() => expect(analysisRunner).toHaveBeenCalledTimes(2));
    await waitFor(() => expect(screen.getByText(/χ²\(1\) = 2/u)).toBeVisible());
    fireEvent.click(saveButton);
    await waitFor(() => expect(savedProjects).toHaveLength(2));

    const rerunState = savedProjects[1]!.state;
    expect(rerunState.analysisRuns).toHaveLength(2);
    expect(rerunState.analysisRuns.map(({ state }) => state)).toEqual(["stale", "current"]);
    expect(rerunState.graphs.map(({ state }) => state)).toEqual(["stale", "current"]);
    expect(rerunState.analysisRuns[1]).toMatchObject({
      inputDesignRevisionId: rerunState.activeDesignRevisionId,
      inputRawRevisionId: rerunState.activeRawRevisionId,
      request: { requestId: "request.survival.2" },
    });
    const activeDesign = rerunState.designRevisions.find(
      ({ id }) => id === rerunState.activeDesignRevisionId,
    )!.design;
    expect(rerunState.adaptiveInput?.equivalence.designFingerprint).toBe(
      createTimeToEventContractProjection(rerunState.adaptiveInput!.contract).assertEquivalent(
        activeDesign,
      ).designFingerprint,
    );

    fireEvent.click(saveButton);
    await waitFor(() => expect(savedProjects).toHaveLength(3));
    expect(savedProjects[2]!.state.analysisRuns).toHaveLength(2);
    expect(savedProjects[2]!.state.analysisRuns.map(({ state }) => state)).toEqual([
      "stale",
      "current",
    ]);
    const savedGraphSpec = savedProjects[2]!.state.graphs.find(
      ({ state }) => state === "current",
    )!.spec;
    expect(savedProjects[2]!.state.metadata.projectName).toBe("Tumor-free survival");
    expect(savedGraphSpec.axes).toMatchObject({
      xLabel: "Days after treatment",
      yLabel: "Tumor-free probability",
    });
    expect(savedGraphSpec.appearance.palette[0]).toBe("#123456");
    expect(savedGraphSpec.appearance.fontSize).toBe(16);
    expect(savedGraphSpec.appearance.legendPosition).toBe("top");
    expect(savedGraphSpec.appearance.legendFontSize).toBe(14);

    rendered.unmount();
    render(
      <SpecializedCorePage
        mode="survival"
        onBack={vi.fn()}
        saveProject={saveProject}
        analysisRunner={analysisRunner}
        initialProject={savedProjects[2]}
      />,
    );
    expect(screen.getByLabelText("Survival Graph title")).toHaveValue("Tumor-free survival");
    expect(screen.getByLabelText("Survival X axis title")).toHaveValue("Days after treatment");
    expect(screen.getByLabelText("Survival Y axis title")).toHaveValue("Tumor-free probability");
    expect(screen.getByLabelText("Survival font size")).toHaveValue("16");
    expect(screen.getByLabelText("Survival legend position")).toHaveValue("top");
    expect(screen.getByLabelText("Survival legend font size")).toHaveValue("14");
    fireEvent.click(screen.getByRole("button", { name: "グラフ" }));
    expect(screen.getByLabelText("ControlのSurvival曲線色")).toHaveValue("#123456");
  });

  it("ブラウザレビューでengine未接続ならsurvival実行をdisabledで説明する", () => {
    render(<SpecializedCorePage mode="survival" onBack={vi.fn()} analysisAvailable={false} />);
    expect(screen.queryByRole("button", { name: "統計解析を設定" })).toBeNull();
    expect(screen.getByRole("button", { name: "Kaplan–Meier + log-rankを実行" })).toBeDisabled();
    expect(screen.getByText(/ブラウザレビューでは解析エンジンを実行できません/)).toBeVisible();
  });

  it("shows a matrix paste as a heatmap and keeps an explicit transform control", async () => {
    recordUsageGraphConfiguration.mockClear();
    const saveUnresolvedVisualizationProject = vi.fn<SaveUnresolvedVisualizationProjectAction>(
      async (state, target) => ({ state, target: target ?? "C:/tmp/heatmap.lsa" }),
    );
    render(
      <SpecializedCorePage
        mode="heatmap"
        onBack={vi.fn()}
        saveUnresolvedVisualizationProject={saveUnresolvedVisualizationProject}
      />,
    );
    expect(screen.getByRole("heading", { level: 1, name: "ヒートマップ" })).toBeVisible();
    expect(screen.getByRole("navigation", { name: "プロジェクトワークスペース" })).toBeVisible();
    expect(screen.getByRole("link", { name: "データ" })).toHaveAttribute("href", "#heatmap-data");
    expect(screen.getByRole("link", { name: "グラフ" })).toHaveAttribute("href", "#heatmap-graph");
    expect(screen.getByRole("button", { name: "統計" })).toBeDisabled();
    expect(screen.getByRole("heading", { level: 2, name: "データ" })).toBeVisible();
    expect(screen.getByRole("region", { name: "Heatmap Graphワークスペース" })).toBeVisible();
    expect(screen.getByText("値の変換")).toBeVisible();
    expect(screen.getByRole("option", { name: "変換しない" })).toBeVisible();
    expect(screen.getByLabelText("Matrix data")).toHaveValue("");
    expect(screen.queryByRole("img", { name: "Heatmap" })).toBeNull();
    expect(screen.queryByRole("button", { name: "入力形式の例を読み込む（合成値）" })).toBeNull();

    const matrix = "Feature\tSample A\tSample B\tSample C\nProtein A\t1\t2\tNA\nProtein B\t3\t5\t8";
    fireEvent.change(screen.getByLabelText("Matrix data"), { target: { value: matrix } });

    expect(screen.getByRole("img", { name: "Heatmap" })).toBeVisible();
    expect(document.querySelector('[data-graph-layer="color-scale-legend"]')).not.toBeNull();
    expect(screen.getByRole("button", { name: "グラフをコピー" })).toBeEnabled();
    await waitFor(() =>
      expect(recordUsageGraphConfiguration).toHaveBeenCalledWith("home", {
        graphFamily: "heatmap",
        origin: "dedicated_entry",
        uncertainty: "none",
        rawPointsVisible: false,
        summaryVisible: false,
      }),
    );
    expect(screen.getByLabelText("Heatmap transform")).toHaveValue("none");
    expect(document.querySelector('[data-missing="true"]')).not.toBeNull();
    fireEvent.change(screen.getByLabelText("Heatmap transform"), {
      target: { value: "row_z_score" },
    });
    expect(screen.getByTitle(/row_z_score/u)).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "プロジェクトを保存" })).toBeEnabled();
    expect(screen.getByText(/行列の列を生物学的な独立例とみなさず/)).toBeVisible();
    fireEvent.click(screen.getByRole("button", { name: "プロジェクトを保存" }));
    await waitFor(() => expect(saveUnresolvedVisualizationProject).toHaveBeenCalledOnce());
    expect(recordUsageMilestone).toHaveBeenCalledWith("home", "project_saved");
    const savedState = saveUnresolvedVisualizationProject.mock.calls[0]![0];
    expect(savedState.projectKind).toBe("unresolved_visualization");
    expect(savedState.entryIntent).toBe("matrix_visualization");
    expect(savedState.table.headers).toEqual(["Feature", "Sample A", "Sample B", "Sample C"]);
    expect(savedState.table.rows[0]).toEqual(["Protein A", "1", "2", "NA"]);
    expect(savedState.rawLineage.rawText).toBe(matrix);
    expect(savedState.mapping?.columns).toHaveLength(4);
    expect(savedState.graphSpecs[0]?.type).toBe("heatmap");
    expect(savedState.graphSpecs[0]?.dataSource.kind).toBe("visualization_table");
    expect(savedState.graphSpecs[0]?.heatmap?.transform).toBe("row_z_score");
    expect(savedState.graphSpecs[0]?.appearance.palette).toEqual(["#3b4cc0", "#f7f7f7", "#b40426"]);
    expect("design" in savedState).toBe(false);
  });

  it("does not present synthetic heatmap values as user data on the direct entry", () => {
    render(
      <SpecializedCorePage mode="heatmap" onBack={vi.fn()} entryIntent={directHeatmapIntent} />,
    );

    expect(screen.getByLabelText("Matrix data")).toHaveValue("");
    expect(screen.queryByRole("img", { name: "Heatmap" })).toBeNull();
    expect(screen.getByRole("button", { name: "SVGを書き出す" })).toBeDisabled();
    expect(screen.queryByRole("button", { name: "入力形式の例を読み込む（合成値）" })).toBeNull();
    expect(screen.getByRole("button", { name: "保存済みHeatmap projectを開く" })).toBeDisabled();
    expect(screen.getByRole("button", { name: "プロジェクトを保存" })).toBeDisabled();
  });

  it("opens a heatmap file without treating its columns as biological n", async () => {
    render(
      <SpecializedCorePage mode="heatmap" onBack={vi.fn()} entryIntent={directHeatmapIntent} />,
    );
    const csv = "Feature,Sample A,Sample B\nProtein A,1,NA\nProtein B,3,5";
    const file = Object.assign(new File([csv], "matrix.csv", { type: "text/csv" }), {
      text: async () => csv,
    });

    fireEvent.change(screen.getByLabelText("ヒートマップ用データファイル"), {
      target: { files: [file] },
    });

    expect(await screen.findByText("matrix.csv を読み込みました。")).toBeVisible();
    expect(screen.getByLabelText("Matrix data")).toHaveValue(csv);
    expect(screen.getByRole("img", { name: "Heatmap" })).toBeVisible();
    expect(screen.getByRole("button", { name: "プロジェクトを保存" })).toBeDisabled();
    expect(screen.getByText(/行列の列を生物学的な独立例とみなさず/u)).toBeVisible();
  });

  it("refuses a graph-only table at the Heatmap entry instead of changing its intent", async () => {
    const state = createUnresolvedVisualizationProjectState({
      metadata: {
        projectId: "visualization.graph-only-wrong-entry",
        projectName: "Graph-only table",
        experimentDate: "",
        createdAt: "2026-08-28T00:00:00.000Z",
        updatedAt: "2026-08-28T00:00:00.000Z",
      },
      entryIntent: "graph_only",
      table: {
        id: "visualization.table.wrong-entry",
        headers: ["Condition", "Value"],
        rows: [["Control", "1"]],
        delimiter: "tab",
        headerRow: 1,
      },
      rawLineage: {
        sourceKind: "clipboard",
        sourceLabel: "clipboard",
        importedAt: "2026-08-28T00:00:00.000Z",
        rawText: "Condition\tValue\nControl\t1",
        sha256: null,
        transformations: ["delimiter_detection"],
      },
      actor: "test",
    });
    const openUnresolvedVisualizationProject = vi.fn(async () => ({
      state,
      target: "C:/tmp/graph-only.lsa",
    }));
    render(
      <SpecializedCorePage
        mode="heatmap"
        onBack={vi.fn()}
        entryIntent={directHeatmapIntent}
        openUnresolvedVisualizationProject={openUnresolvedVisualizationProject}
      />,
    );

    fireEvent.click(screen.getByRole("button", { name: "保存済みHeatmap projectを開く" }));

    expect(
      await screen.findByText("このファイルはHeatmap用のGraph-only projectではありません。"),
    ).toBeVisible();
    expect(screen.getByLabelText("Matrix data")).toHaveValue("");
  });

  it("saves and reopens an unresolved heatmap matrix with its graph settings", async () => {
    const matrix = "Feature\tSample A\tSample B\nProtein A\t1\t2\nProtein B\t3\t5";
    let persisted: OpenedUnresolvedVisualizationProject | null = null;
    const onDirtyChange = vi.fn();
    const saveUnresolvedVisualizationProject = vi.fn<SaveUnresolvedVisualizationProjectAction>(
      async (state, target) => {
        persisted = { state, target: target ?? "C:/tmp/heatmap.lsa" };
        return persisted;
      },
    );
    const openUnresolvedVisualizationProject = vi.fn(async () => persisted);
    render(
      <SpecializedCorePage
        mode="heatmap"
        onBack={vi.fn()}
        saveUnresolvedVisualizationProject={saveUnresolvedVisualizationProject}
        openUnresolvedVisualizationProject={openUnresolvedVisualizationProject}
        onDirtyChange={onDirtyChange}
      />,
    );
    fireEvent.change(screen.getByLabelText("Matrix data"), { target: { value: matrix } });
    fireEvent.change(screen.getByLabelText("Heatmap transform"), {
      target: { value: "column_z_score" },
    });
    fireEvent.change(screen.getByLabelText("Heatmap color minimum"), {
      target: { value: "0" },
    });
    fireEvent.change(screen.getByLabelText("Heatmap color maximum"), {
      target: { value: "6" },
    });
    fireEvent.click(screen.getByRole("button", { name: "プロジェクトを保存" }));
    await waitFor(() => expect(saveUnresolvedVisualizationProject).toHaveBeenCalledOnce());
    const firstSaved = saveUnresolvedVisualizationProject.mock.calls[0]![0];

    fireEvent.change(screen.getByLabelText("Heatmap transform"), {
      target: { value: "none" },
    });
    fireEvent.click(screen.getByRole("button", { name: "保存済みHeatmap projectを開く" }));
    await waitFor(() => expect(openUnresolvedVisualizationProject).toHaveBeenCalledOnce());
    expect(onDirtyChange).toHaveBeenLastCalledWith(false);
    expect(recordUsageMilestone).toHaveBeenCalledWith("home", "project_opened");
    expect(screen.getByLabelText("Matrix data")).toHaveValue(matrix);
    expect(screen.getByLabelText("Heatmap transform")).toHaveValue("column_z_score");
    expect(screen.getByLabelText("Heatmap color minimum")).toHaveValue(0);
    expect(screen.getByLabelText("Heatmap color maximum")).toHaveValue(6);

    fireEvent.click(screen.getByRole("button", { name: "プロジェクトを保存" }));
    await waitFor(() => expect(saveUnresolvedVisualizationProject).toHaveBeenCalledTimes(2));
    const unchangedResave = saveUnresolvedVisualizationProject.mock.calls[1]![0];
    expect(unchangedResave.table).toEqual(firstSaved.table);
    expect(unchangedResave.rawLineage).toEqual(firstSaved.rawLineage);
    expect(unchangedResave.mapping).toEqual(firstSaved.mapping);
    expect(unchangedResave.graphSpecs).toEqual(firstSaved.graphSpecs);
    expect(unchangedResave.activeGraphId).toBe(firstSaved.activeGraphId);
    expect(unchangedResave.provenanceEvents).toEqual(firstSaved.provenanceEvents);

    fireEvent.change(screen.getByLabelText("Heatmap transform"), {
      target: { value: "row_z_score" },
    });
    fireEvent.click(screen.getByRole("button", { name: "プロジェクトを保存" }));
    await waitFor(() => expect(saveUnresolvedVisualizationProject).toHaveBeenCalledTimes(3));
    const revised = saveUnresolvedVisualizationProject.mock.calls[2]![0];
    expect(revised.graphSpecs).toHaveLength(firstSaved.graphSpecs.length + 1);
    expect(revised.graphSpecs.slice(0, firstSaved.graphSpecs.length)).toEqual(
      firstSaved.graphSpecs,
    );
    expect(revised.activeGraphId).not.toBe(firstSaved.activeGraphId);
    expect(revised.graphSpecs.at(-1)?.heatmap?.transform).toBe("row_z_score");
    expect(revised.rawLineage).toEqual(firstSaved.rawLineage);
  });

  it("routes the secondary Heatmap open action through unsaved-exit protection", async () => {
    const openUnresolvedVisualizationProject = vi.fn(async () => null);
    const onRequestExit = vi.fn<RequestWorkspaceExit>();
    render(
      <SpecializedCorePage
        mode="heatmap"
        onBack={vi.fn()}
        initialText="Feature\tSample A\tSample B\nProtein A\t1\t2"
        openUnresolvedVisualizationProject={openUnresolvedVisualizationProject}
        onRequestExit={onRequestExit}
      />,
    );

    fireEvent.click(screen.getByRole("button", { name: "保存済みHeatmap projectを開く" }));

    expect(onRequestExit).toHaveBeenCalledOnce();
    expect(openUnresolvedVisualizationProject).not.toHaveBeenCalled();
    const requestedExit = onRequestExit.mock.calls[0]?.[0];
    expect(requestedExit).toBeDefined();
    if (!requestedExit) throw new Error("Heatmap open did not request an exit");
    expect(requestedExit.actionLabel).toBe("別のHeatmap projectを開く");
    await act(async () => {
      await requestedExit.proceed();
    });
    expect(openUnresolvedVisualizationProject).toHaveBeenCalledOnce();
  });

  it("runs a D11 request from explicit Event/Censored paste", async () => {
    recordUsageMilestone.mockClear();
    const analysisRunner = vi.fn(async (request) => ({
      protocolVersion: "0.8.0" as const,
      requestId: request.requestId,
      status: "ok" as const,
      engine: { name: "fixture", version: "0.10.0", packages: {} },
      estimates: [],
      tests: [
        {
          name: "log_rank",
          statisticName: "chi-square",
          statistic: 1.2,
          degreesOfFreedom: [1],
          pValue: 0.27,
          adjustedPValue: null,
          effectSizeName: null,
          effectSize: null,
        },
      ],
      survival: {
        groups: [
          { conditionId: "condition.1", n: 2, events: 1, censored: 1, curve: [], censorTimes: [7] },
          { conditionId: "condition.2", n: 2, events: 1, censored: 1, curve: [], censorTimes: [9] },
        ],
      },
      diagnostics: [],
      warnings: [],
      completedAt: "2026-08-24T00:00:00.000Z",
    }));
    render(
      <SpecializedCorePage
        mode="survival"
        onBack={vi.fn()}
        analysisRunner={analysisRunner}
        entryIntent={cellTimeToEventIntent}
        initialText={survivalExample}
      />,
    );
    expect(screen.getByRole("img", { name: "Kaplan–Meier survival graph" })).toBeVisible();
    expandAdaptiveStatistics();
    fireEvent.change(screen.getByLabelText("time-to-eventの1行と独立した実験例の関係"), {
      target: { value: "subject_is_experimental_unit" },
    });
    fireEvent.click(screen.getByRole("button", { name: "Kaplan–Meier + log-rankを実行" }));
    await waitFor(() =>
      expect(analysisRunner).toHaveBeenCalledWith(
        expect.objectContaining({ protocolVersion: "0.8.0", templateId: "D11" }),
      ),
    );
    expect(await screen.findByText(/log-rank検定が完了/u)).toBeVisible();
    expect(
      screen.getByText("Control vs Treatment · log-rank: χ²(1) = 1.2, p = 0.27"),
    ).toBeVisible();
    fireEvent.click(screen.getByRole("checkbox", { name: /保存済みlog-rank結果/ }));
    expect(
      screen
        .getAllByText("Control vs Treatment · log-rank: χ²(1) = 1.2, p = 0.27")
        .find((element) => element.getAttribute("data-graph-layer") === "statistics-annotation"),
    ).toBeVisible();
    expect(screen.getByText(/event=1、censored=1/u)).toBeInTheDocument();
    expect(recordBenchmarkEvent).toHaveBeenCalledWith(
      "statistics_executed",
      expect.objectContaining({
        method: "log_rank",
        contrast: "condition.1|condition.2",
        protocolVersion: "0.8.0",
      }),
    );
    expect(recordUsageMilestone).toHaveBeenCalledWith("home", "statistics_requested");
    expect(recordUsageMilestone).toHaveBeenCalledWith("home", "statistics_completed");
    expect(recordUsageMilestone).not.toHaveBeenCalledWith("home", "safe_stop");
  });

  it("rounds log-rank values only for researcher display and saves full engine precision", async () => {
    const exactStatistic = 1.23456789;
    const exactPValue = 0.2718281828;
    const analysisRunner = vi.fn(async (request) => ({
      protocolVersion: "0.8.0" as const,
      requestId: request.requestId,
      status: "ok" as const,
      engine: { name: "fixture", version: "0.10.0", packages: {} },
      estimates: [],
      tests: [
        {
          name: "log_rank",
          statisticName: "chi-square",
          statistic: exactStatistic,
          degreesOfFreedom: [1],
          pValue: exactPValue,
          adjustedPValue: null,
          effectSizeName: null,
          effectSize: null,
        },
      ],
      survival: {
        groups: [
          {
            conditionId: "condition.1",
            n: 2,
            events: 1,
            censored: 1,
            curve: [],
            censorTimes: [7],
          },
          {
            conditionId: "condition.2",
            n: 2,
            events: 1,
            censored: 1,
            curve: [],
            censorTimes: [9],
          },
        ],
      },
      diagnostics: [],
      warnings: [],
      completedAt: "2026-08-28T00:00:00.000Z",
    }));
    let savedState: Parameters<SaveProjectAction>[0] | null = null;
    const saveProject = vi.fn<SaveProjectAction>(async (state) => {
      savedState = state;
      return { state, target: "C:/tmp/log-rank-precision.lsa" };
    });
    render(
      <SpecializedCorePage
        mode="survival"
        onBack={vi.fn()}
        analysisRunner={analysisRunner}
        saveProject={saveProject}
        entryIntent={cellTimeToEventIntent}
        initialText={survivalExample}
      />,
    );
    expandAdaptiveStatistics();
    fireEvent.change(screen.getByLabelText("time-to-eventの1行と独立した実験例の関係"), {
      target: { value: "subject_is_experimental_unit" },
    });
    fireEvent.click(screen.getByRole("button", { name: "Kaplan–Meier + log-rankを実行" }));

    expect(
      await screen.findByText("Control vs Treatment · log-rank: χ²(1) = 1.235, p = 0.272"),
    ).toBeVisible();
    expect(screen.queryByText(String(exactPValue))).toBeNull();

    fireEvent.click(screen.getByRole("button", { name: "プロジェクトを保存" }));
    await waitFor(() => expect(saveProject).toHaveBeenCalledOnce());
    const saved = ProjectStateSchema.parse(savedState);
    expect(saved.analysisRuns.at(-1)?.result.tests[0]?.statistic).toBe(exactStatistic);
    expect(saved.analysisRuns.at(-1)?.result.tests[0]?.pValue).toBe(exactPValue);
  });
});

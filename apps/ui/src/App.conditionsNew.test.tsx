import { act, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { buildStructureContract } from "@lsaa/adaptive-input";
import type { CanonicalAdaptiveObservation, StructureContract } from "@lsaa/domain";
import type { ProjectState } from "@lsaa/project";
import type * as TauriCore from "@tauri-apps/api/core";

import App from "./App";
import { createAdaptiveWorkspace } from "./app/adaptiveWorkspace";
import { createExperimentWorkspaceProject, type WorkspaceGraphState } from "./app/experimentWorkspaceProject";
import type { OpenedProject, ProjectActions, SaveProjectAction } from "./app/projectActions";
import { setUsageConsent } from "./app/usageTelemetry";

const native = vi.hoisted(() => ({
  enabled: false,
  listeners: new Map<string, (event: { payload?: unknown }) => void>(),
  close: undefined as undefined | ((event: { preventDefault: () => void }) => void),
  invoke: vi.fn(async (_command: string) => []),
}));

vi.mock("@tauri-apps/api/core", async (original) => ({
  ...await original<typeof TauriCore>(),
  isTauri: () => native.enabled,
  invoke: native.invoke,
}));
vi.mock("@tauri-apps/api/event", () => ({
  listen: vi.fn(async (name: string, listener: (event: { payload?: unknown }) => void) => {
    native.listeners.set(name, listener);
    return () => { native.listeners.delete(name); };
  }),
}));
vi.mock("@tauri-apps/api/window", () => ({
  getCurrentWindow: () => ({
    onCloseRequested: async (listener: typeof native.close) => {
      native.close = listener;
      return () => { native.close = undefined; };
    },
  }),
}));

const now = "2026-10-08T00:00:00.000Z";
const sourceTarget = "C:/acceptance/source.lsa";
const newTarget = "C:/acceptance/conditions-new.lsa";

function fixture(): OpenedProject {
  const contract = buildStructureContract({
    experimentName: "Original live experiment",
    experimentDescription: "Independent conditions acceptance fixture",
    experimentalUnitLabel: "culture dish",
    identityLabel: "culture dish ID",
    readoutLabel: "Signal",
    readoutRepresentation: "scalar",
    factorName: "Treatment",
    factorLevels: ["Control", "Drug", "Unused"],
    sameIdentityAcrossConditions: false,
    conditionEntityRelationship: { kind: "independent_condition_units" },
  });
  const identityKey = contract.identities.find(({ unitLevelKey }) =>
    unitLevelKey === contract.experimentalUnitLevelKey)!.key;
  const factorKey = contract.factors[0]!.key;
  const readoutKey = contract.readouts[0]!.key;
  const observations: CanonicalAdaptiveObservation[] = ["Control", "Drug"].map((condition, index) => ({
    observationId: `observation.${index + 1}`,
    readoutKey,
    identities: { [identityKey]: `Dish-${index + 1}` },
    factors: { [factorKey]: condition },
    axes: {},
    hierarchy: {},
    values: { [readoutKey]: 10 + index * 4 },
    missingness: {},
    sourceRow: index + 2,
  }));
  const workspace = createAdaptiveWorkspace({ contract, observations, mapping: null, lineage: null, now });
  if (workspace.status !== "ready" || !workspace.draft) throw new Error("Invalid acceptance fixture");
  const state = createExperimentWorkspaceProject({
    draft: workspace.draft,
    cells: workspace.cells,
    graphs: [analyzedGraph(contract)],
    now,
  });
  return { state, target: sourceTarget };
}

function pressSave(saveAs = false) {
  fireEvent.keyDown(window, { key: "s", code: "KeyS", ctrlKey: true, shiftKey: saveAs });
}

function projectTabs() {
  return within(document.querySelector(".project-tabs") as HTMLElement).getAllByRole("tab");
}

async function openFixture(saveProject: SaveProjectAction, opened = fixture()) {
  const disk = new Map<string, OpenedProject>([[opened.target, opened]]);
  const openProjectTarget = vi.fn(async (target: string) => {
    const project = disk.get(target);
    if (!project) throw new Error(`Unexpected disk read: ${target}`);
    return project;
  });
  const actions: ProjectActions = { openProject: async () => opened, openProjectTarget, saveProject };
  const view = render(<App projectActions={actions} />);
  fireEvent.click(document.querySelector('[data-primary-route="open-project"]')!);
  await screen.findByRole("button", { name: "実験の組み立てを修正" });
  return { ...view, opened, actions, disk, openProjectTarget };
}

function editStructure() {
  fireEvent.click(screen.getByRole("button", { name: "実験の組み立てを修正" }));
}

async function forkEditedConditions() {
  editStructure();
  expect(screen.queryByRole("button", { name: "この条件で新規作成" })).toBeNull();
  fireEvent.change(screen.getByRole("textbox", { name: "行 1 列 1" }), { target: { value: "" } });
  fireEvent.change(screen.getByLabelText("実験タイトル（任意）"), { target: { value: "Edited empty experiment" } });
  fireEvent.click(screen.getByRole("button", { name: "変更を適用" }));
  expect(screen.getByRole("alert")).toHaveTextContent(/既存データで使われている/);
  fireEvent.click(screen.getByRole("button", { name: "この条件で新規作成" }));
  await screen.findByRole("button", { name: "実験の組み立てを修正" });
  expect(projectTabs()).toHaveLength(2);
  expect(projectTabs()[1]).toHaveAttribute("aria-selected", "true");
}

async function selectTab(index: number) {
  fireEvent.click(projectTabs()[index]!);
  await waitFor(() => expect(projectTabs()[index]).toHaveAttribute("aria-selected", "true"));
  await screen.findByRole("button", { name: "実験の組み立てを修正" });
}

function showDetailedValues() {
  fireEvent.click(screen.getByRole("button", { name: "1測定1行" }));
  return screen.getByRole("table", { name: "すべての値を表示" });
}

function changeLiveValue(value: string) {
  const input = within(showDetailedValues()).getByRole("textbox", { name: "Dish-1のSignal" });
  fireEvent.focus(input);
  fireEvent.change(input, { target: { value } });
  // This real worksheet commits its cell editor on blur. fireEvent.click does
  // not synthesize the browser's focus/blur sequence for a subsequent click.
  fireEvent.blur(input);
}

function scientificSnapshot(snapshot: ProjectState["adaptiveInput"]) {
  if (!snapshot) return snapshot;
  const { checkedAt: _checkedAt, ...equivalence } = snapshot.equivalence;
  // The equivalence check freshly projects a design on every save. Its JSON
  // fingerprint includes that projection's creation time, not the persisted
  // design revision's creation time. Retain every other fingerprint field.
  const projected = equivalence.designFingerprint
    ? JSON.parse(equivalence.designFingerprint) as Record<string, unknown>
    : null;
  if (!projected) return { ...snapshot, equivalence };
  const { createdAt: _projectionCreatedAt, ...designFacts } = projected;
  return { ...snapshot, equivalence: { ...equivalence, designFingerprint: designFacts } };
}

function snapshotDifferences(actual: unknown, expected: unknown, path = "snapshot"): string[] {
  if (JSON.stringify(actual) === JSON.stringify(expected)) return [];
  if (actual && expected && typeof actual === "object" && typeof expected === "object") {
    const left = actual as Record<string, unknown>;
    const right = expected as Record<string, unknown>;
    return [...new Set([...Object.keys(left), ...Object.keys(right)])]
      .flatMap((key) => snapshotDifferences(left[key], right[key], `${path}.${key}`));
  }
  return [`${path}: expected=${JSON.stringify(expected)}; actual=${JSON.stringify(actual)}`];
}

function expectEmptyNew(state: ProjectState, sourceId: string) {
  expect(state.metadata.projectId).not.toBe(sourceId);
  expect(state.metadata.projectName).toBe("Edited empty experiment");
  expect(state.adaptiveInput?.contract.factors[0]?.levels).toEqual(["Drug", "Unused"]);
  expect(state.adaptiveInput?.canonicalObservations).toEqual([]);
  expect(state.adaptiveInput?.mapping).toBeNull();
  expect(state.adaptiveInput?.rawLineage).toBeNull();
  expect(state.experimentWorkspace?.graphs).toEqual([]);
  expect(state.graphs).toEqual([]);
  expect(state.observations).toEqual([]);
  expect(state.analysisRuns).toEqual([]);
  expect(JSON.stringify(state)).not.toContain("Dish-1");
  expect(JSON.stringify(state)).not.toContain("request.before-revision");
  expect(JSON.stringify(state)).not.toContain("graph.structure-revision");
}

describe("App conditions-only new experiment acceptance", () => {
  beforeEach(() => {
    localStorage.clear();
    setUsageConsent("opted_out");
    window.history.replaceState({}, "", "/");
    native.enabled = false;
    native.listeners.clear();
    native.close = undefined;
    native.invoke.mockClear();
    vi.spyOn(window, "scrollTo").mockImplementation(() => undefined);
  });
  afterEach(() => { vi.restoreAllMocks(); });

  it("offers creation only after an unsafe edit and keeps the source intact on revision cancellation", async () => {
    const save = vi.fn<SaveProjectAction>(async () => null);
    const { opened } = await openFixture(save);
    expect(opened.state.analysisRuns).toHaveLength(1);
    expect(opened.state.experimentWorkspace?.graphs).toHaveLength(1);
    // The legacy synthetic graph acquires current default fields on opening.
    // Capture its actual UI baseline without replacing the persisted baseline;
    // this isolates cancellation from save-induced analysis revision IDs.
    // Compare every graph/history field without discarding normalization changes.
    pressSave();
    await waitFor(() => expect(save).toHaveBeenCalledTimes(1));
    await waitFor(() => expect(screen.getByRole("button", { name: "プロジェクトを保存" })).toBeEnabled());
    const baseline = save.mock.calls[0]![0];
    expect(screen.queryByRole("button", { name: "この条件で新規作成" })).toBeNull();
    editStructure();
    expect(screen.queryByRole("button", { name: "この条件で新規作成" })).toBeNull();
    fireEvent.change(screen.getByRole("textbox", { name: "行 1 列 1" }), { target: { value: "" } });
    fireEvent.click(screen.getByRole("button", { name: "変更を適用" }));
    expect(screen.getByRole("button", { name: "この条件で新規作成" })).toBeVisible();
    fireEvent.click(screen.getByRole("button", { name: "変更せず戻る" }));
    expect(projectTabs()).toHaveLength(1);
    pressSave();
    await waitFor(() => expect(save).toHaveBeenCalledTimes(2));
    const retained = save.mock.calls[1]![0];
    expect(retained.metadata.projectId).toBe(opened.state.metadata.projectId);
    expect(snapshotDifferences(scientificSnapshot(retained.adaptiveInput), scientificSnapshot(baseline.adaptiveInput))).toEqual([]);
    expect(retained.experimentWorkspace?.graphs).toEqual(baseline.experimentWorkspace?.graphs);
    expect(retained.analysisRuns).toEqual(baseline.analysisRuns);
    expect(retained.designRevisions).toEqual(baseline.designRevisions);
  });

  it("does not offer creation after safely deleting an unused condition", async () => {
    await openFixture(async () => null);
    editStructure();
    fireEvent.change(screen.getByRole("textbox", { name: "行 1 列 3" }), { target: { value: "" } });
    fireEvent.click(screen.getByRole("button", { name: "変更を適用" }));
    await screen.findByRole("button", { name: "実験の組み立てを修正" });
    expect(screen.queryByRole("button", { name: "この条件で新規作成" })).toBeNull();
    expect(projectTabs()).toHaveLength(1);
  });

  it("forks edited conditions with a new identity while retaining live source values, graph and analysis history", async () => {
    const save = vi.fn<SaveProjectAction>(async () => null);
    const { opened, openProjectTarget } = await openFixture(save);
    changeLiveValue("77");
    pressSave();
    await waitFor(() => expect(save).toHaveBeenCalledTimes(1));
    const liveBeforeFork = save.mock.calls[0]![0];
    expect(JSON.stringify(liveBeforeFork.adaptiveInput?.canonicalObservations)).toContain("77");
    await forkEditedConditions();
    pressSave();
    await waitFor(() => expect(save).toHaveBeenCalledTimes(2));
    expect(save.mock.calls[1]![1]).toBeUndefined();
    expectEmptyNew(save.mock.calls[1]![0], opened.state.metadata.projectId);
    await selectTab(0);
    expect(within(showDetailedValues()).getByDisplayValue("77")).toBeVisible();
    pressSave();
    await waitFor(() => expect(save).toHaveBeenCalledTimes(3));
    const retained = save.mock.calls[2]![0];
    expect(save.mock.calls[2]![1]).toBe(sourceTarget);
    expect(retained.metadata.projectId).toBe(opened.state.metadata.projectId);
    expect(snapshotDifferences(scientificSnapshot(retained.adaptiveInput), scientificSnapshot(liveBeforeFork.adaptiveInput))).toEqual([]);
    expect(retained.experimentWorkspace?.graphs).toEqual(liveBeforeFork.experimentWorkspace?.graphs);
    expect(retained.analysisRuns).toEqual(liveBeforeFork.analysisRuns);
    expect(retained.designRevisions).toEqual(liveBeforeFork.designRevisions);
    expect(retained.unitInstances).toEqual(liveBeforeFork.unitInstances);
    expect(openProjectTarget).not.toHaveBeenCalled();
  }, 10000);

  it("prompts on first save, reuses only the real target, and reopens the saved empty experiment independently", async () => {
    const save = vi.fn<SaveProjectAction>(async (state, target) => ({ state, target: target ?? newTarget }));
    const harness = await openFixture(save);
    await forkEditedConditions();
    pressSave();
    await waitFor(() => expect(save).toHaveBeenCalledTimes(1));
    await waitFor(() => expect(projectTabs()[1]).toHaveAttribute("title", newTarget));
    expect(save.mock.calls[0]![1]).toBeUndefined();
    const savedState = save.mock.calls[0]![0];
    expectEmptyNew(savedState, harness.opened.state.metadata.projectId);
    pressSave();
    await waitFor(() => expect(save).toHaveBeenCalledTimes(2));
    expect(save.mock.calls[1]![1]).toBe(newTarget);
    pressSave(true);
    await waitFor(() => expect(save).toHaveBeenCalledTimes(3));
    expect(save.mock.calls[2]![1]).toBeUndefined();
    expect(projectTabs()).toHaveLength(2);
    harness.unmount();
    window.history.replaceState({}, "", "/");
    await openFixture(save, { state: savedState, target: newTarget });
    pressSave();
    await waitFor(() => expect(save).toHaveBeenCalledTimes(4));
    expect(save.mock.calls[3]![0].metadata.projectId).toBe(savedState.metadata.projectId);
    expectEmptyNew(save.mock.calls[3]![0], harness.opened.state.metadata.projectId);
    expect(save.mock.calls[3]![1]).toBe(newTarget);
  });

  it.each(["cancel", "reject"] as const)("retains both experiments after initial save %s and permits an unbound retry", async (outcome) => {
    const save = vi.fn<SaveProjectAction>(async (state, target) => ({ state, target: target ?? newTarget }));
    if (outcome === "cancel") save.mockResolvedValueOnce(null);
    else save.mockRejectedValueOnce(new Error("Synthetic disk failure"));
    const { opened } = await openFixture(save);
    await forkEditedConditions();
    pressSave();
    await waitFor(() => expect(save).toHaveBeenCalledTimes(1));
    await waitFor(() => expect(screen.getByRole("button", { name: "プロジェクトを保存" })).toBeEnabled());
    if (outcome === "reject") expect(screen.getByRole("alert")).toHaveTextContent(/保存/);
    const newId = save.mock.calls[0]![0].metadata.projectId;
    expect(save.mock.calls[0]![1]).toBeUndefined();
    await selectTab(0);
    expect(within(showDetailedValues()).getByDisplayValue("10")).toBeVisible();
    await selectTab(1);
    pressSave();
    await waitFor(() => expect(save).toHaveBeenCalledTimes(2));
    expect(save.mock.calls[1]![1]).toBeUndefined();
    expect(save.mock.calls[1]![0].metadata.projectId).toBe(newId);
    expectEmptyNew(save.mock.calls[1]![0], opened.state.metadata.projectId);
    expect(projectTabs()).toHaveLength(2);
  });

  it("blocks native Quit when a different tab contains unsaved work", async () => {
    native.enabled = true;
    const save = vi.fn<SaveProjectAction>(async (state, target) => ({ state, target: target ?? newTarget }));
    await openFixture(save);
    changeLiveValue("77");
    await forkEditedConditions();
    pressSave();
    await waitFor(() => expect(projectTabs()[1]).toHaveAttribute("title", newTarget));
    await waitFor(() => expect(native.listeners.has("app-exit-request")).toBe(true));
    act(() => { native.listeners.get("app-exit-request")!({}); });
    expect(screen.getByRole("alert")).toHaveTextContent(/別の実験タブに未保存/);
    expect(native.invoke).not.toHaveBeenCalledWith("exit_application");
    const preventDefault = vi.fn();
    act(() => { native.close!({ preventDefault }); });
    expect(preventDefault).toHaveBeenCalledOnce();
    expect(native.invoke).not.toHaveBeenCalledWith("exit_application");
    await selectTab(0);
    expect(within(showDetailedValues()).getByDisplayValue("77")).toBeVisible();
    expect(projectTabs()).toHaveLength(2);
  });

  it("holds tab switching, closing and native Quit while first save is pending, then releases the busy gate", async () => {
    native.enabled = true;
    let completeSave!: (saved: OpenedProject) => void;
    const pending = new Promise<OpenedProject>((resolve) => { completeSave = resolve; });
    const save = vi.fn<SaveProjectAction>(async () => pending);
    await openFixture(save);
    await forkEditedConditions();
    const sessionTarget = projectTabs()[1]!.getAttribute("title");
    pressSave();
    await waitFor(() => expect(save).toHaveBeenCalledTimes(1));
    expect(save.mock.calls[0]![1]).toBeUndefined();

    fireEvent.click(projectTabs()[0]!);
    expect(projectTabs()[1]).toHaveAttribute("aria-selected", "true");
    expect(projectTabs()[1]).toHaveAttribute("title", sessionTarget);
    for (const tab of projectTabs()) {
      const close = tab.closest(".project-tab")!.querySelector<HTMLButtonElement>(".project-tab__close")!;
      fireEvent.click(close);
      expect(projectTabs()).toHaveLength(2);
      expect(projectTabs()[1]).toHaveAttribute("aria-selected", "true");
    }
    await waitFor(() => expect(native.listeners.has("app-exit-request")).toBe(true));
    act(() => { native.listeners.get("app-exit-request")!({}); });
    const preventDefault = vi.fn();
    act(() => { native.close!({ preventDefault }); });
    expect(preventDefault).toHaveBeenCalledOnce();
    expect(native.invoke).not.toHaveBeenCalledWith("exit_application");
    expect(projectTabs()).toHaveLength(2);

    await act(async () => {
      completeSave({ state: save.mock.calls[0]![0], target: newTarget });
      await pending;
    });
    await waitFor(() => expect(projectTabs()[1]).toHaveAttribute("title", newTarget));
    expect(projectTabs()[1]).toHaveAttribute("aria-selected", "true");
    await selectTab(0);
    expect(within(showDetailedValues()).getByDisplayValue("10")).toBeVisible();
    await selectTab(1);
    expect(projectTabs()).toHaveLength(2);
    expect(save).toHaveBeenCalledTimes(1);
  });

  it("keeps both experiments and committed source values when closing a background dirty tab is cancelled", async () => {
    const save = vi.fn<SaveProjectAction>(async () => null);
    await openFixture(save);
    changeLiveValue("77");
    await forkEditedConditions();
    const sourceTab = projectTabs()[0]!;
    expect(sourceTab).toHaveAttribute("aria-selected", "false");
    fireEvent.click(sourceTab.closest(".project-tab")!.querySelector<HTMLButtonElement>(".project-tab__close")!);
    const dialog = await screen.findByRole("dialog", { name: "この実験を保存しますか？" });
    fireEvent.click(within(dialog).getByRole("button", { name: "キャンセル" }));
    expect(screen.queryByRole("dialog", { name: "この実験を保存しますか？" })).toBeNull();
    expect(projectTabs()).toHaveLength(2);
    expect(within(showDetailedValues()).getByDisplayValue("77")).toBeVisible();
    await selectTab(1);
    await selectTab(0);
    expect(within(showDetailedValues()).getByDisplayValue("77")).toBeVisible();
    expect(save).not.toHaveBeenCalled();
  }, 10000);
});
function analyzedGraph(contract: StructureContract): WorkspaceGraphState {
  const readoutId = `outcome.${contract.readouts[0]!.key}`;
  return {
    id: "graph.structure-revision",
    displayName: "Control / Drug",
    analysisRunId: "analysis-run.before-revision",
    selectedReadoutId: readoutId,
    selectedConditionIds: ["condition.1", "condition.2"],
    selectedTimePointIds: [],
    dataSets: {
      displaySet: { conditionIds: ["condition.1", "condition.2"], timePointIds: [] },
      analysisSet: { conditionIds: ["condition.1", "condition.2"], timePointIds: [] },
      comparisonSet: [
        { id: "comparison.control-drug", conditionIds: ["condition.1", "condition.2"] },
      ],
      annotationSet: [{ comparisonId: "comparison.control-drug" }],
    },
    graphType: "dot",
    layers: {
      raw: true,
      distribution: false,
      experiment: true,
      overall: true,
      violin: false,
      box: false,
      errorBar: true,
      connectingLine: false,
    },
    appearance: {
      errorBar: "sd",
      palette: "single",
      pointSize: 6,
      pointOpacity: 0.9,
      axisLineWidth: 1.4,
      hierarchicalLabels: true,
      jitter: 12,
      fontFamily: "arial",
      graphTitleFontSize: 18,
      axisTitleFontSize: 17,
      tickFontSize: 15,
      hierarchyFontSize: 15,
      legendFontSize: 15,
      legendPosition: "hidden",
      seriesColors: {},
      seriesStyles: {},
      distributionFill: "white",
      distributionFillColor: "#ffffff",
      distributionOutlineColor: "#111111",
      barWidth: 0.72,
      withinGroupSpacing: 0.72,
      betweenGroupSpacing: 1.35,
      rawPointColor: "#8a96a3",
      summaryColor: "#111111",
      errorBarColor: "#111111",
      connectingLineColor: "#4b5563",
      summaryLineWidth: 2,
      errorBarLineWidth: 1.5,
      connectingLineWidth: 1.5,
      distributionLineWidth: 1.2,
      canvasPreset: "standard",
      sidePadding: 72,
    },
    axes: {
      xSemantic: "categorical",
      xTitle: "Treatment",
      xUnit: "",
      yTitle: contract.readouts[0]!.label,
      yRangeMode: "auto",
      yMin: null,
      yMax: null,
      yScale: "linear",
      showCategoryLabels: true,
      hierarchyOrder: [`factor.${contract.factors[0]!.key}`],
      spacing: 1,
      yTickMode: "auto",
      yTickInterval: null,
    },
    statisticsAnnotation: { mode: "exact_p", testIndex: 0 },
    statisticsAnnotations: [
      {
        id: "annotation.control-drug",
        comparisonId: "comparison.control-drug",
        testIndex: 0,
        mode: "exact_p",
        showNonSignificant: true,
      },
    ],
    analysis: {
      request: {
        protocolVersion: "0.1.0",
        requestId: "request.before-revision",
        projectId: "project.structure-revision",
        analysisId: "analysis.before-revision",
        templateId: "D01",
        templateVersion: "0.1.0",
        method: "welch_t",
        contrastConditionIds: ["condition.1", "condition.2"],
        observations: [
          {
            observationId: "engine-observation.1",
            conditionId: "condition.1",
            value: 10,
            experimentalUnitId: "Dish-1",
          },
          {
            observationId: "engine-observation.2",
            conditionId: "condition.2",
            value: 14,
            experimentalUnitId: "Dish-2",
          },
        ],
        options: { alternative: "two_sided", confidenceLevel: 0.95, multiplicityMethod: null },
      },
      result: {
        protocolVersion: "0.1.0",
        requestId: "request.before-revision",
        status: "ok",
        engine: { name: "fixture", version: "1", packages: {} },
        estimates: [],
        tests: [
          {
            name: "Control vs Drug",
            statisticName: "t",
            statistic: 1,
            degreesOfFreedom: [1],
            pValue: 0.2,
            adjustedPValue: null,
            effectSizeName: null,
            effectSize: null,
          },
        ],
        diagnostics: [],
        warnings: [],
        completedAt: now,
      },
    },
  };
}



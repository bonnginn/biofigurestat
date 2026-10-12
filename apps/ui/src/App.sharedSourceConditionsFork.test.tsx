import { fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { buildStructureContract } from "@lsaa/adaptive-input";
import type { AnalysisEngineResult } from "@lsaa/analysis-contracts";
import { CanonicalAdaptiveObservationSchema } from "@lsaa/domain";
import { ProjectStateSchema, type ProjectState } from "@lsaa/project";
import type * as TauriCore from "@tauri-apps/api/core";

import App from "./App";
import { createAdaptiveWorkspace } from "./app/adaptiveWorkspace";
import { assessDraftGraphAnalysis } from "./app/experimentDraftAnalysis";
import {
  createExperimentWorkspaceProject,
  rehydrateExperimentWorkspace,
  type WorkspaceGraphState,
} from "./app/experimentWorkspaceProject";
import type { OpenedProject, SaveProjectAction } from "./app/projectActions";
import { setUsageConsent } from "./app/usageTelemetry";

vi.mock("@tauri-apps/api/core", async (original) => ({
  ...await original<typeof TauriCore>(),
  isTauri: () => false,
}));

const now = "2026-10-08T00:00:00.000Z";
const sourceTarget = "C:/synthetic-acceptance/donor-source.lsa";
const cloneState = (state: ProjectState) => ProjectStateSchema.parse(JSON.parse(JSON.stringify(state)));

const appearance: WorkspaceGraphState["appearance"] = {
  errorBar: "sd", palette: "single", pointSize: 6, pointOpacity: 0.9,
  axisLineWidth: 1.4, hierarchicalLabels: true, jitter: 12, fontFamily: "arial",
  graphTitleFontSize: 18, axisTitleFontSize: 17, tickFontSize: 15,
  hierarchyFontSize: 15, legendFontSize: 15, legendPosition: "hidden",
  seriesColors: {}, seriesStyles: {}, distributionFill: "white",
  distributionFillColor: "#ffffff", distributionOutlineColor: "#111111",
  barWidth: 0.72, withinGroupSpacing: 0.72, betweenGroupSpacing: 1.35,
  rawPointColor: "#8a96a3", summaryColor: "#111111", errorBarColor: "#111111",
  connectingLineColor: "#4b5563", summaryLineWidth: 2, errorBarLineWidth: 1.5,
  connectingLineWidth: 1.5, distributionLineWidth: 1.2,
  canvasPreset: "standard", sidePadding: 72,
};

function sharedSourceFixture(): OpenedProject {
  // The existing adapter fixture explicitly declares two independent matched
  // Donors split into distinct condition dishes. Repeated "dish-1" labels do
  // not establish pairing; the declared Donor identity does.
  const contract = buildStructureContract({
    experimentName: "Donor split source",
    experimentDescription: "Each donor culture was split into vehicle and drug dishes.",
    experimentalUnitLabel: "condition dish", identityLabel: "Dish ID",
    readoutLabel: "Signal", readoutRepresentation: "scalar",
    factorName: "Treatment", factorLevels: ["Vehicle", "Drug"],
    sameIdentityAcrossConditions: false,
    conditionEntityRelationship: {
      kind: "distinct_condition_units_shared_source",
      sourceUnitLabel: "Donor", sourceIdentityLabel: "Donor ID",
      sourceRole: "block", completeSetsRequired: true,
    },
  });
  const observations = [
    ["D1", "dish-1", "Vehicle", 1], ["D1", "dish-1", "Drug", 2],
    ["D2", "dish-1", "Vehicle", 3], ["D2", "dish-1", "Drug", 5],
  ].map(([donor, dish, treatment, value], index) => CanonicalAdaptiveObservationSchema.parse({
    observationId: `shared-source.${index + 1}`, readoutKey: "signal",
    identities: { donorid: donor, dishid: dish }, factors: { treatment },
    axes: {}, hierarchy: {}, values: { signal: value }, missingness: {}, sourceRow: index + 2,
  }));
  const workspace = createAdaptiveWorkspace({ contract, observations, mapping: null, lineage: null, now });
  if (workspace.status !== "ready" || !workspace.draft) throw new Error("Invalid existing shared-source fixture");
  const assessment = assessDraftGraphAnalysis({
    draft: workspace.draft, cells: workspace.cells,
    readoutId: workspace.draft.readouts[0]!.id,
    conditionIds: workspace.draft.conditions.map(({ id }) => id),
  });
  if (!assessment.request) throw new Error("Existing shared-source request is missing");
  const result: AnalysisEngineResult = {
    protocolVersion: assessment.request.protocolVersion, requestId: assessment.request.requestId,
    status: "ok", engine: { name: "synthetic-history-fixture", version: "1", packages: {} },
    estimates: [], tests: [], diagnostics: [], warnings: [], completedAt: now,
  };
  const graph: WorkspaceGraphState = {
    id: "graph.shared-source", displayName: "Shared-source signal", analysisRunId: null,
    selectedReadoutId: workspace.draft.readouts[0]!.id,
    selectedConditionIds: workspace.draft.conditions.map(({ id }) => id), selectedTimePointIds: [],
    analysisTimePointId: null, graphType: "paired_dot",
    layers: { raw: false, distribution: false, experiment: true, overall: true,
      violin: false, box: false, errorBar: true, connectingLine: true },
    appearance,
    axes: { xSemantic: "categorical", xTitle: "Treatment", xUnit: "", yTitle: "Signal",
      yRangeMode: "auto", yMin: null, yMax: null, yScale: "linear",
      showCategoryLabels: true, hierarchyOrder: ["factor.treatment"], spacing: 1,
      yTickMode: "auto", yTickInterval: null },
    statisticsAnnotation: { mode: "hidden", testIndex: 0 },
    analysis: { request: assessment.request, result },
  };
  return { state: createExperimentWorkspaceProject({
    draft: workspace.draft, cells: workspace.cells, graphs: [graph], now,
  }), target: sourceTarget };
}

function expectMeasuredSharedSource(state: ProjectState) {
  const contract = state.adaptiveInput!.contract;
  const parents = state.unitInstances.filter(({ levelId }) => levelId === "unit-level.donor");
  const children = state.unitInstances.filter(({ levelId }) => levelId === "unit-level.conditiondish");
  expect(parents).toHaveLength(2);
  expect(children).toHaveLength(4);
  expect(new Set(children.map(({ id }) => id)).size).toBe(4);
  expect(new Set(children.map(({ parentUnitId }) => parentUnitId))).toEqual(new Set(parents.map(({ id }) => id)));
  expect(contract.matching).toEqual({ kind: "matched", identityKey: "donorid", completeSetsRequired: true });
  expect(contract.factors[0]).toMatchObject({ unitRole: "between_unit", relationship: "paired" });
  const request = state.analysisRuns[0]!.request;
  expect(request).toMatchObject({ templateId: "D02", method: "paired_t" });
  expect(request.observations).toHaveLength(4);
  expect(new Set(request.observations.map(({ experimentalUnitId }) => experimentalUnitId)).size).toBe(4);
  const pairs = [...new Set(request.observations.map(({ pairId }) => pairId))];
  expect(pairs).toHaveLength(2);
  expect(pairs.every((pairId) => typeof pairId === "string")).toBe(true);
  for (const pairId of pairs) {
    const matched = request.observations.filter((item) => item.pairId === pairId);
    expect(matched).toHaveLength(2);
    expect(new Set(matched.map(({ conditionId }) => conditionId)).size).toBe(2);
    expect(new Set(matched.map(({ experimentalUnitId }) => experimentalUnitId)).size).toBe(2);
  }
  const conditionIds = [...new Set(request.observations.map(({ conditionId }) => conditionId))];
  expect(conditionIds).toHaveLength(2);
  for (const conditionId of conditionIds) {
    expect(new Set(request.observations.filter((item) => item.conditionId === conditionId)
      .map(({ experimentalUnitId }) => experimentalUnitId)).size).toBe(2);
  }
}

function scientificSnapshot(snapshot: ProjectState["adaptiveInput"]) {
  if (!snapshot) return snapshot;
  // Same two typed, volatile projection timestamps as the existing App
  // acceptance. Keep contract, IDs, values and every other fingerprint field.
  const { checkedAt: _checkedAt, ...equivalence } = snapshot.equivalence;
  const projected = equivalence.designFingerprint
    ? JSON.parse(equivalence.designFingerprint) as Record<string, unknown> : null;
  if (!projected) return { ...snapshot, equivalence };
  const { createdAt: _projectionCreatedAt, ...designFacts } = projected;
  return { ...snapshot, equivalence: { ...equivalence, designFingerprint: designFacts } };
}

function snapshotDifferences(actual: unknown, expected: unknown, path: string): string[] {
  if (JSON.stringify(actual) === JSON.stringify(expected)) return [];
  if (actual && expected && typeof actual === "object" && typeof expected === "object") {
    const left = actual as Record<string, unknown>;
    const right = expected as Record<string, unknown>;
    return [...new Set([...Object.keys(left), ...Object.keys(right)])]
      .flatMap((key) => snapshotDifferences(left[key], right[key], `${path}.${key}`));
  }
  return [`${path}: expected=${JSON.stringify(expected)}; actual=${JSON.stringify(actual)}`];
}

function tabs() {
  return within(document.querySelector(".project-tabs") as HTMLElement).getAllByRole("tab");
}
function saveShortcut() { fireEvent.keyDown(window, { key: "s", code: "KeyS", ctrlKey: true }); }
async function saveSnapshot(save: ReturnType<typeof vi.fn<SaveProjectAction>>, count: number) {
  saveShortcut();
  await waitFor(() => expect(save).toHaveBeenCalledTimes(count));
  await waitFor(() => expect(screen.getByRole("button", { name: "プロジェクトを保存" })).toBeEnabled());
  return cloneState(save.mock.calls[count - 1]![0]);
}
async function selectTab(index: number) {
  fireEvent.click(tabs()[index]!);
  await waitFor(() => expect(tabs()[index]).toHaveAttribute("aria-selected", "true"));
  await screen.findByRole("button", { name: "実験の組み立てを修正" });
}

describe("App shared-source edited-conditions fork boundary", () => {
  beforeEach(() => {
    localStorage.clear(); setUsageConsent("opted_out");
    window.history.replaceState({}, "", "/");
    vi.spyOn(window, "scrollTo").mockImplementation(() => undefined);
  });
  afterEach(() => { vi.restoreAllMocks(); });

  it("keeps saved history exact when the workbench makes its existing metric default explicit", () => {
    const original = sharedSourceFixture().state;
    const workspace = rehydrateExperimentWorkspace(original)!;
    const graphs = workspace.graphs.map((graph) => ({
      ...graph, analysisMetric: { kind: "selected_timepoint" as const },
    }));
    const saved = createExperimentWorkspaceProject({ ...workspace, graphs,
      existingState: original, now: "2026-10-08T01:00:00.000Z" });
    for (const key of ["analysisRuns", "graphs", "derivedDatasetRevisions", "derivedValues",
      "transformations", "rawRevisions", "observations", "unitInstances"] as const) {
      expect(saved[key], key).toEqual(original[key]);
    }
    expectMeasuredSharedSource(saved);
  });

  it("preserves donor parent IDs, paired child units and source history through unsafe edit, empty fork and tab restore", async () => {
    const opened = sharedSourceFixture();
    const immutableFixture = JSON.stringify(opened.state);
    expectMeasuredSharedSource(opened.state);
    const save = vi.fn<SaveProjectAction>(async () => null);
    // Commit the UI-normalized baseline once. A cancelled save's newly
    // prepared derived artifact is not persisted history and must not advance
    // savedProject merely to freeze its projection timestamp.
    save.mockImplementationOnce(async (state, target) => ({ state: cloneState(state), target: target! }));
    const openProjectTarget = vi.fn(async () => { throw new Error("Fork must restore the live tab, not reopen disk"); });
    render(<App projectActions={{ openProject: async () => ({ ...opened, state: cloneState(opened.state) }),
      openProjectTarget, saveProject: save }} />);
    fireEvent.click(document.querySelector('[data-primary-route="open-project"]')!);
    await screen.findByRole("button", { name: "実験の組み立てを修正" });
    const baseline = await saveSnapshot(save, 1);
    await screen.findByText(/プロジェクトを保存しました/);
    expectMeasuredSharedSource(baseline);
    for (const artifact of opened.state.derivedDatasetRevisions) {
      expect(baseline.derivedDatasetRevisions.find(({ id }) => id === artifact.id)).toEqual(artifact);
    }
    console.info(JSON.stringify({ checkpoint: "persisted-history-and-normalized-baseline",
      originalDerived: opened.state.derivedDatasetRevisions.map(({ id, createdAt }) => ({ id, createdAt })),
      baselineDerived: baseline.derivedDatasetRevisions.map(({ id, createdAt }) => ({ id, createdAt })),
      baselineSavedSuccessfully: true }));

    fireEvent.click(screen.getByRole("button", { name: "実験の組み立てを修正" }));
    expect(screen.getByRole("radio", { name: /別々のものだが、同じ由来・実験回として対応する組がある/ })).toBeChecked();
    expect(screen.getByDisplayValue("Donor")).toBeVisible();
    expect(screen.getByDisplayValue("condition dish")).toBeVisible();
    // Identity labels are retained initial data rather than rendered input
    // controls. Their exact values are checked in the resulting contract below.
    expect(screen.queryByRole("button", { name: "この条件で新規作成" })).toBeNull();
    // Replace a measured condition rather than weakening the two-condition
    // shared-source profile merely to force the fork path.
    fireEvent.change(screen.getByRole("textbox", { name: "行 1 列 1" }), { target: { value: "Edited vehicle" } });
    fireEvent.change(screen.getByLabelText("実験タイトル（任意）"), { target: { value: "Edited empty donor split" } });
    fireEvent.click(screen.getByRole("button", { name: "変更を適用" }));
    expect(screen.getByRole("alert")).toHaveTextContent(/既存データで使われている/);
    fireEvent.click(screen.getByRole("button", { name: "この条件で新規作成" }));
    await screen.findByRole("button", { name: "実験の組み立てを修正" });
    expect(tabs()).toHaveLength(2);
    expect(tabs()[1]).toHaveAttribute("aria-selected", "true");

    const empty = await saveSnapshot(save, 2);
    expect(save.mock.calls[1]![1]).toBeUndefined();
    expect(empty.metadata.projectId).not.toBe(baseline.metadata.projectId);
    expect(empty.metadata.projectName).toBe("Edited empty donor split");
    const edited = empty.adaptiveInput!.contract;
    expect(edited.unitLevels).toEqual(baseline.adaptiveInput!.contract.unitLevels);
    expect(edited.identities).toEqual(baseline.adaptiveInput!.contract.identities);
    expect(edited.experimentalUnitLevelKey).toBe(baseline.adaptiveInput!.contract.experimentalUnitLevelKey);
    expect(edited.matching).toEqual(baseline.adaptiveInput!.contract.matching);
    expect(edited.factors[0]).toMatchObject({ key: "treatment", levels: ["Edited vehicle", "Drug"],
      unitRole: "between_unit", relationship: "paired", referenceLevel: null });
    expect(empty.adaptiveInput!.canonicalObservations).toEqual([]);
    expect(empty.adaptiveInput!.mapping).toBeNull();
    expect(empty.adaptiveInput!.rawLineage).toBeNull();
    expect(empty.observations).toEqual([]);
    expect(empty.analysisRuns).toEqual([]);
    expect(empty.graphs).toEqual([]);
    expect(empty.experimentWorkspace!.graphs).toEqual([]);
    expect(empty.derivedValues).toEqual([]);
    expect(empty.derivedDatasetRevisions).toEqual([]);
    const originalIds = new Set(baseline.unitInstances.map(({ id }) => id));
    expect(empty.unitInstances.filter(({ id }) => originalIds.has(id))).toEqual([]);
    const emptyWorkspace = rehydrateExperimentWorkspace(empty)!;
    expect(emptyWorkspace.cells).toEqual({});
    expect(emptyWorkspace.draft.conditionAssignment.matchedTopology).toEqual({
      kind: "distinct_condition_units_shared_source", sourceUnitLabel: "Donor",
      sourceIdentityLabel: "Donor ID", sourceRole: "block",
    });

    await selectTab(0);
    const retained = await saveSnapshot(save, 3);
    expect(save.mock.calls[2]![1]).toBe(sourceTarget);
    expect(retained.metadata.projectId).toBe(baseline.metadata.projectId);
    expect(retained.metadata.createdAt).toBe(baseline.metadata.createdAt);
    expectMeasuredSharedSource(retained);
    expect(scientificSnapshot(retained.adaptiveInput)).toEqual(scientificSnapshot(baseline.adaptiveInput));
    for (const key of ["unitInstances", "observations", "rawRevisions", "designRevisions", "analysisRuns",
      "graphs", "derivedValues", "derivedDatasetRevisions"] as const) {
      const differences = snapshotDifferences(retained[key], baseline[key], key);
      expect(differences, differences.join("\n")).toEqual([]);
    }
    expect(retained.activeRawRevisionId).toBe(baseline.activeRawRevisionId);
    expect(retained.activeDesignRevisionId).toBe(baseline.activeDesignRevisionId);
    expect(retained.experimentWorkspace!.graphs).toEqual(baseline.experimentWorkspace!.graphs);
    await selectTab(1);
    const restoredEmpty = await saveSnapshot(save, 4);
    expect(restoredEmpty.metadata.projectId).toBe(empty.metadata.projectId);
    expect(restoredEmpty.metadata.createdAt).toBe(empty.metadata.createdAt);
    expect(restoredEmpty.adaptiveInput!.canonicalObservations).toEqual([]);
    expect(rehydrateExperimentWorkspace(restoredEmpty)!.cells).toEqual({});
    expect(openProjectTarget).not.toHaveBeenCalled();
    expect(JSON.stringify(opened.state)).toBe(immutableFixture);
  }, 15000);
});

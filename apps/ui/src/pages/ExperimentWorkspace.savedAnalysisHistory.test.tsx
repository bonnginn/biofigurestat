import { act, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { buildStructureContract } from "@lsaa/adaptive-input";
import {
  AnalysisEngineResultSchema,
  type AnalysisEngineRequest,
  type AnalysisEngineResult,
} from "@lsaa/analysis-contracts";
import { spawnSync } from "node:child_process";
import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import path from "node:path";
import { CanonicalAdaptiveObservationSchema } from "@lsaa/domain";
import { ProjectStateSchema, type ProjectState } from "@lsaa/project";
import { beforeEach, describe, expect, it, vi } from "vitest";

import { createAdaptiveWorkspace } from "../app/adaptiveWorkspace";
import type { AnalysisRunner } from "../app/analysisClient";
import { assessDraftGraphAnalysis } from "../app/experimentDraftAnalysis";
import {
  createExperimentWorkspaceProject,
  rehydrateExperimentWorkspace,
  type WorkspaceGraphState,
} from "../app/experimentWorkspaceProject";
import type { OpenedProject, SaveProjectAction } from "../app/projectActions";
import { setUsageConsent } from "../app/usageTelemetry";
import { ExperimentWorkspace } from "./ExperimentWorkspace";
import { serializeGraphSvg } from "../app/graphExport";

const persistedAt = "2026-10-08T00:00:00.000Z";
const rerunAt = "2026-10-08T01:00:00.000Z";
const target = "C:/synthetic-acceptance/saved-analysis-history.lsa";
const cloneState = (state: ProjectState) =>
  ProjectStateSchema.parse(JSON.parse(JSON.stringify(state)));
const historyKeys = [
  "analysisRuns",
  "graphs",
  "derivedDatasetRevisions",
  "derivedValues",
  "transformations",
  "rawRevisions",
  "designRevisions",
  "observations",
  "unitInstances",
  "provenanceEvents",
] as const;

const appearance: WorkspaceGraphState["appearance"] = {
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
};

function syntheticResult(
  request: AnalysisEngineRequest,
  completedAt: string,
): AnalysisEngineResult {
  // This is a synthetic bridge response, not a statistical engine execution.
  return {
    protocolVersion: request.protocolVersion,
    requestId: request.requestId,
    status: "ok",
    engine: { name: "synthetic-history-fixture", version: "1", packages: {} },
    estimates: [
      {
        name: "mean_difference",
        value: -1.5,
        standardError: 0.5,
        confidenceInterval: { level: 0.95, lower: -3, upper: -0.1 },
      },
    ],
    tests: [],
    diagnostics: [],
    warnings: [],
    completedAt,
  };
}

function savedSharedSourceFixture(seedAnalysis = true): OpenedProject {
  const contract = buildStructureContract({
    experimentName: "Saved donor split",
    experimentDescription: "Each donor culture was split into vehicle and drug dishes.",
    experimentalUnitLabel: "condition dish",
    identityLabel: "Dish ID",
    readoutLabel: "Signal",
    readoutRepresentation: "scalar",
    factorName: "Treatment",
    factorLevels: ["Vehicle", "Drug"],
    sameIdentityAcrossConditions: false,
    conditionEntityRelationship: {
      kind: "distinct_condition_units_shared_source",
      sourceUnitLabel: "Donor",
      sourceIdentityLabel: "Donor ID",
      sourceRole: "block",
      completeSetsRequired: true,
    },
  });
  const observations = [
    ["D1", "dish-1", "Vehicle", 1],
    ["D1", "dish-1", "Drug", 2],
    ["D2", "dish-1", "Vehicle", 3],
    ["D2", "dish-1", "Drug", 5],
  ].map(([donor, dish, treatment, value], index) =>
    CanonicalAdaptiveObservationSchema.parse({
      observationId: `saved-history.${index + 1}`,
      readoutKey: "signal",
      identities: { donorid: donor, dishid: dish },
      factors: { treatment },
      axes: {},
      hierarchy: {},
      values: { signal: value },
      missingness: {},
      sourceRow: index + 2,
    }),
  );
  const workspace = createAdaptiveWorkspace({
    contract,
    observations,
    mapping: null,
    lineage: null,
    now: persistedAt,
  });
  if (workspace.status !== "ready" || !workspace.draft) {
    throw new Error("FIXTURE_SETUP_FAILED: shared-source workspace must be ready");
  }
  const assessment = assessDraftGraphAnalysis({
    draft: workspace.draft,
    cells: workspace.cells,
    readoutId: workspace.draft.readouts[0]!.id,
    conditionIds: workspace.draft.conditions.map(({ id }) => id),
  });
  if (assessment.state !== "ready" || !assessment.request) {
    throw new Error("FIXTURE_SETUP_FAILED: shared-source analysis must be executable");
  }
  expect(
    assessment.nByCondition.map(({ n }) => n),
    "fixture: biological n per condition",
  ).toEqual([2, 2]);
  const graph: WorkspaceGraphState = {
    id: "graph.saved-history",
    displayName: "Saved donor signal",
    analysisRunId: null,
    selectedReadoutId: workspace.draft.readouts[0]!.id,
    selectedConditionIds: workspace.draft.conditions.map(({ id }) => id),
    selectedTimePointIds: [],
    analysisTimePointId: null,
    graphType: "paired_dot",
    layers: {
      raw: false,
      distribution: false,
      experiment: true,
      overall: true,
      violin: false,
      box: false,
      errorBar: true,
      connectingLine: true,
    },
    appearance,
    axes: {
      xSemantic: "categorical",
      xTitle: "Treatment",
      xUnit: "",
      yTitle: "Signal",
      yRangeMode: "auto",
      yMin: null,
      yMax: null,
      yScale: "linear",
      showCategoryLabels: true,
      hierarchyOrder: ["factor.treatment"],
      spacing: 1,
      yTickMode: "auto",
      yTickInterval: null,
    },
    statisticsAnnotation: { mode: "hidden", testIndex: 0 },
    analysis: seedAnalysis
      ? {
          request: assessment.request,
          result: syntheticResult(assessment.request, persistedAt),
        }
      : null,
  };
  return {
    state: createExperimentWorkspaceProject({
      draft: workspace.draft,
      cells: workspace.cells,
      graphs: [graph],
      now: persistedAt,
    }),
    target,
  };
}

function scientificRequest(request: AnalysisEngineRequest) {
  if (request.protocolVersion !== "0.1.0") {
    throw new Error("FIXTURE_SETUP_FAILED: expected the two-condition request contract");
  }
  return {
    protocolVersion: request.protocolVersion,
    templateId: request.templateId,
    templateVersion: request.templateVersion,
    method: request.method,
    contrastConditionIds: request.contrastConditionIds,
    options: request.options,
    // Each execution legitimately versions its derived observation IDs.
    observations: request.observations.map(
      ({ conditionId, value, experimentalUnitId, pairId }) => ({
        conditionId,
        value,
        experimentalUnitId,
        pairId,
      }),
    ),
  };
}

function expectSharedSourceIdentity(state: ProjectState) {
  const parents = state.unitInstances.filter(({ levelId }) => levelId === "unit-level.donor");
  const children = state.unitInstances.filter(
    ({ levelId }) => levelId === "unit-level.conditiondish",
  );
  expect(parents, "fixture/scientific invariant: two independent donors").toHaveLength(2);
  expect(children, "fixture/scientific invariant: four distinct condition dishes").toHaveLength(4);
  expect(new Set(children.map(({ id }) => id)).size).toBe(4);
  expect(new Set(children.map(({ parentUnitId }) => parentUnitId))).toEqual(
    new Set(parents.map(({ id }) => id)),
  );
  expect(state.adaptiveInput!.contract.matching).toEqual({
    kind: "matched",
    identityKey: "donorid",
    completeSetsRequired: true,
  });
  const request = state.analysisRuns.at(-1)!.request;
  expect(request).toMatchObject({
    protocolVersion: "0.1.0",
    templateId: "D02",
    method: "paired_t",
  });
  expect(request.observations).toHaveLength(4);
  expect(
    new Set(request.observations.map(({ experimentalUnitId }) => experimentalUnitId)).size,
  ).toBe(4);
  const pairs = [...new Set(request.observations.map(({ pairId }) => pairId))];
  expect(pairs).toHaveLength(2);
  expect(pairs.every((pairId) => typeof pairId === "string")).toBe(true);
  for (const pairId of pairs) {
    const matched = request.observations.filter((observation) => observation.pairId === pairId);
    expect(matched).toHaveLength(2);
    expect(new Set(matched.map(({ conditionId }) => conditionId)).size).toBe(2);
    expect(new Set(matched.map(({ experimentalUnitId }) => experimentalUnitId)).size).toBe(2);
  }
}

async function saveWorkspace(
  saveProject: ReturnType<typeof vi.fn<SaveProjectAction>>,
  count: number,
) {
  fireEvent.click(screen.getByRole("button", { name: "プロジェクトを保存" }));
  await waitFor(() =>
    expect(saveProject, "save bridge must receive a validated project").toHaveBeenCalledTimes(
      count,
    ),
  );
  await screen.findByText("プロジェクトを保存しました。次回もこの入力画面で再編集できます。");
  await waitFor(() =>
    expect(screen.getByRole("button", { name: "プロジェクトを保存" })).toBeEnabled(),
  );
  return cloneState(saveProject.mock.calls[count - 1]![0]);
}

describe("ExperimentWorkspace saved analysis history", () => {
  beforeEach(() => {
    localStorage.clear();
    setUsageConsent("opted_out");
    window.history.replaceState({}, "", "/");
  });

  it("persists decimal presentation through save/reopen without changing measurements or analysis history", async () => {
    const opened = savedSharedSourceFixture();
    const original = cloneState(opened.state);
    const workspace = rehydrateExperimentWorkspace(original)!;
    const analysisRunner = vi.fn<AnalysisRunner>();
    const saveProject = vi.fn<SaveProjectAction>(async (state, destination) => ({
      state: cloneState(state),
      target: destination!,
    }));
    const view = render(
      <ExperimentWorkspace
        initialDraft={workspace.draft}
        initialCells={workspace.cells}
        initialGraphs={workspace.graphs}
        initialProject={opened}
        analysisRunner={analysisRunner}
        saveProject={saveProject}
        onBack={vi.fn()}
      />,
    );
    const cell = screen
      .getAllByRole("textbox")
      .find((input) => (input as HTMLInputElement).value === "1")!;
    expect(cell).toBeDefined();
    fireEvent.change(cell, { target: { value: "1.000" } });
    fireEvent.blur(cell);
    expect(cell).toHaveValue("1.000");
    fireEvent.click(screen.getByRole("button", { name: "入力を元に戻す" }));
    expect(cell).toHaveValue("1");
    fireEvent.click(screen.getByRole("button", { name: "入力をやり直す" }));
    expect(cell).toHaveValue("1.000");
    const saved = await saveWorkspace(saveProject, 1);
    expect(Object.values(saved.adaptiveInput!.numericPresentation!.displayTexts)).toContain(
      "1.000",
    );
    expect(saved.adaptiveInput!.canonicalObservations).toEqual(
      original.adaptiveInput!.canonicalObservations,
    );
    expect(saved.experimentWorkspace!.graphs[0]!.analysisRunId).toBe(
      original.experimentWorkspace!.graphs[0]!.analysisRunId,
    );
    for (const key of historyKeys)
      expect(saved[key], `text-only edit must preserve ${key}`).toEqual(original[key]);
    expect(analysisRunner).not.toHaveBeenCalled();
    view.unmount();
    const reopened = rehydrateExperimentWorkspace(cloneState(saved))!;
    if (process.env.BIOFIGURESTAT_NUMERIC_PRESENTATION_QA === "1") {
      const qa = path.resolve(process.cwd(), ".numeric-presentation-qa");
      mkdirSync(qa, { recursive: true });
      writeFileSync(path.join(qa, "state.json"), JSON.stringify(saved, null, 2));
    }
    render(
      <ExperimentWorkspace
        initialDraft={reopened.draft}
        initialCells={reopened.cells}
        initialGraphs={reopened.graphs}
        initialProject={{ state: saved, target }}
        analysisRunner={analysisRunner}
        onBack={vi.fn()}
      />,
    );
    expect(screen.getByDisplayValue("1.000")).toBeVisible();
    expect(screen.getByRole("button", { name: "入力を元に戻す" })).toBeDisabled();
    fireEvent.click(screen.getByRole("button", { name: "グラフ (1)" }));
    fireEvent.click(screen.getByRole("button", { name: "統計" }));
    expect(screen.getByRole("group", { name: "統計解析結果" })).toHaveTextContent("推定値 = -1.5");
    expect(analysisRunner).not.toHaveBeenCalled();
  }, 15000);

  it.runIf(process.env.BIOFIGURESTAT_NUMERIC_NATIVE_READBACK === "1")(
    "rehydrates numeric presentation from the production SQLite readback",
    () => {
      const qa = path.resolve(process.cwd(), ".numeric-presentation-qa");
      const state = ProjectStateSchema.parse(
        JSON.parse(readFileSync(path.join(qa, "native-reopened-state.json"), "utf8")),
      );
      const source = ProjectStateSchema.parse(
        JSON.parse(readFileSync(path.join(qa, "state.json"), "utf8")),
      );
      expect(state.adaptiveInput).toEqual(source.adaptiveInput);
      for (const key of historyKeys) expect(state[key]).toEqual(source[key]);
      const workspace = rehydrateExperimentWorkspace(state)!;
      const analysisRunner = vi.fn<AnalysisRunner>();
      render(
        <ExperimentWorkspace
          initialDraft={workspace.draft}
          initialCells={workspace.cells}
          initialGraphs={workspace.graphs}
          initialProject={{ state, target }}
          analysisRunner={analysisRunner}
          onBack={vi.fn()}
        />,
      );
      expect(screen.getByDisplayValue("1.000")).toBeVisible();
      fireEvent.click(screen.getByRole("button", { name: "グラフ (1)" }));
      fireEvent.click(screen.getByRole("button", { name: "統計" }));
      expect(screen.getByRole("group", { name: "統計解析結果" })).toHaveTextContent(
        "推定値 = -1.5",
      );
      expect(analysisRunner).not.toHaveBeenCalled();
    },
  );

  it("does not let a saved rounded or mismatched spelling hide the canonical number", () => {
    const opened = savedSharedSourceFixture();
    opened.state.adaptiveInput!.numericPresentation = {
      schemaVersion: "0.1.0",
      displayTexts: {
        "canonical-matrix:saved-history.1:signal": "1.0000000000000001",
        "canonical-matrix:saved-history.2:signal": "9.000",
      },
    };
    const workspace = rehydrateExperimentWorkspace(cloneState(opened.state))!;
    render(
      <ExperimentWorkspace
        initialDraft={workspace.draft}
        initialCells={workspace.cells}
        initialGraphs={workspace.graphs}
        initialProject={opened}
        analysisRunner={vi.fn()}
        onBack={vi.fn()}
      />,
    );
    expect(screen.queryByDisplayValue("1.0000000000000001")).toBeNull();
    expect(screen.queryByDisplayValue("9.000")).toBeNull();
    expect(screen.getByDisplayValue("1")).toBeVisible();
    expect(screen.getByDisplayValue("2")).toBeVisible();
  });

  it.runIf(process.env.BIOFIGURESTAT_REAL_ENGINE_ACCEPTANCE === "1")(
    "runs the pinned CLI and reopens its persisted result without another calculation",
    async () => {
      const repository = path.resolve(process.cwd(), "../..");
      const evidence = path.join(repository, "apps/ui/.engine-roundtrip07");
      mkdirSync(evidence, { recursive: true });
      const enginePython = path.join(repository, "engine/python/.venv/Scripts/python.exe");
      const opened = savedSharedSourceFixture(false);
      expect(opened.state.analysisRuns).toHaveLength(0);
      const workspace = rehydrateExperimentWorkspace(opened.state)!;
      const analysisRunner = vi.fn<AnalysisRunner>(async (request) => {
        const execution = spawnSync(enginePython, ["-m", "lsaa_engine.cli"], {
          cwd: path.join(repository, "engine/python"),
          input: JSON.stringify(request),
          encoding: "utf8",
          timeout: 120000,
          windowsHide: true,
        });
        writeFileSync(path.join(evidence, "request.json"), JSON.stringify(request, null, 2));
        writeFileSync(path.join(evidence, "engine-stdout.txt"), execution.stdout ?? "");
        writeFileSync(path.join(evidence, "engine-stderr.txt"), execution.stderr ?? "");
        expect(execution.error, execution.stderr).toBeUndefined();
        expect(execution.status, execution.stderr).toBe(0);
        const result = AnalysisEngineResultSchema.parse(JSON.parse(execution.stdout));
        expect(result.status).toBe("ok");
        expect(result.engine).toMatchObject({
          name: "lsaa-python",
          version: "0.14.0",
          packages: { numpy: "2.3.5", scipy: "1.18.0" },
        });
        writeFileSync(path.join(evidence, "request.json"), JSON.stringify(request, null, 2));
        writeFileSync(path.join(evidence, "result.json"), JSON.stringify(result, null, 2));
        return result;
      });
      const snapshot = path.join(evidence, "project-state.json");
      // Diagnostic state snapshot, not a native .lsa container or mock native-I/O claim.
      const saveProject = vi.fn<SaveProjectAction>(async (state) => {
        writeFileSync(snapshot, JSON.stringify(ProjectStateSchema.parse(state), null, 2));
        return {
          state: ProjectStateSchema.parse(JSON.parse(readFileSync(snapshot, "utf8"))),
          target: snapshot,
        };
      });
      const view = render(
        <ExperimentWorkspace
          initialDraft={workspace.draft}
          initialCells={workspace.cells}
          initialGraphs={workspace.graphs}
          initialProject={opened}
          analysisRunner={analysisRunner}
          saveProject={saveProject}
          onBack={vi.fn()}
        />,
      );
      fireEvent.click(screen.getByRole("button", { name: "統計" }));
      await act(async () => {
        fireEvent.click(await screen.findByRole("button", { name: "選択した解析を実行" }));
      });
      expect(analysisRunner).toHaveBeenCalledTimes(1);
      const resultPanel = await screen.findByRole("group", { name: "統計解析結果" });
      expect(resultPanel).toHaveTextContent("n=2");
      expect(resultPanel).toHaveTextContent("推定値 = -1.5");
      await saveWorkspace(saveProject, 1);
      const saved = ProjectStateSchema.parse(JSON.parse(readFileSync(snapshot, "utf8")));
      expect(saved.analysisRuns).toHaveLength(1);
      expectSharedSourceIdentity(saved);
      expect(saved.analysisRuns[0]!.result.engine.name).toBe("lsaa-python");
      expect(saved.analysisRuns[0]!.result.estimates[0]!.value).toBe(-1.5);
      fireEvent.click(screen.getByRole("button", { name: "グラフ (1)" }));
      const rendered = document.querySelector<SVGSVGElement>("svg.experiment-graph-svg")!;
      writeFileSync(path.join(evidence, "figure.svg"), serializeGraphSvg(rendered));
      view.unmount();
      const reopened = rehydrateExperimentWorkspace(saved)!;
      render(
        <ExperimentWorkspace
          initialDraft={reopened.draft}
          initialCells={reopened.cells}
          initialGraphs={reopened.graphs}
          initialProject={{ state: saved, target: snapshot }}
          analysisRunner={analysisRunner}
          onBack={vi.fn()}
        />,
      );
      fireEvent.click(screen.getByRole("button", { name: "統計" }));
      expect(screen.getByRole("group", { name: "統計解析結果" })).toHaveTextContent(
        "推定値 = -1.5",
      );
      expect(analysisRunner).toHaveBeenCalledTimes(1);
    },
    120000,
  );

  it("keeps scientific history exact through figure polishing, save and reopen", async () => {
    const opened = savedSharedSourceFixture();
    const original = cloneState(opened.state);
    const workspace = rehydrateExperimentWorkspace(original)!;
    const analysisRunner = vi.fn<AnalysisRunner>(async (request) =>
      syntheticResult(request, rerunAt),
    );
    const saveProject = vi.fn<SaveProjectAction>(async (state, destination) => ({
      state: cloneState(state),
      target: destination!,
    }));
    const view = render(
      <ExperimentWorkspace
        initialDraft={workspace.draft}
        initialCells={workspace.cells}
        initialGraphs={workspace.graphs}
        initialProject={opened}
        analysisRunner={analysisRunner}
        saveProject={saveProject}
        onBack={vi.fn()}
      />,
    );
    fireEvent.click(screen.getByRole("button", { name: "グラフ (1)" }));
    fireEvent.change(screen.getByRole("combobox", { name: "編集対象" }), {
      target: { value: "y-axis" },
    });
    fireEvent.change(screen.getByRole("textbox", { name: "Y軸タイトル" }), {
      target: { value: "Signal (a.u.)" },
    });
    fireEvent.change(screen.getByRole("slider", { name: "軸タイトルの文字サイズ" }), {
      target: { value: "21" },
    });
    const renderedSvg = document.querySelector<SVGSVGElement>("svg.experiment-graph-svg")!;
    const exportedSvg = serializeGraphSvg(renderedSvg);
    expect(exportedSvg).toContain("Signal (a.u.)");
    expect(exportedSvg).toContain("21px");
    const saved = await saveWorkspace(saveProject, 1);
    for (const key of historyKeys) {
      expect(saved[key], `appearance must preserve ${key}`).toEqual(original[key]);
    }
    expect(saved.experimentWorkspace!.graphs[0]!.axes.yTitle).toBe("Signal (a.u.)");
    expect(saved.experimentWorkspace!.graphs[0]!.appearance.axisTitleFontSize).toBe(21);
    expect(saved.adaptiveInput!.canonicalObservations).toEqual(
      original.adaptiveInput!.canonicalObservations,
    );
    expect(analysisRunner).not.toHaveBeenCalled();
    view.unmount();
    const reopened = rehydrateExperimentWorkspace(cloneState(saved))!;
    render(
      <ExperimentWorkspace
        initialDraft={reopened.draft}
        initialCells={reopened.cells}
        initialGraphs={reopened.graphs}
        initialProject={{ state: saved, target }}
        analysisRunner={analysisRunner}
        onBack={vi.fn()}
      />,
    );
    fireEvent.click(screen.getByRole("button", { name: "グラフ (1)" }));
    fireEvent.change(screen.getByRole("combobox", { name: "編集対象" }), {
      target: { value: "y-axis" },
    });
    expect(screen.getByRole("textbox", { name: "Y軸タイトル" })).toHaveValue("Signal (a.u.)");
    expect(screen.getByRole("slider", { name: "軸タイトルの文字サイズ" })).toHaveValue("21");
    fireEvent.click(screen.getByRole("button", { name: "統計" }));
    expect(screen.getByRole("group", { name: "統計解析結果" })).toBeVisible();
    expect(screen.getByRole("group", { name: "統計解析結果" })).toHaveTextContent(/n=2/);
    expect(screen.getByRole("group", { name: "統計解析結果" })).toHaveTextContent("推定値 = -1.5");
    expect(screen.getByRole("group", { name: "統計解析結果" })).toHaveTextContent(
      "95% 両側CI -3–-0.1",
    );
    expect(analysisRunner).not.toHaveBeenCalled();
  }, 15000);

  it("persists a real workbench analysis callback once and keeps every history artifact exact on an unedited second Save", async () => {
    const opened = savedSharedSourceFixture();
    const original = cloneState(opened.state);
    const immutableFixture = JSON.stringify(opened.state);
    expectSharedSourceIdentity(original);
    expect(original.analysisRuns, "fixture: persisted analysis history").toHaveLength(1);
    expect(original.derivedDatasetRevisions, "fixture: persisted derived history").toHaveLength(1);
    expect(original.derivedValues, "fixture: persisted derived observations").toHaveLength(4);
    const workspace = rehydrateExperimentWorkspace(original);
    if (!workspace) throw new Error("FIXTURE_SETUP_FAILED: saved project must rehydrate");

    const analysisRunner = vi.fn<AnalysisRunner>(async (request) =>
      syntheticResult(request, rerunAt),
    );
    const saveProject = vi.fn<SaveProjectAction>(async (state, destination) => ({
      state: cloneState(state),
      target: destination!,
    }));
    render(
      <ExperimentWorkspace
        initialDraft={workspace.draft}
        initialCells={workspace.cells}
        initialGraphs={workspace.graphs}
        initialDataViewMode={workspace.dataViewMode}
        initialProject={{ state: cloneState(original), target: opened.target }}
        analysisRunner={analysisRunner}
        saveProject={saveProject}
        onBack={vi.fn()}
      />,
    );

    fireEvent.click(screen.getByRole("button", { name: "統計" }));
    const runButton = await screen.findByRole("button", { name: "選択した解析を実行" });
    expect(
      runButton,
      "fixture: the real workbench must allow the declared donor analysis",
    ).toBeEnabled();
    expect(
      analysisRunner,
      "fixture: opening saved statistics must not execute the engine",
    ).not.toHaveBeenCalled();
    // Commit the workbench's existing presentation defaults before the new execution.
    const baseline = await saveWorkspace(saveProject, 1);
    for (const key of historyKeys) {
      expect(baseline[key], `fixture baseline must retain persisted ${key}`).toEqual(original[key]);
    }

    await act(async () => {
      fireEvent.click(runButton);
    });
    await waitFor(() =>
      expect(analysisRunner, "fixture: actual statistics execution callback").toHaveBeenCalledTimes(
        1,
      ),
    );
    await waitFor(() =>
      expect(screen.getByRole("button", { name: "選択した解析を実行" })).toBeEnabled(),
    );
    expect(screen.getByRole("group", { name: "統計解析結果" })).toBeVisible();
    const liveRequest = analysisRunner.mock.calls[0]![0];
    expect(
      liveRequest.requestId,
      "trigger: workbench request has not yet acquired a persisted revision ID",
    ).not.toBe(baseline.analysisRuns[0]!.request.requestId);

    const first = await saveWorkspace(saveProject, 2);
    expect(first.analysisRuns, "product: new execution must append exactly one run").toHaveLength(
      baseline.analysisRuns.length + 1,
    );
    expect(first.derivedDatasetRevisions).toHaveLength(baseline.derivedDatasetRevisions.length + 1);
    const savedRun = first.analysisRuns.at(-1)!;
    expect(savedRun.result).toEqual({
      ...syntheticResult(liveRequest, rerunAt),
      requestId: savedRun.request.requestId,
    });
    expect(savedRun.request.projectId).toBe(baseline.metadata.projectId);
    expect(savedRun.request.requestId).not.toBe(liveRequest.requestId);
    expect(first.experimentWorkspace!.graphs[0]!.analysisRunId).toBe(savedRun.id);
    expectSharedSourceIdentity(first);
    expect(scientificRequest(savedRun.request)).toEqual(
      scientificRequest(baseline.analysisRuns[0]!.request),
    );
    expect(first.experimentWorkspace!.controlConditionId).toBe(
      baseline.experimentWorkspace!.controlConditionId,
    );
    expect(first.experimentWorkspace!.comparisons).toEqual(
      baseline.experimentWorkspace!.comparisons,
    );
    expect(first.experimentWorkspace!.analysisIntent).toEqual(
      baseline.experimentWorkspace!.analysisIntent,
    );
    for (const key of historyKeys) {
      expect(
        first[key].slice(0, baseline[key].length),
        `product: prior ${key} must remain exact`,
      ).toEqual(baseline[key]);
    }
    for (const key of [
      "rawRevisions",
      "designRevisions",
      "observations",
      "unitInstances",
    ] as const) {
      expect(first[key], `product: rerunning statistics must preserve ${key}`).toEqual(
        baseline[key],
      );
    }

    // No UI edit and no second engine execution occurs between these Saves.
    const second = await saveWorkspace(saveProject, 3);
    expect(
      second.analysisRuns,
      "product: unedited Save must not create another analysis run",
    ).toEqual(first.analysisRuns);
    for (const key of historyKeys) {
      expect(second[key], `product: unedited Save must keep ${key} exact`).toEqual(first[key]);
    }
    expect(second.experimentWorkspace!.graphs).toEqual(first.experimentWorkspace!.graphs);
    expect(second.activeRawRevisionId).toBe(first.activeRawRevisionId);
    expect(second.activeDesignRevisionId).toBe(first.activeDesignRevisionId);
    expect(second.metadata.projectId).toBe(first.metadata.projectId);
    expect(second.metadata.createdAt).toBe(first.metadata.createdAt);
    expectSharedSourceIdentity(second);
    expect(analysisRunner).toHaveBeenCalledTimes(1);
    expect(saveProject.mock.calls.map(([, destination]) => destination)).toEqual([
      target,
      target,
      target,
    ]);
    expect(JSON.stringify(opened.state), "fixture source must remain immutable").toBe(
      immutableFixture,
    );
  }, 15000);

  async function mountNewExecution(
    saveProject: ReturnType<typeof vi.fn<SaveProjectAction>>,
    onDirtyChange?: (dirty: boolean) => void,
  ) {
    const opened = savedSharedSourceFixture();
    const workspace = rehydrateExperimentWorkspace(opened.state)!;
    const analysisRunner = vi.fn<AnalysisRunner>(async (request) =>
      syntheticResult(request, rerunAt),
    );
    render(
      <ExperimentWorkspace
        initialDraft={workspace.draft}
        initialCells={workspace.cells}
        initialGraphs={workspace.graphs}
        initialDataViewMode={workspace.dataViewMode}
        initialProject={opened}
        analysisRunner={analysisRunner}
        saveProject={saveProject}
        onBack={vi.fn()}
        onDirtyChange={onDirtyChange}
      />,
    );
    fireEvent.click(screen.getByRole("button", { name: "統計" }));
    const runButton = await screen.findByRole("button", { name: "選択した解析を実行" });
    const baseline = await saveWorkspace(saveProject, 1);
    await act(async () => {
      fireEvent.click(runButton);
    });
    await waitFor(() => expect(analysisRunner).toHaveBeenCalledTimes(1));
    await waitFor(() => expect(runButton).toBeEnabled());
    return { opened, baseline, analysisRunner };
  }

  it.each(["cancel", "error"] as const)(
    "keeps the new execution dirty after save %s and commits it once on retry",
    async (failure) => {
      const successfulSave: SaveProjectAction = async (state, destination) => ({
        state: cloneState(state),
        target: destination!,
      });
      const saveProject = vi.fn<SaveProjectAction>(successfulSave);
      saveProject.mockImplementationOnce(successfulSave);
      saveProject.mockImplementationOnce(async () => {
        if (failure === "error") throw new Error("Synthetic save failure");
        return null;
      });
      const dirty = vi.fn<(dirty: boolean) => void>();
      const { opened, baseline, analysisRunner } = await mountNewExecution(saveProject, dirty);
      const original = JSON.stringify(opened.state);
      fireEvent.click(screen.getByRole("button", { name: "プロジェクトを保存" }));
      await waitFor(() => expect(saveProject).toHaveBeenCalledTimes(2));
      await waitFor(() =>
        expect(screen.getByRole("button", { name: "プロジェクトを保存" })).toBeEnabled(),
      );
      await waitFor(() => expect(dirty.mock.calls.at(-1)?.[0]).toBe(true));
      const attempted = cloneState(saveProject.mock.calls[1]![0]);
      expect(attempted.analysisRuns).toHaveLength(baseline.analysisRuns.length + 1);
      expect(JSON.stringify(opened.state)).toBe(original);

      const committed = await saveWorkspace(saveProject, 3);
      expect(committed.analysisRuns).toHaveLength(baseline.analysisRuns.length + 1);
      expect(committed.analysisRuns.map(({ id }) => id)).toEqual(
        attempted.analysisRuns.map(({ id }) => id),
      );
      expect(committed.analysisRuns.at(-1)!.result).toEqual(attempted.analysisRuns.at(-1)!.result);
      for (const key of historyKeys) {
        expect(committed[key].slice(0, baseline[key].length)).toEqual(baseline[key]);
      }
      const repeated = await saveWorkspace(saveProject, 4);
      for (const key of historyKeys) expect(repeated[key]).toEqual(committed[key]);
      expect(repeated.experimentWorkspace!.graphs).toEqual(committed.experimentWorkspace!.graphs);
      expectSharedSourceIdentity(repeated);
      expect(analysisRunner).toHaveBeenCalledTimes(1);
      expect(saveProject.mock.calls.map(([, destination]) => destination)).toEqual([
        target,
        target,
        target,
        target,
      ]);
      await waitFor(() => expect(dirty.mock.calls.at(-1)?.[0]).toBe(false));
    },
    15000,
  );

  it("retains a graph rename during an in-flight save and can return to the committed clean snapshot", async () => {
    let finish: ((project: OpenedProject) => void) | undefined;
    const successfulSave: SaveProjectAction = async (state, destination) => ({
      state: cloneState(state),
      target: destination!,
    });
    const saveProject = vi.fn<SaveProjectAction>(successfulSave);
    saveProject.mockImplementationOnce(successfulSave);
    saveProject.mockImplementationOnce(
      () =>
        new Promise<OpenedProject>((resolve) => {
          finish = resolve;
        }),
    );
    const dirty = vi.fn<(dirty: boolean) => void>();
    const { baseline, analysisRunner } = await mountNewExecution(saveProject, dirty);
    const originalName = baseline.experimentWorkspace!.graphs[0]!.displayName;
    const rename = (name: string) => {
      fireEvent.doubleClick(screen.getByRole("button", { name: originalName }));
      const input = screen.getByRole("textbox", { name: "グラフ名" });
      fireEvent.change(input, { target: { value: name } });
      fireEvent.keyDown(input, { key: "Enter" });
    };
    fireEvent.click(screen.getByRole("button", { name: "プロジェクトを保存" }));
    await waitFor(() => expect(saveProject).toHaveBeenCalledTimes(2));
    rename("Renamed during save");
    const submitted = cloneState(saveProject.mock.calls[1]![0]);
    expect(submitted.experimentWorkspace!.graphs[0]!.displayName).toBe(originalName);
    await act(async () => {
      finish!({ state: submitted, target });
    });
    await screen.findByText("プロジェクトを保存しました。次回もこの入力画面で再編集できます。");
    expect(screen.getByRole("button", { name: "Renamed during save" })).toBeVisible();
    await waitFor(() => expect(dirty.mock.calls.at(-1)?.[0]).toBe(true));

    // Undo this presentation edit back to the saved name. Canonical request
    // IDs alone must not leave a false dirty state behind.
    fireEvent.doubleClick(screen.getByRole("button", { name: "Renamed during save" }));
    const nameInput = screen.getByRole("textbox", { name: "グラフ名" });
    fireEvent.change(nameInput, { target: { value: originalName } });
    fireEvent.keyDown(nameInput, { key: "Enter" });
    await waitFor(() => expect(dirty.mock.calls.at(-1)?.[0]).toBe(false));
    rename("Renamed after commit");
    const renamed = await saveWorkspace(saveProject, 3);
    expect(renamed.experimentWorkspace!.graphs[0]!.displayName).toBe("Renamed after commit");
    for (const key of historyKeys) expect(renamed[key]).toEqual(submitted[key]);
    expectSharedSourceIdentity(renamed);
    expect(analysisRunner).toHaveBeenCalledTimes(1);
    await waitFor(() => expect(dirty.mock.calls.at(-1)?.[0]).toBe(false));
  }, 15000);
});

/// <reference types="node" />
/**
 * One continuous headless UI path with anonymous synthetic input and one real engine CLI call.
 * Real package IO, filesystem, and test-only SQLite adapters are exercised.
 * Native Rust codec/IPC/GUI, browser pixels, and crash recovery are NOT EXECUTED.
 * Copy this file to apps/ui/src/App.continuousPath.test.tsx in the isolated candidate.
 */
import { spawn } from "node:child_process";
import { mkdir, readFile, stat, writeFile } from "node:fs/promises";
import { dirname, join, resolve } from "node:path";
import { act, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { isTauri } from "@tauri-apps/api/core";
import {
  AnalysisEngineRequestSchema, AnalysisEngineResultSchema,
  type AnalysisEngineRequest, type AnalysisEngineResult,
} from "@lsaa/analysis-contracts";
import {
  openProjectPackage, openProjectStatePackage, saveProjectStatePackage,
  ProjectStateSchema, type ProjectPackageStorage, type ProjectState,
} from "@lsaa/project";
import { describe, expect, it, vi } from "vitest";

import App from "./App";
import type * as AnalysisClientModule from "./app/analysisClient";
import { assessDraftGraphAnalysis } from "./app/experimentDraftAnalysis";
import { rehydrateExperimentWorkspace } from "./app/experimentWorkspaceProject";
import type { ProjectActions } from "./app/projectActions";
import { setUsageConsent } from "./app/usageTelemetry";
import { createContinuousPathAdapters } from "./test/continuousPathAdapters";

const runner = vi.hoisted(() => vi.fn<(request: AnalysisEngineRequest) => Promise<AnalysisEngineResult>>());
vi.mock("./app/analysisClient", async (importOriginal) => ({
  ...await importOriginal<typeof AnalysisClientModule>(),
  defaultAnalysisRunner: runner,
}));

const historyKeys = [
  "rawRevisions", "designRevisions", "unitInstances", "observations", "analysisRuns",
  "graphs", "transformations", "derivedDatasetRevisions", "derivedValues", "provenanceEvents",
] as const;
const groups = [
  { sample: "S1", condition: "Control", values: [1, 3], mean: 2 },
  { sample: "S1", condition: "Drug", values: [4, 6, 8], mean: 6 },
  { sample: "S2", condition: "Control", values: [2, 6], mean: 4 },
  { sample: "S2", condition: "Drug", values: [8, 12, 16], mean: 12 },
  { sample: "S3", condition: "Control", values: [5], mean: 5 },
  { sample: "S3", condition: "Drug", values: [15, 20, 25], mean: 20 },
] as const;
const sourceRows = groups.flatMap((group) => group.values.map((value) =>
  ["Run-1", group.sample, group.condition, String(value)]));
const headers = ["Session", "Unit", "Condition", "Mean"];
const inputTsv = [headers, ...sourceRows].map((row) => row.join("\t")).join("\n");

function requiredEnvironment(name: string): string {
  const value = process.env[name];
  if (!value) throw new Error(`HARNESS_ENV_REQUIRED: ${name}`);
  return value;
}

function numericValues(request: AnalysisEngineRequest): number[] {
  return request.observations.map((observation) => {
    if (typeof observation.value !== "number" || !Number.isFinite(observation.value)) {
      throw new Error("FIXTURE_REQUIRES_FINITE_SCALAR_MEANS");
    }
    return observation.value;
  }).sort((first, second) => first - second);
}

function expectRequestFixture(requestInput: AnalysisEngineRequest, edited = false) {
  const request = AnalysisEngineRequestSchema.parse(requestInput);
  if (request.protocolVersion !== "0.1.0") throw new Error("FIXTURE_REQUIRES_PAIRED_PROTOCOL_0_1_0");
  expect(request, "fixture: actual UI assessment selects paired scalar analysis").toMatchObject({
    protocolVersion: "0.1.0", templateId: "D02", method: "paired_t",
    options: { alternative: "two_sided", confidenceLevel: 0.95, multiplicityMethod: null },
  });
  expect(request.contrastConditionIds).toHaveLength(2);
  expect(new Set(request.observations.map(({ conditionId }) => conditionId)),
    "fixture: request observations retain exactly the declared two-condition contrast")
    .toEqual(new Set(request.contrastConditionIds));
  expect(request.observations).toHaveLength(6);
  expect(numericValues(request)).toEqual(edited ? [2.5, 4, 5, 6, 12, 20] : [2, 4, 5, 6, 12, 20]);
  const pairIds = [...new Set(request.observations.map(({ pairId }) => pairId))];
  expect(pairIds).toHaveLength(3);
  expect(pairIds.every((id) => typeof id === "string" && id.length > 0)).toBe(true);
  for (const declaredConditionId of request.contrastConditionIds) {
    const observations = request.observations.filter(({ conditionId }) => conditionId === declaredConditionId);
    expect(observations, "fixture: biological n is three, not fourteen source rows").toHaveLength(3);
    expect(new Set(observations.map(({ experimentalUnitId }) => experimentalUnitId)).size).toBe(3);
  }
  const differences = pairIds.map((pairId) => {
    const pair = request.observations.filter((observation) => observation.pairId === pairId);
    expect(pair).toHaveLength(2);
    const control = pair.find(({ conditionId }) => conditionId === request.contrastConditionIds[0])!.value;
    const drug = pair.find(({ conditionId }) => conditionId === request.contrastConditionIds[1])!.value;
    if (typeof control !== "number" || typeof drug !== "number") throw new Error("FIXTURE_REQUIRES_NUMERIC_PAIRS");
    return drug - control;
  }).sort((first, second) => first - second);
  expect(differences).toEqual(edited ? [3.5, 8, 15] : [4, 8, 15]);
  return request;
}

function withoutBinding(request: AnalysisEngineRequest) {
  const { requestId: _requestId, projectId: _projectId, analysisId: _analysisId,
    observations: _observations, ...family } = request;
  return family;
}

function withoutStaleness<T extends { state: string; staleReason: unknown }>(record: T) {
  const { state: _state, staleReason: _staleReason, ...science } = record;
  return science;
}

function expectImportFixture(state: ProjectState) {
  const workspace = state.experimentWorkspace;
  if (!workspace) throw new Error("PRODUCT_REQUIRES_SAVED_EXPERIMENT_WORKSPACE");
  expect(workspace.dataOrigin, "fixture: actual import metadata is retained without test rewriting").toBe("research");
  expect(workspace.controlConditionId ?? null).toBeNull();
  expect(workspace.experimentSessions.map(({ label }) => label)).toEqual(["S1", "S2", "S3"]);
  expect(workspace.conditionAssignment.kind).toBe("matched");
  expect(workspace.conditions.map(({ label }) => label)).toEqual(["Control", "Drug"]);
  expect(workspace.importProvenance).toMatchObject({
    headers, sourceRows, duplicateDecision: "nested_observations", excludedRowNumbers: [],
    mapping: { sessionColumn: 0, unitColumn: 1, conditionColumn: 2, timeColumn: null, valueColumn: 3, dateColumn: null },
  });
  const active = state.observations.filter(({ rawRevisionId }) => rawRevisionId === state.activeRawRevisionId);
  expect(active, "fixture: all imported lower observations persist").toHaveLength(14);
  expect(new Set(active.map(({ unitInstanceId }) => unitInstanceId)).size).toBe(14);
  const units = new Map(state.unitInstances.map((unit) => [unit.id, unit]));
  expect(new Set(active.map(({ unitInstanceId }) => units.get(unitInstanceId)!.parentUnitId)).size).toBe(3);
}

function expectSavedScience(state: ProjectState, request: AnalysisEngineRequest, result: AnalysisEngineResult) {
  const liveRequest = expectRequestFixture(request);
  expectImportFixture(state);
  expect(state.rawRevisions).toHaveLength(1);
  expect(state.observations.every(({ sourceLocation }) => sourceLocation?.includes("#source="))).toBe(true);
  expect(state.analysisRuns, "product: actual completed source-backed analysis is saved once").toHaveLength(1);
  expect(state.transformations).toHaveLength(1);
  expect(state.derivedDatasetRevisions).toHaveLength(1);
  expect(state.derivedValues).toHaveLength(6);
  const run = state.analysisRuns[0]!;
  expect(run).toMatchObject({ state: "current", staleReason: null,
    inputRawRevisionId: state.activeRawRevisionId, inputDesignRevisionId: state.activeDesignRevisionId });
  expect(withoutBinding(run.request)).toEqual(withoutBinding(request));
  expect(run.request.projectId).toBe(state.metadata.projectId);
  expect(run.request.requestId).not.toBe(request.requestId);
  expect(run.result, "product: engine payload changes only at canonical request binding").toEqual({ ...result, requestId: run.request.requestId });
  const canonicalRequest = expectRequestFixture(run.request);
  expect(run.request.observations.every(({ pairId, experimentalUnitId }) => pairId === experimentalUnitId)).toBe(true);
  const activeDesign = state.designRevisions.find(({ id }) => id === state.activeDesignRevisionId)!.design;
  expect(activeDesign.experimentalUnitLevelId).toBe("unit-level.experimental-unit");
  const parents = state.unitInstances.filter(({ levelId }) => levelId === activeDesign.experimentalUnitLevelId);
  expect(parents).toHaveLength(3);
  expect(new Set(run.request.observations.map(({ experimentalUnitId }) => experimentalUnitId)))
    .toEqual(new Set(parents.map(({ id }) => id)));
  const units = new Map(state.unitInstances.map((unit) => [unit.id, unit]));
  const workspace = state.experimentWorkspace!;
  expect(liveRequest.contrastConditionIds).toEqual(workspace.conditions.map(({ id }) => id));
  expect(canonicalRequest.contrastConditionIds).toEqual(workspace.conditions.map(({ id }) => id));
  for (const value of state.derivedValues) {
    const parent = units.get(value.experimentalUnitId)!;
    const sample = workspace.experimentSessions.find(({ id }) => id === parent.metadata.experimentSessionId)!.label;
    const condition = workspace.conditions.find(({ id }) => id === value.conditionId)!.label;
    const expected = groups.find((group) => group.sample === sample && group.condition === condition);
    if (!expected) throw new Error("PRODUCT_MEAN_REQUIRES_DECLARED_COORDINATES");
    const sources = state.observations.filter((observation) => observation.conditionId === value.conditionId &&
      units.get(observation.unitInstanceId)!.parentUnitId === value.experimentalUnitId)
      .sort((first, second) => first.id.localeCompare(second.id));
    expect(value.value).toBe(expected.mean);
    expect(value.subsampleCount).toBe(expected.values.length);
    expect(value.sourceObservationIds).toEqual(sources.map(({ id }) => id));
    expect(value.sourceUnitIds).toEqual(sources.map(({ unitInstanceId }) => unitInstanceId));
    expect(sources.map(({ measurement }) => {
      if (measurement.kind !== "scalar") throw new Error("PRODUCT_SOURCE_REQUIRES_SCALAR");
      return measurement.value;
    }).sort((first, second) => first - second)).toEqual([...expected.values].sort((first, second) => first - second));
  }
  expect(state.derivedValues.reduce((sum, value) => sum + value.subsampleCount, 0)).toBe(14);
  expect(new Set(state.derivedValues.flatMap(({ sourceObservationIds }) => sourceObservationIds)))
    .toEqual(new Set(state.observations.map(({ id }) => id)));
  expect(state.experimentWorkspace!.graphs).toHaveLength(1);
  expect(state.experimentWorkspace!.graphs[0]!.analysisRunId).toBe(run.id);
  expect(state.experimentWorkspace!.graphs[0]!.graphType).toBe("paired_dot");
  expect(state.experimentWorkspace!.graphs[0]!.selectedConditionIds).toEqual(workspace.conditions.map(({ id }) => id));
}

function expectGraph() {
  const graph = screen.getByRole("img", { name: /実験単位ごとのグラフ/ });
  expect(graph.getAttribute("data-graph-shape")).toBe("nested_continuous");
  expect(graph.querySelectorAll('[data-graph-layer="unit-trajectory"]')).toHaveLength(3);
  const pointUnits = [...graph.querySelectorAll("[data-experiment-id]")]
    .map((node) => node.getAttribute("data-experiment-id"));
  expect(new Set(pointUnits).size, "product: rendered means retain three declared units").toBe(3);
  return graph;
}

async function callHeadlessEngine(executable: string, request: AnalysisEngineRequest): Promise<AnalysisEngineResult> {
  return new Promise((resolveResult, rejectResult) => {
    const child = spawn(executable, [], { cwd: dirname(executable), windowsHide: true, stdio: "pipe" });
    let stdout = "";
    let stderr = "";
    const timeout = setTimeout(() => {
      child.kill(); // This test owns only this headless CLI child; no GUI or unrelated process is touched.
      rejectResult(new Error("HARNESS_ENGINE_TIMEOUT_45000MS"));
    }, 45000);
    child.stdout.setEncoding("utf8");
    child.stderr.setEncoding("utf8");
    child.stdout.on("data", (chunk: string) => { stdout += chunk; });
    child.stderr.on("data", (chunk: string) => { stderr += chunk; });
    child.on("error", (error) => { clearTimeout(timeout); rejectResult(error); });
    child.on("close", (code) => {
      clearTimeout(timeout);
      if (code !== 0) { rejectResult(new Error(`HARNESS_ENGINE_EXIT_${code}: ${stderr}`)); return; }
      try { resolveResult(AnalysisEngineResultSchema.parse(JSON.parse(stdout))); }
      catch (error) { rejectResult(error); }
    });
    child.stdin.on("error", (error) => { clearTimeout(timeout); rejectResult(error); });
    child.stdin.end(`${JSON.stringify(request)}\n`);
  });
}

describe("continuous imported UI, real engine, physical package and reopened App", () => {
  it("preserves canonical history across disk reopen/no-op Save and a true raw edit without rerunning the engine", async () => {
    const outputRoot = resolve(requiredEnvironment("LSAA_INTEGRATION_OUTPUT_ROOT"));
    const candidateRoot = resolve(requiredEnvironment("LSAA_INTEGRATION_CANDIDATE_ROOT"));
    const executable = resolve(requiredEnvironment("LSAA_INTEGRATION_ENGINE_EXECUTABLE"));
    const pythonExecutable = requiredEnvironment("LSAA_INTEGRATION_PYTHON_EXECUTABLE");
    const containerHelperPath = resolve(requiredEnvironment("LSAA_INTEGRATION_CONTAINER_HELPER"));
    const target = join(outputRoot, "continuous-path.lsa");
    await mkdir(outputRoot, { recursive: true });
    const timeline: { stage: string; at: string; detail?: unknown }[] = [];
    const ioEvents: { operation: string; at: string; target: string; path?: string; bytes?: number }[] = [];
    let currentStage = "harness.setup";
    const record = async (stage: string, detail?: unknown) => {
      currentStage = stage;
      timeline.push({ stage, at: new Date().toISOString(), ...(detail === undefined ? {} : { detail }) });
      await writeFile(join(outputRoot, "timeline.json"), JSON.stringify(timeline, null, 2), "utf8");
    };
    const snapshot = async (name: string, state: ProjectState) => {
      await writeFile(join(outputRoot, `${name}.json`), JSON.stringify(state, null, 2), "utf8");
    };
    let mounted: ReturnType<typeof render> | undefined;
    let engineRequest: AnalysisEngineRequest | undefined;
    let engineResult: AnalysisEngineResult | undefined;
    const savedStates: ProjectState[] = [];
    const openedStates: ProjectState[] = [];
    try {
      await record("harness.setup", { engineExecutable: executable, target,
        ui: "actual App compatibility import in jsdom", engine: "real stdin JSON sidecar once",
        io: "real package API and filesystem, test-only inner/outer SQLite adapters",
        nativeRustCodecIPC_GUI: "NOT_EXECUTED", browserPixels: "NOT_EXECUTED" });
      await writeFile(join(outputRoot, "input.tsv"), inputTsv, "utf8");
      const adapters = await createContinuousPathAdapters({ outputRoot, candidateRoot, pythonExecutable, containerHelperPath });
      expect(isTauri(), "harness: native mode is never spoofed").toBe(false);
      const engineSha256 = await adapters.sha256(await readFile(executable));
      expect(engineSha256.toLowerCase(), "harness: the root-bound sidecar executable stays exact")
        .toBe("09161a439065945e7eaf7c908ca9c5f20e8d6a948b143afa92773d868f07e1a8");
      await record("harness.engine_file_binding_verified", { executable, sha256: engineSha256 });
      const storage: ProjectPackageStorage = {
        async readFile(fileTarget, path) {
          const bytes = await adapters.storage.readFile(fileTarget, path);
          ioEvents.push({ operation: "read", at: new Date().toISOString(), target: fileTarget, path, bytes: bytes.length });
          return bytes;
        },
        async beginAtomicWrite(fileTarget) {
          ioEvents.push({ operation: "begin", at: new Date().toISOString(), target: fileTarget });
          const transaction = await adapters.storage.beginAtomicWrite(fileTarget);
          return {
            async writeFile(path, bytes) {
              await transaction.writeFile(path, bytes);
              ioEvents.push({ operation: "write", at: new Date().toISOString(), target: fileTarget, path, bytes: bytes.length });
            },
            async commit() {
              await transaction.commit();
              ioEvents.push({ operation: "commit", at: new Date().toISOString(), target: fileTarget });
            },
            async rollback() {
              await transaction.rollback();
              ioEvents.push({ operation: "rollback", at: new Date().toISOString(), target: fileTarget });
            },
          };
        },
      };
      const io = { storage, databaseCodec: adapters.databaseCodec, sha256: adapters.sha256, target };
      const actions: ProjectActions = {
        async saveProject(inputState, existingTarget) {
          expect(existingTarget === undefined || existingTarget === target).toBe(true);
          const state = ProjectStateSchema.parse(inputState);
          await snapshot(`save-${savedStates.length + 1}-submitted`, state);
          const saved = await saveProjectStatePackage({ ...io, state, appVersion: "continuous-path-test",
            savedAt: new Date().toISOString() });
          savedStates.push(saved);
          await snapshot(`save-${savedStates.length}-persisted`, saved);
          return { state: saved, target };
        },
        async openProject() {
          const state = await openProjectStatePackage(io); // Always decode physical file, never savedStates/cache.
          openedStates.push(state);
          await snapshot(`open-${openedStates.length}`, state);
          return { state, target };
        },
      };
      runner.mockReset();
      runner.mockImplementation(async (actualRequest) => {
        if (runner.mock.calls.length !== 1) throw new Error("HARNESS_FORBIDS_A_SECOND_ENGINE_EXECUTION");
        engineRequest = expectRequestFixture(actualRequest);
        await writeFile(join(outputRoot, "engine-request.json"), JSON.stringify(engineRequest, null, 2), "utf8");
        await record("fixture.actual_runner_request_ready", { observations: 6, n: [3, 3], declaredPairs: 3 });
        engineResult = await callHeadlessEngine(executable, engineRequest);
        await writeFile(join(outputRoot, "engine-result.json"), JSON.stringify(engineResult, null, 2), "utf8");
        expect(engineResult).toMatchObject({ status: "ok", requestId: engineRequest.requestId, engine: { version: "0.14.0" } });
        await record("engine.real_cli_completed", { calls: 1, version: engineResult.engine.version });
        return engineResult;
      });
      localStorage.clear();
      setUsageConsent("opted_out");
      window.history.replaceState({}, "", "/?adaptiveInput=0");
      mounted = render(<App projectActions={actions} />);
      await record("ui.home");
      const newExperiment = document.querySelector('[data-primary-route="new-experiment"]');
      if (!newExperiment) throw new Error("FIXTURE_UI_REQUIRES_HOME_NEW_EXPERIMENT_ACTION");
      fireEvent.click(newExperiment);
      fireEvent.click(screen.getByRole("button", { name: /既存データを取り込む/ }));
      fireEvent.change(screen.getByRole("textbox", { name: "既存データの表" }), { target: { value: inputTsv } });
      expect(within(screen.getByRole("table", { name: "取込プレビュー" })).getAllByRole("row")).toHaveLength(Math.min(sourceRows.length, 8) + 1);
      for (const [name, value] of [["実験回／sessionの列", "0"], ["生物学的単位IDの列", "1"],
        ["条件の列", "2"], ["測定値の列", "3"]] as const) {
        fireEvent.change(screen.getByRole("combobox", { name }), { target: { value } });
      }
      fireEvent.change(screen.getByRole("textbox", { name: "取込測定項目名" }), { target: { value: "Signal" } });
      fireEvent.click(screen.getByRole("button", { name: "この割り当てで入力画面を作る" }));
      expect(screen.getByRole("region", { name: "重複した行の確認" })).toBeVisible();
      fireEvent.click(screen.getByRole("button", { name: "同じ単位内の複数の生測定として扱う" }));
      fireEvent.click(screen.getByRole("button", { name: "この割り当てで入力画面を作る" }));
      const structure = screen.getByRole("region", { name: "取り込む実験構造" });
      expect(within(structure).getByText(/同じ単位の反復：\s*あり/)).toBeVisible();
      fireEvent.click(screen.getByRole("button", { name: "この構造で取り込む" }));
      await screen.findByRole("heading", { name: "既存データから作成" });
      expect(screen.queryByRole("img", { name: /実験単位ごとのグラフ/ })).toBeNull();
      expect(runner).not.toHaveBeenCalled();
      await record("fixture.actual_import_ui_completed", { sourceRows: 14, explicitlyAssignedUnitColumn: 1 });
      fireEvent.click(screen.getByRole("button", { name: "＋ グラフを作成" }));
      const graphChoice = screen.getByRole("dialog", { name: "グラフの基本形を選ぶ" });
      fireEvent.click(within(graphChoice).getByRole("button", { name: /対応を線で結ぶを選択/ }));
      fireEvent.click(within(graphChoice).getByRole("button", { name: "このグラフを作成" }));
      expectGraph();
      await record("ui.actual_paired_graph_created");
      fireEvent.click(screen.getByRole("button", { name: "統計" }));
      expect(screen.getByText("推奨: 対応のあるt検定")).toBeVisible();
      fireEvent.click(screen.getByRole("checkbox", { name: /同じ実験単位の2条件/ }));
      expect(screen.getByRole("button", { name: "選択した解析を実行" })).toBeEnabled();
      fireEvent.click(screen.getByRole("button", { name: "選択した解析を実行" }));
      await screen.findByRole("group", { name: "統計解析結果" }, { timeout: 60000 });
      expect(runner).toHaveBeenCalledTimes(1);
      if (!engineRequest || !engineResult) throw new Error("HARNESS_REQUIRES_COMPLETED_ACTUAL_ENGINE_CALLBACK");
      await act(async () => { await Promise.resolve(); });
      await record("product.first_save");
      fireEvent.click(screen.getByRole("button", { name: "プロジェクトを保存" }));
      await waitFor(() => expect(savedStates).toHaveLength(1), { timeout: 20000 });
      await screen.findByText(/プロジェクトを保存しました/);
      const first = savedStates[0]!;
      expectSavedScience(first, engineRequest, engineResult);
      const firstWorkspace = rehydrateExperimentWorkspace(first)!;
      expect(Object.values(firstWorkspace.cells).reduce((sum, cell) => sum + (cell.kind === "nested_continuous" ? cell.rawValues.length : 0), 0)).toBe(14);
      const bytes = await readFile(target);
      expect(bytes.subarray(0, 16).toString("ascii")).toBe("SQLite format 3\0");
      expect((await stat(target)).isFile()).toBe(true);
      const firstPackage = await openProjectPackage(storage, target, adapters.sha256);
      expect(firstPackage.manifest.recovery.databasePath).toBe("project.sqlite");
      expect(Buffer.from(firstPackage.files["project.sqlite"]!).subarray(0, 16).toString("ascii")).toBe("SQLite format 3\0");
      await snapshot("first-file-decoded", await openProjectStatePackage(io));
      await record("product.physical_first_package_validated", { bytes: bytes.length, sha256: await adapters.sha256(bytes) });
      const remountAndOpen = async () => {
        mounted!.unmount();
        localStorage.clear();
        setUsageConsent("opted_out");
        window.history.replaceState({}, "", "/?adaptiveInput=0");
        mounted = render(<App projectActions={actions} />);
        const openAction = document.querySelector('[data-primary-route="open-project"]');
        if (!openAction) throw new Error("FIXTURE_UI_REQUIRES_HOME_OPEN_PROJECT_ACTION");
        const priorCount = openedStates.length;
        fireEvent.click(openAction);
        // App Home opens the real picker action through OpenProjectPage's autoOpen contract.
        await waitFor(() => expect(openedStates).toHaveLength(priorCount + 1), { timeout: 20000 });
        await screen.findByRole("heading", { name: "既存データから作成" });
        return openedStates[priorCount]!;
      };
      await record("product.unmount_and_new_app_disk_open");
      const reopened = await remountAndOpen();
      for (const key of historyKeys) expect(reopened[key], `product: disk decode preserves ${key}`).toEqual(first[key]);
      expect(rehydrateExperimentWorkspace(reopened)!.cells).toStrictEqual(firstWorkspace.cells);
      fireEvent.click(screen.getByRole("button", { name: /^グラフ \(1\)$/ }));
      expectGraph();
      fireEvent.click(screen.getByRole("button", { name: "データ" }));
      await act(async () => { await Promise.resolve(); });
      await record("product.reopened_noop_save");
      fireEvent.click(screen.getByRole("button", { name: "プロジェクトを保存" }));
      await waitFor(() => expect(savedStates).toHaveLength(2), { timeout: 20000 });
      await screen.findByText(/プロジェクトを保存しました/);
      const noOp = savedStates[1]!;
      for (const key of historyKeys) expect(noOp[key], `product: reopened no-op whole ${key}`).toEqual(first[key]);
      expect(noOp.activeRawRevisionId).toBe(first.activeRawRevisionId);
      expect(noOp.activeDesignRevisionId).toBe(first.activeDesignRevisionId);
      expect(runner).toHaveBeenCalledTimes(1);
      await record("product.true_raw_edit_ui");
      const tabs = screen.getByRole("tablist", { name: "実験タブ" });
      fireEvent.click(within(tabs).getByRole("tab", { name: "S1" }));
      fireEvent.click(screen.getByRole("button", { name: "Controlの生データを開く" }));
      const rawInput = screen.getByRole("textbox", { name: "生データ" });
      expect(rawInput).toHaveValue("1\n3");
      fireEvent.change(rawInput, { target: { value: "2\n3" } });
      await act(async () => { await Promise.resolve(); });
      fireEvent.click(screen.getByRole("button", { name: "プロジェクトを保存" }));
      await waitFor(() => expect(savedStates).toHaveLength(3), { timeout: 20000 });
      await screen.findByText(/プロジェクトを保存しました/);
      const edited = savedStates[2]!;
      expectImportFixture(edited);
      expect(edited.rawRevisions).toHaveLength(2);
      expect(edited.rawRevisions[0]).toEqual(first.rawRevisions[0]);
      expect(edited.activeRawRevisionId).not.toBe(first.activeRawRevisionId);
      expect(edited.designRevisions).toEqual(first.designRevisions);
      expect(edited.observations.slice(0, first.observations.length)).toEqual(first.observations);
      expect(edited.unitInstances.slice(0, first.unitInstances.length)).toEqual(first.unitInstances);
      expect(edited.provenanceEvents.slice(0, first.provenanceEvents.length)).toEqual(first.provenanceEvents);
      expect(edited.analysisRuns).toHaveLength(1);
      expect(edited.analysisRuns[0]!.state).toBe("stale");
      expect(typeof edited.analysisRuns[0]!.staleReason).toBe("string");
      expect(withoutStaleness(edited.analysisRuns[0]!)).toEqual(withoutStaleness(first.analysisRuns[0]!));
      expect(edited.transformations).toEqual(first.transformations);
      expect(edited.derivedValues).toEqual(first.derivedValues);
      expect(edited.derivedDatasetRevisions).toHaveLength(first.derivedDatasetRevisions.length);
      edited.derivedDatasetRevisions.forEach((revision, index) => {
        expect(revision.state).toBe("stale");
        expect(withoutStaleness(revision)).toEqual(withoutStaleness(first.derivedDatasetRevisions[index]!));
      });
      expect(edited.experimentWorkspace!.importProvenance).toEqual(first.experimentWorkspace!.importProvenance);
      const editedWorkspace = rehydrateExperimentWorkspace(edited)!;
      expect(editedWorkspace.graphs[0]!.analysis, "product: true raw edit invalidates live graph analysis").toBeNull();
      const changedKey = Object.keys(firstWorkspace.cells).find((key) => {
        const cell = firstWorkspace.cells[key];
        return cell?.kind === "nested_continuous" && JSON.stringify(cell.rawValues) === "[1,3]";
      });
      if (!changedKey) throw new Error("FIXTURE_REQUIRES_UNIQUE_S1_CONTROL_CELL");
      expect(editedWorkspace.cells[changedKey]).toMatchObject({ kind: "nested_continuous", rawValues: [2, 3], source: "paste" });
      for (const [key, cell] of Object.entries(firstWorkspace.cells)) {
        if (key !== changedKey) expect(editedWorkspace.cells[key], `product: unedited cell ${key}`).toStrictEqual(cell);
      }
      const assessment = assessDraftGraphAnalysis({ draft: editedWorkspace.draft, cells: editedWorkspace.cells,
        readoutId: editedWorkspace.draft.readouts[0]!.id,
        conditionIds: editedWorkspace.draft.conditions.map(({ id }) => id) });
      if (assessment.state !== "ready" || !assessment.request) throw new Error("PRODUCT_EDITED_DATA_REQUIRES_EXECUTABLE_ASSESSMENT");
      expect(assessment.nByCondition.map(({ n }) => n)).toEqual([3, 3]);
      expectRequestFixture(assessment.request, true);
      expect(runner).toHaveBeenCalledTimes(1);
      await record("product.new_app_reopen_edited_package");
      const final = await remountAndOpen();
      for (const key of historyKeys) expect(final[key], `product: edited disk history ${key}`).toEqual(edited[key]);
      expect(rehydrateExperimentWorkspace(final)!.cells).toStrictEqual(editedWorkspace.cells);
      expect(final.activeRawRevisionId).toBe(edited.activeRawRevisionId);
      expect(runner).toHaveBeenCalledTimes(1);
      const finalPackage = await openProjectPackage(storage, target, adapters.sha256);
      const finalBytes = await readFile(target);
      await writeFile(join(outputRoot, "manifest-final.json"), JSON.stringify(finalPackage.manifest, null, 2), "utf8");
      await snapshot("final-canonical-state", final);
      await record("complete", { engineCalls: 1, uiSaveCalls: 3, newAppOpenCalls: 2,
        rawRevisions: 2, analysisRuns: 1, retainedOldRunState: "stale" });
      await writeFile(join(outputRoot, "status.json"), JSON.stringify({ status: "passed", stage: currentStage,
        engineCalls: runner.mock.calls.length, target, bytes: finalBytes.length, sha256: await adapters.sha256(finalBytes),
        nativeRustCodecIPC_GUI: "NOT_EXECUTED", browserPixels: "NOT_EXECUTED",
        editedCellCurrentMetadataPreservation: "NOT_CLAIMED_EXISTING_UI_CELL_REPLACEMENT",
        explicitControlUI: "NOT_AVAILABLE_UNSPECIFIED_EXACT_PRESERVED", timeline, ioEvents,
      }, null, 2), "utf8");
    } catch (error) {
      await writeFile(join(outputRoot, "status.json"), JSON.stringify({ status: "failed", stage: currentStage,
        error: error instanceof Error ? { name: error.name, message: error.message, stack: error.stack } : String(error),
        engineCalls: runner.mock.calls.length, uiSaveCalls: savedStates.length, newAppOpenCalls: openedStates.length,
        nativeRustCodecIPC_GUI: "NOT_EXECUTED", browserPixels: "NOT_EXECUTED", timeline, ioEvents,
      }, null, 2), "utf8");
      throw error;
    } finally {
      mounted?.unmount();
      await writeFile(join(outputRoot, "package-io-log.json"), JSON.stringify(ioEvents, null, 2), "utf8");
    }
  }, 120000);
});

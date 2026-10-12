/**
 * Actual Workbench selection and execution callback, synthetic runner only.
 * No engine, disk package IO, native GUI, browser pixels, or build is executed.
 * Copy to apps/ui/src/components/graph/ExperimentGraphWorkbench.analysisScopeSelection.test.tsx.
 */
import { act, fireEvent, render, screen, waitFor } from "@testing-library/react";
import {
  AnalysisEngineRequestSchema, AnalysisEngineResultSchema, requireAnalysisRequestRecommendation,
  type AnalysisEngineRequest, type AnalysisEngineResult,
} from "@lsaa/analysis-contracts";
import { ProjectStateSchema, type ProjectState } from "@lsaa/project";
import { describe, expect, it, vi } from "vitest";

import type { AnalysisRunner } from "../../app/analysisClient";
import {
  createExperimentSetDraft, experimentCellKey,
  type ExperimentCellDraft, type ExperimentCellMap, type ExperimentSetDraft,
} from "../../app/experimentDraft";
import { assessDraftGraphAnalysis } from "../../app/experimentDraftAnalysis";
import {
  createExperimentWorkspaceProject, rehydrateExperimentWorkspace,
  type WorkspaceGraphState,
} from "../../app/experimentWorkspaceProject";
import { ExperimentGraphWorkbench } from "./ExperimentGraphWorkbench";

const savedAt = "2026-10-08T09:00:00.000Z";
const completedAt = "2026-10-08T08:59:00.000Z";
const historyKeys = [
  "rawRevisions", "designRevisions", "unitInstances", "observations", "analysisRuns",
  "graphs", "transformations", "derivedDatasetRevisions", "derivedValues", "provenanceEvents",
] as const;
type CallbackState = Omit<WorkspaceGraphState, "id" | "displayName">;

function fixture() {
  const base = createExperimentSetDraft("cell_culture", "proportion");
  const labels = ["Control", "Drug", "Reference"];
  const draft: ExperimentSetDraft = {
    ...base,
    name: "Synthetic independent proportion scope",
    dataOrigin: "synthetic_demo",
    conditions: labels.map((label, index) => ({
      id: `condition.scope.${index + 1}`, label,
      attributes: { "attribute.1": label },
      ...(index === 2 ? { role: "auxiliary_reference" as const } : {}),
    })),
    controlConditionId: "condition.scope.1",
    conditionAssignment: { kind: "independent", unitLabel: "dish" },
    experiments: base.experiments.map((experiment) => ({ ...experiment, date: "2026-10-08" })),
    time: { sampling: "none", unit: "h", points: [] },
  };
  const numerators = [[2, 4, 6], [8, 11, 15], [5, 7, 9]];
  const denominator = 25;
  const cells: Record<string, ExperimentCellDraft> = {};
  draft.experiments.forEach((experiment, unitIndex) => draft.conditions.forEach((condition, conditionIndex) => {
    cells[experimentCellKey({ experimentId: experiment.id, conditionId: condition.id,
      readoutId: draft.readouts[0]!.id })] = {
      kind: "proportion", positive: numerators[conditionIndex]![unitIndex]!, eligible: denominator,
    };
  }));
  expect(draft.experiments, "fixture: three independent units per condition are declared").toHaveLength(3);
  expect(Object.keys(cells), "fixture: all three displayed conditions contain three raw measurements").toHaveLength(9);
  expect(draft.adaptiveInput).toBeUndefined();
  const displayed = draft.conditions.map(({ id }) => id);
  const analyzed = displayed.slice(0, 2);
  const percentages = (conditionIndex: number) => numerators[conditionIndex]!.map((numerator) => numerator / denominator * 100);
  const assessment = assessDraftGraphAnalysis({ draft, cells, readoutId: draft.readouts[0]!.id, conditionIds: analyzed });
  if (assessment.state !== "ready" || !assessment.request) throw new Error("FIXTURE_SETUP_FAILED: declared two-condition scope must be executable");
  expect(assessment.nByCondition.map(({ n }) => n)).toEqual([3, 3]);
  const request = expectRequest(assessment.request, analyzed, percentages);
  const identity = { projectId: "project.analysis-scope-selection", createdAt: savedAt };
  const rawOnly = ProjectStateSchema.parse(createExperimentWorkspaceProject({
    draft, cells, graphs: [], now: savedAt, newProjectIdentity: identity,
  }));
  expect(rawOnly.observations, "fixture: canonical raw-only project is formally valid before product assertion").toHaveLength(9);
  expect(rawOnly.unitInstances).toHaveLength(9);
  expect(rawOnly.analysisRuns).toEqual([]);
  for (const conditionId of displayed) expect(rawOnly.observations.filter((observation) => observation.conditionId === conditionId)).toHaveLength(3);
  return { draft, cells: cells as ExperimentCellMap, displayed, analyzed, reference: displayed[2]!, percentages, request, identity, rawOnly };
}

function numericValues(request: AnalysisEngineRequest, conditionId: string): number[] {
  return request.observations.filter((observation) => observation.conditionId === conditionId).map(({ value }) => {
    if (typeof value !== "number" || !Number.isFinite(value)) throw new Error("FIXTURE_REQUIRES_FINITE_PERCENTAGES");
    return value;
  }).sort((first, second) => first - second);
}

function expectRequest(input: AnalysisEngineRequest, analyzed: readonly string[], percentages: (conditionIndex: number) => number[]) {
  const request = AnalysisEngineRequestSchema.parse(input);
  if (request.protocolVersion !== "0.1.0") throw new Error("FIXTURE_REQUIRES_TWO_CONDITION_PROTOCOL_0_1_0");
  expect(request).toMatchObject({ templateId: "D01", templateVersion: "0.1.0", method: "welch_t",
    options: { alternative: "two_sided", confidenceLevel: 0.95, multiplicityMethod: null } });
  expect(request.contrastConditionIds).toEqual(analyzed);
  expect(request.observations, "scope: actual two-condition request has six biological measurements").toHaveLength(6);
  expect(new Set(request.observations.map(({ conditionId }) => conditionId))).toEqual(new Set(analyzed));
  expect(new Set(request.observations.map(({ experimentalUnitId }) => experimentalUnitId)).size).toBe(6);
  expect(request.observations.every(({ pairId }) => pairId === undefined)).toBe(true);
  analyzed.forEach((conditionId, index) => {
    expect(request.observations.filter((observation) => observation.conditionId === conditionId)).toHaveLength(3);
    expect(numericValues(request, conditionId)).toEqual([...percentages(index)].sort((first, second) => first - second));
  });
  return request;
}

function syntheticResult(request: AnalysisEngineRequest): AnalysisEngineResult {
  return AnalysisEngineResultSchema.parse({
    protocolVersion: request.protocolVersion, requestId: request.requestId, status: "ok",
    engine: { name: "synthetic-scope-fixture", version: "fixture", packages: {} },
    estimates: [],
    tests: [{ name: "welch_two_sample_t_test", statisticName: "t", statistic: -3.2,
      degreesOfFreedom: [3.8], pValue: 0.02, adjustedPValue: null,
      effectSizeName: "hedges_g", effectSize: -1.5 }],
    diagnostics: [], warnings: [], completedAt,
  });
}

function requestFamily(request: AnalysisEngineRequest) {
  const { requestId: _requestId, projectId: _projectId, analysisId: _analysisId,
    observations: _observations, ...family } = request;
  return family;
}

describe("actual UI selection persists separate display and analysis scopes", () => {
  it("keeps three displayed conditions and all raw measurements while saving exactly the two explicitly selected analysis conditions", async () => {
    const context = fixture();
    const untouchedFixture = JSON.stringify({ draft: context.draft, cells: context.cells });
    const rawOnlyJson = JSON.stringify(context.rawOnly);
    const callback = vi.fn<(state: CallbackState) => void>();
    const runner = vi.fn<AnalysisRunner>(async (request) => {
      expectRequest(request, context.analyzed, context.percentages);
      return syntheticResult(request);
    });
    const current = () => {
      const state = callback.mock.calls.at(-1)?.[0];
      if (!state) throw new Error("FIXTURE_SETUP_FAILED: actual Workbench must emit its live state");
      return state;
    };
    const onClose = vi.fn();
    const workbench = (workspaceMode: "graph" | "statistics") => (
      <ExperimentGraphWorkbench draft={context.draft} cells={context.cells}
        onClose={onClose} onStateChange={callback} analysisRunner={runner} analysisAvailable
        workspaceMode={workspaceMode} />
    );
    const mounted = render(workbench("statistics"));
    try {
      await waitFor(() => expect(callback).toHaveBeenCalled());
      fireEvent.click(screen.getByText("解析対象・条件を変更"));
      const referenceToggle = screen.getByRole("checkbox", { name: "統計の条件：Reference" });
      expect(referenceToggle, "fixture: auxiliary reference starts outside analysis").not.toBeChecked();
      // Explicitly include then exclude the reference. The test does not rely only on the default role.
      fireEvent.click(referenceToggle);
      await waitFor(() => expect(current().analysisConditionIds).toEqual(context.displayed));
      expect(referenceToggle).toBeChecked();
      expect(current().selectedConditionIds).toEqual(context.displayed);
      fireEvent.click(referenceToggle);
      await waitFor(() => expect(current().analysisConditionIds).toEqual(context.analyzed));
      expect(referenceToggle, "trigger: the researcher explicitly excluded the reference from Statistics").not.toBeChecked();
      expect(current().selectedConditionIds).toEqual(context.displayed);
      expect(current().dataSets?.displaySet.conditionIds).toEqual(context.displayed);
      expect(current().dataSets?.analysisSet.conditionIds).toEqual(context.analyzed);
      expect(screen.getByText("推奨: Welchの2標本t検定")).toBeVisible();
      fireEvent.click(screen.getByRole("checkbox", { name: /各条件は別々のdish/ }));
      expect(screen.getByRole("button", { name: "選択した解析を実行" })).toBeEnabled();
      fireEvent.click(screen.getByRole("button", { name: "選択した解析を実行" }));
      await screen.findByRole("group", { name: "統計解析結果" });
      await waitFor(() => expect(current().analysis?.result.status).toBe("ok"));
      await act(async () => { await Promise.resolve(); });
      expect(runner).toHaveBeenCalledTimes(1);
      const liveRequest = expectRequest(runner.mock.calls[0]![0], context.analyzed, context.percentages);
      // Workspace navigation changes mode on the same mounted Workbench; it does not replace its state.
      mounted.rerender(workbench("graph"));
      const svg = await screen.findByRole("img", { name: /実験単位ごとのグラフ/ });
      expect(svg.querySelectorAll("[data-condition-index]"), "fixture: all three condition slots remain drawn").toHaveLength(3);
      await waitFor(() => expect(current().analysis?.request).toEqual(liveRequest));
      const live = current();
      expect(live.selectedConditionIds).toEqual(context.displayed);
      expect(live.analysisConditionIds).toEqual(context.analyzed);
      expect(live.analysis?.request).toEqual(liveRequest);
      expect(live.analysis?.request.observations.filter(({ conditionId }) => conditionId === context.reference)).toEqual([]);
      expect(live.analysis?.recommendation?.decision).toEqual({ kind: "accepted", selectedMethod: "welch_t" });
      const liveResult = AnalysisEngineResultSchema.parse(live.analysis!.result);
      const graph: WorkspaceGraphState = { id: "graph.scope", displayName: "Display three, analyze two", ...live };
      const liveGraphJson = JSON.stringify(graph);
      console.info("ANALYSIS_SCOPE_SELECTION_FIXTURE_GATE", JSON.stringify({
        originalRunnerObservationCount: liveRequest.observations.length,
        originalOutsideScopeCount: liveRequest.observations.filter(({ conditionId }) => !context.analyzed.includes(conditionId)).length,
        displayConditions: graph.selectedConditionIds.length, analysisConditions: graph.analysisConditionIds?.length,
        rawObservations: context.rawOnly.observations.length,
      }));

      // Product boundary starts here: the fixture, UI selection and actual runner callback are valid above.
      let created: ProjectState | undefined;
      expect(() => {
        created = createExperimentWorkspaceProject({ draft: context.draft, cells: context.cells, graphs: [graph],
          now: savedAt, newProjectIdentity: context.identity });
        const canonicalObservations = created.analysisRuns[0]?.request.observations ?? [];
        console.info("ANALYSIS_SCOPE_SELECTION_PRODUCT_DIAGNOSTIC", JSON.stringify({
          originalRunnerObservationCount: liveRequest.observations.length,
          canonicalSavedCount: canonicalObservations.length,
          canonicalOutsideScopeCount: canonicalObservations.filter(({ conditionId }) => !context.analyzed.includes(conditionId)).length,
          displayConditions: graph.selectedConditionIds.length, analysisConditions: graph.analysisConditionIds?.length,
          rawObservations: created.observations.length,
        }));
      }, "product: saving a valid display-three/analysis-two graph must succeed without rebuilding a different scientific request").not.toThrow();
      if (!created) throw new Error("PRODUCT_REQUIRES_CANONICAL_SAVED_STATE");
      const saved = ProjectStateSchema.parse(created);
      expect(saved.analysisRuns, "product: the actual completed request is persisted exactly once").toHaveLength(1);
      const run = saved.analysisRuns[0]!;
      const canonicalRequest = expectRequest(run.request, context.analyzed, context.percentages);
      expect(canonicalRequest.observations.filter(({ conditionId }) => conditionId === context.reference),
        "product: reference raw is display material and never enters the saved analysis").toEqual([]);
      expect(requestFamily(canonicalRequest), "product: options, method and contrast family remain exact")
        .toEqual(requestFamily(liveRequest));
      expect(run.result, "product: only result.requestId changes when the request receives canonical IDs")
        .toEqual({ ...liveResult, requestId: canonicalRequest.requestId });
      expect(run).toMatchObject({ state: "current", staleReason: null,
        inputRawRevisionId: saved.activeRawRevisionId, inputDesignRevisionId: saved.activeDesignRevisionId });
      expect(canonicalRequest.projectId).toBe(saved.metadata.projectId);
      expect(canonicalRequest.requestId).not.toBe(liveRequest.requestId);
      for (const key of ["rawRevisions", "designRevisions", "unitInstances", "observations"] as const) {
        expect(saved[key], `product: all raw-only canonical ${key} are preserved`).toEqual(context.rawOnly[key]);
      }
      expect(saved.observations).toHaveLength(9);
      expect(saved.observations.filter(({ conditionId }) => conditionId === context.reference)).toHaveLength(3);
      expect(saved.derivedValues).toEqual([]);
      const selectedRaw = saved.observations.filter(({ conditionId }) => context.analyzed.includes(conditionId));
      expect(new Set(canonicalRequest.observations.map(({ observationId }) => observationId)))
        .toEqual(new Set(selectedRaw.map(({ id }) => id)));
      expect(new Set(canonicalRequest.observations.map(({ experimentalUnitId }) => experimentalUnitId)))
        .toEqual(new Set(selectedRaw.map(({ unitInstanceId }) => unitInstanceId)));
      for (const observation of canonicalRequest.observations) {
        const raw = selectedRaw.find(({ id }) => id === observation.observationId)!;
        expect(observation.experimentalUnitId).toBe(raw.unitInstanceId);
        expect(observation.conditionId).toBe(raw.conditionId);
        if (raw.measurement.kind !== "proportion") throw new Error("PRODUCT_REQUIRES_ORIGINAL_COUNT_MEASUREMENTS");
        expect(observation.value).toBe(raw.measurement.numerator / raw.measurement.denominator * 100);
      }
      const design = saved.designRevisions.find(({ id }) => id === saved.activeDesignRevisionId)!.design;
      expect(design.conditions.map(({ id }) => id)).toEqual(context.displayed);
      expect(design.primaryContrast?.conditionIds).toEqual(context.analyzed);
      expect(run.recommendation).toEqual({
        ...requireAnalysisRequestRecommendation(design, liveRequest,
          { outcomeId: context.draft.readouts[0]!.id }),
        decision: live.analysis!.recommendation!.decision,
      });
      expect(saved.experimentWorkspace!.controlConditionId).toBe(context.draft.controlConditionId);
      expect(saved.experimentWorkspace!.conditions).toEqual(context.draft.conditions);
      expect(saved.graphs).toHaveLength(1);
      expect(saved.graphs[0]!.spec.dataSets).toEqual(graph.dataSets);
      expect(saved.graphs[0]!.spec.dataSets.displaySet.conditionIds).toEqual(context.displayed);
      expect(saved.graphs[0]!.spec.dataSets.analysisSet.conditionIds).toEqual(context.analyzed);
      saved.graphs[0]!.spec.dataSets.comparisonSet.forEach(({ conditionIds }) => {
        expect(conditionIds.every((conditionId) => context.analyzed.includes(conditionId))).toBe(true);
      });
      expect(saved.graphs[0]!.spec.analysisResultId).toBe(canonicalRequest.requestId);
      expect(saved.experimentWorkspace!.graphs[0]!).toMatchObject({
        selectedConditionIds: context.displayed, analysisConditionIds: context.analyzed, analysisRunId: run.id,
      });
      expect(JSON.stringify({ draft: context.draft, cells: context.cells })).toBe(untouchedFixture);
      expect(JSON.stringify(context.rawOnly)).toBe(rawOnlyJson);
      expect(JSON.stringify(graph)).toBe(liveGraphJson);

      const decoded = ProjectStateSchema.parse(JSON.parse(JSON.stringify(saved)));
      const reopened = rehydrateExperimentWorkspace(decoded);
      if (!reopened) throw new Error("PRODUCT_REQUIRES_REOPENED_WORKSPACE");
      expect(reopened.cells).toStrictEqual(context.cells);
      expect(reopened.draft.controlConditionId).toBe(context.draft.controlConditionId);
      expect(reopened.graphs[0]!).toMatchObject({ selectedConditionIds: context.displayed,
        analysisConditionIds: context.analyzed, analysisRunId: run.id,
        analysis: { request: canonicalRequest, result: run.result } });
      expect(reopened.graphs[0]!.dataSets).toEqual(graph.dataSets);
      const noOp = ProjectStateSchema.parse(createExperimentWorkspaceProject({
        draft: reopened.draft, cells: reopened.cells, graphs: reopened.graphs,
        existingState: decoded, now: "2026-10-08T09:01:00.000Z",
      }));
      for (const key of historyKeys) expect(noOp[key], `product: reopened no-op whole ${key}`).toEqual(saved[key]);
      expect(noOp.activeRawRevisionId).toBe(saved.activeRawRevisionId);
      expect(noOp.activeDesignRevisionId).toBe(saved.activeDesignRevisionId);
      expect(runner).toHaveBeenCalledTimes(1);
    } finally {
      mounted.unmount();
    }
  }, 20000);
});

it("renders completed TOST with actual evidence and persists its selected scope in a three-condition workspace", async () => {
 const base=createExperimentSetDraft("cell_culture","nested_continuous");
 const draft:ExperimentSetDraft={...base,name:"Anonymous TOST regression",dataOrigin:"synthetic_demo",conditions:["Control","A","B"].map((label,i)=>({id:"tost.c"+i,label,attributes:{"attribute.1":label}})),conditionAssignment:{kind:"independent",unitLabel:"dish"},controlConditionId:"tost.c0",time:{sampling:"none",unit:"h",points:[]}};
 const cells:Record<string,ExperimentCellDraft>={};draft.experiments.forEach((e,i)=>draft.conditions.forEach((c,j)=>{cells[experimentCellKey({experimentId:e.id,conditionId:c.id,readoutId:draft.readouts[0]!.id})]={kind:"nested_continuous",rawValues:[1+i*.1+j*.05],source:"manual"};}));
 const runner=vi.fn<AnalysisRunner>(async r=>AnalysisEngineResultSchema.parse({protocolVersion:r.protocolVersion,requestId:r.requestId,status:"ok",engine:{name:"fixture",version:"0.15.1",packages:{}},estimates:[{name:"mean_difference",value:-.05,standardError:.02,confidenceInterval:{level:.9,lower:-.1,upper:0}}],tests:[{name:"welch_tost",statisticName:"t",statistic:3,degreesOfFreedom:[4],pValue:.002,adjustedPValue:null,effectSizeName:null,effectSize:null}],equivalence:{resultVersion:"0.1.0",plan:r.protocolVersion==="0.15.0"?r.equivalencePlan:null,comparisons:[{comparisonId:"equivalence:tost.c0:tost.c1",estimate:-.05,standardError:.02,lowerConfidenceBound:-.1,upperConfidenceBound:0,confidenceLevel:.9,lowerOneSidedPValue:.001,upperOneSidedPValue:.002,tostPValue:.002,conclusion:"equivalence_supported"}]},diagnostics:[],warnings:[],completedAt}));
 let saved:ProjectState|undefined;const callback=vi.fn<(s:CallbackState)=>void>(s=>{if(s.analysis) saved=createExperimentWorkspaceProject({draft,cells,graphs:[{id:"tost.graph",displayName:"TOST",...s}],now:savedAt});});
 render(<ExperimentGraphWorkbench draft={draft} cells={cells} onClose={()=>{}} onStateChange={callback} analysisRunner={runner} analysisAvailable workspaceMode="statistics" />);
 fireEvent.click(screen.getByText("解析対象・条件を変更"));fireEvent.click(screen.getByRole("checkbox",{name:"統計の条件：B"}));
 fireEvent.click(screen.getByRole("radio",{name:"実質的に同等か調べる"}));
 fireEvent.change(screen.getByRole("spinbutton",{name:"下限"}),{target:{value:"-2"}});fireEvent.change(screen.getByRole("spinbutton",{name:"上限"}),{target:{value:"2"}});
 fireEvent.click(screen.getByRole("checkbox",{name:/この許容範囲は観測結果から/}));
 const independent=screen.queryByRole("checkbox",{name:/条件間で実験単位が独立/});if(independent)fireEvent.click(independent);
 fireEvent.click(screen.getByRole("button",{name:"Welch TOSTを実行"}));
 await screen.findByRole("heading",{name:"同等性解析"});
 await waitFor(()=>expect(saved?.analysisRuns[0]?.request.method).toBe("welch_tost"));
 expect(saved?.analysisRuns[0]?.request.observations).toHaveLength(6);expect(saved?.observations).toHaveLength(9);expect(runner).toHaveBeenCalledTimes(1);
});

import { ProjectStateSchema, type ProjectState } from "@lsaa/project";
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { createElement } from "react";
import { afterEach, describe, expect, it, vi } from "vitest";

import { ExperimentWorkspace } from "../pages/ExperimentWorkspace";
import type { AnalysisRunner } from "./analysisClient";
import type { ExperimentCellMap, ExperimentSetDraft } from "./experimentDraft";
import { assessDraftGraphAnalysis } from "./experimentDraftAnalysis";
import { rehydrateExperimentWorkspace } from "./experimentWorkspaceProject";
import type { SaveProjectAction } from "./projectActions";
import { createPairedTwoConditionFixture } from "./syntheticFixtures";
import { setUsageConsent } from "./usageTelemetry";
import type { RegisterWorkspaceSaveHandler } from "./workspaceLifecycle";

const target = "C:/synthetic-acceptance/fresh-legacy-noop.lsa";
const historyKeys = [
  "rawRevisions", "designRevisions", "unitInstances", "observations", "analysisRuns",
  "graphs", "transformations", "derivedDatasetRevisions", "derivedValues", "provenanceEvents",
] as const;
const cloneState = (state: ProjectState) => ProjectStateSchema.parse(JSON.parse(JSON.stringify(state)));

function actualPairedAssessment(draft: ExperimentSetDraft, cells: ExperimentCellMap) {
  const assessment = assessDraftGraphAnalysis({
    draft, cells, readoutId: draft.readouts[0]!.id,
    conditionIds: draft.conditions.map(({ id }) => id),
  });
  if (assessment.state !== "ready" || !assessment.request) {
    throw new Error("FIXTURE_SETUP_FAILED: the formal four-individual paired fixture must be executable");
  }
  expect(assessment.nByCondition.map(({ n }) => n), "fixture: biological n for each condition").toEqual([4, 4]);
  expect(assessment.request).toMatchObject({
    protocolVersion: "0.1.0", templateId: "D02", method: "paired_t",
    contrastConditionIds: draft.conditions.map(({ id }) => id),
    options: { alternative: "two_sided", confidenceLevel: 0.95, multiplicityMethod: null },
  });
  expect(assessment.request.observations).toHaveLength(8);
  const values = assessment.request.observations.map(({ value }) => {
    if (typeof value !== "number" || !Number.isFinite(value)) {
      throw new Error("FIXTURE_REQUIRES_FINITE_COUNT_PERCENTAGES");
    }
    return value;
  }).sort((first, second) => first - second);
  expect(values, "fixture: actual request uses all eight unchanged typed counts").toEqual(
    [28, 34, 31, 37, 42, 39, 49, 45].map((value) => (value / 100) * 100)
      .sort((first, second) => first - second),
  );
  const pairs = new Set(assessment.request.observations.map(({ pairId }) => pairId));
  expect(pairs.size).toBe(4);
  for (const pairId of pairs) {
    expect(typeof pairId).toBe("string");
    const observations = assessment.request.observations.filter((observation) => observation.pairId === pairId);
    expect(observations).toHaveLength(2);
    expect(new Set(observations.map(({ conditionId }) => conditionId)).size).toBe(2);
  }
  return assessment.request;
}

function expectCanonicalCounts(state: ProjectState, draft: ExperimentSetDraft) {
  expect(state.unitInstances).toHaveLength(4);
  expect(state.observations).toHaveLength(8);
  const activeObservations = state.observations.filter(({ rawRevisionId }) => rawRevisionId === state.activeRawRevisionId);
  expect(activeObservations).toHaveLength(8);
  const unitsById = new Map(state.unitInstances.map((unit) => [unit.id, unit]));
  for (const experiment of draft.experiments) {
    const unit = state.unitInstances.find(({ metadata }) => metadata.stableUnitId === experiment.stableUnitId);
    if (!unit) throw new Error("PRODUCT_CANONICAL_UNIT_MUST_PRESERVE_EXPLICIT_INDIVIDUAL_IDENTITY");
    expect(unit.metadata).toMatchObject({
      experimentSessionId: experiment.id, sessionId: experiment.sessionId,
      stableUnitId: experiment.stableUnitId, conditionAssignment: "matched",
    });
    const paired = activeObservations.filter(({ unitInstanceId }) => unitInstanceId === unit.id);
    expect(paired).toHaveLength(2);
    expect(new Set(paired.map(({ conditionId }) => conditionId)))
      .toEqual(new Set(draft.conditions.map(({ id }) => id)));
  }
  expect(activeObservations.every(({ unitInstanceId }) => unitsById.has(unitInstanceId))).toBe(true);
  expect(activeObservations.map(({ measurement }) => measurement)).toEqual(
    [28, 42, 34, 39, 31, 49, 37, 45].map((numerator) => ({ kind: "proportion", numerator, denominator: 100 })),
  );
  expect(state.experimentWorkspace!.controlConditionId).toBe(draft.controlConditionId);
  expect(state.experimentWorkspace!.conditionAssignment).toEqual(draft.conditionAssignment);
  expect(state.analysisRuns).toEqual([]);
  expect(state.graphs).toEqual([]);
}

async function saveThroughUi(saveProject: ReturnType<typeof vi.fn<SaveProjectAction>>, count: number) {
  fireEvent.click(screen.getByRole("button", { name: "プロジェクトを保存" }));
  await waitFor(() => expect(saveProject, "fixture: actual UI Save reaches the canonical save bridge")
    .toHaveBeenCalledTimes(count));
  await screen.findByText("プロジェクトを保存しました。次回もこの入力画面で再編集できます。");
  await waitFor(() => expect(screen.getByRole("button", { name: "プロジェクトを保存" })).toBeEnabled());
  return cloneState(saveProject.mock.calls[count - 1]![0]);
}

describe("fresh legacy workspace no-op Save", () => {
  afterEach(cleanup);

  it("keeps all canonical history after the first real UI Save when the fresh legacy draft is saved again without edits", async () => {
    localStorage.clear();
    setUsageConsent("opted_out");
    window.history.replaceState({}, "", "/");
    const fixture = createPairedTwoConditionFixture();
    // Use the formal fresh legacy fixture's naturally absent optional properties.
    // Saving supplies defaults; the caller does not strip or manufacture any keys.
    expect(fixture.draft.adaptiveInput).toBeUndefined();
    for (const key of ["comparisons", "importProvenance", "entrySourceHistory"] as const) {
      expect(Object.prototype.hasOwnProperty.call(fixture.draft, key),
        `fixture: ${key} is naturally absent in the fresh draft`).toBe(false);
    }
    const draft: ExperimentSetDraft = { ...fixture.draft, controlConditionId: fixture.draft.conditions[0]!.id };
    const fixtureJson = JSON.stringify({ draft, cells: fixture.cells });
    const originalRequest = actualPairedAssessment(draft, fixture.cells);
    const analysisRunner = vi.fn<AnalysisRunner>(async () => {
      throw new Error("NO_ENGINE_EXECUTION_EXPECTED");
    });
    const saveProject = vi.fn<SaveProjectAction>(async (state) => ({ state: cloneState(state), target }));
    const registerSaveHandler = vi.fn<RegisterWorkspaceSaveHandler>();
    // Start directly from the new draft and cells, with no saved project or plotted graph.
    render(createElement(ExperimentWorkspace, {
      initialDraft: draft, initialCells: fixture.cells, onBack: () => undefined,
      saveProject, analysisAvailable: false, analysisRunner,
      onRegisterSaveHandler: registerSaveHandler,
    }));
    const first = await saveThroughUi(saveProject, 1);
    expect(first.rawRevisions, "fixture: successful first Save has one canonical raw revision").toHaveLength(1);
    expect(first.designRevisions).toHaveLength(1);
    expectCanonicalCounts(first, draft);
    expect(saveProject.mock.calls[0]![1], "fixture: fresh Save has no existing destination").toBeUndefined();
    const firstJson = JSON.stringify(first);

    const second = await saveThroughUi(saveProject, 2);
    // The fixture and first save succeed before this product-only no-op boundary.
    for (const key of historyKeys) {
      expect(second[key], `product-noop: the unedited second UI Save preserves the entire ${key}`).toEqual(first[key]);
    }
    expect(second.activeRawRevisionId).toBe(first.activeRawRevisionId);
    expect(second.activeDesignRevisionId).toBe(first.activeDesignRevisionId);
    expect(second.metadata.projectId).toBe(first.metadata.projectId);
    expect(second.metadata.createdAt).toBe(first.metadata.createdAt);
    expect(second.experimentWorkspace).toEqual(first.experimentWorkspace);
    expectCanonicalCounts(second, draft);
    expect(saveProject.mock.calls[1]![1], "product-noop: successful first Save retains its destination").toBe(target);
    const reopened = rehydrateExperimentWorkspace(second);
    if (!reopened) throw new Error("PRODUCT_SAVED_WORKSPACE_MUST_REOPEN");
    expect(actualPairedAssessment(reopened.draft, reopened.cells),
      "product-noop: analysis family, options, condition and individual coordinates remain exact")
      .toEqual(originalRequest);

    const registration = registerSaveHandler.mock.calls.at(-1)?.[0];
    if (!registration || typeof registration === "function" || !registration.checkpoint) {
      throw new Error("PRODUCT_UI_MUST_REGISTER_ITS_CURRENT_PROJECT_CHECKPOINT");
    }
    const checkpoint = registration.checkpoint();
    if (!checkpoint || checkpoint.kind !== "experiment") {
      throw new Error("PRODUCT_CHECKPOINT_MUST_CONTAIN_THE_CURRENT_EXPERIMENT_PROJECT");
    }
    const currentState = ProjectStateSchema.parse(checkpoint.project.state);
    for (const key of historyKeys) {
      expect(currentState[key], `product-noop: current workspace preserves the same ${key}`).toEqual(second[key]);
    }
    expect(currentState.activeRawRevisionId).toBe(second.activeRawRevisionId);
    expect(currentState.activeDesignRevisionId).toBe(second.activeDesignRevisionId);
    expectCanonicalCounts(currentState, draft);
    expect(checkpoint.project.target).toBe(target);
    expect(analysisRunner).not.toHaveBeenCalled();
    expect(JSON.stringify(first)).toBe(firstJson);
    expect(JSON.stringify({ draft, cells: fixture.cells })).toBe(fixtureJson);
  }, 15000);
});

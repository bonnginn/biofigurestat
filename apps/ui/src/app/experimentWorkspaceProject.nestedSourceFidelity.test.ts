import type { AnalysisEngineRequest } from "@lsaa/analysis-contracts";
import { ProjectStateSchema, type ProjectState } from "@lsaa/project";
import { describe, expect, it } from "vitest";

import {
  experimentCellKey, type ExperimentCellMap, type ExperimentSetDraft, type NestedContinuousCellDraft,
} from "./experimentDraft";
import { assessDraftGraphAnalysis } from "./experimentDraftAnalysis";
import { createExperimentWorkspaceProject, rehydrateExperimentWorkspace } from "./experimentWorkspaceProject";
import { createSimpleIndependentContinuousFixture } from "./syntheticFixtures";

const firstTime = "2026-10-08T00:00:00.000Z";
const noopTime = "2026-10-08T01:00:00.000Z";
const editTime = "2026-10-08T02:00:00.000Z";
const historyKeys = [
  "rawRevisions", "designRevisions", "unitInstances", "observations", "analysisRuns",
  "graphs", "transformations", "derivedDatasetRevisions", "derivedValues", "provenanceEvents",
] as const;

function nestedCell(cell: ExperimentCellMap[string]): NestedContinuousCellDraft {
  if (cell.kind !== "nested_continuous" || cell.rawValues.length === 0 || !cell.rawValues.every(Number.isFinite)) {
    throw new Error("FIXTURE_SETUP_FAILED: only nonempty finite legacy continuous cells are in scope");
  }
  return cell;
}

function sourceFixture() {
  // The existing fixture constructs a formal legacy draft directly.
  const base = createSimpleIndependentContinuousFixture();
  expect(base.draft.adaptiveInput).toBeUndefined();
  const draft: ExperimentSetDraft = { ...base.draft, controlConditionId: base.draft.conditions[0]!.id };
  const entries = Object.entries(base.cells);
  const cells: ExperimentCellMap = Object.fromEntries(entries.map(([key, value], index) => {
    const cell = nestedCell(value);
    if (index === 0) return [key, {
      ...cell, rawValues: [cell.rawValues[0]!, cell.rawValues[0]! + 2], source: "manual",
      sourceLocations: ["", "image-2"], observationUnitIds: ["ROI-Control-1", "ROI-Control-2"],
      availability: undefined,
    } satisfies NestedContinuousCellDraft];
    if (index === 1) return [key, {
      ...cell, source: "paste", sourceLocations: undefined, observationUnitIds: ["ROI-Treatment-A-1"],
    } satisfies NestedContinuousCellDraft];
    if (index === 2) return [key, {
      ...cell, source: "manual", sourceLocations: ["image-3"], observationUnitIds: undefined,
    } satisfies NestedContinuousCellDraft];
    return [key, { ...cell, source: index % 2 === 0 ? "manual" : "paste" } satisfies NestedContinuousCellDraft];
  }));
  expect(Object.keys(cells)).toHaveLength(9);
  expect(Object.values(cells).map(nestedCell).reduce((total, cell) => total + cell.rawValues.length, 0)).toBe(10);
  expect(new Set(Object.values(cells).map((cell) => nestedCell(cell).source))).toEqual(new Set(["manual", "paste"]));
  return { draft, cells, manualKey: entries[0]![0], undefinedLocationsKey: entries[1]![0], undefinedIdsKey: entries[2]![0] };
}

function numericValues(request: AnalysisEngineRequest) {
  return request.observations.map(({ value }) => {
    if (typeof value !== "number" || !Number.isFinite(value)) {
      throw new Error("FIXTURE_REQUIRES_FINITE_UNIT_MEANS");
    }
    return value;
  }).sort((first, second) => first - second);
}

function actualAssessment(draft: ExperimentSetDraft, cells: ExperimentCellMap) {
  const assessment = assessDraftGraphAnalysis({
    draft, cells, readoutId: draft.readouts[0]!.id,
    conditionIds: draft.conditions.map(({ id }) => id),
  });
  if (assessment.state !== "ready" || !assessment.request) {
    throw new Error("FIXTURE_SETUP_FAILED: the formal independent nested fixture must be executable");
  }
  expect(assessment.nByCondition.map(({ n }) => n), "fixture: ROI count does not replace biological n").toEqual([3, 3, 3]);
  expect(assessment.request.templateId).toBe("D03");
  expect(assessment.request.observations).toHaveLength(9);
  expect(new Set(assessment.request.observations.map(({ experimentalUnitId }) => experimentalUnitId)).size).toBe(9);
  const expectedMeans = Object.values(cells).map(nestedCell)
    .map(({ rawValues }) => rawValues.reduce((total, value) => total + value, 0) / rawValues.length)
    .sort((first, second) => first - second);
  expect(numericValues(assessment.request), "fixture: actual request contains each current cell's mean").toEqual(expectedMeans);
  return assessment.request;
}

function reopen(state: ProjectState) {
  const savedFileState = ProjectStateSchema.parse(JSON.parse(JSON.stringify(state)));
  const reopened = rehydrateExperimentWorkspace(savedFileState);
  if (!reopened) throw new Error("PRODUCT_SAVED_LEGACY_WORKSPACE_MUST_REOPEN");
  return reopened;
}

function expectCurrentCanonicalRecords(state: ProjectState, draft: ExperimentSetDraft, cells: ExperimentCellMap, revisionIndex: number) {
  const active = state.observations.filter(({ rawRevisionId }) => rawRevisionId === state.activeRawRevisionId);
  expect(active).toHaveLength(10);
  const parents = state.unitInstances.filter(({ levelId, id }) =>
    levelId === "unit-level.experimental-unit" && id.endsWith(`.r${revisionIndex}`));
  expect(parents).toHaveLength(9);
  let observationIndex = 0;
  for (const experiment of draft.experiments) {
    for (const condition of draft.conditions) {
      const key = experimentCellKey({ experimentId: experiment.id, conditionId: condition.id, readoutId: draft.readouts[0]!.id });
      const cell = nestedCell(cells[key]!);
      const parentId = `unit.${experiment.stableUnitId ?? experiment.id}.${condition.id}.r${revisionIndex}`;
      const parent = parents.find(({ id }) => id === parentId);
      expect(parent, "canonical biological unit IDs keep their established spelling").toBeDefined();
      expect(parent!.metadata).toMatchObject({ experimentSessionId: experiment.id, conditionId: condition.id });
      cell.rawValues.forEach((value, valueIndex) => {
        const id = `observation.${++observationIndex}.r${revisionIndex}`;
        const childId = `${parentId}.observation.${condition.id}.${draft.readouts[0]!.id}.none.${valueIndex + 1}`;
        const observation = active.find((candidate) => candidate.id === id);
        expect(observation, "canonical observation IDs remain positional, independent of supplied UI child labels")
          .toMatchObject({ unitInstanceId: childId, conditionId: condition.id,
            outcomeId: draft.readouts[0]!.id, measurement: { kind: "scalar", value } });
        expect(state.unitInstances.find((unit) => unit.id === childId))
          .toMatchObject({ levelId: "unit-level.observation", parentUnitId: parentId });
      });
    }
  }
  expect(observationIndex).toBe(10);
  expect(state.analysisRuns).toEqual([]);
  expect(state.graphs).toEqual([]);
  expect(state.transformations).toEqual([]);
  expect(state.derivedDatasetRevisions).toEqual([]);
  expect(state.derivedValues).toEqual([]);
}

describe("nonempty legacy nested cell source fidelity", () => {
  it("round-trips manual/paste source, positional source locations and explicit UI child identities while preserving raw history", () => {
    const fixture = sourceFixture();
    const originalRequest = actualAssessment(fixture.draft, fixture.cells);
    const originalCells = fixture.cells;
    const originalValues = Object.values(originalCells).flatMap((cell) => nestedCell(cell).rawValues);
    const first = ProjectStateSchema.parse(createExperimentWorkspaceProject({
      draft: fixture.draft, cells: originalCells, graphs: [], now: firstTime,
    }));
    expect(first.rawRevisions, "fixture: formally valid initial canonical save").toHaveLength(1);
    expect(first.observations).toHaveLength(10);
    expect(first.unitInstances).toHaveLength(19);
    expectCurrentCanonicalRecords(first, fixture.draft, originalCells, 1);
    const firstJson = JSON.stringify(first);

    const reopened = reopen(first);
    expect(reopened.cells, "product: persisted nonempty cells preserve source, UI IDs, partial locations and own undefined fields")
      .toStrictEqual(originalCells);
    expect(nestedCell(reopened.cells[fixture.manualKey]!).sourceLocations).toStrictEqual(["", "image-2"]);
    expect(nestedCell(reopened.cells[fixture.manualKey]!).observationUnitIds).toStrictEqual(["ROI-Control-1", "ROI-Control-2"]);
    for (const [key, field] of [
      [fixture.manualKey, "availability"], [fixture.undefinedLocationsKey, "sourceLocations"],
      [fixture.undefinedIdsKey, "observationUnitIds"],
    ] as const) {
      expect(Object.prototype.hasOwnProperty.call(reopened.cells[key], field), `product: ${field} remains an own undefined property`).toBe(true);
      expect(nestedCell(reopened.cells[key]!)[field]).toBeUndefined();
    }
    expect(actualAssessment(reopened.draft, reopened.cells)).toEqual(originalRequest);
    const noop = ProjectStateSchema.parse(createExperimentWorkspaceProject({
      draft: reopened.draft, cells: reopened.cells, graphs: [], existingState: first, now: noopTime,
    }));
    for (const key of historyKeys) {
      expect(noop[key], `product: reopening and saving identical nonempty cells preserves all ${key}`).toEqual(first[key]);
    }
    expect(noop.activeRawRevisionId).toBe(first.activeRawRevisionId);
    expect(noop.activeDesignRevisionId).toBe(first.activeDesignRevisionId);
    const priorCell = nestedCell(reopened.cells[fixture.manualKey]!);
    const editedCell: NestedContinuousCellDraft = {
      ...priorCell, rawValues: [priorCell.rawValues[0]! + 5, ...priorCell.rawValues.slice(1)],
    };
    const editedCells: ExperimentCellMap = { ...reopened.cells, [fixture.manualKey]: editedCell };
    const editedRequest = actualAssessment(reopened.draft, editedCells);
    const edited = ProjectStateSchema.parse(createExperimentWorkspaceProject({
      draft: reopened.draft, cells: editedCells, graphs: [], existingState: noop, now: editTime,
    }));
    expect(edited.rawRevisions).toHaveLength(2);
    expect(edited.rawRevisions[0]).toEqual(first.rawRevisions[0]);
    expect(edited.rawRevisions[1]!.previousRevisionId).toBe(first.activeRawRevisionId);
    expect(edited.designRevisions).toEqual(first.designRevisions);
    expect(edited.observations.slice(0, first.observations.length)).toEqual(first.observations);
    expect(edited.unitInstances.slice(0, first.unitInstances.length)).toEqual(first.unitInstances);
    expect(edited.provenanceEvents.slice(0, first.provenanceEvents.length)).toEqual(first.provenanceEvents);
    expect(edited.observations).toHaveLength(20);
    expect(edited.unitInstances).toHaveLength(38);
    expectCurrentCanonicalRecords(edited, fixture.draft, editedCells, 2);
    const afterEdit = reopen(edited);
    expect(afterEdit.cells, "product: the edited current generation keeps the same source and lower-level identities")
      .toStrictEqual(editedCells);
    expect(afterEdit.draft.controlConditionId).toBe(fixture.draft.controlConditionId);
    expect(afterEdit.draft.conditionAssignment).toEqual(fixture.draft.conditionAssignment);
    expect(afterEdit.draft.conditions).toEqual(fixture.draft.conditions);
    expect(actualAssessment(afterEdit.draft, afterEdit.cells)).toEqual(editedRequest);
    const { observations: _oldObservations, ...originalFamily } = originalRequest;
    const { observations: _editedObservations, ...editedFamily } = editedRequest;
    expect(editedFamily, "only the true measurement edit changes analysis input values; family/options/control stay exact")
      .toEqual(originalFamily);
    for (const key of historyKeys) {
      expect(new Set(edited[key].map(({ id }) => id)).size, `product: ${key} IDs are unique`).toBe(edited[key].length);
    }
    expect(JSON.stringify(first), "product: the original canonical state is immutable").toBe(firstJson);
    expect(Object.values(originalCells).flatMap((cell) => nestedCell(cell).rawValues)).toEqual(originalValues);
    expect(originalCells[fixture.manualKey]).toStrictEqual({
      kind: "nested_continuous", source: "manual", rawValues: [10, 12], sourceLocations: ["", "image-2"],
      observationUnitIds: ["ROI-Control-1", "ROI-Control-2"], availability: undefined,
    });
  });
});

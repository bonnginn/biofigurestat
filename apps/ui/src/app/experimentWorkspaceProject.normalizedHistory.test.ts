import { describe, expect, it } from "vitest";
import { buildStructureContract } from "@lsaa/adaptive-input";
import type { AnalysisEngineResult } from "@lsaa/analysis-contracts";
import { CanonicalAdaptiveObservationSchema } from "@lsaa/domain";
import { ProjectStateSchema } from "@lsaa/project";

import { createAdaptiveWorkspace } from "./adaptiveWorkspace";
import type { ExperimentSetDraft } from "./experimentDraft";
import { assessDraftGraphAnalysis } from "./experimentDraftAnalysis";
import {
  createExperimentWorkspaceProject,
  rehydrateExperimentWorkspace,
  type WorkspaceGraphState,
} from "./experimentWorkspaceProject";

const firstTime = "2026-10-08T00:00:00.000Z";
const secondTime = "2026-10-08T01:00:00.000Z";

function normalizedAdaptiveFixture(
  representation: "proportion_counts" | "target_reference" = "proportion_counts",
) {
  const contract = buildStructureContract({
    experimentName: "Synthetic normalized paired proportions",
    experimentDescription:
      "Three declared samples, each with positive and eligible counts under both conditions.",
    experimentalUnitLabel: "Sample",
    identityLabel: "Sample ID",
    readoutLabel: "Positive fraction",
    readoutRepresentation: representation,
    factorName: "Treatment",
    factorLevels: ["Control", "Drug"],
    sameIdentityAcrossConditions: true,
    conditionEntityRelationship: { kind: "same_entity_across_conditions" },
  });
  const identityKey = contract.matching.identityKey!;
  const factorKey = contract.factors[0]!.key;
  const readoutKey = contract.readouts[0]!.key;
  const observations = [
    [2, 6],
    [4, 12],
    [5, 20],
  ].flatMap((values, unitIndex) =>
    values.map((value, conditionIndex) =>
      CanonicalAdaptiveObservationSchema.parse({
        observationId: `normalized.${unitIndex + 1}.${conditionIndex + 1}`,
        readoutKey,
        identities: { [identityKey]: `sample-${unitIndex + 1}` },
        factors: { [factorKey]: conditionIndex === 0 ? "Control" : "Drug" },
        axes: {},
        hierarchy: {},
        values:
          representation === "target_reference"
            ? { [`${readoutKey}_target`]: value, [`${readoutKey}_reference`]: 25 }
            : { [`${readoutKey}_numerator`]: value, [`${readoutKey}_denominator`]: 25 },
        missingness: {},
        sourceRow: unitIndex * 2 + conditionIndex + 2,
      }),
    ),
  );
  const workspace = createAdaptiveWorkspace({
    contract,
    observations,
    mapping: null,
    lineage: null,
    now: firstTime,
  });
  if (workspace.status !== "ready" || !workspace.draft)
    throw new Error("Invalid adaptive normalization fixture");
  // Use the supported typed-count mapping, not scalar -> nested mean lineage.
  // Every sample has one canonical positive/eligible record per condition.
  expect(workspace.draft.readouts[0]!.shape).toBe(
    representation === "target_reference" ? "wb_ratio" : "proportion",
  );
  expect(Object.values(workspace.cells)).toHaveLength(6);
  expect(
    Object.values(workspace.cells).every(
      (cell) => cell.kind === (representation === "target_reference" ? "wb_ratio" : "proportion"),
    ),
  ).toBe(true);
  const control = workspace.draft.conditions.find(({ label }) => label === "Control");
  if (!control) throw new Error("Explicit fixture control is missing");
  const draft: ExperimentSetDraft = {
    ...workspace.draft,
    controlConditionId: control.id,
    readouts: workspace.draft.readouts.map((readout) => ({
      ...readout,
      withinExperimentNormalization: {
        method: "control_equals_one",
        baselineConditionId: control.id,
      },
    })),
  };
  const assessment = assessDraftGraphAnalysis({
    draft,
    cells: workspace.cells,
    readoutId: draft.readouts[0]!.id,
    conditionIds: draft.conditions.map(({ id }) => id),
  });
  if (!assessment.request) throw new Error("Declared normalized fixture is not analyzable");
  const result: AnalysisEngineResult = {
    protocolVersion: assessment.request.protocolVersion,
    requestId: assessment.request.requestId,
    status: "ok",
    engine: { name: "synthetic-history-fixture", version: "1", packages: {} },
    estimates: [],
    tests: [],
    diagnostics: [],
    warnings: [],
    completedAt: firstTime,
  };
  const graph: WorkspaceGraphState = {
    id: "graph.normalized-history",
    displayName: "Normalized positive fraction",
    analysisRunId: null,
    selectedReadoutId: draft.readouts[0]!.id,
    selectedConditionIds: draft.conditions.map(({ id }) => id),
    selectedTimePointIds: [],
    analysisTimePointId: null,
    analysisMetric: { kind: "selected_timepoint" },
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
      yTitle: "Control-normalized proportion",
      yRangeMode: "auto",
      yMin: null,
      yMax: null,
      yScale: "linear",
      showCategoryLabels: true,
      hierarchyOrder: [`factor.${factorKey}`],
      spacing: 1,
      yTickMode: "auto",
      yTickInterval: null,
    },
    statisticsAnnotation: { mode: "hidden", testIndex: 0 },
    analysis: { request: assessment.request, result },
  };
  return { draft, cells: workspace.cells, graphs: [graph] };
}

describe("adaptive normalized analysis history", () => {
  it("preserves current adaptive WB target/reference raw values and the extra normalization through save/reopen", () => {
    const fixture = normalizedAdaptiveFixture("target_reference");
    const rawBefore = structuredClone(fixture.draft.adaptiveInput?.canonicalObservations);
    const saved = ProjectStateSchema.parse(
      createExperimentWorkspaceProject({ ...fixture, now: firstTime }),
    );
    expect(saved.adaptiveInput?.canonicalObservations).toEqual(rawBefore);
    expect(saved.derivedValues.map(({ value }) => value).sort((a, b) => a - b)).toEqual([
      1, 1, 1, 3, 3, 4,
    ]);
    const reopened = rehydrateExperimentWorkspace(
      ProjectStateSchema.parse(JSON.parse(JSON.stringify(saved))),
    );
    // Cell-local inputMode is optional; the persisted readout retains its mode.
    expect(reopened?.draft.readouts[0].wbInputMode).toBe("corrected_value");
    for (const [key, cell] of Object.entries(fixture.cells)) {
      if (cell.kind !== "wb_ratio") throw new Error("Expected WB source cells");
      expect(reopened?.cells[key]).toMatchObject({
        kind: "wb_ratio",
        target: cell.target,
        reference: cell.reference,
      });
    }
    expect(reopened?.draft.readouts[0].withinExperimentNormalization).toEqual(
      fixture.draft.readouts[0].withinExperimentNormalization,
    );
    expect(fixture.draft.adaptiveInput?.canonicalObservations).toEqual(rawBefore);
  });
  it("saves a new execution over unchanged raw data with distinct derived value IDs and exact prior history", () => {
    const fixture = normalizedAdaptiveFixture();
    const created = ProjectStateSchema.parse(
      createExperimentWorkspaceProject({ ...fixture, now: firstTime }),
    );
    // Model an already saved pre-fix project. Only normalized value IDs and
    // their request references use the legacy spelling; all other history,
    // values and raw lineage remain the formally validated fixture's bytes.
    const legacyAliases = new Map(
      created.derivedValues.map(({ id }) => [id, id.replace(/\.r1$/u, "")]),
    );
    const first = ProjectStateSchema.parse({
      ...created,
      derivedValues: created.derivedValues.map((value) => ({
        ...value,
        id: legacyAliases.get(value.id)!,
      })),
      analysisRuns: created.analysisRuns.map((run) => {
        if (run.request.protocolVersion !== "0.1.0") throw new Error("Expected D02 legacy history");
        return {
          ...run,
          request: {
            ...run.request,
            observations: run.request.observations.map((observation) => ({
              ...observation,
              observationId:
                legacyAliases.get(observation.observationId) ?? observation.observationId,
            })),
          },
        };
      }),
    });
    expect(new Set(first.derivedValues.map(({ id }) => id)).size).toBe(6);
    expect(first.derivedValues.every(({ id }) => !/\.r\d+$/u.test(id))).toBe(true);
    expect(first.derivedValues.map(({ id: _id, ...facts }) => facts)).toEqual(
      created.derivedValues.map(({ id: _id, ...facts }) => facts),
    );
    expect(first.adaptiveInput?.canonicalObservations).toHaveLength(6);
    expect(first.rawRevisions).toHaveLength(1);
    expect(first.analysisRuns).toHaveLength(1);
    expect(first.derivedDatasetRevisions).toHaveLength(1);
    expect(first.derivedValues).toHaveLength(6);
    expect(first.derivedValues.map(({ value }) => value).sort((a, b) => a - b)).toEqual([
      1, 1, 1, 3, 3, 4,
    ]);
    const firstRequest = first.analysisRuns[0]!.request;
    if (firstRequest.protocolVersion !== "0.1.0")
      throw new Error("Expected the existing D02 scalar protocol");
    expect(firstRequest.method).toBe("paired_t");
    expect(
      new Set(firstRequest.observations.map(({ experimentalUnitId }) => experimentalUnitId)).size,
    ).toBe(3);
    expect(new Set(firstRequest.observations.map(({ pairId }) => pairId)).size).toBe(3);
    const workspace = rehydrateExperimentWorkspace(first);
    if (!workspace) throw new Error("Valid project did not rehydrate");
    expect(workspace.draft.adaptiveInput).toBeDefined();
    expect(workspace.draft.readouts[0]!.withinExperimentNormalization).toEqual(
      fixture.draft.readouts[0]!.withinExperimentNormalization,
    );

    // Prove the fixture is on the unchanged-adaptive-raw path before changing
    // execution provenance; legacy fixtures create a new raw revision here.
    const unchanged = createExperimentWorkspaceProject({
      ...workspace,
      existingState: first,
      now: secondTime,
    });
    expect(unchanged.rawRevisions).toEqual(first.rawRevisions);
    expect(unchanged.derivedDatasetRevisions).toEqual(first.derivedDatasetRevisions);
    expect(unchanged.derivedValues).toEqual(first.derivedValues);
    expect(unchanged.analysisRuns).toEqual(first.analysisRuns);
    const priorBytes = JSON.stringify(first);
    const previousGraph = workspace.graphs[0]!;
    if (!previousGraph.analysis) throw new Error("Executed graph did not rehydrate");
    const freshGraph: WorkspaceGraphState = {
      ...previousGraph,
      analysis: {
        ...previousGraph.analysis,
        result: { ...previousGraph.analysis.result, completedAt: secondTime },
      },
    };
    // This represents another execution with unchanged numerical outputs;
    // no statistical engine runs in this persistence regression.
    const second = ProjectStateSchema.parse(
      createExperimentWorkspaceProject({
        ...workspace,
        graphs: [freshGraph],
        existingState: first,
        now: secondTime,
      }),
    );
    expect(second.rawRevisions).toEqual(first.rawRevisions);
    expect(second.activeRawRevisionId).toBe(first.activeRawRevisionId);
    expect(second.observations).toEqual(first.observations);
    expect(second.unitInstances).toEqual(first.unitInstances);
    expect(second.designRevisions).toEqual(first.designRevisions);
    expect(second.activeDesignRevisionId).toBe(first.activeDesignRevisionId);
    expect(second.metadata.projectId).toBe(first.metadata.projectId);
    expect(second.metadata.createdAt).toBe(first.metadata.createdAt);
    expect(second.analysisRuns).toHaveLength(2);
    expect(second.analysisRuns[0]).toEqual(first.analysisRuns[0]);
    expect(second.derivedDatasetRevisions).toHaveLength(2);
    expect(second.derivedDatasetRevisions[0]).toEqual(first.derivedDatasetRevisions[0]);
    expect(second.transformations.slice(0, first.transformations.length)).toEqual(
      first.transformations,
    );
    expect(second.derivedValues).toHaveLength(12);
    expect(second.derivedValues.slice(0, 6)).toEqual(first.derivedValues);
    const oldIds = new Set(first.derivedValues.map(({ id }) => id));
    const newValues = second.derivedValues.slice(6);
    expect(newValues.every(({ id }) => !oldIds.has(id))).toBe(true);
    expect(newValues.every(({ id }) => id.endsWith(".r2"))).toBe(true);
    expect(new Set(second.derivedValues.map(({ id }) => id)).size).toBe(12);
    const newRevision = second.derivedDatasetRevisions[1]!;
    expect(newRevision.id).not.toBe(first.derivedDatasetRevisions[0]!.id);
    expect(newRevision.sourceRawRevisionId).toBe(first.activeRawRevisionId);
    expect(
      newValues.every(
        ({ derivedDatasetRevisionId }) => derivedDatasetRevisionId === newRevision.id,
      ),
    ).toBe(true);
    expect(
      newValues.map(({ id: _id, derivedDatasetRevisionId: _revision, ...facts }) => facts),
    ).toEqual(
      first.derivedValues.map(
        ({ id: _id, derivedDatasetRevisionId: _revision, ...facts }) => facts,
      ),
    );
    const newRequest = second.analysisRuns[1]!.request;
    if (newRequest.protocolVersion !== "0.1.0")
      throw new Error("Repeated execution changed protocol");
    expect(newRequest.method).toBe(firstRequest.method);
    expect(newRequest.options).toEqual(firstRequest.options);
    expect(newRequest.contrastConditionIds).toEqual(firstRequest.contrastConditionIds);
    expect(newRequest.observations.map(({ observationId: _id, ...facts }) => facts)).toEqual(
      firstRequest.observations.map(({ observationId: _id, ...facts }) => facts),
    );
    expect(new Set(newRequest.observations.map(({ observationId }) => observationId))).toEqual(
      new Set(newValues.map(({ id }) => id)),
    );
    expect(second.experimentWorkspace!.controlConditionId).toBe(
      first.experimentWorkspace!.controlConditionId,
    );
    expect(second.experimentWorkspace!.readoutDefinitions).toEqual(
      first.experimentWorkspace!.readoutDefinitions,
    );
    expect(second.analysisRuns[1]!.result.completedAt).toBe(secondTime);
    expect(JSON.stringify(first)).toBe(priorBytes);
  });
});

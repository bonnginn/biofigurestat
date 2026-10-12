import { describe, expect, it } from "vitest";
import { buildStructureContract } from "@lsaa/adaptive-input";
import type { AnalysisEngineResult } from "@lsaa/analysis-contracts";
import {
  AdaptiveColumnMappingSchema,
  AdaptiveRawLineageSchema,
  CanonicalAdaptiveObservationSchema,
} from "@lsaa/domain";

import { createAdaptiveWorkspace } from "./adaptiveWorkspace";
import {
  createExperimentWorkspaceProject,
  rehydrateExperimentWorkspace,
  type WorkspaceGraphState,
} from "./experimentWorkspaceProject";
import { assessDraftGraphAnalysis } from "./experimentDraftAnalysis";

const firstSaveAt = "2026-08-28T00:00:00.000Z";
const secondSaveAt = "2026-08-28T01:00:00.000Z";

function adaptiveFixture(withSourceLineage = false) {
  const contract = buildStructureContract({
    experimentName: "Adaptive save fixture",
    experimentDescription: "Separate culture dishes received vehicle or drug.",
    experimentalUnitLabel: "culture dish",
    identityLabel: "Dish ID",
    readoutLabel: "Signal",
    readoutRepresentation: "scalar",
    factorName: "Treatment",
    factorLevels: ["Vehicle", "Drug"],
    sameIdentityAcrossConditions: false,
  });
  const identityKey = contract.identities[0]!.key;
  const factorKey = contract.factors[0]!.key;
  const readoutKey = contract.readouts[0]!.key;
  const rows: Array<readonly [string, string, number]> = [
    ["Dish-V1", "Vehicle", 1],
    ["Dish-V2", "Vehicle", 2],
    ["Dish-D1", "Drug", 3],
    ["Dish-D2", "Drug", 4],
  ];
  const observations = rows.map(([identity, treatment, value], index) =>
    CanonicalAdaptiveObservationSchema.parse({
      observationId: `adaptive-save.${index + 1}`,
      readoutKey,
      identities: { [identityKey]: identity },
      factors: { [factorKey]: treatment },
      axes: {},
      hierarchy: {},
      values: { [readoutKey]: value },
      missingness: {},
      sourceRow: withSourceLineage ? index + 2 : null,
    }),
  );
  const mapping = withSourceLineage
    ? AdaptiveColumnMappingSchema.parse({
        schemaVersion: "0.1.0",
        sourceLabel: "fixture.tsv",
        delimiter: "tab",
        headerRow: 1,
        columns: {
          "Dish ID": { role: "identity", semanticKey: identityKey },
          Treatment: { role: "factor", semanticKey: factorKey },
          Signal: { role: "value", semanticKey: readoutKey },
        },
        confirmedAt: firstSaveAt,
      })
    : null;
  const lineage = withSourceLineage
    ? AdaptiveRawLineageSchema.parse({
        schemaVersion: "0.1.0",
        sourceKind: "tsv",
        sourceLabel: "fixture.tsv",
        importedAt: firstSaveAt,
        rawText:
          "Dish ID\tTreatment\tSignal\nDish-V1\tVehicle\t1\nDish-V2\tVehicle\t2\nDish-D1\tDrug\t3\nDish-D2\tDrug\t4",
        sha256: null,
        transformations: ["typed_canonicalization"],
      })
    : null;
  const workspace = createAdaptiveWorkspace({
    contract,
    observations,
    mapping,
    lineage,
    now: firstSaveAt,
  });
  if (!workspace.draft) throw new Error("Expected an adaptive workspace fixture");
  return { workspace, contract };
}

function analyzedGraph(fixture: ReturnType<typeof adaptiveFixture>): WorkspaceGraphState {
  const draft = fixture.workspace.draft!;
  const assessment = assessDraftGraphAnalysis({
    draft,
    cells: fixture.workspace.cells,
    readoutId: draft.readouts[0]!.id,
    conditionIds: draft.conditions.map(({ id }) => id),
  });
  if (!assessment.request) throw new Error("Expected an analyzable adaptive fixture");
  const result: AnalysisEngineResult = {
    protocolVersion: assessment.request.protocolVersion,
    requestId: assessment.request.requestId,
    status: "ok",
    engine: { name: "fixture", version: "1", packages: {} },
    estimates: [],
    tests: [],
    diagnostics: [],
    warnings: [],
    completedAt: firstSaveAt,
  };
  return {
    id: "graph.adaptive-save",
    displayName: "Adaptive save graph",
    analysisRunId: null,
    selectedReadoutId: draft.readouts[0]!.id,
    selectedConditionIds: draft.conditions.map(({ id }) => id),
    selectedTimePointIds: [],
    graphType: "dot",
    layers: {
      raw: true,
      distribution: true,
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
      xTitle: "",
      xUnit: "",
      yTitle: "Signal",
      yRangeMode: "auto",
      yMin: null,
      yMax: null,
      yScale: "linear",
      showCategoryLabels: true,
      hierarchyOrder: draft.attributes.map(({ id }) => id),
      spacing: 1,
      yTickMode: "auto",
      yTickInterval: null,
    },
    analysis: { request: assessment.request, result },
  };
}

describe("adaptive workspace scientific revision idempotence", () => {
  it("an unchanged reopened save and presentation-only view change add no scientific revision or provenance", () => {
    const { workspace } = adaptiveFixture();
    const initial = createExperimentWorkspaceProject({
      draft: workspace.draft!,
      cells: workspace.cells,
      graphs: [],
      dataViewMode: "compact",
      now: firstSaveAt,
    });
    const reopened = rehydrateExperimentWorkspace(initial)!;
    const saved = createExperimentWorkspaceProject({
      ...reopened,
      dataViewMode: "expanded",
      existingState: initial,
      now: secondSaveAt,
    });

    expect(saved.rawRevisions).toEqual(initial.rawRevisions);
    expect(saved.designRevisions).toEqual(initial.designRevisions);
    expect(saved.provenanceEvents).toEqual(initial.provenanceEvents);
    expect(saved.analysisRuns).toEqual(initial.analysisRuns);
    expect(saved.graphs).toEqual(initial.graphs);
    expect(saved.experimentWorkspace?.dataViewMode).toBe("expanded");
  });

  it("ignores volatile import/check timestamps when a source-lineage workspace is reopened", () => {
    const { workspace } = adaptiveFixture(true);
    const initial = createExperimentWorkspaceProject({
      draft: workspace.draft!,
      cells: workspace.cells,
      graphs: [],
      now: firstSaveAt,
    });
    const reopened = rehydrateExperimentWorkspace(initial)!;
    const snapshot = reopened.draft.adaptiveInput!;
    const draft = {
      ...reopened.draft,
      adaptiveInput: {
        ...snapshot,
        equivalence: { ...snapshot.equivalence, checkedAt: secondSaveAt },
        mapping: snapshot.mapping
          ? { ...snapshot.mapping, confirmedAt: secondSaveAt }
          : snapshot.mapping,
        rawLineage: snapshot.rawLineage
          ? { ...snapshot.rawLineage, importedAt: secondSaveAt }
          : snapshot.rawLineage,
      },
    };
    const saved = createExperimentWorkspaceProject({
      draft,
      cells: reopened.cells,
      graphs: reopened.graphs,
      existingState: initial,
      now: secondSaveAt,
    });

    expect(saved.rawRevisions).toEqual(initial.rawRevisions);
    expect(saved.designRevisions).toEqual(initial.designRevisions);
    expect(saved.provenanceEvents).toEqual(initial.provenanceEvents);
    expect(saved.adaptiveInput?.rawLineage?.rawText).toBe(
      initial.adaptiveInput?.rawLineage?.rawText,
    );
  });

  it("adds one raw revision when retained source-lineage text actually changes", () => {
    const { workspace } = adaptiveFixture(true);
    const initial = createExperimentWorkspaceProject({
      draft: workspace.draft!,
      cells: workspace.cells,
      graphs: [],
      now: firstSaveAt,
    });
    const reopened = rehydrateExperimentWorkspace(initial)!;
    const snapshot = reopened.draft.adaptiveInput!;
    const draft = {
      ...reopened.draft,
      adaptiveInput: {
        ...snapshot,
        rawLineage: snapshot.rawLineage
          ? { ...snapshot.rawLineage, rawText: `${snapshot.rawLineage.rawText}\n` }
          : snapshot.rawLineage,
      },
    };
    const saved = createExperimentWorkspaceProject({
      draft,
      cells: reopened.cells,
      graphs: reopened.graphs,
      existingState: initial,
      now: secondSaveAt,
    });

    expect(saved.rawRevisions).toHaveLength(initial.rawRevisions.length + 1);
    expect(saved.designRevisions).toEqual(initial.designRevisions);
    expect(saved.provenanceEvents).toHaveLength(initial.provenanceEvents.length + 1);
    expect(saved.provenanceEvents.at(-1)?.kind).toBe("raw_revision_created");
  });

  it("does not re-execute or stale an unchanged persisted adaptive analysis", () => {
    const fixture = adaptiveFixture();
    const initial = createExperimentWorkspaceProject({
      draft: fixture.workspace.draft!,
      cells: fixture.workspace.cells,
      graphs: [analyzedGraph(fixture)],
      now: firstSaveAt,
    });
    const reopened = rehydrateExperimentWorkspace(initial)!;
    const saved = createExperimentWorkspaceProject({
      ...reopened,
      dataViewMode: "expanded",
      existingState: initial,
      now: secondSaveAt,
    });

    expect(saved.rawRevisions).toEqual(initial.rawRevisions);
    expect(saved.designRevisions).toEqual(initial.designRevisions);
    expect(saved.provenanceEvents).toEqual(initial.provenanceEvents);
    expect(saved.analysisRuns).toEqual(initial.analysisRuns);
    expect(saved.graphs).toEqual(initial.graphs);
    expect(saved.experimentWorkspace?.graphs[0]?.analysisRunId).toBe(
      initial.experimentWorkspace?.graphs[0]?.analysisRunId,
    );
  });

  it("persists a new derived graph against unchanged raw data and is idempotent thereafter", () => {
    const fixture = adaptiveFixture();
    const initial = createExperimentWorkspaceProject({
      draft: fixture.workspace.draft!,
      cells: fixture.workspace.cells,
      graphs: [],
      now: firstSaveAt,
    });
    expect(
      initial.unitInstances.every(({ metadata }) => metadata.experimentSessionId === undefined),
    ).toBe(true);
    const reopened = rehydrateExperimentWorkspace(initial)!;
    const derivedGraph = analyzedGraph(fixture);
    const withDerivedGraph = createExperimentWorkspaceProject({
      ...reopened,
      graphs: [derivedGraph],
      existingState: initial,
      now: secondSaveAt,
    });

    expect(withDerivedGraph.rawRevisions).toEqual(initial.rawRevisions);
    expect(withDerivedGraph.designRevisions).toEqual(initial.designRevisions);
    expect(withDerivedGraph.transformations).toHaveLength(1);
    expect(withDerivedGraph.derivedDatasetRevisions).toHaveLength(1);
    expect(withDerivedGraph.derivedValues).toHaveLength(4);
    expect(withDerivedGraph.analysisRuns).toHaveLength(1);
    expect(withDerivedGraph.analysisRuns[0]?.request.observations).toHaveLength(4);
    expect(withDerivedGraph.provenanceEvents.slice(initial.provenanceEvents.length)).toEqual([
      expect.objectContaining({ kind: "transformation_created" }),
      expect.objectContaining({ kind: "derived_dataset_created" }),
      expect.objectContaining({ kind: "analysis_executed" }),
    ]);

    const reopenedAgain = rehydrateExperimentWorkspace(withDerivedGraph)!;
    const unchanged = createExperimentWorkspaceProject({
      ...reopenedAgain,
      existingState: withDerivedGraph,
      now: "2026-08-28T02:00:00.000Z",
    });
    expect(unchanged.rawRevisions).toEqual(withDerivedGraph.rawRevisions);
    expect(unchanged.designRevisions).toEqual(withDerivedGraph.designRevisions);
    expect(unchanged.transformations).toEqual(withDerivedGraph.transformations);
    expect(unchanged.derivedDatasetRevisions).toEqual(withDerivedGraph.derivedDatasetRevisions);
    expect(unchanged.derivedValues).toEqual(withDerivedGraph.derivedValues);
    expect(unchanged.analysisRuns).toEqual(withDerivedGraph.analysisRuns);
    expect(unchanged.provenanceEvents).toEqual(withDerivedGraph.provenanceEvents);
  });

  it("adds exactly one raw revision for a real canonical value change", () => {
    const { workspace } = adaptiveFixture();
    const initial = createExperimentWorkspaceProject({
      draft: workspace.draft!,
      cells: workspace.cells,
      graphs: [],
      now: firstSaveAt,
    });
    const reopened = rehydrateExperimentWorkspace(initial)!;
    const firstCellKey = Object.keys(reopened.cells)[0]!;
    const firstCell = reopened.cells[firstCellKey];
    if (firstCell?.kind !== "nested_continuous") throw new Error("Expected scalar cell fixture");
    const saved = createExperimentWorkspaceProject({
      draft: reopened.draft,
      cells: {
        ...reopened.cells,
        [firstCellKey]: { ...firstCell, rawValues: [101] },
      },
      graphs: reopened.graphs,
      existingState: initial,
      now: secondSaveAt,
    });

    expect(saved.rawRevisions).toHaveLength(initial.rawRevisions.length + 1);
    expect(saved.designRevisions).toEqual(initial.designRevisions);
    expect(saved.provenanceEvents).toHaveLength(initial.provenanceEvents.length + 1);
    expect(saved.provenanceEvents.at(-1)?.kind).toBe("raw_revision_created");
  });

  it("adds exactly one design revision for a semantic contract change without a raw revision", () => {
    const { workspace } = adaptiveFixture();
    const initial = createExperimentWorkspaceProject({
      draft: workspace.draft!,
      cells: workspace.cells,
      graphs: [],
      now: firstSaveAt,
    });
    const reopened = rehydrateExperimentWorkspace(initial)!;
    const snapshot = reopened.draft.adaptiveInput!;
    const draft = {
      ...reopened.draft,
      name: "Adaptive save fixture renamed",
      adaptiveInput: {
        ...snapshot,
        contract: {
          ...snapshot.contract,
          experimentName: "Adaptive save fixture renamed",
        },
      },
    };
    const saved = createExperimentWorkspaceProject({
      draft,
      cells: reopened.cells,
      graphs: reopened.graphs,
      existingState: initial,
      now: secondSaveAt,
    });

    expect(saved.designRevisions).toHaveLength(initial.designRevisions.length + 1);
    expect(saved.rawRevisions).toEqual(initial.rawRevisions);
    expect(saved.provenanceEvents).toHaveLength(initial.provenanceEvents.length + 1);
    expect(saved.provenanceEvents.at(-1)?.kind).toBe("design_revision_created");
    expect(saved.designRevisions.at(-1)?.design.name).toBe("Adaptive save fixture renamed");
  });
});

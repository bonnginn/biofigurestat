import { fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { buildStructureContract } from "@lsaa/adaptive-input";
import type {
  AdaptiveColumnMapping,
  AdaptiveRawLineage,
  CanonicalAdaptiveObservation,
  StructureContract,
} from "@lsaa/domain";
import {
  createUnresolvedVisualizationProjectState,
  createUnresolvedVisualizationPromotionHistory,
  type ProjectState,
} from "@lsaa/project";

import { createAdaptiveWorkspace } from "../app/adaptiveWorkspace";
import { createBiologicalSetupPresentation } from "../app/adaptiveStructureRevision";
import {
  buildConditionCombinations,
  safelyBuildBiologicalSetup,
  type ConditionEntryBlock,
} from "../components/BiologicalExperimentSetup";
import {
  createExperimentWorkspaceProject,
  rehydrateExperimentWorkspace,
  type WorkspaceGraphState,
} from "../app/experimentWorkspaceProject";
import type { SaveProjectAction } from "../app/projectActions";
import { ExperimentWorkspace } from "./ExperimentWorkspace";

const now = "2026-08-28T00:00:00.000Z";

function fixture(levels: readonly string[] = ["Control", "Drug", "Unused"]) {
  const contract = buildStructureContract({
    experimentName: "Cell signal",
    experimentDescription: "Treatmentを組み合わせ、Signalを測定",
    experimentalUnitLabel: "culture dish",
    identityLabel: "culture dish ID",
    readoutLabel: "Signal",
    readoutRepresentation: "scalar",
    factorName: "Treatment",
    factorLevels: levels,
    sameIdentityAcrossConditions: false,
    conditionEntityRelationship: { kind: "independent_condition_units" },
  });
  const identityKey = contract.identities.find(
    ({ unitLevelKey }) => unitLevelKey === contract.experimentalUnitLevelKey,
  )!.key;
  const factorKey = contract.factors[0]!.key;
  const readoutKey = contract.readouts[0]!.key;
  const observations: CanonicalAdaptiveObservation[] = ["Control", "Drug"].map(
    (condition, index) => ({
      observationId: `observation.${index + 1}`,
      readoutKey,
      identities: { [identityKey]: `Dish-${index + 1}` },
      factors: { [factorKey]: condition },
      axes: {},
      hierarchy: {},
      values: { [readoutKey]: 10 + index * 4 },
      missingness: {},
      sourceRow: index + 2,
    }),
  );
  const mapping: AdaptiveColumnMapping = {
    schemaVersion: "0.1.0",
    sourceLabel: "signal.tsv",
    delimiter: "tab",
    headerRow: 1,
    columns: {
      Dish: {
        role: "identity",
        semanticKey: identityKey,
        fixedFactors: {},
        fixedAxes: {},
      },
      Treatment: {
        role: "factor",
        semanticKey: factorKey,
        fixedFactors: {},
        fixedAxes: {},
      },
      Signal: {
        role: "value",
        semanticKey: readoutKey,
        fixedFactors: {},
        fixedAxes: {},
      },
    },
    confirmedAt: now,
  };
  const lineage: AdaptiveRawLineage = {
    schemaVersion: "0.1.0",
    sourceKind: "tsv",
    sourceLabel: "signal.tsv",
    importedAt: now,
    rawText: "Dish\tTreatment\tSignal\nDish-1\tControl\t10\nDish-2\tDrug\t14",
    sha256: null,
    transformations: ["confirmed_column_mapping"],
  };
  const workspace = createAdaptiveWorkspace({ contract, observations, mapping, lineage, now });
  if (workspace.status !== "ready" || !workspace.draft)
    throw new Error(workspace.diagnostics.join(" / "));
  return { contract, observations, mapping, lineage, workspace };
}

function groupedCanvasFixture() {
  const blankRows = () => Array.from({ length: 5 }, () => Array.from({ length: 5 }, () => ""));
  const siRnaValues = blankRows();
  siRnaValues[0]![0] = "control";
  siRnaValues[1]![0] = "#1";
  siRnaValues[1]![1] = "#2";
  siRnaValues[1]![2] = "#3";
  const doxValues = blankRows();
  doxValues[0]![0] = "−";
  doxValues[0]![1] = "+";
  const blocks: ConditionEntryBlock[] = [
    {
      id: "condition-block.1",
      name: "siRNA",
      showGroups: true,
      groupLabels: ["Control", "Gene A", "", "", ""],
      values: siRnaValues,
    },
    {
      id: "condition-block.2",
      name: "Dox",
      showGroups: false,
      groupLabels: ["", "", "", "", ""],
      values: doxValues,
    },
  ];
  const combinations = buildConditionCombinations(blocks);
  const built = safelyBuildBiologicalSetup({
    title: "Grouped siRNA experiment",
    measurementLabel: "Ciliated cells",
    valueForm: "positive_total",
    blocks,
    combinations,
    statuses: {},
    receiverLabel: "culture dish",
    receiverIdLabel: "culture dish ID",
    relationship: "separate",
    sourceLabel: "",
    sourceIdLabel: "",
    childLabel: "Cell",
  });
  if (built.status !== "ready") throw new Error(built.reason);
  const retained = createBiologicalSetupPresentation(built.result);
  if (retained.status !== "ready") throw new Error(retained.reason);
  const workspace = createAdaptiveWorkspace({
    contract: built.result.contract,
    observations: [],
    mapping: null,
    lineage: null,
    biologicalSetup: retained.presentation,
    now,
  });
  if (workspace.status !== "ready" || !workspace.draft)
    throw new Error(workspace.diagnostics.join(" / "));
  return { setup: built.result, retained: retained.presentation, workspace };
}

function retainedEntrySourceHistory() {
  const source = createUnresolvedVisualizationProjectState({
    metadata: {
      projectId: "visualization.structure-revision-source",
      projectName: "Structure revision source",
      experimentDate: "",
      createdAt: now,
      updatedAt: now,
    },
    entryIntent: "graph_only",
    table: {
      id: "table.structure-revision-source",
      headers: ["Treatment", "Signal", "Dish"],
      rows: [
        ["Control", "10", "Dish-1"],
        ["Drug", "14", "Dish-2"],
      ],
      delimiter: "tab",
      headerRow: 1,
    },
    rawLineage: {
      sourceKind: "tsv",
      sourceLabel: "signal.tsv",
      importedAt: now,
      rawText: "Treatment\tSignal\tDish\nControl\t10\tDish-1\nDrug\t14\tDish-2",
      sha256: null,
      transformations: ["delimiter_detection"],
    },
    mapping: {
      schemaVersion: "0.1.0",
      sourceLabel: "signal.tsv",
      delimiter: "tab",
      headerRow: 1,
      columns: [
        { index: 0, header: "Treatment", role: "x" },
        { index: 1, header: "Signal", role: "y" },
        { index: 2, header: "Dish", role: "id" },
      ],
      identityDecision: "selected_column",
      confirmedAt: now,
    },
    actor: "test",
  });
  return createUnresolvedVisualizationPromotionHistory({
    sourceState: source,
    promotedWorkspaceGraphId: null,
    capturedAt: now,
  });
}

function editStructure() {
  fireEvent.click(screen.getByRole("button", { name: "実験の組み立てを修正" }));
  expect(screen.getByRole("heading", { name: "実験の組み立てを修正" })).toBeVisible();
}

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

describe("ExperimentWorkspace non-destructive structure revision", () => {
  it("moves focus into revision and restores it to the trigger on Cancel and no-op apply", () => {
    const { workspace } = fixture();
    render(
      <ExperimentWorkspace
        initialDraft={workspace.draft!}
        initialCells={workspace.cells}
        onBack={vi.fn()}
      />,
    );

    const initialTrigger = screen.getByRole("button", { name: "実験の組み立てを修正" });
    initialTrigger.focus();
    fireEvent.click(initialTrigger);
    expect(screen.getByLabelText("実験タイトル（任意）")).toHaveFocus();

    fireEvent.click(screen.getByRole("button", { name: "変更せず戻る" }));
    const triggerAfterCancel = screen.getByRole("button", { name: "実験の組み立てを修正" });
    expect(triggerAfterCancel).toHaveFocus();

    fireEvent.click(triggerAfterCancel);
    expect(screen.getByLabelText("実験タイトル（任意）")).toHaveFocus();
    fireEvent.click(screen.getByRole("button", { name: "変更を適用" }));
    expect(screen.getByRole("button", { name: "実験の組み立てを修正" })).toHaveFocus();
  });

  it("keeps a reopened workspace byte-equivalent on Cancel and no-op submit", () => {
    const { workspace } = fixture();
    expect(workspace.snapshot).not.toHaveProperty("biologicalSetup");
    const state = createExperimentWorkspaceProject({
      draft: workspace.draft!,
      cells: workspace.cells,
      graphs: [],
      now,
    });
    const reopened = rehydrateExperimentWorkspace(state)!;
    expect(reopened.draft.adaptiveInput).not.toHaveProperty("biologicalSetup");
    const dirty = vi.fn();
    render(
      <ExperimentWorkspace
        initialDraft={reopened.draft}
        initialCells={reopened.cells}
        initialGraphs={reopened.graphs}
        initialDataViewMode={reopened.dataViewMode}
        initialProject={{ state, target: "C:/tmp/structure-revision.lsa" }}
        onBack={vi.fn()}
        onDirtyChange={dirty}
      />,
    );

    editStructure();
    fireEvent.click(screen.getByRole("button", { name: "変更せず戻る" }));
    expect(screen.getByRole("button", { name: "実験の組み立てを修正" })).toBeVisible();

    editStructure();
    fireEvent.click(screen.getByRole("button", { name: "変更を適用" }));
    expect(screen.getByRole("button", { name: "実験の組み立てを修正" })).toBeVisible();
    expect(dirty.mock.calls.some(([value]) => value === true)).toBe(false);
  });

  it("retains exact grouped condition-canvas presentation through save/open and revision prefill", () => {
    const { retained, workspace } = groupedCanvasFixture();
    const state = createExperimentWorkspaceProject({
      draft: workspace.draft!,
      cells: workspace.cells,
      graphs: [],
      now,
    });
    expect(state.adaptiveInput?.biologicalSetup).toEqual(retained);
    expect(state.experimentWorkspace?.adaptiveInput?.biologicalSetup).toEqual(retained);

    const reopened = rehydrateExperimentWorkspace(state)!;
    expect(reopened.draft.adaptiveInput?.biologicalSetup).toEqual(retained);
    const dirty = vi.fn();
    render(
      <ExperimentWorkspace
        initialDraft={reopened.draft}
        initialCells={reopened.cells}
        initialGraphs={reopened.graphs}
        initialDataViewMode={reopened.dataViewMode}
        initialProject={{ state, target: "C:/tmp/grouped-canvas.lsa" }}
        onBack={vi.fn()}
        onDirtyChange={dirty}
      />,
    );

    editStructure();
    expect(
      screen.getByRole("checkbox", {
        name: "処理・群分け 1（siRNA）に親グループ列を追加する",
      }),
    ).toBeChecked();
    expect(screen.getByRole("textbox", { name: "siRNA：行 1のまとまり" })).toHaveValue("Control");
    expect(screen.getByRole("textbox", { name: "siRNA：行 2のまとまり" })).toHaveValue("Gene A");
    expect(screen.getByRole("textbox", { name: "siRNA：行 2 列 1" })).toHaveValue("#1");
    expect(screen.getByRole("textbox", { name: "siRNA：行 2 列 2" })).toHaveValue("#2");
    expect(screen.getByRole("textbox", { name: "siRNA：行 2 列 3" })).toHaveValue("#3");
    fireEvent.click(screen.getByRole("button", { name: "変更を適用" }));
    expect(dirty.mock.calls.some(([value]) => value === true)).toBe(false);
  });

  it("removes an unused level while retaining canonical rows, mapping, raw lineage, and reopen", async () => {
    const { observations, mapping, lineage, workspace } = fixture();
    const entrySourceHistory = retainedEntrySourceHistory();
    const saveProject = vi.fn<SaveProjectAction>(async (state, target) => {
      return { state, target: target ?? "C:/tmp/compatible-revision.lsa" };
    });
    const view = render(
      <ExperimentWorkspace
        initialDraft={{ ...workspace.draft!, entrySourceHistory }}
        initialCells={workspace.cells}
        onBack={vi.fn()}
        saveProject={saveProject}
      />,
    );

    editStructure();
    fireEvent.change(screen.getByRole("textbox", { name: "行 1 列 3" }), {
      target: { value: "" },
    });
    fireEvent.click(screen.getByRole("button", { name: "変更を適用" }));
    expect(screen.getByRole("button", { name: "実験の組み立てを修正" })).toHaveFocus();
    expect(screen.getByText(/測定値とGraphの外観は保持/)).toBeVisible();
    fireEvent.click(screen.getByRole("button", { name: "プロジェクトを保存" }));
    await waitFor(() => expect(saveProject).toHaveBeenCalledOnce());
    const savedState: ProjectState = saveProject.mock.calls[0]![0];

    expect(savedState.adaptiveInput?.canonicalObservations).toEqual(observations);
    expect(savedState.adaptiveInput?.mapping).toEqual(mapping);
    expect(savedState.adaptiveInput?.rawLineage).toEqual(lineage);
    expect(savedState.experimentWorkspace?.entrySourceHistory).toEqual(entrySourceHistory);
    expect(savedState.adaptiveInput?.contract.factors[0]?.levels).toEqual(["Control", "Drug"]);

    view.unmount();
    const reopened = rehydrateExperimentWorkspace(savedState)!;
    expect(reopened.draft.entrySourceHistory).toEqual(entrySourceHistory);
    render(
      <ExperimentWorkspace
        initialDraft={reopened.draft}
        initialCells={reopened.cells}
        initialGraphs={reopened.graphs}
        initialDataViewMode={reopened.dataViewMode}
        initialProject={{ state: savedState, target: "C:/tmp/compatible-revision.lsa" }}
        onBack={vi.fn()}
      />,
    );
    fireEvent.click(screen.getByRole("button", { name: "1測定1行" }));
    const expanded = screen.getByRole("table", { name: "すべての値を表示" });
    expect(within(expanded).getByDisplayValue("Dish-1")).toBeVisible();
    expect(within(expanded).getByDisplayValue("Dish-2")).toBeVisible();
    expect(
      [...expanded.querySelectorAll('[data-column-role="source_row"]')].map(
        (cell) => cell.textContent,
      ),
    ).toEqual(["2", "3"]);
  });

  it("safe-stops observed-level deletion and restores the untouched workspace on Cancel", () => {
    const { workspace } = fixture();
    render(
      <ExperimentWorkspace
        initialDraft={workspace.draft!}
        initialCells={workspace.cells}
        onBack={vi.fn()}
      />,
    );

    editStructure();
    fireEvent.change(screen.getByRole("textbox", { name: "行 1 列 1" }), {
      target: { value: "" },
    });
    const applyButton = screen.getByRole("button", { name: "変更を適用" });
    applyButton.focus();
    fireEvent.click(applyButton);
    expect(screen.getByRole("alert")).toHaveTextContent(/既存データで使われている/);
    expect(applyButton).toHaveFocus();
    expect(
      screen.getByRole("heading", { name: "実験の組み立てを修正" }).closest("section"),
    ).toContainElement(document.activeElement as HTMLElement);
    fireEvent.click(screen.getByRole("button", { name: "変更せず戻る" }));
    expect(screen.getByRole("button", { name: "実験の組み立てを修正" })).toHaveFocus();
    fireEvent.click(screen.getByRole("button", { name: "1測定1行" }));
    expect(screen.getByRole("table", { name: "すべての値を表示" })).toHaveTextContent("Control");
  });

  it("retains stable Graph appearance but removes prior analysis and p-value annotations", async () => {
    const { contract, workspace } = fixture();
    const saveProject = vi.fn<SaveProjectAction>(async (state, target) => ({
      state,
      target: target ?? "C:/tmp/revision-analysis-invalidated.lsa",
    }));
    render(
      <ExperimentWorkspace
        initialDraft={workspace.draft!}
        initialCells={workspace.cells}
        initialGraphs={[analyzedGraph(contract)]}
        onBack={vi.fn()}
        saveProject={saveProject}
      />,
    );

    editStructure();
    fireEvent.change(screen.getByRole("textbox", { name: "行 1 列 3" }), {
      target: { value: "" },
    });
    fireEvent.click(screen.getByRole("button", { name: "変更を適用" }));
    expect(screen.getByText(/以前の解析結果・p値注釈・Methodsは外しました/)).toBeVisible();
    fireEvent.click(screen.getByRole("button", { name: "プロジェクトを保存" }));
    await waitFor(() => expect(saveProject).toHaveBeenCalledOnce());

    const saved = saveProject.mock.calls[0]![0];
    expect(saved.analysisRuns).toHaveLength(0);
    expect(saved.experimentWorkspace?.graphs).toHaveLength(1);
    expect(saved.experimentWorkspace?.graphs[0]).toMatchObject({
      id: "graph.structure-revision",
      displayName: "Control / Drug",
      analysisRunId: null,
      statisticsAnnotation: { mode: "hidden", testIndex: 0 },
      statisticsAnnotations: [],
      dataSets: { comparisonSet: [], annotationSet: [] },
    });
  });
});

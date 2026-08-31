import type { AnalysisEngineResult } from "@lsaa/analysis-contracts";
import { describe, expect, it } from "vitest";

import {
  createExperimentSetDraft,
  experimentCellKey,
  type ExperimentCellMap,
  type ExperimentSetDraft,
} from "../../app/experimentDraft";
import { assessDraftGraphAnalysis } from "../../app/experimentDraftAnalysis";
import type {
  WorkspaceGraphAnalysis,
  WorkspaceGraphState,
} from "../../app/experimentWorkspaceProject";
import {
  createExperimentGraphMethodsText,
  statisticalMethodForContrastIntent,
} from "./experimentGraphStatistics";

type GraphAppearance = WorkspaceGraphState["appearance"];
type AxisSettings = WorkspaceGraphState["axes"];
type LayerState = WorkspaceGraphState["layers"];

function fixture(): { draft: ExperimentSetDraft; cells: ExperimentCellMap } {
  const base = createExperimentSetDraft("cell_culture", "proportion");
  const draft: ExperimentSetDraft = {
    ...base,
    conditions: base.conditions.slice(0, 2).map((condition, index) => ({
      ...condition,
      label: index === 0 ? "Control" : "Treatment",
      attributes: { "attribute.1": index === 0 ? "Control" : "Treatment" },
    })),
  };
  const cells: Record<string, ExperimentCellMap[string]> = {};
  draft.experiments.forEach((experiment, experimentIndex) => {
    draft.conditions.forEach((condition, conditionIndex) => {
      cells[
        experimentCellKey({
          experimentId: experiment.id,
          conditionId: condition.id,
          readoutId: draft.readouts[0]!.id,
        })
      ] = {
        kind: "proportion",
        positive: 30 + experimentIndex * 4 + conditionIndex * 10,
        eligible: 100,
      };
    });
  });
  return { draft, cells };
}

const result: AnalysisEngineResult = {
  protocolVersion: "0.1.0",
  requestId: "request.graph.methods",
  status: "ok",
  engine: { name: "fixture-engine", version: "0.1.0", packages: { scipy: "1" } },
  estimates: [],
  tests: [
    {
      name: "welch_two_sample_t_test",
      statisticName: "t",
      statistic: -2.5,
      degreesOfFreedom: [3.8],
      pValue: 0.042,
      adjustedPValue: null,
      effectSizeName: "hedges_g",
      effectSize: -1.1,
    },
  ],
  diagnostics: [],
  warnings: [],
  completedAt: "2026-08-31T00:00:00.000Z",
};

describe("experiment Graph Statistics orchestration", () => {
  it("keeps the existing deterministic method transition for each comparison intent", () => {
    expect(statisticalMethodForContrastIntent("all_pairs")).toBe("welch_anova");
    expect(statisticalMethodForContrastIntent("control_vs_many")).toBe("one_way_anova");
    expect(statisticalMethodForContrastIntent("omnibus_only")).toBe("kruskal_wallis");
    expect(statisticalMethodForContrastIntent("planned_comparisons")).toBe("one_way_anova");
  });

  it("returns no Methods before an authoritative analysis succeeds", () => {
    const { draft } = fixture();
    expect(
      createExperimentGraphMethodsText({
        analysis: null,
        draft,
        selectedReadoutId: draft.readouts[0]!.id,
        layers: {} as LayerState,
        appearance: {} as GraphAppearance,
        axes: {} as AxisSettings,
        graphType: "dot",
        timeAnalysis: { kind: "selected_timepoint" },
      }),
    ).toBeNull();
  });

  it("adds Graph presentation metadata without changing the executed request", () => {
    const { draft, cells } = fixture();
    const assessment = assessDraftGraphAnalysis({
      draft,
      cells,
      readoutId: draft.readouts[0]!.id,
      conditionIds: draft.conditions.map(({ id }) => id),
    });
    if (!assessment.request) throw new Error("Fixture must produce an executable request");
    const analysis: WorkspaceGraphAnalysis = { request: assessment.request, result };
    const requestBefore = JSON.stringify(analysis.request);
    const text = createExperimentGraphMethodsText({
      analysis,
      draft,
      selectedReadoutId: draft.readouts[0]!.id,
      layers: { errorBar: true } as LayerState,
      appearance: {
        errorBar: "sd",
        boxWhiskerMode: "min_max",
        uncertaintyStyle: "error_bars",
      } as GraphAppearance,
      axes: { xSemantic: "categorical", xTitle: "", xUnit: "" } as AxisSettings,
      graphType: "box",
      timeAnalysis: { kind: "selected_timepoint" },
    });

    expect(text).toContain("Box whiskers: minimum–maximum.");
    expect(JSON.stringify(analysis.request)).toBe(requestBefore);
  });
});

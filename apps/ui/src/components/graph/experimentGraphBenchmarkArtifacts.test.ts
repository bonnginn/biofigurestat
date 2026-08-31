import { AnalysisEngineRequestSchema } from "@lsaa/analysis-contracts";
import { describe, expect, it } from "vitest";
import type { BenchmarkRunState } from "../../app/benchmarkEvaluation";
import { createExperimentSetDraft } from "../../app/experimentDraft";
import {
  benchmarkContrastForRequest,
  createDefaultBenchmarkGraphArtifacts,
  createFinalBenchmarkArtifacts,
  createBenchmarkRunArtifact,
  createBenchmarkStatisticsArtifact,
} from "./experimentGraphBenchmarkArtifacts";

describe("Graph benchmark artifact builders", () => {
  it("preserves the declared multi-group contrast without inferring another comparison", () => {
    const request = AnalysisEngineRequestSchema.parse({
      protocolVersion: "0.2.0",
      requestId: "request.artifact",
      projectId: "project.artifact",
      analysisId: "analysis.artifact",
      templateId: "D03",
      templateVersion: "0.1.0",
      method: "welch_anova",
      conditionIds: ["vehicle", "drug-a", "drug-b"],
      contrastIntent: "control_vs_many",
      controlConditionId: "vehicle",
      primaryContrastConditionIds: ["vehicle", "drug-a"],
      plannedContrastConditionIds: [["vehicle", "drug-a"]],
      observations: ["vehicle", "drug-a", "drug-b"].flatMap((conditionId, conditionIndex) =>
        [0, 1].map((replicate) => ({
          observationId: `observation.${conditionIndex}.${replicate}`,
          conditionId,
          experimentalUnitId: `unit.${conditionIndex}.${replicate}`,
          value: conditionIndex + replicate / 10,
        })),
      ),
      options: {
        alternative: "two_sided",
        confidenceLevel: 0.95,
        multiplicityMethod: "games_howell_all_pairs",
      },
    });

    expect(benchmarkContrastForRequest(request)).toEqual({
      intent: "control_vs_many",
      controlConditionId: "vehicle",
      plannedConditionPairs: [["vehicle", "drug-a"]],
    });
  });

  it("records an explicitly descriptive workflow as not performed", () => {
    const draft = createExperimentSetDraft("cell_culture", "nested_continuous");
    const artifact = createBenchmarkStatisticsArtifact({
      draft,
      analysis: null,
      analysisAssessment: { nByCondition: [] },
      selectedReadoutId: draft.readouts[0]!.id,
      selectedConditionIds: draft.conditions.map(({ id }) => id),
      analysisConditionIds: [],
    });

    expect(artifact).toMatchObject({
      selectedMethod: null,
      state: "not_performed",
      statisticalUnit: draft.conditionAssignment.unitLabel,
    });
    expect(artifact).not.toHaveProperty("request");
  });

  it("counts rendered and analysis edits independently in run.json", () => {
    const run: BenchmarkRunState = {
      identity: {
        benchmarkVersion: "1.0.0",
        caseId: "case.1",
        track: "track_A",
        runId: "run.1",
      },
      startedAt: "2026-08-31T00:00:00.000Z",
      outcome: "completed",
      supportStatus: "direct",
      defaultGraphCaptured: true,
      defaultGraphCapture: null,
      finalGraphCapture: null,
      events: [
        {
          sequence: 1,
          occurredAt: "2026-08-31T00:01:00.000Z",
          type: "graph_configuration_changed",
          effect: "rendered_graph",
          detail: {},
        },
        {
          sequence: 2,
          occurredAt: "2026-08-31T00:02:00.000Z",
          type: "analysis_configuration_changed",
          effect: "analysis_only",
          detail: {},
        },
        {
          sequence: 3,
          occurredAt: "2026-08-31T00:03:00.000Z",
          type: "graph_configuration_changed",
          effect: "both",
          detail: {},
        },
      ],
    };

    expect(
      createBenchmarkRunArtifact({
        run,
        analysis: null,
        sourceRevision: "revision.test",
        completedAt: "2026-08-31T00:04:00.000Z",
      }),
    ).toMatchObject({
      interactionCount: 3,
      graphEditCount: 2,
      renderedGraphEditCount: 2,
      analysisEditCount: 2,
      engineVersion: "not_applicable",
      sourceRevision: "revision.test",
    });
  });

  it("builds the default and final artifact manifests without changing encodings", () => {
    expect(
      createDefaultBenchmarkGraphArtifacts({ svgText: "<svg />", pngBase64: "cG5n" }),
    ).toEqual([
      { name: "default_graph.svg", content: "<svg />", mediaType: "image/svg+xml" },
      {
        name: "default_graph.png",
        content: "cG5n",
        encoding: "base64",
        mediaType: "image/png",
      },
    ]);

    const artifacts = createFinalBenchmarkArtifacts({
      runArtifact: { outcome: "completed" },
      svgText: "<svg />",
      pngBase64: "cG5n",
      statisticsArtifact: { state: "current" },
      methodsText: "Welch ANOVA",
      graphState: { graphType: "dot" },
      interactionLog: [],
    });

    expect(artifacts.map(({ name }) => name)).toEqual([
      "run.json",
      "final_graph.svg",
      "final_graph.png",
      "statistics.json",
      "methods.txt",
      "graph_state.json",
      "interaction_log.json",
    ]);
    expect(artifacts.find(({ name }) => name === "final_graph.png")).toMatchObject({
      encoding: "base64",
      mediaType: "image/png",
    });
    expect(
      JSON.parse(artifacts.find(({ name }) => name === "statistics.json")!.content),
    ).toEqual({ state: "current" });
  });
});

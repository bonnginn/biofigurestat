import { AnalysisEngineRequestSchema } from "@lsaa/analysis-contracts";
import { describe, expect, it } from "vitest";
import type { BenchmarkRunState } from "../../app/benchmarkEvaluation";
import { createExperimentSetDraft } from "../../app/experimentDraft";
import {
  benchmarkContrastForRequest,
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
});

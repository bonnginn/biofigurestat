import type { AnalysisRecommendation } from "@lsaa/analysis-contracts";
import {
  experimentCellKey,
  type ExperimentCellDraft,
  type ExperimentCellMap,
  type ExperimentSetDraft,
} from "./experimentDraft";

import {
  createIndependentTwoGroupFixture,
  createLongitudinalFixture,
  createNestedContinuousFixture,
  createPairedTwoConditionFixture,
  createSimpleIndependentContinuousFixture,
  type SyntheticFixture,
} from "./syntheticFixtures";

export type BenchmarkPilotCase = Readonly<{
  benchmarkVersion: "LSA50_v1_1";
  caseId:
    | "pilot_independent_2group"
    | "pilot_independent_3group"
    | "pilot_paired_2condition"
    | "pilot_nested_microscopy"
    | "pilot_longitudinal_endpoint";
  title: string;
  fixture: () => SyntheticFixture;
  expected: Readonly<{
    template: "D01" | "D02" | "D03";
    recommendedMethod: AnalysisRecommendation["recommendedMethod"];
    allowedMethods: readonly AnalysisRecommendation["recommendedMethod"][];
    biologicalNOnly: true;
    timeMetric?: "endpoint";
  }>;
  requiredArtifacts: readonly string[];
}>;

const REQUIRED_ARTIFACTS = [
  "run.json",
  "default_graph.png",
  "default_graph.svg",
  "final_graph.png",
  "final_graph.svg",
  "statistics.json",
  "methods.txt",
  "graph_state.json",
  "interaction_log.json",
] as const;

export const BENCHMARK_PILOT_CASES: readonly BenchmarkPilotCase[] = [
  {
    benchmarkVersion: "LSA50_v1_1",
    caseId: "pilot_independent_2group",
    title: "Independent two-group continuous",
    fixture: createIndependentTwoGroupFixture,
    expected: {
      template: "D01",
      recommendedMethod: "welch_t",
      allowedMethods: ["welch_t", "mann_whitney", "student_t"],
      biologicalNOnly: true,
    },
    requiredArtifacts: REQUIRED_ARTIFACTS,
  },
  {
    benchmarkVersion: "LSA50_v1_1",
    caseId: "pilot_independent_3group",
    title: "Independent three-group continuous",
    fixture: createSimpleIndependentContinuousFixture,
    expected: {
      template: "D03",
      recommendedMethod: "welch_anova",
      allowedMethods: ["welch_anova", "one_way_anova", "kruskal_wallis"],
      biologicalNOnly: true,
    },
    requiredArtifacts: REQUIRED_ARTIFACTS,
  },
  {
    benchmarkVersion: "LSA50_v1_1",
    caseId: "pilot_paired_2condition",
    title: "Paired two-condition",
    fixture: createPairedTwoConditionFixture,
    expected: {
      template: "D02",
      recommendedMethod: "paired_t",
      allowedMethods: ["paired_t", "wilcoxon_signed_rank"],
      biologicalNOnly: true,
    },
    requiredArtifacts: REQUIRED_ARTIFACTS,
  },
  {
    benchmarkVersion: "LSA50_v1_1",
    caseId: "pilot_nested_microscopy",
    title: "Nested microscopy summarized per experiment",
    fixture: createNestedContinuousFixture,
    expected: {
      template: "D01",
      recommendedMethod: "welch_t",
      allowedMethods: ["welch_t", "mann_whitney", "student_t"],
      biologicalNOnly: true,
    },
    requiredArtifacts: REQUIRED_ARTIFACTS,
  },
  {
    benchmarkVersion: "LSA50_v1_1",
    caseId: "pilot_longitudinal_endpoint",
    title: "Longitudinal stable-unit endpoint",
    fixture: createLongitudinalFixture,
    expected: {
      template: "D02",
      recommendedMethod: "paired_t",
      allowedMethods: ["paired_t", "wilcoxon_signed_rank"],
      biologicalNOnly: true,
      timeMetric: "endpoint",
    },
    requiredArtifacts: REQUIRED_ARTIFACTS,
  },
] as const;

export type BenchmarkPilotLoadAssessment = Readonly<{
  compatible: boolean;
  reason: string;
  cells: ExperimentCellMap;
}>;

function cloneCell(cell: ExperimentCellDraft): ExperimentCellDraft {
  if (cell.kind === "nested_continuous") return { ...cell, rawValues: [...cell.rawValues] };
  if (cell.kind === "categorical_counts") return { ...cell, counts: { ...cell.counts } };
  return { ...cell };
}

/** Maps deterministic values by declared row/session order only after the researcher built a matching design. */
export function mapBenchmarkPilotMeasurements(
  pilot: BenchmarkPilotCase,
  target: ExperimentSetDraft,
): BenchmarkPilotLoadAssessment {
  const source = pilot.fixture();
  const mismatch = (reason: string): BenchmarkPilotLoadAssessment => ({
    compatible: false,
    reason,
    cells: {},
  });
  if (
    target.readouts.length !== 1 ||
    target.readouts[0]?.shape !== source.draft.readouts[0]?.shape
  ) {
    return mismatch(
      `測定項目の種類を${source.draft.readouts[0]?.shape ?? "不明"}の1項目にしてください。`,
    );
  }
  if (target.conditions.length !== source.draft.conditions.length) {
    return mismatch(`条件数を${source.draft.conditions.length}にしてください。`);
  }
  if (target.experiments.length !== source.draft.experiments.length) {
    return mismatch(`実験単位／実験回を${source.draft.experiments.length}にしてください。`);
  }
  if (target.conditionAssignment.kind !== source.draft.conditionAssignment.kind) {
    return mismatch(
      source.draft.conditionAssignment.kind === "matched"
        ? "同じ安定した実験単位を条件間で測る設計にしてください。"
        : "条件ごとに別々の実験単位を用いる設計にしてください。",
    );
  }
  if (
    target.time.sampling !== source.draft.time.sampling ||
    target.time.unit !== source.draft.time.unit ||
    target.time.points.length !== source.draft.time.points.length ||
    target.time.points.some(
      (point, index) => point.value !== source.draft.time.points[index]?.value,
    )
  ) {
    const expected = source.draft.time.points.length
      ? source.draft.time.points.map(({ value }) => value).join("、")
      : "なし";
    return mismatch(
      `時間構造をPilot（${source.draft.time.sampling}；時点 ${expected}）と合わせてください。`,
    );
  }

  const cells: Record<string, ExperimentCellDraft> = {};
  target.experiments.forEach((targetExperiment, experimentIndex) => {
    const sourceExperiment = source.draft.experiments[experimentIndex];
    target.conditions.forEach((targetCondition, conditionIndex) => {
      const sourceCondition = source.draft.conditions[conditionIndex];
      const targetReadout = target.readouts[0];
      const sourceReadout = source.draft.readouts[0];
      if (!sourceExperiment || !sourceCondition || !targetReadout || !sourceReadout) return;
      const targetTimes = target.time.points.length ? target.time.points : [undefined];
      const sourceTimes = source.draft.time.points.length ? source.draft.time.points : [undefined];
      targetTimes.forEach((targetTime, timeIndex) => {
        const sourceTime = sourceTimes[timeIndex];
        const sourceCell =
          source.cells[
            experimentCellKey({
              experimentId: sourceExperiment.id,
              conditionId: sourceCondition.id,
              readoutId: sourceReadout.id,
              timePointId: sourceTime?.id,
            })
          ];
        if (!sourceCell) return;
        cells[
          experimentCellKey({
            experimentId: targetExperiment.id,
            conditionId: targetCondition.id,
            readoutId: targetReadout.id,
            timePointId: targetTime?.id,
          })
        ] = cloneCell(sourceCell);
      });
    });
  });
  return {
    compatible: true,
    reason: `${pilot.title}の決定論的な合成値を現在の条件・時間・実験単位の並びに対応づけます。`,
    cells,
  };
}

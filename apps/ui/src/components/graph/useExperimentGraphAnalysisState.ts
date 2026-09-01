import { useMemo, useState } from "react";

import type { TimeAnalysisPlan } from "../../app/experimentDraft";
import type {
  WorkspaceGraphAnalysis,
  WorkspaceGraphState,
} from "../../app/experimentWorkspaceProject";
import {
  createAdjustedComparisonAnnotation,
  createSelectedComparisonAnnotation,
} from "./experimentGraphAnnotations";
import { useAdjustedStatisticsAnnotations } from "./useAdjustedStatisticsAnnotations";

type StatisticsAnnotation = NonNullable<WorkspaceGraphState["statisticsAnnotation"]>;
type StatisticsAnnotationEntry = NonNullable<WorkspaceGraphState["statisticsAnnotations"]>[number];

export function useExperimentGraphAnalysisState(input: Readonly<{
  initialState?: Omit<WorkspaceGraphState, "id" | "displayName">;
  sourceMode: "raw_readout" | "derived_metric";
  timeAnalysis: TimeAnalysisPlan;
  analysisTimePointId: string | null;
}>) {
  const [analysis, setAnalysis] = useState<WorkspaceGraphAnalysis | null>(
    input.initialState?.analysis ?? null,
  );
  const [statisticsAnnotation, setStatisticsAnnotation] = useState<StatisticsAnnotation>(
    input.initialState?.statisticsAnnotation ?? { mode: "hidden", testIndex: 0 },
  );
  const [statisticsAnnotations, setStatisticsAnnotations] = useState<StatisticsAnnotationEntry[]>(
    () => [...(input.initialState?.statisticsAnnotations ?? [])],
  );
  const analysisResult = analysis?.result ?? null;
  const adjustedComparisonAnnotations = useMemo(
    () =>
      analysisResult?.status === "ok"
        ? analysisResult.tests.flatMap((test, testIndex) => {
            const annotation = createAdjustedComparisonAnnotation({
              test,
              testIndex,
              requestId: analysisResult.requestId,
              sourceMode: input.sourceMode,
              timeAnalysis: input.timeAnalysis,
              analysisTimePointId: input.analysisTimePointId,
            });
            return annotation ? [annotation] : [];
          })
        : [],
    [analysisResult, input.analysisTimePointId, input.sourceMode, input.timeAnalysis],
  );

  useAdjustedStatisticsAnnotations({
    initialRequestId: input.initialState?.analysis?.result.requestId ?? null,
    analysisResult,
    adjustedAnnotations: adjustedComparisonAnnotations,
    setStatisticsAnnotations,
  });

  const addSelectedComparisonAnnotation = () => {
    if (analysisResult?.status !== "ok") return;
    const test = analysisResult.tests[statisticsAnnotation.testIndex];
    if (!test) return;
    const next = createSelectedComparisonAnnotation({
      test,
      testIndex: statisticsAnnotation.testIndex,
      requestId: analysisResult.requestId,
      mode: statisticsAnnotation.mode,
      sourceMode: input.sourceMode,
      timeAnalysis: input.timeAnalysis,
      analysisTimePointId: input.analysisTimePointId,
    });
    setStatisticsAnnotations((current) => [
      ...current.filter(({ testIndex }) => testIndex !== next.testIndex),
      next,
    ]);
  };

  return {
    analysis,
    setAnalysis,
    analysisResult,
    statisticsAnnotation,
    setStatisticsAnnotation,
    statisticsAnnotations,
    setStatisticsAnnotations,
    adjustedComparisonAnnotations,
    addSelectedComparisonAnnotation,
  };
}

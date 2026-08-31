import { useEffect, useRef, type Dispatch, type SetStateAction } from "react";
import type {
  WorkspaceGraphAnalysis,
  WorkspaceGraphState,
} from "../../app/experimentWorkspaceProject";

type StatisticsAnnotationEntry = NonNullable<WorkspaceGraphState["statisticsAnnotations"]>[number];

export function useAdjustedStatisticsAnnotations(input: Readonly<{
  initialRequestId: string | null;
  analysisResult: WorkspaceGraphAnalysis["result"] | null;
  adjustedAnnotations: readonly StatisticsAnnotationEntry[];
  setStatisticsAnnotations: Dispatch<SetStateAction<StatisticsAnnotationEntry[]>>;
}>): void {
  const appliedRequestRef = useRef(input.initialRequestId);
  useEffect(() => {
    if (!input.analysisResult || input.analysisResult.status !== "ok") return;
    if (appliedRequestRef.current === input.analysisResult.requestId) return;
    appliedRequestRef.current = input.analysisResult.requestId;
    input.setStatisticsAnnotations([...input.adjustedAnnotations]);
  }, [input.adjustedAnnotations, input.analysisResult, input.setStatisticsAnnotations]);
}

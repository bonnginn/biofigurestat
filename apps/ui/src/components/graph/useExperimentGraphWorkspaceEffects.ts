import {
  useEffect,
  useLayoutEffect,
  useRef,
  type Dispatch,
  type SetStateAction,
} from "react";
import type {
  WorkspaceGraphAnalysis,
  WorkspaceGraphState,
} from "../../app/experimentWorkspaceProject";

export type GraphInspectorTarget =
  | "background"
  | "x-axis"
  | "y-axis"
  | "data"
  | "raw-dots"
  | "experiment-summary"
  | "series-style"
  | "violin"
  | "box"
  | "error-bar"
  | "connecting-line"
  | "legend"
  | "annotation"
  | "statistics";

type GraphStateSnapshot = Omit<WorkspaceGraphState, "id" | "displayName">;
type StatisticsAnnotation = NonNullable<WorkspaceGraphState["statisticsAnnotation"]>;
type StatisticsAnnotationEntry = NonNullable<WorkspaceGraphState["statisticsAnnotations"]>[number];

export function useExperimentGraphWorkspaceEffects(input: Readonly<{
  workspaceMode: "graph" | "statistics" | "combined";
  initialAnalysis: WorkspaceGraphAnalysis | null | undefined;
  graphStateSnapshot: GraphStateSnapshot;
  onStateChange: ((state: GraphStateSnapshot) => void) | undefined;
  setInspectorTarget: Dispatch<SetStateAction<GraphInspectorTarget>>;
  setAnalysis: Dispatch<SetStateAction<WorkspaceGraphAnalysis | null>>;
  setStatisticsAnnotation: Dispatch<SetStateAction<StatisticsAnnotation>>;
  setStatisticsAnnotations: Dispatch<SetStateAction<StatisticsAnnotationEntry[]>>;
}>): void {
  useEffect(() => {
    input.setInspectorTarget(input.workspaceMode === "statistics" ? "statistics" : "data");
  }, [input.setInspectorTarget, input.workspaceMode]);

  useEffect(() => {
    if (input.initialAnalysis) return;
    input.setAnalysis(null);
    input.setStatisticsAnnotation({ mode: "hidden", testIndex: 0 });
    input.setStatisticsAnnotations([]);
  }, [
    input.initialAnalysis,
    input.setAnalysis,
    input.setStatisticsAnnotation,
    input.setStatisticsAnnotations,
  ]);

  const onStateChangeRef = useRef(input.onStateChange);
  useLayoutEffect(() => {
    onStateChangeRef.current = input.onStateChange;
  }, [input.onStateChange]);

  useLayoutEffect(() => {
    onStateChangeRef.current?.(input.graphStateSnapshot);
  }, [input.graphStateSnapshot]);
}

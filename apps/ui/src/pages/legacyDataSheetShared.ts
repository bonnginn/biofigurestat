import type { AnalysisEngineRequest, AnalysisEngineResult } from "@lsaa/analysis-contracts";
import type { CoreGraphModel, GraphSpec } from "@lsaa/graph-spec";

export type LegacyDataSheetAnalysisRun = Readonly<{
  request: AnalysisEngineRequest;
  result: AnalysisEngineResult;
  graphSpec: GraphSpec | null;
  graphModel: CoreGraphModel | null;
}>;

type EngineObservation = AnalysisEngineRequest["observations"][number];

export function numericEngineObservations(
  observations: readonly EngineObservation[],
): Array<EngineObservation & { value: number }> {
  return observations.filter(
    (observation): observation is EngineObservation & { value: number } =>
      typeof observation.value === "number",
  );
}

export type LegacyWorkflowTabId = "input" | "analysis" | "graph" | "save";

export const LEGACY_WORKFLOW_TABS: ReadonlyArray<{
  id: LegacyWorkflowTabId;
  label: string;
}> = [
  { id: "input", label: "1 データ入力" },
  { id: "analysis", label: "2 解析" },
  { id: "graph", label: "3 グラフ" },
  { id: "save", label: "4 保存" },
];

let fallbackSequence = 0;

export function createLegacyWorkspaceToken(): string {
  if (typeof crypto !== "undefined" && typeof crypto.randomUUID === "function") {
    return crypto.randomUUID();
  }
  fallbackSequence += 1;
  return `${Date.now().toString(36)}.${fallbackSequence}`;
}

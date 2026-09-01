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
  label: Readonly<{ ja: string; en: string }>;
}> = [
  { id: "input", label: { ja: "1 データ入力", en: "1 Data entry" } },
  { id: "analysis", label: { ja: "2 解析", en: "2 Analysis" } },
  { id: "graph", label: { ja: "3 グラフ", en: "3 Graph" } },
  { id: "save", label: { ja: "4 保存", en: "4 Save" } },
];

let fallbackSequence = 0;

export function createLegacyWorkspaceToken(): string {
  if (typeof crypto !== "undefined" && typeof crypto.randomUUID === "function") {
    return crypto.randomUUID();
  }
  fallbackSequence += 1;
  return `${Date.now().toString(36)}.${fallbackSequence}`;
}

import {
  regressionInputsEqual,
  UnresolvedVisualizationProjectStateSchema,
  type TableRegressionDraft,
  type TableRegressionSnapshot,
  type TableRegressionWorkspace,
  type UnresolvedVisualizationProjectState,
} from "@lsaa/project";
import type { CommonCoverageDraft } from "./specializedAnalysisDrafts";

/** Object property order may change when the save schema validates engine output. */
export function regressionSnapshotToken(snapshot: TableRegressionSnapshot): string {
  return JSON.stringify(snapshot, (_key, value: unknown) =>
    value && typeof value === "object" && !Array.isArray(value)
      ? Object.fromEntries(Object.entries(value).sort(([a], [b]) => a.localeCompare(b)))
      : value,
  );
}

export function regressionDraftForSave(draft: CommonCoverageDraft): TableRegressionDraft {
  const { text, includeIntercept, xLabel, yLabel, xUnit, yUnit, xScale, yScale, showBand } = draft;
  return { text, includeIntercept, xLabel, yLabel, xUnit, yUnit, xScale, yScale, showBand };
}
export function regressionSnapshot(workspace: TableRegressionWorkspace): TableRegressionSnapshot {
  return {
    draft: workspace.draft,
    execution:
      workspace.executions.find((e) => e.request.requestId === workspace.activeRequestId) ?? null,
  };
}
/** Append history at successful save boundaries; never replace old raw tables or executions. */
export function withTableRegression(
  state: UnresolvedVisualizationProjectState,
  snapshot: TableRegressionSnapshot,
  sourceDataRevisionId: string,
): UnresolvedVisualizationProjectState {
  const previous = state.regressionWorkspace;
  const executions = [...(previous?.executions ?? [])];
  if (
    snapshot.execution &&
    !executions.some((e) => e.request.requestId === snapshot.execution!.request.requestId)
  )
    executions.push(snapshot.execution);
  const draftHistory = [...(previous?.draftHistory ?? [])];
  const tip = draftHistory.at(-1);
  if (
    !tip ||
    tip.sourceDataRevisionId !== sourceDataRevisionId ||
    JSON.stringify(tip.draft) !== JSON.stringify(snapshot.draft)
  )
    draftHistory.push({
      capturedAt: new Date().toISOString(),
      sourceDataRevisionId,
      draft: snapshot.draft,
    });
  const active =
    snapshot.execution &&
    snapshot.execution.sourceDataRevisionId === state.activeDataRevisionId &&
    sourceDataRevisionId === state.activeDataRevisionId &&
    regressionInputsEqual(snapshot.draft, snapshot.execution.draft)
      ? snapshot.execution.request.requestId
      : null;
  return UnresolvedVisualizationProjectStateSchema.parse({
    ...state,
    regressionWorkspace: {
      schemaVersion: "0.1.0",
      independentUnitsConfirmed: true,
      sourceDataRevisionId,
      draft: snapshot.draft,
      draftHistory,
      executions,
      activeRequestId: active,
    },
  });
}

import type { ExperimentSetDraft } from "./experimentDraft";
import type { WorkspaceGraphState } from "./experimentWorkspaceProject";
import type { CanonicalWorksheetFileCommit } from "../components/CanonicalMatrixWorksheet";

export const stableWorkspaceCoordinate = (value: unknown): string => {
  const normalize = (candidate: unknown): unknown =>
    Array.isArray(candidate)
      ? candidate.map(normalize)
      : candidate && typeof candidate === "object"
        ? Object.fromEntries(
            Object.entries(candidate)
              .sort(([left], [right]) => left.localeCompare(right))
              .map(([key, entry]) => [key, normalize(entry)]),
          )
        : candidate;
  return JSON.stringify(normalize(value));
};

export function isSameCanonicalWorksheetIngress(
  existing: Readonly<{
    mapping: CanonicalWorksheetFileCommit["mapping"] | null;
    rawLineage: CanonicalWorksheetFileCommit["rawLineage"];
  }>,
  incoming: Pick<CanonicalWorksheetFileCommit, "mapping" | "rawLineage">,
): boolean {
  if (!existing.mapping) return false;
  const mappingSignature = (mapping: CanonicalWorksheetFileCommit["mapping"]) =>
    stableWorkspaceCoordinate({
      schemaVersion: mapping.schemaVersion,
      sourceLabel: mapping.sourceLabel,
      delimiter: mapping.delimiter,
      headerRow: mapping.headerRow,
      columns: mapping.columns,
    });
  return (
    existing.rawLineage.sourceKind === incoming.rawLineage.sourceKind &&
    existing.rawLineage.sourceLabel === incoming.rawLineage.sourceLabel &&
    existing.rawLineage.rawText === incoming.rawLineage.rawText &&
    mappingSignature(existing.mapping) === mappingSignature(incoming.mapping)
  );
}

export function graphReferencesRemainStable(
  before: ExperimentSetDraft,
  after: ExperimentSetDraft,
  graph: WorkspaceGraphState,
): boolean {
  const oldConditions = new Map(before.conditions.map((condition) => [condition.id, condition]));
  const newConditions = new Map(after.conditions.map((condition) => [condition.id, condition]));
  const conditionIds = new Set([
    ...graph.selectedConditionIds,
    ...(graph.analysisConditionIds ?? []),
    ...(graph.dataSets?.displaySet.conditionIds ?? []),
    ...(graph.dataSets?.analysisSet.conditionIds ?? []),
  ]);
  if (
    [...conditionIds].some(
      (id) =>
        !oldConditions.has(id) ||
        !newConditions.has(id) ||
        stableWorkspaceCoordinate(oldConditions.get(id)?.attributes) !==
          stableWorkspaceCoordinate(newConditions.get(id)?.attributes),
    )
  )
    return false;

  const oldReadout = before.readouts.find(({ id }) => id === graph.selectedReadoutId);
  const newReadout = after.readouts.find(({ id }) => id === graph.selectedReadoutId);
  if (!oldReadout || !newReadout || oldReadout.shape !== newReadout.shape) return false;

  const oldPoints = new Map(before.time.points.map((point) => [point.id, point.value]));
  const newPoints = new Map(after.time.points.map((point) => [point.id, point.value]));
  const timePointIds = new Set([
    ...graph.selectedTimePointIds,
    ...(graph.analysisTimePointId ? [graph.analysisTimePointId] : []),
    ...(graph.dataSets?.displaySet.timePointIds ?? []),
    ...(graph.dataSets?.analysisSet.timePointIds ?? []),
  ]);
  if (
    [...timePointIds].some(
      (id) => !oldPoints.has(id) || !newPoints.has(id) || oldPoints.get(id) !== newPoints.get(id),
    )
  )
    return false;

  const oldFactorIds = new Set(before.attributes.map(({ id }) => id));
  const newFactorIds = new Set(after.attributes.map(({ id }) => id));
  const referencedFactorIds = [
    ...(graph.grouping?.x.factorIds ?? []),
    ...(graph.grouping?.x.factorId ? [graph.grouping.x.factorId] : []),
    ...(graph.grouping?.series.factorId ? [graph.grouping.series.factorId] : []),
    ...(graph.grouping?.color?.factorId ? [graph.grouping.color.factorId] : []),
    ...(graph.grouping?.shape?.factorId ? [graph.grouping.shape.factorId] : []),
    ...(graph.grouping?.facet?.factorId ? [graph.grouping.facet.factorId] : []),
  ];
  return referencedFactorIds.every((id) => oldFactorIds.has(id) && newFactorIds.has(id));
}

export function invalidateGraphAnalysis(graph: WorkspaceGraphState): WorkspaceGraphState {
  return {
    ...graph,
    analysisRunId: null,
    analysis: null,
    statisticsAnnotation: { mode: "hidden", testIndex: 0 },
    statisticsAnnotations: [],
    ...(graph.dataSets
      ? {
          dataSets: {
            ...graph.dataSets,
            comparisonSet: [],
            annotationSet: [],
          },
        }
      : {}),
  };
}

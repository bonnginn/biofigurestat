import type { ExperimentSetDraft } from "./experimentDraft";
import type { WorkspaceGraphState } from "./experimentWorkspaceProject";

export type GraphGrouping = NonNullable<WorkspaceGraphState["grouping"]>;

/**
 * Keeps visual channels disjoint after an axis/series/facet reassignment.
 * Persisted drafts from an older UI can contain a factor in both X hierarchy
 * and series; rendering that stale overlap duplicates the lower axis row.
 */
export function normalizeGraphGroupingChannels(grouping: GraphGrouping): GraphGrouping {
  if (grouping.x.source !== "factor") return grouping;
  const blockedFactorIds = new Set([
    ...(grouping.series.source === "factor" && grouping.series.factorId
      ? [grouping.series.factorId]
      : []),
    ...(grouping.facet?.factorId ? [grouping.facet.factorId] : []),
  ]);
  const requestedFactorIds = grouping.x.factorIds?.length
    ? grouping.x.factorIds
    : grouping.x.factorId
      ? [grouping.x.factorId]
      : [];
  const factorIds = [...new Set(requestedFactorIds)].filter((id) => !blockedFactorIds.has(id));
  if (factorIds.length === 0) return { ...grouping, x: { source: "condition" } };
  if (
    factorIds.length === requestedFactorIds.length &&
    factorIds.every((id, index) => id === requestedFactorIds[index]) &&
    grouping.x.factorId === factorIds[0]
  ) {
    return grouping;
  }
  return {
    ...grouping,
    x: { source: "factor", factorId: factorIds[0], factorIds },
  };
}

function distinctLevelCount(draft: ExperimentSetDraft, factorId: string): number {
  return new Set(
    draft.conditions.flatMap((condition) => {
      const level = condition.attributes[factorId]?.trim();
      return level ? [level] : [];
    }),
  ).size;
}

/**
 * Produces an editable presentation proposal without changing experiment semantics.
 * Explicit visual roles always win. For an otherwise-unassigned two-factor table,
 * the factor with fewer levels becomes the within-X series; ties use the later
 * factor so the question/condition-table order remains predictable.
 */
export function createInitialGraphGrouping(draft: ExperimentSetDraft): GraphGrouping {
  const explicitXFactors = draft.attributes.filter(
    ({ proposedVisualRole }) => proposedVisualRole === "x",
  );
  const explicitSeriesFactor = draft.attributes.find(
    ({ proposedVisualRole }) => proposedVisualRole === "series",
  );
  const timeAsSeries = draft.time.proposedVisualRole === "series";
  const hasExplicitFactorRole = draft.attributes.some(
    ({ proposedVisualRole }) => proposedVisualRole !== undefined && proposedVisualRole !== "none",
  );

  if (explicitXFactors.length > 0 || explicitSeriesFactor || timeAsSeries) {
    const inferredXFactors =
      explicitXFactors.length > 0
        ? explicitXFactors
        : explicitSeriesFactor && draft.attributes.length === 2
          ? draft.attributes.filter(({ id }) => id !== explicitSeriesFactor.id)
          : [];
    const series = explicitSeriesFactor
      ? ({ source: "factor", factorId: explicitSeriesFactor.id } as const)
      : timeAsSeries
        ? ({ source: "time" } as const)
        : ({ source: "none" } as const);
    return {
      x:
        inferredXFactors.length > 0
          ? {
              source: "factor",
              factorId: inferredXFactors[0]!.id,
              factorIds: inferredXFactors.map(({ id }) => id),
            }
          : { source: "condition" },
      series,
      color: series,
      shape: series,
      facet: null,
    };
  }

  if (!hasExplicitFactorRole && draft.time.points.length === 0 && draft.attributes.length === 2) {
    const counts = draft.attributes.map((factor, index) => ({
      factor,
      index,
      levelCount: distinctLevelCount(draft, factor.id),
    }));
    const bothVary = counts.every(({ levelCount }) => levelCount >= 2);
    if (bothVary) {
      const seriesChoice = counts.reduce((best, candidate) => {
        if (candidate.levelCount < best.levelCount) return candidate;
        if (candidate.levelCount === best.levelCount && candidate.index > best.index) {
          return candidate;
        }
        return best;
      });
      const xFactor = counts.find(({ factor }) => factor.id !== seriesChoice.factor.id)!.factor;
      return {
        x: { source: "factor", factorId: xFactor.id, factorIds: [xFactor.id] },
        series: { source: "factor", factorId: seriesChoice.factor.id },
        color: { source: "factor", factorId: seriesChoice.factor.id },
        shape: { source: "factor", factorId: seriesChoice.factor.id },
        facet: null,
      };
    }
  }

  return {
    x: { source: "condition" },
    series: { source: "none" },
    color: { source: "none" },
    shape: { source: "none" },
    facet: null,
  };
}

export function swapSingleXFactorAndSeries(grouping: GraphGrouping): GraphGrouping | null {
  const normalized = normalizeGraphGroupingChannels(grouping);
  if (normalized.x.source !== "factor" || normalized.series.source !== "factor") return null;
  const xFactorIds = normalized.x.factorIds?.length
    ? normalized.x.factorIds
    : normalized.x.factorId
      ? [normalized.x.factorId]
      : [];
  if (xFactorIds.length !== 1 || !normalized.series.factorId) return null;

  return {
    ...normalized,
    x: {
      source: "factor",
      factorId: normalized.series.factorId,
      factorIds: [normalized.series.factorId],
    },
    series: { source: "factor", factorId: xFactorIds[0] },
    color: { source: "factor", factorId: xFactorIds[0] },
    shape: { source: "factor", factorId: xFactorIds[0] },
  };
}

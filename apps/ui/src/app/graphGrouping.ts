import type { ExperimentSetDraft } from "./experimentDraft";
import type { WorkspaceGraphState } from "./experimentWorkspaceProject";

export type GraphGrouping = NonNullable<WorkspaceGraphState["grouping"]>;

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
    ({ proposedVisualRole }) =>
      proposedVisualRole !== undefined && proposedVisualRole !== "none",
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
  if (grouping.x.source !== "factor" || grouping.series.source !== "factor") return null;
  const xFactorIds = grouping.x.factorIds?.length
    ? grouping.x.factorIds
    : grouping.x.factorId
      ? [grouping.x.factorId]
      : [];
  if (xFactorIds.length !== 1 || !grouping.series.factorId) return null;

  return {
    ...grouping,
    x: {
      source: "factor",
      factorId: grouping.series.factorId,
      factorIds: [grouping.series.factorId],
    },
    series: { source: "factor", factorId: xFactorIds[0] },
    color: { source: "factor", factorId: xFactorIds[0] },
    shape: { source: "factor", factorId: xFactorIds[0] },
  };
}

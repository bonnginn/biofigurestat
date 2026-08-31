import {
  cellIsNotPlanned,
  continuousSummary,
  experimentCellKey,
  normalizeWithinExperiment,
  percentage,
  wbRatio,
  type ExperimentCellMap,
  type ExperimentSetDraft,
  type NestedContinuousCellDraft,
  type ProportionCellDraft,
  type ReadoutDraft,
  type TimeAnalysisPlan,
} from "../../app/experimentDraft";
import {
  deriveTimeMetricValue,
  isDerivedTimeMetric,
} from "../../app/experimentDraftAnalysis";
import { normalizeGraphGroupingChannels } from "../../app/graphGrouping";
import type { WorkspaceGraphState } from "../../app/experimentWorkspaceProject";
import type {
  ExperimentPoint,
  GraphSeries,
  ProportionPoint,
  RawPoint,
} from "./experimentGraphDataExport";

type GraphGrouping = NonNullable<WorkspaceGraphState["grouping"]>;

function isProportionCell(cell: unknown): cell is ProportionCellDraft {
  return Boolean(cell && typeof cell === "object" && "kind" in cell && cell.kind === "proportion");
}

function isNestedCell(cell: unknown): cell is NestedContinuousCellDraft {
  return Boolean(
    cell && typeof cell === "object" && "kind" in cell && cell.kind === "nested_continuous",
  );
}

function isWbRatioCell(
  cell: unknown,
): cell is Extract<ExperimentCellMap[string], { kind: "wb_ratio" }> {
  return Boolean(cell && typeof cell === "object" && "kind" in cell && cell.kind === "wb_ratio");
}

export function getGraphCell(
  cells: ExperimentCellMap,
  experimentId: string,
  conditionId: string,
  readoutId: string,
  timePointId?: string,
) {
  return cells[experimentCellKey({ experimentId, conditionId, readoutId, timePointId })];
}

export function graphCellValue(cell: ExperimentCellMap[string] | undefined): number | null {
  if (!cell || cellIsNotPlanned(cell)) return null;
  if (cell.kind === "proportion") return percentage(cell);
  if (cell.kind === "nested_continuous") return continuousSummary(cell.rawValues).mean;
  if (cell.kind === "wb_ratio") return wbRatio(cell);
  return null;
}


export function buildExperimentGraphSeries(
  input: Readonly<{
    draft: ExperimentSetDraft;
    cells: ExperimentCellMap;
    readout: ReadoutDraft | undefined;
    activeConditions: ExperimentSetDraft["conditions"];
    activeTimePoints: ExperimentSetDraft["time"]["points"];
    axes: WorkspaceGraphState["axes"];
    appearance: WorkspaceGraphState["appearance"];
    grouping: GraphGrouping;
    sourceMode: WorkspaceGraphState["sourceMode"];
    timeAnalysis: TimeAnalysisPlan;
  }>,
): readonly GraphSeries[] {
  const {
    draft,
    cells,
    readout,
    activeConditions,
    activeTimePoints,
    axes,
    appearance,
    grouping,
    sourceMode,
    timeAnalysis,
  } = input;
    if (!readout) return [];
    const showDerivedMetric = sourceMode === "derived_metric" && isDerivedTimeMetric(timeAnalysis);
    const timePoints = showDerivedMetric
      ? [undefined]
      : draft.time.points.length > 0
        ? activeTimePoints
        : [undefined];
    const built = activeConditions.flatMap((condition) =>
      timePoints.map((timePoint) => {
        const normalizedGrouping = normalizeGraphGroupingChannels(grouping);
        const xFactorIds =
          normalizedGrouping.x.source === "factor"
            ? normalizedGrouping.x.factorIds?.length
              ? normalizedGrouping.x.factorIds
              : normalizedGrouping.x.factorId
                ? [normalizedGrouping.x.factorId]
                : []
            : [];
        const xLevels = xFactorIds.map((factorId) => condition.attributes[factorId] ?? "unknown");
        const xGroupKey = xFactorIds.length
          ? xFactorIds.map((factorId, index) => `${factorId}:${xLevels[index]}`).join("|")
          : condition.id;
        const xGroupLabel = xLevels.length ? xLevels.join(" / ") : condition.label;
        const seriesFactorId =
          grouping.series.source === "factor" ? grouping.series.factorId : undefined;
        const seriesFactor = draft.attributes.find(({ id }) => id === seriesFactorId);
        const seriesLevel = seriesFactorId ? condition.attributes[seriesFactorId] : undefined;
        const visualSeriesKey =
          grouping.series.source === "time"
            ? (timePoint?.id ?? "time.none")
            : seriesFactorId
              ? `${seriesFactorId}:${seriesLevel ?? "unknown"}`
              : condition.id;
        const visualSeriesLabel =
          grouping.series.source === "time"
            ? timePoint
              ? `${timePoint.value} ${axes.xUnit.trim() || draft.time.unit}`
              : "時点なし"
            : seriesFactor
              ? (seriesLevel ?? "—")
              : condition.label;
        const facetFactorId = grouping.facet?.factorId;
        const facetLevel = facetFactorId ? condition.attributes[facetFactorId] : undefined;
        const facetKey = facetFactorId
          ? `${facetFactorId}:${facetLevel ?? "unknown"}`
          : "facet.none";
        const facetLabel = facetFactorId ? (facetLevel ?? "—") : "";
        const proportionPoints: ProportionPoint[] = [];
        const experimentPoints: ExperimentPoint[] = [];
        const rawPoints: RawPoint[] = [];
        draft.experiments.forEach((experiment) => {
          const pointUnitId =
            draft.conditionAssignment.kind === "matched"
              ? (experiment.stableUnitId ?? experiment.id)
              : `${experiment.stableUnitId ?? experiment.id}.${condition.id}`;
          if (showDerivedMetric) {
            const value = deriveTimeMetricValue({
              draft,
              cells,
              experimentId: experiment.id,
              conditionId: condition.id,
              readoutId: readout.id,
              plan: timeAnalysis,
            });
            if (value !== null && Number.isFinite(value)) {
              experimentPoints.push({
                experimentId: pointUnitId,
                experimentLabel: experiment.label,
                value,
              });
            }
            return;
          }
          const cell = getGraphCell(cells, experiment.id, condition.id, readout.id, timePoint?.id);
          if (cellIsNotPlanned(cell)) return;
          if (readout.shape === "proportion" && isProportionCell(cell)) {
            const value = percentage(cell);
            if (
              value !== null &&
              Number.isFinite(value) &&
              cell.positive !== null &&
              cell.eligible !== null
            ) {
              proportionPoints.push({
                experimentId: pointUnitId,
                experimentLabel: experiment.label,
                value,
                positive: cell.positive,
                eligible: cell.eligible,
              });
            }
          }
          if (readout.shape === "nested_continuous" && isNestedCell(cell)) {
            const values = cell.rawValues.filter(Number.isFinite);
            values.forEach((value) =>
              rawPoints.push({
                experimentId: pointUnitId,
                experimentLabel: experiment.label,
                value,
                index: rawPoints.length,
              }),
            );
            const summary = continuousSummary(values);
            if (summary.mean !== null) {
              experimentPoints.push({
                experimentId: pointUnitId,
                experimentLabel: experiment.label,
                value: summary.mean,
              });
            }
          }
          if (readout.shape === "wb_ratio" && isWbRatioCell(cell)) {
            const valuesByCondition = Object.fromEntries(
              activeConditions.map(({ id }) => {
                const candidate = getGraphCell(cells, experiment.id, id, readout.id, timePoint?.id);
                return [id, isWbRatioCell(candidate) ? wbRatio(candidate) : null];
              }),
            );
            const value = normalizeWithinExperiment(
              wbRatio(cell),
              valuesByCondition,
              condition.id,
              readout,
            );
            if (value !== null && Number.isFinite(value)) {
              experimentPoints.push({
                experimentId: pointUnitId,
                experimentLabel: experiment.label,
                value,
              });
            }
          }
        });
        const values =
          !showDerivedMetric && readout.shape === "proportion"
            ? proportionPoints.map((point) => point.value)
            : experimentPoints.map((point) => point.value);
        return {
          seriesKey: `${condition.id}::${timePoint?.id ?? "time.none"}`,
          conditionId: condition.id,
          conditionLabel: condition.label,
          xGroupKey,
          xGroupLabel,
          visualSeriesKey,
          visualSeriesLabel,
          facetKey,
          facetLabel,
          auxiliaryReference: condition.role === "auxiliary_reference",
          timePointId: timePoint?.id,
          timeLabel: timePoint
            ? `${timePoint.value} ${axes.xUnit.trim() || draft.time.unit}`
            : undefined,
          xValue: timePoint?.value,
          proportionPoints,
          experimentPoints,
          rawPoints,
          summary: continuousSummary(values),
        };
      }),
    );
    const xOrder = new Map<string, number>();
    built.forEach(({ xGroupKey }) => {
      if (!xOrder.has(xGroupKey)) xOrder.set(xGroupKey, xOrder.size);
    });
    return built.sort((first, second) => {
      const groupDelta = (xOrder.get(first.xGroupKey) ?? 0) - (xOrder.get(second.xGroupKey) ?? 0);
      if (groupDelta !== 0) return groupDelta;
      return (
        (appearance.seriesStyles[first.visualSeriesKey]?.order ?? 0) -
        (appearance.seriesStyles[second.visualSeriesKey]?.order ?? 0)
      );
    });
}

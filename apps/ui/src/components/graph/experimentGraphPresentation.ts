import {
  categoricalTotal,
  type ExperimentCellMap,
  type ExperimentSetDraft,
  type ReadoutDraft,
} from "../../app/experimentDraft";
import { normalizeGraphGroupingChannels } from "../../app/graphGrouping";
import type { WorkspaceGraphState } from "../../app/experimentWorkspaceProject";
import type { GraphSeries } from "./experimentGraphDataExport";

type GraphGrouping = NonNullable<WorkspaceGraphState["grouping"]>;

export type ConditionAxisLabel = Readonly<{
  conditionId: string;
  levels: readonly Readonly<{ id: string; label: string; value: string }>[];
  timeLabel: string;
}>;

export type GraphFacetGroup = Readonly<{
  key: string;
  label: string;
  rows: readonly GraphSeries[];
  labels: readonly ConditionAxisLabel[];
}>;

export function buildConditionAxisLabels(
  input: Readonly<{
    draft: ExperimentSetDraft;
    series: readonly GraphSeries[];
    hierarchyOrder: readonly string[];
    grouping: GraphGrouping;
  }>,
): readonly ConditionAxisLabel[] {
  const { draft, series, hierarchyOrder, grouping } = input;
  const seriesFactorId = grouping.series.source === "factor" ? grouping.series.factorId : undefined;
  const orderedAttributes = [
    ...hierarchyOrder.flatMap((attributeId) => {
      const attribute = draft.attributes.find(({ id }) => id === attributeId);
      return attribute ? [attribute] : [];
    }),
    ...draft.attributes.filter(({ id }) => !hierarchyOrder.includes(id)),
  ].filter(({ id }) => id !== seriesFactorId);
  const normalizedGrouping = normalizeGraphGroupingChannels(grouping);
  const xFactorIds =
    normalizedGrouping.x.source === "factor"
      ? normalizedGrouping.x.factorIds?.length
        ? normalizedGrouping.x.factorIds
        : normalizedGrouping.x.factorId
          ? [normalizedGrouping.x.factorId]
          : []
      : [];
  return series.map((item) => {
    const condition = draft.conditions.find((candidate) => candidate.id === item.conditionId);
    const levels = orderedAttributes.map((attribute) => ({
      id: attribute.id,
      label: attribute.label.trim() || "属性",
      value: condition?.attributes[attribute.id]?.trim() || "—",
    }));
    return {
      conditionId: item.conditionId,
      levels:
        normalizedGrouping.x.source === "factor" && xFactorIds.length > 0
          ? xFactorIds.map((factorId) => {
              const attribute = draft.attributes.find(({ id }) => id === factorId);
              return {
                id: factorId,
                label: attribute?.label ?? "条件",
                value: condition?.attributes[factorId]?.trim() || "—",
              };
            })
          : levels.length > 0
            ? levels
            : [{ id: "condition", label: "条件", value: condition?.label || item.conditionLabel }],
      timeLabel: grouping.series.source === "time" ? "" : (item.timeLabel ?? ""),
    };
  });
}

export function buildGraphFacetGroups(
  input: Readonly<{
    series: readonly GraphSeries[];
    axisLabels: readonly ConditionAxisLabel[];
    requestedOrder: readonly string[];
  }>,
): readonly GraphFacetGroup[] {
  const grouped = new Map<
    string,
    { label: string; rows: GraphSeries[]; labels: ConditionAxisLabel[] }
  >();
  input.series.forEach((item, index) => {
    const current = grouped.get(item.facetKey) ?? {
      label: item.facetLabel,
      rows: [],
      labels: [],
    };
    current.rows.push(item);
    const label = input.axisLabels[index];
    if (label) current.labels.push(label);
    grouped.set(item.facetKey, current);
  });
  return [...grouped.entries()]
    .map(([key, value]) => ({ key, ...value }))
    .sort((first, second) => {
      const firstOrder = input.requestedOrder.indexOf(first.label);
      const secondOrder = input.requestedOrder.indexOf(second.label);
      if (firstOrder < 0 && secondOrder < 0) return 0;
      if (firstOrder < 0) return 1;
      if (secondOrder < 0) return -1;
      return firstOrder - secondOrder;
    });
}

export function uniqueVisualSeriesOptions(series: readonly GraphSeries[]): readonly GraphSeries[] {
  return series.filter(
    (item, index) =>
      series.findIndex(({ visualSeriesKey }) => visualSeriesKey === item.visualSeriesKey) ===
        index && Boolean(item.visualSeriesLabel),
  );
}

export function hasVisibleGraphData(
  input: Readonly<{
    shape: ReadoutDraft["shape"];
    sourceMode: "raw_readout" | "derived_metric";
    series: readonly GraphSeries[];
    cells: ExperimentCellMap;
  }>,
): boolean {
  if (
    input.shape === "categorical_counts" &&
    Object.values(input.cells).some(
      (cell) => cell?.kind === "categorical_counts" && categoricalTotal(cell) !== null,
    )
  ) {
    return true;
  }
  return input.series.some((item) =>
    input.sourceMode === "derived_metric"
      ? item.experimentPoints.length > 0
      : input.shape === "proportion"
        ? item.proportionPoints.length > 0
        : input.shape === "nested_continuous"
          ? item.rawPoints.length > 0
          : item.experimentPoints.length > 0,
  );
}

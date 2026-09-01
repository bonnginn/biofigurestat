import { useMemo } from "react";

import { isDerivedTimeMetric } from "../../app/experimentDraftAnalysis";
import type {
  ExperimentCellMap,
  ExperimentSetDraft,
  ReadoutDraft,
  TimeAnalysisPlan,
} from "../../app/experimentDraft";
import type { WorkspaceGraphState } from "../../app/experimentWorkspaceProject";
import { buildDerivedGraphLineageRows, buildExperimentGraphSeries } from "./experimentGraphSeries";
import {
  buildConditionAxisLabels,
  buildGraphFacetGroups,
  hasVisibleGraphData,
  uniqueVisualSeriesOptions,
} from "./experimentGraphPresentation";

type GraphGrouping = NonNullable<WorkspaceGraphState["grouping"]>;

export function useExperimentGraphDerivedData(
  input: Readonly<{
    draft: ExperimentSetDraft;
    cells: ExperimentCellMap;
    readout: ReadoutDraft | undefined;
    activeConditions: ExperimentSetDraft["conditions"];
    activeTimePoints: ExperimentSetDraft["time"]["points"];
    axes: WorkspaceGraphState["axes"];
    appearance: WorkspaceGraphState["appearance"];
    grouping: GraphGrouping;
    sourceMode: NonNullable<WorkspaceGraphState["sourceMode"]>;
    timeAnalysis: TimeAnalysisPlan;
  }>,
) {
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

  return useMemo(() => {
    const series = buildExperimentGraphSeries({
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
    });
    const derivedLineageRows = buildDerivedGraphLineageRows({
      draft,
      cells,
      readout,
      activeConditions,
      sourceMode,
      timeAnalysis,
    });
    const shape =
      sourceMode === "derived_metric" && isDerivedTimeMetric(timeAnalysis)
        ? "nested_continuous"
        : (readout?.shape ?? "proportion");
    const axisLabels = appearance.hierarchicalLabels
      ? buildConditionAxisLabels({
          draft,
          series,
          hierarchyOrder: axes.hierarchyOrder,
          grouping,
        })
      : series.map((item) => ({
          conditionId: item.conditionId,
          levels: [{ id: "condition", label: "条件", value: item.conditionLabel }],
          timeLabel: grouping.series.source === "time" ? "" : (item.timeLabel ?? ""),
        }));
    const facetGroups = buildGraphFacetGroups({
      series,
      axisLabels,
      requestedOrder: grouping.facet?.levelOrder ?? [],
    });
    const visualSeriesOptions = uniqueVisualSeriesOptions(series);

    return {
      series,
      derivedLineageRows,
      shape,
      facetGroups,
      visualSeriesOptions,
      hasData: hasVisibleGraphData({ shape, sourceMode, series, cells }),
    };
  }, [
    activeConditions,
    activeTimePoints,
    appearance,
    axes,
    cells,
    draft,
    grouping,
    readout,
    sourceMode,
    timeAnalysis,
  ]);
}

import type { RefObject } from "react";
import type { AnalysisEngineResult } from "@lsaa/analysis-contracts";

import type {
  ExperimentCellMap,
  ExperimentSetDraft,
  ReadoutDraft,
  ReadoutShape,
} from "../../app/experimentDraft";
import type { WorkspaceGraphState } from "../../app/experimentWorkspaceProject";
import { CompositionGraphSvg } from "./CompositionGraphSvg";
import { CorrelationGraphSvg } from "./CorrelationGraphSvg";
import type { GraphSeries } from "./experimentGraphDataExport";
import type { GraphFacetGroup } from "./experimentGraphPresentation";
import { ExperimentGraphSvg } from "./GeneralExperimentGraphSvg";
import type { GraphInspectorTarget } from "./useExperimentGraphWorkspaceEffects";

type GraphType = WorkspaceGraphState["graphType"];
type StatisticsAnnotation = NonNullable<WorkspaceGraphState["statisticsAnnotation"]>;
type StatisticsAnnotationEntry = NonNullable<WorkspaceGraphState["statisticsAnnotations"]>[number];

export type GraphRendererKind = "composition" | "correlation" | "general";

export function selectGraphRendererKind(input: {
  shape: ReadoutShape;
  graphType: GraphType;
  analysisIntentKind: ExperimentSetDraft["analysisIntent"]["kind"];
}): GraphRendererKind {
  if (
    input.shape === "categorical_counts" &&
    ["stacked", "stacked_100", "category_percentage"].includes(input.graphType)
  ) {
    return "composition";
  }
  if (input.graphType === "scatter" && input.analysisIntentKind === "correlation") {
    return "correlation";
  }
  return "general";
}

type Props = Readonly<{
  draft: ExperimentSetDraft;
  cells: ExperimentCellMap;
  readout: ReadoutDraft;
  selectedConditionIds: readonly string[];
  selectedTimePointIds: readonly string[];
  graphType: GraphType;
  appearance: WorkspaceGraphState["appearance"];
  axes: WorkspaceGraphState["axes"];
  svgRef: RefObject<SVGSVGElement | null>;
  series: readonly GraphSeries[];
  analysisResult: AnalysisEngineResult | null;
  statisticsAnnotation: StatisticsAnnotation;
  statisticsAnnotations: readonly StatisticsAnnotationEntry[];
  annotationContext: string;
  activeLayerDescription: string;
  layers: WorkspaceGraphState["layers"];
  shape: ReadoutShape;
  grouping: NonNullable<WorkspaceGraphState["grouping"]>;
  facetGroups: readonly GraphFacetGroup[];
  fitOverview: boolean;
  onInspect: (target: GraphInspectorTarget) => void;
  activeInspectorTarget: GraphInspectorTarget;
}>;

export function ExperimentGraphCanvasRenderer({
  draft,
  cells,
  readout,
  selectedConditionIds,
  selectedTimePointIds,
  graphType,
  appearance,
  axes,
  svgRef,
  series,
  analysisResult,
  statisticsAnnotation,
  statisticsAnnotations,
  annotationContext,
  activeLayerDescription,
  layers,
  shape,
  grouping,
  facetGroups,
  fitOverview,
  onInspect,
  activeInspectorTarget,
}: Props) {
  const rendererKind = selectGraphRendererKind({
    shape,
    graphType,
    analysisIntentKind: draft.analysisIntent.kind,
  });

  return (
    <div
      className={`experiment-graph-stage experiment-graph-stage--${appearance.legendPosition}`}
      data-graph-renderer={rendererKind}
    >
      <div
        className={`experiment-graph-svg-scroll${fitOverview ? " is-fit-overview" : ""}`}
        data-view-mode={fitOverview ? "fit" : "readable"}
      >
        {rendererKind === "composition" ? (
          <CompositionGraphSvg
            draft={draft}
            cells={cells}
            readout={readout}
            conditionIds={selectedConditionIds}
            timePointIds={selectedTimePointIds}
            graphType={graphType as "stacked" | "stacked_100" | "category_percentage"}
            appearance={appearance}
            axes={axes}
            svgRef={svgRef}
          />
        ) : rendererKind === "correlation" ? (
          <CorrelationGraphSvg
            series={series}
            appearance={appearance}
            axes={axes}
            svgRef={svgRef}
            analysisResult={analysisResult}
            statisticsAnnotation={statisticsAnnotation}
            onInspect={onInspect}
          />
        ) : (
          <div
            className={grouping.facet ? "experiment-graph-small-multiples" : undefined}
            data-facet-axis-policy={grouping.facet?.axisPolicy ?? "shared"}
          >
            {facetGroups.map((facet) => (
              <section className="experiment-graph-facet" key={facet.key}>
                {grouping.facet ? (
                  <h3 className="experiment-graph-facet-title">{facet.label}</h3>
                ) : null}
                <ExperimentGraphSvg
                  shape={shape === "proportion" ? "proportion" : "nested_continuous"}
                  readoutLabel={readout.label}
                  readoutUnit={readout.unit}
                  timeSampling={draft.time.sampling}
                  conditionAssignment={draft.conditionAssignment}
                  axisLabels={facet.labels}
                  series={facet.rows}
                  layers={layers}
                  appearance={appearance}
                  graphType={graphType}
                  axes={axes}
                  svgRef={svgRef}
                  analysisResult={analysisResult}
                  statisticsAnnotation={statisticsAnnotation}
                  statisticsAnnotations={statisticsAnnotations}
                  annotationContext={annotationContext}
                  layerDescription={activeLayerDescription}
                  onInspect={onInspect}
                  activeInspectorTarget={activeInspectorTarget}
                />
              </section>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}

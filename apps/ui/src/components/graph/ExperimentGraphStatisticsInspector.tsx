import type { ComponentProps } from "react";

import { GraphStatisticsPanel } from "./GraphStatisticsPanel";
import { ExperimentGraphAnalysisScopeNotice } from "./ExperimentGraphAnalysisScopeNotice";
import { ExperimentGraphAnnotationEditor } from "./ExperimentGraphAnnotationEditor";
import { ExperimentGraphTimeAnalysisEditor } from "./ExperimentGraphTimeAnalysisEditor";

type Props = Readonly<{
  timeAnalysis: ComponentProps<typeof ExperimentGraphTimeAnalysisEditor> | null;
  scopeNotice: ComponentProps<typeof ExperimentGraphAnalysisScopeNotice> | null;
  statisticsPanel: ComponentProps<typeof GraphStatisticsPanel> | null;
  annotation: ComponentProps<typeof ExperimentGraphAnnotationEditor> | null;
}>;

/** Statistics-inspector ordering only; scientific decisions remain in the supplied models. */
export function ExperimentGraphStatisticsInspector({
  timeAnalysis,
  scopeNotice,
  statisticsPanel,
  annotation,
}: Props) {
  return (
    <>
      {timeAnalysis ? <ExperimentGraphTimeAnalysisEditor {...timeAnalysis} /> : null}
      {scopeNotice ? <ExperimentGraphAnalysisScopeNotice {...scopeNotice} /> : null}
      {statisticsPanel ? <GraphStatisticsPanel {...statisticsPanel} /> : null}
      {annotation ? <ExperimentGraphAnnotationEditor {...annotation} variant="display-only" /> : null}
    </>
  );
}

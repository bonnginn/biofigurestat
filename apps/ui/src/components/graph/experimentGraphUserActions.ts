import type { ExperimentCellMap, ExperimentSetDraft, ReadoutDraft } from "../../app/experimentDraft";
import { copyGraphToClipboard, serializeGraphSvg } from "../../app/graphExport";
import {
  saveAnalysisReviewSetExport,
  saveGraphCsvExport,
  saveGraphPngExport,
  saveGraphSvgExport,
} from "../../app/graphExportController";
import type { WorkspaceGraphAnalysis } from "../../app/experimentWorkspaceProject";
import type { AppLocale } from "../../app/appLocale";
import {
  safeGraphFileStem,
  serializeCompositionData,
  serializeVisibleGraphData,
  type GraphSeries,
} from "./experimentGraphDataExport";
import {
  runGraphClipboardCopy,
  runGraphUserExport,
  type GraphExportFeedback,
} from "./experimentGraphUserExports";
import { serializeAnalysisReviewSetHtml } from "./analysisReviewSet";

type Input = Readonly<{
  getSvg: () => SVGSVGElement | null;
  readout: ReadoutDraft | undefined;
  draft: ExperimentSetDraft;
  cells: ExperimentCellMap;
  selectedConditionIds: readonly string[];
  selectedTimePointIds: readonly string[];
  series: readonly GraphSeries[];
  analysis: WorkspaceGraphAnalysis | null;
  methodsText: string | null;
  locale: AppLocale;
  setCopyStatus: (status: string | null) => void;
  setExportFeedback: (feedback: GraphExportFeedback | null) => void;
}>;

/** User-triggered Graph I/O; presentation and scientific state remain read-only inputs. */
export function createExperimentGraphUserActions(input: Input) {
  const displayedDataCsv = (readout: ReadoutDraft) =>
    readout.shape === "categorical_counts"
      ? serializeCompositionData(
          input.draft,
          input.cells,
          readout,
          input.selectedConditionIds,
          input.selectedTimePointIds,
          input.locale,
        )
      : serializeVisibleGraphData(input.series, readout, input.locale);

  const exportSvg = async () => {
    const svg = input.getSvg();
    const readout = input.readout;
    if (!svg || !readout) return;
    await runGraphUserExport(
      "svg",
      input.locale,
      () => saveGraphSvgExport(svg, `${safeGraphFileStem(readout.label)}.svg`),
      input.setExportFeedback,
    );
  };

  const exportPng = async () => {
    const svg = input.getSvg();
    const readout = input.readout;
    if (!svg || !readout) return;
    await runGraphUserExport(
      "png",
      input.locale,
      () => saveGraphPngExport(svg, `${safeGraphFileStem(readout.label)}.png`),
      input.setExportFeedback,
    );
  };

  const exportCsv = async () => {
    const readout = input.readout;
    if (!readout) return;
    const csv = displayedDataCsv(readout);
    await runGraphUserExport(
      "csv",
      input.locale,
      () => saveGraphCsvExport(csv, `${safeGraphFileStem(readout.label)}-graph-data.csv`),
      input.setExportFeedback,
    );
  };

  const exportReviewSet = async () => {
    const svg = input.getSvg();
    const readout = input.readout;
    const analysis = input.analysis;
    const methodsText = input.methodsText;
    if (!svg || !readout || !analysis || analysis.result.status !== "ok" || !methodsText) return;
    const html = serializeAnalysisReviewSetHtml({
      locale: input.locale,
      projectTitle: input.draft.name,
      readoutLabel: readout.label,
      readoutUnit: readout.unit ?? "",
      conditionLabels: input.draft.conditions,
      analysis,
      methodsText,
      svgText: serializeGraphSvg(svg),
      displayedDataCsv: displayedDataCsv(readout),
    });
    await runGraphUserExport(
      "review",
      input.locale,
      () =>
        saveAnalysisReviewSetExport(
          html,
          `${safeGraphFileStem(input.draft.name)}-${safeGraphFileStem(readout.label)}-review.html`,
        ),
      input.setExportFeedback,
    );
  };

  const copyGraph = async () => {
    const svg = input.getSvg();
    if (!svg) return;
    await runGraphClipboardCopy(
      input.locale,
      () => copyGraphToClipboard(svg),
      input.setCopyStatus,
    );
  };

  return { copyGraph, exportCsv, exportPng, exportReviewSet, exportSvg };
}

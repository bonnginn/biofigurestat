import type { ExperimentCellMap, ExperimentSetDraft, ReadoutDraft } from "../../app/experimentDraft";
import { copyGraphToClipboard } from "../../app/graphExport";
import {
  saveGraphCsvExport,
  saveGraphPngExport,
  saveGraphSvgExport,
} from "../../app/graphExportController";
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

type Input = Readonly<{
  getSvg: () => SVGSVGElement | null;
  readout: ReadoutDraft | undefined;
  draft: ExperimentSetDraft;
  cells: ExperimentCellMap;
  selectedConditionIds: readonly string[];
  selectedTimePointIds: readonly string[];
  series: readonly GraphSeries[];
  locale: AppLocale;
  setCopyStatus: (status: string | null) => void;
  setExportFeedback: (feedback: GraphExportFeedback | null) => void;
}>;

/** User-triggered Graph I/O; presentation and scientific state remain read-only inputs. */
export function createExperimentGraphUserActions(input: Input) {
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
    const csv =
      readout.shape === "categorical_counts"
        ? serializeCompositionData(
            input.draft,
            input.cells,
            readout,
            input.selectedConditionIds,
            input.selectedTimePointIds,
          )
        : serializeVisibleGraphData(input.series, readout);
    await runGraphUserExport(
      "csv",
      input.locale,
      () => saveGraphCsvExport(csv, `${safeGraphFileStem(readout.label)}-graph-data.csv`),
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

  return { copyGraph, exportCsv, exportPng, exportSvg };
}

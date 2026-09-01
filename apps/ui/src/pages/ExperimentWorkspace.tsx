import {
  Suspense,
  lazy,
  useCallback,
  useEffect,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import type { KeyboardEvent, Ref } from "react";
import type { CompactScalarObservationIdFactoryContext } from "@lsaa/data-sheet";
import type { CanonicalAdaptiveObservation } from "@lsaa/domain";

import {
  continuousSummary,
  categoricalPercentage,
  categoricalTotal,
  cellIsNotPlanned,
  createExperimentSession,
  experimentCellKey,
  normalizeWithinExperiment,
  nextExperimentSessionIndex,
  orderedAxisSemantic,
  orderedAxisTitle,
  orderedAxisUnit,
  parseNumericPaste,
  percentage,
  sharedSourceConditionTopology,
  wbRatio,
  wbCorrectedBandValue,
  timePointLabel,
  type ExperimentCellDraft,
  type ExperimentCellMap,
  type ExperimentSetDraft,
  type ExperimentSessionDraft,
  type NestedContinuousCellDraft,
  type CategoricalCountsCellDraft,
  type ProportionCellDraft,
  type WbRatioCellDraft,
  type ReadoutDraft,
  type TimeAnalysisPlan,
  type TimePointDraft,
} from "../app/experimentDraft";
import type { DraftAnalysisCorrection } from "../app/draftAnalysisDiagnostics";
import {
  WorkspaceNestedMeasurementSheet,
  type WorkspaceDataViewMode,
} from "../components/WorkspaceNestedMeasurementSheet";
import { AdaptiveCanonicalSpreadsheet } from "../components/AdaptiveCanonicalSpreadsheet";
import {
  canEditCanonicalMatrix,
  type CanonicalWorksheetFileCommit,
} from "../components/CanonicalMatrixWorksheet";
import {
  BiologicalExperimentSetup,
  type BiologicalExperimentSetupResult,
} from "../components/BiologicalExperimentSetup";
import {
  CurrentDataGraphPreview,
  GraphTypeThumbnail,
  type CreatableGraphType,
} from "../components/graph/GraphCreationPreview";
import { defaultAnalysisRunner, type AnalysisRunner } from "../app/analysisClient";
import { defaultGraphYTitle, defaultLayersForGraphType } from "../app/graphDefaults";
import { createInitialGraphGrouping } from "../app/graphGrouping";
import {
  createExperimentWorkspaceProject,
  type WorkspaceGraphState,
} from "../app/experimentWorkspaceProject";
import {
  actionErrorMessage,
  type OpenedProject,
  type SaveProjectAction,
} from "../app/projectActions";
import "./ExperimentWorkspace.css";
import type { FavoriteGraphDefault } from "../app/favoriteDesigns";
import { recordBenchmarkEvent } from "../app/benchmarkEvaluation";
import { createAdaptiveWorkspace } from "../app/adaptiveWorkspace";
import { synchronizeAdaptiveDraft } from "../app/adaptiveCanonicalStore";
import {
  checkAdaptiveStructureRevisionCompatibility,
  createBiologicalSetupPresentation,
  createBiologicalSetupPrefill,
  type BiologicalSetupPrefill,
} from "../app/adaptiveStructureRevision";
import type { RegisterWorkspaceSaveHandler, RequestWorkspaceExit } from "../app/workspaceLifecycle";
import { routeFromPath } from "../app/routes";
import { recordUsageGraphConfiguration, recordUsageMilestone } from "../app/usageTelemetry";
import { recordDiagnosticError, recordDiagnosticEvent } from "../app/diagnostics";
import { localizedText, useAppLocale } from "../app/appLocale";
import { useSpreadsheetCellDraft } from "../components/useSpreadsheetCellDraft";
import {
  parseOptionalSpreadsheetNumber,
  parseSpreadsheetNumber,
} from "../components/spreadsheetValues";
import { experimentGraphTypeLabel } from "../components/graph/experimentGraphTypeLabel";

const DevelopmentEvaluationWorkspaceLoader = import.meta.env.DEV
  ? lazy(() =>
      import("../components/EvaluationWorkspaceLoader").then(({ EvaluationWorkspaceLoader }) => ({
        default: EvaluationWorkspaceLoader,
      })),
    )
  : null;

const ExperimentGraphWorkbench = lazy(() =>
  import("../components/graph/ExperimentGraphWorkbench").then(
    ({ ExperimentGraphWorkbench: GraphWorkbench }) => ({ default: GraphWorkbench }),
  ),
);

export type ExperimentWorkspaceProps = {
  initialDraft: ExperimentSetDraft;
  initialCells?: ExperimentCellMap;
  initialGraphs?: readonly WorkspaceGraphState[];
  initialDataViewMode?: WorkspaceDataViewMode;
  initialProject?: OpenedProject;
  onBack: () => void;
  analysisRunner?: AnalysisRunner;
  analysisAvailable?: boolean;
  saveProject?: SaveProjectAction;
  onReuseDesign?: (draft: ExperimentSetDraft) => void;
  onSaveFavorite?: (draft: ExperimentSetDraft, graphs: readonly WorkspaceGraphState[]) => void;
  favoriteGraphDefaults?: readonly FavoriteGraphDefault[];
  onDirtyChange?: (dirty: boolean) => void;
  onOpenProject?: () => void;
  onRequestExit?: RequestWorkspaceExit;
  onRegisterSaveHandler?: RegisterWorkspaceSaveHandler;
  rootRef?: Ref<HTMLDivElement>;
};

type WorkspaceTab = "overview" | `experiment:${string}`;

type AdaptiveStructureRevisionSession = Readonly<{
  sourceDraft: ExperimentSetDraft;
  prefill: BiologicalSetupPrefill;
}>;

type CellDescriptor = {
  key: string;
  experiment: ExperimentSessionDraft;
  conditionId: string;
  conditionLabel: string;
  timePoint: TimePointDraft | null;
  timeUnit: string;
  readout: ReadoutDraft;
};

type TableRow = {
  key: string;
  conditionId: string;
  conditionLabel: string;
  timePoint: TimePointDraft | null;
};

const stableCoordinate = (value: unknown): string => {
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

function isSameCanonicalWorksheetIngress(
  existing: Readonly<{
    mapping: CanonicalWorksheetFileCommit["mapping"] | null;
    rawLineage: CanonicalWorksheetFileCommit["rawLineage"];
  }>,
  incoming: Pick<CanonicalWorksheetFileCommit, "mapping" | "rawLineage">,
): boolean {
  if (!existing.mapping) return false;
  const mappingSignature = (mapping: CanonicalWorksheetFileCommit["mapping"]) =>
    stableCoordinate({
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

function graphReferencesRemainStable(
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
        stableCoordinate(oldConditions.get(id)?.attributes) !==
          stableCoordinate(newConditions.get(id)?.attributes),
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

function invalidateGraphAnalysis(graph: WorkspaceGraphState): WorkspaceGraphState {
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

function timePointsFor(draft: ExperimentSetDraft): Array<TimePointDraft | null> {
  return draft.time.points.length > 0 ? [...draft.time.points] : [null];
}

function createCellsForDraft(draft: ExperimentSetDraft): ExperimentCellMap {
  const cells: Record<string, ExperimentCellDraft> = {};
  const timePoints = timePointsFor(draft);
  for (const experiment of draft.experiments) {
    for (const condition of draft.conditions) {
      for (const readout of draft.readouts) {
        for (const timePoint of timePoints) {
          const key = experimentCellKey({
            experimentId: experiment.id,
            conditionId: condition.id,
            readoutId: readout.id,
            timePointId: timePoint?.id,
          });
          cells[key] =
            readout.shape === "proportion"
              ? { kind: "proportion", positive: null, eligible: null }
              : readout.shape === "wb_ratio"
                ? {
                    kind: "wb_ratio",
                    target: null,
                    reference: null,
                    inputMode: readout.wbInputMode ?? "corrected_value",
                  }
                : readout.shape === "categorical_counts"
                  ? {
                      kind: "categorical_counts",
                      counts: Object.fromEntries(
                        (readout.categories ?? []).map(({ id }) => [id, null]),
                      ),
                    }
                  : { kind: "nested_continuous", rawValues: [], source: "manual" };
        }
      }
    }
  }
  return cells;
}

function rowsFor(draft: ExperimentSetDraft, experimentId: string): TableRow[] {
  return draft.conditions.flatMap((condition) =>
    timePointsFor(draft).map((timePoint) => ({
      key: `${experimentId}::${condition.id}::${timePoint?.id ?? "time.none"}`,
      conditionId: condition.id,
      conditionLabel: condition.label,
      timePoint,
    })),
  );
}

function conditionAttributeValues(draft: ExperimentSetDraft, conditionId: string): string[] {
  const condition = draft.conditions.find((candidate) => candidate.id === conditionId);
  return draft.attributes.map((attribute) => condition?.attributes[attribute.id]?.trim() || "—");
}

function ConditionCells({ draft, row }: { draft: ExperimentSetDraft; row: TableRow }) {
  const values = conditionAttributeValues(draft, row.conditionId);
  return values.map((value, index) =>
    index === 0 ? (
      <th key={draft.attributes[index]?.id ?? index} scope="row">
        {value}
      </th>
    ) : (
      <td
        key={draft.attributes[index]?.id ?? index}
        className="experiment-workspace-attribute-cell"
      >
        {value}
      </td>
    ),
  );
}

function findCellDescriptor(draft: ExperimentSetDraft, key: string): CellDescriptor | null {
  for (const experiment of draft.experiments) {
    for (const condition of draft.conditions) {
      for (const readout of draft.readouts) {
        for (const timePoint of timePointsFor(draft)) {
          const candidate = experimentCellKey({
            experimentId: experiment.id,
            conditionId: condition.id,
            readoutId: readout.id,
            timePointId: timePoint?.id,
          });
          if (candidate === key) {
            return {
              key,
              experiment,
              conditionId: condition.id,
              conditionLabel: condition.label,
              timePoint,
              timeUnit: orderedAxisUnit(draft.time),
              readout,
            };
          }
        }
      }
    }
  }
  return null;
}

function countValue(value: string): number | null {
  const parsed = parseSpreadsheetNumber(value);
  if (parsed === null || parsed < 0 || !Number.isInteger(parsed)) return null;
  return parsed;
}

type ProportionPasteUpdate = Readonly<{
  key: string;
  field: "positive" | "eligible";
  value: number;
}>;

type ProportionPasteRequest = Readonly<{
  experimentId: string;
  readoutId: string;
  startRow: number;
  startColumn: number;
  text: string;
}>;

type OverviewScalarPasteRequest = Readonly<{
  readoutId: string;
  startExperiment: number;
  startCondition: number;
  text: string;
}>;

type OverviewProportionPasteRequest = Readonly<{
  readoutId: string;
  startExperiment: number;
  /** Zero-based index in the editable-only sequence: positive, eligible, positive, eligible… */
  startColumn: number;
  text: string;
}>;

type OverviewScalarPasteResult = Readonly<{
  accepted: boolean;
  message: string;
}>;

function proportionPasteRows(text: string): string[][] {
  const rows = text
    .replace(/\r\n?/g, "\n")
    .split("\n")
    .map((line) => line.split("\t"));
  while (rows.length > 0 && rows[rows.length - 1].every((token) => token.trim() === "")) {
    rows.pop();
  }
  return rows;
}

function formatNumber(value: number | null): string {
  if (value === null) return "—";
  return Number.isInteger(value) ? String(value) : value.toFixed(2);
}

function rowTimeQualifier(row: Pick<TableRow, "timePoint">, unit: string): string {
  return row.timePoint ? `（${timePointLabel(row.timePoint, unit)}）` : "";
}

function cellIsComplete(cell: ExperimentCellDraft | undefined): boolean {
  if (cellIsNotPlanned(cell)) return false;
  if (!cell) return false;
  if (cell.kind === "proportion") {
    return percentage(cell) !== null;
  }
  if (cell.kind === "categorical_counts") return categoricalTotal(cell) !== null;
  if (cell.kind === "wb_ratio") return wbRatio(cell) !== null;
  return cell.rawValues.length > 0;
}

function cellHasEnteredValue(cell: ExperimentCellDraft | undefined): boolean {
  if (cellIsNotPlanned(cell) || !cell) return false;
  if (cell.kind === "proportion") {
    return cell.positive !== null || cell.eligible !== null;
  }
  if (cell.kind === "categorical_counts") {
    return Object.values(cell.counts).some((value) => value !== null);
  }
  if (cell.kind === "wb_ratio") {
    return (
      cell.target !== null ||
      cell.reference !== null ||
      Object.values(cell.targetSource ?? {}).some((value) => value !== null) ||
      Object.values(cell.referenceSource ?? {}).some((value) => value !== null)
    );
  }
  return cell.rawValues.length > 0;
}

function canonicalObservationHasEnteredValue(observation: CanonicalAdaptiveObservation): boolean {
  return Object.values(observation.values).some((value) =>
    typeof value === "string" ? value.trim().length > 0 : value !== null,
  );
}

function proportionValidationMessage(cell: ProportionCellDraft): string | null {
  if (cell.positive === null || cell.eligible === null) return null;
  if (cell.positive > cell.eligible) return "陽性数が対象数を超えています。";
  if (cell.eligible === 0) return "対象数が0のため、割合を計算できません。";
  return null;
}

function ReadoutLabel({ readout }: { readout: ReadoutDraft }) {
  return (
    <span className="experiment-workspace-readout-label">
      {readout.label}
      {readout.unit ? <span className="experiment-workspace-unit">({readout.unit})</span> : null}
    </span>
  );
}

function matrixRelationshipCopy(draft: ExperimentSetDraft): string {
  const sharedSource = sharedSourceConditionTopology(draft);
  if (sharedSource) {
    return `同じ行は同じ${sharedSource.sourceUnitLabel}に由来する組です。各条件の${draft.conditionAssignment.unitLabel}は別の実験単位として保持します。`;
  }
  return draft.conditionAssignment.kind === "matched"
    ? "同じ行は、条件間で対応づけた同じ対象です。"
    : "各条件の値を入力順に横へ並べています。同じ行は同じ対象やpairを意味しません。";
}

function matrixRowHeading(draft: ExperimentSetDraft): string {
  const sharedSource = sharedSourceConditionTopology(draft);
  if (sharedSource) return sharedSource.sourceIdentityLabel;
  return draft.conditionAssignment.kind === "matched"
    ? draft.conditionAssignment.unitLabel || "対象ID"
    : "入力行";
}

function independentAdaptiveInputRows(draft: ExperimentSetDraft): boolean {
  return Boolean(
    draft.adaptiveInput &&
    draft.conditionAssignment.kind === "independent" &&
    !sharedSourceConditionTopology(draft),
  );
}

function matchedSetLabel(draft: ExperimentSetDraft): string {
  const sharedSource = sharedSourceConditionTopology(draft);
  return sharedSource
    ? `${sharedSource.sourceUnitLabel}の組`
    : draft.conditionAssignment.unitLabel || "対応単位";
}

function OverviewUnitSummaryMatrix({
  draft,
  readout,
  cells,
  onChange,
  onPaste,
}: {
  draft: ExperimentSetDraft;
  readout: ReadoutDraft;
  cells: ExperimentCellMap;
  onChange: (key: string, value: number | null) => void;
  onPaste: (request: OverviewScalarPasteRequest) => OverviewScalarPasteResult;
}) {
  const locale = useAppLocale();
  const t = (ja: string, en: string) => localizedText(locale, ja, en);
  const [pasteMessage, setPasteMessage] = useState<string | null>(null);

  return (
    <section
      className="experiment-workspace-overview-section experiment-workspace-quick-entry"
      aria-labelledby="overview-quick-entry-heading"
    >
      <div className="experiment-workspace-quick-entry-heading">
        <div>
          <h3 id="overview-quick-entry-heading">{t("まとめて入力", "Enter as a table")}</h3>
          <p>
            {t(
              "左上のセルを選び、Excelから行列をそのまま貼り付けられます。空欄はmissingとして保持します。",
              "Select the top-left cell and paste a rectangular range directly from Excel. Blank cells remain missing.",
            )}
          </p>
        </div>
        <span>{t("Excel貼り付け対応", "Paste from Excel")}</span>
      </div>
      <div className="experiment-workspace-overview-condition-wrap">
        <table
          className="experiment-workspace-overview-condition-table experiment-workspace-quick-entry-table"
          aria-label={t(`${readout.label}をまとめて入力`, `Enter ${readout.label} as a table`)}
        >
          <caption>
            <ReadoutLabel readout={readout} />
            <small>
              {locale === "ja"
                ? matrixRelationshipCopy(draft)
                : draft.conditionAssignment.kind === "matched"
                  ? "Rows identify explicitly matched units across conditions."
                  : "Values are aligned by entry order only; rows do not imply matching across conditions."}
            </small>
          </caption>
          <thead>
            <tr>
              <th scope="col">
                {locale === "ja"
                  ? matrixRowHeading(draft)
                  : independentAdaptiveInputRows(draft)
                    ? "Entry row"
                    : draft.conditionAssignment.kind === "matched"
                      ? "Matched unit"
                      : "Experiment"}
              </th>
              {draft.conditions.map((condition) => (
                <th scope="col" key={condition.id}>
                  {condition.label}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {draft.experiments.map((experiment, experimentIndex) => (
              <tr key={experiment.id}>
                <th scope="row">{experiment.label}</th>
                {draft.conditions.map((condition, conditionIndex) => {
                  const key = experimentCellKey({
                    experimentId: experiment.id,
                    conditionId: condition.id,
                    readoutId: readout.id,
                  });
                  const cell = cells[key];
                  const value =
                    cell?.kind === "nested_continuous" ? (cell.rawValues[0] ?? null) : null;
                  const notPlanned = cellIsNotPlanned(cell);
                  return (
                    <td key={condition.id}>
                      <DecimalValueInput
                        label={t(
                          `${experiment.label}・${condition.label}の${readout.label}`,
                          `${readout.label}: ${experiment.label}, ${condition.label}`,
                        )}
                        value={value}
                        disabled={notPlanned}
                        onChange={(nextValue) => onChange(key, nextValue)}
                        onRejectedPaste={() =>
                          setPasteMessage(
                            t(
                              "複数値は、表の左上セルから行列として貼り付けてください。",
                              "Paste multiple values as a rectangle starting from the top-left cell.",
                            ),
                          )
                        }
                        onMatrixPaste={(text) => {
                          const result = onPaste({
                            readoutId: readout.id,
                            startExperiment: experimentIndex,
                            startCondition: conditionIndex,
                            text,
                          });
                          setPasteMessage(result.message);
                          return result.accepted;
                        }}
                      />
                    </td>
                  );
                })}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      {pasteMessage ? (
        <p className="experiment-workspace-paste-hint" role="status">
          {pasteMessage}
        </p>
      ) : null}
    </section>
  );
}

function OverviewProportionMatrix({
  draft,
  readout,
  cells,
  onChange,
  onPaste,
}: {
  draft: ExperimentSetDraft;
  readout: ReadoutDraft;
  cells: ExperimentCellMap;
  onChange: (key: string, field: "positive" | "eligible", value: number | null) => void;
  onPaste: (request: OverviewProportionPasteRequest) => OverviewScalarPasteResult;
}) {
  const locale = useAppLocale();
  const t = (ja: string, en: string) => localizedText(locale, ja, en);
  const [pasteMessage, setPasteMessage] = useState<string | null>(null);

  return (
    <section
      className="experiment-workspace-overview-section experiment-workspace-quick-entry"
      aria-labelledby="overview-proportion-quick-entry-heading"
    >
      <div className="experiment-workspace-quick-entry-heading">
        <div>
          <h3 id="overview-proportion-quick-entry-heading">
            {t("まとめて入力", "Enter as a table")}
          </h3>
          <p>
            {t(
              "各条件は「陽性数・対象数」の2列です。Excelから矩形のまま貼り付けられ、割合は自動計算します。",
              "Each condition has two columns: positive count and total count. Paste a rectangle from Excel; percentages are calculated automatically.",
            )}
          </p>
        </div>
        <span>{t("Excel貼り付け対応", "Paste from Excel")}</span>
      </div>
      <div className="experiment-workspace-overview-condition-wrap">
        <table
          className="experiment-workspace-overview-condition-table experiment-workspace-quick-entry-table experiment-workspace-quick-entry-table--proportion"
          aria-label={`${readout.label}をまとめて入力`}
          style={{ minWidth: `${Math.max(40, 8 + draft.conditions.length * 14)}rem` }}
        >
          <caption>
            <ReadoutLabel readout={readout} />
            <small>{matrixRelationshipCopy(draft)}</small>
          </caption>
          <thead>
            <tr>
              <th scope="col" rowSpan={2}>
                {matrixRowHeading(draft)}
              </th>
              {draft.conditions.map((condition) => (
                <th scope="colgroup" colSpan={2} key={condition.id}>
                  {draft.attributes.length > 1 ? (
                    <span className="experiment-workspace-quick-entry-condition-parts">
                      {draft.attributes.map((attribute, index) => (
                        <span key={attribute.id}>
                          <small>{attribute.label || `条件${index + 1}`}</small>
                          {condition.attributes[attribute.id]?.trim() || "—"}
                        </span>
                      ))}
                    </span>
                  ) : (
                    condition.label
                  )}
                </th>
              ))}
            </tr>
            <tr>
              {draft.conditions.flatMap((condition) => [
                <th scope="col" key={`${condition.id}:positive`}>
                  陽性数
                </th>,
                <th scope="col" key={`${condition.id}:eligible`}>
                  対象数 <small>割合（自動）</small>
                </th>,
              ])}
            </tr>
          </thead>
          <tbody>
            {draft.experiments.map((experiment, experimentIndex) => (
              <tr key={experiment.id}>
                <th scope="row">{experiment.label}</th>
                {draft.conditions.flatMap((condition, conditionIndex) => {
                  const key = experimentCellKey({
                    experimentId: experiment.id,
                    conditionId: condition.id,
                    readoutId: readout.id,
                  });
                  const cell = cells[key];
                  const proportionCell: ProportionCellDraft =
                    cell?.kind === "proportion"
                      ? cell
                      : { kind: "proportion", positive: null, eligible: null };
                  const notPlanned = cellIsNotPlanned(proportionCell);
                  const validationMessage = proportionValidationMessage(proportionCell);
                  const validationId = `overview-proportion-validation-${experimentIndex}-${conditionIndex}`;
                  const handlePaste = (startColumn: number, text: string) => {
                    const result = onPaste({
                      readoutId: readout.id,
                      startExperiment: experimentIndex,
                      startColumn,
                      text,
                    });
                    setPasteMessage(result.message);
                  };
                  return [
                    <td key={`${condition.id}:positive`}>
                      <input
                        className="experiment-workspace-number-input"
                        aria-label={`${experiment.label}・${condition.label}の陽性数`}
                        type="number"
                        disabled={notPlanned}
                        aria-invalid={Boolean(validationMessage) || undefined}
                        aria-describedby={validationMessage ? validationId : undefined}
                        min="0"
                        step="1"
                        value={proportionCell.positive ?? ""}
                        onFocus={(event) => event.currentTarget.select()}
                        onWheel={(event) => event.currentTarget.blur()}
                        onChange={(event) => {
                          setPasteMessage(null);
                          onChange(key, "positive", countValue(event.currentTarget.value));
                        }}
                        onPaste={(event) => {
                          event.preventDefault();
                          handlePaste(conditionIndex * 2, event.clipboardData.getData("text"));
                        }}
                      />
                    </td>,
                    <td
                      className="experiment-workspace-proportion-source-cell"
                      key={`${condition.id}:eligible`}
                    >
                      <input
                        className="experiment-workspace-number-input"
                        aria-label={`${experiment.label}・${condition.label}の対象数`}
                        type="number"
                        disabled={notPlanned}
                        aria-invalid={Boolean(validationMessage) || undefined}
                        aria-describedby={validationMessage ? validationId : undefined}
                        min="0"
                        step="1"
                        value={proportionCell.eligible ?? ""}
                        onFocus={(event) => event.currentTarget.select()}
                        onWheel={(event) => event.currentTarget.blur()}
                        onChange={(event) => {
                          setPasteMessage(null);
                          onChange(key, "eligible", countValue(event.currentTarget.value));
                        }}
                        onPaste={(event) => {
                          event.preventDefault();
                          handlePaste(conditionIndex * 2 + 1, event.clipboardData.getData("text"));
                        }}
                      />
                      <span
                        role="note"
                        className="experiment-workspace-proportion-inline-result"
                        aria-label={`${experiment.label}・${condition.label}の計算された割合`}
                        title="陽性数 ÷ 対象数 × 100（自動計算・編集不可）"
                      >
                        {notPlanned
                          ? "—"
                          : percentage(proportionCell) === null
                            ? "—"
                            : `${formatNumber(percentage(proportionCell))}%`}
                      </span>
                      {validationMessage ? (
                        <small
                          className="experiment-workspace-proportion-validation"
                          id={validationId}
                          role="alert"
                        >
                          {validationMessage}
                        </small>
                      ) : null}
                    </td>,
                  ];
                })}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      {pasteMessage ? (
        <p className="experiment-workspace-paste-hint" role="status" aria-live="polite">
          {pasteMessage}
        </p>
      ) : null}
    </section>
  );
}

function OverviewPanel({
  draft,
  cells,
  onReviseStructure,
  onProportionChange,
  onProportionPaste,
  onNestedScalarChange,
  onNestedScalarPaste,
  onNestedCellChange,
  dataViewMode,
  onDataViewModeChange,
  canonicalSpreadsheet,
}: {
  draft: ExperimentSetDraft;
  cells: ExperimentCellMap;
  onReviseStructure?: (trigger: HTMLButtonElement) => void;
  onProportionChange: (key: string, field: "positive" | "eligible", value: number | null) => void;
  onProportionPaste: (request: OverviewProportionPasteRequest) => OverviewScalarPasteResult;
  onNestedScalarChange: (key: string, value: number | null) => void;
  onNestedScalarPaste: (request: OverviewScalarPasteRequest) => OverviewScalarPasteResult;
  onNestedCellChange: (key: string, cell: NestedContinuousCellDraft) => void;
  dataViewMode: WorkspaceDataViewMode;
  onDataViewModeChange: (mode: WorkspaceDataViewMode) => void;
  canonicalSpreadsheet?: Readonly<{
    observations: readonly CanonicalAdaptiveObservation[];
    readOnly: boolean;
    showExperimentDate: boolean;
    worksheetRows: readonly Readonly<{ key: string; label: string; date: string }>[];
    conditionCombinations?: readonly Readonly<{
      labels: readonly string[];
      displayLabel: string;
      status: "performed" | "not_performed" | "unknown";
    }>[];
    onWorksheetRowChange: (
      rowIndex: number,
      patch: Partial<Readonly<{ key: string; label: string; date: string }>>,
    ) => void;
    onObservationsChange: (observations: readonly CanonicalAdaptiveObservation[]) => void;
    onFileImport: (result: CanonicalWorksheetFileCommit) => void;
    nextObservationId: (context: CompactScalarObservationIdFactoryContext) => string;
    nextExperimentalUnitIdentity: (
      context: CompactScalarObservationIdFactoryContext & { observationId: string },
    ) => string;
  }>;
}) {
  const locale = useAppLocale();
  const t = (ja: string, en: string) => localizedText(locale, ja, en);
  const totalCells =
    draft.experiments.length *
    draft.conditions.length *
    draft.readouts.length *
    timePointsFor(draft).length;
  const notPlannedCells = Object.values(cells).filter(cellIsNotPlanned).length;
  const plannedCells = Math.max(totalCells - notPlannedCells, 0);
  const completedCells = Object.values(cells).filter(cellIsComplete).length;
  const missingCells = Math.max(plannedCells - completedCells, 0);
  const progress = plannedCells === 0 ? 0 : Math.round((completedCells / plannedCells) * 100);
  const onlyReadout =
    draft.time.points.length === 0 && draft.readouts.length === 1 ? draft.readouts[0] : null;
  const quickEntryReadout =
    onlyReadout?.shape === "proportion" ||
    (onlyReadout?.shape === "nested_continuous" && onlyReadout.nestedInputMode === "unit_summary")
      ? onlyReadout
      : null;
  const sharedSource = sharedSourceConditionTopology(draft);
  const canonicalConditionSummaries = (() => {
    const contract = draft.adaptiveInput?.contract;
    if (!contract || !canonicalSpreadsheet) return [];
    const unitIdentityKey = contract.identities.find(
      ({ unitLevelKey }) => unitLevelKey === contract.experimentalUnitLevelKey,
    )?.key;
    const groups = new Map<string, { label: string; units: Set<string>; observations: number }>();
    canonicalSpreadsheet.observations.forEach((observation) => {
      const factorValues = contract.factors.map(
        ({ key, label }) =>
          observation.factors[key]?.trim() || `${label}: ${t("未設定", "not set")}`,
      );
      const groupKey = JSON.stringify(factorValues);
      const group = groups.get(groupKey) ?? {
        label: factorValues.join(" × ") || t("測定", "Measurement"),
        units: new Set<string>(),
        observations: 0,
      };
      group.units.add(
        (unitIdentityKey && observation.identities[unitIdentityKey]?.trim()) ||
          observation.observationId,
      );
      group.observations += 1;
      groups.set(groupKey, group);
    });
    return [...groups.values()];
  })();

  return (
    <section
      className="experiment-workspace-panel experiment-workspace-overview"
      aria-labelledby="experiment-overview-heading"
    >
      <div className="experiment-workspace-panel-heading">
        <div>
          <p className="experiment-workspace-eyebrow">
            {canonicalSpreadsheet || quickEntryReadout
              ? t("データ", "Data")
              : t("実験の確認", "Experiment review")}
          </p>
          <h2 id="experiment-overview-heading">
            {canonicalSpreadsheet
              ? canonicalSpreadsheet.readOnly
                ? t("測定値を確認", "Review measured values")
                : t("測定値を入力", "Enter measured values")
              : quickEntryReadout
                ? t("測定値を入力", "Enter measured values")
                : t("入力状況", "Entry status")}
          </h2>
        </div>
        {onReviseStructure ? (
          <button
            id="experiment-workspace-revise-overview"
            className="experiment-workspace-secondary-button"
            type="button"
            onClick={(event) => onReviseStructure(event.currentTarget)}
          >
            {t("実験名・条件・測定項目を修正", "Edit experiment details")}
          </button>
        ) : null}
      </div>

      {canonicalSpreadsheet && draft.adaptiveInput ? (
        <AdaptiveCanonicalSpreadsheet
          embedded
          contract={draft.adaptiveInput.contract}
          observations={canonicalSpreadsheet.observations}
          mode={dataViewMode}
          onModeChange={onDataViewModeChange}
          onObservationsChange={canonicalSpreadsheet.onObservationsChange}
          nextObservationId={canonicalSpreadsheet.nextObservationId}
          nextExperimentalUnitIdentity={canonicalSpreadsheet.nextExperimentalUnitIdentity}
          readOnly={canonicalSpreadsheet.readOnly}
          worksheetRows={canonicalSpreadsheet.worksheetRows}
          conditionCombinations={canonicalSpreadsheet.conditionCombinations}
          showExperimentDate={canonicalSpreadsheet.showExperimentDate}
          onWorksheetRowChange={canonicalSpreadsheet.onWorksheetRowChange}
          onFileImport={canonicalSpreadsheet.onFileImport}
        />
      ) : quickEntryReadout?.shape === "proportion" ? (
        <OverviewProportionMatrix
          draft={draft}
          readout={quickEntryReadout}
          cells={cells}
          onChange={onProportionChange}
          onPaste={onProportionPaste}
        />
      ) : quickEntryReadout?.shape === "nested_continuous" ? (
        <OverviewUnitSummaryMatrix
          draft={draft}
          readout={quickEntryReadout}
          cells={cells}
          onChange={onNestedScalarChange}
          onPaste={onNestedScalarPaste}
        />
      ) : null}

      {!canonicalSpreadsheet ? (
        <WorkspaceNestedMeasurementSheet
          draft={draft}
          cells={cells}
          mode={dataViewMode}
          onModeChange={onDataViewModeChange}
          onCellChange={onNestedCellChange}
        />
      ) : null}

      {canonicalSpreadsheet ? (
        <div
          className="experiment-workspace-progress is-compact"
          aria-label={
            canonicalSpreadsheet.readOnly
              ? t("保持している測定値の件数", "Number of retained measurements")
              : t("入力した測定値の件数", "Number of entered measurements")
          }
        >
          <div className="experiment-workspace-progress-topline">
            <strong>
              {t(
                `${canonicalSpreadsheet.observations.length}件の測定値`,
                `${canonicalSpreadsheet.observations.length} measurements`,
              )}
            </strong>
          </div>
          <p>
            {canonicalSpreadsheet.readOnly
              ? t(
                  "元の表との対応を保ったまま、条件ごとの件数と個々の測定値を確認できます。",
                  "Review counts by condition and individual measurements while retaining their source-table mapping.",
                )
              : t(
                  "条件ごとの件数が異なっていても、そのまま保持します。",
                  "Unequal counts between conditions are retained as entered.",
                )}
          </p>
          {canonicalConditionSummaries.length ? (
            <ul
              className="experiment-workspace-condition-counts"
              aria-label={t("条件ごとの入力件数", "Entry counts by condition")}
            >
              {canonicalConditionSummaries.map(({ label, units, observations }) => (
                <li key={label}>
                  <strong>{label}</strong>
                  <span>
                    {t("実験単位", "Experimental units")} n={units.size}
                    {observations !== units.size
                      ? t(` · 測定値 ${observations}件`, ` · ${observations} measurements`)
                      : ""}
                  </span>
                </li>
              ))}
            </ul>
          ) : null}
        </div>
      ) : (
        <div
          className={`experiment-workspace-progress${quickEntryReadout ? " is-compact" : ""}`}
          aria-label={t("入力の進み具合", "Data-entry progress")}
        >
          <div className="experiment-workspace-progress-topline">
            <strong>
              {t(
                `${completedCells} / ${plannedCells} セル入力済み`,
                `${completedCells} / ${plannedCells} cells entered`,
              )}
            </strong>
            <span>{progress}%</span>
          </div>
          <div className="experiment-workspace-progress-track" aria-hidden="true">
            <span style={{ width: `${progress}%` }} />
          </div>
          <p>
            {missingCells > 0
              ? t(
                  `未入力のセルが${missingCells}件あります。途中の状態でもグラフを作成できます。`,
                  `${missingCells} cells are blank. You can create a Graph from partial data.`,
                )
              : t("必要なセルがすべて入力されています。", "All required cells have been entered.")}
          </p>
          {notPlannedCells > 0 ? (
            <p>
              {t(
                `測定予定なし：${notPlannedCells}セル（進捗・解析から除外）`,
                `Not planned: ${notPlannedCells} cells (excluded from progress and analysis)`,
              )}
            </p>
          ) : null}
        </div>
      )}

      {!quickEntryReadout && !canonicalSpreadsheet ? (
        <>
          <dl className="experiment-workspace-summary-grid">
            <div>
              <dt>実験セット</dt>
              <dd>{draft.name}</dd>
            </div>
            <div>
              <dt>
                {sharedSource
                  ? `${sharedSource.sourceUnitLabel}の組`
                  : draft.conditionAssignment.kind === "matched"
                    ? "対応づけた単位"
                    : "実験セッション"}
              </dt>
              <dd>
                {draft.experiments.length}
                {sharedSource
                  ? `組（条件別${draft.conditionAssignment.unitLabel}は${draft.experiments.length * draft.conditions.length}）`
                  : draft.conditionAssignment.kind === "matched"
                    ? ` ${draft.conditionAssignment.unitLabel || "単位"}`
                    : "回"}
              </dd>
            </div>
            <div>
              <dt>条件</dt>
              <dd>{draft.conditions.length}条件</dd>
            </div>
            <div>
              <dt>時間</dt>
              <dd>
                {draft.time.points.length > 0
                  ? draft.time.points
                      .map((point) => timePointLabel(point, orderedAxisUnit(draft.time)))
                      .join("、")
                  : "時間点なし"}
              </dd>
            </div>
          </dl>

          <div className="experiment-workspace-overview-section">
            <h3>条件の構成</h3>
            <div className="experiment-workspace-overview-condition-wrap">
              <table
                className="experiment-workspace-overview-condition-table"
                aria-label="条件の構成"
              >
                <thead>
                  <tr>
                    <th scope="col">No.</th>
                    {draft.attributes.map((attribute) => (
                      <th scope="col" key={attribute.id}>
                        {attribute.label}
                      </th>
                    ))}
                    {draft.attributes.length === 0 ? <th scope="col">条件</th> : null}
                  </tr>
                </thead>
                <tbody>
                  {draft.conditions.map((condition, index) => (
                    <tr key={condition.id}>
                      <th scope="row">{index + 1}</th>
                      {draft.attributes.length > 0 ? (
                        conditionAttributeValues(draft, condition.id).map((value, valueIndex) => (
                          <td key={draft.attributes[valueIndex]?.id ?? valueIndex}>{value}</td>
                        ))
                      ) : (
                        <td>{condition.label}</td>
                      )}
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>

          <div className="experiment-workspace-overview-section">
            <h3>測定項目</h3>
            <ul className="experiment-workspace-readout-list">
              {draft.readouts.map((readout) => (
                <li key={readout.id}>
                  <ReadoutLabel readout={readout} />
                  <span>
                    {readout.shape === "proportion"
                      ? "陽性数 / 対象数から割合を表示"
                      : readout.shape === "wb_ratio"
                        ? `${readout.label} / ${readout.referenceLabel ?? "reference"}を派生値として表示`
                        : "生データから実験単位ごとの要約を表示"}
                  </span>
                </li>
              ))}
            </ul>
          </div>
        </>
      ) : null}

      {draft.importProvenance ? (
        <details className="experiment-workspace-overview-section">
          <summary>取込元・列の割り当て・変換履歴を確認</summary>
          <dl className="experiment-workspace-summary-grid">
            <div>
              <dt>取込元</dt>
              <dd>{draft.importProvenance.sourceLabel}</dd>
            </div>
            <div>
              <dt>取込日時</dt>
              <dd>{draft.importProvenance.importedAt}</dd>
            </div>
            <div>
              <dt>除外した元データ行</dt>
              <dd>
                {draft.importProvenance.excludedRowNumbers.length > 0
                  ? draft.importProvenance.excludedRowNumbers.join("、")
                  : "なし"}
              </dd>
            </div>
            <div>
              <dt>重複行の扱い</dt>
              <dd>
                {draft.importProvenance.duplicateDecision === "nested_observations"
                  ? "研究者の確認により、同じ生物学的単位内の複数の生測定として保持"
                  : "重複なし（自動平均なし）"}
              </dd>
            </div>
            <div>
              <dt>取込時の変換</dt>
              <dd>
                {draft.importProvenance.transformations?.length
                  ? draft.importProvenance.transformations.join("／")
                  : "変換記録なし"}
              </dd>
            </div>
          </dl>
          <table aria-label="確認済みの列割り当て">
            <thead>
              <tr>
                <th scope="col">役割</th>
                <th scope="col">元の列</th>
              </tr>
            </thead>
            <tbody>
              {Object.entries(draft.importProvenance.mapping).map(([role, column]) => (
                <tr key={role}>
                  <th scope="row">{role}</th>
                  <td>
                    {typeof column === "number"
                      ? (draft.importProvenance?.headers[column] ?? `列 ${column + 1}`)
                      : column === "row_number"
                        ? "行番号から作成"
                        : "未割当"}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
          <div className="experiment-workspace-overview-condition-wrap">
            <table aria-label="取込元の表（未変更）">
              <thead>
                <tr>
                  <th scope="col">元行</th>
                  {draft.importProvenance.headers.map((header, index) => (
                    <th scope="col" key={`${header}-${index}`}>
                      {header || `列 ${index + 1}`}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {draft.importProvenance.sourceRows.map((row, rowIndex) => (
                  <tr key={rowIndex}>
                    <th scope="row">{rowIndex + 1}</th>
                    {draft.importProvenance?.headers.map((_, columnIndex) => (
                      <td key={columnIndex}>{row[columnIndex] ?? ""}</td>
                    ))}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </details>
      ) : null}

      {!canonicalSpreadsheet ? (
        <div className="experiment-workspace-notice" role="note">
          <strong>
            {locale === "en"
              ? independentAdaptiveInputRows(draft)
                ? "About entry rows"
                : draft.conditionAssignment.kind === "matched"
                  ? `About matched ${draft.conditionAssignment.unitLabel || "units"}`
                  : "About experiment numbers"
              : sharedSource
                ? `${sharedSource.sourceUnitLabel}と条件別${draft.conditionAssignment.unitLabel}について`
                : draft.conditionAssignment.kind === "matched"
                  ? `${draft.conditionAssignment.unitLabel || "対応単位"}について`
                  : independentAdaptiveInputRows(draft)
                    ? "入力行について"
                    : "Exp番号について"}
          </strong>
          <p>
            {locale === "en"
              ? sharedSource
                ? `Each row represents one ${sharedSource.sourceIdentityLabel}. The condition-specific ${draft.conditionAssignment.unitLabel} values remain separate experimental units and are matched only as sets derived from the same ${sharedSource.sourceUnitLabel}.`
                : draft.conditionAssignment.kind === "matched"
                  ? `Rows 1, 2, and so on match measurements across conditions for the same ${draft.conditionAssignment.unitLabel || "unit"}. They are not counts of experimental sessions.`
                  : independentAdaptiveInputRows(draft)
                    ? "Entry rows align values across conditions for display only. Values in the same row are not treated as the same subject or as a pair."
                    : "Exp 1, Exp 2, and so on organize experimental sessions. They do not statistically pair independent conditions."
              : sharedSource
                ? `各行は1つの${sharedSource.sourceIdentityLabel}を表します。条件ごとの${draft.conditionAssignment.unitLabel}は別の実験単位で、同じ${sharedSource.sourceUnitLabel}に由来する組として対応づけます。`
                : draft.conditionAssignment.kind === "matched"
                  ? `${draft.conditionAssignment.unitLabel || "対応単位"} 1、2…の各行では、同じ${draft.conditionAssignment.unitLabel || "単位"}の条件間測定を対応づけています。これらは実験回数ではありません。`
                  : independentAdaptiveInputRows(draft)
                    ? "入力行1、2…は条件ごとの値を横に並べるための表示位置です。同じ行にある別条件の値を、同じ対象やpairとして扱いません。"
                    : "Exp 1、Exp 2…は実験セッションを整理するための番号です。独立した条件同士を統計的に対応付けるものではありません。"}
          </p>
        </div>
      ) : null}
    </section>
  );
}

function formatJapaneseDate(value: string): string {
  const match = value.match(/^(\d{4})-(\d{2})-(\d{2})$/);
  return match ? `${match[1]}/${match[2]}/${match[3]}` : value;
}

function parseJapaneseDate(value: string): string | null {
  const trimmed = value.trim();
  if (!trimmed) return "";
  const match = trimmed.match(/^(\d{4})[/-](\d{1,2})[/-](\d{1,2})$/);
  if (!match) return null;
  const year = Number(match[1]);
  const month = Number(match[2]);
  const day = Number(match[3]);
  const date = new Date(Date.UTC(year, month - 1, day));
  if (
    date.getUTCFullYear() !== year ||
    date.getUTCMonth() !== month - 1 ||
    date.getUTCDate() !== day
  ) {
    return null;
  }
  return `${String(year).padStart(4, "0")}-${String(month).padStart(2, "0")}-${String(day).padStart(2, "0")}`;
}

function JapaneseDateInput({
  label,
  value,
  onChange,
}: {
  label: string;
  value: string;
  onChange: (value: string) => void;
}) {
  const [text, setText] = useState(() => formatJapaneseDate(value));
  const [invalid, setInvalid] = useState(false);

  useEffect(() => {
    setText(formatJapaneseDate(value));
    setInvalid(false);
  }, [value]);

  return (
    <input
      aria-label={label}
      aria-invalid={invalid || undefined}
      type="text"
      inputMode="numeric"
      placeholder="YYYY/MM/DD"
      value={text}
      onChange={(event) => {
        const nextText = event.currentTarget.value;
        const parsed = parseJapaneseDate(nextText);
        setText(parsed === null ? nextText : formatJapaneseDate(parsed));
        setInvalid(parsed === null);
        if (parsed !== null) onChange(parsed);
      }}
      onBlur={() => {
        const parsed = parseJapaneseDate(text);
        if (parsed === null) {
          setText(formatJapaneseDate(value));
          setInvalid(false);
        }
      }}
    />
  );
}

function ExperimentMeta({
  draft,
  experiment,
  onChange,
}: {
  draft: ExperimentSetDraft;
  experiment: ExperimentSessionDraft;
  onChange: (patch: Partial<ExperimentSessionDraft>) => void;
}) {
  const sharedSource = sharedSourceConditionTopology(draft);
  return (
    <div className="experiment-workspace-meta">
      <label>
        <span>{independentAdaptiveInputRows(draft) ? "入力行ID" : "実験回ID"}</span>
        <input
          aria-label={`${experiment.label}の${independentAdaptiveInputRows(draft) ? "入力行ID" : "実験回ID"}`}
          type="text"
          value={experiment.sessionId ?? experiment.id}
          onChange={(event) => onChange({ sessionId: event.currentTarget.value })}
        />
      </label>
      <label>
        <span>
          {sharedSource
            ? sharedSource.sourceIdentityLabel
            : independentAdaptiveInputRows(draft)
              ? "入力行の内部ID"
              : "生物学的単位ID"}
        </span>
        <input
          data-analysis-unit-identity={experiment.id}
          aria-label={`${experiment.label}の${
            sharedSource
              ? sharedSource.sourceIdentityLabel
              : independentAdaptiveInputRows(draft)
                ? "入力行の内部ID"
                : "生物学的単位ID"
          }`}
          type="text"
          disabled={Boolean(sharedSource && draft.adaptiveInput)}
          value={experiment.stableUnitId ?? experiment.id}
          onChange={(event) => onChange({ stableUnitId: event.currentTarget.value })}
        />
        <small>
          {sharedSource
            ? draft.adaptiveInput
              ? `条件別${draft.conditionAssignment.unitLabel}を対応づける共有IDです。取り込んだ元データとの対応履歴を保つため、この画面では変更できません。`
              : `条件別${draft.conditionAssignment.unitLabel}を同じ${sharedSource.sourceUnitLabel}由来として対応づけるID`
            : draft.conditionAssignment.kind === "matched"
              ? `同じ${draft.conditionAssignment.unitLabel}を条件間で対応づけるID`
              : independentAdaptiveInputRows(draft)
                ? "この表示行を識別する内部IDです。各条件の生物学的単位IDではなく、条件間のpairも作りません。"
                : "実験回とは別に保存。この設計では条件間のpairは作らない"}
        </small>
      </label>
      <label>
        <span>実験日</span>
        <JapaneseDateInput
          label={`${experiment.label}の実験日`}
          value={experiment.date}
          onChange={(date) => onChange({ date })}
        />
      </label>
      <label className="experiment-workspace-note-field">
        <span>メモ（任意）</span>
        <input
          aria-label={`${experiment.label}のメモ`}
          type="text"
          placeholder="ロット、担当者、気づいた点など"
          value={experiment.note}
          onChange={(event) => onChange({ note: event.currentTarget.value })}
        />
      </label>
    </div>
  );
}

function ProportionTable({
  draft,
  experiment,
  readout,
  cells,
  onChange,
  onPaste,
  onToggleNotPlanned,
}: {
  draft: ExperimentSetDraft;
  experiment: ExperimentSessionDraft;
  readout: ReadoutDraft;
  cells: ExperimentCellMap;
  onChange: (key: string, field: "positive" | "eligible", value: number | null) => void;
  onPaste: (request: ProportionPasteRequest) => string;
  onToggleNotPlanned: (key: string) => void;
}) {
  const [pasteStatus, setPasteStatus] = useState<string | null>(null);
  const rows = rowsFor(draft, experiment.id);

  const moveGridFocus = (
    event: KeyboardEvent<HTMLInputElement>,
    rowIndex: number,
    columnIndex: number,
  ) => {
    const movement: Record<string, [number, number]> = {
      ArrowUp: [-1, 0],
      ArrowDown: [1, 0],
      ArrowLeft: [0, -1],
      ArrowRight: [0, 1],
      Enter: [event.shiftKey ? -1 : 1, 0],
    };
    const delta = movement[event.key];
    if (!delta) return;
    const nextRow = rowIndex + delta[0];
    const nextColumn = columnIndex + delta[1];
    const target = event.currentTarget
      .closest("table")
      ?.querySelector<HTMLInputElement>(
        `[data-grid-row="${nextRow}"][data-grid-column="${nextColumn}"]`,
      );
    if (!target) return;
    event.preventDefault();
    target.focus();
    target.select();
  };

  return (
    <div className="experiment-workspace-table-wrap">
      <table className="experiment-workspace-table experiment-workspace-table--proportion">
        <colgroup>
          {draft.attributes.map((attribute) => (
            <col key={attribute.id} className="experiment-workspace-col-attribute" />
          ))}
          {draft.time.points.length > 0 ? <col className="experiment-workspace-col-time" /> : null}
          <col className="experiment-workspace-col-value" />
          <col className="experiment-workspace-col-value" />
          <col className="experiment-workspace-col-derived" />
        </colgroup>
        <caption>
          <ReadoutLabel readout={readout} />
        </caption>
        <thead>
          <tr>
            {draft.attributes.map((attribute) => (
              <th key={attribute.id} scope="col">
                {attribute.label || "条件"}
              </th>
            ))}
            {draft.time.points.length > 0 ? <th scope="col">時間</th> : null}
            <th scope="col">陽性数</th>
            <th scope="col">対象数</th>
            <th scope="col">割合（%）</th>
          </tr>
        </thead>
        <tbody>
          {rows.map((row, rowIndex) => {
            const key = experimentCellKey({
              experimentId: experiment.id,
              conditionId: row.conditionId,
              readoutId: readout.id,
              timePointId: row.timePoint?.id,
            });
            const cell = cells[key];
            const proportionCell: ProportionCellDraft =
              cell?.kind === "proportion"
                ? cell
                : { kind: "proportion", positive: null, eligible: null };
            const notPlanned = cellIsNotPlanned(proportionCell);
            const validationMessage = proportionValidationMessage(proportionCell);
            const validationId = `proportion-validation-${experiment.id}-${rowIndex}`;
            return (
              <tr key={row.key}>
                <ConditionCells draft={draft} row={row} />
                {draft.time.points.length > 0 ? (
                  <td>
                    {row.timePoint
                      ? timePointLabel(row.timePoint, orderedAxisUnit(draft.time))
                      : "—"}
                  </td>
                ) : null}
                <td>
                  <input
                    className="experiment-workspace-number-input"
                    aria-label={`${row.conditionLabel}${rowTimeQualifier(row, orderedAxisUnit(draft.time))}の陽性数`}
                    type="number"
                    disabled={notPlanned}
                    aria-invalid={Boolean(validationMessage) || undefined}
                    aria-describedby={validationMessage ? validationId : undefined}
                    min="0"
                    step="1"
                    data-grid-row={rowIndex}
                    data-grid-column={0}
                    value={proportionCell.positive ?? ""}
                    onFocus={(event) => event.currentTarget.select()}
                    onWheel={(event) => event.currentTarget.blur()}
                    onKeyDown={(event) => moveGridFocus(event, rowIndex, 0)}
                    onChange={(event) => {
                      setPasteStatus(null);
                      onChange(key, "positive", countValue(event.currentTarget.value));
                    }}
                    onPaste={(event) => {
                      event.preventDefault();
                      setPasteStatus(
                        onPaste({
                          experimentId: experiment.id,
                          readoutId: readout.id,
                          startRow: rowIndex,
                          startColumn: 0,
                          text: event.clipboardData.getData("text"),
                        }),
                      );
                    }}
                  />
                </td>
                <td>
                  <input
                    className="experiment-workspace-number-input"
                    aria-label={`${row.conditionLabel}${rowTimeQualifier(row, orderedAxisUnit(draft.time))}の対象数`}
                    type="number"
                    disabled={notPlanned}
                    aria-invalid={Boolean(validationMessage) || undefined}
                    aria-describedby={validationMessage ? validationId : undefined}
                    min="0"
                    step="1"
                    data-grid-row={rowIndex}
                    data-grid-column={1}
                    value={proportionCell.eligible ?? ""}
                    onFocus={(event) => event.currentTarget.select()}
                    onWheel={(event) => event.currentTarget.blur()}
                    onKeyDown={(event) => moveGridFocus(event, rowIndex, 1)}
                    onChange={(event) => {
                      setPasteStatus(null);
                      onChange(key, "eligible", countValue(event.currentTarget.value));
                    }}
                    onPaste={(event) => {
                      event.preventDefault();
                      setPasteStatus(
                        onPaste({
                          experimentId: experiment.id,
                          readoutId: readout.id,
                          startRow: rowIndex,
                          startColumn: 1,
                          text: event.clipboardData.getData("text"),
                        }),
                      );
                    }}
                  />
                </td>
                <td
                  className="experiment-workspace-derived-cell"
                  title="陽性数 ÷ 対象数 × 100（自動計算・編集不可）"
                  aria-label={`${row.conditionLabel}${rowTimeQualifier(row, orderedAxisUnit(draft.time))}の計算された割合`}
                >
                  <span>{notPlanned ? "—" : formatNumber(percentage(proportionCell))}</span>
                  {validationMessage ? (
                    <small
                      className="experiment-workspace-proportion-validation"
                      id={validationId}
                      role="alert"
                    >
                      {validationMessage}
                    </small>
                  ) : null}
                  {notPlanned ? (
                    <button
                      className="experiment-workspace-availability-button is-active"
                      type="button"
                      aria-label={`${row.conditionLabel}${rowTimeQualifier(row, orderedAxisUnit(draft.time))}を入力対象に戻す`}
                      onClick={() => onToggleNotPlanned(key)}
                    >
                      入力対象に戻す
                    </button>
                  ) : null}
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
      <p className="experiment-workspace-paste-hint">
        ヒント：選んだセルはそのままコピー／貼り付けできます。ExcelやGoogle
        Sheetsからの矩形表も、左上にしたいセルから貼り付けてください。矢印・Enter・Shift+Enter・Tabで移動でき、割合は自動計算します。
      </p>
      {pasteStatus ? (
        <p className="experiment-workspace-paste-status" role="status" aria-live="polite">
          {pasteStatus}
        </p>
      ) : null}
    </div>
  );
}

function NestedContinuousTable({
  draft,
  experiment,
  readout,
  cells,
  onSelect,
  onToggleNotPlanned,
}: {
  draft: ExperimentSetDraft;
  experiment: ExperimentSessionDraft;
  readout: ReadoutDraft;
  cells: ExperimentCellMap;
  onSelect: (key: string) => void;
  onToggleNotPlanned: (key: string) => void;
}) {
  const rows = rowsFor(draft, experiment.id);

  return (
    <div className="experiment-workspace-table-wrap">
      <table className="experiment-workspace-table experiment-workspace-table--continuous">
        <colgroup>
          {draft.attributes.map((attribute) => (
            <col key={attribute.id} className="experiment-workspace-col-attribute" />
          ))}
          <col className="experiment-workspace-col-time" />
          <col className="experiment-workspace-col-summary" />
        </colgroup>
        <caption>
          <ReadoutLabel readout={readout} />
        </caption>
        <thead>
          <tr>
            {draft.attributes.map((attribute) => (
              <th key={attribute.id} scope="col">
                {attribute.label || "条件"}
              </th>
            ))}
            {draft.time.points.length > 0 ? <th scope="col">時間</th> : null}
            <th scope="col">生データ / 要約</th>
          </tr>
        </thead>
        <tbody>
          {rows.map((row) => {
            const key = experimentCellKey({
              experimentId: experiment.id,
              conditionId: row.conditionId,
              readoutId: readout.id,
              timePointId: row.timePoint?.id,
            });
            const cell: NestedContinuousCellDraft =
              cells[key]?.kind === "nested_continuous"
                ? cells[key]
                : { kind: "nested_continuous", rawValues: [], source: "manual" };
            const summary = continuousSummary(cell.rawValues);
            const notPlanned = cellIsNotPlanned(cell);
            return (
              <tr key={row.key}>
                <ConditionCells draft={draft} row={row} />
                {draft.time.points.length > 0 ? (
                  <td>
                    {row.timePoint
                      ? timePointLabel(row.timePoint, orderedAxisUnit(draft.time))
                      : "—"}
                  </td>
                ) : null}
                <td>
                  <button
                    className="experiment-workspace-raw-button"
                    type="button"
                    disabled={notPlanned}
                    aria-label={`${row.conditionLabel}${rowTimeQualifier(row, orderedAxisUnit(draft.time))}の生データを開く`}
                    onClick={() => onSelect(key)}
                  >
                    {notPlanned
                      ? "入力対象外"
                      : summary.n > 0
                        ? `n=${summary.n} / 平均 ${formatNumber(summary.mean)}`
                        : "生データを入力"}
                  </button>
                  {notPlanned ? (
                    <button
                      className="experiment-workspace-availability-button is-active"
                      type="button"
                      aria-label={`${row.conditionLabel}${rowTimeQualifier(row, orderedAxisUnit(draft.time))}を入力対象に戻す`}
                      onClick={() => onToggleNotPlanned(key)}
                    >
                      入力対象に戻す
                    </button>
                  ) : null}
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}

function DecimalValueInput({
  label,
  value,
  disabled = false,
  onChange,
  onRejectedPaste,
  onMatrixPaste,
}: {
  label: string;
  value: number | null;
  disabled?: boolean;
  onChange: (value: number | null) => void;
  onRejectedPaste: () => void;
  onMatrixPaste?: (text: string) => boolean;
}) {
  const locale = useAppLocale();
  const inputRef = useRef<HTMLInputElement>(null);
  const { text: draftValue, edit, accept } = useSpreadsheetCellDraft(
    value === null ? "" : String(value),
    { preserveDirtyOnCanonicalChange: true },
  );

  const commitIfComplete = (text: string) => {
    if (text.trim() === "") {
      onChange(null);
      return;
    }
    const parsed = Number(text);
    if (Number.isFinite(parsed)) onChange(parsed);
  };

  return (
    <input
      ref={inputRef}
      aria-label={label}
      className="experiment-workspace-number-input"
      disabled={disabled}
      inputMode="decimal"
      placeholder={localizedText(locale, "数値を入力", "Enter a number")}
      type="text"
      value={draftValue}
      onFocus={(event) => {
        event.currentTarget.select();
      }}
      onChange={(event) => {
        const text = event.currentTarget.value;
        edit(text);
        commitIfComplete(text);
      }}
      onBlur={() => {
        const parsed = parseSpreadsheetNumber(draftValue);
        accept(parsed === null ? "" : String(parsed));
        onChange(parsed);
      }}
      onPaste={(event) => {
        const text = event.clipboardData.getData("text");
        const values = parseNumericPaste(text);
        if (/\r|\n|\t/.test(text) || values.length > 1) {
          event.preventDefault();
          if (onMatrixPaste) {
            const accepted = onMatrixPaste(text);
            if (accepted) {
              const firstToken = proportionPasteRows(text)[0]?.[0]?.trim() ?? "";
              edit(firstToken === "" ? "" : String(Number(firstToken)));
            }
          } else onRejectedPaste();
        }
      }}
    />
  );
}

function UnitSummaryContinuousTable({
  draft,
  experiment,
  readout,
  cells,
  onChange,
  onToggleNotPlanned,
}: {
  draft: ExperimentSetDraft;
  experiment: ExperimentSessionDraft;
  readout: ReadoutDraft;
  cells: ExperimentCellMap;
  onChange: (key: string, value: number | null) => void;
  onToggleNotPlanned: (key: string) => void;
}) {
  const rows = rowsFor(draft, experiment.id);
  const [pasteMessage, setPasteMessage] = useState<string | null>(null);
  return (
    <div className="experiment-workspace-table-wrap">
      <table className="experiment-workspace-table experiment-workspace-table--continuous">
        <caption>
          <ReadoutLabel readout={readout} />
          <small className="experiment-workspace-normalization-status">
            各欄は1つの実験単位から得た要約値です
          </small>
        </caption>
        <thead>
          <tr>
            {draft.attributes.map((attribute) => (
              <th key={attribute.id} scope="col">
                {attribute.label || "条件"}
              </th>
            ))}
            {draft.time.points.length > 0 ? <th scope="col">時間</th> : null}
            <th scope="col">測定値（クリックして入力）</th>
          </tr>
        </thead>
        <tbody>
          {rows.map((row) => {
            const key = experimentCellKey({
              experimentId: experiment.id,
              conditionId: row.conditionId,
              readoutId: readout.id,
              timePointId: row.timePoint?.id,
            });
            const cell = cells[key];
            const value = cell?.kind === "nested_continuous" ? (cell.rawValues[0] ?? null) : null;
            const notPlanned = cellIsNotPlanned(cell);
            const label = `${row.conditionLabel}${rowTimeQualifier(row, orderedAxisUnit(draft.time))}の${readout.label}`;
            return (
              <tr key={row.key}>
                <ConditionCells draft={draft} row={row} />
                {draft.time.points.length > 0 ? (
                  <td>
                    {row.timePoint
                      ? timePointLabel(row.timePoint, orderedAxisUnit(draft.time))
                      : "—"}
                  </td>
                ) : null}
                <td>
                  <DecimalValueInput
                    label={label}
                    value={value}
                    disabled={notPlanned}
                    onChange={(nextValue) => onChange(key, nextValue)}
                    onRejectedPaste={() =>
                      setPasteMessage(
                        "この欄には実験単位の要約値を1つだけ入力します。複数値は反映せず、既存値を保持しました。",
                      )
                    }
                  />
                  {notPlanned ? (
                    <button
                      className="experiment-workspace-availability-button is-active"
                      type="button"
                      onClick={() => onToggleNotPlanned(key)}
                    >
                      入力対象に戻す
                    </button>
                  ) : null}
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
      {pasteMessage ? (
        <p className="experiment-workspace-paste-hint" role="status">
          {pasteMessage}
        </p>
      ) : null}
      <p className="experiment-workspace-paste-hint">
        表の「測定値」欄をクリックして、各条件につき1つの数値を入力します。
      </p>
    </div>
  );
}

function CorrelationTable({
  draft,
  experiment,
  readout,
  cells,
  onChange,
}: {
  draft: ExperimentSetDraft;
  experiment: ExperimentSessionDraft;
  readout: ReadoutDraft;
  cells: ExperimentCellMap;
  onChange: (key: string, value: number | null) => void;
}) {
  const variables = draft.conditions.slice(0, 2);
  const keys = variables.map((condition) =>
    experimentCellKey({
      experimentId: experiment.id,
      conditionId: condition.id,
      readoutId: readout.id,
    }),
  );
  const values = keys.map((key) => {
    const cell = cells[key];
    return cell?.kind === "nested_continuous" ? (cell.rawValues[0] ?? null) : null;
  });
  const pastePair = (text: string) => {
    const tokens = text
      .replace(/\r\n?/g, "\n")
      .split(/[\t\n]/)
      .filter((token) => token.trim());
    tokens.slice(0, 2).forEach((token, index) =>
      onChange(keys[index], parseSpreadsheetNumber(token)),
    );
  };
  return (
    <div className="experiment-workspace-table-wrap">
      <table className="experiment-workspace-table experiment-workspace-table--xy">
        <caption>同じ{draft.conditionAssignment.unitLabel}から得たX–Yペア</caption>
        <thead>
          <tr>
            <th scope="col">実験単位</th>
            {variables.map((variable, index) => (
              <th key={variable.id} scope="col">
                {index === 0 ? "X" : "Y"}：{variable.label}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          <tr>
            <th scope="row">{experiment.label}</th>
            {variables.map((variable, index) => (
              <td key={variable.id}>
                <input
                  aria-label={`${experiment.label}の${variable.label}`}
                  className="experiment-workspace-number-input"
                  data-grid-column={index}
                  inputMode="decimal"
                  type="number"
                  value={values[index] ?? ""}
                  onFocus={(event) => event.currentTarget.select()}
                  onWheel={(event) => event.currentTarget.blur()}
                  onChange={(event) =>
                    onChange(keys[index], parseSpreadsheetNumber(event.currentTarget.value))
                  }
                  onKeyDown={(event) => {
                    const offset =
                      event.key === "ArrowLeft" ? -1 : event.key === "ArrowRight" ? 1 : 0;
                    if (!offset) return;
                    const target = event.currentTarget
                      .closest("table")
                      ?.querySelector<HTMLInputElement>(`[data-grid-column="${index + offset}"]`);
                    if (!target) return;
                    event.preventDefault();
                    target.focus();
                    target.select();
                  }}
                  onPaste={(event) => {
                    const text = event.clipboardData.getData("text");
                    if (!text.includes("\t") && !text.includes("\n")) return;
                    event.preventDefault();
                    pastePair(text);
                  }}
                />
              </td>
            ))}
          </tr>
        </tbody>
      </table>
      <p className="experiment-workspace-paste-hint">
        ExcelやGoogle SheetsからXとYの2セルをコピーし、Xセルへそのまま貼り付けられます。
      </p>
    </div>
  );
}

function CategoricalCountsTable({
  draft,
  experiment,
  readout,
  cells,
  onChange,
}: {
  draft: ExperimentSetDraft;
  experiment: ExperimentSessionDraft;
  readout: ReadoutDraft;
  cells: ExperimentCellMap;
  onChange: (key: string, categoryId: string, value: number | null) => void;
}) {
  const rows = rowsFor(draft, experiment.id);
  const categories = readout.categories ?? [];
  const move = (event: KeyboardEvent<HTMLInputElement>, rowIndex: number, columnIndex: number) => {
    const delta =
      event.key === "ArrowUp"
        ? [-1, 0]
        : event.key === "ArrowDown" || event.key === "Enter"
          ? [1, 0]
          : event.key === "ArrowLeft"
            ? [0, -1]
            : event.key === "ArrowRight"
              ? [0, 1]
              : null;
    if (!delta) return;
    const target = event.currentTarget
      .closest("table")
      ?.querySelector<HTMLInputElement>(
        `[data-grid-row="${rowIndex + delta[0]}"][data-grid-column="${columnIndex + delta[1]}"]`,
      );
    if (!target) return;
    event.preventDefault();
    target.focus();
    target.select();
  };
  const paste = (startRow: number, startColumn: number, text: string) => {
    proportionPasteRows(text).forEach((tokens, rowOffset) => {
      const row = rows[startRow + rowOffset];
      if (!row) return;
      const key = experimentCellKey({
        experimentId: experiment.id,
        conditionId: row.conditionId,
        readoutId: readout.id,
        timePointId: row.timePoint?.id,
      });
      tokens.forEach((token, columnOffset) => {
        const category = categories[startColumn + columnOffset];
        if (!category || !token.trim()) return;
        onChange(key, category.id, countValue(token));
      });
    });
  };
  return (
    <div className="experiment-workspace-table-wrap">
      <table className="experiment-workspace-table experiment-workspace-table--categorical">
        <caption>
          <ReadoutLabel readout={readout} />
        </caption>
        <thead>
          <tr>
            {draft.attributes.map((attribute) => (
              <th key={attribute.id} scope="col">
                {attribute.label}
              </th>
            ))}
            {draft.time.points.length > 0 ? <th scope="col">時間</th> : null}
            {categories.map((category) => (
              <th key={category.id} scope="col">
                {category.label}
              </th>
            ))}
            <th scope="col">合計</th>
            <th scope="col">構成（%）</th>
          </tr>
        </thead>
        <tbody>
          {rows.map((row, rowIndex) => {
            const key = experimentCellKey({
              experimentId: experiment.id,
              conditionId: row.conditionId,
              readoutId: readout.id,
              timePointId: row.timePoint?.id,
            });
            const cell: CategoricalCountsCellDraft =
              cells[key]?.kind === "categorical_counts"
                ? cells[key]
                : { kind: "categorical_counts", counts: {} };
            return (
              <tr key={row.key}>
                <ConditionCells draft={draft} row={row} />
                {draft.time.points.length > 0 ? (
                  <td>
                    {row.timePoint
                      ? timePointLabel(row.timePoint, orderedAxisUnit(draft.time))
                      : "—"}
                  </td>
                ) : null}
                {categories.map((category, columnIndex) => (
                  <td key={category.id}>
                    <input
                      aria-label={`${row.conditionLabel}${rowTimeQualifier(row, orderedAxisUnit(draft.time))}の${category.label}数`}
                      className="experiment-workspace-number-input"
                      data-grid-row={rowIndex}
                      data-grid-column={columnIndex}
                      min="0"
                      step="1"
                      type="number"
                      value={cell.counts[category.id] ?? ""}
                      onFocus={(event) => event.currentTarget.select()}
                      onWheel={(event) => event.currentTarget.blur()}
                      onKeyDown={(event) => move(event, rowIndex, columnIndex)}
                      onChange={(event) =>
                        onChange(key, category.id, countValue(event.currentTarget.value))
                      }
                      onPaste={(event) => {
                        const text = event.clipboardData.getData("text");
                        if (!text.includes("\t") && !text.includes("\n")) return;
                        event.preventDefault();
                        paste(rowIndex, columnIndex, text);
                      }}
                    />
                  </td>
                ))}
                <td className="experiment-workspace-derived-cell">
                  {formatNumber(categoricalTotal(cell))}
                </td>
                <td className="experiment-workspace-derived-cell">
                  {categoricalTotal(cell) === null
                    ? "—"
                    : categories
                        .map(
                          (category) =>
                            `${category.label} ${formatNumber(categoricalPercentage(cell, category.id))}%`,
                        )
                        .join(" / ")}
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
      <p className="experiment-workspace-paste-hint">
        カテゴリ列を含む矩形範囲を左上の数値セルから貼り付けられます。割合はグラフ用に自動計算し、countを上書きしません。
      </p>
    </div>
  );
}

type WbEditableField =
  | "target"
  | "reference"
  | "targetIntensity"
  | "targetBackground"
  | "targetArea"
  | "referenceIntensity"
  | "referenceBackground"
  | "referenceArea";

function wbEditableValue(cell: WbRatioCellDraft, field: WbEditableField): number | null {
  if (field === "target" || field === "reference") return cell[field];
  const source = field.startsWith("target") ? cell.targetSource : cell.referenceSource;
  const sourceField = field.endsWith("Intensity")
    ? "intensity"
    : field.endsWith("Background")
      ? "background"
      : "area";
  return source?.[sourceField] ?? null;
}

function WbRatioTable({
  draft,
  experiment,
  readout,
  cells,
  onChange,
}: {
  draft: ExperimentSetDraft;
  experiment: ExperimentSessionDraft;
  readout: ReadoutDraft;
  cells: ExperimentCellMap;
  onChange: (key: string, field: WbEditableField, value: number | null) => void;
}) {
  const rows = rowsFor(draft, experiment.id);
  const usesImageJSource = readout.wbInputMode === "imagej_mean_background_area";
  const editableFields: readonly WbEditableField[] = usesImageJSource
    ? [
        "targetIntensity",
        "targetBackground",
        "targetArea",
        "referenceIntensity",
        "referenceBackground",
        "referenceArea",
      ]
    : ["target", "reference"];
  const fieldLabel = (field: WbEditableField) => {
    const target = field.startsWith("target");
    const bandLabel = target ? readout.label : (readout.referenceLabel ?? "reference");
    if (field === "target" || field === "reference") return bandLabel;
    if (field.endsWith("Intensity")) return `${bandLabel} Intensity`;
    if (field.endsWith("Background")) return `${bandLabel} Background`;
    return `${bandLabel} Area`;
  };
  const move = (event: KeyboardEvent<HTMLInputElement>, rowIndex: number, columnIndex: number) => {
    const delta =
      event.key === "ArrowUp"
        ? [-1, 0]
        : event.key === "ArrowDown" || event.key === "Enter"
          ? [1, 0]
          : event.key === "ArrowLeft"
            ? [0, -1]
            : event.key === "ArrowRight"
              ? [0, 1]
              : null;
    if (!delta) return;
    const target = event.currentTarget
      .closest("table")
      ?.querySelector<HTMLInputElement>(
        `[data-grid-row="${rowIndex + delta[0]}"][data-grid-column="${columnIndex + delta[1]}"]`,
      );
    if (!target) return;
    event.preventDefault();
    target.focus();
    target.select();
  };
  const paste = (startRow: number, startColumn: number, text: string) => {
    proportionPasteRows(text).forEach((tokens, rowOffset) => {
      const row = rows[startRow + rowOffset];
      if (!row) return;
      const key = experimentCellKey({
        experimentId: experiment.id,
        conditionId: row.conditionId,
        readoutId: readout.id,
        timePointId: row.timePoint?.id,
      });
      tokens.forEach((token, columnOffset) => {
        const field = editableFields[startColumn + columnOffset];
        if (!field || !token.trim()) return;
        const value = parseSpreadsheetNumber(token);
        if (value === null || value < 0) return;
        onChange(key, field, value);
      });
    });
  };

  return (
    <div className="experiment-workspace-table-wrap">
      <table className="experiment-workspace-table experiment-workspace-table--wb">
        <caption>
          <ReadoutLabel readout={readout} />
          <small className="experiment-workspace-normalization-status">
            追加正規化：
            {readout.withinExperimentNormalization?.method === "control_equals_one"
              ? (draft.conditions.find(
                  ({ id }) => id === readout.withinExperimentNormalization?.baselineConditionId,
                )?.label || "先頭条件") + " = 1"
              : readout.withinExperimentNormalization?.method === "per_unit_maximum"
                ? "実験内の最大値 = 1"
                : "なし（Target/reference比まで）"}
          </small>
        </caption>
        <thead>
          <tr>
            {draft.attributes.map((attribute) => (
              <th key={attribute.id} scope="col">
                {attribute.label}
              </th>
            ))}
            {draft.time.points.length > 0 ? <th scope="col">時間</th> : null}
            {editableFields.map((field) => (
              <th key={field} scope="col">
                {fieldLabel(field)}
              </th>
            ))}
            {usesImageJSource ? (
              <>
                <th scope="col">{readout.label}（補正値）</th>
                <th scope="col">{readout.referenceLabel ?? "reference"}（補正値）</th>
              </>
            ) : null}
            <th scope="col">
              {readout.withinExperimentNormalization?.method === "control_equals_one"
                ? `相対値（${
                    draft.conditions.find(
                      ({ id }) => id === readout.withinExperimentNormalization?.baselineConditionId,
                    )?.label || "先頭条件"
                  } = 1）`
                : readout.withinExperimentNormalization?.method === "per_unit_maximum"
                  ? "相対値（最大 = 1）"
                  : "比"}
            </th>
          </tr>
        </thead>
        <tbody>
          {rows.map((row, rowIndex) => {
            const key = experimentCellKey({
              experimentId: experiment.id,
              conditionId: row.conditionId,
              readoutId: readout.id,
              timePointId: row.timePoint?.id,
            });
            const cell: WbRatioCellDraft =
              cells[key]?.kind === "wb_ratio"
                ? cells[key]
                : {
                    kind: "wb_ratio",
                    target: null,
                    reference: null,
                    inputMode: readout.wbInputMode ?? "corrected_value",
                  };
            const valuesByCondition = Object.fromEntries(
              draft.conditions.map((condition) => {
                const candidate =
                  cells[
                    experimentCellKey({
                      experimentId: experiment.id,
                      conditionId: condition.id,
                      readoutId: readout.id,
                      timePointId: row.timePoint?.id,
                    })
                  ];
                return [condition.id, candidate?.kind === "wb_ratio" ? wbRatio(candidate) : null];
              }),
            );
            const displayedValue = normalizeWithinExperiment(
              wbRatio(cell),
              valuesByCondition,
              row.conditionId,
              readout,
            );
            return (
              <tr key={row.key}>
                <ConditionCells draft={draft} row={row} />
                {draft.time.points.length > 0 ? (
                  <td>
                    {row.timePoint
                      ? timePointLabel(row.timePoint, orderedAxisUnit(draft.time))
                      : "—"}
                  </td>
                ) : null}
                {editableFields.map((field, columnIndex) => (
                  <td key={field}>
                    <input
                      aria-label={`${row.conditionLabel}${rowTimeQualifier(row, orderedAxisUnit(draft.time))}の${fieldLabel(field)}`}
                      className="experiment-workspace-number-input"
                      data-grid-column={columnIndex}
                      data-grid-row={rowIndex}
                      inputMode="decimal"
                      min="0"
                      type="number"
                      value={wbEditableValue(cell, field) ?? ""}
                      onFocus={(event) => event.currentTarget.select()}
                      onWheel={(event) => event.currentTarget.blur()}
                      onKeyDown={(event) => move(event, rowIndex, columnIndex)}
                      onChange={(event) => {
                        const value = parseSpreadsheetNumber(event.currentTarget.value);
                        onChange(key, field, value !== null && value >= 0 ? value : null);
                      }}
                      onPaste={(event) => {
                        const text = event.clipboardData.getData("text");
                        if (!text.includes("\t") && !text.includes("\n")) return;
                        event.preventDefault();
                        paste(rowIndex, columnIndex, text);
                      }}
                    />
                  </td>
                ))}
                {usesImageJSource ? (
                  <>
                    <td className="experiment-workspace-derived-cell">
                      {formatNumber(wbCorrectedBandValue(cell, "target"))}
                    </td>
                    <td className="experiment-workspace-derived-cell">
                      {formatNumber(wbCorrectedBandValue(cell, "reference"))}
                    </td>
                  </>
                ) : null}
                <td className="experiment-workspace-derived-cell">
                  {formatNumber(displayedValue)}
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
      <p className="experiment-workspace-paste-hint">
        {usesImageJSource
          ? "ImageJの Mean intensity、Mean background、Area を標的3列・reference 3列の順に矩形貼り付けできます。補正値 = (Intensity − Background) × Area。RawIntDenとは自動的に読み替えません。元測定値と計算式を保存します。"
          : "標的とreferenceの補正済み値2列をExcelから矩形貼り付けできます。入力値を保存し、比と明示的に選んだ相対値は自動計算します。"}
      </p>
    </div>
  );
}

function RawSummaryInspector({
  descriptor,
  cell,
  sourceNote,
  onValuesChange,
  onSourceNoteChange,
  onClose,
}: {
  descriptor: CellDescriptor;
  cell: NestedContinuousCellDraft;
  sourceNote: string;
  onValuesChange: (value: string) => void;
  onSourceNoteChange: (value: string) => void;
  onClose: () => void;
}) {
  const summary = continuousSummary(cell.rawValues);
  return (
    <aside className="experiment-workspace-inspector" aria-label="生データ／要約">
      <div className="experiment-workspace-inspector-heading">
        <div>
          <p className="experiment-workspace-eyebrow">選択中のセル</p>
          <h2>生データ／要約</h2>
        </div>
        <button
          className="experiment-workspace-icon-button"
          type="button"
          aria-label="インスペクターを閉じる"
          onClick={onClose}
        >
          ×
        </button>
      </div>
      <p className="experiment-workspace-inspector-location">
        {descriptor.experiment.label} · {descriptor.conditionLabel}
        {descriptor.timePoint
          ? ` · ${timePointLabel(descriptor.timePoint, descriptor.timeUnit)}`
          : ""}
      </p>
      <label className="experiment-workspace-inspector-field">
        <span>生データ（1行1値、貼り付け可）</span>
        <textarea
          aria-label="生データ"
          rows={8}
          value={cell.rawValues.join("\n")}
          placeholder="例: 10\n12\n14"
          onChange={(event) => onValuesChange(event.currentTarget.value)}
        />
      </label>
      <dl className="experiment-workspace-inspector-stats">
        <div>
          <dt>n</dt>
          <dd>{summary.n}</dd>
        </div>
        <div>
          <dt>平均</dt>
          <dd>{formatNumber(summary.mean)}</dd>
        </div>
        <div>
          <dt>中央値</dt>
          <dd>{formatNumber(summary.median)}</dd>
        </div>
        <div>
          <dt>SD</dt>
          <dd>{formatNumber(summary.sd)}</dd>
        </div>
      </dl>
      <label className="experiment-workspace-inspector-field">
        <span>出典メモ（任意）</span>
        <input
          aria-label="出典メモ"
          type="text"
          placeholder="ImageJ Results、測定ファイル名など"
          value={sourceNote}
          onChange={(event) => onSourceNoteChange(event.currentTarget.value)}
        />
      </label>
      <p className="experiment-workspace-inspector-note">
        個々のCell・ROI値はraw
        observationとして表示します。Statisticsは各実験単位内の要約値を解析し、Cell数をbiological
        nにはしません。
      </p>
    </aside>
  );
}

function ExperimentPanel({
  draft,
  experiment,
  cells,
  onExperimentChange,
  onProportionChange,
  onProportionPaste,
  onNestedSelect,
  onNestedScalarChange,
  onCategoricalChange,
  onWbRatioChange,
  onToggleNotPlanned,
  onRemove,
  canRemove,
}: {
  draft: ExperimentSetDraft;
  experiment: ExperimentSessionDraft;
  cells: ExperimentCellMap;
  onExperimentChange: (patch: Partial<ExperimentSessionDraft>) => void;
  onProportionChange: (key: string, field: "positive" | "eligible", value: number | null) => void;
  onProportionPaste: (request: ProportionPasteRequest) => string;
  onNestedSelect: (key: string) => void;
  onNestedScalarChange: (key: string, value: number | null) => void;
  onCategoricalChange: (key: string, categoryId: string, value: number | null) => void;
  onWbRatioChange: (key: string, field: WbEditableField, value: number | null) => void;
  onToggleNotPlanned: (key: string) => void;
  onRemove: () => void;
  canRemove: boolean;
}) {
  const sharedSource = sharedSourceConditionTopology(draft);
  return (
    <section
      className="experiment-workspace-panel"
      aria-labelledby={`${experiment.id}-heading`}
      data-analysis-experiment={experiment.id}
    >
      <div className="experiment-workspace-panel-heading">
        <h2 id={`${experiment.id}-heading`}>データ入力</h2>
        <div className="experiment-workspace-session-actions">
          <span className="experiment-workspace-session-badge">
            {sharedSource
              ? `同じ${sharedSource.sourceUnitLabel}に由来する組`
              : draft.conditionAssignment.kind === "matched"
                ? `対応する${draft.conditionAssignment.unitLabel}`
                : independentAdaptiveInputRows(draft)
                  ? "条件ごとの独立した値を並べる入力行"
                  : "独立したセッション"}
          </span>
          {canRemove ? (
            <button
              className="experiment-workspace-remove-session"
              type="button"
              aria-label={`${experiment.label}を削除`}
              onClick={onRemove}
            >
              {draft.conditionAssignment.kind === "matched"
                ? `${matchedSetLabel(draft)}を削除`
                : independentAdaptiveInputRows(draft)
                  ? "入力行を削除"
                  : "実験回を削除"}
            </button>
          ) : null}
        </div>
      </div>
      <details className="experiment-workspace-session-details">
        <summary>実験情報（{experiment.date || "日付未入力"}）</summary>
        <p className="experiment-workspace-session-note">
          {sharedSource
            ? `同じ${sharedSource.sourceUnitLabel}に由来する、条件別の${draft.conditionAssignment.unitLabel}を対応づけています。各条件の${draft.conditionAssignment.unitLabel}は別の実験単位です。`
            : draft.conditionAssignment.kind === "matched"
              ? `各条件を同じ${draft.conditionAssignment.unitLabel}の測定として対応づけます。`
              : "条件間の対応は作らず、独立した実験単位として扱います。"}
        </p>
        <ExperimentMeta draft={draft} experiment={experiment} onChange={onExperimentChange} />
      </details>
      {draft.readouts
        .filter(({ shape }) => shape === "wb_ratio")
        .map((readout) => (
          <WbRatioTable
            key={readout.id}
            draft={draft}
            experiment={experiment}
            readout={readout}
            cells={cells}
            onChange={onWbRatioChange}
          />
        ))}
      {draft.readouts
        .filter(({ shape }) => shape === "categorical_counts")
        .map((readout) => (
          <CategoricalCountsTable
            key={readout.id}
            draft={draft}
            experiment={experiment}
            readout={readout}
            cells={cells}
            onChange={onCategoricalChange}
          />
        ))}
      {draft.readouts
        .filter(({ shape }) => shape === "proportion")
        .map((readout) => (
          <ProportionTable
            key={readout.id}
            draft={draft}
            experiment={experiment}
            readout={readout}
            cells={cells}
            onChange={onProportionChange}
            onPaste={onProportionPaste}
            onToggleNotPlanned={onToggleNotPlanned}
          />
        ))}
      {draft.readouts
        .filter(({ shape }) => shape === "nested_continuous")
        .map((readout) =>
          draft.analysisIntent.kind === "correlation" ? (
            <CorrelationTable
              key={readout.id}
              draft={draft}
              experiment={experiment}
              readout={readout}
              cells={cells}
              onChange={onNestedScalarChange}
            />
          ) : readout.nestedInputMode === "unit_summary" ? (
            <UnitSummaryContinuousTable
              key={readout.id}
              draft={draft}
              experiment={experiment}
              readout={readout}
              cells={cells}
              onChange={onNestedScalarChange}
              onToggleNotPlanned={onToggleNotPlanned}
            />
          ) : (
            <NestedContinuousTable
              key={readout.id}
              draft={draft}
              experiment={experiment}
              readout={readout}
              cells={cells}
              onSelect={onNestedSelect}
              onToggleNotPlanned={onToggleNotPlanned}
            />
          ),
        )}
    </section>
  );
}

export function ExperimentWorkspace({
  initialDraft,
  initialCells,
  initialGraphs = [],
  initialDataViewMode = "compact",
  initialProject,
  onBack,
  analysisRunner = defaultAnalysisRunner,
  analysisAvailable = true,
  saveProject,
  onReuseDesign,
  onSaveFavorite,
  favoriteGraphDefaults = [],
  onDirtyChange,
  onOpenProject,
  onRequestExit,
  onRegisterSaveHandler,
  rootRef,
}: ExperimentWorkspaceProps) {
  const locale = useAppLocale();
  const t = (ja: string, en: string) => localizedText(locale, ja, en);
  const [draft, setDraft] = useState<ExperimentSetDraft>(initialDraft);
  const sharedSource = sharedSourceConditionTopology(draft);
  const [cells, setCells] = useState<ExperimentCellMap>(() => ({
    ...createCellsForDraft(initialDraft),
    ...initialCells,
  }));
  const dataEntryRecordedRef = useRef(
    Object.values({ ...createCellsForDraft(initialDraft), ...initialCells }).some(
      cellHasEnteredValue,
    ) ||
      (initialDraft.adaptiveInput?.canonicalObservations.some(
        canonicalObservationHasEnteredValue,
      ) ??
        false),
  );
  const [activeTab, setActiveTab] = useState<WorkspaceTab>("overview");
  const [selectedCellKey, setSelectedCellKey] = useState<string | null>(null);
  const [sourceNotes, setSourceNotes] = useState<Record<string, string>>({});
  const [showGraph, setShowGraph] = useState(false);
  const [analysisCorrectionFocus, setAnalysisCorrectionFocus] = useState<Readonly<{
    experimentId: string;
    target: DraftAnalysisCorrection["target"];
  }> | null>(null);
  const [dataViewMode, setDataViewMode] = useState<WorkspaceDataViewMode>(initialDataViewMode);
  const canonicalSpreadsheetPresentation = useMemo(() => {
    const snapshot = draft.adaptiveInput;
    if (!snapshot) return { enabled: false, readOnly: false } as const;
    const hasSourceLineage = Boolean(
      snapshot.mapping ||
      snapshot.rawLineage ||
      snapshot.canonicalObservations.some(({ sourceRow }) => sourceRow !== null),
    );
    const compactEditable = canEditCanonicalMatrix(
      snapshot.contract,
      snapshot.canonicalObservations,
    );
    return {
      // Imported and graph-only-promoted data remain linked to an immutable raw
      // lineage record, while the canonical working table stays editable. A
      // later edit is recorded as a transformation; it never rewrites rawText
      // or silently changes the source mapping.
      enabled: hasSourceLineage || compactEditable,
      readOnly: false,
    } as const;
  }, [draft.adaptiveInput]);
  const adaptiveObservationCounterRef = useRef(0);
  const nextAdaptiveObservationId = useCallback(
    ({ existingObservationIds }: CompactScalarObservationIdFactoryContext) => {
      const existing = new Set(existingObservationIds);
      let candidate = "";
      do {
        adaptiveObservationCounterRef.current += 1;
        candidate = `adaptive.${draft.adaptiveInput?.contract.contractId ?? "contract"}.direct.${adaptiveObservationCounterRef.current}`;
      } while (existing.has(candidate));
      return candidate;
    },
    [draft.adaptiveInput?.contract.contractId],
  );
  const nextAdaptiveExperimentalUnitIdentity = useCallback(
    ({ targetCoordinates, ordinal }: CompactScalarObservationIdFactoryContext) => {
      const contract = draft.adaptiveInput?.contract;
      const conditionCoordinates = contract
        ? contract.factors
            .map((factor) => targetCoordinates.factors[factor.key])
            .filter((value): value is string => Boolean(value?.trim()))
            .join(" · ")
        : "";
      return `${conditionCoordinates || "Observed"} ${ordinal}`;
    },
    [draft.adaptiveInput?.contract],
  );
  const replaceAdaptiveObservations = useCallback(
    (
      observations: readonly CanonicalAdaptiveObservation[],
      importedProvenance?: Pick<CanonicalWorksheetFileCommit, "mapping" | "rawLineage">,
    ) => {
      const snapshot = draft.adaptiveInput;
      if (!snapshot) throw new Error("ADAPTIVE_CONTRACT_MISSING");
      if (importedProvenance && snapshot.rawLineage) {
        const sameIngress = isSameCanonicalWorksheetIngress(
          { mapping: snapshot.mapping, rawLineage: snapshot.rawLineage },
          importedProvenance,
        );
        const unchangedObservations =
          stableCoordinate(snapshot.canonicalObservations) === stableCoordinate(observations);
        if (sameIngress && unchangedObservations) return;
        throw new Error(
          "この入力表にはすでにファイル由来のデータがあります。複数のファイルを同じ入力表へ統合する機能はまだ利用できません。既存の値と元ファイル情報は変更していません。",
        );
      }
      const sourceLineage = importedProvenance?.rawLineage ?? snapshot.rawLineage;
      const lineage =
        sourceLineage && !importedProvenance
          ? {
              ...sourceLineage,
              transformations: [
                ...new Set([
                  ...sourceLineage.transformations,
                  "canonical_observations_edited_after_import",
                ]),
              ],
            }
          : sourceLineage;
      const rebuilt = createAdaptiveWorkspace({
        contract: snapshot.contract,
        observations,
        mapping: importedProvenance?.mapping ?? snapshot.mapping,
        lineage,
        biologicalSetup: snapshot.biologicalSetup,
        confirmedTargetedConfirmations: snapshot.targetedConfirmations,
      });
      if (rebuilt.status !== "ready" || !rebuilt.draft) {
        throw new Error(
          rebuilt.diagnostics.join(" / ") || "入力した値を実験ワークスペースへ反映できません。",
        );
      }
      const previousSessions = draft.experiments;
      const previousSessionsByIdentity = new Map(
        previousSessions.map((experiment) => [experiment.label, experiment] as const),
      );
      const previousObservationsById = new Map(
        snapshot.canonicalObservations.map((observation) => [
          observation.observationId,
          observation,
        ]),
      );
      const matchingIdentityKey = snapshot.contract.matching.identityKey;
      const priorIdentityByNextIdentity = new Map<string, string>();
      if (snapshot.contract.matching.kind === "matched" && matchingIdentityKey) {
        observations.forEach((observation) => {
          const previous = previousObservationsById.get(observation.observationId);
          const nextIdentity = observation.identities[matchingIdentityKey]?.trim();
          const previousIdentity = previous?.identities[matchingIdentityKey]?.trim();
          if (nextIdentity && previousIdentity) {
            priorIdentityByNextIdentity.set(nextIdentity, previousIdentity);
          }
        });
      }
      const rebuiltExperiments = rebuilt.draft.experiments.map((experiment) => ({
        experiment,
        previous:
          snapshot.contract.matching.kind === "matched"
            ? previousSessionsByIdentity.get(
                priorIdentityByNextIdentity.get(experiment.label) ?? experiment.label,
              )
            : undefined,
      }));
      const reservedStableUnitIds = new Set(
        rebuiltExperiments.flatMap(({ experiment, previous }) =>
          previous ? [previous.stableUnitId ?? experiment.stableUnitId] : [],
        ),
      );
      let nextStableUnitOrdinal = 1;
      const nextAvailableStableUnitId = (preferred?: string) => {
        if (preferred && !reservedStableUnitIds.has(preferred)) {
          reservedStableUnitIds.add(preferred);
          return preferred;
        }
        let candidate = `adaptive-unit.${nextStableUnitOrdinal}`;
        while (reservedStableUnitIds.has(candidate)) {
          nextStableUnitOrdinal += 1;
          candidate = `adaptive-unit.${nextStableUnitOrdinal}`;
        }
        reservedStableUnitIds.add(candidate);
        nextStableUnitOrdinal += 1;
        return candidate;
      };
      setDraft({
        ...rebuilt.draft,
        experiments: rebuiltExperiments.map(({ experiment, previous }) => {
          return previous
            ? {
                ...experiment,
                // Researcher-facing matching identities live in canonical observations
                // and labels. The internal stable ID remains opaque and unchanged when
                // the researcher corrects that label.
                label: experiment.label,
                stableUnitId: previous.stableUnitId ?? experiment.stableUnitId,
                sessionId: previous.sessionId,
                date: previous.date,
                note: previous.note,
              }
            : {
                ...experiment,
                stableUnitId: nextAvailableStableUnitId(experiment.stableUnitId),
              };
        }),
        entrySourceHistory: draft.entrySourceHistory,
      });
      setCells(rebuilt.cells);
      setActiveTab("overview");
    },
    [draft.adaptiveInput, draft.entrySourceHistory, draft.experiments],
  );
  const replaceAdaptiveFileImport = useCallback(
    ({ observations, mapping, rawLineage }: CanonicalWorksheetFileCommit) => {
      replaceAdaptiveObservations(observations, { mapping, rawLineage });
    },
    [replaceAdaptiveObservations],
  );
  const [graphWorkspaceMode, setGraphWorkspaceMode] = useState<"graph" | "statistics">("graph");

  useEffect(() => {
    setSelectedCellKey(null);
  }, [activeTab]);
  const [showGraphTypeChoice, setShowGraphTypeChoice] = useState(false);
  const [selectedSourceReadoutId, setSelectedSourceReadoutId] = useState(
    initialDraft.readouts[0]?.id ?? "",
  );
  const [selectedCreateSourceMode, setSelectedCreateSourceMode] = useState<
    "raw_readout" | "derived_metric"
  >("raw_readout");
  const [selectedCreateMetric, setSelectedCreateMetric] = useState<TimeAnalysisPlan>({
    kind: "auc",
  });
  const [selectedGraphType, setSelectedGraphType] = useState<CreatableGraphType>("dot");
  const [graphTypeSelectionActive, setGraphTypeSelectionActive] = useState(true);
  const [lastClickedGraphType, setLastClickedGraphType] = useState<CreatableGraphType | null>(null);
  const [selectedInitialLayers, setSelectedInitialLayers] = useState<WorkspaceGraphState["layers"]>(
    () => defaultLayersForGraphType("dot", initialDraft.readouts[0]?.shape ?? "proportion"),
  );
  const [showLayerBuilder, setShowLayerBuilder] = useState(false);
  const [graphCreateMessage, setGraphCreateMessage] = useState<string | null>(null);
  const [graphs, setGraphs] = useState<WorkspaceGraphState[]>(() => [...initialGraphs]);
  const [activeGraphId, setActiveGraphId] = useState<string | null>(null);
  const [renamingGraphId, setRenamingGraphId] = useState<string | null>(null);
  const [graphRenameDraft, setGraphRenameDraft] = useState("");
  const [savedProject, setSavedProject] = useState<OpenedProject | undefined>(initialProject);
  const [structureRevisionSession, setStructureRevisionSession] =
    useState<AdaptiveStructureRevisionSession | null>(null);
  const [structureRevisionError, setStructureRevisionError] = useState<string | null>(null);
  const structureRevisionTriggerRef = useRef<HTMLButtonElement | null>(null);
  const structureRevisionReturnTargetRef = useRef<"navigation" | "overview">("navigation");
  const restoreStructureRevisionFocusRef = useRef(false);
  const [saveStatus, setSaveStatus] = useState<"idle" | "saving" | "saved" | "error">("idle");
  const [saveMessage, setSaveMessage] = useState<string | null>(null);
  const [analysisInvalidationMessage, setAnalysisInvalidationMessage] = useState<string | null>(
    null,
  );
  const scientificSourceSnapshot = JSON.stringify({ draft, cells });
  const previousScientificSourceRef = useRef(scientificSourceSnapshot);
  const currentSnapshot = JSON.stringify({ draft, cells, graphs, dataViewMode });
  const savedSnapshotRef = useRef(initialProject ? currentSnapshot : "");
  const graphWorkspaceRef = useRef<HTMLDivElement | null>(null);
  const graphChoiceDialogRef = useRef<HTMLElement | null>(null);
  const graphChoiceReturnFocusRef = useRef<HTMLElement | null>(null);
  const focusCreatedGraphRef = useRef(false);
  const isDirty = currentSnapshot !== savedSnapshotRef.current;

  useEffect(() => {
    if (structureRevisionSession || !restoreStructureRevisionFocusRef.current) return;
    restoreStructureRevisionFocusRef.current = false;
    const returnTarget = document.getElementById(
      structureRevisionReturnTargetRef.current === "overview"
        ? "experiment-workspace-revise-overview"
        : "experiment-workspace-revise-navigation",
    );
    returnTarget?.focus();
  }, [structureRevisionSession]);

  useEffect(() => {
    onDirtyChange?.(isDirty);
    return () => onDirtyChange?.(false);
  }, [isDirty, onDirtyChange]);

  useEffect(() => {
    if (dataEntryRecordedRef.current) return;
    const hasEnteredData =
      Object.values(cells).some(cellHasEnteredValue) ||
      (draft.adaptiveInput?.canonicalObservations.some(canonicalObservationHasEnteredValue) ??
        false);
    if (!hasEnteredData) return;
    dataEntryRecordedRef.current = true;
    recordUsageMilestone(routeFromPath(window.location.pathname), "data_entry_started");
  }, [cells, draft.adaptiveInput]);

  useEffect(() => {
    if (!isDirty) return;
    const warnBeforeUnload = (event: BeforeUnloadEvent) => {
      event.preventDefault();
      event.returnValue = "";
    };
    window.addEventListener("beforeunload", warnBeforeUnload);
    return () => window.removeEventListener("beforeunload", warnBeforeUnload);
  }, [isDirty]);

  const requestExit = useCallback(
    (actionLabel: string, proceed: () => void) => {
      if (!isDirty) {
        proceed();
        return;
      }
      if (onRequestExit) {
        onRequestExit({ actionLabel, proceed });
        return;
      }
      if (
        window.confirm(
          localizedText(
            locale,
            "未保存の変更があります。この実験を閉じて破棄しますか？",
            "This experiment has unsaved changes. Close it and discard them?",
          ),
        )
      )
        proceed();
    },
    [isDirty, locale, onRequestExit],
  );

  const requestBack = () => requestExit(localizedText(locale, "前の画面に戻る", "go back"), onBack);

  useEffect(() => {
    if (!showGraphTypeChoice) {
      graphChoiceReturnFocusRef.current?.focus();
      graphChoiceReturnFocusRef.current = null;
      return;
    }
    const previousBodyOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    const dialog = graphChoiceDialogRef.current;
    const focusable = () => [
      ...(dialog?.querySelectorAll<HTMLElement>(
        "button:not([disabled]), input:not([disabled]), select:not([disabled])",
      ) ?? []),
    ];
    focusable()[0]?.focus();
    const handleKeyDown = (event: globalThis.KeyboardEvent) => {
      if (event.key === "Escape") {
        event.preventDefault();
        setShowGraphTypeChoice(false);
        return;
      }
      if (event.key !== "Tab") return;
      const items = focusable();
      if (items.length === 0) return;
      const first = items[0];
      const last = items.at(-1)!;
      if (event.shiftKey && document.activeElement === first) {
        event.preventDefault();
        last.focus();
      } else if (!event.shiftKey && document.activeElement === last) {
        event.preventDefault();
        first.focus();
      }
    };
    document.addEventListener("keydown", handleKeyDown);
    return () => {
      document.removeEventListener("keydown", handleKeyDown);
      document.body.style.overflow = previousBodyOverflow;
    };
  }, [showGraphTypeChoice]);

  useEffect(() => {
    if (previousScientificSourceRef.current === scientificSourceSnapshot) return;
    previousScientificSourceRef.current = scientificSourceSnapshot;
    const hadAnalysis = graphs.some((graph) => Boolean(graph.analysis));
    if (hadAnalysis) {
      setAnalysisInvalidationMessage(
        "データまたは実験単位の構造が変わったため、以前の解析結果・p値注釈・Methodsを外しました。グラフの見た目は保持しています。",
      );
      setGraphs((current) =>
        current.map((graph) =>
          graph.analysis
            ? {
                ...graph,
                analysisRunId: null,
                analysis: null,
                statisticsAnnotation: { mode: "hidden", testIndex: 0 },
              }
            : graph,
        ),
      );
    }
  }, [graphs, scientificSourceSnapshot]);

  useEffect(() => {
    if (!analysisInvalidationMessage) return;
    const timer = window.setTimeout(() => setAnalysisInvalidationMessage(null), 6000);
    return () => window.clearTimeout(timer);
  }, [analysisInvalidationMessage]);

  useEffect(() => {
    if (!analysisCorrectionFocus || showGraph) return;
    const timer = window.setTimeout(() => {
      const selector =
        analysisCorrectionFocus.target === "data_identity"
          ? `[data-analysis-unit-identity="${analysisCorrectionFocus.experimentId}"]`
          : `[data-analysis-experiment="${analysisCorrectionFocus.experimentId}"] input[type="number"], [data-analysis-experiment="${analysisCorrectionFocus.experimentId}"] textarea`;
      const target = document.querySelector<HTMLElement>(selector);
      target?.focus();
      setAnalysisCorrectionFocus(null);
    }, 0);
    return () => window.clearTimeout(timer);
  }, [activeTab, analysisCorrectionFocus, showGraph]);

  const selectedDescriptor = useMemo(
    () => (selectedCellKey ? findCellDescriptor(draft, selectedCellKey) : null),
    [draft, selectedCellKey],
  );
  const selectedCell = selectedCellKey ? cells[selectedCellKey] : undefined;
  const selectedNestedCell: NestedContinuousCellDraft | null =
    selectedCell?.kind === "nested_continuous" ? selectedCell : null;

  const updateExperiment = (experimentId: string, patch: Partial<ExperimentSessionDraft>) => {
    setDraft((previous) => ({
      ...previous,
      experiments: previous.experiments.map((experiment) =>
        experiment.id === experimentId ? { ...experiment, ...patch } : experiment,
      ),
    }));
  };

  const updateProportion = (key: string, field: "positive" | "eligible", value: number | null) => {
    setCells((previous) => {
      const current = previous[key];
      const next: ProportionCellDraft =
        current?.kind === "proportion"
          ? { ...current, [field]: value }
          : {
              kind: "proportion",
              positive: field === "positive" ? value : null,
              eligible: field === "eligible" ? value : null,
            };
      return { ...previous, [key]: next };
    });
  };

  const applyProportionPaste = ({
    experimentId,
    readoutId,
    startRow,
    startColumn,
    text,
  }: ProportionPasteRequest): string => {
    const rows = rowsFor(draft, experimentId);
    const updates: ProportionPasteUpdate[] = [];
    let blankCount = 0;
    let invalidCount = 0;
    let ignoredCount = 0;

    proportionPasteRows(text).forEach((tokens, rowOffset) => {
      const targetRow = rows[startRow + rowOffset];
      if (!targetRow) {
        ignoredCount += tokens.slice(0, 2).filter((token) => token.trim() !== "").length;
        ignoredCount += tokens.slice(2).filter((token) => token.trim() !== "").length;
        return;
      }

      const rowUpdates: ProportionPasteUpdate[] = [];
      tokens.forEach((token, columnOffset) => {
        const columnIndex = startColumn + columnOffset;
        if (columnIndex > 1) {
          if (token.trim() !== "") ignoredCount += 1;
          return;
        }
        if (token.trim() === "") {
          blankCount += 1;
          return;
        }
        const value = countValue(token);
        if (value === null) {
          invalidCount += 1;
          return;
        }
        rowUpdates.push({
          key: experimentCellKey({
            experimentId,
            conditionId: targetRow.conditionId,
            readoutId,
            timePointId: targetRow.timePoint?.id,
          }),
          field: columnIndex === 0 ? "positive" : "eligible",
          value,
        });
      });

      if (rowUpdates.length > 0) {
        const current = cells[rowUpdates[0].key];
        const currentCell: ProportionCellDraft =
          current?.kind === "proportion"
            ? current
            : { kind: "proportion", positive: null, eligible: null };
        const nextValues = rowUpdates.reduce(
          (values, update) => ({ ...values, [update.field]: update.value }),
          {
            positive: currentCell.positive,
            eligible: currentCell.eligible,
          } as Pick<ProportionCellDraft, "positive" | "eligible">,
        );
        if (
          nextValues.positive !== null &&
          nextValues.eligible !== null &&
          nextValues.positive > nextValues.eligible
        ) {
          invalidCount += 1;
        } else {
          updates.push(...rowUpdates);
        }
      }
    });

    if (updates.length > 0) {
      setCells((previous) => {
        const next = { ...previous };
        updates.forEach(({ key, field, value }) => {
          const current = next[key];
          const proportionCell: ProportionCellDraft =
            current?.kind === "proportion"
              ? current
              : { kind: "proportion", positive: null, eligible: null };
          next[key] = { ...proportionCell, [field]: value };
        });
        return next;
      });
    }

    if (updates.length === 0) {
      return invalidCount > 0
        ? "貼り付け範囲に有効な整数がありません。既存の値は変更していません。"
        : "貼り付けられる値がありません。既存の値は変更していません。";
    }

    const details = [`${updates.length}セルを更新`];
    if (blankCount > 0) details.push("空欄は保持");
    if (invalidCount > 0) details.push(`不正値${invalidCount}件は保持`);
    if (ignoredCount > 0) details.push(`範囲外${ignoredCount}件を無視`);
    return `貼り付け完了：${details.join("、")}。`;
  };

  const updateNestedValues = (rawText: string) => {
    if (!selectedCellKey) return;
    const rawValues = parseNumericPaste(rawText);
    setCells((previous) => ({
      ...previous,
      [selectedCellKey]: { kind: "nested_continuous", rawValues, source: "paste" },
    }));
  };

  const updateNestedScalar = (key: string, value: number | null) => {
    setCells((previous) => ({
      ...previous,
      [key]: {
        kind: "nested_continuous",
        rawValues: value === null ? [] : [value],
        source: "manual",
      },
    }));
  };

  const applyOverviewScalarPaste = ({
    readoutId,
    startExperiment,
    startCondition,
    text,
  }: OverviewScalarPasteRequest): OverviewScalarPasteResult => {
    const rows = proportionPasteRows(text);
    if (rows.length === 0) {
      return {
        accepted: false,
        message: "貼り付けられる値がありません。既存の値は変更していません。",
      };
    }

    const updates: Array<{ key: string; value: number | null }> = [];
    for (const [rowOffset, tokens] of rows.entries()) {
      const experiment = draft.experiments[startExperiment + rowOffset];
      if (!experiment) {
        return {
          accepted: false,
          message: "貼り付け範囲が実験回の数を超えています。既存の値は変更していません。",
        };
      }
      for (const [columnOffset, token] of tokens.entries()) {
        const condition = draft.conditions[startCondition + columnOffset];
        if (!condition) {
          return {
            accepted: false,
            message: "貼り付け範囲が条件の数を超えています。既存の値は変更していません。",
          };
        }
        const trimmed = token.trim();
        const parsed = parseOptionalSpreadsheetNumber(trimmed);
        if (parsed.kind === "invalid") {
          return {
            accepted: false,
            message: `数値として読めない値「${trimmed}」があります。既存の値は変更していません。`,
          };
        }
        const value = parsed.kind === "value" ? parsed.value : null;
        const key = experimentCellKey({
          experimentId: experiment.id,
          conditionId: condition.id,
          readoutId,
        });
        if (cellIsNotPlanned(cells[key]) && value !== null) {
          return {
            accepted: false,
            message: `${experiment.label}・${condition.label}は測定予定なしです。既存の値は変更していません。`,
          };
        }
        updates.push({ key, value });
      }
    }

    setCells((previous) => {
      const next = { ...previous };
      updates.forEach(({ key, value }) => {
        if (cellIsNotPlanned(next[key]) && value === null) return;
        next[key] = {
          kind: "nested_continuous",
          rawValues: value === null ? [] : [value],
          source: "paste",
        };
      });
      return next;
    });
    return {
      accepted: true,
      message: `貼り付け完了：${updates.length}セルを更新しました。空欄はmissingとして保持しています。`,
    };
  };

  const applyOverviewProportionPaste = ({
    readoutId,
    startExperiment,
    startColumn,
    text,
  }: OverviewProportionPasteRequest): OverviewScalarPasteResult => {
    const rows = proportionPasteRows(text);
    if (rows.length === 0) {
      return {
        accepted: false,
        message: "貼り付けられる値がありません。既存の値は変更していません。",
      };
    }

    type Update = Readonly<{
      key: string;
      field: "positive" | "eligible";
      value: number | null;
    }>;
    const updates: Update[] = [];
    const proposed = new Map<string, Pick<ProportionCellDraft, "positive" | "eligible">>();
    const editableColumnCount = draft.conditions.length * 2;

    for (const [rowOffset, tokens] of rows.entries()) {
      const experiment = draft.experiments[startExperiment + rowOffset];
      if (!experiment) {
        return {
          accepted: false,
          message: "貼り付け範囲が実験回の数を超えています。既存の値は変更していません。",
        };
      }
      for (const [columnOffset, token] of tokens.entries()) {
        const editableColumn = startColumn + columnOffset;
        if (editableColumn >= editableColumnCount) {
          return {
            accepted: false,
            message: "貼り付け範囲が条件の入力列を超えています。既存の値は変更していません。",
          };
        }
        const condition = draft.conditions[Math.floor(editableColumn / 2)];
        const field = editableColumn % 2 === 0 ? "positive" : "eligible";
        const trimmed = token.trim();
        const value = trimmed === "" ? null : countValue(trimmed);
        if (trimmed !== "" && value === null) {
          return {
            accepted: false,
            message: `0以上の整数として読めない値「${trimmed}」があります。既存の値は変更していません。`,
          };
        }
        const key = experimentCellKey({
          experimentId: experiment.id,
          conditionId: condition.id,
          readoutId,
        });
        const current = cells[key];
        if (cellIsNotPlanned(current)) {
          if (value !== null) {
            return {
              accepted: false,
              message: `${experiment.label}・${condition.label}は測定予定なしです。既存の値は変更していません。`,
            };
          }
          continue;
        }
        const currentCell: ProportionCellDraft =
          current?.kind === "proportion"
            ? current
            : { kind: "proportion", positive: null, eligible: null };
        const next = proposed.get(key) ?? {
          positive: currentCell.positive,
          eligible: currentCell.eligible,
        };
        proposed.set(key, { ...next, [field]: value });
        updates.push({ key, field, value });
      }
    }

    for (const [key, next] of proposed) {
      if (next.positive !== null && next.eligible !== null && next.positive > next.eligible) {
        const descriptor = findCellDescriptor(draft, key);
        const sourceLabel = descriptor
          ? `${descriptor.experiment.label}・${descriptor.conditionLabel}`
          : "貼り付け先";
        return {
          accepted: false,
          message: `${sourceLabel}で陽性数が対象数を超えています。既存の値は変更していません。`,
        };
      }
    }

    setCells((previous) => {
      const next = { ...previous };
      updates.forEach(({ key, field, value }) => {
        const current = next[key];
        const proportionCell: ProportionCellDraft =
          current?.kind === "proportion"
            ? current
            : { kind: "proportion", positive: null, eligible: null };
        next[key] = { ...proportionCell, [field]: value };
      });
      return next;
    });
    return {
      accepted: true,
      message: `貼り付け完了：${updates.length}セルを更新しました。空欄はmissingとして保持しています。`,
    };
  };

  const updateCategoricalCount = (key: string, categoryId: string, value: number | null) => {
    setCells((previous) => {
      const current = previous[key];
      const counts = current?.kind === "categorical_counts" ? current.counts : {};
      return {
        ...previous,
        [key]: { kind: "categorical_counts", counts: { ...counts, [categoryId]: value } },
      };
    });
  };

  const updateWbRatio = (key: string, field: WbEditableField, value: number | null) => {
    setCells((previous) => {
      const current = previous[key];
      const descriptor = findCellDescriptor(draft, key);
      const wbCell: WbRatioCellDraft =
        current?.kind === "wb_ratio"
          ? current
          : {
              kind: "wb_ratio",
              target: null,
              reference: null,
              inputMode: descriptor?.readout.wbInputMode ?? "corrected_value",
            };
      if (field === "target" || field === "reference") {
        return { ...previous, [key]: { ...wbCell, inputMode: "corrected_value", [field]: value } };
      }
      const band = field.startsWith("target") ? "targetSource" : "referenceSource";
      const sourceField = field.endsWith("Intensity")
        ? "intensity"
        : field.endsWith("Background")
          ? "background"
          : "area";
      const source = wbCell[band] ?? { intensity: null, background: null, area: null };
      return {
        ...previous,
        [key]: {
          ...wbCell,
          inputMode: "imagej_mean_background_area",
          [band]: { ...source, [sourceField]: value },
        },
      };
    });
  };

  const toggleNotPlanned = (key: string) => {
    const current = cells[key];
    const nextNotPlanned = !cellIsNotPlanned(current);
    if (
      nextNotPlanned &&
      cellIsComplete(current) &&
      !window.confirm("入力済みの値を消去して、このセルを「測定予定なし」にしますか？")
    ) {
      return;
    }
    const descriptor = findCellDescriptor(draft, key);
    setCells((previous) => ({
      ...previous,
      [key]:
        descriptor?.readout.shape === "nested_continuous"
          ? {
              kind: "nested_continuous",
              rawValues: [],
              source: "manual",
              ...(nextNotPlanned ? { availability: "not_planned" as const } : {}),
            }
          : descriptor?.readout.shape === "wb_ratio"
            ? {
                kind: "wb_ratio",
                target: null,
                reference: null,
                inputMode: descriptor.readout.wbInputMode ?? "corrected_value",
                ...(nextNotPlanned ? { availability: "not_planned" as const } : {}),
              }
            : descriptor?.readout.shape === "categorical_counts"
              ? {
                  kind: "categorical_counts",
                  counts: Object.fromEntries(
                    (descriptor.readout.categories ?? []).map(({ id }) => [id, null]),
                  ),
                  ...(nextNotPlanned ? { availability: "not_planned" as const } : {}),
                }
              : {
                  kind: "proportion",
                  positive: null,
                  eligible: null,
                  ...(nextNotPlanned ? { availability: "not_planned" as const } : {}),
                },
    }));
    if (nextNotPlanned) {
      setSourceNotes((previous) =>
        Object.fromEntries(Object.entries(previous).filter(([cellKey]) => cellKey !== key)),
      );
      if (selectedCellKey === key) setSelectedCellKey(null);
    }
  };

  const addExperiment = () => {
    const keepOverviewVisible = activeTab === "overview";
    const nextIndex = nextExperimentSessionIndex(draft.experiments);
    const created = createExperimentSession(nextIndex);
    const nextExperiment =
      draft.conditionAssignment.kind === "matched"
        ? {
            ...created,
            label: `${matchedSetLabel(draft)} ${draft.experiments.length + 1}`,
            stableUnitId: `unit.${nextIndex}`,
          }
        : independentAdaptiveInputRows(draft)
          ? {
              ...created,
              label: `入力行 ${draft.experiments.length + 1}`,
            }
          : created;
    setDraft((previous) => ({
      ...previous,
      experiments: [...previous.experiments, nextExperiment],
    }));
    setCells((previous) => ({
      ...previous,
      ...createCellsForDraft({ ...draft, experiments: [nextExperiment] }),
    }));
    if (!keepOverviewVisible) setActiveTab(`experiment:${nextExperiment.id}`);
  };

  const removeExperiment = (experimentId: string) => {
    if (draft.experiments.length <= 1) return;
    const experiment = draft.experiments.find(({ id }) => id === experimentId);
    if (!experiment) return;
    const keyPrefix = `${experimentId}::`;
    const hasEnteredData = Object.entries(cells).some(
      ([key, cell]) => key.startsWith(keyPrefix) && cellIsComplete(cell),
    );
    if (
      hasEnteredData &&
      !window.confirm(
        `${experiment.label}に入力済みの測定値があります。この${draft.conditionAssignment.kind === "matched" ? matchedSetLabel(draft) : "実験回"}と入力値を削除しますか？`,
      )
    ) {
      return;
    }
    const remaining = draft.experiments.filter(({ id }) => id !== experimentId);
    setDraft((previous) => ({
      ...previous,
      experiments: previous.experiments.filter(({ id }) => id !== experimentId),
    }));
    setCells((previous) =>
      Object.fromEntries(Object.entries(previous).filter(([key]) => !key.startsWith(keyPrefix))),
    );
    setSourceNotes((previous) =>
      Object.fromEntries(Object.entries(previous).filter(([key]) => !key.startsWith(keyPrefix))),
    );
    if (selectedCellKey?.startsWith(keyPrefix)) setSelectedCellKey(null);
    setActiveTab(`experiment:${remaining[0].id}`);
  };

  const selectedSourceReadout =
    draft.readouts.find(({ id }) => id === selectedSourceReadoutId) ?? draft.readouts[0];
  const graphRecommendationsFor = (readoutId: string): readonly CreatableGraphType[] => {
    const readout = draft.readouts.find(({ id }) => id === readoutId) ?? draft.readouts[0];
    const nestedObservationCount = Object.entries(cells).reduce(
      (total, [key, cell]) =>
        total +
        (key.endsWith(`::${readout?.id ?? ""}`) && cell?.kind === "nested_continuous"
          ? cell.rawValues.length
          : 0),
      0,
    );
    return readout?.shape === "categorical_counts"
      ? ["stacked_100", "category_percentage"]
      : draft.analysisIntent.kind === "correlation"
        ? ["scatter"]
        : draft.time.points.length > 1
          ? readout?.shape === "nested_continuous" && nestedObservationCount >= 20
            ? ["line", "violin"]
            : ["line"]
          : draft.conditionAssignment.kind === "matched"
            ? ["paired_dot"]
            : readout?.shape === "nested_continuous" && nestedObservationCount >= 20
              ? ["violin", "dot"]
              : ["dot"];
  };
  const recommendedGraphTypes: readonly CreatableGraphType[] =
    selectedCreateSourceMode === "derived_metric"
      ? [draft.conditionAssignment.kind === "matched" ? "paired_dot" : "dot"]
      : graphRecommendationsFor(selectedSourceReadout?.id ?? "");
  const recommendedGraphType = recommendedGraphTypes[0] ?? "dot";
  const canConnectUnits =
    draft.time.sampling === "longitudinal" || draft.conditionAssignment.kind === "matched";
  const createMetricWindowIsValid =
    selectedCreateMetric.windowStart === undefined ||
    selectedCreateMetric.windowEnd === undefined ||
    selectedCreateMetric.windowStart <= selectedCreateMetric.windowEnd;

  const selectGraphType = (graphType: CreatableGraphType) => {
    if (
      graphTypeSelectionActive &&
      selectedGraphType === graphType &&
      lastClickedGraphType === graphType
    ) {
      setGraphTypeSelectionActive(false);
      setLastClickedGraphType(null);
      return;
    }
    setSelectedGraphType(graphType);
    setGraphTypeSelectionActive(true);
    setLastClickedGraphType(graphType);
    setSelectedInitialLayers(
      favoriteGraphDefaults.find((candidate) => candidate.graphType === graphType)?.layers ??
        defaultLayersForGraphType(graphType, selectedSourceReadout?.shape ?? "proportion"),
    );
  };

  const selectGraphSource = (readoutId: string) => {
    const readout = draft.readouts.find(({ id }) => id === readoutId) ?? draft.readouts[0];
    const graphType = graphRecommendationsFor(readout?.id ?? "")[0] ?? "dot";
    setSelectedSourceReadoutId(readout?.id ?? "");
    setSelectedGraphType(graphType);
    setGraphTypeSelectionActive(true);
    setLastClickedGraphType(null);
    setSelectedInitialLayers(
      favoriteGraphDefaults.find((candidate) => candidate.graphType === graphType)?.layers ??
        defaultLayersForGraphType(graphType, readout?.shape ?? "proportion"),
    );
  };

  const selectCreateSourceMode = (mode: "raw_readout" | "derived_metric") => {
    const graphType =
      mode === "derived_metric"
        ? draft.conditionAssignment.kind === "matched"
          ? "paired_dot"
          : "dot"
        : (graphRecommendationsFor(selectedSourceReadout?.id ?? "")[0] ?? "dot");
    setSelectedCreateSourceMode(mode);
    setSelectedGraphType(graphType);
    setGraphTypeSelectionActive(true);
    setLastClickedGraphType(null);
    setSelectedInitialLayers(
      favoriteGraphDefaults.find((candidate) => candidate.graphType === graphType)?.layers ??
        defaultLayersForGraphType(graphType, selectedSourceReadout?.shape ?? "proportion"),
    );
  };

  const createGraph = (
    graphType: WorkspaceGraphState["graphType"],
    initialLayers = defaultLayersForGraphType(
      graphType,
      selectedSourceReadout?.shape ?? "proportion",
    ),
  ) => {
    const nextIndex = graphs.length + 1;
    const initialGrouping = createInitialGraphGrouping(draft);
    const hasMultipleVisualSeries =
      initialGrouping.series.source !== "none" ||
      (graphType === "line" && draft.time.points.length > 1 && draft.conditions.length > 1);
    const favoriteDefault = favoriteGraphDefaults.find(
      (candidate) => candidate.graphType === graphType,
    );
    const graph: WorkspaceGraphState = {
      id: `graph.${nextIndex}`,
      displayName: t(`グラフ ${nextIndex}`, `Graph ${nextIndex}`),
      analysisRunId: null,
      selectedReadoutId: selectedSourceReadout?.id ?? "readout.1",
      sourceMode: selectedCreateSourceMode,
      selectedConditionIds: draft.conditions.map(({ id }) => id),
      selectedTimePointIds: draft.time.points.map(({ id }) => id),
      analysisTimePointId: null,
      analysisMetric:
        selectedCreateSourceMode === "derived_metric"
          ? selectedCreateMetric
          : { kind: "selected_timepoint" },
      graphType,
      grouping: initialGrouping,
      layers: initialLayers,
      appearance: favoriteDefault?.appearance ?? {
        errorBar: "sd",
        palette: hasMultipleVisualSeries
          ? graphType === "line"
            ? "colorblind"
            : "condition"
          : "single",
        pointSize: 6,
        pointOpacity: 0.9,
        axisLineWidth: 1.4,
        hierarchicalLabels: true,
        jitter: 12,
        fontFamily: "arial",
        graphTitleFontSize: 20,
        axisTitleFontSize: 19,
        tickFontSize: 17,
        hierarchyFontSize: 17,
        legendFontSize: 16,
        legendPosition: hasMultipleVisualSeries ? "right" : "hidden",
        seriesColors: {},
        seriesStyles: {},
        distributionFill: "white",
        distributionFillColor: "#ffffff",
        distributionOutlineColor: "#111111",
        barWidth: 0.72,
        withinGroupSpacing: 0.72,
        betweenGroupSpacing: 1.35,
        rawPointColor: "#8a96a3",
        summaryColor: "#111111",
        errorBarColor: "#111111",
        connectingLineColor: "#4b5563",
        summaryLineWidth: 2,
        errorBarLineWidth: 1.5,
        connectingLineWidth: 1.5,
        distributionLineWidth: 1.2,
        canvasPreset: "standard",
        sidePadding: 72,
      },
      axes: favoriteDefault
        ? {
            ...favoriteDefault.axes,
            hierarchyOrder: draft.attributes.map(({ id }) => id),
            yTitle:
              draft.analysisIntent.kind === "correlation"
                ? (draft.conditions[1]?.label ?? "Y")
                : defaultGraphYTitle(selectedSourceReadout),
          }
        : {
            xSemantic:
              draft.time.points.length > 0 ? orderedAxisSemantic(draft.time) : "categorical",
            xTitle: draft.time.points.length > 0 ? orderedAxisTitle(draft.time) : "",
            xUnit: draft.time.points.length > 0 ? orderedAxisUnit(draft.time) : "",
            yTitle:
              draft.analysisIntent.kind === "correlation"
                ? (draft.conditions[1]?.label ?? "Y")
                : defaultGraphYTitle(selectedSourceReadout),
            yRangeMode: "auto",
            yMin: null,
            yMax: null,
            yScale: "linear",
            showCategoryLabels: true,
            hierarchyOrder: draft.attributes.map(({ id }) => id),
            spacing: 1,
            yTickMode: "auto",
            yTickInterval: null,
          },
      statisticsAnnotation: { mode: "hidden", testIndex: 0 },
    };
    recordBenchmarkEvent("graph_created_from_choice", {
      recommendedGraph: recommendedGraphType,
      selectedGraph: graphType,
      recommendationDiffers: recommendedGraphType !== graphType,
      readoutId: selectedSourceReadout?.id ?? "readout.1",
      sourceMode: selectedCreateSourceMode,
    });
    setGraphs((current) => [...current, graph]);
    const usageRoute = routeFromPath(window.location.pathname);
    recordUsageMilestone(usageRoute, "graph_created");
    recordUsageGraphConfiguration(usageRoute, {
      graphFamily: graphType,
      origin: favoriteDefault
        ? "saved_default"
        : graphType === recommendedGraphType
          ? "recommended"
          : "user_selected",
      uncertainty: initialLayers.errorBar ? graph.appearance.errorBar : "none",
      rawPointsVisible: initialLayers.raw,
      summaryVisible: initialLayers.overall,
    });
    setActiveGraphId(graph.id);
    setGraphCreateMessage(
      t(`${graph.displayName}を作成しました。`, `Created ${graph.displayName}.`),
    );
    focusCreatedGraphRef.current = true;
    setGraphWorkspaceMode("graph");
    setShowGraph(true);
    setShowGraphTypeChoice(false);
  };

  useEffect(() => {
    recordBenchmarkEvent("workspace_subroute_opened", {
      subroute: showGraph ? graphWorkspaceMode : "data",
      dataTab: activeTab,
    });
  }, [activeTab, graphWorkspaceMode, showGraph]);

  const openGraph = () => {
    graphChoiceReturnFocusRef.current =
      document.activeElement instanceof HTMLElement ? document.activeElement : null;
    setGraphCreateMessage(null);
    setSelectedGraphType(recommendedGraphType);
    setSelectedInitialLayers(
      favoriteGraphDefaults.find((candidate) => candidate.graphType === recommendedGraphType)
        ?.layers ??
        defaultLayersForGraphType(
          recommendedGraphType,
          selectedSourceReadout?.shape ?? "proportion",
        ),
    );
    setGraphTypeSelectionActive(true);
    setLastClickedGraphType(null);
    setShowLayerBuilder(false);
    setShowGraphTypeChoice(true);
  };

  useLayoutEffect(() => {
    if (!showGraph || !focusCreatedGraphRef.current) return;
    focusCreatedGraphRef.current = false;
    const revealGraph = () => {
      const graphNode = graphWorkspaceRef.current;
      if (!graphNode) return;
      graphNode.scrollIntoView?.({ behavior: "auto", block: "start" });
      let ancestor = graphNode.parentElement;
      while (ancestor) {
        const style = window.getComputedStyle(ancestor);
        const scrolls = /(auto|scroll)/.test(style.overflowY);
        if (scrolls && ancestor.scrollHeight > ancestor.clientHeight) {
          const graphRect = graphNode.getBoundingClientRect();
          const ancestorRect = ancestor.getBoundingClientRect();
          ancestor.scrollTop += graphRect.top - ancestorRect.top - 8;
        }
        ancestor = ancestor.parentElement;
      }
      const graphTop = graphNode.getBoundingClientRect().top;
      if (graphTop < 0 || graphTop > window.innerHeight * 0.35) {
        window.scrollTo({ top: window.scrollY + graphTop - 8, behavior: "auto" });
      }
      graphNode.focus({ preventScroll: true });
    };
    let secondFrame = 0;
    const firstFrame = window.requestAnimationFrame(() => {
      secondFrame = window.requestAnimationFrame(revealGraph);
    });
    const settledTimer = window.setTimeout(revealGraph, 120);
    return () => {
      window.cancelAnimationFrame(firstFrame);
      if (secondFrame) window.cancelAnimationFrame(secondFrame);
      window.clearTimeout(settledTimer);
    };
  }, [activeGraphId, showGraph]);

  useEffect(() => {
    if (!graphCreateMessage) return;
    const timer = window.setTimeout(() => setGraphCreateMessage(null), 2600);
    return () => window.clearTimeout(timer);
  }, [graphCreateMessage]);

  const openExistingGraphs = () => {
    if (graphs.length === 0) return;
    setActiveGraphId((current) => current ?? graphs[graphs.length - 1].id);
    setGraphWorkspaceMode("graph");
    setShowGraph(true);
  };

  const openStatistics = () => {
    if (graphs.length === 0) return;
    setActiveGraphId((current) => current ?? graphs[graphs.length - 1].id);
    setGraphWorkspaceMode("statistics");
    setShowGraph(true);
  };

  const beginGraphRename = (graph: WorkspaceGraphState) => {
    setActiveGraphId(graph.id);
    setRenamingGraphId(graph.id);
    setGraphRenameDraft(graph.displayName);
  };

  const commitGraphRename = (graphId: string) => {
    const label = graphRenameDraft.trim() || t("名称未設定", "Untitled");
    setGraphs((current) =>
      current.map((graph) =>
        graph.id === graphId
          ? { ...graph, displayName: label || t("名称未設定", "Untitled") }
          : graph,
      ),
    );
    setRenamingGraphId(null);
  };

  const cancelGraphRename = () => {
    setRenamingGraphId(null);
    setGraphRenameDraft("");
  };

  const closeAdaptiveStructureRevision = () => {
    setStructureRevisionError(null);
    restoreStructureRevisionFocusRef.current = true;
    setStructureRevisionSession(null);
  };

  const beginAdaptiveStructureRevision = (trigger?: HTMLButtonElement) => {
    if (!draft.adaptiveInput) return;
    structureRevisionReturnTargetRef.current =
      trigger?.id === "experiment-workspace-revise-overview" ? "overview" : "navigation";
    try {
      // Capture the live cell edits into a lossless canonical snapshot without
      // mutating the workspace that must remain recoverable on Cancel.
      const sourceDraft = synchronizeAdaptiveDraft({
        draft,
        cells,
        now: new Date().toISOString(),
      });
      const sourceContract = sourceDraft.adaptiveInput?.contract;
      if (!sourceContract) throw new Error("ADAPTIVE_CONTRACT_MISSING");
      const retainedSetup = sourceDraft.adaptiveInput?.biologicalSetup;
      const initial = createBiologicalSetupPrefill(
        retainedSetup ? { contract: sourceContract, ...retainedSetup } : sourceContract,
      );
      if (initial.status === "stopped") {
        setAnalysisInvalidationMessage(initial.reason);
        return;
      }
      setStructureRevisionError(null);
      setStructureRevisionSession({ sourceDraft, prefill: initial.prefill });
    } catch (error) {
      setAnalysisInvalidationMessage(
        actionErrorMessage(
          error,
          t(
            "現在の測定値を安全に保持できないため、実験の組み立て編集を開始しませんでした。",
            "Experiment structure editing was not started because the current measurements could not be retained safely.",
          ),
          locale,
        ),
      );
    }
  };

  const handleAnalysisCorrection = (correction: DraftAnalysisCorrection) => {
    setShowGraph(false);
    setAnalysisInvalidationMessage(`${correction.title}。${correction.message}`);
    if (correction.target === "experiment_structure") {
      if (draft.adaptiveInput) beginAdaptiveStructureRevision();
      else setActiveTab("overview");
      return;
    }
    setDataViewMode("expanded");
    if (draft.adaptiveInput) {
      setActiveTab("overview");
      return;
    }
    const experimentId = correction.focusExperimentId;
    if (!experimentId || !draft.experiments.some(({ id }) => id === experimentId)) {
      setActiveTab("overview");
      return;
    }
    setActiveTab(`experiment:${experimentId}`);
    setAnalysisCorrectionFocus({ experimentId, target: correction.target });
  };

  const applyAdaptiveStructureRevision = (result: BiologicalExperimentSetupResult): boolean => {
    const session = structureRevisionSession;
    const sourceSnapshot = session?.sourceDraft.adaptiveInput;
    if (!session || !sourceSnapshot) return false;

    // A no-op revision must not touch any workspace state, dirty marker,
    // persisted baseline, Graph, analysis, mapping, or raw lineage.
    if (JSON.stringify(result.contract) === JSON.stringify(session.prefill.originalContract)) {
      closeAdaptiveStructureRevision();
      return true;
    }

    const compatibility = checkAdaptiveStructureRevisionCompatibility({
      previousContract: session.prefill.originalContract,
      nextContract: result.contract,
      canonicalObservations: sourceSnapshot.canonicalObservations,
      mapping: sourceSnapshot.mapping,
    });
    if (compatibility.status === "stopped") {
      setStructureRevisionError(
        `${compatibility.reason} 入力済みデータは変更されていません。「変更せず戻る」で元のワークスペースへ戻れます。`,
      );
      return false;
    }

    const presentation = createBiologicalSetupPresentation(result);
    if (presentation.status === "stopped") {
      setStructureRevisionError(
        "変更後の条件表と実験構造の対応を確認できません。入力済みデータは変更されていません。",
      );
      return false;
    }

    const rebuilt = createAdaptiveWorkspace({
      contract: result.contract,
      observations: sourceSnapshot.canonicalObservations,
      mapping: sourceSnapshot.mapping,
      lineage: sourceSnapshot.rawLineage,
      confirmedTargetedConfirmations: sourceSnapshot.targetedConfirmations,
      biologicalSetup: presentation.presentation,
    });
    if (rebuilt.status !== "ready" || !rebuilt.draft) {
      setStructureRevisionError(
        "変更後の構造へ既存データを安全に対応づけられません。入力済みデータは変更されていません。",
      );
      return false;
    }
    const rebuiltSnapshot = rebuilt.draft.adaptiveInput;
    if (
      !rebuiltSnapshot ||
      JSON.stringify(rebuiltSnapshot.canonicalObservations) !==
        JSON.stringify(sourceSnapshot.canonicalObservations) ||
      JSON.stringify(rebuiltSnapshot.mapping) !== JSON.stringify(sourceSnapshot.mapping) ||
      JSON.stringify(rebuiltSnapshot.rawLineage) !== JSON.stringify(sourceSnapshot.rawLineage)
    ) {
      setStructureRevisionError(
        "既存データまたは元データ履歴が変わる可能性を検出したため、変更を適用しませんでした。",
      );
      return false;
    }

    const graphCoordinatesStable = graphs.every((graph) =>
      graphReferencesRemainStable(draft, rebuilt.draft!, graph),
    );
    setGraphs(graphCoordinatesStable ? graphs.map(invalidateGraphAnalysis) : []);
    setDraft({
      ...rebuilt.draft,
      entrySourceHistory: session.sourceDraft.entrySourceHistory,
    });
    setCells(rebuilt.cells);
    setActiveTab("overview");
    setSelectedCellKey(null);
    setShowGraph(false);
    setActiveGraphId(null);
    closeAdaptiveStructureRevision();
    setAnalysisInvalidationMessage(
      graphCoordinatesStable
        ? "実験の組み立てを更新しました。測定値とGraphの外観は保持し、以前の解析結果・p値注釈・Methodsは外しました。"
        : "実験の組み立てを更新しました。測定値は保持しましたが、条件の参照を一意に保てないGraphは安全のためワークスペースから外しました。保存済みprojectの旧履歴は残ります。",
    );
    return true;
  };

  const handleSave = useCallback(
    async (saveAs = false) => {
      if (!saveProject) return false;
      setSaveStatus("saving");
      setSaveMessage(null);
      try {
        const state = createExperimentWorkspaceProject({
          draft,
          cells,
          graphs,
          dataViewMode,
          existingState: savedProject?.state,
        });
        const saved = await saveProject(state, saveAs ? undefined : savedProject?.target);
        if (!saved) {
          setSaveStatus("idle");
          return false;
        }
        setSavedProject(saved);
        savedSnapshotRef.current = currentSnapshot;
        setSaveStatus("saved");
        setSaveMessage(
          localizedText(
            locale,
            "プロジェクトを保存しました。次回もこの入力画面で再編集できます。",
            "Project saved. You can reopen it and continue editing this worksheet.",
          ),
        );
        return true;
      } catch (error) {
        // Project construction can fail before the native save bridge is
        // called (for example a semantic dual-write mismatch).  Record the
        // same privacy-reduced fixed code as native I/O failures so Alpha
        // diagnostics do not misleadingly report `lastErrorCode: null`.
        recordDiagnosticError("PROJECT_SAVE_FAILED", error);
        recordDiagnosticEvent("project_save_failed", { stage: "unknown" });
        setSaveStatus("error");
        setSaveMessage(
          actionErrorMessage(
            error,
            t("プロジェクトを保存できませんでした。", "The project could not be saved."),
            locale,
          ),
        );
        return false;
      }
    },
    [cells, currentSnapshot, dataViewMode, draft, graphs, locale, saveProject, savedProject],
  );
  useEffect(() => {
    if (!onRegisterSaveHandler) return;
    onRegisterSaveHandler({
      save: (saveAs) => handleSave(Boolean(saveAs)),
      checkpoint: () =>
        savedProject
          ? {
              kind: "experiment",
              project: {
                target: savedProject.target,
                state: createExperimentWorkspaceProject({
                  draft,
                  cells,
                  graphs,
                  dataViewMode,
                  existingState: savedProject.state,
                }),
              },
            }
          : null,
    });
    return () => onRegisterSaveHandler(null);
  }, [cells, dataViewMode, draft, graphs, handleSave, onRegisterSaveHandler, savedProject]);

  if (structureRevisionSession) {
    return (
      <BiologicalExperimentSetup
        enabled
        externalError={structureRevisionError}
        initial={{
          ...structureRevisionSession.prefill,
          revisionMode: true,
          notice:
            "入力済みの測定値と元データ履歴は、変更を安全に適用できると確認するまで現在のワークスペースに保持されます。",
        }}
        onCancel={() => {
          closeAdaptiveStructureRevision();
        }}
        onReady={applyAdaptiveStructureRevision}
      />
    );
  }

  const workspaceTabs: WorkspaceTab[] = [
    "overview",
    ...draft.experiments.map(({ id }) => `experiment:${id}` as WorkspaceTab),
  ];
  const handleWorkspaceTabKeyDown = (event: KeyboardEvent<HTMLButtonElement>, index: number) => {
    if (!(["ArrowLeft", "ArrowRight", "Home", "End"] as string[]).includes(event.key)) return;
    event.preventDefault();
    const nextIndex =
      event.key === "Home"
        ? 0
        : event.key === "End"
          ? workspaceTabs.length - 1
          : (index + (event.key === "ArrowRight" ? 1 : -1) + workspaceTabs.length) %
            workspaceTabs.length;
    const nextTab = workspaceTabs[nextIndex];
    setActiveTab(nextTab);
    window.requestAnimationFrame(() =>
      document.getElementById(`workspace-tab-${nextIndex}`)?.focus(),
    );
  };

  return (
    <div className="experiment-workspace" ref={rootRef}>
      <header className="experiment-workspace-header">
        <button className="experiment-workspace-back" type="button" onClick={requestBack}>
          ← {t("戻る", "Back")}
        </button>
        <div>
          <p className="experiment-workspace-eyebrow">
            {t("実験ワークスペース", "Experiment workspace")}
          </p>
          <h1>{draft.name}</h1>
          <p className="experiment-workspace-context">
            {draft.context === "cell_culture"
              ? t("細胞・培養", "Cell culture")
              : draft.context === "microscopy_imaging"
                ? t("顕微鏡・画像解析", "Microscopy and imaging")
                : draft.context === "animal"
                  ? t("動物・個体", "Animal or organism")
                  : t("実験データ", "Experiment data")}{" "}
            · {draft.readouts.map(({ label }) => label).join(" / ")}
          </p>
        </div>
      </header>

      {draft.dataOrigin === "synthetic_demo" ? (
        <div className="experiment-workspace-demo-banner" role="status">
          <strong>{t("合成デモデータ", "Synthetic demo data")}</strong>
          <span>
            {t(
              "学習・画面確認用の人工データです。実測・未発表データではなく、正式な研究結果として使用しないでください。",
              "These are artificial data for learning and interface review. They are not measured or unpublished research data and must not be used as formal research results.",
            )}
          </span>
        </div>
      ) : null}

      {DevelopmentEvaluationWorkspaceLoader ? (
        <Suspense fallback={null}>
          <DevelopmentEvaluationWorkspaceLoader
            draft={draft}
            activeTab={activeTab}
            showGraph={showGraph}
            onLoad={(loadedCells, axis) => {
              setCells((current) => ({ ...current, ...loadedCells }));
              setDraft((current) => ({
                ...current,
                dataOrigin: "synthetic_demo",
                ...(axis && axis.semantic !== "categorical"
                  ? {
                      time: {
                        ...current.time,
                        axisSemantic: axis.semantic,
                        axisTitle: axis.title,
                        axisUnit: axis.unit,
                      },
                    }
                  : {}),
              }));
            }}
          />
        </Suspense>
      ) : null}

      <nav
        className="experiment-workspace-project-nav"
        aria-label={t("プロジェクト内の移動", "Project navigation")}
      >
        <details className="experiment-workspace-file-menu">
          <summary>{t("ファイル", "File")}</summary>
          <div>
            {onOpenProject ? (
              <button type="button" onClick={onOpenProject}>
                {t("プロジェクトを開く", "Open project")}
              </button>
            ) : null}
            <button
              type="button"
              disabled={!saveProject || saveStatus === "saving"}
              onClick={() => void handleSave(false)}
            >
              {t("保存", "Save")} <kbd>Ctrl/⌘S</kbd>
            </button>
            <button
              type="button"
              disabled={!saveProject || saveStatus === "saving"}
              onClick={() => void handleSave(true)}
            >
              {t("名前を付けて保存", "Save As")} <kbd>Shift+Ctrl/⌘S</kbd>
            </button>
            {onReuseDesign ? (
              <button
                type="button"
                onClick={() =>
                  requestExit("設計を使って新しい実験を始める", () => onReuseDesign(draft))
                }
              >
                {t("設計だけを新しいprojectに再利用", "Reuse only the design in a new project")}
              </button>
            ) : null}
            {onSaveFavorite ? (
              <button type="button" onClick={() => onSaveFavorite(draft, graphs)}>
                {t("この設計をお気に入りに保存", "Save this design as a favorite")}
              </button>
            ) : null}
          </div>
        </details>
        {draft.adaptiveInput ? (
          <button
            id="experiment-workspace-revise-navigation"
            ref={structureRevisionTriggerRef}
            type="button"
            onClick={(event) => beginAdaptiveStructureRevision(event.currentTarget)}
          >
            {t("実験の組み立てを修正", "Revise experiment structure")}
          </button>
        ) : null}
        <button
          className={!showGraph ? "is-active" : ""}
          type="button"
          aria-current={!showGraph ? "page" : undefined}
          onClick={() => setShowGraph(false)}
        >
          {t("データ", "Data")}
        </button>
        <button
          className={showGraph && graphWorkspaceMode === "graph" ? "is-active" : ""}
          type="button"
          aria-current={showGraph && graphWorkspaceMode === "graph" ? "page" : undefined}
          disabled={graphs.length === 0}
          onClick={openExistingGraphs}
        >
          {t("グラフ", "Graph")}
          {graphs.length > 0 ? ` (${graphs.length})` : ""}
        </button>
        <button
          className={showGraph && graphWorkspaceMode === "statistics" ? "is-active" : ""}
          type="button"
          aria-current={showGraph && graphWorkspaceMode === "statistics" ? "page" : undefined}
          disabled={graphs.length === 0}
          onClick={openStatistics}
        >
          {t("統計", "Statistics")}
        </button>
        <button
          className="experiment-workspace-project-nav-create"
          type="button"
          onClick={openGraph}
        >
          {t("＋ グラフを作成", "+ Create Graph")}
        </button>
        <button
          className="experiment-workspace-project-nav-save"
          type="button"
          aria-label={
            saveStatus === "saving"
              ? t("保存中", "Saving")
              : t("プロジェクトを保存", "Save project")
          }
          title={t("保存（⌘S / Ctrl+S）", "Save (⌘S / Ctrl+S)")}
          disabled={!saveProject || saveStatus === "saving"}
          onClick={() => void handleSave(false)}
        >
          {saveStatus === "saving" ? "…" : t("保存", "Save")}
        </button>
        <span
          className={`experiment-workspace-dirty-state ${isDirty ? "is-dirty" : ""}`}
          aria-label={t("保存状態", "Save status")}
        >
          {isDirty ? t("未保存", "Unsaved") : t("保存済み", "Saved")}
        </span>
      </nav>
      {saveMessage ? (
        <p
          className={`experiment-workspace-save-message ${saveStatus === "error" ? "is-error" : ""}`}
          role={saveStatus === "error" ? "alert" : "status"}
        >
          {saveMessage}
        </p>
      ) : null}
      {graphCreateMessage ? (
        <p className="experiment-workspace-graph-created" role="status" aria-live="polite">
          {graphCreateMessage}
        </p>
      ) : null}
      {analysisInvalidationMessage ? (
        <p className="experiment-workspace-graph-created" role="status" aria-live="polite">
          {analysisInvalidationMessage}
        </p>
      ) : null}

      {showGraphTypeChoice ? (
        <div className="experiment-workspace-graph-choice-backdrop" role="presentation">
          <section
            ref={graphChoiceDialogRef}
            className="experiment-workspace-graph-choice"
            role="dialog"
            aria-modal="true"
            aria-labelledby="graph-choice-heading"
          >
            <div className="experiment-workspace-graph-choice-heading">
              <div>
                <p className="experiment-workspace-eyebrow">{t("新しいグラフ", "New Graph")}</p>
                <h2 id="graph-choice-heading">
                  {t("グラフの基本形を選ぶ", "Choose a Graph type")}
                </h2>
                <p>
                  {t(
                    "基本形を選んだ後も、点・箱・誤差線などのレイヤーを追加できます。",
                    "After choosing a base type, you can still add layers such as points, boxes, and error bars.",
                  )}
                </p>
              </div>
              <button type="button" onClick={() => setShowGraphTypeChoice(false)}>
                {t("キャンセル", "Cancel")}
              </button>
            </div>
            {draft.readouts.length > 1 ? (
              <label className="experiment-workspace-graph-source">
                <span>{t("表示する測定項目", "Measured readout to display")}</span>
                <select
                  aria-label={t("表示する測定項目", "Measured readout to display")}
                  value={selectedSourceReadout?.id ?? ""}
                  onChange={(event) => selectGraphSource(event.currentTarget.value)}
                >
                  {draft.readouts.map((readout) => (
                    <option key={readout.id} value={readout.id}>
                      {readout.label}
                    </option>
                  ))}
                </select>
                <small>
                  {t(
                    "この選択は新しいグラフにだけ保存されます。",
                    "This selection is saved only in the new Graph.",
                  )}
                </small>
              </label>
            ) : null}
            {draft.time.sampling === "longitudinal" && draft.time.points.length > 1 ? (
              <fieldset className="experiment-workspace-layer-builder">
                <legend>{t("グラフのデータソース", "Graph data source")}</legend>
                <label>
                  <input
                    type="radio"
                    name="graph-source-mode"
                    checked={selectedCreateSourceMode === "raw_readout"}
                    onChange={() => selectCreateSourceMode("raw_readout")}
                  />
                  {t("元の時系列（全時間を保持）", "Original time series (retain all time points)")}
                </label>
                <label>
                  <input
                    type="radio"
                    name="graph-source-mode"
                    checked={selectedCreateSourceMode === "derived_metric"}
                    onChange={() => selectCreateSourceMode("derived_metric")}
                  />
                  {t(
                    "各生物学的単位から求めた派生値を別グラフにする",
                    "Create a separate Graph from a value derived for each biological unit",
                  )}
                </label>
                {selectedCreateSourceMode === "derived_metric" ? (
                  <>
                    <label className="experiment-graph-field">
                      <span>{t("派生値", "Derived value")}</span>
                      <select
                        aria-label={t("新しいグラフの派生値", "Derived value for the new Graph")}
                        value={selectedCreateMetric.kind}
                        onChange={(event) =>
                          setSelectedCreateMetric({
                            kind: event.currentTarget.value as TimeAnalysisPlan["kind"],
                          })
                        }
                      >
                        <option value="auc">{t("AUC（台形法）", "AUC (trapezoidal rule)")}</option>
                        <option value="endpoint">{t("最後の時点", "Last time point")}</option>
                        <option value="maximum">{t("最大値", "Maximum")}</option>
                        <option value="minimum">{t("最小値", "Minimum")}</option>
                        <option value="change_from_baseline">
                          {t("baselineからの変化量", "Change from baseline")}
                        </option>
                        <option value="f_over_f0">F/F0</option>
                      </select>
                    </label>
                    {selectedCreateMetric.kind === "auc" ? (
                      <>
                        <p className="experiment-graph-help">
                          {t(
                            `AUCは時間曲線の下の面積です。選んだ範囲の応答の大きさと持続時間を1つの値にまとめます。単位は「測定値 × ${draft.time.unit}」で、時間経過の形や開始値の違いは別に確認が必要です。`,
                            `AUC is the area under the time curve. It summarizes response magnitude and duration over the selected range in one value. Its unit is measured value × ${draft.time.unit}; curve shape and baseline differences still require separate review.`,
                          )}
                        </p>
                        <div className="experiment-graph-field-grid">
                          <label className="experiment-graph-field">
                            <span>{t("AUC windowの開始", "Start of AUC window")}</span>
                            <select
                              aria-label={t(
                                "新しいAUC windowの開始",
                                "Start of the new AUC window",
                              )}
                              value={selectedCreateMetric.windowStart ?? ""}
                              onChange={(event) => {
                                const value = event.currentTarget.value;
                                setSelectedCreateMetric((current) => ({
                                  ...current,
                                  windowStart: value === "" ? undefined : Number(value),
                                }));
                              }}
                            >
                              <option value="">{t("最初の時点", "First time point")}</option>
                              {draft.time.points.map((point) => (
                                <option key={point.id} value={point.value}>
                                  {point.value} {draft.time.unit}
                                </option>
                              ))}
                            </select>
                          </label>
                          <label className="experiment-graph-field">
                            <span>{t("AUC windowの終了", "End of AUC window")}</span>
                            <select
                              aria-label={t("新しいAUC windowの終了", "End of the new AUC window")}
                              value={selectedCreateMetric.windowEnd ?? ""}
                              onChange={(event) => {
                                const value = event.currentTarget.value;
                                setSelectedCreateMetric((current) => ({
                                  ...current,
                                  windowEnd: value === "" ? undefined : Number(value),
                                }));
                              }}
                            >
                              <option value="">{t("最後の時点", "Last time point")}</option>
                              {draft.time.points.map((point) => (
                                <option key={point.id} value={point.value}>
                                  {point.value} {draft.time.unit}
                                </option>
                              ))}
                            </select>
                          </label>
                        </div>
                        {!createMetricWindowIsValid ? (
                          <small role="alert">
                            {t(
                              "開始時点は終了時点以前にしてください。",
                              "The start must be at or before the end.",
                            )}
                          </small>
                        ) : null}
                      </>
                    ) : null}
                  </>
                ) : null}
              </fieldset>
            ) : null}
            <div className="experiment-workspace-graph-choice-recommended">
              <span>{t("推奨グラフ", "Recommended Graph")}</span>
              {recommendedGraphTypes.map((graphType) => (
                <button
                  className={
                    graphTypeSelectionActive && selectedGraphType === graphType ? "is-selected" : ""
                  }
                  key={graphType}
                  type="button"
                  aria-pressed={graphTypeSelectionActive && selectedGraphType === graphType}
                  aria-label={
                    locale === "ja"
                      ? `${experimentGraphTypeLabel(graphType, locale)}を選択（おすすめ）`
                      : `Select ${graphType === "paired_dot" ? "Connected matched points" : experimentGraphTypeLabel(graphType, locale)} (recommended)`
                  }
                  onClick={() => selectGraphType(graphType)}
                >
                  <GraphTypeThumbnail type={graphType} />
                  <span>
                    <strong>
                      {graphType === "line"
                        ? t("時間変化を見る", "View change over time")
                        : graphType === "scatter"
                          ? t("XとYの関係を見る", "View the relationship between X and Y")
                          : graphType === "stacked_100"
                            ? t(
                                "全体に占めるカテゴリ構成を見る",
                                "View category composition of the whole",
                              )
                            : graphType === "category_percentage"
                              ? t(
                                  "カテゴリごとの割合を見る",
                                  "View the percentage in each category",
                                )
                              : graphType === "violin"
                                ? t(
                                    "各条件・時点の分布を見る",
                                    "View distributions by condition and time point",
                                  )
                                : graphType === "paired_dot"
                                  ? sharedSource
                                    ? t(
                                        `同じ${sharedSource.sourceUnitLabel}に由来する組の差を見る`,
                                        `View differences among sets derived from the same ${sharedSource.sourceUnitLabel}`,
                                      )
                                    : t("同じ単位の変化を見る", "View changes within the same unit")
                                  : t(
                                      "実験単位ごとの値を見る",
                                      "View values for each experimental unit",
                                    )}
                    </strong>
                    <small>
                      {t(
                        "データ構造に合う初期表示。選択は後から変更できます。",
                        "An initial display suited to the data structure. You can change it later.",
                      )}
                    </small>
                  </span>
                </button>
              ))}
            </div>
            <section
              className="experiment-workspace-current-preview"
              aria-labelledby="current-preview-heading"
            >
              <div>
                <p className="experiment-workspace-eyebrow">
                  {t("現在のデータで確認", "Preview with current data")}
                </p>
                <h3 id="current-preview-heading">
                  {t("作成後の初期表示", "Initial display after creation")}
                </h3>
              </div>
              {graphTypeSelectionActive ? (
                <CurrentDataGraphPreview
                  type={selectedGraphType}
                  draft={draft}
                  cells={cells}
                  readoutId={selectedSourceReadout?.id}
                  sourceMode={selectedCreateSourceMode}
                  timeAnalysis={selectedCreateMetric}
                  layers={selectedInitialLayers}
                />
              ) : (
                <p className="graph-current-preview__empty">
                  {t(
                    "グラフ形式を選ぶと、現在のデータでプレビューします。",
                    "Choose a Graph type to preview it with the current data.",
                  )}
                </p>
              )}
              <p className="experiment-workspace-current-preview-note">
                {t(
                  "現在の選択とデータを使ったプレビューです。詳細な見た目は作成後に変更できます。",
                  "This preview uses the current selection and data. You can adjust detailed appearance after creation.",
                )}
              </p>
              {selectedGraphType === "box" && draft.experiments.length <= 3 ? (
                <p className="experiment-workspace-box-guidance" role="note">
                  biological replicateが{draft.experiments.length}
                  点のため、Boxによる分布要約の情報量は限定的です。Dotを推奨します。
                </p>
              ) : null}
            </section>
            <div
              className="experiment-workspace-graph-type-grid"
              aria-label={t("その他のグラフ形式", "Other Graph types")}
            >
              {(
                [
                  "dot",
                  "box",
                  "violin",
                  "bar",
                  "line",
                  "paired_dot",
                  "scatter",
                  "stacked",
                  "stacked_100",
                  "category_percentage",
                ] as const
              )
                .filter((value) => {
                  if (recommendedGraphTypes.includes(value)) return false;
                  if (selectedSourceReadout?.shape === "categorical_counts") {
                    return (
                      value === "stacked" ||
                      value === "stacked_100" ||
                      value === "category_percentage"
                    );
                  }
                  if (
                    selectedSourceReadout?.shape === "wb_ratio" &&
                    (value === "box" || value === "violin")
                  ) {
                    return false;
                  }
                  return (
                    value !== "stacked" &&
                    value !== "stacked_100" &&
                    value !== "category_percentage"
                  );
                })
                .map((value) => {
                  const label = experimentGraphTypeLabel(value, locale);
                  return (
                  <button
                    className={
                      graphTypeSelectionActive && selectedGraphType === value ? "is-selected" : ""
                    }
                    key={value}
                    type="button"
                    aria-label={
                      locale === "ja"
                        ? `${label}を選択`
                        : `Select ${value === "paired_dot" ? "Connected matched points" : label}`
                    }
                    aria-pressed={graphTypeSelectionActive && selectedGraphType === value}
                    disabled={
                      (value === "paired_dot" && !canConnectUnits) ||
                      (value === "scatter" && draft.analysisIntent.kind !== "correlation") ||
                      (value !== "scatter" && draft.analysisIntent.kind === "correlation")
                    }
                    onClick={() => selectGraphType(value)}
                  >
                    <GraphTypeThumbnail type={value} />
                    <strong>
                      {locale === "en" && value === "paired_dot"
                        ? "Connected matched points"
                        : label}
                    </strong>
                  </button>
                  );
                })}
              {draft.analysisIntent.kind !== "correlation" ? (
                <small id="scatter-disabled-reason">
                  {t(
                    "Scatterは「同じ試料のXとYの関係を見る」設計で利用できます",
                    "Scatter is available for designs that examine X and Y in the same sample.",
                  )}
                </small>
              ) : null}
            </div>
            {!canConnectUnits ? (
              <p className="experiment-workspace-graph-type-guidance">
                {t(
                  "同じ単位の対応情報がある設計で利用できます",
                  "Available for designs with explicit matching information for the same units.",
                )}
              </p>
            ) : null}
            <section
              className="experiment-workspace-layer-builder"
              aria-label={t("初期レイヤー", "Initial layers")}
            >
              <button
                className="secondary-button"
                type="button"
                aria-expanded={showLayerBuilder}
                onClick={() => setShowLayerBuilder((current) => !current)}
              >
                {showLayerBuilder
                  ? t("カスタムグラフ設定を閉じる", "Close custom Graph settings")
                  : t(
                      "＋ カスタムグラフ（レイヤーから組み立てる）",
                      "+ Custom Graph (build from layers)",
                    )}
              </button>
              {showLayerBuilder ? (
                <fieldset>
                  <legend>{t("作成時に表示するもの", "Layers to show on creation")}</legend>
                  {(
                    [
                      ["raw", "個々の測定値（表示用）"],
                      ["experiment", "実験単位ごとの要約点（解析用）"],
                      ["overall", "平均"],
                      ["errorBar", "誤差線（初期値 SD）"],
                      ["box", "箱ひげ"],
                      ["violin", "分布（Violin）"],
                      [
                        "connectingLine",
                        sharedSource ? "同じ由来に属する点を結ぶ線" : "同じ単位を結ぶ線",
                      ],
                    ] as const
                  ).map(([layer, label]) => {
                    const disabled =
                      ((layer === "raw" || layer === "box" || layer === "violin") &&
                        selectedSourceReadout?.shape !== "nested_continuous") ||
                      (layer === "connectingLine" && !canConnectUnits);
                    return (
                      <label key={layer}>
                        <input
                          checked={selectedInitialLayers[layer]}
                          disabled={disabled}
                          type="checkbox"
                          onChange={(event) =>
                            setSelectedInitialLayers((current) => ({
                              ...current,
                              [layer]: event.target.checked,
                            }))
                          }
                        />
                        <span>{label}</span>
                      </label>
                    );
                  })}
                  {!canConnectUnits ? (
                    <small>
                      同じ単位の対応が明示されていないため、個々の点を結ぶ線は追加できません。
                    </small>
                  ) : null}
                </fieldset>
              ) : null}
            </section>
            <div className="experiment-workspace-graph-choice-actions">
              {!graphTypeSelectionActive ? (
                <p className="experiment-workspace-graph-choice-required" role="status">
                  {t(
                    "グラフ形式を1つ選んでください。選択するまでグラフは作成できません。",
                    "Choose one Graph type. A Graph cannot be created until a type is selected.",
                  )}
                </p>
              ) : null}
              <button type="button" onClick={() => setShowGraphTypeChoice(false)}>
                {t("キャンセル", "Cancel")}
              </button>
              <button
                className="is-primary"
                type="button"
                disabled={!graphTypeSelectionActive || !createMetricWindowIsValid}
                onClick={() => createGraph(selectedGraphType, selectedInitialLayers)}
              >
                {t("このグラフを作成", "Create this Graph")}
              </button>
            </div>
          </section>
        </div>
      ) : null}

      {!showGraph && !canonicalSpreadsheetPresentation.enabled ? (
        <nav
          className="experiment-workspace-tabs"
          aria-label={t("実験の表示切り替え", "Experiment views")}
        >
          <div role="tablist" aria-label={t("実験タブ", "Experiment tabs")}>
            <button
              id="workspace-tab-0"
              className={`experiment-workspace-tab ${activeTab === "overview" ? "is-active" : ""}`}
              type="button"
              aria-selected={activeTab === "overview"}
              aria-controls="workspace-panel-0"
              tabIndex={activeTab === "overview" ? 0 : -1}
              role="tab"
              onKeyDown={(event) => handleWorkspaceTabKeyDown(event, 0)}
              onClick={() => setActiveTab("overview")}
            >
              {t("概要", "Overview")}
            </button>
            {draft.experiments.map((experiment, index) => {
              const tabId: WorkspaceTab = `experiment:${experiment.id}`;
              return (
                <button
                  id={`workspace-tab-${index + 1}`}
                  className={`experiment-workspace-tab ${activeTab === tabId ? "is-active" : ""}`}
                  type="button"
                  role="tab"
                  aria-selected={activeTab === tabId}
                  aria-controls={`workspace-panel-${index + 1}`}
                  tabIndex={activeTab === tabId ? 0 : -1}
                  key={experiment.id}
                  onKeyDown={(event) => handleWorkspaceTabKeyDown(event, index + 1)}
                  onClick={() => setActiveTab(tabId)}
                >
                  {experiment.label}
                </button>
              );
            })}
          </div>
          <button
            className="experiment-workspace-tab experiment-workspace-tab--add"
            type="button"
            onClick={addExperiment}
          >
            ＋{" "}
            {draft.conditionAssignment.kind === "matched"
              ? matchedSetLabel(draft)
              : independentAdaptiveInputRows(draft)
                ? t("入力行", "Entry row")
                : t("実験", "Experiment")}
          </button>
        </nav>
      ) : null}

      {graphs.length > 0 ? (
        <div
          className="experiment-workspace-graph-view"
          hidden={!showGraph}
          ref={graphWorkspaceRef}
          tabIndex={-1}
        >
          <nav
            className="experiment-workspace-graph-tabs"
            aria-label={t("作成したグラフ", "Created Graphs")}
          >
            {graphs.map((graph) => {
              const active = graph.id === activeGraphId;
              const renaming = graph.id === renamingGraphId;
              return (
                <div
                  className={`experiment-workspace-graph-tab-item${active ? " is-active" : ""}`}
                  key={graph.id}
                >
                  {renaming ? (
                    <input
                      autoFocus
                      className="experiment-workspace-graph-tab-input"
                      aria-label={t("グラフ名", "Graph name")}
                      value={graphRenameDraft}
                      onChange={(event) => setGraphRenameDraft(event.currentTarget.value)}
                      onBlur={() => commitGraphRename(graph.id)}
                      onKeyDown={(event) => {
                        if (event.key === "Enter") {
                          event.preventDefault();
                          commitGraphRename(graph.id);
                        }
                        if (event.key === "Escape") {
                          event.preventDefault();
                          cancelGraphRename();
                        }
                      }}
                    />
                  ) : (
                    <button
                      className={`experiment-workspace-graph-tab${active ? " is-active" : ""}`}
                      type="button"
                      onClick={() => setActiveGraphId(graph.id)}
                      onDoubleClick={() => beginGraphRename(graph)}
                    >
                      {graph.displayName}
                    </button>
                  )}
                  {active && !renaming ? (
                    <button
                      className="experiment-workspace-graph-tab-rename"
                      type="button"
                      aria-label={t(
                        `${graph.displayName}の名前を変更`,
                        `Rename ${graph.displayName}`,
                      )}
                      title={t("グラフ名を変更", "Rename Graph")}
                      onClick={() => beginGraphRename(graph)}
                    >
                      ✎
                    </button>
                  ) : null}
                </div>
              );
            })}
          </nav>
          {graphs.map((graph) => (
            <div key={graph.id} hidden={graph.id !== activeGraphId}>
              <Suspense
                fallback={
                  <p className="experiment-graph-help" role="status">
                    {t("グラフ編集画面を読み込んでいます…", "Loading the Graph editor…")}
                  </p>
                }
              >
                <ExperimentGraphWorkbench
                  draft={draft}
                  cells={cells}
                  workspaceMode={graphWorkspaceMode}
                  analysisRunner={analysisRunner}
                  analysisAvailable={analysisAvailable}
                  initialState={graph}
                  onStateChange={(state) =>
                    setGraphs((current) =>
                      current.map((candidate) =>
                        candidate.id === graph.id ? { ...candidate, ...state } : candidate,
                      ),
                    )
                  }
                  onClose={() => setShowGraph(false)}
                  onAnalysisCorrection={handleAnalysisCorrection}
                />
              </Suspense>
            </div>
          ))}
        </div>
      ) : null}
      <div className="experiment-workspace-body" hidden={showGraph}>
        <main className="experiment-workspace-main">
          {activeTab === "overview" ? (
            <div id="workspace-panel-0" role="tabpanel" aria-labelledby="workspace-tab-0">
              <OverviewPanel
                draft={draft}
                cells={cells}
                onReviseStructure={
                  draft.adaptiveInput
                    ? (trigger) => beginAdaptiveStructureRevision(trigger)
                    : undefined
                }
                onProportionChange={updateProportion}
                onProportionPaste={applyOverviewProportionPaste}
                onNestedScalarChange={updateNestedScalar}
                onNestedScalarPaste={applyOverviewScalarPaste}
                onNestedCellChange={(key, cell) =>
                  setCells((current) => ({ ...current, [key]: cell }))
                }
                dataViewMode={dataViewMode}
                onDataViewModeChange={setDataViewMode}
                canonicalSpreadsheet={
                  canonicalSpreadsheetPresentation.enabled && draft.adaptiveInput
                    ? {
                        observations: draft.adaptiveInput.canonicalObservations,
                        readOnly: canonicalSpreadsheetPresentation.readOnly,
                        showExperimentDate: draft.adaptiveInput.contract.unitLevels.some(
                          ({ role }) => role === "block",
                        ),
                        onObservationsChange: replaceAdaptiveObservations,
                        onFileImport: replaceAdaptiveFileImport,
                        nextObservationId: nextAdaptiveObservationId,
                        nextExperimentalUnitIdentity: nextAdaptiveExperimentalUnitIdentity,
                        worksheetRows: draft.experiments.map((experiment) => ({
                          key: experiment.id,
                          label: experiment.label,
                          date: experiment.date,
                        })),
                        conditionCombinations:
                          draft.adaptiveInput.biologicalSetup?.conditionCombinations,
                        onWorksheetRowChange: (rowIndex, patch) => {
                          const experiment = draft.experiments[rowIndex];
                          if (!experiment) return;
                          updateExperiment(experiment.id, {
                            ...(patch.label !== undefined ? { label: patch.label } : {}),
                            ...(patch.date !== undefined ? { date: patch.date } : {}),
                          });
                        },
                      }
                    : undefined
                }
              />
            </div>
          ) : (
            draft.experiments.map((experiment, index) => {
              if (activeTab !== `experiment:${experiment.id}`) return null;
              return (
                <div
                  id={`workspace-panel-${index + 1}`}
                  role="tabpanel"
                  aria-labelledby={`workspace-tab-${index + 1}`}
                  key={experiment.id}
                >
                  <ExperimentPanel
                    draft={draft}
                    experiment={experiment}
                    cells={cells}
                    onExperimentChange={(patch) => updateExperiment(experiment.id, patch)}
                    onProportionChange={updateProportion}
                    onProportionPaste={applyProportionPaste}
                    onNestedSelect={setSelectedCellKey}
                    onNestedScalarChange={updateNestedScalar}
                    onCategoricalChange={updateCategoricalCount}
                    onWbRatioChange={updateWbRatio}
                    onToggleNotPlanned={toggleNotPlanned}
                    canRemove={draft.experiments.length > 1}
                    onRemove={() => removeExperiment(experiment.id)}
                  />
                </div>
              );
            })
          )}
        </main>
        {selectedDescriptor && selectedNestedCell ? (
          <RawSummaryInspector
            descriptor={selectedDescriptor}
            cell={selectedNestedCell}
            sourceNote={sourceNotes[selectedDescriptor.key] ?? ""}
            onValuesChange={updateNestedValues}
            onSourceNoteChange={(value) =>
              setSourceNotes((previous) => ({ ...previous, [selectedDescriptor.key]: value }))
            }
            onClose={() => setSelectedCellKey(null)}
          />
        ) : null}
      </div>
    </div>
  );
}

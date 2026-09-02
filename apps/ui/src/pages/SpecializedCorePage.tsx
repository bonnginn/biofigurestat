import { useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";
import {
  createD11EngineRequest,
  type AnalysisEngineResult,
  type AnalysisRecommendation,
} from "@lsaa/analysis-contracts";
import { parseAdaptiveDelimited, type ParsedAdaptiveInput } from "@lsaa/adaptive-input";
import { parseMatrixPaste, parseSurvivalPaste } from "@lsaa/data-sheet";
import type {
  AdaptiveInputSnapshot,
  ExperimentDesign,
  Observation,
  UnitInstance,
} from "@lsaa/domain";
import {
  createHeatmapGraphSpec,
  createHeatmapModel,
  createKaplanMeierGraphModel,
  createSurvivalGraphSpec,
  type HeatmapTransform,
} from "@lsaa/graph-spec";
import {
  appendUnresolvedVisualizationDataRevision,
  appendUnresolvedVisualizationGraph,
  createInitialProjectState,
  createUnresolvedVisualizationProjectState,
  ProjectStateSchema,
  type UnresolvedVisualizationProjectState,
  type SpecializedEntryDraftProjectState,
} from "@lsaa/project";
import type { SubjectUnitRelationship } from "@lsaa/adaptive-input";
import { defaultAnalysisRunner, type AnalysisRunner } from "../app/analysisClient";
import {
  COMPLETE_BENCHMARK_ARTIFACT_NAMES,
  beginDefaultGraphCapture,
  blobToBase64,
  completeDefaultGraphCapture,
  currentBenchmarkRun,
  recordBenchmarkEvent,
  recordFinalGraphCapture,
  setBenchmarkOutcome,
  sha256Hex,
  useBenchmarkRun,
  writeBenchmarkArtifacts,
} from "../app/benchmarkEvaluation";
import { evaluationMode } from "../app/evaluationMode";
import { serializeGraphSvg, svgToPngBlob } from "../app/graphExport";
import { LocalizedFileInput } from "../components/LocalizedFileInput";
import type { LiteratureExperimenterCase } from "../app/literatureBenchmark";
import { generateMethodsText } from "../app/methodsText";
import { PRODUCT_IDENTITY } from "../app/productIdentity";
import type {
  OpenedProject,
  OpenedUnresolvedVisualizationProject,
  OpenUnresolvedVisualizationProjectAction,
  SaveProjectAction,
  SaveSpecializedEntryDraftProjectAction,
  SaveUnresolvedVisualizationProjectAction,
} from "../app/projectActions";
import {
  createSpecializedEntryDraft,
  specializedSafeStop,
} from "../app/specializedEntryDraftPersistence";
import {
  adaptiveSurvivalObservationId,
  adaptiveSurvivalUnitId,
  appendSupersedingAnalysisExecution,
  parseAdaptiveSurvivalText,
  reviseAdaptiveSurvivalProject,
  synchronizeAdaptiveSurvivalProject,
  updateAdaptiveSurvivalSnapshot,
} from "../app/adaptiveSurvivalProject";
import { routeFromPath, type AppRoute } from "../app/routes";
import {
  recordUsageGraphConfiguration,
  recordUsageGraphEdit,
  recordUsageMilestone,
} from "../app/usageTelemetry";
import type { SpecializedCoreDraft } from "../app/specializedAnalysisDrafts";
import type { DedicatedEntryIntent } from "../app/dedicatedEntryIntent";
import { createTimeToEventEntry, parseTimeToEventTable } from "../app/timeToEventEntry";
import { localizedFailureMessage, localizedText, useAppLocale } from "../app/appLocale";
import { createTimeToEventContractProjection } from "../app/timeToEventProjection";
import {
  survivalStatisticsReadiness,
  type SurvivalStatisticsReadiness,
} from "../app/survivalStatisticsReadiness";
import { AnalysisRouteSwitcher } from "../components/AnalysisRouteSwitcher";
import { HeatmapGraph } from "../components/graph/HeatmapGraph";
import { DEFAULT_SURVIVAL_COLORS, SurvivalGraph } from "../components/graph/SurvivalGraph";
import { GraphExportActions } from "../components/graph/GraphExportActions";
import { GraphWorkspaceFrame } from "../components/graph/GraphWorkspaceFrame";
import {
  ExperimentGraphColorControl,
  ExperimentGraphRangeControl,
  ExperimentGraphVisibilityControl,
} from "../components/graph/ExperimentGraphControlPrimitives";
import { DelimitedTextSpreadsheet } from "../components/DelimitedTextSpreadsheet";
import type { RegisterWorkspaceSaveHandler, RequestWorkspaceExit } from "../app/workspaceLifecycle";
import type { AnalysisRouteSwitcherAccess } from "../app/analysisRouteSwitcherAccess";
import { useWorkspaceDirtyBaseline } from "../app/useWorkspaceDirtyBaseline";

type Props = Readonly<{
  mode: "survival" | "heatmap";
  onBack: () => void;
  saveProject?: SaveProjectAction;
  saveSpecializedEntryDraftProject?: SaveSpecializedEntryDraftProjectAction;
  initialSpecializedEntryDraft?: Readonly<{
    state: SpecializedEntryDraftProjectState;
    target: string;
  }>;
  openUnresolvedVisualizationProject?: OpenUnresolvedVisualizationProjectAction;
  saveUnresolvedVisualizationProject?: SaveUnresolvedVisualizationProjectAction;
  initialVisualizationProject?: OpenedUnresolvedVisualizationProject;
  analysisRunner?: AnalysisRunner;
  analysisAvailable?: boolean;
  onNavigate?: (route: AppRoute) => void;
  analysisRouteSwitcherAccess?: AnalysisRouteSwitcherAccess;
  onOpenProject?: () => void;
  initialText?: string;
  adaptiveInput?: AdaptiveInputSnapshot;
  initialProject?: OpenedProject;
  initialDraft?: SpecializedCoreDraft;
  onDraftChange?: (draft: SpecializedCoreDraft) => void;
  entryIntent?: DedicatedEntryIntent;
  onDirtyChange?: (dirty: boolean) => void;
  onRequestExit?: RequestWorkspaceExit;
  onRegisterSaveHandler?: RegisterWorkspaceSaveHandler;
}>;
type TimeToEventInputSource = Readonly<{
  kind: "clipboard" | "csv" | "tsv" | "generic_file";
  label: string;
}>;
type VisualizationInputSource = Readonly<{
  kind: "direct_entry" | "clipboard" | "csv" | "tsv" | "generic_file";
  label: string;
}>;
type NumericStatusMappingChoice = "event_is_1" | "event_is_0" | null;
const now = () => new Date().toISOString();
const day = () => new Date().toISOString().slice(0, 10);
const SURVIVAL_TABLE_HEADER = "Unit ID\tGroup\tFollow-up time\tStatus";
const SURVIVAL_EXAMPLE = `${SURVIVAL_TABLE_HEADER}\nmouse-1\tControl\t4\tEvent\nmouse-2\tControl\t7\tCensored\nmouse-3\tTreatment\t6\tEvent\nmouse-4\tTreatment\t9\tCensored`;
const HEATMAP_TABLE_HEADER = "Feature\tSample 1";
const HEATMAP_EXAMPLE = `${HEATMAP_TABLE_HEADER}\tSample 2\tSample 3\nProtein A\t1\t2\tNA\nProtein B\t3\t5\t8`;
let heatmapVisualizationIdSequence = 0;

function heatmapVisualizationId(prefix: string): string {
  heatmapVisualizationIdSequence += 1;
  return `visualization.heatmap.${prefix}.${Date.now().toString(36)}.${heatmapVisualizationIdSequence}`;
}

function survivalTimeAxisLabel(unit: string): string {
  return unit.trim() ? `Follow-up time (${unit.trim()})` : "Follow-up time";
}

function heatmapSourceKindFor(source: VisualizationInputSource): VisualizationInputSource["kind"] {
  return source.kind;
}

function heatmapMappingFor(parsed: ParsedAdaptiveInput, sourceLabel: string, confirmedAt: string) {
  return {
    schemaVersion: "0.1.0" as const,
    sourceLabel,
    delimiter: parsed.delimiter,
    headerRow: parsed.headerRow,
    // Matrix labels remain table metadata. Nothing here establishes an
    // experimental unit, biological n, pairing, or identity.
    columns: parsed.headers.map((header, index) => ({
      index,
      header,
      role: "metadata" as const,
    })),
    confirmedAt,
  };
}

function sameHeatmapRows(
  left: readonly (readonly string[])[],
  right: readonly (readonly string[])[],
): boolean {
  return (
    left.length === right.length &&
    left.every(
      (row, rowIndex) =>
        row.length === right[rowIndex]?.length &&
        row.every((cell, columnIndex) => cell === right[rowIndex]?.[columnIndex]),
    )
  );
}

function sameHeatmapConfiguration(
  existing: ReturnType<typeof createHeatmapGraphSpec> | undefined,
  candidate: ReturnType<typeof createHeatmapGraphSpec>,
): boolean {
  return (
    existing?.type === "heatmap" &&
    existing.heatmap !== undefined &&
    candidate.heatmap !== undefined &&
    existing.heatmap.transform === candidate.heatmap.transform &&
    existing.heatmap.transformVersion === candidate.heatmap.transformVersion &&
    existing.heatmap.min === candidate.heatmap.min &&
    existing.heatmap.max === candidate.heatmap.max &&
    existing.heatmap.missingColor === candidate.heatmap.missingColor &&
    existing.heatmap.showCellValues === candidate.heatmap.showCellValues &&
    existing.appearance.palette.length === candidate.appearance.palette.length &&
    existing.appearance.palette.every(
      (color, index) => color === candidate.appearance.palette[index],
    )
  );
}

function numericStatusMappingFor(choice: NumericStatusMappingChoice) {
  if (choice === "event_is_1") return { event: "1" as const, censored: "0" as const };
  if (choice === "event_is_0") return { event: "0" as const, censored: "1" as const };
  return undefined;
}

function formatResearcherNumber(value: number | null | undefined): string {
  if (value === null || value === undefined || !Number.isFinite(value)) return "—";
  return new Intl.NumberFormat("en-US", { maximumFractionDigits: 3 }).format(value);
}

function formatResearcherPValue(value: number | null | undefined): string {
  if (value === null || value === undefined || !Number.isFinite(value)) return "—";
  if (value > 0 && value < 0.001) return value.toExponential(2);
  return formatResearcherNumber(value);
}

function formattedLogRankResult(
  result: AnalysisEngineResult | null,
  groupLabels: readonly string[],
): string | null {
  const test = result?.tests[0];
  if (!test) return null;
  const degrees = test.degreesOfFreedom?.join(", ") ?? "—";
  const statistic = test.statisticName.toLowerCase().includes("chi")
    ? `χ²(${degrees})`
    : `${test.statisticName}(${degrees})`;
  const comparedGroups =
    groupLabels.length === 2
      ? `${groupLabels[0]} vs ${groupLabels[1]}`
      : groupLabels.length > 2
        ? `${groupLabels.join(" / ")}（全群）`
        : "入力した生存群";
  return `${comparedGroups} · log-rank: ${statistic} = ${formatResearcherNumber(test.statistic)}, p = ${formatResearcherPValue(test.pValue)}`;
}

function explicitLiteratureSurvivalStatus(value: unknown): "Event" | "Censored" | null {
  const normalized = String(value).normalize("NFKC").trim().toLowerCase();
  if (["1", "event", "observed", "true", "死亡", "イベント", "イベント発生"].includes(normalized))
    return "Event";
  if (["0", "censored", "censor", "false", "打ち切り", "観察終了", "生存"].includes(normalized))
    return "Censored";
  return null;
}

function survivalInputFingerprint(
  text: string,
  snapshot: AdaptiveInputSnapshot | undefined,
  subjectUnitRelationship: SubjectUnitRelationship,
  timeToEventPattern: string | undefined,
  followUpUnit: string,
  numericStatusMapping: NumericStatusMappingChoice,
): string {
  return JSON.stringify({
    text,
    contract: snapshot?.contract ?? null,
    subjectUnitRelationship,
    timeToEventPattern: timeToEventPattern ?? null,
    followUpUnit,
    numericStatusMapping,
  });
}

function rawOffsetForTextareaOffset(rawText: string, textareaOffset: number): number {
  let rawOffset = 0;
  let normalizedOffset = 0;
  while (rawOffset < rawText.length && normalizedOffset < textareaOffset) {
    if (rawText[rawOffset] === "\r" && rawText[rawOffset + 1] === "\n") rawOffset += 2;
    else rawOffset += 1;
    normalizedOffset += 1;
  }
  return rawOffset;
}

function replaceRawTextareaSelection(
  rawText: string,
  pastedText: string,
  selectionStart: number,
  selectionEnd: number,
): string {
  const rawStart = rawOffsetForTextareaOffset(rawText, selectionStart);
  const rawEnd = rawOffsetForTextareaOffset(rawText, selectionEnd);
  return `${rawText.slice(0, rawStart)}${pastedText}${rawText.slice(rawEnd)}`;
}

export function SpecializedCorePage({
  mode,
  onBack,
  saveProject,
  saveSpecializedEntryDraftProject,
  initialSpecializedEntryDraft,
  openUnresolvedVisualizationProject,
  saveUnresolvedVisualizationProject,
  initialVisualizationProject,
  analysisRunner = defaultAnalysisRunner,
  analysisAvailable = true,
  onNavigate,
  analysisRouteSwitcherAccess,
  onOpenProject,
  initialText,
  adaptiveInput,
  initialProject,
  initialDraft,
  onDraftChange,
  entryIntent,
  onDirtyChange,
  onRequestExit,
  onRegisterSaveHandler,
}: Props) {
  const locale = useAppLocale();
  const t = (ja: string, en: string) => localizedText(locale, ja, en);
  const effectiveEntryIntent =
    entryIntent ?? initialDraft?.entryIntent ?? initialSpecializedEntryDraft?.state.entryIntent;
  const [currentSpecializedEntryDraft, setCurrentSpecializedEntryDraft] = useState(
    initialSpecializedEntryDraft,
  );
  const [currentProject, setCurrentProject] = useState<OpenedProject | undefined>(initialProject);
  const persistedAdaptiveInput =
    currentProject?.state.adaptiveInput ??
    adaptiveInput ??
    initialProject?.state.adaptiveInput ??
    undefined;
  const experimentFirstEntry = Boolean(effectiveEntryIntent || persistedAdaptiveInput);
  const initialEditorText =
    initialText ??
    initialDraft?.text ??
    initialSpecializedEntryDraft?.state.rawLineage.rawText ??
    initialVisualizationProject?.state.rawLineage.rawText ??
    persistedAdaptiveInput?.rawLineage?.rawText ??
    (mode === "survival" ? SURVIVAL_TABLE_HEADER : "");
  const [text, setText] = useState(initialEditorText);
  const [timeToEventInputSource, setTimeToEventInputSource] = useState<TimeToEventInputSource>(
    () => {
      const lineage = persistedAdaptiveInput?.rawLineage;
      const specializedLineage = initialSpecializedEntryDraft?.state.rawLineage;
      return lineage
        ? { kind: lineage.sourceKind, label: lineage.sourceLabel }
        : specializedLineage
          ? {
              kind:
                specializedLineage.sourceKind === "direct_entry"
                  ? "clipboard"
                  : specializedLineage.sourceKind,
              label: specializedLineage.sourceLabel,
            }
          : { kind: "clipboard", label: "time-to-event-entry-paste" };
    },
  );
  const [transform, setTransform] = useState<HeatmapTransform>(initialDraft?.transform ?? "none");
  const [currentVisualizationProject, setCurrentVisualizationProject] = useState<
    OpenedUnresolvedVisualizationProject | undefined
  >(initialVisualizationProject);
  const initialVisualizationGraph =
    initialVisualizationProject?.state.graphSpecs.find(
      (candidate) => candidate.id === initialVisualizationProject.state.activeGraphId,
    ) ?? initialVisualizationProject?.state.graphSpecs.at(-1);
  const initialVisualizationHeatmap =
    initialVisualizationGraph?.type === "heatmap" ? initialVisualizationGraph.heatmap : undefined;
  const [heatmapInputSource, setHeatmapInputSource] = useState<VisualizationInputSource>(() =>
    initialVisualizationProject
      ? {
          kind: initialVisualizationProject.state.rawLineage.sourceKind,
          label: initialVisualizationProject.state.rawLineage.sourceLabel,
        }
      : {
          kind: "clipboard",
          label: "heatmap-entry-paste",
        },
  );
  const [rangeMin, setRangeMin] = useState(
    initialDraft?.rangeMin ??
      (initialVisualizationHeatmap?.min === null || initialVisualizationHeatmap?.min === undefined
        ? ""
        : String(initialVisualizationHeatmap.min)),
  );
  const [rangeMax, setRangeMax] = useState(
    initialDraft?.rangeMax ??
      (initialVisualizationHeatmap?.max === null || initialVisualizationHeatmap?.max === undefined
        ? ""
        : String(initialVisualizationHeatmap.max)),
  );
  const [missingColor, setMissingColor] = useState(
    initialDraft?.missingColor ?? initialVisualizationHeatmap?.missingColor ?? "#d1d5db",
  );
  const [showCellValues, setShowCellValues] = useState(
    initialDraft?.showCellValues ?? initialVisualizationHeatmap?.showCellValues ?? false,
  );
  const [heatmapPalette, setHeatmapPalette] = useState<readonly string[]>(
    initialVisualizationGraph?.type === "heatmap"
      ? initialVisualizationGraph.appearance.palette
      : ["#3b4cc0", "#f7f7f7", "#b40426"],
  );
  const initialCurrentAnalysis = initialProject?.state.analysisRuns
    .filter(
      ({ state, inputDesignRevisionId, inputRawRevisionId }) =>
        state === "current" &&
        inputDesignRevisionId === initialProject.state.activeDesignRevisionId &&
        inputRawRevisionId === initialProject.state.activeRawRevisionId,
    )
    .at(-1);
  const initialSurvivalGraphSpec = initialCurrentAnalysis
    ? initialProject?.state.graphs.find(
        ({ sourceAnalysisRunId, state, spec }) =>
          sourceAnalysisRunId === initialCurrentAnalysis.id &&
          state === "current" &&
          spec.type === "survival_curve",
      )?.spec
    : undefined;
  const [result, setResult] = useState<AnalysisEngineResult | null>(
    initialCurrentAnalysis?.result ?? null,
  );
  const [statisticsSetupExpanded, setStatisticsSetupExpanded] = useState(
    !experimentFirstEntry ||
      initialDraft?.statisticsSetupExpanded === true ||
      (initialSpecializedEntryDraft?.state.answers.kind === "survival" &&
        initialSpecializedEntryDraft.state.answers.statisticsSetupExpanded === true) ||
      Boolean(initialCurrentAnalysis),
  );
  const [message, setMessage] = useState<string | null>(null);
  const lastSaveSucceededRef = useRef(false);
  const [exportFeedback, setExportFeedback] = useState<Readonly<{
    kind: "success" | "error";
    text: string;
  }> | null>(null);
  const [showLogRankAnnotation, setShowLogRankAnnotation] = useState(
    initialDraft?.showLogRankAnnotation ??
      (initialSpecializedEntryDraft?.state.answers.kind === "survival"
        ? initialSpecializedEntryDraft.state.answers.showLogRankAnnotation
        : false),
  );
  const [subjectUnitRelationship, setSubjectUnitRelationship] = useState<SubjectUnitRelationship>(
    initialDraft?.subjectUnitRelationship ??
      (initialSpecializedEntryDraft?.state.answers.kind === "survival"
        ? initialSpecializedEntryDraft.state.answers.subjectUnitRelationship
        : undefined) ??
      effectiveEntryIntent?.facts.subjectUnitRelationship ??
      "unknown",
  );
  const [followUpUnit, setFollowUpUnit] = useState(
    initialDraft?.followUpUnit ??
      (initialSpecializedEntryDraft?.state.answers.kind === "survival"
        ? initialSpecializedEntryDraft.state.answers.followUpUnit
        : undefined) ??
      persistedAdaptiveInput?.contract.orderedAxes.find(
        ({ sampling }) => sampling === "event_follow_up",
      )?.unit ??
      "",
  );
  const [graphTitle, setGraphTitle] = useState(
    initialDraft?.graphTitle ??
      initialProject?.state.metadata.projectName ??
      effectiveEntryIntent?.experimentName ??
      "Kaplan–Meier survival",
  );
  const [survivalXAxisLabel, setSurvivalXAxisLabel] = useState(
    initialDraft?.survivalXAxisLabel ??
      initialSurvivalGraphSpec?.axes.xLabel ??
      survivalTimeAxisLabel(
        initialDraft?.followUpUnit ??
          persistedAdaptiveInput?.contract.orderedAxes.find(
            ({ sampling }) => sampling === "event_follow_up",
          )?.unit ??
          "",
      ),
  );
  const [survivalYAxisLabel, setSurvivalYAxisLabel] = useState(
    initialDraft?.survivalYAxisLabel ??
      initialSurvivalGraphSpec?.axes.yLabel ??
      "Survival probability",
  );
  const [survivalPalette, setSurvivalPalette] = useState<readonly string[]>(
    initialDraft?.survivalPalette ??
      initialSurvivalGraphSpec?.appearance.palette ??
      DEFAULT_SURVIVAL_COLORS,
  );
  const [survivalFontSize, setSurvivalFontSize] = useState(
    initialDraft?.survivalFontSize ?? initialSurvivalGraphSpec?.appearance.fontSize ?? 12,
  );
  const [survivalLegendFontSize, setSurvivalLegendFontSize] = useState(
    initialDraft?.survivalLegendFontSize ??
      initialSurvivalGraphSpec?.appearance.legendFontSize ??
      13,
  );
  const [survivalLegendPosition, setSurvivalLegendPosition] = useState<
    "hidden" | "top" | "right" | "inside"
  >(
    initialDraft?.survivalLegendPosition ??
      initialSurvivalGraphSpec?.appearance.legendPosition ??
      "right",
  );
  const [survivalShowMinorTicks, setSurvivalShowMinorTicks] = useState(
    initialDraft?.survivalShowMinorTicks ?? initialSurvivalGraphSpec?.axes.showMinorTicks ?? true,
  );
  const [survivalTickDirection, setSurvivalTickDirection] = useState<"inside" | "outside">(
    initialDraft?.survivalTickDirection ??
      initialSurvivalGraphSpec?.axes.tickDirection ??
      "outside",
  );
  const [survivalWorkspaceTab, setSurvivalWorkspaceTab] = useState<"data" | "graph" | "statistics">(
    experimentFirstEntry ? "data" : "statistics",
  );
  const [numericStatusMapping, setNumericStatusMapping] = useState<NumericStatusMappingChoice>(
    initialDraft?.numericStatusMapping ??
      (initialSpecializedEntryDraft?.state.answers.kind === "survival"
        ? initialSpecializedEntryDraft.state.answers.numericStatusMapping
        : null),
  );
  const subjectUnitRelationshipWasInferred =
    effectiveEntryIntent?.facts.subjectUnitRelationship !== undefined &&
    effectiveEntryIntent.facts.subjectUnitRelationship !== "unknown";
  const [editingInferredSubjectUnitRelationship, setEditingInferredSubjectUnitRelationship] =
    useState(!subjectUnitRelationshipWasInferred);
  const [resultInputFingerprint, setResultInputFingerprint] = useState<string | null>(() =>
    initialCurrentAnalysis
      ? survivalInputFingerprint(
          initialEditorText,
          initialProject?.state.adaptiveInput ?? adaptiveInput,
          initialDraft?.subjectUnitRelationship ??
            effectiveEntryIntent?.facts.subjectUnitRelationship ??
            "unknown",
          effectiveEntryIntent?.facts.timeToEventPattern,
          followUpUnit,
          numericStatusMapping,
        )
      : null,
  );
  const [literatureCase, setLiteratureCase] = useState<LiteratureExperimenterCase | null>(null);
  const svgRef = useRef<SVGSVGElement>(null);
  const benchmarkRun = useBenchmarkRun();
  const directTimeToEventEntry = useMemo(() => {
    if (mode !== "survival" || persistedAdaptiveInput || !experimentFirstEntry) return null;
    return createTimeToEventEntry({
      experimentName: effectiveEntryIntent?.experimentName ?? "Time-to-event experiment",
      experimentDescription:
        effectiveEntryIntent?.experimentDescription ??
        "Each identified subject was followed until one terminal event or the end of observation.",
      subjectUnitLabel: effectiveEntryIntent?.subjectUnitLabel ?? "Subject",
      subjectUnitRelationship,
      tsvText: text,
      timeToEventPattern:
        effectiveEntryIntent?.facts.timeToEventPattern ?? "single_terminal_event_or_censoring",
      sourceLabel: timeToEventInputSource.label,
      sourceKind: timeToEventInputSource.kind,
      followUpUnit,
      numericStatusMapping: numericStatusMappingFor(numericStatusMapping),
    });
  }, [
    effectiveEntryIntent,
    experimentFirstEntry,
    followUpUnit,
    mode,
    numericStatusMapping,
    persistedAdaptiveInput,
    subjectUnitRelationship,
    text,
    timeToEventInputSource,
  ]);
  const activeAdaptiveInput =
    persistedAdaptiveInput ??
    (directTimeToEventEntry?.status === "surface_ready"
      ? directTimeToEventEntry.snapshot
      : undefined);
  const animalTimeToEventEntry =
    mode === "survival" && effectiveEntryIntent?.sourceContext === "animal";
  const survivalTableHasRows =
    mode === "survival" && text.split(/\r?\n/u).some((line, index) => index > 0 && line.trim());
  const heatmapTableHasRows =
    mode === "heatmap" && text.split(/\r?\n/u).some((line, index) => index > 0 && line.trim());
  const currentSurvivalInputFingerprint = useMemo(
    () =>
      survivalInputFingerprint(
        text,
        activeAdaptiveInput,
        subjectUnitRelationship,
        effectiveEntryIntent?.facts.timeToEventPattern,
        followUpUnit,
        numericStatusMapping,
      ),
    [
      activeAdaptiveInput,
      effectiveEntryIntent,
      followUpUnit,
      numericStatusMapping,
      subjectUnitRelationship,
      text,
    ],
  );
  const currentSurvivalInputFingerprintRef = useRef(currentSurvivalInputFingerprint);
  currentSurvivalInputFingerprintRef.current = currentSurvivalInputFingerprint;
  const draft = useMemo<SpecializedCoreDraft>(
    () => ({
      text,
      transform,
      rangeMin,
      rangeMax,
      missingColor,
      showCellValues,
      showLogRankAnnotation,
      statisticsSetupExpanded,
      subjectUnitRelationship,
      followUpUnit,
      numericStatusMapping,
      graphTitle,
      survivalXAxisLabel,
      survivalYAxisLabel,
      survivalPalette,
      survivalFontSize,
      survivalLegendFontSize,
      survivalLegendPosition,
      survivalShowMinorTicks,
      survivalTickDirection,
      entryIntent: effectiveEntryIntent,
    }),
    [
      missingColor,
      rangeMax,
      rangeMin,
      showCellValues,
      showLogRankAnnotation,
      statisticsSetupExpanded,
      subjectUnitRelationship,
      followUpUnit,
      numericStatusMapping,
      graphTitle,
      survivalXAxisLabel,
      survivalYAxisLabel,
      survivalPalette,
      survivalFontSize,
      survivalLegendFontSize,
      survivalLegendPosition,
      survivalShowMinorTicks,
      survivalTickDirection,
      text,
      transform,
      effectiveEntryIntent,
    ],
  );
  const onDraftChangeRef = useRef(onDraftChange);
  useEffect(() => {
    onDraftChangeRef.current = onDraftChange;
  }, [onDraftChange]);
  useEffect(() => {
    onDraftChangeRef.current?.(draft);
  }, [draft]);
  const dirtyLifecycleSnapshot = useMemo(
    () => ({
      // Opening or closing the optional statistics panel is disclosure state, not
      // scientific work. Keep it in route-local recovery, but do not require a save
      // when this is the only thing the researcher changed.
      draft: { ...draft, statisticsSetupExpanded: undefined },
      heatmapInputSource,
      result,
      timeToEventInputSource,
    }),
    [draft, heatmapInputSource, result, timeToEventInputSource],
  );
  const { adoptCurrentAsBaseline, interactionCaptureProps } = useWorkspaceDirtyBaseline(
    dirtyLifecycleSnapshot,
    onDirtyChange,
  );

  useEffect(() => {
    const identity = benchmarkRun.identity;
    setLiteratureCase(null);
    if (!import.meta.env.DEV || !identity) return;
    let cancelled = false;
    void import("../app/literatureBenchmark").then(
      ({ fetchLiteratureExperimenterCase, isLiteratureCaseId }) => {
        if (!isLiteratureCaseId(identity.caseId)) return;
        void fetchLiteratureExperimenterCase(identity).then((loaded) => {
          if (!cancelled) setLiteratureCase(loaded);
        });
      },
    );
    return () => {
      cancelled = true;
    };
  }, [benchmarkRun.identity]);

  const loadLiteratureSurvival = () => {
    if (!literatureCase || mode !== "survival") return;
    const rows = literatureCase.syntheticData;
    if (!rows.length || rows.some(({ event, time }) => event === null || time === null)) {
      setMessage("このcaseはevent/censoringとfollow-up timeを完全には保持していません。");
      return;
    }
    const mappedRows = rows.map((row) => ({
      row,
      status: explicitLiteratureSurvivalStatus(row.event),
    }));
    if (mappedRows.some(({ status }) => status === null)) {
      setMessage(
        "event/censoringの表記を一意に解釈できません。EventまたはCensoredを明示してください。",
      );
      return;
    }
    const lines = [
      "Unit ID\tGroup\tFollow-up time\tStatus",
      ...mappedRows.map(({ row, status }) =>
        [row.unit_id, row.condition, row.time, status].join("\t"),
      ),
    ];
    setText(lines.join("\n"));
    setResult(null);
    setResultInputFingerprint(null);
    setMessage(`${rows.length}件のevent/censoring identityをSurvival表へ入力しました。`);
    recordBenchmarkEvent("literature_benchmark_data_loaded", {
      caseId: literatureCase.caseId,
      mappedCells: rows.length,
    });
  };

  const survival = useMemo(() => {
    if (mode !== "survival") return null;
    try {
      const parsed = activeAdaptiveInput
        ? parseAdaptiveSurvivalText(activeAdaptiveInput, text)
        : experimentFirstEntry
          ? parseTimeToEventTable(text, {
              numericStatusMapping: numericStatusMappingFor(numericStatusMapping),
            }).rows
          : parseSurvivalPaste(text, {
              numericStatusMapping: numericStatusMappingFor(numericStatusMapping),
            });
      const labels = activeAdaptiveInput
        ? activeAdaptiveInput.contract.factors.reduce<string[]>((items, factor) => {
            if (items.length === 0) return [...factor.levels];
            return items.flatMap((prefix) => factor.levels.map((level) => `${prefix} · ${level}`));
          }, [])
        : [...new Set(parsed.map(({ conditionId }) => conditionId))];
      const unknown = parsed.find(({ conditionId }) => !labels.includes(conditionId));
      if (unknown)
        throw new Error(`入力のGroup「${unknown.conditionId}」は保存済み実験構造にありません。`);
      const conditions = labels.map((label, index) => ({ id: `condition.${index + 1}`, label }));
      const labelToId = new Map(conditions.map(({ id, label }) => [label, id]));
      const rows = parsed.map((row) => ({ ...row, conditionId: labelToId.get(row.conditionId)! }));
      return {
        rows,
        conditions,
        model: createKaplanMeierGraphModel(
          conditions,
          rows.map((row, index) => ({
            observationId: `observation.${index + 1}`,
            experimentalUnitId: row.unitId,
            conditionId: row.conditionId,
            followUpTime: row.followUpTime,
            eventObserved: row.eventObserved,
          })),
        ),
      };
    } catch (error) {
      return {
        error: localizedFailureMessage(
          locale,
          error,
          "入力を確認してください。",
          "Check the time-to-event data and required columns.",
        ),
        internalError: error instanceof Error ? error.message : "",
      } as const;
    }
  }, [activeAdaptiveInput, experimentFirstEntry, locale, mode, numericStatusMapping, text]);
  const statisticsReadiness = useMemo<SurvivalStatisticsReadiness>(() => {
    if (mode !== "survival" || !survival || "error" in survival) {
      return survivalStatisticsReadiness({
        groups: [],
        eventCount: 0,
        independentUnitsConfirmed: false,
      });
    }
    const independentUnitsConfirmed =
      !experimentFirstEntry ||
      activeAdaptiveInput?.contract.matching.kind === "independent" ||
      subjectUnitRelationship === "subject_is_experimental_unit";
    return survivalStatisticsReadiness({
      groups: survival.conditions.map((condition) => ({
        observationCount: survival.rows.filter((row) => row.conditionId === condition.id).length,
      })),
      eventCount: survival.rows.filter(({ eventObserved }) => eventObserved).length,
      independentUnitsConfirmed,
      nestedUnits: experimentFirstEntry && subjectUnitRelationship === "nested_in_parent",
    });
  }, [activeAdaptiveInput, experimentFirstEntry, mode, subjectUnitRelationship, survival]);
  const heatmap = useMemo(() => {
    if (mode !== "heatmap") return null;
    try {
      const raw = parseMatrixPaste(text);
      return { raw, model: createHeatmapModel(raw, transform) };
    } catch (error) {
      return {
        error: localizedFailureMessage(
          locale,
          error,
          "入力を確認してください。",
          "Check the matrix data and numeric cells.",
        ),
      } as const;
    }
  }, [locale, mode, text, transform]);
  const initialUsageDataPresentRef = useRef(
    initialEditorText.split(/\r?\n/u).some((line, index) => index > 0 && line.trim()),
  );
  const dataMilestoneRecordedRef = useRef(initialUsageDataPresentRef.current);
  const graphMilestoneRecordedRef = useRef(initialUsageDataPresentRef.current);
  const validDedicatedGraph =
    mode === "survival"
      ? survivalTableHasRows && Boolean(survival && !("error" in survival))
      : heatmapTableHasRows && Boolean(heatmap && !("error" in heatmap));
  useEffect(() => {
    if (dataMilestoneRecordedRef.current || !validDedicatedGraph) return;
    dataMilestoneRecordedRef.current = true;
    recordUsageMilestone(routeFromPath(window.location.pathname), "data_entry_started");
  }, [validDedicatedGraph]);
  useEffect(() => {
    if (graphMilestoneRecordedRef.current || !validDedicatedGraph) return;
    graphMilestoneRecordedRef.current = true;
    const usageRoute = routeFromPath(window.location.pathname);
    recordUsageMilestone(usageRoute, "graph_created");
    recordUsageGraphConfiguration(usageRoute, {
      graphFamily: mode === "survival" ? "kaplan_meier" : "heatmap",
      origin: "dedicated_entry",
      uncertainty: "none",
      rawPointsVisible: false,
      summaryVisible: mode === "survival",
    });
  }, [mode, validDedicatedGraph]);

  const openHeatmapProject = async () => {
    if (!openUnresolvedVisualizationProject) {
      setMessage(
        t(
          "ブラウザレビューではHeatmap projectを開けません。デスクトップ版で利用できます。",
          "Heatmap projects cannot be opened in the browser preview. Use the desktop app.",
        ),
      );
      return;
    }
    try {
      const opened = await openUnresolvedVisualizationProject();
      if (!opened) {
        setMessage(
          t(
            "開くをキャンセルしました。入力内容はこの画面に残っています。",
            "Opening was canceled. Your entries remain on this screen.",
          ),
        );
        return;
      }
      if (opened.state.entryIntent !== "matrix_visualization") {
        throw new Error("このファイルはHeatmap用のGraph-only projectではありません。");
      }
      const activeGraph = opened.state.graphSpecs.find(
        ({ id }) => id === opened.state.activeGraphId,
      );
      const graph =
        activeGraph?.type === "heatmap" && activeGraph.heatmap
          ? activeGraph
          : [...opened.state.graphSpecs]
              .reverse()
              .find((candidate) => candidate.type === "heatmap" && candidate.heatmap);
      setCurrentVisualizationProject(opened);
      setText(opened.state.rawLineage.rawText);
      adoptCurrentAsBaseline();
      setHeatmapInputSource({
        kind: opened.state.rawLineage.sourceKind,
        label: opened.state.rawLineage.sourceLabel,
      });
      if (graph?.heatmap) {
        setTransform(graph.heatmap.transform);
        setRangeMin(graph.heatmap.min === null ? "" : String(graph.heatmap.min));
        setRangeMax(graph.heatmap.max === null ? "" : String(graph.heatmap.max));
        setHeatmapPalette(graph.appearance.palette);
        setMissingColor(graph.heatmap.missingColor);
        setShowCellValues(graph.heatmap.showCellValues);
      }
      setMessage(
        t(
          "保存済みHeatmap projectを開きました。行列とGraph設定を復元しました。",
          "Opened the saved Heatmap project and restored its matrix and Graph settings.",
        ),
      );
      recordUsageMilestone(routeFromPath(window.location.pathname), "project_opened");
    } catch (error) {
      setMessage(
        locale === "ja" && error instanceof Error
          ? error.message
          : t(
              "Heatmap projectを開けませんでした。",
              "The Heatmap project could not be opened. Your current entries were retained.",
            ),
      );
    }
  };
  const requestOpenHeatmapProject = () => {
    if (!onRequestExit) {
      void openHeatmapProject();
      return;
    }
    onRequestExit({
      actionLabel: t("別のHeatmap projectを開く", "Open another Heatmap project"),
      proceed: openHeatmapProject,
    });
  };

  const createSurvivalState = () => {
    if (!survival || "error" in survival) throw new Error("有効なsurvival表を入力してください");
    const createdAt = now();
    if (!experimentFirstEntry) {
      const design: ExperimentDesign = {
        schemaVersion: "0.2.0",
        id: "design.survival",
        name: "Survival analysis",
        purpose: "animal",
        outcomes: [
          {
            id: "outcome.survival",
            key: "survival",
            label: "Survival",
            type: "time_to_event",
            unit: "follow-up time",
          },
        ],
        factors: [
          {
            id: "factor.group",
            key: "group",
            label: "Group",
            levels: survival.conditions.map((condition, order) => ({
              id: `level.${order + 1}`,
              label: condition.label,
              order,
            })),
          },
        ],
        conditions: survival.conditions.map((condition, index) => ({
          ...condition,
          factorLevels: { "factor.group": `level.${index + 1}` },
        })),
        unitLevels: [
          {
            id: "level.unit",
            key: "unit",
            label: "Biological unit",
            role: "experimental_unit",
            parentLevelId: null,
          },
        ],
        experimentalUnitLevelId: "level.unit",
        pairing: { kind: "independent" },
        plannedN: Math.max(
          ...survival.conditions.map(
            ({ id }) => survival.rows.filter((row) => row.conditionId === id).length,
          ),
        ),
        normalizationPlans: [],
        primaryContrast: {
          id: "contrast.primary",
          label: "Primary survival comparison",
          conditionIds: [survival.conditions[0]!.id, survival.conditions[1]!.id],
        },
        wizardRuleVersion: "survival-core-0.1.0",
        wizardDecisions: [{ questionId: "survival.censoring", answer: "explicit_event_status" }],
        createdAt,
      };
      const rawRevisionId = "raw.1";
      const outcomeId = design.outcomes[0]!.id;
      const units: UnitInstance[] = survival.rows.map((row) => ({
        id: row.unitId,
        levelId: design.experimentalUnitLevelId,
        parentUnitId: null,
        label: row.unitId,
        metadata: row.metadata,
      }));
      const observations: Observation[] = survival.rows.map((row, index) => ({
        id: `observation.${index + 1}`,
        rawRevisionId,
        unitInstanceId: row.unitId,
        conditionId: row.conditionId,
        outcomeId,
        measurement: {
          kind: "time_to_event",
          followUpTime: row.followUpTime,
          eventObserved: row.eventObserved,
        },
      }));
      const request =
        statisticsReadiness.status === "ready"
          ? createD11EngineRequest({
              requestId: "request.survival.1",
              projectId: currentProject?.state.metadata.projectId ?? "project.survival",
              analysisId: "analysis.survival.1",
              design,
              observations,
              unitInstances: units,
              outcomeId,
            })
          : undefined;
      return { createdAt, rawRevisionId, design, units, observations, request };
    }
    if (!activeAdaptiveInput) {
      throw new Error(
        subjectUnitRelationship === "nested_in_parent"
          ? "各行は親試料内の観測です。Graphは表示できますが、統計には親試料IDを含む実験構造が必要です。"
          : "統計へ進む前に、表の1行が独立した1例かを確認してください。",
      );
    }
    const rawRevisionIndex = (currentProject?.state.rawRevisions.length ?? 0) + 1;
    const rawChanged = currentProject
      ? currentProject.state.adaptiveInput?.rawLineage?.rawText !== text
      : true;
    const rawRevisionId =
      currentProject && !rawChanged
        ? currentProject.state.activeRawRevisionId
        : `raw.adaptive.${rawRevisionIndex}`;
    const analysisIndex = (currentProject?.state.analysisRuns.length ?? 0) + 1;
    const adaptivePlannedN =
      activeAdaptiveInput?.contract.matching.kind === "matched"
        ? Math.max(
            ...survival.conditions.map(
              ({ id }) => survival.rows.filter((row) => row.conditionId === id).length,
            ),
          )
        : survival.rows.length;
    const projection = createTimeToEventContractProjection(activeAdaptiveInput.contract);
    const design = projection.toExperimentDesign(adaptivePlannedN, createdAt);
    projection.assertEquivalent(design, createdAt);
    const outcomeId = design.outcomes[0]!.id;
    const units: UnitInstance[] = survival.rows.map((row) => ({
      id: adaptiveSurvivalUnitId(row.unitId),
      levelId: design.experimentalUnitLevelId,
      parentUnitId: null,
      label: row.unitId,
      metadata: { ...row.metadata, semanticIdentity: row.unitId },
    }));
    const observations: Observation[] = survival.rows.map((row, index) => ({
      id: adaptiveSurvivalObservationId(rawRevisionId, index),
      rawRevisionId,
      unitInstanceId: adaptiveSurvivalUnitId(row.unitId),
      conditionId: row.conditionId,
      outcomeId,
      measurement: {
        kind: "time_to_event",
        followUpTime: row.followUpTime,
        eventObserved: row.eventObserved,
      },
    }));
    const request =
      statisticsReadiness.status === "ready"
        ? createD11EngineRequest({
            requestId: `request.survival.${analysisIndex}`,
            projectId: currentProject?.state.metadata.projectId ?? "project.survival",
            analysisId: `analysis.survival.${analysisIndex}`,
            design,
            observations,
            unitInstances: units,
            outcomeId,
          })
        : undefined;
    return { createdAt, rawRevisionId, design, units, observations, request };
  };

  const runSurvival = async () => {
    const usageRoute = routeFromPath(window.location.pathname);
    recordUsageMilestone(usageRoute, "statistics_requested");
    try {
      if (statisticsReadiness.status !== "ready") {
        setMessage(
          locale === "ja"
            ? statisticsReadiness.researcherMessage
            : "Survival Statistics cannot run for the current declared structure and data. Review experimental units, groups, follow-up times, events, and censoring. Entered values are retained.",
        );
        recordUsageMilestone(usageRoute, "safe_stop");
        return;
      }
      setMessage(t("解析中…", "Analyzing…"));
      const prepared = createSurvivalState();
      if (!prepared.request) {
        setMessage(
          t(
            "このデータでは現在のSurvival Statisticsを実行できません。",
            "Survival Statistics cannot run for the current data.",
          ),
        );
        recordUsageMilestone(usageRoute, "safe_stop");
        return;
      }
      const inputFingerprint = currentSurvivalInputFingerprint;
      const next = await analysisRunner(prepared.request);
      if (currentSurvivalInputFingerprintRef.current !== inputFingerprint) {
        setMessage(
          t(
            "解析中に入力が変わりました。結果は採用せず、現在の表で再実行してください。",
            "The input changed during analysis. The result was not applied; run it again using the current table.",
          ),
        );
        recordUsageMilestone(usageRoute, "safe_stop");
        return;
      }
      setResult(next);
      setResultInputFingerprint(inputFingerprint);
      recordUsageMilestone(usageRoute, next.status === "ok" ? "statistics_completed" : "safe_stop");
      recordBenchmarkEvent("statistics_executed", {
        method: prepared.request.method,
        recommendedMethod: "log_rank",
        recommendationDiffers: false,
        recommendationReasonCode: "explicit_time_to_event_groups",
        recommendationExplanation:
          "Follow-up time and censoring are explicit for independent groups.",
        recommendationDecision: null,
        recommendationSelectedMethod: prepared.request.method,
        contrast:
          prepared.request.protocolVersion === "0.8.0"
            ? prepared.request.conditionIds.join("|")
            : null,
        protocolVersion: prepared.request.protocolVersion,
        engineVersion: next.engine.version,
      });
      setMessage(
        t(
          "Kaplan–Meier推定とlog-rank検定が完了しました。",
          "Kaplan–Meier estimation and the log-rank test are complete.",
        ),
      );
    } catch (error) {
      recordUsageMilestone(usageRoute, "safe_stop");
      setMessage(
        locale === "ja" && error instanceof Error
          ? error.message
          : t(
              "解析できませんでした",
              "The analysis could not be completed. Entered data is retained.",
            ),
      );
    }
  };
  const save = async (saveAs = false) => {
    lastSaveSucceededRef.current = false;
    if (mode === "survival" && !saveProject && !saveSpecializedEntryDraftProject) {
      setMessage(t("デスクトップ版で保存できます。", "Saving is available in the desktop app."));
      return;
    }
    try {
      if (mode === "survival") {
        if (
          experimentFirstEntry &&
          !activeAdaptiveInput &&
          effectiveEntryIntent &&
          directTimeToEventEntry?.status !== "surface_ready"
        ) {
          if (!saveSpecializedEntryDraftProject) return;
          const draftState = createSpecializedEntryDraft({
            route: "survival",
            entryIntent: effectiveEntryIntent,
            rawText: text,
            sourceKind:
              currentSpecializedEntryDraft?.state.rawLineage.rawText === text
                ? currentSpecializedEntryDraft.state.rawLineage.sourceKind
                : timeToEventInputSource.kind,
            sourceLabel:
              currentSpecializedEntryDraft?.state.rawLineage.rawText === text
                ? currentSpecializedEntryDraft.state.rawLineage.sourceLabel
                : timeToEventInputSource.label,
            answers: {
              kind: "survival",
              subjectUnitRelationship,
              followUpUnit,
              numericStatusMapping,
              statisticsSetupExpanded,
              showLogRankAnnotation,
            },
            safeStop: specializedSafeStop(
              directTimeToEventEntry?.status ?? "input_invalid",
              directTimeToEventEntry?.dualWrite.diagnostics ?? ["TIME_TO_EVENT_INPUT_UNRESOLVED"],
            ),
            current: currentSpecializedEntryDraft?.state,
          });
          const saved = await saveSpecializedEntryDraftProject(
            draftState,
            saveAs ? undefined : currentSpecializedEntryDraft?.target,
          );
          if (!saved) {
            setMessage(
              t(
                "保存をキャンセルしました。入力内容はこの画面に残っています。",
                "Saving was canceled. Your entries remain on this screen.",
              ),
            );
            return;
          }
          setCurrentSpecializedEntryDraft(saved);
          lastSaveSucceededRef.current = true;
          adoptCurrentAsBaseline();
          setMessage(
            t(
              "入力途中の表と回答を保存しました。実験構造・Graph・統計は未確定のままです。",
              "Saved the in-progress table and answers. Experiment structure, Graph, and Statistics remain unresolved.",
            ),
          );
          return;
        }
        if (!saveProject) return;
        const prepared = createSurvivalState();
        const recommendation: AnalysisRecommendation = {
          templateId: "D11",
          templateVersion: "0.1.0",
          recommendedMethod: "log_rank",
          alternativeMethods: [],
          reasonCode: "explicit_time_to_event_groups",
          explanation: "Follow-up time and censoring are explicit for independent groups.",
          statisticalNDefinition: "Biological units with observed follow-up",
        };
        if (!experimentFirstEntry) {
          const preparedRequest = prepared.request;
          const freshResult =
            preparedRequest &&
            result?.requestId === preparedRequest.requestId &&
            resultInputFingerprint === currentSurvivalInputFingerprint
              ? result
              : null;
          if (!freshResult && statisticsReadiness.status === "ready") {
            throw new Error("先にsurvival解析を実行してください");
          }
          const spec =
            freshResult && preparedRequest
              ? createSurvivalGraphSpec({
                  graphId: "graph.survival.1",
                  dataSource: {
                    kind: "analysis_result",
                    id: freshResult.requestId,
                    revision: freshResult.requestId,
                  },
                  analysisResultId: freshResult.requestId,
                  timeLabel: survivalXAxisLabel,
                  probabilityLabel: survivalYAxisLabel,
                  palette: survivalPalette,
                  fontSize: survivalFontSize,
                  legendFontSize: survivalLegendFontSize,
                  legendPosition: survivalLegendPosition,
                  showMinorTicks: survivalShowMinorTicks,
                  tickDirection: survivalTickDirection,
                })
              : null;
          const survivalState = createInitialProjectState({
            metadata: {
              projectId: currentProject?.state.metadata.projectId ?? "project.survival",
              projectName: graphTitle.trim() || "Survival analysis",
              experimentDate: currentProject?.state.metadata.experimentDate || day(),
              createdAt: currentProject?.state.metadata.createdAt ?? prepared.createdAt,
              updatedAt: prepared.createdAt,
            },
            design: prepared.design,
            rawRevision: {
              id: prepared.rawRevisionId,
              previousRevisionId: null,
              sourceKind: "paste",
              createdAt: prepared.createdAt,
              createdBy: "researcher",
            },
            unitInstances: prepared.units,
            observations: prepared.observations,
            actor: "researcher",
            analysis:
              freshResult && preparedRequest
                ? { recommendation, request: preparedRequest, result: freshResult, graphSpec: spec }
                : undefined,
          });
          const saved = await saveProject(
            survivalState,
            saveAs ? undefined : currentProject?.target,
          );
          if (!saved) {
            setMessage(
              t(
                "保存をキャンセルしました。入力内容はこの画面に残っています。",
                "Saving was canceled. Your entries remain on this screen.",
              ),
            );
            return;
          }
          setCurrentProject(saved);
          lastSaveSucceededRef.current = true;
          adoptCurrentAsBaseline();
          setMessage(t("Survival projectを保存しました。", "Saved the Survival project."));
          return;
        }
        const preparedRequest = prepared.request;
        const freshResult =
          preparedRequest &&
          result?.requestId === preparedRequest.requestId &&
          resultInputFingerprint === currentSurvivalInputFingerprint
            ? result
            : null;
        const spec =
          freshResult && preparedRequest
            ? createSurvivalGraphSpec({
                graphId: `graph.survival.${preparedRequest.requestId}`,
                dataSource: {
                  kind: "analysis_result",
                  id: freshResult.requestId,
                  revision: freshResult.requestId,
                },
                analysisResultId: freshResult.requestId,
                timeLabel: survivalXAxisLabel,
                probabilityLabel: survivalYAxisLabel,
                palette: survivalPalette,
                fontSize: survivalFontSize,
                legendFontSize: survivalLegendFontSize,
                legendPosition: survivalLegendPosition,
                showMinorTicks: survivalShowMinorTicks,
                tickDirection: survivalTickDirection,
              })
            : null;
        const updatedAdaptiveInput = activeAdaptiveInput
          ? updateAdaptiveSurvivalSnapshot(activeAdaptiveInput, text, prepared.createdAt)
          : undefined;
        if (!updatedAdaptiveInput) {
          throw new Error("実験構造を確定してから保存してください");
        }
        let survivalState;
        if (currentProject) {
          if (!currentProject.state.adaptiveInput) {
            throw new Error(
              "この旧形式projectにはadaptive実験構造がありません。元データを保護するため自動上書きせず、移行経路が必要です。",
            );
          }
          const rawChanged = currentProject.state.adaptiveInput.rawLineage?.rawText !== text;
          const nextState = rawChanged
            ? reviseAdaptiveSurvivalProject(
                currentProject.state,
                updatedAdaptiveInput,
                prepared.createdAt,
                "researcher",
              )
            : synchronizeAdaptiveSurvivalProject(
                currentProject.state,
                updatedAdaptiveInput,
                prepared.createdAt,
              );
          survivalState =
            freshResult && preparedRequest
              ? appendSupersedingAnalysisExecution(
                  nextState,
                  {
                    recommendation,
                    request: preparedRequest,
                    result: freshResult,
                    graphSpec: spec,
                  },
                  "researcher",
                )
              : nextState;
        } else {
          survivalState = createInitialProjectState({
            metadata: {
              projectId: "project.survival",
              projectName: graphTitle.trim() || "Survival analysis",
              experimentDate: day(),
              createdAt: prepared.createdAt,
              updatedAt: prepared.createdAt,
            },
            design: prepared.design,
            rawRevision: {
              id: prepared.rawRevisionId,
              previousRevisionId: null,
              sourceKind: "paste",
              createdAt: prepared.createdAt,
              createdBy: "researcher",
            },
            unitInstances: prepared.units,
            observations: prepared.observations,
            actor: "researcher",
            analysis:
              freshResult && preparedRequest
                ? {
                    recommendation,
                    request: preparedRequest,
                    result: freshResult,
                    graphSpec: spec,
                  }
                : undefined,
          });
        }
        const stateToSave = currentProject
          ? ProjectStateSchema.parse({
              ...survivalState,
              metadata: {
                ...survivalState.metadata,
                projectName: graphTitle.trim() || survivalState.metadata.projectName,
              },
            })
          : ProjectStateSchema.parse({
              ...survivalState,
              metadata: {
                ...survivalState.metadata,
                projectName: graphTitle.trim() || survivalState.metadata.projectName,
              },
              adaptiveInput: updatedAdaptiveInput,
            });
        const saved = await saveProject(stateToSave, saveAs ? undefined : currentProject?.target);
        if (!saved) {
          setMessage(
            t(
              "保存をキャンセルしました。入力内容はこの画面に残っています。",
              "Saving was canceled. Your entries remain on this screen.",
            ),
          );
          return;
        }
        setCurrentProject(saved);
        lastSaveSucceededRef.current = true;
        adoptCurrentAsBaseline();
        setMessage(
          freshResult
            ? t(
                "入力・実験構造・解析結果をプロジェクトへ保存しました。",
                "Saved the input, experimental structure, and analysis result to the project.",
              )
            : t(
                "入力と実験構造を保存しました。統計は必要になった時に実行できます。",
                "Saved the input and experimental structure. Statistics can be run when needed.",
              ),
        );
      } else {
        if (!saveUnresolvedVisualizationProject) {
          setMessage(
            t(
              "ブラウザレビューではHeatmap projectを保存できません。デスクトップ版で利用できます。",
              "Heatmap projects cannot be saved in the browser preview. Use the desktop app.",
            ),
          );
          return;
        }
        if (!heatmap || "error" in heatmap) throw new Error("有効なmatrixを入力してください");
        const parsed = parseAdaptiveDelimited(text);
        if (parsed.headers.length < 2 || parsed.rows.length < 1) {
          throw new Error("有効なmatrixを入力してください");
        }
        const createdAt = now();
        const existingState = currentVisualizationProject?.state;
        const tableId = existingState?.table.id ?? heatmapVisualizationId("table");
        const metadata = existingState?.metadata ?? {
          projectId: heatmapVisualizationId("project"),
          projectName: effectiveEntryIntent?.experimentName ?? "Heatmap matrix",
          experimentDate: "" as const,
          operator: "",
          batch: "",
          note: "Heatmap: 実験構造は未確定",
          createdAt,
          updatedAt: createdAt,
        };
        const existingMapping = existingState?.mapping;
        const canRetainMapping =
          existingMapping !== null &&
          existingMapping !== undefined &&
          existingMapping.sourceLabel === heatmapInputSource.label &&
          existingMapping.delimiter === parsed.delimiter &&
          existingMapping.headerRow === parsed.headerRow &&
          existingMapping.columns.length === parsed.headers.length &&
          existingMapping.columns.every(
            (column, index) =>
              column.index === index &&
              column.header === parsed.headers[index] &&
              column.role === "metadata",
          );
        const mapping = canRetainMapping
          ? existingMapping
          : heatmapMappingFor(parsed, heatmapInputSource.label, createdAt);
        const currentSourceKind = heatmapSourceKindFor(heatmapInputSource);
        const sourceUnchanged =
          existingState?.rawLineage.sourceLabel === heatmapInputSource.label &&
          existingState.rawLineage.sourceKind === currentSourceKind;
        const rawTextUnchanged = sourceUnchanged && existingState?.rawLineage.rawText === text;
        const configuredRange =
          rangeMin.trim() && rangeMax.trim()
            ? { min: Number(rangeMin), max: Number(rangeMax) }
            : heatmap.model.range;
        if (
          configuredRange &&
          (!Number.isFinite(configuredRange.min) ||
            !Number.isFinite(configuredRange.max) ||
            configuredRange.min >= configuredRange.max)
        )
          throw new Error("Heatmap rangeは有限値で min < max にしてください");
        const graphId = heatmapVisualizationId("graph");
        const candidateSpec = createHeatmapGraphSpec({
          graphId,
          dataSource: {
            kind: "visualization_table",
            id: tableId,
            revision: existingState?.activeDataRevisionId ?? createdAt,
          },
          transform,
          range: configuredRange,
          palette: heatmapPalette,
          missingColor,
          showCellValues,
        });
        const table = {
          id: tableId,
          headers: [...parsed.headers],
          rows: parsed.rows.map((row) => [...row]),
          delimiter: parsed.delimiter,
          headerRow: parsed.headerRow,
        };
        const tableUnchanged =
          existingState !== undefined &&
          existingState.table.id === table.id &&
          existingState.table.delimiter === table.delimiter &&
          existingState.table.headerRow === table.headerRow &&
          existingState.table.headers.length === table.headers.length &&
          existingState.table.headers.every((header, index) => header === table.headers[index]) &&
          sameHeatmapRows(existingState.table.rows, table.rows);
        const activeGraph = existingState?.graphSpecs.find(
          ({ id }) => id === existingState.activeGraphId,
        );
        const unchangedState =
          rawTextUnchanged &&
          tableUnchanged &&
          canRetainMapping &&
          sameHeatmapConfiguration(activeGraph, candidateSpec)
            ? existingState
            : undefined;
        const rawLineage = {
          sourceKind: currentSourceKind,
          sourceLabel: heatmapInputSource.label,
          importedAt:
            sourceUnchanged && existingState ? existingState.rawLineage.importedAt : createdAt,
          rawText: text,
          sha256: rawTextUnchanged ? (existingState?.rawLineage.sha256 ?? null) : null,
          transformations: rawTextUnchanged
            ? [...existingState!.rawLineage.transformations]
            : [
                ...(existingState?.rawLineage.transformations ?? []),
                "visualization_table_or_source_updated",
                "heatmap_visualization_mapping",
              ].filter((value, index, values) => values.indexOf(value) === index),
        };
        const base: UnresolvedVisualizationProjectState = existingState
          ? appendUnresolvedVisualizationDataRevision(existingState, {
              table,
              rawLineage,
              mapping,
              actor: "researcher",
              createdAt,
            })
          : createUnresolvedVisualizationProjectState({
              metadata: { ...metadata, updatedAt: createdAt },
              entryIntent: "matrix_visualization",
              table,
              rawLineage: {
                ...rawLineage,
                transformations: ["delimiter_detection", "heatmap_visualization_mapping"],
              },
              mapping,
              actor: "researcher",
            });
        const spec = createHeatmapGraphSpec({
          graphId,
          dataSource: {
            kind: "visualization_table",
            id: tableId,
            revision: base.activeDataRevisionId,
          },
          transform,
          range: configuredRange,
          palette: heatmapPalette,
          missingColor,
          showCellValues,
        });
        const stateToSave =
          unchangedState ??
          appendUnresolvedVisualizationGraph(base, {
            spec,
            createdAt,
            actor: "researcher",
          });
        const saved = await saveUnresolvedVisualizationProject(
          stateToSave,
          saveAs ? undefined : currentVisualizationProject?.target,
        );
        if (!saved) {
          setMessage(
            t(
              "保存をキャンセルしました。入力内容はこの画面に残っています。",
              "Saving was canceled. Your entries remain on this screen.",
            ),
          );
          return;
        }
        setCurrentVisualizationProject(saved);
        lastSaveSucceededRef.current = true;
        adoptCurrentAsBaseline();
        setMessage(
          t(
            "Heatmap projectを保存しました。行列とGraph設定を保持しています。",
            "Saved the Heatmap project with its matrix and Graph settings.",
          ),
        );
        recordUsageMilestone(routeFromPath(window.location.pathname), "project_saved");
      }
    } catch (error) {
      setMessage(
        locale === "ja" && error instanceof Error
          ? error.message
          : t(
              "保存できませんでした",
              "The project could not be saved. Your current entries were retained.",
            ),
      );
    }
  };
  const saveRef = useRef(save);
  useLayoutEffect(() => {
    saveRef.current = save;
  }, [save]);
  useEffect(() => {
    if (!onRegisterSaveHandler) return;
    onRegisterSaveHandler({
      save: async (saveAs) => {
        await saveRef.current(Boolean(saveAs));
        return lastSaveSucceededRef.current;
      },
      checkpoint: () => {
        if (currentProject) return { kind: "experiment" as const, project: currentProject };
        if (currentVisualizationProject) {
          return {
            kind: "unresolved_visualization" as const,
            project: currentVisualizationProject,
          };
        }
        if (currentSpecializedEntryDraft) {
          return {
            kind: "specialized_entry_draft" as const,
            project: currentSpecializedEntryDraft,
          };
        }
        return null;
      },
    });
    return () => onRegisterSaveHandler(null);
  }, [
    currentProject,
    currentSpecializedEntryDraft,
    currentVisualizationProject,
    onRegisterSaveHandler,
  ]);
  const requestBack = () => {
    if (onRequestExit) {
      onRequestExit({ actionLabel: t("前の画面に戻る", "Go back"), proceed: onBack });
      return;
    }
    onBack();
  };
  const requestAnalysisRouteChange = (nextRoute: AppRoute) => {
    if (analysisRouteSwitcherAccess !== "development_audit" || !onNavigate) return;
    const proceed = () => {
      adoptCurrentAsBaseline();
      onNavigate(nextRoute);
    };
    if (onRequestExit) {
      onRequestExit({
        actionLabel: t("別の専門解析へ切り替える", "Switch to another specialist analysis"),
        proceed,
      });
      return;
    }
    proceed();
  };
  const persistedAnalysisForResult = result
    ? [...(currentProject?.state.analysisRuns ?? [])]
        .reverse()
        .find(
          (run) =>
            run.state === "current" &&
            run.result.requestId === result.requestId &&
            run.request.templateId === "D11",
        )
    : undefined;
  const methods =
    mode === "survival" &&
    result &&
    survival &&
    !("error" in survival) &&
    statisticsReadiness.status === "ready"
      ? (() => {
          const prepared = createSurvivalState();
          const recommendation: AnalysisRecommendation =
            persistedAnalysisForResult?.recommendation ?? {
              templateId: "D11",
              templateVersion: "0.1.0",
              recommendedMethod: "log_rank",
              alternativeMethods: [],
              reasonCode: "explicit_time_to_event_groups",
              explanation: "Explicit survival data",
              statisticalNDefinition: "Biological units",
            };
          const request = persistedAnalysisForResult?.request ?? prepared.request;
          if (!request) return null;
          const design =
            currentProject?.state.designRevisions.find(
              ({ id }) => id === persistedAnalysisForResult?.inputDesignRevisionId,
            )?.design ?? prepared.design;
          return generateMethodsText({
            design,
            recommendation,
            request,
            result,
            outcomeId: design.outcomes[0]!.id,
          });
        })()
      : null;
  const logRankDisplay = formattedLogRankResult(
    result,
    survival && !("error" in survival) ? survival.conditions.map(({ label }) => label) : [],
  );
  const configuredMin =
    rangeMin.trim() && Number.isFinite(Number(rangeMin)) ? Number(rangeMin) : undefined;
  const configuredMax =
    rangeMax.trim() && Number.isFinite(Number(rangeMax)) ? Number(rangeMax) : undefined;
  const benchmarkAnalysisState = JSON.stringify({
    mode,
    text,
    result,
  });
  const captureDefaultBenchmarkGraph = async () => {
    const svg = svgRef.current;
    if (!svg || !result || !benchmarkRun.identity || benchmarkRun.defaultGraphCapture) return;
    const capturedAt = new Date().toISOString();
    if (!beginDefaultGraphCapture(capturedAt)) return;
    try {
      const svgText = serializeGraphSvg(svg);
      const viewBox = svg.viewBox.baseVal;
      const png = await svgToPngBlob(
        svgText,
        viewBox.width || svg.width.baseVal.value || 900,
        viewBox.height || svg.height.baseVal.value || 520,
      );
      const [svgSha256, pngSha256, analysisStateFingerprint] = await Promise.all([
        sha256Hex(svgText),
        sha256Hex(png),
        sha256Hex(benchmarkAnalysisState),
      ]);
      await writeBenchmarkArtifacts([
        { name: "default_graph.svg", content: svgText, mediaType: "image/svg+xml" },
        {
          name: "default_graph.png",
          content: await blobToBase64(png),
          encoding: "base64",
          mediaType: "image/png",
        },
      ]);
      completeDefaultGraphCapture({
        graphStateFingerprint: svgSha256,
        analysisStateFingerprint,
        svgSha256,
        pngSha256,
      });
      setMessage("Benchmarkの既定Survival Graphを保存しました。");
    } catch {
      setBenchmarkOutcome("infrastructure_failure");
      setMessage("既定Graphの評価artifactを保存できませんでした。");
    }
  };

  useLayoutEffect(() => {
    if (
      import.meta.env.DEV &&
      mode === "survival" &&
      result &&
      benchmarkRun.identity &&
      !benchmarkRun.defaultGraphCapture
    ) {
      void captureDefaultBenchmarkGraph();
    }
  }, [
    benchmarkAnalysisState,
    benchmarkRun.defaultGraphCapture,
    benchmarkRun.identity,
    mode,
    result,
  ]);

  const finalizeSpecializedBenchmark = async () => {
    const svg = svgRef.current;
    const run = currentBenchmarkRun();
    if (
      mode !== "survival" ||
      !svg ||
      !result ||
      !methods ||
      !run.identity ||
      !run.supportStatus ||
      !run.defaultGraphCaptured
    ) {
      setMessage(
        "完了前にdata load、解析、Default Graph保存、Scientific support選択を完了してください。",
      );
      return;
    }
    try {
      const prepared = createSurvivalState();
      const preparedRequest = prepared.request;
      if (!preparedRequest) {
        setMessage("このデータではBenchmark用のSurvival Statisticsを実行できません。");
        return;
      }
      const svgText = serializeGraphSvg(svg);
      const viewBox = svg.viewBox.baseVal;
      const png = await svgToPngBlob(
        svgText,
        viewBox.width || svg.width.baseVal.value || 900,
        viewBox.height || svg.height.baseVal.value || 520,
      );
      const capturedAt = new Date().toISOString();
      const [svgSha256, pngSha256, analysisStateFingerprint] = await Promise.all([
        sha256Hex(svgText),
        sha256Hex(png),
        sha256Hex(benchmarkAnalysisState),
      ]);
      recordFinalGraphCapture({
        capturedAt,
        graphStateFingerprint: svgSha256,
        analysisStateFingerprint,
        svgSha256,
        pngSha256,
      });
      setBenchmarkOutcome("completed");
      recordBenchmarkEvent("benchmark_run_finalized", {
        selectedGraph: "kaplan_meier",
        selectedStatistics: preparedRequest.method,
      });
      const finalRun = currentBenchmarkRun();
      const graphState = {
        graphType: "kaplan_meier",
        conditions: survival && !("error" in survival) ? survival.conditions : [],
        censoringPreserved: true,
        analysis: { request: preparedRequest, result },
      };
      await writeBenchmarkArtifacts(
        [
          {
            name: "run.json",
            content: JSON.stringify(
              {
                ...finalRun.identity,
                appVersion: PRODUCT_IDENTITY.version,
                sourceRevision: evaluationMode.sourceRevision,
                engineVersion: result.engine.version,
                startedAt: finalRun.startedAt,
                completedAt: capturedAt,
                outcome: finalRun.outcome,
                supportStatus: finalRun.supportStatus,
                artifactCompleteness: "complete",
                defaultGraphCaptured: finalRun.defaultGraphCaptured,
                captureProvenanceVersion: "1.1.0",
                defaultCapturedAt: finalRun.defaultGraphCapture?.capturedAt ?? null,
                defaultCapturedEventIndex: finalRun.defaultGraphCapture?.eventIndex ?? null,
                finalCapturedAt: finalRun.finalGraphCapture?.capturedAt ?? null,
                finalCapturedEventIndex: finalRun.finalGraphCapture?.eventIndex ?? null,
                defaultGraphStateFingerprint:
                  finalRun.defaultGraphCapture?.graphStateFingerprint ?? null,
                finalGraphStateFingerprint:
                  finalRun.finalGraphCapture?.graphStateFingerprint ?? null,
                defaultAnalysisStateFingerprint:
                  finalRun.defaultGraphCapture?.analysisStateFingerprint ?? null,
                finalAnalysisStateFingerprint:
                  finalRun.finalGraphCapture?.analysisStateFingerprint ?? null,
                defaultSvgSha256: finalRun.defaultGraphCapture?.svgSha256 ?? null,
                defaultPngSha256: finalRun.defaultGraphCapture?.pngSha256 ?? null,
                finalSvgSha256: finalRun.finalGraphCapture?.svgSha256 ?? null,
                finalPngSha256: finalRun.finalGraphCapture?.pngSha256 ?? null,
                interactionCount: finalRun.events.length,
                graphEditCount: 0,
                renderedGraphEditCount: 0,
                analysisEditCount: finalRun.events.filter(
                  ({ effect }) => effect === "analysis_only" || effect === "both",
                ).length,
              },
              null,
              2,
            ),
          },
          { name: "final_graph.svg", content: svgText, mediaType: "image/svg+xml" },
          {
            name: "final_graph.png",
            content: await blobToBase64(png),
            encoding: "base64",
            mediaType: "image/png",
          },
          {
            name: "statistics.json",
            content: JSON.stringify(
              {
                statisticalUnit: "biological unit",
                recommendedMethod: "log_rank",
                selectedMethod: preparedRequest.method,
                correction: preparedRequest.options.multiplicityMethod,
                request: preparedRequest,
                result,
                state: "current",
                applicationVersion: PRODUCT_IDENTITY.version,
              },
              null,
              2,
            ),
          },
          { name: "methods.txt", content: methods },
          { name: "graph_state.json", content: JSON.stringify(graphState, null, 2) },
          {
            name: "interaction_log.json",
            content: JSON.stringify(finalRun.events, null, 2),
          },
        ],
        { requiredArtifacts: COMPLETE_BENCHMARK_ARTIFACT_NAMES },
      );
      setMessage("Survival benchmark runの9 artifactsを保存しました。");
    } catch {
      setBenchmarkOutcome("infrastructure_failure");
      setMessage("Survival benchmark artifactを保存できませんでした。");
    }
  };
  const numericStatusMappingRequired =
    experimentFirstEntry &&
    mode === "survival" &&
    ((survival && "error" in survival && /numeric mapping/iu.test(survival.internalError ?? "")) ||
      numericStatusMapping !== null);
  const survivalStatisticsSetupBlockedReason =
    directTimeToEventEntry?.status === "safe_unsupported"
      ? t(
          "このevent経過は現在の専用入口では解析できません。",
          "This event process is not supported by the current dedicated workflow.",
        )
      : !survivalTableHasRows
        ? t(
            "あと1項目：対象ID・群・観察期間・Statusを入力してください。",
            "Enter subject ID, group, follow-up time, and status to continue.",
          )
        : numericStatusMappingRequired && numericStatusMapping === null
          ? t(
              "あと1項目：Status列の0/1の意味を選んでください。",
              "Confirm whether 0 or 1 means Event in the Status column.",
            )
          : !survival || "error" in survival
            ? t(
                "入力表のエラーを修正すると、統計解析を設定できます。",
                "Correct the data-table error to configure the statistical analysis.",
              )
            : null;
  const timeToEventUnitPanel =
    experimentFirstEntry &&
    mode === "survival" &&
    !persistedAdaptiveInput &&
    subjectUnitRelationshipWasInferred &&
    !editingInferredSubjectUnitRelationship ? (
      <section className="callout-info" aria-label="time-to-eventの実験単位">
        <strong>表の1行を独立した1例として扱います</strong>
        <p>
          {effectiveEntryIntent?.sourceContext === "animal"
            ? "1匹の動物につき1行を入力します。"
            : `${effectiveEntryIntent?.subjectUnitLabel ?? "対象"} 1つにつき1行を入力します。`}
          Statisticsではこの単位をnとして扱います。
        </p>
        <button type="button" onClick={() => setEditingInferredSubjectUnitRelationship(true)}>
          この扱いを変更
        </button>
      </section>
    ) : experimentFirstEntry &&
      mode === "survival" &&
      !persistedAdaptiveInput &&
      (!subjectUnitRelationshipWasInferred || editingInferredSubjectUnitRelationship) ? (
      <section className="callout-info" aria-label="time-to-eventの実験単位">
        <strong>
          {animalTimeToEventEntry
            ? "統計で1匹ずつnとして扱えるか確認します"
            : "統計で独立したnとして扱える単位を確認します"}
        </strong>
        <label>
          {animalTimeToEventEntry
            ? "群分けと個体間のまとまりはどれですか？"
            : "この表の1行は実験上どの位置ですか？"}
          <select
            aria-label="time-to-eventの1行と独立した実験例の関係"
            value={subjectUnitRelationship}
            onChange={(event) => {
              setSubjectUnitRelationship(event.target.value as SubjectUnitRelationship);
              setResult(null);
              setResultInputFingerprint(null);
              setMessage(null);
            }}
          >
            <option value="unknown">まだ判断できない</option>
            <option value="subject_is_experimental_unit">
              {animalTimeToEventEntry
                ? "1匹ごとに群を割り当て、同腹・ケージなどのまとまりはない"
                : "各行は別の1例で、donor・batch・施設などを共有するまとまりはない"}
            </option>
            <option value="nested_in_parent">
              {animalTimeToEventEntry
                ? "ケージごとに群を割り当てた、または同腹・由来を共有するまとまりがある"
                : "複数行が同じ親試料に属する、またはdonor・batch・施設などを共有する"}
            </option>
          </select>
        </label>
        {subjectUnitRelationship === "subject_is_experimental_unit" ? (
          <p>
            {animalTimeToEventEntry
              ? "1匹を独立した1例として扱います。"
              : `${effectiveEntryIntent?.subjectUnitLabel ?? "対象"} 1つを独立した1例として扱います。`}
          </p>
        ) : subjectUnitRelationship === "nested_in_parent" ? (
          <p role="status">
            {animalTimeToEventEntry
              ? "1匹ずつを独立したnとは確定しません。Graphと入力値は保持し、ケージ・同腹・由来などのIDを含む構造が必要です。"
              : "各行を独立したnとは確定しません。Graphは保持し、親試料・donor・batch・施設などのIDを含む入力へ進む必要があります。"}
          </p>
        ) : (
          <p role="status">
            Graphは表示できます。独立したnを推測しないため、統計と構造付き保存はここで待機します。
          </p>
        )}
      </section>
    ) : null;
  const survivalStatisticsContent = (
    <div id="survival-statistics" className="graph-workspace-frame__settings">
      <h3>{t("統計", "Statistics")}</h3>
      <p>
        {t(
          "Graphを確認したあと、必要な場合だけ推論解析を実行します。",
          "Review the Graph first, then run inferential analysis only when needed.",
        )}
      </p>
      {survival && !("error" in survival) && statisticsReadiness.status !== "ready" ? (
        <p className="specialized-engine-note" role="status">
          {statisticsReadiness.researcherMessage}
        </p>
      ) : null}
      {experimentFirstEntry && !statisticsSetupExpanded ? (
        <>
          <button
            type="button"
            disabled={Boolean(survivalStatisticsSetupBlockedReason)}
            aria-describedby={
              survivalStatisticsSetupBlockedReason
                ? "survival-statistics-setup-disabled-reason"
                : undefined
            }
            onClick={() => setStatisticsSetupExpanded(true)}
          >
            {t("統計解析を設定", "Set up statistical analysis")}
          </button>
          {survivalStatisticsSetupBlockedReason ? (
            <small
              id="survival-statistics-setup-disabled-reason"
              className="specialized-engine-note"
              role="status"
            >
              {survivalStatisticsSetupBlockedReason}
            </small>
          ) : null}
        </>
      ) : (
        <>
          {timeToEventUnitPanel}
          <button
            className="analysis-run-button"
            type="button"
            disabled={
              !analysisAvailable ||
              statisticsReadiness.status !== "ready" ||
              (experimentFirstEntry && !activeAdaptiveInput)
            }
            onClick={() => void runSurvival()}
          >
            Kaplan–Meier + log-rankを実行
          </button>
          {!analysisAvailable ? (
            <p className="specialized-engine-note" role="note">
              {t(
                "このブラウザレビューでは解析エンジンを実行できません。デスクトップ版では利用できます。",
                "The analysis engine is unavailable in this browser preview. It is available in the desktop app.",
              )}
            </p>
          ) : null}
          {logRankDisplay ? (
            <>
              <p>{logRankDisplay}</p>
              <label className="specialized-statistics-annotation-toggle">
                <input
                  type="checkbox"
                  checked={showLogRankAnnotation}
                  onChange={(event) => {
                    setShowLogRankAnnotation(event.target.checked);
                    recordUsageGraphEdit(
                      routeFromPath(window.location.pathname),
                      "statistics_annotation",
                    );
                  }}
                />
                <span>
                  {t(
                    "この保存済みlog-rank結果をGraphに表示",
                    "Show this saved log-rank result on the Graph",
                  )}
                </span>
              </label>
              <p className="specialized-engine-note">
                {t(
                  "表示だけを切り替えます。解析結果は再計算しません。",
                  "This changes only the display. The analysis result is not recalculated.",
                )}
              </p>
            </>
          ) : (
            <p>
              {t(
                "解析を実行すると、event/censoringを保持した結果をここに表示します。",
                "After analysis, results that preserve event and censoring status appear here.",
              )}
            </p>
          )}
        </>
      )}
    </div>
  );
  const survivalGraphSettings = (
    <div className="graph-workspace-frame__settings">
      <h3>{t("Graph設定", "Graph settings")}</h3>
      <label>
        <span>{t("Graphタイトル", "Graph title")}</span>
        <input
          aria-label="Survival Graph title"
          value={graphTitle}
          onChange={(event) => setGraphTitle(event.target.value)}
        />
      </label>
      <label>
        <span>{t("X軸タイトル", "X-axis title")}</span>
        <input
          aria-label="Survival X axis title"
          value={survivalXAxisLabel}
          onChange={(event) => {
            setSurvivalXAxisLabel(event.target.value);
            recordUsageGraphEdit(routeFromPath(window.location.pathname), "axes");
          }}
        />
      </label>
      <label>
        <span>{t("Y軸タイトル", "Y-axis title")}</span>
        <input
          aria-label="Survival Y axis title"
          value={survivalYAxisLabel}
          onChange={(event) => {
            setSurvivalYAxisLabel(event.target.value);
            recordUsageGraphEdit(routeFromPath(window.location.pathname), "axes");
          }}
        />
      </label>
      {survival && !("error" in survival) ? (
        <fieldset>
          <legend>{t("凡例と曲線の色", "Legend and curve colors")}</legend>
          {survival.conditions.map((condition, index) => (
            <ExperimentGraphColorControl
              key={condition.id}
              label={condition.label}
              ariaLabel={t(
                `${condition.label}のSurvival曲線色`,
                `${condition.label} survival curve color`,
              )}
              value={
                survivalPalette[index] ??
                DEFAULT_SURVIVAL_COLORS[index % DEFAULT_SURVIVAL_COLORS.length]
              }
              onChange={(value) => {
                setSurvivalPalette((current) => {
                  const next = [...current];
                  next[index] = value;
                  return next;
                });
                recordUsageGraphEdit(routeFromPath(window.location.pathname), "appearance_layout");
              }}
            />
          ))}
          <small>
            {t(
              "凡例はGroup名、色、各群のnを曲線と同期して表示します。",
              "The legend keeps each group name, color, and n synchronized with its curve.",
            )}
          </small>
        </fieldset>
      ) : null}
      <label>
        <span>{t("凡例の位置", "Legend position")}</span>
        <select
          aria-label="Survival legend position"
          value={survivalLegendPosition}
          onChange={(event) => {
            setSurvivalLegendPosition(event.target.value as "hidden" | "top" | "right" | "inside");
            recordUsageGraphEdit(routeFromPath(window.location.pathname), "appearance_layout");
          }}
        >
          <option value="hidden">{t("なし", "None")}</option>
          <option value="top">{t("上", "Top")}</option>
          <option value="right">{t("右", "Right")}</option>
          <option value="inside">{t("内側", "Inside")}</option>
        </select>
      </label>
      <ExperimentGraphRangeControl
        label={t("凡例の文字サイズ", "Legend font size")}
        ariaLabel="Survival legend font size"
        value={survivalLegendFontSize}
        min={9}
        max={24}
        step={1}
        suffix="px"
        onChange={(value) => {
          setSurvivalLegendFontSize(value);
          recordUsageGraphEdit(routeFromPath(window.location.pathname), "appearance_layout");
        }}
      />
      <ExperimentGraphVisibilityControl
        label={t("補助目盛を表示", "Show minor ticks")}
        ariaLabel="Survival show minor ticks"
        checked={survivalShowMinorTicks}
        onChange={(checked) => {
          setSurvivalShowMinorTicks(checked);
          recordUsageGraphEdit(routeFromPath(window.location.pathname), "axes");
        }}
      />
      <label>
        <span>{t("軸目盛の向き", "Tick direction")}</span>
        <select
          aria-label="Survival tick direction"
          value={survivalTickDirection}
          onChange={(event) => {
            setSurvivalTickDirection(event.target.value as "inside" | "outside");
            recordUsageGraphEdit(routeFromPath(window.location.pathname), "axes");
          }}
        >
          <option value="outside">{t("グラフの外側", "Outside the graph")}</option>
          <option value="inside">{t("グラフの内側", "Inside the graph")}</option>
        </select>
      </label>
      <ExperimentGraphRangeControl
        label={t("Graphの文字サイズ", "Graph font size")}
        ariaLabel="Survival font size"
        value={survivalFontSize}
        min={9}
        max={24}
        step={1}
        suffix="px"
        onChange={(value) => {
          setSurvivalFontSize(value);
          recordUsageGraphEdit(routeFromPath(window.location.pathname), "appearance_layout");
        }}
      />
      <p className="specialized-engine-note">
        {t(
          "Graphの見た目を変更しても、Kaplan–Meier推定やlog-rank検定は再計算しません。",
          "Changing Graph appearance does not recalculate the Kaplan–Meier estimate or log-rank test.",
        )}
      </p>
      {experimentFirstEntry && !statisticsSetupExpanded ? (
        <>
          <button
            type="button"
            disabled={Boolean(survivalStatisticsSetupBlockedReason)}
            aria-describedby={
              survivalStatisticsSetupBlockedReason
                ? "survival-graph-setup-disabled-reason"
                : undefined
            }
            onClick={() => {
              setStatisticsSetupExpanded(true);
              setSurvivalWorkspaceTab("statistics");
            }}
          >
            {t("統計解析を設定", "Set up statistical analysis")}
          </button>
          {survivalStatisticsSetupBlockedReason ? (
            <small
              id="survival-graph-setup-disabled-reason"
              className="specialized-engine-note"
              role="status"
            >
              {survivalStatisticsSetupBlockedReason}
            </small>
          ) : null}
        </>
      ) : null}
    </div>
  );
  const heatmapGraphSettings = (
    <div className="graph-workspace-frame__settings">
      <h3>{t("Graph設定", "Graph settings")}</h3>
      <label>
        {t("値の変換", "Value transform")}
        <select
          aria-label="Heatmap transform"
          value={transform}
          onChange={(event) => {
            setTransform(event.target.value as HeatmapTransform);
            recordUsageGraphEdit(routeFromPath(window.location.pathname), "appearance_layout");
          }}
        >
          <option value="none">{t("変換しない", "No transform")}</option>
          <option value="row_z_score">{t("行ごとにz-score", "Z-score by row")}</option>
          <option value="column_z_score">{t("列ごとにz-score", "Z-score by column")}</option>
          <option value="log10">Log10</option>
        </select>
      </label>
      <label>
        {t("色の下限", "Color minimum")}
        <input
          aria-label="Heatmap color minimum"
          type="number"
          value={rangeMin}
          onChange={(event) => {
            setRangeMin(event.target.value);
            recordUsageGraphEdit(routeFromPath(window.location.pathname), "axes");
          }}
        />
      </label>
      <label>
        {t("色の上限", "Color maximum")}
        <input
          aria-label="Heatmap color maximum"
          type="number"
          value={rangeMax}
          onChange={(event) => {
            setRangeMax(event.target.value);
            recordUsageGraphEdit(routeFromPath(window.location.pathname), "axes");
          }}
        />
      </label>
      <ExperimentGraphColorControl
        label={t("欠損値の色", "Missing-value color")}
        ariaLabel="Heatmap missing color"
        value={missingColor}
        onChange={(value) => {
          setMissingColor(value);
          recordUsageGraphEdit(routeFromPath(window.location.pathname), "appearance_layout");
        }}
      />
      <ExperimentGraphVisibilityControl
        label={t("各セルの値を表示", "Show each cell value")}
        checked={showCellValues}
        onChange={(checked) => {
          setShowCellValues(checked);
          recordUsageGraphEdit(routeFromPath(window.location.pathname), "appearance_layout");
        }}
      />
      <p className="specialized-engine-note">
        {t(
          "Heatmapは入力行列を可視化します。列を自動的に生物学的な独立例とはみなしません。",
          "The Heatmap visualizes the entered matrix. Columns are not automatically treated as biologically independent observations.",
        )}
      </p>
    </div>
  );
  return (
    <div className="page-stack specialized-analysis-page" {...interactionCaptureProps}>
      <button className="back-link" type="button" onClick={requestBack}>
        ← {t("戻る", "Back")}
      </button>
      {experimentFirstEntry ? null : (
        <AnalysisRouteSwitcher
          access={analysisRouteSwitcherAccess}
          current={mode}
          onNavigate={requestAnalysisRouteChange}
        />
      )}
      {mode === "survival" ? (
        <nav
          aria-label={t("プロジェクトワークスペース", "Project workspace")}
          className="workspace-mode-tabs"
        >
          <button
            type="button"
            disabled={!onOpenProject}
            title={
              !onOpenProject
                ? t(
                    "プロジェクトを開く機能はデスクトップ版で利用できます",
                    "Opening projects is available in the desktop app",
                  )
                : undefined
            }
            onClick={onOpenProject}
          >
            {t("開く", "Open")}
          </button>
          <button
            type="button"
            aria-pressed={survivalWorkspaceTab === "data"}
            onClick={() => setSurvivalWorkspaceTab("data")}
          >
            {t("データ", "Data")}
          </button>
          <button
            type="button"
            aria-pressed={survivalWorkspaceTab === "graph"}
            onClick={() => {
              setSurvivalWorkspaceTab("graph");
            }}
          >
            {t("グラフ", "Graph")}
          </button>
          <button
            type="button"
            aria-pressed={survivalWorkspaceTab === "statistics"}
            onClick={() => {
              setSurvivalWorkspaceTab("statistics");
              setStatisticsSetupExpanded(true);
            }}
          >
            {t("統計", "Statistics")}
          </button>
          <button
            type="button"
            disabled={
              experimentFirstEntry && !activeAdaptiveInput
                ? !saveSpecializedEntryDraftProject
                : !saveProject
            }
            title={
              experimentFirstEntry && !activeAdaptiveInput && !saveSpecializedEntryDraftProject
                ? t(
                    "入力途中のプロジェクト保存はデスクトップ版で利用できます",
                    "Saving an in-progress project is available in the desktop app",
                  )
                : !saveProject
                  ? t(
                      "プロジェクトの保存はデスクトップ版で利用できます",
                      "Project saving is available in the desktop app",
                    )
                  : experimentFirstEntry && !activeAdaptiveInput
                    ? t(
                        "未確定の回答と入力表を、入力途中のプロジェクトとして保存します",
                        "Save the unresolved answers and data table as an in-progress project",
                      )
                    : undefined
            }
            onClick={() => void save()}
          >
            {t("保存", "Save")}
          </button>
          {currentProject ? (
            <button type="button" disabled={!saveProject} onClick={() => void save(true)}>
              {t("別名で保存", "Save As")}
            </button>
          ) : null}
        </nav>
      ) : null}
      {mode === "heatmap" ? (
        <nav
          aria-label={t("プロジェクトワークスペース", "Project workspace")}
          className="workspace-mode-tabs"
        >
          <button
            type="button"
            disabled={!onOpenProject && !openUnresolvedVisualizationProject}
            title={
              !onOpenProject && !openUnresolvedVisualizationProject
                ? t(
                    "プロジェクトを開く機能はデスクトップ版で利用できます",
                    "Opening projects is available in the desktop app",
                  )
                : undefined
            }
            onClick={() => {
              if (onOpenProject) onOpenProject();
              else requestOpenHeatmapProject();
            }}
          >
            {t("開く", "Open")}
          </button>
          <a href="#heatmap-data">{t("データ", "Data")}</a>
          <a href="#heatmap-graph">{t("グラフ", "Graph")}</a>
          <button
            type="button"
            disabled
            title={t(
              "この行列だけから生物学的な独立例を推測しないため、統計は未確定です",
              "Statistics remain unresolved because biological independence is not inferred from this matrix alone",
            )}
          >
            {t("統計", "Statistics")}
          </button>
          <button
            type="button"
            disabled={
              !saveUnresolvedVisualizationProject ||
              !heatmapTableHasRows ||
              !heatmap ||
              "error" in heatmap
            }
            title={
              !saveUnresolvedVisualizationProject
                ? t(
                    "プロジェクトの保存はデスクトップ版で利用できます",
                    "Project saving is available in the desktop app",
                  )
                : !heatmapTableHasRows || !heatmap || "error" in heatmap
                  ? t("数値行列を入力すると保存できます", "Enter a numeric matrix to enable saving")
                  : undefined
            }
            onClick={() => void save()}
          >
            {t("保存", "Save")}
          </button>
          {currentVisualizationProject ? (
            <button
              type="button"
              disabled={!saveUnresolvedVisualizationProject}
              onClick={() => void save(true)}
            >
              {t("別名で保存", "Save As")}
            </button>
          ) : null}
        </nav>
      ) : null}
      <section
        id={mode === "heatmap" ? "heatmap-data" : undefined}
        inert={mode === "survival" && survivalWorkspaceTab !== "data" ? true : undefined}
        className={`workspace-panel specialized-workspace-panel${
          mode === "survival" && survivalWorkspaceTab !== "data"
            ? " workspace-tab-panel--inactive"
            : ""
        }`}
      >
        <p className="overline">
          {effectiveEntryIntent?.moduleId === "matrix_visualization"
            ? t("行列からGraph", "Graph from a matrix")
            : experimentFirstEntry
              ? t("実験から入力", "Experiment-first entry")
              : t("専門解析", "Specialized analysis")}
        </p>
        <h1>
          {mode === "survival"
            ? effectiveEntryIntent?.experimentName ||
              persistedAdaptiveInput?.contract.experimentName ||
              t("生存時間", "Survival")
            : t("ヒートマップ", "Heatmap")}
        </h1>
        <p>
          {mode === "survival"
            ? t(
                "対象ごとの生存時間（time-to-event）を、対象ID・群・観察期間・状態（event／打ち切り）として入力します。打ち切りは欠測に変換しません。",
                "Enter one time-to-event record per subject with subject ID, group, follow-up time, and status (event or censored). Censoring is not converted to missingness.",
              )
            : t(
                "1列目をfeature名、1行目をsample名として表を貼り付けます。空欄とNAは欠損のまま保持します。",
                "Paste a table with feature names in the first column and sample names in the first row. Blank and NA cells remain missing.",
              )}
        </p>
        {mode === "survival" && directTimeToEventEntry?.status === "safe_unsupported" ? (
          <section className="callout-warning" role="alert">
            <strong>このevent経過は現在の専用入口では構造化できません</strong>
            <p>
              この入口が扱うのは、各対象につき1回のeventまたは観察終了を記録する形式です。
              入力した表はこの画面に保持し、別のsupported designへ自動変換しません。
            </p>
          </section>
        ) : null}
        {import.meta.env.DEV && mode === "survival" && literatureCase ? (
          <section className="benchmark-pilot-loader" aria-label="Literature Survival合成値">
            <div>
              <strong>{literatureCase.caseId}</strong>
              <span>
                event/censoringとfollow-up timeをstable unit IDのままSurvival表へ入力します。
              </span>
            </div>
            <button type="button" onClick={loadLiteratureSurvival}>
              このLiterature caseをSurvival表へ入力
            </button>
          </section>
        ) : null}
        <section id={mode === "survival" ? "survival-data" : undefined}>
          <h2>{t("データ", "Data")}</h2>
          <DelimitedTextSpreadsheet
            ariaLabel={
              mode === "survival"
                ? t("生存時間データ表", "Survival data table")
                : t("ヒートマップデータ表", "Heatmap data table")
            }
            caption={
              mode === "survival"
                ? t("対象ごとの生存時間データ", "Time-to-event data by subject")
                : t("ヒートマップ行列", "Heatmap matrix")
            }
            minimumColumns={mode === "survival" ? 4 : 3}
            columnOptions={mode === "survival" ? { 3: ["Event", "Censored", "1", "0"] } : undefined}
            value={text}
            onChange={(nextText, source) => {
              setText(nextText);
              if (mode === "survival") {
                setTimeToEventInputSource({
                  kind: source === "workbook_import" ? "generic_file" : "clipboard",
                  label:
                    source === "clipboard"
                      ? "time-to-event-spreadsheet-paste"
                      : source === "workbook_import"
                        ? "time-to-event-excel-workbook"
                        : "time-to-event-spreadsheet-edit",
                });
                setNumericStatusMapping(null);
              } else {
                setHeatmapInputSource({
                  kind: source === "workbook_import" ? "generic_file" : "clipboard",
                  label:
                    source === "clipboard"
                      ? "heatmap-spreadsheet-paste"
                      : source === "workbook_import"
                        ? "heatmap-excel-workbook"
                        : "heatmap-spreadsheet-edit",
                });
              }
              setResult(null);
              setResultInputFingerprint(null);
            }}
          />
          {mode === "survival" ? (
            <p className="specialized-data-entry-hint">
              {t(
                "Statusは Event / Censored で入力します。日本語の「死亡・イベント発生」「打ち切り・観察終了」も使えます。0/1の場合は、下でどちらがEventか確認します。",
                "Enter Status as Event or Censored. Japanese labels for event/death and censoring/end of observation are also accepted. For 0/1 values, confirm below which value means Event.",
              )}
            </p>
          ) : null}
          <details>
            <summary>
              {t("区切りテキストを直接編集（詳細）", "Edit delimited text directly (advanced)")}
            </summary>
            <label>
              {t("区切りテキスト", "Delimited text")}
              <textarea
                aria-label={mode === "survival" ? "Survival data" : "Matrix data"}
                rows={7}
                value={text}
                onPaste={(event) => {
                  if (mode !== "survival") return;
                  const pastedText = event.clipboardData.getData("text/plain");
                  if (!pastedText) return;
                  event.preventDefault();
                  const selectionStart = event.currentTarget.selectionStart ?? text.length;
                  const selectionEnd = event.currentTarget.selectionEnd ?? selectionStart;
                  setText(
                    replaceRawTextareaSelection(text, pastedText, selectionStart, selectionEnd),
                  );
                  setTimeToEventInputSource({
                    kind: "clipboard",
                    label: "time-to-event-entry-paste",
                  });
                  setNumericStatusMapping(null);
                  setResult(null);
                  setResultInputFingerprint(null);
                }}
                onChange={(event) => {
                  setText(event.target.value);
                  if (mode === "heatmap") {
                    setHeatmapInputSource({ kind: "clipboard", label: "heatmap-entry-paste" });
                  }
                  setResult(null);
                  setResultInputFingerprint(null);
                }}
                style={{ width: "100%", fontFamily: "monospace" }}
              />
            </label>
          </details>
        </section>
        {mode === "survival" && experimentFirstEntry && !persistedAdaptiveInput ? (
          <label>
            {t("時間の単位", "Time unit")}
            <input
              aria-label="Follow-up time unit"
              value={followUpUnit}
              placeholder={t("例: day, hour, week", "Example: day, hour, week")}
              onChange={(event) => {
                const previousDefault = survivalTimeAxisLabel(followUpUnit);
                const nextUnit = event.target.value;
                setFollowUpUnit(nextUnit);
                setSurvivalXAxisLabel((current) =>
                  current === previousDefault ? survivalTimeAxisLabel(nextUnit) : current,
                );
                setResult(null);
                setResultInputFingerprint(null);
              }}
            />
            <small>
              {t(
                "グラフと保存データの時間軸に使用します。数値だけから単位を推測しません。",
                "Used for the Graph and saved time axis. The unit is never inferred from numeric values alone.",
              )}
            </small>
          </label>
        ) : null}
        {mode === "survival" && !persistedAdaptiveInput && text.trim() === SURVIVAL_TABLE_HEADER ? (
          <button
            type="button"
            onClick={() => {
              setText(SURVIVAL_EXAMPLE);
              setTimeToEventInputSource({ kind: "tsv", label: "synthetic-example.tsv" });
              setNumericStatusMapping(null);
              setResult(null);
              setResultInputFingerprint(null);
            }}
          >
            {t(
              "入力形式の例を読み込む（合成値）",
              "Load an input-format example (synthetic values)",
            )}
          </button>
        ) : null}
        {mode === "heatmap" && text.trim() === HEATMAP_TABLE_HEADER ? (
          <button
            type="button"
            onClick={() => {
              setText(HEATMAP_EXAMPLE);
              setHeatmapInputSource({ kind: "tsv", label: "synthetic-example.tsv" });
            }}
          >
            {t(
              "入力形式の例を読み込む（合成値）",
              "Load an input-format example (synthetic values)",
            )}
          </button>
        ) : null}
        {mode === "survival" ? (
          <LocalizedFileInput
            className="existing-data-import__file"
            label={t("CSV / TSV / TXTファイル", "CSV / TSV / TXT file")}
            ariaLabel={t("time-to-eventデータファイル", "Time-to-event data file")}
            accept=".csv,.tsv,.txt,text/csv,text/tab-separated-values,text/plain"
            onChange={(event) => {
              const file = event.currentTarget.files?.[0];
              if (!file) return;
              void file
                .text()
                .then((contents) => {
                  const lowerName = file.name.toLowerCase();
                  setText(contents);
                  setTimeToEventInputSource({
                    kind: lowerName.endsWith(".csv")
                      ? "csv"
                      : lowerName.endsWith(".tsv")
                        ? "tsv"
                        : "generic_file",
                    label: file.name,
                  });
                  setNumericStatusMapping(null);
                  setResult(null);
                  setResultInputFingerprint(null);
                  setMessage(t(`${file.name} を読み込みました。`, `Loaded ${file.name}.`));
                })
                .catch(() =>
                  setMessage(
                    t("ファイルを読み込めませんでした。", "The file could not be loaded."),
                  ),
                );
            }}
          />
        ) : null}
        {mode === "heatmap" ? (
          <LocalizedFileInput
            className="existing-data-import__file"
            label={t("CSV / TSV / TXTファイル", "CSV / TSV / TXT file")}
            ariaLabel={t("ヒートマップ用データファイル", "Heatmap data file")}
            accept=".csv,.tsv,.txt,text/csv,text/tab-separated-values,text/plain"
            onChange={(event) => {
              const file = event.currentTarget.files?.[0];
              if (!file) return;
              void file
                .text()
                .then((contents) => {
                  setText(contents);
                  const lowerName = file.name.toLowerCase();
                  setHeatmapInputSource({
                    kind: lowerName.endsWith(".csv")
                      ? "csv"
                      : lowerName.endsWith(".tsv")
                        ? "tsv"
                        : "generic_file",
                    label: file.name,
                  });
                  setMessage(t(`${file.name} を読み込みました。`, `Loaded ${file.name}.`));
                })
                .catch(() =>
                  setMessage(
                    t("ファイルを読み込めませんでした。", "The file could not be loaded."),
                  ),
                );
            }}
          />
        ) : null}
        {numericStatusMappingRequired ? (
          <section className="callout-info" aria-label="0/1 statusの意味">
            <strong>
              {t("Status列の0と1は何を表しますか？", "What do 0 and 1 mean in the Status column?")}
            </strong>
            <p>
              {t(
                "数値だけではeventと打ち切りを判別できないため、推測せず確認します。",
                "Numeric values alone cannot distinguish events from censoring, so BioFigureStat asks instead of guessing.",
              )}
            </p>
            <select
              aria-label="Status列の0/1 mapping"
              value={numericStatusMapping ?? ""}
              onChange={(event) => {
                setNumericStatusMapping((event.target.value || null) as NumericStatusMappingChoice);
                setResult(null);
                setResultInputFingerprint(null);
              }}
            >
              <option value="">{t("選択してください", "Select one")}</option>
              <option value="event_is_1">1 = Event、0 = Censored</option>
              <option value="event_is_0">0 = Event、1 = Censored</option>
            </select>
          </section>
        ) : null}
        <div className="specialized-action-bar">
          {mode === "heatmap" ? (
            <button
              type="button"
              disabled={!openUnresolvedVisualizationProject}
              aria-describedby={
                !openUnresolvedVisualizationProject
                  ? "heatmap-persistence-unavailable-note"
                  : undefined
              }
              onClick={requestOpenHeatmapProject}
            >
              {t("保存済みHeatmap projectを開く", "Open a saved Heatmap project")}
            </button>
          ) : null}
          <button
            type="button"
            aria-describedby={
              mode === "heatmap" && !saveUnresolvedVisualizationProject
                ? "heatmap-persistence-unavailable-note"
                : undefined
            }
            disabled={
              mode === "heatmap"
                ? !saveUnresolvedVisualizationProject ||
                  !heatmapTableHasRows ||
                  !heatmap ||
                  "error" in heatmap
                : !saveProject || (experimentFirstEntry && !activeAdaptiveInput)
            }
            onClick={() => void save()}
          >
            {t("プロジェクトを保存", "Save project")}
          </button>
          {mode === "heatmap" ? (
            <>
              <p className="specialized-engine-note" role="note">
                {t(
                  "行列の列を生物学的な独立例とみなさず、入力した行列とGraph設定を保存します。統計の構造は未確定のままです。",
                  "The entered matrix and Graph settings are saved without treating matrix columns as biologically independent observations. The statistical structure remains unresolved.",
                )}
              </p>
              {!openUnresolvedVisualizationProject || !saveUnresolvedVisualizationProject ? (
                <p
                  id="heatmap-persistence-unavailable-note"
                  className="specialized-engine-note"
                  role="note"
                >
                  {t(
                    "ブラウザレビューではHeatmap projectの保存・開くは利用できません。デスクトップ版で利用できます。",
                    "Heatmap projects cannot be saved or opened in this browser preview. Use the desktop app.",
                  )}
                </p>
              ) : null}
            </>
          ) : null}
          {import.meta.env.DEV && mode === "survival" && benchmarkRun.identity ? (
            <button type="button" onClick={() => void finalizeSpecializedBenchmark()}>
              Benchmarkを9 artifactsで完了
            </button>
          ) : null}
        </div>
        {message ? <p role="status">{message}</p> : null}
        {mode === "heatmap" && exportFeedback ? (
          <p role={exportFeedback.kind === "error" ? "alert" : "status"}>{exportFeedback.text}</p>
        ) : null}
      </section>
      {mode === "survival" ? (
        <section
          id="survival-graph"
          inert={survivalWorkspaceTab === "data" ? true : undefined}
          className={`workspace-panel specialized-workspace-panel${
            survivalWorkspaceTab === "data" ? " workspace-tab-panel--inactive" : ""
          }`}
        >
          <GraphWorkspaceFrame
            title={graphTitle.trim() || "Kaplan–Meier survival"}
            actions={
              <GraphExportActions
                svgRef={svgRef}
                fileStem={graphTitle}
                disabled={!survival || "error" in survival}
                onFeedback={setExportFeedback}
              />
            }
            feedback={
              exportFeedback ? (
                <p role={exportFeedback.kind === "error" ? "alert" : "status"}>
                  {exportFeedback.text}
                </p>
              ) : null
            }
            canvas={
              !survivalTableHasRows ? (
                <p>
                  {t(
                    "表に実測値を入力すると、event/censoringを保持したGraphをここに表示します。",
                    "Enter measured values in the table to display a Graph that preserves event and censoring status.",
                  )}
                </p>
              ) : numericStatusMappingRequired && numericStatusMapping === null ? (
                <p>
                  {t(
                    "Status列の0/1の意味を確認するとGraphを表示できます。",
                    "Confirm the meaning of 0/1 in the Status column to display the Graph.",
                  )}
                </p>
              ) : survival && "error" in survival ? (
                <p role="alert">{survival.error}</p>
              ) : survival && !("error" in survival) ? (
                <SurvivalGraph
                  ref={svgRef}
                  model={survival.model}
                  timeLabel={survivalXAxisLabel}
                  probabilityLabel={survivalYAxisLabel}
                  palette={survivalPalette}
                  fontSize={survivalFontSize}
                  legendFontSize={survivalLegendFontSize}
                  legendPosition={survivalLegendPosition}
                  showMinorTicks={survivalShowMinorTicks}
                  tickDirection={survivalTickDirection}
                  annotation={showLogRankAnnotation ? (logRankDisplay ?? undefined) : undefined}
                  countSemantics={
                    !experimentFirstEntry || activeAdaptiveInput ? "biological_n" : "records"
                  }
                />
              ) : null
            }
            inspector={
              survivalWorkspaceTab === "statistics"
                ? survivalStatisticsContent
                : survivalGraphSettings
            }
          />
        </section>
      ) : (
        <section id="heatmap-graph" className="workspace-panel specialized-workspace-panel">
          <GraphWorkspaceFrame
            title={
              effectiveEntryIntent?.experimentName ??
              currentVisualizationProject?.state.metadata.projectName ??
              "Heatmap"
            }
            actions={
              <GraphExportActions
                svgRef={svgRef}
                fileStem={
                  effectiveEntryIntent?.experimentName ??
                  currentVisualizationProject?.state.metadata.projectName ??
                  "Heatmap"
                }
                disabled={!heatmapTableHasRows || !heatmap || "error" in heatmap}
                onFeedback={setExportFeedback}
              />
            }
            feedback={
              exportFeedback ? (
                <p role={exportFeedback.kind === "error" ? "alert" : "status"}>
                  {exportFeedback.text}
                </p>
              ) : null
            }
            canvas={
              !heatmapTableHasRows ? (
                <p>
                  {t(
                    "数値行列を貼り付けると、欠損を保持したヒートマップをここに表示します。",
                    "Paste a numeric matrix to display a heatmap while preserving missing values.",
                  )}
                </p>
              ) : heatmap && "error" in heatmap ? (
                <p role="alert">{heatmap.error}</p>
              ) : heatmap && !("error" in heatmap) ? (
                <HeatmapGraph
                  ref={svgRef}
                  model={heatmap.model}
                  min={configuredMin}
                  max={configuredMax}
                  palette={heatmapPalette}
                  missingColor={missingColor}
                  showCellValues={showCellValues}
                />
              ) : null
            }
            inspector={heatmapGraphSettings}
          />
        </section>
      )}
      {methods ? (
        <details>
          <summary>Methods</summary>
          <pre style={{ whiteSpace: "pre-wrap" }}>{methods}</pre>
        </details>
      ) : null}
    </div>
  );
}

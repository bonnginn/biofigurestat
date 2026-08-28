import {
  useEffect,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
  type ChangeEvent,
  type ClipboardEvent,
} from "react";
import {
  parseAdaptiveDelimited,
  type DelimitedSourceKind,
  type EntryModuleFacts,
} from "@lsaa/adaptive-input";
import type { ExperimentDesign, Observation, UnitInstance } from "@lsaa/domain";
import {
  AnalysisEngineRequestSchema,
  type AnalysisEngineResult,
  type AnalysisRecommendation,
} from "@lsaa/analysis-contracts";
import {
  parseContingencyPaste,
  parseDistributionPaste,
  parseMatchedLongPaste,
  parseXyPaste,
} from "@lsaa/data-sheet";
import {
  createDistributionGraphSpec,
  createEcdfModel,
  createHistogramModel,
  createNonlinearFitGraphModel,
  createNonlinearFitGraphSpec,
  createRegressionGraphModel,
  createRegressionGraphSpec,
  validateGraphScale,
} from "@lsaa/graph-spec";
import {
  appendAnalysisExecution,
  appendDesignRevision,
  appendRawRevision,
  createInitialProjectState,
  ProjectStateSchema,
  type ProjectState,
} from "@lsaa/project";
import { defaultAnalysisRunner, type AnalysisRunner } from "../app/analysisClient";
import type { OpenedProject, SaveProjectAction } from "../app/projectActions";
import type { AppRoute } from "../app/routes";
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
import { downloadTextFile, serializeGraphSvg, svgToPngBlob } from "../app/graphExport";
import { generateCommonCoverageMethods } from "../app/commonCoverageMethods";
import { generateMethodsText } from "../app/methodsText";
import {
  DEFAULT_NONLINEAR_MODEL_ID,
  NONLINEAR_MODEL_DEFINITIONS,
  isGeneratedNonlinearRationale,
  nonlinearModelDefinition,
  nonlinearModelLabel,
  nonlinearParameterLabel,
  type NonlinearModelId,
  type NonlinearParameterId,
} from "../app/nonlinearModelRegistry";
import {
  resolveOrderedCurveAnalysisReadiness,
  type MichaelisReadoutMeaning,
} from "../app/orderedCurveAnalysisReadiness";
import {
  restoredNonlinearModelSelection,
  restoredMichaelisReadoutMeaning,
  withOrderedCurveAnalysisProvenance,
} from "../app/orderedCurveAnalysisProvenance";
import type { CommonCoverageDraft } from "../app/specializedAnalysisDrafts";
import type { DedicatedEntryIntent } from "../app/dedicatedEntryIntent";
import {
  createEntryModuleTargetedFactsState,
  entryModuleTargetedFactsViewModel,
  updateEntryModuleOrderedAxisCount,
  updateEntryModuleOrderedCurveSeriesCount,
  updateEntryModuleTargetedFact,
} from "../app/entryModuleTargetedFacts";
import {
  createOrderedCurveEntry,
  projectOrderedCurveEntryToLegacyRecords,
  type OrderedCurveEntryResult,
  type OrderedCurveRawTextCaptureMode,
} from "../app/orderedCurveEntry";
import type { LiteratureExperimenterCase } from "../app/literatureBenchmark";
import { PRODUCT_IDENTITY } from "../app/productIdentity";
import {
  CountGraph,
  DistributionGraph,
  RegressionGraph,
} from "../components/graph/CommonMethodGraphs";
import { NonlinearFitGraph } from "../components/graph/NonlinearFitGraph";
import { AnalysisRouteSwitcher } from "../components/AnalysisRouteSwitcher";

type Mode =
  "contingency" | "repeated-nonparametric" | "regression" | "nonlinear-fit" | "distribution";
type Props = Readonly<{
  mode: Mode;
  onBack: () => void;
  analysisRunner?: AnalysisRunner;
  analysisAvailable?: boolean;
  saveProject?: SaveProjectAction;
  onNavigate?: (route: AppRoute) => void;
  initialDraft?: CommonCoverageDraft;
  onDraftChange?: (draft: CommonCoverageDraft) => void;
  entryIntent?: DedicatedEntryIntent;
  initialProject?: OpenedProject;
}>;
const defaults: Record<Mode, string> = {
  contingency: "Category\tEvent\tNo event\nControl\t1\t9\nTreatment\t6\t4",
  "repeated-nonparametric":
    "Unit ID\tCondition\tValue\nu1\tBaseline\t8\nu1\tDay 1\t7\nu1\tDay 2\t6\nu2\tBaseline\t9\nu2\tDay 1\t7\nu2\tDay 2\t5\nu3\tBaseline\t6\nu3\tDay 1\t5\nu3\tDay 2\t4",
  regression: "Unit ID\tX\tY\nu1\t1\t2.1\nu2\t2\t4.2\nu3\t3\t5.8\nu4\t4\t8.3\nu5\t5\t9.9",
  "nonlinear-fit": nonlinearModelDefinition(DEFAULT_NONLINEAR_MODEL_ID).examplePaste,
  distribution: "1 2 2 3 5 8 13 21 34",
};
const ORDERED_CURVE_HEADER = "Unit ID\tSeries\tX\tY";

const titles: Record<Mode, string> = {
  contingency: "Categorical / contingency",
  "repeated-nonparametric": "Repeated nonparametric",
  regression: "Simple linear regression",
  "nonlinear-fit": "酵素反応・飽和カーブ",
  distribution: "Histogram / ECDF",
};
const dataLabels: Record<Mode, string> = {
  ...titles,
  "nonlinear-fit": "非線形XYフィッティング",
};
const options = {
  alternative: "two_sided" as const,
  confidenceLevel: 0.95,
  multiplicityMethod: null,
};

type FitSetting = Readonly<{ initial: string; lower: string; upper: string }>;
type ParsedNonlinear = Readonly<{
  allPoints: ReadonlyArray<{
    observationId: string;
    experimentalUnitId: string;
    unitLabel: string;
    seriesId: string;
    seriesLabel: string;
    x: number;
    y: number | null;
  }>;
  points: ReadonlyArray<{
    observationId: string;
    experimentalUnitId: string;
    unitLabel: string;
    seriesId: string;
    seriesLabel: string;
    x: number;
    y: number;
  }>;
  series: ReadonlyArray<{ id: string; label: string }>;
  units: ReadonlyArray<{ id: string; label: string; seriesId: string }>;
}>;

function parseNonlinearXyPaste(text: string): ParsedNonlinear {
  const delimited = parseAdaptiveDelimited(text);
  if (delimited.rows.length < 1) throw new Error("headerと1行以上のX/Yデータが必要です");
  const header = delimited.headers.map((value) => value.trim().toLowerCase());
  const unitIndex = header.findIndex((value) => ["unit id", "unit", "sample id"].includes(value));
  const seriesIndex = header.findIndex((value) => value === "series");
  const xIndex = header.findIndex((value) => value === "x");
  const yIndex = header.findIndex((value) => value === "y");
  if ([unitIndex, seriesIndex, xIndex, yIndex].some((index) => index < 0)) {
    throw new Error("列は Unit ID、Series、X、Y の4列にしてください");
  }
  const seriesByLabel = new Map<string, string>();
  const unitByLabel = new Map<string, { id: string; seriesId: string }>();
  const missingTokens = new Set(["", "na", "n/a", "undetermined", "over"]);
  const allPoints = delimited.rows.map((cells, index) => {
    const unitLabel = cells[unitIndex] ?? "";
    const seriesLabel = cells[seriesIndex] ?? "";
    const x = Number(cells[xIndex]);
    const rawY = (cells[yIndex] ?? "").trim();
    const y = missingTokens.has(rawY.toLowerCase()) ? null : Number(rawY);
    if (!unitLabel || !seriesLabel || !Number.isFinite(x) || (y !== null && !Number.isFinite(y))) {
      throw new Error(`${index + 2}行目のUnit ID、Series、有限X/Yを確認してください`);
    }
    let seriesId = seriesByLabel.get(seriesLabel);
    if (!seriesId) {
      seriesId = `series.${seriesByLabel.size + 1}`;
      seriesByLabel.set(seriesLabel, seriesId);
    }
    let unit = unitByLabel.get(unitLabel);
    if (!unit) {
      unit = { id: `unit.${unitByLabel.size + 1}`, seriesId };
      unitByLabel.set(unitLabel, unit);
    }
    return {
      observationId: `observation.${index + 1}`,
      experimentalUnitId: unit.id,
      unitLabel,
      seriesId,
      seriesLabel,
      x,
      y,
    };
  });
  const points = allPoints.filter(
    (point): point is (typeof allPoints)[number] & Readonly<{ y: number }> => point.y !== null,
  );
  return {
    allPoints,
    points,
    series: [...seriesByLabel].map(([label, id]) => ({ id, label })),
    units: [...unitByLabel].map(([label, unit]) => ({
      id: unit.id,
      label,
      seriesId: unit.seriesId,
    })),
  };
}

function generatedCurveExample(
  definition: ReturnType<typeof nonlinearModelDefinition>,
  relationship: "same_physical_material_across_axis" | "separate_material_per_axis_value",
): string {
  const lines = definition.examplePaste.split(/\r?\n/);
  const seriesIds = new Map<string, string>();
  return lines
    .map((line, index) => {
      if (index === 0) return line;
      const cells = line.split("\t");
      const series = cells[1] ?? "Series";
      let seriesId = seriesIds.get(series);
      if (!seriesId) {
        seriesId = `curve-${seriesIds.size + 1}`;
        seriesIds.set(series, seriesId);
      }
      cells[0] =
        relationship === "same_physical_material_across_axis"
          ? seriesId
          : `${seriesId}-point-${index}`;
      return cells.join("\t");
    })
    .join("\n");
}

function genericOrderedCurveExample(
  relationship: "same_physical_material_across_axis" | "separate_material_per_axis_value",
): string {
  const unitIds =
    relationship === "same_physical_material_across_axis"
      ? ["unit-1", "unit-1", "unit-1"]
      : ["unit-at-0", "unit-at-1", "unit-at-2"];
  return [
    ORDERED_CURVE_HEADER,
    `${unitIds[0]}\tSeries A\t0\t0`,
    `${unitIds[1]}\tSeries A\t1\t0.4`,
    `${unitIds[2]}\tSeries A\t2\t0.8`,
  ].join("\n");
}

function isGenericOrderedCurveExample(value: string): boolean {
  return [
    genericOrderedCurveExample("same_physical_material_across_axis"),
    genericOrderedCurveExample("separate_material_per_axis_value"),
  ].includes(value);
}

function orderedCurveFileSourceKind(file: Pick<File, "name" | "type">): DelimitedSourceKind {
  const lowerName = file.name.toLowerCase();
  if (lowerName.endsWith(".csv") || file.type === "text/csv") return "csv";
  if (lowerName.endsWith(".tsv") || file.type === "text/tab-separated-values") return "tsv";
  return "generic_file";
}

/** Legacy/direct advanced projection retained behind the non-adaptive route. */
function createLegacyNonlinearDesignData(
  parsed: ParsedNonlinear,
  input: Readonly<{
    xLabel: string;
    yLabel: string;
    yUnit: string;
    modelId: NonlinearModelId;
    rationale: string;
    createdAt: string;
  }>,
) {
  const factorId = "factor.series";
  const outcomeId = "outcome.nonlinear-y";
  const design: ExperimentDesign = {
    schemaVersion: "0.2.0",
    id: "design.nonlinear",
    name: "Nonlinear XY fitting",
    purpose: "custom",
    outcomes: [
      {
        id: outcomeId,
        key: "nonlinear-y",
        label: input.yLabel || "Y",
        type: "continuous",
        ...(input.yUnit ? { unit: input.yUnit } : {}),
      },
    ],
    factors: [
      {
        id: factorId,
        key: "series",
        label: "Series",
        levels: parsed.series.map((series, order) => ({
          id: `level.series.${order + 1}`,
          label: series.label,
          order,
        })),
      },
    ],
    conditions: parsed.series.map((series, order) => ({
      id: series.id,
      label: series.label,
      factorLevels: { [factorId]: `level.series.${order + 1}` },
    })),
    unitLevels: [
      {
        id: "level.reaction",
        key: "reaction",
        label: "Independent reaction / biological unit",
        role: "experimental_unit",
        parentLevelId: null,
      },
    ],
    experimentalUnitLevelId: "level.reaction",
    pairing: { kind: "independent" },
    plannedN: parsed.units.length,
    normalizationPlans: [],
    primaryContrast:
      parsed.series.length >= 2
        ? {
            id: "contrast.nonlinear-series-identity",
            label: `${parsed.series[0]!.label} / ${parsed.series[1]!.label} fit identity (no hypothesis test)`,
            conditionIds: [parsed.series[0]!.id, parsed.series[1]!.id],
          }
        : null,
    wizardRuleVersion: "nonlinear-xy-core-0.1.0",
    wizardDecisions: [
      { questionId: "nonlinear.model", answer: input.modelId },
      { questionId: "nonlinear.model-rationale", answer: input.rationale },
      { questionId: "nonlinear.x-label", answer: input.xLabel },
    ],
    createdAt: input.createdAt,
  };
  const units: UnitInstance[] = parsed.units.map((unit) => ({
    id: unit.id,
    levelId: "level.reaction",
    parentUnitId: null,
    label: unit.label,
    metadata: { seriesId: unit.seriesId },
  }));
  const observations: Observation[] = parsed.points.map((point) => ({
    id: point.observationId,
    rawRevisionId: "raw.nonlinear.1",
    unitInstanceId: point.experimentalUnitId,
    conditionId: point.seriesId,
    outcomeId,
    measurement: { kind: "scalar", value: point.y },
    time: point.x,
    sourceLocation: `pasted XY; ${input.xLabel}=${point.x}`,
  }));
  return { design, units, observations, outcomeId };
}

function isGeneratedCurveExample(value: string): boolean {
  return NONLINEAR_MODEL_DEFINITIONS.some((definition) =>
    [
      definition.examplePaste,
      generatedCurveExample(definition, "same_physical_material_across_axis"),
      generatedCurveExample(definition, "separate_material_per_axis_value"),
    ].includes(value),
  );
}

function finiteOptional(value: string, label: string) {
  if (!value.trim()) return undefined;
  const parsed = Number(value);
  if (!Number.isFinite(parsed)) throw new Error(`${label}は有限値にしてください`);
  return parsed;
}

function orderedCurveStatusMessage(entry: OrderedCurveEntryResult | null): string | null {
  if (!entry || entry.status === "surface_ready") return null;
  const diagnostics = entry.dualWrite.diagnostics;
  if (diagnostics.includes("ORDERED_CURVE_STABLE_ID_NOT_REUSED_ACROSS_AXIS")) {
    return "同じ反応・対象を続けて測った場合は、その対象のUnit IDを複数のX点で同じにしてください。";
  }
  if (diagnostics.includes("ORDERED_CURVE_SEPARATE_MATERIAL_REUSES_ID_ACROSS_AXIS")) {
    return "X点ごとに別の反応・試料を用意した場合は、異なるX点へ同じUnit IDを使わないでください。";
  }
  if (diagnostics.includes("ORDERED_CURVE_UNIT_ID_SPANS_MULTIPLE_SERIES")) {
    return "同じUnit IDが複数のSeriesにあります。IDは変更せず保持しました。Seriesが条件、別run・個体、別readoutのどれを表すかと、共通の由来をもつかを一般の実験設定で確認してください。";
  }
  if (diagnostics.includes("ORDERED_CURVE_DUPLICATE_UNIT_AXIS_POINT_REQUIRES_OBSERVATION_LEVEL")) {
    return "同じUnit ID・Series・Xに複数の値があります。下位の観測単位を定義するまで別の1点へまとめません。";
  }
  if (diagnostics.includes("ORDERED_CURVE_REQUIRES_TWO_AXIS_LEVELS")) {
    return "曲線として扱うには、少なくとも2つの異なるX値が必要です。";
  }
  if (
    diagnostics.includes("ORDERED_CURVE_AXIS_LABEL_REQUIRED") ||
    diagnostics.includes("ORDERED_CURVE_READOUT_LABEL_REQUIRED")
  ) {
    return "Graphと保存用の構造を確定するため、横方向に変えたものと測った値の名前を入力してください。X / Yのままでは意味を推測しません。入力済みの値は保持します。";
  }
  if (diagnostics.includes("AXIS_POINT_PARENT_RELATIONSHIP_UNRESOLVED")) {
    return "別々に用意した試料が同じdonor・animal・dish・実験run・batchなどを共有するか確認してください。推測せず入力済みの値を保持します。";
  }
  if (diagnostics.includes("SEPARATE_AXIS_MATERIAL_HAS_SHARED_PARENT_REQUIRES_HIERARCHY")) {
    return "共通の由来または対応関係をもつ試料です。この簡易曲線表で独立した試料へ読み替えず、親IDを保持できる一般の実験設定で続けてください。入力済みの値は保持します。";
  }
  if (diagnostics.includes("ORDERED_CURVE_SERIES_MEANING_UNRESOLVED")) {
    return "複数のSeriesが比較条件、別run・個体、別readoutのどれを表すか確認してください。推測せず入力済みの値とIDを保持します。";
  }
  if (diagnostics.includes("ORDERED_CURVE_SERIES_PARENT_RELATIONSHIP_UNRESOLVED")) {
    return "異なるSeriesの試料が同じdonor・animal・dish・実験run・batchなどを共有するか確認してください。推測せず入力済みの値とIDを保持します。";
  }
  if (
    diagnostics.includes("ORDERED_CURVE_SERIES_REPLICATES_REQUIRE_RESHAPING") ||
    diagnostics.includes("ORDERED_CURVE_MULTIPLE_READOUTS_REQUIRE_TYPED_READOUTS") ||
    diagnostics.includes("ORDERED_CURVE_SERIES_SHARED_PARENT_REQUIRES_HIERARCHY")
  ) {
    return "Seriesの意味または対応関係をこの簡易曲線表では安全に保持できません。別条件へ読み替えず、入力済みの値とIDを保持して一般の実験設定で続けます。";
  }
  if (
    diagnostics.some((code) =>
      [
        "ORDERED_CURVE_OBSERVATION_ID_INVALID",
        "ORDERED_CURVE_OBSERVATION_ID_DUPLICATE",
        "ORDERED_CURVE_UNIT_ID_REQUIRED",
        "ORDERED_CURVE_SERIES_VALUE_REQUIRED",
        "ORDERED_CURVE_X_MUST_BE_FINITE",
        "ORDERED_CURVE_Y_MUST_BE_FINITE",
      ].includes(code),
    )
  ) {
    return "入力表のUnit ID、Series、X、Yを確認してください。入力済みの値は保持しています。";
  }
  if (entry.status === "dual_write_mismatch" || entry.status === "surface_mismatch") {
    return "実験構造と保存用designの意味が一致しないため停止しました。別のdesignへ変換していません。";
  }
  return "実験構造を安全に確定できないため停止しました。入力済みの値は保持しています。";
}

function nextOrderedCurveRawRevisionId(state: ProjectState): string {
  let index = state.rawRevisions.length + 1;
  while (state.rawRevisions.some(({ id }) => id === `raw.nonlinear.${index}`)) index += 1;
  return `raw.nonlinear.${index}`;
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

function replaceTextareaSelectionWithClipboardText(
  rawText: string,
  clipboardText: string,
  selectionStart: number,
  selectionEnd: number,
): string {
  const rawStart = rawOffsetForTextareaOffset(rawText, selectionStart);
  const rawEnd = rawOffsetForTextareaOffset(rawText, selectionEnd);
  return `${rawText.slice(0, rawStart)}${clipboardText}${rawText.slice(rawEnd)}`;
}

export function CommonCoveragePage({
  mode,
  onBack,
  analysisRunner = defaultAnalysisRunner,
  analysisAvailable = true,
  saveProject,
  onNavigate,
  initialDraft,
  onDraftChange,
  entryIntent,
  initialProject,
}: Props) {
  const initialNonlinearRun =
    mode === "nonlinear-fit"
      ? initialProject?.state.analysisRuns.find(
          ({ state, request }) => state === "current" && request.protocolVersion === "0.14.0",
        )
      : undefined;
  const initialNonlinearRequest =
    initialNonlinearRun?.request.protocolVersion === "0.14.0" ? initialNonlinearRun.request : null;
  const adaptiveOrderedCurveActive =
    mode === "nonlinear-fit" &&
    Boolean(entryIntent || initialProject?.state.adaptiveInput?.contract.orderedAxes.length);
  const initialAdaptiveSnapshot =
    mode === "nonlinear-fit" ? initialProject?.state.adaptiveInput : null;
  const initialOrderedAxis = initialAdaptiveSnapshot?.contract.orderedAxes[0];
  const initialReadout = initialAdaptiveSnapshot?.contract.readouts[0];
  const entryCompiledAtRef = useRef(
    initialProject?.state.adaptiveInput?.rawLineage?.importedAt ?? new Date().toISOString(),
  );
  const [persistedBaseline, setPersistedBaseline] = useState<OpenedProject | null>(
    initialProject ?? null,
  );
  const [rawTextCaptureMode, setRawTextCaptureMode] = useState<OrderedCurveRawTextCaptureMode>(
    initialProject ? "retained_project_lineage" : "browser_editor_value",
  );
  const [orderedCurveSource, setOrderedCurveSource] = useState<{
    sourceKind: DelimitedSourceKind;
    sourceLabel: string;
  }>(() => ({
    sourceKind: initialProject?.state.adaptiveInput?.rawLineage?.sourceKind ?? "clipboard",
    sourceLabel:
      initialProject?.state.adaptiveInput?.rawLineage?.sourceLabel ?? "ordered-curve-data",
  }));
  const [nonlinearAnalysisSetupVisible, setNonlinearAnalysisSetupVisible] = useState(
    !adaptiveOrderedCurveActive,
  );
  const [text, setText] = useState(
      initialDraft?.text ??
        initialAdaptiveSnapshot?.rawLineage?.rawText ??
        (mode === "nonlinear-fit" ? ORDERED_CURVE_HEADER : defaults[mode]),
    ),
    [result, setResult] = useState<AnalysisEngineResult | null>(
      initialNonlinearRun?.result ?? null,
    ),
    [executedRequest, setExecutedRequest] = useState<ReturnType<
      typeof AnalysisEngineRequestSchema.parse
    > | null>(initialNonlinearRun?.request ?? null),
    [message, setMessage] = useState<string | null>(null);
  const [literatureCase, setLiteratureCase] = useState<LiteratureExperimenterCase | null>(null);
  const [contingencyMethod, setContingencyMethod] = useState<
      "fisher_exact" | "pearson_chi_square" | "mcnemar_exact"
    >(initialDraft?.contingencyMethod ?? "fisher_exact"),
    [display, setDisplay] = useState<"count" | "fraction" | "stacked">(
      initialDraft?.display ?? "count",
    );
  const [includeIntercept, setIncludeIntercept] = useState(initialDraft?.includeIntercept ?? true),
    [xLabel, setXLabel] = useState(
      initialDraft?.xLabel ?? initialOrderedAxis?.label ?? (adaptiveOrderedCurveActive ? "" : "X"),
    ),
    [yLabel, setYLabel] = useState(
      initialDraft?.yLabel ?? initialReadout?.label ?? (adaptiveOrderedCurveActive ? "" : "Y"),
    ),
    [xUnit, setXUnit] = useState(initialDraft?.xUnit ?? initialOrderedAxis?.unit ?? ""),
    [yUnit, setYUnit] = useState(initialDraft?.yUnit ?? initialNonlinearRequest?.yUnit ?? ""),
    [xScale, setXScale] = useState<"linear" | "log10">(initialDraft?.xScale ?? "linear"),
    [yScale, setYScale] = useState<"linear" | "log10">(initialDraft?.yScale ?? "linear"),
    [showBand, setShowBand] = useState(initialDraft?.showBand ?? true);
  const [distributionType, setDistributionType] = useState<"histogram" | "ecdf">(
      initialDraft?.distributionType ?? "histogram",
    ),
    [binCount, setBinCount] = useState(initialDraft?.binCount ?? ""),
    svgRef = useRef<SVGSVGElement>(null);
  const persistedNonlinearModel = restoredNonlinearModelSelection(initialAdaptiveSnapshot);
  const restoredModel = NONLINEAR_MODEL_DEFINITIONS.some(({ id }) => id === persistedNonlinearModel)
    ? (persistedNonlinearModel as NonlinearModelId)
    : undefined;
  const [nonlinearModel, setNonlinearModel] = useState<NonlinearModelId>(
    (initialNonlinearRequest?.modelId as NonlinearModelId | undefined) ??
      restoredModel ??
      initialDraft?.nonlinearModel ??
      DEFAULT_NONLINEAR_MODEL_ID,
  );
  const [nonlinearModelExplicitlySelected, setNonlinearModelExplicitlySelected] = useState(
    Boolean(initialDraft?.nonlinearModelExplicitlySelected) ||
      Boolean(initialNonlinearRun) ||
      Boolean(restoredModel) ||
      !adaptiveOrderedCurveActive,
  );
  const [michaelisReadoutMeaning, setMichaelisReadoutMeaning] = useState<
    MichaelisReadoutMeaning | undefined
  >(
    initialDraft?.michaelisReadoutMeaning ??
      restoredMichaelisReadoutMeaning(initialAdaptiveSnapshot),
  );
  const nonlinearDefinition = nonlinearModelDefinition(nonlinearModel);
  const [modelRationale, setModelRationale] = useState(
    initialDraft?.modelRationale ??
      initialNonlinearRequest?.modelSelectionRationale ??
      (adaptiveOrderedCurveActive
        ? ""
        : nonlinearModelDefinition(DEFAULT_NONLINEAR_MODEL_ID).defaultRationale),
  );
  const [fitSettings, setFitSettings] = useState<Record<NonlinearParameterId, FitSetting>>(
    initialDraft
      ? { ...initialDraft.fitSettings }
      : {
          baseline: { initial: "", lower: "", upper: "" },
          plateau: { initial: "", lower: "", upper: "" },
          rate: { initial: "", lower: "", upper: "" },
          vmax: { initial: "", lower: "", upper: "" },
          km: { initial: "", lower: "", upper: "" },
        },
  );
  const [entryFactsState, setEntryFactsState] = useState(() => {
    const retainedFact = (key: string) =>
      initialAdaptiveSnapshot?.targetedConfirmations.find((fact) => fact.key === key)?.answer;
    const retainedFacts = {
      orderedAxisMeaning: retainedFact("ordered_axis_meaning"),
      axisMaterialRelationship: retainedFact("axis_material_relationship"),
      axisPointParentRelationship: retainedFact("axis_point_parent_relationship"),
      orderedCurveSeriesMeaning: retainedFact("ordered_curve_series_meaning"),
      orderedCurveSeriesParentRelationship: retainedFact(
        "ordered_curve_series_parent_relationship",
      ),
      orderedCurveSeriesCount: initialAdaptiveSnapshot?.contract.factors[0]?.levels.length ?? 0,
      orderedAxisCount: initialAdaptiveSnapshot?.contract.orderedAxes.length ?? 1,
    } as EntryModuleFacts;
    return createEntryModuleTargetedFactsState(
      "ordered_curve_kinetics",
      initialDraft?.entryModuleFacts ?? entryIntent?.facts ?? retainedFacts,
    );
  });
  const entryFactsView = useMemo(
    () => entryModuleTargetedFactsViewModel(entryFactsState, "ja"),
    [entryFactsState],
  );
  const draft = useMemo<CommonCoverageDraft>(
    () => ({
      text,
      contingencyMethod,
      display,
      includeIntercept,
      xLabel,
      yLabel,
      xUnit,
      yUnit,
      xScale,
      yScale,
      showBand,
      distributionType,
      binCount,
      nonlinearModel,
      nonlinearModelExplicitlySelected,
      michaelisReadoutMeaning,
      modelRationale,
      fitSettings,
      entryModuleFacts: entryFactsState.facts,
      entryIntent,
    }),
    [
      binCount,
      contingencyMethod,
      display,
      distributionType,
      fitSettings,
      entryFactsState.facts,
      entryIntent,
      includeIntercept,
      modelRationale,
      michaelisReadoutMeaning,
      nonlinearModel,
      nonlinearModelExplicitlySelected,
      showBand,
      text,
      xLabel,
      xScale,
      xUnit,
      yLabel,
      yScale,
      yUnit,
    ],
  );
  const onDraftChangeRef = useRef(onDraftChange);
  useEffect(() => {
    onDraftChangeRef.current = onDraftChange;
  }, [onDraftChange]);
  useEffect(() => {
    onDraftChangeRef.current?.(draft);
  }, [draft]);
  const selectNonlinearModel = (modelId: NonlinearModelId) => {
    const nextDefinition = nonlinearModelDefinition(modelId);
    setNonlinearModel(modelId);
    setNonlinearModelExplicitlySelected(true);
    setModelRationale((current) =>
      !current.trim() || isGeneratedNonlinearRationale(current)
        ? nextDefinition.defaultRationale
        : current,
    );
    const generatedXLabels = [
      "X",
      ...NONLINEAR_MODEL_DEFINITIONS.map(({ suggestedXLabel }) => suggestedXLabel),
    ];
    const generatedYLabels = [
      "Y",
      ...NONLINEAR_MODEL_DEFINITIONS.map(({ suggestedYLabel }) => suggestedYLabel),
    ];
    if (!adaptiveOrderedCurveActive) {
      setXLabel((current) =>
        generatedXLabels.includes(current) ? nextDefinition.suggestedXLabel : current,
      );
      setYLabel((current) =>
        generatedYLabels.includes(current) ? nextDefinition.suggestedYLabel : current,
      );
    }
    if (NONLINEAR_MODEL_DEFINITIONS.some(({ examplePaste }) => examplePaste === text)) {
      setRawTextCaptureMode("browser_editor_value");
    }
    setText((current) =>
      NONLINEAR_MODEL_DEFINITIONS.some(({ examplePaste }) => examplePaste === current)
        ? nextDefinition.examplePaste
        : current,
    );
    setResult(null);
    setExecutedRequest(null);
  };
  const benchmarkRun = useBenchmarkRun();
  useEffect(() => {
    const identity = benchmarkRun.identity;
    setLiteratureCase(null);
    if (!import.meta.env.DEV || !identity) return;
    let cancelled = false;
    void import("../app/literatureBenchmark").then(
      ({ fetchLiteratureExperimenterCase, isLiteratureCaseId }) => {
        if (!isLiteratureCaseId(identity.caseId)) return;
        void fetchLiteratureExperimenterCase(identity)
          .then((loaded) => {
            if (!cancelled) setLiteratureCase(loaded);
          })
          .catch(() => {
            if (!cancelled) setLiteratureCase(null);
          });
      },
    );
    return () => {
      cancelled = true;
    };
  }, [benchmarkRun.identity]);

  const loadLiteratureRegression = () => {
    if (!literatureCase || mode !== "regression") return;
    const rows = literatureCase.syntheticData;
    if (!rows.length || rows.some(({ x_value }) => x_value === null)) {
      setMessage("このcaseはstable unitごとのX/Y関係を完全には保持していません。");
      return;
    }
    setText(
      [
        "Unit ID\tX\tY",
        ...rows.map((row) => [row.unit_id, row.x_value, row.value].join("\t")),
      ].join("\n"),
    );
    setXLabel("Numeric covariate");
    setYLabel(literatureCase.researcherPacket.readouts.split("||")[0]?.trim() || "Outcome");
    setResult(null);
    setExecutedRequest(null);
    setMessage(`${rows.length}件のstable X/Y identityを単回帰表へ入力しました。`);
    recordBenchmarkEvent("literature_benchmark_data_loaded", {
      caseId: literatureCase.caseId,
      mappedCells: rows.length,
      route: "simple_linear_regression",
    });
  };
  const parsed = useMemo(() => {
    try {
      if (mode === "contingency") return { kind: mode, data: parseContingencyPaste(text) } as const;
      if (mode === "repeated-nonparametric")
        return { kind: mode, data: parseMatchedLongPaste(text) } as const;
      if (mode === "regression") return { kind: mode, data: parseXyPaste(text) } as const;
      if (mode === "nonlinear-fit")
        return { kind: mode, data: parseNonlinearXyPaste(text) } as const;
      return { kind: mode, data: parseDistributionPaste(text) } as const;
    } catch (error) {
      return { error: error instanceof Error ? error.message : "入力を確認してください" } as const;
    }
  }, [mode, text]);
  const orderedCurveSeriesCount =
    !("error" in parsed) && parsed.kind === "nonlinear-fit" ? parsed.data.series.length : 0;
  useEffect(() => {
    if (
      !adaptiveOrderedCurveActive ||
      entryFactsState.facts.orderedCurveSeriesCount === orderedCurveSeriesCount
    ) {
      return;
    }
    const updated = updateEntryModuleOrderedCurveSeriesCount(
      entryFactsState,
      orderedCurveSeriesCount,
    );
    if (updated.ok) setEntryFactsState(updated.state);
  }, [adaptiveOrderedCurveActive, entryFactsState, orderedCurveSeriesCount]);
  const orderedCurveEntry = useMemo<OrderedCurveEntryResult | null>(() => {
    if (!adaptiveOrderedCurveActive || "error" in parsed || parsed.kind !== "nonlinear-fit") {
      return null;
    }
    const existingContract = persistedBaseline?.state.adaptiveInput?.contract;
    const existingLineage = persistedBaseline?.state.adaptiveInput?.rawLineage;
    return createOrderedCurveEntry({
      points: parsed.data.allPoints.map(({ observationId, unitLabel, seriesLabel, x, y }) => ({
        observationId,
        unitLabel,
        seriesLabel,
        x,
        y,
      })),
      orderedAxisMeaning: entryFactsState.facts.orderedAxisMeaning,
      axisMaterialRelationship: entryFactsState.facts.axisMaterialRelationship,
      axisPointParentRelationship: entryFactsState.facts.axisPointParentRelationship,
      orderedCurveSeriesMeaning: entryFactsState.facts.orderedCurveSeriesMeaning,
      orderedCurveSeriesParentRelationship:
        entryFactsState.facts.orderedCurveSeriesParentRelationship,
      orderedAxisCount: entryFactsState.facts.orderedAxisCount ?? 1,
      labels: {
        experimentName:
          existingContract?.experimentName ??
          (entryIntent?.experimentName.trim() || "Ordered curve experiment"),
        experimentDescription:
          existingContract?.experimentDescription ??
          (entryIntent?.experimentDescription.trim() ||
            `${yLabel.trim() || "Y"}を${xLabel.trim() || "X"}に沿ってSeriesごとに測定した実験。`),
        experimentalUnitLabel:
          existingContract?.unitLevels.find(
            ({ key }) => key === existingContract.experimentalUnitLevelKey,
          )?.label ??
          (entryIntent?.subjectUnitLabel.trim() || "Experimental unit"),
        identityLabel: existingContract?.identities[0]?.label ?? "Unit ID",
        seriesFactorLabel: existingContract?.factors[0]?.label ?? "Series",
        orderedAxisLabel: xLabel.trim(),
        readoutLabel: yLabel.trim(),
      },
      units: {
        orderedAxisUnit: xUnit.trim(),
        readoutUnit: yUnit.trim(),
      },
      experimentalUnitLabelSource:
        existingContract || entryIntent ? "explicit_researcher_fact" : "generated_placeholder",
      priorRawLineage: existingLineage,
      rawTextCaptureMode,
      rawText: text,
      sourceLabel: orderedCurveSource.sourceLabel,
      sourceKind: orderedCurveSource.sourceKind,
      now: entryCompiledAtRef.current,
    });
  }, [
    entryFactsState.facts.axisMaterialRelationship,
    entryFactsState.facts.axisPointParentRelationship,
    entryFactsState.facts.orderedCurveSeriesMeaning,
    entryFactsState.facts.orderedCurveSeriesParentRelationship,
    entryFactsState.facts.orderedAxisCount,
    entryFactsState.facts.orderedAxisMeaning,
    entryIntent,
    adaptiveOrderedCurveActive,
    orderedCurveSource.sourceKind,
    orderedCurveSource.sourceLabel,
    parsed,
    persistedBaseline,
    rawTextCaptureMode,
    text,
    xLabel,
    xUnit,
    yLabel,
    yUnit,
  ]);
  const orderedCurveRequiresRevision = useMemo(() => {
    if (orderedCurveEntry?.status !== "surface_ready" || !persistedBaseline) return false;
    const priorSnapshot = persistedBaseline.state.adaptiveInput;
    const activeDesign = persistedBaseline.state.designRevisions.find(
      ({ id }) => id === persistedBaseline.state.activeDesignRevisionId,
    )?.design;
    return (
      !priorSnapshot ||
      !activeDesign ||
      priorSnapshot.rawLineage?.rawText !== orderedCurveEntry.rawLineage.rawText ||
      JSON.stringify(priorSnapshot.contract) !== JSON.stringify(orderedCurveEntry.contract) ||
      JSON.stringify(priorSnapshot.canonicalObservations) !==
        JSON.stringify(orderedCurveEntry.canonicalObservations) ||
      JSON.stringify(activeDesign) !== JSON.stringify(orderedCurveEntry.design)
    );
  }, [orderedCurveEntry, persistedBaseline]);
  const orderedCurveWorkingRawRevisionId = persistedBaseline
    ? orderedCurveRequiresRevision
      ? nextOrderedCurveRawRevisionId(persistedBaseline.state)
      : persistedBaseline.state.activeRawRevisionId
    : "raw.nonlinear.1";
  const orderedCurveRecords = useMemo(() => {
    if (orderedCurveEntry?.status !== "surface_ready") return null;
    const existingUnitIdsByLabel = persistedBaseline
      ? Object.fromEntries(
          persistedBaseline.state.unitInstances.map(({ label, id }) => [label, id]),
        )
      : undefined;
    return projectOrderedCurveEntryToLegacyRecords(
      orderedCurveEntry,
      orderedCurveWorkingRawRevisionId,
      {
        existingUnitIdsByLabel,
        observationIdPrefix:
          orderedCurveWorkingRawRevisionId === "raw.nonlinear.1"
            ? undefined
            : orderedCurveWorkingRawRevisionId,
      },
    );
  }, [orderedCurveEntry, orderedCurveWorkingRawRevisionId, persistedBaseline]);
  const orderedCurveValidationMessage = orderedCurveStatusMessage(orderedCurveEntry);
  const orderedCurveAnalysisReadiness = useMemo(
    () =>
      resolveOrderedCurveAnalysisReadiness({
        orderedAxisMeaning: entryFactsState.facts.orderedAxisMeaning,
        axisMaterialRelationship: entryFactsState.facts.axisMaterialRelationship,
        selectedModel: nonlinearModel,
        modelExplicitlySelected: nonlinearModelExplicitlySelected,
        michaelisReadoutMeaning,
      }),
    [
      entryFactsState.facts.axisMaterialRelationship,
      entryFactsState.facts.orderedAxisMeaning,
      michaelisReadoutMeaning,
      nonlinearModel,
      nonlinearModelExplicitlySelected,
    ],
  );
  const pasteRawText = (event: ClipboardEvent<HTMLTextAreaElement>) => {
    const clipboardText = event.clipboardData.getData("text/plain");
    if (!clipboardText) return;
    event.preventDefault();
    setRawTextCaptureMode("clipboard_text_plain_exact");
    setOrderedCurveSource({ sourceKind: "clipboard", sourceLabel: "clipboard text/plain" });
    const selectionStart = event.currentTarget.selectionStart;
    const selectionEnd = event.currentTarget.selectionEnd;
    setText((current) =>
      replaceTextareaSelectionWithClipboardText(
        current,
        clipboardText,
        selectionStart,
        selectionEnd,
      ),
    );
    setResult(null);
    setExecutedRequest(null);
  };
  const loadOrderedCurveFile = async (event: ChangeEvent<HTMLInputElement>) => {
    const input = event.currentTarget;
    const file = input.files?.[0];
    if (!file) return;
    try {
      const rawText = await file.text();
      setText(rawText);
      setOrderedCurveSource({
        sourceKind: orderedCurveFileSourceKind(file),
        sourceLabel: file.name,
      });
      setRawTextCaptureMode("file_text_exact");
      setResult(null);
      setExecutedRequest(null);
      setMessage(`${file.name}を読み込みました。`);
    } catch {
      setMessage(`${file.name}を読み込めませんでした。`);
    } finally {
      input.value = "";
    }
  };
  const run = async () => {
    try {
      setMessage("解析中…");
      if ("error" in parsed) throw new Error(parsed.error);
      let request;
      if (parsed.kind === "contingency") {
        const { rowLabels, columnLabels, counts } = parsed.data;
        request = {
          protocolVersion: "0.11.0",
          requestId: "request.contingency.1",
          projectId: "project.contingency",
          analysisId: "analysis.contingency.1",
          templateId: "D14",
          templateVersion: "0.1.0",
          method: contingencyMethod,
          structure: contingencyMethod === "mcnemar_exact" ? "paired_binary" : "independent",
          experimentalUnit: "independent biological unit",
          rowCategoryIds: rowLabels.map((_, i) => `row.${i + 1}`),
          columnCategoryIds: columnLabels.map((_, i) => `column.${i + 1}`),
          cells: counts.flatMap((row, i) =>
            row.map((count, j) => ({
              rowCategoryId: `row.${i + 1}`,
              columnCategoryId: `column.${j + 1}`,
              count,
            })),
          ),
          options,
        };
      } else if (parsed.kind === "repeated-nonparametric") {
        const conditions = [...new Set(parsed.data.map(({ condition }) => condition))];
        request = {
          protocolVersion: "0.12.0",
          requestId: "request.friedman.1",
          projectId: "project.friedman",
          analysisId: "analysis.friedman.1",
          templateId: "D15",
          templateVersion: "0.1.0",
          method: "friedman",
          conditionIds: conditions.map((_, i) => `condition.${i + 1}`),
          observations: parsed.data.map((row, i) => ({
            observationId: `observation.${i + 1}`,
            conditionId: `condition.${conditions.indexOf(row.condition) + 1}`,
            experimentalUnitId: row.unitId,
            pairId: row.unitId,
            value: row.value,
          })),
          options: { ...options, multiplicityMethod: "holm_wilcoxon_all_pairs" },
        };
      } else if (parsed.kind === "regression") {
        request = {
          protocolVersion: "0.13.0",
          requestId: "request.regression.1",
          projectId: "project.regression",
          analysisId: "analysis.regression.1",
          templateId: "D16",
          templateVersion: "0.1.0",
          method: "simple_linear_regression",
          xLabel,
          yLabel,
          xUnit: "",
          yUnit: "",
          includeIntercept,
          points: parsed.data.map((row, i) => ({
            observationId: `observation.${i + 1}`,
            experimentalUnitId: row.unitId,
            x: row.x,
            y: row.y,
          })),
          options,
        };
      } else if (parsed.kind === "nonlinear-fit") {
        if (
          adaptiveOrderedCurveActive &&
          (orderedCurveEntry?.status !== "surface_ready" || !orderedCurveRecords)
        ) {
          throw new Error(
            orderedCurveValidationMessage ??
              "実験構造を確定できないため、別のdesignへ変換せずfitを停止しました。",
          );
        }
        if (adaptiveOrderedCurveActive && orderedCurveAnalysisReadiness.status !== "ready") {
          throw new Error(orderedCurveAnalysisReadiness.message.ja);
        }
        if (!modelRationale.trim())
          throw new Error("model selectionの科学的理由を記録してください");
        if (nonlinearDefinition.requiresAxisUnits && (!xUnit.trim() || !yUnit.trim())) {
          throw new Error(
            "Michaelis–Menten fitでは、基質濃度と反応初速度の単位を両方入力してください",
          );
        }
        if (nonlinearModel === "michaelis_menten" && parsed.data.points.some(({ x }) => x < 0)) {
          throw new Error(
            "Michaelis–Menten fitの基質濃度Xは0以上にしてください。入力値は削除していません。",
          );
        }
        const initialTemplate: Record<string, number> = {};
        const boundsTemplate: Record<string, { lower: number; upper: number }> = {};
        for (const parameter of nonlinearDefinition.parameters) {
          const setting = fitSettings[parameter];
          const parameterLabel = nonlinearParameterLabel(nonlinearModel, parameter);
          const initial = finiteOptional(setting.initial, `${parameterLabel} initial value`);
          const lower = finiteOptional(setting.lower, `${parameterLabel} lower bound`);
          const upper = finiteOptional(setting.upper, `${parameterLabel} upper bound`);
          if ((lower === undefined) !== (upper === undefined)) {
            throw new Error(`${parameterLabel}のboundはlowerとupperを両方指定してください`);
          }
          if (lower !== undefined && upper !== undefined && lower >= upper) {
            throw new Error(`${parameterLabel}のboundはlower < upperにしてください`);
          }
          if (
            nonlinearModel === "michaelis_menten" &&
            ((initial !== undefined && initial <= 0) ||
              (lower !== undefined && lower < 0) ||
              (upper !== undefined && upper <= 0))
          ) {
            throw new Error(
              `${parameterLabel}は正のinitial、0以上のlower、正のupperを指定してください`,
            );
          }
          if (initial !== undefined) initialTemplate[parameter] = initial;
          if (lower !== undefined && upper !== undefined) {
            boundsTemplate[parameter] = { lower, upper };
          }
        }
        const executionOrdinal =
          (persistedBaseline?.state.analysisRuns.filter(
            ({ request: priorRequest }) => priorRequest.protocolVersion === "0.14.0",
          ).length ?? 0) + 1;
        const requestSeries = orderedCurveRecords?.series ?? parsed.data.series;
        const requestPoints = orderedCurveRecords?.points ?? parsed.data.points;
        request = {
          protocolVersion: "0.14.0",
          requestId: `request.nonlinear.${executionOrdinal}`,
          projectId:
            adaptiveOrderedCurveActive && orderedCurveEntry?.status === "surface_ready"
              ? `project.${orderedCurveEntry.contract.contractId}`
              : "project.nonlinear",
          analysisId: `analysis.nonlinear.${executionOrdinal}`,
          templateId: "D17",
          templateVersion: nonlinearDefinition.templateVersion,
          method: "nonlinear_xy_fit",
          modelId: nonlinearModel,
          modelSelectionRationale: modelRationale.trim(),
          xLabel: xLabel.trim() || "X",
          yLabel: yLabel.trim() || "Y",
          xUnit: xUnit.trim(),
          yUnit: yUnit.trim(),
          seriesIds: requestSeries.map(({ id }) => id),
          points: requestPoints,
          initialValues: Object.fromEntries(
            requestSeries.map(({ id }) => [id, { ...initialTemplate }]),
          ),
          bounds: Object.fromEntries(requestSeries.map(({ id }) => [id, { ...boundsTemplate }])),
          observations: [],
          options,
        };
      } else
        throw new Error(
          "Distribution Graph is exploratory and does not automatically run an inferential test",
        );
      const validated = AnalysisEngineRequestSchema.parse(request);
      const next = await analysisRunner(validated);
      setExecutedRequest(validated);
      setResult(next);
      recordBenchmarkEvent("statistics_executed", {
        method: validated.method,
        recommendedMethod: validated.method,
        recommendationDiffers: false,
        recommendationReasonCode:
          parsed.kind === "regression"
            ? "explicit_numeric_covariate"
            : parsed.kind === "nonlinear-fit"
              ? nonlinearDefinition.recommendationReasonCode
              : "explicit_core_route",
        recommendationExplanation:
          parsed.kind === "regression"
            ? `The paired ${xLabel || "numeric covariate"} and ${yLabel || "outcome"} values are modeled at the stable experimental-unit level.`
            : parsed.kind === "nonlinear-fit"
              ? modelRationale.trim()
              : "The explicitly selected Core route matches the entered data structure.",
        recommendationDecision: null,
        recommendationSelectedMethod: validated.method,
        contrast:
          parsed.kind === "regression"
            ? "slope"
            : parsed.kind === "nonlinear-fit"
              ? `model:${nonlinearModel}`
              : null,
        protocolVersion: validated.protocolVersion,
        engineVersion: next.engine.version,
      });
      setMessage("解析とprovenance記録が完了しました。");
    } catch (error) {
      setExecutedRequest(null);
      setResult(null);
      setMessage(error instanceof Error ? error.message : "解析できませんでした");
    }
  };
  let graph: React.ReactNode = null;
  let graphExportAvailable = false;
  try {
    if (!("error" in parsed) && parsed.kind === "contingency") {
      graph = <CountGraph ref={svgRef} {...parsed.data} display={display} />;
      graphExportAvailable = true;
    }
    if (!("error" in parsed) && parsed.kind === "distribution") {
      validateGraphScale(parsed.data, xScale, "X");
      const model =
        distributionType === "histogram"
          ? createHistogramModel(parsed.data, binCount ? Number(binCount) : undefined)
          : createEcdfModel(parsed.data);
      createDistributionGraphSpec({
        graphId: "graph.distribution.1",
        type: distributionType,
        dataSource: { kind: "raw_revision", id: "raw.1", revision: "raw.1" },
        xLabel,
        xScale,
        binCount: "binCount" in model ? model.binCount : null,
        binWidth: "binWidth" in model ? model.binWidth : null,
      });
      graph = (
        <DistributionGraph
          ref={svgRef}
          model={model}
          type={distributionType}
          xLabel={xLabel}
          xScale={xScale}
        />
      );
      graphExportAvailable = true;
    }
    if (!("error" in parsed) && parsed.kind === "regression" && result?.regression) {
      const spec = createRegressionGraphSpec({
        graphId: "graph.regression.1",
        dataSource: { kind: "analysis_result", id: result.requestId, revision: result.requestId },
        analysisResultId: result.requestId,
        xLabel,
        yLabel,
        xScale,
        yScale,
      });
      const points = parsed.data.map(({ unitId, x, y }) => ({ experimentalUnitId: unitId, x, y }));
      graph = (
        <RegressionGraph
          ref={svgRef}
          model={createRegressionGraphModel(spec, points, result, showBand)}
          xLabel={xLabel}
          yLabel={yLabel}
          xScale={xScale}
          yScale={yScale}
        />
      );
      graphExportAvailable = true;
    }
    if (!("error" in parsed) && parsed.kind === "nonlinear-fit" && parsed.data.points.length > 0) {
      const graphSeries = orderedCurveRecords?.series ?? parsed.data.series;
      const graphPoints = orderedCurveRecords?.points ?? parsed.data.points;
      const fittedModel = result?.nonlinearFit
        ? createNonlinearFitGraphModel(
            createNonlinearFitGraphSpec({
              graphId: "graph.nonlinear.1",
              dataSource: {
                kind: "analysis_result",
                id: result.requestId,
                revision: result.requestId,
              },
              analysisResultId: result.requestId,
              xLabel: xLabel.trim() || "X",
              yLabel: yLabel.trim() || "Y",
              seriesIds: graphSeries.map(({ id }) => id),
            }),
            graphPoints,
            result,
          )
        : {
            modelId: "observed_only",
            series: graphSeries.map(({ id }) => ({
              seriesId: id,
              points: graphPoints.filter(({ seriesId }) => seriesId === id),
              fittedCurve: [],
            })),
          };
      graph = (
        <NonlinearFitGraph
          ref={svgRef}
          model={fittedModel}
          displayMode={result?.nonlinearFit ? "fitted" : "observed_only"}
          xLabel={`${xLabel.trim() || "X"}${xUnit.trim() ? ` (${xUnit.trim()})` : ""}`}
          yLabel={`${yLabel.trim() || "Y"}${yUnit.trim() ? ` (${yUnit.trim()})` : ""}`}
          seriesLabels={Object.fromEntries(
            graphSeries.map(({ id, label: seriesLabel }) => [id, seriesLabel]),
          )}
        />
      );
      graphExportAvailable = true;
    }
  } catch (error) {
    graph = <p role="alert">{error instanceof Error ? error.message : "Graphを表示できません"}</p>;
  }
  const nonlinearRecommendation: AnalysisRecommendation | null =
    executedRequest?.protocolVersion === "0.14.0"
      ? {
          templateId: "D17",
          templateVersion: executedRequest.templateVersion,
          recommendedMethod: "nonlinear_xy_fit",
          alternativeMethods: [],
          reasonCode: nonlinearModelDefinition(executedRequest.modelId).recommendationReasonCode,
          explanation: executedRequest.modelSelectionRationale,
          statisticalNDefinition: !adaptiveOrderedCurveActive
            ? `${new Set(executedRequest.points.map(({ experimentalUnitId }) => experimentalUnitId)).size} stable units; observed XY points are retained separately from fitted curves`
            : entryFactsState.facts.axisMaterialRelationship ===
                "same_physical_material_across_axis"
              ? `${new Set(executedRequest.points.map(({ experimentalUnitId }) => experimentalUnitId)).size} stable reaction/subject IDs followed across X; repeated XY points are not counted as separate units`
              : `${new Set(executedRequest.points.map(({ experimentalUnitId }) => experimentalUnitId)).size} distinct reaction/sample records; biological independence is not inferred from separate material alone`,
          multiplicityMethod: null,
          decision: { kind: "accepted", selectedMethod: "nonlinear_xy_fit" },
        }
      : null;
  const nonlinearDesignData =
    orderedCurveEntry?.status === "surface_ready" && orderedCurveRecords
      ? {
          design: orderedCurveEntry.design,
          units: orderedCurveRecords.units,
          observations: orderedCurveRecords.observations,
          outcomeId: orderedCurveRecords.outcomeId,
          snapshot: withOrderedCurveAnalysisProvenance(
            orderedCurveEntry.snapshot,
            {
              modelId: nonlinearModelExplicitlySelected ? nonlinearModel : undefined,
              michaelisReadoutMeaning:
                nonlinearModel === "michaelis_menten" ? michaelisReadoutMeaning : undefined,
            },
            entryCompiledAtRef.current,
          ),
        }
      : null;
  const legacyNonlinearDesignData =
    !adaptiveOrderedCurveActive &&
    !("error" in parsed) &&
    parsed.kind === "nonlinear-fit" &&
    executedRequest?.protocolVersion === "0.14.0"
      ? createLegacyNonlinearDesignData(parsed.data, {
          xLabel: executedRequest.xLabel,
          yLabel: executedRequest.yLabel,
          yUnit: executedRequest.yUnit,
          modelId: executedRequest.modelId as NonlinearModelId,
          rationale: executedRequest.modelSelectionRationale,
          createdAt: result?.completedAt ?? new Date().toISOString(),
        })
      : null;
  const nonlinearSpec =
    result && executedRequest?.protocolVersion === "0.14.0"
      ? createNonlinearFitGraphSpec({
          graphId: "graph.nonlinear.1",
          dataSource: { kind: "analysis_result", id: result.requestId, revision: result.requestId },
          analysisResultId: result.requestId,
          xLabel: executedRequest.xLabel,
          yLabel: executedRequest.yLabel,
          seriesIds: executedRequest.seriesIds,
        })
      : null;
  const methods =
    result && executedRequest
      ? executedRequest.protocolVersion === "0.14.0" &&
        nonlinearRecommendation &&
        (nonlinearDesignData || legacyNonlinearDesignData)
        ? generateMethodsText({
            design: (nonlinearDesignData ?? legacyNonlinearDesignData)!.design,
            recommendation: nonlinearRecommendation,
            request: executedRequest,
            result,
            graphSpec: nonlinearSpec,
            outcomeId: (nonlinearDesignData ?? legacyNonlinearDesignData)!.outcomeId,
          })
        : generateCommonCoverageMethods(executedRequest, result)
      : null;

  const saveNonlinearProject = async () => {
    if (!saveProject) {
      setMessage("デスクトップ版で保存できます。");
      return;
    }
    if (!adaptiveOrderedCurveActive) {
      if (
        !result ||
        executedRequest?.protocolVersion !== "0.14.0" ||
        !nonlinearRecommendation ||
        !legacyNonlinearDesignData ||
        !nonlinearSpec
      ) {
        setMessage("先に非線形fitを実行してください。");
        return;
      }
      try {
        const createdAt = result.completedAt;
        await saveProject(
          createInitialProjectState({
            metadata: {
              projectId: "project.nonlinear",
              projectName: "Nonlinear XY fitting",
              experimentDate: createdAt.slice(0, 10),
              createdAt,
              updatedAt: createdAt,
            },
            design: legacyNonlinearDesignData.design,
            rawRevision: {
              id: "raw.nonlinear.1",
              previousRevisionId: null,
              sourceKind: "paste",
              createdAt,
              createdBy: "researcher",
              note: "Observed X/Y points retained separately from the authoritative D17 fit result.",
            },
            unitInstances: legacyNonlinearDesignData.units,
            observations: legacyNonlinearDesignData.observations,
            actor: "researcher",
            analysis: {
              recommendation: nonlinearRecommendation,
              request: executedRequest,
              result,
              graphSpec: nonlinearSpec,
            },
          }),
        );
        setMessage(
          "model、parameter、診断、raw points、saved fit curveをプロジェクトへ保存しました。",
        );
      } catch (error) {
        setMessage(error instanceof Error ? error.message : "プロジェクトを保存できませんでした");
      }
      return;
    }
    if (!nonlinearDesignData || orderedCurveEntry?.status !== "surface_ready") {
      setMessage(
        orderedCurveValidationMessage ??
          "実験構造を確定できないため、別のdesignへ変換せず保存を停止しました。",
      );
      return;
    }
    try {
      const analysisPayload =
        result &&
        executedRequest?.protocolVersion === "0.14.0" &&
        nonlinearRecommendation &&
        nonlinearSpec
          ? {
              recommendation: nonlinearRecommendation,
              request: executedRequest,
              result,
              graphSpec: nonlinearSpec,
            }
          : null;
      const savedAt = new Date().toISOString();
      const projectName =
        entryIntent?.experimentName.trim() ||
        persistedBaseline?.state.metadata.projectName ||
        nonlinearModelLabel(
          executedRequest?.protocolVersion === "0.14.0" ? executedRequest.modelId : nonlinearModel,
        );
      let projectState: ProjectState;
      if (!persistedBaseline) {
        const createdAt = result?.completedAt ?? savedAt;
        const base = createInitialProjectState({
          metadata: {
            projectId: `project.${orderedCurveEntry.contract.contractId}`,
            projectName,
            experimentDate: createdAt.slice(0, 10),
            createdAt,
            updatedAt: savedAt,
          },
          design: nonlinearDesignData.design,
          rawRevision: {
            id: orderedCurveWorkingRawRevisionId,
            previousRevisionId: null,
            sourceKind:
              nonlinearDesignData.snapshot.rawLineage?.sourceKind === "clipboard" ? "paste" : "csv",
            sourceName: nonlinearDesignData.snapshot.rawLineage?.sourceLabel,
            createdAt,
            createdBy: "researcher",
            note: analysisPayload
              ? "Observed X/Y points retained separately from the authoritative D17 fit result."
              : "Observed X/Y points retained before optional nonlinear fitting; observed-only Graph is regenerated deterministically from these rows.",
          },
          unitInstances: [...nonlinearDesignData.units],
          observations: [...nonlinearDesignData.observations],
          actor: "researcher",
          ...(analysisPayload ? { analysis: analysisPayload } : {}),
        });
        projectState = ProjectStateSchema.parse({
          ...base,
          adaptiveInput: nonlinearDesignData.snapshot,
        });
      } else {
        const baseline = ProjectStateSchema.parse(persistedBaseline.state);
        if (!baseline.adaptiveInput) {
          throw new Error("ORDERED_CURVE_EXISTING_ADAPTIVE_SNAPSHOT_MISSING");
        }
        if (baseline.metadata.projectId !== `project.${orderedCurveEntry.contract.contractId}`) {
          throw new Error("ORDERED_CURVE_PROJECT_CONTRACT_ID_MISMATCH");
        }
        const activeDesign = baseline.designRevisions.find(
          ({ id }) => id === baseline.activeDesignRevisionId,
        )?.design;
        if (!activeDesign) throw new Error("ORDERED_CURVE_ACTIVE_DESIGN_MISSING");
        const designChanged =
          JSON.stringify(activeDesign) !== JSON.stringify(orderedCurveEntry.design);
        let revised = ProjectStateSchema.parse({ ...baseline, adaptiveInput: null });
        if (designChanged) {
          revised = appendDesignRevision(revised, orderedCurveEntry.design, "researcher", savedAt);
        }
        if (orderedCurveRequiresRevision) {
          revised = appendRawRevision(
            revised,
            {
              id: orderedCurveWorkingRawRevisionId,
              previousRevisionId: revised.activeRawRevisionId,
              sourceKind: "project_edit",
              sourceName: nonlinearDesignData.snapshot.rawLineage?.sourceLabel,
              createdAt: savedAt,
              createdBy: "researcher",
              note: "Editable ordered-curve raw table revision",
            },
            [...nonlinearDesignData.units],
            [...nonlinearDesignData.observations],
            "researcher",
          );
        }
        revised = ProjectStateSchema.parse({
          ...revised,
          metadata: { ...revised.metadata, projectName, updatedAt: savedAt },
          adaptiveInput: nonlinearDesignData.snapshot,
        });
        if (
          analysisPayload &&
          !revised.analysisRuns.some(
            ({ request: priorRequest }) =>
              priorRequest.requestId === analysisPayload.request.requestId,
          )
        ) {
          revised = appendAnalysisExecution(revised, analysisPayload, "researcher");
        }
        projectState = ProjectStateSchema.parse({
          ...revised,
          metadata: { ...revised.metadata, projectName, updatedAt: savedAt },
          adaptiveInput: nonlinearDesignData.snapshot,
        });
      }
      const saved = await saveProject(projectState, persistedBaseline?.target);
      if (saved) setPersistedBaseline(saved);
      setMessage(
        analysisPayload
          ? "model、parameter、診断、raw points、saved fit curveをプロジェクトへ保存しました。"
          : "raw points、観測Graphを再現するStructureContract、入力lineageをプロジェクトへ保存しました。",
      );
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "プロジェクトを保存できませんでした");
    }
  };
  const benchmarkAnalysisState = JSON.stringify({
    mode,
    request: executedRequest,
    result,
    graph: { xLabel, yLabel, xScale, yScale, showBand },
  });

  useLayoutEffect(() => {
    if (
      !import.meta.env.DEV ||
      mode !== "regression" ||
      !result ||
      !executedRequest ||
      !benchmarkRun.identity ||
      benchmarkRun.defaultGraphCapture ||
      !svgRef.current
    )
      return;
    void (async () => {
      try {
        const capturedAt = new Date().toISOString();
        if (!beginDefaultGraphCapture(capturedAt)) return;
        const svg = svgRef.current;
        if (!svg) return;
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
        setMessage("Benchmarkの既定Regression Graphを保存しました。");
      } catch {
        setBenchmarkOutcome("infrastructure_failure");
        setMessage("既定Regression Graphの評価artifactを保存できませんでした。");
      }
    })();
  }, [
    benchmarkAnalysisState,
    benchmarkRun.defaultGraphCapture,
    benchmarkRun.identity,
    executedRequest,
    mode,
    result,
  ]);

  const finalizeRegressionBenchmark = async () => {
    const svg = svgRef.current;
    const runState = currentBenchmarkRun();
    if (
      mode !== "regression" ||
      !svg ||
      !result ||
      !executedRequest ||
      !methods ||
      !runState.identity ||
      !runState.supportStatus ||
      !runState.defaultGraphCaptured
    ) {
      setMessage("完了前に解析、Default Graph保存、Scientific support選択を完了してください。");
      return;
    }
    try {
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
        selectedGraph: "simple_linear_regression",
        selectedStatistics: executedRequest.method,
      });
      const finalRun = currentBenchmarkRun();
      const graphState = {
        graphType: "simple_linear_regression",
        xLabel,
        yLabel,
        xScale,
        yScale,
        showBand,
        analysis: { request: executedRequest, result },
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
                recommendedMethod: "simple_linear_regression",
                selectedMethod: executedRequest.method,
                correction: executedRequest.options.multiplicityMethod,
                request: executedRequest,
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
          { name: "interaction_log.json", content: JSON.stringify(finalRun.events, null, 2) },
        ],
        { requiredArtifacts: COMPLETE_BENCHMARK_ARTIFACT_NAMES },
      );
      setMessage("Regression benchmark runの9 artifactsを保存しました。");
    } catch {
      setBenchmarkOutcome("infrastructure_failure");
      setMessage("Regression benchmark artifactを保存できませんでした。");
    }
  };
  const nonlinearAxisFields =
    mode === "nonlinear-fit" ? (
      <div className="nonlinear-fit-axis-fields">
        <label>
          {adaptiveOrderedCurveActive ? "横方向に変えたものの名前" : "X label"}
          <input
            aria-label={adaptiveOrderedCurveActive ? "横方向に変えたものの名前" : "X label"}
            value={xLabel}
            placeholder={
              adaptiveOrderedCurveActive
                ? "例：経過時間、基質濃度"
                : nonlinearDefinition.suggestedXLabel
            }
            onChange={(event) => {
              setXLabel(event.target.value);
              setResult(null);
              setExecutedRequest(null);
            }}
          />
        </label>
        <label>
          {adaptiveOrderedCurveActive
            ? "横方向の単位（ない場合は空欄）"
            : `X unit${nonlinearDefinition.requiresAxisUnits ? "（必須）" : ""}`}
          <input
            aria-label={adaptiveOrderedCurveActive ? "横方向の単位" : "X unit"}
            value={xUnit}
            placeholder={nonlinearDefinition.xUnitExample}
            onChange={(event) => {
              setXUnit(event.target.value);
              setResult(null);
              setExecutedRequest(null);
            }}
          />
        </label>
        <label>
          {adaptiveOrderedCurveActive ? "測った値の名前" : "Y label"}
          <input
            aria-label={adaptiveOrderedCurveActive ? "測った値の名前" : "Y label"}
            value={yLabel}
            placeholder={
              adaptiveOrderedCurveActive
                ? "例：反応初速度、蛍光強度"
                : nonlinearDefinition.suggestedYLabel
            }
            onChange={(event) => {
              setYLabel(event.target.value);
              setResult(null);
              setExecutedRequest(null);
            }}
          />
        </label>
        <label>
          {adaptiveOrderedCurveActive
            ? "測った値の単位（ない場合は空欄）"
            : `Y unit${nonlinearDefinition.requiresAxisUnits ? "（必須）" : ""}`}
          <input
            aria-label={adaptiveOrderedCurveActive ? "測った値の単位" : "Y unit"}
            value={yUnit}
            placeholder={nonlinearDefinition.yUnitExample}
            onChange={(event) => {
              setYUnit(event.target.value);
              setResult(null);
              setExecutedRequest(null);
            }}
          />
        </label>
      </div>
    ) : null;
  const nonlinearFitSettings =
    mode === "nonlinear-fit" ? (
      <div className="nonlinear-fit-settings">
        <fieldset>
          <legend>Fit model</legend>
          {NONLINEAR_MODEL_DEFINITIONS.map((definition) => (
            <label key={definition.id}>
              <input
                type="radio"
                name="nonlinear-model"
                value={definition.id}
                checked={
                  nonlinearModel === definition.id &&
                  (!adaptiveOrderedCurveActive || nonlinearModelExplicitlySelected)
                }
                onChange={() => selectNonlinearModel(definition.id)}
              />
              <span>
                <strong>{definition.label}</strong>
                <small>{definition.shortDescription}</small>
                <small>{definition.formula}</small>
              </span>
            </label>
          ))}
        </fieldset>
        {nonlinearModel === "michaelis_menten" ? (
          <>
            <p className="callout-info">
              Xには基質濃度、Yには各濃度で求めた反応初速度を入力します。吸光度などの時系列をそのまま入力する欄ではありません。
            </p>
            {adaptiveOrderedCurveActive && nonlinearModelExplicitlySelected ? (
              <label>
                Yに入力した値は、各基質濃度で求めた反応初速度ですか？
                <select
                  aria-label="Michaelis–MentenのY値"
                  value={michaelisReadoutMeaning ?? ""}
                  onChange={(event) => {
                    setMichaelisReadoutMeaning(
                      (event.target.value || undefined) as MichaelisReadoutMeaning | undefined,
                    );
                    setResult(null);
                    setExecutedRequest(null);
                  }}
                >
                  <option value="">選択してください</option>
                  <option value="calculated_initial_velocity">
                    はい。各濃度の反応初速度を計算した値
                  </option>
                  <option value="raw_time_series_or_other">
                    いいえ。吸光度などの時系列、または別の値
                  </option>
                  <option value="unknown">判断できない</option>
                </select>
              </label>
            ) : null}
          </>
        ) : null}
        {adaptiveOrderedCurveActive ? (
          <p className="specialized-engine-note" role="status">
            {orderedCurveAnalysisReadiness.message.ja}
          </p>
        ) : null}
        <label>
          Model selectionの理由
          <textarea
            aria-label="Model selectionの理由"
            rows={3}
            value={modelRationale}
            onChange={(event) => {
              setModelRationale(event.target.value);
              setResult(null);
              setExecutedRequest(null);
            }}
          />
        </label>
        {!adaptiveOrderedCurveActive ? nonlinearAxisFields : null}
        <details>
          <summary>Initial values / bounds（必要な場合のみ）</summary>
          <p>
            指定値は各seriesへ適用し、requestとprovenanceに保存します。空欄はengineのdeterministic
            defaultです。
          </p>
          <div className="nonlinear-fit-parameter-scroll">
            <table className="nonlinear-fit-parameter-inputs">
              <thead>
                <tr>
                  <th>Parameter</th>
                  <th>Initial</th>
                  <th>Lower</th>
                  <th>Upper</th>
                </tr>
              </thead>
              <tbody>
                {nonlinearDefinition.parameters.map((parameter) => (
                  <tr key={parameter}>
                    <th scope="row">{nonlinearParameterLabel(nonlinearModel, parameter)}</th>
                    {(["initial", "lower", "upper"] as const).map((field) => (
                      <td key={field}>
                        <input
                          aria-label={`${parameter} ${field}`}
                          inputMode="decimal"
                          value={fitSettings[parameter][field]}
                          onChange={(event) => {
                            setFitSettings((current) => ({
                              ...current,
                              [parameter]: {
                                ...current[parameter],
                                [field]: event.target.value,
                              },
                            }));
                            setResult(null);
                            setExecutedRequest(null);
                          }}
                        />
                      </td>
                    ))}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </details>
      </div>
    ) : null;
  const nonlinearRunButton = (
    <button
      className="analysis-run-button"
      type="button"
      disabled={
        !analysisAvailable ||
        "error" in parsed ||
        parsed.kind !== "nonlinear-fit" ||
        parsed.data.points.length === 0 ||
        (adaptiveOrderedCurveActive &&
          (orderedCurveEntry?.status !== "surface_ready" ||
            orderedCurveAnalysisReadiness.status !== "ready"))
      }
      onClick={() => void run()}
    >
      選択したmodelでfitを実行
    </button>
  );
  const nonlinearSaveButton = (
    <button
      type="button"
      aria-describedby={!saveProject ? "nonlinear-save-unavailable-note" : undefined}
      disabled={
        !saveProject ||
        (adaptiveOrderedCurveActive
          ? orderedCurveEntry?.status !== "surface_ready"
          : !result?.nonlinearFit)
      }
      onClick={() => void saveNonlinearProject()}
    >
      {result?.nonlinearFit
        ? "fit結果をプロジェクトへ保存"
        : adaptiveOrderedCurveActive
          ? "入力と観測Graphをプロジェクトへ保存"
          : "fit結果をプロジェクトへ保存"}
    </button>
  );
  const nonlinearSaveUnavailableNote = !saveProject ? (
    <p
      id="nonlinear-save-unavailable-note"
      className="specialized-engine-note"
      role="note"
    >
      このブラウザレビューではプロジェクトを保存できません。デスクトップ版で利用できます。
    </p>
  ) : null;
  const graphExportButton = (
    <button
      type="button"
      disabled={!graphExportAvailable}
      onClick={() =>
        svgRef.current &&
        downloadTextFile(serializeGraphSvg(svgRef.current), `${mode}.svg`, "image/svg+xml")
      }
    >
      SVGを書き出す
    </button>
  );
  const orderedCurveFactPanel = adaptiveOrderedCurveActive ? (
    <section className="callout-info" aria-label="曲線データの測定方法">
      <strong>入力表を決めるための確認</strong>
      <p>{entryFactsView.summary}</p>
      {entryFactsView.questions.map((question) => (
        <label key={question.key}>
          {question.question}
          <select
            aria-label={question.question}
            value={question.selectedValue ?? ""}
            onChange={(event) => {
              const updated = updateEntryModuleTargetedFact(
                entryFactsState,
                question.key,
                event.target.value || null,
              );
              if (updated.ok) {
                if (
                  question.key === "axis_material_relationship" &&
                  (isGeneratedCurveExample(text) || isGenericOrderedCurveExample(text)) &&
                  (event.target.value === "same_physical_material_across_axis" ||
                    event.target.value === "separate_material_per_axis_value")
                ) {
                  const relationship = event.target.value as
                    "same_physical_material_across_axis" | "separate_material_per_axis_value";
                  setText(
                    entryIntent && isGenericOrderedCurveExample(text)
                      ? genericOrderedCurveExample(relationship)
                      : generatedCurveExample(nonlinearDefinition, relationship),
                  );
                  setRawTextCaptureMode("browser_editor_value");
                }
                setEntryFactsState(updated.state);
                setResult(null);
                setExecutedRequest(null);
              }
            }}
          >
            <option value="">選択してください</option>
            {question.choices.map((choice) => (
              <option key={choice.value} value={choice.value}>
                {choice.label}
              </option>
            ))}
          </select>
        </label>
      ))}
      <label>
        <input
          type="checkbox"
          checked={(entryFactsState.facts.orderedAxisCount ?? 1) > 1}
          onChange={(event) => {
            const updated = updateEntryModuleOrderedAxisCount(
              entryFactsState,
              event.target.checked ? 2 : 1,
            );
            if (updated.ok) {
              setEntryFactsState(updated.state);
              setResult(null);
              setExecutedRequest(null);
            }
          }}
        />{" "}
        時間と濃度など、順序のある量を2つ以上同時に変えた
      </label>
      <small>
        入力したX/Y値は回答を変更しても保持します。未対応構造を別の曲線へ自動変換しません。
      </small>
    </section>
  ) : null;
  return (
    <div className="page-stack specialized-analysis-page">
      <button className="back-link" type="button" onClick={onBack}>
        ← 戻る
      </button>
      {adaptiveOrderedCurveActive ? null : (
        <AnalysisRouteSwitcher current={mode} onNavigate={onNavigate} />
      )}
      <section className="workspace-panel specialized-workspace-panel">
        <p className="overline">{adaptiveOrderedCurveActive ? "実験から入力" : "専門解析"}</p>
        <h1>
          {entryIntent?.experimentName ??
            (adaptiveOrderedCurveActive ? initialProject?.state.metadata.projectName : undefined) ??
            titles[mode]}
        </h1>
        <p>
          {mode === "contingency"
            ? "独立した実験単位の整数count、または対応binaryの2×2遷移表だけを入力します。percentageをcountへ変換しません。"
            : mode === "repeated-nonparametric"
              ? "同じ生物学的単位のIDを保ったままFriedman検定とHolm補正済みWilcoxon比較を行います。"
              : mode === "regression"
                ? "相関とは別にOLS回帰を実行します。切片は既定で推定します。"
                : mode === "nonlinear-fit"
                  ? adaptiveOrderedCurveActive
                    ? "横方向に変えたものと試料の対応を確認してX/Yを入力すると、まず観測点をGraphに表示します。必要な場合だけ「統計解析を設定」からmodelを選びます。入力した値は確認内容を変更しても保持します。"
                    : "入力直後は観測点を表示し、fit後は保存可能なfit曲線を重ねます。見た目の変更では再計算しません。"
                  : "元の個別値を保持した探索的Graphです。検定は自動追加しません。"}
        </p>
        {import.meta.env.DEV && mode === "regression" && literatureCase ? (
          <section className="benchmark-pilot-loader" aria-label="Literature単回帰合成値">
            <div>
              <strong>{literatureCase.caseId}</strong>
              <span>stable unitごとのX/Y関係を単回帰表へ入力します。</span>
            </div>
            <button type="button" onClick={loadLiteratureRegression}>
              このLiterature caseを単回帰表へ入力
            </button>
          </section>
        ) : null}
        {orderedCurveFactPanel}
        {adaptiveOrderedCurveActive ? nonlinearAxisFields : null}
        <textarea
          aria-label={`${dataLabels[mode]} data`}
          rows={9}
          value={text}
          onPaste={pasteRawText}
          onChange={(e) => {
            setRawTextCaptureMode("browser_editor_value");
            setText(e.target.value);
            setResult(null);
            setExecutedRequest(null);
          }}
          style={{ width: "100%", fontFamily: "monospace" }}
        />
        {adaptiveOrderedCurveActive ? (
          <label>
            CSV / TSV / TXTを読み込む
            <input
              aria-label="CSV / TSV / TXTを読み込む"
              type="file"
              accept=".csv,.tsv,.txt,text/csv,text/tab-separated-values,text/plain"
              onChange={(event) => void loadOrderedCurveFile(event)}
            />
          </label>
        ) : null}
        {adaptiveOrderedCurveActive && entryIntent ? (
          <button
            type="button"
            disabled={
              entryFactsState.facts.axisMaterialRelationship !==
                "same_physical_material_across_axis" &&
              entryFactsState.facts.axisMaterialRelationship !== "separate_material_per_axis_value"
            }
            onClick={() => {
              const relationship = entryFactsState.facts.axisMaterialRelationship;
              if (
                relationship !== "same_physical_material_across_axis" &&
                relationship !== "separate_material_per_axis_value"
              )
                return;
              setRawTextCaptureMode("browser_editor_value");
              setOrderedCurveSource({
                sourceKind: "tsv",
                sourceLabel: "synthetic-example.tsv",
              });
              setText(genericOrderedCurveExample(relationship));
              setResult(null);
              setExecutedRequest(null);
            }}
          >
            入力形式の例を読み込む（合成値）
          </button>
        ) : null}
        {mode === "nonlinear-fit" &&
        !adaptiveOrderedCurveActive &&
        text.trim() === ORDERED_CURVE_HEADER ? (
          <button
            type="button"
            onClick={() => {
              setRawTextCaptureMode("browser_editor_value");
              setText(nonlinearModelDefinition(nonlinearModel).examplePaste);
              setResult(null);
              setExecutedRequest(null);
            }}
          >
            入力形式の例を読み込む（合成値）
          </button>
        ) : null}
        {adaptiveOrderedCurveActive ? (
          <small>
            {entryFactsState.facts.axisMaterialRelationship === "same_physical_material_across_axis"
              ? "同じ反応・対象の行では、Xが変わっても同じUnit IDを使います。"
              : entryFactsState.facts.axisMaterialRelationship ===
                  "separate_material_per_axis_value"
                ? "X点ごとに別の反応・試料を用意した行には、それぞれのUnit IDを付けます。"
                : "上の2項目を選ぶと、Unit IDの付け方を例に反映します。"}
          </small>
        ) : null}
        {mode === "contingency" ? (
          <>
            <label>
              Analysis{" "}
              <select
                value={contingencyMethod}
                onChange={(e) => setContingencyMethod(e.target.value as typeof contingencyMethod)}
              >
                <option value="fisher_exact">Fisher exact (2×2 independent)</option>
                <option value="pearson_chi_square">Pearson Chi-square (independent)</option>
                <option value="mcnemar_exact">McNemar exact (paired binary)</option>
              </select>
            </label>
            <label>
              Graph{" "}
              <select
                value={display}
                onChange={(e) => setDisplay(e.target.value as typeof display)}
              >
                <option value="count">Count bars</option>
                <option value="fraction">Fraction bars</option>
                <option value="stacked">100% stacked</option>
              </select>
            </label>
          </>
        ) : null}
        {mode === "regression" ? (
          <>
            <label>
              X label <input value={xLabel} onChange={(e) => setXLabel(e.target.value)} />
            </label>
            <label>
              Y label <input value={yLabel} onChange={(e) => setYLabel(e.target.value)} />
            </label>
            <label>
              <input
                type="checkbox"
                checked={includeIntercept}
                onChange={(e) => setIncludeIntercept(e.target.checked)}
              />{" "}
              Estimate intercept
            </label>
            <label>
              <input
                type="checkbox"
                checked={showBand}
                onChange={(e) => setShowBand(e.target.checked)}
              />{" "}
              Confidence band
            </label>
          </>
        ) : null}
        {mode === "nonlinear-fit" && !adaptiveOrderedCurveActive ? nonlinearFitSettings : null}
        {mode === "distribution" ? (
          <>
            <label>
              Graph{" "}
              <select
                value={distributionType}
                onChange={(e) => setDistributionType(e.target.value as typeof distributionType)}
              >
                <option value="histogram">Histogram</option>
                <option value="ecdf">ECDF</option>
              </select>
            </label>
            <label>
              Histogram bins (blank = deterministic){" "}
              <input
                type="number"
                min="1"
                max="200"
                value={binCount}
                onChange={(e) => setBinCount(e.target.value)}
              />
            </label>
          </>
        ) : null}
        {mode === "regression" || mode === "distribution" ? (
          <>
            <label>
              X scale{" "}
              <select value={xScale} onChange={(e) => setXScale(e.target.value as typeof xScale)}>
                <option value="linear">Linear</option>
                <option value="log10">Log10</option>
              </select>
            </label>
            {mode === "regression" ? (
              <label>
                Y scale{" "}
                <select value={yScale} onChange={(e) => setYScale(e.target.value as typeof yScale)}>
                  <option value="linear">Linear</option>
                  <option value="log10">Log10</option>
                </select>
              </label>
            ) : null}
          </>
        ) : null}
        {mode === "nonlinear-fit" && !adaptiveOrderedCurveActive ? nonlinearRunButton : null}
        {mode !== "distribution" && mode !== "nonlinear-fit" ? (
          <button
            className="analysis-run-button"
            type="button"
            disabled={!analysisAvailable}
            onClick={() => void run()}
          >
            解析を実行
          </button>
        ) : null}
        {adaptiveOrderedCurveActive && !entryFactsView.canCompileStructureContract ? (
          <p className="specialized-engine-note" role="status">
            X/Y値は入力できます。fitを実行する前に、上の測定方法だけ確認してください。
          </p>
        ) : null}
        {adaptiveOrderedCurveActive &&
        entryFactsView.canCompileStructureContract &&
        orderedCurveValidationMessage ? (
          <p className="specialized-engine-note" role="status">
            {orderedCurveValidationMessage}
          </p>
        ) : null}
        {adaptiveOrderedCurveActive &&
        orderedCurveAnalysisReadiness.status === "safe_stop" &&
        !nonlinearAnalysisSetupVisible ? (
          <p className="specialized-engine-note" role="status">
            {orderedCurveAnalysisReadiness.message.ja}
          </p>
        ) : null}
        {mode !== "distribution" && !analysisAvailable && !adaptiveOrderedCurveActive ? (
          <p className="specialized-engine-note" role="note">
            このブラウザレビューでは解析エンジンを実行できません。デスクトップ版では利用できます。
          </p>
        ) : null}
        {mode === "nonlinear-fit" && !adaptiveOrderedCurveActive ? nonlinearSaveButton : null}
        {mode === "nonlinear-fit" && !adaptiveOrderedCurveActive
          ? nonlinearSaveUnavailableNote
          : null}
        {!adaptiveOrderedCurveActive ? graphExportButton : null}
        {import.meta.env.DEV && mode === "regression" && benchmarkRun.identity ? (
          <button type="button" onClick={() => void finalizeRegressionBenchmark()}>
            Benchmark runを完了
          </button>
        ) : null}
        {message ? <p role="status">{message}</p> : null}
        {"error" in parsed &&
        !(mode === "nonlinear-fit" && entryIntent && text.trim() === ORDERED_CURVE_HEADER) ? (
          <p role="alert">{parsed.error}</p>
        ) : null}
      </section>
      <section className="workspace-panel specialized-workspace-panel">
        {graph}
        {mode === "nonlinear-fit" && adaptiveOrderedCurveActive ? (
          <>
            <div className="specialized-graph-actions">
              {nonlinearSaveButton}
              {graphExportButton}
            </div>
            {nonlinearSaveUnavailableNote}
            {nonlinearAnalysisSetupVisible ? (
              <section className="nonlinear-analysis-stage" aria-label="統計解析の設定">
                <header>
                  <h2>統計解析を設定</h2>
                  <button type="button" onClick={() => setNonlinearAnalysisSetupVisible(false)}>
                    設定を閉じる
                  </button>
                </header>
                {nonlinearFitSettings}
                {nonlinearRunButton}
                {!analysisAvailable ? (
                  <p className="specialized-engine-note" role="note">
                    このブラウザレビューでは解析エンジンを実行できません。デスクトップ版では利用できます。
                  </p>
                ) : null}
              </section>
            ) : (
              <button
                type="button"
                disabled={
                  !graphExportAvailable ||
                  orderedCurveEntry?.status !== "surface_ready" ||
                  orderedCurveAnalysisReadiness.status === "safe_stop"
                }
                onClick={() => setNonlinearAnalysisSetupVisible(true)}
              >
                統計解析を設定
              </button>
            )}
          </>
        ) : null}
        {result?.nonlinearFit ? (
          <div className="nonlinear-fit-results" role="region" aria-label="非線形fit結果">
            <header>
              <p className="overline">保存対象の解析結果</p>
              <h2>Parameter estimates & fit diagnostics</h2>
              <p>
                Model: <strong>{nonlinearModelLabel(result.nonlinearFit.modelId)}</strong> · ID{" "}
                {result.nonlinearFit.modelId} · version {result.nonlinearFit.modelVersion}
              </p>
              <p>{result.nonlinearFit.selectionRationale}</p>
            </header>
            {result.nonlinearFit.series.map((seriesFit) => (
              <section key={seriesFit.seriesId} className="nonlinear-fit-series-result">
                <h3>
                  {orderedCurveRecords
                    ? (orderedCurveRecords.series.find(({ id }) => id === seriesFit.seriesId)
                        ?.label ?? seriesFit.seriesId)
                    : seriesFit.seriesId}
                </h3>
                <table>
                  <thead>
                    <tr>
                      <th>Parameter</th>
                      <th>Estimate</th>
                      <th>SE</th>
                      <th>95% CI</th>
                    </tr>
                  </thead>
                  <tbody>
                    {seriesFit.parameters.map((parameter) => (
                      <tr key={parameter.name}>
                        <th scope="row">
                          {nonlinearParameterLabel(
                            result.nonlinearFit!.modelId as NonlinearModelId,
                            parameter.name,
                          )}
                        </th>
                        <td>{parameter.value.toPrecision(5)}</td>
                        <td>{parameter.standardError?.toPrecision(4) ?? "—"}</td>
                        <td>
                          {parameter.confidenceInterval
                            ? `${parameter.confidenceInterval.lower.toPrecision(4)} – ${parameter.confidenceInterval.upper.toPrecision(4)}`
                            : "—"}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
                <dl className="nonlinear-fit-diagnostics">
                  <div>
                    <dt>n</dt>
                    <dd>{seriesFit.diagnostics.n}</dd>
                  </div>
                  <div>
                    <dt>Distinct X</dt>
                    <dd>{seriesFit.diagnostics.distinctX}</dd>
                  </div>
                  <div>
                    <dt>RMSE</dt>
                    <dd>{seriesFit.diagnostics.rmse.toPrecision(4)}</dd>
                  </div>
                  <div>
                    <dt>R²</dt>
                    <dd>{seriesFit.diagnostics.rSquared.toPrecision(4)}</dd>
                  </div>
                  <div>
                    <dt>AIC</dt>
                    <dd>{seriesFit.diagnostics.aic.toPrecision(5)}</dd>
                  </div>
                  <div>
                    <dt>Residual df</dt>
                    <dd>{seriesFit.diagnostics.residualDegreesOfFreedom}</dd>
                  </div>
                </dl>
                <details>
                  <summary>Fit provenance</summary>
                  <pre>
                    {JSON.stringify(
                      { initialValues: seriesFit.initialValues, bounds: seriesFit.bounds },
                      null,
                      2,
                    )}
                  </pre>
                </details>
              </section>
            ))}
            <p>
              Engine: {result.engine.name} {result.engine.version} ·{" "}
              {Object.entries(result.engine.packages)
                .map(([name, version]) => `${name} ${version}`)
                .join(", ")}
            </p>
          </div>
        ) : result ? (
          <pre style={{ whiteSpace: "pre-wrap" }}>
            {JSON.stringify(
              { estimates: result.estimates, tests: result.tests, diagnostics: result.diagnostics },
              null,
              2,
            )}
          </pre>
        ) : null}
        {methods ? (
          <details>
            <summary>Methods</summary>
            <pre style={{ whiteSpace: "pre-wrap" }}>{methods}</pre>
          </details>
        ) : null}
      </section>
    </div>
  );
}

import { useEffect, useMemo, useRef, useState } from "react";

import { parseAdaptiveDelimited, type ParsedAdaptiveInput } from "@lsaa/adaptive-input";
import {
  appendUnresolvedVisualizationDataRevision,
  appendUnresolvedVisualizationGraph,
  createUnresolvedVisualizationProjectState,
  resolveUnresolvedVisualizationIdentityDecision,
  resolveUnresolvedVisualizationSourceRowUnitDecision,
  UnresolvedVisualizationProjectStateSchema,
  type UnresolvedVisualizationProjectState,
  type UnresolvedVisualizationColumnMapping,
  type UnresolvedVisualizationIdentityDecision,
  type UnresolvedVisualizationSourceRowUnitDecision,
} from "@lsaa/project";
import { GraphSpecSchema, type GraphEditorPresentation, type GraphSpec } from "@lsaa/graph-spec";

import type {
  OpenUnresolvedVisualizationProjectAction,
  SaveUnresolvedVisualizationProjectAction,
} from "../app/projectActions";
import type { AppRoute } from "../app/routes";
import type { RegisterWorkspaceSaveHandler, RequestWorkspaceExit } from "../app/workspaceLifecycle";
import { routeFromPath } from "../app/routes";
import { DelimitedTextSpreadsheet } from "../components/DelimitedTextSpreadsheet";
import {
  GRAPH_ONLY_DEFAULT_PALETTE,
  graphOnlySeriesKeys,
  graphOnlyUsesNumericXAxis,
  type GraphOnlyPresentation,
} from "../components/graph/GraphOnlyDescriptiveWorkbench";
import { ExperimentGraphWorkbench } from "../components/graph/ExperimentGraphWorkbench";
import { createGraphOnlyWorkbenchModel } from "../app/graphOnlyWorkbenchAdapter";
import type { WorkspaceGraphState } from "../app/experimentWorkspaceProject";
import { recordUsageGraphConfiguration, recordUsageMilestone } from "../app/usageTelemetry";
import "./GraphOnlyVisualizationPage.css";

type ColumnIndex = number | "";

type ParsedVisualizationInput = Readonly<{
  parsed: ParsedAdaptiveInput;
  error: string | null;
}>;

type GraphOnlyVisualizationPageProps = Readonly<{
  onNavigate: (route: AppRoute) => void;
  onBack?: () => void;
  saveProject?: SaveUnresolvedVisualizationProjectAction;
  openProject?: OpenUnresolvedVisualizationProjectAction;
  initialState?: UnresolvedVisualizationProjectState | null;
  initialTarget?: string;
  onStatisticsStructureRequested?: (state: UnresolvedVisualizationProjectState) => void;
  /** Keep an unsaved entry session dirty when this surface is remounted after a handoff. */
  initialDirty?: boolean;
  onDirtyChange?: (dirty: boolean) => void;
  onRequestExit?: RequestWorkspaceExit;
  onRegisterSaveHandler?: RegisterWorkspaceSaveHandler;
}>;

let visualizationIdSequence = 0;

function visualizationId(prefix: string): string {
  visualizationIdSequence += 1;
  return `visualization.${prefix}.${Date.now().toString(36)}.${visualizationIdSequence}`;
}

function nowIso(): string {
  return new Date().toISOString();
}

function parseVisualizationInput(text: string): ParsedVisualizationInput {
  if (!text.trim())
    return { parsed: { headers: [], rows: [], delimiter: "tab", headerRow: 1 }, error: null };
  try {
    const parsed = parseAdaptiveDelimited(text);
    if (parsed.headers.some((header) => !header.trim())) {
      return { parsed, error: "列名が空です。1行目に列名を入れてください。" };
    }
    if (parsed.rows.some((row) => row.length !== parsed.headers.length)) {
      return {
        parsed,
        error: "行ごとの列数がそろっていません。元の表で空欄の列も区切りを残してください。",
      };
    }
    return { parsed, error: null };
  } catch {
    return {
      parsed: { headers: [], rows: [], delimiter: "tab", headerRow: 1 },
      error: "表を読み取れませんでした。1行目を列名にしたCSVまたはTSVを貼り付けてください。",
    };
  }
}

function numericValue(raw: string | undefined): number | null {
  const value = raw?.trim() ?? "";
  if (!value || ["NA", "N/A", "—"].includes(value)) return null;
  const number = Number(value);
  return Number.isFinite(number) ? number : null;
}

function sourceKindFor(
  sourceLabel: string,
  delimiter: ParsedAdaptiveInput["delimiter"],
): "direct_entry" | "clipboard" | "csv" | "tsv" | "generic_file" {
  if (sourceLabel === "direct-entry") return "direct_entry";
  if (sourceLabel === "clipboard") return "clipboard";
  if (/\.tsv$/i.test(sourceLabel) || delimiter === "tab") return "tsv";
  if (/\.csv$/i.test(sourceLabel) || delimiter === "comma") return "csv";
  return "generic_file";
}

function mappingFor(
  parsed: ParsedAdaptiveInput,
  xColumn: ColumnIndex,
  yColumn: ColumnIndex,
  seriesColumn: ColumnIndex,
  idColumn: ColumnIndex,
  identityDecision: UnresolvedVisualizationIdentityDecision,
  sourceRowUnitDecision: UnresolvedVisualizationSourceRowUnitDecision,
  sourceLabel: string,
  confirmedAt: string,
): UnresolvedVisualizationColumnMapping | null {
  if (xColumn === "" || yColumn === "") return null;
  const roles = new Map<number, "x" | "y" | "series" | "id">([
    [xColumn, "x"],
    [yColumn, "y"],
    ...(seriesColumn === "" ? [] : [[seriesColumn, "series"] as const]),
    ...(idColumn === "" ? [] : [[idColumn, "id"] as const]),
  ]);
  return {
    schemaVersion: "0.1.0",
    sourceLabel,
    delimiter: parsed.delimiter,
    headerRow: parsed.headerRow,
    columns: parsed.headers.map((header, index) => ({
      index,
      header,
      role: roles.get(index) ?? "metadata",
    })),
    identityDecision,
    sourceRowUnitDecision,
    confirmedAt,
  };
}

function graphSpecFor(
  tableId: string,
  revision: string,
  headers: readonly string[],
  xColumn: number,
  yColumn: number,
  seriesColumn: ColumnIndex,
  graphId: string,
  presentation: GraphOnlyPresentation,
  numericXAxis: boolean,
  seriesKeys: readonly string[],
  editorPresentation?: GraphEditorPresentation,
): GraphSpec {
  const seriesHeader = seriesColumn === "" ? undefined : headers[seriesColumn];
  return GraphSpecSchema.parse({
    id: graphId,
    version: "0.1.0",
    // `scatter` is reserved for the Core D09 paired-measurement contract. A
    // graph-only numeric X/Y table remains descriptive until biological unit
    // identity is explicitly supplied, so persist it as a dot graph with a
    // continuous x scale instead of fabricating a D09 pair mapping.
    type: seriesHeader ? "grouped_dot" : "dot_summary",
    dataSource: { kind: "visualization_table", id: tableId, revision },
    analysisResultId: null,
    dataSets: {
      displaySet: { conditionIds: [], timePointIds: [] },
      analysisSet: { conditionIds: [], timePointIds: [] },
      comparisonSet: [],
      annotationSet: [],
    },
    mappings: {
      x: headers[xColumn] ?? `column_${xColumn + 1}`,
      xHierarchy: [],
      y: headers[yColumn] ?? `column_${yColumn + 1}`,
      ...(seriesHeader ? { series: seriesHeader, color: seriesHeader } : {}),
    },
    summary: editorPresentation
      ? {
          center: editorPresentation.layers.overall ? "mean" : "none",
          interval:
            editorPresentation.layers.errorBar && editorPresentation.appearance.errorBar !== "none"
              ? editorPresentation.appearance.errorBar
              : "none",
        }
      : { center: "none", interval: "none" },
    annotations: [],
    appearance: {
      palette: [...presentation.palette],
      pointSize: presentation.pointSize,
      opacity: presentation.opacity,
      showRawPoints: true,
      showPairedLines: false,
      distributionFill: "none",
      distributionFillColor: "#ffffff",
      distributionOutlineColor: "#111111",
      barWidth: 0.72,
      withinGroupSpacing: 0.72,
      betweenGroupSpacing: 1.35,
      barOutline: true,
      barMeanMarker: false,
      boxWhiskerMode: "tukey_1_5_iqr",
      uncertaintyStyle: "none",
      ribbonOpacity: 0.18,
      seriesStyles: Object.fromEntries(
        seriesKeys.map((series, index) => [
          series,
          {
            color: presentation.palette[index % presentation.palette.length],
            legendLabel: presentation.seriesLabels[series]?.trim() || series,
            visible: true,
          },
        ]),
      ),
    },
    axes: {
      yStartAtZero: editorPresentation
        ? editorPresentation.axes.yRangeMode === "manual" && editorPresentation.axes.yMin === 0
        : presentation.yStartAtZero,
      yScale: editorPresentation?.axes.yScale ?? "linear",
      ...(numericXAxis ? { xScale: editorPresentation?.axes.xScale ?? ("linear" as const) } : {}),
      xLabel: editorPresentation?.axes.xTitle || presentation.xLabel || headers[xColumn] || "X",
      yLabel:
        editorPresentation?.axes.yTitle || presentation.yLabel || headers[yColumn] || "測定値",
      showMinorTicks: editorPresentation?.axes.showMinorTicks ?? true,
      tickDirection: editorPresentation?.axes.tickDirection ?? "outside",
      showCategoryGroupSeparators:
        editorPresentation?.axes.showCategoryGroupSeparators ?? Boolean(seriesHeader),
    },
    ...(editorPresentation ? { editorPresentation } : {}),
  });
}

function editorPresentationFromWorkspaceState(
  state: Omit<WorkspaceGraphState, "id" | "displayName"> | null,
): GraphEditorPresentation | undefined {
  if (!state) return undefined;
  return {
    graphType: state.graphType,
    grouping: state.grouping!,
    layers: state.layers,
    appearance: {
      ...state.appearance,
      barOutline: state.appearance.barOutline ?? true,
      barMeanMarker: state.appearance.barMeanMarker ?? false,
      boxWhiskerMode: state.appearance.boxWhiskerMode ?? "tukey_1_5_iqr",
      uncertaintyStyle: state.appearance.uncertaintyStyle ?? "error_bars",
      ribbonOpacity: state.appearance.ribbonOpacity ?? 0.18,
    },
    axes: state.axes,
  };
}

function newMetadata(projectName: string, timestamp: string) {
  return {
    projectId: visualizationId("project"),
    projectName,
    experimentDate: "" as const,
    operator: "",
    batch: "",
    note: "Graph-only: 実験構造は未確定",
    createdAt: timestamp,
    updatedAt: timestamp,
  };
}

function initialColumn(
  state: UnresolvedVisualizationProjectState | null | undefined,
  role: "x" | "y" | "series" | "id",
): ColumnIndex {
  const column = state?.mapping?.columns.find((candidate) => candidate.role === role);
  return column?.index ?? "";
}

function initialIdentityDecision(
  state: UnresolvedVisualizationProjectState | null | undefined,
): UnresolvedVisualizationIdentityDecision {
  return state?.mapping
    ? resolveUnresolvedVisualizationIdentityDecision(state.mapping)
    : "unanswered";
}

function initialSourceRowUnitDecision(
  state: UnresolvedVisualizationProjectState | null | undefined,
): UnresolvedVisualizationSourceRowUnitDecision {
  return state?.mapping
    ? resolveUnresolvedVisualizationSourceRowUnitDecision(state.mapping)
    : "unanswered";
}

function graphOnlyLifecycleSnapshot(
  values: Readonly<{
    text: string;
    sourceLabel: string;
    xColumn: ColumnIndex;
    yColumn: ColumnIndex;
    seriesColumn: ColumnIndex;
    idColumn: ColumnIndex;
    identityDecision: UnresolvedVisualizationIdentityDecision;
    sourceRowUnitDecision: UnresolvedVisualizationSourceRowUnitDecision;
    presentation: GraphOnlyPresentation;
    editorPresentation?: GraphEditorPresentation;
  }>,
): string {
  return JSON.stringify(values);
}

function activeGraphFor(
  state: UnresolvedVisualizationProjectState | null | undefined,
): GraphSpec | null {
  if (!state?.activeGraphId) return null;
  return state.graphSpecs.find(({ id }) => id === state.activeGraphId) ?? null;
}

function initialGraphOnlyPresentation(
  state: UnresolvedVisualizationProjectState | null | undefined,
): GraphOnlyPresentation {
  const graph = activeGraphFor(state);
  const seriesLabels = Object.fromEntries(
    Object.entries(graph?.appearance.seriesStyles ?? {}).flatMap(([series, style]) =>
      style.legendLabel ? [[series, style.legendLabel]] : [],
    ),
  );
  return {
    title: state?.metadata.projectName ?? "表から作成したGraph",
    xLabel: graph?.axes.xLabel ?? null,
    yLabel: graph?.axes.yLabel ?? null,
    pointSize: graph?.appearance.pointSize ?? 5,
    opacity: graph?.appearance.opacity ?? 0.9,
    palette: graph?.appearance.palette ?? GRAPH_ONLY_DEFAULT_PALETTE,
    yStartAtZero: graph?.axes.yStartAtZero ?? false,
    seriesLabels,
  };
}

function sameGraphDefinition(left: GraphSpec | null, right: GraphSpec): boolean {
  return left !== null && JSON.stringify(left) === JSON.stringify(right);
}

function sameMappingDefinition(
  left: UnresolvedVisualizationColumnMapping | null,
  right: UnresolvedVisualizationColumnMapping,
): boolean {
  return (
    left !== null &&
    left.sourceLabel === right.sourceLabel &&
    left.delimiter === right.delimiter &&
    left.headerRow === right.headerRow &&
    resolveUnresolvedVisualizationIdentityDecision(left) ===
      resolveUnresolvedVisualizationIdentityDecision(right) &&
    resolveUnresolvedVisualizationSourceRowUnitDecision(left) ===
      resolveUnresolvedVisualizationSourceRowUnitDecision(right) &&
    left.columns.length === right.columns.length &&
    left.columns.every((column, index) => {
      const candidate = right.columns[index];
      return (
        candidate !== undefined &&
        column.index === candidate.index &&
        column.header === candidate.header &&
        column.role === candidate.role
      );
    })
  );
}

function initialEditorStateFor(
  model: NonNullable<ReturnType<typeof createGraphOnlyWorkbenchModel>>,
  graph: GraphSpec | null,
): Omit<WorkspaceGraphState, "id" | "displayName"> | undefined {
  const editor = graph?.editorPresentation;
  if (!editor) return undefined;
  return {
    selectedReadoutId: model.draft.readouts[0]!.id,
    sourceMode: "raw_readout",
    selectedConditionIds: [...model.conditionIds],
    analysisConditionIds: [...model.conditionIds],
    selectedTimePointIds: [...model.timePointIds],
    dataSets: {
      displaySet: {
        conditionIds: [...model.conditionIds],
        timePointIds: [...model.timePointIds],
      },
      analysisSet: {
        conditionIds: [...model.conditionIds],
        timePointIds: [...model.timePointIds],
      },
      comparisonSet: [],
      annotationSet: [],
    },
    analysisTimePointId: null,
    analysisMetric: { kind: "selected_timepoint" },
    ...editor,
    statisticsAnnotation: { mode: "hidden", testIndex: 0 },
    statisticsAnnotations: [],
    analysisRunId: null,
    analysis: null,
  };
}

const DIRECT_ENTRY_TEMPLATE = "X / condition\tY / value\tGroup (optional)\tID (optional)";

export function GraphOnlyVisualizationPage({
  onNavigate,
  onBack,
  saveProject,
  openProject,
  initialState = null,
  initialTarget,
  onStatisticsStructureRequested,
  initialDirty = false,
  onDirtyChange,
  onRequestExit,
  onRegisterSaveHandler,
}: GraphOnlyVisualizationPageProps) {
  const compatibleInitialState = initialState?.entryIntent === "graph_only" ? initialState : null;
  const initialIntentError =
    initialState && initialState.entryIntent !== "graph_only"
      ? "このファイルは表からGraph用のprojectではありません。"
      : null;
  const [text, setText] = useState(
    compatibleInitialState?.rawLineage.rawText ?? DIRECT_ENTRY_TEMPLATE,
  );
  const [sourceLabel, setSourceLabel] = useState(
    compatibleInitialState?.rawLineage.sourceLabel ?? "direct-entry",
  );
  const [loadedState, setLoadedState] = useState<UnresolvedVisualizationProjectState | null>(
    compatibleInitialState,
  );
  const [savedTarget, setSavedTarget] = useState<string | undefined>(initialTarget);
  const [xColumn, setXColumn] = useState<ColumnIndex>(
    compatibleInitialState ? initialColumn(compatibleInitialState, "x") : 0,
  );
  const [yColumn, setYColumn] = useState<ColumnIndex>(
    compatibleInitialState ? initialColumn(compatibleInitialState, "y") : 1,
  );
  const [seriesColumn, setSeriesColumn] = useState<ColumnIndex>(
    initialColumn(compatibleInitialState, "series"),
  );
  const [idColumn, setIdColumn] = useState<ColumnIndex>(
    initialColumn(compatibleInitialState, "id"),
  );
  const [identityDecision, setIdentityDecision] = useState<UnresolvedVisualizationIdentityDecision>(
    initialIdentityDecision(compatibleInitialState),
  );
  const [sourceRowUnitDecision, setSourceRowUnitDecision] =
    useState<UnresolvedVisualizationSourceRowUnitDecision>(
      initialSourceRowUnitDecision(compatibleInitialState),
    );
  const [graphPresentation, setGraphPresentation] = useState<GraphOnlyPresentation>(() =>
    initialGraphOnlyPresentation(compatibleInitialState),
  );
  const [error, setError] = useState<string | null>(initialIntentError);
  const [saveMessage, setSaveMessage] = useState<string | null>(null);
  const [statisticsMessage, setStatisticsMessage] = useState<string | null>(null);
  const [statisticsHandoffVisible, setStatisticsHandoffVisible] = useState(false);
  const [statisticsXMeaning, setStatisticsXMeaning] = useState<
    "" | "condition" | "ordered" | "unknown"
  >("");
  const [workspaceTab, setWorkspaceTab] = useState<"data" | "graph" | "statistics">(
    compatibleInitialState?.activeGraphId ? "graph" : "data",
  );
  const [allowUniqueSeries, setAllowUniqueSeries] = useState(false);
  const [workspaceGraphState, setWorkspaceGraphState] = useState<Omit<
    WorkspaceGraphState,
    "id" | "displayName"
  > | null>(null);
  const lifecycleSnapshot = graphOnlyLifecycleSnapshot({
    text,
    sourceLabel,
    xColumn,
    yColumn,
    seriesColumn,
    idColumn,
    identityDecision,
    sourceRowUnitDecision,
    presentation: graphPresentation,
    editorPresentation:
      editorPresentationFromWorkspaceState(workspaceGraphState) ??
      activeGraphFor(compatibleInitialState)?.editorPresentation,
  });
  const savedLifecycleSnapshotRef = useRef<string | null>(initialDirty ? null : lifecycleSnapshot);
  const isDirty =
    savedLifecycleSnapshotRef.current === null ||
    lifecycleSnapshot !== savedLifecycleSnapshotRef.current;
  useEffect(() => {
    onDirtyChange?.(isDirty);
  }, [isDirty, onDirtyChange]);
  const parsedResult = useMemo(() => parseVisualizationInput(text), [text]);
  const parsed = parsedResult.parsed;

  const resetImportedMapping = () => {
    setXColumn("");
    setYColumn("");
    setSeriesColumn("");
    setIdColumn("");
    setIdentityDecision("unanswered");
    setSourceRowUnitDecision("unanswered");
    setWorkspaceGraphState(null);
    setAllowUniqueSeries(false);
    setWorkspaceTab("data");
    setGraphPresentation((current) => ({
      ...current,
      xLabel: null,
      yLabel: null,
      seriesLabels: {},
    }));
  };

  const applyImportedText = (contents: string, nextSourceLabel: string) => {
    setText(contents);
    setSourceLabel(nextSourceLabel);
    setSaveMessage(null);
    setError(null);
    setWorkspaceGraphState(null);
    setWorkspaceTab("data");
    resetImportedMapping();
  };

  const finiteYCount =
    yColumn === ""
      ? 0
      : parsed.rows.reduce(
          (count, row) => count + (numericValue(row[yColumn]) === null ? 0 : 1),
          0,
        );
  const skippedYCount = yColumn === "" ? 0 : parsed.rows.length - finiteYCount;
  const duplicateMapping =
    xColumn !== "" &&
    yColumn !== "" &&
    (xColumn === yColumn ||
      (seriesColumn !== "" && (seriesColumn === xColumn || seriesColumn === yColumn)) ||
      (idColumn !== "" &&
        (idColumn === xColumn || idColumn === yColumn || idColumn === seriesColumn)));
  const mappedSeriesKeys =
    xColumn === "" || yColumn === ""
      ? []
      : graphOnlySeriesKeys(parsed, xColumn, yColumn, seriesColumn);
  const seriesMappingLooksLikeId =
    seriesColumn !== "" && finiteYCount > 1 && mappedSeriesKeys.length === finiteYCount;
  const canGraph =
    !parsedResult.error &&
    parsed.rows.length > 0 &&
    xColumn !== "" &&
    yColumn !== "" &&
    !duplicateMapping &&
    finiteYCount > 0 &&
    (!seriesMappingLooksLikeId || allowUniqueSeries);
  const workbenchModel = useMemo(
    () =>
      canGraph
        ? createGraphOnlyWorkbenchModel({
            parsed,
            xColumn: xColumn as number,
            yColumn: yColumn as number,
            seriesColumn,
            idColumn,
            title: graphPresentation.title,
          })
        : null,
    [canGraph, graphPresentation.title, idColumn, parsed, seriesColumn, xColumn, yColumn],
  );
  const loadedEditorState = useMemo(
    () =>
      workbenchModel
        ? initialEditorStateFor(workbenchModel, activeGraphFor(loadedState))
        : undefined,
    [loadedState, workbenchModel],
  );
  const dataEntryRecordedRef = useRef(Boolean(compatibleInitialState));
  const graphCreatedRecordedRef = useRef(Boolean(compatibleInitialState?.activeGraphId));
  const statisticsRequestedRecordedRef = useRef(false);
  const statisticsSafeStopRecordedRef = useRef(false);
  const recordStatisticsSafeStop = () => {
    if (statisticsSafeStopRecordedRef.current) return;
    statisticsSafeStopRecordedRef.current = true;
    recordUsageMilestone(routeFromPath(window.location.pathname), "safe_stop");
  };
  useEffect(() => {
    if (dataEntryRecordedRef.current || !text.trim() || parsed.rows.length === 0) return;
    dataEntryRecordedRef.current = true;
    recordUsageMilestone(routeFromPath(window.location.pathname), "data_entry_started");
  }, [parsed.rows.length, text]);
  useEffect(() => {
    if (graphCreatedRecordedRef.current || !canGraph) return;
    graphCreatedRecordedRef.current = true;
    const usageRoute = routeFromPath(window.location.pathname);
    recordUsageMilestone(usageRoute, "graph_created");
    recordUsageGraphConfiguration(usageRoute, {
      graphFamily: "dot",
      origin: "direct_table",
      uncertainty: "none",
      rawPointsVisible: true,
      summaryVisible: true,
    });
  }, [canGraph]);

  const columns = parsed.headers.map((header, index) => (
    <option key={`${index}.${header}`} value={index}>
      {header || `列 ${index + 1}`}
    </option>
  ));

  const buildState = (): UnresolvedVisualizationProjectState | null => {
    if (!canGraph) return null;
    const selectedX = xColumn as number;
    const selectedY = yColumn as number;
    const timestamp = nowIso();
    const tableId = loadedState?.table.id ?? visualizationId("table");
    const projectTitle = graphPresentation.title.trim() || "表から作成したGraph";
    const metadata = loadedState?.metadata ?? newMetadata(projectTitle, timestamp);
    const numericXAxis = graphOnlyUsesNumericXAxis(parsed, selectedX, selectedY, seriesColumn);
    const seriesKeys = graphOnlySeriesKeys(parsed, selectedX, selectedY, seriesColumn);
    const lineageSource = sourceKindFor(sourceLabel, parsed.delimiter);
    const candidateMapping = mappingFor(
      parsed,
      selectedX,
      selectedY,
      seriesColumn,
      idColumn,
      identityDecision,
      sourceRowUnitDecision,
      sourceLabel,
      timestamp,
    );
    if (!candidateMapping) return null;
    const mapping =
      loadedState?.mapping && sameMappingDefinition(loadedState.mapping, candidateMapping)
        ? loadedState.mapping
        : candidateMapping;
    const table = {
      id: tableId,
      headers: [...parsed.headers],
      rows: parsed.rows.map((row) => [...row]),
      delimiter: parsed.delimiter,
      headerRow: parsed.headerRow,
    };
    const sourceUnchanged =
      loadedState?.rawLineage.sourceLabel === sourceLabel &&
      loadedState.rawLineage.sourceKind === lineageSource;
    const rawTextUnchanged = sourceUnchanged && loadedState?.rawLineage.rawText === text;
    const transformations = rawTextUnchanged
      ? [...loadedState!.rawLineage.transformations]
      : [
          ...(loadedState?.rawLineage.transformations ?? []),
          "visualization_table_or_source_updated",
          "explicit_visualization_column_mapping",
        ].filter((value, index, values) => values.indexOf(value) === index);
    const rawLineage = {
      sourceKind: lineageSource,
      sourceLabel,
      importedAt: sourceUnchanged && loadedState ? loadedState.rawLineage.importedAt : timestamp,
      rawText: text,
      sha256: rawTextUnchanged ? (loadedState?.rawLineage.sha256 ?? null) : null,
      transformations,
    };
    let base = loadedState
      ? appendUnresolvedVisualizationDataRevision(loadedState, {
          table,
          rawLineage,
          mapping,
          actor: "researcher",
          createdAt: timestamp,
        })
      : createUnresolvedVisualizationProjectState({
          metadata: { ...metadata, updatedAt: timestamp },
          entryIntent: "graph_only",
          table,
          rawLineage: {
            ...rawLineage,
            transformations: ["delimiter_detection", "explicit_visualization_column_mapping"],
          },
          mapping,
          actor: "researcher",
        });
    if (base.metadata.projectName !== projectTitle) {
      base = UnresolvedVisualizationProjectStateSchema.parse({
        ...base,
        metadata: { ...base.metadata, projectName: projectTitle, updatedAt: timestamp },
      });
    }
    const activeGraph = activeGraphFor(base);
    const comparisonSpec = graphSpecFor(
      tableId,
      base.activeDataRevisionId,
      parsed.headers,
      selectedX,
      selectedY,
      seriesColumn,
      activeGraph?.id ?? visualizationId("graph"),
      graphPresentation,
      numericXAxis,
      seriesKeys,
      editorPresentationFromWorkspaceState(workspaceGraphState) ?? activeGraph?.editorPresentation,
    );
    if (sameGraphDefinition(activeGraph, comparisonSpec)) return base;
    const spec = activeGraph ? { ...comparisonSpec, id: visualizationId("graph") } : comparisonSpec;
    return appendUnresolvedVisualizationGraph(base, {
      spec,
      actor: "researcher",
      createdAt: timestamp,
    });
  };

  const applyLoadedState = (state: UnresolvedVisualizationProjectState, target?: string) => {
    if (state.entryIntent !== "graph_only") {
      throw new Error("このファイルは表からGraph用のprojectではありません。");
    }
    setLoadedState(state);
    setSavedTarget(target);
    setText(state.rawLineage.rawText);
    setSourceLabel(state.rawLineage.sourceLabel);
    setXColumn(initialColumn(state, "x"));
    setYColumn(initialColumn(state, "y"));
    setSeriesColumn(initialColumn(state, "series"));
    setIdColumn(initialColumn(state, "id"));
    setIdentityDecision(initialIdentityDecision(state));
    setSourceRowUnitDecision(initialSourceRowUnitDecision(state));
    const loadedPresentation = initialGraphOnlyPresentation(state);
    setGraphPresentation(loadedPresentation);
    setWorkspaceGraphState(null);
    setWorkspaceTab(state.activeGraphId ? "graph" : "data");
    setError(null);
    setSaveMessage(target ? "保存したGraph用データを開きました。" : null);
    setStatisticsMessage(null);
    setStatisticsHandoffVisible(false);
    setStatisticsXMeaning("");
    dataEntryRecordedRef.current = true;
    graphCreatedRecordedRef.current = true;
    statisticsRequestedRecordedRef.current = false;
    statisticsSafeStopRecordedRef.current = false;
    savedLifecycleSnapshotRef.current = graphOnlyLifecycleSnapshot({
      text: state.rawLineage.rawText,
      sourceLabel: state.rawLineage.sourceLabel,
      xColumn: initialColumn(state, "x"),
      yColumn: initialColumn(state, "y"),
      seriesColumn: initialColumn(state, "series"),
      idColumn: initialColumn(state, "id"),
      identityDecision: initialIdentityDecision(state),
      sourceRowUnitDecision: initialSourceRowUnitDecision(state),
      presentation: loadedPresentation,
      editorPresentation: activeGraphFor(state)?.editorPresentation,
    });
    onDirtyChange?.(false);
    recordUsageMilestone(routeFromPath(window.location.pathname), "project_opened");
  };

  const saveCurrentProject = async (saveAs = false): Promise<boolean> => {
    const state = buildState();
    if (!state || !saveProject) return false;
    try {
      const saved = await saveProject(state, saveAs ? undefined : savedTarget);
      if (!saved) return false;
      savedLifecycleSnapshotRef.current = lifecycleSnapshot;
      setLoadedState(saved.state);
      setSavedTarget(saved.target);
      setSaveMessage("Graph用データを保存しました。元の表と列の指定を保持しています。");
      onDirtyChange?.(false);
      recordUsageMilestone(routeFromPath(window.location.pathname), "project_saved");
      return true;
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : "Graph用データを保存できませんでした。");
      return false;
    }
  };
  const saveCurrentProjectRef = useRef(saveCurrentProject);
  useEffect(() => {
    saveCurrentProjectRef.current = saveCurrentProject;
  }, [saveCurrentProject]);
  useEffect(() => {
    if (!onRegisterSaveHandler) return;
    onRegisterSaveHandler((saveAs) => saveCurrentProjectRef.current(Boolean(saveAs)));
    return () => onRegisterSaveHandler(null);
  }, [onRegisterSaveHandler]);

  const requestExit = (actionLabel: string, proceed: () => void | Promise<void>) => {
    if (!isDirty) {
      void proceed();
      return;
    }
    if (onRequestExit) {
      onRequestExit({ actionLabel, proceed });
      return;
    }
    void proceed();
  };

  return (
    <div className="page-stack graph-only graph-only--workspace">
      <button
        className="back-link"
        type="button"
        onClick={() => requestExit("入口へ戻る", onBack ?? (() => onNavigate("home")))}
      >
        <span aria-hidden="true">←</span> 入口へ戻る
      </button>
      <header className="graph-only__header">
        <p className="experiment-start__eyebrow">表からGraph</p>
        <h1>手元の表からGraphを作る</h1>
        <p>表の列を指定してGraphを作ります。実験構造や統計的なnは、統計を使うまで質問しません。</p>
      </header>

      <nav className="graph-only__workspace-tabs" aria-label="表からGraphの作業段階">
        <button
          type="button"
          aria-current={workspaceTab === "data" ? "page" : undefined}
          onClick={() => setWorkspaceTab("data")}
        >
          データ
        </button>
        <button
          type="button"
          disabled={!canGraph}
          aria-current={workspaceTab === "graph" ? "page" : undefined}
          onClick={() => setWorkspaceTab("graph")}
        >
          Graph
        </button>
        <button
          type="button"
          disabled={!canGraph}
          aria-current={workspaceTab === "statistics" ? "page" : undefined}
          onClick={() => {
            setWorkspaceTab("statistics");
            setStatisticsHandoffVisible(true);
            if (!statisticsRequestedRecordedRef.current) {
              statisticsRequestedRecordedRef.current = true;
              recordUsageMilestone(routeFromPath(window.location.pathname), "statistics_requested");
            }
          }}
        >
          Statistics
        </button>
      </nav>

      <div className="graph-only__data-workspace" hidden={workspaceTab !== "data"}>
        <section className="graph-only__input" aria-labelledby="graph-only-input-heading">
          <div className="graph-only__section-heading">
            <h2 id="graph-only-input-heading">1. 表に入力・貼り付ける</h2>
            <div className="graph-only__actions">
              <button
                className="secondary-button"
                type="button"
                onClick={() => {
                  const clipboard = navigator.clipboard;
                  if (!clipboard) {
                    setError(
                      "クリップボードを読み取れませんでした。下のシートへ直接貼り付けてください。",
                    );
                    return;
                  }
                  void clipboard
                    .readText()
                    .then((clipboardText) => {
                      if (clipboardText) {
                        applyImportedText(clipboardText, "clipboard");
                      }
                    })
                    .catch(() =>
                      setError(
                        "クリップボードを読み取れませんでした。下のシートへ直接貼り付けてください。",
                      ),
                    );
                }}
              >
                クリップボードから貼り付け
              </button>
              {openProject ? (
                <button
                  className="secondary-button"
                  type="button"
                  onClick={() => {
                    requestExit("保存したGraph用データを開く", async () => {
                      await openProject()
                        .then((opened) => {
                          if (opened) applyLoadedState(opened.state, opened.target);
                        })
                        .catch((reason: unknown) =>
                          setError(
                            reason instanceof Error
                              ? reason.message
                              : "保存したGraph用データを開けませんでした。",
                          ),
                        );
                    });
                  }}
                >
                  保存したGraph用データを開く
                </button>
              ) : null}
            </div>
          </div>
          <p className="graph-only__subtle">
            見出しの下へ直接入力するか、Excelから長方形の範囲を左上セルへ貼り付けてください。直接入力用のX列とY列だけを最初からGraphへ対応付けています。GroupとIDは必要なときだけ使います。
          </p>
          <DelimitedTextSpreadsheet
            value={text}
            onChange={(nextText, source) => {
              const nextParsedResult = parseVisualizationInput(nextText);
              const headersChanged =
                Boolean(nextParsedResult.error) ||
                nextParsedResult.parsed.headers.length !== parsed.headers.length ||
                nextParsedResult.parsed.headers.some(
                  (header, index) => header !== parsed.headers[index],
                );
              setText(nextText);
              setSaveMessage(null);
              setError(null);
              if (source === "clipboard") {
                setSourceLabel("clipboard");
                // Pasting values below unchanged headers is ordinary spreadsheet
                // entry and must retain the direct X/Y mapping. A paste that
                // changes the table schema still requires explicit remapping.
                if (headersChanged) resetImportedMapping();
              } else if (source === "workbook_import") {
                setSourceLabel("excel workbook import");
                resetImportedMapping();
              }
            }}
            ariaLabel="Graph用データシート"
            caption="Graph用データ"
            minimumRows={6}
            minimumColumns={4}
            testIdPrefix="graph-only"
            replaceOnPasteAtOrigin
            allowWorkbookSheetStacking
          />
          <label className="graph-only__file">
            <span>CSV / TSV / TXTファイルを同じシートへ読み込む</span>
            <input
              aria-label="Graph用の表ファイル"
              accept=".csv,.tsv,.txt,text/csv,text/tab-separated-values,text/plain"
              type="file"
              onChange={(event) => {
                const file = event.currentTarget.files?.[0];
                if (!file) return;
                void file
                  .text()
                  .then((contents) => {
                    applyImportedText(contents, file.name);
                  })
                  .catch(() => setError("表ファイルを読み込めませんでした。"));
              }}
            />
            <small>
              CSV / TSV / TXTはここから、XLS / XLSX / XLSM /
              XLSBは上のExcel読込から開けます。任意の行だけを解析対象から外す操作は未対応です。
            </small>
          </label>
          {parsedResult.error ? (
            <p className="graph-only__error" role="alert">
              {parsedResult.error}
            </p>
          ) : null}
        </section>

        <section className="graph-only__mapping" aria-labelledby="graph-only-mapping-heading">
          <h2 id="graph-only-mapping-heading">2. Graphに使う列を指定する</h2>
          <p className="graph-only__subtle">
            空の直接入力シートでは最初の2列だけをXとYへ対応付けています。見出しが変わる表の貼り付け・ファイル読込では列の意味を推測せず指定を解除するため、表を見て横軸・測定値・（必要なら）グループ列を選んでください。
          </p>
          <div className="graph-only__mapping-grid">
            <label className="experiment-start__field">
              <span>横軸（カテゴリまたはX）</span>
              <select
                aria-label="Graphの横軸"
                value={xColumn}
                onChange={(event) => {
                  setXColumn(event.target.value === "" ? "" : Number(event.target.value));
                  setGraphPresentation((current) => ({ ...current, xLabel: null }));
                  setWorkspaceGraphState(null);
                }}
              >
                <option value="">列を選択</option>
                {columns}
              </select>
            </label>
            <label className="experiment-start__field">
              <span>測定値（数値）</span>
              <select
                aria-label="Graphの測定値"
                value={yColumn}
                onChange={(event) => {
                  setYColumn(event.target.value === "" ? "" : Number(event.target.value));
                  setGraphPresentation((current) => ({ ...current, yLabel: null }));
                  setWorkspaceGraphState(null);
                }}
              >
                <option value="">列を選択</option>
                {columns}
              </select>
            </label>
            <label className="experiment-start__field">
              <span>色・線で分ける系列（任意）</span>
              <select
                aria-label="Graphの系列"
                value={seriesColumn}
                onChange={(event) => {
                  setSeriesColumn(event.target.value === "" ? "" : Number(event.target.value));
                  setGraphPresentation((current) => ({ ...current, seriesLabels: {} }));
                  setAllowUniqueSeries(false);
                  setWorkspaceGraphState(null);
                }}
              >
                <option value="">系列で分けない</option>
                {columns}
              </select>
              <small>
                薬剤の種類やgenotypeなど、同じ系列に複数の点がある列です。試料IDは右へ指定します。
              </small>
            </label>
            <label className="experiment-start__field">
              <span>対象・試料ID（任意）</span>
              <select
                aria-label="Graph用データの対象ID"
                value={idColumn}
                onChange={(event) => {
                  const next = event.target.value === "" ? "" : Number(event.target.value);
                  setIdColumn(next);
                  setIdentityDecision(next === "" ? "unanswered" : "selected_column");
                  setSourceRowUnitDecision("unanswered");
                  setWorkspaceGraphState(null);
                }}
              >
                <option value="">ID列を指定しない</option>
                {columns}
              </select>
              <small>dish ID・Animal IDなどです。IDは凡例や色分けには使いません。</small>
            </label>
          </div>
          {duplicateMapping ? (
            <p className="graph-only__error" role="alert">
              同じ列を複数の役割には使えません。別の列を選んでください。
            </p>
          ) : null}
          {yColumn !== "" && finiteYCount === 0 && parsed.rows.length > 0 ? (
            <p className="graph-only__error" role="alert">
              測定値の列に数値がありません。数値列を指定してください。
            </p>
          ) : null}
          {yColumn !== "" && finiteYCount > 0 && skippedYCount > 0 ? (
            <p className="graph-only__subtle">
              数値として読めない {skippedYCount} 行はGraphに表示せず、元の表には残します。
            </p>
          ) : null}
          {seriesMappingLooksLikeId ? (
            <div className="graph-only__mapping-warning" role="alert">
              <strong>選んだ系列列は、各行で値がすべて異なります。</strong>
              <p>
                試料IDの可能性があります。dish ID・Animal
                IDなどなら「対象・試料ID」へ移してください。
              </p>
              <label>
                <input
                  type="checkbox"
                  checked={allowUniqueSeries}
                  onChange={(event) => setAllowUniqueSeries(event.target.checked)}
                />
                各行を別系列として表示する意図である
              </label>
            </div>
          ) : null}
        </section>
        <div className="graph-only__data-next">
          <button
            className="primary-button"
            type="button"
            disabled={!canGraph}
            onClick={() => setWorkspaceTab("graph")}
          >
            Graphを作成
          </button>
        </div>
      </div>

      <section
        className="graph-only__result"
        aria-labelledby="graph-only-result-heading"
        hidden={workspaceTab === "data"}
      >
        <div className="graph-only__result-heading">
          <h2 id="graph-only-result-heading">
            {workspaceTab === "statistics" ? "Statistics" : "Graph"}
          </h2>
          <span className={canGraph ? "graph-only__ready" : "graph-only__waiting"}>
            {workspaceTab === "statistics"
              ? "実験構造を確認"
              : canGraph
                ? "Graphを編集中"
                : "列の指定を待っています"}
          </span>
        </div>
        {workspaceTab === "graph" && workbenchModel ? (
          <>
            <label className="graph-only__title-field">
              <span>Graphタイトル</span>
              <input
                value={graphPresentation.title}
                onChange={(event) =>
                  setGraphPresentation((current) => ({ ...current, title: event.target.value }))
                }
              />
            </label>
            <ExperimentGraphWorkbench
              key={JSON.stringify({ text, xColumn, yColumn, seriesColumn, idColumn })}
              draft={{ ...workbenchModel.draft, name: graphPresentation.title }}
              cells={workbenchModel.cells}
              workspaceMode="graph"
              analysisAvailable={false}
              semanticReadiness="unresolved_descriptive"
              initialState={workspaceGraphState ?? loadedEditorState}
              onStateChange={setWorkspaceGraphState}
              onClose={() => setWorkspaceTab("data")}
            />
          </>
        ) : workspaceTab === "graph" ? (
          <p className="graph-only__subtle">
            表を貼り付け、横軸と測定値を指定するとGraphが表示されます。
          </p>
        ) : null}
        {workspaceTab === "graph" ? (
          <div className="graph-only__result-actions">
            <button
              className="primary-button"
              type="button"
              disabled={!canGraph || !saveProject}
              aria-describedby={!saveProject ? "graph-only-save-unavailable" : undefined}
              onClick={() => void saveCurrentProject()}
            >
              このGraph用データを保存
            </button>
            <button
              className="secondary-button"
              type="button"
              onClick={() => {
                if (onStatisticsStructureRequested && canGraph) {
                  if (!statisticsRequestedRecordedRef.current) {
                    statisticsRequestedRecordedRef.current = true;
                    recordUsageMilestone(
                      routeFromPath(window.location.pathname),
                      "statistics_requested",
                    );
                  }
                  setStatisticsHandoffVisible(true);
                  setWorkspaceTab("statistics");
                  setStatisticsMessage(null);
                  return;
                }
                setStatisticsMessage(
                  "実験構造が未確定のため、統計解析は開始できません。実験から始める入口で、独立した対象・条件・対応関係を確認してください。",
                );
                recordStatisticsSafeStop();
              }}
            >
              統計を確認
            </button>
          </div>
        ) : null}
        {!saveProject ? (
          <p id="graph-only-save-unavailable" className="graph-only__subtle">
            このブラウザレビューではGraph用データを保存できません。デスクトップ版で利用できます。
          </p>
        ) : null}
        {workspaceTab === "statistics" && statisticsHandoffVisible ? (
          <section
            className="graph-only__statistics-handoff"
            aria-labelledby="graph-only-statistics-handoff-heading"
          >
            <h3 id="graph-only-statistics-handoff-heading">統計に必要な実験情報を追加</h3>
            <p>
              元の表とGraphはこの画面に保持します。まず、横軸の意味だけ確認してから実験の質問へ進みます。
            </p>
            <fieldset>
              <legend>
                横軸「{xColumn === "" ? "未指定" : parsed.headers[xColumn]}」は何を表しますか？
              </legend>
              <label>
                <input
                  type="radio"
                  name="graph-only-x-meaning"
                  checked={statisticsXMeaning === "condition"}
                  onChange={() => {
                    setStatisticsXMeaning("condition");
                    statisticsSafeStopRecordedRef.current = false;
                  }}
                />
                処理・群分け（Control、Drug A、genotypeなど）
              </label>
              <label>
                <input
                  type="radio"
                  name="graph-only-x-meaning"
                  checked={statisticsXMeaning === "ordered"}
                  onChange={() => {
                    setStatisticsXMeaning("ordered");
                    recordStatisticsSafeStop();
                  }}
                />
                時間・濃度・距離など順序のある値
              </label>
              <label>
                <input
                  type="radio"
                  name="graph-only-x-meaning"
                  checked={statisticsXMeaning === "unknown"}
                  onChange={() => {
                    setStatisticsXMeaning("unknown");
                    recordStatisticsSafeStop();
                  }}
                />
                その他、または分からない
              </label>
            </fieldset>
            {statisticsXMeaning === "condition" ? (
              <label className="experiment-start__field">
                <span>各行の対象・試料を示すID列（表にある場合）</span>
                <select
                  aria-label="統計で使う対象ID"
                  value={
                    identityDecision === "unanswered"
                      ? ""
                      : identityDecision === "no_id"
                        ? "no_id"
                        : String(idColumn)
                  }
                  onChange={(event) => {
                    if (event.target.value === "") {
                      setIdentityDecision("unanswered");
                      setIdColumn("");
                      setSourceRowUnitDecision("unanswered");
                    } else if (event.target.value === "no_id") {
                      setIdentityDecision("no_id");
                      setIdColumn("");
                      setSourceRowUnitDecision("unanswered");
                    } else {
                      setIdentityDecision("selected_column");
                      setIdColumn(Number(event.target.value));
                      setSourceRowUnitDecision("unanswered");
                    }
                  }}
                >
                  <option value="">選択してください</option>
                  <option value="no_id">元の表に対象・試料IDの列はない</option>
                  {columns}
                </select>
                <small>
                  DishID・AnimalIDなど、元の表にあるIDは独立した実験でも保持します。ID列を選んだだけでは対応ありと判断せず、次の質問で条件間の関係を確認します。行の順番から対応付けることはありません。
                  ID列がない場合は、各行が別々の対象だと確認できたときだけアプリ内IDを作ります。同じ対象を繰り返し測った実験には、元のID列が必要です。
                </small>
              </label>
            ) : null}
            {statisticsXMeaning === "condition" && identityDecision === "no_id" ? (
              <fieldset>
                <legend>表の各行は、別々に処置した実験対象・試料ですか？</legend>
                <label>
                  <input
                    type="radio"
                    name="graph-only-source-row-unit"
                    checked={sourceRowUnitDecision === "each_row_distinct_unit"}
                    onChange={() => {
                      setSourceRowUnitDecision("each_row_distinct_unit");
                      statisticsSafeStopRecordedRef.current = false;
                    }}
                  />
                  はい。各行が別々のanimal・dish・wellなどです
                </label>
                <label>
                  <input
                    type="radio"
                    name="graph-only-source-row-unit"
                    checked={sourceRowUnitDecision === "multiple_rows_per_unit"}
                    onChange={() => {
                      setSourceRowUnitDecision("multiple_rows_per_unit");
                      recordStatisticsSafeStop();
                    }}
                  />
                  いいえ。同じ対象内のCell・ROI・視野などを複数行に記録しています
                </label>
                <label>
                  <input
                    type="radio"
                    name="graph-only-source-row-unit"
                    checked={sourceRowUnitDecision === "unknown"}
                    onChange={() => {
                      setSourceRowUnitDecision("unknown");
                      recordStatisticsSafeStop();
                    }}
                  />
                  分からない
                </label>
              </fieldset>
            ) : null}
            {statisticsXMeaning === "condition" && identityDecision === "unanswered" ? (
              <p className="graph-only__error" role="status">
                対象・試料IDの列があるか回答してください。未回答のまま行番号をIDとして使うことはありません。
              </p>
            ) : null}
            {statisticsXMeaning === "condition" &&
            identityDecision === "no_id" &&
            sourceRowUnitDecision === "unanswered" ? (
              <p className="graph-only__error" role="status">
                各行が別々に処置した対象・試料か回答してください。回答前に行を独立したnとして扱うことはありません。
              </p>
            ) : null}
            {statisticsXMeaning === "condition" &&
            identityDecision === "no_id" &&
            sourceRowUnitDecision === "multiple_rows_per_unit" ? (
              <p className="graph-only__error" role="alert">
                Cell・ROI・視野を独立したnには変換しません。元の表へdish・animalなど共通の由来を示すID列を追加して選ぶまで、元データを保持して停止します。
              </p>
            ) : null}
            {statisticsXMeaning === "condition" &&
            identityDecision === "no_id" &&
            sourceRowUnitDecision === "unknown" ? (
              <p className="graph-only__error" role="alert">
                1行が何を表すか確認できるまで統計へ進みません。元の表とGraphは保持されています。
              </p>
            ) : null}
            {seriesColumn !== "" ? (
              <p className="graph-only__error" role="alert">
                選択中のグループ列が、処理条件・batch・表示だけの分類のどれか確認する必要があります。現在は自動で無視せず、元の表を保持して停止します。
              </p>
            ) : null}
            {statisticsXMeaning === "ordered" ? (
              <p className="graph-only__error" role="alert">
                順序のあるXを一般実験へ安全に引き継ぐ仕組みは準備中です。別の実験構造へ変換せず、元の表を保持します。
              </p>
            ) : null}
            {statisticsXMeaning === "unknown" ? (
              <p className="graph-only__error" role="alert">
                横軸の意味が決まるまで推測して進みません。元の表は保持されています。
              </p>
            ) : null}
            <button
              className="primary-button"
              type="button"
              disabled={
                statisticsXMeaning !== "condition" ||
                identityDecision === "unanswered" ||
                (identityDecision === "no_id" &&
                  sourceRowUnitDecision !== "each_row_distinct_unit") ||
                seriesColumn !== ""
              }
              onClick={() => {
                const state = buildState();
                if (state) onStatisticsStructureRequested?.(state);
                else recordStatisticsSafeStop();
              }}
            >
              実験構造の確認へ
            </button>
          </section>
        ) : null}
        {saveMessage ? (
          <p className="graph-only__success" role="status">
            {saveMessage}
          </p>
        ) : null}
        {statisticsMessage ? (
          <p className="graph-only__error" role="alert">
            {statisticsMessage}
          </p>
        ) : null}
        {error ? (
          <p className="graph-only__error" role="alert">
            {error}
          </p>
        ) : null}
      </section>
    </div>
  );
}

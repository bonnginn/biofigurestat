import { lazy, Suspense, useEffect, useMemo, useRef, useState } from "react";

import {
  appendUnresolvedVisualizationDataRevision,
  appendUnresolvedVisualizationGraph,
  createUnresolvedVisualizationProjectState,
  UnresolvedVisualizationProjectStateSchema,
  type UnresolvedVisualizationProjectState,
  type UnresolvedVisualizationIdentityDecision,
  type UnresolvedVisualizationSourceRowUnitDecision,
} from "@lsaa/project";

import type {
  OpenUnresolvedVisualizationProjectAction,
  SaveUnresolvedVisualizationProjectAction,
} from "../app/projectActions";
import type { AppRoute } from "../app/routes";
import type { RegisterWorkspaceSaveHandler, RequestWorkspaceExit } from "../app/workspaceLifecycle";
import { routeFromPath } from "../app/routes";
import { DelimitedTextSpreadsheet } from "../components/DelimitedTextSpreadsheet";
import { LocalizedFileInput } from "../components/LocalizedFileInput";
import {
  graphOnlySeriesKeys,
  graphOnlyUsesNumericXAxis,
  type GraphOnlyPresentation,
} from "../app/graphOnlyTableSemantics";
import { createGraphOnlyWorkbenchModel } from "../app/graphOnlyWorkbenchAdapter";
import type { WorkspaceGraphState } from "../app/experimentWorkspaceProject";
import { GraphOnlyColumnMappingPanel } from "../components/graph/GraphOnlyColumnMappingPanel";
import { GraphOnlyStatisticsHandoff } from "../components/graph/GraphOnlyStatisticsHandoff";
import { recordUsageGraphConfiguration, recordUsageMilestone } from "../app/usageTelemetry";
import { localizedFailureMessage, localizedText, useAppLocale } from "../app/appLocale";
import "./GraphOnlyVisualizationPage.css";
import {
  createGraphOnlyColumnMapping,
  graphOnlyNumericValue,
  graphOnlySourceKind,
  parseVisualizationInput,
  type GraphOnlyColumnIndex as ColumnIndex,
} from "../app/graphOnlyVisualizationInput";
import {
  DIRECT_ENTRY_TEMPLATE,
  activeGraphOnlyGraph,
  graphOnlyEditorPresentation,
  graphOnlyGraphSpec,
  graphOnlyLifecycleSnapshot,
  initialGraphOnlyColumn,
  initialGraphOnlyEditorState,
  initialGraphOnlyIdentityDecision,
  initialGraphOnlyPresentation,
  initialGraphOnlySourceRowUnitDecision,
  sameGraphOnlyGraph,
  sameGraphOnlyMapping,
} from "../app/graphOnlyVisualizationState";

const ExperimentGraphWorkbench = lazy(() =>
  import("../components/graph/ExperimentGraphWorkbench").then(
    ({ ExperimentGraphWorkbench: GraphWorkbench }) => ({ default: GraphWorkbench }),
  ),
);

type GraphType = WorkspaceGraphState["graphType"];

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
  const locale = useAppLocale();
  const t = (ja: string, en: string) => localizedText(locale, ja, en);
  const compatibleInitialState = initialState?.entryIntent === "graph_only" ? initialState : null;
  const initialIntentError =
    initialState && initialState.entryIntent !== "graph_only"
      ? t(
          "このファイルは表からGraph用のprojectではありません。",
          "This file is not a Graph-from-table project.",
        )
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
    compatibleInitialState ? initialGraphOnlyColumn(compatibleInitialState, "x") : 0,
  );
  const [yColumn, setYColumn] = useState<ColumnIndex>(
    compatibleInitialState ? initialGraphOnlyColumn(compatibleInitialState, "y") : 1,
  );
  const [seriesColumn, setSeriesColumn] = useState<ColumnIndex>(
    initialGraphOnlyColumn(compatibleInitialState, "series"),
  );
  const [idColumn, setIdColumn] = useState<ColumnIndex>(
    initialGraphOnlyColumn(compatibleInitialState, "id"),
  );
  const [identityDecision, setIdentityDecision] = useState<UnresolvedVisualizationIdentityDecision>(
    initialGraphOnlyIdentityDecision(compatibleInitialState),
  );
  const [sourceRowUnitDecision, setSourceRowUnitDecision] =
    useState<UnresolvedVisualizationSourceRowUnitDecision>(
      initialGraphOnlySourceRowUnitDecision(compatibleInitialState),
    );
  const [graphPresentation, setGraphPresentation] = useState<GraphOnlyPresentation>(() =>
    initialGraphOnlyPresentation(compatibleInitialState, locale),
  );
  const [preferredGraphType, setPreferredGraphType] = useState<GraphType>(
    activeGraphOnlyGraph(compatibleInitialState)?.editorPresentation?.graphType ?? "dot",
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
  const [allowUniqueSeries, setAllowUniqueSeries] = useState(
    Boolean(compatibleInitialState?.activeGraphId),
  );
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
    preferredGraphType,
    presentation: graphPresentation,
    editorPresentation:
      graphOnlyEditorPresentation(workspaceGraphState) ??
      activeGraphOnlyGraph(compatibleInitialState)?.editorPresentation,
  });
  const savedLifecycleSnapshotRef = useRef<string | null>(initialDirty ? null : lifecycleSnapshot);
  const isDirty =
    savedLifecycleSnapshotRef.current === null ||
    lifecycleSnapshot !== savedLifecycleSnapshotRef.current;
  useEffect(() => {
    onDirtyChange?.(isDirty);
  }, [isDirty, onDirtyChange]);
  const parsedResult = useMemo(() => parseVisualizationInput(text, locale), [locale, text]);
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
          (count, row) => count + (graphOnlyNumericValue(row[yColumn]) === null ? 0 : 1),
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
        ? initialGraphOnlyEditorState(workbenchModel, activeGraphOnlyGraph(loadedState))
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

  const buildState = (): UnresolvedVisualizationProjectState | null => {
    if (!canGraph) return null;
    const selectedX = xColumn as number;
    const selectedY = yColumn as number;
    const timestamp = nowIso();
    const tableId = loadedState?.table.id ?? visualizationId("table");
    const projectTitle =
      graphPresentation.title.trim() || t("表から作成したGraph", "Graph created from a table");
    const metadata = loadedState?.metadata ?? newMetadata(projectTitle, timestamp);
    const numericXAxis = graphOnlyUsesNumericXAxis(parsed, selectedX, selectedY, seriesColumn);
    const seriesKeys = graphOnlySeriesKeys(parsed, selectedX, selectedY, seriesColumn);
    const lineageSource = graphOnlySourceKind(sourceLabel, parsed.delimiter);
    const candidateMapping = createGraphOnlyColumnMapping(
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
      loadedState?.mapping && sameGraphOnlyMapping(loadedState.mapping, candidateMapping)
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
    const activeGraph = activeGraphOnlyGraph(base);
    const comparisonSpec = graphOnlyGraphSpec(
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
      graphOnlyEditorPresentation(workspaceGraphState) ?? activeGraph?.editorPresentation,
    );
    if (sameGraphOnlyGraph(activeGraph, comparisonSpec)) return base;
    const spec = activeGraph ? { ...comparisonSpec, id: visualizationId("graph") } : comparisonSpec;
    return appendUnresolvedVisualizationGraph(base, {
      spec,
      actor: "researcher",
      createdAt: timestamp,
    });
  };

  const applyLoadedState = (state: UnresolvedVisualizationProjectState, target?: string) => {
    if (state.entryIntent !== "graph_only") {
      throw new Error(
        t(
          "このファイルは表からGraph用のprojectではありません。",
          "This file is not a Graph-from-table project.",
        ),
      );
    }
    setLoadedState(state);
    setSavedTarget(target);
    setText(state.rawLineage.rawText);
    setSourceLabel(state.rawLineage.sourceLabel);
    setXColumn(initialGraphOnlyColumn(state, "x"));
    setYColumn(initialGraphOnlyColumn(state, "y"));
    setSeriesColumn(initialGraphOnlyColumn(state, "series"));
    setIdColumn(initialGraphOnlyColumn(state, "id"));
    setIdentityDecision(initialGraphOnlyIdentityDecision(state));
    setSourceRowUnitDecision(initialGraphOnlySourceRowUnitDecision(state));
    const loadedPresentation = initialGraphOnlyPresentation(state, locale);
    setGraphPresentation(loadedPresentation);
    setPreferredGraphType(activeGraphOnlyGraph(state)?.editorPresentation?.graphType ?? "dot");
    setWorkspaceGraphState(null);
    setAllowUniqueSeries(Boolean(state.activeGraphId));
    setWorkspaceTab(state.activeGraphId ? "graph" : "data");
    setError(null);
    setSaveMessage(
      target ? t("保存したGraph用データを開きました。", "Opened saved Graph data.") : null,
    );
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
      xColumn: initialGraphOnlyColumn(state, "x"),
      yColumn: initialGraphOnlyColumn(state, "y"),
      seriesColumn: initialGraphOnlyColumn(state, "series"),
      idColumn: initialGraphOnlyColumn(state, "id"),
      identityDecision: initialGraphOnlyIdentityDecision(state),
      sourceRowUnitDecision: initialGraphOnlySourceRowUnitDecision(state),
      preferredGraphType: activeGraphOnlyGraph(state)?.editorPresentation?.graphType ?? "dot",
      presentation: loadedPresentation,
      editorPresentation: activeGraphOnlyGraph(state)?.editorPresentation,
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
      setSaveMessage(
        t(
          "Graph用データを保存しました。元の表と列の指定を保持しています。",
          "Saved the Graph data, including the source table and column mappings.",
        ),
      );
      onDirtyChange?.(false);
      recordUsageMilestone(routeFromPath(window.location.pathname), "project_saved");
      return true;
    } catch (reason) {
      setError(
        localizedFailureMessage(
          locale,
          reason,
          "Graph用データを保存できませんでした。",
          "The Graph data could not be saved.",
        ),
      );
      return false;
    }
  };
  const saveCurrentProjectRef = useRef(saveCurrentProject);
  const buildStateRef = useRef(buildState);
  useEffect(() => {
    saveCurrentProjectRef.current = saveCurrentProject;
    buildStateRef.current = buildState;
  }, [saveCurrentProject]);
  useEffect(() => {
    if (!onRegisterSaveHandler) return;
    onRegisterSaveHandler({
      save: (saveAs) => saveCurrentProjectRef.current(Boolean(saveAs)),
      checkpoint: () => {
        const state = buildStateRef.current();
        return state && savedTarget
          ? { kind: "unresolved_visualization", project: { state, target: savedTarget } }
          : null;
      },
    });
    return () => onRegisterSaveHandler(null);
  }, [onRegisterSaveHandler, savedTarget]);

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
    <div
      className={`page-stack graph-only graph-only--workspace${workspaceTab === "data" ? "" : " graph-only--workspace-active"}`}
    >
      <button
        className="back-link"
        type="button"
        onClick={() =>
          requestExit(t("入口へ戻る", "Back to entry"), onBack ?? (() => onNavigate("home")))
        }
      >
        <span aria-hidden="true">←</span> {t("入口へ戻る", "Back to entry")}
      </button>
      <header className="graph-only__header">
        <p className="experiment-start__eyebrow">{t("表からGraph", "Graph from a table")}</p>
        <h1>{t("手元の表からGraphを作る", "Create a Graph from your table")}</h1>
        <p>
          {t(
            "表の列を指定してGraphを作ります。実験構造や統計的なnは、統計を使うまで質問しません。",
            "Map table columns to a Graph. BioFigureStat will not ask about experimental structure or statistical n until you request statistics.",
          )}
        </p>
      </header>

      <nav
        className="graph-only__workspace-tabs"
        aria-label={t("表からGraphの作業段階", "Graph-from-table workflow")}
      >
        <button
          type="button"
          aria-current={workspaceTab === "data" ? "page" : undefined}
          onClick={() => setWorkspaceTab("data")}
        >
          {t("データ", "Data")}
        </button>
        <button
          type="button"
          disabled={!canGraph}
          aria-current={workspaceTab === "graph" ? "page" : undefined}
          onClick={() => setWorkspaceTab("graph")}
        >
          {t("グラフ", "Graph")}
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
          {t("統計", "Statistics")}
        </button>
        <span className="graph-only__workspace-save-actions">
          <button
            className="graph-only__save-button"
            type="button"
            disabled={!canGraph || !saveProject}
            onClick={() => void saveCurrentProject()}
          >
            {t("保存", "Save")}
          </button>
          <button
            className="graph-only__save-button"
            type="button"
            disabled={!canGraph || !saveProject}
            onClick={() => void saveCurrentProject(true)}
          >
            {t("別名で保存", "Save As")}
          </button>
        </span>
      </nav>

      <div className="graph-only__data-workspace" hidden={workspaceTab !== "data"}>
        <section className="graph-only__input" aria-labelledby="graph-only-input-heading">
          <div className="graph-only__section-heading">
            <h2 id="graph-only-input-heading">
              {t("1. 表に入力・貼り付ける", "1. Enter or paste a table")}
            </h2>
            <div className="graph-only__actions">
              <button
                className="secondary-button"
                type="button"
                onClick={() => {
                  const clipboard = navigator.clipboard;
                  if (!clipboard) {
                    setError(
                      t(
                        "クリップボードを読み取れませんでした。下のシートへ直接貼り付けてください。",
                        "The clipboard could not be read. Paste directly into the worksheet below.",
                      ),
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
                        t(
                          "クリップボードを読み取れませんでした。下のシートへ直接貼り付けてください。",
                          "The clipboard could not be read. Paste directly into the worksheet below.",
                        ),
                      ),
                    );
                }}
              >
                {t("クリップボードから貼り付け", "Paste from clipboard")}
              </button>
              {openProject ? (
                <button
                  className="secondary-button"
                  type="button"
                  onClick={() => {
                    requestExit(
                      t("保存したGraph用データを開く", "Open saved Graph data"),
                      async () => {
                        await openProject()
                          .then((opened) => {
                            if (opened) applyLoadedState(opened.state, opened.target);
                          })
                          .catch((reason: unknown) =>
                            setError(
                              localizedFailureMessage(
                                locale,
                                reason,
                                "保存したGraph用データを開けませんでした。",
                                "The saved Graph data could not be opened.",
                              ),
                            ),
                          );
                      },
                    );
                  }}
                >
                  {t("保存したGraph用データを開く", "Open saved Graph data")}
                </button>
              ) : null}
            </div>
          </div>
          <p className="graph-only__subtle">
            {t(
              "見出しの下へ直接入力するか、Excelから長方形の範囲を左上セルへ貼り付けてください。直接入力用のX列とY列だけを最初からGraphへ対応付けています。GroupとIDは必要なときだけ使います。",
              "Enter data below the headers or paste a rectangular range from Excel into the top-left cell. Only the initial X and Y columns are mapped automatically. Use Group and ID only when needed.",
            )}
          </p>
          <DelimitedTextSpreadsheet
            value={text}
            onChange={(nextText, source) => {
              const nextParsedResult = parseVisualizationInput(nextText, locale);
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
            ariaLabel={t("Graph用データシート", "Graph data worksheet")}
            caption={t("Graph用データ", "Graph data")}
            minimumRows={6}
            minimumColumns={4}
            testIdPrefix="graph-only"
            replaceOnPasteAtOrigin
            allowWorkbookSheetStacking
          />
          <div className="graph-only__file">
            <LocalizedFileInput
              label={t(
                "CSV / TSV / TXTファイルを同じシートへ読み込む",
                "Load a CSV / TSV / TXT file into the same worksheet",
              )}
              ariaLabel={t("Graph用の表ファイル", "Table file for the Graph")}
              accept=".csv,.tsv,.txt,text/csv,text/tab-separated-values,text/plain"
              onChange={(event) => {
                const file = event.currentTarget.files?.[0];
                if (!file) return;
                void file
                  .text()
                  .then((contents) => {
                    applyImportedText(contents, file.name);
                  })
                  .catch(() =>
                    setError(
                      t("表ファイルを読み込めませんでした。", "The table file could not be read."),
                    ),
                  );
              }}
            />
            <small>
              {t(
                "CSV / TSV / TXTはここから、XLS / XLSX / XLSM / XLSBは上のExcel読込から開けます。任意の行だけを解析対象から外す操作は未対応です。",
                "Load CSV / TSV / TXT here. Use the Excel import above for XLS / XLSX / XLSM / XLSB. Excluding selected rows from analysis is not supported yet.",
              )}
            </small>
          </div>
          {parsedResult.error ? (
            <p className="graph-only__error" role="alert">
              {parsedResult.error}
            </p>
          ) : null}
        </section>

        <GraphOnlyColumnMappingPanel
          headers={parsed.headers}
          rowCount={parsed.rows.length}
          xColumn={xColumn}
          yColumn={yColumn}
          seriesColumn={seriesColumn}
          idColumn={idColumn}
          preferredGraphType={preferredGraphType}
          duplicateMapping={duplicateMapping}
          finiteYCount={finiteYCount}
          skippedYCount={skippedYCount}
          seriesMappingLooksLikeId={seriesMappingLooksLikeId}
          allowUniqueSeries={allowUniqueSeries}
          onXColumnChange={(column) => {
            setXColumn(column);
            setGraphPresentation((current) => ({ ...current, xLabel: null }));
            setWorkspaceGraphState(null);
          }}
          onYColumnChange={(column) => {
            setYColumn(column);
            setGraphPresentation((current) => ({ ...current, yLabel: null }));
            setWorkspaceGraphState(null);
          }}
          onSeriesColumnChange={(column) => {
            setSeriesColumn(column);
            setGraphPresentation((current) => ({ ...current, seriesLabels: {} }));
            setAllowUniqueSeries(false);
            setWorkspaceGraphState(null);
          }}
          onIdColumnChange={(column) => {
            setIdColumn(column);
            setIdentityDecision(column === "" ? "unanswered" : "selected_column");
            setSourceRowUnitDecision("unanswered");
            setWorkspaceGraphState(null);
          }}
          onPreferredGraphTypeChange={(graphType) => {
            setPreferredGraphType(graphType);
            setWorkspaceGraphState(null);
          }}
          onAllowUniqueSeriesChange={setAllowUniqueSeries}
        />
        <div className="graph-only__data-next">
          <button
            className="primary-button"
            type="button"
            disabled={!canGraph}
            onClick={() => setWorkspaceTab("graph")}
          >
            {t("Graphを作成", "Create Graph")}
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
            {workspaceTab === "statistics" ? t("統計", "Statistics") : t("グラフ", "Graph")}
          </h2>
          <span className={canGraph ? "graph-only__ready" : "graph-only__waiting"}>
            {workspaceTab === "statistics"
              ? t("実験構造を確認", "Confirm experiment structure")
              : canGraph
                ? t("Graphを編集中", "Editing Graph")
                : t("列の指定を待っています", "Waiting for column mapping")}
          </span>
        </div>
        {workspaceTab === "graph" && workbenchModel ? (
          <>
            <label className="graph-only__title-field">
              <span>{t("Graphタイトル", "Graph title")}</span>
              <input
                value={graphPresentation.title}
                onChange={(event) =>
                  setGraphPresentation((current) => ({ ...current, title: event.target.value }))
                }
              />
            </label>
            <Suspense
              fallback={
                <p className="graph-only__subtle" role="status">
                  {t("グラフ編集画面を読み込んでいます…", "Loading the Graph editor…")}
                </p>
              }
            >
              <ExperimentGraphWorkbench
                key={JSON.stringify({
                  text,
                  xColumn,
                  yColumn,
                  seriesColumn,
                  idColumn,
                  preferredGraphType,
                })}
                draft={{ ...workbenchModel.draft, name: graphPresentation.title }}
                cells={workbenchModel.cells}
                workspaceMode="graph"
                analysisAvailable={false}
                semanticReadiness="unresolved_descriptive"
                initialGraphType={preferredGraphType}
                initialState={workspaceGraphState ?? loadedEditorState}
                onStateChange={setWorkspaceGraphState}
                onClose={() => setWorkspaceTab("data")}
              />
            </Suspense>
          </>
        ) : workspaceTab === "graph" ? (
          <p className="graph-only__subtle">
            {t(
              "表を貼り付け、横軸と測定値を指定するとGraphが表示されます。",
              "Paste a table and map the X axis and measured value to display a Graph.",
            )}
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
              {t("このGraph用データを保存", "Save this Graph data")}
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
                  t(
                    "実験構造が未確定のため、統計解析は開始できません。実験から始める入口で、独立した対象・条件・対応関係を確認してください。",
                    "Statistics cannot start because the experiment structure is not confirmed. Use Start from an experiment to confirm independent units, conditions, and matching.",
                  ),
                );
                recordStatisticsSafeStop();
              }}
            >
              {t("統計を確認", "Review statistics")}
            </button>
          </div>
        ) : null}
        {!saveProject ? (
          <p id="graph-only-save-unavailable" className="graph-only__subtle">
            {t(
              "このブラウザレビューではGraph用データを保存できません。デスクトップ版で利用できます。",
              "Graph data cannot be saved in this browser preview. Use the desktop app.",
            )}
          </p>
        ) : null}
        {workspaceTab === "statistics" && statisticsHandoffVisible ? (
          <GraphOnlyStatisticsHandoff
            headers={parsed.headers}
            xColumn={xColumn}
            seriesColumn={seriesColumn}
            idColumn={idColumn}
            identityDecision={identityDecision}
            sourceRowUnitDecision={sourceRowUnitDecision}
            xMeaning={statisticsXMeaning}
            onXMeaningChange={(meaning) => {
              setStatisticsXMeaning(meaning);
              if (meaning === "condition") {
                statisticsSafeStopRecordedRef.current = false;
              } else {
                recordStatisticsSafeStop();
              }
            }}
            onIdentitySelectionChange={(selection) => {
              if (selection === "") {
                setIdentityDecision("unanswered");
                setIdColumn("");
              } else if (selection === "no_id") {
                setIdentityDecision("no_id");
                setIdColumn("");
              } else {
                setIdentityDecision("selected_column");
                setIdColumn(selection);
              }
              setSourceRowUnitDecision("unanswered");
            }}
            onSourceRowUnitDecisionChange={(decision) => {
              setSourceRowUnitDecision(decision);
              if (decision === "each_row_distinct_unit") {
                statisticsSafeStopRecordedRef.current = false;
              } else {
                recordStatisticsSafeStop();
              }
            }}
            onContinue={() => {
              const state = buildState();
              if (state) onStatisticsStructureRequested?.(state);
              else recordStatisticsSafeStop();
            }}
          />
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

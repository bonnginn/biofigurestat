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

  const columns = parsed.headers.map((header, index) => (
    <option key={`${index}.${header}`} value={index}>
      {header || t(`列 ${index + 1}`, `Column ${index + 1}`)}
    </option>
  ));

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
          <section
            className="graph-only__statistics-handoff"
            aria-labelledby="graph-only-statistics-handoff-heading"
          >
            <h3 id="graph-only-statistics-handoff-heading">
              {t(
                "統計に必要な実験情報を追加",
                "Add experiment information required for statistics",
              )}
            </h3>
            <p>
              {t(
                "元の表とGraphはこの画面に保持します。まず、横軸の意味だけ確認してから実験の質問へ進みます。",
                "The source table and Graph remain on this screen. First confirm what the X axis means, then continue to the experiment questions.",
              )}
            </p>
            <fieldset>
              <legend>
                {t(
                  `横軸「${xColumn === "" ? "未指定" : parsed.headers[xColumn]}」は何を表しますか？`,
                  `What does the X axis “${xColumn === "" ? "not selected" : parsed.headers[xColumn]}” represent?`,
                )}
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
                {t(
                  "処理・群分け（Control、Drug A、genotypeなど）",
                  "Treatment or group (for example Control, Drug A, or genotype)",
                )}
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
                {t(
                  "時間・濃度・距離など順序のある値",
                  "An ordered value such as time, concentration, or distance",
                )}
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
                {t("その他、または分からない", "Other or unknown")}
              </label>
            </fieldset>
            {statisticsXMeaning === "condition" ? (
              <label className="experiment-start__field">
                <span>
                  {t(
                    "各行の対象・試料を示すID列（表にある場合）",
                    "ID column identifying the subject or sample in each row (if present)",
                  )}
                </span>
                <select
                  aria-label={t("統計で使う対象ID", "Subject ID used for statistics")}
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
                  <option value="">{t("選択してください", "Select")}</option>
                  <option value="no_id">
                    {t(
                      "元の表に対象・試料IDの列はない",
                      "The source table has no subject or sample ID column",
                    )}
                  </option>
                  {columns}
                </select>
                <small>
                  {t(
                    "DishID・AnimalIDなど、元の表にあるIDは独立した実験でも保持します。ID列を選んだだけでは対応ありと判断せず、次の質問で条件間の関係を確認します。行の順番から対応付けることはありません。ID列がない場合は、各行が別々の対象だと確認できたときだけアプリ内IDを作ります。同じ対象を繰り返し測った実験には、元のID列が必要です。",
                    "IDs present in the source table, such as Dish ID or Animal ID, are retained even for independent experiments. Selecting an ID column does not imply matching; the next question confirms the relationship between conditions. Rows are never matched by order. Without an ID column, app-generated IDs are created only after you confirm that every row is a distinct subject. Repeated measurements of the same subject require an ID column in the source table.",
                  )}
                </small>
              </label>
            ) : null}
            {statisticsXMeaning === "condition" && identityDecision === "no_id" ? (
              <fieldset>
                <legend>
                  {t(
                    "表の各行は、別々に処置した実験対象・試料ですか？",
                    "Is each row a separately treated experimental subject or sample?",
                  )}
                </legend>
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
                  {t(
                    "はい。各行が別々のanimal・dish・wellなどです",
                    "Yes. Each row is a different animal, dish, well, or similar unit",
                  )}
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
                  {t(
                    "いいえ。同じ対象内のCell・ROI・視野などを複数行に記録しています",
                    "No. Multiple rows record cells, ROIs, fields, or similar observations within the same subject",
                  )}
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
                  {t("分からない", "I do not know")}
                </label>
              </fieldset>
            ) : null}
            {statisticsXMeaning === "condition" && identityDecision === "unanswered" ? (
              <p className="graph-only__error" role="status">
                {t(
                  "対象・試料IDの列があるか回答してください。未回答のまま行番号をIDとして使うことはありません。",
                  "Indicate whether a subject or sample ID column exists. Row numbers will not be used as IDs without your answer.",
                )}
              </p>
            ) : null}
            {statisticsXMeaning === "condition" &&
            identityDecision === "no_id" &&
            sourceRowUnitDecision === "unanswered" ? (
              <p className="graph-only__error" role="status">
                {t(
                  "各行が別々に処置した対象・試料か回答してください。回答前に行を独立したnとして扱うことはありません。",
                  "Confirm whether each row is a separately treated subject or sample. Rows will not be treated as independent n before confirmation.",
                )}
              </p>
            ) : null}
            {statisticsXMeaning === "condition" &&
            identityDecision === "no_id" &&
            sourceRowUnitDecision === "multiple_rows_per_unit" ? (
              <p className="graph-only__error" role="alert">
                {t(
                  "Cell・ROI・視野を独立したnには変換しません。元の表へdish・animalなど共通の由来を示すID列を追加して選ぶまで、元データを保持して停止します。",
                  "Cells, ROIs, or fields will not be converted into independent n. The source data are retained and the workflow stops until you add and select an ID column identifying their shared dish, animal, or other origin.",
                )}
              </p>
            ) : null}
            {statisticsXMeaning === "condition" &&
            identityDecision === "no_id" &&
            sourceRowUnitDecision === "unknown" ? (
              <p className="graph-only__error" role="alert">
                {t(
                  "1行が何を表すか確認できるまで統計へ進みません。元の表とGraphは保持されています。",
                  "Statistics will not continue until the meaning of one row is confirmed. The source table and Graph are retained.",
                )}
              </p>
            ) : null}
            {seriesColumn !== "" ? (
              <p className="graph-only__error" role="alert">
                {t(
                  "選択中のグループ列が、処理条件・batch・表示だけの分類のどれか確認する必要があります。現在は自動で無視せず、元の表を保持して停止します。",
                  "The selected group column must be identified as a treatment condition, batch, or display-only category. BioFigureStat retains the source table and stops instead of ignoring it automatically.",
                )}
              </p>
            ) : null}
            {statisticsXMeaning === "ordered" ? (
              <p className="graph-only__error" role="alert">
                {t(
                  "順序のあるXを一般実験へ安全に引き継ぐ仕組みは準備中です。別の実験構造へ変換せず、元の表を保持します。",
                  "Safe transfer of an ordered X axis into the general experiment workflow is not available yet. The source table is retained without converting it to another experiment structure.",
                )}
              </p>
            ) : null}
            {statisticsXMeaning === "unknown" ? (
              <p className="graph-only__error" role="alert">
                {t(
                  "横軸の意味が決まるまで推測して進みません。元の表は保持されています。",
                  "BioFigureStat will not guess and continue until the meaning of the X axis is known. The source table is retained.",
                )}
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
              {t("実験構造の確認へ", "Continue to experiment structure")}
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

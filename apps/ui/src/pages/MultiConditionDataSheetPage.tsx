import { useEffect, useRef, useState, type KeyboardEvent } from "react";

import {
  AnalysisEngineResultSchema,
  createD03EngineRequest,
  createD04EngineRequest,
  createD05EngineRequest,
  type AnalysisEngineRequest,
  type AnalysisEngineResult,
  type AnalysisRecommendation,
} from "@lsaa/analysis-contracts";
import {
  toCanonicalMultiConditionObservations,
  toCanonicalRepeatedConditionObservations,
  createNestedScalarDerivedDataset,
  type CanonicalSheetResult,
  type DraftMeasurement,
  type IndependentMultiConditionDataSheet,
  type RepeatedConditionDataSheet,
  type SheetValidationIssue,
} from "@lsaa/data-sheet";
import type {
  DerivedDatasetRevision,
  DerivedScalarValue,
  ExperimentDesign,
  Observation,
  ProjectMetadata,
  TransformationSpec,
} from "@lsaa/domain";
import {
  createCoreGraphModel,
  createCoreMultiGroupGraphSpec,
  createCoreRepeatedGroupGraphSpec,
  GraphSpecSchema,
  type CoreGraphModel,
  type GraphSpec,
} from "@lsaa/graph-spec";
import {
  appendAnalysisExecution,
  appendDesignRevision,
  appendRawRevision,
  createInitialProjectState,
  ProjectStateSchema,
  type ProjectState,
} from "@lsaa/project";

import {
  cancelLocalAnalysis,
  defaultAnalysisRunner,
  type AnalysisRunner,
} from "../app/analysisClient";
import { localizedText, useAppLocale } from "../app/appLocale";
import { updateNestedPayloadExperimentDate } from "../app/nestedPayloadDates";
import {
  actionErrorMessage,
  type OpenedProject,
  type SaveProjectAction,
} from "../app/projectActions";
import {
  metadataDraftIsComplete,
  metadataForPersistence,
  type ProjectMetadataDraft,
} from "../app/projectMetadata";
import type { RegisterWorkspaceSaveHandler, RequestWorkspaceExit } from "../app/workspaceLifecycle";
import {
  methodLabel,
  recommendationExplanation,
  statisticalNLabel,
  templateLabel,
} from "../app/recommendationLabels";
import { AnalysisResultView } from "./AnalysisResultView";
import { BulkPasteScalar } from "../components/BulkPasteScalar";
import { NestedImageJPaste, type NestedImageJPastePayload } from "../components/NestedImageJPaste";
import {
  SpreadsheetGridInput,
  type SpreadsheetGridInputProps,
} from "../components/SpreadsheetGridInput";
import { nextRovingTabIndex } from "../components/rovingTab";
import {
  formatProportionPercentage,
  parseSpreadsheetNumber,
} from "../components/spreadsheetValues";
import "./MultiConditionDataSheetPage.css";

type Props = {
  design: ExperimentDesign;
  recommendation: AnalysisRecommendation;
  sheet: IndependentMultiConditionDataSheet | RepeatedConditionDataSheet;
  outcomeLabel: string;
  onBack: () => void;
  analysisRunner?: AnalysisRunner;
  saveProject?: SaveProjectAction;
  initialProject?: OpenedProject;
  metadataDraft?: ProjectMetadataDraft;
  onDirtyChange?: (dirty: boolean) => void;
  onRequestExit?: RequestWorkspaceExit;
  onRegisterSaveHandler?: RegisterWorkspaceSaveHandler;
};

type WorkflowTabId = "input" | "analysis" | "graph" | "save";
const TABS: ReadonlyArray<{ id: WorkflowTabId; label: string }> = [
  { id: "input", label: "1 データ入力" },
  { id: "analysis", label: "2 解析" },
  { id: "graph", label: "3 グラフ" },
  { id: "save", label: "4 保存" },
];

type AnalysisRun = {
  request: AnalysisEngineRequest;
  result: AnalysisEngineResult;
  graphSpec: GraphSpec | null;
  graphModel: CoreGraphModel | null;
};

type EngineObservation = AnalysisEngineRequest["observations"][number];

function numericEngineObservations(
  observations: readonly EngineObservation[],
): Array<EngineObservation & { value: number }> {
  return observations.filter(
    (observation): observation is EngineObservation & { value: number } =>
      typeof observation.value === "number",
  );
}

type CanonicalData = Omit<Extract<CanonicalSheetResult, { success: true }>, "success"> & {
  rawObservations?: Observation[];
  transformation?: TransformationSpec;
  derivedRevision?: DerivedDatasetRevision;
  derivedValues?: DerivedScalarValue[];
  projectDesign?: ExperimentDesign;
};

let sequence = 0;
function token() {
  if (typeof crypto !== "undefined" && typeof crypto.randomUUID === "function") {
    return crypto.randomUUID();
  }
  sequence += 1;
  return `${Date.now().toString(36)}.${sequence}`;
}

function issueLabel(issue: SheetValidationIssue) {
  if (issue.code === "missing_value") return "すべての実験単位に値を入力してください。";
  if (issue.code === "incomplete_proportion")
    return "陽性細胞数と総細胞数をすべて入力してください。";
  return issue.message;
}

type MultiConditionSheet = IndependentMultiConditionDataSheet | RepeatedConditionDataSheet;
type MultiConditionMeasurement =
  IndependentMultiConditionDataSheet["columns"][number]["entries"][number]["measurement"];

function updateEntry(
  sheet: MultiConditionSheet,
  columnIndex: number,
  entryIndex: number,
  measurement: MultiConditionMeasurement,
): MultiConditionSheet {
  if (sheet.relationship === "matched") {
    return {
      ...sheet,
      columns: sheet.columns.map((column, index) =>
        index === columnIndex
          ? {
              ...column,
              entries: column.entries.map((entry, indexInColumn) =>
                indexInColumn === entryIndex
                  ? { ...entry, measurement, sourceLocation: undefined }
                  : entry,
              ),
            }
          : column,
      ),
    };
  }
  const columns = sheet.columns.map((column, index) =>
    index === columnIndex
      ? {
          ...column,
          entries: column.entries.map((entry, indexInColumn) =>
            indexInColumn === entryIndex
              ? { ...entry, measurement, sourceLocation: undefined }
              : entry,
          ),
        }
      : column,
  );
  return { ...sheet, columns };
}

function updateEntryExperimentDate(
  sheet: MultiConditionSheet,
  columnIndex: number,
  entryIndex: number,
  experimentDate: string,
): MultiConditionSheet {
  if (sheet.relationship === "matched") {
    return {
      ...sheet,
      columns: sheet.columns.map((column) => ({
        ...column,
        entries: column.entries.map((entry, index) =>
          index === entryIndex ? { ...entry, experimentDate } : entry,
        ),
      })),
    };
  }
  return {
    ...sheet,
    columns: sheet.columns.map((column, index) =>
      index === columnIndex
        ? {
            ...column,
            entries: column.entries.map((entry, indexInColumn) =>
              indexInColumn === entryIndex ? { ...entry, experimentDate } : entry,
            ),
          }
        : column,
    ),
  };
}

function multiPercentageLabel(measurement: MultiConditionMeasurement): string {
  return measurement.kind === "proportion" ? formatProportionPercentage(measurement) : "—";
}

function MultiGridInput(props: Omit<SpreadsheetGridInputProps, "baseClassName">) {
  return <SpreadsheetGridInput {...props} baseClassName="multi-sheet-grid-input" />;
}

function applyScalarValuesToIndependentMultiCondition(
  sheet: IndependentMultiConditionDataSheet,
  conditionId: string,
  values: ReadonlyArray<number>,
  source: Readonly<{ columnLabel: string; rowNumbers: ReadonlyArray<number> }>,
): IndependentMultiConditionDataSheet {
  const columnIndex = sheet.conditions.findIndex((condition) => condition.id === conditionId);
  if (columnIndex < 0) throw new Error("取込先の条件が実験デザインにありません。");
  const column = sheet.columns[columnIndex];
  if (values.length > column.entries.length) {
    throw new Error(
      `貼り付けた${values.length}個の値が、計画n = ${column.entries.length}を超えています。`,
    );
  }
  const columns = sheet.columns.map((candidate, index) =>
    index === columnIndex
      ? {
          ...candidate,
          entries: candidate.entries.map((entry, entryIndex) => ({
            ...entry,
            measurement: { kind: "scalar" as const, value: values[entryIndex] ?? null },
            ...(entryIndex < values.length
              ? {
                  sourceLocation: `clipboard:${source.columnLabel}:row:${source.rowNumbers[entryIndex] ?? entryIndex + 1}`,
                }
              : { sourceLocation: undefined }),
          })),
        }
      : candidate,
  );
  return { ...sheet, columns };
}

export function MultiConditionDataSheetPage({
  design,
  recommendation,
  sheet: initialSheet,
  outcomeLabel,
  onBack,
  analysisRunner,
  saveProject,
  initialProject,
  metadataDraft: initialMetadataDraft,
  onDirtyChange,
  onRequestExit,
  onRegisterSaveHandler,
}: Props) {
  const locale = useAppLocale();
  const t = (ja: string, en: string) => localizedText(locale, ja, en);
  const isRepeated = recommendation.templateId === "D04";
  const initialDerivedRevision = initialProject?.state.derivedDatasetRevisions.find(
    (revision) =>
      revision.sourceRawRevisionId === initialProject.state.activeRawRevisionId &&
      revision.outcomeId === initialSheet.outcomeId &&
      revision.state === "current",
  );
  const initialDerivedValues = initialDerivedRevision
    ? (initialProject?.state.derivedValues.filter(
        (value) => value.derivedDatasetRevisionId === initialDerivedRevision.id,
      ) ?? [])
    : [];
  const initialRawObservations = initialProject
    ? initialProject.state.observations.filter(
        (observation) =>
          observation.rawRevisionId === initialProject.state.activeRawRevisionId &&
          observation.outcomeId === initialSheet.outcomeId,
      )
    : [];
  const initialTransformation = initialDerivedRevision
    ? initialProject?.state.transformations.find(
        (transformation) => transformation.id === initialDerivedRevision.transformationId,
      )
    : undefined;
  const initialCanonicalData: CanonicalData | null = initialProject
    ? initialDerivedRevision && initialDerivedValues.length > 0 && initialTransformation
      ? {
          observations: initialDerivedValues.map((value) => ({
            id: value.id,
            rawRevisionId: initialProject.state.activeRawRevisionId,
            unitInstanceId: value.experimentalUnitId,
            conditionId: value.conditionId,
            outcomeId: value.outcomeId,
            measurement: { kind: "scalar" as const, value: value.value },
            sourceLocation: `derived:${initialDerivedRevision.id}`,
          })),
          rawObservations: initialRawObservations,
          unitInstances: initialProject.state.unitInstances,
          transformation: initialTransformation,
          derivedRevision: initialDerivedRevision,
          derivedValues: initialDerivedValues,
          projectDesign: design,
        }
      : { observations: initialRawObservations, unitInstances: initialProject.state.unitInstances }
    : null;
  const restoredAnalysis = (() => {
    if (!initialProject) return null;
    const persisted = [...initialProject.state.analysisRuns]
      .reverse()
      .find(
        (run) =>
          run.inputRawRevisionId === initialProject.state.activeRawRevisionId &&
          run.inputDesignRevisionId === initialProject.state.activeDesignRevisionId &&
          run.state === "current",
      );
    if (!persisted) return null;
    const graph = initialProject.state.graphs.find(
      (candidate) =>
        candidate.sourceAnalysisRunId === persisted.id && candidate.state === "current",
    );
    let graphModel: CoreGraphModel | null = null;
    if (graph) {
      try {
        const unitById = new Map(
          (initialCanonicalData?.unitInstances ?? []).map((unit) => [unit.id, unit]),
        );
        const graphInput =
          persisted.inputDerivedDatasetRevisionId && initialCanonicalData?.rawObservations
            ? [
                ...numericEngineObservations(persisted.request.observations).map((observation) => ({
                  ...observation,
                  layer: "replicate_summary" as const,
                })),
                ...initialCanonicalData.rawObservations
                  .filter((observation) => observation.measurement.kind === "scalar")
                  .map((observation) => ({
                    observationId: observation.id,
                    conditionId: observation.conditionId,
                    value:
                      observation.measurement.kind === "scalar" ? observation.measurement.value : 0,
                    experimentalUnitId:
                      unitById.get(observation.unitInstanceId)?.parentUnitId ??
                      observation.unitInstanceId,
                    layer: "raw" as const,
                  })),
              ]
            : numericEngineObservations(persisted.request.observations);
        graphModel = createCoreGraphModel(graph.spec, design.conditions, graphInput);
      } catch {
        graphModel = null;
      }
    }
    return {
      request: persisted.request,
      result: persisted.result,
      graphSpec: graph?.spec ?? null,
      graphModel,
    };
  })();
  const [sheet, setSheet] = useState(initialSheet);
  const [issues, setIssues] = useState<SheetValidationIssue[]>([]);
  const [canonicalData, setCanonicalData] = useState<CanonicalData | null>(initialCanonicalData);
  const [nestedPayloads, setNestedPayloads] = useState<Record<string, NestedImageJPastePayload>>(
    {},
  );
  const [validated, setValidated] = useState(initialCanonicalData !== null);
  const [analysisRun, setAnalysisRun] = useState<AnalysisRun | null>(restoredAnalysis);
  const [analysisStatus, setAnalysisStatus] = useState<"idle" | "running" | "error">("idle");
  const [runningRequestId, setRunningRequestId] = useState<string | null>(null);
  const [analysisError, setAnalysisError] = useState<string | null>(null);
  const [hasPastedValues, setHasPastedValues] = useState(false);
  const [activeReplicateIndex, setActiveReplicateIndex] = useState(0);
  const [activeTab, setActiveTab] = useState<WorkflowTabId>(initialProject ? "input" : "input");
  const [saveStatus, setSaveStatus] = useState<"idle" | "saving" | "success" | "error">("idle");
  const [saveError, setSaveError] = useState<string | null>(null);
  const [metadataDraft, setMetadataDraft] = useState<ProjectMetadataDraft>(
    () =>
      initialMetadataDraft ??
      (initialProject
        ? {
            projectName: initialProject.state.metadata.projectName,
            experimentDate: initialProject.state.metadata.experimentDate,
            operator: initialProject.state.metadata.operator ?? "",
            batch: initialProject.state.metadata.batch ?? "",
            note: initialProject.state.metadata.note ?? "",
          }
        : {
            projectName: design.name,
            experimentDate: design.createdAt.slice(0, 10),
            operator: "",
            batch: "",
            note: "",
          }),
  );
  const [lastSavedState, setLastSavedState] = useState<ProjectState | null>(
    initialProject?.state ?? null,
  );
  const [saveTarget, setSaveTarget] = useState<string | undefined>(initialProject?.target);
  const workspaceRef = useRef({
    projectId: initialProject?.state.metadata.projectId ?? `project.${token()}`,
    rawRevisionId: initialProject?.state.activeRawRevisionId ?? `raw-revision.${token()}.1`,
    metadata: initialProject?.state.metadata ?? null,
  });
  const [draftRawRevisionId, setDraftRawRevisionId] = useState(workspaceRef.current.rawRevisionId);
  const lifecycleSnapshot = JSON.stringify({
    sheet,
    nestedPayloads,
    validated,
    canonicalData,
    analysisRun,
    metadataDraft,
    draftRawRevisionId,
  });
  const savedLifecycleSnapshotRef = useRef(initialProject ? lifecycleSnapshot : "");
  const isDirty = lifecycleSnapshot !== savedLifecycleSnapshotRef.current;
  useEffect(() => {
    onDirtyChange?.(isDirty);
    return () => onDirtyChange?.(false);
  }, [isDirty, onDirtyChange]);
  const isProportion = design.outcomes[0]?.type === "proportion_counts";
  const replicateCount = sheet.columns[0]?.entries.length ?? 0;
  const selectedReplicateIndex = Math.min(activeReplicateIndex, Math.max(0, replicateCount - 1));

  const invalidate = (preserveNested = false, nextRawRevisionId?: string) => {
    if (lastSavedState && draftRawRevisionId === lastSavedState.activeRawRevisionId) {
      setDraftRawRevisionId(nextRawRevisionId ?? `raw-revision.${token()}`);
    }
    setValidated(false);
    setCanonicalData(null);
    if (!preserveNested) setNestedPayloads({});
    setIssues([]);
    setAnalysisRun(null);
    setAnalysisStatus("idle");
    setAnalysisError(null);
    setSaveStatus("idle");
    setSaveError(null);
  };

  const changeMeasurement = (
    columnIndex: number,
    entryIndex: number,
    measurement: DraftMeasurement,
  ) => {
    if (measurement.kind === "loading_control_ratio") return;
    invalidate();
    setSheet((previous) => updateEntry(previous, columnIndex, entryIndex, measurement));
  };

  const changeExperimentDate = (
    columnIndex: number,
    entryIndex: number,
    experimentDate: string,
  ) => {
    const entry = sheet.columns[columnIndex].entries[entryIndex];
    const experimentalUnitId =
      sheet.relationship === "matched" && "matchedUnitId" in entry
        ? entry.matchedUnitId
        : "experimentalUnitId" in entry
          ? entry.experimentalUnitId
          : null;
    const nextRawRevisionId =
      lastSavedState && draftRawRevisionId === lastSavedState.activeRawRevisionId
        ? `raw-revision.${token()}`
        : draftRawRevisionId;
    invalidate(true, nextRawRevisionId);
    if (experimentalUnitId) {
      setNestedPayloads((previous) =>
        Object.fromEntries(
          Object.entries(previous).map(([key, payload]) => [
            key,
            updateNestedPayloadExperimentDate(
              payload,
              experimentalUnitId,
              experimentDate,
              nextRawRevisionId,
            ),
          ]),
        ),
      );
    }
    setSheet((previous) =>
      updateEntryExperimentDate(previous, columnIndex, entryIndex, experimentDate),
    );
    setActiveTab("input");
  };

  const onReplicateTabKeyDown = (event: KeyboardEvent<HTMLButtonElement>, tabIndex: number) => {
    const next = nextRovingTabIndex(event.key, tabIndex, replicateCount);
    if (next === null) return;
    event.preventDefault();
    setActiveReplicateIndex(next);
    document.getElementById(`multi-replicate-tab-${next}`)?.focus();
  };

  const applyBulkPaste = (
    conditionId: string,
    values: number[],
    source: { columnLabel: string; rowNumbers: number[] },
  ) => {
    const columnIndex = sheet.conditions.findIndex((condition) => condition.id === conditionId);
    if (columnIndex < 0) return;
    const capacity = sheet.columns[columnIndex].entries.length;
    if (values.length > capacity) {
      throw new Error(`貼り付けた値が計画n = ${capacity} を超えています。`);
    }
    invalidate();
    setHasPastedValues(true);
    setSheet((previous) => {
      const updateColumns = <T extends MultiConditionSheet["columns"]>(columns: T): T =>
        columns.map((candidate, index) =>
          index === columnIndex
            ? {
                ...candidate,
                entries: candidate.entries.map((entry, entryIndex) =>
                  entryIndex < values.length
                    ? {
                        ...entry,
                        measurement: { kind: "scalar" as const, value: values[entryIndex] },
                        sourceLocation: `clipboard:${source.columnLabel}:row:${source.rowNumbers[entryIndex]}`,
                      }
                    : entry,
                ),
              }
            : candidate,
        ) as T;
      return previous.relationship === "matched"
        ? { ...previous, columns: updateColumns(previous.columns) }
        : { ...previous, columns: updateColumns(previous.columns) };
    });
  };

  const applyNestedPaste = (payload: NestedImageJPastePayload) => {
    if (sheet.relationship !== "independent") return;
    const effectiveRawRevisionId =
      lastSavedState && draftRawRevisionId === lastSavedState.activeRawRevisionId
        ? `raw-revision.${token()}`
        : draftRawRevisionId;
    if (effectiveRawRevisionId !== draftRawRevisionId) {
      setDraftRawRevisionId(effectiveRawRevisionId);
    }
    const effectivePayload: NestedImageJPastePayload = {
      ...payload,
      rawRevisionId: effectiveRawRevisionId,
      observations: payload.observations.map((observation) => ({
        ...observation,
        rawRevisionId: effectiveRawRevisionId,
      })),
      transformation: {
        ...payload.transformation,
        inputRevisionIds: [effectiveRawRevisionId],
      },
    };
    const nextSheet = applyScalarValuesToIndependentMultiCondition(
      sheet,
      effectivePayload.conditionId,
      effectivePayload.summaries.map((summary) => summary.value),
      effectivePayload.source,
    );
    setSheet(nextSheet);
    setHasPastedValues(true);
    setValidated(false);
    setIssues([]);
    setCanonicalData(null);
    setAnalysisRun(null);
    setAnalysisStatus("idle");
    setAnalysisError(null);
    setSaveStatus("idle");
    setSaveError(null);
    setNestedPayloads((previous) => ({
      ...previous,
      [effectivePayload.conditionId]: effectivePayload,
    }));
  };

  const validateSheet = () => {
    setIssues([]);
    setValidated(false);
    try {
      const result = isRepeated
        ? toCanonicalRepeatedConditionObservations(
            sheet as RepeatedConditionDataSheet,
            draftRawRevisionId,
          )
        : toCanonicalMultiConditionObservations(
            sheet as IndependentMultiConditionDataSheet,
            draftRawRevisionId,
          );
      if (!result.success) {
        setIssues(result.issues);
        return;
      }
      const nested = Object.values(nestedPayloads);
      if (nested.length > 0 && nested.length !== design.conditions.length) {
        setIssues([
          {
            code: "missing_value",
            path: "nested-observations",
            message:
              "D10では比較するすべての条件についてcell/ROIを割り当ててください。条件間でcell/ROI入力と要約済み入力を混在させることはできません。",
          },
        ]);
        return;
      }
      if (nested.length === design.conditions.length) {
        const methods = new Set(nested.map((payload) => payload.method));
        if (methods.size !== 1) {
          setIssues([
            {
              code: "missing_value",
              path: "nested-observations",
              message: "比較する条件には同じ要約方法（平均または中央値）を使用してください。",
            },
          ]);
          return;
        }
        const rawObservations = nested.flatMap((payload) => payload.observations);
        const unitsById = new Map(
          nested.flatMap((payload) => payload.unitInstances).map((unit) => [unit.id, unit]),
        );
        const projectDesign = design.unitLevels.some((level) => level.id === "unit.imagej-row")
          ? design
          : {
              ...design,
              unitLevels: [
                ...design.unitLevels,
                {
                  id: "unit.imagej-row",
                  key: "imagej_row",
                  label: "cell / ROI",
                  role: "subsample" as const,
                  parentLevelId: design.experimentalUnitLevelId,
                },
              ],
            };
        const derived = createNestedScalarDerivedDataset({
          derivedDatasetRevisionId: `derived-dataset.${token()}`,
          rawRevisionId: draftRawRevisionId,
          outcomeId: sheet.outcomeId,
          experimentalUnitLevelId: sheet.experimentalUnitLevelId,
          method: nested[0].method,
          observations: rawObservations,
          unitInstances: [...unitsById.values()],
          createdAt: new Date().toISOString(),
          createdBy: "local-user",
        });
        const derivedObservations = derived.values.map((value) => ({
          id: value.id,
          rawRevisionId: draftRawRevisionId,
          unitInstanceId: value.experimentalUnitId,
          conditionId: value.conditionId,
          outcomeId: value.outcomeId,
          measurement: { kind: "scalar" as const, value: value.value },
          sourceLocation: `derived:${derived.revision.id}`,
        }));
        setCanonicalData({
          observations: derivedObservations,
          rawObservations,
          unitInstances: [...unitsById.values()],
          transformation: derived.transformation,
          derivedRevision: derived.revision,
          derivedValues: derived.values,
          projectDesign,
        });
      } else {
        setCanonicalData({
          observations: result.observations,
          unitInstances: result.unitInstances,
        });
      }
      setValidated(true);
      setActiveTab("analysis");
    } catch (error) {
      setIssues([
        {
          code: "missing_value",
          path: "nested-observations",
          message: error instanceof Error ? error.message : "D10の要約を作成できませんでした。",
        },
      ]);
    }
  };

  const runAnalysis = async () => {
    if (!canonicalData || !["D03", "D04", "D05"].includes(recommendation.templateId)) return;
    setAnalysisStatus("running");
    setAnalysisError(null);
    try {
      const requestInput = {
        requestId: `request.${token()}`,
        projectId: workspaceRef.current.projectId,
        analysisId: `analysis.${design.id}`,
        design: canonicalData.projectDesign ?? design,
        recommendation,
        observations: canonicalData.observations,
        unitInstances: canonicalData.unitInstances,
      };
      const request =
        recommendation.templateId === "D04"
          ? createD04EngineRequest(requestInput)
          : recommendation.templateId === "D05"
            ? createD05EngineRequest(requestInput)
            : createD03EngineRequest(requestInput);
      setRunningRequestId(request.requestId);
      const result = AnalysisEngineResultSchema.parse(
        await (analysisRunner ?? defaultAnalysisRunner)(request),
      );
      if (result.status !== "ok") {
        setAnalysisRun({ request, result, graphSpec: null, graphModel: null });
        setAnalysisStatus("error");
        return;
      }
      const baseGraphSpec =
        recommendation.templateId === "D04"
          ? createCoreRepeatedGroupGraphSpec({
              graphId: `graph.${design.id}`,
              templateId: "D04",
              dataSource: {
                kind: "analysis_result",
                id: request.analysisId,
                revision: result.requestId,
              },
              analysisResultId: result.requestId,
              yLabel: outcomeLabel,
              yStartAtZero: true,
            })
          : createCoreMultiGroupGraphSpec({
              graphId: `graph.${design.id}`,
              templateId: recommendation.templateId === "D05" ? "D05" : "D03",
              dataSource: {
                kind: "analysis_result",
                id: request.analysisId,
                revision: result.requestId,
              },
              analysisResultId: result.requestId,
              yLabel: outcomeLabel,
              yStartAtZero: true,
            });
      const graphSpec = canonicalData.derivedRevision
        ? GraphSpecSchema.parse({
            ...baseGraphSpec,
            type: "raw_and_replicate_summary",
            dataSource: {
              kind: "derived_dataset",
              id: canonicalData.derivedRevision.id,
              revision: canonicalData.derivedRevision.id,
            },
          })
        : baseGraphSpec;
      const unitById = new Map(canonicalData.unitInstances.map((unit) => [unit.id, unit]));
      const graphInput = [
        ...numericEngineObservations(request.observations).map((observation) => ({
          ...observation,
          ...(canonicalData.derivedRevision ? { layer: "replicate_summary" as const } : {}),
        })),
        ...(canonicalData.rawObservations ?? [])
          .filter((observation) => observation.measurement.kind === "scalar")
          .map((observation) => ({
            observationId: observation.id,
            conditionId: observation.conditionId,
            value: observation.measurement.kind === "scalar" ? observation.measurement.value : 0,
            experimentalUnitId:
              unitById.get(observation.unitInstanceId)?.parentUnitId ?? observation.unitInstanceId,
            layer: "raw" as const,
          })),
      ];
      const graphModel = createCoreGraphModel(
        graphSpec,
        (canonicalData.projectDesign ?? design).conditions,
        graphInput,
      );
      setAnalysisRun({ request, result, graphSpec, graphModel });
      setAnalysisStatus("idle");
      setActiveTab("analysis");
    } catch (error) {
      setAnalysisStatus("error");
      setAnalysisError(
        error instanceof Error ? error.message : "ローカル解析を実行できませんでした。",
      );
    } finally {
      setRunningRequestId(null);
    }
  };

  const updateGraphSpec = (nextSpec: GraphSpec) => {
    if (!analysisRun) return;
    try {
      const graphSpec = GraphSpecSchema.parse(nextSpec);
      const unitById = new Map(canonicalData?.unitInstances.map((unit) => [unit.id, unit]) ?? []);
      const graphInput = [
        ...numericEngineObservations(analysisRun.request.observations).map((observation) => ({
          ...observation,
          ...(canonicalData?.derivedRevision ? { layer: "replicate_summary" as const } : {}),
        })),
        ...(canonicalData?.rawObservations ?? [])
          .filter((observation) => observation.measurement.kind === "scalar")
          .map((observation) => ({
            observationId: observation.id,
            conditionId: observation.conditionId,
            value: observation.measurement.kind === "scalar" ? observation.measurement.value : 0,
            experimentalUnitId:
              unitById.get(observation.unitInstanceId)?.parentUnitId ?? observation.unitInstanceId,
            layer: "raw" as const,
          })),
      ];
      const graphModel = createCoreGraphModel(
        graphSpec,
        (canonicalData?.projectDesign ?? design).conditions,
        graphInput,
      );
      setAnalysisRun((previous) => (previous ? { ...previous, graphSpec, graphModel } : previous));
      setSaveStatus("idle");
    } catch (error) {
      setAnalysisError(
        error instanceof Error ? error.message : "グラフ設定を更新できませんでした。",
      );
    }
  };

  const buildCurrentProjectState = (updatedAt = new Date().toISOString()) => {
    if (!canonicalData || !validated || !metadataDraftIsComplete(metadataDraft)) return null;
    const metadata = metadataForPersistence(metadataDraft);
    const analysis = analysisRun
      ? {
          recommendation,
          request: analysisRun.request,
          result: analysisRun.result,
          graphSpec: analysisRun.graphSpec,
          inputDerivedDatasetRevisionId: canonicalData.derivedRevision?.id ?? null,
        }
      : null;
    let state: ProjectState;
    if (!lastSavedState) {
      const now = updatedAt;
      state = createInitialProjectState({
        metadata: {
          ...workspaceRef.current.metadata,
          projectId: workspaceRef.current.projectId,
          ...metadata,
          createdAt: workspaceRef.current.metadata?.createdAt ?? now,
          updatedAt: now,
        } as ProjectMetadata,
        design: canonicalData.projectDesign ?? design,
        rawRevision: {
          id: draftRawRevisionId,
          previousRevisionId: null,
          sourceKind: hasPastedValues ? "paste" : "manual",
          sourceName: hasPastedValues
            ? "ImageJ / clipboard table"
            : `BioFigureStat ${recommendation.templateId} data sheet`,
          createdAt: now,
          createdBy: "local-user",
          note: `Canonical observations created from a validated ${recommendation.templateId} data sheet.`,
        },
        unitInstances: canonicalData.unitInstances,
        observations: canonicalData.rawObservations ?? canonicalData.observations,
        transformations: canonicalData.transformation ? [canonicalData.transformation] : [],
        derivedDatasetRevisions: canonicalData.derivedRevision
          ? [canonicalData.derivedRevision]
          : [],
        derivedValues: canonicalData.derivedValues ?? [],
        actor: "local-user",
        ...(analysis ? { analysis } : {}),
      });
    } else {
      state = ProjectStateSchema.parse({
        ...lastSavedState,
        metadata: {
          ...lastSavedState.metadata,
          ...metadata,
          updatedAt,
        },
      });
      const activeDesign = state.designRevisions.find(
        (revision) => revision.id === state.activeDesignRevisionId,
      )?.design;
      if (
        canonicalData.projectDesign &&
        JSON.stringify(activeDesign) !== JSON.stringify(canonicalData.projectDesign)
      ) {
        state = appendDesignRevision(state, canonicalData.projectDesign, "local-user", updatedAt);
      }
      if (draftRawRevisionId !== lastSavedState.activeRawRevisionId) {
        state = appendRawRevision(
          state,
          {
            id: draftRawRevisionId,
            previousRevisionId: lastSavedState.activeRawRevisionId,
            sourceKind: "project_edit",
            createdAt: updatedAt,
            createdBy: "local-user",
            note: `Canonical observations created from an edited ${recommendation.templateId} data sheet.`,
          },
          canonicalData.unitInstances,
          canonicalData.rawObservations ?? canonicalData.observations,
          "local-user",
          canonicalData.transformation ? [canonicalData.transformation] : [],
          canonicalData.derivedRevision ? [canonicalData.derivedRevision] : [],
          canonicalData.derivedValues ?? [],
        );
      }
      if (
        analysis &&
        !state.analysisRuns.some((run) => run.request.requestId === analysis.request.requestId)
      ) {
        state = appendAnalysisExecution(state, analysis, "local-user");
      }
    }
    return ProjectStateSchema.parse(state);
  };
  const buildCurrentProjectStateRef = useRef(buildCurrentProjectState);
  useEffect(() => {
    buildCurrentProjectStateRef.current = buildCurrentProjectState;
  }, [buildCurrentProjectState]);

  const saveCurrentProject = async () => {
    if (!saveProject) return false;
    setSaveStatus("saving");
    setSaveError(null);
    try {
      const state = buildCurrentProjectState();
      if (!state) {
        setSaveStatus("idle");
        return false;
      }
      const saved = await saveProject(state, saveTarget);
      if (!saved) {
        setSaveStatus("idle");
        return false;
      }
      savedLifecycleSnapshotRef.current = lifecycleSnapshot;
      setLastSavedState(saved.state);
      setSaveTarget(saved.target);
      setDraftRawRevisionId(saved.state.activeRawRevisionId);
      setSaveStatus("success");
      onDirtyChange?.(false);
      return true;
    } catch (error) {
      setSaveStatus("error");
      setSaveError(
        actionErrorMessage(
          error,
          t(
            "プロジェクトを保存できませんでした。入力は保持されています。",
            "The project could not be saved. Your entries are still retained.",
          ),
          locale,
        ),
      );
      return false;
    }
  };
  const saveCurrentProjectRef = useRef(saveCurrentProject);
  useEffect(() => {
    saveCurrentProjectRef.current = saveCurrentProject;
  }, [saveCurrentProject]);
  useEffect(() => {
    if (!onRegisterSaveHandler) return;
    onRegisterSaveHandler({
      save: () => saveCurrentProjectRef.current(),
      checkpoint: () => {
        if (!saveTarget) return null;
        const state = buildCurrentProjectStateRef.current();
        return state
          ? { kind: "experiment" as const, project: { state, target: saveTarget } }
          : null;
      },
    });
    return () => onRegisterSaveHandler(null);
  }, [onRegisterSaveHandler, saveTarget]);

  const requestBack = () => {
    if (onRequestExit) {
      onRequestExit({ actionLabel: "前の画面に戻る", proceed: onBack });
      return;
    }
    onBack();
  };

  const onTabKeyDown = (event: KeyboardEvent<HTMLButtonElement>, index: number) => {
    const next = nextRovingTabIndex(event.key, index, TABS.length);
    if (next === null) return;
    event.preventDefault();
    setActiveTab(TABS[next].id);
    document.getElementById(`multi-workflow-tab-${TABS[next].id}`)?.focus();
  };

  const statusFor = (tab: WorkflowTabId) =>
    tab === "input"
      ? validated
        ? "検証済み"
        : "未入力"
      : tab === "analysis"
        ? analysisRun
          ? "解析済み"
          : validated
            ? "検証済み"
            : "未入力"
        : tab === "graph"
          ? analysisRun?.graphModel
            ? "解析済み"
            : "未入力"
          : saveStatus === "success"
            ? "保存済み"
            : validated
              ? "検証済み"
              : "未入力";

  return (
    <div className="page-stack narrow-page">
      <button className="back-link" type="button" onClick={requestBack}>
        ← デザイン確認に戻る
      </button>
      <section className="sheet-intro" aria-labelledby="multi-sheet-heading">
        <div>
          <p className="overline">データ入力</p>
          <h1 id="multi-sheet-heading">
            {isRepeated
              ? "同じ実験単位ごとに値を入力"
              : recommendation.templateId === "D05"
                ? `${sheet.conditions.length}個の組み合わせ条件を入力`
                : `${sheet.conditions.length}条件の実験単位を入力`}
          </h1>
          <p>
            {isRepeated
              ? "1行が同じ動物・ドナー・試料などの1つの実験単位です。別の日に行ったものは行を分けます。"
              : "各入力欄は、条件を割り当てた別々のディッシュ・動物・試料などです。日付は実験単位ごとに記録できます。"}
          </p>
        </div>
        <span className="wizard-purpose-chip">{outcomeLabel}</span>
      </section>
      <nav className="workflow-tabs" aria-label="解析ワークフロー" role="tablist">
        {TABS.map(({ id, label }, index) => (
          <button
            key={id}
            id={`multi-workflow-tab-${id}`}
            className={`workflow-tab ${activeTab === id ? "is-active" : ""}`}
            type="button"
            role="tab"
            aria-selected={activeTab === id}
            aria-controls={`multi-workflow-panel-${id}`}
            tabIndex={activeTab === id ? 0 : -1}
            onClick={() => setActiveTab(id)}
            onKeyDown={(event) => onTabKeyDown(event, index)}
          >
            <span>{label}</span>
            <small>{statusFor(id)}</small>
          </button>
        ))}
      </nav>

      {activeTab === "input" && (
        <div
          id="multi-workflow-panel-input"
          className="workflow-panel-stack"
          role="tabpanel"
          aria-labelledby="multi-workflow-tab-input"
        >
          <aside
            className={`sheet-relationship-note ${isRepeated ? "sheet-relationship-note--matched" : "sheet-relationship-note--independent"}`}
            aria-label={isRepeated ? "完全な繰り返し測定" : "独立群"}
          >
            <span className="sheet-note-icon" aria-hidden="true">
              {isRepeated ? "⇄" : "∥"}
            </span>
            <div>
              <strong>{isRepeated ? "同じ行が同じ対応単位" : "独立した入力列"}</strong>
              <p>
                {isRepeated
                  ? "すべての対応単位に、各条件の値を1つずつ入力します。"
                  : "各条件の値は、別々のディッシュ・動物・試料などから得たものです。同じN番号でも条件間のペアにはしません。"}
              </p>
              {!isRepeated && (
                <p className="multi-sheet-independent-note">
                  N1 / N2 / N3
                  は入力を整理する番号です。条件間の統計的なペア（対応）を意味しません。
                </p>
              )}
            </div>
          </aside>
          {!isProportion && <BulkPasteScalar sheet={sheet} onApply={applyBulkPaste} />}
          {!isRepeated &&
            recommendation.templateId !== "D04" &&
            design.purpose === "microscopy" &&
            design.outcomes[0]?.type === "continuous" &&
            sheet.relationship === "independent" && (
              <NestedImageJPaste
                sheet={sheet}
                rawRevisionId={draftRawRevisionId}
                onApply={applyNestedPaste}
              />
            )}
          <section className="sheet-section" aria-labelledby="multi-table-heading">
            <div className="section-heading-row">
              <div>
                <p className="overline">生データ</p>
                <h2 id="multi-table-heading">{outcomeLabel}</h2>
              </div>
              <span className="section-hint">各条件 n = {design.plannedN}</span>
            </div>
            <div className="multi-sheet-replicate-selector">
              <div className="multi-sheet-replicate-selector-heading">
                <div>
                  <p className="overline">実験単位を選択</p>
                  <h3 id="multi-replicate-heading">入力するNを選んでください</h3>
                </div>
                <span className="section-hint">N = {replicateCount}</span>
              </div>
              <div
                className="multi-sheet-replicate-tabs"
                role="tablist"
                aria-label="実験単位の選択"
              >
                {Array.from({ length: replicateCount }, (_, entryIndex) => (
                  <button
                    key={`multi-replicate-tab-${entryIndex}`}
                    id={`multi-replicate-tab-${entryIndex}`}
                    className={`multi-sheet-replicate-tab ${selectedReplicateIndex === entryIndex ? "is-active" : ""}`}
                    type="button"
                    role="tab"
                    aria-selected={selectedReplicateIndex === entryIndex}
                    aria-controls={`multi-replicate-panel-${entryIndex}`}
                    tabIndex={selectedReplicateIndex === entryIndex ? 0 : -1}
                    onClick={() => setActiveReplicateIndex(entryIndex)}
                    onKeyDown={(event) => onReplicateTabKeyDown(event, entryIndex)}
                  >
                    N{entryIndex + 1}
                  </button>
                ))}
              </div>
            </div>
            <p className="multi-sheet-grid-hint">
              {isRepeated
                ? "同じNの実験日を変更すると、そのNの全条件へ反映されます。"
                : "独立群では、条件ごとに実験日を入力できます。"}
            </p>
            <div
              id={`multi-replicate-panel-${selectedReplicateIndex}`}
              className="multi-sheet-grid-panel"
              role="tabpanel"
              aria-labelledby={`multi-replicate-tab-${selectedReplicateIndex}`}
            >
              <div className="multi-sheet-grid-scroll">
                <table
                  className={`multi-sheet-grid ${isProportion ? "multi-sheet-grid--proportion" : ""}`}
                  data-unit-grid="true"
                  data-relationship={sheet.relationship}
                >
                  <caption>
                    {isRepeated ? "対応のある入力" : "独立した入力"} · N{selectedReplicateIndex + 1}
                  </caption>
                  <thead>
                    <tr>
                      <th scope="col">条件</th>
                      <th scope="col">実験日</th>
                      {isProportion ? (
                        <>
                          <th scope="col">陽性細胞数</th>
                          <th scope="col">総細胞数</th>
                          <th scope="col">割合</th>
                        </>
                      ) : (
                        <th scope="col">測定値</th>
                      )}
                    </tr>
                  </thead>
                  <tbody>
                    {sheet.columns.map((column, columnIndex) => {
                      const entry = column.entries[selectedReplicateIndex];
                      if (!entry) return null;
                      const conditionLabel = sheet.conditions[columnIndex].label;
                      const entryLabel = `${conditionLabel} 実験単位 ${selectedReplicateIndex + 1}`;
                      const proportionMeasurement =
                        entry.measurement.kind === "proportion" ? entry.measurement : null;
                      return (
                        <tr key={`${column.conditionId}-${entry.id}`}>
                          <th scope="row">{conditionLabel}</th>
                          <td className="multi-sheet-date-cell">
                            <MultiGridInput
                              className="multi-sheet-date-input"
                              gridRow={columnIndex}
                              gridColumn={0}
                              aria-label={`${entryLabel}：実験日`}
                              type="date"
                              value={entry.experimentDate}
                              onChange={(event) =>
                                changeExperimentDate(
                                  columnIndex,
                                  selectedReplicateIndex,
                                  event.target.value,
                                )
                              }
                            />
                          </td>
                          {proportionMeasurement ? (
                            <>
                              <td className="multi-sheet-number-cell">
                                <MultiGridInput
                                  className="multi-sheet-number-input"
                                  gridRow={columnIndex}
                                  gridColumn={1}
                                  type="number"
                                  min={0}
                                  step={1}
                                  inputMode="numeric"
                                  value={proportionMeasurement.numerator ?? ""}
                                  aria-label={`${entryLabel}：陽性細胞数`}
                                  onChange={(event) =>
                                    changeMeasurement(columnIndex, selectedReplicateIndex, {
                                      kind: "proportion",
                                      numerator: parseSpreadsheetNumber(event.target.value, true),
                                      denominator: proportionMeasurement.denominator,
                                    })
                                  }
                                />
                              </td>
                              <td className="multi-sheet-number-cell">
                                <MultiGridInput
                                  className="multi-sheet-number-input"
                                  gridRow={columnIndex}
                                  gridColumn={2}
                                  type="number"
                                  min={1}
                                  step={1}
                                  inputMode="numeric"
                                  value={proportionMeasurement.denominator ?? ""}
                                  aria-label={`${entryLabel}：総細胞数`}
                                  onChange={(event) =>
                                    changeMeasurement(columnIndex, selectedReplicateIndex, {
                                      kind: "proportion",
                                      numerator: proportionMeasurement.numerator,
                                      denominator: parseSpreadsheetNumber(event.target.value, true),
                                    })
                                  }
                                />
                              </td>
                              <td className="multi-sheet-percentage-cell">
                                <output aria-label={`${entryLabel}：計算された割合`}>
                                  {multiPercentageLabel(proportionMeasurement)}
                                </output>
                              </td>
                            </>
                          ) : (
                            <td className="multi-sheet-measurement-cell">
                              <MultiGridInput
                                className="multi-sheet-measurement-input"
                                gridRow={columnIndex}
                                gridColumn={1}
                                type="number"
                                inputMode="decimal"
                                value={
                                  entry.measurement.kind === "scalar"
                                    ? (entry.measurement.value ?? "")
                                    : ""
                                }
                                aria-label={entryLabel}
                                onChange={(event) =>
                                  changeMeasurement(columnIndex, selectedReplicateIndex, {
                                    kind: "scalar",
                                    value: parseSpreadsheetNumber(event.target.value),
                                  })
                                }
                              />
                            </td>
                          )}
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            </div>
          </section>
          <section className="sheet-actions" aria-label="データシートの検証">
            <div>
              <strong>入力を検証</strong>
              <p>すべての実験単位の日付と値を確認し、解析できるデータへ変換します。</p>
            </div>
            <button className="confirm-design-button" type="button" onClick={validateSheet}>
              検証して解析へ →
            </button>
          </section>
          {issues.length > 0 && (
            <section
              className="validation-issues"
              role="alert"
              aria-labelledby="multi-validation-heading"
            >
              <h2 id="multi-validation-heading">データシートを完成させてください</h2>
              <ul>
                {issues.map((issue, index) => (
                  <li key={`${issue.path}-${index}`}>{issueLabel(issue)}</li>
                ))}
              </ul>
            </section>
          )}
        </div>
      )}

      {activeTab === "analysis" && (
        <div
          id="multi-workflow-panel-analysis"
          className="workflow-panel-stack"
          role="tabpanel"
          aria-labelledby="multi-workflow-tab-analysis"
        >
          <section className="sheet-actions" aria-label="推奨解析">
            <div>
              <strong>入力内容に合う推奨解析を実行</strong>
              <p>
                解析方法は実験の組み方から選ばれています。名前と理由は下の詳細欄で確認できます。
              </p>
              <details className="advanced-disclosure">
                <summary>詳しい解析情報</summary>
                <div className="advanced-content">
                  <p>{templateLabel(recommendation.templateId)}</p>
                  <p>{methodLabel(recommendation.recommendedMethod)}</p>
                  <p>{statisticalNLabel(recommendation)}</p>
                  <p>{recommendationExplanation(recommendation)}</p>
                </div>
              </details>
            </div>
            <button
              className="analysis-run-button"
              type="button"
              disabled={!canonicalData || analysisStatus === "running"}
              onClick={runAnalysis}
            >
              {analysisStatus === "running" ? "ローカルで解析中…" : "推奨解析を実行"}
            </button>
            {analysisStatus === "running" && runningRequestId ? (
              <button type="button" onClick={() => void cancelLocalAnalysis(runningRequestId)}>
                解析を中止
              </button>
            ) : null}
          </section>
          {!canonicalData && (
            <p className="project-action-note" role="status">
              まず「1 データ入力」で入力内容を検証してください。
            </p>
          )}
          {analysisError && (
            <section className="analysis-client-error" role="alert">
              <h2>解析を実行できませんでした</h2>
              <p>{analysisError}</p>
            </section>
          )}
          {analysisRun && (
            <AnalysisResultView
              presentation="numeric"
              result={analysisRun.result}
              recommendation={recommendation}
              graphSpec={analysisRun.graphSpec}
              graphModel={analysisRun.graphModel}
              design={design}
              request={analysisRun.request}
              nestedSummary={
                canonicalData?.transformation &&
                canonicalData.derivedRevision &&
                canonicalData.derivedValues
                  ? {
                      transformation: canonicalData.transformation,
                      revision: canonicalData.derivedRevision,
                      values: canonicalData.derivedValues,
                    }
                  : null
              }
            />
          )}
        </div>
      )}
      {activeTab === "graph" && (
        <div
          id="multi-workflow-panel-graph"
          role="tabpanel"
          aria-labelledby="multi-workflow-tab-graph"
        >
          {analysisRun ? (
            <AnalysisResultView
              presentation="graph"
              result={analysisRun.result}
              recommendation={recommendation}
              graphSpec={analysisRun.graphSpec}
              graphModel={analysisRun.graphModel}
              design={design}
              request={analysisRun.request}
              nestedSummary={
                canonicalData?.transformation &&
                canonicalData.derivedRevision &&
                canonicalData.derivedValues
                  ? {
                      transformation: canonicalData.transformation,
                      revision: canonicalData.derivedRevision,
                      values: canonicalData.derivedValues,
                    }
                  : null
              }
              onGraphSpecChange={updateGraphSpec}
            />
          ) : (
            <p className="project-action-note" role="status">
              解析を実行すると、ここにグラフが表示されます。
            </p>
          )}
        </div>
      )}
      {activeTab === "save" && (
        <div
          id="multi-workflow-panel-save"
          className="workflow-panel-stack"
          role="tabpanel"
          aria-labelledby="multi-workflow-tab-save"
        >
          <details className="metadata-disclosure" open>
            <summary>プロジェクト情報</summary>
            <div className="metadata-form-grid">
              <label className="field-label">
                プロジェクト名 *
                <input
                  value={metadataDraft.projectName}
                  onChange={(event) =>
                    setMetadataDraft((previous) => ({
                      ...previous,
                      projectName: event.target.value,
                    }))
                  }
                />
              </label>
              <label className="field-label">
                最初の実験日 *
                <input
                  type="date"
                  value={metadataDraft.experimentDate}
                  onChange={(event) =>
                    setMetadataDraft((previous) => ({
                      ...previous,
                      experimentDate: event.target.value,
                    }))
                  }
                />
                <small>各実験単位の日付は「データ入力」で個別に記録されています。</small>
              </label>
              <label className="field-label">
                実施者（任意）
                <input
                  value={metadataDraft.operator ?? ""}
                  onChange={(event) =>
                    setMetadataDraft((previous) => ({ ...previous, operator: event.target.value }))
                  }
                />
              </label>
              <label className="field-label">
                バッチ／ロット（任意）
                <input
                  value={metadataDraft.batch ?? ""}
                  onChange={(event) =>
                    setMetadataDraft((previous) => ({ ...previous, batch: event.target.value }))
                  }
                />
              </label>
              <label className="field-label metadata-note-field">
                メモ（任意）
                <textarea
                  rows={2}
                  value={metadataDraft.note ?? ""}
                  onChange={(event) =>
                    setMetadataDraft((previous) => ({ ...previous, note: event.target.value }))
                  }
                />
              </label>
            </div>
          </details>
          <section className="sheet-actions" aria-label="プロジェクトの保存">
            <div>
              <strong>プロジェクトを保存</strong>
              <p>検証済みデータと実行済み解析を保存し、後から編集できます。</p>
              <p className="project-action-note">
                保存後の入力編集は新しいデータ履歴として記録され、以前の解析は再計算が必要になります。
              </p>
            </div>
            <button
              className="save-project-button"
              type="button"
              disabled={
                !saveProject ||
                !validated ||
                !metadataDraftIsComplete(metadataDraft) ||
                saveStatus === "saving"
              }
              onClick={saveCurrentProject}
            >
              {saveStatus === "saving" ? "保存中…" : "プロジェクトを保存"}
            </button>
          </section>
          {saveStatus === "success" && (
            <p className="project-action-message project-action-message--success" role="status">
              プロジェクトを保存しました。
            </p>
          )}
          {saveError && (
            <p className="project-action-message project-action-message--error" role="alert">
              {saveError}
            </p>
          )}
        </div>
      )}
    </div>
  );
}

import { useEffect, useRef, useState, type InputHTMLAttributes, type KeyboardEvent } from "react";

import {
  AnalysisEngineResultSchema,
  createD01D02EngineRequest,
  createD09EngineRequest,
  type AnalysisEngineRequest,
  type AnalysisEngineResult,
  type AnalysisRecommendation,
} from "@lsaa/analysis-contracts";
import {
  applyScalarValuesToCondition,
  createNestedScalarDerivedDataset,
  toCanonicalObservations,
  type DraftMeasurement,
  type SheetValidationIssue,
  type TwoConditionDataSheet,
} from "@lsaa/data-sheet";
import type {
  DerivedDatasetRevision,
  DerivedScalarValue,
  ExperimentDesign,
  ProjectMetadata,
  TransformationSpec,
} from "@lsaa/domain";
import {
  createCoreCorrelationGraphModel,
  createCoreCorrelationGraphSpec,
  createCoreGraphModel,
  createCoreTwoConditionGraphSpec,
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

import { defaultAnalysisRunner, type AnalysisRunner } from "../app/analysisClient";
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
import {
  methodLabel,
  recommendationExplanation,
  statisticalNLabel,
  templateLabel,
} from "../app/recommendationLabels";
import { AnalysisResultView } from "./AnalysisResultView";
import { BulkPasteScalar } from "../components/BulkPasteScalar";
import { NestedImageJPaste, type NestedImageJPastePayload } from "../components/NestedImageJPaste";
import "./DataSheetPage.grid.css";

type DataSheetPageProps = {
  design: ExperimentDesign;
  recommendation: AnalysisRecommendation;
  sheet: TwoConditionDataSheet;
  outcomeLabel: string;
  onBack: () => void;
  analysisRunner?: AnalysisRunner;
  saveProject?: SaveProjectAction;
  initialProject?: OpenedProject;
  metadataDraft?: ProjectMetadataDraft;
  /** Optional persistence hook for D10 raw rows and transformation lineage. */
  onNestedPasteApply?: (payload: NestedImageJPastePayload) => void;
};

type CanonicalData = {
  observations: Parameters<typeof createD01D02EngineRequest>[0]["observations"];
  unitInstances: Parameters<typeof createD01D02EngineRequest>[0]["unitInstances"];
  rawObservations?: Parameters<typeof createD01D02EngineRequest>[0]["observations"];
  transformation?: TransformationSpec;
  derivedRevision?: DerivedDatasetRevision;
  derivedValues?: DerivedScalarValue[];
  projectDesign?: ExperimentDesign;
};

type AnalysisRun = {
  request: AnalysisEngineRequest;
  result: AnalysisEngineResult;
  graphSpec: GraphSpec | null;
  graphModel: CoreGraphModel | null;
};

type WorkspaceIdentity = Readonly<{
  projectId: string;
  rawRevisionId: string;
  metadata: ProjectMetadata;
}>;

let fallbackWorkspaceSequence = 0;

type WorkflowTabId = "input" | "analysis" | "graph" | "save";

const WORKFLOW_TABS: ReadonlyArray<{ id: WorkflowTabId; label: string }> = [
  { id: "input", label: "1 データ入力" },
  { id: "analysis", label: "2 解析" },
  { id: "graph", label: "3 グラフ" },
  { id: "save", label: "4 保存" },
];

function createWorkspaceToken(): string {
  if (typeof crypto !== "undefined" && typeof crypto.randomUUID === "function") {
    return crypto.randomUUID();
  }
  fallbackWorkspaceSequence += 1;
  return `${Date.now().toString(36)}.${fallbackWorkspaceSequence}`;
}

type MeasurementLocation =
  | { relationship: "independent"; columnIndex: number; entryIndex: number }
  | { relationship: "matched" | "blocked"; rowIndex: number; valueIndex: number };

type ExperimentDateLocation =
  | { relationship: "independent"; columnIndex: number; entryIndex: number }
  | { relationship: "matched" | "blocked"; rowIndex: number };

function parseNumber(value: string, integer = false): number | null {
  const trimmed = value.trim();
  if (trimmed === "") return null;
  const parsed = Number(trimmed);
  if (!Number.isFinite(parsed)) return null;
  if (integer && !Number.isInteger(parsed)) return null;
  return parsed;
}

function updateMeasurement(
  sheet: TwoConditionDataSheet,
  location: MeasurementLocation,
  measurement: DraftMeasurement,
): TwoConditionDataSheet {
  if (location.relationship === "independent" && sheet.relationship === "independent") {
    const columns = [...sheet.columns] as [(typeof sheet.columns)[0], (typeof sheet.columns)[1]];
    const column = columns[location.columnIndex];
    columns[location.columnIndex] = {
      ...column,
      entries: column.entries.map((entry, index) =>
        index === location.entryIndex
          ? { ...entry, measurement, sourceLocation: undefined }
          : entry,
      ),
    };
    return { ...sheet, columns };
  }

  if (location.relationship === "matched" && sheet.relationship === "matched") {
    const rows = [...sheet.rows];
    const row = rows[location.rowIndex];
    const values = [...row.values] as [(typeof row.values)[0], (typeof row.values)[1]];
    values[location.valueIndex] = {
      ...values[location.valueIndex],
      measurement,
      sourceLocation: undefined,
    };
    rows[location.rowIndex] = { ...row, values };
    return { ...sheet, rows };
  }

  if (location.relationship === "blocked" && sheet.relationship === "blocked") {
    const rows = [...sheet.rows];
    const row = rows[location.rowIndex];
    const values = [...row.values] as [(typeof row.values)[0], (typeof row.values)[1]];
    values[location.valueIndex] = {
      ...values[location.valueIndex],
      measurement,
      sourceLocation: undefined,
    };
    rows[location.rowIndex] = { ...row, values };
    return { ...sheet, rows };
  }

  return sheet;
}

function updateExperimentDate(
  sheet: TwoConditionDataSheet,
  location: ExperimentDateLocation,
  experimentDate: string,
): TwoConditionDataSheet {
  if (location.relationship === "independent" && sheet.relationship === "independent") {
    const columns = [...sheet.columns] as [(typeof sheet.columns)[0], (typeof sheet.columns)[1]];
    const column = columns[location.columnIndex];
    columns[location.columnIndex] = {
      ...column,
      entries: column.entries.map((entry, index) =>
        index === location.entryIndex ? { ...entry, experimentDate } : entry,
      ),
    };
    return { ...sheet, columns };
  }
  if (location.relationship === "matched" && sheet.relationship === "matched") {
    return {
      ...sheet,
      rows: sheet.rows.map((row, index) =>
        index === location.rowIndex ? { ...row, experimentDate } : row,
      ),
    };
  }
  if (location.relationship === "blocked" && sheet.relationship === "blocked") {
    return {
      ...sheet,
      rows: sheet.rows.map((row, index) =>
        index === location.rowIndex ? { ...row, experimentDate } : row,
      ),
    };
  }
  return sheet;
}

function percentageLabel(measurement: DraftMeasurement) {
  if (measurement.kind !== "proportion") return "—";
  if (
    measurement.numerator === null ||
    measurement.denominator === null ||
    measurement.denominator <= 0 ||
    measurement.numerator > measurement.denominator
  ) {
    return "—";
  }
  return `${((measurement.numerator / measurement.denominator) * 100).toFixed(1)}%`;
}

function loadingControlRatioLabel(measurement: DraftMeasurement) {
  if (
    measurement.kind !== "loading_control_ratio" ||
    measurement.target === null ||
    measurement.loadingControl === null ||
    measurement.loadingControl <= 0
  ) {
    return "—";
  }
  return (measurement.target / measurement.loadingControl).toFixed(3);
}

type GridInputProps = InputHTMLAttributes<HTMLInputElement> & {
  gridRow: number;
  gridColumn: number;
};

function focusAdjacentGridInput(event: KeyboardEvent<HTMLInputElement>) {
  if (!["Enter", "ArrowLeft", "ArrowRight", "ArrowUp", "ArrowDown"].includes(event.key)) {
    return;
  }
  const grid = event.currentTarget.closest<HTMLElement>("[data-unit-grid]");
  if (!grid) return;
  const currentRow = Number(event.currentTarget.dataset.gridRow);
  const currentColumn = Number(event.currentTarget.dataset.gridColumn);
  if (!Number.isInteger(currentRow) || !Number.isInteger(currentColumn)) return;

  let nextRow = currentRow;
  let nextColumn = currentColumn;
  if (event.key === "Enter") nextRow += event.shiftKey ? -1 : 1;
  if (event.key === "ArrowLeft") nextColumn -= 1;
  if (event.key === "ArrowRight") nextColumn += 1;
  if (event.key === "ArrowUp") nextRow -= 1;
  if (event.key === "ArrowDown") nextRow += 1;
  const next = grid.querySelector<HTMLInputElement>(
    `[data-grid-row="${nextRow}"][data-grid-column="${nextColumn}"]`,
  );
  if (!next) return;
  event.preventDefault();
  next.focus();
  next.select();
}

function GridInput({ gridRow, gridColumn, className, onKeyDown, ...props }: GridInputProps) {
  return (
    <input
      {...props}
      className={`data-sheet-grid-input${className ? ` ${className}` : ""}`}
      data-grid-input="true"
      data-grid-row={gridRow}
      data-grid-column={gridColumn}
      onKeyDown={(event) => {
        focusAdjacentGridInput(event);
        onKeyDown?.(event);
      }}
    />
  );
}

type MeasurementGridCellsProps = {
  measurement: DraftMeasurement;
  label: string;
  gridRow: number;
  onChange: (measurement: DraftMeasurement) => void;
};

function MeasurementGridCells({
  measurement,
  label,
  gridRow,
  onChange,
}: MeasurementGridCellsProps) {
  if (measurement.kind === "scalar") {
    return [
      <td className="data-sheet-grid-measurement" key="scalar">
        <GridInput
          type="number"
          inputMode="decimal"
          value={measurement.value ?? ""}
          aria-label={label}
          onChange={(event) => onChange({ kind: "scalar", value: parseNumber(event.target.value) })}
          gridRow={gridRow}
          gridColumn={1}
        />
      </td>,
    ];
  }

  if (measurement.kind === "loading_control_ratio") {
    return [
      <td className="data-sheet-grid-measurement" key="target">
        <GridInput
          type="number"
          min={0}
          step="any"
          inputMode="decimal"
          value={measurement.target ?? ""}
          aria-label={`${label}：標的バンド強度`}
          onChange={(event) =>
            onChange({
              kind: "loading_control_ratio",
              target: parseNumber(event.target.value),
              loadingControl: measurement.loadingControl,
            })
          }
          gridRow={gridRow}
          gridColumn={1}
        />
      </td>,
      <td className="data-sheet-grid-measurement" key="loading-control">
        <GridInput
          type="number"
          min={0}
          step="any"
          inputMode="decimal"
          value={measurement.loadingControl ?? ""}
          aria-label={`${label}：ローディングコントロール強度`}
          onChange={(event) =>
            onChange({
              kind: "loading_control_ratio",
              target: measurement.target,
              loadingControl: parseNumber(event.target.value),
            })
          }
          gridRow={gridRow}
          gridColumn={2}
        />
      </td>,
      <td className="data-sheet-grid-output" key="ratio">
        <output aria-label={`${label}：計算された比`}>
          {loadingControlRatioLabel(measurement)}
        </output>
      </td>,
    ];
  }

  return [
    <td className="data-sheet-grid-measurement" key="numerator">
      <GridInput
        type="number"
        min={0}
        step={1}
        inputMode="numeric"
        value={measurement.numerator ?? ""}
        aria-label={`${label}：陽性細胞数`}
        onChange={(event) =>
          onChange({ ...measurement, numerator: parseNumber(event.target.value, true) })
        }
        gridRow={gridRow}
        gridColumn={1}
      />
    </td>,
    <td className="data-sheet-grid-measurement" key="denominator">
      <GridInput
        type="number"
        min={1}
        step={1}
        inputMode="numeric"
        value={measurement.denominator ?? ""}
        aria-label={`${label}：総細胞数`}
        onChange={(event) =>
          onChange({ ...measurement, denominator: parseNumber(event.target.value, true) })
        }
        gridRow={gridRow}
        gridColumn={2}
      />
    </td>,
    <td className="data-sheet-grid-output" key="percentage">
      <output aria-label={`${label}：計算された割合`}>{percentageLabel(measurement)}</output>
    </td>,
  ];
}

function measurementGridHeaders(measurement: DraftMeasurement, outcomeLabel: string) {
  if (measurement.kind === "loading_control_ratio") {
    return ["標的バンド", "ローディングコントロール", "計算比"];
  }
  if (measurement.kind === "proportion") {
    return ["陽性細胞数", "総細胞数", "割合（%）"];
  }
  return [outcomeLabel];
}

type UnitGridProps = {
  sheet: TwoConditionDataSheet;
  unitIndex: number;
  outcomeLabel: string;
  onChangeMeasurement: (location: MeasurementLocation, measurement: DraftMeasurement) => void;
  onChangeExperimentDate: (location: ExperimentDateLocation, experimentDate: string) => void;
};

function TwoConditionUnitGrid({
  sheet,
  unitIndex,
  outcomeLabel,
  onChangeMeasurement,
  onChangeExperimentDate,
}: UnitGridProps) {
  const firstMeasurement =
    sheet.relationship === "independent"
      ? sheet.columns[0].entries[unitIndex]?.measurement
      : sheet.rows[unitIndex]?.values[0]?.measurement;
  if (!firstMeasurement) return null;
  const headers = measurementGridHeaders(firstMeasurement, outcomeLabel);
  const relationshipLabel =
    sheet.relationship === "independent"
      ? `N${unitIndex + 1}（条件間で対応しない整理番号）`
      : sheet.relationship === "matched"
        ? `対応単位 ${unitIndex + 1}`
        : `ラン／バッチ ${unitIndex + 1}`;

  const renderDateCell = (
    label: string,
    location: ExperimentDateLocation,
    value: string,
    gridRow: number,
  ) => (
    <td className="data-sheet-grid-date">
      <GridInput
        type="date"
        value={value}
        aria-label={label}
        onChange={(event) => onChangeExperimentDate(location, event.target.value)}
        gridRow={gridRow}
        gridColumn={0}
      />
    </td>
  );

  return (
    <div className="data-sheet-unit-grid-wrap">
      <table
        className="data-sheet-unit-grid"
        data-unit-grid="true"
        data-relationship={sheet.relationship}
      >
        <caption className="sr-only">{relationshipLabel}の条件別入力</caption>
        <thead>
          <tr>
            <th scope="col">条件</th>
            <th scope="col">実験日</th>
            {headers.map((header) => (
              <th scope="col" key={header}>
                {header}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {sheet.relationship === "independent" &&
            sheet.columns.map((column, conditionIndex) => {
              const condition = sheet.conditions[conditionIndex];
              const entry = column.entries[unitIndex];
              const label = `${condition.label} 実験単位 ${unitIndex + 1}`;
              return (
                <tr key={entry.id} data-experimental-unit-id={entry.experimentalUnitId}>
                  <th scope="row">{condition.label}</th>
                  {renderDateCell(
                    `${condition.label} 実験単位 ${unitIndex + 1}：実験日`,
                    {
                      relationship: "independent",
                      columnIndex: conditionIndex,
                      entryIndex: unitIndex,
                    },
                    entry.experimentDate,
                    conditionIndex,
                  )}
                  {MeasurementGridCells({
                    measurement: entry.measurement,
                    label,
                    gridRow: conditionIndex,
                    onChange: (measurement) =>
                      onChangeMeasurement(
                        {
                          relationship: "independent",
                          columnIndex: conditionIndex,
                          entryIndex: unitIndex,
                        },
                        measurement,
                      ),
                  })}
                </tr>
              );
            })}
          {sheet.relationship !== "independent" &&
            (() => {
              const row = sheet.rows[unitIndex];
              if (!row) return null;
              return row.values.map((value, conditionIndex) => {
                const condition = sheet.conditions[conditionIndex];
                const label = `${condition.label} ${
                  sheet.relationship === "matched" ? `対応単位 ${unitIndex + 1}` : row.label
                }`;
                return (
                  <tr key={value.conditionId} data-experimental-unit-id={value.experimentalUnitId}>
                    <th scope="row">{condition.label}</th>
                    {conditionIndex === 0 && (
                      <td className="data-sheet-grid-date" rowSpan={row.values.length}>
                        <GridInput
                          type="date"
                          value={row.experimentDate}
                          aria-label={`対応単位 ${unitIndex + 1}：実験日`}
                          onChange={(event) =>
                            onChangeExperimentDate(
                              { relationship: sheet.relationship, rowIndex: unitIndex },
                              event.target.value,
                            )
                          }
                          gridRow={conditionIndex}
                          gridColumn={0}
                        />
                      </td>
                    )}
                    {MeasurementGridCells({
                      measurement: value.measurement,
                      label,
                      gridRow: conditionIndex,
                      onChange: (measurement) =>
                        onChangeMeasurement(
                          {
                            relationship: sheet.relationship,
                            rowIndex: unitIndex,
                            valueIndex: conditionIndex,
                          },
                          measurement,
                        ),
                    })}
                  </tr>
                );
              });
            })()}
        </tbody>
      </table>
    </div>
  );
}

export type MeasurementEditorProps = {
  measurement: DraftMeasurement;
  label: string;
  outcomeLabel: string;
  onChange: (measurement: DraftMeasurement) => void;
};

export function MeasurementEditor({
  measurement,
  label,
  outcomeLabel,
  onChange,
}: MeasurementEditorProps) {
  if (measurement.kind === "scalar") {
    return (
      <label className="measurement-editor">
        <span className="sr-only">{label}</span>
        <input
          className="measurement-input"
          type="number"
          inputMode="decimal"
          value={measurement.value ?? ""}
          aria-label={label}
          onChange={(event) => onChange({ kind: "scalar", value: parseNumber(event.target.value) })}
        />
        <span className="measurement-unit">{outcomeLabel}</span>
      </label>
    );
  }

  if (measurement.kind === "loading_control_ratio") {
    return (
      <div className="loading-control-editor" aria-label={label}>
        <label>
          <span>標的バンド</span>
          <input
            type="number"
            min={0}
            step="any"
            inputMode="decimal"
            value={measurement.target ?? ""}
            aria-label={`${label}：標的バンド強度`}
            onChange={(event) =>
              onChange({
                kind: "loading_control_ratio",
                target: parseNumber(event.target.value),
                loadingControl: measurement.loadingControl,
              })
            }
          />
        </label>
        <label>
          <span>ローディングコントロール</span>
          <input
            type="number"
            min={0}
            step="any"
            inputMode="decimal"
            value={measurement.loadingControl ?? ""}
            aria-label={`${label}：ローディングコントロール強度`}
            onChange={(event) =>
              onChange({
                kind: "loading_control_ratio",
                target: measurement.target,
                loadingControl: parseNumber(event.target.value),
              })
            }
          />
        </label>
        <output className="loading-control-ratio-output" aria-label={`${label}：計算された比`}>
          {loadingControlRatioLabel(measurement)}
        </output>
      </div>
    );
  }

  return (
    <div className="proportion-editor" aria-label={label}>
      <label>
        <span>陽性細胞数</span>
        <input
          type="number"
          min={0}
          step={1}
          inputMode="numeric"
          value={measurement.numerator ?? ""}
          aria-label={`${label}：陽性細胞数`}
          onChange={(event) =>
            onChange({ ...measurement, numerator: parseNumber(event.target.value, true) })
          }
        />
      </label>
      <span className="proportion-divider" aria-hidden="true">
        /
      </span>
      <label>
        <span>総細胞数</span>
        <input
          type="number"
          min={1}
          step={1}
          inputMode="numeric"
          value={measurement.denominator ?? ""}
          aria-label={`${label}：総細胞数`}
          onChange={(event) =>
            onChange({ ...measurement, denominator: parseNumber(event.target.value, true) })
          }
        />
      </label>
      <output className="percentage-output" aria-label={`${label}：計算された割合`}>
        {percentageLabel(measurement)}
      </output>
    </div>
  );
}

function relationshipMessage(sheet: TwoConditionDataSheet) {
  if (sheet.relationship === "independent") {
    return {
      title: "独立した入力列",
      message:
        "各条件の値は、別々のディッシュ・動物・試料などから得たものです。同じN番号は整理用で、条件間の対応を意味しません。条件Aの1行目と条件Bの1行目はペアになりません。",
      className: "sheet-relationship-note--independent",
    };
  }
  if (sheet.relationship === "matched") {
    return {
      title: "対応のある行",
      message:
        "各行は、同じ動物・試料などを両条件で測定した値です。同じ行の値を対応のある比較として扱います。",
      className: "sheet-relationship-note--matched",
    };
  }
  return {
    title: "完全なラン／バッチブロック",
    message: "各行は1つの独立ラン／バッチです。すべてのブロックで両条件を入力してください。",
    className: "sheet-relationship-note--matched",
  };
}

function validationIssueLabel(issue: SheetValidationIssue) {
  if (issue.path === "nested-observations") return issue.message;
  if (issue.code === "missing_value") {
    return "すべての生物学的単位に値を入力してください。";
  }
  if (issue.code === "incomplete_proportion") {
    return "陽性細胞数と総細胞数をすべての実験単位に入力してください。";
  }
  return issue.message;
}

export function DataSheetPage({
  design,
  recommendation,
  sheet: initialSheet,
  outcomeLabel,
  onBack,
  analysisRunner,
  saveProject,
  initialProject,
  metadataDraft: initialMetadataDraft,
  onNestedPasteApply,
}: DataSheetPageProps) {
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
  const initialCanonicalData: CanonicalData | null = initialProject
    ? {
        observations:
          initialDerivedRevision && initialDerivedValues.length > 0
            ? initialDerivedValues.map((value) => ({
                id: value.id,
                rawRevisionId: initialProject.state.activeRawRevisionId,
                unitInstanceId: value.experimentalUnitId,
                conditionId: value.conditionId,
                outcomeId: value.outcomeId,
                measurement: { kind: "scalar" as const, value: value.value },
                sourceLocation: `derived:${initialDerivedRevision.id}`,
              }))
            : initialProject.state.observations.filter(
                (observation) =>
                  observation.rawRevisionId === initialProject.state.activeRawRevisionId &&
                  observation.outcomeId === initialSheet.outcomeId,
              ),
        unitInstances: initialProject.state.unitInstances,
        ...(initialDerivedRevision
          ? {
              rawObservations: initialProject.state.observations.filter(
                (observation) =>
                  observation.rawRevisionId === initialProject.state.activeRawRevisionId &&
                  observation.outcomeId === initialSheet.outcomeId,
              ),
              transformation: initialProject.state.transformations.find(
                (candidate) => candidate.id === initialDerivedRevision.transformationId,
              ),
              derivedRevision: initialDerivedRevision,
              derivedValues: initialDerivedValues,
            }
          : {}),
      }
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
        const unitById = new Map(initialProject.state.unitInstances.map((unit) => [unit.id, unit]));
        const restoredGraphInput = [
          ...persisted.request.observations.map((observation) => ({
            ...observation,
            ...(persisted.inputDerivedDatasetRevisionId
              ? { layer: "replicate_summary" as const }
              : {}),
          })),
          ...(persisted.inputDerivedDatasetRevisionId
            ? initialProject.state.observations
                .filter(
                  (observation) =>
                    observation.rawRevisionId === persisted.inputRawRevisionId &&
                    observation.outcomeId === initialSheet.outcomeId &&
                    observation.measurement.kind === "scalar",
                )
                .map((observation) => ({
                  observationId: observation.id,
                  conditionId: observation.conditionId,
                  value:
                    observation.measurement.kind === "scalar" ? observation.measurement.value : 0,
                  experimentalUnitId:
                    unitById.get(observation.unitInstanceId)?.parentUnitId ??
                    observation.unitInstanceId,
                  layer: "raw" as const,
                }))
            : []),
        ];
        if (graph.spec.type === "scatter" && persisted.request.templateId === "D09") {
          const variables = design.conditions.map(({ id, label }) => ({ id, label })) as [
            { id: string; label: string },
            { id: string; label: string },
          ];
          graphModel = createCoreCorrelationGraphModel(
            graph.spec,
            variables,
            persisted.request.observations.map((observation) => ({
              observationId: observation.observationId,
              conditionId: observation.conditionId,
              value: observation.value,
              experimentalUnitId: observation.experimentalUnitId,
              pairId: observation.pairId,
            })),
          );
        } else {
          graphModel = createCoreGraphModel(graph.spec, design.conditions, restoredGraphInput);
        }
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
  const [sheet, setSheet] = useState<TwoConditionDataSheet>(initialSheet);
  const [issues, setIssues] = useState<SheetValidationIssue[]>([]);
  const [validated, setValidated] = useState(initialCanonicalData !== null);
  const [canonicalData, setCanonicalData] = useState<CanonicalData | null>(initialCanonicalData);
  const [analysisRun, setAnalysisRun] = useState<AnalysisRun | null>(restoredAnalysis);
  const [analysisError, setAnalysisError] = useState<string | null>(null);
  const [analysisStatus, setAnalysisStatus] = useState<"idle" | "running" | "error">("idle");
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
  const [activeTab, setActiveTab] = useState<WorkflowTabId>("input");
  const unitCount =
    sheet.relationship === "independent"
      ? Math.max(sheet.columns[0].entries.length, sheet.columns[1].entries.length)
      : sheet.rows.length;
  const [activeUnitIndex, setActiveUnitIndex] = useState(0);
  const [hasPastedValues, setHasPastedValues] = useState(false);
  const [nestedPayloads, setNestedPayloads] = useState<Record<string, NestedImageJPastePayload>>(
    {},
  );
  const workspaceIdentityRef = useRef<WorkspaceIdentity | null>(null);
  if (workspaceIdentityRef.current === null) {
    if (initialProject) {
      workspaceIdentityRef.current = {
        projectId: initialProject.state.metadata.projectId,
        rawRevisionId: initialProject.state.activeRawRevisionId,
        metadata: initialProject.state.metadata,
      };
    } else {
      const token = createWorkspaceToken();
      const projectId = `project.${token}`;
      workspaceIdentityRef.current = {
        projectId,
        rawRevisionId: `raw-revision.${token}.1`,
        metadata: {
          projectId,
          projectName: metadataDraft.projectName,
          experimentDate: metadataDraft.experimentDate,
          operator: metadataDraft.operator || undefined,
          batch: metadataDraft.batch || undefined,
          note: metadataDraft.note || undefined,
          createdAt: design.createdAt,
          updatedAt: design.createdAt,
        },
      };
    }
  }
  const workspaceIdentity = workspaceIdentityRef.current as WorkspaceIdentity;
  const [draftRawRevisionId, setDraftRawRevisionId] = useState(workspaceIdentity.rawRevisionId);
  const relationship = relationshipMessage(sheet);
  useEffect(() => {
    setActiveUnitIndex((current) => Math.min(current, Math.max(0, unitCount - 1)));
  }, [unitCount]);
  const isProportion = design.outcomes[0]?.type === "proportion_counts";
  const isLoadingControlRatio = (() => {
    if (sheet.relationship === "independent") {
      return sheet.columns[0].entries[0]?.measurement.kind === "loading_control_ratio";
    }
    return sheet.rows[0]?.values[0]?.measurement.kind === "loading_control_ratio";
  })();

  const changeMeasurement = (location: MeasurementLocation, measurement: DraftMeasurement) => {
    setNestedPayloads({});
    if (lastSavedState && draftRawRevisionId === lastSavedState.activeRawRevisionId) {
      setDraftRawRevisionId(`raw-revision.${createWorkspaceToken()}`);
    }
    setValidated(false);
    setIssues([]);
    setCanonicalData(null);
    setAnalysisRun(null);
    setAnalysisError(null);
    setAnalysisStatus("idle");
    setSaveStatus("idle");
    setSaveError(null);
    setSheet((previous) => updateMeasurement(previous, location, measurement));
  };

  const changeExperimentDate = (location: ExperimentDateLocation, experimentDate: string) => {
    const experimentalUnitId =
      location.relationship === "independent" && sheet.relationship === "independent"
        ? sheet.columns[location.columnIndex].entries[location.entryIndex].experimentalUnitId
        : location.relationship === "matched" && sheet.relationship === "matched"
          ? sheet.rows[location.rowIndex].experimentalUnitId
          : null;
    const nextRawRevisionId =
      lastSavedState && draftRawRevisionId === lastSavedState.activeRawRevisionId
        ? `raw-revision.${createWorkspaceToken()}`
        : draftRawRevisionId;
    if (nextRawRevisionId !== draftRawRevisionId) setDraftRawRevisionId(nextRawRevisionId);
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
    setSheet((previous) => updateExperimentDate(previous, location, experimentDate));
    setCanonicalData(null);
    setValidated(false);
    setAnalysisRun(null);
    setAnalysisError(null);
    setSaveStatus("idle");
    setSaveError(null);
    setIssues([]);
    setActiveTab("input");
  };

  const replaceSheet = (nextSheet: TwoConditionDataSheet, revisionAlreadyAdvanced = false) => {
    if (
      !revisionAlreadyAdvanced &&
      lastSavedState &&
      draftRawRevisionId === lastSavedState.activeRawRevisionId
    ) {
      setDraftRawRevisionId(`raw-revision.${createWorkspaceToken()}`);
    }
    setValidated(false);
    setIssues([]);
    setCanonicalData(null);
    setAnalysisRun(null);
    setAnalysisError(null);
    setAnalysisStatus("idle");
    setSaveStatus("idle");
    setSaveError(null);
    setSheet(nextSheet);
  };

  const applyBulkPaste = (
    conditionId: string,
    values: number[],
    source: { columnLabel: string; rowNumbers: number[] },
    preserveNested = false,
  ) => {
    if (!preserveNested) setNestedPayloads({});
    const nextSheet = applyScalarValuesToCondition(sheet, conditionId, values, source);
    setHasPastedValues(true);
    replaceSheet(nextSheet);
  };

  const applyNestedPaste = (payload: NestedImageJPastePayload) => {
    // Keep the existing editable scalar sheet as the user-facing summary while
    // exposing the complete raw/nested payload to the project persistence layer.
    const effectiveRawRevisionId =
      lastSavedState && draftRawRevisionId === lastSavedState.activeRawRevisionId
        ? `raw-revision.${createWorkspaceToken()}`
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
    onNestedPasteApply?.(effectivePayload);
    const nextSheet = applyScalarValuesToCondition(
      sheet,
      effectivePayload.conditionId,
      effectivePayload.summaries.map((summary) => summary.value),
      effectivePayload.source,
    );
    setHasPastedValues(true);
    replaceSheet(nextSheet, true);
    setNestedPayloads((previous) => ({
      ...previous,
      [effectivePayload.conditionId]: effectivePayload,
    }));
  };

  const saveCurrentProject = async () => {
    if (!saveProject || !canonicalData || !validated || !metadataDraftIsComplete(metadataDraft))
      return;
    setSaveStatus("saving");
    setSaveError(null);
    try {
      const persistedMetadata = metadataForPersistence(metadataDraft);
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
        state = createInitialProjectState({
          metadata: {
            ...workspaceIdentity.metadata,
            ...persistedMetadata,
          },
          design: canonicalData.projectDesign ?? design,
          rawRevision: {
            id: draftRawRevisionId,
            previousRevisionId: null,
            sourceKind: hasPastedValues ? "paste" : "manual",
            sourceName: hasPastedValues
              ? "ImageJ / clipboard table"
              : "Life Science Analysis data sheet",
            createdAt: workspaceIdentity.metadata.createdAt,
            createdBy: "local-user",
            note: "Canonical observations created from a validated design-aware data sheet.",
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
            ...persistedMetadata,
            updatedAt: new Date().toISOString(),
          },
        });
        const activeDesign = state.designRevisions.find(
          (revision) => revision.id === state.activeDesignRevisionId,
        )?.design;
        if (
          canonicalData.projectDesign &&
          JSON.stringify(activeDesign) !== JSON.stringify(canonicalData.projectDesign)
        ) {
          state = appendDesignRevision(
            state,
            canonicalData.projectDesign,
            "local-user",
            new Date().toISOString(),
          );
        }
        if (draftRawRevisionId !== lastSavedState.activeRawRevisionId) {
          state = appendRawRevision(
            state,
            {
              id: draftRawRevisionId,
              previousRevisionId: lastSavedState.activeRawRevisionId,
              sourceKind: "project_edit",
              createdAt: new Date().toISOString(),
              createdBy: "local-user",
              note: "Canonical observations created from an edited data sheet.",
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
        if (analysis?.graphSpec) {
          const analysisRunId = `analysis-run.${analysis.request.requestId}`;
          state = ProjectStateSchema.parse({
            ...state,
            graphs: state.graphs.map((graph) =>
              graph.sourceAnalysisRunId === analysisRunId
                ? { ...graph, spec: analysis.graphSpec }
                : graph,
            ),
          });
        }
      }
      const savedProject = await saveProject(ProjectStateSchema.parse(state), saveTarget);
      if (savedProject === null) {
        setSaveStatus("idle");
        return;
      }
      setLastSavedState(savedProject.state);
      setSaveTarget(savedProject.target);
      setDraftRawRevisionId(savedProject.state.activeRawRevisionId);
      setSaveStatus("success");
    } catch (error) {
      setSaveStatus("error");
      setSaveError(
        actionErrorMessage(
          error,
          "プロジェクトを保存できませんでした。入力したデータは保持されています。",
        ),
      );
    }
  };

  const validateSheet = () => {
    setValidated(false);
    setIssues([]);
    try {
      const result = toCanonicalObservations(sheet, draftRawRevisionId);
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
              "D10では比較するすべての条件についてcell/ROIを割り当ててください。片方だけを要約値入力と混在させることはできません。",
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
        const createdAt = new Date().toISOString();
        const derived = createNestedScalarDerivedDataset({
          derivedDatasetRevisionId: `derived-dataset.${createWorkspaceToken()}`,
          rawRevisionId: draftRawRevisionId,
          outcomeId: sheet.outcomeId,
          experimentalUnitLevelId: sheet.experimentalUnitLevelId,
          method: nested[0].method,
          observations: rawObservations,
          unitInstances: [...unitsById.values()],
          createdAt,
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
          projectDesign: design.unitLevels.some((level) => level.id === "unit.imagej-row")
            ? design
            : {
                ...design,
                unitLevels: [
                  ...design.unitLevels,
                  {
                    id: "unit.imagej-row",
                    key: "imagej_row",
                    label: "cell / ROI",
                    role: "subsample",
                    parentLevelId: design.experimentalUnitLevelId,
                  },
                ],
              },
        });
      } else {
        setCanonicalData({
          observations: result.observations,
          unitInstances: result.unitInstances,
        });
      }
      setValidated(true);
      setActiveTab("analysis");
    } catch {
      setIssues([
        {
          code: "incomplete_proportion",
          path: "sheet",
          message: "Check the entered counts: positive cells cannot exceed total cells.",
        },
      ]);
    }
  };

  const runRecommendedAnalysis = async () => {
    if (!canonicalData) return;
    if (
      recommendation.templateId !== "D01" &&
      recommendation.templateId !== "D02" &&
      recommendation.templateId !== "D09"
    ) {
      setAnalysisStatus("error");
      setAnalysisError("このデータシートは実装済みの解析テンプレートの対象外です。");
      return;
    }
    setAnalysisStatus("running");
    setAnalysisError(null);
    try {
      const request =
        recommendation.templateId === "D09"
          ? createD09EngineRequest({
              requestId: `request.${createWorkspaceToken()}`,
              projectId: workspaceIdentity.projectId,
              analysisId: `analysis.${design.id}`,
              design,
              recommendation,
              observations: canonicalData.observations,
              unitInstances: canonicalData.unitInstances,
            })
          : createD01D02EngineRequest({
              requestId: `request.${createWorkspaceToken()}`,
              projectId: workspaceIdentity.projectId,
              analysisId: `analysis.${design.id}`,
              design,
              recommendation,
              observations: canonicalData.observations,
              unitInstances: canonicalData.unitInstances,
            });
      const runner = analysisRunner ?? defaultAnalysisRunner;
      const rawResult = await runner(request);
      const result = AnalysisEngineResultSchema.parse(rawResult);
      if (result.status !== "ok") {
        setAnalysisRun({ request, result, graphSpec: null, graphModel: null });
        setAnalysisStatus("error");
        return;
      }
      const baseGraphSpec =
        recommendation.templateId === "D09"
          ? createCoreCorrelationGraphSpec({
              graphId: `graph.${design.id}`,
              dataSource: {
                kind: "analysis_result",
                id: request.analysisId,
                revision: result.requestId,
              },
              analysisResultId: result.requestId,
              xConditionId: design.conditions[0].id,
              yConditionId: design.conditions[1].id,
              xLabel: design.conditions[0].label,
              yLabel: design.conditions[1].label,
            })
          : createCoreTwoConditionGraphSpec({
              graphId: `graph.${design.id}`,
              templateId: recommendation.templateId,
              dataSource: {
                kind: "analysis_result",
                id: request.analysisId,
                revision: result.requestId,
              },
              analysisResultId: result.requestId,
              yLabel: outcomeLabel,
              yStartAtZero: true,
            });
      if (recommendation.templateId === "D09") {
        const variables = design.conditions.map(({ id, label }) => ({ id, label })) as [
          { id: string; label: string },
          { id: string; label: string },
        ];
        const graphModel = createCoreCorrelationGraphModel(
          baseGraphSpec,
          variables,
          request.observations.map((observation) => ({
            observationId: observation.observationId,
            conditionId: observation.conditionId,
            value: observation.value,
            experimentalUnitId: observation.experimentalUnitId,
            pairId: observation.pairId,
          })),
        );
        setAnalysisRun({ request, result, graphSpec: baseGraphSpec, graphModel });
        setAnalysisStatus("idle");
        return;
      }
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
        ...request.observations.map((observation) => ({
          ...observation,
          layer: "replicate_summary" as const,
        })),
        ...(canonicalData.rawObservations ?? [])
          .filter((observation) => observation.measurement.kind === "scalar")
          .map((observation) => {
            const unit = unitById.get(observation.unitInstanceId);
            return {
              observationId: observation.id,
              conditionId: observation.conditionId,
              value: observation.measurement.kind === "scalar" ? observation.measurement.value : 0,
              experimentalUnitId: unit?.parentUnitId ?? observation.unitInstanceId,
              layer: "raw" as const,
            };
          }),
      ];
      const graphModel = createCoreGraphModel(
        graphSpec,
        design.conditions.map(({ id, label }) => ({ id, label })),
        graphInput,
      );
      setAnalysisRun({ request, result, graphSpec, graphModel });
      setAnalysisStatus("idle");
    } catch (error) {
      setAnalysisStatus("error");
      setAnalysisError(
        error instanceof Error
          ? error.message
          : "ローカル解析エンジンが有効な結果を返せませんでした。入力したデータは保持されています。",
      );
    }
  };

  const updateGraphSpec = (nextSpec: GraphSpec) => {
    if (!analysisRun) return;
    try {
      const graphSpec = GraphSpecSchema.parse(nextSpec);
      if (graphSpec.type === "scatter" && analysisRun.request.templateId === "D09") {
        const variables = design.conditions.map(({ id, label }) => ({ id, label })) as [
          { id: string; label: string },
          { id: string; label: string },
        ];
        const graphModel = createCoreCorrelationGraphModel(
          graphSpec,
          variables,
          analysisRun.request.observations.map((observation) => ({
            observationId: observation.observationId,
            conditionId: observation.conditionId,
            value: observation.value,
            experimentalUnitId: observation.experimentalUnitId,
            pairId: observation.pairId,
          })),
        );
        setAnalysisRun((previous) =>
          previous ? { ...previous, graphSpec, graphModel } : previous,
        );
        setSaveStatus("idle");
        setSaveError(null);
        return;
      }
      const unitById = new Map(canonicalData?.unitInstances.map((unit) => [unit.id, unit]) ?? []);
      const graphInput = [
        ...analysisRun.request.observations.map((observation) => ({
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
        design.conditions.map(({ id, label }) => ({ id, label })),
        graphInput,
      );
      setAnalysisRun((previous) => (previous ? { ...previous, graphSpec, graphModel } : previous));
      setSaveStatus("idle");
      setSaveError(null);
    } catch (error) {
      setAnalysisError(
        error instanceof Error ? error.message : "グラフ設定を更新できませんでした。",
      );
    }
  };

  const handleWorkflowTabKeyDown = (
    event: KeyboardEvent<HTMLButtonElement>,
    currentIndex: number,
  ) => {
    let nextIndex: number | null = null;
    if (event.key === "ArrowRight") nextIndex = (currentIndex + 1) % WORKFLOW_TABS.length;
    if (event.key === "ArrowLeft")
      nextIndex = (currentIndex - 1 + WORKFLOW_TABS.length) % WORKFLOW_TABS.length;
    if (event.key === "Home") nextIndex = 0;
    if (event.key === "End") nextIndex = WORKFLOW_TABS.length - 1;
    if (nextIndex === null) return;
    event.preventDefault();
    const nextTab = WORKFLOW_TABS[nextIndex].id;
    setActiveTab(nextTab);
    document.getElementById(`workflow-tab-${nextTab}`)?.focus();
  };

  return (
    <div className="page-stack narrow-page">
      <button className="back-link" type="button" onClick={onBack}>
        <span aria-hidden="true">←</span> デザイン確認に戻る
      </button>

      <nav className="workflow-tabs" aria-label="解析ワークフロー" role="tablist">
        {WORKFLOW_TABS.map(({ id: tab, label }) => {
          const status =
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
            <button
              key={tab}
              id={`workflow-tab-${tab}`}
              className={`workflow-tab ${activeTab === tab ? "is-active" : ""}`}
              type="button"
              role="tab"
              aria-selected={activeTab === tab}
              aria-controls={`workflow-panel-${tab}`}
              tabIndex={activeTab === tab ? 0 : -1}
              onClick={() => setActiveTab(tab)}
              onKeyDown={(event) =>
                handleWorkflowTabKeyDown(
                  event,
                  WORKFLOW_TABS.findIndex(({ id }) => id === tab),
                )
              }
            >
              <span>{label}</span>
              <small>{status}</small>
            </button>
          );
        })}
      </nav>

      {
        <div className="workflow-panel-intro" role="presentation" hidden={activeTab !== "input"}>
          <section className="sheet-intro" aria-labelledby="sheet-heading">
            <div>
              <p className="overline">データ入力</p>
              <h1 id="sheet-heading">実験単位ごとに値を入力</h1>
              <p>別の日に行った実験は、それぞれの日付を記録できます。</p>
              <p className="hero-japanese">
                1つの入力欄が、条件を割り当てた1つのディッシュ・動物・試料などに対応します。細胞やROIを測った場合は、その実験単位の中の測定として扱います。
              </p>
            </div>
            <span className="wizard-purpose-chip">{outcomeLabel}</span>
          </section>
        </div>
      }

      {activeTab === "analysis" && (
        <div className="workflow-panel-intro" role="presentation">
          <section className="sheet-recommendation" aria-labelledby="sheet-recommendation-heading">
            <div>
              <p className="overline">デザイン確認</p>
              <h2 id="sheet-recommendation-heading">{templateLabel(recommendation.templateId)}</h2>
            </div>
            <dl>
              <div>
                <dt>手法</dt>
                <dd>{methodLabel(recommendation.recommendedMethod)}</dd>
              </div>
              <div>
                <dt>統計上のn</dt>
                <dd>{statisticalNLabel(recommendation)}</dd>
              </div>
              <div>
                <dt>理由</dt>
                <dd>{recommendationExplanation(recommendation)}</dd>
              </div>
            </dl>
          </section>
        </div>
      )}

      {
        <div
          id="workflow-panel-input"
          className="workflow-panel-stack"
          role="tabpanel"
          aria-labelledby="workflow-tab-input"
          hidden={activeTab !== "input"}
        >
          <aside
            className={`sheet-relationship-note ${relationship.className}`}
            aria-label={relationship.title}
          >
            <span className="sheet-note-icon" aria-hidden="true">
              {sheet.relationship === "independent" ? "∥" : "↔"}
            </span>
            <div>
              <strong>{relationship.title}</strong>
              <p>{relationship.message}</p>
            </div>
          </aside>

          {!isProportion && !isLoadingControlRatio && (
            <>
              <BulkPasteScalar sheet={sheet} onApply={applyBulkPaste} />
              {design.purpose === "microscopy" && (
                <NestedImageJPaste
                  sheet={sheet}
                  rawRevisionId={draftRawRevisionId}
                  onApply={applyNestedPaste}
                />
              )}
            </>
          )}

          <section className="sheet-section" aria-labelledby="sheet-table-heading">
            <div className="section-heading-row">
              <div>
                <p className="overline">生データ</p>
                <h2 id="sheet-table-heading">{outcomeLabel}</h2>
              </div>
              <span className="section-hint">計画n = {design.plannedN}</span>
            </div>

            <div className="data-sheet-unit-tabs" role="tablist" aria-label="実験単位の選択">
              {Array.from({ length: unitCount }, (_, index) => (
                <button
                  key={index}
                  id={`data-sheet-unit-tab-${index}`}
                  type="button"
                  role="tab"
                  aria-selected={activeUnitIndex === index}
                  aria-controls="data-sheet-unit-panel"
                  tabIndex={activeUnitIndex === index ? 0 : -1}
                  onClick={() => setActiveUnitIndex(index)}
                  onKeyDown={(event) => {
                    if (event.key !== "ArrowLeft" && event.key !== "ArrowRight") return;
                    event.preventDefault();
                    const nextIndex =
                      event.key === "ArrowRight"
                        ? (index + 1) % unitCount
                        : (index - 1 + unitCount) % unitCount;
                    setActiveUnitIndex(nextIndex);
                    document.getElementById(`data-sheet-unit-tab-${nextIndex}`)?.focus();
                  }}
                >
                  N{index + 1}
                </button>
              ))}
            </div>
            <p className="data-sheet-unit-note" role="note">
              {sheet.relationship === "independent"
                ? "N番号は入力を整理するための番号です。条件間の対応やペアを意味しません。"
                : sheet.relationship === "matched"
                  ? "同じN番号の条件は、同じ実験単位から得た対応のある値です。"
                  : "同じN番号の条件は、同じラン／バッチ内の値です。"}
            </p>
            <div
              id="data-sheet-unit-panel"
              role="tabpanel"
              aria-labelledby={`data-sheet-unit-tab-${activeUnitIndex}`}
            >
              <TwoConditionUnitGrid
                sheet={sheet}
                unitIndex={activeUnitIndex}
                outcomeLabel={outcomeLabel}
                onChangeMeasurement={changeMeasurement}
                onChangeExperimentDate={changeExperimentDate}
              />
            </div>
          </section>

          <section className="sheet-actions" aria-label="データシートの検証">
            <div>
              <strong>検証の準備はできましたか？</strong>
              <p>
                すべての実験単位の日付と値を確認し、解析できるデータへ変換します。統計検定はまだ実行しません。
              </p>
            </div>
            <button className="confirm-design-button" type="button" onClick={validateSheet}>
              検証して続ける <span aria-hidden="true">→</span>
            </button>
          </section>

          {issues.length > 0 && (
            <section
              className="validation-issues"
              role="alert"
              aria-labelledby="validation-heading"
            >
              <h2 id="validation-heading">データシートを完成させてください</h2>
              <ul>
                {issues.map((issue, index) => (
                  <li key={`${issue.path}-${index}`}>{validationIssueLabel(issue)}</li>
                ))}
              </ul>
            </section>
          )}

          {validated && (
            <p className="confirmed-message" role="status">
              入力を検証しました。正式な観測値を次のステップで利用できます。統計計算はまだ実行していません。
            </p>
          )}
        </div>
      }

      {activeTab === "analysis" && (
        <div
          id="workflow-panel-analysis"
          className="workflow-panel-stack"
          role="tabpanel"
          aria-labelledby="workflow-tab-analysis"
        >
          <section className="sheet-actions" aria-label="推奨解析">
            <div>
              <strong>検証済みデータを解析</strong>
              <p>推奨された統計テンプレートをローカルエンジンで実行します。</p>
            </div>
            <button
              className="analysis-run-button"
              type="button"
              disabled={!canonicalData || analysisStatus === "running"}
              onClick={runRecommendedAnalysis}
            >
              {analysisStatus === "running" ? "ローカルで解析中…" : "推奨解析を実行"}
            </button>
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
              <p>
                入力したデータは保持されています。ローカルのデスクトップシェルでアプリが動作していることを確認して再実行してください。
              </p>
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
        <div id="workflow-panel-graph" role="tabpanel" aria-labelledby="workflow-tab-graph">
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
          id="workflow-panel-save"
          className="workflow-panel-stack"
          role="tabpanel"
          aria-labelledby="workflow-tab-save"
        >
          <details className="metadata-disclosure" open>
            <summary>プロジェクト情報</summary>
            <div className="metadata-form-grid">
              <label className="field-label">
                プロジェクト名 <span aria-hidden="true">*</span>
                <input
                  required
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
                最初の実験日 <span aria-hidden="true">*</span>
                <input
                  required
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
              <p>検証済みデータと実行済み解析を、再現可能なプロジェクトとして保存します。</p>
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
              {saveStatus === "saving" ? "プロジェクトを保存中…" : "プロジェクトを保存"}
            </button>
          </section>
          {!saveProject && (
            <p className="project-action-note" role="status">
              デスクトップのプロジェクト保存機能が未接続のため、保存できません。入力シートはメモリ上に保持されています。
            </p>
          )}
          {saveStatus === "success" && (
            <p className="project-action-message project-action-message--success" role="status">
              プロジェクトを保存しました。
            </p>
          )}
          {saveStatus === "error" && saveError && (
            <p className="project-action-message project-action-message--error" role="alert">
              {saveError} 入力したデータは保持されています。
            </p>
          )}
          {lastSavedState && (
            <p className="project-action-note" role="note">
              保存履歴：現在の生データ改訂 {lastSavedState.activeRawRevisionId}
              。入力を編集すると、既存の解析とグラフは再計算が必要になります。
            </p>
          )}
        </div>
      )}
    </div>
  );
}

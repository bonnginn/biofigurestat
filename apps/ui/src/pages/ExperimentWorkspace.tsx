import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";
import type { KeyboardEvent } from "react";
import { isTauri } from "@tauri-apps/api/core";
import { listen, type UnlistenFn } from "@tauri-apps/api/event";

import {
  continuousSummary,
  categoricalPercentage,
  categoricalTotal,
  cellIsNotPlanned,
  createExperimentSession,
  experimentCellKey,
  normalizeWithinExperiment,
  parseNumericPaste,
  percentage,
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
import { ExperimentGraphWorkbench } from "../components/graph/ExperimentGraphWorkbench";
import {
  CurrentDataGraphPreview,
  GraphTypeThumbnail,
  type CreatableGraphType,
} from "../components/graph/GraphCreationPreview";
import { defaultAnalysisRunner, type AnalysisRunner } from "../app/analysisClient";
import { defaultGraphYTitle, defaultLayersForGraphType } from "../app/graphDefaults";
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
import { recordBenchmarkEvent, useBenchmarkRun } from "../app/benchmarkEvaluation";
import { BENCHMARK_PILOT_CASES, mapBenchmarkPilotMeasurements } from "../app/benchmarkPilotCases";

export type ExperimentWorkspaceProps = {
  initialDraft: ExperimentSetDraft;
  initialCells?: ExperimentCellMap;
  initialGraphs?: readonly WorkspaceGraphState[];
  initialProject?: OpenedProject;
  onBack: () => void;
  analysisRunner?: AnalysisRunner;
  saveProject?: SaveProjectAction;
  onReuseDesign?: (draft: ExperimentSetDraft) => void;
  onSaveFavorite?: (draft: ExperimentSetDraft, graphs: readonly WorkspaceGraphState[]) => void;
  favoriteGraphDefaults?: readonly FavoriteGraphDefault[];
};

type WorkspaceTab = "overview" | `experiment:${string}`;

type CellDescriptor = {
  key: string;
  experiment: ExperimentSessionDraft;
  conditionId: string;
  conditionLabel: string;
  timePoint: TimePointDraft | null;
  timeUnit: ExperimentSetDraft["time"]["unit"];
  readout: ReadoutDraft;
};

type TableRow = {
  key: string;
  conditionId: string;
  conditionLabel: string;
  timePoint: TimePointDraft | null;
};

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
              timeUnit: draft.time.unit,
              readout,
            };
          }
        }
      }
    }
  }
  return null;
}

function nullableNumber(value: string): number | null {
  const trimmed = value.trim();
  if (!trimmed) return null;
  const parsed = Number(trimmed);
  return Number.isFinite(parsed) ? parsed : null;
}

function countValue(value: string): number | null {
  const parsed = nullableNumber(value);
  if (parsed === null || parsed < 0 || !Number.isInteger(parsed)) return null;
  return parsed;
}

type ProportionPasteUpdate = Readonly<{
  key: string;
  field: "positive" | "eligible";
  value: number;
}>;

function graphTypeChoiceLabel(graphType: CreatableGraphType): string {
  if (graphType === "stacked") return "Stacked count";
  if (graphType === "stacked_100") return "100% stacked";
  if (graphType === "category_percentage") return "Category percentage";
  if (graphType === "scatter") return "Scatter";
  if (graphType === "line") return "Line / Time course";
  if (graphType === "violin") return "Violin";
  if (graphType === "paired_dot") return "対応を線で結ぶ";
  if (graphType === "box") return "Box";
  if (graphType === "bar") return "Bar";
  return "Dot";
}

type ProportionPasteRequest = Readonly<{
  experimentId: string;
  readoutId: string;
  startRow: number;
  startColumn: number;
  text: string;
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

function rowTimeQualifier(
  row: Pick<TableRow, "timePoint">,
  unit: ExperimentSetDraft["time"]["unit"],
): string {
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

function ReadoutLabel({ readout }: { readout: ReadoutDraft }) {
  return (
    <span className="experiment-workspace-readout-label">
      {readout.label}
      {readout.unit ? <span className="experiment-workspace-unit">({readout.unit})</span> : null}
    </span>
  );
}

function OverviewPanel({ draft, cells }: { draft: ExperimentSetDraft; cells: ExperimentCellMap }) {
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

  return (
    <section
      className="experiment-workspace-panel experiment-workspace-overview"
      aria-labelledby="experiment-overview-heading"
    >
      <div className="experiment-workspace-panel-heading">
        <div>
          <p className="experiment-workspace-eyebrow">実験の確認</p>
          <h2 id="experiment-overview-heading">入力状況</h2>
        </div>
      </div>

      <div className="experiment-workspace-progress" aria-label="入力の進み具合">
        <div className="experiment-workspace-progress-topline">
          <strong>
            {completedCells} / {plannedCells} セル入力済み
          </strong>
          <span>{progress}%</span>
        </div>
        <div className="experiment-workspace-progress-track" aria-hidden="true">
          <span style={{ width: `${progress}%` }} />
        </div>
        <p>
          {missingCells > 0
            ? `未入力のセルが${missingCells}件あります。途中の状態でもグラフを作成できます。`
            : "必要なセルがすべて入力されています。"}
        </p>
        {notPlannedCells > 0 ? (
          <p>測定予定なし：{notPlannedCells}セル（進捗・解析から除外）</p>
        ) : null}
      </div>

      <dl className="experiment-workspace-summary-grid">
        <div>
          <dt>実験セット</dt>
          <dd>{draft.name}</dd>
        </div>
        <div>
          <dt>実験セッション</dt>
          <dd>{draft.experiments.length}回</dd>
        </div>
        <div>
          <dt>条件</dt>
          <dd>{draft.conditions.length}条件</dd>
        </div>
        <div>
          <dt>時間</dt>
          <dd>
            {draft.time.points.length > 0
              ? draft.time.points.map((point) => timePointLabel(point, draft.time.unit)).join("、")
              : "時間点なし"}
          </dd>
        </div>
      </dl>

      <div className="experiment-workspace-overview-section">
        <h3>条件の構成</h3>
        <div className="experiment-workspace-overview-condition-wrap">
          <table className="experiment-workspace-overview-condition-table" aria-label="条件の構成">
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

      <div className="experiment-workspace-notice" role="note">
        <strong>Exp番号について</strong>
        <p>
          {draft.conditionAssignment.kind === "matched"
            ? `Exp 1、Exp 2…の各行では、同じ${draft.conditionAssignment.unitLabel}の条件間測定を対応づけています。日付が同じという理由ではなく、実験設計で明示した対応です。`
            : "Exp 1、Exp 2…は実験セッションを整理するための番号です。独立した条件同士を統計的に対応付けるものではありません。"}
        </p>
      </div>
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
  return (
    <div className="experiment-workspace-meta">
      <label>
        <span>実験回ID</span>
        <input
          aria-label={`${experiment.label}の実験回ID`}
          type="text"
          value={experiment.sessionId ?? experiment.id}
          onChange={(event) => onChange({ sessionId: event.currentTarget.value })}
        />
      </label>
      <label>
        <span>生物学的単位ID</span>
        <input
          aria-label={`${experiment.label}の生物学的単位ID`}
          type="text"
          value={experiment.stableUnitId ?? experiment.id}
          onChange={(event) => onChange({ stableUnitId: event.currentTarget.value })}
        />
        <small>
          {draft.conditionAssignment.kind === "matched"
            ? `同じ${draft.conditionAssignment.unitLabel}を条件間で対応づけるID`
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
          <col className="experiment-workspace-col-time" />
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
            <th scope="col">時間</th>
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
            return (
              <tr key={row.key}>
                <ConditionCells draft={draft} row={row} />
                <td>{row.timePoint ? timePointLabel(row.timePoint, draft.time.unit) : "—"}</td>
                <td>
                  <input
                    className="experiment-workspace-number-input"
                    aria-label={`${row.conditionLabel}${rowTimeQualifier(row, draft.time.unit)}の陽性数`}
                    type="number"
                    disabled={notPlanned}
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
                    aria-label={`${row.conditionLabel}${rowTimeQualifier(row, draft.time.unit)}の対象数`}
                    type="number"
                    disabled={notPlanned}
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
                  aria-label={`${row.conditionLabel}${rowTimeQualifier(row, draft.time.unit)}の計算された割合`}
                >
                  <span>{notPlanned ? "予定なし" : formatNumber(percentage(proportionCell))}</span>
                  <button
                    className={`experiment-workspace-availability-button ${notPlanned ? "is-active" : ""}`}
                    type="button"
                    aria-label={`${row.conditionLabel}${rowTimeQualifier(row, draft.time.unit)}を${notPlanned ? "入力対象に戻す" : "測定予定なしにする"}`}
                    onClick={() => onToggleNotPlanned(key)}
                  >
                    {notPlanned ? "戻す" : "予定なし"}
                  </button>
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
            <th scope="col">時間</th>
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
                <td>{row.timePoint ? timePointLabel(row.timePoint, draft.time.unit) : "—"}</td>
                <td>
                  <button
                    className="experiment-workspace-raw-button"
                    type="button"
                    disabled={notPlanned}
                    aria-label={`${row.conditionLabel}${rowTimeQualifier(row, draft.time.unit)}の生データを開く`}
                    onClick={() => onSelect(key)}
                  >
                    {notPlanned
                      ? "測定予定なし"
                      : summary.n > 0
                        ? `n=${summary.n} / 平均 ${formatNumber(summary.mean)}`
                        : "生データを入力"}
                  </button>
                  <button
                    className={`experiment-workspace-availability-button ${notPlanned ? "is-active" : ""}`}
                    type="button"
                    aria-label={`${row.conditionLabel}${rowTimeQualifier(row, draft.time.unit)}を${notPlanned ? "入力対象に戻す" : "測定予定なしにする"}`}
                    onClick={() => onToggleNotPlanned(key)}
                  >
                    {notPlanned ? "戻す" : "予定なし"}
                  </button>
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
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
    tokens.slice(0, 2).forEach((token, index) => onChange(keys[index], nullableNumber(token)));
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
                    onChange(keys[index], nullableNumber(event.currentTarget.value))
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
            <th scope="col">時間</th>
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
                <td>{row.timePoint ? timePointLabel(row.timePoint, draft.time.unit) : "—"}</td>
                {categories.map((category, columnIndex) => (
                  <td key={category.id}>
                    <input
                      aria-label={`${row.conditionLabel}${rowTimeQualifier(row, draft.time.unit)}の${category.label}数`}
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
        const value = nullableNumber(token);
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
            <th scope="col">時間</th>
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
                <td>{row.timePoint ? timePointLabel(row.timePoint, draft.time.unit) : "—"}</td>
                {editableFields.map((field, columnIndex) => (
                  <td key={field}>
                    <input
                      aria-label={`${row.conditionLabel}${rowTimeQualifier(row, draft.time.unit)}の${fieldLabel(field)}`}
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
                        const value = nullableNumber(event.currentTarget.value);
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
        細胞やROIは表示用の観測値です。解析に使う実験単位は別に扱います。
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
  return (
    <section className="experiment-workspace-panel" aria-labelledby={`${experiment.id}-heading`}>
      <div className="experiment-workspace-panel-heading">
        <h2 id={`${experiment.id}-heading`}>データ入力</h2>
        <div className="experiment-workspace-session-actions">
          <span className="experiment-workspace-session-badge">
            {draft.conditionAssignment.kind === "matched"
              ? `対応する${draft.conditionAssignment.unitLabel}`
              : "独立したセッション"}
          </span>
          {canRemove ? (
            <button
              className="experiment-workspace-remove-session"
              type="button"
              aria-label={`${experiment.label}を削除`}
              onClick={onRemove}
            >
              実験回を削除
            </button>
          ) : null}
        </div>
      </div>
      <details className="experiment-workspace-session-details">
        <summary>実験情報（{experiment.date || "日付未入力"}）</summary>
        <p className="experiment-workspace-session-note">
          {draft.conditionAssignment.kind === "matched"
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
  initialProject,
  onBack,
  analysisRunner = defaultAnalysisRunner,
  saveProject,
  onReuseDesign,
  onSaveFavorite,
  favoriteGraphDefaults = [],
}: ExperimentWorkspaceProps) {
  const [draft, setDraft] = useState<ExperimentSetDraft>(initialDraft);
  const [cells, setCells] = useState<ExperimentCellMap>(() => ({
    ...createCellsForDraft(initialDraft),
    ...initialCells,
  }));
  const [activeTab, setActiveTab] = useState<WorkspaceTab>("overview");
  const [selectedCellKey, setSelectedCellKey] = useState<string | null>(null);
  const [sourceNotes, setSourceNotes] = useState<Record<string, string>>({});
  const [showGraph, setShowGraph] = useState(false);
  const [graphWorkspaceMode, setGraphWorkspaceMode] = useState<"graph" | "statistics">("graph");
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
  const [saveStatus, setSaveStatus] = useState<"idle" | "saving" | "saved" | "error">("idle");
  const [saveMessage, setSaveMessage] = useState<string | null>(null);
  const [analysisInvalidationMessage, setAnalysisInvalidationMessage] = useState<string | null>(
    null,
  );
  const [benchmarkPilotLoadMessage, setBenchmarkPilotLoadMessage] = useState<string | null>(null);
  const benchmarkRun = useBenchmarkRun();
  const benchmarkPilot = BENCHMARK_PILOT_CASES.find(
    ({ caseId }) => caseId === benchmarkRun.identity?.caseId,
  );
  const benchmarkPilotLoad = useMemo(
    () => (benchmarkPilot ? mapBenchmarkPilotMeasurements(benchmarkPilot, draft) : null),
    [benchmarkPilot, draft],
  );
  const scientificSourceSnapshot = JSON.stringify({ draft, cells });
  const previousScientificSourceRef = useRef(scientificSourceSnapshot);
  const currentSnapshot = JSON.stringify({ draft, cells, graphs });
  const savedSnapshotRef = useRef(initialProject ? currentSnapshot : "");
  const graphWorkspaceRef = useRef<HTMLDivElement | null>(null);
  const focusCreatedGraphRef = useRef(false);
  const isDirty = currentSnapshot !== savedSnapshotRef.current;

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
    const nextIndex =
      draft.experiments.reduce((maximum, experiment) => {
        const match = experiment.id.match(/^experiment\.(\d+)$/);
        return Math.max(maximum, match ? Number(match[1]) : 0);
      }, 0) + 1;
    const nextExperiment = createExperimentSession(nextIndex);
    setDraft((previous) => ({
      ...previous,
      experiments: [...previous.experiments, nextExperiment],
    }));
    setCells((previous) => ({
      ...previous,
      ...createCellsForDraft({ ...draft, experiments: [nextExperiment] }),
    }));
    setActiveTab(`experiment:${nextExperiment.id}`);
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
        `${experiment.label}に入力済みの測定値があります。この実験回と入力値を削除しますか？`,
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
    const favoriteDefault = favoriteGraphDefaults.find(
      (candidate) => candidate.graphType === graphType,
    );
    const graph: WorkspaceGraphState = {
      id: `graph.${nextIndex}`,
      displayName: `グラフ ${nextIndex}`,
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
      layers: initialLayers,
      appearance: favoriteDefault?.appearance ?? {
        errorBar: "sd",
        palette: "single",
        pointSize: 6,
        axisLineWidth: 1.4,
        hierarchicalLabels: true,
        jitter: 12,
        fontFamily: "arial",
        graphTitleFontSize: 18,
        axisTitleFontSize: 17,
        tickFontSize: 15,
        hierarchyFontSize: 15,
        legendFontSize: 15,
        legendPosition: "hidden",
        seriesColors: {},
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
    setActiveGraphId(graph.id);
    setGraphCreateMessage(`${graph.displayName}を作成しました。`);
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
    const label = graphRenameDraft.trim() || "名称未設定";
    setGraphs((current) =>
      current.map((graph) =>
        graph.id === graphId ? { ...graph, displayName: label || "名称未設定" } : graph,
      ),
    );
    setRenamingGraphId(null);
  };

  const cancelGraphRename = () => {
    setRenamingGraphId(null);
    setGraphRenameDraft("");
  };

  const handleSave = useCallback(
    async (saveAs = false) => {
      if (!saveProject) return;
      setSaveStatus("saving");
      setSaveMessage(null);
      try {
        const state = createExperimentWorkspaceProject({
          draft,
          cells,
          graphs,
          existingState: savedProject?.state,
        });
        const saved = await saveProject(state, saveAs ? undefined : savedProject?.target);
        if (!saved) {
          setSaveStatus("idle");
          return;
        }
        setSavedProject(saved);
        savedSnapshotRef.current = currentSnapshot;
        setSaveStatus("saved");
        setSaveMessage("プロジェクトを保存しました。次回もこの入力画面で再編集できます。");
      } catch (error) {
        setSaveStatus("error");
        setSaveMessage(actionErrorMessage(error, "プロジェクトを保存できませんでした。"));
      }
    },
    [cells, currentSnapshot, draft, graphs, saveProject, savedProject],
  );
  const handleSaveRef = useRef(handleSave);
  useLayoutEffect(() => {
    handleSaveRef.current = handleSave;
  }, [handleSave]);

  useEffect(() => {
    const handleShortcut = (event: globalThis.KeyboardEvent) => {
      if (!(event.metaKey || event.ctrlKey) || event.key.toLowerCase() !== "s") return;
      event.preventDefault();
      void handleSaveRef.current(event.shiftKey);
    };
    window.addEventListener("keydown", handleShortcut);
    return () => window.removeEventListener("keydown", handleShortcut);
  }, []);

  useEffect(() => {
    if (!isTauri()) return;
    let disposed = false;
    let unlisten: UnlistenFn | undefined;
    void listen<boolean>("project-save-request", (event) => {
      void handleSave(event.payload);
    }).then((nextUnlisten) => {
      if (disposed) nextUnlisten();
      else unlisten = nextUnlisten;
    });
    return () => {
      disposed = true;
      unlisten?.();
    };
  }, [handleSave]);

  return (
    <div className="experiment-workspace">
      <header className="experiment-workspace-header">
        <button className="experiment-workspace-back" type="button" onClick={onBack}>
          ← 戻る
        </button>
        <div>
          <p className="experiment-workspace-eyebrow">実験ワークスペース</p>
          <h1>{draft.name}</h1>
          <p className="experiment-workspace-context">
            {draft.context === "cell_culture"
              ? "細胞・培養"
              : draft.context === "microscopy_imaging"
                ? "顕微鏡・画像解析"
                : "実験データ"}{" "}
            · {draft.readouts.map(({ label }) => label).join(" / ")}
          </p>
        </div>
      </header>

      {draft.dataOrigin === "synthetic_demo" ? (
        <div className="experiment-workspace-demo-banner" role="status">
          <strong>ブラウザレビュー用データ</strong>
          <span>
            合成fixtureまたは一時入力だけを扱います。実測・未発表データを入力せず、正式な研究データとして使用しないでください。
          </span>
        </div>
      ) : null}

      {benchmarkPilot && benchmarkPilotLoad && activeTab !== "overview" && !showGraph ? (
        <section className="benchmark-pilot-loader" aria-label="Benchmark Pilot合成値">
          <div>
            <strong>{benchmarkPilot.title}</strong>
            <span>{benchmarkPilotLoad.reason}</span>
          </div>
          <button
            type="button"
            disabled={!benchmarkPilotLoad.compatible}
            onClick={() => {
              if (!benchmarkPilotLoad.compatible) return;
              setCells((current) => ({ ...current, ...benchmarkPilotLoad.cells }));
              setDraft((current) => ({ ...current, dataOrigin: "synthetic_demo" }));
              setBenchmarkPilotLoadMessage("合成値をすべての実験タブへ入力しました。");
              recordBenchmarkEvent("benchmark_pilot_data_loaded", {
                caseId: benchmarkPilot.caseId,
                mappedCells: Object.keys(benchmarkPilotLoad.cells).length,
              });
            }}
          >
            このPilotの合成値を一括入力
          </button>
          {benchmarkPilotLoadMessage ? (
            <span role="status">{benchmarkPilotLoadMessage}</span>
          ) : null}
        </section>
      ) : null}

      <nav className="experiment-workspace-project-nav" aria-label="プロジェクト内の移動">
        <details className="experiment-workspace-file-menu">
          <summary>ファイル</summary>
          <div>
            <button
              type="button"
              disabled={!saveProject || saveStatus === "saving"}
              onClick={() => void handleSave(false)}
            >
              保存 <kbd>Ctrl/⌘S</kbd>
            </button>
            <button
              type="button"
              disabled={!saveProject || saveStatus === "saving"}
              onClick={() => void handleSave(true)}
            >
              名前を付けて保存 <kbd>Shift+Ctrl/⌘S</kbd>
            </button>
            {onReuseDesign ? (
              <button type="button" onClick={() => onReuseDesign(draft)}>
                設計だけを新しいprojectに再利用
              </button>
            ) : null}
            {onSaveFavorite ? (
              <button type="button" onClick={() => onSaveFavorite(draft, graphs)}>
                この設計をお気に入りに保存
              </button>
            ) : null}
          </div>
        </details>
        <button
          className={!showGraph ? "is-active" : ""}
          type="button"
          aria-current={!showGraph ? "page" : undefined}
          onClick={() => setShowGraph(false)}
        >
          データ
        </button>
        <button
          className={showGraph && graphWorkspaceMode === "graph" ? "is-active" : ""}
          type="button"
          aria-current={showGraph && graphWorkspaceMode === "graph" ? "page" : undefined}
          disabled={graphs.length === 0}
          onClick={openExistingGraphs}
        >
          グラフ{graphs.length > 0 ? ` (${graphs.length})` : ""}
        </button>
        <button
          className={showGraph && graphWorkspaceMode === "statistics" ? "is-active" : ""}
          type="button"
          aria-current={showGraph && graphWorkspaceMode === "statistics" ? "page" : undefined}
          disabled={graphs.length === 0}
          onClick={openStatistics}
        >
          統計
        </button>
        <button
          className="experiment-workspace-project-nav-create"
          type="button"
          onClick={openGraph}
        >
          ＋ グラフを作成
        </button>
        <button
          className="experiment-workspace-project-nav-save"
          type="button"
          aria-label={saveStatus === "saving" ? "保存中" : "プロジェクトを保存"}
          title="保存（⌘S / Ctrl+S）"
          disabled={!saveProject || saveStatus === "saving"}
          onClick={() => void handleSave(false)}
        >
          {saveStatus === "saving" ? "…" : "保存"}
        </button>
        <span
          className={`experiment-workspace-dirty-state ${isDirty ? "is-dirty" : ""}`}
          aria-label="保存状態"
        >
          {isDirty ? "未保存" : "保存済み"}
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
            className="experiment-workspace-graph-choice"
            role="dialog"
            aria-modal="true"
            aria-labelledby="graph-choice-heading"
          >
            <div className="experiment-workspace-graph-choice-heading">
              <div>
                <p className="experiment-workspace-eyebrow">新しいグラフ</p>
                <h2 id="graph-choice-heading">グラフの基本形を選ぶ</h2>
                <p>基本形を選んだ後も、点・箱・誤差線などのレイヤーを追加できます。</p>
              </div>
              <button type="button" onClick={() => setShowGraphTypeChoice(false)}>
                キャンセル
              </button>
            </div>
            {draft.readouts.length > 1 ? (
              <label className="experiment-workspace-graph-source">
                <span>表示する測定項目</span>
                <select
                  aria-label="表示する測定項目"
                  value={selectedSourceReadout?.id ?? ""}
                  onChange={(event) => selectGraphSource(event.currentTarget.value)}
                >
                  {draft.readouts.map((readout) => (
                    <option key={readout.id} value={readout.id}>
                      {readout.label}
                    </option>
                  ))}
                </select>
                <small>この選択は新しいグラフにだけ保存されます。</small>
              </label>
            ) : null}
            {draft.time.sampling === "longitudinal" && draft.time.points.length > 1 ? (
              <fieldset className="experiment-workspace-layer-builder">
                <legend>グラフのデータソース</legend>
                <label>
                  <input
                    type="radio"
                    name="graph-source-mode"
                    checked={selectedCreateSourceMode === "raw_readout"}
                    onChange={() => selectCreateSourceMode("raw_readout")}
                  />
                  元の時系列（全時間を保持）
                </label>
                <label>
                  <input
                    type="radio"
                    name="graph-source-mode"
                    checked={selectedCreateSourceMode === "derived_metric"}
                    onChange={() => selectCreateSourceMode("derived_metric")}
                  />
                  各生物学的単位から求めた派生値を別グラフにする
                </label>
                {selectedCreateSourceMode === "derived_metric" ? (
                  <>
                    <label className="experiment-graph-field">
                      <span>派生値</span>
                      <select
                        aria-label="新しいグラフの派生値"
                        value={selectedCreateMetric.kind}
                        onChange={(event) =>
                          setSelectedCreateMetric({
                            kind: event.currentTarget.value as TimeAnalysisPlan["kind"],
                          })
                        }
                      >
                        <option value="auc">AUC（台形法）</option>
                        <option value="endpoint">最後の時点</option>
                        <option value="maximum">最大値</option>
                        <option value="minimum">最小値</option>
                        <option value="change_from_baseline">baselineからの変化量</option>
                        <option value="f_over_f0">F/F0</option>
                      </select>
                    </label>
                    {selectedCreateMetric.kind === "auc" ? (
                      <>
                        <p className="experiment-graph-help">
                          AUCは時間曲線の下の面積です。選んだ範囲の応答の大きさと持続時間を1つの値にまとめます。単位は「測定値
                          ×{draft.time.unit}」で、時間経過の形や開始値の違いは別に確認が必要です。
                        </p>
                        <div className="experiment-graph-field-grid">
                          <label className="experiment-graph-field">
                            <span>AUC windowの開始</span>
                            <select
                              aria-label="新しいAUC windowの開始"
                              value={selectedCreateMetric.windowStart ?? ""}
                              onChange={(event) => {
                                const value = event.currentTarget.value;
                                setSelectedCreateMetric((current) => ({
                                  ...current,
                                  windowStart: value === "" ? undefined : Number(value),
                                }));
                              }}
                            >
                              <option value="">最初の時点</option>
                              {draft.time.points.map((point) => (
                                <option key={point.id} value={point.value}>
                                  {point.value} {draft.time.unit}
                                </option>
                              ))}
                            </select>
                          </label>
                          <label className="experiment-graph-field">
                            <span>AUC windowの終了</span>
                            <select
                              aria-label="新しいAUC windowの終了"
                              value={selectedCreateMetric.windowEnd ?? ""}
                              onChange={(event) => {
                                const value = event.currentTarget.value;
                                setSelectedCreateMetric((current) => ({
                                  ...current,
                                  windowEnd: value === "" ? undefined : Number(value),
                                }));
                              }}
                            >
                              <option value="">最後の時点</option>
                              {draft.time.points.map((point) => (
                                <option key={point.id} value={point.value}>
                                  {point.value} {draft.time.unit}
                                </option>
                              ))}
                            </select>
                          </label>
                        </div>
                        {!createMetricWindowIsValid ? (
                          <small role="alert">開始時点は終了時点以前にしてください。</small>
                        ) : null}
                      </>
                    ) : null}
                  </>
                ) : null}
              </fieldset>
            ) : null}
            <div className="experiment-workspace-graph-choice-recommended">
              <span>よい開始点</span>
              {recommendedGraphTypes.map((graphType) => (
                <button
                  className={
                    graphTypeSelectionActive && selectedGraphType === graphType ? "is-selected" : ""
                  }
                  key={graphType}
                  type="button"
                  aria-pressed={graphTypeSelectionActive && selectedGraphType === graphType}
                  aria-label={`${graphTypeChoiceLabel(graphType)}を選択（おすすめ）`}
                  onClick={() => selectGraphType(graphType)}
                >
                  <GraphTypeThumbnail type={graphType} />
                  <span>
                    <strong>
                      {graphType === "line"
                        ? "時間変化を見る"
                        : graphType === "scatter"
                          ? "XとYの関係を見る"
                          : graphType === "stacked_100"
                            ? "全体に占めるカテゴリ構成を見る"
                            : graphType === "category_percentage"
                              ? "カテゴリごとの割合を見る"
                              : graphType === "violin"
                                ? "各条件・時点の分布を見る"
                                : graphType === "paired_dot"
                                  ? "同じ単位の変化を見る"
                                  : "実験単位ごとの値を見る"}
                    </strong>
                    <small>データ構造に合う初期表示。選択は後から変更できます。</small>
                  </span>
                </button>
              ))}
            </div>
            <section
              className="experiment-workspace-current-preview"
              aria-labelledby="current-preview-heading"
            >
              <div>
                <p className="experiment-workspace-eyebrow">現在のデータで確認</p>
                <h3 id="current-preview-heading">作成後の初期表示</h3>
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
                  グラフ形式を選ぶと、現在のデータでプレビューします。
                </p>
              )}
              <p className="experiment-workspace-current-preview-note">
                現在の選択とデータを使ったプレビューです。詳細な見た目は作成後に変更できます。
              </p>
              {selectedGraphType === "box" && draft.experiments.length <= 3 ? (
                <p className="experiment-workspace-box-guidance" role="note">
                  biological replicateが{draft.experiments.length}
                  点のため、Boxによる分布要約の情報量は限定的です。Dotを推奨します。
                </p>
              ) : null}
            </section>
            <div className="experiment-workspace-graph-type-grid" aria-label="その他のグラフ形式">
              {(
                [
                  ["dot", "Dot"],
                  ["box", "Box"],
                  ["violin", "Violin"],
                  ["bar", "Bar"],
                  ["line", "Line / Time course"],
                  ["paired_dot", "対応を線で結ぶ"],
                  ["scatter", "Scatter"],
                  ["stacked", "Stacked count"],
                  ["stacked_100", "100% stacked"],
                  ["category_percentage", "Category percentage"],
                ] as const
              )
                .filter(([value]) => {
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
                .map(([value, label]) => (
                  <button
                    className={
                      graphTypeSelectionActive && selectedGraphType === value ? "is-selected" : ""
                    }
                    key={value}
                    type="button"
                    aria-label={`${label}を選択`}
                    aria-pressed={graphTypeSelectionActive && selectedGraphType === value}
                    disabled={
                      (value === "paired_dot" && !canConnectUnits) ||
                      (value === "scatter" && draft.analysisIntent.kind !== "correlation") ||
                      (value !== "scatter" && draft.analysisIntent.kind === "correlation")
                    }
                    onClick={() => selectGraphType(value)}
                  >
                    <GraphTypeThumbnail type={value} />
                    <strong>{label}</strong>
                  </button>
                ))}
              {draft.analysisIntent.kind !== "correlation" ? (
                <small id="scatter-disabled-reason">
                  Scatterは「同じ試料のXとYの関係を見る」設計で利用できます
                </small>
              ) : null}
            </div>
            {!canConnectUnits ? (
              <p className="experiment-workspace-graph-type-guidance">
                同じ単位の対応情報がある設計で利用できます
              </p>
            ) : null}
            <section className="experiment-workspace-layer-builder" aria-label="初期レイヤー">
              <button
                className="secondary-button"
                type="button"
                aria-expanded={showLayerBuilder}
                onClick={() => setShowLayerBuilder((current) => !current)}
              >
                {showLayerBuilder
                  ? "カスタムグラフ設定を閉じる"
                  : "＋ カスタムグラフ（レイヤーから組み立てる）"}
              </button>
              {showLayerBuilder ? (
                <fieldset>
                  <legend>作成時に表示するもの</legend>
                  {(
                    [
                      ["raw", "細胞・ROIなどの測定値"],
                      ["experiment", "実験単位ごとの点"],
                      ["overall", "平均"],
                      ["errorBar", "誤差線（初期値 SD）"],
                      ["box", "箱ひげ"],
                      ["violin", "分布（Violin）"],
                      ["connectingLine", "同じ単位を結ぶ線"],
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
              <button type="button" onClick={() => setShowGraphTypeChoice(false)}>
                キャンセル
              </button>
              <button
                className="is-primary"
                type="button"
                disabled={!graphTypeSelectionActive || !createMetricWindowIsValid}
                onClick={() => createGraph(selectedGraphType, selectedInitialLayers)}
              >
                このグラフを作成
              </button>
            </div>
          </section>
        </div>
      ) : null}

      {!showGraph ? (
        <nav className="experiment-workspace-tabs" aria-label="実験の表示切り替え">
          <button
            className={`experiment-workspace-tab ${activeTab === "overview" ? "is-active" : ""}`}
            type="button"
            aria-selected={activeTab === "overview"}
            role="tab"
            onClick={() => setActiveTab("overview")}
          >
            Overview
          </button>
          {draft.experiments.map((experiment) => {
            const tabId: WorkspaceTab = `experiment:${experiment.id}`;
            return (
              <button
                className={`experiment-workspace-tab ${activeTab === tabId ? "is-active" : ""}`}
                type="button"
                role="tab"
                aria-selected={activeTab === tabId}
                key={experiment.id}
                onClick={() => setActiveTab(tabId)}
              >
                {experiment.label}
              </button>
            );
          })}
          <button
            className="experiment-workspace-tab experiment-workspace-tab--add"
            type="button"
            onClick={addExperiment}
          >
            ＋ 実験
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
          <nav className="experiment-workspace-graph-tabs" aria-label="作成したグラフ">
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
                      aria-label="グラフ名"
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
                      aria-label={`${graph.displayName}の名前を変更`}
                      title="グラフ名を変更"
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
              <ExperimentGraphWorkbench
                draft={draft}
                cells={cells}
                workspaceMode={graphWorkspaceMode}
                analysisRunner={analysisRunner}
                initialState={graph}
                onStateChange={(state) =>
                  setGraphs((current) =>
                    current.map((candidate) =>
                      candidate.id === graph.id ? { ...candidate, ...state } : candidate,
                    ),
                  )
                }
                onClose={() => setShowGraph(false)}
              />
            </div>
          ))}
        </div>
      ) : null}
      <div className="experiment-workspace-body" hidden={showGraph}>
        <main className="experiment-workspace-main">
          {activeTab === "overview" ? (
            <OverviewPanel draft={draft} cells={cells} />
          ) : (
            draft.experiments.map((experiment) => {
              if (activeTab !== `experiment:${experiment.id}`) return null;
              return (
                <ExperimentPanel
                  draft={draft}
                  experiment={experiment}
                  cells={cells}
                  key={experiment.id}
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

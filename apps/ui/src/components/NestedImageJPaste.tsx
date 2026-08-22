import { useEffect, useMemo, useState } from "react";

import {
  parseTabularClipboard,
  summarizeNestedScalarObservations,
  type IndependentMultiConditionDataSheet,
  type ReplicateSummary,
  type TwoConditionDataSheet,
} from "@lsaa/data-sheet";
import type { Observation, TransformationSpec, UnitInstance } from "@lsaa/domain";

type NestedPasteSource = {
  columnLabel: string;
  rowNumbers: number[];
};

export type NestedImageJPastePayload = Readonly<{
  /** The condition to which the summarized values will be attached. */
  conditionId: string;
  outcomeId: string;
  rawRevisionId: string;
  method: "mean" | "median";
  observations: Observation[];
  unitInstances: UnitInstance[];
  summaries: ReplicateSummary[];
  transformation: TransformationSpec;
  source: NestedPasteSource;
}>;

type NestedImageJPasteProps = {
  sheet: TwoConditionDataSheet | IndependentMultiConditionDataSheet;
  rawRevisionId: string;
  onApply: (payload: NestedImageJPastePayload) => void;
};

type ReplicateTarget = Readonly<{
  id: string;
  label: string;
  displayLabel: string;
  experimentDate: string;
}>;

type ValueRow = Readonly<{
  rowNumber: number;
  value: number;
}>;

function replicateTargets(
  sheet: TwoConditionDataSheet | IndependentMultiConditionDataSheet,
  conditionId: string,
): ReplicateTarget[] {
  const conditionIndex = sheet.conditions.findIndex((condition) => condition.id === conditionId);
  if (conditionIndex < 0) return [];
  if (sheet.relationship === "independent") {
    return sheet.columns[conditionIndex].entries.map((entry, index) => ({
      id: entry.experimentalUnitId,
      label: entry.label || `実験単位 ${index + 1}`,
      displayLabel: `実験単位 ${index + 1}`,
      experimentDate: entry.experimentDate,
    }));
  }
  return sheet.rows.map((row, index) => ({
    id: row.values[conditionIndex].experimentalUnitId,
    label: row.label || `実験単位 ${index + 1}`,
    displayLabel: `実験単位 ${index + 1}`,
    experimentDate: row.experimentDate,
  }));
}

function createPayload({
  sheet,
  conditionId,
  rawRevisionId,
  method,
  values,
  assignments,
  columnLabel,
}: {
  sheet: TwoConditionDataSheet | IndependentMultiConditionDataSheet;
  conditionId: string;
  rawRevisionId: string;
  method: "mean" | "median";
  values: ValueRow[];
  assignments: Array<number | null>;
  columnLabel: string;
}): { payload: NestedImageJPastePayload } | { error: string } {
  const targets = replicateTargets(sheet, conditionId);
  if (targets.length === 0) return { error: "貼り付け先の実験単位がありません。" };
  if (values.length === 0) return { error: "ImageJの数値行を貼り付けてください。" };
  if (assignments.length !== values.length || assignments.some((index) => index === null)) {
    return { error: "すべてのImageJ行を、所属する実験単位へ割り当ててください。" };
  }
  const assigned = assignments as number[];
  if (assigned.some((index) => index < 0 || index >= targets.length)) {
    return { error: "実験単位の割り当てが不正です。" };
  }
  const counts = targets.map((_, index) => assigned.filter((target) => target === index).length);
  if (counts.some((count) => count === 0)) {
    return { error: "各実験単位に少なくとも1行を割り当ててください。" };
  }

  const unitInstances: UnitInstance[] = targets.map((target) => ({
    id: target.id,
    levelId: sheet.experimentalUnitLevelId,
    parentUnitId: null,
    label: target.label,
    // Match the canonical data-sheet unit definition so a caller can merge
    // these payload units into an existing project without redefining a dish.
    metadata: {},
  }));
  const observations: Observation[] = values.map((row, index) => {
    const target = targets[assigned[index]];
    const childId = `unit.imagej-row.${conditionId}.${row.rowNumber}`;
    unitInstances.push({
      id: childId,
      levelId: "unit.imagej-row",
      parentUnitId: target.id,
      label: `ImageJ行 ${row.rowNumber}`,
      metadata: { sourceRow: row.rowNumber },
    });
    return {
      id: `observation.imagej-row.${conditionId}.${row.rowNumber}`,
      rawRevisionId,
      unitInstanceId: childId,
      conditionId,
      outcomeId: sheet.outcomeId,
      measurement: { kind: "scalar", value: row.value },
      experimentDate: target.experimentDate,
      sourceLocation: `ImageJ:${columnLabel}:row:${row.rowNumber}`,
    };
  });

  let result: ReturnType<typeof summarizeNestedScalarObservations>;
  try {
    result = summarizeNestedScalarObservations({
      transformationId: `transformation.d10.replicate-summary.${rawRevisionId}.${conditionId}`,
      rawRevisionId,
      outcomeId: sheet.outcomeId,
      experimentalUnitLevelId: sheet.experimentalUnitLevelId,
      method,
      observations,
      unitInstances,
    });
  } catch (error) {
    return {
      error: error instanceof Error ? error.message : "ImageJ行を要約できませんでした。",
    };
  }
  const summaryByUnit = new Map(
    result.summaries.map((summary) => [summary.experimentalUnitId, summary]),
  );
  const summaries = targets
    .map((target) => summaryByUnit.get(target.id))
    .filter((summary): summary is ReplicateSummary => summary !== undefined);
  if (summaries.length !== targets.length) {
    return { error: "要約結果に実験単位が揃っていません。" };
  }
  const sourceMap = summaries
    .map((summary, index) => {
      const rowsForSummary = summary.sourceObservationIds
        .map(
          (observationId) =>
            observations.find((observation) => observation.id === observationId)?.sourceLocation,
        )
        .filter((location): location is string => Boolean(location));
      return `反復${index + 1}=${rowsForSummary.join("、")}`;
    })
    .join("; ");

  return {
    payload: {
      conditionId,
      outcomeId: sheet.outcomeId,
      rawRevisionId,
      method,
      observations,
      unitInstances,
      summaries,
      transformation: result.transformation,
      source: {
        columnLabel: `D10 ${method === "mean" ? "平均" : "中央値"} / ${columnLabel} / ${sourceMap}`,
        rowNumbers: summaries.map((_, index) => index + 1),
      },
    },
  };
}

/**
 * Progressive-disclosure input for ImageJ cell/ROI rows.
 *
 * Every row must be assigned to a declared biological replicate before the
 * summary can be applied. The component returns raw observations, nested unit
 * instances, replicate summaries, and the lineage transformation together;
 * callers can persist the payload as a new raw revision without losing rows.
 */
export function NestedImageJPaste({ sheet, rawRevisionId, onApply }: NestedImageJPasteProps) {
  const [open, setOpen] = useState(false);
  const [text, setText] = useState("");
  const [conditionId, setConditionId] = useState(sheet.conditions[0].id);
  const [method, setMethod] = useState<"mean" | "median">("mean");
  const [columnIndex, setColumnIndex] = useState<number | null>(null);
  const [assignments, setAssignments] = useState<Array<number | null>>([]);
  const [error, setError] = useState<string | null>(null);

  const parsed = useMemo(() => parseTabularClipboard(text), [text]);
  const selectedColumn = parsed.columns.find((column) => column.index === columnIndex) ?? null;
  const valueRows = useMemo<ValueRow[]>(
    () =>
      selectedColumn
        ? selectedColumn.valueRowNumbers.map((rowNumber, index) => ({
            rowNumber,
            value: selectedColumn.values[index],
          }))
        : [],
    [selectedColumn],
  );
  const valueSignature = selectedColumn
    ? `${selectedColumn.index}:${selectedColumn.valueRowNumbers.join(",")}:${selectedColumn.values.join(",")}`
    : "none";
  useEffect(() => {
    setColumnIndex(parsed.recommendedColumnIndex);
  }, [parsed.recommendedColumnIndex]);
  useEffect(() => {
    setAssignments(valueRows.map(() => null));
    setError(null);
  }, [valueSignature]);
  useEffect(() => {
    if (!sheet.conditions.some((condition) => condition.id === conditionId)) {
      setConditionId(sheet.conditions[0].id);
    }
  }, [conditionId, sheet.conditions]);

  const targets = replicateTargets(sheet, conditionId);
  const counts = targets.map(
    (_, targetIndex) => assignments.filter((assignment) => assignment === targetIndex).length,
  );
  const unassignedCount = assignments.filter((assignment) => assignment === null).length;
  const assignUnassignedTo = (targetIndex: number) => {
    setAssignments((current) =>
      current.map((assignment) => (assignment === null ? targetIndex : assignment)),
    );
    setError(null);
  };
  const distributeUnassigned = () => {
    if (targets.length === 0) return;
    setAssignments((current) => {
      const unassigned = current.filter((assignment) => assignment === null).length;
      if (unassigned === 0) return current;
      const base = Math.floor(unassigned / targets.length);
      const remainder = unassigned % targets.length;
      const sequence = targets.flatMap((_, targetIndex) =>
        Array.from({ length: base + (targetIndex < remainder ? 1 : 0) }, () => targetIndex),
      );
      let sequenceIndex = 0;
      return current.map((assignment) => {
        if (assignment !== null) return assignment;
        const next = sequence[sequenceIndex];
        sequenceIndex += 1;
        return next ?? null;
      });
    });
    setError(null);
  };
  const clearAssignments = () => {
    setAssignments((current) => current.map(() => null));
    setError(null);
  };
  const result = useMemo(
    () =>
      selectedColumn && valueRows.length > 0
        ? createPayload({
            sheet,
            conditionId,
            rawRevisionId,
            method,
            values: valueRows,
            assignments,
            columnLabel: selectedColumn.label || `列 ${selectedColumn.index + 1}`,
          })
        : { error: "ImageJの結果表から数値列を選択してください。" },
    [assignments, conditionId, method, rawRevisionId, selectedColumn, sheet, valueRows],
  );
  const canApply =
    Boolean("payload" in result) &&
    selectedColumn?.invalidRowNumbers.length === 0 &&
    selectedColumn?.emptyRowNumbers.length === 0;

  const apply = () => {
    if (!canApply || !("payload" in result)) return;
    setError(null);
    try {
      onApply(result.payload);
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "要約値を適用できませんでした。");
    }
  };

  return (
    <section className="nested-imagej-card" aria-labelledby="nested-imagej-heading">
      <button
        className="nested-imagej-toggle"
        type="button"
        aria-expanded={open}
        aria-controls="nested-imagej-panel"
        onClick={() => setOpen((current) => !current)}
      >
        <span>
          <span className="overline">細胞・ROIの単位別まとめ</span>
          <strong id="nested-imagej-heading" aria-label="ImageJの細胞・ROI行を実験単位ごとに要約">
            ImageJの細胞・ROI行を実験単位ごとにまとめる
          </strong>
        </span>
        <span aria-hidden="true">{open ? "−" : "＋"}</span>
      </button>
      {open && (
        <div id="nested-imagej-panel" className="nested-imagej-panel">
          <p className="nested-imagej-warning" role="note">
            同じディッシュや試料から得た細胞・ROIの行は、そのまま別の実験単位として扱いません。細胞やROIは、統計上の生物学的nではありません。各行を対応するディッシュ・試料などの実験単位へ割り当て、単位ごとに平均または中央値へまとめます。まとめた値を解析に使います。
          </p>
          <div className="nested-imagej-controls">
            <label>
              <span>貼り付け先の条件</span>
              <select
                aria-label="D10貼り付け先の条件"
                value={conditionId}
                onChange={(event) => setConditionId(event.target.value)}
              >
                {sheet.conditions.map((condition) => (
                  <option key={condition.id} value={condition.id}>
                    {condition.label}
                  </option>
                ))}
              </select>
            </label>
            <label>
              <span>単位内のまとめ方</span>
              <select
                aria-label="反復内の要約方法"
                value={method}
                onChange={(event) => setMethod(event.target.value as "mean" | "median")}
              >
                <option value="mean">平均</option>
                <option value="median">中央値</option>
              </select>
            </label>
          </div>
          <label className="nested-imagej-field">
            <span>ImageJの結果表（タブ区切り）</span>
            <textarea
              aria-label="ImageJの細胞・ROI行を貼り付け"
              value={text}
              onChange={(event) => setText(event.target.value)}
              placeholder="Area\tMean\n120\t10.2\n135\t11.4"
              rows={5}
            />
          </label>
          {parsed.columns.length > 0 && (
            <label className="nested-imagej-field">
              <span>まとめる数値列</span>
              <select
                aria-label="まとめる数値列"
                value={columnIndex ?? ""}
                onChange={(event) =>
                  setColumnIndex(event.target.value ? Number(event.target.value) : null)
                }
              >
                <option value="" disabled>
                  列を選択
                </option>
                {parsed.columns.map((column) => (
                  <option key={column.index} value={column.index}>
                    {column.label || `列 ${column.index + 1}`}
                  </option>
                ))}
              </select>
            </label>
          )}
          {selectedColumn &&
            (selectedColumn.invalidRowNumbers.length > 0 ||
              selectedColumn.emptyRowNumbers.length > 0) && (
              <p className="nested-imagej-error" role="alert">
                選択列に空欄または非数値行があります。ImageJの結果表を修正してから割り当ててください。
              </p>
            )}
          {valueRows.length > 0 && (
            <div className="nested-imagej-assignment">
              <div className="nested-imagej-assignment-heading">
                <div className="nested-imagej-assignment-title">
                  <strong>各ImageJ行の実験単位を指定</strong>
                  <span>
                    {valueRows.length}行（未割当 {unassignedCount}行）
                  </span>
                </div>
                <div className="nested-imagej-assignment-actions">
                  <button
                    type="button"
                    className="nested-imagej-utility-button"
                    onClick={distributeUnassigned}
                    disabled={unassignedCount === 0 || targets.length === 0}
                  >
                    未割当行を均等に連続分割
                  </button>
                  <button
                    type="button"
                    className="nested-imagej-utility-button"
                    onClick={clearAssignments}
                    disabled={assignments.every((assignment) => assignment === null)}
                  >
                    全割当をクリア
                  </button>
                </div>
              </div>
              <div className="nested-imagej-target-actions" aria-label="反復への一括割当">
                {targets.map((target, targetIndex) => (
                  <button
                    key={target.id}
                    type="button"
                    className="nested-imagej-utility-button"
                    onClick={() => assignUnassignedTo(targetIndex)}
                    disabled={unassignedCount === 0}
                    aria-label={`未割当行をすべて${target.displayLabel}へ`}
                  >
                    未割当行をすべてここへ（{target.displayLabel}）
                  </button>
                ))}
              </div>
              <div className="nested-imagej-row-list">
                {valueRows.map((row, rowIndex) => (
                  <label key={`${row.rowNumber}-${rowIndex}`} className="nested-imagej-row">
                    <span>
                      行 {row.rowNumber}: {row.value}
                    </span>
                    <select
                      aria-label={`ImageJ行 ${row.rowNumber} の実験単位`}
                      value={assignments[rowIndex] ?? ""}
                      onChange={(event) => {
                        const next = [...assignments];
                        next[rowIndex] =
                          event.target.value === "" ? null : Number(event.target.value);
                        setAssignments(next);
                      }}
                    >
                      <option value="">所属を選択</option>
                      {targets.map((target, targetIndex) => (
                        <option key={target.id} value={targetIndex}>
                          {target.displayLabel}
                        </option>
                      ))}
                    </select>
                  </label>
                ))}
              </div>
              <p className="nested-imagej-counts" aria-live="polite">
                反復ごとの行数：
                {counts
                  .map(
                    (count, index) =>
                      `${targets[index]?.displayLabel ?? `反復${index + 1}`} ${count}行`,
                  )
                  .join(" ／ ")}
              </p>
            </div>
          )}
          {"payload" in result && (
            <div className="nested-imagej-summary" aria-live="polite">
              <strong>反復平均の確認</strong>
              <div className="nested-imagej-summary-grid">
                {result.payload.summaries.map((summary, index) => (
                  <span key={summary.experimentalUnitId}>
                    {targets[index]?.displayLabel ?? `反復 ${index + 1}`}：
                    {summary.value.toFixed(3)}（{summary.subsampleCount}行）
                  </span>
                ))}
              </div>
            </div>
          )}
          {!("payload" in result) && valueRows.length > 0 && (
            <p className="nested-imagej-error" role="alert">
              {result.error}
            </p>
          )}
          {error && (
            <p className="nested-imagej-error" role="alert">
              {error}
            </p>
          )}
          <button
            className="nested-imagej-apply"
            type="button"
            disabled={!canApply}
            onClick={apply}
          >
            要約値をデータシートへ適用
          </button>
        </div>
      )}
    </section>
  );
}

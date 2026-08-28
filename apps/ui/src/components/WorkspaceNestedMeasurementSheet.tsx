import { useEffect, useId, useMemo, useState } from "react";

import {
  cellIsNotPlanned,
  experimentCellKey,
  orderedAxisTitle,
  orderedAxisUnit,
  type ExperimentCellMap,
  type ExperimentSetDraft,
  type NestedContinuousCellDraft,
  type ReadoutDraft,
  type TimePointDraft,
} from "../app/experimentDraft";

import "./WorkspaceNestedMeasurementSheet.css";

export type WorkspaceDataViewMode = "compact" | "expanded";

type Props = Readonly<{
  draft: ExperimentSetDraft;
  cells: ExperimentCellMap;
  mode: WorkspaceDataViewMode;
  onModeChange: (mode: WorkspaceDataViewMode) => void;
  onCellChange: (cellKey: string, cell: NestedContinuousCellDraft) => void;
}>;

type CellCoordinate = Readonly<{
  key: string;
  experiment: ExperimentSetDraft["experiments"][number];
  condition: ExperimentSetDraft["conditions"][number];
  readout: ReadoutDraft;
  timePoint: TimePointDraft | null;
  cell: NestedContinuousCellDraft;
}>;

function timePointsFor(draft: ExperimentSetDraft): readonly (TimePointDraft | null)[] {
  return draft.time.points.length > 0 ? draft.time.points : [null];
}

function nestedCell(cell: ExperimentCellMap[string] | undefined): NestedContinuousCellDraft {
  return cell?.kind === "nested_continuous"
    ? cell
    : { kind: "nested_continuous", rawValues: [], source: "manual" };
}

function coordinatesFor(draft: ExperimentSetDraft, cells: ExperimentCellMap): CellCoordinate[] {
  const readouts = draft.readouts.filter(
    (readout) =>
      readout.shape === "nested_continuous" && readout.nestedInputMode !== "unit_summary",
  );
  return draft.experiments.flatMap((experiment) =>
    readouts.flatMap((readout) =>
      timePointsFor(draft).flatMap((timePoint) =>
        draft.conditions.map((condition) => {
          const key = experimentCellKey({
            experimentId: experiment.id,
            conditionId: condition.id,
            readoutId: readout.id,
            ...(timePoint ? { timePointId: timePoint.id } : {}),
          });
          return {
            key,
            experiment,
            condition,
            readout,
            timePoint,
            cell: nestedCell(cells[key]),
          };
        }),
      ),
    ),
  );
}

function compactEditability(
  coordinate: CellCoordinate,
): Readonly<{ editable: true }> | Readonly<{ editable: false; reason: string }> {
  if (coordinate.cell.observationUnitIds?.some((id) => id.trim())) {
    return {
      editable: false,
      reason: "Cell・ROIなどのIDがあるため、値の対応を守れる「すべての値」で編集します。",
    };
  }
  if (coordinate.cell.sourceLocations?.some((source) => source.trim())) {
    return {
      editable: false,
      reason: "行ごとの出典があるため、出典との対応を守れる「すべての値」で編集します。",
    };
  }
  return { editable: true };
}

function parseValues(text: string): readonly number[] | null {
  const tokens = text
    .replace(/\r\n?/g, "\n")
    .split(/[\n\t,、]/)
    .map((token) => token.trim())
    .filter(Boolean);
  if (tokens.some((token) => !Number.isFinite(Number(token)))) return null;
  return tokens.map(Number);
}

function axisLabel(draft: ExperimentSetDraft, point: TimePointDraft | null): string {
  if (!point) return "—";
  return `${point.value}${orderedAxisUnit(draft.time) ? ` ${orderedAxisUnit(draft.time)}` : ""}`;
}

function CompactValuesCell({
  coordinate,
  rowLabel,
  onChange,
}: Readonly<{
  coordinate: CellCoordinate;
  rowLabel: string;
  onChange: (cell: NestedContinuousCellDraft) => void;
}>) {
  const descriptionId = useId();
  const errorId = useId();
  const valuesText = coordinate.cell.rawValues.join("\n");
  const [text, setText] = useState(valuesText);
  const [message, setMessage] = useState<string | null>(null);
  const decision = compactEditability(coordinate);
  const notPlanned = cellIsNotPlanned(coordinate.cell);
  const disabledReason = notPlanned
    ? "この条件は測定予定なしとして設定されています。"
    : decision.editable
      ? null
      : decision.reason;

  useEffect(() => setText(valuesText), [valuesText]);

  const commit = () => {
    if (!decision.editable) return;
    const values = parseValues(text);
    if (!values) {
      setMessage("数値を1行に1つ入力してください。入力内容は消していません。");
      return;
    }
    setMessage(null);
    onChange({ ...coordinate.cell, rawValues: values, source: "manual" });
  };

  return (
    <div className="nested-measurement-sheet__compact-cell">
      <textarea
        aria-label={`${rowLabel}・${coordinate.condition.label}の${coordinate.readout.label}`}
        aria-describedby={
          [disabledReason ? descriptionId : null, message ? errorId : null]
            .filter(Boolean)
            .join(" ") || undefined
        }
        aria-invalid={Boolean(message) || undefined}
        disabled={notPlanned || !decision.editable}
        rows={Math.min(5, Math.max(2, coordinate.cell.rawValues.length || 2))}
        value={text}
        onBlur={commit}
        onChange={(event) => {
          setText(event.currentTarget.value);
          setMessage(null);
        }}
        onPaste={(event) => {
          // Native textarea paste preserves newline-delimited values. Parsing is deferred to blur.
          event.stopPropagation();
        }}
      />
      {disabledReason ? <small id={descriptionId}>{disabledReason}</small> : null}
      {message ? (
        <small id={errorId} role="alert">
          {message}
        </small>
      ) : null}
    </div>
  );
}

function ExpandedValueInput({
  value,
  label,
  disabled,
  describedBy,
  onCommit,
}: Readonly<{
  value: number | null;
  label: string;
  disabled: boolean;
  describedBy?: string;
  onCommit: (value: number) => void;
}>) {
  const errorId = useId();
  const [text, setText] = useState(value === null ? "" : String(value));
  const [invalid, setInvalid] = useState(false);
  useEffect(() => setText(value === null ? "" : String(value)), [value]);
  return (
    <div className="nested-measurement-sheet__expanded-value">
      <input
        aria-label={label}
        aria-describedby={
          [describedBy, invalid ? errorId : null].filter(Boolean).join(" ") || undefined
        }
        aria-invalid={invalid || undefined}
        disabled={disabled}
        inputMode="decimal"
        value={text}
        onBlur={() => {
          if (!text.trim() && value === null) return;
          const number = Number(text);
          if (!text.trim() || !Number.isFinite(number)) {
            setInvalid(true);
            return;
          }
          setInvalid(false);
          onCommit(number);
        }}
        onChange={(event) => {
          setText(event.currentTarget.value);
          setInvalid(false);
        }}
      />
      {invalid ? (
        <small id={errorId} role="alert">
          数値を入力してください。入力内容は消していません。
        </small>
      ) : null}
    </div>
  );
}

function updateOptionalString(
  values: readonly string[] | undefined,
  index: number,
  value: string,
): readonly string[] | undefined {
  const next = Array.from({ length: Math.max(values?.length ?? 0, index + 1) }, (_, itemIndex) =>
    itemIndex === index ? value : (values?.[itemIndex] ?? ""),
  );
  return next.some((item) => item.trim()) ? next : undefined;
}

function updateValue(
  cell: NestedContinuousCellDraft,
  index: number,
  value: number,
): NestedContinuousCellDraft {
  const rawValues = [...cell.rawValues];
  if (index > rawValues.length) {
    throw new Error("測定値の途中へ空の行を作ることはできません");
  }
  rawValues[index] = value;
  return { ...cell, rawValues, source: "manual" };
}

export function WorkspaceNestedMeasurementSheet({
  draft,
  cells,
  mode,
  onModeChange,
  onCellChange,
}: Props) {
  const tableId = useId();
  const rowReasonPrefix = useId();
  const coordinates = useMemo(() => coordinatesFor(draft, cells), [draft, cells]);
  if (coordinates.length === 0) return null;

  const hasAxis = draft.time.points.length > 0;
  const conditionUnitsAreIndependent = draft.conditionAssignment.kind === "independent";
  const visibleAttributes = draft.attributes.filter((attribute) =>
    draft.conditions.some((condition) => condition.attributes[attribute.id]?.trim()),
  );

  return (
    <section className="nested-measurement-sheet" aria-labelledby="nested-measurement-sheet-title">
      <div className="nested-measurement-sheet__heading">
        <div>
          <h3 id="nested-measurement-sheet-title">個々の測定値を入力</h3>
          <p>2つの表示は同じ測定値を参照します。表示を変えても値やIDは複製されません。</p>
        </div>
        <div
          className="nested-measurement-sheet__view-switch"
          role="group"
          aria-label="入力表の表示"
        >
          <button
            type="button"
            aria-controls={tableId}
            aria-pressed={mode === "compact"}
            onClick={() => onModeChange("compact")}
          >
            まとめて入力
          </button>
          <button
            type="button"
            aria-controls={tableId}
            aria-pressed={mode === "expanded"}
            onClick={() => onModeChange("expanded")}
          >
            すべての値
          </button>
        </div>
      </div>

      {mode === "compact" ? (
        <>
          {conditionUnitsAreIndependent ? (
            <p className="nested-measurement-sheet__structure-note" role="note">
              各条件の欄は別々の{draft.conditionAssignment.unitLabel}
              です。同じ入力行に並んでいても、 同じ{draft.conditionAssignment.unitLabel}
              を条件間で繰り返し測ったことにはなりません。
            </p>
          ) : null}
          <div className="nested-measurement-sheet__table-wrap">
            <table id={tableId} aria-label="条件ごとに複数の測定値をまとめて入力">
              <caption className="nested-measurement-sheet__caption">
                条件ごとに複数の測定値をまとめて入力
              </caption>
              <thead>
                <tr>
                  <th scope="col">
                    {conditionUnitsAreIndependent ? "入力行" : draft.conditionAssignment.unitLabel}
                  </th>
                  {draft.readouts.filter((readout) => readout.shape === "nested_continuous")
                    .length > 1 ? (
                    <th scope="col">測定項目</th>
                  ) : null}
                  {hasAxis ? <th scope="col">{orderedAxisTitle(draft.time)}</th> : null}
                  {draft.conditions.map((condition) => (
                    <th scope="col" key={condition.id}>
                      {condition.label}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {draft.experiments.flatMap((experiment, experimentIndex) =>
                  draft.readouts
                    .filter(
                      (readout) =>
                        readout.shape === "nested_continuous" &&
                        readout.nestedInputMode !== "unit_summary",
                    )
                    .flatMap((readout) =>
                      timePointsFor(draft).map((timePoint) => {
                        const rowCoordinates = coordinates.filter(
                          (coordinate) =>
                            coordinate.experiment.id === experiment.id &&
                            coordinate.readout.id === readout.id &&
                            coordinate.timePoint?.id === timePoint?.id,
                        );
                        return (
                          <tr key={`${experiment.id}:${readout.id}:${timePoint?.id ?? "none"}`}>
                            <th scope="row">
                              {conditionUnitsAreIndependent
                                ? `入力行 ${experimentIndex + 1}`
                                : experiment.label}
                            </th>
                            {draft.readouts.filter(
                              (candidate) => candidate.shape === "nested_continuous",
                            ).length > 1 ? (
                              <td>{readout.label}</td>
                            ) : null}
                            {hasAxis ? <td>{axisLabel(draft, timePoint)}</td> : null}
                            {draft.conditions.map((condition) => {
                              const coordinate = rowCoordinates.find(
                                (candidate) => candidate.condition.id === condition.id,
                              )!;
                              return (
                                <td key={condition.id}>
                                  <CompactValuesCell
                                    coordinate={coordinate}
                                    rowLabel={
                                      conditionUnitsAreIndependent
                                        ? `入力行 ${experimentIndex + 1}`
                                        : experiment.label
                                    }
                                    onChange={(cell) => onCellChange(coordinate.key, cell)}
                                  />
                                </td>
                              );
                            })}
                          </tr>
                        );
                      }),
                    ),
                )}
              </tbody>
            </table>
          </div>
        </>
      ) : (
        <div className="nested-measurement-sheet__table-wrap">
          <table id={tableId} aria-label="個々の測定値をすべて表示">
            <caption className="nested-measurement-sheet__caption">
              個々の測定値をすべて表示
            </caption>
            <thead>
              <tr>
                <th scope="col">
                  {conditionUnitsAreIndependent
                    ? `条件ごとの${draft.conditionAssignment.unitLabel}`
                    : draft.conditionAssignment.unitLabel}
                </th>
                {visibleAttributes.map((attribute) => (
                  <th scope="col" key={attribute.id}>
                    {attribute.label}
                  </th>
                ))}
                {hasAxis ? <th scope="col">{orderedAxisTitle(draft.time)}</th> : null}
                <th scope="col">測定項目</th>
                <th scope="col">Cell・ROIなどのID</th>
                <th scope="col">測定値</th>
                <th scope="col">出典（任意）</th>
              </tr>
            </thead>
            <tbody>
              {coordinates.flatMap((coordinate, coordinateIndex) => {
                const rowCount = coordinate.cell.rawValues.length + 1;
                return Array.from({ length: rowCount }, (_, index) => {
                  const existing = index < coordinate.cell.rawValues.length;
                  const disabled = cellIsNotPlanned(coordinate.cell);
                  const rowKey = `${coordinate.key}:${index}`;
                  const unavailableReason = disabled
                    ? "この条件は測定予定なしとして設定されています。"
                    : !existing
                      ? "測定値を入力するとIDと出典を入力できます。"
                      : null;
                  const reasonId = `${rowReasonPrefix}-${coordinateIndex}-${index}`;
                  return (
                    <tr key={rowKey} className={existing ? undefined : "is-entry-row"}>
                      <th scope="row">
                        {conditionUnitsAreIndependent
                          ? `${coordinate.condition.label} / ${coordinate.experiment.label}`
                          : coordinate.experiment.label}
                        {unavailableReason ? (
                          <span id={reasonId} className="nested-measurement-sheet__assistive-text">
                            {unavailableReason}
                          </span>
                        ) : null}
                      </th>
                      {visibleAttributes.map((attribute) => (
                        <td key={attribute.id}>
                          {coordinate.condition.attributes[attribute.id] || "—"}
                        </td>
                      ))}
                      {hasAxis ? <td>{axisLabel(draft, coordinate.timePoint)}</td> : null}
                      <td>{coordinate.readout.label}</td>
                      <td>
                        <input
                          aria-label={`${coordinate.condition.label}・${coordinate.experiment.label}・測定${index + 1}のID`}
                          aria-describedby={unavailableReason ? reasonId : undefined}
                          disabled={disabled || !existing}
                          placeholder={existing ? "ID未入力" : "値を入力後に設定"}
                          value={coordinate.cell.observationUnitIds?.[index] ?? ""}
                          onChange={(event) =>
                            onCellChange(coordinate.key, {
                              ...coordinate.cell,
                              observationUnitIds: updateOptionalString(
                                coordinate.cell.observationUnitIds,
                                index,
                                event.currentTarget.value,
                              ),
                            })
                          }
                        />
                      </td>
                      <td>
                        <ExpandedValueInput
                          disabled={disabled}
                          describedBy={unavailableReason ? reasonId : undefined}
                          label={`${coordinate.condition.label}・${coordinate.experiment.label}・測定${index + 1}の値`}
                          value={existing ? coordinate.cell.rawValues[index]! : null}
                          onCommit={(value) =>
                            onCellChange(coordinate.key, updateValue(coordinate.cell, index, value))
                          }
                        />
                      </td>
                      <td>
                        <input
                          aria-label={`${coordinate.condition.label}・${coordinate.experiment.label}・測定${index + 1}の出典`}
                          aria-describedby={unavailableReason ? reasonId : undefined}
                          disabled={disabled || !existing}
                          placeholder={existing ? "任意" : "値を入力後に設定"}
                          value={coordinate.cell.sourceLocations?.[index] ?? ""}
                          onChange={(event) =>
                            onCellChange(coordinate.key, {
                              ...coordinate.cell,
                              sourceLocations: updateOptionalString(
                                coordinate.cell.sourceLocations,
                                index,
                                event.currentTarget.value,
                              ),
                            })
                          }
                        />
                      </td>
                    </tr>
                  );
                });
              })}
            </tbody>
          </table>
        </div>
      )}
    </section>
  );
}

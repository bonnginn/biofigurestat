import { useId, useMemo, useState, type ClipboardEvent } from "react";

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

import { moveSpreadsheetFocus, parseClipboardMatrix } from "./spreadsheetGrid";
import { useSpreadsheetCellDraft } from "./useSpreadsheetCellDraft";
import { parseOptionalSpreadsheetNumber } from "./spreadsheetValues";
import { SpreadsheetDraftTextCell } from "./SpreadsheetDraftTextCell";
import "./WorkspaceNestedMeasurementSheet.css";
import { localizedText, useAppLocale, type AppLocale } from "../app/appLocale";

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
  locale: AppLocale,
): Readonly<{ editable: true }> | Readonly<{ editable: false; reason: string }> {
  if (coordinate.cell.observationUnitIds?.some((id) => id.trim())) {
    return {
      editable: false,
      reason: localizedText(locale, "Cell・ROIなどのIDがあるため、値の対応を守れる「すべての値」で編集します。", "This record has Cell/ROI identifiers. Edit it in All values to preserve value-to-ID alignment."),
    };
  }
  if (coordinate.cell.sourceLocations?.some((source) => source.trim())) {
    return {
      editable: false,
      reason: localizedText(locale, "行ごとの出典があるため、出典との対応を守れる「すべての値」で編集します。", "This record has row-level sources. Edit it in All values to preserve value-to-source alignment."),
    };
  }
  return { editable: true };
}

function parseValues(text: string): readonly number[] | null {
  const normalized = text.replace(/\r\n?/g, "\n").replace(/\n+$/u, "");
  if (!normalized.trim()) return [];
  const tokens = normalized.split(/[\n\t,、]/).map((token) => token.trim());
  const values: number[] = [];
  for (const token of tokens) {
    const parsed = parseOptionalSpreadsheetNumber(token);
    if (parsed.kind !== "value") return null;
    values.push(parsed.value);
  }
  return values;
}

function readoutTitle(readout: ReadoutDraft): string {
  const unit = readout.unit?.trim();
  return unit ? `${readout.label} (${unit})` : readout.label;
}

function axisTitle(draft: ExperimentSetDraft): string {
  const unit = orderedAxisUnit(draft.time);
  return unit ? `${orderedAxisTitle(draft.time)} (${unit})` : orderedAxisTitle(draft.time);
}

function axisLabel(draft: ExperimentSetDraft, point: TimePointDraft | null): string {
  if (!point) return "—";
  return `${point.value}${orderedAxisUnit(draft.time) ? ` ${orderedAxisUnit(draft.time)}` : ""}`;
}

function CompactValuesCell({
  coordinate,
  rowLabel,
  onChange,
  gridRow,
  gridColumn,
  onRectangularPaste,
}: Readonly<{
  coordinate: CellCoordinate;
  rowLabel: string;
  onChange: (cell: NestedContinuousCellDraft) => void;
  gridRow: number;
  gridColumn: number;
  onRectangularPaste: (coordinate: CellCoordinate, text: string) => string | null;
}>) {
  const locale = useAppLocale();
  const t = (ja: string, en: string) => localizedText(locale, ja, en);
  const descriptionId = useId();
  const errorId = useId();
  const valuesText = coordinate.cell.rawValues.join("\n");
  const { text, error: message, edit, accept, reportError, clearError } =
    useSpreadsheetCellDraft(valuesText, { preserveDirtyOnCanonicalChange: true });
  const decision = compactEditability(coordinate, locale);
  const notPlanned = cellIsNotPlanned(coordinate.cell);
  const disabledReason = notPlanned
    ? t("この条件は測定予定なしとして設定されています。", "This condition is marked as not planned for measurement.")
    : decision.editable
      ? null
      : decision.reason;

  const commit = () => {
    if (!decision.editable) return;
    const values = parseValues(text);
    if (!values) {
      reportError(t("数値を1行に1つ入力してください。入力内容は消していません。", "Enter one numeric value per line. The entered content was retained."));
      return;
    }
    clearError();
    onChange({ ...coordinate.cell, rawValues: values, source: "manual" });
    accept();
  };

  return (
    <div className="nested-measurement-sheet__compact-cell">
      <textarea
        aria-label={locale === "ja" ? `${rowLabel}・${coordinate.condition.label}の${coordinate.readout.label}` : `${rowLabel}, ${coordinate.condition.label}, ${coordinate.readout.label}`}
        aria-describedby={
          [disabledReason ? descriptionId : null, message ? errorId : null]
            .filter(Boolean)
            .join(" ") || undefined
        }
        aria-invalid={Boolean(message) || undefined}
        disabled={notPlanned || !decision.editable}
        rows={Math.min(5, Math.max(2, coordinate.cell.rawValues.length || 2))}
        value={text}
        data-spreadsheet-cell="true"
        data-spreadsheet-row={gridRow}
        data-spreadsheet-column={gridColumn}
        onBlur={commit}
        onChange={(event) => {
          edit(event.currentTarget.value);
        }}
        onKeyDown={moveSpreadsheetFocus}
        onPaste={(event) => {
          const pasted = event.clipboardData.getData("text");
          if (!pasted.includes("\t") && !/[\r\n]/u.test(pasted)) return;
          event.preventDefault();
          const pasteError = onRectangularPaste(coordinate, pasted);
          if (pasteError) reportError(pasteError);
          else {
            clearError();
            accept();
          }
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
  gridRow,
  gridColumn,
  cellKey,
  valueIndex,
  onPaste,
}: Readonly<{
  value: number | null;
  label: string;
  disabled: boolean;
  describedBy?: string;
  onCommit: (value: number) => void;
  gridRow: number;
  gridColumn: number;
  cellKey: string;
  valueIndex: number;
  onPaste: (event: ClipboardEvent<HTMLInputElement>) => void;
}>) {
  const locale = useAppLocale();
  const t = (ja: string, en: string) => localizedText(locale, ja, en);
  return (
    <SpreadsheetDraftTextCell
      wrapperClassName="nested-measurement-sheet__expanded-value"
      canonicalText={value === null ? "" : String(value)}
      preserveDirtyOnCanonicalChange
      aria-label={label}
      aria-describedby={describedBy}
      disabled={disabled}
      inputMode="decimal"
      data-spreadsheet-row={gridRow}
      data-spreadsheet-column={gridColumn}
      data-expanded-field="value"
      data-cell-key={cellKey}
      data-value-index={valueIndex}
      onPaste={onPaste}
      onCommit={(text) => {
        const parsed = parseOptionalSpreadsheetNumber(text);
        if (parsed.kind !== "value") {
          return t(
            "数値を入力してください。入力内容は消していません。",
            "Enter a numeric value. The entered content was retained.",
          );
        }
        onCommit(parsed.value);
        return null;
      }}
    />
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
  locale: AppLocale,
): NestedContinuousCellDraft {
  const rawValues = [...cell.rawValues];
  if (index > rawValues.length) {
    throw new Error(localizedText(locale, "測定値の途中へ空の行を作ることはできません", "A blank row cannot be inserted within the measurement values"));
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
  const locale = useAppLocale();
  const t = (ja: string, en: string) => localizedText(locale, ja, en);
  const tableId = useId();
  const rowReasonPrefix = useId();
  const [pasteMessage, setPasteMessage] = useState<string | null>(null);
  const coordinates = useMemo(() => coordinatesFor(draft, cells), [draft, cells]);
  if (coordinates.length === 0) return null;

  const hasAxis = draft.time.points.length > 0;
  const conditionUnitsAreIndependent = draft.conditionAssignment.kind === "independent";
  const observationUnitLabel =
    draft.adaptiveInput?.biologicalSetup?.answers.nestedObservationLabel?.trim() || t("Cell・ROIなど", "Cell/ROI or other observation");
  const visibleAttributes = draft.attributes.filter((attribute) =>
    draft.conditions.some((condition) => condition.attributes[attribute.id]?.trim()),
  );
  const expandedRows = coordinates.flatMap((coordinate, coordinateIndex) =>
    Array.from({ length: coordinate.cell.rawValues.length + 1 }, (_, index) => ({
      coordinate,
      coordinateIndex,
      index,
      existing: index < coordinate.cell.rawValues.length,
    })),
  );

  const pasteCompactMatrix = (start: CellCoordinate, text: string): string | null => {
    const matrix = parseClipboardMatrix(text);
    const width = Math.max(...matrix.map((row) => row.length));
    const startIndex = coordinates.findIndex(({ key }) => key === start.key);
    if (startIndex < 0 || startIndex + width > coordinates.length) {
      return t("貼り付け範囲が入力表を超えています。既存の値は変更していません。", "The pasted range exceeds the data table. Existing values were not changed.");
    }
    const updates: Array<{ coordinate: CellCoordinate; values: number[] }> = [];
    for (let columnOffset = 0; columnOffset < width; columnOffset += 1) {
      const coordinate = coordinates[startIndex + columnOffset]!;
      if (cellIsNotPlanned(coordinate.cell) || !compactEditability(coordinate, locale).editable) {
        return locale === "ja" ? `${coordinate.condition.label}は「すべての値」で編集してください。既存の値は変更していません。` : `Edit ${coordinate.condition.label} in All values. Existing values were not changed.`;
      }
      const values: number[] = [];
      for (const row of matrix) {
        const token = (row[columnOffset] ?? "").trim();
        const parsed = parseOptionalSpreadsheetNumber(token);
        if (parsed.kind !== "value") {
          return locale === "ja" ? `数値として読めない${token ? `値「${token}」` : "空欄"}があります。既存の値は変更していません。` : `A ${token ? `value (“${token}”)` : "blank cell"} could not be read as a number. Existing values were not changed.`;
        }
        values.push(parsed.value);
      }
      updates.push({ coordinate, values });
    }
    updates.forEach(({ coordinate, values }) =>
      onCellChange(coordinate.key, { ...coordinate.cell, rawValues: values, source: "paste" }),
    );
    setPasteMessage(locale === "ja" ? `${matrix.length}行 × ${width}列を貼り付けました。` : `Pasted ${matrix.length} rows × ${width} columns.`);
    return null;
  };

  const pasteExpandedMatrix = (event: ClipboardEvent<HTMLInputElement>) => {
    const text = event.clipboardData.getData("text");
    if (!text.includes("\t") && !/[\r\n]/u.test(text)) return;
    event.preventDefault();
    const matrix = parseClipboardMatrix(text);
    const start = event.currentTarget;
    const startRow = Number(start.dataset.spreadsheetRow);
    const startControls = [
      ...(start
        .closest("table")
        ?.querySelectorAll<HTMLInputElement>(
          `[data-spreadsheet-row="${startRow}"][data-expanded-field]`,
        ) ?? []),
    ].sort(
      (left, right) =>
        Number(left.dataset.spreadsheetColumn) - Number(right.dataset.spreadsheetColumn),
    );
    const startColumn = startControls.indexOf(start);
    const proposed = new Map<string, NestedContinuousCellDraft>();
    try {
      matrix.forEach((tokens, rowOffset) => {
        const controls = [
          ...(start
            .closest("table")
            ?.querySelectorAll<HTMLInputElement>(
              `[data-spreadsheet-row="${startRow + rowOffset}"][data-expanded-field]`,
            ) ?? []),
        ].sort(
          (left, right) =>
            Number(left.dataset.spreadsheetColumn) - Number(right.dataset.spreadsheetColumn),
        );
        tokens.forEach((token, columnOffset) => {
          const target = controls[startColumn + columnOffset];
          if (!target || target.disabled) {
            throw new Error(t("貼り付け範囲が入力表を超えています。", "The pasted range exceeds the data table."));
          }
          const cellKey = target.dataset.cellKey!;
          const valueIndex = Number(target.dataset.valueIndex);
          const coordinate = coordinates.find(({ key }) => key === cellKey);
          if (!coordinate) throw new Error(t("貼り付け先の測定記録を確認できません。", "The destination measurement record could not be found."));
          let cell = proposed.get(cellKey) ?? coordinate.cell;
          const field = target.dataset.expandedField;
          if (field === "value") {
            const trimmed = token.trim();
            const parsed = parseOptionalSpreadsheetNumber(trimmed);
            if (parsed.kind !== "value") {
              throw new Error(
                locale === "ja" ? `数値として読めない${trimmed ? `値「${trimmed}」` : "空欄"}があります。` : `A ${trimmed ? `value (“${trimmed}”)` : "blank cell"} could not be read as a number.`,
              );
            }
            cell = updateValue(cell, valueIndex, parsed.value, locale);
          } else if (field === "identity") {
            cell = {
              ...cell,
              observationUnitIds: updateOptionalString(cell.observationUnitIds, valueIndex, token),
            };
          } else {
            cell = {
              ...cell,
              sourceLocations: updateOptionalString(cell.sourceLocations, valueIndex, token),
            };
          }
          proposed.set(cellKey, cell);
        });
      });
      proposed.forEach((cell, key) => onCellChange(key, cell));
      setPasteMessage(
        locale === "ja" ? `${matrix.length}行の記録を貼り付けました。IDと出典の対応は保持されています。` : `Pasted ${matrix.length} records. ID and source alignment was preserved.`,
      );
    } catch (cause) {
      setPasteMessage(
        `${cause instanceof Error ? cause.message : t("貼り付けた値を適用できませんでした。", "The pasted values could not be applied.")} ${t("既存の値は変更していません。", "Existing values were not changed.")}`,
      );
    }
  };

  return (
    <section className="nested-measurement-sheet" aria-labelledby="nested-measurement-sheet-title">
      <div className="nested-measurement-sheet__heading">
        <div>
          <h3 id="nested-measurement-sheet-title">{t("個々の測定値を入力", "Enter individual measurements")}</h3>
          <p>{t("2つの表示は同じ測定値を参照します。表示を変えても値やIDは複製されません。", "Both views reference the same measurements. Switching views does not duplicate values or IDs.")}</p>
        </div>
        <div
          className="nested-measurement-sheet__view-switch"
          role="group"
          aria-label={t("入力表の表示", "Data-table view")}
        >
          <button
            type="button"
            aria-controls={tableId}
            aria-pressed={mode === "compact"}
            onClick={() => onModeChange("compact")}
          >
            {t("まとめて入力", "Compact entry")}
          </button>
          <button
            type="button"
            aria-controls={tableId}
            aria-pressed={mode === "expanded"}
            onClick={() => onModeChange("expanded")}
          >
            {t("すべての値", "All values")}
          </button>
        </div>
      </div>

      <p className="nested-measurement-sheet__structure-note" role="note">
        {t("ExcelやGoogle Sheetsから矩形のまま貼り付けられます。矢印キー、Enter、Tabでセルを移動し、「すべての値」ではIDと出典も直接編集できます。", "Paste rectangular ranges directly from Excel or Google Sheets. Move between cells with the arrow keys, Enter, or Tab; All values also lets you edit IDs and sources directly.")}
      </p>

      {mode === "compact" ? (
        <>
          {conditionUnitsAreIndependent ? (
            <p className="nested-measurement-sheet__structure-note" role="note">
              {locale === "ja" ? `各条件の欄は別々の${draft.conditionAssignment.unitLabel}です。同じ入力行に並んでいても、同じ${draft.conditionAssignment.unitLabel}を条件間で繰り返し測ったことにはなりません。` : `Each condition column contains a separate ${draft.conditionAssignment.unitLabel}. Values aligned in the same entry row do not represent repeated measurements of the same ${draft.conditionAssignment.unitLabel} across conditions.`}
            </p>
          ) : null}
          <div className="nested-measurement-sheet__table-wrap">
            <table id={tableId} aria-label={t("条件ごとに複数の測定値をまとめて入力", "Enter multiple measurements by condition")}>
              <caption className="nested-measurement-sheet__caption">
                {t("条件ごとに複数の測定値をまとめて入力", "Enter multiple measurements by condition")}
              </caption>
              <thead>
                <tr>
                  <th scope="col">
                    {conditionUnitsAreIndependent ? t("入力行", "Entry row") : draft.conditionAssignment.unitLabel}
                  </th>
                  {draft.readouts.filter((readout) => readout.shape === "nested_continuous")
                    .length > 1 ? (
                    <th scope="col">{t("測定項目", "Measured value")}</th>
                  ) : null}
                  {hasAxis ? <th scope="col">{axisTitle(draft)}</th> : null}
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
                                ? locale === "ja" ? `入力行 ${experimentIndex + 1}` : `Entry row ${experimentIndex + 1}`
                                : experiment.label}
                            </th>
                            {draft.readouts.filter(
                              (candidate) => candidate.shape === "nested_continuous",
                            ).length > 1 ? (
                              <td>{readoutTitle(readout)}</td>
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
                                        ? locale === "ja" ? `入力行 ${experimentIndex + 1}` : `Entry row ${experimentIndex + 1}`
                                        : experiment.label
                                    }
                                    onChange={(cell) => onCellChange(coordinate.key, cell)}
                                    gridRow={Math.floor(
                                      coordinates.indexOf(coordinate) / draft.conditions.length,
                                    )}
                                    gridColumn={draft.conditions.findIndex(
                                      ({ id }) => id === condition.id,
                                    )}
                                    onRectangularPaste={pasteCompactMatrix}
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
          <table id={tableId} aria-label={t("個々の測定値をすべて表示", "Show all individual measurements")}>
            <caption className="nested-measurement-sheet__caption">
              {t("個々の測定値をすべて表示", "Show all individual measurements")}
            </caption>
            <thead>
              <tr>
                <th scope="col">
                  {conditionUnitsAreIndependent
                    ? locale === "ja" ? `条件ごとの${draft.conditionAssignment.unitLabel}` : `${draft.conditionAssignment.unitLabel} by condition`
                    : draft.conditionAssignment.unitLabel}
                </th>
                {visibleAttributes.map((attribute) => (
                  <th scope="col" key={attribute.id}>
                    {attribute.label}
                  </th>
                ))}
                {hasAxis ? <th scope="col">{axisTitle(draft)}</th> : null}
                <th scope="col">{t("測定項目", "Measured value")}</th>
                <th scope="col">{locale === "ja" ? `${observationUnitLabel}のID` : `${observationUnitLabel} ID`}</th>
                <th scope="col">{t("測定値（各行1つ）", "Measurement (one per row)")}</th>
                <th scope="col">{t("出典（任意）", "Source (optional)")}</th>
              </tr>
            </thead>
            <tbody>
              {expandedRows.map(({ coordinate, coordinateIndex, index, existing }, gridRow) => {
                const disabled = cellIsNotPlanned(coordinate.cell);
                const rowKey = `${coordinate.key}:${index}`;
                const unavailableReason = disabled
                  ? t("この条件は測定予定なしとして設定されています。", "This condition is marked as not planned for measurement.")
                  : !existing
                    ? t("測定値を入力するとIDと出典を入力できます。", "Enter a measurement before adding its ID and source.")
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
                    <td>{readoutTitle(coordinate.readout)}</td>
                    <td>
                      <input
                        aria-label={locale === "ja" ? `${coordinate.condition.label}・${coordinate.experiment.label}・測定${index + 1}のID` : `${coordinate.condition.label}, ${coordinate.experiment.label}, measurement ${index + 1} ID`}
                        aria-describedby={unavailableReason ? reasonId : undefined}
                        disabled={disabled || !existing}
                        placeholder={existing ? t("ID未入力", "ID not entered") : t("値を入力後に設定", "Available after entering a value")}
                        value={coordinate.cell.observationUnitIds?.[index] ?? ""}
                        data-spreadsheet-cell="true"
                        data-spreadsheet-row={gridRow}
                        data-spreadsheet-column={0}
                        data-expanded-field="identity"
                        data-cell-key={coordinate.key}
                        data-value-index={index}
                        onKeyDown={moveSpreadsheetFocus}
                        onPaste={pasteExpandedMatrix}
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
                        label={locale === "ja" ? `${coordinate.condition.label}・${coordinate.experiment.label}・測定${index + 1}の値` : `${coordinate.condition.label}, ${coordinate.experiment.label}, measurement ${index + 1} value`}
                        value={existing ? coordinate.cell.rawValues[index]! : null}
                        gridRow={gridRow}
                        gridColumn={1}
                        cellKey={coordinate.key}
                        valueIndex={index}
                        onPaste={pasteExpandedMatrix}
                        onCommit={(value) =>
                          onCellChange(coordinate.key, updateValue(coordinate.cell, index, value, locale))
                        }
                      />
                    </td>
                    <td>
                      <input
                        aria-label={locale === "ja" ? `${coordinate.condition.label}・${coordinate.experiment.label}・測定${index + 1}の出典` : `${coordinate.condition.label}, ${coordinate.experiment.label}, measurement ${index + 1} source`}
                        aria-describedby={unavailableReason ? reasonId : undefined}
                        disabled={disabled || !existing}
                        placeholder={existing ? t("任意", "Optional") : t("値を入力後に設定", "Available after entering a value")}
                        value={coordinate.cell.sourceLocations?.[index] ?? ""}
                        data-spreadsheet-cell="true"
                        data-spreadsheet-row={gridRow}
                        data-spreadsheet-column={2}
                        data-expanded-field="source"
                        data-cell-key={coordinate.key}
                        data-value-index={index}
                        onKeyDown={moveSpreadsheetFocus}
                        onPaste={pasteExpandedMatrix}
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
              })}
            </tbody>
          </table>
        </div>
      )}
      {pasteMessage ? (
        <p className="nested-measurement-sheet__paste-status" role="status" aria-live="polite">
          {pasteMessage}
        </p>
      ) : null}
    </section>
  );
}

import {
  useEffect,
  useId,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
  type ClipboardEvent,
  type CSSProperties,
} from "react";

import {
  applyCompactScalarEdit,
  buildAdaptiveSpreadsheetViewModel,
  type AdaptiveCompactGroup,
  type AdaptiveObservationViewMode,
  type AdaptiveSpreadsheetColumn,
  type CompactScalarObservationIdFactoryContext,
  type SpreadsheetCell,
} from "@lsaa/data-sheet";
import {
  CanonicalAdaptiveObservationSchema,
  type CanonicalAdaptiveObservation,
  type StructureContract,
} from "@lsaa/domain";

import { moveSpreadsheetFocus, parseClipboardMatrix } from "./spreadsheetGrid";
import { SPREADSHEET_ZOOM_LEVELS, useSpreadsheetZoom } from "./spreadsheetZoom";
import { getAppLocale, localizedText, useAppLocale, type AppLocale } from "../app/appLocale";
import { parseOptionalSpreadsheetNumber } from "./spreadsheetValues";
import { SpreadsheetDraftTextCell } from "./SpreadsheetDraftTextCell";
import { SpreadsheetDraftTextareaCell } from "./SpreadsheetDraftTextareaCell";
import {
  CanonicalMatrixWorksheet,
  canEditCanonicalMatrix,
  canonicalMatrixConditionStatus,
  type CanonicalWorksheetFileCommit,
  type CanonicalMatrixConditionCombination,
  type CanonicalWorksheetRow,
} from "./CanonicalMatrixWorksheet";
import {
  buildAdaptiveRecordEntryObservation,
  createEmptyAdaptiveRecordEntryDraft,
  recordEntryComponentLabel,
  recordEntryIdentityFields,
  recordEntryHierarchyFields,
  recordEntryReadout,
  recordEntryValueKey,
  recordEntryUsesBooleanValue,
  recordEntryUsesNumericValue,
  type AdaptiveRecordEntryDraft,
} from "./adaptiveRecordEntry";
import "./AdaptiveCanonicalSpreadsheet.css";

const WORKSHEET_ZOOM_STORAGE_KEY = "lsaa.adaptive-worksheet.zoom.v1";

function textForLocale(ja: string, en: string): string {
  return localizedText(getAppLocale(), ja, en);
}

export type AdaptiveCanonicalSpreadsheetProps = Readonly<{
  contract: StructureContract;
  observations: readonly CanonicalAdaptiveObservation[];
  mode: AdaptiveObservationViewMode;
  onModeChange: (mode: AdaptiveObservationViewMode) => void;
  onObservationsChange: (observations: readonly CanonicalAdaptiveObservation[]) => void;
  /** Complete file import callback for atomic raw-lineage persistence. */
  onFileImport?: (result: CanonicalWorksheetFileCommit) => void;
  nextObservationId: (context: CompactScalarObservationIdFactoryContext) => string;
  nextExperimentalUnitIdentity?: (
    context: CompactScalarObservationIdFactoryContext & { observationId: string },
  ) => string;
  embedded?: boolean;
  readOnly?: boolean;
  /** Production worksheet rows. Their order is presentation only unless the contract declares matching. */
  worksheetRows?: readonly CanonicalWorksheetRow[];
  conditionCombinations?: readonly CanonicalMatrixConditionCombination[];
  showExperimentDate?: boolean;
  onWorksheetRowChange?: (rowIndex: number, patch: Partial<CanonicalWorksheetRow>) => void;
}>;

type ContinuousWorksheetPresentation = "condition_sheet" | "compact_entry";

function scalarReadoutValueKey(
  contract: StructureContract,
  group: AdaptiveCompactGroup,
): string | null {
  const readout = contract.readouts.find(({ key }) => key === group.coordinates.readoutKey);
  if (!readout || readout.representation !== "scalar") return null;
  const presentKeys = new Set(
    group.observations.flatMap((observation) => Object.keys(observation.values)),
  );
  return [readout.key, ...readout.componentKeys].find((key) => presentKeys.has(key)) ?? readout.key;
}

function compactText(group: AdaptiveCompactGroup, valueKey: string): string {
  return group.observations
    .map((observation) => {
      const value = observation.values[valueKey];
      return value === null || value === undefined ? "" : String(value);
    })
    .join("\n");
}

function parseCompactScalarText(text: string): readonly (number | null)[] | null {
  const normalized = text.replace(/\r\n?/gu, "\n").replace(/\n+$/u, "");
  if (!normalized.trim()) return [];
  const tokens = normalized.split(/[\n\t]/u);
  const values = tokens.map((token) => {
    const parsed = parseOptionalSpreadsheetNumber(token);
    return parsed.kind === "value" ? parsed.value : null;
  });
  return values.some((value, index) => value === null && tokens[index]!.trim() !== "")
    ? null
    : values;
}

function coordinateLabel(contract: StructureContract, group: AdaptiveCompactGroup): string {
  const factors = Object.entries(group.coordinates.factors)
    .map(
      ([key, value]) =>
        `${contract.factors.find((factor) => factor.key === key)?.label ?? key}=${value}`,
    )
    .join(" · ");
  const axes = Object.entries(group.coordinates.axes)
    .map(([key, value]) => {
      const axis = contract.orderedAxes.find((candidate) => candidate.key === key);
      return `${axis?.label ?? key}=${value}${axis?.unit.trim() ? ` ${axis.unit.trim()}` : ""}`;
    })
    .join(" · ");
  const hierarchy = Object.entries(group.coordinates.hierarchy)
    .map(
      ([key, value]) =>
        `${contract.unitLevels.find((level) => level.key === key)?.label ?? key}=${value}`,
    )
    .join(" · ");
  return [factors, axes, hierarchy].filter(Boolean).join(" · ") || "Observed";
}

function displayCell(cell: SpreadsheetCell): string {
  if (Array.isArray(cell))
    return cell.map((value) => (value === null ? "" : String(value))).join("\n");
  return cell === null ? "" : String(cell);
}

function columnLabel(column: { label: string; role: string }): string {
  if (column.role === "observation_id") return textForLocale("記録ID", "Record ID");
  if (column.role === "source_row") return textForLocale("元データ行", "Source row");
  return column.label;
}

function visibleColumns(
  columns: readonly AdaptiveSpreadsheetColumn[],
  mode: AdaptiveObservationViewMode,
  embedded: boolean,
  hasSourceRows: boolean,
): readonly AdaptiveSpreadsheetColumn[] {
  return columns.filter(
    (column) =>
      !(mode === "compact" && column.role === "readout") &&
      (embedded
        ? column.role !== "observation_id" &&
          !(column.role === "source_row" && (mode === "compact" || !hasSourceRows)) &&
          !(mode === "compact" && column.role === "identity")
        : true),
  );
}

function scalarGroupForValueColumn(
  contract: StructureContract,
  row: ReturnType<typeof buildAdaptiveSpreadsheetViewModel>["compact"]["rows"][number],
  column: AdaptiveSpreadsheetColumn,
): AdaptiveCompactGroup | null {
  if (column.role !== "value" || !column.semanticKey) return null;
  const group = row.readoutGroups.find((candidate) => {
    if (column.readoutKey) return candidate.coordinates.readoutKey === column.readoutKey;
    return scalarReadoutValueKey(contract, candidate) === column.semanticKey;
  });
  if (!group || scalarReadoutValueKey(contract, group) !== column.semanticKey) return null;
  return group;
}

function experimentalUnitIdentity(
  contract: StructureContract,
  observation: CanonicalAdaptiveObservation,
  rowNumber: number,
): string {
  const identityKey = contract.identities.find(
    ({ unitLevelKey }) => unitLevelKey === contract.experimentalUnitLevelKey,
  )?.key;
  const identity = identityKey ? observation.identities[identityKey] : undefined;
  return (
    identity?.trim() || textForLocale(`実験単位 ${rowNumber}`, `Experimental unit ${rowNumber}`)
  );
}

function expandedRowAccessibleName(
  contract: StructureContract,
  observation: CanonicalAdaptiveObservation,
  rowNumber: number,
  embedded: boolean,
): string {
  return embedded
    ? experimentalUnitIdentity(contract, observation, rowNumber)
    : observation.observationId;
}

function recordValuesMatch(
  left: Readonly<Record<string, string | number>>,
  right: Readonly<Record<string, string | number>>,
  keys: readonly string[],
): boolean {
  return keys.every((key) => String(left[key] ?? "") === String(right[key] ?? ""));
}

function relatedIdentityObservationIds(input: {
  contract: StructureContract;
  observation: CanonicalAdaptiveObservation;
  identityKey: string;
  observations: readonly CanonicalAdaptiveObservation[];
}): Set<string> {
  const { contract, observation, identityKey, observations } = input;
  const identity = contract.identities.find(({ key }) => key === identityKey);
  const oldIdentity = observation.identities[identityKey]?.trim();
  if (!oldIdentity) return new Set([observation.observationId]);

  const levels = new Map(contract.unitLevels.map((level) => [level.key, level]));
  const ancestorLevelKeys = new Set<string>();
  let parentKey = identity ? levels.get(identity.unitLevelKey)?.parentKey : null;
  while (parentKey) {
    ancestorLevelKeys.add(parentKey);
    parentKey = levels.get(parentKey)?.parentKey ?? null;
  }
  const ancestorIdentityKeys = contract.identities
    .filter(({ unitLevelKey }) => ancestorLevelKeys.has(unitLevelKey))
    .map(({ key }) => key);
  const ancestorHierarchyKeys = [...ancestorLevelKeys];
  const nonRepeatedAxisKeys = contract.orderedAxes
    .filter((axis) => !axis.identityRetained)
    .map(({ key }) => key);
  const matchingIdentityAcrossConditions =
    contract.matching.kind === "matched" && contract.matching.identityKey === identityKey;
  const factorKeysToMatch = matchingIdentityAcrossConditions
    ? []
    : contract.factors
        .filter((factor) => factor.unitRole !== "within_unit" && factor.relationship !== "repeated")
        .map(({ key }) => key);

  return new Set(
    observations
      .filter((candidate) => candidate.identities[identityKey]?.trim() === oldIdentity)
      .filter((candidate) =>
        recordValuesMatch(observation.factors, candidate.factors, factorKeysToMatch),
      )
      .filter((candidate) =>
        recordValuesMatch(observation.axes, candidate.axes, nonRepeatedAxisKeys),
      )
      .filter((candidate) =>
        recordValuesMatch(observation.identities, candidate.identities, ancestorIdentityKeys),
      )
      .filter((candidate) =>
        recordValuesMatch(observation.hierarchy, candidate.hierarchy, ancestorHierarchyKeys),
      )
      .map(({ observationId }) => observationId),
  );
}

function updateExpandedIdentity(input: {
  contract: StructureContract;
  observation: CanonicalAdaptiveObservation;
  identityKey: string;
  identity: string;
  observations: readonly CanonicalAdaptiveObservation[];
}): readonly CanonicalAdaptiveObservation[] {
  const identity = input.identity.trim();
  if (!identity) throw new Error("対象・試料を区別する名前を入力してください。");
  const relatedObservationIds = relatedIdentityObservationIds(input);
  if (
    input.observations.some(
      (candidate) =>
        !relatedObservationIds.has(candidate.observationId) &&
        candidate.identities[input.identityKey]?.trim() === identity,
    )
  ) {
    throw new Error("同じ名前がすでにあります。別の対象・試料には異なる名前を付けてください。");
  }
  return input.observations.map((candidate) =>
    relatedObservationIds.has(candidate.observationId)
      ? CanonicalAdaptiveObservationSchema.parse({
          ...candidate,
          identities: { ...candidate.identities, [input.identityKey]: identity },
        })
      : candidate,
  );
}

function updateExpandedValue(input: {
  observationId: string;
  valueKey: string;
  value: number | null;
  observations: readonly CanonicalAdaptiveObservation[];
}): readonly CanonicalAdaptiveObservation[] {
  return input.observations.map((candidate) => {
    if (candidate.observationId !== input.observationId) return candidate;
    const missingness = { ...candidate.missingness };
    if (input.value === null) missingness[input.valueKey] ??= "unknown";
    else delete missingness[input.valueKey];
    const updatedObservation = {
      ...candidate,
      values: { ...candidate.values, [input.valueKey]: input.value },
      missingness,
    };
    const parsed = CanonicalAdaptiveObservationSchema.parse(updatedObservation);
    return { ...updatedObservation, missingness: parsed.missingness };
  });
}

function CompactScalarEditor({
  contract,
  observations,
  group,
  disabled,
  nextObservationId,
  nextExperimentalUnitIdentity,
  onObservationsChange,
  gridRow,
  gridColumn,
  onRectangularPaste,
}: Readonly<{
  contract: StructureContract;
  observations: readonly CanonicalAdaptiveObservation[];
  group: AdaptiveCompactGroup;
  disabled: boolean;
  nextObservationId: AdaptiveCanonicalSpreadsheetProps["nextObservationId"];
  nextExperimentalUnitIdentity: AdaptiveCanonicalSpreadsheetProps["nextExperimentalUnitIdentity"];
  onObservationsChange: AdaptiveCanonicalSpreadsheetProps["onObservationsChange"];
  gridRow: number;
  gridColumn: number;
  onRectangularPaste: (group: AdaptiveCompactGroup, text: string) => string | null;
}>) {
  const locale = useAppLocale();
  const t = (ja: string, en: string) => localizedText(locale, ja, en);
  const valueKey = scalarReadoutValueKey(contract, group);
  const initialText = valueKey ? compactText(group, valueKey) : "";
  if (!valueKey) return <span aria-label={t("測定値なし", "No measured value")}>—</span>;

  const readoutLabel =
    contract.readouts.find(({ key }) => key === group.coordinates.readoutKey)?.label ??
    group.coordinates.readoutKey;
  const label = t(
    `${readoutLabel}・${coordinateLabel(contract, group)}の測定値`,
    `${readoutLabel}: measured values for ${coordinateLabel(contract, group)}`,
  );
  return (
    <SpreadsheetDraftTextareaCell
      wrapperClassName="adaptive-canonical-spreadsheet__compact-editor"
      canonicalText={initialText}
      aria-label={label}
      disabled={disabled}
      rows={Math.min(6, Math.max(2, group.observations.length || 2))}
      data-spreadsheet-row={gridRow}
      data-spreadsheet-column={gridColumn}
      onCommit={(text) => {
        const values = parseCompactScalarText(text);
        if (!values) {
          return t(
            "数値を改行またはタブで入力してください。入力内容は消えていません。",
            "Enter numeric values separated by new lines or tabs. Your input was retained.",
          );
        }
        try {
          const result = applyCompactScalarEdit(contract, observations, {
            targetCoordinates: group.coordinates,
            values,
            valueKey,
            createObservationId: nextObservationId,
            createExperimentalUnitIdentity: nextExperimentalUnitIdentity,
          });
          onObservationsChange(result.observations);
          return null;
        } catch (cause) {
          return locale === "ja" && cause instanceof Error
            ? cause.message
            : t("測定値を適用できませんでした。", "The measured values could not be applied.");
        }
      }}
      onStructuredPaste={(pasted) => {
        const problem = onRectangularPaste(group, pasted);
        return locale === "ja" || !problem
          ? problem
          : "The pasted values could not be applied. Existing values were not changed.";
      }}
    />
  );
}

function CompactTable({
  tableId,
  contract,
  observations,
  model,
  columns,
  onObservationsChange,
  nextObservationId,
  nextExperimentalUnitIdentity,
  editable,
}: Readonly<{
  tableId: string;
  contract: StructureContract;
  observations: readonly CanonicalAdaptiveObservation[];
  model: ReturnType<typeof buildAdaptiveSpreadsheetViewModel>;
  columns: readonly AdaptiveSpreadsheetColumn[];
  onObservationsChange: AdaptiveCanonicalSpreadsheetProps["onObservationsChange"];
  nextObservationId: AdaptiveCanonicalSpreadsheetProps["nextObservationId"];
  nextExperimentalUnitIdentity: AdaptiveCanonicalSpreadsheetProps["nextExperimentalUnitIdentity"];
  editable: boolean;
}>) {
  const locale = useAppLocale();
  const tableLabel = editable
    ? localizedText(locale, "条件ごとにまとめて入力", "Enter values by condition")
    : localizedText(locale, "条件ごとにまとめて表示", "Values grouped by condition");
  const editableGroups = model.compact.rows.flatMap((row) =>
    columns.flatMap((column) => {
      const group = scalarGroupForValueColumn(contract, row, column);
      return group ? [group] : [];
    }),
  );

  const pasteRectangularValues = (
    startGroup: AdaptiveCompactGroup,
    text: string,
  ): string | null => {
    const matrix = parseClipboardMatrix(text);
    const width = Math.max(...matrix.map((row) => row.length));
    const startIndex = editableGroups.findIndex(({ groupKey }) => groupKey === startGroup.groupKey);
    if (startIndex < 0 || startIndex + width > editableGroups.length) {
      return textForLocale(
        "貼り付け範囲が入力表を超えています。既存の値は変更していません。",
        "The pasted range exceeds the worksheet. Existing values were not changed.",
      );
    }
    let next = observations;
    try {
      for (let columnOffset = 0; columnOffset < width; columnOffset += 1) {
        const target = editableGroups[startIndex + columnOffset]!;
        const values = matrix.map((row) => {
          const token = row[columnOffset] ?? "";
          const trimmed = token.trim();
          if (!trimmed) return null;
          const parsed = parseOptionalSpreadsheetNumber(trimmed);
          if (parsed.kind !== "value") {
            throw new Error(
              localizedText(
                locale,
                `数値として読めない値「${trimmed}」があります。`,
                `“${trimmed}” cannot be read as a number.`,
              ),
            );
          }
          return parsed.value;
        });
        const valueKey = scalarReadoutValueKey(contract, target);
        if (!valueKey)
          throw new Error(
            textForLocale(
              "貼り付け先の測定項目を確認できません。",
              "The target measured readout could not be identified.",
            ),
          );
        next = applyCompactScalarEdit(contract, next, {
          targetCoordinates: target.coordinates,
          values,
          valueKey,
          createObservationId: nextObservationId,
          createExperimentalUnitIdentity: nextExperimentalUnitIdentity,
        }).observations;
      }
      onObservationsChange(next);
      return null;
    } catch (cause) {
      return locale === "ja" && cause instanceof Error
        ? cause.message
        : localizedText(
            locale,
            "貼り付けた値を適用できませんでした。",
            "The pasted values could not be applied.",
          );
    }
  };

  return (
    <div className="adaptive-canonical-spreadsheet__table-wrap">
      <table id={tableId} aria-label={tableLabel}>
        <caption>{tableLabel}</caption>
        <thead>
          <tr>
            {columns.map((column) => (
              <th key={column.key} scope="col">
                {columnLabel(column)}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {model.compact.rows.map((row, rowIndex) => {
            return (
              <tr key={row.rowKey}>
                {columns.map((column, columnIndex) => {
                  const targetGroup = scalarGroupForValueColumn(contract, row, column);
                  const isEditableValue = editable && targetGroup !== null;
                  const Cell = columnIndex === 0 ? "th" : "td";
                  return (
                    <Cell
                      key={column.key}
                      data-column-role={column.role}
                      {...(columnIndex === 0 ? { scope: "row" as const } : {})}
                    >
                      {isEditableValue ? (
                        <CompactScalarEditor
                          contract={contract}
                          observations={observations}
                          group={targetGroup!}
                          disabled={!editable}
                          nextObservationId={nextObservationId}
                          nextExperimentalUnitIdentity={nextExperimentalUnitIdentity}
                          onObservationsChange={onObservationsChange}
                          gridRow={rowIndex}
                          gridColumn={columnIndex}
                          onRectangularPaste={pasteRectangularValues}
                        />
                      ) : (
                        <span className="adaptive-canonical-spreadsheet__cell-text">
                          {displayCell(row.cells[column.key] ?? null)}
                        </span>
                      )}
                    </Cell>
                  );
                })}
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}

function ExpandedTable({
  tableId,
  contract,
  columns,
  observations,
  model,
  embedded,
  onObservationsChange,
  onDeleteObservation,
  registerDeleteControl,
  editable,
  nextObservationId,
  nextExperimentalUnitIdentity,
  conditionCombinations,
}: Readonly<{
  tableId: string;
  contract: StructureContract;
  columns: readonly AdaptiveSpreadsheetColumn[];
  observations: readonly CanonicalAdaptiveObservation[];
  model: ReturnType<typeof buildAdaptiveSpreadsheetViewModel>;
  embedded: boolean;
  onObservationsChange: AdaptiveCanonicalSpreadsheetProps["onObservationsChange"];
  onDeleteObservation: (observationId: string, rowIndex: number) => void;
  registerDeleteControl: (observationId: string, control: HTMLButtonElement | null) => void;
  editable: boolean;
  nextObservationId: AdaptiveCanonicalSpreadsheetProps["nextObservationId"];
  nextExperimentalUnitIdentity: AdaptiveCanonicalSpreadsheetProps["nextExperimentalUnitIdentity"];
  conditionCombinations: readonly CanonicalMatrixConditionCombination[];
}>) {
  const locale = useAppLocale();
  const [pasteError, setPasteError] = useState<string | null>(null);
  const entryGroups =
    model.compactEditability.status === "editable"
      ? model.compact.rows.flatMap((row) =>
          row.readoutGroups.filter(
            (group) =>
              scalarReadoutValueKey(contract, group) !== null &&
              canonicalMatrixConditionStatus(
                contract,
                group.coordinates.factors,
                conditionCombinations,
              ) === "performed",
          ),
        )
      : [];
  const appendRectangularValues = (
    startGroup: AdaptiveCompactGroup,
    text: string,
  ): string | null => {
    const matrix = parseClipboardMatrix(text);
    const width = Math.max(...matrix.map((row) => row.length));
    const startIndex = entryGroups.findIndex(({ groupKey }) => groupKey === startGroup.groupKey);
    if (startIndex < 0 || startIndex + width > entryGroups.length) {
      return localizedText(
        locale,
        "貼り付け範囲が入力表を超えています。既存の値は変更していません。",
        "The pasted range exceeds the worksheet. Existing values were not changed.",
      );
    }
    let next = observations;
    try {
      for (let columnOffset = 0; columnOffset < width; columnOffset += 1) {
        const target = entryGroups[startIndex + columnOffset]!;
        const valueKey = scalarReadoutValueKey(contract, target);
        if (!valueKey) {
          throw new Error(
            localizedText(
              locale,
              "貼り付け先の測定項目を確認できません。",
              "The target measured readout could not be identified.",
            ),
          );
        }
        const appended = matrix.map((row) => {
          const trimmed = (row[columnOffset] ?? "").trim();
          if (!trimmed) return null;
          const parsed = parseOptionalSpreadsheetNumber(trimmed);
          if (parsed.kind !== "value") {
            throw new Error(
              textForLocale(
                `数値として読めない値「${trimmed}」があります。`,
                `“${trimmed}” cannot be read as a number.`,
              ),
            );
          }
          return parsed.value;
        });
        const currentGroup = buildAdaptiveSpreadsheetViewModel(contract, next)
          .compact.rows.flatMap((row) => row.readoutGroups)
          .find(({ groupKey }) => groupKey === target.groupKey);
        const currentValues = (currentGroup?.observations ?? []).map((observation) => {
          const value = observation.values[valueKey];
          return typeof value === "number" ? value : null;
        });
        next = applyCompactScalarEdit(contract, next, {
          targetCoordinates: target.coordinates,
          values: [...currentValues, ...appended],
          valueKey,
          createObservationId: nextObservationId,
          createExperimentalUnitIdentity: nextExperimentalUnitIdentity,
        }).observations;
      }
      onObservationsChange(next);
      return null;
    } catch (cause) {
      return locale === "ja" && cause instanceof Error
        ? cause.message
        : localizedText(
            locale,
            "貼り付けた値を適用できませんでした。",
            "The pasted values could not be applied.",
          );
    }
  };
  const pasteExpandedMatrix = (event: ClipboardEvent<HTMLInputElement>) => {
    const text = event.clipboardData.getData("text");
    if (!text.includes("\t") && !/[\r\n]/u.test(text)) return;
    event.preventDefault();
    const matrix = parseClipboardMatrix(text);
    const start = event.currentTarget;
    const startRow = Number(start.dataset.spreadsheetRow);
    const startRowControls = [
      ...(start
        .closest("table")
        ?.querySelectorAll<HTMLInputElement>(
          `[data-spreadsheet-row="${startRow}"][data-expanded-field]`,
        ) ?? []),
    ].sort(
      (left, right) =>
        Number(left.dataset.spreadsheetColumn) - Number(right.dataset.spreadsheetColumn),
    );
    const startColumn = startRowControls.indexOf(start);
    let next = observations;
    try {
      matrix.forEach((tokens, rowOffset) => {
        const row = startRow + rowOffset;
        const controls = [
          ...(start
            .closest("table")
            ?.querySelectorAll<HTMLInputElement>(
              `[data-spreadsheet-row="${row}"][data-expanded-field]`,
            ) ?? []),
        ].sort(
          (left, right) =>
            Number(left.dataset.spreadsheetColumn) - Number(right.dataset.spreadsheetColumn),
        );
        tokens.forEach((token, columnOffset) => {
          const target = controls[startColumn + columnOffset];
          if (!target || target.disabled) {
            throw new Error(
              textForLocale(
                "貼り付け範囲が入力表を超えています。",
                "The pasted range exceeds the worksheet.",
              ),
            );
          }
          const observationId = target.dataset.observationId!;
          const semanticKey = target.dataset.semanticKey!;
          const observation = next.find((candidate) => candidate.observationId === observationId);
          if (!observation)
            throw new Error(
              textForLocale(
                "貼り付け先の記録を確認できません。",
                "The target record could not be identified.",
              ),
            );
          if (target.dataset.expandedField === "identity") {
            next = updateExpandedIdentity({
              contract,
              observation,
              identityKey: semanticKey,
              identity: token,
              observations: next,
            });
          } else {
            const trimmed = token.trim();
            const parsed = parseOptionalSpreadsheetNumber(trimmed);
            if (parsed.kind === "invalid") {
              throw new Error(
                textForLocale(
                  `数値として読めない値「${trimmed}」があります。`,
                  `“${trimmed}” cannot be read as a number.`,
                ),
              );
            }
            const value = parsed.kind === "value" ? parsed.value : null;
            next = updateExpandedValue({
              observationId,
              valueKey: semanticKey,
              value,
              observations: next,
            });
          }
        });
      });
      onObservationsChange(next);
      setPasteError(null);
    } catch (cause) {
      setPasteError(
        `${
          cause instanceof Error
            ? cause.message
            : textForLocale(
                "貼り付けた値を適用できませんでした。",
                "The pasted values could not be applied.",
              )
        } ${textForLocale("既存の値は変更していません。", "Existing values were not changed.")}`,
      );
    }
  };

  return (
    <>
      <div className="adaptive-canonical-spreadsheet__table-wrap">
        <table id={tableId} aria-label={textForLocale("すべての値を表示", "All values")}>
          <caption>{textForLocale("すべての値を表示", "All values")}</caption>
          <thead>
            <tr>
              {columns.map((column) => (
                <th key={column.key} scope="col">
                  {columnLabel(column)}
                </th>
              ))}
              {editable ? <th scope="col">{textForLocale("操作", "Actions")}</th> : null}
            </tr>
          </thead>
          <tbody>
            {model.expanded.rows.map((row, rowIndex) => (
              <tr key={row.rowKey}>
                {columns.map((column, columnIndex) => {
                  const Cell = columnIndex === 0 ? "th" : "td";
                  return (
                    <Cell
                      key={column.key}
                      data-column-role={column.role}
                      {...(columnIndex === 0 ? { scope: "row" as const } : {})}
                    >
                      {editable && column.role === "identity" && column.semanticKey ? (
                        <ExpandedIdentityEditor
                          contract={contract}
                          observation={row.observation}
                          identityKey={column.semanticKey}
                          label={`${expandedRowAccessibleName(
                            contract,
                            row.observation,
                            rowIndex + 1,
                            embedded,
                          )}${textForLocale("の", ": ")}${column.label}`}
                          observations={observations}
                          onObservationsChange={onObservationsChange}
                          gridRow={rowIndex}
                          gridColumn={columnIndex}
                          onPaste={pasteExpandedMatrix}
                        />
                      ) : editable &&
                        column.role === "value" &&
                        column.semanticKey &&
                        (!column.readoutKey || column.readoutKey === row.observation.readoutKey) ? (
                        <ExpandedScalarValueEditor
                          observation={row.observation}
                          valueKey={column.semanticKey}
                          label={`${expandedRowAccessibleName(
                            contract,
                            row.observation,
                            rowIndex + 1,
                            embedded,
                          )}${textForLocale("の", ": ")}${column.label}`}
                          observations={observations}
                          onObservationsChange={onObservationsChange}
                          gridRow={rowIndex}
                          gridColumn={columnIndex}
                          onPaste={pasteExpandedMatrix}
                        />
                      ) : (
                        <span className="adaptive-canonical-spreadsheet__cell-text">
                          {displayCell(row.cells[column.key] ?? null)}
                        </span>
                      )}
                    </Cell>
                  );
                })}
                {editable ? (
                  <td>
                    <button
                      ref={(control) => registerDeleteControl(row.observationId, control)}
                      type="button"
                      aria-label={`${expandedRowAccessibleName(
                        contract,
                        row.observation,
                        rowIndex + 1,
                        embedded,
                      )}${textForLocale("を削除", ": delete row")}`}
                      onClick={() => onDeleteObservation(row.observationId, rowIndex)}
                    >
                      {textForLocale("行を削除", "Delete row")}
                    </button>
                  </td>
                ) : null}
              </tr>
            ))}
            {editable
              ? entryGroups.map((group, entryIndex) => {
                  const valueKey = scalarReadoutValueKey(contract, group)!;
                  const gridRow = model.expanded.rows.length + entryIndex;
                  return (
                    <tr
                      className="adaptive-canonical-spreadsheet__entry-row"
                      key={`entry:${group.groupKey}`}
                    >
                      {columns.map((column, columnIndex) => {
                        const Cell = columnIndex === 0 ? "th" : "td";
                        let content: string | number = "—";
                        if (column.role === "observation_id")
                          content = textForLocale("新しい記録", "New record");
                        else if (column.role === "readout") {
                          content =
                            contract.readouts.find(
                              ({ key }) => key === group.coordinates.readoutKey,
                            )?.label ?? group.coordinates.readoutKey;
                        } else if (column.role === "identity")
                          content = textForLocale(
                            "値の入力後にIDを作成",
                            "Create ID after value entry",
                          );
                        else if (column.role === "factor" && column.semanticKey) {
                          content = group.coordinates.factors[column.semanticKey] ?? "—";
                        } else if (column.role === "axis" && column.semanticKey) {
                          content = group.coordinates.axes[column.semanticKey] ?? "—";
                        } else if (column.role === "hierarchy" && column.semanticKey) {
                          content = group.coordinates.hierarchy[column.semanticKey] ?? "—";
                        }
                        const isTargetValue =
                          column.role === "value" &&
                          column.semanticKey === valueKey &&
                          (!column.readoutKey ||
                            column.readoutKey === group.coordinates.readoutKey);
                        return (
                          <Cell
                            key={column.key}
                            data-column-role={column.role}
                            {...(columnIndex === 0 ? { scope: "row" as const } : {})}
                          >
                            {isTargetValue ? (
                              <ExpandedAppendValueEditor
                                contract={contract}
                                group={group}
                                observations={observations}
                                valueKey={valueKey}
                                label={`${coordinateLabel(contract, group)}${textForLocale("の新しい測定値", ": new measured value")}`}
                                nextObservationId={nextObservationId}
                                nextExperimentalUnitIdentity={nextExperimentalUnitIdentity}
                                onObservationsChange={onObservationsChange}
                                onRectangularPaste={appendRectangularValues}
                                gridRow={gridRow}
                                gridColumn={columnIndex}
                              />
                            ) : (
                              <span className="adaptive-canonical-spreadsheet__cell-text">
                                {content}
                              </span>
                            )}
                          </Cell>
                        );
                      })}
                      <td aria-label={textForLocale("新しい記録の操作", "New-record action")}>
                        {textForLocale("値を入力すると行を追加", "Enter a value to add a row")}
                      </td>
                    </tr>
                  );
                })
              : null}
          </tbody>
        </table>
      </div>
      {pasteError ? (
        <p className="adaptive-canonical-spreadsheet__paste-error" role="alert">
          {pasteError}
        </p>
      ) : null}
    </>
  );
}

function ExpandedIdentityEditor({
  contract,
  observation,
  identityKey,
  label,
  observations,
  onObservationsChange,
  gridRow,
  gridColumn,
  onPaste,
}: Readonly<{
  contract: StructureContract;
  observation: CanonicalAdaptiveObservation;
  identityKey: string;
  label: string;
  observations: readonly CanonicalAdaptiveObservation[];
  onObservationsChange: AdaptiveCanonicalSpreadsheetProps["onObservationsChange"];
  gridRow: number;
  gridColumn: number;
  onPaste: (event: ClipboardEvent<HTMLInputElement>) => void;
}>) {
  const locale = useAppLocale();
  const t = (ja: string, en: string) => localizedText(locale, ja, en);
  const initialText = observation.identities[identityKey] ?? "";

  return (
    <SpreadsheetDraftTextCell
      aria-label={label}
      canonicalText={initialText}
      wrapperClassName="adaptive-canonical-spreadsheet__expanded-editor"
      data-spreadsheet-row={gridRow}
      data-spreadsheet-column={gridColumn}
      data-expanded-field="identity"
      data-observation-id={observation.observationId}
      data-semantic-key={identityKey}
      onPaste={onPaste}
      onCommit={(identity) => {
        try {
          onObservationsChange(
            updateExpandedIdentity({
              contract,
              observation,
              identityKey,
              identity,
              observations,
            }),
          );
          return null;
        } catch (cause) {
          return locale === "ja" && cause instanceof Error
            ? `${cause.message} 入力内容は消えていません。`
            : t(
                "名前を変更できませんでした。入力内容は消えていません。",
                "The ID could not be changed. Your input was retained.",
              );
        }
      }}
    />
  );
}

function ExpandedScalarValueEditor({
  observation,
  valueKey,
  label,
  observations,
  onObservationsChange,
  gridRow,
  gridColumn,
  onPaste,
}: Readonly<{
  observation: CanonicalAdaptiveObservation;
  valueKey: string;
  label: string;
  observations: readonly CanonicalAdaptiveObservation[];
  onObservationsChange: AdaptiveCanonicalSpreadsheetProps["onObservationsChange"];
  gridRow: number;
  gridColumn: number;
  onPaste: (event: ClipboardEvent<HTMLInputElement>) => void;
}>) {
  const locale = useAppLocale();
  const t = (ja: string, en: string) => localizedText(locale, ja, en);
  const value = observation.values[valueKey];
  const initialText = value === null || value === undefined ? "" : String(value);

  return (
    <SpreadsheetDraftTextCell
      wrapperClassName="adaptive-canonical-spreadsheet__expanded-editor"
      canonicalText={initialText}
      inputMode="decimal"
      aria-label={label}
      data-spreadsheet-row={gridRow}
      data-spreadsheet-column={gridColumn}
      data-expanded-field="value"
      data-observation-id={observation.observationId}
      data-semantic-key={valueKey}
      onPaste={onPaste}
      onCommit={(text) => {
        const parsed = parseOptionalSpreadsheetNumber(text);
        if (parsed.kind === "invalid") {
          return t(
            "数値を入力してください。入力内容は消えていません。",
            "Enter a numeric value. Your input was retained.",
          );
        }
        onObservationsChange(
          updateExpandedValue({
            observationId: observation.observationId,
            valueKey,
            value: parsed.kind === "value" ? parsed.value : null,
            observations,
          }),
        );
        return null;
      }}
    />
  );
}

function ExpandedAppendValueEditor({
  contract,
  group,
  observations,
  valueKey,
  label,
  nextObservationId,
  nextExperimentalUnitIdentity,
  onObservationsChange,
  onRectangularPaste,
  gridRow,
  gridColumn,
}: Readonly<{
  contract: StructureContract;
  group: AdaptiveCompactGroup;
  observations: readonly CanonicalAdaptiveObservation[];
  valueKey: string;
  label: string;
  nextObservationId: AdaptiveCanonicalSpreadsheetProps["nextObservationId"];
  nextExperimentalUnitIdentity: AdaptiveCanonicalSpreadsheetProps["nextExperimentalUnitIdentity"];
  onObservationsChange: AdaptiveCanonicalSpreadsheetProps["onObservationsChange"];
  onRectangularPaste: (group: AdaptiveCompactGroup, text: string) => string | null;
  gridRow: number;
  gridColumn: number;
}>) {
  const errorId = useId();
  const locale = useAppLocale();
  const t = (ja: string, en: string) => localizedText(locale, ja, en);
  const [text, setText] = useState("");
  const [dirty, setDirty] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const commit = () => {
    if (!dirty) return;
    const parsed = parseOptionalSpreadsheetNumber(text);
    if (parsed.kind !== "value") {
      setError(
        t(
          "数値を入力してください。入力内容は消えていません。",
          "Enter a numeric value. Your input has not been discarded.",
        ),
      );
      return;
    }
    const value = parsed.value;
    try {
      const currentValues = group.observations.map((observation) => {
        const current = observation.values[valueKey];
        return typeof current === "number" ? current : null;
      });
      const result = applyCompactScalarEdit(contract, observations, {
        targetCoordinates: group.coordinates,
        values: [...currentValues, value],
        valueKey,
        createObservationId: nextObservationId,
        createExperimentalUnitIdentity: nextExperimentalUnitIdentity,
      });
      onObservationsChange(result.observations);
      setText("");
      setDirty(false);
      setError(null);
    } catch (cause) {
      setError(
        locale === "ja" && cause instanceof Error
          ? cause.message
          : t("新しい測定値を追加できませんでした。", "The new measured value could not be added."),
      );
    }
  };

  return (
    <div className="adaptive-canonical-spreadsheet__expanded-editor">
      <input
        type="text"
        inputMode="decimal"
        aria-label={label}
        aria-describedby={error ? errorId : undefined}
        aria-invalid={error ? "true" : undefined}
        placeholder={t("新しい値", "New value")}
        value={text}
        data-spreadsheet-cell="true"
        data-spreadsheet-row={gridRow}
        data-spreadsheet-column={gridColumn}
        onChange={(event) => {
          setText(event.currentTarget.value);
          setDirty(true);
          setError(null);
        }}
        onKeyDown={moveSpreadsheetFocus}
        onPaste={(event) => {
          const pasted = event.clipboardData.getData("text");
          if (!pasted.includes("\t") && !/[\r\n]/u.test(pasted)) return;
          event.preventDefault();
          setError(onRectangularPaste(group, pasted));
        }}
        onBlur={commit}
      />
      {error ? (
        <small id={errorId} role="alert">
          {error}
        </small>
      ) : null}
    </div>
  );
}

const MISSINGNESS_LABELS: Readonly<Record<string, string>> = {
  not_applicable: "対象外",
  not_collected: "未収集",
  assay_failed: "測定失敗",
  dropout: "脱落",
  censored: "打ち切り",
  unknown: "理由不明",
};

const ENGLISH_MISSINGNESS_LABELS: Readonly<Record<string, string>> = {
  not_applicable: "Not applicable",
  not_collected: "Not collected",
  assay_failed: "Assay failed",
  dropout: "Dropout",
  censored: "Censored",
  unknown: "Unknown reason",
};

function recordEntryFieldLabel(
  contract: StructureContract,
  levelKey: string,
  locale: AppLocale,
): string {
  const level = contract.unitLevels.find(({ key }) => key === levelKey);
  const parent = level?.parentKey
    ? contract.unitLevels.find(({ key }) => key === level.parentKey)
    : null;
  return parent
    ? localizedText(
        locale,
        `${level?.label ?? levelKey}（${parent.label}との対応ID）`,
        `${level?.label ?? levelKey} (ID matched to ${parent.label})`,
      )
    : (level?.label ?? levelKey);
}

function updateRecordEntryDraft(
  draft: AdaptiveRecordEntryDraft,
  section: "identities" | "factors" | "axes" | "hierarchy" | "values" | "missingness",
  key: string,
  value: string,
): AdaptiveRecordEntryDraft {
  return { ...draft, [section]: { ...draft[section], [key]: value } } as AdaptiveRecordEntryDraft;
}

function GenericAdaptiveRecordEntry({
  contract,
  observations,
  conditionCombinations,
  nextObservationId,
  onObservationsChange,
}: Readonly<{
  contract: StructureContract;
  observations: readonly CanonicalAdaptiveObservation[];
  conditionCombinations: readonly CanonicalMatrixConditionCombination[];
  nextObservationId: AdaptiveCanonicalSpreadsheetProps["nextObservationId"];
  onObservationsChange: AdaptiveCanonicalSpreadsheetProps["onObservationsChange"];
}>) {
  const locale = useAppLocale();
  const t = (ja: string, en: string) => localizedText(locale, ja, en);
  const [draft, setDraft] = useState<AdaptiveRecordEntryDraft>(() =>
    createEmptyAdaptiveRecordEntryDraft(contract),
  );
  const [error, setError] = useState<string | null>(null);
  const readout = recordEntryReadout(contract, draft.readoutKey);
  const identityFields = recordEntryIdentityFields(contract, draft.readoutKey);
  const hierarchyFields = recordEntryHierarchyFields(contract, draft.readoutKey);
  const update = (
    section: "identities" | "factors" | "axes" | "hierarchy" | "values" | "missingness",
    key: string,
    value: string,
  ) => {
    setDraft((current) => updateRecordEntryDraft(current, section, key, value));
    setError(null);
  };
  const changeReadout = (readoutKey: string) => {
    setDraft(createEmptyAdaptiveRecordEntryDraft(contract, readoutKey));
    setError(null);
  };
  const submit = (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    try {
      const conditionStatus = canonicalMatrixConditionStatus(
        contract,
        draft.factors,
        conditionCombinations,
      );
      if (conditionStatus !== "performed") {
        throw new Error(
          conditionStatus === "not_performed"
            ? t(
                "この条件は実施していないため、測定行を追加できません。",
                "A measurement row cannot be added because this condition was not performed.",
              )
            : t(
                "この条件を実施したか確認してから、測定行を追加してください。",
                "Confirm whether this condition was performed before adding a measurement row.",
              ),
        );
      }
      const candidate = buildAdaptiveRecordEntryObservation({
        contract,
        observations,
        draft,
        nextObservationId,
        ordinal: observations.length + 1,
      });
      onObservationsChange([...observations, candidate]);
      setDraft(createEmptyAdaptiveRecordEntryDraft(contract));
      setError(null);
    } catch (cause) {
      setError(
        locale === "ja" && cause instanceof Error
          ? `${cause.message} 入力内容は変更していません。`
          : t(
              "測定行を追加できませんでした。入力内容は変更していません。",
              "The measurement row could not be added. Review the entered identifiers, conditions, and values. Your input was not changed.",
            ),
      );
    }
  };

  return (
    <div className="adaptive-canonical-spreadsheet__record-entry">
      <form
        aria-label={t("新しい測定記録を追加", "Add a new measurement record")}
        onSubmit={submit}
      >
        <div className="adaptive-canonical-spreadsheet__record-entry-heading">
          <div>
            <h3>{t("新しい測定記録", "New measurement record")}</h3>
            <p>
              {t(
                "この1行に、1つの対象・試料から得た1つの測定を入力します。",
                "Enter one measurement from one subject or specimen in this row.",
              )}
            </p>
          </div>
          <span>
            {t(
              "入力がそろうまで既存データは変更されません",
              "Existing data is unchanged until the entry is complete",
            )}
          </span>
        </div>

        {contract.readouts.length > 1 ? (
          <label>
            {t("測定項目", "Readout")}
            <select
              aria-label={t("測定項目", "Readout")}
              required
              value={draft.readoutKey}
              onChange={(event) => changeReadout(event.currentTarget.value)}
            >
              <option value="">{t("選択してください", "Select")}</option>
              {contract.readouts.map((candidate) => (
                <option key={candidate.key} value={candidate.key}>
                  {candidate.label}
                </option>
              ))}
            </select>
          </label>
        ) : readout ? (
          <p className="adaptive-canonical-spreadsheet__record-entry-fixed-readout">
            {t("測定項目：", "Readout: ")}
            <strong>{readout.label}</strong>
          </p>
        ) : null}

        <div className="adaptive-canonical-spreadsheet__record-entry-fields">
          {identityFields.map((identity) => (
            <label key={identity.key}>
              {identity.label}
              <input
                type="text"
                required
                aria-label={identity.label}
                value={draft.identities[identity.key] ?? ""}
                placeholder={t(
                  `${identity.label}（例：dish-01）`,
                  `${identity.label} (example: dish-01)`,
                )}
                onChange={(event) => update("identities", identity.key, event.currentTarget.value)}
              />
            </label>
          ))}

          {contract.factors.map((factor) => (
            <label key={factor.key}>
              {factor.label}
              <select
                required
                aria-label={factor.label}
                value={draft.factors[factor.key] ?? ""}
                onChange={(event) => update("factors", factor.key, event.currentTarget.value)}
              >
                {factor.levels.length === 1 ? null : (
                  <option value="">{t("選択してください", "Select")}</option>
                )}
                {factor.levels.map((level) => (
                  <option key={level} value={level}>
                    {level}
                  </option>
                ))}
              </select>
            </label>
          ))}

          {(readout?.axisKeys ?? []).map((axisKey) => {
            const axis = contract.orderedAxes.find(({ key }) => key === axisKey);
            if (!axis) return null;
            return (
              <label key={axis.key}>
                {axis.label}
                {axis.unit.trim() ? t(`（${axis.unit.trim()}）`, ` (${axis.unit.trim()})`) : ""}
                {axis.levels.length > 0 ? (
                  <select
                    required
                    aria-label={axis.label}
                    value={draft.axes[axis.key] ?? ""}
                    onChange={(event) => update("axes", axis.key, event.currentTarget.value)}
                  >
                    {axis.levels.length === 1 ? null : (
                      <option value="">{t("選択してください", "Select")}</option>
                    )}
                    {axis.levels.map((level) => (
                      <option key={String(level)} value={String(level)}>
                        {String(level)}
                      </option>
                    ))}
                  </select>
                ) : (
                  <input
                    type="text"
                    required
                    aria-label={axis.label}
                    value={draft.axes[axis.key] ?? ""}
                    onChange={(event) => update("axes", axis.key, event.currentTarget.value)}
                  />
                )}
              </label>
            );
          })}

          {hierarchyFields.map((level) => (
            <label key={level.key}>
              {recordEntryFieldLabel(contract, level.key, locale)}
              <input
                type="text"
                required
                aria-label={recordEntryFieldLabel(contract, level.key, locale)}
                value={draft.hierarchy[level.key] ?? ""}
                placeholder={t("例：dish-01", "Example: dish-01")}
                onChange={(event) => update("hierarchy", level.key, event.currentTarget.value)}
              />
            </label>
          ))}

          {readout?.componentKeys.map((component, componentIndex) => {
            const valueKey = readout ? recordEntryValueKey(readout, component) : component;
            const componentLabel =
              locale === "ja"
                ? recordEntryComponentLabel(component, componentIndex)
                : ["numerator", "positive", "success", "event"].includes(component.toLowerCase())
                  ? "Positive / event count"
                  : ["denominator", "total", "eligible", "count"].includes(component.toLowerCase())
                    ? "Total count"
                    : component || `Value ${componentIndex + 1}`;
            const valueLabel = `${readout?.label ?? t("測定値", "Measurement")}${t("・", " · ")}${componentLabel}`;
            const booleanValue = readout ? recordEntryUsesBooleanValue(readout, component) : false;
            const numericValue = readout ? recordEntryUsesNumericValue(readout, component) : false;
            return (
              <div
                className="adaptive-canonical-spreadsheet__record-entry-measurement"
                key={valueKey}
              >
                <label>
                  {valueLabel}
                  {booleanValue ? (
                    <select
                      aria-label={valueLabel}
                      value={draft.values[valueKey] ?? ""}
                      onChange={(event) => update("values", valueKey, event.currentTarget.value)}
                    >
                      <option value="">{t("値を選択", "Select a value")}</option>
                      <option value="true">{t("はい", "Yes")}</option>
                      <option value="false">{t("いいえ", "No")}</option>
                    </select>
                  ) : (
                    <input
                      type="text"
                      inputMode={numericValue ? "decimal" : "text"}
                      aria-label={valueLabel}
                      value={draft.values[valueKey] ?? ""}
                      onChange={(event) => update("values", valueKey, event.currentTarget.value)}
                    />
                  )}
                </label>
                <label>
                  {t("欠測理由（任意）", "Missingness reason (optional)")}
                  <select
                    aria-label={t(
                      `${valueLabel}の欠測理由`,
                      `Missingness reason for ${valueLabel}`,
                    )}
                    value={draft.missingness[valueKey] ?? ""}
                    onChange={(event) => update("missingness", valueKey, event.currentTarget.value)}
                  >
                    <option value="">{t("値を入力", "Enter a value")}</option>
                    {contract.allowedMissingness.map((reason) => (
                      <option key={reason} value={reason}>
                        {locale === "ja"
                          ? (MISSINGNESS_LABELS[reason] ?? reason)
                          : (ENGLISH_MISSINGNESS_LABELS[reason] ?? reason)}
                      </option>
                    ))}
                  </select>
                </label>
              </div>
            );
          })}
        </div>

        <button type="submit">{t("測定行を追加", "Add measurement row")}</button>
        {error ? <p role="alert">{error}</p> : null}
      </form>
    </div>
  );
}

export function AdaptiveCanonicalSpreadsheet({
  contract,
  observations,
  mode,
  onModeChange,
  onObservationsChange,
  onFileImport,
  nextObservationId,
  nextExperimentalUnitIdentity,
  embedded = false,
  readOnly = false,
  worksheetRows,
  conditionCombinations = [],
  showExperimentDate = false,
  onWorksheetRowChange,
}: AdaptiveCanonicalSpreadsheetProps) {
  const locale = useAppLocale();
  const t = (ja: string, en: string) => localizedText(locale, ja, en);
  const headingId = useId();
  const tableId = useId();
  const modeNoteId = useId();
  const compactModeControlRef = useRef<HTMLButtonElement | null>(null);
  const expandedDeleteControlRefs = useRef(new Map<string, HTMLButtonElement>());
  const pendingExpandedDeletionFocusRef = useRef<readonly string[] | null>(null);
  const {
    zoom: worksheetZoom,
    setZoom: setWorksheetZoom,
    changeZoom: changeWorksheetZoom,
  } = useSpreadsheetZoom(WORKSHEET_ZOOM_STORAGE_KEY);
  // The persisted two-state view mode remains backwards compatible.  The
  // condition sheet and the optional multi-value editor are two presentations
  // within its compact branch, so older projects do not need a schema change.
  const [continuousPresentation, setContinuousPresentation] =
    useState<ContinuousWorksheetPresentation>("condition_sheet");
  const continuousWorksheet = worksheetRows !== undefined;
  const model = useMemo(
    () => buildAdaptiveSpreadsheetViewModel(contract, observations),
    [contract, observations],
  );
  const matrixEligible = !continuousWorksheet || canEditCanonicalMatrix(contract, observations);
  const compactEntryEligible =
    continuousWorksheet &&
    !readOnly &&
    matrixEligible &&
    model.compactEditability.status === "editable" &&
    conditionCombinations.every(({ status }) => status === "performed");
  const effectiveContinuousPresentation = compactEntryEligible
    ? continuousPresentation
    : "condition_sheet";
  const effectiveMode = continuousWorksheet && !matrixEligible ? "expanded" : mode;
  const compactEntryActive =
    continuousWorksheet &&
    effectiveMode === "compact" &&
    effectiveContinuousPresentation === "compact_entry";
  const displayColumns = useMemo(
    () =>
      visibleColumns(
        model.columns,
        effectiveMode,
        embedded,
        observations.some(({ sourceRow }) => sourceRow !== null),
      ),
    [effectiveMode, embedded, model.columns, observations],
  );
  const editable =
    !readOnly &&
    (continuousWorksheet
      ? matrixEligible || model.compactEditability.status === "expanded_required"
      : true);
  const compactEditable = editable && model.compactEditability.status === "editable";
  const compactDisabled = continuousWorksheet ? !compactEntryEligible : !compactEditable;
  const interactionLabel = editable
    ? t("測定値を入力", "Enter measurements")
    : t("測定値を確認", "Review measurements");

  useEffect(() => {
    if (continuousWorksheet && !matrixEligible && mode === "compact") {
      onModeChange("expanded");
    }
  }, [continuousWorksheet, matrixEligible, mode, onModeChange]);

  useLayoutEffect(() => {
    const candidates = pendingExpandedDeletionFocusRef.current;
    if (!candidates) return;
    pendingExpandedDeletionFocusRef.current = null;
    const target = candidates
      .map((observationId) => expandedDeleteControlRefs.current.get(observationId))
      .find((control): control is HTMLButtonElement => Boolean(control));
    (target ?? compactModeControlRef.current)?.focus({ preventScroll: true });
  }, [observations]);

  const registerExpandedDeleteControl = (
    observationId: string,
    control: HTMLButtonElement | null,
  ) => {
    if (control) expandedDeleteControlRefs.current.set(observationId, control);
    else expandedDeleteControlRefs.current.delete(observationId);
  };

  const deleteExpandedObservation = (observationId: string, rowIndex: number) => {
    pendingExpandedDeletionFocusRef.current = [
      model.expanded.rows[rowIndex + 1]?.observationId,
      model.expanded.rows[rowIndex - 1]?.observationId,
    ].filter((candidate): candidate is string => Boolean(candidate));
    onObservationsChange(
      observations.filter((observation) => observation.observationId !== observationId),
    );
  };

  return (
    <section
      className="adaptive-canonical-spreadsheet"
      aria-labelledby={embedded ? undefined : headingId}
      aria-label={embedded ? interactionLabel : undefined}
      aria-describedby={modeNoteId}
    >
      <div className="adaptive-canonical-spreadsheet__heading">
        {!embedded ? (
          <div>
            <h2 id={headingId}>{interactionLabel}</h2>
            <p>
              {t(
                "2つの表示は同じ測定記録を参照します。表示を変えても値やIDは複製されません。",
                "Both views reference the same measurement records. Switching views does not duplicate values or IDs.",
              )}
            </p>
          </div>
        ) : null}
        <div className="adaptive-canonical-spreadsheet__table-controls">
          <div
            className="adaptive-canonical-spreadsheet__view-switch"
            role="group"
            aria-label={t("入力表の表示", "Data-table view")}
          >
            <button
              ref={compactModeControlRef}
              type="button"
              aria-controls={tableId}
              aria-pressed={
                effectiveMode === "compact" && effectiveContinuousPresentation === "condition_sheet"
              }
              disabled={continuousWorksheet && !matrixEligible}
              onClick={() => {
                if (continuousWorksheet) setContinuousPresentation("condition_sheet");
                onModeChange("compact");
              }}
            >
              {continuousWorksheet
                ? t("条件別シート", "Condition sheet")
                : editable
                  ? t("まとめて入力", "Grouped entry")
                  : t("まとめて表示", "Grouped view")}
            </button>
            {continuousWorksheet && compactEntryEligible ? (
              <button
                type="button"
                aria-controls={tableId}
                aria-pressed={compactEntryActive}
                onClick={() => {
                  setContinuousPresentation("compact_entry");
                  onModeChange("compact");
                }}
              >
                {t("まとめて入力", "Grouped entry")}
              </button>
            ) : null}
            <button
              type="button"
              aria-controls={tableId}
              aria-pressed={effectiveMode === "expanded"}
              onClick={() => {
                if (continuousWorksheet) setContinuousPresentation("condition_sheet");
                onModeChange("expanded");
              }}
            >
              {continuousWorksheet
                ? t("1測定1行", "One measurement per row")
                : t("すべての値", "All values")}
            </button>
          </div>
          <div
            className="adaptive-canonical-spreadsheet__zoom-control"
            role="group"
            aria-label={t("シートの拡大縮小", "Worksheet zoom")}
          >
            <span aria-hidden="true">{t("表示倍率", "Zoom")}</span>
            <button
              type="button"
              aria-label={t("シートを縮小", "Zoom out")}
              disabled={worksheetZoom <= SPREADSHEET_ZOOM_LEVELS[0]}
              onClick={() => changeWorksheetZoom(-1)}
            >
              −
            </button>
            <select
              aria-label={t("表の表示倍率", "Worksheet zoom level")}
              value={worksheetZoom}
              onChange={(event) => setWorksheetZoom(Number(event.currentTarget.value))}
            >
              {SPREADSHEET_ZOOM_LEVELS.map((level) => (
                <option key={level} value={level}>
                  {level}%
                </option>
              ))}
            </select>
            <button
              type="button"
              aria-label={t("シートを拡大", "Zoom in")}
              disabled={
                worksheetZoom >= SPREADSHEET_ZOOM_LEVELS[SPREADSHEET_ZOOM_LEVELS.length - 1]
              }
              onClick={() => changeWorksheetZoom(1)}
            >
              +
            </button>
            <span
              className="adaptive-canonical-spreadsheet__zoom-status"
              aria-live="polite"
              aria-atomic="true"
            >
              {t("表の表示倍率", "Worksheet zoom")} {worksheetZoom}%
            </span>
          </div>
        </div>
      </div>

      <p id={modeNoteId} className="adaptive-canonical-spreadsheet__mode-note" role="status">
        {continuousWorksheet
          ? !matrixEligible
            ? t(
                "この構造は、対象ID・階層・時間の対応を隠さない1測定1行の表で表示します。",
                "This structure is shown as one measurement per row so unit IDs, hierarchy, and time relationships remain explicit.",
              )
            : compactEntryActive
              ? t(
                  "これは平均や統合を行う機能ではなく、同じ条件の値を1セル内に改行して入力します。各測定を別々に保持し、IDは「1測定1行」で確認できます。",
                  "This view does not average or merge values. Enter values for one condition on separate lines within a cell. Each measurement remains separate; inspect IDs in One measurement per row.",
                )
              : readOnly
                ? t(
                    "元の表との対応と取込履歴を保つため読み取り専用です。1測定1行へ切り替えると、各IDと元データ行を確認できます。",
                    "This view is read-only to preserve source-table mapping and import history. Switch to One measurement per row to inspect IDs and source rows.",
                  )
                : effectiveMode === "compact"
                  ? contract.matching.kind === "independent"
                    ? t(
                        "1セルに1つの値を入力します。横一行は条件ごとの値を見やすく並べる表示位置で、同じ実験日・実験回・pairを意味しません。この表示では条件ごとの実験日は入力できません。",
                        "Enter one value per cell. A horizontal row is only a convenient alignment across conditions; it does not imply the same date, run, or pair. Condition-specific experiment dates cannot be entered in this view.",
                      )
                    : t(
                        "1セルに1つの値を入力します。行の対応は、先に確認した実験構造を保持します。",
                        "Enter one value per cell. Row matching preserves the experiment structure confirmed earlier.",
                      )
                  : t(
                      "1測定1行で、対象ID・条件・値を確認・編集します。表示を変えても同じ記録です。",
                      "Review and edit the unit ID, condition, and value with one measurement per row. Both views use the same records.",
                    )
          : compactDisabled
            ? readOnly
              ? t(
                  "元の表との対応と取込履歴を保つため、この画面では読み取り専用です。「すべての値」で各IDと元データ行を確認できます。",
                  "This view is read-only to preserve source mapping and import history. Use All values to inspect IDs and source rows.",
                )
              : locale === "ja"
                ? `${model.compactEditability.explanation} 「すべての値」でIDと内訳を確認できます。`
                : "This structure requires the expanded view. Use All values to inspect IDs and details."
            : effectiveMode === "compact"
              ? t(
                  "同じ条件の値を改行して入力します。矩形貼り付けと途中の空欄をそのまま保持します。",
                  "Enter values for the same condition on separate lines. Rectangular paste and internal blanks are preserved.",
                )
              : t(
                  "1測定1行でIDと値を編集します。表示を変えても値やIDは変わりません。",
                  "Edit IDs and values with one measurement per row. Switching views does not change values or IDs.",
                )}
      </p>

      <div
        className="adaptive-canonical-spreadsheet__zoom-surface"
        style={
          {
            "--adaptive-sheet-zoom": String(worksheetZoom / 100),
          } as CSSProperties
        }
      >
        {editable && model.compactEditability.status === "expanded_required" ? (
          <GenericAdaptiveRecordEntry
            contract={contract}
            observations={observations}
            conditionCombinations={conditionCombinations}
            nextObservationId={nextObservationId}
            onObservationsChange={onObservationsChange}
          />
        ) : null}
        {effectiveMode === "compact" ? (
          continuousWorksheet && !compactEntryActive ? (
            <CanonicalMatrixWorksheet
              tableId={tableId}
              contract={contract}
              observations={observations}
              rows={worksheetRows}
              conditionCombinations={conditionCombinations}
              showExperimentDate={showExperimentDate}
              onRowChange={onWorksheetRowChange}
              onObservationsChange={onObservationsChange}
              onFileImport={onFileImport}
              nextObservationId={nextObservationId}
              nextExperimentalUnitIdentity={nextExperimentalUnitIdentity}
              readOnly={readOnly}
            />
          ) : continuousWorksheet ? (
            <CompactTable
              tableId={tableId}
              contract={contract}
              observations={observations}
              model={model}
              columns={displayColumns}
              onObservationsChange={onObservationsChange}
              nextObservationId={nextObservationId}
              nextExperimentalUnitIdentity={nextExperimentalUnitIdentity}
              editable={compactEditable}
            />
          ) : (
            <CompactTable
              tableId={tableId}
              contract={contract}
              observations={observations}
              model={model}
              columns={displayColumns}
              onObservationsChange={onObservationsChange}
              nextObservationId={nextObservationId}
              nextExperimentalUnitIdentity={nextExperimentalUnitIdentity}
              editable={compactEditable}
            />
          )
        ) : (
          <ExpandedTable
            tableId={tableId}
            observations={observations}
            model={model}
            contract={contract}
            columns={displayColumns}
            embedded={embedded}
            onObservationsChange={onObservationsChange}
            onDeleteObservation={deleteExpandedObservation}
            registerDeleteControl={registerExpandedDeleteControl}
            editable={editable}
            nextObservationId={nextObservationId}
            nextExperimentalUnitIdentity={nextExperimentalUnitIdentity}
            conditionCombinations={conditionCombinations}
          />
        )}
      </div>
    </section>
  );
}

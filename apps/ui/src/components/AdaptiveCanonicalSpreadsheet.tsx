import { useEffect, useId, useLayoutEffect, useMemo, useRef, useState } from "react";

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

import "./AdaptiveCanonicalSpreadsheet.css";

export type AdaptiveCanonicalSpreadsheetProps = Readonly<{
  contract: StructureContract;
  observations: readonly CanonicalAdaptiveObservation[];
  mode: AdaptiveObservationViewMode;
  onModeChange: (mode: AdaptiveObservationViewMode) => void;
  onObservationsChange: (observations: readonly CanonicalAdaptiveObservation[]) => void;
  nextObservationId: (context: CompactScalarObservationIdFactoryContext) => string;
  nextExperimentalUnitIdentity?: (
    context: CompactScalarObservationIdFactoryContext & { observationId: string },
  ) => string;
  embedded?: boolean;
  readOnly?: boolean;
}>;

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
    const trimmed = token.trim();
    if (!trimmed) return null;
    const parsed = Number(trimmed);
    return Number.isFinite(parsed) ? parsed : null;
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
    .map(
      ([key, value]) =>
        `${contract.orderedAxes.find((axis) => axis.key === key)?.label ?? key}=${value}`,
    )
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
  if (column.role === "observation_id") return "記録ID";
  if (column.role === "source_row") return "元データ行";
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
  return identity?.trim() || `実験単位 ${rowNumber}`;
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

function CompactScalarEditor({
  contract,
  observations,
  group,
  disabled,
  nextObservationId,
  nextExperimentalUnitIdentity,
  onObservationsChange,
}: Readonly<{
  contract: StructureContract;
  observations: readonly CanonicalAdaptiveObservation[];
  group: AdaptiveCompactGroup;
  disabled: boolean;
  nextObservationId: AdaptiveCanonicalSpreadsheetProps["nextObservationId"];
  nextExperimentalUnitIdentity: AdaptiveCanonicalSpreadsheetProps["nextExperimentalUnitIdentity"];
  onObservationsChange: AdaptiveCanonicalSpreadsheetProps["onObservationsChange"];
}>) {
  const errorId = useId();
  const valueKey = scalarReadoutValueKey(contract, group);
  const initialText = valueKey ? compactText(group, valueKey) : "";
  const [text, setText] = useState(initialText);
  const [dirty, setDirty] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    setText(initialText);
    setDirty(false);
    setError(null);
  }, [initialText]);

  if (!valueKey) return <span aria-label="測定値なし">—</span>;

  const readoutLabel =
    contract.readouts.find(({ key }) => key === group.coordinates.readoutKey)?.label ??
    group.coordinates.readoutKey;
  const label = `${readoutLabel}・${coordinateLabel(contract, group)}の測定値`;
  const commit = () => {
    if (disabled || !dirty) return;
    const values = parseCompactScalarText(text);
    if (!values) {
      setError("数値を改行またはタブで入力してください。入力内容は消えていません。");
      return;
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
      setError(null);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "測定値を適用できませんでした。");
    }
  };

  return (
    <div className="adaptive-canonical-spreadsheet__compact-editor">
      <textarea
        aria-label={label}
        aria-describedby={error ? errorId : undefined}
        aria-invalid={error ? "true" : undefined}
        disabled={disabled}
        rows={Math.min(6, Math.max(2, group.observations.length || 2))}
        value={text}
        onBlur={commit}
        onChange={(event) => {
          setText(event.currentTarget.value);
          setDirty(true);
          setError(null);
        }}
      />
      {error ? (
        <small id={errorId} role="alert">
          {error}
        </small>
      ) : null}
    </div>
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
  const tableLabel = editable ? "条件ごとにまとめて入力" : "条件ごとにまとめて表示";

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
          {model.compact.rows.map((row) => {
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
}>) {
  return (
    <div className="adaptive-canonical-spreadsheet__table-wrap">
      <table id={tableId} aria-label="すべての値を表示">
        <caption>すべての値を表示</caption>
        <thead>
          <tr>
            {columns.map((column) => (
              <th key={column.key} scope="col">
                {columnLabel(column)}
              </th>
            ))}
            {editable ? <th scope="col">操作</th> : null}
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
                    {editable && embedded && column.role === "identity" && column.semanticKey ? (
                      <ExpandedIdentityEditor
                        contract={contract}
                        observation={row.observation}
                        identityKey={column.semanticKey}
                        label={`${expandedRowAccessibleName(
                          contract,
                          row.observation,
                          rowIndex + 1,
                          embedded,
                        )}の${column.label}`}
                        observations={observations}
                        onObservationsChange={onObservationsChange}
                      />
                    ) : editable && column.role === "value" && column.semanticKey ? (
                      <ExpandedScalarValueEditor
                        observation={row.observation}
                        valueKey={column.semanticKey}
                        label={`${expandedRowAccessibleName(
                          contract,
                          row.observation,
                          rowIndex + 1,
                          embedded,
                        )}の${column.label}`}
                        observations={observations}
                        onObservationsChange={onObservationsChange}
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
                    )}を削除`}
                    onClick={() => onDeleteObservation(row.observationId, rowIndex)}
                  >
                    行を削除
                  </button>
                </td>
              ) : null}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

function ExpandedIdentityEditor({
  contract,
  observation,
  identityKey,
  label,
  observations,
  onObservationsChange,
}: Readonly<{
  contract: StructureContract;
  observation: CanonicalAdaptiveObservation;
  identityKey: string;
  label: string;
  observations: readonly CanonicalAdaptiveObservation[];
  onObservationsChange: AdaptiveCanonicalSpreadsheetProps["onObservationsChange"];
}>) {
  const errorId = useId();
  const initialText = observation.identities[identityKey] ?? "";
  const [text, setText] = useState(initialText);
  const [dirty, setDirty] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    setText(initialText);
    setDirty(false);
    setError(null);
  }, [initialText]);

  const commit = () => {
    if (!dirty) return;
    const identity = text.trim();
    if (!identity) {
      setError("対象・試料を区別する名前を入力してください。入力内容は消えていません。");
      return;
    }
    // A canonical observation is one readout at one coordinate.  The same
    // biological unit can therefore legitimately occur in several records
    // (for example, one row for response and one for cell count).  Keep those
    // records linked when an identity is corrected in the expanded sheet.
    // Blank identities are deliberately not grouped: without an existing
    // identity there is no safe evidence that two records refer to the same
    // unit.
    const relatedObservationIds = relatedIdentityObservationIds({
      contract,
      observation,
      identityKey,
      observations,
    });
    if (
      observations.some(
        (candidate) =>
          !relatedObservationIds.has(candidate.observationId) &&
          candidate.identities[identityKey]?.trim() === identity,
      )
    ) {
      setError("同じ名前がすでにあります。別の対象・試料には異なる名前を付けてください。");
      return;
    }
    const next = observations.map((candidate) =>
      relatedObservationIds.has(candidate.observationId)
        ? CanonicalAdaptiveObservationSchema.parse({
            ...candidate,
            identities: { ...candidate.identities, [identityKey]: identity },
          })
        : candidate,
    );
    onObservationsChange(next);
    setDirty(false);
    setError(null);
  };

  return (
    <div className="adaptive-canonical-spreadsheet__expanded-editor">
      <input
        type="text"
        aria-label={label}
        aria-describedby={error ? errorId : undefined}
        aria-invalid={error ? "true" : undefined}
        value={text}
        onChange={(event) => {
          setText(event.currentTarget.value);
          setDirty(true);
          setError(null);
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

function ExpandedScalarValueEditor({
  observation,
  valueKey,
  label,
  observations,
  onObservationsChange,
}: Readonly<{
  observation: CanonicalAdaptiveObservation;
  valueKey: string;
  label: string;
  observations: readonly CanonicalAdaptiveObservation[];
  onObservationsChange: AdaptiveCanonicalSpreadsheetProps["onObservationsChange"];
}>) {
  const errorId = useId();
  const value = observation.values[valueKey];
  const initialText = value === null || value === undefined ? "" : String(value);
  const [text, setText] = useState(initialText);
  const [dirty, setDirty] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    setText(initialText);
    setDirty(false);
    setError(null);
  }, [initialText]);

  const commit = () => {
    if (!dirty) return;
    const trimmed = text.trim();
    const nextValue = trimmed === "" ? null : Number(trimmed);
    if (nextValue !== null && !Number.isFinite(nextValue)) {
      setError("数値を入力してください。入力内容は消えていません。");
      return;
    }
    const next = observations.map((candidate) => {
      if (candidate.observationId !== observation.observationId) return candidate;
      const missingness = { ...candidate.missingness };
      if (nextValue === null) missingness[valueKey] = missingness[valueKey] ?? "unknown";
      else delete missingness[valueKey];
      const updatedObservation = {
        ...candidate,
        values: { ...candidate.values, [valueKey]: nextValue },
        missingness,
      };
      const parsed = CanonicalAdaptiveObservationSchema.parse(updatedObservation);
      return { ...updatedObservation, missingness: parsed.missingness };
    });
    onObservationsChange(next);
    setError(null);
  };

  return (
    <div className="adaptive-canonical-spreadsheet__expanded-editor">
      <input
        type="text"
        inputMode="decimal"
        aria-label={label}
        aria-describedby={error ? errorId : undefined}
        aria-invalid={error ? "true" : undefined}
        value={text}
        onChange={(event) => {
          setText(event.currentTarget.value);
          setDirty(true);
          setError(null);
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

export function AdaptiveCanonicalSpreadsheet({
  contract,
  observations,
  mode,
  onModeChange,
  onObservationsChange,
  nextObservationId,
  nextExperimentalUnitIdentity,
  embedded = false,
  readOnly = false,
}: AdaptiveCanonicalSpreadsheetProps) {
  const headingId = useId();
  const tableId = useId();
  const modeNoteId = useId();
  const compactModeControlRef = useRef<HTMLButtonElement | null>(null);
  const expandedDeleteControlRefs = useRef(new Map<string, HTMLButtonElement>());
  const pendingExpandedDeletionFocusRef = useRef<readonly string[] | null>(null);
  const model = useMemo(
    () => buildAdaptiveSpreadsheetViewModel(contract, observations),
    [contract, observations],
  );
  const displayColumns = useMemo(
    () =>
      visibleColumns(
        model.columns,
        mode,
        embedded,
        observations.some(({ sourceRow }) => sourceRow !== null),
      ),
    [embedded, mode, model.columns, observations],
  );
  const editable = !readOnly && model.compactEditability.status === "editable";
  const compactDisabled = !editable;
  const interactionLabel = editable ? "測定値を入力" : "測定値を確認";

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
            <p>2つの表示は同じ測定記録を参照します。表示を変えても値やIDは複製されません。</p>
          </div>
        ) : null}
        <div
          className="adaptive-canonical-spreadsheet__view-switch"
          role="group"
          aria-label="入力表の表示"
        >
          <button
            ref={compactModeControlRef}
            type="button"
            aria-controls={tableId}
            aria-pressed={mode === "compact"}
            onClick={() => onModeChange("compact")}
          >
            {editable ? "まとめて入力" : "まとめて表示"}
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

      <p id={modeNoteId} className="adaptive-canonical-spreadsheet__mode-note" role="status">
        {compactDisabled
          ? readOnly
            ? "元の表との対応と取込履歴を保つため、この画面では読み取り専用です。「すべての値」で各IDと元データ行を確認できます。"
            : `${model.compactEditability.explanation} 「すべての値」でIDと内訳を確認できます。`
          : mode === "compact"
            ? "同じ条件の値は改行またはタブでまとめて入力できます。途中の空欄は欠測として保持され、入力を空にするとその条件の記録を削除します。"
            : "各測定記録を1行ずつ確認・編集できます。まとめて入力へ戻っても値やIDは変わりません。"}
      </p>

      {mode === "compact" ? (
        <CompactTable
          tableId={tableId}
          contract={contract}
          observations={observations}
          model={model}
          columns={displayColumns}
          onObservationsChange={onObservationsChange}
          nextObservationId={nextObservationId}
          nextExperimentalUnitIdentity={nextExperimentalUnitIdentity}
          editable={editable}
        />
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
        />
      )}
    </section>
  );
}

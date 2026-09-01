import { useEffect, useMemo, useRef, useState, type ClipboardEvent } from "react";

import type { CompactScalarObservationIdFactoryContext } from "@lsaa/data-sheet";
import {
  CanonicalAdaptiveObservationSchema,
  type AdaptiveColumnMapping,
  type AdaptiveRawLineage,
  type CanonicalAdaptiveObservation,
  type StructureContract,
} from "@lsaa/domain";

import {
  parseCanonicalWorksheetFile,
  type CanonicalWorksheetFileColumn,
  type CanonicalWorksheetFileLayout,
} from "./canonicalWorksheetFile";
import { moveSpreadsheetFocus, parseClipboardMatrix } from "./spreadsheetGrid";
import { LocalizedFileInput } from "./LocalizedFileInput";
import { localizedText, useAppLocale, type AppLocale } from "../app/appLocale";
import { parseOptionalSpreadsheetNumber } from "./spreadsheetValues";
import { SpreadsheetDraftTextCell } from "./SpreadsheetDraftTextCell";

export type CanonicalWorksheetRow = Readonly<{
  key: string;
  label: string;
  date: string;
}>;

export type CanonicalMatrixConditionCombination = Readonly<{
  labels: readonly string[];
  displayLabel: string;
  status: "performed" | "not_performed" | "unknown";
}>;

type MatrixCoordinate = Readonly<{
  readoutKey: string;
  factors: Readonly<Record<string, string>>;
  valueKey: string | null;
}>;

type MatrixColumn = Readonly<{
  key: string;
  coordinate: MatrixCoordinate;
  readoutLabel: string;
  componentLabel: string;
  derived: "proportion" | null;
}>;

type MatrixDisplayColumn = MatrixColumn &
  Readonly<{
    role: "identity" | "value";
    groupKey?: string;
    identityKey?: string;
  }>;

export type CanonicalWorksheetFileCommit = Readonly<{
  observations: readonly CanonicalAdaptiveObservation[];
  mapping: AdaptiveColumnMapping;
  rawLineage: AdaptiveRawLineage;
}>;

type Props = Readonly<{
  contract: StructureContract;
  observations: readonly CanonicalAdaptiveObservation[];
  rows?: readonly CanonicalWorksheetRow[];
  conditionCombinations?: readonly CanonicalMatrixConditionCombination[];
  /** Set only when the interview recorded an explicit shared run/date fact. */
  showExperimentDate?: boolean;
  onRowChange?: (rowIndex: number, patch: Partial<CanonicalWorksheetRow>) => void;
  onObservationsChange: (observations: readonly CanonicalAdaptiveObservation[]) => void;
  /** Receives the complete typed file import so the parent can persist lineage atomically. */
  onFileImport?: (result: CanonicalWorksheetFileCommit) => void;
  nextObservationId: (context: CompactScalarObservationIdFactoryContext) => string;
  nextExperimentalUnitIdentity?: (
    context: CompactScalarObservationIdFactoryContext & { observationId: string },
  ) => string;
  readOnly?: boolean;
  tableId: string;
}>;

function factorCombinations(contract: StructureContract): Array<Record<string, string>> {
  return contract.factors.reduce<Array<Record<string, string>>>(
    (current, factor) =>
      current.flatMap((combination) =>
        factor.levels.map((level) => ({ ...combination, [factor.key]: level })),
      ),
    [{}],
  );
}

function recordsMatch(
  left: Readonly<Record<string, string>>,
  right: Readonly<Record<string, string>>,
): boolean {
  return (
    Object.keys(left).length === Object.keys(right).length &&
    Object.entries(left).every(([key, value]) => right[key] === value)
  );
}

const normalizedLabel = (value: string): string => value.normalize("NFKC").trim();
const SHARED_EXPERIMENT_DATE_LABEL = "この組に共通する実験日";
const SHARED_EXPERIMENT_DATE_HELP =
  "任意・行内の全条件が同じ日の場合のみ。日付から対応関係は決めません";

export function canonicalMatrixConditionStatus(
  contract: StructureContract,
  factors: Readonly<Record<string, string>>,
  conditionCombinations: readonly CanonicalMatrixConditionCombination[] = [],
): CanonicalMatrixConditionCombination["status"] {
  const labels = contract.factors.map(({ key }) => normalizedLabel(factors[key] ?? ""));
  const displayLabel = labels.join(" × ");
  return (
    conditionCombinations.find(
      (combination) =>
        normalizedLabel(combination.displayLabel) === displayLabel ||
        (combination.labels.length === labels.length &&
          combination.labels.every((label, index) => normalizedLabel(label) === labels[index])),
    )?.status ?? "performed"
  );
}

function scalarValueKey(
  readout: StructureContract["readouts"][number],
  observations: readonly CanonicalAdaptiveObservation[],
): string {
  const present = new Set(observations.flatMap(({ values }) => Object.keys(values)));
  return [readout.key, ...readout.componentKeys].find((key) => present.has(key)) ?? readout.key;
}

function componentLabel(componentKey: string, ordinal: number, locale: AppLocale = "ja"): string {
  const normalized = componentKey.toLowerCase();
  if (["numerator", "positive", "success", "event"].includes(normalized))
    return localizedText(locale, "該当数", "Positive count");
  if (["denominator", "total", "eligible", "count"].includes(normalized))
    return localizedText(locale, "総数", "Total count");
  return componentKey || (locale === "ja" ? `値 ${ordinal + 1}` : `Value ${ordinal + 1}`);
}

function readoutColumns(
  readout: StructureContract["readouts"][number],
  factors: Readonly<Record<string, string>>,
  observations: readonly CanonicalAdaptiveObservation[],
  locale: AppLocale = "ja",
): MatrixColumn[] {
  if (readout.representation === "scalar") {
    const valueKey = scalarValueKey(
      readout,
      observations.filter(
        (observation) =>
          observation.readoutKey === readout.key && recordsMatch(observation.factors, factors),
      ),
    );
    return [
      {
        key: JSON.stringify({ factors, readoutKey: readout.key, valueKey }),
        coordinate: { readoutKey: readout.key, factors, valueKey },
        readoutLabel: readout.label,
        componentLabel: readout.label,
        derived: null,
      },
    ];
  }
  if (readout.representation === "proportion_counts") {
    const components = readout.componentKeys.slice(0, 2).map((component, index) => {
      const valueKey = `${readout.key}_${component}`;
      return {
        key: JSON.stringify({ factors, readoutKey: readout.key, valueKey }),
        coordinate: { readoutKey: readout.key, factors, valueKey },
        readoutLabel: readout.label,
        componentLabel: componentLabel(component, index, locale),
        derived: null,
      } satisfies MatrixColumn;
    });
    return [
      ...components,
      {
        key: JSON.stringify({ factors, readoutKey: readout.key, derived: "proportion" }),
        coordinate: { readoutKey: readout.key, factors, valueKey: null },
        readoutLabel: readout.label,
        componentLabel: localizedText(locale, "計算値 (%)", "Calculated value (%)"),
        derived: "proportion",
      },
    ];
  }
  return [];
}

function matrixColumns(
  contract: StructureContract,
  observations: readonly CanonicalAdaptiveObservation[],
  locale: AppLocale = "ja",
): MatrixColumn[] {
  return factorCombinations(contract).flatMap((factors) =>
    contract.readouts.flatMap((readout) => readoutColumns(readout, factors, observations, locale)),
  );
}

function matrixConditionGroups(matrix: readonly MatrixColumn[]): Array<{
  key: string;
  factors: Readonly<Record<string, string>>;
  columns: readonly MatrixColumn[];
}> {
  const groups = new Map<
    string,
    { key: string; factors: Readonly<Record<string, string>>; columns: MatrixColumn[] }
  >();
  matrix.forEach((column) => {
    const key = conditionKey(column.coordinate.factors);
    const group = groups.get(key);
    if (group) group.columns.push(column);
    else groups.set(key, { key, factors: column.coordinate.factors, columns: [column] });
  });
  return [...groups.values()];
}

function matrixDisplayColumns(
  contract: StructureContract,
  matrix: readonly MatrixColumn[],
  showIndependentIdentities: boolean,
): MatrixDisplayColumn[] {
  const valueColumns = matrix.map(
    (column) => ({ ...column, role: "value" as const }) satisfies MatrixDisplayColumn,
  );
  if (contract.matching.kind === "matched" || !showIndependentIdentities) return valueColumns;
  const identity = contract.identities.find(
    ({ unitLevelKey }) => unitLevelKey === contract.experimentalUnitLevelKey,
  );
  if (!identity) return valueColumns;
  return matrixConditionGroups(matrix).flatMap(({ key, factors, columns }) => [
    {
      key: `identity:${key}`,
      coordinate: {
        readoutKey: columns[0]?.coordinate.readoutKey ?? "measurement",
        factors,
        valueKey: null,
      },
      readoutLabel: identity.label,
      componentLabel: identity.label,
      derived: null,
      role: "identity" as const,
      groupKey: key,
      identityKey: identity.key,
    },
    ...columns.map(
      (column) =>
        ({ ...column, role: "value" as const, groupKey: key }) satisfies MatrixDisplayColumn,
    ),
  ]);
}

function matrixFileColumnHeader(contract: StructureContract, column: MatrixColumn): string {
  const factorLabel = contract.factors
    .map((factor) => column.coordinate.factors[factor.key] ?? "—")
    .join(" × ");
  const conditionLabel = factorLabel || "測定";
  const componentLabel =
    column.componentLabel === column.readoutLabel
      ? column.readoutLabel
      : `${column.readoutLabel} / ${column.componentLabel}`;
  return `${conditionLabel} / ${componentLabel}`;
}

function matrixFileIdentityHeader(
  contract: StructureContract,
  factors: Readonly<Record<string, string>>,
  identityLabel: string,
): string {
  const factorLabel = contract.factors.map((factor) => factors[factor.key] ?? "—").join(" × ");
  return `${factorLabel || "測定"} / ${identityLabel}`;
}

/**
 * The file adapter accepts only the currently generated matrix.  These
 * headers are a flat, deterministic representation of the visible grouped
 * header; they are not a second way to define factors or readouts.
 */
export function canonicalWorksheetFileLayout(
  contract: StructureContract,
  observations: readonly CanonicalAdaptiveObservation[],
  showExperimentDate: boolean,
): CanonicalWorksheetFileLayout {
  const matrix = matrixColumns(contract, observations).filter(({ derived }) => !derived);
  const columns: CanonicalWorksheetFileColumn[] = [];
  const unitIdentity = contract.identities.find(
    ({ unitLevelKey }) => unitLevelKey === contract.experimentalUnitLevelKey,
  );
  if (contract.matching.kind === "matched" && contract.matching.identityKey) {
    const identity = contract.identities.find(({ key }) => key === contract.matching.identityKey);
    if (identity) {
      columns.push({
        key: `identity:${identity.key}`,
        header: identity.label,
        role: "identity",
        semanticKey: identity.key,
      });
    }
  } else {
    columns.push({ key: "row_label", header: "入力行", role: "row_label" });
  }
  if (showExperimentDate && contract.matching.kind !== "independent") {
    columns.push({
      key: "experiment_date",
      header: SHARED_EXPERIMENT_DATE_LABEL,
      role: "date",
    });
  }

  if (contract.matching.kind !== "matched" && unitIdentity) {
    // Independent units are not identified by their row position.  Keep one
    // researcher-provided ID immediately beside each condition group so an
    // unequal-n import cannot accidentally imply matching by aligned rows.
    const groups = new Map<
      string,
      { factors: Readonly<Record<string, string>>; columns: MatrixColumn[] }
    >();
    matrix.forEach((column) => {
      const key = conditionKey(column.coordinate.factors);
      const group = groups.get(key);
      if (group) group.columns.push(column);
      else groups.set(key, { factors: column.coordinate.factors, columns: [column] });
    });
    groups.forEach(({ factors, columns: groupColumns }, groupKey) => {
      columns.push({
        key: `identity:${groupKey}`,
        header: matrixFileIdentityHeader(contract, factors, unitIdentity.label),
        role: "identity",
        semanticKey: unitIdentity.key,
        groupKey,
      });
      groupColumns.forEach((column) => {
        columns.push({
          key: `value:${column.key}`,
          header: matrixFileColumnHeader(contract, column),
          role: "value",
          semanticKey: column.coordinate.valueKey ?? undefined,
          groupKey,
        });
      });
    });
  } else {
    matrix.forEach((column) => {
      columns.push({
        key: `value:${column.key}`,
        header: matrixFileColumnHeader(contract, column),
        role: "value",
        semanticKey: column.coordinate.valueKey ?? undefined,
      });
    });
  }
  return {
    columns,
    optionalRowLabel: contract.matching.kind !== "matched",
  };
}

function experimentalIdentityKey(contract: StructureContract): string | null {
  return (
    contract.identities.find(
      ({ unitLevelKey }) => unitLevelKey === contract.experimentalUnitLevelKey,
    )?.key ?? null
  );
}

export function canEditCanonicalMatrix(
  contract: StructureContract,
  observations: readonly CanonicalAdaptiveObservation[] = [],
): boolean {
  const matchingIdentityKey = contract.matching.identityKey;
  const unitIdentityKey = experimentalIdentityKey(contract);
  const allowedIdentityKeys = new Set(
    [unitIdentityKey, matchingIdentityKey].filter((key): key is string => Boolean(key)),
  );
  const contractEligible =
    contract.orderedAxes.length === 0 &&
    contract.readouts.length === 1 &&
    contract.readouts.every(
      (readout) =>
        ["scalar", "proportion_counts"].includes(readout.representation) &&
        readout.observationLevelKey === contract.experimentalUnitLevelKey &&
        (readout.representation !== "proportion_counts" || readout.componentKeys.length >= 2),
    ) &&
    contract.identities
      .filter(({ required }) => required)
      .every(({ key }) => allowedIdentityKeys.has(key)) &&
    ["independent", "matched", "none"].includes(contract.matching.kind);
  if (!contractEligible) return false;

  const requiredIdentityKeys = contract.identities
    .filter(({ required }) => required)
    .map(({ key }) => key);
  const seenCells = new Set<string>();
  const independentUnits = new Map<string, string>();
  for (const observation of observations) {
    if (
      Object.keys(observation.axes).length > 0 ||
      Object.keys(observation.hierarchy).length > 0 ||
      requiredIdentityKeys.some((key) => !observation.identities[key]?.trim())
    ) {
      return false;
    }
    const rawRowIdentity =
      contract.matching.kind === "matched" && matchingIdentityKey
        ? observation.identities[matchingIdentityKey]
        : unitIdentityKey
          ? observation.identities[unitIdentityKey]
          : observation.observationId;
    const rowIdentity = rawRowIdentity ? normalizedLabel(rawRowIdentity) : "";
    if (!rowIdentity) return false;
    const factorKey = conditionKey(observation.factors);
    const cellKey = JSON.stringify({ rowIdentity, factorKey, readoutKey: observation.readoutKey });
    if (seenCells.has(cellKey)) return false;
    seenCells.add(cellKey);
    if (["independent", "none"].includes(contract.matching.kind) && unitIdentityKey) {
      const priorCondition = independentUnits.get(rowIdentity);
      if (priorCondition && priorCondition !== factorKey) return false;
      independentUnits.set(rowIdentity, factorKey);
    }
  }
  return true;
}

function observationsForColumn(
  observations: readonly CanonicalAdaptiveObservation[],
  column: MatrixColumn,
): CanonicalAdaptiveObservation[] {
  return observations.filter(
    (observation) =>
      observation.readoutKey === column.coordinate.readoutKey &&
      recordsMatch(observation.factors, column.coordinate.factors) &&
      Object.keys(observation.axes).length === 0 &&
      Object.keys(observation.hierarchy).length === 0,
  );
}

function uniqueInOrder(values: readonly (string | undefined)[]): string[] {
  const seen = new Set<string>();
  return values.flatMap((value) => {
    const normalized = value?.trim();
    if (!normalized || seen.has(normalized)) return [];
    seen.add(normalized);
    return [normalized];
  });
}

function matchedRowIdentities(
  contract: StructureContract,
  observations: readonly CanonicalAdaptiveObservation[],
): string[] {
  if (!contract.matching.identityKey) return [];
  return uniqueInOrder(
    observations.map(({ identities }) => identities[contract.matching.identityKey!]),
  );
}

function conditionKey(factors: Readonly<Record<string, string>>): string {
  return JSON.stringify(
    Object.entries(factors)
      .sort(([left], [right]) => left.localeCompare(right))
      .map(([key, value]) => [key, normalizedLabel(value)]),
  );
}

function independentUnitIdentities(
  contract: StructureContract,
  observations: readonly CanonicalAdaptiveObservation[],
  factors: Readonly<Record<string, string>>,
): string[] {
  const identityKey = experimentalIdentityKey(contract);
  const candidates = observations.filter((observation) =>
    recordsMatch(observation.factors, factors),
  );
  if (!identityKey) return uniqueInOrder(candidates.map(({ observationId }) => observationId));
  return uniqueInOrder(
    candidates.map(
      (observation) => observation.identities[identityKey] ?? observation.observationId,
    ),
  );
}

function observationAt(input: {
  contract: StructureContract;
  observations: readonly CanonicalAdaptiveObservation[];
  column: MatrixColumn;
  rowIndex: number;
  identityOverride?: string;
}): CanonicalAdaptiveObservation | null {
  const { contract, observations, column, rowIndex } = input;
  const candidates = observationsForColumn(observations, column);
  const matchingIdentityKey = contract.matching.identityKey;
  const identityOverride = normalizedLabel(input.identityOverride ?? "");
  if (["matched", "blocked"].includes(contract.matching.kind) && matchingIdentityKey) {
    if (identityOverride) {
      return (
        candidates.find(
          (observation) =>
            normalizedLabel(observation.identities[matchingIdentityKey] ?? "") === identityOverride,
        ) ?? null
      );
    }
    const rowIdentity = matchedRowIdentities(contract, observations)[rowIndex];
    return (
      candidates.find(
        (observation) =>
          normalizedLabel(observation.identities[matchingIdentityKey] ?? "") === rowIdentity,
      ) ?? null
    );
  }
  const unitIdentityKey = experimentalIdentityKey(contract);
  if (identityOverride && unitIdentityKey) {
    return (
      candidates.find(
        (observation) =>
          normalizedLabel(observation.identities[unitIdentityKey] ?? "") === identityOverride,
      ) ?? null
    );
  }
  const unitIdentity = independentUnitIdentities(contract, observations, column.coordinate.factors)[
    rowIndex
  ];
  if (!unitIdentity) return candidates[rowIndex] ?? null;
  return (
    candidates.find(
      (observation) =>
        normalizedLabel(
          unitIdentityKey
            ? (observation.identities[unitIdentityKey] ?? "")
            : observation.observationId,
        ) === unitIdentity,
    ) ?? null
  );
}

function rowCountFor(
  contract: StructureContract,
  observations: readonly CanonicalAdaptiveObservation[],
  columns: readonly MatrixColumn[],
  providedRows: readonly CanonicalWorksheetRow[],
): number {
  const observed =
    ["matched", "blocked"].includes(contract.matching.kind) && contract.matching.identityKey
      ? matchedRowIdentities(contract, observations).length
      : Math.max(
          0,
          ...columns.map(
            (column) =>
              independentUnitIdentities(contract, observations, column.coordinate.factors).length,
          ),
        );
  return Math.max(5, observed + (observed > 0 ? 1 : 0), providedRows.length);
}

function generatedRowIdentity(
  contract: StructureContract,
  observations: readonly CanonicalAdaptiveObservation[],
  rowIndex: number,
): string {
  const key = contract.matching.identityKey;
  if (!key) return `Experiment ${rowIndex + 1}`;
  const existing = matchedRowIdentities(contract, observations)[rowIndex];
  if (existing) return existing;
  const label = contract.identities.find((identity) => identity.key === key)?.label ?? "Experiment";
  const used = new Set(matchedRowIdentities(contract, observations));
  let ordinal = rowIndex + 1;
  let candidate = `${label} ${ordinal}`;
  while (used.has(candidate)) {
    ordinal += 1;
    candidate = `${label} ${ordinal}`;
  }
  return candidate;
}

function renameMatchedRowIdentity(input: {
  contract: StructureContract;
  observations: readonly CanonicalAdaptiveObservation[];
  rowIndex: number;
  identity: string;
}): readonly CanonicalAdaptiveObservation[] {
  const identityKey = input.contract.matching.identityKey;
  if (input.contract.matching.kind !== "matched" || !identityKey) {
    throw new Error("この行には条件を対応づけるIDがありません");
  }
  const previousIdentity = matchedRowIdentities(input.contract, input.observations)[input.rowIndex];
  if (!previousIdentity) {
    throw new Error("測定値を入力してからIDを変更してください");
  }
  const identity = input.identity.trim();
  if (!identity) throw new Error("対象・試料・実験回を区別する名前を入力してください");
  if (identity === previousIdentity) return input.observations;
  if (
    input.observations.some(
      (observation) =>
        normalizedLabel(observation.identities[identityKey] ?? "") === normalizedLabel(identity) &&
        normalizedLabel(observation.identities[identityKey] ?? "") !==
          normalizedLabel(previousIdentity),
    )
  ) {
    throw new Error("同じIDがすでにあります。別の対象・試料・実験回には異なるIDを付けてください");
  }
  return input.observations.map((observation) =>
    normalizedLabel(observation.identities[identityKey] ?? "") === normalizedLabel(previousIdentity)
      ? CanonicalAdaptiveObservationSchema.parse({
          ...observation,
          identities: { ...observation.identities, [identityKey]: identity },
        })
      : observation,
  );
}

function MatchedRowIdentityEditor({
  contract,
  observations,
  rowIndex,
  label,
  readOnly,
  onObservationsChange,
}: Readonly<{
  contract: StructureContract;
  observations: readonly CanonicalAdaptiveObservation[];
  rowIndex: number;
  label: string;
  readOnly: boolean;
  onObservationsChange: Props["onObservationsChange"];
}>) {
  const locale = useAppLocale();
  const t = (ja: string, en: string) => localizedText(locale, ja, en);
  const canonicalIdentity = matchedRowIdentities(contract, observations)[rowIndex] ?? "";

  return (
    <SpreadsheetDraftTextCell
      aria-label={`${label} ${rowIndex + 1}`}
      canonicalText={canonicalIdentity}
      wrapperClassName="canonical-matrix-worksheet__row-identity"
      disabled={readOnly}
      data-spreadsheet-row={rowIndex}
      data-spreadsheet-column={-1}
      onCommit={(identity) => {
        try {
          onObservationsChange(
            renameMatchedRowIdentity({ contract, observations, rowIndex, identity }),
          );
          return null;
        } catch (cause) {
          return locale === "ja"
            ? `${cause instanceof Error ? cause.message : "IDを変更できませんでした"}。入力内容は消えていません。`
            : t(
                "IDを変更できませんでした。入力内容は消えていません。",
                "The ID could not be changed. The entered content was retained.",
              );
        }
      }}
    />
  );
}

function renameIndependentRowIdentity(input: {
  contract: StructureContract;
  observations: readonly CanonicalAdaptiveObservation[];
  factors: Readonly<Record<string, string>>;
  rowIndex: number;
  identity: string;
}): readonly CanonicalAdaptiveObservation[] {
  const identityKey = experimentalIdentityKey(input.contract);
  if (!identityKey) throw new Error("この実験では対象・試料を区別するIDを設定できません");
  const previousIdentity = independentUnitIdentities(
    input.contract,
    input.observations,
    input.factors,
  )[input.rowIndex];
  const identity = input.identity.trim();
  if (!identity) throw new Error("値を入力した行のIDは空にできません");
  if (identity === previousIdentity) return input.observations;
  const normalized = normalizedLabel(identity);
  const relatedObservationIds = new Set(
    input.observations
      .filter(
        (observation) =>
          recordsMatch(observation.factors, input.factors) &&
          normalizedLabel(observation.identities[identityKey] ?? "") ===
            normalizedLabel(previousIdentity ?? ""),
      )
      .map(({ observationId }) => observationId),
  );
  if (
    input.observations.some(
      (observation) =>
        normalizedLabel(observation.identities[identityKey] ?? "") === normalized &&
        !relatedObservationIds.has(observation.observationId),
    )
  ) {
    throw new Error("同じIDがすでにあります。条件ごとに異なる対象・試料IDを入力してください");
  }
  return input.observations.map((observation) =>
    relatedObservationIds.has(observation.observationId)
      ? CanonicalAdaptiveObservationSchema.parse({
          ...observation,
          identities: { ...observation.identities, [identityKey]: identity },
        })
      : observation,
  );
}

function IndependentRowIdentityEditor({
  initialIdentity,
  canonicalIdentity,
  label,
  rowIndex,
  gridColumn,
  readOnly,
  onDraftChange,
  onCommit,
}: Readonly<{
  initialIdentity: string;
  canonicalIdentity: string;
  label: string;
  rowIndex: number;
  gridColumn: number;
  readOnly: boolean;
  onDraftChange: (identity: string) => void;
  onCommit: (identity: string) => string | null;
}>) {
  const locale = useAppLocale();
  const t = (ja: string, en: string) => localizedText(locale, ja, en);

  return (
    <SpreadsheetDraftTextCell
      aria-label={label}
      canonicalText={initialIdentity}
      wrapperClassName="canonical-matrix-worksheet__row-identity"
      preserveDirtyOnCanonicalChange
      placeholder={
        canonicalIdentity
          ? undefined
          : t("値の入力時に自動作成", "Created automatically when a value is entered")
      }
      disabled={readOnly}
      data-spreadsheet-row={rowIndex}
      data-spreadsheet-column={gridColumn}
      onDraftChange={(next) => {
        if (!canonicalIdentity) onDraftChange(next);
      }}
      onCommit={(identity) => {
        const problem = onCommit(identity);
        return problem && locale !== "ja"
          ? t("IDを変更できませんでした", "The ID could not be changed")
          : problem;
      }}
    />
  );
}

function updateValue(
  observation: CanonicalAdaptiveObservation,
  valueKey: string,
  value: number | null,
  sourceRow?: number | null,
): CanonicalAdaptiveObservation {
  const missingness = { ...observation.missingness };
  if (value === null) missingness[valueKey] ??= "unknown";
  else delete missingness[valueKey];
  return CanonicalAdaptiveObservationSchema.parse({
    ...observation,
    values: { ...observation.values, [valueKey]: value },
    missingness,
    ...(sourceRow === undefined ? {} : { sourceRow }),
  });
}

function validateTypedValues(
  contract: StructureContract,
  observations: readonly CanonicalAdaptiveObservation[],
): void {
  contract.readouts.forEach((readout) => {
    if (readout.representation !== "proportion_counts") return;
    const numeratorKey = `${readout.key}_${readout.componentKeys[0]!}`;
    const denominatorKey = `${readout.key}_${readout.componentKeys[1]!}`;
    observations
      .filter((observation) => observation.readoutKey === readout.key)
      .forEach((observation) => {
        const numerator = observation.values[numeratorKey];
        const denominator = observation.values[denominatorKey];
        for (const value of [numerator, denominator]) {
          if (typeof value === "number" && (!Number.isInteger(value) || value < 0)) {
            throw new Error("該当数と総数には0以上の整数を入力してください");
          }
        }
        if (
          typeof numerator === "number" &&
          typeof denominator === "number" &&
          numerator > denominator
        ) {
          throw new Error("該当数は総数以下にしてください");
        }
      });
  });
}

function applyMatrixValue(input: {
  contract: StructureContract;
  observations: readonly CanonicalAdaptiveObservation[];
  column: MatrixColumn;
  rowIndex: number;
  value: number | null;
  sourceRow?: number | null;
  identityOverride?: string;
  nextObservationId: Props["nextObservationId"];
  nextExperimentalUnitIdentity: Props["nextExperimentalUnitIdentity"];
}): readonly CanonicalAdaptiveObservation[] {
  if (!input.column.coordinate.valueKey) {
    throw new Error("計算列は元の値から自動計算されます");
  }
  const valueKey = input.column.coordinate.valueKey;
  const existing = observationAt(input);
  if (existing) {
    if (input.value === null && !input.contract.allowedMissingness.includes("unknown")) {
      throw new Error("この実験では欠測理由を1測定1行の表で指定してください");
    }
    return input.observations.map((observation) =>
      observation.observationId === existing.observationId
        ? updateValue(observation, valueKey, input.value, input.sourceRow)
        : observation,
    );
  }
  if (input.value === null) return input.observations;

  const targetCoordinates = {
    readoutKey: input.column.coordinate.readoutKey,
    factors: input.column.coordinate.factors,
    axes: {},
    hierarchy: {},
  };
  const existingObservationIds = input.observations.map(({ observationId }) => observationId);
  const context = {
    targetCoordinates,
    valueKey,
    ordinal: input.rowIndex + 1,
    existingObservationIds,
  };
  const observationId = input.nextObservationId(context);
  const unitIdentityKey = experimentalIdentityKey(input.contract);
  const matchingIdentityKey = input.contract.matching.identityKey;
  const matched =
    ["matched", "blocked"].includes(input.contract.matching.kind) && matchingIdentityKey;
  const identities: Record<string, string> = {};

  if (matched && matchingIdentityKey) {
    identities[matchingIdentityKey] = generatedRowIdentity(
      input.contract,
      input.observations,
      input.rowIndex,
    );
    if (input.identityOverride?.trim()) {
      identities[matchingIdentityKey] = input.identityOverride.trim();
    }
  }
  if (unitIdentityKey && unitIdentityKey !== matchingIdentityKey) {
    identities[unitIdentityKey] =
      input.identityOverride?.trim() ??
      independentUnitIdentities(
        input.contract,
        input.observations,
        input.column.coordinate.factors,
      )[input.rowIndex] ??
      input.nextExperimentalUnitIdentity?.({ ...context, observationId }) ??
      observationId;
  } else if (unitIdentityKey && !identities[unitIdentityKey]) {
    identities[unitIdentityKey] =
      input.identityOverride?.trim() ??
      input.nextExperimentalUnitIdentity?.({ ...context, observationId }) ??
      observationId;
  }
  if (
    unitIdentityKey &&
    unitIdentityKey !== matchingIdentityKey &&
    input.observations.some(
      (observation) =>
        normalizedLabel(observation.identities[unitIdentityKey] ?? "") ===
          normalizedLabel(identities[unitIdentityKey] ?? "") &&
        conditionKey(observation.factors) !== conditionKey(input.column.coordinate.factors),
    )
  ) {
    throw new Error(
      input.identityOverride?.trim()
        ? "同じIDが別の条件ですでに使われています。条件ごとに異なる対象・試料IDを入力してください"
        : "新しい実験単位IDが既存のIDと重複しました",
    );
  }

  const targetReadout = input.contract.readouts.find(
    ({ key }) => key === input.column.coordinate.readoutKey,
  );
  const initialValues =
    !targetReadout || targetReadout.representation === "scalar"
      ? { [valueKey]: input.value }
      : Object.fromEntries(
          targetReadout.componentKeys.map((componentKey) => {
            const canonicalKey = `${input.column.coordinate.readoutKey}_${componentKey}`;
            return [canonicalKey, canonicalKey === valueKey ? input.value : null];
          }),
        );
  const created = CanonicalAdaptiveObservationSchema.parse({
    observationId,
    readoutKey: input.column.coordinate.readoutKey,
    identities,
    factors: input.column.coordinate.factors,
    axes: {},
    hierarchy: {},
    // A typed readout is edited one spreadsheet cell at a time, but its
    // canonical record is one semantic observation.  Materialize every
    // declared component address when the first component is entered so the
    // intermediate row remains contract-valid while the researcher moves to
    // the next cell (for example positive count -> total count).
    values: initialValues,
    missingness: {},
    sourceRow: input.sourceRow === undefined ? null : input.sourceRow,
  });
  return [...input.observations, created];
}

function displayValue(observation: CanonicalAdaptiveObservation | null, valueKey: string): string {
  const value = observation?.values[valueKey];
  return value === null || value === undefined ? "" : String(value);
}

function displayColumnValue(
  contract: StructureContract,
  observation: CanonicalAdaptiveObservation | null,
  column: MatrixColumn,
): string {
  if (column.derived !== "proportion") {
    return column.coordinate.valueKey ? displayValue(observation, column.coordinate.valueKey) : "";
  }
  const readout = contract.readouts.find(({ key }) => key === column.coordinate.readoutKey);
  if (!readout || readout.componentKeys.length < 2 || !observation) return "";
  const numerator = observation.values[`${readout.key}_${readout.componentKeys[0]!}`];
  const denominator = observation.values[`${readout.key}_${readout.componentKeys[1]!}`];
  if (typeof numerator !== "number" || typeof denominator !== "number" || denominator <= 0) {
    return "";
  }
  return `${((numerator / denominator) * 100).toFixed(1)}%`;
}

function MatrixCell({
  contract,
  observations,
  column,
  rowIndex,
  columnIndex,
  gridColumn,
  readOnly,
  nextObservationId,
  nextExperimentalUnitIdentity,
  identityOverride,
  onObservationsChange,
  onMatrixPaste,
  conditionStatus,
}: Readonly<{
  contract: StructureContract;
  observations: readonly CanonicalAdaptiveObservation[];
  column: MatrixColumn;
  rowIndex: number;
  columnIndex: number;
  gridColumn: number;
  readOnly: boolean;
  nextObservationId: Props["nextObservationId"];
  nextExperimentalUnitIdentity: Props["nextExperimentalUnitIdentity"];
  identityOverride?: string;
  onObservationsChange: Props["onObservationsChange"];
  onMatrixPaste: (event: ClipboardEvent<HTMLInputElement>, row: number, column: number) => void;
  conditionStatus: CanonicalMatrixConditionCombination["status"];
}>) {
  const locale = useAppLocale();
  const t = (ja: string, en: string) => localizedText(locale, ja, en);
  const observation = observationAt({
    contract,
    observations,
    column,
    rowIndex,
    identityOverride,
  });
  const canonicalValue = displayColumnValue(contract, observation, column);
  const [text, setText] = useState(canonicalValue);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    setText(canonicalValue);
    setError(null);
  }, [canonicalValue]);

  const commit = (draftText = text) => {
    if (column.derived) return;
    // Read the value visible in the input at blur time. This avoids a narrow
    // React render-lag window where the DOM already shows the last keystroke
    // but the prior render's local state would otherwise be committed.
    const parsed = parseOptionalSpreadsheetNumber(draftText);
    if (parsed.kind === "invalid") {
      setError(t("数値を入力してください", "Enter a numeric value"));
      return;
    }
    const value = parsed.kind === "value" ? parsed.value : null;
    try {
      const next = applyMatrixValue({
        contract,
        observations,
        column,
        rowIndex,
        value,
        identityOverride,
        nextObservationId,
        nextExperimentalUnitIdentity,
      });
      validateTypedValues(contract, next);
      onObservationsChange(next);
      setError(null);
    } catch (cause) {
      setError(
        locale === "ja" && cause instanceof Error
          ? cause.message
          : t("値を反映できませんでした", "The value could not be applied"),
      );
    }
  };
  const factorLabel = contract.factors
    .map((factor) => column.coordinate.factors[factor.key])
    .filter(Boolean)
    .join("・");
  const rowLabel =
    contract.matching.kind === "matched"
      ? generatedRowIdentity(contract, observations, rowIndex)
      : locale === "ja"
        ? `入力行 ${rowIndex + 1}`
        : `Entry row ${rowIndex + 1}`;
  const separator = locale === "ja" ? "・" : ", ";
  const inputLabel = `${rowLabel}${separator}${factorLabel || t("測定", "Measurement")}${separator}${column.readoutLabel}${
    column.componentLabel === column.readoutLabel ? "" : `${separator}${column.componentLabel}`
  }`;

  if (conditionStatus !== "performed") {
    const statusLabel =
      conditionStatus === "not_performed"
        ? t("実施していない", "Not performed")
        : t("未確認", "Unconfirmed");
    return (
      <span
        className={`canonical-matrix-worksheet__unavailable is-${conditionStatus}`}
        role="note"
        aria-label={`${inputLabel}・${statusLabel}`}
      >
        {statusLabel}
      </span>
    );
  }

  if (column.derived) {
    return (
      <output
        className="canonical-matrix-worksheet__derived"
        aria-label={`${rowLabel}${separator}${factorLabel || t("測定", "Measurement")}${separator}${column.readoutLabel}${separator}${column.componentLabel}`}
      >
        {canonicalValue || "—"}
      </output>
    );
  }

  return (
    <div className="canonical-matrix-worksheet__cell">
      <input
        aria-label={inputLabel}
        aria-invalid={error ? "true" : undefined}
        data-spreadsheet-cell="true"
        data-spreadsheet-row={rowIndex}
        data-spreadsheet-column={gridColumn}
        disabled={readOnly}
        inputMode="decimal"
        value={text}
        onBlur={(event) => commit(event.currentTarget.value)}
        onChange={(event) => {
          setText(event.currentTarget.value);
          setError(null);
        }}
        onKeyDown={moveSpreadsheetFocus}
        onPaste={(event) => onMatrixPaste(event, rowIndex, columnIndex)}
      />
      {error ? <small role="alert">{error}</small> : null}
    </div>
  );
}

function headerRuns(
  columns: readonly MatrixDisplayColumn[],
  group: (column: MatrixDisplayColumn) => string,
  label: (column: MatrixDisplayColumn) => string,
): Array<{ label: string; span: number; key: string }> {
  const runs: Array<{ label: string; span: number; key: string }> = [];
  columns.forEach((column, index) => {
    const groupKey = group(column);
    const displayLabel = label(column);
    const previous = runs.at(-1);
    if (previous?.key.endsWith(`:${groupKey}`)) previous.span += 1;
    else runs.push({ label: displayLabel, span: 1, key: `${index}:${groupKey}` });
  });
  return runs;
}

function independentIdentityDraftKey(
  factors: Readonly<Record<string, string>>,
  rowIndex: number,
): string {
  return JSON.stringify([conditionKey(factors), rowIndex]);
}

function independentIdentityOverride(
  contract: StructureContract,
  observations: readonly CanonicalAdaptiveObservation[],
  drafts: Readonly<Record<string, string>>,
  factors: Readonly<Record<string, string>>,
  rowIndex: number,
): string | undefined {
  const draft = drafts[independentIdentityDraftKey(factors, rowIndex)];
  const canonical = independentUnitIdentities(contract, observations, factors)[rowIndex];
  const identity = (canonical ?? draft ?? "").trim();
  return identity || undefined;
}

export function CanonicalMatrixWorksheet({
  contract,
  observations,
  rows = [],
  conditionCombinations = [],
  showExperimentDate = false,
  onRowChange,
  onObservationsChange,
  onFileImport,
  nextObservationId,
  nextExperimentalUnitIdentity,
  readOnly = false,
  tableId,
}: Props) {
  const locale = useAppLocale();
  const t = (ja: string, en: string) => localizedText(locale, ja, en);
  const columns = useMemo(
    () => matrixColumns(contract, observations, locale),
    [contract, observations, locale],
  );
  const [showIndependentIdentities, setShowIndependentIdentities] = useState(false);
  const displayColumns = useMemo(
    () => matrixDisplayColumns(contract, columns, showIndependentIdentities),
    [contract, columns, showIndependentIdentities],
  );
  const eligible = canEditCanonicalMatrix(contract, observations);
  const editable = !readOnly && eligible;
  const rowCount = rowCountFor(contract, observations, columns, rows);
  const matchingIdentity = contract.identities.find(
    ({ key }) => key === contract.matching.identityKey,
  );
  const rowHeaderLabel =
    contract.matching.kind === "matched"
      ? (matchingIdentity?.label ?? t("対象ID", "Subject ID"))
      : t("行", "Row");
  const showDate =
    contract.matching.kind !== "independent" &&
    showExperimentDate &&
    Boolean(rows.length || onRowChange);
  const showComponentHeaders = columns.some(
    ({ componentLabel: component, readoutLabel }) => component !== readoutLabel,
  );
  const headerDepth = contract.factors.length + (showComponentHeaders ? 2 : 1);
  const [pasteError, setPasteError] = useState<string | null>(null);
  const [fileError, setFileError] = useState<string | null>(null);
  const [fileStatus, setFileStatus] = useState<string | null>(null);
  const [fileBusy, setFileBusy] = useState(false);
  const fileInputRef = useRef<HTMLInputElement | null>(null);
  const [identityDrafts, setIdentityDrafts] = useState<Record<string, string>>({});
  const fileLayout = useMemo(
    () => canonicalWorksheetFileLayout(contract, observations, showExperimentDate),
    [contract, observations, showExperimentDate],
  );
  const independentIdentityKey = experimentalIdentityKey(contract);

  const commitIndependentIdentity = ({
    factors,
    rowIndex,
    identity: rawIdentity,
  }: Readonly<{
    factors: Readonly<Record<string, string>>;
    rowIndex: number;
    identity: string;
  }>): string | null => {
    if (!independentIdentityKey)
      return t(
        "この実験では対象・試料を区別するIDを設定できません",
        "This experiment does not define an ID that distinguishes subjects or specimens",
      );
    const draftKey = independentIdentityDraftKey(factors, rowIndex);
    const identity = rawIdentity.trim();
    const canonicalIdentity =
      independentUnitIdentities(contract, observations, factors)[rowIndex] ?? "";
    const reject = (message: string): string => message;
    if (!identity) {
      if (canonicalIdentity)
        return t(
          "値を入力した行のIDは空にできません",
          "The ID cannot be blank after values have been entered",
        );
      setIdentityDrafts((previous) => ({ ...previous, [draftKey]: "" }));
      return null;
    }
    const normalized = normalizedLabel(identity);
    if (
      Object.entries(identityDrafts).some(
        ([key, value]) =>
          key !== draftKey && Boolean(value.trim()) && normalizedLabel(value) === normalized,
      )
    ) {
      return reject(
        t(
          "同じIDがすでにあります。条件ごとに異なる対象・試料IDを入力してください",
          "This ID already exists. Enter a different subject or specimen ID for each condition",
        ),
      );
    }
    const previousIdentity = canonicalIdentity;
    const relatedObservationIds = new Set(
      observations
        .filter(
          (observation) =>
            recordsMatch(observation.factors, factors) &&
            normalizedLabel(observation.identities[independentIdentityKey] ?? "") ===
              normalizedLabel(previousIdentity),
        )
        .map(({ observationId }) => observationId),
    );
    if (
      observations.some(
        (observation) =>
          normalizedLabel(observation.identities[independentIdentityKey] ?? "") === normalized &&
          !relatedObservationIds.has(observation.observationId),
      )
    ) {
      return reject(
        t(
          "同じIDがすでにあります。条件ごとに異なる対象・試料IDを入力してください",
          "This ID already exists. Enter a different subject or specimen ID for each condition",
        ),
      );
    }
    if (canonicalIdentity) {
      try {
        onObservationsChange(
          renameIndependentRowIdentity({
            contract,
            observations,
            factors,
            rowIndex,
            identity,
          }),
        );
        setIdentityDrafts((previous) => {
          const next = { ...previous };
          delete next[draftKey];
          return next;
        });
        return null;
      } catch (cause) {
        return locale === "ja" && cause instanceof Error
          ? cause.message
          : t("IDを変更できませんでした", "The ID could not be changed");
      }
    }
    setIdentityDrafts((previous) => ({ ...previous, [draftKey]: identity }));
    return null;
  };

  const pasteMatrix = (
    event: ClipboardEvent<HTMLInputElement>,
    startRow: number,
    startColumn: number,
  ) => {
    const text = event.clipboardData.getData("text/plain");
    if (!text.includes("\t") && !/[\r\n]/u.test(text)) return;
    event.preventDefault();
    const pasted = parseClipboardMatrix(text);
    const pasteColumns = columns
      .slice(startColumn)
      .filter(({ derived }) => !derived)
      .map((column) => ({
        column,
        status: canonicalMatrixConditionStatus(
          contract,
          column.coordinate.factors,
          conditionCombinations,
        ),
      }));
    let next = observations;
    try {
      pasted.forEach((pastedRow, rowOffset) => {
        pastedRow.forEach((token, columnOffset) => {
          const target = pasteColumns[columnOffset];
          if (!target) throw new Error("貼り付け範囲が入力表を超えています");
          const trimmed = token.trim();
          if (target.status !== "performed") {
            if (trimmed) {
              throw new Error(
                target.status === "not_performed"
                  ? "実施していない条件には値を入力できません"
                  : "実施したか未確認の条件には、実験の組み立てを確認するまで値を入力できません",
              );
            }
            return;
          }
          const parsedValue = parseOptionalSpreadsheetNumber(trimmed);
          if (parsedValue.kind === "invalid") {
            throw new Error(`数値として読めない値「${trimmed}」があります`);
          }
          const value = parsedValue.kind === "value" ? parsedValue.value : null;
          const identityOverride =
            contract.matching.kind === "matched"
              ? undefined
              : independentIdentityOverride(
                  contract,
                  next,
                  identityDrafts,
                  target.column.coordinate.factors,
                  startRow + rowOffset,
                );
          next = applyMatrixValue({
            contract,
            observations: next,
            column: target.column,
            rowIndex: startRow + rowOffset,
            value,
            identityOverride,
            nextObservationId,
            nextExperimentalUnitIdentity,
          });
        });
      });
      validateTypedValues(contract, next);
      onObservationsChange(next);
      setPasteError(null);
    } catch (cause) {
      setPasteError(
        locale === "ja"
          ? `${cause instanceof Error ? cause.message : "貼り付けた値を反映できませんでした"}。既存の値は変更していません。`
          : "The pasted values could not be applied. Existing values were not changed.",
      );
    }
  };

  const importWorksheetFile = async (file: File) => {
    if (!editable || fileBusy) return;
    setFileBusy(true);
    setFileError(null);
    setFileStatus(null);
    try {
      const text = await file.text();
      const parsed = parseCanonicalWorksheetFile({
        text,
        fileName: file.name,
        mimeType: file.type,
        layout: fileLayout,
      });
      const matrixByFileKey = new Map<string, MatrixColumn>(
        columns
          .filter(({ derived }) => !derived)
          .map((column) => [`value:${column.key}`, column] as const),
      );
      const fileValueColumns = fileLayout.columns
        .filter((column) => column.role === "value")
        .map((column) => {
          const matrixColumn = matrixByFileKey.get(column.key);
          const sourceIndex = parsed.columnIndexes[column.key];
          if (!matrixColumn || sourceIndex === undefined) {
            throw new Error("ファイルの測定列を現在の入力表へ対応づけられません。");
          }
          const identityColumn =
            column.groupKey === undefined
              ? undefined
              : fileLayout.columns.find(
                  (candidate) =>
                    candidate.role === "identity" && candidate.groupKey === column.groupKey,
                );
          const identitySourceIndex = identityColumn
            ? parsed.columnIndexes[identityColumn.key]
            : undefined;
          if (column.groupKey !== undefined && identitySourceIndex === undefined) {
            throw new Error("条件ごとの対象・試料・実験回のID列を対応づけられません。");
          }
          return { column: matrixColumn, sourceIndex, identitySourceIndex };
        });
      const identityFileColumn = fileLayout.columns.find((column) => column.role === "identity");
      const dateFileColumn = fileLayout.columns.find((column) => column.role === "date");
      const identitySourceIndex = identityFileColumn
        ? parsed.columnIndexes[identityFileColumn.key]
        : undefined;
      const dateSourceIndex = dateFileColumn ? parsed.columnIndexes[dateFileColumn.key] : undefined;
      const matched = contract.matching.kind === "matched" && Boolean(identityFileColumn);
      const independent = contract.matching.kind !== "matched";
      const unitIdentityKey = experimentalIdentityKey(contract);
      const currentMatchedIdentities = matchedRowIdentities(contract, observations);
      const currentMatchedIndexes = new Map(
        currentMatchedIdentities.map((identity, index) => [normalizedLabel(identity), index]),
      );
      const newMatchedIndexes = new Map<string, number>();
      const seenFileIdentities = new Set<string>();
      const seenIndependentIdentities = new Map<string, string>();
      type WorksheetFileRowPlan = Readonly<{
        fileRowIndex: number;
        rowIndex: number | null;
        identity?: string;
        identitiesByGroup: Readonly<Record<string, string>>;
      }>;
      const rowPlans = parsed.rows.map<WorksheetFileRowPlan>((record, fileRowIndex) => {
        const identity =
          matched && identitySourceIndex !== undefined
            ? normalizedLabel(record[identitySourceIndex] ?? "")
            : "";
        const hasValue = fileValueColumns.some(({ sourceIndex }) =>
          (record[sourceIndex] ?? "").trim(),
        );
        if (matched && !identity && hasValue) {
          throw new Error(
            `データ行${fileRowIndex + 2}に、対応づける対象・試料・実験回のIDがありません。`,
          );
        }
        if (matched && !identity)
          return { fileRowIndex, rowIndex: null, identity: "", identitiesByGroup: {} };
        if (matched) {
          if (seenFileIdentities.has(identity)) {
            throw new Error("同じ対象・試料・実験回のIDがファイル内で重複しています。");
          }
          seenFileIdentities.add(identity);
          const existingIndex = currentMatchedIndexes.get(identity);
          if (existingIndex !== undefined) {
            return { fileRowIndex, rowIndex: existingIndex, identity, identitiesByGroup: {} };
          }
          const priorNewIndex = newMatchedIndexes.get(identity);
          if (priorNewIndex !== undefined) {
            return { fileRowIndex, rowIndex: priorNewIndex, identity, identitiesByGroup: {} };
          }
          const rowIndex = currentMatchedIdentities.length + newMatchedIndexes.size;
          newMatchedIndexes.set(identity, rowIndex);
          return { fileRowIndex, rowIndex, identity, identitiesByGroup: {} };
        }

        const identitiesByGroup: Record<string, string> = {};
        if (independent && unitIdentityKey) {
          const groups = new Map<string, typeof fileValueColumns>();
          fileValueColumns.forEach((valueColumn) => {
            const groupKey = valueColumn.column.coordinate
              ? conditionKey(valueColumn.column.coordinate.factors)
              : "";
            const group = groups.get(groupKey);
            if (group) group.push(valueColumn);
            else groups.set(groupKey, [valueColumn]);
          });
          groups.forEach((groupColumns, groupKey) => {
            const groupHasValue = groupColumns.some(({ sourceIndex }) =>
              (record[sourceIndex] ?? "").trim(),
            );
            const groupIdentitySourceIndex = groupColumns[0]?.identitySourceIndex;
            const groupIdentity =
              groupIdentitySourceIndex === undefined
                ? ""
                : normalizedLabel(record[groupIdentitySourceIndex] ?? "");
            if (groupHasValue && !groupIdentity) {
              throw new Error(
                `データ行${fileRowIndex + 2}の条件「${groupColumns[0]?.column.coordinate.factors ? Object.values(groupColumns[0].column.coordinate.factors).join(" × ") : "測定"}」に、対象・試料・実験回のIDがありません。`,
              );
            }
            if (!groupIdentity) return;
            identitiesByGroup[groupKey] = groupIdentity;
            if (!groupHasValue) return;
            const priorGroup = seenIndependentIdentities.get(groupIdentity);
            if (priorGroup !== undefined) {
              throw new Error(
                `独立した実験単位のID「${groupIdentity}」が重複しています。条件間で同じIDを再利用しないでください。`,
              );
            }
            seenIndependentIdentities.set(groupIdentity, groupKey);
            const conflictingExisting = observations.find(
              (observation) =>
                normalizedLabel(observation.identities[unitIdentityKey] ?? "") === groupIdentity &&
                conditionKey(observation.factors) !== groupKey,
            );
            if (conflictingExisting) {
              throw new Error(
                `独立した実験単位のID「${groupIdentity}」が別の条件でも使われています。条件ごとに異なるIDを指定してください。`,
              );
            }
          });
        }
        return { fileRowIndex, rowIndex: fileRowIndex, identitiesByGroup };
      });

      let next = observations;
      const datePatches: Array<{ rowIndex: number; date: string }> = [];
      let importedValueCount = 0;
      rowPlans.forEach(({ fileRowIndex, rowIndex, identity, identitiesByGroup }) => {
        if (rowIndex === null) return;
        const record = parsed.rows[fileRowIndex]!;
        if (dateSourceIndex !== undefined) {
          const date = (record[dateSourceIndex] ?? "").trim();
          if (date && !/^\d{4}-\d{2}-\d{2}$/u.test(date)) {
            throw new Error(`データ行${fileRowIndex + 2}の実験日はYYYY-MM-DD形式にしてください。`);
          }
          if (date) datePatches.push({ rowIndex, date });
        }
        fileValueColumns.forEach(({ column, sourceIndex }) => {
          const token = (record[sourceIndex] ?? "").trim();
          const status = canonicalMatrixConditionStatus(
            contract,
            column.coordinate.factors,
            conditionCombinations,
          );
          if (status !== "performed" && token) {
            throw new Error(
              status === "not_performed"
                ? "実施していない条件に値があります。値を削除してから読み込んでください。"
                : "実施したか未確認の条件に値があります。実験の組み立てを確認してから読み込んでください。",
            );
          }
          const parsedValue = parseOptionalSpreadsheetNumber(token);
          if (parsedValue.kind === "invalid") {
            throw new Error(
              `データ行${fileRowIndex + 2}に数値として読めない値「${token}」があります。`,
            );
          }
          const value = parsedValue.kind === "value" ? parsedValue.value : null;
          const identityOverride =
            matched && identity
              ? identity
              : independent && unitIdentityKey
                ? identitiesByGroup[conditionKey(column.coordinate.factors)]
                : undefined;
          // In an independent worksheet, an empty ID means that this
          // condition has no observation on this row.  Never fall back to the
          // row position (which would silently imply matching) just to clear
          // an existing value.
          if (independent && unitIdentityKey && !identityOverride && !token) return;
          const existing = observationAt({
            contract,
            observations: next,
            column,
            rowIndex,
            identityOverride,
          });
          if (value === null && !existing) return;
          next = applyMatrixValue({
            contract,
            observations: next,
            column,
            rowIndex,
            value,
            sourceRow: fileRowIndex + 2,
            identityOverride,
            nextObservationId,
            nextExperimentalUnitIdentity,
          });
          if (value !== null) importedValueCount += 1;
        });
      });
      validateTypedValues(contract, next);
      if (onFileImport)
        onFileImport({
          observations: next,
          mapping: parsed.mapping,
          rawLineage: parsed.rawLineage,
        });
      else onObservationsChange(next);
      datePatches.forEach(({ rowIndex, date }) => onRowChange?.(rowIndex, { date }));
      setFileStatus(
        locale === "ja"
          ? `${file.name}を読み込みました。${importedValueCount}件の数値を現在の入力表へ反映しました。`
          : `Loaded ${file.name}. Applied ${importedValueCount} numeric values to the current data table.`,
      );
    } catch (cause) {
      setFileError(
        locale === "ja"
          ? `${cause instanceof Error ? cause.message : "ファイルを読み込めませんでした"} 既存の値は変更していません。`
          : "The file could not be loaded. Existing values were not changed.",
      );
    } finally {
      setFileBusy(false);
      if (fileInputRef.current) fileInputRef.current.value = "";
    }
  };

  if (!eligible) {
    return (
      <p className="adaptive-canonical-spreadsheet__mode-note" role="note">
        {t(
          "この構造は、対象ID・階層・時間の対応を隠さない1測定1行の表で表示します。",
          "This structure is shown as one measurement per row so subject IDs, hierarchy, and ordered-axis relationships remain explicit.",
        )}
      </p>
    );
  }

  return (
    <>
      <div className="canonical-matrix-worksheet__file-import">
        <LocalizedFileInput
          inputRef={fileInputRef}
          label={t("CSV / TSV / TXTファイルを読み込む", "Load CSV / TSV / TXT file")}
          ariaLabel={t("CSV / TSV / TXTファイルを読み込む", "Load CSV / TSV / TXT file")}
          accept=".csv,.tsv,.txt,text/csv,text/tab-separated-values,text/plain"
          disabled={!editable || fileBusy}
          onChange={(event) => {
            const file = event.currentTarget.files?.[0];
            if (file) void importWorksheetFile(file);
          }}
        />
        <small>
          {t(
            "1行目はこの表の見出しです。現在の条件列だけに対応し、別の実験構造は作りません。",
            "The first row contains this table’s headings. Import maps only to the current condition columns and does not create another experiment structure.",
          )}
        </small>
        {contract.matching.kind !== "matched" && independentIdentityKey ? (
          <button
            type="button"
            aria-pressed={showIndependentIdentities}
            onClick={() => setShowIndependentIdentities((visible) => !visible)}
          >
            {showIndependentIdentities
              ? t("対象・試料IDを隠す", "Hide subject/specimen IDs")
              : t("対象・試料IDを表示／編集", "Show/edit subject/specimen IDs")}
          </button>
        ) : null}
      </div>
      <div className="adaptive-canonical-spreadsheet__table-wrap canonical-matrix-worksheet">
        <table
          id={tableId}
          aria-label={
            editable
              ? t("条件別連続入力表", "Continuous data entry by condition")
              : t("条件別連続表示表", "Continuous data by condition")
          }
        >
          <caption>{t("条件別シート", "Sheet by condition")}</caption>
          <thead>
            {contract.factors.map((factor, factorIndex) => (
              <tr key={factor.key}>
                <th scope="row" className="canonical-matrix-worksheet__factor-label">
                  {factor.label}
                </th>
                {factorIndex === 0 && showDate ? (
                  <th
                    scope="col"
                    rowSpan={headerDepth}
                    className="canonical-matrix-worksheet__date-heading"
                  >
                    {t(SHARED_EXPERIMENT_DATE_LABEL, "Experiment date shared by this row")}
                    <small>
                      {t(
                        SHARED_EXPERIMENT_DATE_HELP,
                        "Optional; use only when every condition in the row was run on the same date. Dates do not determine matching.",
                      )}
                    </small>
                  </th>
                ) : null}
                {headerRuns(
                  displayColumns,
                  (column) =>
                    JSON.stringify(
                      contract.factors
                        .slice(0, factorIndex + 1)
                        .map(({ key }) => column.coordinate.factors[key] ?? "—"),
                    ),
                  (column) => column.coordinate.factors[factor.key] ?? "—",
                ).map((run) => (
                  <th scope="colgroup" colSpan={run.span} key={run.key}>
                    {run.label}
                  </th>
                ))}
              </tr>
            ))}
            {showComponentHeaders ? (
              <tr>
                <th scope="row" className="canonical-matrix-worksheet__factor-label">
                  {t("測定項目", "Measured value")}
                </th>
                {contract.factors.length === 0 && showDate ? (
                  <th scope="col" rowSpan={2} className="canonical-matrix-worksheet__date-heading">
                    {t(SHARED_EXPERIMENT_DATE_LABEL, "Experiment date shared by this row")}
                    <small>
                      {t(
                        SHARED_EXPERIMENT_DATE_HELP,
                        "Optional; use only when every condition in the row was run on the same date. Dates do not determine matching.",
                      )}
                    </small>
                  </th>
                ) : null}
                {displayColumns.map((column) =>
                  column.role === "identity" ? (
                    <th scope="col" rowSpan={2} key={column.key}>
                      {column.readoutLabel}
                      <small>
                        {t("条件ごとの対象・試料ID", "Subject/specimen ID for each condition")}
                      </small>
                    </th>
                  ) : (
                    <th scope="col" key={column.key}>
                      {column.readoutLabel}
                    </th>
                  ),
                )}
              </tr>
            ) : null}
            <tr>
              <th scope="col" className="canonical-matrix-worksheet__row-label-heading">
                {rowHeaderLabel}
                {contract.matching.kind === "matched" ? (
                  <small>
                    {t("同じIDの条件は対応", "Conditions with the same ID are matched")}
                  </small>
                ) : null}
              </th>
              {contract.factors.length === 0 && !showComponentHeaders && showDate ? (
                <th scope="col" className="canonical-matrix-worksheet__date-heading">
                  {t(SHARED_EXPERIMENT_DATE_LABEL, "Experiment date shared by this row")}
                  <small>
                    {t(
                      SHARED_EXPERIMENT_DATE_HELP,
                      "Optional; use only when every condition in the row was run on the same date. Dates do not determine matching.",
                    )}
                  </small>
                </th>
              ) : null}
              {displayColumns.map((column) => {
                if (showComponentHeaders && column.role === "identity") return null;
                return (
                  <th scope="col" key={column.key}>
                    {showComponentHeaders ? column.componentLabel : column.readoutLabel}
                    {canonicalMatrixConditionStatus(
                      contract,
                      column.coordinate.factors,
                      conditionCombinations,
                    ) !== "performed" ? (
                      <small className="canonical-matrix-worksheet__condition-status">
                        {canonicalMatrixConditionStatus(
                          contract,
                          column.coordinate.factors,
                          conditionCombinations,
                        ) === "not_performed"
                          ? t("実施していない", "Not performed")
                          : t("未確認", "Unconfirmed")}
                      </small>
                    ) : null}
                  </th>
                );
              })}
            </tr>
          </thead>
          <tbody>
            {Array.from({ length: rowCount }, (_, rowIndex) => {
              const existingMatchedIdentity =
                contract.matching.kind === "matched"
                  ? matchedRowIdentities(contract, observations)[rowIndex]
                  : undefined;
              const rowIdentity =
                contract.matching.kind === "matched"
                  ? generatedRowIdentity(contract, observations, rowIndex)
                  : rows[rowIndex]?.label ||
                    (locale === "ja" ? `入力行 ${rowIndex + 1}` : `Entry row ${rowIndex + 1}`);
              const visibleRowLabel =
                contract.matching.kind === "matched" ? rowIdentity : String(rowIndex + 1);
              return (
                <tr key={rows[rowIndex]?.key ?? `worksheet-row.${rowIndex + 1}`}>
                  <th scope="row">
                    {existingMatchedIdentity ? (
                      <MatchedRowIdentityEditor
                        contract={contract}
                        observations={observations}
                        rowIndex={rowIndex}
                        label={rowHeaderLabel}
                        readOnly={!editable}
                        onObservationsChange={onObservationsChange}
                      />
                    ) : (
                      visibleRowLabel
                    )}
                  </th>
                  {showDate ? (
                    <td className="canonical-matrix-worksheet__date">
                      <input
                        aria-label={
                          locale === "ja"
                            ? `${rowIdentity}の${SHARED_EXPERIMENT_DATE_LABEL}`
                            : `${rowIdentity} experiment date shared by this row`
                        }
                        type="date"
                        value={rows[rowIndex]?.date ?? ""}
                        disabled={!rows[rowIndex] || !onRowChange}
                        data-spreadsheet-cell="true"
                        data-spreadsheet-row={rowIndex}
                        data-spreadsheet-column={0}
                        onChange={(event) =>
                          onRowChange?.(rowIndex, { date: event.currentTarget.value })
                        }
                        onKeyDown={moveSpreadsheetFocus}
                      />
                    </td>
                  ) : null}
                  {displayColumns.map((column, displayColumnIndex) => {
                    const conditionStatus = canonicalMatrixConditionStatus(
                      contract,
                      column.coordinate.factors,
                      conditionCombinations,
                    );
                    if (column.role === "identity") {
                      const draftKey = independentIdentityDraftKey(
                        column.coordinate.factors,
                        rowIndex,
                      );
                      const canonicalIdentity =
                        independentUnitIdentities(
                          contract,
                          observations,
                          column.coordinate.factors,
                        )[rowIndex] ?? "";
                      const draftIdentity = identityDrafts[draftKey];
                      const identity = canonicalIdentity || draftIdentity || "";
                      if (conditionStatus !== "performed") {
                        return (
                          <td key={column.key}>
                            <span
                              className={`canonical-matrix-worksheet__unavailable is-${conditionStatus}`}
                              role="note"
                            >
                              {conditionStatus === "not_performed"
                                ? t("実施していない", "Not performed")
                                : t("未確認", "Unconfirmed")}
                            </span>
                          </td>
                        );
                      }
                      return (
                        <td key={column.key}>
                          <IndependentRowIdentityEditor
                            initialIdentity={identity}
                            canonicalIdentity={canonicalIdentity}
                            label={
                              locale === "ja"
                                ? `${rowIdentity}・${column.coordinate.factors ? Object.values(column.coordinate.factors).join("・") : "測定"}・${column.readoutLabel}`
                                : `${rowIdentity}, ${column.coordinate.factors ? Object.values(column.coordinate.factors).join(", ") : "Measurement"}, ${column.readoutLabel}`
                            }
                            rowIndex={rowIndex}
                            gridColumn={displayColumnIndex + (showDate ? 1 : 0)}
                            readOnly={!editable}
                            onDraftChange={(nextIdentity) =>
                              setIdentityDrafts((previous) => ({
                                ...previous,
                                [draftKey]: nextIdentity,
                              }))
                            }
                            onCommit={(nextIdentity) =>
                              commitIndependentIdentity({
                                factors: column.coordinate.factors,
                                rowIndex,
                                identity: nextIdentity,
                              })
                            }
                          />
                        </td>
                      );
                    }
                    return (
                      <td key={column.key}>
                        <MatrixCell
                          contract={contract}
                          observations={observations}
                          column={column}
                          rowIndex={rowIndex}
                          columnIndex={columns.findIndex(({ key }) => key === column.key)}
                          gridColumn={displayColumnIndex + (showDate ? 1 : 0)}
                          readOnly={!editable}
                          identityOverride={
                            contract.matching.kind === "matched"
                              ? undefined
                              : independentIdentityOverride(
                                  contract,
                                  observations,
                                  identityDrafts,
                                  column.coordinate.factors,
                                  rowIndex,
                                )
                          }
                          nextObservationId={nextObservationId}
                          nextExperimentalUnitIdentity={nextExperimentalUnitIdentity}
                          onObservationsChange={onObservationsChange}
                          onMatrixPaste={pasteMatrix}
                          conditionStatus={conditionStatus}
                        />
                      </td>
                    );
                  })}
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
      {readOnly ? (
        <p className="adaptive-canonical-spreadsheet__mode-note" role="note">
          {t(
            "元の表との対応を保つため、この連続表は読み取り専用です。",
            "This continuous table is read-only to preserve its alignment with the source table.",
          )}
        </p>
      ) : null}
      {pasteError ? (
        <p className="adaptive-canonical-spreadsheet__paste-error" role="alert">
          {pasteError}
        </p>
      ) : null}
      {fileError ? (
        <p className="adaptive-canonical-spreadsheet__paste-error" role="alert">
          {fileError}
        </p>
      ) : null}
      {fileStatus ? (
        <p className="canonical-matrix-worksheet__file-status" role="status" aria-live="polite">
          {fileStatus}
        </p>
      ) : null}
    </>
  );
}

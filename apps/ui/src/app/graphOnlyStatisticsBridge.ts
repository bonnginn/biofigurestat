import { assertCanonicalObservationsForContract } from "@lsaa/adaptive-input";
import {
  AdaptiveColumnMappingSchema,
  AdaptiveRawLineageSchema,
  CanonicalAdaptiveObservationSchema,
  type AdaptiveColumnMapping,
  type AdaptiveRawLineage,
  type CanonicalAdaptiveObservation,
  type StructureContract,
} from "@lsaa/domain";
import {
  resolveUnresolvedVisualizationIdentityDecision,
  type UnresolvedVisualizationProjectState,
} from "@lsaa/project";

export type GraphOnlyStatisticsBridgeStopCode =
  | "VISUALIZATION_MAPPING_REQUIRED"
  | "ONE_FACTOR_SCALAR_ONLY"
  | "ORDERED_OR_NESTED_STRUCTURE_REQUIRES_MAPPING"
  | "SERIES_MEANING_REQUIRED"
  | "IDENTITY_COLUMN_REQUIRED"
  | "IDENTITY_DECISION_REQUIRED"
  | "IDENTITY_SET_INVALID"
  | "UNSUPPORTED_MATCHING_STRUCTURE"
  | "FACTOR_LEVEL_MISMATCH"
  | "INVALID_NUMERIC_VALUE"
  | "DUPLICATE_HEADER"
  | "INVALID_SOURCE_TABLE";

export type GraphOnlyStatisticsBridgeResult =
  | Readonly<{
      status: "ready";
      observations: readonly CanonicalAdaptiveObservation[];
      mapping: AdaptiveColumnMapping;
      lineage: AdaptiveRawLineage;
    }>
  | Readonly<{
      status: "stopped";
      code: GraphOnlyStatisticsBridgeStopCode;
      reason: string;
    }>;

const missingTokens = new Set(["", "NA", "N/A", "—", "Undetermined"]);

function stop(
  code: GraphOnlyStatisticsBridgeStopCode,
  reason: string,
): GraphOnlyStatisticsBridgeResult {
  return { status: "stopped", code, reason };
}

/**
 * Promotes a Graph-only table only when its explicit column mapping and a
 * researcher-confirmed StructureContract establish every required coordinate.
 * The function deliberately covers the common one-factor scalar slice.  It
 * never treats row order as matching and never ignores a selected series.
 */
export function bridgeGraphOnlyTableToStatistics(
  state: UnresolvedVisualizationProjectState,
  contract: StructureContract,
  confirmedAt = new Date().toISOString(),
): GraphOnlyStatisticsBridgeResult {
  if (state.entryIntent !== "graph_only") {
    return stop(
      "INVALID_SOURCE_TABLE",
      "この引継ぎ経路は通常のGraph用の表だけを対象にしています。行列データを別の実験構造へ変換せず、元の表を保持します。",
    );
  }
  const mapping = state.mapping;
  if (!mapping) {
    return stop(
      "VISUALIZATION_MAPPING_REQUIRED",
      "Graphで使う列の指定がありません。元の表は保持されています。",
    );
  }
  if (new Set(state.table.headers).size !== state.table.headers.length) {
    return stop(
      "DUPLICATE_HEADER",
      "同じ列名が複数あります。列名を区別してから実験構造へ進んでください。",
    );
  }
  if (
    contract.factors.length !== 1 ||
    contract.readouts.length !== 1 ||
    contract.readouts[0]?.representation !== "scalar"
  ) {
    return stop(
      "ONE_FACTOR_SCALAR_ONLY",
      "この表からの自動引継ぎは、1つの処理・群分けと1つの数値測定に限定しています。元の表は保持されています。",
    );
  }
  if (contract.matching.kind !== "independent" && contract.matching.kind !== "matched") {
    return stop(
      "UNSUPPORTED_MATCHING_STRUCTURE",
      "この表からの自動引継ぎは、条件ごとに別々の対象を使った実験、または明示的なIDで同じ対象を対応させた実験に限定しています。元の表は保持されています。",
    );
  }
  const matchingIdentity =
    contract.matching.kind === "matched"
      ? contract.identities.find(({ key }) => key === contract.matching.identityKey)
      : null;
  if (
    contract.matching.kind === "matched" &&
    matchingIdentity?.unitLevelKey !== contract.experimentalUnitLevelKey
  ) {
    return stop(
      "UNSUPPORTED_MATCHING_STRUCTURE",
      "条件間の対応に、各行の対象・試料とは別の元材料IDが必要です。この限定的な引継ぎ経路では一方のIDへ置き換えず、元の表を保持して停止します。",
    );
  }
  if (
    contract.orderedAxes.length > 0 ||
    contract.factors.some(({ ordered }) => ordered) ||
    contract.unitLevels.some(({ key }) => key !== contract.experimentalUnitLevelKey)
  ) {
    return stop(
      "ORDERED_OR_NESTED_STRUCTURE_REQUIRES_MAPPING",
      "時間などの順序またはCell・ROI等の階層を、この表の列へ対応付ける必要があります。元の表は保持されています。",
    );
  }

  const xColumns = mapping.columns.filter(({ role }) => role === "x");
  const yColumns = mapping.columns.filter(({ role }) => role === "y");
  const idColumns = mapping.columns.filter(({ role }) => role === "id");
  const unresolvedGroupingColumns = mapping.columns.filter(
    ({ role }) => role === "series" || role === "facet",
  );
  if (
    xColumns.length !== 1 ||
    yColumns.length !== 1 ||
    idColumns.length > 1 ||
    xColumns[0]?.index === yColumns[0]?.index
  ) {
    return stop(
      "VISUALIZATION_MAPPING_REQUIRED",
      "横軸と測定値の列をそれぞれ1つだけ指定してください。元の表は保持されています。",
    );
  }
  const xColumn = xColumns[0]!;
  const yColumn = yColumns[0]!;
  const idColumn = idColumns[0];
  const identityDecision = resolveUnresolvedVisualizationIdentityDecision(mapping);
  if (identityDecision === "unanswered") {
    return stop(
      "IDENTITY_DECISION_REQUIRED",
      "元の表に対象・試料IDの列があるか確認してください。IDがないと明示されるまで、行番号を対象IDとして使いません。元の表は保持されています。",
    );
  }
  if (
    (identityDecision === "selected_column" && !idColumn) ||
    (identityDecision === "no_id" && idColumn)
  ) {
    return stop(
      "VISUALIZATION_MAPPING_REQUIRED",
      "対象・試料IDについての回答と、選択された列が一致しません。元の表は保持されています。",
    );
  }
  if (unresolvedGroupingColumns.length > 0) {
    return stop(
      "SERIES_MEANING_REQUIRED",
      "グループ・分割列が処理条件、batch、または表示だけの分類のどれか確認が必要です。元の表は保持されています。",
    );
  }
  const requiredExperimentalUnitIdentities = contract.identities.filter(
    ({ unitLevelKey, required }) => unitLevelKey === contract.experimentalUnitLevelKey && required,
  );
  const identity = requiredExperimentalUnitIdentities[0];
  if (requiredExperimentalUnitIdentities.length !== 1 || !identity) {
    return stop(
      "INVALID_SOURCE_TABLE",
      "独立した対象・試料を一意に識別する項目を1つに確定できません。元の表は保持されています。",
    );
  }
  const factor = contract.factors[0]!;
  const readout = contract.readouts[0]!;
  const factorMatchesRelationship =
    (contract.matching.kind === "independent" &&
      factor.unitRole === "between_unit" &&
      factor.relationship === "independent") ||
    (contract.matching.kind === "matched" &&
      factor.unitRole === "within_unit" &&
      ["paired", "repeated"].includes(factor.relationship) &&
      contract.matching.identityKey === identity.key &&
      contract.matching.completeSetsRequired === true);
  if (!factorMatchesRelationship) {
    return stop(
      "UNSUPPORTED_MATCHING_STRUCTURE",
      "条件と対象・試料の対応関係が、この限定的な引継ぎ経路で確認できる形式ではありません。元の表は保持されています。",
    );
  }
  if (contract.matching.kind === "matched" && !idColumn) {
    return stop(
      "IDENTITY_COLUMN_REQUIRED",
      "同じ対象を条件間で対応させるには、元の表で同じ対象を示すID列が必要です。行順では対応させません。",
    );
  }
  if (state.table.rows.some((row) => row.length !== state.table.headers.length)) {
    return stop(
      "INVALID_SOURCE_TABLE",
      "行ごとの列数がそろっていません。空欄も列として残してください。",
    );
  }
  if (!state.table.delimiter || !state.table.headerRow) {
    return stop(
      "INVALID_SOURCE_TABLE",
      "元の表の区切りまたは列名の行を確認できません。元の表は保持されています。",
    );
  }

  const observedLevels = new Set(state.table.rows.map((row) => row[xColumn.index]?.trim() ?? ""));
  if (
    observedLevels.has("") ||
    [...observedLevels].some((level) => !factor.levels.includes(level)) ||
    factor.levels.some((level) => !observedLevels.has(level))
  ) {
    return stop(
      "FACTOR_LEVEL_MISMATCH",
      "表の横軸の値と、確認した処理・群分けの値が一致しません。どちらも保持したまま修正してください。",
    );
  }

  if (idColumn) {
    const identityOccurrences = new Map<string, Map<string, number>>();
    for (const [rowIndex, row] of state.table.rows.entries()) {
      const sourceIdentity = row[idColumn.index]?.trim() ?? "";
      if (!sourceIdentity) {
        return stop(
          "IDENTITY_COLUMN_REQUIRED",
          `${(state.table.headerRow ?? 1) + rowIndex + 1}行目に対象IDがありません。行順では対応させません。`,
        );
      }
      const level = row[xColumn.index]!.trim();
      const byLevel = identityOccurrences.get(sourceIdentity) ?? new Map<string, number>();
      byLevel.set(level, (byLevel.get(level) ?? 0) + 1);
      identityOccurrences.set(sourceIdentity, byLevel);
    }

    if (contract.matching.kind === "independent") {
      const duplicateIdentity = [...identityOccurrences.entries()].find(
        ([, byLevel]) => [...byLevel.values()].reduce((sum, count) => sum + count, 0) > 1,
      );
      if (duplicateIdentity) {
        return stop(
          "IDENTITY_SET_INVALID",
          `条件ごとに別々の対象を使った実験として確認されていますが、ID「${duplicateIdentity[0]}」が複数行にあります。同じ対象の対応測定か、IDの重複かを確認してください。元の表は保持されています。`,
        );
      }
    } else {
      const incompleteIdentity = [...identityOccurrences.entries()].find(([, byLevel]) =>
        factor.levels.some((level) => byLevel.get(level) !== 1),
      );
      if (incompleteIdentity) {
        return stop(
          "IDENTITY_SET_INVALID",
          `対応のある実験として確認されていますが、ID「${incompleteIdentity[0]}」が各条件に1回ずつそろっていません。行順や不完全な組を対応済みとは扱いません。元の表は保持されています。`,
        );
      }
    }
  }

  const observations: CanonicalAdaptiveObservation[] = [];
  for (const [rowIndex, row] of state.table.rows.entries()) {
    const rawValue = row[yColumn.index]?.trim() ?? "";
    const isMissing = missingTokens.has(rawValue);
    const numeric = isMissing ? null : Number(rawValue);
    if (!isMissing && !Number.isFinite(numeric)) {
      return stop(
        "INVALID_NUMERIC_VALUE",
        `${state.table.headerRow + rowIndex + 1}行目の測定値を数値として読めません。元の値は保持されています。`,
      );
    }
    const sourceIdentity = idColumn ? (row[idColumn.index]?.trim() ?? "") : "";
    if (contract.matching.kind === "matched" && !sourceIdentity) {
      return stop(
        "IDENTITY_COLUMN_REQUIRED",
        `${state.table.headerRow + rowIndex + 1}行目に対象IDがありません。行順では対応させません。`,
      );
    }
    observations.push(
      CanonicalAdaptiveObservationSchema.parse({
        observationId: `adaptive.${contract.contractId}.graph_only.${rowIndex + 1}`,
        readoutKey: readout.key,
        identities: {
          [identity.key]: sourceIdentity || `source-row-${state.table.headerRow + rowIndex + 1}`,
        },
        factors: { [factor.key]: row[xColumn.index]!.trim() },
        axes: {},
        hierarchy: {},
        values: { [readout.key]: numeric },
        missingness: isMissing ? { [readout.key]: "unknown" } : {},
        sourceRow: state.table.headerRow + rowIndex + 1,
      }),
    );
  }

  try {
    assertCanonicalObservationsForContract(contract, observations);
  } catch {
    return stop(
      "INVALID_SOURCE_TABLE",
      "確認した実験構造に必要な情報が表にありません。元の表は保持されています。",
    );
  }

  const adaptiveMapping = AdaptiveColumnMappingSchema.parse({
    schemaVersion: "0.1.0",
    sourceLabel: state.rawLineage.sourceLabel,
    delimiter: state.table.delimiter,
    headerRow: state.table.headerRow,
    columns: Object.fromEntries(
      state.table.headers.map((header, index) => {
        if (index === xColumn.index) return [header, { role: "factor", semanticKey: factor.key }];
        if (index === yColumn.index) return [header, { role: "value", semanticKey: readout.key }];
        if (idColumn && index === idColumn.index)
          return [header, { role: "identity", semanticKey: identity.key }];
        return [header, { role: "metadata", semanticKey: null }];
      }),
    ),
    confirmedAt,
  });
  const lineage = AdaptiveRawLineageSchema.parse({
    ...state.rawLineage,
    schemaVersion: "0.1.0",
    transformations: [
      ...state.rawLineage.transformations,
      "researcher_confirmed_graph_only_statistics_bridge",
    ],
  });
  return { status: "ready", observations, mapping: adaptiveMapping, lineage };
}

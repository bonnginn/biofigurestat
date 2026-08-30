import type { CanonicalAdaptiveObservation, StructureContract } from "@lsaa/domain";
import {
  buildAdaptiveObservationViews,
  type AdaptiveCompactGroup,
  type AdaptiveObservationViews,
  type AdaptiveObservationViewMode,
} from "./adaptive-observation-views";

/** A value which can be placed in one spreadsheet cell. */
export type SpreadsheetScalar = string | number | boolean | null;
export type SpreadsheetCell = SpreadsheetScalar | readonly SpreadsheetScalar[];

export type AdaptiveSpreadsheetColumnRole =
  | "observation_id"
  | "readout"
  | "identity"
  | "factor"
  | "axis"
  | "hierarchy"
  | "value"
  | "missingness"
  | "source_row";

export type AdaptiveSpreadsheetColumn = Readonly<{
  key: string;
  label: string;
  role: AdaptiveSpreadsheetColumnRole;
  semanticKey: string | null;
  readoutKey: string | null;
}>;

export type AdaptiveExpandedSpreadsheetRow = Readonly<{
  rowKey: string;
  observationId: string;
  /** Every canonical coordinate is flattened for a generic table renderer. */
  cells: Readonly<Record<string, SpreadsheetScalar>>;
  observation: CanonicalAdaptiveObservation;
}>;

export type AdaptiveCompactSpreadsheetRow = Readonly<{
  rowKey: string;
  observationIds: readonly string[];
  /** Arrays represent values in one compact cell; they do not represent n padding. */
  cells: Readonly<Record<string, SpreadsheetCell>>;
  /** One group per declared readout; canonical observations are never merged. */
  readoutGroups: readonly AdaptiveCompactGroup[];
  /** First available declared readout, retained for single-readout callers. */
  group: AdaptiveCompactGroup;
}>;

export type AdaptiveSpreadsheetViewModel = Readonly<{
  schemaVersion: "0.1.0";
  columns: readonly AdaptiveSpreadsheetColumn[];
  compact: Readonly<{
    mode: "compact";
    columns: readonly AdaptiveSpreadsheetColumn[];
    rows: readonly AdaptiveCompactSpreadsheetRow[];
    observationIds: readonly string[];
    observationCount: number;
  }>;
  expanded: Readonly<{
    mode: "expanded";
    columns: readonly AdaptiveSpreadsheetColumn[];
    rows: readonly AdaptiveExpandedSpreadsheetRow[];
    observationIds: readonly string[];
    observationCount: number;
  }>;
  compactEditability: AdaptiveObservationViews["compactEditability"];
}>;

type KeyedMap = Readonly<Record<string, unknown>>;

function compareKeys(first: string, second: string): number {
  return first < second ? -1 : first > second ? 1 : 0;
}

function uniqueKeys(values: readonly string[]): string[] {
  return [...new Set(values)].sort(compareKeys);
}

function uniqueKeysInOrder(values: readonly string[]): string[] {
  const seen = new Set<string>();
  return values.filter((value) => {
    if (seen.has(value)) return false;
    seen.add(value);
    return true;
  });
}

function declaredThenObservedKeys(
  declared: readonly string[],
  observed: readonly string[],
): string[] {
  const declaredInOrder = uniqueKeysInOrder(declared);
  const declaredSet = new Set(declaredInOrder);
  return [...declaredInOrder, ...uniqueKeys(observed).filter((key) => !declaredSet.has(key))];
}

function factorCombinations(contract: StructureContract): Array<Record<string, string>> {
  return contract.factors.reduce<Array<Record<string, string>>>(
    (rows, factor) =>
      rows.flatMap((row) => factor.levels.map((level) => ({ ...row, [factor.key]: level }))),
    [{}],
  );
}

function compactCoordinateKey(input: {
  readoutKey: string;
  factors: Readonly<Record<string, string>>;
  axes: Readonly<Record<string, string | number>>;
  hierarchy: Readonly<Record<string, string>>;
}): string {
  const ordered = (record: Readonly<Record<string, string | number>>) =>
    Object.fromEntries(Object.entries(record).sort(([left], [right]) => compareKeys(left, right)));
  return JSON.stringify({
    readoutKey: input.readoutKey,
    factors: ordered(input.factors),
    axes: ordered(input.axes),
    hierarchy: ordered(input.hierarchy),
  });
}

/**
 * A compact spreadsheet row is a condition/axis/hierarchy coordinate. The
 * readout is deliberately omitted so two measurements from the same
 * experiment occupy columns in one row rather than duplicate rows.
 */
function compactRowCoordinateKey(input: {
  factors: Readonly<Record<string, string>>;
  axes: Readonly<Record<string, string | number>>;
  hierarchy: Readonly<Record<string, string>>;
}): string {
  const ordered = (record: Readonly<Record<string, string | number>>) =>
    Object.fromEntries(Object.entries(record).sort(([left], [right]) => compareKeys(left, right)));
  return JSON.stringify({
    factors: ordered(input.factors),
    axes: ordered(input.axes),
    hierarchy: ordered(input.hierarchy),
  });
}

function unionKeys(records: readonly KeyedMap[], field: keyof KeyedMap): string[] {
  return uniqueKeys(
    records.flatMap((record) => Object.keys((record[field] as KeyedMap | undefined) ?? {})),
  );
}

function labelFor(
  contract: StructureContract,
  role: AdaptiveSpreadsheetColumnRole,
  semanticKey: string,
): string {
  if (role === "identity") {
    return (
      contract.identities.find((identity) => identity.key === semanticKey)?.label ?? semanticKey
    );
  }
  if (role === "factor") {
    return contract.factors.find((factor) => factor.key === semanticKey)?.label ?? semanticKey;
  }
  if (role === "axis") {
    const axis = contract.orderedAxes.find((candidate) => candidate.key === semanticKey);
    if (!axis) return semanticKey;
    return axis.unit.trim() ? `${axis.label} (${axis.unit.trim()})` : axis.label;
  }
  if (role === "hierarchy") {
    return contract.unitLevels.find((level) => level.key === semanticKey)?.label ?? semanticKey;
  }
  if (role === "value" || role === "missingness") {
    for (const readout of contract.readouts) {
      if (semanticKey === readout.key) return readout.label;
      const component = readout.componentKeys.find(
        (candidate) => candidate === semanticKey || `${readout.key}_${candidate}` === semanticKey,
      );
      if (component) return `${readout.label} · ${component}`;
    }
  }
  return semanticKey;
}

function readoutValueAliases(
  readout: StructureContract["readouts"][number],
  semanticKey: string,
): readonly string[] {
  if (readout.representation === "scalar") return [readout.key];
  const component = readout.componentKeys.find(
    (candidate) => candidate === semanticKey || `${readout.key}_${candidate}` === semanticKey,
  );
  return component ? [`${readout.key}_${component}`, component] : [semanticKey];
}

function recordValueForColumn(
  contract: StructureContract,
  column: AdaptiveSpreadsheetColumn,
  record: KeyedMap,
): SpreadsheetScalar {
  if (!column.semanticKey) return null;
  const readout = column.readoutKey
    ? contract.readouts.find(({ key }) => key === column.readoutKey)
    : undefined;
  const candidates = readout
    ? readoutValueAliases(readout, column.semanticKey)
    : [column.semanticKey];
  for (const key of candidates) {
    if (Object.prototype.hasOwnProperty.call(record, key)) {
      return scalarRecordValue(record, key);
    }
  }
  return null;
}

function valueColumnKey(role: "value" | "missingness", semanticKey: string): string {
  return `${role}.${semanticKey}`;
}

function coordinateColumn(
  role: Exclude<
    AdaptiveSpreadsheetColumnRole,
    "observation_id" | "value" | "missingness" | "source_row"
  >,
  semanticKey: string,
  contract: StructureContract,
): AdaptiveSpreadsheetColumn {
  return {
    key: `${role}.${semanticKey}`,
    label: labelFor(contract, role, semanticKey),
    role,
    semanticKey,
    readoutKey: null,
  };
}

function buildColumns(
  contract: StructureContract,
  observations: readonly CanonicalAdaptiveObservation[],
): AdaptiveSpreadsheetColumn[] {
  const records = observations as readonly KeyedMap[];
  const identityKeys = declaredThenObservedKeys(
    contract.identities.map((identity) => identity.key),
    unionKeys(records, "identities"),
  );
  const factorKeys = declaredThenObservedKeys(
    contract.factors.map((factor) => factor.key),
    unionKeys(records, "factors"),
  );
  const axisKeys = declaredThenObservedKeys(
    contract.orderedAxes.map((axis) => axis.key),
    unionKeys(records, "axes"),
  );
  const hasHierarchy =
    contract.unitLevels.some((level) => level.parentKey !== null) ||
    observations.some((observation) => Object.keys(observation.hierarchy).length > 0);
  const hierarchyKeys = hasHierarchy
    ? declaredThenObservedKeys(
        contract.unitLevels.filter((level) => level.parentKey !== null).map((level) => level.key),
        unionKeys(records, "hierarchy"),
      )
    : [];
  const declaredValueColumns = contract.readouts.flatMap((readout) =>
    (readout.representation === "scalar"
      ? [readout.key]
      : readout.componentKeys.map((component) => {
          const prefixed = `${readout.key}_${component}`;
          // Keep component columns namespaced by readout. Older canonical
          // records may use the component name directly; recordValueForColumn
          // resolves that legacy alias without exposing an ambiguous column.
          return prefixed;
        })
    ).map((key) => ({ key, readoutKey: readout.key })),
  );
  const declaredValueKeys = new Set(
    declaredValueColumns.flatMap(({ key, readoutKey }) => {
      const readout = contract.readouts.find((candidate) => candidate.key === readoutKey);
      return readout ? readoutValueAliases(readout, key) : [key];
    }),
  );
  const observedValueExtras = uniqueKeys(unionKeys(records, "values")).filter(
    (key) => !declaredValueKeys.has(key),
  );
  const valueColumns = [
    ...declaredValueColumns,
    ...observedValueExtras.map((key) => ({ key, readoutKey: null })),
  ];
  const declaredMissingnessKeys = new Set(declaredValueKeys);
  const missingnessColumns = [
    ...uniqueKeysInOrder(
      contract.readouts.flatMap((readout) =>
        observations.flatMap((observation) =>
          Object.keys(observation.missingness).filter((key) =>
            readoutValueAliases(readout, key).includes(key),
          ),
        ),
      ),
    ).map((key) => ({
      key,
      readoutKey:
        contract.readouts.find((readout) => readoutValueAliases(readout, key).includes(key))?.key ??
        null,
    })),
    ...uniqueKeys(unionKeys(records, "missingness"))
      .filter((key) => !declaredMissingnessKeys.has(key))
      .map((key) => ({ key, readoutKey: null })),
  ];
  return [
    {
      key: "observation_id",
      label: "Observation ID",
      role: "observation_id" as const,
      semanticKey: null,
      readoutKey: null,
    },
    ...(contract.readouts.length > 1
      ? [
          {
            key: "readout",
            label: "測定項目",
            role: "readout" as const,
            semanticKey: null,
            readoutKey: null,
          },
        ]
      : []),
    ...identityKeys.map((key) => coordinateColumn("identity", key, contract)),
    ...factorKeys.map((key) => coordinateColumn("factor", key, contract)),
    ...axisKeys.map((key) => coordinateColumn("axis", key, contract)),
    ...hierarchyKeys.map((key) => coordinateColumn("hierarchy", key, contract)),
    ...valueColumns.map(({ key, readoutKey }) => ({
      key: valueColumnKey("value", key),
      label: labelFor(contract, "value", key),
      role: "value" as const,
      semanticKey: key,
      readoutKey,
    })),
    ...missingnessColumns.map(({ key, readoutKey }) => ({
      key: valueColumnKey("missingness", key),
      label: labelFor(contract, "missingness", key),
      role: "missingness" as const,
      semanticKey: key,
      readoutKey,
    })),
    {
      key: "source_row",
      label: "Source row",
      role: "source_row" as const,
      semanticKey: null,
      readoutKey: null,
    },
  ];
}

function scalarRecordValue(record: KeyedMap, key: string): SpreadsheetScalar {
  const value = record[key];
  return value === undefined ? null : (value as SpreadsheetScalar);
}

function buildExpandedRows(
  rows: AdaptiveObservationViews["expanded"]["rows"],
  contract: StructureContract,
  columns: readonly AdaptiveSpreadsheetColumn[],
): AdaptiveExpandedSpreadsheetRow[] {
  return rows.map((row) => {
    const cells: Record<string, SpreadsheetScalar> = {};
    columns.forEach((column) => {
      if (column.role === "observation_id") cells[column.key] = row.observationId;
      else if (column.role === "readout")
        cells[column.key] =
          contract.readouts.find(({ key }) => key === row.readoutKey)?.label ?? row.readoutKey;
      else if (column.role === "identity")
        cells[column.key] = scalarRecordValue(row.identities, column.semanticKey!);
      else if (column.role === "factor")
        cells[column.key] = scalarRecordValue(row.factors, column.semanticKey!);
      else if (column.role === "axis")
        cells[column.key] = scalarRecordValue(row.axes, column.semanticKey!);
      else if (column.role === "hierarchy")
        cells[column.key] = scalarRecordValue(row.hierarchy, column.semanticKey!);
      else if (column.role === "value")
        cells[column.key] = recordValueForColumn(contract, column, row.values);
      else if (column.role === "missingness")
        cells[column.key] = recordValueForColumn(contract, column, row.missingness);
      else cells[column.key] = row.sourceRow;
    });
    return {
      rowKey: row.observationId,
      observationId: row.observationId,
      cells,
      observation: row.observation,
    };
  });
}

function compactCells(
  contract: StructureContract,
  readoutGroups: readonly AdaptiveCompactGroup[],
  columns: readonly AdaptiveSpreadsheetColumn[],
): Record<string, SpreadsheetCell> {
  const group = readoutGroups[0];
  const cells: Record<string, SpreadsheetCell> = {};
  const observations = readoutGroups.flatMap(
    ({ observations: groupObservations }) => groupObservations,
  );
  const readoutGroupByKey = new Map(
    readoutGroups.map((readoutGroup) => [readoutGroup.coordinates.readoutKey, readoutGroup]),
  );
  columns.forEach((column) => {
    if (column.role === "observation_id") {
      cells[column.key] = [...new Set(observations.map(({ observationId }) => observationId))];
      return;
    }
    if (column.role === "readout") {
      cells[column.key] = readoutGroups.map(
        ({ coordinates }) =>
          contract.readouts.find(({ key }) => key === coordinates.readoutKey)?.label ??
          coordinates.readoutKey,
      );
      return;
    }
    if (!group) {
      cells[column.key] = null;
      return;
    }
    if (column.role === "factor") {
      cells[column.key] = group.coordinates.factors[column.semanticKey!] ?? null;
      return;
    }
    if (column.role === "axis") {
      cells[column.key] = group.coordinates.axes[column.semanticKey!] ?? null;
      return;
    }
    if (column.role === "hierarchy") {
      cells[column.key] = group.coordinates.hierarchy[column.semanticKey!] ?? null;
      return;
    }
    if (column.role === "identity") {
      const values: string[] = [];
      const seen = new Set<string>();
      observations.forEach((observation) => {
        const value = observation.identities[column.semanticKey!];
        if (value !== undefined && !seen.has(value)) {
          seen.add(value);
          values.push(value);
        }
      });
      cells[column.key] = values;
      return;
    }
    if (column.role === "value") {
      const readoutGroup = column.readoutKey ? readoutGroupByKey.get(column.readoutKey) : undefined;
      cells[column.key] = (readoutGroup?.observations ?? []).map((observation) =>
        recordValueForColumn(contract, column, observation.values),
      );
      return;
    }
    if (column.role === "missingness") {
      const readoutGroup = column.readoutKey ? readoutGroupByKey.get(column.readoutKey) : undefined;
      cells[column.key] = (readoutGroup?.observations ?? []).map((observation) =>
        recordValueForColumn(contract, column, observation.missingness),
      );
      return;
    }
    cells[column.key] = observations.map((observation) => observation.sourceRow);
  });
  return cells;
}

type CompactRowGroups = Readonly<{
  rowKey: string;
  readoutGroups: readonly AdaptiveCompactGroup[];
  group: AdaptiveCompactGroup;
}>;

function mergeCompactGroups(
  contract: StructureContract,
  groups: readonly AdaptiveCompactGroup[],
): CompactRowGroups[] {
  const rows = new Map<
    string,
    { groups: Map<string, AdaptiveCompactGroup>; firstGroup: AdaptiveCompactGroup }
  >();
  groups.forEach((group) => {
    const rowKey = compactRowCoordinateKey(group.coordinates);
    const row = rows.get(rowKey);
    if (row) row.groups.set(group.coordinates.readoutKey, group);
    else {
      rows.set(rowKey, {
        groups: new Map([[group.coordinates.readoutKey, group]]),
        firstGroup: group,
      });
    }
  });
  return [...rows.entries()].map(([rowKey, row]) => {
    const readoutGroups = contract.readouts.flatMap(({ key }) => {
      const group = row.groups.get(key);
      return group ? [group] : [];
    });
    const orderedGroups = readoutGroups.length ? readoutGroups : [row.firstGroup];
    return { rowKey, readoutGroups: orderedGroups, group: orderedGroups[0]! };
  });
}

/**
 * Adapt canonical observations to a renderer-friendly pair of spreadsheet
 * models.  The adapter is intentionally UI-free: React/table implementations
 * can render its columns and rows without inventing semantic mapping rules.
 */
export function buildAdaptiveSpreadsheetViewModel(
  contract: StructureContract,
  observations: readonly CanonicalAdaptiveObservation[],
): AdaptiveSpreadsheetViewModel {
  const views = buildAdaptiveObservationViews(contract, observations);
  const columns = buildColumns(contract, observations);
  const groups = (() => {
    const actual = new Map(
      views.compact.groups.map((group) => [compactCoordinateKey(group.coordinates), group]),
    );
    if (views.compactEditability.status !== "editable") return views.compact.groups;
    const seeded = factorCombinations(contract).flatMap((factors) =>
      contract.readouts.map((readout) => {
        const coordinates = {
          readoutKey: readout.key,
          factors,
          axes: {},
          hierarchy: {},
        };
        const key = compactCoordinateKey(coordinates);
        return (
          actual.get(key) ?? {
            groupKey: key,
            coordinates,
            observationIds: [],
            observations: [],
            identityValues: Object.fromEntries(
              contract.identities.map((identity) => [identity.key, []]),
            ),
          }
        );
      }),
    );
    const seededKeys = new Set(seeded.map((group) => group.groupKey));
    return [...seeded, ...views.compact.groups.filter((group) => !seededKeys.has(group.groupKey))];
  })();
  const mergedGroups = mergeCompactGroups(contract, groups);
  const compactRows = mergedGroups.map(({ rowKey, readoutGroups, group }) => {
    const observationsForRow = readoutGroups.flatMap(
      ({ observations: groupObservations }) => groupObservations,
    );
    return {
      rowKey,
      observationIds: [...new Set(observationsForRow.map(({ observationId }) => observationId))],
      cells: compactCells(contract, readoutGroups, columns),
      readoutGroups,
      group,
    };
  });
  const expandedRows = buildExpandedRows(views.expanded.rows, contract, columns);
  return {
    schemaVersion: "0.1.0",
    columns,
    compact: {
      mode: "compact",
      columns,
      rows: compactRows,
      observationIds: views.compact.observationIds,
      observationCount: views.compact.observationCount,
    },
    expanded: {
      mode: "expanded",
      columns,
      rows: expandedRows,
      observationIds: views.expanded.observationIds,
      observationCount: views.expanded.observationCount,
    },
    compactEditability: views.compactEditability,
  };
}

/** A view-mode-specific convenience wrapper for table components. */
export function adaptiveSpreadsheetRows(
  model: AdaptiveSpreadsheetViewModel,
  mode: AdaptiveObservationViewMode,
):
  | AdaptiveSpreadsheetViewModel["compact"]["rows"]
  | AdaptiveSpreadsheetViewModel["expanded"]["rows"] {
  return mode === "compact" ? model.compact.rows : model.expanded.rows;
}

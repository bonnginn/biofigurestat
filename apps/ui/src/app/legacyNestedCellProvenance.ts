import type { NestedContinuousCellDraft } from "./experimentDraft";

export const LEGACY_NESTED_CELL_PROVENANCE_KEY = "workspaceNestedCellProvenanceV1";

type OptionalProvenance<T> =
  | Readonly<{ state: "absent" }>
  | Readonly<{ state: "undefined" }>
  | Readonly<{ state: "value"; value: T }>;

export type LegacyNestedCellProvenance = Readonly<{
  version: "0.1.0";
  cellKey: string;
  rawValueCount: number;
  source: "manual" | "paste";
  sourceLocations: OptionalProvenance<readonly string[]>;
  observationUnitIds: OptionalProvenance<readonly string[]>;
  availability: OptionalProvenance<"planned">;
}>;

function isDataRecord(
  value: unknown,
  allowedKeys: readonly string[],
  requiredKeys: readonly string[],
): value is Record<string, unknown> {
  if (value === null || typeof value !== "object" || Array.isArray(value)) return false;
  const prototype = Object.getPrototypeOf(value);
  if (prototype !== Object.prototype && prototype !== null) return false;
  if (!requiredKeys.every((key) => Object.hasOwn(value, key))) return false;
  return Reflect.ownKeys(value).every((key) => {
    if (typeof key !== "string" || !allowedKeys.includes(key)) return false;
    const property = Object.getOwnPropertyDescriptor(value, key);
    return Boolean(property?.enumerable && "value" in property);
  });
}

function isDenseArrayOf<T>(
  value: unknown,
  isElement: (element: unknown) => element is T,
): value is T[] {
  if (!Array.isArray(value) || Reflect.ownKeys(value).length !== value.length + 1) return false;
  for (let index = 0; index < value.length; index += 1) {
    const property = Object.getOwnPropertyDescriptor(value, String(index));
    if (!property?.enumerable || !("value" in property) || !isElement(property.value)) return false;
  }
  return true;
}

const isString = (value: unknown): value is string => typeof value === "string";
const isStringArray = (value: unknown): value is string[] => isDenseArrayOf(value, isString);
const isFiniteNumber = (value: unknown): value is number => typeof value === "number" && Number.isFinite(value);
const isAvailability = (value: unknown): value is "planned" => value === "planned";

function isOptionalProvenance<T>(
  value: unknown,
  isValue: (candidate: unknown) => candidate is T,
): value is OptionalProvenance<T> {
  if (!isDataRecord(value, ["state", "value"], ["state"])) return false;
  if (value.state === "absent" || value.state === "undefined") return !Object.hasOwn(value, "value");
  return value.state === "value" && Object.hasOwn(value, "value") && isValue(value.value);
}

function isProvenance(value: unknown): value is LegacyNestedCellProvenance {
  const keys = ["version", "cellKey", "rawValueCount", "source", "sourceLocations", "observationUnitIds", "availability"];
  return isDataRecord(value, keys, keys) &&
    value.version === "0.1.0" && typeof value.cellKey === "string" && value.cellKey.length > 0 &&
    typeof value.rawValueCount === "number" && Number.isSafeInteger(value.rawValueCount) && value.rawValueCount > 0 &&
    (value.source === "manual" || value.source === "paste") &&
    isOptionalProvenance(value.sourceLocations, isStringArray) &&
    isOptionalProvenance(value.observationUnitIds, isStringArray) &&
    isOptionalProvenance(value.availability, isAvailability);
}

function isMeasuredCell(value: unknown): value is NestedContinuousCellDraft {
  const required = ["kind", "rawValues", "source"];
  const optional = ["sourceLocations", "observationUnitIds", "availability"];
  if (!isDataRecord(value, [...required, ...optional], required)) return false;
  if (
    value.kind !== "nested_continuous" || (value.source !== "manual" && value.source !== "paste") ||
    !isDenseArrayOf(value.rawValues, isFiniteNumber) || value.rawValues.length === 0
  ) return false;
  return optional.every((key) => {
    if (!Object.hasOwn(value, key) || value[key] === undefined) return true;
    return key === "availability" ? isAvailability(value[key]) : isStringArray(value[key]);
  });
}

function captureOptional<T>(
  cell: NestedContinuousCellDraft,
  key: "sourceLocations" | "observationUnitIds" | "availability",
  value: T | undefined,
): OptionalProvenance<T> {
  if (!Object.hasOwn(cell, key)) return { state: "absent" };
  if (value === undefined) return { state: "undefined" };
  return { state: "value", value };
}

/** Stores only nonnumeric cell provenance in primitive unit metadata. */
export function encodeLegacyNestedCellProvenance(input: { cellKey: string; cell: unknown }): string | null {
  try {
    if (typeof input.cellKey !== "string" || input.cellKey.length === 0 || !isMeasuredCell(input.cell)) return null;
    const cell = input.cell;
    const availability = cell.availability;
    if (availability !== undefined && availability !== "planned") return null;
    const provenance: LegacyNestedCellProvenance = {
      version: "0.1.0",
      cellKey: input.cellKey,
      rawValueCount: cell.rawValues.length,
      source: cell.source,
      sourceLocations: captureOptional(cell, "sourceLocations", cell.sourceLocations),
      observationUnitIds: captureOptional(cell, "observationUnitIds", cell.observationUnitIds),
      availability: captureOptional(cell, "availability", availability),
    };
    return JSON.stringify(provenance);
  } catch {
    return null;
  }
}

/** Returns null for malformed/nonstring reserved metadata; the caller decides the safe stop. */
export function decodeLegacyNestedCellProvenance(value: unknown): LegacyNestedCellProvenance | null {
  if (typeof value !== "string") return null;
  try {
    const parsed: unknown = JSON.parse(value);
    return isProvenance(parsed) ? parsed : null;
  } catch {
    return null;
  }
}

function restoreOptional<T>(
  cell: Record<string, unknown>,
  key: "sourceLocations" | "observationUnitIds" | "availability",
  provenance: OptionalProvenance<T>,
): void {
  if (provenance.state === "absent") delete cell[key];
  else if (provenance.state === "undefined") cell[key] = undefined;
  else cell[key] = Array.isArray(provenance.value) ? [...provenance.value] : provenance.value;
}

/** Restores provenance only when it addresses the same finite measured cell. */
export function restoreLegacyNestedCellProvenance(input: {
  cellKey: string;
  cell: unknown;
  provenance: unknown;
}): NestedContinuousCellDraft | null {
  try {
    if (!isMeasuredCell(input.cell) || !isProvenance(input.provenance)) return null;
    if (input.cellKey !== input.provenance.cellKey || input.cell.rawValues.length !== input.provenance.rawValueCount) return null;
    const restored = { ...input.cell, source: input.provenance.source };
    restoreOptional(restored, "sourceLocations", input.provenance.sourceLocations);
    restoreOptional(restored, "observationUnitIds", input.provenance.observationUnitIds);
    restoreOptional(restored, "availability", input.provenance.availability);
    return restored;
  } catch {
    return null;
  }
}

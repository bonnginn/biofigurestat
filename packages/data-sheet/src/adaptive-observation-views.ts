import {
  CanonicalAdaptiveObservationSchema,
  StructureContractSchema,
  type CanonicalAdaptiveObservation,
  type StructureContract,
} from "@lsaa/domain";

/**
 * The two spreadsheet projections are views over one canonical observation
 * set.  They deliberately do not introduce a second data model.
 */
export const ADAPTIVE_OBSERVATION_VIEW_SCHEMA_VERSION = "0.1.0" as const;

export type AdaptiveObservationViewMode = "compact" | "expanded";

export type AdaptiveObservationCoordinates = Readonly<{
  /** The readout is part of the coordinate even when a dataset has one readout. */
  readoutKey: string;
  /** Explicit condition/factor coordinates only. No row-position inference is used. */
  factors: Readonly<Record<string, string>>;
  /** Ordered-axis coordinates are retained as coordinates, not inferred from row order. */
  axes: Readonly<Record<string, string | number>>;
  /** Parent/child coordinates are retained without flattening the hierarchy. */
  hierarchy: Readonly<Record<string, string>>;
}>;

export type AdaptiveExpandedObservationRow = Readonly<
  AdaptiveObservationCoordinates & {
    /** One-based display row number; it has no pairing or matching semantics. */
    rowNumber: number;
    observationId: string;
    identities: Readonly<Record<string, string>>;
    values: Readonly<Record<string, string | number | boolean | null>>;
    missingness: Readonly<Record<string, string>>;
    sourceRow: number | null;
    /** The complete canonical record, including every typed/raw component. */
    observation: CanonicalAdaptiveObservation;
  }
>;

export type AdaptiveCompactGroup = Readonly<{
  /** Canonicalized explicit-coordinate key. It is not an observation ID. */
  groupKey: string;
  coordinates: AdaptiveObservationCoordinates;
  /** Every contributing observation remains addressable by its stable ID. */
  observationIds: readonly string[];
  /** No aggregation is performed; this is the exact record payload per ID. */
  observations: readonly CanonicalAdaptiveObservation[];
  /** Identity values are shown as a non-destructive summary, never as a group key. */
  identityValues: Readonly<Record<string, readonly string[]>>;
}>;

export type AdaptiveCompactObservationView = Readonly<{
  schemaVersion: typeof ADAPTIVE_OBSERVATION_VIEW_SCHEMA_VERSION;
  mode: "compact";
  observationIds: readonly string[];
  observationCount: number;
  groups: readonly AdaptiveCompactGroup[];
}>;

export type AdaptiveExpandedObservationView = Readonly<{
  schemaVersion: typeof ADAPTIVE_OBSERVATION_VIEW_SCHEMA_VERSION;
  mode: "expanded";
  observationIds: readonly string[];
  observationCount: number;
  rows: readonly AdaptiveExpandedObservationRow[];
}>;

export type CompactEditabilityReasonCode =
  | "identity_coordinates"
  | "source_lineage"
  | "ordered_axis"
  | "hierarchy"
  | "matching"
  | "typed_representation"
  | "duplicate_axis_coordinate";

export type CompactEditability = Readonly<{
  status: "editable" | "expanded_required";
  /** Empty only for the genuinely reversible scalar/coordinate-light case. */
  reasonCodes: readonly CompactEditabilityReasonCode[];
  explanation: string;
}>;

export type CompactScalarObservationIdFactoryContext = Readonly<{
  targetCoordinates: AdaptiveObservationCoordinates;
  valueKey: string;
  ordinal: number;
  existingObservationIds: readonly string[];
}>;

export type CompactScalarEditInput = Readonly<{
  /** The complete explicit coordinate of the compact group to edit. */
  targetCoordinates: AdaptiveObservationCoordinates;
  /** Values in display order. Shortening this list explicitly removes only this group's tail. */
  values: readonly (number | null)[];
  /** The caller owns ID generation; IDs are never derived from row position. */
  createObservationId: (context: CompactScalarObservationIdFactoryContext) => string;
  /** Optional researcher-facing identity for each newly created independent unit. */
  createExperimentalUnitIdentity?: (
    context: CompactScalarObservationIdFactoryContext & { observationId: string },
  ) => string;
  /** Optional canonical value key. Defaults to the readout key, then its component key. */
  valueKey?: string;
}>;

export type CompactScalarEditResult = Readonly<{
  observations: readonly CanonicalAdaptiveObservation[];
  updatedObservationIds: readonly string[];
  addedObservationIds: readonly string[];
  removedObservationIds: readonly string[];
}>;

export type AdaptiveObservationViews = Readonly<{
  schemaVersion: typeof ADAPTIVE_OBSERVATION_VIEW_SCHEMA_VERSION;
  compact: AdaptiveCompactObservationView;
  expanded: AdaptiveExpandedObservationView;
  compactEditability: CompactEditability;
}>;

type CoordinateValue = string | number;

// Do not use localeCompare here: the view key is persisted/compared across
// Windows and macOS, so ordering must be locale-independent.
function compareKeys(first: string, second: string): number {
  return first < second ? -1 : first > second ? 1 : 0;
}

function clone<T>(value: T): T {
  if (typeof structuredClone === "function") return structuredClone(value);
  return JSON.parse(JSON.stringify(value)) as T;
}

function sortedRecord<T extends CoordinateValue | string>(
  record: Readonly<Record<string, T>>,
): Record<string, T> {
  return Object.fromEntries(
    Object.entries(record).sort(([first], [second]) => compareKeys(first, second)),
  ) as Record<string, T>;
}

function orderedRecord<T extends CoordinateValue | string>(
  record: Readonly<Record<string, T>>,
  preferredKeys: readonly string[],
): Record<string, T> {
  const output: Record<string, T> = {};
  const included = new Set<string>();
  for (const key of preferredKeys) {
    if (Object.prototype.hasOwnProperty.call(record, key)) {
      output[key] = record[key]!;
      included.add(key);
    }
  }
  for (const [key, value] of Object.entries(record).sort(([first], [second]) =>
    compareKeys(first, second),
  )) {
    if (!included.has(key)) output[key] = value as T;
  }
  return output;
}

function recordKey(record: Readonly<Record<string, unknown>>): string {
  return JSON.stringify(
    Object.entries(record).sort(([first], [second]) => compareKeys(first, second)),
  );
}

function coordinatesKey(coordinates: AdaptiveObservationCoordinates): string {
  return JSON.stringify({
    readoutKey: coordinates.readoutKey,
    factors: sortedRecord(coordinates.factors),
    axes: sortedRecord(coordinates.axes),
    hierarchy: sortedRecord(coordinates.hierarchy),
  });
}

function assertUniqueObservationIds(observations: readonly CanonicalAdaptiveObservation[]): void {
  const seen = new Set<string>();
  observations.forEach((observation) => {
    if (seen.has(observation.observationId)) {
      throw new Error(`Duplicate canonical observation ID: ${observation.observationId}`);
    }
    seen.add(observation.observationId);
  });
}

function normalizedInputs(
  contract: StructureContract,
  observations: readonly CanonicalAdaptiveObservation[],
): { contract: StructureContract; observations: CanonicalAdaptiveObservation[] } {
  const normalizedContract = StructureContractSchema.parse(contract);
  const normalizedObservations = observations.map((observation) => {
    // Validate the canonical shape, but retain the caller's complete record.
    // Zod objects strip unknown top-level fields by default; retaining them is
    // important for forward-compatible raw lineage/metadata extensions.
    const parsed = CanonicalAdaptiveObservationSchema.parse(observation);
    return {
      ...clone(observation),
      missingness: clone(parsed.missingness),
    };
  });
  assertUniqueObservationIds(normalizedObservations);

  const readoutKeys = new Set(normalizedContract.readouts.map((readout) => readout.key));
  normalizedObservations.forEach((observation) => {
    if (!readoutKeys.has(observation.readoutKey)) {
      throw new Error(
        `Canonical observation ${observation.observationId} references unknown readout: ${observation.readoutKey}`,
      );
    }
  });
  return { contract: normalizedContract, observations: normalizedObservations };
}

function coordinatesFor(
  contract: StructureContract,
  observation: CanonicalAdaptiveObservation,
): AdaptiveObservationCoordinates {
  return {
    readoutKey: observation.readoutKey,
    factors: orderedRecord(
      observation.factors,
      contract.factors.map((factor) => factor.key),
    ),
    axes: orderedRecord(
      observation.axes,
      contract.orderedAxes.map((axis) => axis.key),
    ),
    hierarchy: orderedRecord(
      observation.hierarchy,
      contract.unitLevels.map((level) => level.key),
    ),
  };
}

function buildExpanded(
  contract: StructureContract,
  observations: readonly CanonicalAdaptiveObservation[],
): AdaptiveExpandedObservationView {
  const rows = observations.map((observation, index) => ({
    ...coordinatesFor(contract, observation),
    rowNumber: index + 1,
    observationId: observation.observationId,
    identities: clone(observation.identities),
    values: clone(observation.values),
    missingness: clone(observation.missingness),
    sourceRow: observation.sourceRow,
    observation: clone(observation),
  }));
  return {
    schemaVersion: ADAPTIVE_OBSERVATION_VIEW_SCHEMA_VERSION,
    mode: "expanded",
    observationIds: observations.map((observation) => observation.observationId),
    observationCount: observations.length,
    rows,
  };
}

function buildCompact(
  contract: StructureContract,
  observations: readonly CanonicalAdaptiveObservation[],
): AdaptiveCompactObservationView {
  const groupsByKey = new Map<
    string,
    { coordinates: AdaptiveObservationCoordinates; observations: CanonicalAdaptiveObservation[] }
  >();

  // First-seen order is presentation order only. It is never used to align
  // observations or establish pairing.
  observations.forEach((observation) => {
    const coordinates = coordinatesFor(contract, observation);
    const key = coordinatesKey(coordinates);
    const existing = groupsByKey.get(key);
    if (existing) existing.observations.push(observation);
    else groupsByKey.set(key, { coordinates, observations: [observation] });
  });

  const groups = [...groupsByKey.entries()].map(([key, group]) => {
    const identityValues: Record<string, readonly string[]> = {};
    const identityKeys = new Set<string>(contract.identities.map((identity) => identity.key));
    group.observations.forEach((observation) => {
      Object.keys(observation.identities).forEach((key) => identityKeys.add(key));
    });
    [...identityKeys].sort(compareKeys).forEach((key) => {
      const values: string[] = [];
      const seen = new Set<string>();
      group.observations.forEach((observation) => {
        const value = observation.identities[key];
        if (value !== undefined && !seen.has(value)) {
          seen.add(value);
          values.push(value);
        }
      });
      identityValues[key] = values;
    });
    return {
      groupKey: key,
      coordinates: clone(group.coordinates),
      observationIds: group.observations.map((observation) => observation.observationId),
      observations: group.observations.map((observation) => clone(observation)),
      identityValues,
    };
  });

  return {
    schemaVersion: ADAPTIVE_OBSERVATION_VIEW_SCHEMA_VERSION,
    mode: "compact",
    observationIds: observations.map((observation) => observation.observationId),
    observationCount: observations.length,
    groups,
  };
}

function hasDuplicateAxisCoordinates(
  contract: StructureContract,
  observations: readonly CanonicalAdaptiveObservation[],
): boolean {
  if (contract.orderedAxes.length === 0) return false;
  const seen = new Set<string>();
  for (const observation of observations) {
    const key = JSON.stringify({
      identities: sortedRecord(observation.identities),
      factors: sortedRecord(observation.factors),
      axes: sortedRecord(observation.axes),
      hierarchy: sortedRecord(observation.hierarchy),
      readoutKey: observation.readoutKey,
    });
    if (seen.has(key)) return true;
    seen.add(key);
  }
  return false;
}

/**
 * Decide whether compact value editing can be lossless. The decision is
 * intentionally conservative: a compact cell is never allowed to become a
 * hidden editor for identity, lineage, axes, hierarchy, matching, or typed
 * measurement components.
 */
export function assessCompactEditability(
  contract: StructureContract,
  observations: readonly CanonicalAdaptiveObservation[],
): CompactEditability {
  const normalized = normalizedInputs(contract, observations);
  const reasons: CompactEditabilityReasonCode[] = [];
  // Contract 0.1.0 has no identity-purpose field and most valid contracts
  // therefore declare a required identity even for ordinary independent
  // observations.  That declaration alone must not disable the useful
  // condition-local compact editor: existing observation IDs can remain tied
  // to their condition-local records and new rows can receive new IDs.  An
  // identity becomes linkage-bearing only when the contract says that it is
  // used for matching (or another non-independent relationship); axes,
  // hierarchy, and source-row lineage are checked independently below.
  const hasNonIndependentFactor = normalized.contract.factors.some(
    ({ unitRole, relationship }) => unitRole !== "between_unit" || relationship !== "independent",
  );
  const hasMatchingSemantics =
    hasNonIndependentFactor ||
    !["independent", "none"].includes(normalized.contract.matching.kind) ||
    normalized.contract.matching.identityKey !== null;
  const linkageBearingIdentity =
    hasMatchingSemantics &&
    normalized.observations.some((observation) => Object.keys(observation.identities).length > 0);
  if (linkageBearingIdentity) reasons.push("identity_coordinates");

  if (normalized.observations.some((observation) => observation.sourceRow !== null)) {
    reasons.push("source_lineage");
  }
  if (
    normalized.contract.orderedAxes.length > 0 ||
    normalized.observations.some((observation) => Object.keys(observation.axes).length > 0)
  ) {
    reasons.push("ordered_axis");
  }
  if (
    normalized.contract.unitLevels.some((level) => level.parentKey !== null) ||
    normalized.observations.some((observation) => Object.keys(observation.hierarchy).length > 0)
  ) {
    reasons.push("hierarchy");
  }
  if (hasMatchingSemantics) {
    reasons.push("matching");
  }
  if (normalized.contract.readouts.some((readout) => readout.representation !== "scalar")) {
    reasons.push("typed_representation");
  }
  if (hasDuplicateAxisCoordinates(normalized.contract, normalized.observations)) {
    reasons.push("duplicate_axis_coordinate");
  }

  return reasons.length === 0
    ? {
        status: "editable",
        reasonCodes: [],
        explanation:
          "この表示は条件ごとの値だけを変更しても、対象ID・対応関係・階層・軸・元データを変えません。",
      }
    : {
        status: "expanded_required",
        reasonCodes: reasons,
        explanation:
          "対象ID、元データとの対応、軸、階層、対応関係、または測定の内訳を保つため、すべての値を表示する表で編集してください。",
      };
}

function normalizedTargetCoordinates(
  contract: StructureContract,
  coordinates: AdaptiveObservationCoordinates,
): AdaptiveObservationCoordinates {
  if (!coordinates || typeof coordinates !== "object") {
    throw new TypeError("targetCoordinates must be an explicit coordinate object");
  }
  if (typeof coordinates.readoutKey !== "string" || coordinates.readoutKey.trim() === "") {
    throw new TypeError("targetCoordinates.readoutKey must be a non-empty string");
  }
  const readout = contract.readouts.find(({ key }) => key === coordinates.readoutKey);
  if (!readout) throw new RangeError(`Unknown target readout: ${coordinates.readoutKey}`);

  const normalizeMap = <T extends string | number>(
    value: Readonly<Record<string, T>>,
    label: string,
  ): Record<string, T> => {
    if (!value || typeof value !== "object" || Array.isArray(value)) {
      throw new TypeError(`targetCoordinates.${label} must be a record`);
    }
    return orderedRecord(value, []);
  };
  const factors = normalizeMap(coordinates.factors, "factors");
  Object.entries(factors).forEach(([key, level]) => {
    const factor = contract.factors.find((candidate) => candidate.key === key);
    if (!factor) throw new RangeError(`Unknown target factor: ${key}`);
    if (!factor.levels.includes(level)) {
      throw new RangeError(`Unknown level ${level} for target factor ${key}`);
    }
  });
  return {
    readoutKey: readout.key,
    factors,
    axes: normalizeMap(coordinates.axes, "axes"),
    hierarchy: normalizeMap(coordinates.hierarchy, "hierarchy"),
  };
}

function scalarValueKey(
  readout: StructureContract["readouts"][number],
  observations: readonly CanonicalAdaptiveObservation[],
  requested?: string,
): string {
  if (readout.representation !== "scalar") {
    throw new RangeError("Compact scalar editing is available only for scalar readouts");
  }
  if (requested?.trim()) return requested;
  const present = new Set(observations.flatMap((observation) => Object.keys(observation.values)));
  return [readout.key, ...readout.componentKeys].find((key) => present.has(key)) ?? readout.key;
}

/**
 * Apply a compact scalar edit to one explicit condition/factor group.
 *
 * Existing canonical IDs and all semantic fields are retained. New IDs come
 * only from the supplied factory. A shorter value list removes only omitted
 * records in the selected group; observations in every other group are
 * copied unchanged. This operation refuses complex contracts whose compact
 * editor could hide identity, lineage, axis, hierarchy, matching, or typed
 * measurement semantics.
 */
export function applyCompactScalarEdit(
  contract: StructureContract,
  observations: readonly CanonicalAdaptiveObservation[],
  input: CompactScalarEditInput,
): CompactScalarEditResult {
  const normalized = normalizedInputs(contract, observations);
  const targetCoordinates = normalizedTargetCoordinates(
    normalized.contract,
    input.targetCoordinates,
  );
  if (!Array.isArray(input.values)) throw new TypeError("values must be an array");
  if (
    input.values.some(
      (value) => value !== null && (!Number.isFinite(value) || typeof value !== "number"),
    )
  ) {
    throw new TypeError("compact scalar values must be finite numbers or null");
  }
  if (typeof input.createObservationId !== "function") {
    throw new TypeError("createObservationId must be a function");
  }

  const decision = assessCompactEditability(normalized.contract, normalized.observations);
  if (decision.status !== "editable") {
    throw new RangeError(
      `compact editing requires expanded view: ${decision.reasonCodes.join(",")}`,
    );
  }
  const targetKey = coordinatesKey(targetCoordinates);
  const targetIndexes = normalized.observations.flatMap((observation, index) =>
    coordinatesKey(coordinatesFor(normalized.contract, observation)) === targetKey ? [index] : [],
  );
  const targetObservations = targetIndexes.map((index) => normalized.observations[index]!);
  const readout = normalized.contract.readouts.find(
    ({ key }) => key === targetCoordinates.readoutKey,
  )!;
  const experimentalIdentityKey = normalized.contract.identities.find(
    ({ unitLevelKey }) => unitLevelKey === normalized.contract.experimentalUnitLevelKey,
  )?.key;
  const valueKey = scalarValueKey(readout, targetObservations, input.valueKey);
  const existingIds = normalized.observations.map(({ observationId }) => observationId);
  const existingIdSet = new Set(existingIds);
  const targetIdSet = new Set(targetObservations.map(({ observationId }) => observationId));
  const updatedObservationIds: string[] = [];
  const removedObservationIds = targetObservations
    .slice(input.values.length)
    .map(({ observationId }) => observationId);

  // If independent records already have biological identity values, an append
  // would need an explicit identity supplied by the user. Never copy a prior
  // identity into a new row and accidentally turn two units into one.
  const hasResearcherSuppliedIdentity = targetObservations.some((observation) =>
    Object.entries(observation.identities).some(
      ([key, value]) => key !== experimentalIdentityKey || value !== observation.observationId,
    ),
  );
  if (
    input.values.length > targetObservations.length &&
    hasResearcherSuppliedIdentity &&
    !input.createExperimentalUnitIdentity
  ) {
    throw new RangeError("compact append requires explicit identity input; use the expanded view");
  }

  const update = (
    base: CanonicalAdaptiveObservation,
    value: number | null,
  ): CanonicalAdaptiveObservation => {
    const missingness = { ...base.missingness };
    if (value === null) missingness[valueKey] ??= "unknown";
    else delete missingness[valueKey];
    const candidate = {
      ...clone(base),
      values: { ...base.values, [valueKey]: value },
      missingness,
    };
    // Validate the updated record while retaining forward-compatible fields
    // that the current 0.1 schema does not yet know about.
    const parsed = CanonicalAdaptiveObservationSchema.parse(candidate);
    return { ...candidate, missingness: clone(parsed.missingness) };
  };

  const updated = targetObservations.slice(0, input.values.length).map((base, index) => {
    updatedObservationIds.push(base.observationId);
    return update(base, input.values[index]!);
  });

  const added: CanonicalAdaptiveObservation[] = [];
  for (let index = targetObservations.length; index < input.values.length; index += 1) {
    const observationId = input.createObservationId({
      targetCoordinates: clone(targetCoordinates),
      valueKey,
      ordinal: index + 1,
      existingObservationIds: [...existingIds, ...added.map(({ observationId: id }) => id)],
    });
    if (typeof observationId !== "string" || observationId.trim() === "") {
      throw new TypeError("createObservationId must return a non-empty string");
    }
    if (
      existingIdSet.has(observationId) ||
      targetIdSet.has(observationId) ||
      added.some((item) => item.observationId === observationId)
    ) {
      throw new RangeError(`createObservationId returned a duplicate ID: ${observationId}`);
    }
    const value = input.values[index]!;
    const missingness = value === null ? { [valueKey]: "unknown" as const } : {};
    const identityContext = {
      targetCoordinates: clone(targetCoordinates),
      valueKey,
      ordinal: index + 1,
      existingObservationIds: [...existingIds, ...added.map(({ observationId: id }) => id)],
      observationId,
    };
    const generatedExperimentalIdentity = input.createExperimentalUnitIdentity?.(identityContext);
    if (
      generatedExperimentalIdentity !== undefined &&
      (typeof generatedExperimentalIdentity !== "string" ||
        generatedExperimentalIdentity.trim() === "")
    ) {
      throw new TypeError("createExperimentalUnitIdentity must return a non-empty string");
    }
    const created = CanonicalAdaptiveObservationSchema.parse({
      observationId,
      readoutKey: targetCoordinates.readoutKey,
      // In the only editable compact case, each appended scalar is a new
      // independent experimental-unit record. Give it a stable internal
      // identity immediately; otherwise several pasted values could later be
      // collapsed into one biological n when projected into the workspace.
      identities: experimentalIdentityKey
        ? { [experimentalIdentityKey]: generatedExperimentalIdentity ?? observationId }
        : {},
      factors: clone(targetCoordinates.factors),
      axes: clone(targetCoordinates.axes),
      hierarchy: clone(targetCoordinates.hierarchy),
      values: { [valueKey]: value },
      missingness,
      sourceRow: null,
    });
    added.push(created);
  }

  if (targetIndexes.length === 0 && input.values.length === 0) {
    return {
      observations: normalized.observations.map((observation) => clone(observation)),
      updatedObservationIds,
      addedObservationIds: [],
      removedObservationIds: [],
    };
  }

  const firstTarget = targetIndexes[0];
  const lastTarget = targetIndexes.at(-1);
  const updatedByIndex = new Map(
    targetIndexes.slice(0, updated.length).map((index, position) => [index, updated[position]!]),
  );
  const targetIndexSet = new Set(targetIndexes);
  const result: CanonicalAdaptiveObservation[] = [];
  normalized.observations.forEach((observation, index) => {
    if (!targetIndexSet.has(index)) result.push(clone(observation));
    else if (updatedByIndex.has(index)) result.push(updatedByIndex.get(index)!);
    if (index === lastTarget) result.push(...added);
  });
  if (firstTarget === undefined) result.push(...added);

  return {
    observations: result,
    updatedObservationIds,
    addedObservationIds: added.map(({ observationId }) => observationId),
    removedObservationIds,
  };
}

/** Build one of the two synchronized projections without changing records. */
export function projectAdaptiveObservationView(
  contract: StructureContract,
  observations: readonly CanonicalAdaptiveObservation[],
  mode: AdaptiveObservationViewMode,
): AdaptiveCompactObservationView | AdaptiveExpandedObservationView {
  const normalized = normalizedInputs(contract, observations);
  return mode === "compact"
    ? buildCompact(normalized.contract, normalized.observations)
    : buildExpanded(normalized.contract, normalized.observations);
}

/**
 * Build both views in one call and assert that they expose the same canonical
 * observation IDs. A caller can safely switch views using this result without
 * re-parsing or re-aggregating data.
 */
export function buildAdaptiveObservationViews(
  contract: StructureContract,
  observations: readonly CanonicalAdaptiveObservation[],
): AdaptiveObservationViews {
  const normalized = normalizedInputs(contract, observations);
  const compact = buildCompact(normalized.contract, normalized.observations);
  const expanded = buildExpanded(normalized.contract, normalized.observations);
  const compactIds = compact.observationIds;
  const expandedIds = expanded.observationIds;
  if (
    compactIds.length !== expandedIds.length ||
    compactIds.some((observationId, index) => observationId !== expandedIds[index])
  ) {
    throw new Error("Adaptive compact and expanded views lost canonical observation parity");
  }
  return {
    schemaVersion: ADAPTIVE_OBSERVATION_VIEW_SCHEMA_VERSION,
    compact,
    expanded,
    compactEditability: assessCompactEditability(normalized.contract, normalized.observations),
  };
}

/**
 * Utility for UI/test boundaries: both projections must contain exactly the
 * same set of IDs, even when a consumer changes display ordering.
 */
export function assertAdaptiveObservationViewParity(
  views: Pick<AdaptiveObservationViews, "compact" | "expanded">,
): true {
  const compactIds = new Set(views.compact.observationIds);
  const expandedIds = new Set(views.expanded.observationIds);
  if (
    compactIds.size !== expandedIds.size ||
    [...compactIds].some((observationId) => !expandedIds.has(observationId))
  ) {
    throw new Error("Adaptive compact and expanded views have different observation IDs");
  }
  return true;
}

/** Stable key helper exported for grid implementations and focused tests. */
export function adaptiveCoordinateKey(coordinates: AdaptiveObservationCoordinates): string {
  return coordinatesKey(coordinates);
}

/** Stable key helper for explicit coordinate records. */
export function adaptiveRecordKey(record: Readonly<Record<string, unknown>>): string {
  return recordKey(record);
}

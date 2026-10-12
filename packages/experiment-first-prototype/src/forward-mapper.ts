import {
  STRUCTURE_CONTRACT_VERSION,
  validateStructureContract,
  type Factor,
  type MissingnessKind,
  type OrderedAxis,
  type Readout,
  type StructureContract,
  type UnitRole,
} from "./contract.ts";
import {
  validateExperimentCanvas,
  type CanvasDimension,
  type ExperimentCanvas,
} from "./experiment-canvas.ts";
import {
  validateObservationPatternSet,
  type AxisIdentityBehavior,
  type ObservationAxis,
  type ObservationAxisUse,
  type ObservationIdentity,
  type ObservationPatternSet,
  type ObservationRecordSet,
} from "./observation-pattern.ts";

/**
 * Internal facts resolved by the biological interview and any targeted
 * confirmations. These are deliberately not researcher-facing labels.
 */
export const RESOLVED_DESIGN_FACTS_VERSION = "0.1.0-prototype" as const;

export interface ResolvedUnitFact {
  levelKey: string;
  role: UnitRole;
  /** More than one parent is a DAG/many-to-many request and is not projected. */
  parentLevelKeys: string[];
}

export interface ResolvedFactorFact {
  dimensionKey: string;
  unitRole: Factor["unitRole"];
  relationship: Factor["relationship"];
  ordered: boolean;
  /** Canvas value key, not a display label. */
  referenceValueKey: string | null;
}

export interface ResolvedReadoutFact {
  readoutKey: string;
  valueType: string;
  referenceRole: Readout["referenceRole"];
}

export interface ResolvedDesignFacts {
  schemaVersion: typeof RESOLVED_DESIGN_FACTS_VERSION;
  caseId: string;
  experimentDescription: string;
  experimentalUnitLevelKey: string;
  units: ResolvedUnitFact[];
  factors: ResolvedFactorFact[];
  matching: StructureContract["matching"];
  readouts: ResolvedReadoutFact[];
  allowedMissingness: MissingnessKind[];
  rawObservationGrain: string;
}

export type ForwardMappingIssueCode =
  | "INVALID_CANVAS"
  | "INVALID_OBSERVATION_PATTERN"
  | "INVALID_RESOLVED_FACTS"
  | "UNIT_SEMANTICS_UNRESOLVED"
  | "HIERARCHY_MISMATCH"
  | "MULTI_PARENT_HIERARCHY_NOT_REPRESENTABLE"
  | "EXPERIMENTAL_UNIT_UNRESOLVED"
  | "FACTOR_SEMANTICS_UNRESOLVED"
  | "FACTOR_LEVEL_LABEL_COLLISION"
  | "FACTOR_VALUE_GROUPING_NOT_REPRESENTABLE"
  | "FACTOR_ASSIGNMENT_INCONSISTENT"
  | "CONDITION_COLLECTION_UNRESOLVED"
  | "SPARSE_CONDITION_PLAN_NOT_REPRESENTABLE"
  | "CONDITION_BINDING_INCOMPLETE"
  | "CONDITION_SPECIFIC_RECORD_SET_NOT_REPRESENTABLE"
  | "READOUT_SEMANTICS_UNRESOLVED"
  | "READOUT_COMPONENTS_UNRESOLVED"
  | "READOUT_GRAIN_NOT_REPRESENTABLE"
  | "AXIS_UNUSED"
  | "AXIS_DOUBLE_ENCODED"
  | "AXIS_IDENTITY_UNRESOLVED"
  | "AXIS_IDENTITY_BINDING_NOT_REPRESENTABLE"
  | "AXIS_VALUE_PLAN_NOT_REPRESENTABLE"
  | "NOMINAL_AXIS_NOT_REPRESENTABLE"
  | "SPARSE_MULTI_AXIS_NOT_REPRESENTABLE"
  | "MATERIAL_CONTINUITY_UNRESOLVED"
  | "MATERIAL_CONTINUITY_NOT_REPRESENTABLE"
  | "MATCHING_SEMANTICS_INCONSISTENT"
  | "MULTIPLE_MATCHING_IDENTITIES_NOT_REPRESENTABLE"
  | "LINKAGE_IDENTITY_UNKNOWN"
  | "LINKAGE_IDENTITY_IRRECOVERABLE"
  | "LINKAGE_MAPPING_REQUIRED"
  | "GENERATED_ROW_ID_USED_FOR_LINKAGE"
  | "CONTRACT_VALIDATION_FAILED";

export interface ForwardMappingIssue {
  code: ForwardMappingIssueCode;
  path: string;
  message: string;
}

export interface ForwardMappingNote {
  code:
    | "IDENTITY_PROVENANCE_RETAINED_IN_PATTERN"
    | "IDENTITY_SCOPE_RETAINED_IN_PATTERN"
    | "AXIS_IDENTITY_BINDINGS_RETAINED_IN_PATTERN"
    | "MATERIAL_CONTINUITY_RETAINED_IN_PATTERN"
    | "CONDITION_BINDINGS_RETAINED_IN_PATTERN";
  message: string;
}

export type ForwardMappingResult =
  | { status: "mapped"; contract: StructureContract; notes: ForwardMappingNote[] }
  | { status: "stopped"; issues: ForwardMappingIssue[] };

function issue(
  code: ForwardMappingIssueCode,
  path: string,
  message: string,
): ForwardMappingIssue {
  return { code, path, message };
}

function unique<T>(values: T[]): T[] {
  return [...new Set(values)];
}

function duplicateKeys(values: string[]): string[] {
  const seen = new Set<string>();
  const duplicates = new Set<string>();
  for (const value of values) {
    if (seen.has(value)) duplicates.add(value);
    seen.add(value);
  }
  return [...duplicates];
}

function scientificLinkage(identity: ObservationIdentity): boolean {
  return identity.purpose === "scientific_linkage" || identity.purpose === "both";
}

function linkageAvailabilityIssue(
  identity: ObservationIdentity | undefined,
  path: string,
): ForwardMappingIssue | null {
  if (!identity) return issue("LINKAGE_IDENTITY_UNKNOWN", path, "The scientific linkage identity is not defined.");
  if (!scientificLinkage(identity)) {
    return identity.origin === "app_row_surrogate"
      ? issue("GENERATED_ROW_ID_USED_FOR_LINKAGE", path, "An app row identifier cannot establish biological matching or repetition.")
      : issue("LINKAGE_IDENTITY_UNKNOWN", path, "The selected identity is not declared as a scientific linkage key.");
  }
  if (identity.origin === "app_row_surrogate") {
    return issue("GENERATED_ROW_ID_USED_FOR_LINKAGE", path, "An app row identifier cannot establish biological matching or repetition.");
  }
  if (identity.availability === "unknown") {
    return issue("LINKAGE_IDENTITY_UNKNOWN", path, "Whether the linkage identity is available is unresolved.");
  }
  if (identity.availability === "irrecoverable") {
    return issue("LINKAGE_IDENTITY_IRRECOVERABLE", path, "The intended linkage identity cannot be recovered from the experiment or source data.");
  }
  if (identity.availability === "recoverable") {
    return issue("LINKAGE_MAPPING_REQUIRED", path, "The linkage exists but must be mapped before the design can be projected safely.");
  }
  return null;
}

function validateResolvedFacts(
  canvas: ExperimentCanvas,
  pattern: ObservationPatternSet,
  facts: ResolvedDesignFacts,
): ForwardMappingIssue[] {
  const issues: ForwardMappingIssue[] = [];
  if (facts.schemaVersion !== RESOLVED_DESIGN_FACTS_VERSION) {
    issues.push(issue("INVALID_RESOLVED_FACTS", "facts.schemaVersion", "Unsupported resolved-facts version."));
  }
  if (!facts.caseId.trim() || !facts.experimentDescription.trim() || !facts.rawObservationGrain.trim()) {
    issues.push(issue("INVALID_RESOLVED_FACTS", "facts", "Case ID, experiment description, and raw observation grain are required."));
  }

  const unitFactDuplicates = duplicateKeys(facts.units.map((unit) => unit.levelKey));
  if (unitFactDuplicates.length) {
    issues.push(issue("INVALID_RESOLVED_FACTS", "facts.units", `Duplicate resolved unit facts: ${unitFactDuplicates.join(", ")}`));
  }
  const levelByKey = new Map(pattern.levels.map((level) => [level.key, level]));
  const unitByKey = new Map(facts.units.map((unit) => [unit.levelKey, unit]));
  for (const level of pattern.levels) {
    const resolved = unitByKey.get(level.key);
    if (!resolved) {
      issues.push(issue("UNIT_SEMANTICS_UNRESOLVED", `facts.units.${level.key}`, `No design role was resolved for observation level ${level.label}.`));
      continue;
    }
    const parentKeys = unique(resolved.parentLevelKeys);
    if (parentKeys.length > 1) {
      issues.push(issue("MULTI_PARENT_HIERARCHY_NOT_REPRESENTABLE", `facts.units.${level.key}.parentLevelKeys`, `${level.label} has more than one parent; StructureContract 0.1.0 supports a tree only.`));
    }
    const patternParents = level.parentKey === null ? [] : [level.parentKey];
    if (parentKeys.length <= 1 && (parentKeys[0] ?? null) !== (patternParents[0] ?? null)) {
      issues.push(issue("HIERARCHY_MISMATCH", `facts.units.${level.key}.parentLevelKeys`, `Resolved hierarchy disagrees with the observation pattern for ${level.label}.`));
    }
    for (const parentKey of parentKeys) {
      if (!levelByKey.has(parentKey)) {
        issues.push(issue("HIERARCHY_MISMATCH", `facts.units.${level.key}.parentLevelKeys`, `Unknown parent observation level: ${parentKey}.`));
      }
    }
  }
  for (const resolved of facts.units) {
    if (!levelByKey.has(resolved.levelKey)) {
      issues.push(issue("HIERARCHY_MISMATCH", `facts.units.${resolved.levelKey}`, `Resolved unit is absent from the observation pattern: ${resolved.levelKey}.`));
    }
  }
  const experimentalFacts = facts.units.filter((unit) => unit.role === "experimental_unit");
  if (
    !levelByKey.has(facts.experimentalUnitLevelKey) ||
    experimentalFacts.length !== 1 ||
    experimentalFacts[0]?.levelKey !== facts.experimentalUnitLevelKey
  ) {
    issues.push(issue("EXPERIMENTAL_UNIT_UNRESOLVED", "facts.experimentalUnitLevelKey", "Exactly one explicit observation level must be resolved as the experimental unit."));
  }

  const dimensionByKey = new Map(canvas.dimensions.map((dimension) => [dimension.key, dimension]));
  const factorDuplicates = duplicateKeys(facts.factors.map((factor) => factor.dimensionKey));
  if (factorDuplicates.length) {
    issues.push(issue("INVALID_RESOLVED_FACTS", "facts.factors", `Duplicate resolved factor facts: ${factorDuplicates.join(", ")}`));
  }
  const factorByKey = new Map(facts.factors.map((factor) => [factor.dimensionKey, factor]));
  for (const dimension of canvas.dimensions) {
    const resolved = factorByKey.get(dimension.key);
    if (!resolved) {
      issues.push(issue("FACTOR_SEMANTICS_UNRESOLVED", `facts.factors.${dimension.key}`, `Assignment semantics are unresolved for ${dimension.label}.`));
      continue;
    }
    if (resolved.unitRole === "between_unit" && resolved.relationship === "repeated") {
      issues.push(issue("FACTOR_ASSIGNMENT_INCONSISTENT", `facts.factors.${dimension.key}`, "A between-unit factor cannot be represented as repeated within the same unit."));
    }
    if (resolved.unitRole === "within_unit" && resolved.relationship === "independent") {
      issues.push(issue("FACTOR_ASSIGNMENT_INCONSISTENT", `facts.factors.${dimension.key}`, "A within-unit factor cannot be represented as independent assignment."));
    }
    if (resolved.referenceValueKey !== null && !dimension.values.some((value) => value.key === resolved.referenceValueKey)) {
      issues.push(issue("FACTOR_SEMANTICS_UNRESOLVED", `facts.factors.${dimension.key}.referenceValueKey`, `Unknown reference value: ${resolved.referenceValueKey}.`));
    }
    if (duplicateKeys(dimension.values.map((value) => value.label)).length) {
      issues.push(issue("FACTOR_LEVEL_LABEL_COLLISION", `canvas.dimensions.${dimension.key}.values`, "StructureContract 0.1.0 stores factor levels as labels, so duplicate labels are ambiguous."));
    }
    if (dimension.values.some((value) => value.parentValueKey !== null)) {
      issues.push(issue("FACTOR_SEMANTICS_UNRESOLVED", `canvas.dimensions.${dimension.key}.values`, "Scientific parent grouping among factor values is not representable in StructureContract 0.1.0."));
    }
    if ((dimension.groups?.length ?? 0) > 0 || dimension.values.some((value) => value.groupKey)) {
      issues.push(issue("FACTOR_VALUE_GROUPING_NOT_REPRESENTABLE", `canvas.dimensions.${dimension.key}.groups`, "Non-selectable scientific grouping among condition values remains in ExperimentCanvas because StructureContract 0.1.0 has no value-group field."));
    }
  }
  for (const resolved of facts.factors) {
    if (!dimensionByKey.has(resolved.dimensionKey)) {
      issues.push(issue("FACTOR_SEMANTICS_UNRESOLVED", `facts.factors.${resolved.dimensionKey}`, `Resolved factor is absent from the experiment canvas: ${resolved.dimensionKey}.`));
    }
  }

  const readoutByKey = new Map(canvas.readouts.map((readout) => [readout.key, readout]));
  const readoutFactDuplicates = duplicateKeys(facts.readouts.map((readout) => readout.readoutKey));
  if (readoutFactDuplicates.length) {
    issues.push(issue("INVALID_RESOLVED_FACTS", "facts.readouts", `Duplicate resolved readout facts: ${readoutFactDuplicates.join(", ")}`));
  }
  const resolvedReadoutByKey = new Map(facts.readouts.map((readout) => [readout.readoutKey, readout]));
  for (const readout of canvas.readouts) {
    const resolved = resolvedReadoutByKey.get(readout.key);
    if (!resolved || !resolved.valueType.trim()) {
      issues.push(issue("READOUT_SEMANTICS_UNRESOLVED", `facts.readouts.${readout.key}`, `Value semantics are unresolved for ${readout.label}.`));
    }
  }
  for (const resolved of facts.readouts) {
    if (!readoutByKey.has(resolved.readoutKey)) {
      issues.push(issue("READOUT_SEMANTICS_UNRESOLVED", `facts.readouts.${resolved.readoutKey}`, `Resolved readout is absent from the experiment canvas: ${resolved.readoutKey}.`));
    }
  }
  return issues;
}

function conditionAndBindingIssues(
  canvas: ExperimentCanvas,
  pattern: ObservationPatternSet,
): ForwardMappingIssue[] {
  const issues: ForwardMappingIssue[] = [];
  const fullCartesianCount = canvas.dimensions.reduce(
    (count, dimension) => count * dimension.values.length,
    1,
  );
  if (canvas.conditionCells.length !== fullCartesianCount) {
    issues.push(issue("SPARSE_CONDITION_PLAN_NOT_REPRESENTABLE", "canvas.conditionCells", "StructureContract 0.1.0 stores factor levels but not the explicit subset of condition combinations that exists."));
  }
  if (canvas.conditionCells.some((cell) => cell.status === "unknown")) {
    issues.push(issue("CONDITION_COLLECTION_UNRESOLVED", "canvas.conditionCells", "At least one planned condition has unresolved collection status."));
  }
  if (canvas.conditionCells.some((cell) => cell.status === "not_performed_by_design")) {
    issues.push(issue("SPARSE_CONDITION_PLAN_NOT_REPRESENTABLE", "canvas.conditionCells", "StructureContract 0.1.0 cannot preserve an explicit non-Cartesian set of performed condition cells."));
  }

  const expectedPairs = new Set(
    canvas.readouts.flatMap((readout) => canvas.conditionCells.map((cell) => `${readout.key}|${cell.key}`)),
  );
  const boundPairs = new Set<string>();
  for (const binding of pattern.bindings) {
    for (const cellKey of binding.conditionCellKeys) boundPairs.add(`${binding.readoutKey}|${cellKey}`);
    if (binding.status === "unknown") {
      issues.push(issue("CONDITION_COLLECTION_UNRESOLVED", `pattern.bindings.${binding.readoutKey}`, "Whether this readout was collected is unresolved."));
    } else if (binding.status === "not_measured_by_design") {
      issues.push(issue("SPARSE_CONDITION_PLAN_NOT_REPRESENTABLE", `pattern.bindings.${binding.readoutKey}`, "Readout-specific omitted condition cells cannot be stored in StructureContract 0.1.0."));
    }
  }
  const missing = [...expectedPairs].filter((pair) => !boundPairs.has(pair));
  if (missing.length) {
    issues.push(issue("CONDITION_BINDING_INCOMPLETE", "pattern.bindings", `Missing readout-to-condition bindings: ${missing.join(", ")}.`));
  }
  return issues;
}

function requiredLinkageKeys(pattern: ObservationPatternSet): string[] {
  const keys: string[] = [];
  for (const recordSet of pattern.recordSets) {
    if (recordSet.entryAlignment.identityKey && recordSet.entryAlignment.mode !== "separate_lists") {
      keys.push(recordSet.entryAlignment.identityKey);
    }
    for (const use of recordSet.axisUses) {
      const behavior = use.identityBehavior;
      if (behavior.kind === "same_entity" || behavior.kind === "coordinate_within_entity" || behavior.kind === "event_subject") {
        keys.push(behavior.identityKey);
      }
    }
  }
  return unique(keys);
}

function matchingIssues(
  pattern: ObservationPatternSet,
  facts: ResolvedDesignFacts,
): ForwardMappingIssue[] {
  const issues: ForwardMappingIssue[] = [];
  const identityByKey = new Map(pattern.identities.map((identity) => [identity.key, identity]));
  const requiredKeys = requiredLinkageKeys(pattern);
  for (const key of requiredKeys) {
    const availability = linkageAvailabilityIssue(identityByKey.get(key), `pattern.identities.${key}`);
    if (availability) issues.push(availability);
  }

  const matchingNeedsIdentity = !["independent", "none"].includes(facts.matching.kind);
  if (matchingNeedsIdentity && !facts.matching.identityKey) {
    issues.push(issue("MATCHING_SEMANTICS_INCONSISTENT", "facts.matching.identityKey", "The resolved matching structure requires a scientific identity key."));
  }
  if (facts.matching.identityKey) {
    const availability = linkageAvailabilityIssue(identityByKey.get(facts.matching.identityKey), "facts.matching.identityKey");
    if (availability) issues.push(availability);
  }

  for (const recordSet of pattern.recordSets) {
    const alignment = recordSet.entryAlignment.mode;
    const path = `pattern.recordSets.${recordSet.key}.entryAlignment`;
    if (alignment === "unknown") {
      issues.push(issue("MATCHING_SEMANTICS_INCONSISTENT", path, "Cross-condition alignment is unresolved."));
      continue;
    }
    const hasRetainedAxis = recordSet.axisUses.some((use) =>
      use.identityBehavior.kind === "same_entity" ||
      use.identityBehavior.kind === "coordinate_within_entity" ||
      use.identityBehavior.kind === "event_subject"
    );
    const compatible = alignment === "separate_lists"
      ? facts.matching.kind === "independent" || facts.matching.kind === "none" || (facts.matching.kind === "mixed" && hasRetainedAxis)
      : alignment === "shared_linkage"
        ? ["matched", "blocked", "mixed", "crossover"].includes(facts.matching.kind)
        : alignment === "same_entity"
          ? ["matched", "mixed", "crossover"].includes(facts.matching.kind)
          : alignment === "mixed"
            ? facts.matching.kind === "mixed"
            : facts.matching.kind === "crossover";
    if (!compatible) {
      issues.push(issue("MATCHING_SEMANTICS_INCONSISTENT", path, `Observation alignment ${alignment} conflicts with resolved matching ${facts.matching.kind}.`));
    }
  }
  return issues;
}

interface AxisProjection {
  axes: OrderedAxis[];
  issues: ForwardMappingIssue[];
}

function axisBehaviorSignature(behavior: AxisIdentityBehavior): string {
  switch (behavior.kind) {
    case "same_entity":
    case "coordinate_within_entity":
      return `retained:${behavior.identityKey}:${behavior.retainedLevelKey}`;
    case "event_subject":
      return `event:${behavior.identityKey}:${behavior.subjectLevelKey}`;
    case "distinct_entity_each_value":
      return `distinct:${behavior.variedLevelKey}:${behavior.sharedParentLevelKey ?? ""}`;
    case "not_identity_bearing":
      return "not_identity_bearing";
    case "unknown":
      return "unknown";
    case "irrecoverable":
      return "irrecoverable";
  }
}

function axisValues(axis: ObservationAxis): Array<string | number> | null {
  if (axis.valuePlan.mode === "fixed_global") return axis.valuePlan.values;
  if (axis.valuePlan.mode === "from_input" || axis.valuePlan.mode === "open_numeric") return [];
  return null;
}

function projectAxes(
  canvas: ExperimentCanvas,
  pattern: ObservationPatternSet,
): AxisProjection {
  const issues: ForwardMappingIssue[] = [];
  const axes: OrderedAxis[] = [];
  const usesByAxis = new Map<string, Array<{ recordSet: ObservationRecordSet; use: ObservationAxisUse }>>();
  for (const recordSet of pattern.recordSets) {
    const withinConditionAxisCount = recordSet.axisUses.filter((use) =>
      pattern.axes.find((axis) => axis.key === use.axisKey)?.source.kind === "within_condition_record"
    ).length;
    if (withinConditionAxisCount > 1 && recordSet.coordinatePlan !== "cartesian_plan") {
      issues.push(issue("SPARSE_MULTI_AXIS_NOT_REPRESENTABLE", `pattern.recordSets.${recordSet.key}.coordinatePlan`, "StructureContract 0.1.0 cannot preserve sparse or per-identity coordinates across multiple axes."));
    }
    for (const use of recordSet.axisUses) {
      const uses = usesByAxis.get(use.axisKey) ?? [];
      uses.push({ recordSet, use });
      usesByAxis.set(use.axisKey, uses);
    }
  }
  for (const axis of pattern.axes) {
    const path = `pattern.axes.${axis.key}`;
    const uses = usesByAxis.get(axis.key) ?? [];
    if (!uses.length) {
      issues.push(issue("AXIS_UNUSED", path, "The observation axis is not bound to any readout record set."));
      continue;
    }
    if (axis.ordering === "nominal" || axis.kind === "acquisition_channel" || axis.kind === "nominal_coordinate") {
      issues.push(issue("NOMINAL_AXIS_NOT_REPRESENTABLE", path, "A nominal acquisition/channel coordinate must not be coerced into an ordered axis."));
      continue;
    }
    const signatures = unique(uses.map(({ use }) => axisBehaviorSignature(use.identityBehavior)));
    if (signatures.length !== 1) {
      issues.push(issue("AXIS_IDENTITY_BINDING_NOT_REPRESENTABLE", path, "The same axis has incompatible identity behavior across readouts."));
      continue;
    }
    const behavior = uses[0]!.use.identityBehavior;
    if (behavior.kind === "unknown") {
      issues.push(issue("AXIS_IDENTITY_UNRESOLVED", path, "Whether the same entity is observed across this axis is unresolved."));
      continue;
    }
    if (behavior.kind === "irrecoverable") {
      issues.push(issue("LINKAGE_IDENTITY_IRRECOVERABLE", path, "The intended identity across this axis cannot be recovered."));
      continue;
    }
    if (behavior.kind === "not_identity_bearing") {
      issues.push(issue("NOMINAL_AXIS_NOT_REPRESENTABLE", path, "A non-identity-bearing coordinate is not safely representable as an ordered design axis."));
      continue;
    }
    const materialBehaviors = unique(uses.map(({ use }) => use.materialBehavior));
    const identityRetained = behavior.kind === "same_entity" || behavior.kind === "coordinate_within_entity" || behavior.kind === "event_subject";
    // Retained biological identity and physical-material continuity are
    // orthogonal. For example, serial blood samples retain Animal identity
    // while using new material at every time. StructureContract represents the
    // former; ObservationPatternSet remains authoritative for the latter.
    if (!identityRetained && materialBehaviors.includes("same_preparation")) {
      issues.push(issue("MATERIAL_CONTINUITY_NOT_REPRESENTABLE", path, "Shared material across distinct observed entities cannot be encoded in StructureContract 0.1.0."));
    }
    const values = axisValues(axis);
    if (values === null) {
      issues.push(issue("AXIS_VALUE_PLAN_NOT_REPRESENTABLE", path, "Per-identity suggested schedules cannot be projected into a single global ordered-axis definition."));
      continue;
    }
    const sampling: OrderedAxis["sampling"] = behavior.kind === "event_subject"
      ? "event_follow_up"
      : identityRetained
        ? "repeated_same_identity"
        : "cross_sectional";
    axes.push({
      key: axis.key,
      label: axis.label,
      unit: axis.unit ?? "",
      levels: values,
      sampling,
      identityRetained,
    });
  }
  return { axes, issues };
}

function projectFactors(
  canvas: ExperimentCanvas,
  facts: ResolvedDesignFacts,
): Factor[] {
  const factByKey = new Map(facts.factors.map((factor) => [factor.dimensionKey, factor]));
  return canvas.dimensions.map((dimension: CanvasDimension) => {
    const resolved = factByKey.get(dimension.key)!;
    const valueByKey = new Map(dimension.values.map((value) => [value.key, value]));
    return {
      key: dimension.key,
      label: dimension.label,
      levels: dimension.values.map((value) => value.label),
      unitRole: resolved.unitRole,
      relationship: resolved.relationship,
      ordered: resolved.ordered,
      referenceLevel: resolved.referenceValueKey === null ? null : valueByKey.get(resolved.referenceValueKey)!.label,
    };
  });
}

interface ReadoutProjection {
  readouts: Readout[];
  issues: ForwardMappingIssue[];
}

function projectReadouts(
  canvas: ExperimentCanvas,
  pattern: ObservationPatternSet,
  facts: ResolvedDesignFacts,
): ReadoutProjection {
  const issues: ForwardMappingIssue[] = [];
  const recordSetByKey = new Map(pattern.recordSets.map((recordSet) => [recordSet.key, recordSet]));
  const factByKey = new Map(facts.readouts.map((readout) => [readout.readoutKey, readout]));
  const readouts: Readout[] = [];
  for (const readout of canvas.readouts) {
    const bindings = pattern.bindings.filter((binding) => binding.readoutKey === readout.key && binding.status === "measured");
    const recordSetKeys = unique(bindings.map((binding) => binding.recordSetKey).filter((key): key is string => key !== null));
    if (recordSetKeys.length !== 1) {
      issues.push(issue("CONDITION_SPECIFIC_RECORD_SET_NOT_REPRESENTABLE", `pattern.bindings.${readout.key}`, "A readout must resolve to exactly one observation grain and axis set across conditions."));
      continue;
    }
    const recordSet = recordSetByKey.get(recordSetKeys[0]!);
    if (!recordSet) {
      issues.push(issue("READOUT_GRAIN_NOT_REPRESENTABLE", `pattern.bindings.${readout.key}`, "The measured binding does not reference a valid record set."));
      continue;
    }
    const componentSignatures = unique(bindings.map((binding) => binding.componentKeys.join("\u0000")));
    if (componentSignatures.length !== 1 || !bindings[0]?.componentKeys.length) {
      issues.push(issue("READOUT_COMPONENTS_UNRESOLVED", `pattern.bindings.${readout.key}.componentKeys`, "Typed measurement components must be explicit and consistent across conditions."));
      continue;
    }
    const resolved = factByKey.get(readout.key);
    if (!resolved) continue;
    readouts.push({
      key: readout.key,
      label: readout.label,
      valueType: resolved.valueType,
      representation: readout.representation,
      componentKeys: bindings[0].componentKeys,
      referenceRole: resolved.referenceRole,
      observationLevelKey: recordSet.observedLevelKey,
      axisKeys: recordSet.axisUses.map((use) => use.axisKey),
    });
  }
  return { readouts, issues };
}

/**
 * Projects the experiment-first semantic layers into the legacy design object.
 * The function returns a safe stop whenever the legacy contract would change or
 * erase a design-defining meaning. A projection stop does not invalidate the
 * Canvas or its raw/graph path; for example, a sparse condition plan remains
 * graphable even though StructureContract 0.1.0 cannot store its cell topology.
 * It never falls back to a nearby supported structure and never derives
 * biological n from Canvas cells or input rows.
 */
export function mapExperimentToStructureContract(
  canvas: ExperimentCanvas,
  pattern: ObservationPatternSet,
  facts: ResolvedDesignFacts,
): ForwardMappingResult {
  const issues: ForwardMappingIssue[] = [];
  try {
    validateExperimentCanvas(canvas);
  } catch (error) {
    issues.push(issue("INVALID_CANVAS", "canvas", error instanceof Error ? error.message : String(error)));
  }
  try {
    validateObservationPatternSet(pattern, canvas);
  } catch (error) {
    issues.push(issue("INVALID_OBSERVATION_PATTERN", "pattern", error instanceof Error ? error.message : String(error)));
  }
  if (issues.length) return { status: "stopped", issues };

  issues.push(...validateResolvedFacts(canvas, pattern, facts));
  issues.push(...conditionAndBindingIssues(canvas, pattern));
  issues.push(...matchingIssues(pattern, facts));
  const axisProjection = projectAxes(canvas, pattern);
  issues.push(...axisProjection.issues);
  const readoutProjection = projectReadouts(canvas, pattern, facts);
  issues.push(...readoutProjection.issues);
  if (issues.length) {
    const deduplicated = new Map(issues.map((candidate) => [`${candidate.code}|${candidate.path}|${candidate.message}`, candidate]));
    return { status: "stopped", issues: [...deduplicated.values()] };
  }

  const unitFactByKey = new Map(facts.units.map((unit) => [unit.levelKey, unit]));
  const contract: StructureContract = {
    schemaVersion: STRUCTURE_CONTRACT_VERSION,
    caseId: facts.caseId,
    experimentDescription: facts.experimentDescription,
    unitLevels: pattern.levels.map((level) => ({
      key: level.key,
      label: level.label,
      role: unitFactByKey.get(level.key)!.role,
      parentKey: unitFactByKey.get(level.key)!.parentLevelKeys[0] ?? null,
    })),
    experimentalUnitLevelKey: facts.experimentalUnitLevelKey,
    identities: pattern.identities.map((identity) => ({
      key: identity.key,
      label: identity.label,
      unitLevelKey: identity.levelKey,
      required: true,
    })),
    factors: projectFactors(canvas, facts),
    matching: { ...facts.matching },
    orderedAxes: axisProjection.axes,
    readouts: readoutProjection.readouts,
    allowedMissingness: [...facts.allowedMissingness],
    rawObservationGrain: facts.rawObservationGrain,
  };
  try {
    validateStructureContract(contract);
  } catch (error) {
    return {
      status: "stopped",
      issues: [issue("CONTRACT_VALIDATION_FAILED", "contract", error instanceof Error ? error.message : String(error))],
    };
  }
  const notes: ForwardMappingNote[] = [
    { code: "IDENTITY_PROVENANCE_RETAINED_IN_PATTERN", message: "Identity origin and availability remain authoritative in ObservationPatternSet." },
    { code: "IDENTITY_SCOPE_RETAINED_IN_PATTERN", message: "Identity uniqueness scope remains authoritative in ObservationPatternSet." },
    { code: "CONDITION_BINDINGS_RETAINED_IN_PATTERN", message: "Readout-to-condition bindings remain authoritative in ObservationPatternSet." },
  ];
  if (pattern.recordSets.some((recordSet) => recordSet.axisUses.length)) {
    notes.push({ code: "AXIS_IDENTITY_BINDINGS_RETAINED_IN_PATTERN", message: "Per-axis scientific identity bindings remain authoritative in ObservationPatternSet." });
    notes.push({ code: "MATERIAL_CONTINUITY_RETAINED_IN_PATTERN", message: "Physical-material continuity remains authoritative in ObservationPatternSet." });
  }
  return { status: "mapped", contract, notes };
}

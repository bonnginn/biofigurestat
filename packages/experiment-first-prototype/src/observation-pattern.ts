import type { StructureContract } from "./contract.ts";
import type { ExperimentCanvas } from "./experiment-canvas.ts";

export const OBSERVATION_PATTERN_VERSION = "0.3.0-prototype" as const;

export type ObservationLevelKind =
  | "biological_or_experimental_entity"
  | "material_source"
  | "treatment_container"
  | "observed_entity"
  | "sampling_location"
  | "technical_record"
  | "event_record"
  | "unclassified";

export type PlannedMultiplicity =
  | { mode: "one" }
  | { mode: "fixed_plan"; count: number }
  | { mode: "variable"; suggestedCount: number | null }
  | { mode: "from_input" }
  | { mode: "unknown" };

export interface ObservationLevel {
  key: string;
  label: string;
  kind: ObservationLevelKind;
  parentKey: string | null;
  plannedMultiplicity: PlannedMultiplicity;
}

export interface ObservationIdentity {
  key: string;
  label: string;
  levelKey: string;
  uniquenessScopeLevelKey: string | null;
  purpose: "instance_key" | "scientific_linkage" | "both";
  availability: "available" | "to_be_collected" | "recoverable" | "unknown" | "irrecoverable";
  origin: "researcher_supplied" | "instrument_supplied" | "external_link_table" | "app_assigned_before_entry" | "app_row_surrogate";
}

export interface ObservationAxis {
  key: string;
  label: string;
  unit: string | null;
  /** Distinguishes an ordered condition from coordinates repeated inside one condition cell. */
  source:
    | { kind: "canvas_dimension"; dimensionKey: string }
    | { kind: "within_condition_record" };
  kind: "ordered_quantity" | "event_follow_up" | "spatial_coordinate" | "acquisition_channel" | "nominal_coordinate";
  ordering: "ordered" | "nominal";
  valuePlan:
    | { mode: "fixed_global"; values: Array<string | number> }
    | { mode: "per_identity"; suggestedValues: Array<string | number> }
    | { mode: "open_numeric" }
    | { mode: "from_input" };
}

export type AxisIdentityBehavior =
  | { kind: "same_entity"; retainedLevelKey: string; identityKey: string }
  | { kind: "distinct_entity_each_value"; variedLevelKey: string; sharedParentLevelKey: string | null }
  | { kind: "coordinate_within_entity"; retainedLevelKey: string; identityKey: string }
  | { kind: "event_subject"; subjectLevelKey: string; identityKey: string }
  | { kind: "not_identity_bearing" }
  | { kind: "unknown"; candidateLevelKey: string | null }
  | { kind: "irrecoverable"; intendedBehavior: "same_entity" | "coordinate_within_entity" | "event_subject" | null };

export interface ObservationAxisUse {
  axisKey: string;
  identityBehavior: AxisIdentityBehavior;
  materialBehavior: "same_preparation" | "new_material_each_value" | "not_applicable" | "unknown";
}

export interface ObservationRecordSet {
  key: string;
  label: string;
  observedLevelKey: string;
  axisUses: ObservationAxisUse[];
  coordinatePlan: "cartesian_plan" | "sparse_explicit" | "per_identity_schedule" | "unknown";
  entryAlignment: {
    mode: "separate_lists" | "shared_linkage" | "same_entity" | "mixed" | "crossover" | "unknown";
    identityKey: string | null;
    completeSets: boolean | null;
  };
}

export interface ReadoutCellBinding {
  readoutKey: string;
  componentKeys: string[];
  conditionCellKeys: string[];
  status: "measured" | "not_measured_by_design" | "unknown";
  recordSetKey: string | null;
}

export interface ObservationPatternSet {
  schemaVersion: typeof OBSERVATION_PATTERN_VERSION;
  patternSetId: string;
  canvasSchemaVersion: string;
  levels: ObservationLevel[];
  identities: ObservationIdentity[];
  axes: ObservationAxis[];
  recordSets: ObservationRecordSet[];
  bindings: ReadoutCellBinding[];
}

function levelMap(pattern: ObservationPatternSet): Map<string, ObservationLevel> {
  return new Map(pattern.levels.map((level) => [level.key, level]));
}

function isSameOrAncestor(pattern: ObservationPatternSet, ancestorKey: string, levelKey: string): boolean {
  const byKey = levelMap(pattern);
  let cursor = byKey.get(levelKey);
  while (cursor) {
    if (cursor.key === ancestorKey) return true;
    cursor = cursor.parentKey ? byKey.get(cursor.parentKey) : undefined;
  }
  return false;
}

function validateLevels(pattern: ObservationPatternSet): void {
  const byKey = levelMap(pattern);
  if (byKey.size !== pattern.levels.length) throw new Error("Observation level keys must be unique");
  for (const level of pattern.levels) {
    if (level.parentKey !== null && !byKey.has(level.parentKey)) throw new Error(`Unknown observation parent: ${level.parentKey}`);
    if (level.plannedMultiplicity.mode === "fixed_plan" && (!Number.isInteger(level.plannedMultiplicity.count) || level.plannedMultiplicity.count < 1)) {
      throw new Error(`Fixed multiplicity requires a positive count: ${level.key}`);
    }
    const visited = new Set<string>();
    let cursor: ObservationLevel | undefined = level;
    while (cursor) {
      if (visited.has(cursor.key)) throw new Error("Observation hierarchy contains a cycle");
      visited.add(cursor.key);
      cursor = cursor.parentKey ? byKey.get(cursor.parentKey) : undefined;
    }
  }
}

function scientificIdentity(pattern: ObservationPatternSet, key: string): ObservationIdentity {
  const identity = pattern.identities.find((candidate) => candidate.key === key);
  if (!identity || !["scientific_linkage", "both"].includes(identity.purpose)) throw new Error(`Scientific linkage identity required: ${key}`);
  if (identity.origin === "app_row_surrogate") throw new Error(`App row surrogate cannot establish scientific linkage: ${key}`);
  return identity;
}

function retainedEntityIdentity(pattern: ObservationPatternSet, key: string, retainedLevelKey: string): ObservationIdentity {
  const identity = scientificIdentity(pattern, key);
  if (!isSameOrAncestor(pattern, identity.levelKey, retainedLevelKey)) throw new Error(`Identity does not identify retained entity or ancestor: ${key}`);
  return identity;
}

export function validateObservationPatternSet(pattern: ObservationPatternSet, canvas?: ExperimentCanvas): ObservationPatternSet {
  if (pattern.schemaVersion !== OBSERVATION_PATTERN_VERSION) throw new Error("Unsupported observation-pattern version");
  if (!pattern.patternSetId || !pattern.levels.length || !pattern.recordSets.length || !pattern.bindings.length) throw new Error("Pattern set, levels, record sets, and bindings are required");
  if (canvas && pattern.canvasSchemaVersion !== canvas.schemaVersion) throw new Error("Pattern set and Canvas schema versions do not match");
  validateLevels(pattern);
  const levels = levelMap(pattern);
  const identities = new Map(pattern.identities.map((identity) => [identity.key, identity]));
  if (identities.size !== pattern.identities.length) throw new Error("Observation identity keys must be unique");
  for (const identity of pattern.identities) {
    if (!levels.has(identity.levelKey)) throw new Error(`Identity references unknown level: ${identity.key}`);
    if (identity.uniquenessScopeLevelKey && !levels.has(identity.uniquenessScopeLevelKey)) throw new Error(`Identity scope is unknown: ${identity.key}`);
    if (identity.origin === "app_row_surrogate" && identity.purpose !== "instance_key") throw new Error(`Row surrogate may only be an instance key: ${identity.key}`);
  }
  const axes = new Map(pattern.axes.map((axis) => [axis.key, axis]));
  if (axes.size !== pattern.axes.length) throw new Error("Observation axis keys must be unique");
  for (const axis of pattern.axes) {
    if (axis.ordering === "nominal" && axis.kind === "ordered_quantity") throw new Error(`Ordered quantity cannot be nominal: ${axis.key}`);
    if (axis.valuePlan.mode === "fixed_global" && !axis.valuePlan.values.length) throw new Error(`Fixed axis has no values: ${axis.key}`);
    if (canvas) {
      const dimension = canvas.dimensions.find((candidate) => candidate.key === axis.key);
      if (axis.source.kind === "canvas_dimension") {
        if (axis.source.dimensionKey !== axis.key || !dimension) throw new Error(`Canvas-dimension axis does not reference a matching Canvas dimension: ${axis.key}`);
      } else if (dimension) {
        throw new Error(`Within-condition axis duplicates a Canvas dimension: ${axis.key}`);
      }
    }
  }
  const recordSets = new Map(pattern.recordSets.map((recordSet) => [recordSet.key, recordSet]));
  if (recordSets.size !== pattern.recordSets.length) throw new Error("Observation record-set keys must be unique");
  for (const recordSet of pattern.recordSets) {
    if (!levels.has(recordSet.observedLevelKey)) throw new Error(`Record set references unknown observed level: ${recordSet.key}`);
    const usedAxes = new Set<string>();
    for (const use of recordSet.axisUses) {
      if (!axes.has(use.axisKey)) throw new Error(`Record set references unknown axis: ${use.axisKey}`);
      if (usedAxes.has(use.axisKey)) throw new Error(`Axis used twice by record set: ${use.axisKey}`);
      usedAxes.add(use.axisKey);
      const behavior = use.identityBehavior;
      if (behavior.kind === "same_entity" || behavior.kind === "coordinate_within_entity") {
        if (!isSameOrAncestor(pattern, behavior.retainedLevelKey, recordSet.observedLevelKey)) throw new Error(`Retained level is not an ancestor of record grain: ${recordSet.key}`);
        retainedEntityIdentity(pattern, behavior.identityKey, behavior.retainedLevelKey);
      } else if (behavior.kind === "event_subject") {
        retainedEntityIdentity(pattern, behavior.identityKey, behavior.subjectLevelKey);
      } else if (behavior.kind === "distinct_entity_each_value") {
        if (!levels.has(behavior.variedLevelKey)) throw new Error(`Varied level is unknown: ${recordSet.key}`);
        if (behavior.sharedParentLevelKey && !levels.has(behavior.sharedParentLevelKey)) throw new Error(`Shared parent is unknown: ${recordSet.key}`);
      }
    }
    const alignment = recordSet.entryAlignment;
    if (!["separate_lists", "unknown"].includes(alignment.mode) && !alignment.identityKey) {
      throw new Error(`Aligned record set requires a scientific linkage identity: ${recordSet.key}`);
    }
    if (alignment.mode === "separate_lists" && alignment.identityKey !== null) {
      throw new Error(`Separate condition lists cannot imply a hidden linkage identity: ${recordSet.key}`);
    }
    // A matching/blocking identity may link sibling samples that are not a
    // parent of the raw-observation grain. It must be a real scientific key,
    // but ancestry is only required for retained-entity axis behavior above.
    if (alignment.identityKey) scientificIdentity(pattern, alignment.identityKey);
  }
  const readoutCellPairs = new Set<string>();
  const canvasCells = canvas ? new Map(canvas.conditionCells.map((cell) => [cell.key, cell])) : null;
  const canvasReadouts = canvas ? new Set(canvas.readouts.map((readout) => readout.key)) : null;
  for (const binding of pattern.bindings) {
    if (canvasReadouts && !canvasReadouts.has(binding.readoutKey)) throw new Error(`Binding references unknown canvas readout: ${binding.readoutKey}`);
    if (binding.status === "measured" && (!binding.recordSetKey || !recordSets.has(binding.recordSetKey))) throw new Error(`Measured binding requires a record set: ${binding.readoutKey}`);
    if (binding.status !== "measured" && binding.recordSetKey !== null) throw new Error(`Unmeasured binding cannot reference a record set: ${binding.readoutKey}`);
    if (!binding.conditionCellKeys.length) throw new Error(`Binding has no condition cells: ${binding.readoutKey}`);
    for (const cellKey of binding.conditionCellKeys) {
      if (canvasCells && !canvasCells.has(cellKey)) throw new Error(`Binding references unknown condition cell: ${cellKey}`);
      const pair = `${binding.readoutKey}|${cellKey}`;
      if (readoutCellPairs.has(pair)) throw new Error(`Readout and condition cell are bound more than once: ${pair}`);
      readoutCellPairs.add(pair);
      if (canvasCells?.get(cellKey)?.status === "not_performed_by_design" && binding.status === "measured") throw new Error(`Not-performed condition cannot have measured binding: ${pair}`);
      if (canvasCells?.get(cellKey)?.status === "unknown" && binding.status === "measured") throw new Error(`Unknown condition cannot have measured binding: ${pair}`);
    }
  }
  if (canvasReadouts && canvasCells) {
    for (const readoutKey of canvasReadouts) {
      for (const cellKey of canvasCells.keys()) {
        const pair = `${readoutKey}|${cellKey}`;
        if (!readoutCellPairs.has(pair)) throw new Error(`Readout and condition cell require an explicit binding: ${pair}`);
      }
    }
  }
  return pattern;
}

export function observationPatternReadinessIssues(pattern: ObservationPatternSet): string[] {
  const identities = new Map(pattern.identities.map((identity) => [identity.key, identity]));
  const issues: string[] = [];
  const requireIdentity = (key: string) => {
    const identity = identities.get(key);
    if (!identity) issues.push(`identity_missing:${key}`);
    else if (identity.availability === "unknown") issues.push(`identity_unknown:${key}`);
    else if (identity.availability === "irrecoverable") issues.push(`identity_irrecoverable:${key}`);
    else if (identity.availability === "recoverable") issues.push(`identity_mapping_required:${key}`);
  };
  for (const recordSet of pattern.recordSets) {
    if (recordSet.entryAlignment.identityKey && recordSet.entryAlignment.mode !== "separate_lists") requireIdentity(recordSet.entryAlignment.identityKey);
    for (const use of recordSet.axisUses) {
      const behavior = use.identityBehavior;
      if (behavior.kind === "same_entity" || behavior.kind === "coordinate_within_entity" || behavior.kind === "event_subject") requireIdentity(behavior.identityKey);
      else if (behavior.kind === "unknown") issues.push(`axis_identity_unknown:${recordSet.key}:${use.axisKey}`);
      else if (behavior.kind === "irrecoverable") issues.push(`axis_identity_irrecoverable:${recordSet.key}:${use.axisKey}`);
    }
  }
  return [...new Set(issues)];
}

function levelKind(role: StructureContract["unitLevels"][number]["role"]): ObservationLevelKind {
  if (role === "technical_replicate") return "technical_record";
  if (role === "sampling_location") return "sampling_location";
  if (role === "subsample" || role === "condition_specific_sample") return "observed_entity";
  if (role === "sample" || role === "block") return "material_source";
  return "biological_or_experimental_entity";
}

function axisKind(label: string, sampling: StructureContract["orderedAxes"][number]["sampling"]): ObservationAxis["kind"] {
  if (sampling === "event_follow_up") return "event_follow_up";
  if (/channel/i.test(label)) return "acquisition_channel";
  if (/^z$|z.?plane|radius|distance/i.test(label)) return "spatial_coordinate";
  return "ordered_quantity";
}

function alignment(contract: StructureContract): ObservationRecordSet["entryAlignment"] {
  return {
    mode: contract.matching.kind === "crossover" ? "crossover" : contract.matching.kind === "mixed" ? "mixed" : contract.matching.kind === "matched" || contract.matching.kind === "blocked" ? "shared_linkage" : "separate_lists",
    identityKey: contract.matching.identityKey,
    completeSets: contract.matching.completeSetsRequired,
  };
}

/** Projection used only for expressiveness/regression checks from an already-complete contract. */
export function observationPatternFromContract(contract: StructureContract, canvas: ExperimentCanvas): ObservationPatternSet {
  const levels: ObservationLevel[] = contract.unitLevels.map((level) => ({
    key: level.key,
    label: level.label,
    kind: levelKind(level.role),
    parentKey: level.parentKey,
    plannedMultiplicity: level.key === contract.experimentalUnitLevelKey ? { mode: "from_input" } : { mode: "variable", suggestedCount: null },
  }));
  const identities: ObservationIdentity[] = contract.identities.map((identity) => ({
    key: identity.key,
    label: identity.label,
    levelKey: identity.unitLevelKey,
    uniquenessScopeLevelKey: null,
    purpose: "both",
    availability: "available",
    origin: "researcher_supplied",
  }));
  const axes: ObservationAxis[] = contract.orderedAxes.map((axis) => {
    const kind = axisKind(axis.label, axis.sampling);
    const canvasDimension = canvas.dimensions.find((dimension) => dimension.key === axis.key);
    return {
      key: axis.key,
      label: axis.label,
      unit: axis.unit || null,
      source: canvasDimension
        ? { kind: "canvas_dimension" as const, dimensionKey: canvasDimension.key }
        : { kind: "within_condition_record" as const },
      kind,
      ordering: kind === "acquisition_channel" || kind === "nominal_coordinate" ? "nominal" : "ordered",
      valuePlan: axis.levels.length ? { mode: "fixed_global", values: axis.levels } : axis.sampling === "event_follow_up" ? { mode: "from_input" } : { mode: "per_identity", suggestedValues: [] },
    };
  });
  const identityForLevelOrAncestor = (levelKey: string): ObservationIdentity | undefined => {
    const exact = identities.find((identity) => identity.levelKey === levelKey);
    if (exact) return exact;
    const byKey = new Map(levels.map((level) => [level.key, level]));
    let cursor = byKey.get(levelKey);
    while (cursor?.parentKey) {
      const found = identities.find((identity) => identity.levelKey === cursor!.parentKey);
      if (found) return found;
      cursor = byKey.get(cursor.parentKey);
    }
    return identities[0];
  };
  const recordSetBySignature = new Map<string, ObservationRecordSet>();
  for (const readout of contract.readouts) {
    const signature = `${readout.observationLevelKey}|${readout.axisKeys.join(",")}`;
    if (recordSetBySignature.has(signature)) continue;
    const axisUses: ObservationAxisUse[] = readout.axisKeys.map((axisKey) => {
      const axis = contract.orderedAxes.find((candidate) => candidate.key === axisKey)!;
      const identity = identityForLevelOrAncestor(readout.observationLevelKey);
      const kind = axisKind(axis.label, axis.sampling);
      const identityBehavior: AxisIdentityBehavior = axis.sampling === "event_follow_up" && identity
        ? { kind: "event_subject", subjectLevelKey: identity.levelKey, identityKey: identity.key }
        : kind === "acquisition_channel"
          ? { kind: "not_identity_bearing" }
          : axis.identityRetained && identity
            ? kind === "spatial_coordinate"
              ? { kind: "coordinate_within_entity", retainedLevelKey: identity.levelKey, identityKey: identity.key }
              : { kind: "same_entity", retainedLevelKey: identity.levelKey, identityKey: identity.key }
            : { kind: "distinct_entity_each_value", variedLevelKey: readout.observationLevelKey, sharedParentLevelKey: levels.find((level) => level.key === readout.observationLevelKey)?.parentKey ?? null };
      return { axisKey, identityBehavior, materialBehavior: axis.sampling === "event_follow_up" ? "not_applicable" : "unknown" };
    });
    const withinConditionHasOpenSchedule = readout.axisKeys.some((axisKey) => {
      const projected = axes.find((axis) => axis.key === axisKey);
      return projected?.source.kind === "within_condition_record" && projected.valuePlan.mode !== "fixed_global";
    });
    recordSetBySignature.set(signature, {
      key: `records-${recordSetBySignature.size + 1}`,
      label: readout.label,
      observedLevelKey: readout.observationLevelKey,
      axisUses,
      coordinatePlan: withinConditionHasOpenSchedule ? "per_identity_schedule" : "cartesian_plan",
      entryAlignment: alignment(contract),
    });
  }
  const cellsByStatus = {
    measured: canvas.conditionCells.filter((cell) => cell.status === "performed").map((cell) => cell.key),
    not_measured_by_design: canvas.conditionCells.filter((cell) => cell.status === "not_performed_by_design").map((cell) => cell.key),
    unknown: canvas.conditionCells.filter((cell) => cell.status === "unknown").map((cell) => cell.key),
  };
  const bindings: ReadoutCellBinding[] = contract.readouts.flatMap((readout) => {
    const recordSet = recordSetBySignature.get(`${readout.observationLevelKey}|${readout.axisKeys.join(",")}`)!;
    return [
      ...(cellsByStatus.measured.length ? [{ readoutKey: readout.key, componentKeys: readout.componentKeys, conditionCellKeys: cellsByStatus.measured, status: "measured" as const, recordSetKey: recordSet.key }] : []),
      ...(cellsByStatus.not_measured_by_design.length ? [{ readoutKey: readout.key, componentKeys: readout.componentKeys, conditionCellKeys: cellsByStatus.not_measured_by_design, status: "not_measured_by_design" as const, recordSetKey: null }] : []),
      ...(cellsByStatus.unknown.length ? [{ readoutKey: readout.key, componentKeys: readout.componentKeys, conditionCellKeys: cellsByStatus.unknown, status: "unknown" as const, recordSetKey: null }] : []),
    ];
  });
  return validateObservationPatternSet({ schemaVersion: OBSERVATION_PATTERN_VERSION, patternSetId: `${contract.caseId}-observations`, canvasSchemaVersion: canvas.schemaVersion, levels, identities, axes, recordSets: [...recordSetBySignature.values()], bindings }, canvas);
}

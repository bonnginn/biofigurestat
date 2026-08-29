import {
  validateExperimentCanvas,
  type CanvasDimension,
  type ExperimentCanvas,
} from "./experiment-canvas.ts";
import {
  validateObservationPatternSet,
  type ObservationPatternSet,
  type ReadoutCellBinding,
} from "./observation-pattern.ts";
import type { ResolvedDesignFacts } from "./forward-mapper.ts";

export const ANALYSIS_SCOPE_VERSION = "0.1.0-prototype" as const;

export interface AnalysisScopeRequest {
  schemaVersion: typeof ANALYSIS_SCOPE_VERSION;
  scopeId: string;
  conditionCellKeys: string[];
  readoutKeys: string[];
}

export interface AnalysisScopeProvenance {
  scopeId: string;
  selectedConditionCellKeys: string[];
  excludedConditionCellKeys: string[];
  selectedReadoutKeys: string[];
  fixedConditionContext: Array<{
    dimensionKey: string;
    dimensionLabel: string;
    valueKey: string;
    valueLabel: string;
    groupKey: string | null;
    groupLabel: string | null;
    parentValueKey: string | null;
    parentValueLabel: string | null;
  }>;
  valueGroupContext: Array<{
    dimensionKey: string;
    valueKey: string;
    groupKey: string;
    groupLabel: string;
  }>;
  notes: string[];
}

export type AnalysisScopeIssueCode =
  | "INVALID_SCOPE_REQUEST"
  | "SELECTED_CONDITION_UNKNOWN"
  | "SELECTED_CONDITION_NOT_PERFORMED"
  | "SELECTED_READOUT_UNKNOWN"
  | "SELECTED_READOUT_NOT_MEASURED"
  | "GROUPED_SCOPE_NOT_REPRESENTABLE"
  | "SELECTED_SCOPE_NOT_CARTESIAN"
  | "SCOPED_PATTERN_INVALID";

export interface AnalysisScopeIssue {
  code: AnalysisScopeIssueCode;
  path: string;
  message: string;
}

export type AnalysisScopeResult =
  | {
      status: "ready";
      canvas: ExperimentCanvas;
      pattern: ObservationPatternSet;
      provenance: AnalysisScopeProvenance;
    }
  | { status: "safe_stop"; issues: AnalysisScopeIssue[] };

export interface ScopedMatchingFact {
  value: ResolvedDesignFacts["matching"];
  provenance: "explicit_scoped_researcher_fact";
}

export interface ScopedDesignFactOverrides {
  matching?: ScopedMatchingFact;
}

export interface ScopedDesignFactIssue {
  code: "SCOPED_MATCHING_REQUIRED";
  path: string;
  message: string;
  researcherQuestion: string;
}

export type ScopedDesignFactsResult =
  | {
      status: "ready";
      facts: ResolvedDesignFacts;
      provenance: {
        matching: "retained_without_semantic_change" | "explicit_scoped_researcher_fact";
        rawObservationGrain: "generated_from_scoped_pattern";
      };
    }
  | { status: "needs_information"; issues: ScopedDesignFactIssue[] };

function issue(code: AnalysisScopeIssueCode, path: string, message: string): AnalysisScopeIssue {
  return { code, path, message };
}

function duplicate(values: string[]): boolean {
  return new Set(values).size !== values.length;
}

function semanticClone<T>(value: T): T {
  return JSON.parse(JSON.stringify(value)) as T;
}

function scopedRawObservationGrain(pattern: ObservationPatternSet, canvas: ExperimentCanvas): string {
  const levelByKey = new Map(pattern.levels.map((level) => [level.key, level]));
  const axisByKey = new Map(pattern.axes.map((axis) => [axis.key, axis]));
  const readoutLabelByKey = new Map(canvas.readouts.map((readout) => [readout.key, readout.label]));
  const readoutLabelsByRecordSet = new Map<string, string[]>();
  for (const binding of pattern.bindings) {
    if (binding.status !== "measured" || !binding.recordSetKey) continue;
    const labels = readoutLabelsByRecordSet.get(binding.recordSetKey) ?? [];
    const label = readoutLabelByKey.get(binding.readoutKey) ?? binding.readoutKey;
    if (!labels.includes(label)) labels.push(label);
    readoutLabelsByRecordSet.set(binding.recordSetKey, labels);
  }
  return pattern.recordSets.map((recordSet) => {
    const lineage: string[] = [];
    let cursor = levelByKey.get(recordSet.observedLevelKey);
    while (cursor) {
      lineage.unshift(cursor.label);
      cursor = cursor.parentKey === null ? undefined : levelByKey.get(cursor.parentKey);
    }
    const axes = recordSet.axisUses.map((use) => axisByKey.get(use.axisKey)?.label ?? use.axisKey);
    const readouts = readoutLabelsByRecordSet.get(recordSet.key) ?? [];
    return `${readouts.join(" + ") || recordSet.label}: one record per ${lineage.join(" > ")}${axes.length ? ` at each recorded ${axes.join(" × ")}` : ""}`;
  }).join("; ");
}

function conditionSignature(values: Record<string, string>, dimensions: CanvasDimension[]): string {
  return dimensions.map((dimension) => `${dimension.key}=${values[dimension.key] ?? ""}`).join("|");
}

function combinations(dimensions: CanvasDimension[]): Array<Record<string, string>> {
  return dimensions.reduce<Array<Record<string, string>>>(
    (rows, dimension) => rows.flatMap((row) => dimension.values.map((value) => ({ ...row, [dimension.key]: value.key }))),
    [{}],
  );
}

function bindingsForScope(
  pattern: ObservationPatternSet,
  readoutKeys: Set<string>,
  conditionKeys: Set<string>,
): ReadoutCellBinding[] {
  const grouped = new Map<string, ReadoutCellBinding>();
  for (const binding of pattern.bindings) {
    if (!readoutKeys.has(binding.readoutKey)) continue;
    for (const conditionCellKey of binding.conditionCellKeys.filter((key) => conditionKeys.has(key))) {
      const signature = `${binding.readoutKey}|${binding.status}|${binding.recordSetKey ?? ""}|${binding.componentKeys.join("\u0000")}`;
      const existing = grouped.get(signature);
      if (existing) existing.conditionCellKeys.push(conditionCellKey);
      else grouped.set(signature, { ...binding, componentKeys: [...binding.componentKeys], conditionCellKeys: [conditionCellKey] });
    }
  }
  return [...grouped.values()];
}

/**
 * Creates an explicit, comparison-scoped semantic view. It never fills an
 * absent cell or treats all performed cells as a full factorial. The full
 * project Canvas and raw records remain outside this scoped view.
 */
export function createAnalysisScope(
  canvas: ExperimentCanvas,
  pattern: ObservationPatternSet,
  request: AnalysisScopeRequest,
): AnalysisScopeResult {
  try {
    validateExperimentCanvas(canvas);
    validateObservationPatternSet(pattern, canvas);
  } catch (error) {
    return { status: "safe_stop", issues: [issue("INVALID_SCOPE_REQUEST", "source", error instanceof Error ? error.message : String(error))] };
  }
  if (
    request.schemaVersion !== ANALYSIS_SCOPE_VERSION ||
    !request.scopeId.trim() ||
    request.conditionCellKeys.length < 1 ||
    !request.readoutKeys.length ||
    duplicate(request.conditionCellKeys) ||
    duplicate(request.readoutKeys)
  ) {
    return { status: "safe_stop", issues: [issue("INVALID_SCOPE_REQUEST", "request", "A scope requires unique IDs, at least one condition, and at least one readout.")] };
  }
  const conditionByKey = new Map(canvas.conditionCells.map((cell) => [cell.key, cell]));
  const readoutByKey = new Map(canvas.readouts.map((readout) => [readout.key, readout]));
  const issues: AnalysisScopeIssue[] = [];
  const selectedConditions = request.conditionCellKeys.flatMap((key) => {
    const condition = conditionByKey.get(key);
    if (!condition) {
      issues.push(issue("SELECTED_CONDITION_UNKNOWN", `request.conditionCellKeys.${key}`, `Unknown condition: ${key}.`));
      return [];
    }
    if (condition.status !== "performed") {
      issues.push(issue("SELECTED_CONDITION_NOT_PERFORMED", `request.conditionCellKeys.${key}`, `Condition ${key} was not confirmed as performed.`));
    }
    return [condition];
  });
  for (const key of request.readoutKeys) {
    if (!readoutByKey.has(key)) issues.push(issue("SELECTED_READOUT_UNKNOWN", `request.readoutKeys.${key}`, `Unknown readout: ${key}.`));
  }
  for (const readoutKey of request.readoutKeys) {
    for (const conditionKey of request.conditionCellKeys) {
      const binding = pattern.bindings.find((candidate) => candidate.readoutKey === readoutKey && candidate.conditionCellKeys.includes(conditionKey));
      if (binding?.status !== "measured" || !binding.recordSetKey) {
        issues.push(issue("SELECTED_READOUT_NOT_MEASURED", `pattern.bindings.${readoutKey}.${conditionKey}`, `Readout ${readoutKey} is not measured for condition ${conditionKey}.`));
      }
    }
  }
  if (issues.length) return { status: "safe_stop", issues };

  const fixedConditionContext: AnalysisScopeProvenance["fixedConditionContext"] = [];
  const scopedDimensions: CanvasDimension[] = [];
  let groupingIssue: AnalysisScopeIssue | null = null;
  for (const dimension of canvas.dimensions) {
    const selectedValueKeys = new Set(selectedConditions.map((condition) => condition.values[dimension.key]!));
    const selectedValues = dimension.values.filter((value) => selectedValueKeys.has(value.key));
    if (selectedValues.length === 1) {
      const value = selectedValues[0]!;
      const group = (dimension.groups ?? []).find((candidate) => candidate.key === value.groupKey) ?? null;
      const parent = value.parentValueKey === null
        ? null
        : dimension.values.find((candidate) => candidate.key === value.parentValueKey) ?? null;
      fixedConditionContext.push({
        dimensionKey: dimension.key,
        dimensionLabel: dimension.label,
        valueKey: value.key,
        valueLabel: value.label,
        groupKey: value.groupKey ?? null,
        groupLabel: group?.label ?? null,
        parentValueKey: value.parentValueKey,
        parentValueLabel: parent?.label ?? null,
      });
      continue;
    }
    if (selectedValues.some((value) => value.groupKey || value.parentValueKey !== null)) {
      groupingIssue ??= issue(
        "GROUPED_SCOPE_NOT_REPRESENTABLE",
        `canvas.dimensions.${dimension.key}`,
        `The selected ${dimension.label} values retain scientific grouping or hierarchy that StructureContract 0.1.0 cannot preserve.`,
      );
    }
    scopedDimensions.push({
      key: dimension.key,
      label: dimension.label,
      kind: dimension.kind,
      groups: [],
      values: selectedValues.map((value) => ({ key: value.key, label: value.label, parentValueKey: null, groupKey: null })),
    });
  }
  const selectedSignatures = new Set(selectedConditions.map((condition) => conditionSignature(condition.values, scopedDimensions)));
  const expectedSignatures = new Set(combinations(scopedDimensions).map((values) => conditionSignature(values, scopedDimensions)));
  const missingCombinations = [...expectedSignatures].filter((candidate) => !selectedSignatures.has(candidate));
  if (missingCombinations.length || selectedSignatures.size !== expectedSignatures.size) {
    return {
      status: "safe_stop",
      issues: [issue(
        "SELECTED_SCOPE_NOT_CARTESIAN",
        "request.conditionCellKeys",
        `The selected conditions do not form a complete comparison rectangle. Missing: ${missingCombinations.join(", ") || "none"}.`,
      )],
    };
  }
  if (groupingIssue) return { status: "safe_stop", issues: [groupingIssue] };

  const selectedReadouts = new Set(request.readoutKeys);
  const selectedConditionKeys = new Set(request.conditionCellKeys);
  const bindings = bindingsForScope(pattern, selectedReadouts, selectedConditionKeys);
  const usedRecordSetKeys = new Set(bindings.map((binding) => binding.recordSetKey).filter((key): key is string => key !== null));
  const fixedDimensionKeys = new Set(fixedConditionContext.map((context) => context.dimensionKey));
  const axisByKey = new Map(pattern.axes.map((axis) => [axis.key, axis]));
  const recordSets = pattern.recordSets
    .filter((recordSet) => usedRecordSetKeys.has(recordSet.key))
    .map((recordSet) => ({
      ...semanticClone(recordSet),
      axisUses: semanticClone(recordSet.axisUses.filter((use) => {
        const axis = axisByKey.get(use.axisKey);
        return axis?.source.kind !== "canvas_dimension" || !fixedDimensionKeys.has(axis.source.dimensionKey);
      })),
    }));
  const usedAxisKeys = new Set(recordSets.flatMap((recordSet) => recordSet.axisUses.map((use) => use.axisKey)));
  const scopedDimensionByKey = new Map(scopedDimensions.map((dimension) => [dimension.key, dimension]));
  const axes = pattern.axes
    .filter((axis) => usedAxisKeys.has(axis.key))
    .map((axis) => {
      const cloned = semanticClone(axis);
      if (cloned.source.kind === "canvas_dimension") {
        const dimension = scopedDimensionByKey.get(cloned.source.dimensionKey)!;
        cloned.valuePlan = { mode: "fixed_global", values: dimension.values.map((value) => value.label) };
      }
      return cloned;
    });

  const levelByKey = new Map(pattern.levels.map((level) => [level.key, level]));
  const identityByKey = new Map(pattern.identities.map((identity) => [identity.key, identity]));
  const includedLevelKeys = new Set<string>();
  const referencedIdentityKeys = new Set<string>();
  const includeLevel = (levelKey: string | null): void => {
    let cursor = levelKey === null ? undefined : levelByKey.get(levelKey);
    while (cursor && !includedLevelKeys.has(cursor.key)) {
      includedLevelKeys.add(cursor.key);
      cursor = cursor.parentKey === null ? undefined : levelByKey.get(cursor.parentKey);
    }
  };
  for (const recordSet of recordSets) {
    includeLevel(recordSet.observedLevelKey);
    if (recordSet.entryAlignment.identityKey) referencedIdentityKeys.add(recordSet.entryAlignment.identityKey);
    for (const use of recordSet.axisUses) {
      const behavior = use.identityBehavior;
      if (behavior.kind === "same_entity" || behavior.kind === "coordinate_within_entity") {
        includeLevel(behavior.retainedLevelKey);
        referencedIdentityKeys.add(behavior.identityKey);
      } else if (behavior.kind === "event_subject") {
        includeLevel(behavior.subjectLevelKey);
        referencedIdentityKeys.add(behavior.identityKey);
      } else if (behavior.kind === "distinct_entity_each_value") {
        includeLevel(behavior.variedLevelKey);
        includeLevel(behavior.sharedParentLevelKey);
      }
    }
  }
  for (const identityKey of referencedIdentityKeys) {
    const identity = identityByKey.get(identityKey);
    if (!identity) continue;
    includeLevel(identity.levelKey);
    includeLevel(identity.uniquenessScopeLevelKey);
  }
  let expanded = true;
  while (expanded) {
    expanded = false;
    for (const identity of pattern.identities) {
      if (!includedLevelKeys.has(identity.levelKey) || referencedIdentityKeys.has(identity.key)) continue;
      referencedIdentityKeys.add(identity.key);
      const before = includedLevelKeys.size;
      includeLevel(identity.uniquenessScopeLevelKey);
      if (includedLevelKeys.size !== before) expanded = true;
    }
  }
  const levels = pattern.levels.filter((level) => includedLevelKeys.has(level.key)).map(semanticClone);
  const identities = pattern.identities
    .filter((identity) => referencedIdentityKeys.has(identity.key) || includedLevelKeys.has(identity.levelKey))
    .map(semanticClone);
  const scopedCanvas: ExperimentCanvas = {
    schemaVersion: canvas.schemaVersion,
    experimentLabel: `${canvas.experimentLabel} — selected comparison`,
    dimensions: scopedDimensions,
    conditionCells: selectedConditions.map((condition) => ({
      ...condition,
      values: Object.fromEntries(scopedDimensions.map((dimension) => [dimension.key, condition.values[dimension.key]!])),
      status: "performed",
    })),
    readouts: canvas.readouts.filter((readout) => selectedReadouts.has(readout.key)).map(semanticClone),
  };
  const scopedPattern: ObservationPatternSet = {
    schemaVersion: pattern.schemaVersion,
    patternSetId: `${pattern.patternSetId}--scope-${request.scopeId}`,
    canvasSchemaVersion: pattern.canvasSchemaVersion,
    levels,
    identities,
    axes,
    recordSets,
    bindings,
  };
  try {
    validateExperimentCanvas(scopedCanvas);
    validateObservationPatternSet(scopedPattern, scopedCanvas);
  } catch (error) {
    return { status: "safe_stop", issues: [issue("SCOPED_PATTERN_INVALID", "scope", error instanceof Error ? error.message : String(error))] };
  }

  const valueGroupContext = fixedConditionContext.flatMap((context) => context.groupKey
    ? [{
        dimensionKey: context.dimensionKey,
        valueKey: context.valueKey,
        groupKey: context.groupKey,
        groupLabel: context.groupLabel ?? context.groupKey,
      }]
    : []);
  return {
    status: "ready",
    canvas: scopedCanvas,
    pattern: scopedPattern,
    provenance: {
      scopeId: request.scopeId,
      selectedConditionCellKeys: [...request.conditionCellKeys],
      excludedConditionCellKeys: canvas.conditionCells.filter((cell) => !selectedConditionKeys.has(cell.key)).map((cell) => cell.key),
      selectedReadoutKeys: [...request.readoutKeys],
      fixedConditionContext,
      valueGroupContext,
      notes: [
        "This contract view applies only to the explicitly selected comparison.",
        "The full Canvas, unselected conditions, raw records, and grouping remain in the project snapshot.",
      ],
    },
  };
}

export function scopeResolvedDesignFacts(
  facts: ResolvedDesignFacts,
  scope: Extract<AnalysisScopeResult, { status: "ready" }>,
  overrides: ScopedDesignFactOverrides = {},
): ScopedDesignFactsResult {
  const dimensionByKey = new Map(scope.canvas.dimensions.map((dimension) => [dimension.key, dimension]));
  const readoutKeys = new Set(scope.canvas.readouts.map((readout) => readout.key));
  const levelKeys = new Set(scope.pattern.levels.map((level) => level.key));
  const semanticPruningOccurred =
    scope.canvas.dimensions.length !== facts.factors.length ||
    scope.canvas.readouts.length !== facts.readouts.length ||
    scope.pattern.levels.length !== facts.units.length;
  const allScopedRecordsAreSeparate = scope.pattern.recordSets.every((recordSet) => recordSet.entryAlignment.mode === "separate_lists");
  const matchingCanBeRetained = !semanticPruningOccurred ||
    (["independent", "none"].includes(facts.matching.kind) && allScopedRecordsAreSeparate);
  if (!matchingCanBeRetained && !overrides.matching) {
    return {
      status: "needs_information",
      issues: [{
        code: "SCOPED_MATCHING_REQUIRED",
        path: "scope.matching",
        message: "The source experiment's matching structure may change after factors, readouts, or observation levels are removed from this comparison.",
        researcherQuestion: "この比較に選んだ記録どうしは、同じ対象・同じ由来として対応づけますか、それとも別々の対象として比べますか？",
      }],
    };
  }
  const resolved: ResolvedDesignFacts = {
    ...facts,
    caseId: `${facts.caseId}--scope-${scope.provenance.scopeId}`,
    units: facts.units
      .filter((unit) => levelKeys.has(unit.levelKey))
      .map((unit) => ({ ...unit, parentLevelKeys: unit.parentLevelKeys.filter((key) => levelKeys.has(key)) })),
    factors: facts.factors
      .filter((factor) => dimensionByKey.has(factor.dimensionKey))
      .map((factor) => ({
        ...factor,
        referenceValueKey: factor.referenceValueKey && dimensionByKey.get(factor.dimensionKey)!.values.some((value) => value.key === factor.referenceValueKey)
          ? factor.referenceValueKey
          : null,
      })),
    matching: semanticClone(overrides.matching?.value ?? facts.matching),
    readouts: facts.readouts.filter((readout) => readoutKeys.has(readout.readoutKey)).map(semanticClone),
    allowedMissingness: [...facts.allowedMissingness],
    rawObservationGrain: scopedRawObservationGrain(scope.pattern, scope.canvas),
  };
  return {
    status: "ready",
    facts: resolved,
    provenance: {
      matching: overrides.matching ? "explicit_scoped_researcher_fact" : "retained_without_semantic_change",
      rawObservationGrain: "generated_from_scoped_pattern",
    },
  };
}

import {
  DESIGN_SCHEMA_VERSION,
  ExperimentDesignSchema,
  StructureContractSchema,
  type DualWriteEquivalence,
  type ExperimentDesign,
  type StructureContract,
} from "@lsaa/domain";

const id = (prefix: string, key: string | number) => `${prefix}.${key}`;
const combinations = (factors: StructureContract["factors"]): Array<Record<string, string>> =>
  factors.reduce<Array<Record<string, string>>>((rows, factor) => rows.flatMap((row) => factor.levels.map((level) => ({ ...row, [factor.key]: level }))), [{}]);

function outcomeType(readout: StructureContract["readouts"][number]): ExperimentDesign["outcomes"][number]["type"] {
  if (readout.representation === "proportion_counts") return "proportion_counts";
  if (readout.representation === "category_counts") return "categorical_counts";
  if (readout.representation === "event_censoring") return "time_to_event";
  return "continuous";
}

function compatibilityDiagnostics(contract: StructureContract): string[] {
  const diagnostics: string[] = [];
  if (["mixed", "crossover"].includes(contract.matching.kind)) diagnostics.push(`legacy_analysis_does_not_support_${contract.matching.kind}`);
  if (contract.orderedAxes.length > 1) diagnostics.push("legacy_analysis_does_not_support_multiple_ordered_axes");
  if (contract.orderedAxes.some((axis) => axis.levels.length === 0)) diagnostics.push("legacy_analysis_requires_observed_axis_levels_before_projection");
  if (new Set(contract.readouts.map((readout) => readout.observationLevelKey)).size > 1) diagnostics.push("legacy_analysis_does_not_support_heterogeneous_readout_grains");
  if (contract.readouts.some((readout) => readout.representation === "event_censoring")) diagnostics.push("legacy_workspace_uses_dedicated_survival_route");
  for (const representation of ["paired_readouts", "dose_response", "other_typed_bundle"] as const) {
    if (contract.readouts.some((readout) => readout.representation === representation)) diagnostics.push(`legacy_observation_model_does_not_support_${representation}`);
  }
  return diagnostics;
}

export function projectContractToExperimentDesign(contractInput: StructureContract, plannedN: number, now = new Date().toISOString()): ExperimentDesign {
  const contract = StructureContractSchema.parse(contractInput);
  const diagnostics = compatibilityDiagnostics(contract);
  const primaryFactors = contract.factors.length ? contract.factors : [{ key: "cohort", label: "Cohort", levels: ["Observed"], unitRole: "between_unit" as const, relationship: "independent" as const, ordered: false, referenceLevel: null }];
  const conditions = combinations(primaryFactors).map((combination, index) => ({
    id: id("condition", String(index + 1)),
    label: primaryFactors.map((factor) => combination[factor.key]).join(" · "),
    factorLevels: Object.fromEntries(primaryFactors.map((factor) => [id("factor", factor.key), id(`level.${factor.key}`, factor.levels.indexOf(combination[factor.key]!) + 1)])),
  }));
  const unitLevels = contract.unitLevels.map((level) => ({
    id: id("unit-level", level.key), key: level.key, label: level.label,
    role: level.role === "experimental_unit" || level.role === "block" || level.role === "technical_replicate" ? level.role : "subsample" as const,
    parentLevelId: level.parentKey ? id("unit-level", level.parentKey) : null,
  }));
  const matchingLevel = contract.matching.identityKey
    ? contract.identities.find(({ key }) => key === contract.matching.identityKey)?.unitLevelKey ?? contract.experimentalUnitLevelKey
    : contract.experimentalUnitLevelKey;
  const blockLevel = contract.unitLevels.find(({ role }) => role === "block")?.key;
  const pairing: ExperimentDesign["pairing"] = contract.matching.kind === "matched"
    ? { kind: "matched", matchLevelId: id("unit-level", matchingLevel), completePairsRequired: contract.matching.completeSetsRequired !== false }
    : contract.matching.kind === "blocked" && blockLevel
      ? { kind: "blocked", blockLevelId: id("unit-level", blockLevel), completePairsRequired: contract.matching.completeSetsRequired !== false, explicitlyRequested: true }
      : { kind: "independent" };
  const firstReference = primaryFactors.find(({ referenceLevel }) => referenceLevel)?.referenceLevel;
  const firstReferenceCondition = firstReference ? conditions.find((condition) => condition.label.split(" · ").includes(firstReference)) : undefined;
  return ExperimentDesignSchema.parse({
    schemaVersion: DESIGN_SCHEMA_VERSION,
    id: id("design", contract.contractId), name: contract.experimentName, purpose: "custom",
    outcomes: contract.readouts.map((readout) => ({ id: id("outcome", readout.key), key: readout.key, label: readout.label, type: outcomeType(readout) })),
    factors: primaryFactors.map((factor) => ({ id: id("factor", factor.key), key: factor.key, label: factor.label, unitRole: factor.unitRole, relationship: { kind: factor.relationship === "blocked" ? "independent" : factor.relationship, unitLevelId: id("unit-level", contract.experimentalUnitLevelKey) }, levels: factor.levels.map((level, index) => ({ id: id(`level.${factor.key}`, index + 1), label: level, order: index })) })),
    observationFactors: contract.orderedAxes.filter((axis) => axis.levels.length > 0).map((axis) => ({ id: id("axis", axis.key), key: axis.key, label: axis.label, scientificRole: "time", unitRole: axis.identityRetained ? "within_unit" : "between_unit", relationship: { kind: axis.identityRetained ? "repeated" : "independent", unitLevelId: id("unit-level", contract.experimentalUnitLevelKey) }, levels: axis.levels.map((level, index) => ({ id: id(`axis-level.${axis.key}`, index + 1), label: String(level), order: index })) })),
    conditions, unitLevels, experimentalUnitLevelId: id("unit-level", contract.experimentalUnitLevelKey), pairing, plannedN,
    normalizationPlans: [],
    primaryContrast: conditions.length > 1 ? { id: "contrast.primary", label: "Primary comparison", conditionIds: [firstReferenceCondition?.id ?? conditions[0]!.id, conditions.find((item) => item.id !== (firstReferenceCondition?.id ?? conditions[0]!.id))!.id] } : null,
    wizardRuleVersion: "experiment-first-adaptive-input-alpha.1",
    wizardDecisions: [{ questionId: "adaptive.analysis.compatibility", answer: diagnostics.length ? "blocked" : "representable" }],
    adaptiveStructure: { contract, analysisCompatibility: diagnostics.length ? "blocked" : "representable", diagnostics }, createdAt: now,
  });
}

const canonicalValue = (value: unknown): unknown => Array.isArray(value)
  ? value.map(canonicalValue)
  : value && typeof value === "object"
    ? Object.fromEntries(Object.entries(value).sort(([left], [right]) => left.localeCompare(right)).map(([key, nested]) => [key, canonicalValue(nested)]))
    : value;
const stable = (value: unknown): string => JSON.stringify(canonicalValue(value));

export function assertDualWriteEquivalence(contractInput: StructureContract, designInput: ExperimentDesign, now = new Date().toISOString()): DualWriteEquivalence {
  const contract = StructureContractSchema.parse(contractInput);
  const design = ExperimentDesignSchema.parse(designInput);
  const diagnostics: string[] = [];
  if (!design.adaptiveStructure) diagnostics.push("design_missing_adaptive_structure");
  else if (JSON.stringify(design.adaptiveStructure.contract) !== JSON.stringify(contract)) diagnostics.push("embedded_contract_mismatch");
  if (design.experimentalUnitLevelId !== id("unit-level", contract.experimentalUnitLevelKey)) diagnostics.push("experimental_unit_mismatch");
  if (design.outcomes.length !== contract.readouts.length) diagnostics.push("readout_count_mismatch");
  const status = diagnostics.length ? "mismatch" : "equivalent";
  const result: DualWriteEquivalence = { status, checkedAt: now, diagnostics, contractFingerprint: stable(contract), designFingerprint: stable(design) };
  if (status === "mismatch") throw new Error(`ADAPTIVE_DUAL_WRITE_MISMATCH:${diagnostics.join(",")}`);
  return result;
}

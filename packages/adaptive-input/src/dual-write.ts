import {
  DESIGN_SCHEMA_VERSION,
  ExperimentDesignSchema,
  StructureContractSchema,
  type DualWriteEquivalence,
  type ExperimentDesign,
  type StructureContract,
} from "@lsaa/domain";

const id = (prefix: string, key: string | number) => `${prefix}.${key}`;
type OrderedAxisScientificRole = NonNullable<
  NonNullable<ExperimentDesign["observationFactors"]>[number]["scientificRole"]
>;
export type ContractProjectionHints = Readonly<{
  orderedAxisScientificRoles?: Readonly<Record<string, OrderedAxisScientificRole>>;
}>;
const combinations = (factors: StructureContract["factors"]): Array<Record<string, string>> =>
  factors.reduce<Array<Record<string, string>>>(
    (rows, factor) =>
      rows.flatMap((row) => factor.levels.map((level) => ({ ...row, [factor.key]: level }))),
    [{}],
  );

function usesMultiFactorSharedSourceMatching(contract: StructureContract): boolean {
  if (
    contract.factors.length <= 1 ||
    contract.matching.kind !== "matched" ||
    !contract.matching.identityKey
  ) {
    return false;
  }
  const matchingIdentity = contract.identities.find(
    ({ key }) => key === contract.matching.identityKey,
  );
  if (!matchingIdentity) return false;
  const levels = new Map(contract.unitLevels.map((level) => [level.key, level]));
  let cursor = levels.get(contract.experimentalUnitLevelKey);
  while (cursor?.parentKey) {
    if (cursor.parentKey === matchingIdentity.unitLevelKey) return true;
    cursor = levels.get(cursor.parentKey);
  }
  return false;
}

function outcomeType(
  readout: StructureContract["readouts"][number],
): ExperimentDesign["outcomes"][number]["type"] {
  if (readout.representation === "proportion_counts") return "proportion_counts";
  if (readout.representation === "category_counts") return "categorical_counts";
  if (readout.representation === "event_censoring") return "time_to_event";
  return "continuous";
}

function hasHeterogeneousReadoutAxes(contract: StructureContract): boolean {
  return (
    contract.readouts.length > 1 &&
    new Set(contract.readouts.map(({ axisKeys }) => [...axisKeys].sort().join("|"))).size > 1
  );
}

function compatibilityDiagnostics(contract: StructureContract): string[] {
  const diagnostics: string[] = [];
  if (
    contract.matching.kind === "blocked" ||
    contract.factors.some(({ relationship }) => relationship === "blocked")
  )
    diagnostics.push("legacy_workspace_does_not_support_blocked_matching");
  if (["mixed", "crossover"].includes(contract.matching.kind))
    diagnostics.push(`legacy_analysis_does_not_support_${contract.matching.kind}`);
  if (usesMultiFactorSharedSourceMatching(contract))
    diagnostics.push("legacy_workspace_does_not_support_multifactor_shared_source_matching");
  if (contract.orderedAxes.length > 1)
    diagnostics.push("legacy_analysis_does_not_support_multiple_ordered_axes");
  if (contract.orderedAxes.some((axis) => axis.levels.length === 0))
    diagnostics.push("legacy_analysis_requires_observed_axis_levels_before_projection");
  if (new Set(contract.readouts.map((readout) => readout.observationLevelKey)).size > 1)
    diagnostics.push("legacy_analysis_does_not_support_heterogeneous_readout_grains");
  if (hasHeterogeneousReadoutAxes(contract))
    diagnostics.push("legacy_analysis_does_not_support_heterogeneous_readout_axes");
  if (contract.readouts.some((readout) => readout.representation === "event_censoring"))
    diagnostics.push("legacy_workspace_uses_dedicated_survival_route");
  for (const representation of [
    "paired_readouts",
    "dose_response",
    "other_typed_bundle",
  ] as const) {
    if (contract.readouts.some((readout) => readout.representation === representation))
      diagnostics.push(`legacy_observation_model_does_not_support_${representation}`);
  }
  return diagnostics;
}

/**
 * Semantic structures which the versioned contract can retain but the current
 * ExperimentDesign fields cannot reproduce without consulting the embedded
 * contract. They must never be described as an equivalent legacy projection.
 */
function projectionLossDiagnostics(contract: StructureContract): string[] {
  const diagnostics: string[] = [];
  if (["mixed", "crossover"].includes(contract.matching.kind))
    diagnostics.push(`design_projection_does_not_support_${contract.matching.kind}`);
  if (usesMultiFactorSharedSourceMatching(contract))
    diagnostics.push("design_projection_does_not_support_multifactor_shared_source_matching");
  if (contract.orderedAxes.length > 1)
    diagnostics.push("design_projection_does_not_support_multiple_ordered_axes");
  if (new Set(contract.readouts.map(({ observationLevelKey }) => observationLevelKey)).size > 1)
    diagnostics.push("design_projection_does_not_bind_heterogeneous_readout_grains");
  if (hasHeterogeneousReadoutAxes(contract))
    diagnostics.push("design_projection_does_not_bind_heterogeneous_readout_axes");
  for (const representation of [
    "paired_readouts",
    "dose_response",
    "other_typed_bundle",
  ] as const) {
    if (contract.readouts.some((readout) => readout.representation === representation))
      diagnostics.push(`design_projection_does_not_support_${representation}`);
  }
  return diagnostics;
}

export function projectContractToExperimentDesign(
  contractInput: StructureContract,
  plannedN: number,
  now = new Date().toISOString(),
  hints: ContractProjectionHints = {},
): ExperimentDesign {
  const contract = StructureContractSchema.parse(contractInput);
  const diagnostics = compatibilityDiagnostics(contract);
  const primaryFactors = contract.factors.length
    ? contract.factors
    : [
        {
          key: "cohort",
          label: "Cohort",
          levels: ["Observed"],
          unitRole: "between_unit" as const,
          relationship: "independent" as const,
          ordered: false,
          referenceLevel: null,
        },
      ];
  const conditions = combinations(primaryFactors).map((combination, index) => ({
    id: id("condition", String(index + 1)),
    label: primaryFactors.map((factor) => combination[factor.key]).join(" · "),
    factorLevels: Object.fromEntries(
      primaryFactors.map((factor) => [
        id("factor", factor.key),
        id(`level.${factor.key}`, factor.levels.indexOf(combination[factor.key]!) + 1),
      ]),
    ),
  }));
  const unitLevels = contract.unitLevels.map((level) => ({
    id: id("unit-level", level.key),
    key: level.key,
    label: level.label,
    role:
      level.role === "experimental_unit" ||
      level.role === "block" ||
      level.role === "technical_replicate"
        ? level.role
        : ("subsample" as const),
    parentLevelId: level.parentKey ? id("unit-level", level.parentKey) : null,
  }));
  const matchingLevel = contract.matching.identityKey
    ? (contract.identities.find(({ key }) => key === contract.matching.identityKey)?.unitLevelKey ??
      contract.experimentalUnitLevelKey)
    : contract.experimentalUnitLevelKey;
  const blockLevel = contract.unitLevels.find(({ role }) => role === "block")?.key;
  const pairing: ExperimentDesign["pairing"] =
    contract.matching.kind === "matched"
      ? {
          kind: "matched",
          matchLevelId: id("unit-level", matchingLevel),
          completePairsRequired: contract.matching.completeSetsRequired !== false,
        }
      : contract.matching.kind === "blocked" && blockLevel
        ? {
            kind: "blocked",
            blockLevelId: id("unit-level", blockLevel),
            completePairsRequired: contract.matching.completeSetsRequired !== false,
            explicitlyRequested: true,
          }
        : { kind: "independent" };
  return ExperimentDesignSchema.parse({
    schemaVersion: DESIGN_SCHEMA_VERSION,
    id: id("design", contract.contractId),
    name: contract.experimentName,
    purpose: "custom",
    outcomes: contract.readouts.map((readout) => ({
      id: id("outcome", readout.key),
      key: readout.key,
      label: readout.label,
      type: outcomeType(readout),
    })),
    factors: primaryFactors.map((factor) => ({
      id: id("factor", factor.key),
      key: factor.key,
      label: factor.label,
      unitRole: factor.unitRole,
      relationship: {
        kind: factor.relationship === "blocked" ? "independent" : factor.relationship,
        unitLevelId: id("unit-level", contract.experimentalUnitLevelKey),
      },
      levels: factor.levels.map((level, index) => ({
        id: id(`level.${factor.key}`, index + 1),
        label: level,
        order: index,
      })),
    })),
    observationFactors: contract.orderedAxes
      .filter((axis) => axis.levels.length > 0)
      .map((axis) => ({
        id: id("axis", axis.key),
        key: axis.key,
        label: axis.label,
        // StructureContract 0.1.0 stores an ordered axis but not its scientific
        // role. Never silently call a concentration, distance, or temperature
        // axis "time"; callers with an explicit researcher fact may supply it.
        scientificRole: hints.orderedAxisScientificRoles?.[axis.key] ?? "other",
        unitRole: axis.identityRetained ? "within_unit" : "between_unit",
        relationship: {
          kind: axis.identityRetained ? "repeated" : "independent",
          unitLevelId: id("unit-level", contract.experimentalUnitLevelKey),
        },
        levels: axis.levels.map((level, index) => ({
          id: id(`axis-level.${axis.key}`, index + 1),
          label: String(level),
          order: index,
        })),
      })),
    conditions,
    unitLevels,
    experimentalUnitLevelId: id("unit-level", contract.experimentalUnitLevelKey),
    pairing,
    plannedN,
    normalizationPlans: [],
    // Entry establishes the experiment structure, not the researcher's inferential intent.
    // A reference/control candidate remains on the factor and condition projection, while
    // an actual contrast must be selected later in the Statistics workflow.
    primaryContrast: null,
    wizardRuleVersion: "experiment-first-adaptive-input-alpha.1",
    wizardDecisions: [
      {
        questionId: "adaptive.analysis.compatibility",
        answer: diagnostics.length ? "blocked" : "representable",
      },
    ],
    adaptiveStructure: {
      contract,
      analysisCompatibility: diagnostics.length ? "blocked" : "representable",
      diagnostics,
    },
    createdAt: now,
  });
}

const canonicalValue = (value: unknown): unknown =>
  Array.isArray(value)
    ? value.map(canonicalValue)
    : value && typeof value === "object"
      ? Object.fromEntries(
          Object.entries(value)
            .sort(([left], [right]) => left.localeCompare(right))
            .map(([key, nested]) => [key, canonicalValue(nested)]),
        )
      : value;
const stable = (value: unknown): string => JSON.stringify(canonicalValue(value));

function projectionMismatchDiagnostics(
  contract: StructureContract,
  design: ExperimentDesign,
  hints: ContractProjectionHints,
): string[] {
  const expected = projectContractToExperimentDesign(
    contract,
    design.plannedN,
    design.createdAt,
    hints,
  );
  const diagnostics: string[] = [];
  const compare = (code: string, actual: unknown, projected: unknown) => {
    if (stable(actual) !== stable(projected)) diagnostics.push(code);
  };
  compare(
    "design_identity_mismatch",
    { id: design.id, name: design.name, purpose: design.purpose },
    { id: expected.id, name: expected.name, purpose: expected.purpose },
  );
  compare("outcome_projection_mismatch", design.outcomes, expected.outcomes);
  compare("factor_projection_mismatch", design.factors, expected.factors);
  compare(
    "ordered_axis_projection_mismatch",
    design.observationFactors ?? [],
    expected.observationFactors ?? [],
  );
  compare("condition_projection_mismatch", design.conditions, expected.conditions);
  compare("unit_hierarchy_projection_mismatch", design.unitLevels, expected.unitLevels);
  compare(
    "experimental_unit_mismatch",
    design.experimentalUnitLevelId,
    expected.experimentalUnitLevelId,
  );
  compare("pairing_projection_mismatch", design.pairing, expected.pairing);
  compare(
    "normalization_projection_mismatch",
    design.normalizationPlans,
    expected.normalizationPlans,
  );
  compare("primary_contrast_projection_mismatch", design.primaryContrast, expected.primaryContrast);
  compare("adaptive_compatibility_mismatch", design.adaptiveStructure, expected.adaptiveStructure);
  return diagnostics;
}

export function assertDualWriteEquivalence(
  contractInput: StructureContract,
  designInput: ExperimentDesign,
  now = new Date().toISOString(),
  hints: ContractProjectionHints = {},
): DualWriteEquivalence {
  const contract = StructureContractSchema.parse(contractInput);
  const design = ExperimentDesignSchema.parse(designInput);
  const diagnostics: string[] = [];
  if (!design.adaptiveStructure) diagnostics.push("design_missing_adaptive_structure");
  else if (stable(design.adaptiveStructure.contract) !== stable(contract))
    diagnostics.push("embedded_contract_mismatch");
  diagnostics.push(...projectionMismatchDiagnostics(contract, design, hints));
  if (diagnostics.length)
    throw new Error(`ADAPTIVE_DUAL_WRITE_MISMATCH:${[...new Set(diagnostics)].join(",")}`);

  const projectionDiagnostics = projectionLossDiagnostics(contract);
  const status = projectionDiagnostics.length ? "not_representable" : "equivalent";
  const result: DualWriteEquivalence = {
    status,
    checkedAt: now,
    diagnostics: projectionDiagnostics,
    contractFingerprint: stable(contract),
    designFingerprint: stable(design),
  };
  return result;
}

import {
  STRUCTURE_CONTRACT_VERSION,
  validateStructureContract,
  type ReadoutRepresentation,
  type StructureContract,
} from "./contract.ts";
import type { GoldCase } from "./gold-types.ts";

const keyOf = (value: string): string =>
  value
    .normalize("NFKD")
    .replace(/[^A-Za-z0-9]+/g, "_")
    .replace(/^_+|_+$/g, "")
    .toLowerCase() || "field";

function relationshipKind(value: string): StructureContract["matching"]["kind"] {
  if (value.includes("crossover")) return "crossover";
  if (value.includes("mixed")) return "mixed";
  if (value.includes("blocked") || value.includes("block")) return "blocked";
  if (value.includes("matched") || value.includes("same-unit") || value.includes("paired")) return "matched";
  if (value === "none") return "none";
  return "independent";
}

function representation(valueType: string): ReadoutRepresentation {
  if (valueType.includes("western_blot") || valueType.includes("target_reference")) return "target_reference";
  if (valueType.includes("paired_measurements")) return "paired_readouts";
  if (valueType.includes("time_to_event")) return "event_censoring";
  if (valueType.includes("proportion")) return "proportion_counts";
  if (valueType.includes("categorical")) return "category_counts";
  if (valueType.includes("dose_response")) return "dose_response";
  return "scalar";
}

function componentsFor(kind: ReadoutRepresentation): string[] {
  if (kind === "target_reference") return ["target", "reference"];
  if (kind === "paired_readouts") return ["x", "y"];
  if (kind === "event_censoring") return ["follow_up", "event_observed"];
  if (kind === "proportion_counts") return ["numerator", "denominator"];
  if (kind === "category_counts") return ["category", "count"];
  if (kind === "dose_response") return ["dose", "response"];
  return ["value"];
}

function explicitReferenceLevel(levels: string[]): string | null {
  const reference = /^(vehicle|control|untreated|unstimulated|mock|wild.?type|wt|baseline|normal|standard|0)$/i;
  return levels.find((level) => reference.test(level.trim())) ?? null;
}

function normalizeRole(role: string): StructureContract["unitLevels"][number]["role"] {
  if (role === "experimental_unit") return "experimental_unit";
  if (role.includes("technical")) return "technical_replicate";
  if (role.includes("sampling_location")) return "sampling_location";
  if (role.includes("condition_specific")) return "condition_specific_sample";
  if (role === "block") return "block";
  if (role === "sample") return "sample";
  return "subsample";
}

export function compileGoldCase(gold: GoldCase): StructureContract {
  const rawLevels = [
    ...gold.nested_structure.map((level) => ({
      key: keyOf(level.level),
      label: level.level,
      role: normalizeRole(level.role),
      parentKey: level.parent ? keyOf(level.parent) : null,
    })),
  ];
  const declaredExperimental = rawLevels.find((level) => level.role === "experimental_unit");
  const experimentalKey = declaredExperimental?.key ?? keyOf(gold.true_experimental_unit);

  const knownKeys = new Set(rawLevels.map((level) => level.key));
  if (!knownKeys.has(experimentalKey)) {
    rawLevels.push({ key: experimentalKey, label: gold.true_experimental_unit, role: "experimental_unit", parentKey: null });
  } else {
    const level = rawLevels.find((item) => item.key === experimentalKey)!;
    level.role = "experimental_unit";
  }

  // Ensure referenced parents exist without inventing biological n.
  for (const level of [...rawLevels]) {
    if (level.parentKey && !rawLevels.some((candidate) => candidate.key === level.parentKey)) {
      rawLevels.push({ key: level.parentKey, label: level.parentKey, role: "block", parentKey: null });
    }
  }

  const identityLevels = gold.identities.map((identity, index) => {
    const direct = rawLevels.find((level) => identity.toLowerCase().includes(level.key.replaceAll("_", "")) || level.key.includes(keyOf(identity).replace(/id$/, "")));
    if (direct) return direct.key;
    if (index === 0) return experimentalKey;
    const child = rawLevels.filter((level) => level.role !== "block" && level.key !== experimentalKey)[index - 1];
    return child?.key ?? experimentalKey;
  });

  const matchKind = relationshipKind(gold.condition_relationship);
  const matchIdentity = matchKind === "independent" || matchKind === "none" ? null : gold.identities[0];
  const completeSets = gold.condition_relationship.includes("incomplete") ? false : matchKind === "matched" || matchKind === "crossover" ? true : null;

  const goldMeasurements = gold.expected_internal_design.measurements.length
    ? gold.expected_internal_design.measurements
    : [{ name: "measurement", value_type: "continuous" }];
  const contract: StructureContract = {
    schemaVersion: STRUCTURE_CONTRACT_VERSION,
    caseId: gold.case_id,
    experimentDescription: gold.experiment_description,
    unitLevels: rawLevels,
    experimentalUnitLevelKey: experimentalKey,
    identities: gold.identities.map((identity, index) => ({
      key: keyOf(identity),
      label: identity,
      unitLevelKey: identityLevels[index]!,
      required: true,
    })),
    factors: gold.factors_conditions.map((factor) => ({
      key: keyOf(factor.name),
      label: factor.name,
      levels: factor.levels,
      unitRole: factor.unit_role,
      relationship: factor.unit_role === "within_unit" ? "repeated" : matchKind === "blocked" ? "blocked" : "independent",
      ordered: gold.ordered_axes.some((axis) => axis.name === factor.name),
      referenceLevel: explicitReferenceLevel(factor.levels),
    })),
    matching: { kind: matchKind, identityKey: matchIdentity ? keyOf(matchIdentity) : null, completeSetsRequired: completeSets },
    orderedAxes: gold.ordered_axes.map((axis) => ({
      key: keyOf(axis.name),
      label: axis.name,
      unit: axis.unit,
      levels: axis.levels,
      sampling: axis.name.toLowerCase().includes("follow") ? "event_follow_up" : axis.identity_retained ? "repeated_same_identity" : "cross_sectional",
      identityRetained: axis.identity_retained,
    })),
    readouts: goldMeasurements.map((measurement) => {
      const readoutKind = representation(measurement.value_type);
      const observationLabel = measurement.observation_level;
      const observationLevelKey = observationLabel
        ? rawLevels.find((level) => level.label === observationLabel || level.key === keyOf(observationLabel))?.key ?? experimentalKey
        : experimentalKey;
      const requestedAxes = measurement.axis_names?.map(keyOf) ?? gold.ordered_axes.map((axis) => keyOf(axis.name));
      return {
        key: keyOf(measurement.name),
        label: measurement.name,
        valueType: measurement.value_type,
        representation: readoutKind,
        componentKeys: componentsFor(readoutKind),
        referenceRole: readoutKind === "target_reference" ? "loading_control" : "none",
        observationLevelKey,
        axisKeys: requestedAxes,
      };
    }),
    allowedMissingness: ["not_applicable", "not_collected", "assay_failed", "dropout", "censored", "unknown"],
    rawObservationGrain: gold.natural_input_surface.row_semantics,
  };
  return validateStructureContract(contract);
}

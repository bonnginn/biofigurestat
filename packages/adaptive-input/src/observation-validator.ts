import type { CanonicalAdaptiveObservation, StructureContract } from "@lsaa/domain";

import { canonicalReadoutValueCandidates } from "./observation-values";

const coordinateValue = (value: string | number): string => String(value).normalize("NFKC").trim();

const conditionCombinations = (
  contract: StructureContract,
): readonly Readonly<Record<string, string>>[] =>
  contract.factors.reduce<Readonly<Record<string, string>>[]>(
    (rows, factor) =>
      rows.flatMap((row) => factor.levels.map((level) => ({ ...row, [factor.key]: level }))),
    [{}],
  );

const applicableLevelKeys = (
  contract: StructureContract,
  observationLevelKey: string,
): readonly string[] => {
  const levels = new Map(contract.unitLevels.map((level) => [level.key, level]));
  const keys: string[] = [];
  const visited = new Set<string>();
  let cursor = levels.get(observationLevelKey);
  while (cursor && !visited.has(cursor.key)) {
    keys.push(cursor.key);
    visited.add(cursor.key);
    cursor = cursor.parentKey ? levels.get(cursor.parentKey) : undefined;
  }
  return keys;
};

const semanticCoordinate = (
  contract: StructureContract,
  observation: CanonicalAdaptiveObservation,
  readout: StructureContract["readouts"][number],
  applicableLevels: readonly string[],
): string => {
  const applicableLevelSet = new Set(applicableLevels);
  const value = (candidate: string | number | undefined): string | null =>
    candidate === undefined ? null : coordinateValue(candidate);

  // JSON-encoding namespaced tuples avoids delimiter collisions in researcher
  // supplied IDs while retaining a deterministic, contract-ordered key.
  return JSON.stringify([
    ["readout", readout.key],
    ...contract.identities
      .filter(({ unitLevelKey }) => applicableLevelSet.has(unitLevelKey))
      .map(({ key }) => ["identity", key, value(observation.identities[key])]),
    ...applicableLevels.map((key) => ["hierarchy", key, value(observation.hierarchy[key])]),
    ...contract.factors.map(({ key }) => ["factor", key, value(observation.factors[key])]),
    ...readout.axisKeys.map((key) => ["axis", key, value(observation.axes[key])]),
  ]);
};

const hasOwn = (record: Readonly<Record<string, unknown>>, key: string): boolean =>
  Object.prototype.hasOwnProperty.call(record, key);

const validateReadoutValueAddresses = (
  prefix: string,
  observation: CanonicalAdaptiveObservation,
  readout: StructureContract["readouts"][number],
): readonly string[] => {
  const diagnostics: string[] = [];
  const components =
    readout.representation === "scalar"
      ? [readout.componentKeys[0] ?? "value"]
      : readout.componentKeys;

  components.forEach((component) => {
    const aliases = canonicalReadoutValueCandidates(readout, component);
    // A missing row may carry a null value, a missingness reason, or both under
    // one canonical address. Count aliases across both maps so a value under
    // one alias and missingness under another cannot be mistaken for one fact.
    const presentAliases = aliases.filter(
      (alias) => hasOwn(observation.values, alias) || hasOwn(observation.missingness, alias),
    );
    if (presentAliases.length > 1) {
      diagnostics.push(
        `${prefix}:ambiguous_readout_component_alias:${readout.key}:${component}:${presentAliases.join(",")}`,
      );
    } else if (presentAliases.length === 0) {
      diagnostics.push(`${prefix}:missing_readout_component:${readout.key}:${component}`);
    }
  });

  return diagnostics;
};

/**
 * Cross-validates canonical rows against their StructureContract. The domain
 * row schema intentionally remains reusable, so contract-dependent coordinate
 * checks live at this boundary instead of being inferred by a table or graph.
 */
export function validateCanonicalObservationsForContract(
  contract: StructureContract,
  observations: readonly CanonicalAdaptiveObservation[],
): readonly string[] {
  const diagnostics: string[] = [];
  const readouts = new Map(contract.readouts.map((readout) => [readout.key, readout]));
  const factorKeys = new Set(contract.factors.map(({ key }) => key));
  const axes = new Map(contract.orderedAxes.map((axis) => [axis.key, axis]));
  const levels = new Map(contract.unitLevels.map((level) => [level.key, level]));
  const identities = new Map(contract.identities.map((identity) => [identity.key, identity]));
  const combinations = conditionCombinations(contract);
  const seenSemanticCoordinates = new Map<string, string>();

  observations.forEach((observation) => {
    const prefix = `adaptive_observation:${observation.observationId}`;
    const readout = readouts.get(observation.readoutKey);
    if (!readout) {
      diagnostics.push(`${prefix}:unknown_readout:${observation.readoutKey}`);
    }

    Object.entries(observation.identities).forEach(([key, value]) => {
      if (!identities.has(key)) diagnostics.push(`${prefix}:unknown_identity:${key}`);
      if (!value.trim()) diagnostics.push(`${prefix}:empty_identity:${key}`);
    });
    Object.entries(observation.hierarchy).forEach(([key, value]) => {
      if (!levels.has(key)) diagnostics.push(`${prefix}:unknown_hierarchy:${key}`);
      if (!value.trim()) diagnostics.push(`${prefix}:empty_hierarchy:${key}`);
    });
    if (readout) {
      diagnostics.push(...validateReadoutValueAddresses(prefix, observation, readout));
      const applicableLevels = new Set(applicableLevelKeys(contract, readout.observationLevelKey));
      contract.identities
        .filter(({ required, unitLevelKey }) => required && applicableLevels.has(unitLevelKey))
        .forEach(({ key }) => {
          if (!observation.identities[key]?.trim()) {
            diagnostics.push(`${prefix}:missing_required_identity:${key}`);
          }
        });
      applicableLevels.forEach((levelKey) => {
        const hasLevelIdentity = contract.identities
          .filter(({ unitLevelKey }) => unitLevelKey === levelKey)
          .some(({ key }) => Boolean(observation.identities[key]?.trim()));
        if (!hasLevelIdentity && !observation.hierarchy[levelKey]?.trim()) {
          diagnostics.push(`${prefix}:missing_unit_level_identity:${levelKey}`);
        }
      });
    }

    Object.keys(observation.factors).forEach((key) => {
      if (!factorKeys.has(key)) diagnostics.push(`${prefix}:unknown_factor:${key}`);
    });
    contract.factors.forEach((factor) => {
      const value = observation.factors[factor.key];
      if (value === undefined || !value.trim()) {
        diagnostics.push(`${prefix}:missing_factor:${factor.key}`);
      } else if (!factor.levels.includes(value)) {
        diagnostics.push(`${prefix}:unknown_factor_level:${factor.key}:${value}`);
      }
    });

    Object.keys(observation.axes).forEach((key) => {
      if (!axes.has(key)) diagnostics.push(`${prefix}:unknown_axis:${key}`);
      else if (readout && !readout.axisKeys.includes(key))
        diagnostics.push(`${prefix}:unbound_axis:${key}`);
    });
    readout?.axisKeys.forEach((axisKey) => {
      const value = observation.axes[axisKey];
      const axis = axes.get(axisKey);
      // Event follow-up is carried by the typed follow_up/event_observed
      // components. It is not a second coordinate column on the same record.
      if (axis?.sampling === "event_follow_up") return;
      if (value === undefined || coordinateValue(value) === "") {
        diagnostics.push(`${prefix}:missing_axis:${axisKey}`);
      } else if (
        !axis ||
        !axis.levels.some((level) => coordinateValue(level) === coordinateValue(value))
      ) {
        diagnostics.push(`${prefix}:unknown_axis_level:${axisKey}:${String(value)}`);
      }
    });

    const projectionCount = combinations.filter((combination) =>
      contract.factors.every(
        (factor) => observation.factors[factor.key] === combination[factor.key],
      ),
    ).length;
    if (projectionCount !== 1) {
      diagnostics.push(`${prefix}:condition_projection_count:${projectionCount}`);
    }

    if (readout) {
      const coordinate = semanticCoordinate(
        contract,
        observation,
        readout,
        applicableLevelKeys(contract, readout.observationLevelKey),
      );
      const firstObservationId = seenSemanticCoordinates.get(coordinate);
      if (firstObservationId) {
        diagnostics.push(`${prefix}:duplicate_semantic_coordinate:${firstObservationId}`);
      } else {
        seenSemanticCoordinates.set(coordinate, observation.observationId);
      }
    }
  });

  return diagnostics;
}

export function assertCanonicalObservationsForContract(
  contract: StructureContract,
  observations: readonly CanonicalAdaptiveObservation[],
): void {
  const diagnostics = validateCanonicalObservationsForContract(contract, observations);
  if (diagnostics.length) throw new Error(diagnostics.join(" / "));
}

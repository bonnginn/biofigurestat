import type { CanonicalAdaptiveObservation, StructureContract } from "@lsaa/domain";

const coordinateValue = (value: string | number): string =>
  String(value).normalize("NFKC").trim();

const conditionCombinations = (
  contract: StructureContract,
): readonly Readonly<Record<string, string>>[] =>
  contract.factors.reduce<Readonly<Record<string, string>>[]>(
    (rows, factor) =>
      rows.flatMap((row) =>
        factor.levels.map((level) => ({ ...row, [factor.key]: level })),
      ),
    [{}],
  );

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
  const combinations = conditionCombinations(contract);

  observations.forEach((observation) => {
    const prefix = `adaptive_observation:${observation.observationId}`;
    const readout = readouts.get(observation.readoutKey);
    if (!readout) {
      diagnostics.push(`${prefix}:unknown_readout:${observation.readoutKey}`);
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

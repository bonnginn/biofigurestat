import type { Observation } from "./data";

export type LinkedReadoutValue = Readonly<{
  biologicalUnitId: string;
  conditionId: string;
  readoutId: string;
  observationId: string;
  measurement: Observation["measurement"];
}>;

/** Keeps readouts joined by stable biological-unit identity without treating readouts as replicates. */
export function createLinkedReadoutDataset(
  observations: readonly Observation[],
): LinkedReadoutValue[] {
  const seen = new Set<string>();
  return observations.map((observation) => {
    const key = `${observation.unitInstanceId}\u0000${observation.conditionId}\u0000${observation.outcomeId}`;
    if (seen.has(key))
      throw new Error(
        "A linked readout requires at most one canonical value per unit, condition, and readout",
      );
    seen.add(key);
    return {
      biologicalUnitId: observation.unitInstanceId,
      conditionId: observation.conditionId,
      readoutId: observation.outcomeId,
      observationId: observation.id,
      measurement: observation.measurement,
    };
  });
}

export type CompositionPercentage = Readonly<{
  biologicalUnitId: string;
  conditionId: string;
  readoutId: string;
  categoryId: string;
  count: number;
  denominator: number;
  percentage: number;
  sourceObservationId: string;
}>;

/** Derives graph percentages while preserving raw category counts and the shared denominator. */
export function deriveCompositionPercentages(
  rows: readonly LinkedReadoutValue[],
): CompositionPercentage[] {
  return rows.flatMap((row) => {
    if (row.measurement.kind !== "categorical_counts") return [];
    const denominator = Object.values(row.measurement.counts).reduce(
      (sum, count) => sum + count,
      0,
    );
    if (denominator <= 0) throw new Error(`Composition ${row.observationId} has no observed total`);
    return Object.entries(row.measurement.counts).map(([categoryId, count]) => ({
      biologicalUnitId: row.biologicalUnitId,
      conditionId: row.conditionId,
      readoutId: row.readoutId,
      categoryId,
      count,
      denominator,
      percentage: (count / denominator) * 100,
      sourceObservationId: row.observationId,
    }));
  });
}

/** Core deliberately refuses ordinary univariate tests for dependent composition parts. */
export function requireSupportedMultiReadoutInference(rows: readonly LinkedReadoutValue[]): void {
  if (rows.some(({ measurement }) => measurement.kind === "categorical_counts")) {
    throw new Error(
      "Inferential compositional analysis is not implemented; use linked composition graphs without flattening categories into independent observations",
    );
  }
}

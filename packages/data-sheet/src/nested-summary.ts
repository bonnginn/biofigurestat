import {
  DerivedDatasetRevisionSchema,
  DerivedScalarValueSchema,
  TransformationSpecSchema,
  type DerivedDatasetRevision,
  type DerivedScalarValue,
  type Observation,
  type UnitInstance,
} from "@lsaa/domain";

export type ReplicateSummaryMethod = "mean" | "median";

export type ReplicateSummary = Readonly<{
  experimentalUnitId: string;
  conditionId: string;
  outcomeId: string;
  value: number;
  sourceObservationIds: string[];
  sourceUnitIds: string[];
  subsampleCount: number;
}>;

export type ReplicateSummaryResult = Readonly<{
  transformation: ReturnType<typeof TransformationSpecSchema.parse>;
  summaries: ReplicateSummary[];
}>;

function center(values: number[], method: ReplicateSummaryMethod): number {
  const ordered = [...values].sort((first, second) => first - second);
  if (method === "mean") return ordered.reduce((sum, value) => sum + value, 0) / ordered.length;
  const middle = Math.floor(ordered.length / 2);
  return ordered.length % 2 === 0 ? (ordered[middle - 1] + ordered[middle]) / 2 : ordered[middle];
}

function experimentalAncestor(
  unit: UnitInstance,
  unitById: ReadonlyMap<string, UnitInstance>,
  experimentalUnitLevelId: string,
): UnitInstance {
  const visited = new Set<string>();
  let current: UnitInstance | undefined = unit;
  while (current) {
    if (visited.has(current.id))
      throw new Error(`Unit hierarchy contains a cycle at ${current.id}`);
    visited.add(current.id);
    if (current.levelId === experimentalUnitLevelId) return current;
    current = current.parentUnitId ? unitById.get(current.parentUnitId) : undefined;
  }
  throw new Error(`Unit ${unit.id} has no ancestor at the declared experimental-unit level`);
}

/**
 * Produces one scalar summary per declared biological unit while retaining
 * explicit source-observation lineage. It never rewrites or pools the raw rows.
 */
export function summarizeNestedScalarObservations(input: {
  transformationId: string;
  rawRevisionId: string;
  outcomeId: string;
  experimentalUnitLevelId: string;
  method: ReplicateSummaryMethod;
  observations: ReadonlyArray<Observation>;
  unitInstances: ReadonlyArray<UnitInstance>;
}): ReplicateSummaryResult {
  const unitById = new Map(input.unitInstances.map((unit) => [unit.id, unit]));
  if (unitById.size !== input.unitInstances.length) {
    throw new Error("Unit IDs must be unique before replicate summarization");
  }
  const selected = input.observations.filter(
    (observation) =>
      observation.rawRevisionId === input.rawRevisionId &&
      observation.outcomeId === input.outcomeId,
  );
  if (selected.length === 0)
    throw new Error("No nested observations match the requested raw revision and outcome");

  const grouped = new Map<
    string,
    {
      experimentalUnitId: string;
      conditionId: string;
      values: number[];
      observationIds: string[];
      sourceUnitIds: string[];
    }
  >();
  selected.forEach((observation) => {
    if (observation.measurement.kind !== "scalar") {
      throw new Error("The first D10 replicate summary supports scalar observations only");
    }
    const unit = unitById.get(observation.unitInstanceId);
    if (!unit) throw new Error(`Observation ${observation.id} references an unknown unit`);
    const biologicalUnit = experimentalAncestor(unit, unitById, input.experimentalUnitLevelId);
    const key = `${biologicalUnit.id}\u0000${observation.conditionId}`;
    const group = grouped.get(key) ?? {
      experimentalUnitId: biologicalUnit.id,
      conditionId: observation.conditionId,
      values: [],
      observationIds: [],
      sourceUnitIds: [],
    };
    group.values.push(observation.measurement.value);
    group.observationIds.push(observation.id);
    group.sourceUnitIds.push(observation.unitInstanceId);
    grouped.set(key, group);
  });

  const summaries = [...grouped.values()]
    .sort((first, second) =>
      `${first.conditionId}\u0000${first.experimentalUnitId}`.localeCompare(
        `${second.conditionId}\u0000${second.experimentalUnitId}`,
      ),
    )
    .map((group) => {
      const orderedSources = group.observationIds
        .map((observationId, index) => ({
          observationId,
          unitId: group.sourceUnitIds[index],
        }))
        .sort((first, second) => first.observationId.localeCompare(second.observationId));
      return {
        experimentalUnitId: group.experimentalUnitId,
        conditionId: group.conditionId,
        outcomeId: input.outcomeId,
        value: center(group.values, input.method),
        sourceObservationIds: orderedSources.map((source) => source.observationId),
        sourceUnitIds: orderedSources.map((source) => source.unitId),
        subsampleCount: group.values.length,
      };
    });

  return {
    transformation: TransformationSpecSchema.parse({
      id: input.transformationId,
      version: "0.2.0",
      method: "replicate_summary",
      inputRevisionIds: [input.rawRevisionId],
      parameters: {
        center: input.method,
        outcomeId: input.outcomeId,
        experimentalUnitLevelId: input.experimentalUnitLevelId,
        weighting: "equal_observations_within_experimental_unit",
        sourceObservationIdsBySummary: Object.fromEntries(
          summaries.map((summary) => [
            `${summary.experimentalUnitId}\u0000${summary.conditionId}`,
            summary.sourceObservationIds,
          ]),
        ),
      },
    }),
    summaries,
  };
}

/** Materializes the immutable D10 summary dataset used by an analysis run. */
export function createNestedScalarDerivedDataset(input: {
  derivedDatasetRevisionId: string;
  previousRevisionId?: string | null;
  rawRevisionId: string;
  outcomeId: string;
  experimentalUnitLevelId: string;
  method: ReplicateSummaryMethod;
  observations: ReadonlyArray<Observation>;
  unitInstances: ReadonlyArray<UnitInstance>;
  createdAt: string;
  createdBy: string;
}): {
  transformation: ReturnType<typeof TransformationSpecSchema.parse>;
  revision: DerivedDatasetRevision;
  values: DerivedScalarValue[];
} {
  const transformationId = `transformation.${input.derivedDatasetRevisionId}`;
  const summarized = summarizeNestedScalarObservations({
    transformationId,
    rawRevisionId: input.rawRevisionId,
    outcomeId: input.outcomeId,
    experimentalUnitLevelId: input.experimentalUnitLevelId,
    method: input.method,
    observations: input.observations,
    unitInstances: input.unitInstances,
  });
  const revision = DerivedDatasetRevisionSchema.parse({
    id: input.derivedDatasetRevisionId,
    previousRevisionId: input.previousRevisionId ?? null,
    sourceRawRevisionId: input.rawRevisionId,
    sourceQcRevisionId: null,
    outcomeId: input.outcomeId,
    transformationId,
    createdAt: input.createdAt,
    createdBy: input.createdBy,
    state: "current",
    staleReason: null,
  });
  const values = summarized.summaries.map((summary, index) =>
    DerivedScalarValueSchema.parse({
      id: `derived-value.${input.derivedDatasetRevisionId}.${index + 1}`,
      derivedDatasetRevisionId: revision.id,
      experimentalUnitId: summary.experimentalUnitId,
      conditionId: summary.conditionId,
      outcomeId: summary.outcomeId,
      value: summary.value,
      sourceObservationIds: summary.sourceObservationIds,
      sourceUnitIds: summary.sourceUnitIds,
      subsampleCount: summary.subsampleCount,
    }),
  );
  return { transformation: summarized.transformation, revision, values };
}

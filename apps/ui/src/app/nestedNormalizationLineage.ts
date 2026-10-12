import type {
  DerivedDatasetRevision,
  DerivedScalarValue,
  Observation,
  TransformationSpec,
  UnitInstance,
} from "@lsaa/domain";

export type NestedNormalizationLineageInput = Readonly<{
  sourceDatasetId: string;
  rawRevisionId: string;
  outcomeId: string;
  experimentalUnitLevelId: string;
  derivedDatasetRevisions: readonly DerivedDatasetRevision[];
  transformations: readonly TransformationSpec[];
  derivedValues: readonly DerivedScalarValue[];
  observations: readonly Observation[];
  unitInstances: readonly UnitInstance[];
}>;

export type NestedNormalizationSourceValue = Readonly<{
  observationId: string;
  experimentalUnitId: string;
  conditionId: string;
  value: number;
}>;

export type ResolvedNestedNormalizationLineage = Readonly<{
  sourceRevision: DerivedDatasetRevision;
  sourceTransformation: TransformationSpec;
  resolveValue: (observation: NestedNormalizationSourceValue) => DerivedScalarValue;
}>;

function uniqueById<T extends { id: string }>(items: readonly T[], kind: string): Map<string, T> {
  const indexed = new Map(items.map((item) => [item.id, item]));
  if (indexed.size !== items.length) throw new Error(`Nested normalization has duplicate ${kind} IDs`);
  return indexed;
}

function experimentalAncestorId(
  unitId: string,
  units: ReadonlyMap<string, UnitInstance>,
  experimentalUnitLevelId: string,
): string {
  const visited = new Set<string>();
  let currentId: string | null = unitId;
  let experimentalUnitId: string | undefined;
  while (currentId !== null) {
    if (visited.has(currentId)) throw new Error("Nested normalization unit hierarchy contains a cycle");
    visited.add(currentId);
    const current = units.get(currentId);
    if (!current) throw new Error("Nested normalization references an unknown unit or parent");
    if (current.levelId === experimentalUnitLevelId && experimentalUnitId === undefined) {
      experimentalUnitId = current.id;
    }
    currentId = current.parentUnitId;
  }
  if (experimentalUnitId === undefined) {
    throw new Error("Nested normalization source unit has no declared experimental-unit ancestor");
  }
  return experimentalUnitId;
}

/**
 * Resolves a nested mean back to its immutable raw sources before normalization.
 * Derived revision/value dependencies stay in transformation parameters;
 * raw source arrays retain raw-observation IDs.
 * Session grouping and control selection belong to the caller's explicit contract.
 */
export function resolveNestedNormalizationLineage(
  input: NestedNormalizationLineageInput,
): ResolvedNestedNormalizationLineage {
  const revisionById = uniqueById(input.derivedDatasetRevisions, "derived revision");
  const transformationById = uniqueById(input.transformations, "transformation");
  const valueById = uniqueById(input.derivedValues, "derived value");
  const observationById = uniqueById(input.observations, "raw observation");
  const unitById = uniqueById(input.unitInstances, "unit");
  const sourceRevision = revisionById.get(input.sourceDatasetId);
  if (
    !sourceRevision ||
    sourceRevision.sourceRawRevisionId !== input.rawRevisionId ||
    sourceRevision.outcomeId !== input.outcomeId ||
    sourceRevision.sourceQcRevisionId !== null ||
    sourceRevision.state !== "current" ||
    sourceRevision.staleReason !== null
  ) {
    throw new Error("Nested normalization requires a current mean revision from the declared raw outcome");
  }
  const sourceTransformation = transformationById.get(sourceRevision.transformationId);
  if (
    !sourceTransformation ||
    sourceTransformation.method !== "replicate_summary" ||
    sourceTransformation.parameters.center !== "mean" ||
    sourceTransformation.parameters.outcomeId !== input.outcomeId ||
    sourceTransformation.parameters.experimentalUnitLevelId !== input.experimentalUnitLevelId ||
    sourceTransformation.inputRevisionIds.length !== 1 ||
    sourceTransformation.inputRevisionIds[0] !== input.rawRevisionId
  ) {
    throw new Error("Nested normalization requires the declared raw-to-mean transformation");
  }

  return {
    sourceRevision,
    sourceTransformation,
    resolveValue(observation) {
      const value = valueById.get(observation.observationId);
      if (
        !value ||
        value.derivedDatasetRevisionId !== sourceRevision.id ||
        value.outcomeId !== input.outcomeId ||
        value.conditionId !== observation.conditionId ||
        value.experimentalUnitId !== observation.experimentalUnitId ||
        !Number.isFinite(value.value) ||
        !Number.isFinite(observation.value) ||
        value.value !== observation.value
      ) {
        throw new Error("Nested normalization analysis observation does not match its mean value");
      }
      if (
        !Number.isInteger(value.subsampleCount) ||
        value.subsampleCount <= 0 ||
        value.sourceObservationIds.length !== value.subsampleCount ||
        value.sourceUnitIds.length !== value.subsampleCount ||
        new Set(value.sourceObservationIds).size !== value.subsampleCount
      ) {
        throw new Error("Nested normalization mean has inconsistent raw source counts or duplicate IDs");
      }
      const rawValues = value.sourceObservationIds.map((observationId, index) => {
        const raw = observationById.get(observationId);
        if (
          !raw ||
          raw.rawRevisionId !== input.rawRevisionId ||
          raw.outcomeId !== input.outcomeId ||
          raw.conditionId !== value.conditionId ||
          raw.unitInstanceId !== value.sourceUnitIds[index] ||
          raw.measurement.kind !== "scalar" ||
          !Number.isFinite(raw.measurement.value)
        ) {
          throw new Error("Nested normalization mean references inconsistent raw scalar observations");
        }
        if (
          experimentalAncestorId(raw.unitInstanceId, unitById, input.experimentalUnitLevelId) !==
          value.experimentalUnitId
        ) {
          throw new Error("Nested normalization raw source belongs to a different experimental unit");
        }
        return raw.measurement.value;
      });
      // Use the same ordering and arithmetic as nested-summary.ts center(mean).
      const ordered = [...rawValues].sort((first, second) => first - second);
      const mean = ordered.reduce((sum, raw) => sum + raw, 0) / ordered.length;
      if (!Number.isFinite(mean) || mean !== value.value) {
        throw new Error("Nested normalization mean does not reproduce its raw scalar sources");
      }
      return value;
    },
  };
}

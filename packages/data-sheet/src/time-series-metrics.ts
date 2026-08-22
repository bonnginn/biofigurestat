import {
  DerivedDatasetRevisionSchema,
  DerivedScalarValueSchema,
  TransformationSpecSchema,
  type DerivedDatasetRevision,
  type DerivedScalarValue,
} from "@lsaa/domain";

export type TimeSeriesMetric =
  | "value_at_time"
  | "maximum"
  | "minimum"
  | "endpoint"
  | "auc"
  | "change_from_baseline"
  | "f_over_f0";

export type TimeSeriesScalarInput = Readonly<{
  id: string;
  experimentalUnitId: string;
  conditionId: string;
  outcomeId: string;
  time: number;
  value: number;
  sourceObservationIds: readonly string[];
  sourceUnitIds: readonly string[];
}>;

export type TimeSeriesMetricParameters = Readonly<{
  metric: TimeSeriesMetric;
  windowStart?: number;
  windowEnd?: number;
  selectedTime?: number;
  baselineTime?: number;
}>;

type MetricResult = Readonly<{
  value: number;
  sourceIds: readonly string[];
  sourceUnitIds: readonly string[];
}>;

function calculateMetric(
  values: readonly TimeSeriesScalarInput[],
  parameters: TimeSeriesMetricParameters,
): MetricResult | null {
  const ordered = [...values]
    .filter(
      ({ time, value }) =>
        Number.isFinite(time) &&
        Number.isFinite(value) &&
        (parameters.windowStart === undefined || time >= parameters.windowStart) &&
        (parameters.windowEnd === undefined || time <= parameters.windowEnd),
    )
    .sort((first, second) => first.time - second.time);
  if (ordered.length === 0) return null;
  if (new Set(ordered.map(({ time }) => time)).size !== ordered.length) return null;

  let used: readonly TimeSeriesScalarInput[] = ordered;
  let value: number;
  if (parameters.metric === "value_at_time") {
    if (parameters.selectedTime === undefined) return null;
    const selected = ordered.find(({ time }) => time === parameters.selectedTime);
    if (!selected) return null;
    used = [selected];
    value = selected.value;
  } else if (parameters.metric === "maximum") {
    const selected = ordered.reduce((best, current) =>
      current.value > best.value ? current : best,
    );
    used = [selected];
    value = selected.value;
  } else if (parameters.metric === "minimum") {
    const selected = ordered.reduce((best, current) =>
      current.value < best.value ? current : best,
    );
    used = [selected];
    value = selected.value;
  } else if (parameters.metric === "endpoint") {
    used = [ordered.at(-1)!];
    value = used[0].value;
  } else if (parameters.metric === "auc") {
    if (ordered.length < 2) return null;
    value = ordered.slice(1).reduce((area, current, index) => {
      const previous = ordered[index];
      return area + ((current.value + previous.value) / 2) * (current.time - previous.time);
    }, 0);
  } else {
    if (ordered.length < 2) return null;
    const baseline =
      parameters.baselineTime === undefined
        ? ordered[0]
        : ordered.find(({ time }) => time === parameters.baselineTime);
    if (!baseline) return null;
    const endpoint = ordered.at(-1)!;
    used = baseline.id === endpoint.id ? [baseline] : [baseline, endpoint];
    if (parameters.metric === "change_from_baseline") {
      value = endpoint.value - baseline.value;
    } else {
      if (baseline.value === 0) return null;
      value = endpoint.value / baseline.value;
    }
  }
  if (!Number.isFinite(value)) return null;
  return {
    value,
    sourceIds: [...new Set(used.flatMap(({ sourceObservationIds }) => sourceObservationIds))],
    sourceUnitIds: used.flatMap(({ sourceUnitIds }) => sourceUnitIds),
  };
}

export function createTimeSeriesMetricDerivedDataset(input: {
  derivedDatasetRevisionId: string;
  previousRevisionId?: string | null;
  rawRevisionId: string;
  inputRevisionIds?: readonly string[];
  outcomeId: string;
  values: readonly TimeSeriesScalarInput[];
  parameters: TimeSeriesMetricParameters;
  createdAt: string;
  createdBy: string;
}): {
  transformation: ReturnType<typeof TransformationSpecSchema.parse>;
  revision: DerivedDatasetRevision;
  values: DerivedScalarValue[];
} {
  if (
    input.parameters.windowStart !== undefined &&
    input.parameters.windowEnd !== undefined &&
    input.parameters.windowStart > input.parameters.windowEnd
  ) {
    throw new Error("Time-series analysis window start cannot exceed its end");
  }
  const transformationId = `transformation.${input.derivedDatasetRevisionId}`;
  const groups = new Map<string, TimeSeriesScalarInput[]>();
  input.values
    .filter(({ outcomeId }) => outcomeId === input.outcomeId)
    .forEach((value) => {
      const key = `${value.experimentalUnitId}\u0000${value.conditionId}`;
      groups.set(key, [...(groups.get(key) ?? []), value]);
    });
  const derivedValues: DerivedScalarValue[] = [];
  [...groups.entries()].forEach(([key, group]) => {
    const calculated = calculateMetric(group, input.parameters);
    if (!calculated || calculated.sourceIds.length === 0 || calculated.sourceUnitIds.length === 0)
      return;
    const [experimentalUnitId, conditionId] = key.split("\u0000");
    derivedValues.push(
      DerivedScalarValueSchema.parse({
        id: `derived-value.${input.derivedDatasetRevisionId}.${derivedValues.length + 1}`,
        derivedDatasetRevisionId: input.derivedDatasetRevisionId,
        experimentalUnitId,
        conditionId,
        outcomeId: input.outcomeId,
        value: calculated.value,
        sourceObservationIds: calculated.sourceIds,
        sourceUnitIds: calculated.sourceUnitIds,
        subsampleCount: calculated.sourceIds.length,
      }),
    );
  });
  const transformation = TransformationSpecSchema.parse({
    id: transformationId,
    version: "0.1.0",
    method: "time_series_metric",
    inputRevisionIds: input.inputRevisionIds ?? [input.rawRevisionId],
    parameters: { outcomeId: input.outcomeId, ...input.parameters },
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
  return { transformation, revision, values: derivedValues };
}

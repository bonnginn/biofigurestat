import { describe, expect, it } from "vitest";

import {
  createTimeSeriesMetricDerivedDataset,
  type TimeSeriesScalarInput,
} from "./time-series-metrics";

const values: TimeSeriesScalarInput[] = [0, 2, 5].map((time, index) => ({
  id: `input.${index + 1}`,
  experimentalUnitId: "unit.1",
  conditionId: "condition.1",
  outcomeId: "outcome.1",
  time,
  value: [2, 6, 4][index],
  sourceObservationIds: [`observation.${index + 1}`],
  sourceUnitIds: ["unit.1"],
}));

function derive(
  metric: "maximum" | "minimum" | "endpoint" | "auc" | "change_from_baseline" | "f_over_f0",
) {
  return createTimeSeriesMetricDerivedDataset({
    derivedDatasetRevisionId: `derived.${metric}`,
    rawRevisionId: "raw.1",
    outcomeId: "outcome.1",
    values,
    parameters: { metric },
    createdAt: "2026-08-21T09:00:00.000Z",
    createdBy: "test",
  });
}

describe("time-series metric lineage", () => {
  it("calculates common metrics without replacing the source observations", () => {
    expect(derive("maximum").values[0]?.value).toBe(6);
    expect(derive("minimum").values[0]?.value).toBe(2);
    expect(derive("endpoint").values[0]?.value).toBe(4);
    expect(derive("auc").values[0]?.value).toBe(23);
    expect(derive("change_from_baseline").values[0]?.value).toBe(2);
    expect(derive("f_over_f0").values[0]?.value).toBe(2);
    expect(derive("auc").values[0]?.sourceObservationIds).toEqual([
      "observation.1",
      "observation.2",
      "observation.3",
    ]);
    expect(derive("auc").transformation).toMatchObject({
      method: "time_series_metric",
      parameters: { metric: "auc", outcomeId: "outcome.1" },
    });
  });

  it("applies an explicit inclusive window and selected time", () => {
    const result = createTimeSeriesMetricDerivedDataset({
      derivedDatasetRevisionId: "derived.window",
      rawRevisionId: "raw.1",
      outcomeId: "outcome.1",
      values,
      parameters: { metric: "value_at_time", selectedTime: 2, windowStart: 2, windowEnd: 5 },
      createdAt: "2026-08-21T09:00:00.000Z",
      createdBy: "test",
    });
    expect(result.values[0]).toMatchObject({
      value: 6,
      sourceObservationIds: ["observation.2"],
    });
  });

  it("does not derive F/F0 from a zero baseline or from duplicate time points", () => {
    const zero = values.map((value, index) => ({ ...value, value: index === 0 ? 0 : value.value }));
    const result = createTimeSeriesMetricDerivedDataset({
      derivedDatasetRevisionId: "derived.invalid",
      rawRevisionId: "raw.1",
      outcomeId: "outcome.1",
      values: zero,
      parameters: { metric: "f_over_f0" },
      createdAt: "2026-08-21T09:00:00.000Z",
      createdBy: "test",
    });
    expect(result.values).toEqual([]);
  });
});

import { describe, expect, it } from "vitest";
import {
  DerivedScalarValueSchema,
  ObservationSchema,
  UnitInstanceSchema,
  type DerivedScalarValue,
} from "@lsaa/domain";
import { createNestedScalarDerivedDataset } from "@lsaa/data-sheet";

import {
  resolveNestedNormalizationLineage,
  type NestedNormalizationLineageInput,
  type NestedNormalizationSourceValue,
} from "./nestedNormalizationLineage";

function fixture(): {
  input: NestedNormalizationLineageInput;
  observation: NestedNormalizationSourceValue;
} {
  const unitInstances = [
    UnitInstanceSchema.parse({
      id: "dish.control", levelId: "level.dish", parentUnitId: null,
      label: "Control dish", metadata: {},
    }),
    ...[1, 2, 3].map((roi) => UnitInstanceSchema.parse({
      id: `roi.${roi}`, levelId: "level.roi", parentUnitId: "dish.control",
      label: `ROI ${roi}`, metadata: {},
    })),
  ];
  const observations = [2, 5, 11].map((value, index) => ObservationSchema.parse({
    id: `raw.roi.${index + 1}`, rawRevisionId: "raw.1", unitInstanceId: `roi.${index + 1}`,
    conditionId: "condition.control", outcomeId: "outcome.intensity",
    measurement: { kind: "scalar", value },
  }));
  const derived = createNestedScalarDerivedDataset({
    derivedDatasetRevisionId: "derived.mean.1", rawRevisionId: "raw.1",
    outcomeId: "outcome.intensity", experimentalUnitLevelId: "level.dish", method: "mean",
    observations, unitInstances, createdAt: "2026-10-08T05:00:00Z", createdBy: "test",
  });
  const value = derived.values[0];
  return {
    input: {
      sourceDatasetId: derived.revision.id, rawRevisionId: "raw.1", outcomeId: "outcome.intensity",
      experimentalUnitLevelId: "level.dish", derivedDatasetRevisions: [derived.revision],
      transformations: [derived.transformation], derivedValues: derived.values,
      observations, unitInstances,
    },
    observation: {
      observationId: value.id, experimentalUnitId: value.experimentalUnitId,
      conditionId: value.conditionId, value: value.value,
    },
  };
}

function withValue(
  input: NestedNormalizationLineageInput,
  changes: Partial<DerivedScalarValue>,
): NestedNormalizationLineageInput {
  return { ...input, derivedValues: [DerivedScalarValueSchema.parse({ ...input.derivedValues[0], ...changes })] };
}

describe("nested normalization raw lineage", () => {
  it("retains unequal raw ROI sources and the prior mean without rewriting lineage", () => {
    const { input, observation } = fixture();
    const before = structuredClone(input);
    const resolved = resolveNestedNormalizationLineage(input);
    const value = resolved.resolveValue(observation);

    expect(resolved.sourceRevision).toBe(input.derivedDatasetRevisions[0]);
    expect(resolved.sourceTransformation).toBe(input.transformations[0]);
    expect(value).toBe(input.derivedValues[0]);
    expect(value.value).toBe(6);
    expect(value.sourceObservationIds).toEqual(["raw.roi.1", "raw.roi.2", "raw.roi.3"]);
    expect(value.sourceUnitIds).toEqual(["roi.1", "roi.2", "roi.3"]);
    expect(value.subsampleCount).toBe(3);
    expect(input).toEqual(before);
  });

  it("allows distinct raw observations from the same source unit", () => {
    const { input, observation } = fixture();
    const observations = input.observations.map((raw) => ({ ...raw, unitInstanceId: "roi.1" }));
    const changed = withValue({ ...input, observations }, { sourceUnitIds: ["roi.1", "roi.1", "roi.1"] });
    const value = resolveNestedNormalizationLineage(changed).resolveValue(observation);
    expect(value.sourceUnitIds).toEqual(["roi.1", "roi.1", "roi.1"]);
    expect(value.subsampleCount).toBe(3);
  });

  it.each([
    ["missing source revision", (input: NestedNormalizationLineageInput) => ({ ...input, derivedDatasetRevisions: [] })],
    ["wrong revision raw", (input: NestedNormalizationLineageInput) => ({ ...input, rawRevisionId: "raw.other" })],
    ["wrong revision outcome", (input: NestedNormalizationLineageInput) => ({ ...input, outcomeId: "outcome.other" })],
    ["stale source", (input: NestedNormalizationLineageInput) => ({ ...input, derivedDatasetRevisions: [{ ...input.derivedDatasetRevisions[0], state: "stale" as const, staleReason: "changed" }] })],
    ["QC source", (input: NestedNormalizationLineageInput) => ({ ...input, derivedDatasetRevisions: [{ ...input.derivedDatasetRevisions[0], sourceQcRevisionId: "qc.1" }] })],
    ["missing transformation", (input: NestedNormalizationLineageInput) => ({ ...input, transformations: [] })],
    ["median transformation", (input: NestedNormalizationLineageInput) => ({ ...input, transformations: [{ ...input.transformations[0], parameters: { ...input.transformations[0].parameters, center: "median" } }] })],
    ["wrong transformation input", (input: NestedNormalizationLineageInput) => ({ ...input, transformations: [{ ...input.transformations[0], inputRevisionIds: ["raw.other"] }] })],
  ] as const)("stops %s before resolving values", (_name, change) => {
    expect(() => resolveNestedNormalizationLineage(change(fixture().input))).toThrow(/Nested normalization/);
  });

  it.each([
    ["missing derived reference", { observationId: "derived-value.missing" }],
    ["wrong experimental unit", { experimentalUnitId: "dish.other" }],
    ["wrong condition", { conditionId: "condition.other" }],
    ["changed analysis mean", { value: 9 }],
  ] as const)("stops an analysis observation with %s", (_name, changes) => {
    const { input, observation } = fixture();
    expect(() => resolveNestedNormalizationLineage(input).resolveValue({ ...observation, ...changes })).toThrow(/does not match its mean value/);
  });

  it.each([
    ["wrong derived dataset", { derivedDatasetRevisionId: "derived.other" }],
    ["wrong derived outcome", { outcomeId: "outcome.other" }],
    ["incorrect source count", { subsampleCount: 2 }],
    ["different source unit count", { sourceUnitIds: ["roi.1"] }],
    ["duplicate raw ID", { sourceObservationIds: ["raw.roi.1", "raw.roi.1", "raw.roi.3"] }],
    ["missing raw ID", { sourceObservationIds: ["raw.missing", "raw.roi.2", "raw.roi.3"] }],
    ["wrong source unit ID", { sourceUnitIds: ["roi.2", "roi.2", "roi.3"] }],
  ] satisfies [string, Partial<DerivedScalarValue>][])("stops a mean with %s", (_name, changes) => {
    const { input, observation } = fixture();
    expect(() => resolveNestedNormalizationLineage(withValue(input, changes)).resolveValue(observation)).toThrow(/Nested normalization/);
  });

  it.each([
    ["wrong raw revision", { rawRevisionId: "raw.other" }],
    ["wrong raw outcome", { outcomeId: "outcome.other" }],
    ["wrong raw condition", { conditionId: "condition.other" }],
    ["non-scalar raw", { measurement: { kind: "proportion" as const, numerator: 2, denominator: 4 } }],
    ["unreproducible mean", { measurement: { kind: "scalar" as const, value: 20 } }],
  ] as const)("stops %s", (_name, changes) => {
    const { input, observation } = fixture();
    const observations = [ObservationSchema.parse({ ...input.observations[0], ...changes }), ...input.observations.slice(1)];
    expect(() => resolveNestedNormalizationLineage({ ...input, observations }).resolveValue(observation)).toThrow(/Nested normalization/);
  });

  it("stops a raw source belonging to a different biological ancestor", () => {
    const { input, observation } = fixture();
    const unitInstances = input.unitInstances.map((unit) => unit.id === "roi.1" ? { ...unit, parentUnitId: "dish.other" } : unit);
    unitInstances.push(UnitInstanceSchema.parse({ id: "dish.other", levelId: "level.dish", parentUnitId: null, label: "Other dish", metadata: {} }));
    expect(() => resolveNestedNormalizationLineage({ ...input, unitInstances }).resolveValue(observation)).toThrow(/different experimental unit/);
  });

  it.each(["roi.1", "dish.control"])("stops a hierarchy cycle at %s", (unitId) => {
    const { input, observation } = fixture();
    const unitInstances = input.unitInstances.map((unit) => unit.id === unitId ? { ...unit, parentUnitId: "roi.1" } : unit);
    expect(() => resolveNestedNormalizationLineage({ ...input, unitInstances }).resolveValue(observation)).toThrow(/cycle/);
  });

  it("stops a missing parent or missing declared experimental-unit level", () => {
    const { input, observation } = fixture();
    const missingParent = input.unitInstances.map((unit) => unit.id === "roi.1" ? { ...unit, parentUnitId: "unit.missing" } : unit);
    expect(() => resolveNestedNormalizationLineage({ ...input, unitInstances: missingParent }).resolveValue(observation)).toThrow(/unknown unit or parent/);
    const wrongLevel = input.unitInstances.map((unit) => unit.id === "dish.control" ? { ...unit, levelId: "level.other" } : unit);
    expect(() => resolveNestedNormalizationLineage({ ...input, unitInstances: wrongLevel }).resolveValue(observation)).toThrow(/no declared experimental-unit ancestor/);
  });
});

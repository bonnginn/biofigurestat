import { describe, expect, it } from "vitest";

import {
  createOrderedCurveEntry,
  projectOrderedCurveEntryToLegacyRecords,
  type OrderedCurveEntryInput,
  type OrderedCurvePoint,
} from "./orderedCurveEntry";

const now = "2026-08-27T05:00:00.000Z";
const sameMaterialPoints: readonly OrderedCurvePoint[] = [
  { observationId: "obs.1", unitLabel: "reaction-A", seriesLabel: "Series A", x: 10, y: 0.8 },
  { observationId: "obs.2", unitLabel: "reaction-A", seriesLabel: "Series A", x: 0, y: 0 },
  { observationId: "obs.3", unitLabel: "reaction-A", seriesLabel: "Series A", x: 5, y: 0.5 },
  { observationId: "obs.4", unitLabel: "reaction-B", seriesLabel: "Series B", x: 0, y: 0 },
  { observationId: "obs.5", unitLabel: "reaction-B", seriesLabel: "Series B", x: 5, y: 0.35 },
  { observationId: "obs.6", unitLabel: "reaction-B", seriesLabel: "Series B", x: 10, y: 0.65 },
];
const sameMaterialRaw = [
  "observationId\tunitLabel\tseriesLabel\tx\ty",
  ...sameMaterialPoints.map((point) =>
    [point.observationId, point.unitLabel, point.seriesLabel, point.x, point.y].join("\t"),
  ),
].join("\n");

const base: OrderedCurveEntryInput = {
  points: sameMaterialPoints,
  orderedAxisMeaning: "elapsed_time",
  axisMaterialRelationship: "same_physical_material_across_axis",
  orderedCurveSeriesMeaning: "experimental_conditions",
  orderedCurveSeriesParentRelationship: "no_shared_parent_or_matching",
  orderedAxisCount: 1,
  labels: {
    experimentName: "Generic response over time",
    experimentDescription:
      "Two recorded materials were followed at ordered time points and a continuous response was measured.",
    experimentalUnitLabel: "recorded material",
    identityLabel: "Material ID",
    seriesFactorLabel: "Series",
    orderedAxisLabel: "Elapsed time",
    readoutLabel: "Response",
  },
  units: { orderedAxisUnit: "min", readoutUnit: "a.u." },
  rawText: sameMaterialRaw,
  sourceLabel: "generic-time-course.tsv",
  sourceKind: "clipboard",
  now,
};

const separatePoints: readonly OrderedCurvePoint[] = [
  { observationId: "distance.1", unitLabel: "slice-0-a", seriesLabel: "Control", x: 0, y: 1 },
  { observationId: "distance.2", unitLabel: "slice-0-b", seriesLabel: "Control", x: 0, y: 1.1 },
  { observationId: "distance.3", unitLabel: "slice-5-a", seriesLabel: "Control", x: 5, y: 1.8 },
  { observationId: "distance.4", unitLabel: "slice-5-b", seriesLabel: "Control", x: 5, y: 1.7 },
  { observationId: "distance.5", unitLabel: "slice-10-a", seriesLabel: "Control", x: 10, y: 2.2 },
  { observationId: "distance.6", unitLabel: "slice-10-b", seriesLabel: "Control", x: 10, y: 2.1 },
];

function rawFor(points: readonly OrderedCurvePoint[]): string {
  return [
    "observationId\tunitLabel\tseriesLabel\tx\ty",
    ...points.map((point) =>
      [point.observationId, point.unitLabel, point.seriesLabel, point.x, point.y].join("\t"),
    ),
  ].join("\n");
}

describe("ordered-curve entry compiler", () => {
  it("builds a repeated-axis contract, canonical observations, mapping, and equivalent projection", () => {
    const result = createOrderedCurveEntry(base);
    expect(result.status).toBe("surface_ready");
    if (result.status !== "surface_ready") throw new Error("fixture did not compile");

    expect(result.contract).toMatchObject({
      schemaVersion: "0.1.0",
      experimentName: "Generic response over time",
      experimentalUnitLevelKey: "recordedmaterial",
      identities: [{ key: "materialid", required: true }],
      factors: [{ key: "series", levels: ["Series A", "Series B"] }],
      matching: {
        kind: "matched",
        identityKey: "materialid",
        completeSetsRequired: false,
      },
      orderedAxes: [
        {
          key: "elapsedtime",
          unit: "min",
          levels: [0, 5, 10],
          sampling: "repeated_same_identity",
          identityRetained: true,
        },
      ],
      readouts: [
        {
          key: "response",
          representation: "scalar",
          componentKeys: ["value"],
          axisKeys: ["elapsedtime"],
        },
      ],
    });
    expect(result.surface).toEqual({
      surfaceId: "repeated_axis_matrix",
      reasonCodes: ["stable_identity_across_axis"],
    });
    expect(result.entryResolution.preferredSurface.adaptiveSurfaceId).toBe("repeated_axis_matrix");
    expect(result.canonicalObservations).toHaveLength(6);
    expect(result.canonicalObservations[0]).toMatchObject({
      observationId: "obs.1",
      readoutKey: "response",
      identities: { materialid: "reaction-A" },
      factors: { series: "Series A" },
      axes: { elapsedtime: 10 },
      values: { response: 0.8 },
      sourceRow: 2,
    });
    expect(result.mapping.columns).toMatchObject({
      observationId: { role: "metadata", semanticKey: null },
      unitLabel: { role: "identity", semanticKey: "materialid" },
      seriesLabel: { role: "factor", semanticKey: "series" },
      x: { role: "axis", semanticKey: "elapsedtime" },
      y: { role: "value", semanticKey: "response" },
    });
    expect(result.rawLineage.rawText).toBe(sameMaterialRaw);
    expect(result.rawLineage.transformations).toContain(
      "retained stable identity across ordered-axis points",
    );
    expect(result.design.plannedN).toBe(2);
    expect(result.design.pairing).toMatchObject({ kind: "matched" });
    expect(result.design.observationFactors?.[0]).toMatchObject({
      key: "elapsedtime",
      scientificRole: "time",
      unitRole: "within_unit",
      relationship: { kind: "repeated" },
    });
    expect(result.design.adaptiveStructure?.contract).toEqual(result.contract);
    expect(result.dualWrite).toMatchObject({
      status: "evaluated",
      equivalence: { status: "equivalent", checkedAt: now, diagnostics: [] },
    });
    expect(result.snapshot.equivalence).toEqual(result.dualWrite.equivalence);
    expect(result.snapshot.targetedConfirmations).toEqual([
      {
        key: "ordered_axis_meaning",
        answer: "elapsed_time",
        confirmedAt: now,
      },
      {
        key: "axis_material_relationship",
        answer: "same_physical_material_across_axis",
        confirmedAt: now,
      },
      {
        key: "ordered_curve_series_meaning",
        answer: "experimental_conditions",
        confirmedAt: now,
      },
      {
        key: "ordered_curve_series_parent_relationship",
        answer: "no_shared_parent_or_matching",
        confirmedAt: now,
      },
    ]);
    const legacy = projectOrderedCurveEntryToLegacyRecords(result, "raw.nonlinear.1");
    expect(legacy.series).toEqual([
      { id: "condition.1", label: "Series A" },
      { id: "condition.2", label: "Series B" },
    ]);
    expect(legacy.units).toHaveLength(2);
    expect(legacy.points[0]).toEqual({
      observationId: "obs.1",
      experimentalUnitId: "unit.1",
      seriesId: "condition.1",
      x: 10,
      y: 0.8,
    });
    expect(legacy.observations[0]).toMatchObject({
      id: "obs.1",
      rawRevisionId: "raw.nonlinear.1",
      unitInstanceId: "unit.1",
      conditionId: "condition.1",
      outcomeId: legacy.outcomeId,
      measurement: { kind: "scalar", value: 0.8 },
      time: 10,
    });
  });

  it("creates a cross-sectional surface without inferring biological independence from separate material", () => {
    const rawText = rawFor(separatePoints);
    const result = createOrderedCurveEntry({
      ...base,
      points: separatePoints,
      rawText,
      orderedAxisMeaning: "distance",
      axisMaterialRelationship: "separate_material_per_axis_value",
      axisPointParentRelationship: "no_shared_parent_or_matching",
      labels: {
        ...base.labels,
        experimentName: "Response along a distance axis",
        experimentDescription:
          "Separate recorded materials were collected at each distance and measured once.",
        experimentalUnitLabel: "recorded slice",
        identityLabel: "Slice ID",
        orderedAxisLabel: "Distance",
      },
      units: { orderedAxisUnit: "µm", readoutUnit: "intensity a.u." },
      sourceLabel: "distance-series.tsv",
    });
    expect(result.status).toBe("surface_ready");
    if (result.status !== "surface_ready") throw new Error("fixture did not compile");

    expect(result.contract.matching).toEqual({
      kind: "none",
      identityKey: null,
      completeSetsRequired: null,
    });
    expect(result.contract.orderedAxes[0]).toMatchObject({
      label: "Distance",
      unit: "µm",
      sampling: "cross_sectional",
      identityRetained: false,
    });
    expect(result.contract.rawObservationGrain).toContain(
      "no declared shared parent or matching relationship",
    );
    expect(result.surface).toEqual({
      surfaceId: "factor_observation_table",
      reasonCodes: ["observed_row_grain"],
    });
    expect(result.design.plannedN).toBe(6);
    expect(result.design.pairing).toEqual({ kind: "independent" });
    expect(result.semanticProvenance).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          semanticPath: "axisPointParentRelationship",
          value: "no_shared_parent_or_matching",
          source: "explicit_researcher_fact",
        }),
        expect.objectContaining({
          semanticPath: "matching.kind",
          value: "none",
          source: "non_inference_guard",
          reasonCode: "SEPARATE_MATERIAL_DOES_NOT_ESTABLISH_BIOLOGICAL_INDEPENDENCE",
        }),
        expect.objectContaining({
          semanticPath: "experimentalUnitLevelKey",
          value: "recorded slice",
          source: "explicit_researcher_fact",
          reasonCode: "EXPERIMENTAL_UNIT_LABEL_EXPLICITLY_SUPPLIED",
        }),
        expect.objectContaining({
          semanticPath: "existingDesign.pairing.kind",
          value: "independent",
          source: "legacy_projection_boundary",
          reasonCode: "LEGACY_PAIRING_REQUIRES_EXPLICIT_NO_SHARED_PARENT_CONFIRMATION",
        }),
        expect.objectContaining({
          semanticPath: "factors[0].relationship",
          value: "independent",
          source: "legacy_projection_boundary",
          reasonCode: "SERIES_FACTOR_SHAPE_IS_NOT_NEW_INDEPENDENCE_EVIDENCE",
        }),
        expect.objectContaining({
          semanticPath: "readoutUnit.outsideStructureContract0.1.0",
          value: "intensity a.u.",
        }),
      ]),
    );
    expect(result.design.wizardDecisions).toContainEqual({
      questionId: "ordered-curve.biological-independence",
      answer: "explicit_no_shared_parent_or_matching",
    });
    expect(result.rawLineage.transformations).toContain(
      "kept cross-sectional point identities without inferring biological independence",
    );
    expect(result.dualWrite.equivalence?.status).toBe("equivalent");
    expect(result.dualWrite.diagnostics).toContain(
      "LEGACY_PAIRING_SHAPE_IS_NOT_NEW_INDEPENDENCE_EVIDENCE",
    );
    expect(result.design.observationFactors?.[0]?.scientificRole).toBe("other");
    expect(result.rawLineage.rawText).toBe(rawText);
  });

  it("accepts partial repeated curves without requiring complete identity-by-axis rectangles", () => {
    const partialPoints = sameMaterialPoints.filter(
      ({ unitLabel, x }) => unitLabel !== "reaction-B" || x === 5,
    );
    const result = createOrderedCurveEntry({
      ...base,
      points: partialPoints,
      rawText: rawFor(partialPoints),
    });
    expect(result.status).toBe("surface_ready");
    if (result.status !== "surface_ready") throw new Error("fixture did not compile");
    expect(result.contract.matching.completeSetsRequired).toBe(false);
    expect(result.canonicalObservations).toHaveLength(4);
    expect(result.design.plannedN).toBe(2);
  });

  it("retains raw and normalized input when the material relationship is unknown", () => {
    const result = createOrderedCurveEntry({
      ...base,
      axisMaterialRelationship: "unknown",
    });
    expect(result.status).toBe("needs_targeted_facts");
    expect(result.entryResolution.capabilityReasonCodes).toEqual([
      "AXIS_MATERIAL_RELATIONSHIP_UNRESOLVED",
    ]);
    expect(result.rawLineage.rawText).toBe(sameMaterialRaw);
    expect(result.retainedPoints).toEqual(sameMaterialPoints);
    expect(result.contract).toBeNull();
    expect(result.snapshot).toBeNull();
    expect(result.design).toBeNull();
    expect(result.dualWrite).toMatchObject({
      status: "stopped_before_projection",
      equivalence: null,
    });
  });

  it("requires explicit shared-parent information before projecting separate point material", () => {
    const unresolved = createOrderedCurveEntry({
      ...base,
      points: separatePoints,
      rawText: rawFor(separatePoints),
      orderedAxisMeaning: "substrate_concentration",
      axisMaterialRelationship: "separate_material_per_axis_value",
    });
    expect(unresolved.status).toBe("needs_targeted_facts");
    expect(unresolved.dualWrite.diagnostics).toEqual(["AXIS_POINT_PARENT_RELATIONSHIP_UNRESOLVED"]);
    expect(unresolved.rawLineage.rawText).toBe(rawFor(separatePoints));
    expect(unresolved.design).toBeNull();

    const sharedParent = createOrderedCurveEntry({
      ...base,
      points: separatePoints,
      rawText: rawFor(separatePoints),
      orderedAxisMeaning: "substrate_concentration",
      axisMaterialRelationship: "separate_material_per_axis_value",
      axisPointParentRelationship: "shared_parent_or_matching",
    });
    expect(sharedParent.status).toBe("safe_unsupported");
    expect(sharedParent.dualWrite.diagnostics).toEqual([
      "SEPARATE_AXIS_MATERIAL_HAS_SHARED_PARENT_REQUIRES_HIERARCHY",
    ]);
    expect(sharedParent.entryResolution.suggestedAlternativeModuleId).toBe(
      "condition_canvas_general",
    );
    expect(sharedParent.rawLineage.rawText).toBe(rawFor(separatePoints));
    expect(sharedParent.contract).toBeNull();
  });

  it("safe-stops multi-series rows until Series meaning and cross-Series linkage are explicit", () => {
    const unresolvedMeaning = createOrderedCurveEntry({
      ...base,
      orderedCurveSeriesMeaning: undefined,
      orderedCurveSeriesParentRelationship: undefined,
    });
    expect(unresolvedMeaning.status).toBe("needs_targeted_facts");
    expect(unresolvedMeaning.dualWrite.diagnostics).toContain(
      "ORDERED_CURVE_SERIES_MEANING_UNRESOLVED",
    );

    const sharedParent = createOrderedCurveEntry({
      ...base,
      orderedCurveSeriesParentRelationship: "shared_parent_or_matching",
    });
    expect(sharedParent.status).toBe("safe_unsupported");
    expect(sharedParent.dualWrite.diagnostics).toContain(
      "ORDERED_CURVE_SERIES_SHARED_PARENT_REQUIRES_HIERARCHY",
    );
    expect(sharedParent.rawLineage.rawText).toBe(sameMaterialRaw);

    const readouts = createOrderedCurveEntry({
      ...base,
      orderedCurveSeriesMeaning: "different_readouts",
      orderedCurveSeriesParentRelationship: undefined,
    });
    expect(readouts.status).toBe("safe_unsupported");
    expect(readouts.dualWrite.diagnostics).toContain(
      "ORDERED_CURVE_MULTIPLE_READOUTS_REQUIRE_TYPED_READOUTS",
    );
  });

  it("projects an explicitly varied treatment concentration as intervention rather than time", () => {
    const result = createOrderedCurveEntry({
      ...base,
      points: separatePoints,
      rawText: rawFor(separatePoints),
      orderedAxisMeaning: "treatment_concentration",
      axisMaterialRelationship: "separate_material_per_axis_value",
      axisPointParentRelationship: "no_shared_parent_or_matching",
      labels: { ...base.labels, orderedAxisLabel: "Drug concentration" },
    });
    expect(result.status).toBe("surface_ready");
    if (result.status !== "surface_ready") throw new Error("fixture did not compile");
    expect(result.design.observationFactors?.[0]?.scientificRole).toBe("intervention");
    expect(result.dualWrite.equivalence?.status).toBe("equivalent");
  });

  it("safe-stops multiple axes without flattening them into one ordered curve", () => {
    const result = createOrderedCurveEntry({ ...base, orderedAxisCount: 2 });
    expect(result.status).toBe("safe_unsupported");
    expect(result.entryResolution.capabilityReasonCodes).toEqual([
      "MULTIPLE_ORDERED_AXES_REQUIRE_GENERAL_ENTRY",
    ]);
    expect(result.entryResolution.suggestedAlternativeModuleId).toBe("condition_canvas_general");
    expect(result.rawLineage.rawText).toBe(sameMaterialRaw);
    expect(result.retainedPoints).toEqual(sameMaterialPoints);
    expect(result.contract).toBeNull();
    expect(result.snapshot).toBeNull();
  });

  it.each([
    {
      name: "same-material answer with no stable ID reuse",
      relationship: "same_physical_material_across_axis" as const,
      points: separatePoints,
      reason: "ORDERED_CURVE_STABLE_ID_NOT_REUSED_ACROSS_AXIS",
    },
    {
      name: "separate-material answer with one ID reused across X",
      relationship: "separate_material_per_axis_value" as const,
      points: sameMaterialPoints,
      reason: "ORDERED_CURVE_SEPARATE_MATERIAL_REUSES_ID_ACROSS_AXIS",
    },
    {
      name: "one ID assigned to two series",
      relationship: "same_physical_material_across_axis" as const,
      points: sameMaterialPoints.map((point, index) =>
        index === 3 ? { ...point, unitLabel: "reaction-A" } : point,
      ),
      reason: "ORDERED_CURVE_UNIT_ID_SPANS_MULTIPLE_SERIES",
    },
    {
      name: "duplicate observation ID",
      relationship: "same_physical_material_across_axis" as const,
      points: sameMaterialPoints.map((point, index) =>
        index === 1 ? { ...point, observationId: "obs.1" } : point,
      ),
      reason: "ORDERED_CURVE_OBSERVATION_ID_DUPLICATE",
    },
    {
      name: "duplicate unit/axis coordinate with no declared lower level",
      relationship: "same_physical_material_across_axis" as const,
      points: [
        ...sameMaterialPoints,
        {
          observationId: "obs.7",
          unitLabel: "reaction-A",
          seriesLabel: "Series A",
          x: 5,
          y: 0.55,
        },
      ],
      reason: "ORDERED_CURVE_DUPLICATE_UNIT_AXIS_POINT_REQUIRES_OBSERVATION_LEVEL",
    },
  ])("safe-stops ID inconsistency: $name", ({ relationship, points, reason }) => {
    const rawText = rawFor(points);
    const result = createOrderedCurveEntry({
      ...base,
      points,
      rawText,
      axisMaterialRelationship: relationship,
      ...(relationship === "separate_material_per_axis_value"
        ? { axisPointParentRelationship: "no_shared_parent_or_matching" as const }
        : {}),
    });
    expect(result.status).toBe("input_invalid");
    expect(result.dualWrite.diagnostics).toContain(reason);
    expect(result.rawLineage.rawText).toBe(rawText);
    expect(result.retainedPoints).toEqual(points);
    expect(result.contract).toBeNull();
    expect(result.snapshot).toBeNull();
    expect(result.design).toBeNull();
  });

  it("requires semantic axis/readout names instead of compiling generic X/Y labels", () => {
    const result = createOrderedCurveEntry({
      ...base,
      labels: { ...base.labels, orderedAxisLabel: "X", readoutLabel: "Y" },
    });
    expect(result.status).toBe("input_invalid");
    expect(result.dualWrite.diagnostics).toEqual(
      expect.arrayContaining([
        "ORDERED_CURVE_AXIS_LABEL_REQUIRED",
        "ORDERED_CURVE_READOUT_LABEL_REQUIRED",
      ]),
    );
    expect(result.rawLineage.rawText).toBe(sameMaterialRaw);
  });

  it("represents a sparse single point and an explicit missing value without inventing zero", () => {
    const sparsePoints: readonly OrderedCurvePoint[] = [
      {
        observationId: "sparse.1",
        unitLabel: "position-negative",
        seriesLabel: "Series A",
        x: -5,
        y: 1.2,
      },
      {
        observationId: "sparse.2",
        unitLabel: "position-zero",
        seriesLabel: "Series A",
        x: 0,
        y: null,
      },
    ];
    const result = createOrderedCurveEntry({
      ...base,
      points: sparsePoints,
      rawText: rawFor(sparsePoints),
      orderedAxisMeaning: "distance",
      axisMaterialRelationship: "separate_material_per_axis_value",
      axisPointParentRelationship: "no_shared_parent_or_matching",
      labels: { ...base.labels, orderedAxisLabel: "Signed position" },
    });
    expect(result.status).toBe("surface_ready");
    if (result.status !== "surface_ready") throw new Error("sparse fixture did not compile");
    expect(result.canonicalObservations[1]).toMatchObject({
      values: { response: null },
      missingness: { response: "unknown" },
    });
    const legacy = projectOrderedCurveEntryToLegacyRecords(result);
    expect(legacy.units).toHaveLength(2);
    expect(legacy.points).toHaveLength(1);
    expect(legacy.points[0]?.x).toBe(-5);

    const onePoint = createOrderedCurveEntry({
      ...base,
      points: sparsePoints.slice(0, 1),
      rawText: rawFor(sparsePoints.slice(0, 1)),
      orderedAxisMeaning: "distance",
      axisMaterialRelationship: "separate_material_per_axis_value",
      axisPointParentRelationship: "no_shared_parent_or_matching",
      labels: { ...base.labels, orderedAxisLabel: "Signed position" },
    });
    expect(onePoint.status).toBe("surface_ready");
  });

  it("does not compile an invalid axis count or malformed normalized point IDs", () => {
    const invalidCount = createOrderedCurveEntry({ ...base, orderedAxisCount: 0 });
    expect(invalidCount.status).toBe("input_invalid");
    expect(invalidCount.dualWrite.diagnostics).toEqual(["ORDERED_AXIS_COUNT_INVALID"]);
    expect(invalidCount.rawLineage.rawText).toBe(sameMaterialRaw);

    const malformed = [
      { ...sameMaterialPoints[0]!, observationId: "Observation 1" },
      ...sameMaterialPoints.slice(1),
    ];
    const invalidId = createOrderedCurveEntry({
      ...base,
      points: malformed,
      rawText: rawFor(malformed),
    });
    expect(invalidId.status).toBe("input_invalid");
    expect(invalidId.dualWrite.diagnostics).toContain("ORDERED_CURVE_OBSERVATION_ID_INVALID");
    expect(invalidId.retainedPoints).toEqual(malformed);
  });
});

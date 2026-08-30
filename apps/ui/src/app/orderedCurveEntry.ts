import {
  AdaptiveColumnMappingSchema,
  AdaptiveInputSnapshotSchema,
  AdaptiveRawLineageSchema,
  CanonicalAdaptiveObservationSchema,
  ExperimentDesignSchema,
  STRUCTURE_CONTRACT_VERSION,
  StructureContractSchema,
  type AdaptiveColumnMapping,
  type AdaptiveInputSnapshot,
  type AdaptiveRawLineage,
  type CanonicalAdaptiveObservation,
  type DualWriteEquivalence,
  type ExperimentDesign,
  type Observation,
  type StructureContract,
  type UnitInstance,
} from "@lsaa/domain";
import {
  assertDualWriteEquivalence,
  parseAdaptiveDelimited,
  projectContractToExperimentDesign,
  resolveEntryModule,
  selectAdaptiveSurface,
  semanticKey,
  type AdaptiveSurfaceSelection,
  type AxisMaterialRelationship,
  type AxisPointParentRelationship,
  type ContractProjectionHints,
  type DelimitedSourceKind,
  type EntryModuleResolution,
  type OrderedAxisMeaning,
  type OrderedCurveSeriesMeaning,
  type OrderedCurveSeriesParentRelationship,
} from "@lsaa/adaptive-input";

export type OrderedCurvePoint = Readonly<{
  observationId: string;
  unitLabel: string;
  seriesLabel: string;
  x: number;
  y: number | null;
}>;

export type OrderedCurveEntryLabels = Readonly<{
  experimentName: string;
  experimentDescription: string;
  experimentalUnitLabel: string;
  identityLabel: string;
  seriesFactorLabel: string;
  orderedAxisLabel: string;
  readoutLabel: string;
}>;

export type OrderedCurveEntryUnits = Readonly<{
  orderedAxisUnit: string;
  readoutUnit: string;
}>;

export type OrderedCurveRawTextCaptureMode =
  | "clipboard_text_plain_exact"
  | "file_text_exact"
  | "browser_editor_value"
  | "retained_project_lineage";

export type OrderedCurveEntryInput = Readonly<{
  points: readonly OrderedCurvePoint[];
  orderedAxisMeaning?: OrderedAxisMeaning;
  axisMaterialRelationship?: AxisMaterialRelationship;
  axisPointParentRelationship?: AxisPointParentRelationship;
  orderedCurveSeriesMeaning?: OrderedCurveSeriesMeaning;
  orderedCurveSeriesParentRelationship?: OrderedCurveSeriesParentRelationship;
  orderedAxisCount?: number;
  labels: OrderedCurveEntryLabels;
  units: OrderedCurveEntryUnits;
  experimentalUnitLabelSource?: "explicit_researcher_fact" | "generated_placeholder";
  priorRawLineage?: AdaptiveRawLineage | null;
  rawTextCaptureMode?: OrderedCurveRawTextCaptureMode;
  rawText: string;
  sourceLabel?: string;
  sourceKind?: DelimitedSourceKind;
  now?: string;
}>;

export type OrderedCurveSemanticProvenance = Readonly<{
  semanticPath: string;
  value: string | number | boolean;
  source:
    | "explicit_researcher_fact"
    | "normalized_input"
    | "deterministic_mapping"
    | "non_inference_guard"
    | "legacy_projection_boundary";
  reasonCode: string;
}>;

export type OrderedCurveDualWriteAssessment = Readonly<{
  status: "evaluated" | "stopped_before_projection";
  equivalence: DualWriteEquivalence | null;
  diagnostics: readonly string[];
}>;

type OrderedCurveEntryBase = Readonly<{
  entryResolution: EntryModuleResolution;
  rawLineage: AdaptiveRawLineage;
  retainedPoints: readonly OrderedCurvePoint[];
  semanticProvenance: readonly OrderedCurveSemanticProvenance[];
  dualWrite: OrderedCurveDualWriteAssessment;
}>;

export type OrderedCurveEntryResult =
  | (OrderedCurveEntryBase &
      Readonly<{
        status: "surface_ready";
        contract: StructureContract;
        canonicalObservations: readonly CanonicalAdaptiveObservation[];
        mapping: AdaptiveColumnMapping;
        surface: AdaptiveSurfaceSelection;
        snapshot: AdaptiveInputSnapshot;
        design: ExperimentDesign;
      }>)
  | (OrderedCurveEntryBase &
      Readonly<{
        status:
          | "needs_targeted_facts"
          | "contract_deferred"
          | "safe_unsupported"
          | "input_invalid"
          | "surface_mismatch"
          | "dual_write_mismatch";
        contract: StructureContract | null;
        canonicalObservations: readonly [];
        mapping: null;
        surface: AdaptiveSurfaceSelection | null;
        snapshot: null;
        design: ExperimentDesign | null;
      }>);

export type ReadyOrderedCurveEntry = Extract<
  OrderedCurveEntryResult,
  Readonly<{ status: "surface_ready" }>
>;

export type OrderedCurveLegacyRecords = Readonly<{
  units: readonly UnitInstance[];
  observations: readonly Observation[];
  outcomeId: string;
  series: readonly Readonly<{ id: string; label: string }>[];
  points: readonly Readonly<{
    observationId: string;
    experimentalUnitId: string;
    seriesId: string;
    x: number;
    y: number;
  }>[];
}>;

const semanticIdPattern = /^[a-z0-9][a-z0-9._-]*$/u;

function inputLineage(input: OrderedCurveEntryInput, now: string): AdaptiveRawLineage {
  const prior = input.priorRawLineage;
  return AdaptiveRawLineageSchema.parse({
    schemaVersion: "0.1.0",
    sourceKind: input.sourceKind ?? prior?.sourceKind ?? "clipboard",
    sourceLabel: input.sourceLabel?.trim() || prior?.sourceLabel || "ordered-curve-data",
    importedAt: prior?.importedAt ?? now,
    rawText: input.rawText,
    sha256: null,
    transformations: prior?.transformations ?? [],
  });
}

function stoppedDualWrite(diagnostics: readonly string[]): OrderedCurveDualWriteAssessment {
  return {
    status: "stopped_before_projection",
    equivalence: null,
    diagnostics: [...new Set(diagnostics)],
  };
}

function stoppedResult(input: {
  status: Exclude<OrderedCurveEntryResult["status"], "surface_ready">;
  entryResolution: EntryModuleResolution;
  rawLineage: AdaptiveRawLineage;
  retainedPoints: readonly OrderedCurvePoint[];
  diagnostics: readonly string[];
  semanticProvenance?: readonly OrderedCurveSemanticProvenance[];
  contract?: StructureContract | null;
  surface?: AdaptiveSurfaceSelection | null;
  design?: ExperimentDesign | null;
}): OrderedCurveEntryResult {
  return {
    status: input.status,
    entryResolution: input.entryResolution,
    rawLineage: input.rawLineage,
    retainedPoints: input.retainedPoints,
    semanticProvenance: input.semanticProvenance ?? [],
    contract: input.contract ?? null,
    canonicalObservations: [],
    mapping: null,
    surface: input.surface ?? null,
    snapshot: null,
    design: input.design ?? null,
    dualWrite: stoppedDualWrite(input.diagnostics),
  };
}

function requiredLabelDiagnostics(labels: OrderedCurveEntryLabels): string[] {
  const required: ReadonlyArray<readonly [keyof OrderedCurveEntryLabels, string]> = [
    ["experimentName", "ORDERED_CURVE_EXPERIMENT_NAME_REQUIRED"],
    ["experimentDescription", "ORDERED_CURVE_EXPERIMENT_DESCRIPTION_REQUIRED"],
    ["experimentalUnitLabel", "ORDERED_CURVE_EXPERIMENTAL_UNIT_LABEL_REQUIRED"],
    ["identityLabel", "ORDERED_CURVE_IDENTITY_LABEL_REQUIRED"],
    ["seriesFactorLabel", "ORDERED_CURVE_SERIES_LABEL_REQUIRED"],
    ["orderedAxisLabel", "ORDERED_CURVE_AXIS_LABEL_REQUIRED"],
    ["readoutLabel", "ORDERED_CURVE_READOUT_LABEL_REQUIRED"],
  ];
  const diagnostics = required.flatMap(([key, code]) => (labels[key].trim() ? [] : [code]));
  if (labels.orderedAxisLabel.trim().toLowerCase() === "x") {
    diagnostics.push("ORDERED_CURVE_AXIS_LABEL_REQUIRED");
  }
  if (labels.readoutLabel.trim().toLowerCase() === "y") {
    diagnostics.push("ORDERED_CURVE_READOUT_LABEL_REQUIRED");
  }
  return [...new Set(diagnostics)];
}

function pointDiagnostics(
  points: readonly OrderedCurvePoint[],
  relationship: Exclude<AxisMaterialRelationship, "unknown">,
): string[] {
  if (points.length === 0) return ["ORDERED_CURVE_POINTS_EMPTY"];
  const diagnostics = new Set<string>();
  const observationIds = new Set<string>();
  const seriesByUnit = new Map<string, string>();
  const axisValuesByUnit = new Map<string, Set<number>>();
  const unitAxisCoordinates = new Set<string>();
  const axisLevels = new Set<number>();

  points.forEach((point) => {
    const observationId = point.observationId.trim();
    const unitLabel = point.unitLabel.trim();
    const seriesLabel = point.seriesLabel.trim();
    if (!observationId || !semanticIdPattern.test(observationId)) {
      diagnostics.add("ORDERED_CURVE_OBSERVATION_ID_INVALID");
    } else if (observationIds.has(observationId)) {
      diagnostics.add("ORDERED_CURVE_OBSERVATION_ID_DUPLICATE");
    }
    observationIds.add(observationId);
    if (!unitLabel) diagnostics.add("ORDERED_CURVE_UNIT_ID_REQUIRED");
    if (!seriesLabel) diagnostics.add("ORDERED_CURVE_SERIES_VALUE_REQUIRED");
    if (!Number.isFinite(point.x)) diagnostics.add("ORDERED_CURVE_X_MUST_BE_FINITE");
    if (point.y !== null && !Number.isFinite(point.y)) {
      diagnostics.add("ORDERED_CURVE_Y_MUST_BE_FINITE");
    }
    if (!unitLabel || !seriesLabel || !Number.isFinite(point.x)) return;

    const priorSeries = seriesByUnit.get(unitLabel);
    if (priorSeries && priorSeries !== seriesLabel) {
      diagnostics.add("ORDERED_CURVE_UNIT_ID_SPANS_MULTIPLE_SERIES");
    } else {
      seriesByUnit.set(unitLabel, seriesLabel);
    }
    const unitKey = `${seriesLabel}\u0000${unitLabel}`;
    const coordinate = `${unitKey}\u0000${String(point.x)}`;
    if (unitAxisCoordinates.has(coordinate)) {
      diagnostics.add("ORDERED_CURVE_DUPLICATE_UNIT_AXIS_POINT_REQUIRES_OBSERVATION_LEVEL");
    }
    unitAxisCoordinates.add(coordinate);
    const values = axisValuesByUnit.get(unitKey) ?? new Set<number>();
    values.add(point.x);
    axisValuesByUnit.set(unitKey, values);
    axisLevels.add(point.x);
  });

  if (
    relationship === "same_physical_material_across_axis" &&
    ![...axisValuesByUnit.values()].some((values) => values.size > 1)
  ) {
    diagnostics.add("ORDERED_CURVE_STABLE_ID_NOT_REUSED_ACROSS_AXIS");
  }
  if (
    relationship === "separate_material_per_axis_value" &&
    [...axisValuesByUnit.values()].some((values) => values.size > 1)
  ) {
    diagnostics.add("ORDERED_CURVE_SEPARATE_MATERIAL_REUSES_ID_ACROSS_AXIS");
  }
  return [...diagnostics];
}

function distinctInInputOrder(values: readonly string[]): string[] {
  return [...new Set(values.map((value) => value.trim()))];
}

function buildContract(
  input: OrderedCurveEntryInput,
  relationship: Exclude<AxisMaterialRelationship, "unknown">,
): StructureContract {
  const labels = input.labels;
  const unitKey = semanticKey(labels.experimentalUnitLabel);
  const identityKey = semanticKey(labels.identityLabel);
  const seriesKey = semanticKey(labels.seriesFactorLabel);
  const axisKey = semanticKey(labels.orderedAxisLabel);
  const readoutKey = semanticKey(labels.readoutLabel);
  const seriesLevels = distinctInInputOrder(input.points.map(({ seriesLabel }) => seriesLabel));
  const axisLevels = [...new Set(input.points.map(({ x }) => x))].sort(
    (left, right) => left - right,
  );
  const repeated = relationship === "same_physical_material_across_axis";
  return StructureContractSchema.parse({
    schemaVersion: STRUCTURE_CONTRACT_VERSION,
    contractId: `contract.${semanticKey(labels.experimentName)}.ordered_curve`,
    experimentName: labels.experimentName.trim(),
    experimentDescription: labels.experimentDescription.trim(),
    unitLevels: [
      {
        key: unitKey,
        label: labels.experimentalUnitLabel.trim(),
        role: "experimental_unit",
        parentKey: null,
      },
    ],
    experimentalUnitLevelKey: unitKey,
    identities: [
      {
        key: identityKey,
        label: labels.identityLabel.trim(),
        unitLevelKey: unitKey,
        required: true,
      },
    ],
    factors: [
      {
        key: seriesKey,
        label: labels.seriesFactorLabel.trim(),
        levels: seriesLevels,
        unitRole: "between_unit",
        relationship: "independent",
        ordered: false,
        referenceLevel:
          seriesLevels.find((level) =>
            /^(vehicle|control|untreated|mock|baseline)$/iu.test(level),
          ) ?? null,
      },
    ],
    matching: repeated
      ? { kind: "matched", identityKey, completeSetsRequired: false }
      : { kind: "none", identityKey: null, completeSetsRequired: null },
    orderedAxes: [
      {
        key: axisKey,
        label: labels.orderedAxisLabel.trim(),
        unit: input.units.orderedAxisUnit.trim(),
        levels: axisLevels,
        sampling: repeated ? "repeated_same_identity" : "cross_sectional",
        identityRetained: repeated,
      },
    ],
    readouts: [
      {
        key: readoutKey,
        label: labels.readoutLabel.trim(),
        valueType: "continuous",
        representation: "scalar",
        componentKeys: ["value"],
        referenceRole: "none",
        observationLevelKey: unitKey,
        axisKeys: [axisKey],
      },
    ],
    allowedMissingness: ["not_collected", "assay_failed", "dropout", "unknown"],
    rawObservationGrain: repeated
      ? `one ordered-axis measurement from one stable ${labels.experimentalUnitLabel.trim()}`
      : `one ordered-axis measurement from separately prepared ${labels.experimentalUnitLabel.trim()} with no declared shared parent or matching relationship`,
  });
}

function orderedAxisProjectionHints(
  input: OrderedCurveEntryInput,
  contract: StructureContract,
): ContractProjectionHints {
  const axis = contract.orderedAxes[0];
  if (!axis) return {};
  const scientificRole =
    input.orderedAxisMeaning === "elapsed_time"
      ? "time"
      : input.orderedAxisMeaning === "treatment_concentration"
        ? "intervention"
        : "other";
  return { orderedAxisScientificRoles: { [axis.key]: scientificRole } };
}

function semanticProvenance(
  input: OrderedCurveEntryInput,
  contract: StructureContract,
  relationship: Exclude<AxisMaterialRelationship, "unknown">,
): OrderedCurveSemanticProvenance[] {
  const axis = contract.orderedAxes[0]!;
  const records: OrderedCurveSemanticProvenance[] = [
    {
      semanticPath: "orderedAxisMeaning",
      value: input.orderedAxisMeaning!,
      source: "explicit_researcher_fact",
      reasonCode: "ORDERED_AXIS_MEANING_CONFIRMED",
    },
    {
      semanticPath: "axisMaterialRelationship",
      value: relationship,
      source: "explicit_researcher_fact",
      reasonCode: "AXIS_MATERIAL_RELATIONSHIP_CONFIRMED",
    },
    {
      semanticPath: "orderedAxes[0].sampling",
      value: axis.sampling,
      source: "deterministic_mapping",
      reasonCode: "AXIS_SAMPLING_FROM_MATERIAL_RELATIONSHIP",
    },
    {
      semanticPath: "orderedAxes[0].identityRetained",
      value: axis.identityRetained,
      source: "deterministic_mapping",
      reasonCode: "AXIS_IDENTITY_FROM_MATERIAL_RELATIONSHIP",
    },
    {
      semanticPath: "identities[0]",
      value: input.labels.identityLabel.trim(),
      source: "normalized_input",
      reasonCode: "NORMALIZED_UNIT_LABEL_RETAINED_AS_IDENTITY",
    },
    {
      semanticPath: "experimentalUnitLevelKey",
      value: input.labels.experimentalUnitLabel.trim(),
      source:
        input.experimentalUnitLabelSource === "generated_placeholder"
          ? "deterministic_mapping"
          : "explicit_researcher_fact",
      reasonCode:
        input.experimentalUnitLabelSource === "generated_placeholder"
          ? "GENERIC_EXPERIMENTAL_UNIT_LABEL_PENDING_RESEARCHER_REFINEMENT"
          : "EXPERIMENTAL_UNIT_LABEL_EXPLICITLY_SUPPLIED",
    },
  ];
  if (input.units.readoutUnit.trim()) {
    records.push({
      semanticPath: "readoutUnit.outsideStructureContract0.1.0",
      value: input.units.readoutUnit.trim(),
      source: "legacy_projection_boundary",
      reasonCode: "READOUT_UNIT_RETAINED_OUTSIDE_STRUCTURE_CONTRACT_0_1_0",
    });
  }
  if (relationship === "separate_material_per_axis_value") {
    records.push(
      {
        semanticPath: "axisPointParentRelationship",
        value: input.axisPointParentRelationship!,
        source: "explicit_researcher_fact",
        reasonCode: "NO_SHARED_PARENT_OR_MATCHING_CONFIRMED",
      },
      {
        semanticPath: "matching.kind",
        value: "none",
        source: "non_inference_guard",
        reasonCode: "SEPARATE_MATERIAL_DOES_NOT_ESTABLISH_BIOLOGICAL_INDEPENDENCE",
      },
      {
        semanticPath: "existingDesign.pairing.kind",
        value: "independent",
        source: "legacy_projection_boundary",
        reasonCode: "LEGACY_PAIRING_REQUIRES_EXPLICIT_NO_SHARED_PARENT_CONFIRMATION",
      },
      {
        semanticPath: "factors[0].relationship",
        value: "independent",
        source: "legacy_projection_boundary",
        reasonCode: "SERIES_FACTOR_SHAPE_IS_NOT_NEW_INDEPENDENCE_EVIDENCE",
      },
    );
  }
  if (distinctInInputOrder(input.points.map(({ seriesLabel }) => seriesLabel)).length > 1) {
    records.push(
      {
        semanticPath: "orderedCurveSeriesMeaning",
        value: input.orderedCurveSeriesMeaning!,
        source: "explicit_researcher_fact",
        reasonCode: "ORDERED_CURVE_SERIES_CONFIRMED_AS_EXPERIMENTAL_CONDITIONS",
      },
      {
        semanticPath: "orderedCurveSeriesParentRelationship",
        value: input.orderedCurveSeriesParentRelationship!,
        source: "explicit_researcher_fact",
        reasonCode: "NO_SHARED_PARENT_OR_MATCHING_ACROSS_SERIES_CONFIRMED",
      },
    );
  }
  return records;
}

function canonicalObservations(
  input: OrderedCurveEntryInput,
  contract: StructureContract,
): CanonicalAdaptiveObservation[] {
  const identityKey = contract.identities[0]!.key;
  const factorKey = contract.factors[0]!.key;
  const axisKey = contract.orderedAxes[0]!.key;
  const readoutKey = contract.readouts[0]!.key;
  return input.points.map((point, index) =>
    CanonicalAdaptiveObservationSchema.parse({
      observationId: point.observationId.trim(),
      readoutKey,
      identities: { [identityKey]: point.unitLabel.trim() },
      factors: { [factorKey]: point.seriesLabel.trim() },
      axes: { [axisKey]: point.x },
      hierarchy: {},
      values: { [readoutKey]: point.y },
      missingness: point.y === null ? { [readoutKey]: "unknown" } : {},
      sourceRow: index + 2,
    }),
  );
}

function normalizedMapping(
  input: OrderedCurveEntryInput,
  contract: StructureContract,
  sourceLabel: string,
  now: string,
): AdaptiveColumnMapping {
  const parsed = parseAdaptiveDelimited(input.rawText);
  const normalizedHeader = (header: string) => header.trim().toLowerCase().replaceAll("_", " ");
  const columns = Object.fromEntries(
    parsed.headers.map((header) => {
      const normalized = normalizedHeader(header);
      if (["unit id", "unit", "sample id", "unitlabel", "unit label"].includes(normalized)) {
        return [header, { role: "identity" as const, semanticKey: contract.identities[0]!.key }];
      }
      if (["series", "serieslabel", "series label"].includes(normalized)) {
        return [header, { role: "factor" as const, semanticKey: contract.factors[0]!.key }];
      }
      if (normalized === "x") {
        return [header, { role: "axis" as const, semanticKey: contract.orderedAxes[0]!.key }];
      }
      if (normalized === "y") {
        return [header, { role: "value" as const, semanticKey: contract.readouts[0]!.key }];
      }
      return [header, { role: "metadata" as const, semanticKey: null }];
    }),
  );
  return AdaptiveColumnMappingSchema.parse({
    schemaVersion: "0.1.0",
    sourceLabel: `${sourceLabel} (normalized ordered-curve points)`,
    delimiter: parsed.delimiter,
    headerRow: parsed.headerRow,
    columns,
    confirmedAt: now,
  });
}

function typedLineage(
  rawLineage: AdaptiveRawLineage,
  input: OrderedCurveEntryInput,
  relationship: Exclude<AxisMaterialRelationship, "unknown">,
): AdaptiveRawLineage {
  const rawWasEdited =
    input.priorRawLineage !== null &&
    input.priorRawLineage !== undefined &&
    input.priorRawLineage.rawText !== input.rawText;
  const captureTransformation =
    input.rawTextCaptureMode === "clipboard_text_plain_exact"
      ? "preserved clipboard text/plain exactly as delivered by the Clipboard API"
      : input.rawTextCaptureMode === "file_text_exact"
        ? "preserved file text exactly as delivered by the File API"
        : input.rawTextCaptureMode === "retained_project_lineage"
          ? null
          : "captured the browser editor value; line endings follow the browser-normalized representation";
  return AdaptiveRawLineageSchema.parse({
    ...rawLineage,
    transformations: [
      ...new Set([
        ...rawLineage.transformations,
        ...(rawWasEdited
          ? ["edited ordered-curve raw text while retaining the declared experiment structure"]
          : []),
        ...(captureTransformation ? [captureTransformation] : []),
        "received normalized long-form ordered-curve points",
        "validated stable identity against ordered-axis sampling",
        relationship === "same_physical_material_across_axis"
          ? "retained stable identity across ordered-axis points"
          : "kept cross-sectional point identities without inferring biological independence",
        ...(input.units.readoutUnit.trim()
          ? [`retained readout unit in semantic provenance: ${input.units.readoutUnit.trim()}`]
          : []),
      ]),
    ],
  });
}

function designWithProvenance(
  contract: StructureContract,
  input: OrderedCurveEntryInput,
  relationship: Exclude<AxisMaterialRelationship, "unknown">,
  plannedN: number,
  now: string,
): ExperimentDesign {
  const projected = projectContractToExperimentDesign(
    contract,
    plannedN,
    now,
    orderedAxisProjectionHints(input, contract),
  );
  return ExperimentDesignSchema.parse({
    ...projected,
    wizardDecisions: [
      ...projected.wizardDecisions,
      { questionId: "ordered-curve.axis-meaning", answer: input.orderedAxisMeaning! },
      { questionId: "ordered-curve.axis-material-relationship", answer: relationship },
      {
        questionId: "ordered-curve.biological-independence",
        answer:
          relationship === "separate_material_per_axis_value"
            ? "explicit_no_shared_parent_or_matching"
            : "stable_identity_confirmed_across_axis",
      },
      ...(relationship === "separate_material_per_axis_value"
        ? [
            {
              questionId: "ordered-curve.axis-point-parent-relationship",
              answer: input.axisPointParentRelationship!,
            },
          ]
        : []),
      ...(distinctInInputOrder(input.points.map(({ seriesLabel }) => seriesLabel)).length > 1
        ? [
            {
              questionId: "ordered-curve.series-meaning",
              answer: input.orderedCurveSeriesMeaning!,
            },
            {
              questionId: "ordered-curve.series-parent-relationship",
              answer: input.orderedCurveSeriesParentRelationship!,
            },
          ]
        : []),
      ...(input.units.readoutUnit.trim()
        ? [
            {
              questionId: "ordered-curve.readout-unit",
              answer: input.units.readoutUnit.trim(),
            },
          ]
        : []),
    ],
  });
}

/**
 * Compiles a validated single-axis ordered curve without selecting a
 * statistical method. Any unresolved or inconsistent identity fact stops
 * before projection while retaining both the raw source and normalized rows.
 */
export function createOrderedCurveEntry(input: OrderedCurveEntryInput): OrderedCurveEntryResult {
  const now = input.now ?? new Date().toISOString();
  const rawLineage = inputLineage(input, now);
  const retainedPoints = input.points.map((point) => ({ ...point }));
  const axisCount = input.orderedAxisCount ?? 1;
  const entryResolution = resolveEntryModule("ordered_curve_kinetics", {
    orderedAxisMeaning: input.orderedAxisMeaning,
    axisMaterialRelationship: input.axisMaterialRelationship,
    axisPointParentRelationship: input.axisPointParentRelationship,
    orderedAxisCount: axisCount,
    orderedCurveSeriesCount: distinctInInputOrder(
      input.points.map(({ seriesLabel }) => seriesLabel),
    ).length,
    orderedCurveSeriesMeaning: input.orderedCurveSeriesMeaning,
    orderedCurveSeriesParentRelationship: input.orderedCurveSeriesParentRelationship,
  });

  if (!Number.isInteger(axisCount) || axisCount < 1) {
    return stoppedResult({
      status: "input_invalid",
      entryResolution,
      rawLineage,
      retainedPoints,
      diagnostics: ["ORDERED_AXIS_COUNT_INVALID"],
    });
  }
  if (entryResolution.status !== "surface_ready") {
    return stoppedResult({
      status: entryResolution.status,
      entryResolution,
      rawLineage,
      retainedPoints,
      diagnostics: entryResolution.capabilityReasonCodes,
    });
  }

  const relationship = input.axisMaterialRelationship;
  if (
    relationship !== "same_physical_material_across_axis" &&
    relationship !== "separate_material_per_axis_value"
  ) {
    return stoppedResult({
      status: "needs_targeted_facts",
      entryResolution,
      rawLineage,
      retainedPoints,
      diagnostics: ["AXIS_MATERIAL_RELATIONSHIP_UNRESOLVED"],
    });
  }
  const diagnostics = [
    ...requiredLabelDiagnostics(input.labels),
    ...pointDiagnostics(input.points, relationship),
  ];
  if (diagnostics.length) {
    return stoppedResult({
      status: "input_invalid",
      entryResolution,
      rawLineage,
      retainedPoints,
      diagnostics,
    });
  }

  const contract = buildContract(input, relationship);
  const provenance = semanticProvenance(input, contract, relationship);
  const observations = canonicalObservations(input, contract);
  const surface = selectAdaptiveSurface(contract);
  if (surface.surfaceId !== entryResolution.preferredSurface.adaptiveSurfaceId) {
    return stoppedResult({
      status: "surface_mismatch",
      entryResolution,
      rawLineage,
      retainedPoints,
      diagnostics: [
        `ORDERED_CURVE_SURFACE_MISMATCH:${entryResolution.preferredSurface.adaptiveSurfaceId}:${surface.surfaceId}`,
      ],
      semanticProvenance: provenance,
      contract,
      surface,
    });
  }

  const lineage = typedLineage(rawLineage, input, relationship);
  const mapping = normalizedMapping(input, contract, lineage.sourceLabel, now);
  const plannedN = new Set(input.points.map(({ unitLabel }) => unitLabel.trim())).size;
  const design = designWithProvenance(contract, input, relationship, plannedN, now);
  let equivalence: DualWriteEquivalence;
  try {
    equivalence = assertDualWriteEquivalence(
      contract,
      design,
      now,
      orderedAxisProjectionHints(input, contract),
    );
  } catch (error) {
    return stoppedResult({
      status: "dual_write_mismatch",
      entryResolution,
      rawLineage: lineage,
      retainedPoints,
      diagnostics: [error instanceof Error ? error.message : String(error)],
      semanticProvenance: provenance,
      contract,
      surface,
      design,
    });
  }
  if (equivalence.status !== "equivalent") {
    return stoppedResult({
      status: "dual_write_mismatch",
      entryResolution,
      rawLineage: lineage,
      retainedPoints,
      diagnostics: equivalence.diagnostics,
      semanticProvenance: provenance,
      contract,
      surface,
      design,
    });
  }

  const snapshot = AdaptiveInputSnapshotSchema.parse({
    schemaVersion: "0.1.0",
    featureFlag: "experiment_first_adaptive_input_alpha",
    contract,
    surface,
    mapping,
    rawLineage: lineage,
    canonicalObservations: observations,
    equivalence,
    targetedConfirmations: [
      {
        key: "ordered_axis_meaning",
        answer: input.orderedAxisMeaning!,
        confirmedAt: now,
      },
      {
        key: "axis_material_relationship",
        answer: relationship,
        confirmedAt: now,
      },
      ...(relationship === "separate_material_per_axis_value"
        ? [
            {
              key: "axis_point_parent_relationship",
              answer: input.axisPointParentRelationship!,
              confirmedAt: now,
            },
          ]
        : []),
      ...(distinctInInputOrder(input.points.map(({ seriesLabel }) => seriesLabel)).length > 1
        ? [
            {
              key: "ordered_curve_series_meaning",
              answer: input.orderedCurveSeriesMeaning!,
              confirmedAt: now,
            },
            {
              key: "ordered_curve_series_parent_relationship",
              answer: input.orderedCurveSeriesParentRelationship!,
              confirmedAt: now,
            },
          ]
        : []),
    ],
  });
  const projectionBoundaryDiagnostics =
    relationship === "separate_material_per_axis_value"
      ? ["LEGACY_PAIRING_SHAPE_IS_NOT_NEW_INDEPENDENCE_EVIDENCE"]
      : [];
  return {
    status: "surface_ready",
    entryResolution,
    rawLineage: lineage,
    retainedPoints,
    semanticProvenance: provenance,
    contract,
    canonicalObservations: observations,
    mapping,
    surface,
    snapshot,
    design,
    dualWrite: {
      status: "evaluated",
      equivalence,
      diagnostics: [
        ...(design.adaptiveStructure?.diagnostics ?? []),
        ...equivalence.diagnostics,
        ...projectionBoundaryDiagnostics,
      ],
    },
  };
}

/**
 * Projects the helper's canonical rows into the existing scalar observation
 * model used by D17. The embedded StructureContract remains authoritative:
 * the legacy `time` slot carries the numeric X coordinate only so the current
 * engine request can reproduce from persisted observations.
 */
export function projectOrderedCurveEntryToLegacyRecords(
  entry: ReadyOrderedCurveEntry,
  rawRevisionId = "raw.ordered-curve.1",
  options: Readonly<{
    existingUnitIdsByLabel?: Readonly<Record<string, string>>;
    observationIdPrefix?: string;
  }> = {},
): OrderedCurveLegacyRecords {
  const contract = entry.contract;
  const identity = contract.identities[0];
  const factor = contract.factors[0];
  const axis = contract.orderedAxes[0];
  const readout = contract.readouts[0];
  if (!identity || !factor || !axis || !readout) {
    throw new Error("ORDERED_CURVE_CANONICAL_SHAPE_INCOMPLETE");
  }
  const designFactor = entry.design.factors.find(({ key }) => key === factor.key);
  const outcome = entry.design.outcomes.find(({ key }) => key === readout.key);
  if (!designFactor || !outcome) {
    throw new Error("ORDERED_CURVE_LEGACY_PROJECTION_TARGET_MISSING");
  }

  const conditionBySeries = new Map<string, string>();
  for (const level of designFactor.levels) {
    const condition = entry.design.conditions.find(
      ({ factorLevels }) => factorLevels[designFactor.id] === level.id,
    );
    if (!condition) throw new Error(`ORDERED_CURVE_CONDITION_MISSING:${level.label}`);
    conditionBySeries.set(level.label, condition.id);
  }

  const unitIdByLabel = new Map<string, string>(
    Object.entries(options.existingUnitIdsByLabel ?? {}),
  );
  const usedUnitIds = new Set(unitIdByLabel.values());
  const units: UnitInstance[] = [];
  for (const row of entry.canonicalObservations) {
    const unitLabel = row.identities[identity.key];
    if (!unitLabel) throw new Error(`ORDERED_CURVE_IDENTITY_MISSING:${row.observationId}`);
    if (unitIdByLabel.has(unitLabel)) continue;
    let nextIndex = unitIdByLabel.size + 1;
    while (usedUnitIds.has(`unit.${nextIndex}`)) nextIndex += 1;
    const unitId = `unit.${nextIndex}`;
    unitIdByLabel.set(unitLabel, unitId);
    usedUnitIds.add(unitId);
    units.push({
      id: unitId,
      levelId: entry.design.experimentalUnitLevelId,
      parentUnitId: null,
      label: unitLabel,
      metadata: {
        [identity.key]: unitLabel,
        orderedAxisSampling: axis.sampling,
      },
    });
  }

  const observations: Observation[] = [];
  const points: OrderedCurveLegacyRecords["points"][number][] = [];
  for (const row of entry.canonicalObservations) {
    const unitLabel = row.identities[identity.key];
    const seriesLabel = row.factors[factor.key];
    const x = row.axes[axis.key];
    const y = row.values[readout.key];
    const unitId = unitLabel ? unitIdByLabel.get(unitLabel) : undefined;
    const conditionId = seriesLabel ? conditionBySeries.get(seriesLabel) : undefined;
    if (!unitId || !conditionId || typeof x !== "number") {
      throw new Error(`ORDERED_CURVE_CANONICAL_ROW_INVALID:${row.observationId}`);
    }
    if (y === null) continue;
    if (typeof y !== "number") {
      throw new Error(`ORDERED_CURVE_CANONICAL_ROW_INVALID:${row.observationId}`);
    }
    const observationId = options.observationIdPrefix
      ? `${options.observationIdPrefix}.${row.observationId}`
      : row.observationId;
    observations.push({
      id: observationId,
      rawRevisionId,
      unitInstanceId: unitId,
      conditionId,
      outcomeId: outcome.id,
      measurement: { kind: "scalar", value: y },
      // Observation 0.2.0 has no generic ordered-coordinate field. The
      // StructureContract and canonical row preserve the scientific meaning.
      time: x,
      sourceLocation: `raw row ${row.sourceRow ?? "unknown"}; ${axis.label}=${String(x)}`,
    });
    points.push({
      observationId,
      experimentalUnitId: unitId,
      seriesId: conditionId,
      x,
      y,
    });
  }

  return {
    units,
    observations,
    outcomeId: outcome.id,
    series: factor.levels.map((label) => {
      const id = conditionBySeries.get(label);
      if (!id) throw new Error(`ORDERED_CURVE_CONDITION_MISSING:${label}`);
      return { id, label };
    }),
    points,
  };
}

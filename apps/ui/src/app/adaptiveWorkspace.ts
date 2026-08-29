import {
  AdaptiveInputSnapshotSchema,
  type AdaptiveColumnMapping,
  type AdaptiveInputSnapshot,
  type AdaptiveRawLineage,
  type BiologicalSetupPresentation,
  type CanonicalAdaptiveObservation,
  type StructureContract,
} from "@lsaa/domain";
import {
  assertDualWriteEquivalence,
  projectContractToExperimentDesign,
  resolveCanonicalReadoutValue,
  selectAdaptiveSurface,
  validateCanonicalObservationsForContract,
} from "@lsaa/adaptive-input";
import {
  experimentCellKey,
  plannedExperimentalUnitCount,
  type ConditionDraft,
  type ExperimentCellDraft,
  type ExperimentCellMap,
  type ExperimentSetDraft,
  type ReadoutDraft,
} from "./experimentDraft";
import { decodeAdaptiveSurvivalStatus } from "./adaptiveSurvivalStatus";
import { createBiologicalSetupPrefill } from "./adaptiveStructureRevision";

const combinations = (contract: StructureContract): Array<Record<string, string>> =>
  contract.factors.reduce<Array<Record<string, string>>>(
    (rows, factor) =>
      rows.flatMap((row) => factor.levels.map((level) => ({ ...row, [factor.key]: level }))),
    [{}],
  );

const conditionId = (index: number) => `condition.${index + 1}`;

const TEMPORAL_AXIS_UNITS = new Set([
  "s",
  "sec",
  "second",
  "seconds",
  "min",
  "minute",
  "minutes",
  "h",
  "hr",
  "hour",
  "hours",
  "day",
  "days",
  "week",
  "weeks",
  "month",
  "months",
]);

function isTemporalOrderedAxis(axis: StructureContract["orderedAxes"][number]): boolean {
  return (
    axis.sampling === "event_follow_up" ||
    TEMPORAL_AXIS_UNITS.has(axis.unit.trim().toLocaleLowerCase("en-US"))
  );
}

function readoutDraft(
  contract: StructureContract,
  readout: StructureContract["readouts"][number],
): ReadoutDraft {
  if (readout.representation === "proportion_counts")
    return { id: `outcome.${readout.key}`, label: readout.label, shape: "proportion" };
  if (readout.representation === "category_counts")
    return {
      id: `outcome.${readout.key}`,
      label: readout.label,
      shape: "categorical_counts",
      categories: readout.componentKeys.map((key) => ({ id: key, label: key })),
    };
  if (readout.representation === "target_reference")
    return {
      id: `outcome.${readout.key}`,
      label: readout.label,
      shape: "wb_ratio",
      referenceLabel: "Reference",
      wbInputMode: "corrected_value",
    };
  return {
    id: `outcome.${readout.key}`,
    label: readout.label,
    shape: "nested_continuous",
    nestedInputMode:
      readout.observationLevelKey === contract.experimentalUnitLevelKey
        ? "unit_summary"
        : "nested_observations",
  };
}

function numeric(value: unknown): number | null {
  return typeof value === "number" && Number.isFinite(value)
    ? value
    : typeof value === "string" && value.trim() && Number.isFinite(Number(value))
      ? Number(value)
      : null;
}

function matchedTopology(
  contract: StructureContract,
): ExperimentSetDraft["conditionAssignment"]["matchedTopology"] {
  if (contract.matching.kind !== "matched" || !contract.matching.identityKey) return undefined;
  const identity = contract.identities.find(({ key }) => key === contract.matching.identityKey);
  if (!identity) return undefined;
  if (identity.unitLevelKey === contract.experimentalUnitLevelKey) {
    return { kind: "same_entity_across_conditions" };
  }
  const levels = new Map(contract.unitLevels.map((level) => [level.key, level]));
  let cursor = levels.get(contract.experimentalUnitLevelKey);
  while (cursor?.parentKey) {
    if (cursor.parentKey === identity.unitLevelKey) {
      const source = levels.get(identity.unitLevelKey);
      return {
        kind: "distinct_condition_units_shared_source",
        sourceUnitLabel: source?.label ?? identity.unitLevelKey,
        sourceIdentityLabel: identity.label,
        sourceRole: source?.role === "sample" ? "sample" : "block",
      };
    }
    cursor = levels.get(cursor.parentKey);
  }
  return undefined;
}

function requiresExplicitNestedAxisTracking(
  contract: StructureContract,
  observations: readonly CanonicalAdaptiveObservation[],
): boolean {
  return contract.readouts.some((readout) => {
    if (readout.observationLevelKey === contract.experimentalUnitLevelKey) return false;
    const retainsChildIdentity = readout.axisKeys.some(
      (axisKey) =>
        contract.orderedAxes.find(({ key }) => key === axisKey)?.identityRetained === true,
    );
    if (!retainsChildIdentity) return false;
    const childIdentity = contract.identities.find(
      ({ unitLevelKey }) => unitLevelKey === readout.observationLevelKey,
    );
    const readoutRows = observations.filter(({ readoutKey }) => readoutKey === readout.key);
    return (
      !childIdentity ||
      readoutRows.length === 0 ||
      readoutRows.some(({ identities }) => !identities[childIdentity.key]?.trim())
    );
  });
}

export type AdaptiveWorkspaceResult = Readonly<{
  status: "ready" | "dedicated_route_required" | "not_representable";
  diagnostics: readonly string[];
  draft: ExperimentSetDraft | null;
  cells: ExperimentCellMap;
  snapshot: AdaptiveInputSnapshot;
}>;

export function adaptiveSurvivalPaste(snapshot: AdaptiveInputSnapshot): string {
  const contract = snapshot.contract;
  const readout = contract.readouts.find(
    ({ representation }) => representation === "event_censoring",
  );
  if (!readout) throw new Error("ADAPTIVE_SURVIVAL_READOUT_MISSING");
  const identityKey =
    contract.identities.find(
      ({ unitLevelKey }) => unitLevelKey === contract.experimentalUnitLevelKey,
    )?.key ?? contract.identities[0]!.key;
  return [
    "Unit ID\tGroup\tFollow-up time\tStatus",
    ...snapshot.canonicalObservations
      .filter(({ readoutKey }) => readoutKey === readout.key)
      .map((row) => {
        const followUp = row.values[`${readout.key}_follow_up`] ?? row.values.follow_up;
        const event = row.values[`${readout.key}_event_observed`] ?? row.values.event_observed;
        const observed = decodeAdaptiveSurvivalStatus(event);
        return [
          row.identities[identityKey],
          contract.factors
            .map((factor) => row.factors[factor.key])
            .filter(Boolean)
            .join(" · ") || "Observed",
          followUp,
          observed ? "Event" : "Censored",
        ].join("\t");
      }),
  ].join("\n");
}

export function createAdaptiveWorkspace(input: {
  contract: StructureContract;
  observations: readonly CanonicalAdaptiveObservation[];
  mapping: AdaptiveColumnMapping | null;
  lineage: AdaptiveRawLineage | null;
  /** Validated researcher-facing canvas provenance; never a semantic write authority. */
  biologicalSetup?: BiologicalSetupPresentation | null;
  confirmedTargetedConfirmations?: AdaptiveInputSnapshot["targetedConfirmations"];
  now?: string;
}): AdaptiveWorkspaceResult {
  const now = input.now ?? new Date().toISOString();
  const contract = input.contract;
  const biologicalSetupValidation = input.biologicalSetup
    ? createBiologicalSetupPrefill({ contract, ...input.biologicalSetup })
    : null;
  const biologicalSetupDiagnostics =
    biologicalSetupValidation?.status === "stopped"
      ? ["biological_setup_presentation_contract_mismatch"]
      : [];
  const observationDiagnostics = validateCanonicalObservationsForContract(
    contract,
    input.observations,
  );
  const factorCombinations = combinations(contract);
  const hasSingleUnambiguousReferenceCell =
    contract.factors.length > 0 &&
    contract.factors.every(({ referenceLevel }) => Boolean(referenceLevel));
  const conditions: ConditionDraft[] = factorCombinations.map((combination, index) => ({
    id: conditionId(index),
    label: contract.factors.length
      ? contract.factors.map((factor) => combination[factor.key]).join(" · ")
      : "Observed",
    attributes: Object.fromEntries(
      contract.factors.map((factor) => [`factor.${factor.key}`, combination[factor.key]!]),
    ),
    ...(hasSingleUnambiguousReferenceCell &&
    contract.factors.every((factor) => combination[factor.key] === factor.referenceLevel)
      ? { role: "primary" as const }
      : {}),
  }));
  if (!conditions.length)
    conditions.push({ id: conditionId(0), label: "Observed", attributes: {} });
  const experimentalUnitIdentityKey =
    contract.identities.find(
      ({ unitLevelKey }) => unitLevelKey === contract.experimentalUnitLevelKey,
    )?.key ?? contract.identities[0]!.key;
  const identityKey = contract.matching.identityKey ?? experimentalUnitIdentityKey;
  const matchedIdentities = [
    ...new Set(input.observations.map((row) => row.identities[identityKey]).filter(Boolean)),
  ];
  const observationsByCondition = conditions.map((condition) =>
    input.observations.filter((row) =>
      contract.factors.every(
        (factor) => row.factors[factor.key] === condition.attributes[`factor.${factor.key}`],
      ),
    ),
  );
  const conditionStatuses = conditions.map(
    (_, index) => input.biologicalSetup?.conditionCombinations[index]?.status ?? "performed",
  );
  const conditionStatusDiagnostics = observationsByCondition.flatMap((rows, index) =>
    rows.length > 0 && conditionStatuses[index] !== "performed"
      ? [`adaptive_observation_in_${conditionStatuses[index]}_condition:${conditionId(index)}`]
      : [],
  );
  // Establish the unit order once per condition, before selecting a readout.
  // Readouts may be collected for unequal subsets of units.  Deriving this
  // order from each readout independently would make a missing middle value
  // shift the following readout into the wrong experiment session.
  const conditionIdentityValues = observationsByCondition.map((rows) => [
    ...new Set(rows.map((row) => row.identities[experimentalUnitIdentityKey]).filter(Boolean)),
  ]);
  const sessionCount =
    contract.matching.kind === "matched"
      ? Math.max(1, matchedIdentities.length)
      : Math.max(
          1,
          ...observationsByCondition.map(
            (rows) =>
              new Set(
                rows.map((row) => row.identities[experimentalUnitIdentityKey]).filter(Boolean),
              ).size,
          ),
        );
  const experimentalUnitLabel =
    contract.unitLevels.find(({ key }) => key === contract.experimentalUnitLevelKey)?.label ??
    "Experimental unit";
  const experiments = Array.from({ length: sessionCount }, (_, index) => ({
    id: `adaptive-session.${index + 1}`,
    label:
      contract.matching.kind === "matched"
        ? (matchedIdentities[index] ?? `Unit ${index + 1}`)
        : `入力行 ${index + 1}`,
    stableUnitId:
      contract.matching.kind === "matched" ? `adaptive-unit.${index + 1}` : `unit.${index + 1}`,
    // The worksheet row is presentation state. A run/day/batch identity must
    // come from an explicit researcher fact, never from this ordinal.
    // Opening or editing a project is not evidence of when the experiment was run.
    date: "",
    note: "Adaptive input",
  }));
  const orderedAxis = contract.orderedAxes.length === 1 ? contract.orderedAxes[0] : null;
  const orderedAxisIsTime = orderedAxis ? isTemporalOrderedAxis(orderedAxis) : false;
  const legacyOrderedAxisDiagnostics = contract.orderedAxes.flatMap((axis) =>
    axis.levels.flatMap((level, index) =>
      typeof level === "number" && Number.isFinite(level)
        ? []
        : [
            `legacy_workspace_cannot_losslessly_project_ordered_axis_level:${axis.key}:${index + 1}:${JSON.stringify(level)}`,
          ],
    ),
  );
  const topology = matchedTopology(contract);
  const draftBase: ExperimentSetDraft = {
    version: "0.1.0",
    dataOrigin: "research",
    context: "general_assay",
    entryRoute: "adaptive-input-alpha",
    name: contract.experimentName,
    readouts: contract.readouts.map((readout) => readoutDraft(contract, readout)),
    attributes: contract.factors.map((factor) => ({
      id: `factor.${factor.key}`,
      label: factor.label,
      unitRole: factor.unitRole,
      relationship: factor.relationship === "blocked" ? "independent" : factor.relationship,
      scientificRole: "intervention",
    })),
    conditions,
    controlConditionId: conditions.find(({ role }) => role === "primary")?.id,
    analysisIntent: { kind: "group_comparison" },
    conditionAssignment: {
      kind: contract.matching.kind === "matched" ? "matched" : "independent",
      unitLabel: experimentalUnitLabel,
      ...(topology ? { matchedTopology: topology } : {}),
    },
    time: orderedAxis
      ? {
          sampling: orderedAxis.identityRetained ? "longitudinal" : "cross_sectional",
          unit: ["sec", "min", "h", "day"].includes(orderedAxis.unit)
            ? (orderedAxis.unit as "sec" | "min" | "h" | "day")
            : "h",
          points: orderedAxis.levels
            .filter((level): level is number => typeof level === "number")
            .map((level, index) => ({ id: `axis.${orderedAxis.key}.${index + 1}`, value: level })),
          axisSemantic: orderedAxisIsTime ? "time" : "numeric_covariate",
          axisTitle: orderedAxis.label,
          axisUnit: orderedAxis.unit,
          scientificRole: orderedAxisIsTime ? "time" : "other",
          unitRole: orderedAxis.identityRetained ? "within_unit" : "between_unit",
          relationship: orderedAxis.identityRetained ? "repeated" : "independent",
        }
      : { sampling: "none", unit: "h", points: [] },
    experiments,
  };
  const plannedN = plannedExperimentalUnitCount(draftBase);
  const design = projectContractToExperimentDesign(contract, plannedN, now);
  const equivalence = assertDualWriteEquivalence(contract, design, now);
  const snapshot = AdaptiveInputSnapshotSchema.parse({
    schemaVersion: "0.1.0",
    featureFlag: "experiment_first_adaptive_input_alpha",
    contract,
    surface: selectAdaptiveSurface(contract),
    mapping: input.mapping,
    rawLineage: input.lineage,
    canonicalObservations: input.observations,
    equivalence,
    targetedConfirmations: [...(input.confirmedTargetedConfirmations ?? [])],
    ...(biologicalSetupValidation?.status === "ready" && input.biologicalSetup
      ? { biologicalSetup: input.biologicalSetup }
      : {}),
  });
  const nestedAxisTrackingUnsafe = requiresExplicitNestedAxisTracking(contract, input.observations);
  if (
    observationDiagnostics.length ||
    conditionStatusDiagnostics.length ||
    nestedAxisTrackingUnsafe ||
    biologicalSetupDiagnostics.length
  )
    return {
      status: "not_representable",
      diagnostics: [
        ...observationDiagnostics,
        ...conditionStatusDiagnostics,
        ...biologicalSetupDiagnostics,
        ...(nestedAxisTrackingUnsafe
          ? ["legacy_workspace_requires_explicit_nested_axis_tracking_identity"]
          : []),
      ],
      draft: null,
      cells: {},
      snapshot,
    };
  const compatibility = design.adaptiveStructure?.analysisCompatibility ?? "blocked";
  const dedicatedSurvival = contract.readouts.some(
    (readout) => readout.representation === "event_censoring",
  );
  if (dedicatedSurvival)
    return {
      status: "dedicated_route_required",
      diagnostics: design.adaptiveStructure?.diagnostics ?? [],
      draft: null,
      cells: {},
      snapshot,
    };
  const dedicatedDoseResponse = contract.readouts.some(
    (readout) => readout.representation === "dose_response",
  );
  if (dedicatedDoseResponse)
    return {
      status: "not_representable",
      diagnostics: [
        ...(design.adaptiveStructure?.diagnostics ?? []),
        "dose_response_requires_explicit_nonlinear_model_route",
      ],
      draft: null,
      cells: {},
      snapshot,
    };
  if (legacyOrderedAxisDiagnostics.length)
    return {
      status: "not_representable",
      diagnostics: legacyOrderedAxisDiagnostics,
      draft: null,
      cells: {},
      snapshot,
    };
  if (compatibility === "blocked" || equivalence.status !== "equivalent")
    return {
      status: "not_representable",
      diagnostics: [
        ...(design.adaptiveStructure?.diagnostics ?? []),
        ...equivalence.diagnostics,
      ].filter((diagnostic, index, all) => all.indexOf(diagnostic) === index),
      draft: null,
      cells: {},
      snapshot,
    };

  const cells: Record<string, ExperimentCellDraft> = {};
  experiments.forEach((experiment, sessionIndex) => {
    conditions.forEach((condition, conditionIndex) => {
      const availability =
        conditionStatuses[conditionIndex] === "not_performed"
          ? { availability: "not_planned" as const }
          : {};
      contract.readouts.forEach((readout) => {
        const rows = observationsByCondition[conditionIndex]!.filter(
          (row) =>
            row.readoutKey === readout.key &&
            (draftBase.conditionAssignment.kind !== "matched" ||
              row.identities[identityKey] === experiment.label),
        );
        const identityValues = conditionIdentityValues[conditionIndex]!;
        const selectedRows =
          draftBase.conditionAssignment.kind === "matched"
            ? rows
            : rows.filter(
                (row) =>
                  row.identities[experimentalUnitIdentityKey] === identityValues[sessionIndex],
              );
        const timePoints = draftBase.time.points.length
          ? draftBase.time.points
          : [{ id: undefined, value: undefined }];
        timePoints.forEach((point) => {
          const pointRows =
            point.value === undefined || !orderedAxis
              ? selectedRows
              : selectedRows.filter((row) => Number(row.axes[orderedAxis.key]) === point.value);
          const key = experimentCellKey({
            experimentId: experiment.id,
            conditionId: condition.id,
            readoutId: `outcome.${readout.key}`,
            ...(point.id ? { timePointId: point.id } : {}),
          });
          if (readout.representation === "proportion_counts") {
            const numerator = resolveCanonicalReadoutValue(
              readout,
              pointRows[0] ?? { values: {} },
              readout.componentKeys[0],
            );
            const denominator = resolveCanonicalReadoutValue(
              readout,
              pointRows[0] ?? { values: {} },
              readout.componentKeys[1],
            );
            cells[key] = {
              kind: "proportion",
              positive: numeric(numerator.value),
              eligible: numeric(denominator.value),
              ...availability,
            };
          } else if (readout.representation === "category_counts")
            cells[key] = {
              kind: "categorical_counts",
              counts: Object.fromEntries(
                readout.componentKeys.map((component) => [
                  component,
                  numeric(
                    resolveCanonicalReadoutValue(readout, pointRows[0] ?? { values: {} }, component)
                      .value,
                  ),
                ]),
              ),
              ...availability,
            };
          else if (readout.representation === "target_reference") {
            const targetComponent =
              readout.componentKeys.find((component) => component === "target") ??
              readout.componentKeys[0];
            const referenceComponent =
              readout.componentKeys.find((component) => component === "reference") ??
              readout.componentKeys[1];
            cells[key] = {
              kind: "wb_ratio",
              target: numeric(
                resolveCanonicalReadoutValue(
                  readout,
                  pointRows[0] ?? { values: {} },
                  targetComponent,
                ).value,
              ),
              reference: numeric(
                resolveCanonicalReadoutValue(
                  readout,
                  pointRows[0] ?? { values: {} },
                  referenceComponent,
                ).value,
              ),
              inputMode: "corrected_value",
              ...availability,
            };
          } else {
            const observationIdentityKey = contract.identities.find(
              (identity) => identity.unitLevelKey === readout.observationLevelKey,
            )?.key;
            const observedRows = pointRows
              .map((row) => {
                const resolved = resolveCanonicalReadoutValue(readout, row);
                return {
                  value: numeric(resolved.value),
                  identity: observationIdentityKey
                    ? (row.identities[observationIdentityKey] ?? "")
                    : "",
                };
              })
              .filter(
                (candidate): candidate is { value: number; identity: string } =>
                  candidate.value !== null,
              );
            const observedIdentities = observedRows.map(({ identity }) => identity);
            cells[key] = {
              kind: "nested_continuous",
              source: "paste",
              rawValues: observedRows.map(({ value }) => value),
              ...availability,
              // Values and child identities must be filtered as one record.  Filtering
              // them independently shifts IDs after an interior missing observation.
              ...(observedIdentities.every(Boolean)
                ? { observationUnitIds: observedIdentities }
                : {}),
            };
          }
        });
      });
    });
  });
  return {
    status: "ready",
    diagnostics: [],
    draft: { ...draftBase, adaptiveInput: snapshot },
    cells,
    snapshot,
  };
}

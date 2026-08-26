import {
  AdaptiveInputSnapshotSchema,
  type AdaptiveColumnMapping,
  type AdaptiveInputSnapshot,
  type AdaptiveRawLineage,
  type CanonicalAdaptiveObservation,
  type StructureContract,
} from "@lsaa/domain";
import {
  assertDualWriteEquivalence,
  projectContractToExperimentDesign,
  selectAdaptiveSurface,
  targetedConfirmationsFor,
} from "@lsaa/adaptive-input";
import {
  experimentCellKey,
  type ConditionDraft,
  type ExperimentCellDraft,
  type ExperimentCellMap,
  type ExperimentSetDraft,
  type ReadoutDraft,
} from "./experimentDraft";

const combinations = (contract: StructureContract): Array<Record<string, string>> =>
  contract.factors.reduce<Array<Record<string, string>>>((rows, factor) => rows.flatMap((row) => factor.levels.map((level) => ({ ...row, [factor.key]: level }))), [{}]);

const conditionId = (index: number) => `condition.${index + 1}`;

function readoutDraft(contract: StructureContract, readout: StructureContract["readouts"][number]): ReadoutDraft {
  if (readout.representation === "proportion_counts") return { id: `outcome.${readout.key}`, label: readout.label, shape: "proportion" };
  if (readout.representation === "category_counts") return { id: `outcome.${readout.key}`, label: readout.label, shape: "categorical_counts", categories: readout.componentKeys.map((key) => ({ id: key, label: key })) };
  if (readout.representation === "target_reference") return { id: `outcome.${readout.key}`, label: readout.label, shape: "wb_ratio", referenceLabel: "Reference", wbInputMode: "corrected_value" };
  return { id: `outcome.${readout.key}`, label: readout.label, shape: "nested_continuous", nestedInputMode: readout.observationLevelKey === contract.experimentalUnitLevelKey ? "unit_summary" : "nested_observations" };
}

function numeric(value: unknown): number | null {
  return typeof value === "number" && Number.isFinite(value) ? value : typeof value === "string" && value.trim() && Number.isFinite(Number(value)) ? Number(value) : null;
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
  const readout = contract.readouts.find(({ representation }) => representation === "event_censoring");
  if (!readout) throw new Error("ADAPTIVE_SURVIVAL_READOUT_MISSING");
  const identityKey = contract.identities.find(({ unitLevelKey }) => unitLevelKey === contract.experimentalUnitLevelKey)?.key ?? contract.identities[0]!.key;
  return [
    "Unit ID\tGroup\tFollow-up time\tStatus",
    ...snapshot.canonicalObservations.filter(({ readoutKey }) => readoutKey === readout.key).map((row) => {
      const followUp = row.values[`${readout.key}_follow_up`] ?? row.values.follow_up;
      const event = row.values[`${readout.key}_event_observed`] ?? row.values.event_observed;
      const observed = event === true || ["true", "1", "event", "observed"].includes(String(event).toLowerCase());
      return [row.identities[identityKey], contract.factors.map((factor) => row.factors[factor.key]).filter(Boolean).join(" · ") || "Observed", followUp, observed ? "Event" : "Censored"].join("\t");
    }),
  ].join("\n");
}

export function createAdaptiveWorkspace(input: {
  contract: StructureContract;
  observations: readonly CanonicalAdaptiveObservation[];
  mapping: AdaptiveColumnMapping | null;
  lineage: AdaptiveRawLineage | null;
  now?: string;
}): AdaptiveWorkspaceResult {
  const now = input.now ?? new Date().toISOString();
  const contract = input.contract;
  const factorCombinations = combinations(contract);
  const conditions: ConditionDraft[] = factorCombinations.map((combination, index) => ({
    id: conditionId(index),
    label: contract.factors.length ? contract.factors.map((factor) => combination[factor.key]).join(" · ") : "Observed",
    attributes: Object.fromEntries(contract.factors.map((factor) => [`factor.${factor.key}`, combination[factor.key]!])) ,
    ...(contract.factors.some((factor) => factor.referenceLevel && combination[factor.key] === factor.referenceLevel) ? { role: "primary" as const } : {}),
  }));
  if (!conditions.length) conditions.push({ id: conditionId(0), label: "Observed", attributes: {} });
  const identityKey = contract.matching.identityKey ?? contract.identities[0]!.key;
  const matchedIdentities = [...new Set(input.observations.map((row) => row.identities[identityKey]).filter(Boolean))];
  const observationsByCondition = conditions.map((condition) => input.observations.filter((row) => contract.factors.every((factor) => row.factors[factor.key] === condition.attributes[`factor.${factor.key}`])));
  const sessionCount = contract.matching.kind === "matched" ? matchedIdentities.length : Math.max(1, ...observationsByCondition.map((rows) => new Set(rows.map((row) => row.identities[contract.identities[0]!.key])).size));
  const experiments = Array.from({ length: sessionCount }, (_, index) => ({ id: `adaptive-session.${index + 1}`, label: contract.matching.kind === "matched" ? matchedIdentities[index] ?? `Unit ${index + 1}` : `Run ${index + 1}`, stableUnitId: contract.matching.kind === "matched" ? matchedIdentities[index] ?? `unit.${index + 1}` : `unit.${index + 1}`, sessionId: `session.${index + 1}`, date: now.slice(0, 10), note: "Adaptive input" }));
  const timeAxis = contract.orderedAxes.length === 1 ? contract.orderedAxes[0] : null;
  const draftBase: ExperimentSetDraft = {
    version: "0.1.0", dataOrigin: "research", context: "general_assay", entryRoute: "adaptive-input-alpha", name: contract.experimentName,
    readouts: contract.readouts.map((readout) => readoutDraft(contract, readout)),
    attributes: contract.factors.map((factor) => ({ id: `factor.${factor.key}`, label: factor.label, unitRole: factor.unitRole, relationship: factor.relationship === "blocked" ? "independent" : factor.relationship, scientificRole: "intervention" })),
    conditions,
    controlConditionId: conditions.find(({ role }) => role === "primary")?.id,
    analysisIntent: { kind: "group_comparison" },
    conditionAssignment: { kind: contract.matching.kind === "matched" ? "matched" : "independent", unitLabel: contract.unitLevels.find(({ key }) => key === contract.experimentalUnitLevelKey)?.label ?? "Experimental unit" },
    time: timeAxis ? { sampling: timeAxis.identityRetained ? "longitudinal" : "cross_sectional", unit: ["sec", "min", "h", "day"].includes(timeAxis.unit) ? timeAxis.unit as "sec" | "min" | "h" | "day" : "h", points: timeAxis.levels.filter((level): level is number => typeof level === "number").map((level, index) => ({ id: `axis.${timeAxis.key}.${index + 1}`, value: level })), axisSemantic: "time", axisTitle: timeAxis.label, axisUnit: timeAxis.unit, unitRole: timeAxis.identityRetained ? "within_unit" : "between_unit", relationship: timeAxis.identityRetained ? "repeated" : "independent" } : { sampling: "none", unit: "h", points: [] },
    experiments,
  };
  const plannedN = draftBase.conditionAssignment.kind === "matched" ? experiments.length : experiments.length * conditions.length;
  const design = projectContractToExperimentDesign(contract, plannedN, now);
  const equivalence = assertDualWriteEquivalence(contract, design, now);
  const snapshot = AdaptiveInputSnapshotSchema.parse({ schemaVersion: "0.1.0", featureFlag: "experiment_first_adaptive_input_alpha", contract, surface: selectAdaptiveSurface(contract), mapping: input.mapping, rawLineage: input.lineage, canonicalObservations: input.observations, equivalence, targetedConfirmations: targetedConfirmationsFor(contract).map((confirmation) => ({ key: confirmation.key, answer: "confirmed", confirmedAt: now })) });
  const compatibility = design.adaptiveStructure?.analysisCompatibility ?? "blocked";
  const dedicatedSurvival = contract.readouts.some((readout) => readout.representation === "event_censoring");
  if (dedicatedSurvival) return { status: "dedicated_route_required", diagnostics: design.adaptiveStructure?.diagnostics ?? [], draft: null, cells: {}, snapshot };
  // Analysis compatibility is deliberately separate from entry representability.
  // The versioned contract and canonical rows remain lossless even when the
  // legacy engine must stop before analysis.

  const cells: Record<string, ExperimentCellDraft> = {};
  experiments.forEach((experiment, sessionIndex) => {
    conditions.forEach((condition, conditionIndex) => {
      contract.readouts.forEach((readout) => {
        const rows = observationsByCondition[conditionIndex]!.filter((row) => row.readoutKey === readout.key && (draftBase.conditionAssignment.kind !== "matched" || row.identities[identityKey] === experiment.stableUnitId));
        const identityValues = [...new Set(rows.map((row) => row.identities[contract.identities[0]!.key]))];
        const selectedRows = draftBase.conditionAssignment.kind === "matched" ? rows : rows.filter((row) => row.identities[contract.identities[0]!.key] === identityValues[sessionIndex]);
        const timePoints = draftBase.time.points.length ? draftBase.time.points : [{ id: undefined, value: undefined }];
        timePoints.forEach((point) => {
          const pointRows = point.value === undefined || !timeAxis ? selectedRows : selectedRows.filter((row) => Number(row.axes[timeAxis.key]) === point.value);
          const key = experimentCellKey({ experimentId: experiment.id, conditionId: condition.id, readoutId: `outcome.${readout.key}`, ...(point.id ? { timePointId: point.id } : {}) });
          if (readout.representation === "proportion_counts") cells[key] = { kind: "proportion", positive: numeric(pointRows[0]?.values[`${readout.key}_numerator`]), eligible: numeric(pointRows[0]?.values[`${readout.key}_denominator`]) };
          else if (readout.representation === "category_counts") cells[key] = { kind: "categorical_counts", counts: Object.fromEntries(readout.componentKeys.map((component) => [component, numeric(pointRows[0]?.values[`${readout.key}_${component}`])])) };
          else if (readout.representation === "target_reference") cells[key] = { kind: "wb_ratio", target: numeric(pointRows[0]?.values[`${readout.key}_target`]), reference: numeric(pointRows[0]?.values[`${readout.key}_reference`]), inputMode: "corrected_value" };
          else cells[key] = { kind: "nested_continuous", source: "paste", rawValues: pointRows.map((row) => numeric(row.values[readout.key])).filter((candidate): candidate is number => candidate !== null), observationUnitIds: pointRows.map((row) => row.identities[contract.identities.find((identity) => identity.unitLevelKey === readout.observationLevelKey)?.key ?? ""]).filter(Boolean) };
        });
      });
    });
  });
  return { status: "ready", diagnostics: compatibility === "blocked" ? design.adaptiveStructure?.diagnostics ?? [] : [], draft: { ...draftBase, adaptiveInput: snapshot }, cells, snapshot };
}

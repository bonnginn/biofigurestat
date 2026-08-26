import type { AdaptiveInputSnapshot, Observation, UnitInstance } from "@lsaa/domain";
import { createInitialProjectState, ProjectStateSchema, type ProjectState } from "@lsaa/project";
import { assertDualWriteEquivalence, projectContractToExperimentDesign } from "@lsaa/adaptive-input";

const token = (value: string) => value.normalize("NFKC").replace(/[^A-Za-z0-9._:-]+/g, "-").replace(/^-+|-+$/g, "").slice(0, 64) || "unit";

/** Creates the save/open companion for a typed event/censoring snapshot. */
export function createAdaptiveSurvivalProject(snapshot: AdaptiveInputSnapshot, now = new Date().toISOString()): ProjectState {
  const contract = snapshot.contract;
  const readout = contract.readouts.find(({ representation }) => representation === "event_censoring");
  if (!readout) throw new Error("ADAPTIVE_SURVIVAL_READOUT_MISSING");
  const rows = snapshot.canonicalObservations.filter(({ readoutKey }) => readoutKey === readout.key);
  const design = projectContractToExperimentDesign(contract, Math.max(1, rows.length), now);
  assertDualWriteEquivalence(contract, design, now);
  const identityKey = contract.identities.find(({ unitLevelKey }) => unitLevelKey === contract.experimentalUnitLevelKey)?.key ?? contract.identities[0]!.key;
  const combinations = contract.factors.reduce<Array<Record<string, string>>>((items, factor) => items.flatMap((item) => factor.levels.map((level) => ({ ...item, [factor.key]: level }))), [{}]);
  const units: UnitInstance[] = [];
  const observations: Observation[] = [];
  const seenUnits = new Set<string>();
  rows.forEach((row, index) => {
    const identity = row.identities[identityKey];
    if (!identity) throw new Error(`ADAPTIVE_REQUIRED_IDENTITY_MISSING:${row.observationId}`);
    const unitId = `unit.adaptive.${token(identity)}`;
    if (seenUnits.has(unitId)) throw new Error(`ADAPTIVE_DUPLICATE_SURVIVAL_IDENTITY:${identity}`);
    seenUnits.add(unitId);
    units.push({ id: unitId, levelId: design.experimentalUnitLevelId, parentUnitId: null, label: identity, metadata: { semanticIdentity: identity } });
    const conditionIndex = combinations.findIndex((combination) => contract.factors.every((factor) => combination[factor.key] === row.factors[factor.key]));
    const followUp = row.values[`${readout.key}_follow_up`] ?? row.values.follow_up;
    const event = row.values[`${readout.key}_event_observed`] ?? row.values.event_observed;
    const eventObserved = event === true || ["true", "1", "event", "observed"].includes(String(event).toLowerCase());
    if (conditionIndex < 0 || typeof followUp !== "number" || !Number.isFinite(followUp) || followUp < 0) throw new Error(`ADAPTIVE_INVALID_SURVIVAL_ROW:${row.observationId}`);
    observations.push({ id: `observation.adaptive.${index + 1}`, rawRevisionId: "raw.adaptive.1", unitInstanceId: unitId, conditionId: `condition.${conditionIndex + 1}`, outcomeId: `outcome.${readout.key}`, measurement: { kind: "time_to_event", followUpTime: followUp, eventObserved }, sourceLocation: `adaptive:${row.observationId}` });
  });
  const base = createInitialProjectState({ metadata: { projectId: `project.${contract.contractId}`, projectName: contract.experimentName, experimentDate: "", createdAt: now, updatedAt: now }, design, rawRevision: { id: "raw.adaptive.1", previousRevisionId: null, sourceKind: snapshot.rawLineage?.sourceKind === "clipboard" ? "paste" : "csv", createdAt: now, createdBy: "local-user" }, unitInstances: units, observations, actor: "local-user" });
  return ProjectStateSchema.parse({ ...base, adaptiveInput: snapshot });
}

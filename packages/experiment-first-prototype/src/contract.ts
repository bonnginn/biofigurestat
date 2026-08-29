export const STRUCTURE_CONTRACT_VERSION = "0.1.0-prototype" as const;

export type UnitRole = "experimental_unit" | "block" | "sample" | "subsample" | "technical_replicate" | "sampling_location" | "condition_specific_sample";
export interface UnitLevel { key: string; label: string; role: UnitRole; parentKey: string | null }
export interface IdentityField { key: string; label: string; unitLevelKey: string; required: boolean }
export interface Factor { key: string; label: string; levels: string[]; unitRole: "between_unit" | "within_unit"; relationship: "independent" | "paired" | "repeated" | "blocked"; ordered: boolean; referenceLevel: string | null }
export interface OrderedAxis { key: string; label: string; unit: string; levels: Array<string | number>; sampling: "cross_sectional" | "repeated_same_identity" | "event_follow_up"; identityRetained: boolean }
export type ReadoutRepresentation = "scalar" | "proportion_counts" | "category_counts" | "target_reference" | "paired_readouts" | "event_censoring" | "dose_response" | "other_typed_bundle";
export interface Readout { key: string; label: string; valueType: string; representation: ReadoutRepresentation; componentKeys: string[]; referenceRole: "none" | "loading_control" | "baseline" | "control_condition"; observationLevelKey: string; axisKeys: string[] }
export type MissingnessKind = "not_applicable" | "not_collected" | "assay_failed" | "dropout" | "censored" | "unknown";

export interface StructureContract {
  schemaVersion: typeof STRUCTURE_CONTRACT_VERSION;
  caseId: string;
  experimentDescription: string;
  unitLevels: UnitLevel[];
  experimentalUnitLevelKey: string;
  identities: IdentityField[];
  factors: Factor[];
  matching: { kind: "independent" | "matched" | "blocked" | "mixed" | "crossover" | "none"; identityKey: string | null; completeSetsRequired: boolean | null };
  orderedAxes: OrderedAxis[];
  readouts: Readout[];
  allowedMissingness: MissingnessKind[];
  rawObservationGrain: string;
}

export type SurfaceId = "compact_unit_matrix" | "factor_observation_table" | "repeated_axis_matrix" | "nested_observation_table" | "typed_record_table";
const SURFACE_IDS = new Set<SurfaceId>(["compact_unit_matrix", "factor_observation_table", "repeated_axis_matrix", "nested_observation_table", "typed_record_table"]);

export function parseSurfaceId(value: string): SurfaceId {
  if (!SURFACE_IDS.has(value as SurfaceId)) throw new Error(`Unknown surface ID: ${value}`);
  return value as SurfaceId;
}

export function validateStructureContract(contract: StructureContract): StructureContract {
  if (contract.schemaVersion !== STRUCTURE_CONTRACT_VERSION) throw new Error("Unsupported contract version");
  if (!contract.caseId || !contract.experimentDescription) throw new Error("Case ID and description are required");
  if (!contract.unitLevels.length || !contract.identities.length || !contract.readouts.length) throw new Error("Unit, identity, and readout are required");
  const levelByKey = new Map(contract.unitLevels.map((level) => [level.key, level]));
  if (levelByKey.size !== contract.unitLevels.length) throw new Error("Unit level keys must be unique");
  const experimental = levelByKey.get(contract.experimentalUnitLevelKey);
  if (!experimental || experimental.role !== "experimental_unit") throw new Error("Experimental-unit key must reference an experimental_unit level");
  for (const level of contract.unitLevels) {
    if (level.parentKey !== null && !levelByKey.has(level.parentKey)) throw new Error(`Unknown parent level: ${level.parentKey}`);
    const visited = new Set<string>();
    let cursor: UnitLevel | undefined = level;
    while (cursor) {
      if (visited.has(cursor.key)) throw new Error("Unit hierarchy contains a cycle");
      visited.add(cursor.key);
      cursor = cursor.parentKey ? levelByKey.get(cursor.parentKey) : undefined;
    }
  }
  for (const identity of contract.identities) if (!levelByKey.has(identity.unitLevelKey)) throw new Error(`Identity references unknown level: ${identity.label}`);
  if (!["independent", "none"].includes(contract.matching.kind) && !contract.matching.identityKey) throw new Error("Matched/blocked/mixed designs require an identity key");
  if (new Set(contract.factors.map((factor) => factor.key)).size !== contract.factors.length) throw new Error("Factor keys must be unique");
  if (new Set(contract.orderedAxes.map((axis) => axis.key)).size !== contract.orderedAxes.length) throw new Error("Ordered-axis keys must be unique");
  const axisKeys = new Set(contract.orderedAxes.map((axis) => axis.key));
  for (const readout of contract.readouts) {
    if (!levelByKey.has(readout.observationLevelKey)) throw new Error(`Readout references unknown observation level: ${readout.label}`);
    for (const axisKey of readout.axisKeys) if (!axisKeys.has(axisKey)) throw new Error(`Readout references unknown axis: ${axisKey}`);
  }
  return contract;
}

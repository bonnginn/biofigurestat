import type { StructureContract } from "./contract.ts";
import type { CapabilityRequest, EntryFact, SemanticFactKey } from "./staged-readiness.ts";

function fact(key: SemanticFactKey, source: EntryFact["source"]): EntryFact {
  return { key, state: "known", source };
}

export function graphRequestFor(contract: StructureContract): CapabilityRequest {
  const survival = contract.readouts.some((readout) => readout.representation === "event_censoring");
  return {
    capability: "structured_graph",
    graphForm: survival ? "survival" : "summary",
    hasOrderedSequence: contract.orderedAxes.length > 0,
  };
}

export function statisticsRequestFor(contract: StructureContract): CapabilityRequest {
  const hasLowerObservations = contract.unitLevels.some(
    (level) => level.key !== contract.experimentalUnitLevelKey && level.role !== "block",
  );
  const matched =
    !["independent", "none"].includes(contract.matching.kind) ||
    contract.factors.some((factor) => factor.unitRole === "within_unit") ||
    contract.orderedAxes.some((axis) => axis.identityRetained);
  const actualMissingness = contract.allowedMissingness.some((kind) => kind !== "not_applicable");
  return {
    capability: "statistics",
    usesLowerObservations: hasLowerObservations,
    hasOrderedSequence: contract.orderedAxes.length > 0,
    hasMatchedOrRepeatedConditions: matched,
    hasActualMissingness: actualMissingness,
    requiresComparisonChoice: contract.factors.length > 1 || contract.factors.some((factor) => factor.levels.length > 2),
  };
}

export function graphStageFacts(contract: StructureContract): EntryFact[] {
  const facts = [
    fact("condition_plan", "canvas"),
    fact("readout_definition", "canvas"),
    fact("observation_pattern", "researcher_answer"),
    fact("observation_mapping", "data_mapping"),
    fact("graph_grouping", "canvas"),
  ];
  if (contract.orderedAxes.length) facts.push(fact("graph_order", "canvas"));
  if (contract.readouts.some((readout) => readout.representation === "event_censoring")) {
    facts.push(fact("missingness_meaning", "researcher_answer"));
  }
  return facts;
}

export function completeStructureFacts(contract: StructureContract): EntryFact[] {
  const facts = graphStageFacts(contract);
  const add = (key: SemanticFactKey, source: EntryFact["source"] = "researcher_answer") => {
    if (!facts.some((candidate) => candidate.key === key)) facts.push(fact(key, source));
  };
  add("experimental_unit");
  add("assignment_receiver");
  add("source_and_split_lineage");
  add("independent_replication");

  const request = statisticsRequestFor(contract);
  if (request.usesLowerObservations) add("observation_hierarchy");
  if (request.hasOrderedSequence) add("axis_identity_behavior");
  if (request.hasMatchedOrRepeatedConditions) add("matching_identity");
  if (request.hasActualMissingness) add("missingness_meaning");
  if (request.requiresComparisonChoice) add("comparison_scope");
  return facts;
}

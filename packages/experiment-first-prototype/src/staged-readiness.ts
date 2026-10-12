export type EntryCapability = "data_retained" | "adaptive_input" | "graph_preview" | "structured_graph" | "statistics" | "methods";
export type FactState = "known" | "unknown" | "irrecoverable" | "unsupported";
export type SemanticFactKey =
  | "condition_plan"
  | "readout_definition"
  | "observation_pattern"
  | "observation_mapping"
  | "graph_grouping"
  | "graph_order"
  | "graph_identity"
  | "experimental_unit"
  | "assignment_receiver"
  | "source_and_split_lineage"
  | "independent_replication"
  | "matching_identity"
  | "observation_hierarchy"
  | "axis_identity_behavior"
  | "missingness_meaning"
  | "comparison_scope"
  | "executed_analysis";

export interface EntryFact {
  key: SemanticFactKey;
  state: FactState;
  source: "researcher_answer" | "canvas" | "data_mapping" | "safe_rule" | "analysis_execution";
}

export interface CapabilityRequest {
  capability: EntryCapability;
  graphForm?: "summary" | "individual_points" | "paired_lines" | "individual_trajectory" | "survival";
  usesLowerObservations?: boolean;
  hasOrderedSequence?: boolean;
  hasMatchedOrRepeatedConditions?: boolean;
  hasActualMissingness?: boolean;
  requiresComparisonChoice?: boolean;
}

export interface ReadinessResult {
  capability: EntryCapability;
  status: "READY" | "NEED_MORE_INFORMATION" | "SAFE_UNSUPPORTED";
  requiredNow: SemanticFactKey[];
  askNow: SemanticFactKey[];
  deferred: SemanticFactKey[];
  blockingFacts: SemanticFactKey[];
}

const FACT_ORDER: SemanticFactKey[] = [
  "condition_plan",
  "readout_definition",
  "observation_pattern",
  "observation_mapping",
  "graph_grouping",
  "graph_order",
  "graph_identity",
  "experimental_unit",
  "assignment_receiver",
  "source_and_split_lineage",
  "independent_replication",
  "matching_identity",
  "observation_hierarchy",
  "axis_identity_behavior",
  "missingness_meaning",
  "comparison_scope",
  "executed_analysis",
];

const ALL_STATISTICS_FACTS: SemanticFactKey[] = [
  "condition_plan",
  "readout_definition",
  "observation_mapping",
  "experimental_unit",
  "assignment_receiver",
  "source_and_split_lineage",
  "independent_replication",
];

function uniqueOrdered(values: SemanticFactKey[]): SemanticFactKey[] {
  const present = new Set(values);
  return FACT_ORDER.filter((key) => present.has(key));
}

export function requiredFactsFor(request: CapabilityRequest): SemanticFactKey[] {
  const required: SemanticFactKey[] = ["condition_plan", "readout_definition"];

  if (request.capability !== "data_retained") required.push("observation_pattern");
  if (!["data_retained", "adaptive_input"].includes(request.capability)) required.push("observation_mapping");
  if (["graph_preview", "structured_graph"].includes(request.capability)) {
    required.push("graph_grouping");
    if (request.hasOrderedSequence || request.graphForm === "individual_trajectory" || request.graphForm === "survival") {
      required.push("graph_order");
    }
    if (request.graphForm === "paired_lines" || request.graphForm === "individual_trajectory") required.push("graph_identity");
    if (request.graphForm === "survival") required.push("missingness_meaning");
  }

  if (request.capability === "statistics" || request.capability === "methods") {
    required.push(...ALL_STATISTICS_FACTS);
    if (request.usesLowerObservations) required.push("observation_hierarchy");
    if (request.hasOrderedSequence) required.push("axis_identity_behavior");
    if (request.hasMatchedOrRepeatedConditions) required.push("matching_identity");
    if (request.hasActualMissingness) required.push("missingness_meaning");
    if (request.requiresComparisonChoice) required.push("comparison_scope");
  }

  if (request.capability === "methods") required.push("executed_analysis");
  return uniqueOrdered(required);
}

export function evaluateReadiness(facts: EntryFact[], request: CapabilityRequest): ReadinessResult {
  const byKey = new Map(facts.map((fact) => [fact.key, fact]));
  const requiredNow = requiredFactsFor(request);
  const askNow: SemanticFactKey[] = [];
  const blockingFacts: SemanticFactKey[] = [];
  let unsupported = false;

  for (const key of requiredNow) {
    const state = byKey.get(key)?.state ?? "unknown";
    if (state === "unknown") askNow.push(key);
    if (state === "irrecoverable" || state === "unsupported") {
      blockingFacts.push(key);
      unsupported = true;
    }
  }

  const deferred = FACT_ORDER.filter((key) => !requiredNow.includes(key) && (byKey.get(key)?.state ?? "unknown") !== "known");
  return {
    capability: request.capability,
    status: unsupported ? "SAFE_UNSUPPORTED" : askNow.length ? "NEED_MORE_INFORMATION" : "READY",
    requiredNow,
    askNow,
    deferred,
    blockingFacts,
  };
}

export function nextTargetedQuestion(result: ReadinessResult): SemanticFactKey | null {
  return result.askNow[0] ?? null;
}

const STEPS = new Set(["conditions", "canvas", "flow"]);

/**
 * Pure display-state mapper for the single-screen progressive experiment entry.
 * Semantic readiness remains owned by the experiment model; this only decides
 * which already-rendered card is open and which summaries are actionable.
 */
export function deriveDesignProgress({
  expandedStep = "conditions",
  canvasReady = false,
  conditionAcknowledged = false,
  unknownConditionCount = 0,
  observationReady = false,
  hasObservationIssue = false,
  hasMappingConflict = false,
} = {}) {
  const acknowledged = Boolean(conditionAcknowledged && unknownConditionCount === 0);
  let expanded = STEPS.has(expandedStep) ? expandedStep : "conditions";
  if (!canvasReady) expanded = "conditions";
  else if (expanded === "flow" && !acknowledged) expanded = "canvas";

  const flowReady = Boolean(observationReady && !hasObservationIssue && !hasMappingConflict);
  return {
    expandedStep: expanded,
    conditionAcknowledged: acknowledged,
    canContinueFromCanvas: Boolean(canvasReady && unknownConditionCount === 0),
    flowReady,
    steps: {
      conditions: expanded === "conditions" ? "active" : canvasReady ? "complete" : "available",
      canvas: expanded === "canvas" ? "active" : !canvasReady ? "upcoming" : acknowledged ? "complete" : "available",
      flow: expanded === "flow" ? "active" : !canvasReady || !acknowledged ? "upcoming" : flowReady ? "complete" : "available",
    },
  };
}

import type { DualWriteEquivalence, ExperimentDesign, StructureContract } from "@lsaa/domain";
import {
  assertDualWriteEquivalence,
  projectContractToExperimentDesign,
  type ContractProjectionHints,
} from "@lsaa/adaptive-input";

export function timeToEventProjectionHints(contract: StructureContract): ContractProjectionHints {
  return {
    orderedAxisScientificRoles: Object.fromEntries(
      contract.orderedAxes
        .filter(({ sampling }) => sampling === "event_follow_up")
        .map(({ key }) => [key, "time" as const]),
    ),
  };
}

/**
 * Binds one time-to-event contract to the projection hints used by both the
 * legacy ExperimentDesign projection and its dual-write equivalence check.
 * Keeping the two operations together prevents a follow-up axis from being
 * projected as `time` and then checked against the default `other` role.
 */
export function createTimeToEventContractProjection(contract: StructureContract): Readonly<{
  hints: ContractProjectionHints;
  toExperimentDesign: (plannedN: number, now?: string) => ExperimentDesign;
  assertEquivalent: (design: ExperimentDesign, now?: string) => DualWriteEquivalence;
}> {
  const hints = timeToEventProjectionHints(contract);
  return {
    hints,
    toExperimentDesign: (plannedN, now = new Date().toISOString()) =>
      projectContractToExperimentDesign(contract, plannedN, now, hints),
    assertEquivalent: (design, now = new Date().toISOString()) =>
      assertDualWriteEquivalence(contract, design, now, hints),
  };
}

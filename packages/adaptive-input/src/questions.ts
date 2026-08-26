import type { StructureContract } from "@lsaa/domain";

export type TargetedConfirmation = Readonly<{
  key: "relationship" | "missingness" | "axis_identity";
  reason: string;
  changesSemanticStructure: true;
}>;

export function targetedConfirmationsFor(contract: StructureContract): readonly TargetedConfirmation[] {
  const confirmations: TargetedConfirmation[] = [];
  if (["blocked", "mixed", "crossover"].includes(contract.matching.kind)) {
    confirmations.push({ key: "relationship", reason: "Block, mixed, and crossover answers change the identity relationship graph.", changesSemanticStructure: true });
  }
  if (contract.matching.completeSetsRequired === false) {
    confirmations.push({ key: "missingness", reason: "Incomplete sets must distinguish dropout, assay failure, and structural absence.", changesSemanticStructure: true });
  }
  if (contract.orderedAxes.length > 1) {
    confirmations.push({ key: "axis_identity", reason: "Identity can persist across one ordered axis but not another.", changesSemanticStructure: true });
  }
  return confirmations;
}

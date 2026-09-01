import type { ReadoutShape } from "../../app/experimentDraft";

export type EquivalenceSupportKind =
  | "continuous_independent"
  | "continuous_matched"
  | "continuous_shared_source"
  | "positive_total_independent"
  | "positive_total_matched"
  | "positive_total_shared_source"
  | "specialist_outcome";

export function classifyEquivalenceSupport(input: Readonly<{
  readoutShape: ReadoutShape | undefined;
  relationshipKind?: "same_entity" | "shared_source";
}>): EquivalenceSupportKind {
  if (input.readoutShape === "proportion") {
    if (input.relationshipKind === "shared_source") return "positive_total_shared_source";
    if (input.relationshipKind === "same_entity") return "positive_total_matched";
    return "positive_total_independent";
  }
  if (input.readoutShape !== "nested_continuous") return "specialist_outcome";
  if (input.relationshipKind === "shared_source") return "continuous_shared_source";
  if (input.relationshipKind === "same_entity") return "continuous_matched";
  return "continuous_independent";
}

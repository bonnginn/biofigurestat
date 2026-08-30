import type { BenchmarkOutcome, BenchmarkSupportStatus } from "./benchmarkEvaluation";

export type SupportLimitation =
  | "reduced_inference"
  | "missing_robust_alternative"
  | "generic_design_route"
  | "material_representational_compromise"
  | "ordinary_interaction"
  | "cosmetic_graph_edit"
  | "minor_ux_friction";

const MATERIAL_LIMITATIONS = new Set<SupportLimitation>([
  "reduced_inference",
  "missing_robust_alternative",
  "generic_design_route",
  "material_representational_compromise",
]);

export type SupportClassificationInput = Readonly<{
  scientificallyValidRouteExists: boolean;
  scientificMeaningOrStructureDistorted?: boolean;
  limitations?: readonly SupportLimitation[];
}>;

/** Calibrates support without treating ordinary interaction or cosmetic work as scientific limits. */
export function classifyScientificSupport(
  input: SupportClassificationInput,
): BenchmarkSupportStatus {
  if (!input.scientificallyValidRouteExists) return "impossible";
  if (input.scientificMeaningOrStructureDistorted) return "scientifically_compromising";
  if ((input.limitations ?? []).some((limitation) => MATERIAL_LIMITATIONS.has(limitation))) {
    return "reasonable_workaround";
  }
  return "direct";
}

export function expectedTerminalOutcomeForSupport(
  support: BenchmarkSupportStatus,
): Extract<BenchmarkOutcome, "completed" | "explicit_unsupported"> {
  return support === "impossible" ? "explicit_unsupported" : "completed";
}

export const SUPPORT_CLASSIFICATION_RUBRIC = [
  {
    status: "direct" as const,
    label: "Direct support",
    description:
      "科学的デザインと意図した推論を自然に表現でき、重要な設計要素の欠落や実質的な縮約がない。",
  },
  {
    status: "reasonable_workaround" as const,
    label: "Reasonable workaround",
    description:
      "科学的には妥当だが、endpoint・AUC・maximumへの縮約、robust代替の欠如、generic route、または重要な表現上の妥協がある。",
  },
  {
    status: "scientifically_compromising" as const,
    label: "Scientifically compromising",
    description: "科学的意味または実験構造が実質的に歪む。",
  },
  {
    status: "impossible" as const,
    label: "Impossible",
    description: "科学的に妥当なsupported routeが存在しない。",
  },
] as const;

export const SUPPORT_CLASSIFICATION_MINOR_NOTE =
  "通常のクリック、Graphの外観調整、軽微なUX摩擦だけではDirectから下げません。";

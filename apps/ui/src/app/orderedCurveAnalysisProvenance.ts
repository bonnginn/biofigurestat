import {
  AdaptiveInputSnapshotSchema,
  type AdaptiveInputSnapshot,
} from "@lsaa/domain";

import type { MichaelisReadoutMeaning } from "./orderedCurveAnalysisReadiness";

const MICHAELIS_READOUT_MEANING_KEY = "michaelis_readout_meaning";
const NONLINEAR_MODEL_SELECTION_KEY = "nonlinear_model_selection";

const transformationByMeaning: Record<MichaelisReadoutMeaning, string> = {
  calculated_initial_velocity:
    "recorded Y as calculated initial velocity for Michaelis–Menten readiness",
  raw_time_series_or_other:
    "recorded Y as raw time-series or another non-initial-velocity value; Michaelis–Menten fit remains stopped",
  unknown: "recorded Y meaning as unresolved; Michaelis–Menten fit remains stopped",
};

type OrderedCurveAnalysisProvenanceInput = Readonly<{
  modelId?: string;
  michaelisReadoutMeaning?: MichaelisReadoutMeaning;
}>;

/**
 * Persists the model-specific preparation fact without putting it into the
 * biological StructureContract. A Y value being a calculated initial
 * velocity (or not) is an analysis admissibility fact, while the contract
 * still describes the same ordered observations. Keeping it in the generic
 * targeted-confirmation and raw-lineage channels makes save/open lossless.
 */
export function withOrderedCurveAnalysisProvenance(
  snapshot: AdaptiveInputSnapshot,
  input: OrderedCurveAnalysisProvenanceInput,
  confirmedAt: string,
): AdaptiveInputSnapshot {
  if (!input.modelId && !input.michaelisReadoutMeaning) return snapshot;
  const transformations = [
    ...(input.modelId
      ? [`recorded explicit nonlinear model selection: ${input.modelId}`]
      : []),
    ...(input.michaelisReadoutMeaning
      ? [transformationByMeaning[input.michaelisReadoutMeaning]]
      : []),
  ];
  return AdaptiveInputSnapshotSchema.parse({
    ...snapshot,
    rawLineage: snapshot.rawLineage
      ? {
          ...snapshot.rawLineage,
          transformations: [
            ...new Set([
              ...snapshot.rawLineage.transformations,
              ...transformations,
            ]),
          ],
        }
      : null,
    targetedConfirmations: [
      ...snapshot.targetedConfirmations.filter(
        ({ key }) =>
          key !== MICHAELIS_READOUT_MEANING_KEY && key !== NONLINEAR_MODEL_SELECTION_KEY,
      ),
      ...(input.modelId
        ? [{ key: NONLINEAR_MODEL_SELECTION_KEY, answer: input.modelId, confirmedAt }]
        : []),
      ...(input.michaelisReadoutMeaning
        ? [
            {
              key: MICHAELIS_READOUT_MEANING_KEY,
              answer: input.michaelisReadoutMeaning,
              confirmedAt,
            },
          ]
        : []),
    ],
  });
}

export function restoredNonlinearModelSelection(
  snapshot: AdaptiveInputSnapshot | null | undefined,
): string | undefined {
  return snapshot?.targetedConfirmations.find(
    ({ key }) => key === NONLINEAR_MODEL_SELECTION_KEY,
  )?.answer;
}

export function restoredMichaelisReadoutMeaning(
  snapshot: AdaptiveInputSnapshot | null | undefined,
): MichaelisReadoutMeaning | undefined {
  const answer = snapshot?.targetedConfirmations.find(
    ({ key }) => key === MICHAELIS_READOUT_MEANING_KEY,
  )?.answer;
  return answer === "calculated_initial_velocity" ||
    answer === "raw_time_series_or_other" ||
    answer === "unknown"
    ? answer
    : undefined;
}

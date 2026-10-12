import type { SurfaceId } from "./contract.ts";
import type { ExperimentCanvas } from "./experiment-canvas.ts";
import type { ObservationPatternSet, ObservationRecordSet } from "./observation-pattern.ts";

export interface ComposedSurfaceSelection {
  surfaceId: SurfaceId;
  reasonCodes: string[];
}

export interface AdaptiveSurfaceSection extends ComposedSurfaceSelection {
  recordSetKey: string;
  readoutKeys: string[];
}

export interface AdaptiveSurfacePlan {
  sections: AdaptiveSurfaceSection[];
}

function linkageReadyForStructuredEntry(pattern: ObservationPatternSet, identityKey: string | null): boolean {
  if (!identityKey) return false;
  const identity = pattern.identities.find((candidate) => candidate.key === identityKey);
  return Boolean(
    identity &&
    identity.origin !== "app_row_surrogate" &&
    ["scientific_linkage", "both"].includes(identity.purpose) &&
    ["available", "to_be_collected"].includes(identity.availability),
  );
}

function selectRecordSetSurface(
  canvas: ExperimentCanvas,
  pattern: ObservationPatternSet,
  recordSet: ObservationRecordSet,
): ComposedSurfaceSelection {
  const readoutKeys = new Set(
    pattern.bindings
      .filter((binding) => binding.recordSetKey === recordSet.key && binding.status === "measured")
      .map((binding) => binding.readoutKey),
  );
  const typed = canvas.readouts.some((readout) => readoutKeys.has(readout.key) && readout.representation !== "scalar");
  if (typed) return { surfaceId: "typed_record_table", reasonCodes: ["typed_measurement_bundle"] };

  const level = pattern.levels.find((candidate) => candidate.key === recordSet.observedLevelKey);
  const lowerKinds = new Set(["observed_entity", "sampling_location", "technical_record"]);
  const withinConditionAxisUses = recordSet.axisUses.filter((use) =>
    pattern.axes.find((axis) => axis.key === use.axisKey)?.source.kind === "within_condition_record"
  );
  if (lowerKinds.has(level?.kind ?? "") || withinConditionAxisUses.length > 1) {
    return { surfaceId: "nested_observation_table", reasonCodes: [lowerKinds.has(level?.kind ?? "") ? "within_condition_hierarchy" : "multiple_observation_axes"] };
  }

  const axisUse = withinConditionAxisUses[0];
  const axis = axisUse ? pattern.axes.find((candidate) => candidate.key === axisUse.axisKey) : undefined;
  const fixedAxisCount = axis?.valuePlan.mode === "fixed_global" ? axis.valuePlan.values.length : 0;
  const alignmentNeedsIdentity = !["separate_lists", "unknown"].includes(recordSet.entryAlignment.mode);
  const alignmentReady = !alignmentNeedsIdentity || linkageReadyForStructuredEntry(pattern, recordSet.entryAlignment.identityKey);
  if (
    ["shared_linkage", "same_entity"].includes(recordSet.entryAlignment.mode) &&
    alignmentReady &&
    recordSet.entryAlignment.completeSets === true &&
    withinConditionAxisUses.length <= 1 &&
    fixedAxisCount <= 2
  ) {
    return { surfaceId: "compact_unit_matrix", reasonCodes: ["small_complete_aligned_set"] };
  }
  if (["mixed", "crossover"].includes(recordSet.entryAlignment.mode)) {
    return { surfaceId: "factor_observation_table", reasonCodes: ["mixed_cross_condition_alignment"] };
  }
  if (!alignmentReady) {
    return { surfaceId: "factor_observation_table", reasonCodes: ["scientific_linkage_not_ready"] };
  }
  if (axisUse?.identityBehavior.kind === "same_entity") {
    if (!linkageReadyForStructuredEntry(pattern, axisUse.identityBehavior.identityKey)) {
      return { surfaceId: "factor_observation_table", reasonCodes: ["scientific_linkage_not_ready"] };
    }
    return { surfaceId: "repeated_axis_matrix", reasonCodes: ["same_entity_ordered_sequence"] };
  }
  return { surfaceId: "factor_observation_table", reasonCodes: ["separate_condition_record_lists"] };
}

/**
 * Produces one deterministic section per distinct observation grain. This
 * keeps the five-surface grammar while avoiding one compromised table for
 * readouts measured at different levels.
 */
export function selectSurfacePlanFromCanvasAndPattern(
  canvas: ExperimentCanvas,
  pattern: ObservationPatternSet,
): AdaptiveSurfacePlan {
  return {
    sections: pattern.recordSets.map((recordSet) => {
      const selection = selectRecordSetSurface(canvas, pattern, recordSet);
      const readoutKeys = [...new Set(
        pattern.bindings
          .filter((binding) => binding.recordSetKey === recordSet.key && binding.status === "measured")
          .map((binding) => binding.readoutKey),
      )];
      return { recordSetKey: recordSet.key, readoutKeys, ...selection };
    }),
  };
}

export function selectSurfaceFromCanvasAndPattern(
  canvas: ExperimentCanvas,
  pattern: ObservationPatternSet,
): ComposedSurfaceSelection {
  const typed = canvas.readouts.some((readout) => readout.representation !== "scalar");
  if (typed) return { surfaceId: "typed_record_table", reasonCodes: ["typed_measurement_bundle"] };

  if (pattern.recordSets.length > 1) {
    return { surfaceId: "factor_observation_table", reasonCodes: ["multiple_readout_grains"] };
  }

  const lowerKinds = new Set(["observed_entity", "sampling_location", "technical_record"]);
  const hasLowerObservations = pattern.levels.some((level) => lowerKinds.has(level.kind));
  const recordSet = pattern.recordSets[0]!;
  const withinConditionAxisUses = recordSet.axisUses.filter((use) =>
    pattern.axes.find((axis) => axis.key === use.axisKey)?.source.kind === "within_condition_record"
  );
  if (hasLowerObservations || withinConditionAxisUses.length > 1) {
    return { surfaceId: "nested_observation_table", reasonCodes: [hasLowerObservations ? "within_condition_hierarchy" : "multiple_observation_axes"] };
  }

  const axisUse = withinConditionAxisUses[0];
  const axis = axisUse ? pattern.axes.find((candidate) => candidate.key === axisUse.axisKey) : undefined;
  const fixedAxisCount = axis?.valuePlan.mode === "fixed_global" ? axis.valuePlan.values.length : 0;
  const alignmentNeedsIdentity = !["separate_lists", "unknown"].includes(recordSet.entryAlignment.mode);
  const alignmentReady = !alignmentNeedsIdentity || linkageReadyForStructuredEntry(pattern, recordSet.entryAlignment.identityKey);
  const compactAlignment = ["shared_linkage", "same_entity"].includes(recordSet.entryAlignment.mode) &&
    alignmentReady &&
    recordSet.entryAlignment.completeSets === true &&
    withinConditionAxisUses.length <= 1 &&
    fixedAxisCount <= 2;
  if (compactAlignment) return { surfaceId: "compact_unit_matrix", reasonCodes: ["small_complete_aligned_set"] };

  if (["mixed", "crossover"].includes(recordSet.entryAlignment.mode)) {
    return { surfaceId: "factor_observation_table", reasonCodes: ["mixed_cross_condition_alignment"] };
  }

  if (!alignmentReady) {
    return { surfaceId: "factor_observation_table", reasonCodes: ["scientific_linkage_not_ready"] };
  }

  if (axisUse?.identityBehavior.kind === "same_entity") {
    if (!linkageReadyForStructuredEntry(pattern, axisUse.identityBehavior.identityKey)) {
      return { surfaceId: "factor_observation_table", reasonCodes: ["scientific_linkage_not_ready"] };
    }
    return { surfaceId: "repeated_axis_matrix", reasonCodes: ["same_entity_ordered_sequence"] };
  }

  return { surfaceId: "factor_observation_table", reasonCodes: ["separate_condition_record_lists"] };
}

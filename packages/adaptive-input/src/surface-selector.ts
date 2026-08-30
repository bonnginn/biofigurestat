import {
  AdaptiveSurfaceIdSchema,
  type AdaptiveSurfaceId,
  type StructureContract,
} from "@lsaa/domain";

export type AdaptiveSurfaceSelection = Readonly<{
  surfaceId: AdaptiveSurfaceId;
  reasonCodes: readonly string[];
}>;

export const ADAPTIVE_SURFACE_GRAMMAR = {
  compact_unit_matrix: {
    row: "one stable experimental unit or matched set",
    columns: "identity plus a small condition/readout matrix",
    paste: "rectangular",
  },
  factor_observation_table: {
    row: "one experimental-unit/readout observation",
    columns: "identity, factor, optional axis, readout, value, missingness",
    paste: "tidy",
  },
  repeated_axis_matrix: {
    row: "one stable identity",
    columns: "identity/factor plus ordered-axis levels; long form also accepted",
    paste: "wide_or_long",
  },
  nested_observation_table: {
    row: "one raw observation at the lowest declared level",
    columns: "ancestor identities, lower-level identity, factors, axes, value",
    paste: "tidy_or_file",
  },
  typed_record_table: {
    row: "one typed measurement record",
    columns: "identity/factors plus representation-specific components",
    paste: "tidy",
  },
} as const;

function matchedAtAncestorLevel(contract: StructureContract): boolean {
  if (contract.matching.kind !== "matched" || !contract.matching.identityKey) return false;
  const identity = contract.identities.find(({ key }) => key === contract.matching.identityKey);
  if (!identity || identity.unitLevelKey === contract.experimentalUnitLevelKey) return false;
  const levels = new Map(contract.unitLevels.map((level) => [level.key, level]));
  let cursor = levels.get(contract.experimentalUnitLevelKey);
  while (cursor?.parentKey) {
    if (cursor.parentKey === identity.unitLevelKey) return true;
    cursor = levels.get(cursor.parentKey);
  }
  return false;
}

export function selectAdaptiveSurface(contract: StructureContract): AdaptiveSurfaceSelection {
  const typed = contract.readouts.some((readout) => readout.representation !== "scalar");
  if (typed) return { surfaceId: "typed_record_table", reasonCodes: ["typed_measurement_bundle"] };

  const heterogeneousReadouts =
    contract.readouts.length > 1 &&
    new Set(
      contract.readouts.map(
        (readout) => `${readout.observationLevelKey}|${readout.axisKeys.join(",")}`,
      ),
    ).size > 1;
  if (heterogeneousReadouts)
    return {
      surfaceId: "factor_observation_table",
      reasonCodes: ["heterogeneous_readout_bindings"],
    };

  const lowerLevels = contract.unitLevels.filter(
    (level) =>
      level.key !== contract.experimentalUnitLevelKey && !["block", "sample"].includes(level.role),
  );
  if (lowerLevels.length || contract.orderedAxes.length > 1) {
    return {
      surfaceId: "nested_observation_table",
      reasonCodes: [lowerLevels.length ? "lower_level_identity" : "multiple_ordered_axes"],
    };
  }

  // A matched-source design needs both the parent/source identity and the
  // distinct condition-unit identity on each row. The current compact matrix
  // has only row-wide identity columns and would silently reuse one child ID
  // across all condition columns.
  if (matchedAtAncestorLevel(contract)) {
    return {
      surfaceId: "factor_observation_table",
      reasonCodes: ["distinct_condition_units_shared_source"],
    };
  }

  const compact =
    contract.matching.kind === "matched" &&
    contract.matching.completeSetsRequired !== false &&
    contract.orderedAxes.length <= 1 &&
    (contract.orderedAxes[0]?.levels.length ?? 0) <= 2;
  if (compact)
    return { surfaceId: "compact_unit_matrix", reasonCodes: ["small_complete_matched_set"] };

  const mixedRoles =
    contract.factors.some((factor) => factor.unitRole === "between_unit") &&
    contract.factors.some((factor) => factor.unitRole === "within_unit");
  if (["mixed", "crossover"].includes(contract.matching.kind) || mixedRoles) {
    return { surfaceId: "factor_observation_table", reasonCodes: ["mixed_factor_roles"] };
  }

  if (contract.orderedAxes.length === 1 && contract.orderedAxes[0]?.identityRetained) {
    return { surfaceId: "repeated_axis_matrix", reasonCodes: ["stable_identity_across_axis"] };
  }
  return { surfaceId: "factor_observation_table", reasonCodes: ["observed_row_grain"] };
}

export function parseAdaptiveSurfaceId(value: string): AdaptiveSurfaceId {
  return AdaptiveSurfaceIdSchema.parse(value);
}

import { parseSurfaceId, type StructureContract, type SurfaceId } from "./contract.ts";

export interface SurfaceSelection {
  surfaceId: SurfaceId;
  reasonCodes: string[];
}

export interface PrototypeRow {
  readoutKey: string | null;
  identities: Record<string, string>;
  factors: Record<string, string>;
  axes: Record<string, string | number>;
  hierarchy: Record<string, string>;
  values: Record<string, string | number | boolean | null>;
  missingness: null | string | Record<string, string>;
}

export interface SurfacePayload {
  surfaceId: SurfaceId;
  rows: PrototypeRow[];
  sourceKind: "rectangular_paste" | "tidy_paste" | "wide_paste" | "file_import";
}

export interface InputBurden {
  manualCellOperations: number;
  pasteOperations: number;
  screenContextSwitches: number;
  requiredPreprocessingSteps: number;
  identityReentryOperations: number;
  workaroundOperations: number;
  informationLossFields: number;
}

export function selectSurface(contract: StructureContract): SurfaceSelection {
  const typed = contract.readouts.some((readout) => readout.representation !== "scalar");
  if (typed) return { surfaceId: "typed_record_table", reasonCodes: ["typed_measurement_bundle"] };

  const heterogeneousReadouts =
    contract.readouts.length > 1 &&
    new Set(contract.readouts.map((readout) => `${readout.observationLevelKey}|${readout.axisKeys.join(",")}`)).size > 1;
  if (heterogeneousReadouts) {
    return { surfaceId: "factor_observation_table", reasonCodes: ["heterogeneous_readout_bindings_require_long_records"] };
  }

  const lowerLevels = contract.unitLevels.filter(
    (level) => level.key !== contract.experimentalUnitLevelKey && level.role !== "block" && level.role !== "sample",
  );
  if (lowerLevels.length > 0 || contract.orderedAxes.length > 1) {
    return {
      surfaceId: "nested_observation_table",
      reasonCodes: [lowerLevels.length > 0 ? "named_lower_level_identity" : "multiple_ordered_axes"],
    };
  }

  const compactMatch =
    contract.matching.kind === "matched" &&
    contract.matching.completeSetsRequired !== false &&
    contract.orderedAxes.length <= 1 &&
    (contract.orderedAxes[0]?.levels.length ?? 0) <= 2;
  if (compactMatch) return { surfaceId: "compact_unit_matrix", reasonCodes: ["small_complete_matched_set"] };

  const mixedFactorRoles =
    contract.factors.some((factor) => factor.unitRole === "between_unit") &&
    contract.factors.some((factor) => factor.unitRole === "within_unit");
  if (contract.matching.kind === "mixed" || contract.matching.kind === "crossover" || mixedFactorRoles) {
    return { surfaceId: "factor_observation_table", reasonCodes: ["mixed_factor_roles_require_long_records"] };
  }

  if (contract.orderedAxes.length === 1 && contract.orderedAxes[0]!.identityRetained) {
    return { surfaceId: "repeated_axis_matrix", reasonCodes: ["stable_identity_across_ordered_axis"] };
  }

  return { surfaceId: "factor_observation_table", reasonCodes: ["observed_row_grain", "factor_roles_preserved"] };
}

function combinations<T>(items: Array<{ key: string; levels: T[] }>): Array<Record<string, T>> {
  if (items.length === 0) return [{}];
  return items.reduce<Array<Record<string, T>>>(
    (rows, factor) => rows.flatMap((row) => factor.levels.map((level) => ({ ...row, [factor.key]: level }))),
    [{}],
  );
}

function factorCombinations(contract: StructureContract, role?: "between_unit" | "within_unit"): Array<Record<string, string>> {
  return combinations(contract.factors.filter((factor) => role === undefined || factor.unitRole === role));
}

function axisCombinations(contract: StructureContract, axisKeys = contract.orderedAxes.map((axis) => axis.key)): Array<Record<string, string | number>> {
  return combinations(contract.orderedAxes.filter((axis) => axisKeys.includes(axis.key)));
}

function valuesFor(contract: StructureContract, seed: number, onlyReadoutKey?: string): Record<string, string | number | boolean | null> {
  const values: Record<string, string | number | boolean | null> = {};
  for (const readout of contract.readouts.filter((item) => onlyReadoutKey === undefined || item.key === onlyReadoutKey)) {
    if (readout.representation === "target_reference") { values[`${readout.key}_target`] = 100 + seed; values[`${readout.key}_reference`] = 80 + seed; }
    else if (readout.representation === "paired_readouts") { values[`${readout.key}_x`] = 10 + seed; values[`${readout.key}_y`] = 20 + seed; }
    else if (readout.representation === "event_censoring") { values[`${readout.key}_follow_up`] = 12 + seed; values[`${readout.key}_event_observed`] = seed % 3 !== 0; }
    else if (readout.representation === "proportion_counts") { values[`${readout.key}_numerator`] = 20 + seed; values[`${readout.key}_denominator`] = 100; }
    else if (readout.representation === "category_counts") { values[`${readout.key}_category_a`] = 20 + seed; values[`${readout.key}_category_b`] = 30 + seed; }
    else if (readout.representation === "dose_response") { values[`${readout.key}_dose`] = seed; values[`${readout.key}_response`] = Math.max(0, 1 - seed / 10); }
    else values[readout.key] = 10 + seed / 10;
  }
  return values;
}

function identityRecord(contract: StructureContract, unitIndex: number): Record<string, string> {
  return Object.fromEntries(contract.identities.map((identity, index) => [identity.key, `${identity.label}-${unitIndex + 1}-${index + 1}`]));
}

export function generatePrototypePayload(contract: StructureContract, selection = selectSurface(contract)): SurfacePayload {
  const rows: PrototypeRow[] = [];
  const allCombos = factorCombinations(contract);
  const betweenCombos = factorCombinations(contract, "between_unit");
  const withinCombos = factorCombinations(contract, "within_unit");
  const unitCount = selection.surfaceId === "nested_observation_table" ? 3 : 4;
  let seed = 1;
  const heterogeneousReadouts =
    contract.readouts.length > 1 &&
    new Set(contract.readouts.map((readout) => `${readout.observationLevelKey}|${readout.axisKeys.join(",")}`)).size > 1;

  if (heterogeneousReadouts) {
    for (let unit = 0; unit < unitCount; unit++) {
      const between = betweenCombos[unit % betweenCombos.length] ?? {};
      for (const readout of contract.readouts) {
        const axes = axisCombinations(contract, readout.axisKeys);
        const hierarchyLevels = contract.unitLevels.filter(
          (level) => level.key !== contract.experimentalUnitLevelKey && level.role !== "block" && level.key === readout.observationLevelKey,
        );
        const observationCount = hierarchyLevels.length ? 3 : 1;
        for (let observation = 0; observation < observationCount; observation++) {
          for (const axisValues of axes) {
            for (const within of withinCombos) {
              rows.push({
                readoutKey: readout.key,
                identities: identityRecord(contract, unit),
                factors: { ...between, ...within },
                axes: axisValues,
                hierarchy: Object.fromEntries(hierarchyLevels.map((level) => [level.key, `${level.label}-${unit + 1}-${observation + 1}`])),
                values: valuesFor(contract, seed++, readout.key),
                missingness: null,
              });
            }
          }
        }
      }
    }
  } else if (selection.surfaceId === "repeated_axis_matrix") {
    for (let unit = 0; unit < unitCount; unit++) {
      const factors = betweenCombos[unit % betweenCombos.length] ?? {};
      for (const level of contract.orderedAxes[0]?.levels.length ? contract.orderedAxes[0].levels : [0, 1, 2]) {
        rows.push({ readoutKey: null, identities: identityRecord(contract, unit), factors, axes: { [contract.orderedAxes[0]!.key]: level }, hierarchy: {}, values: valuesFor(contract, seed++), missingness: null });
      }
    }
  } else if (selection.surfaceId === "nested_observation_table") {
    const observationsPerUnit = 2;
    const axes = axisCombinations(contract);
    for (let unit = 0; unit < unitCount; unit++) {
      for (let obs = 0; obs < observationsPerUnit; obs++) {
        const hierarchy = Object.fromEntries(
          contract.unitLevels
            .filter((level) => level.key !== contract.experimentalUnitLevelKey)
            .map((level) => [level.key, `${level.label}-${unit + 1}-${obs + 1}`]),
        );
        for (const axisValues of axes) {
          for (const within of withinCombos) {
            rows.push({ readoutKey: null, identities: identityRecord(contract, unit), factors: { ...(betweenCombos[unit % betweenCombos.length] ?? {}), ...within }, axes: axisValues, hierarchy, values: valuesFor(contract, seed++), missingness: null });
          }
        }
      }
    }
  } else {
    for (let unit = 0; unit < unitCount; unit++) {
      const rowCombos = selection.surfaceId === "compact_unit_matrix" ? allCombos : withinCombos.map((within) => ({ ...(betweenCombos[unit % betweenCombos.length] ?? {}), ...within }));
      const readoutAxes = contract.readouts[0]?.representation === "event_censoring" ? [{}] : axisCombinations(contract);
      for (const factors of rowCombos) {
        for (const axes of readoutAxes) {
          rows.push({ readoutKey: null, identities: identityRecord(contract, unit), factors, axes, hierarchy: {}, values: valuesFor(contract, seed++), missingness: null });
        }
      }
    }
  }

  const sourceKind: SurfacePayload["sourceKind"] =
    selection.surfaceId === "nested_observation_table"
      ? "file_import"
      : selection.surfaceId === "repeated_axis_matrix"
        ? "wide_paste"
        : selection.surfaceId === "factor_observation_table" || selection.surfaceId === "typed_record_table"
          ? "tidy_paste"
          : "rectangular_paste";
  return { surfaceId: parseSurfaceId(selection.surfaceId), rows, sourceKind };
}

export function validatePayload(contract: StructureContract, payload: SurfacePayload): string[] {
  const errors: string[] = [];
  if (payload.surfaceId !== selectSurface(contract).surfaceId) errors.push("surface_selection_mismatch");
  if (payload.rows.length === 0) errors.push("empty_payload");
  for (const [index, row] of payload.rows.entries()) {
    for (const identity of contract.identities) {
      if (!row.identities[identity.key]) errors.push(`row_${index}_missing_identity_${identity.key}`);
    }
    for (const factor of contract.factors) {
      const value = row.factors[factor.key];
      if (value !== undefined && !factor.levels.includes(value)) errors.push(`row_${index}_unknown_factor_level_${factor.key}`);
    }
    if (payload.surfaceId === "nested_observation_table") {
      for (const level of contract.unitLevels.filter((level) => level.key !== contract.experimentalUnitLevelKey && level.role !== "block")) {
        if (!row.hierarchy[level.key] && !contract.identities.some((identity) => identity.unitLevelKey === level.key)) {
          errors.push(`row_${index}_missing_hierarchy_${level.key}`);
        }
      }
    }
    if (Object.keys(row.values).length === 0 && row.missingness === null) errors.push(`row_${index}_missing_value_without_reason`);
    for (const [valueKey, value] of Object.entries(row.values)) {
      if (value === null) {
        const reason = typeof row.missingness === "string" ? row.missingness : row.missingness?.[valueKey];
        if (!reason) errors.push(`row_${index}_missing_value_without_reason_${valueKey}`);
        else if (!contract.allowedMissingness.includes(reason as StructureContract["allowedMissingness"][number])) errors.push(`row_${index}_unknown_missingness_${reason}`);
      }
    }
  }
  for (const factor of contract.factors.filter((item) => item.unitRole === "within_unit")) {
    const observed = new Set(payload.rows.map((row) => row.factors[factor.key]).filter((value): value is string => value !== undefined));
    for (const level of factor.levels) if (!observed.has(level)) errors.push(`within_factor_level_not_represented_${factor.key}_${level}`);
  }
  for (const readout of contract.readouts) {
    const applicableRows = payload.rows.filter((row) => row.readoutKey === null || row.readoutKey === readout.key);
    if (!applicableRows.length) errors.push(`readout_not_represented_${readout.key}`);
    for (const axisKey of readout.axisKeys) {
      const observed = new Set(applicableRows.map((row) => row.axes[axisKey]).filter((value) => value !== undefined));
      const axis = contract.orderedAxes.find((item) => item.key === axisKey);
      if (readout.representation !== "event_censoring" && axis) {
        for (const level of axis.levels) if (!observed.has(level)) errors.push(`axis_level_not_represented_${readout.key}_${axisKey}_${level}`);
      }
    }
  }
  return [...new Set(errors)];
}

export function measureAdaptiveBurden(payload: SurfacePayload): InputBurden {
  return {
    manualCellOperations: 0,
    pasteOperations: 1,
    screenContextSwitches: payload.surfaceId === "nested_observation_table" ? 2 : 1,
    requiredPreprocessingSteps: 0,
    identityReentryOperations: 0,
    workaroundOperations: 0,
    informationLossFields: 0,
  };
}

const escapeHtml = (value: unknown): string =>
  String(value).replaceAll("&", "&amp;").replaceAll("<", "&lt;").replaceAll(">", "&gt;").replaceAll('"', "&quot;");

export function renderSurfaceHtml(contract: StructureContract, payload: SurfacePayload): string {
  const hasReadoutDiscriminator = payload.rows.some((row) => row.readoutKey !== null);
  const identityHeaders = contract.identities.map((identity) => identity.label);
  const factorHeaders = contract.factors.map((factor) => factor.label);
  const axisHeaders = contract.orderedAxes.map((axis) => `${axis.label}${axis.unit ? ` (${axis.unit})` : ""}`);
  const hierarchyHeaders = contract.unitLevels
    .filter((level) => level.key !== contract.experimentalUnitLevelKey && level.role !== "block")
    .map((level) => level.label);
  const valueHeaders = contract.readouts.flatMap((readout) =>
    readout.representation === "scalar" ? [readout.key] : readout.componentKeys.map((component) => `${readout.key}_${component}`),
  );
  const headers = [...(hasReadoutDiscriminator ? ["Readout"] : []), ...identityHeaders, ...factorHeaders, ...axisHeaders, ...hierarchyHeaders, ...valueHeaders, "Missingness"];
  const body = payload.rows
    .slice(0, 12)
    .map((row) => {
      const cells = [
        ...(hasReadoutDiscriminator ? [row.readoutKey ?? ""] : []),
        ...contract.identities.map((identity) => row.identities[identity.key] ?? ""),
        ...contract.factors.map((factor) => row.factors[factor.key] ?? ""),
        ...contract.orderedAxes.map((axis) => row.axes[axis.key] ?? ""),
        ...contract.unitLevels.filter((level) => level.key !== contract.experimentalUnitLevelKey && level.role !== "block").map((level) => row.hierarchy[level.key] ?? ""),
        ...valueHeaders.map((key) => row.values[key] ?? Object.values(row.values)[0] ?? ""),
        row.missingness === null ? "" : typeof row.missingness === "string" ? row.missingness : JSON.stringify(row.missingness),
      ];
      return `<tr>${cells.map((cell) => `<td>${escapeHtml(cell)}</td>`).join("")}</tr>`;
    })
    .join("");
  return `<section data-surface="${payload.surfaceId}" aria-labelledby="${contract.caseId}-title"><h2 id="${contract.caseId}-title">${escapeHtml(contract.caseId)} — ${escapeHtml(payload.surfaceId)}</h2><p>${escapeHtml(contract.rawObservationGrain)}</p><table><thead><tr>${headers.map((header) => `<th scope="col">${escapeHtml(header)}</th>`).join("")}</tr></thead><tbody>${body}</tbody></table></section>`;
}

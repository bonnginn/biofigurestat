import type { NestedImageJPastePayload } from "../components/NestedImageJPaste";

/** Updates raw cell/ROI records below one explicitly identified experimental unit. */
export function updateNestedPayloadExperimentDate(
  payload: NestedImageJPastePayload,
  experimentalUnitId: string,
  experimentDate: string,
  rawRevisionId = payload.rawRevisionId,
): NestedImageJPastePayload {
  const unitById = new Map(payload.unitInstances.map((unit) => [unit.id, unit]));
  const belongsToExperimentalUnit = (unitId: string) => {
    const visited = new Set<string>();
    let current = unitById.get(unitId);
    while (current) {
      if (visited.has(current.id)) return false;
      visited.add(current.id);
      if (current.id === experimentalUnitId) return true;
      current = current.parentUnitId ? unitById.get(current.parentUnitId) : undefined;
    }
    return false;
  };
  return {
    ...payload,
    rawRevisionId,
    observations: payload.observations.map((observation) =>
      belongsToExperimentalUnit(observation.unitInstanceId)
        ? { ...observation, rawRevisionId, experimentDate }
        : { ...observation, rawRevisionId },
    ),
    transformation: { ...payload.transformation, inputRevisionIds: [rawRevisionId] },
  };
}

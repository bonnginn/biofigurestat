import {
  experimentCellKey,
  type ExperimentCellDraft,
  type ExperimentCellMap,
  type ExperimentSetDraft,
  type TimePointDraft,
} from "./experimentDraft";

export function timePointsFor(draft: ExperimentSetDraft): Array<TimePointDraft | null> {
  return draft.time.points.length > 0 ? [...draft.time.points] : [null];
}

export function createCellsForDraft(draft: ExperimentSetDraft): ExperimentCellMap {
  const cells: Record<string, ExperimentCellDraft> = {};
  const timePoints = timePointsFor(draft);
  for (const experiment of draft.experiments) {
    for (const condition of draft.conditions) {
      for (const readout of draft.readouts) {
        for (const timePoint of timePoints) {
          const key = experimentCellKey({
            experimentId: experiment.id,
            conditionId: condition.id,
            readoutId: readout.id,
            timePointId: timePoint?.id,
          });
          cells[key] =
            readout.shape === "proportion"
              ? { kind: "proportion", positive: null, eligible: null }
              : readout.shape === "wb_ratio"
                ? {
                    kind: "wb_ratio",
                    target: null,
                    reference: null,
                    inputMode: readout.wbInputMode ?? "corrected_value",
                  }
                : readout.shape === "categorical_counts"
                  ? {
                      kind: "categorical_counts",
                      counts: Object.fromEntries(
                        (readout.categories ?? []).map(({ id }) => [id, null]),
                      ),
                    }
                  : { kind: "nested_continuous", rawValues: [], source: "manual" };
        }
      }
    }
  }
  return cells;
}


import {
  experimentCellKey,
  orderedAxisUnit,
  type ExperimentCellDraft,
  type ExperimentCellMap,
  type ExperimentSessionDraft,
  type ExperimentSetDraft,
  type ReadoutDraft,
  type TimePointDraft,
} from "./experimentDraft";

export type WorkspaceCellDescriptor = Readonly<{
  key: string;
  experiment: ExperimentSessionDraft;
  conditionId: string;
  conditionLabel: string;
  timePoint: TimePointDraft | null;
  timeUnit: string;
  readout: ReadoutDraft;
}>;

export type WorkspaceTableRow = Readonly<{
  key: string;
  conditionId: string;
  conditionLabel: string;
  timePoint: TimePointDraft | null;
}>;

export function workspaceTimePoints(draft: ExperimentSetDraft): Array<TimePointDraft | null> {
  return draft.time.points.length > 0 ? [...draft.time.points] : [null];
}

export function createWorkspaceCells(draft: ExperimentSetDraft): ExperimentCellMap {
  const cells: Record<string, ExperimentCellDraft> = {};
  const timePoints = workspaceTimePoints(draft);
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

export function workspaceRows(
  draft: ExperimentSetDraft,
  experimentId: string,
): WorkspaceTableRow[] {
  return draft.conditions.flatMap((condition) =>
    workspaceTimePoints(draft).map((timePoint) => ({
      key: `${experimentId}::${condition.id}::${timePoint?.id ?? "time.none"}`,
      conditionId: condition.id,
      conditionLabel: condition.label,
      timePoint,
    })),
  );
}

export function workspaceConditionAttributeValues(
  draft: ExperimentSetDraft,
  conditionId: string,
): string[] {
  const condition = draft.conditions.find((candidate) => candidate.id === conditionId);
  return draft.attributes.map((attribute) => condition?.attributes[attribute.id]?.trim() || "—");
}

export function findWorkspaceCellDescriptor(
  draft: ExperimentSetDraft,
  key: string,
): WorkspaceCellDescriptor | null {
  for (const experiment of draft.experiments) {
    for (const condition of draft.conditions) {
      for (const readout of draft.readouts) {
        for (const timePoint of workspaceTimePoints(draft)) {
          const candidate = experimentCellKey({
            experimentId: experiment.id,
            conditionId: condition.id,
            readoutId: readout.id,
            timePointId: timePoint?.id,
          });
          if (candidate === key) {
            return {
              key,
              experiment,
              conditionId: condition.id,
              conditionLabel: condition.label,
              timePoint,
              timeUnit: orderedAxisUnit(draft.time),
              readout,
            };
          }
        }
      }
    }
  }
  return null;
}

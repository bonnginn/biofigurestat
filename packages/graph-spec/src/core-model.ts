import { z } from "zod";
import type { GraphSpec } from "./index";

export const GraphDatumSchema = z.object({
  observationId: z.string().min(1),
  conditionId: z.string().min(1),
  value: z.number().finite(),
  experimentalUnitId: z.string().min(1),
  pairId: z.string().min(1).optional(),
  layer: z.enum(["raw", "replicate_summary"]).optional(),
});

export type GraphDatum = z.infer<typeof GraphDatumSchema>;

export type CoreGraphModel = {
  type: "dot_summary" | "paired_dot" | "grouped_dot" | "raw_and_replicate_summary" | "scatter";
  yLabel: string;
  yStartAtZero: boolean;
  groups: Array<{
    conditionId: string;
    label: string;
    values: Array<{ observationId: string; experimentalUnitId: string; value: number }>;
    rawValues: Array<{ observationId: string; experimentalUnitId: string; value: number }>;
    mean: number;
    errorBar: number | null;
    errorBarKind: "sd" | "sem" | "none";
  }>;
  connections: Array<{
    pairId: string;
    segmentIndex: number;
    pointIndex: number;
    pointCount: number;
    from: { conditionId: string; value: number };
    to: { conditionId: string; value: number };
  }>;
  scatterPoints?: Array<{
    pairId: string;
    experimentalUnitId: string;
    x: number;
    y: number;
    xObservationId: string;
    yObservationId: string;
  }>;
};

function mean(values: number[]): number {
  return values.reduce((sum, value) => sum + value, 0) / values.length;
}

/** Builds a complete-pair scatter model without pairing observations by row order. */
export function createCoreCorrelationGraphModel(
  spec: GraphSpec,
  variableConditions: readonly [{ id: string; label: string }, { id: string; label: string }],
  input: ReadonlyArray<GraphDatum>,
): CoreGraphModel {
  if (spec.type !== "scatter") throw new Error("D09 requires a scatter graph specification");
  const data = input.map((datum) => GraphDatumSchema.parse(datum));
  const byPair = new Map<string, GraphDatum[]>();
  data.forEach((datum) => {
    const pairId = datum.pairId ?? datum.experimentalUnitId;
    byPair.set(pairId, [...(byPair.get(pairId) ?? []), datum]);
  });
  if (byPair.size < 3) throw new Error("A D09 scatter graph requires at least three pairs");
  const scatterPoints = [...byPair.entries()]
    .sort(([first], [second]) => first.localeCompare(second))
    .map(([pairId, pair]) => {
      const x = pair.filter((datum) => datum.conditionId === variableConditions[0].id);
      const y = pair.filter((datum) => datum.conditionId === variableConditions[1].id);
      if (x.length !== 1 || y.length !== 1) {
        throw new Error(`D09 scatter pair ${pairId} must contain each variable exactly once`);
      }
      return {
        pairId,
        experimentalUnitId: x[0].experimentalUnitId,
        x: x[0].value,
        y: y[0].value,
        xObservationId: x[0].observationId,
        yObservationId: y[0].observationId,
      };
    });
  return {
    type: "scatter",
    yLabel: variableConditions[1].label,
    yStartAtZero: spec.axes.yStartAtZero,
    groups: [],
    connections: [],
    scatterPoints,
  };
}

function standardDeviation(values: number[]): number | null {
  if (values.length < 2) return null;
  const center = mean(values);
  const variance =
    values.reduce((sum, value) => sum + (value - center) ** 2, 0) / (values.length - 1);
  return Math.sqrt(variance);
}

function summaryError(
  values: number[],
  interval: GraphSpec["summary"]["interval"],
): { value: number | null; kind: "sd" | "sem" | "none" } {
  if (interval !== "sd" && interval !== "sem") return { value: null, kind: "none" };
  const sd = standardDeviation(values);
  return {
    value: sd === null ? null : interval === "sem" ? sd / Math.sqrt(values.length) : sd,
    kind: interval,
  };
}

export function createCoreGraphModel(
  spec: GraphSpec,
  conditions: ReadonlyArray<{ id: string; label: string }>,
  input: ReadonlyArray<GraphDatum>,
): CoreGraphModel {
  if (
    spec.type !== "dot_summary" &&
    spec.type !== "paired_dot" &&
    spec.type !== "grouped_dot" &&
    spec.type !== "raw_and_replicate_summary"
  ) {
    throw new Error(`Core renderer does not support graph type ${spec.type}`);
  }
  if (conditions.length < 2) {
    throw new Error("Core group graph model requires at least two conditions");
  }
  const data = input.map((datum) => GraphDatumSchema.parse(datum));
  const groups = conditions.map((condition) => {
    const conditionData = data.filter((datum) => datum.conditionId === condition.id);
    const values = conditionData
      .filter((datum) => datum.layer !== "raw")
      .map(({ observationId, experimentalUnitId, value }) => ({
        observationId,
        experimentalUnitId,
        value,
      }));
    if (values.length === 0) throw new Error(`Graph condition ${condition.id} has no observations`);
    const rawValues = conditionData
      .filter((datum) => datum.layer === "raw")
      .map(({ observationId, experimentalUnitId, value }) => ({
        observationId,
        experimentalUnitId,
        value,
      }));
    const numericValues = values.map((datum) => datum.value);
    const errorBar = summaryError(numericValues, spec.summary.interval);
    return {
      conditionId: condition.id,
      label: condition.label,
      values,
      rawValues,
      mean: mean(numericValues),
      errorBar: errorBar.value,
      errorBarKind: errorBar.kind,
    };
  });

  const connections: CoreGraphModel["connections"] = [];
  if (spec.type === "paired_dot") {
    const byPair = new Map<string, GraphDatum[]>();
    data.forEach((datum) => {
      const pairId = datum.pairId ?? datum.experimentalUnitId;
      byPair.set(pairId, [...(byPair.get(pairId) ?? []), datum]);
    });
    const orderedPairs = [...byPair.entries()].sort(([first], [second]) =>
      first.localeCompare(second),
    );
    for (const [pointIndex, [pairId, pairData]] of orderedPairs.entries()) {
      if (pairData.length !== conditions.length) {
        throw new Error(`Paired graph unit ${pairId} is incomplete`);
      }
      for (let segmentIndex = 0; segmentIndex < conditions.length - 1; segmentIndex += 1) {
        const from = pairData.find((datum) => datum.conditionId === conditions[segmentIndex].id);
        const to = pairData.find((datum) => datum.conditionId === conditions[segmentIndex + 1].id);
        if (!from || !to) throw new Error(`Paired graph unit ${pairId} is incomplete`);
        connections.push({
          pairId,
          segmentIndex,
          pointIndex,
          pointCount: orderedPairs.length,
          from: { conditionId: from.conditionId, value: from.value },
          to: { conditionId: to.conditionId, value: to.value },
        });
      }
    }
  }

  return {
    type: spec.type,
    yLabel: spec.axes.yLabel,
    yStartAtZero: spec.axes.yStartAtZero,
    groups,
    connections,
  };
}

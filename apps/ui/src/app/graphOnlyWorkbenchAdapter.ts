import type { ParsedAdaptiveInput } from "@lsaa/adaptive-input";

import {
  experimentCellKey,
  type ExperimentCellMap,
  type ExperimentSetDraft,
} from "./experimentDraft";

export type GraphOnlyColumnIndex = number | "";

export type GraphOnlyWorkbenchModel = Readonly<{
  draft: ExperimentSetDraft;
  cells: ExperimentCellMap;
  numericXAxis: boolean;
  conditionIds: readonly string[];
  timePointIds: readonly string[];
}>;

function numericValue(raw: string | undefined): number | null {
  const value = raw?.trim() ?? "";
  if (!value || ["NA", "N/A", "—"].includes(value)) return null;
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : null;
}

function distinctInOrder(values: readonly string[]): string[] {
  return values.reduce<string[]>((result, value) => {
    if (!result.includes(value)) result.push(value);
    return result;
  }, []);
}

/**
 * Builds a presentation-only adapter for the production Graph editor.
 *
 * The returned draft is never persisted as an ExperimentDesign and is never
 * offered to Statistics. Row identities are local rendering keys, not claims
 * about biological n, independence, pairing, or repeated measurements.
 */
export function createGraphOnlyWorkbenchModel(
  input: Readonly<{
    parsed: ParsedAdaptiveInput;
    xColumn: number;
    yColumn: number;
    seriesColumn: GraphOnlyColumnIndex;
    idColumn: GraphOnlyColumnIndex;
    title: string;
  }>,
): GraphOnlyWorkbenchModel | null {
  const validRows = input.parsed.rows.flatMap((row, rowIndex) => {
    const y = numericValue(row[input.yColumn]);
    if (y === null) return [];
    const xRaw = row[input.xColumn]?.trim() || `行 ${rowIndex + 2}`;
    const series = input.seriesColumn === "" ? "" : row[input.seriesColumn]?.trim() || "（空欄）";
    const sourceId = input.idColumn === "" ? "" : row[input.idColumn]?.trim() || "";
    return [{ rowIndex, xRaw, xNumeric: numericValue(xRaw), y, series, sourceId }];
  });
  if (!validRows.length) return null;

  const numericXAxis = validRows.every(({ xNumeric }) => xNumeric !== null);
  const readoutId = "graph-only.readout.y";
  const title = input.title.trim() || "表から作成したGraph";
  const experiments = validRows.map(({ rowIndex, sourceId }) => ({
    id: `graph-only.row.${rowIndex + 1}`,
    label: sourceId || `Row ${rowIndex + 2}`,
    sessionId: `graph-only.row-session.${rowIndex + 1}`,
    stableUnitId: `graph-only.row-key.${rowIndex + 1}`,
    date: "",
    note: "Graph-only presentation row; biological identity unresolved",
  }));
  const readout = {
    id: readoutId,
    label: input.parsed.headers[input.yColumn]?.trim() || "測定値",
    shape: "nested_continuous" as const,
    nestedInputMode: "unit_summary" as const,
  };

  if (!numericXAxis) {
    const seriesLevels =
      input.seriesColumn === "" ? [] : distinctInOrder(validRows.map(({ series }) => series));
    const attributes = [
      {
        id: "graph-only.factor.x",
        label: input.parsed.headers[input.xColumn]?.trim() || "条件",
        proposedVisualRole: "x" as const,
      },
      ...(seriesLevels.length
        ? [
            {
              id: "graph-only.factor.series",
              label: input.parsed.headers[input.seriesColumn as number]?.trim() || "系列",
              proposedVisualRole: "series" as const,
            },
          ]
        : []),
    ];
    const observedCombinations = distinctInOrder(
      validRows.map(({ xRaw, series }) => `${xRaw}\u0000${series}`),
    );
    const conditions = observedCombinations.map((combination, index) => {
      const [xRaw, series = ""] = combination.split("\u0000");
      return {
        id: `graph-only.condition.${index + 1}`,
        label: series ? `${xRaw} / ${series}` : xRaw!,
        attributes: {
          "graph-only.factor.x": xRaw!,
          ...(seriesLevels.length ? { "graph-only.factor.series": series } : {}),
        },
      };
    });
    const conditionByCombination = new Map(
      observedCombinations.map((combination, index) => [combination, conditions[index]!.id]),
    );
    const cells: Record<string, ExperimentCellMap[string]> = {};
    validRows.forEach((row, index) => {
      const conditionId = conditionByCombination.get(`${row.xRaw}\u0000${row.series}`)!;
      cells[
        experimentCellKey({
          experimentId: experiments[index]!.id,
          conditionId,
          readoutId,
        })
      ] = { kind: "nested_continuous", rawValues: [row.y], source: "manual" };
    });
    const draft: ExperimentSetDraft = {
      version: "0.1.0",
      dataOrigin: "research",
      context: "existing_data",
      entryRoute: "graph_only_unresolved_presentation",
      name: title,
      readouts: [readout],
      attributes,
      conditions,
      analysisIntent:
        conditions.length === 1
          ? { kind: "single_cohort", mode: "descriptive" }
          : { kind: "group_comparison" },
      conditionAssignment: { kind: "independent", unitLabel: "表の行（未確認）" },
      time: { sampling: "none", unit: "h", points: [] },
      experiments,
    };
    return {
      draft,
      cells,
      numericXAxis: false,
      conditionIds: conditions.map(({ id }) => id),
      timePointIds: [],
    };
  }

  const seriesLevels =
    input.seriesColumn === "" ? ["データ"] : distinctInOrder(validRows.map(({ series }) => series));
  const conditions = seriesLevels.map((series, index) => ({
    id: `graph-only.condition.${index + 1}`,
    label: series,
    attributes: { "graph-only.factor.series": series },
  }));
  const conditionBySeries = new Map(
    seriesLevels.map((series, index) => [series, conditions[index]!.id]),
  );
  const xValues = [...new Set(validRows.map(({ xNumeric }) => xNumeric as number))].sort(
    (left, right) => left - right,
  );
  const timePoints = xValues.map((value, index) => ({
    id: `graph-only.x.${index + 1}`,
    value,
  }));
  const timePointByValue = new Map(xValues.map((value, index) => [value, timePoints[index]!.id]));
  const cells: Record<string, ExperimentCellMap[string]> = {};
  validRows.forEach((row, index) => {
    const conditionId = conditionBySeries.get(input.seriesColumn === "" ? "データ" : row.series)!;
    const timePointId = timePointByValue.get(row.xNumeric as number)!;
    cells[
      experimentCellKey({
        experimentId: experiments[index]!.id,
        conditionId,
        readoutId,
        timePointId,
      })
    ] = { kind: "nested_continuous", rawValues: [row.y], source: "manual" };
  });
  const draft: ExperimentSetDraft = {
    version: "0.1.0",
    dataOrigin: "research",
    context: "existing_data",
    entryRoute: "graph_only_unresolved_presentation",
    name: title,
    readouts: [readout],
    attributes: [
      {
        id: "graph-only.factor.series",
        label:
          input.seriesColumn === ""
            ? "系列"
            : input.parsed.headers[input.seriesColumn]?.trim() || "系列",
        proposedVisualRole: "series",
      },
    ],
    conditions,
    analysisIntent:
      conditions.length === 1
        ? { kind: "single_cohort", mode: "descriptive" }
        : { kind: "group_comparison" },
    conditionAssignment: { kind: "independent", unitLabel: "表の行（未確認）" },
    time: {
      sampling: "cross_sectional",
      unit: "h",
      points: timePoints,
      axisSemantic: "numeric_covariate",
      axisTitle: input.parsed.headers[input.xColumn]?.trim() || "X",
      axisUnit: "",
      proposedVisualRole: "x",
    },
    experiments,
  };
  return {
    draft,
    cells,
    numericXAxis: true,
    conditionIds: conditions.map(({ id }) => id),
    timePointIds: timePoints.map(({ id }) => id),
  };
}

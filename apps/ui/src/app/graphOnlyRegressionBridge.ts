import { encodeDelimitedCell } from "@lsaa/adaptive-input";
import type { UnresolvedVisualizationProjectState } from "@lsaa/project";
import type { CommonCoverageDraft } from "./specializedAnalysisDrafts";

/** Explicit unit confirmation is required even when an ID column exists. */
export function bridgeGraphOnlyTableToRegression(
  state: UnresolvedVisualizationProjectState,
  independentUnitsConfirmed: boolean,
): { status: "ready"; draft: CommonCoverageDraft } | { status: "stopped"; reason: string } {
  const stop = (reason: string) => ({ status: "stopped" as const, reason });
  const mapping = state.mapping;
  if (!mapping || !independentUnitsConfirmed)
    return stop("各行が独立した対象のX・Yの組であることを確認してください。");
  const x = mapping.columns.find(({ role }) => role === "x");
  const y = mapping.columns.find(({ role }) => role === "y");
  const id = mapping.columns.find(({ role }) => role === "id");
  if (!x || !y || x.index === y.index || (id && [x.index, y.index].includes(id.index)))
    return stop("X・Y・対象IDには別々の列を指定してください。");
  if (mapping.columns.some(({ role }) => role === "series"))
    return stop("グループ列を自動で無視しません。単回帰ではグループ列を未指定にしてください。");
  if (
    !id &&
    !(
      mapping.identityDecision === "no_id" &&
      mapping.sourceRowUnitDecision === "each_row_distinct_unit"
    )
  )
    return stop("対象ID列を選ぶか、ID列なしで各行が別々の対象であることを明示してください。");
  if (new Set(state.table.headers).size !== state.table.headers.length)
    return stop("重複する列名を区別してください。");
  const units = new Set<string>();
  const rows: string[][] = [];
  for (const [index, row] of state.table.rows.entries()) {
    const xv = row[x.index]?.trim() ?? "";
    const yv = row[y.index]?.trim() ?? "";
    const unit = id ? (row[id.index]?.trim() ?? "") : `source-row-${index + 1}`;
    if (!unit || units.has(unit))
      return stop(
        "対象IDが空または重複しています。同じ対象の繰り返しを独立したnとして扱いません。",
      );
    if (!xv || !yv || !Number.isFinite(Number(xv)) || !Number.isFinite(Number(yv)))
      return stop(
        "X・Yに欠測または数値でない値があります。行を自動で除外せず、元の表で確認してください。",
      );
    units.add(unit);
    rows.push([unit, xv, yv]);
  }
  if (rows.length < 3 || new Set(rows.map((row) => Number(row[1]))).size < 2)
    return stop("単回帰には3対象以上と、異なるXの値が必要です。");
  const empty = { initial: "", lower: "", upper: "" };
  return {
    status: "ready",
    draft: {
      text: [["Unit ID", "X", "Y"], ...rows]
        .map((row) => row.map((cell) => encodeDelimitedCell(cell, "\t")).join("\t"))
        .join("\n"),
      xLabel: x.header,
      yLabel: y.header,
      xUnit: "",
      yUnit: "",
      includeIntercept: true,
      contingencyMethod: "fisher_exact",
      display: "count",
      xScale: "linear",
      yScale: "linear",
      showBand: true,
      distributionType: "histogram",
      binCount: "",
      nonlinearModel: "zero_baseline_association",
      modelRationale: "",
      fitSettings: { baseline: empty, plateau: empty, rate: empty, vmax: empty, km: empty },
    },
  };
}

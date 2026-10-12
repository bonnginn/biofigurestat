import type { AnalysisEngineRequest, AnalysisEngineResult } from "@lsaa/analysis-contracts";

const interval = (estimate: AnalysisEngineResult["estimates"][number] | undefined) =>
  estimate?.confidenceInterval
    ? `${estimate.confidenceInterval.level * 100}% CI ${estimate.confidenceInterval.lower}–${estimate.confidenceInterval.upper}`
    : "CI not defined";

/** Deterministic Methods provenance for the final common pre-benchmark modules. */
export function generateCommonCoverageMethods(
  request: AnalysisEngineRequest,
  result: AnalysisEngineResult,
): string {
  if (request.requestId !== result.requestId || result.status !== "ok") return "";
  if (request.protocolVersion === "0.11.0") {
    const total = request.cells.reduce((sum, cell) => sum + cell.count, 0);
    return [
      `Model: ${request.method}.`,
      `Structure: ${request.structure}; experimental unit: ${request.experimentalUnit}.`,
      `Total n=${total}; category counts: ${request.cells.map((cell) => `${cell.rowCategoryId}/${cell.columnCategoryId}=${cell.count}`).join(", ")}.`,
      ...(request.structure === "independent" &&
      request.rowCategoryIds.length === 2 &&
      request.columnCategoryIds.length === 2
        ? [
            `OR/RR estimates and central two-sided log-Wald CI: ${request.cells.some((cell) => cell.count === 0) ? "0.5 added to all four cells because a raw cell is zero" : "no zero-cell correction"}. Standard errors are on the log-ratio scale.`,
            `RR: ${request.rowCategoryIds[0]} relative to ${request.rowCategoryIds[1]}; event category=${request.columnCategoryIds[0]}.`,
            ...(request.method === "fisher_exact"
              ? [
                  "Fisher statistic: uncorrected sample OR; p-value uses original counts. The OR/RR intervals are not Fisher exact intervals.",
                ]
              : []),
          ]
        : []),
      "Percentages, normalized measurements, and nested non-independent cell counts were not converted to contingency counts.",
      `Engine: ${result.engine.name} ${result.engine.version}.`,
    ].join("\n");
  }
  if (request.protocolVersion === "0.12.0") {
    const units = new Set(request.observations.map(({ pairId }) => pairId));
    return [
      `Model: Friedman repeated-measures omnibus test.`,
      `Matched biological n=${units.size}; matched-unit identity was retained by pairId.`,
      `Pairwise method: Wilcoxon signed-rank with Holm multiplicity correction.`,
      "Repeated observations were not flattened into independent groups.",
      `Engine: ${result.engine.name} ${result.engine.version}.`,
    ].join("\n");
  }
  if (request.protocolVersion === "0.13.0") {
    const slope = result.estimates.find(({ name }) => name === "slope"),
      regression = result.regression;
    return [
      `Model: ordinary least-squares simple linear regression ${request.includeIntercept ? "with an estimated intercept" : "with the intercept explicitly fixed at zero"}.`,
      `X: ${request.xLabel}${request.xUnit ? ` (${request.xUnit})` : ""}; Y: ${request.yLabel}${request.yUnit ? ` (${request.yUnit})` : ""}.`,
      `Biological n=${request.points.length}; slope=${regression?.slope}; intercept=${regression?.intercept}; R²=${regression?.rSquared}.`,
      `R² denominator: ${request.includeIntercept ? "centered total sum of squares about mean Y" : "uncentered total sum of squares about zero"}. A zero denominator is not an R² of 1 and stops analysis.`,
      `Slope central two-sided ${interval(slope)}; slope hypothesis (${request.options.alternative}) p=${result.tests[0]?.pValue}.`,
      "The fitted-line band is a pointwise central two-sided confidence interval for the mean response, not a prediction interval for a new observation.",
      "Graph axis scaling is display metadata and did not transform the values used for analysis.",
      `Engine: ${result.engine.name} ${result.engine.version}.`,
    ].join("\n");
  }
  throw new Error("Common coverage Methods supports D14-D16 only");
}

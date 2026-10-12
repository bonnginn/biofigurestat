import type { AnalysisEngineResult } from "@lsaa/analysis-contracts";
export function inferenceStatisticLabel(
  result: AnalysisEngineResult,
  test: AnalysisEngineResult["tests"][number],
): string {
  if (test.name.startsWith("tukey_hsd:") && test.statisticName === "q" &&
      !result.diagnostics.some(({ code }) => code === "tukey_studentized_range_q")) {
    // Preserve historical numbers; never convert a saved result into a new run.
    return "旧q表記（統計量の定義未確認）";
  }
  return test.statisticName;
}

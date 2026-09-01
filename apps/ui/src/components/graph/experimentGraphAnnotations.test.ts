import type { AnalysisEngineResult } from "@lsaa/analysis-contracts";

import { createSelectedComparisonAnnotation } from "./experimentGraphAnnotations";

function testResult(name: string, adjustedPValue: number | null) {
  return {
    name,
    statistic: 2.5,
    degreesOfFreedom: [4],
    pValue: 0.04,
    adjustedPValue,
    effectSizeName: null,
    effectSize: null,
  } as AnalysisEngineResult["tests"][number];
}

describe("selected Graph comparison annotation", () => {
  it("keeps pairwise endpoints and derived-time lineage on the selected test", () => {
    expect(
      createSelectedComparisonAnnotation({
        test: testResult("holm_welch:condition.control:condition.drug", 0.08),
        testIndex: 2,
        requestId: "analysis.1",
        mode: "hidden",
        sourceMode: "derived_metric",
        timeAnalysis: { kind: "auc", windowStart: 0, windowEnd: 24 },
        analysisTimePointId: null,
      }),
    ).toEqual({
      id: "annotation.2",
      analysisId: "analysis.1",
      comparisonId: "holm_welch:condition.control:condition.drug",
      testIndex: 2,
      mode: "symbol",
      showNonSignificant: true,
      presentation: "bracket",
      endpoints: [
        { conditionId: "condition.control" },
        { conditionId: "condition.drug" },
      ],
      pValueStatus: "adjusted",
      lineage: { derivedMetric: "auc", endpoint: "auc", windowStart: 0, windowEnd: 24 },
    });
  });

  it("does not invent endpoints for an omnibus result", () => {
    const annotation = createSelectedComparisonAnnotation({
      test: testResult("one_way_anova", null),
      testIndex: 0,
      requestId: "analysis.2",
      mode: "exact_p",
      sourceMode: "raw_readout",
      timeAnalysis: { kind: "selected_timepoint" },
      analysisTimePointId: "time.24h",
    });

    expect(annotation.endpoints).toBeUndefined();
    expect(annotation.pValueStatus).toBe("unadjusted");
    expect(annotation.lineage).toEqual({ timePointId: "time.24h" });
  });
});

import { describe, expect, it } from "vitest";

import type { WorkspaceGraphAnalysis } from "../../app/experimentWorkspaceProject";
import { serializeAnalysisReviewSetHtml } from "./analysisReviewSet";

const analysis = {
  request: {
    requestId: "run.review-001",
    observations: [
      { observationId: "o1", experimentalUnitId: "u1", conditionId: "vehicle", value: 1 },
      { observationId: "o2", experimentalUnitId: "u2", conditionId: "vehicle", value: 1.1 },
      { observationId: "o3", experimentalUnitId: "u3", conditionId: "drug", value: 1.5 },
    ],
  },
  result: {
    status: "ok",
    completedAt: "2026-09-02T00:00:00.000Z",
    engine: { name: "BioFigureStat engine", version: "0.15.0", packages: {} },
    estimates: [
      {
        name: "drug_minus_vehicle",
        value: 0.45,
        standardError: 0.05,
        confidenceInterval: { level: 0.95, lower: 0.3, upper: 0.6 },
      },
    ],
    tests: [
      {
        name: "welch_t",
        statisticName: "t",
        statistic: 9,
        degreesOfFreedom: [4.5],
        pValue: 0.001,
        adjustedPValue: null,
        effectSizeName: "hedges_g",
        effectSize: 2.1,
      },
    ],
    warnings: [{ code: "SMALL_SAMPLE", message: "Review the small sample." }],
    diagnostics: [],
  },
} as unknown as WorkspaceGraphAnalysis;

describe("analysis review set", () => {
  it("keeps the Graph, run identity, n, estimates, tests, warnings, Methods, and data together", () => {
    const html = serializeAnalysisReviewSetHtml({
      locale: "en",
      projectTitle: "Drug <screen>",
      readoutLabel: "Intensity",
      readoutUnit: "a.u.",
      conditionLabels: [
        { id: "vehicle", label: "Vehicle" },
        { id: "drug", label: "Drug A" },
      ],
      analysis,
      methodsText: "Welch's t-test was used.",
      svgText: '<?xml version="1.0"?><svg aria-label="Graph"><circle/></svg>',
      displayedDataCsv: '\uFEFF"Condition","Value"\n"Vehicle","1"\n',
    });

    expect(html).toContain("Analysis run ID");
    expect(html).toContain("run.review-001");
    expect(html).toContain("Vehicle</td><td>2");
    expect(html).toContain("95%: 0.3 – 0.6");
    expect(html).toContain("hedges_g = 2.1");
    expect(html).toContain("SMALL_SAMPLE");
    expect(html).toContain("Welch&#39;s t-test was used.");
    expect(html).toContain('<svg aria-label="Graph"><circle/></svg>');
    expect(html).toContain("Displayed data (CSV)");
    expect(html).toContain("Drug &lt;screen&gt;");
    expect(html).not.toContain("<?xml");
  });

  it("localizes the review document without changing run identity or values", () => {
    const html = serializeAnalysisReviewSetHtml({
      locale: "ja",
      projectTitle: "薬剤比較",
      readoutLabel: "相対量",
      readoutUnit: "",
      conditionLabels: [{ id: "vehicle", label: "対照" }],
      analysis,
      methodsText: "Welchのt検定。",
      svgText: "<svg/>",
      displayedDataCsv: "条件,値",
    });

    expect(html).toContain('<html lang="ja">');
    expect(html).toContain("解析レビューセット");
    expect(html).toContain("群別n");
    expect(html).toContain("調整済みp");
    expect(html).toContain("元の.lsaプロジェクト");
  });
});

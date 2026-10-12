import { fireEvent, render, screen } from "@testing-library/react";
import { AnalysisEngineRequestSchema, AnalysisEngineResultSchema } from "@lsaa/analysis-contracts";
import { vi } from "vitest";
import { ExecutedMeanDifferencePlot } from "./ExecutedMeanDifferencePlot";
import { GraphStatisticsPanel } from "./GraphStatisticsPanel";
import { exportGraphPng, saveExportText } from "../../app/graphExport";

vi.mock("../../app/graphExport", () => ({
  serializeGraphSvg: (svg: SVGSVGElement) => new XMLSerializer().serializeToString(svg),
  saveExportText: vi.fn().mockResolvedValue("saved"),
  exportGraphPng: vi.fn().mockResolvedValue(undefined),
  copyGraphToClipboard: vi.fn().mockResolvedValue("svg"),
  ExportCancelledError: class extends Error {},
}));

const request = AnalysisEngineRequestSchema.parse({
  protocolVersion: "0.1.0",
  requestId: "req.plot",
  projectId: "project.test",
  analysisId: "analysis.test",
  templateId: "D01",
  templateVersion: "0.1.0",
  method: "welch_t",
  contrastConditionIds: ["condition.b", "condition.a"],
  observations: [
    { observationId: "o1", conditionId: "condition.b", experimentalUnitId: "unit.1", value: 10 },
    { observationId: "o2", conditionId: "condition.b", experimentalUnitId: "unit.2", value: 11 },
    { observationId: "o3", conditionId: "condition.a", experimentalUnitId: "unit.3", value: 1 },
    { observationId: "o4", conditionId: "condition.a", experimentalUnitId: "unit.4", value: 2 },
  ],
  options: { alternative: "two_sided", confidenceLevel: 0.9, multiplicityMethod: null },
});
// Deliberately differs from the raw means: rendering must use the recorded result, not recompute.
const result = AnalysisEngineResultSchema.parse({
  protocolVersion: "0.1.0",
  requestId: "req.plot",
  status: "ok",
  engine: { name: "lsaa-python", version: "fixture", packages: {} },
  estimates: [
    {
      name: "mean_difference",
      value: -2,
      standardError: 0.5,
      confidenceInterval: { level: 0.9, lower: -3, upper: -1 },
    },
  ],
  tests: [
    {
      name: "welch_two_sample_t_test",
      statisticName: "t",
      statistic: -4,
      degreesOfFreedom: [3],
      pValue: 0.02,
      adjustedPValue: null,
      effectSizeName: null,
      effectSize: null,
    },
  ],
  warnings: [],
  diagnostics: [],
  completedAt: "2026-10-09T00:00:00Z",
});
const conditions = [
  { id: "condition.a", label: "A" },
  { id: "condition.b", label: "B" },
];

it("renders the recorded signed estimate/CI and ordered IDs without mutating inputs", () => {
  const original = JSON.stringify({ request, result });
  render(<ExecutedMeanDifferencePlot request={request} result={result} conditions={conditions} />);
  const svg = screen.getByRole("img", { name: "実行済み平均差CIプロット" });
  expect(svg.querySelector('[data-effect-ci="estimate"]')).toHaveAttribute("data-value", "-2");
  expect(svg.querySelector('[data-effect-ci="interval"]')).toHaveAttribute("data-lower", "-3");
  expect(svg.querySelector('[data-effect-ci="interval"]')).toHaveAttribute("data-upper", "-1");
  expect(svg.querySelector("title")).toHaveTextContent("B (condition.b) − A (condition.a)");
  expect(svg).toHaveTextContent("90% CI");
  expect(JSON.stringify({ request, result })).toBe(original);
});

it.each([
  ["wrong result identity", request, { ...result, requestId: "req.other" }],
  [
    "missing CI",
    request,
    { ...result, estimates: [{ ...result.estimates[0]!, confidenceInterval: null }] },
  ],
  [
    "wrong CI level",
    request,
    {
      ...result,
      estimates: [
        { ...result.estimates[0]!, confidenceInterval: { level: 0.95, lower: -3, upper: -1 } },
      ],
    },
  ],
  [
    "one-sided request",
    { ...request, options: { ...request.options, alternative: "less" } },
    result,
  ],
  [
    "unselected third condition",
    {
      ...request,
      observations: [
        ...request.observations,
        { ...request.observations[0]!, conditionId: "condition.c", experimentalUnitId: "unit.5" },
      ],
    },
    result,
  ],
] as const)("does not plot %s", (_name, invalidRequest, invalidResult) => {
  render(
    <ExecutedMeanDifferencePlot
      request={AnalysisEngineRequestSchema.parse(invalidRequest)}
      result={AnalysisEngineResultSchema.parse(invalidResult)}
      conditions={conditions}
    />,
  );
  expect(screen.queryByRole("img", { name: "実行済み平均差CIプロット" })).not.toBeInTheDocument();
});

it("uses existing SVG and PNG export on the effect figure", async () => {
  render(<ExecutedMeanDifferencePlot request={request} result={result} conditions={conditions} />);
  fireEvent.click(screen.getByRole("button", { name: "SVGを書き出す" }));
  expect(await screen.findByRole("status")).toHaveTextContent("SVGで保存");
  const svgCall = vi.mocked(saveExportText).mock.calls.at(-1)!;
  expect(svgCall[0]).toContain('data-value="-2"');
  expect(svgCall[1]).toBe("executed-mean-difference.svg");
  expect(svgCall[2]).toBe("image/svg+xml;charset=utf-8");
  fireEvent.click(screen.getByRole("button", { name: "PNGを書き出す" }));
  expect(await screen.findByText("表示中のGraphを白背景のPNGで保存しました。")).toBeVisible();
  const pngCall = vi.mocked(exportGraphPng).mock.calls.at(-1)!;
  expect(pngCall[0]).toBe(screen.getByRole("img", { name: "実行済み平均差CIプロット" }));
  expect(pngCall[1]).toBe("executed-mean-difference.png");
});

it("restores the figure from saved analysis and removes it when scientific scope changes", () => {
  const assessment = {
    state: "ready" as const,
    title: "fixture",
    reason: "fixture",
    method: "welch_t" as const,
    recommendedMethod: "welch_t" as const,
    methodChoices: [],
    commonAlternative: null,
    nByCondition: [],
    missingCount: 0,
    notPlannedCount: 0,
    request,
  };
  const props = {
    assessment,
    design: null,
    analysisRunner: vi.fn(),
    initialAnalysis: { request, result, recommendedMethod: "welch_t" as const },
    conditionOptions: conditions,
  };
  const view = render(<GraphStatisticsPanel {...props} analysisContextKey="scope.original" />);
  expect(screen.getByRole("img", { name: "実行済み平均差CIプロット" })).toBeVisible();
  expect(props.analysisRunner).not.toHaveBeenCalled();
  view.rerender(<GraphStatisticsPanel {...props} analysisContextKey="scope.changed" />);
  expect(screen.queryByRole("img", { name: "実行済み平均差CIプロット" })).not.toBeInTheDocument();
});

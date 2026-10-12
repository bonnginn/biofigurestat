import { render, screen, fireEvent, within } from "@testing-library/react";
import { vi } from "vitest";
import { mkdirSync, writeFileSync } from "node:fs";
import path from "node:path";
import { AnalysisEngineRequestSchema, AnalysisEngineResultSchema } from "@lsaa/analysis-contracts";
import { ExecutedEstimationComposite } from "./ExecutedEstimationComposite";
import { GraphStatisticsPanel } from "./GraphStatisticsPanel";
import { saveExportText } from "../../app/graphExport";
import type * as GraphExport from "../../app/graphExport";

vi.mock("../../app/graphExport", async (importOriginal) => ({
  ...(await importOriginal<typeof GraphExport>()),
  saveExportText: vi.fn().mockResolvedValue("saved"),
  exportGraphPng: vi.fn().mockResolvedValue(undefined),
}));

const request = AnalysisEngineRequestSchema.parse({
  protocolVersion: "0.1.0",
  requestId: "request.composite",
  projectId: "project.fixture",
  analysisId: "analysis.fixture",
  templateId: "D01",
  templateVersion: "0.1.0",
  method: "welch_t",
  contrastConditionIds: ["condition.control", "condition.treatment"],
  observations: [
    {
      observationId: "o1",
      conditionId: "condition.control",
      experimentalUnitId: "unit.1",
      value: 3,
    },
    {
      observationId: "o2",
      conditionId: "condition.control",
      experimentalUnitId: "unit.2",
      value: 5,
    },
    {
      observationId: "o3",
      conditionId: "condition.treatment",
      experimentalUnitId: "unit.3",
      value: 8,
    },
    {
      observationId: "o4",
      conditionId: "condition.treatment",
      experimentalUnitId: "unit.4",
      value: 10,
    },
  ],
  options: { alternative: "two_sided", confidenceLevel: 0.95, multiplicityMethod: null },
});
const result = AnalysisEngineResultSchema.parse({
  protocolVersion: "0.1.0",
  requestId: "request.composite",
  status: "ok",
  engine: { name: "fixture", version: "1", packages: {} },
  estimates: [
    {
      name: "mean_difference",
      value: -5,
      standardError: 1,
      confidenceInterval: { level: 0.95, lower: -7, upper: -3 },
    },
  ],
  tests: [
    {
      name: "welch_two_sample_t_test",
      statisticName: "t",
      statistic: -5,
      degreesOfFreedom: [2],
      pValue: 0.05,
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
  { id: "condition.control", label: "Control" },
  { id: "condition.treatment", label: "Treatment" },
  { id: "condition.other", label: "Excluded display group" },
];
const nByCondition = [
  { conditionId: "condition.control", label: "Control", n: 2 },
  { conditionId: "condition.treatment", label: "Treatment", n: 2 },
  { conditionId: "condition.other", label: "Excluded display group", n: 500 },
];
const props = { request, result, conditions, nByCondition, valueUnit: "mg/L", unitLabel: "animal" };

it("composes exact executed unit points with the reused effect SVG and complete figure metadata", async () => {
  const original = JSON.stringify({ request, result });
  render(<ExecutedEstimationComposite {...props} />);
  const svg = screen.getByRole("img", { name: "実行対象2群と平均差95%CIの合成図" });
  expect(svg.querySelectorAll("circle[data-unit-id]")).toHaveLength(4);
  expect(
    [...svg.querySelectorAll("circle[data-unit-id]")].map((x) => x.getAttribute("data-value")),
  ).toEqual(["3", "5", "8", "10"]);
  expect(svg.querySelector('[data-effect-ci="estimate"]')).toHaveAttribute("data-value", "-5");
  expect(svg.querySelector('[data-effect-ci="interval"]')).toHaveAttribute("data-lower", "-7");
  expect(svg.querySelector('[data-effect-ci="interval"]')).toHaveAttribute("data-upper", "-3");
  expect(svg).toHaveTextContent("Control − Treatment");
  expect(svg).toHaveTextContent("mg/L");
  expect(svg).toHaveTextContent("n=2");
  expect(svg).toHaveTextContent("95%個別CI（多重性未調整）");
  expect(svg).not.toHaveTextContent("Excluded display group");
  expect(svg.querySelectorAll('[data-group-summary="mean"]')).toHaveLength(2);
  expect(JSON.stringify({ request, result })).toBe(original);
  fireEvent.click(
    within(screen.getByRole("region", { name: "実行対象2群の推定図" })).getByRole("button", {
      name: "SVGを書き出す",
    }),
  );
  await screen.findByRole("status");
  const text = vi.mocked(saveExportText).mock.calls.at(-1)![0];
  expect(text).toContain('data-composite-group="condition.control"');
  expect(text).toContain('data-effect-ci="interval"');
  if (process.env.BIO_COMPOSITE_ARTIFACT_DIR) {
    mkdirSync(process.env.BIO_COMPOSITE_ARTIFACT_DIR, { recursive: true });
    writeFileSync(path.join(process.env.BIO_COMPOSITE_ARTIFACT_DIR, "composite-fixture.svg"), text);
  }
});

it.each(["90percent", "wrong-id", "n-mismatch"])(
  "explicitly excludes %s without CI/n relabeling",
  (kind) => {
    const alteredRequest =
      kind === "90percent"
        ? AnalysisEngineRequestSchema.parse({
            ...request,
            options: { ...request.options, confidenceLevel: 0.9 },
          })
        : request;
    const alteredResult =
      kind === "90percent"
        ? AnalysisEngineResultSchema.parse({
            ...result,
            estimates: [
              { ...result.estimates[0]!, confidenceInterval: { level: 0.9, lower: -7, upper: -3 } },
            ],
          })
        : kind === "wrong-id"
          ? { ...result, requestId: "other.request" }
          : result;
    render(
      <ExecutedEstimationComposite
        {...props}
        request={alteredRequest}
        result={alteredResult}
        nByCondition={kind === "n-mismatch" ? [] : nByCondition}
      />,
    );
    expect(
      screen.queryByRole("img", { name: "実行対象2群と平均差95%CIの合成図" }),
    ).not.toBeInTheDocument();
    expect(screen.getByRole("note")).toHaveTextContent("表示条件外");
  },
);

it("marks unknown units explicitly rather than inventing them", () => {
  render(<ExecutedEstimationComposite {...props} valueUnit={null} />);
  expect(screen.getByRole("img", { name: "実行対象2群と平均差95%CIの合成図" })).toHaveTextContent(
    "単位未記録",
  );
});

it("restores a saved result composite and invalidates it when scientific context changes", () => {
  const assessment = {
    state: "ready" as const,
    title: "fixture",
    reason: "fixture",
    method: "welch_t" as const,
    recommendedMethod: "welch_t" as const,
    methodChoices: [],
    commonAlternative: null,
    nByCondition,
    missingCount: 0,
    notPlannedCount: 0,
    request,
  };
  const panelProps = {
    assessment,
    design: null,
    analysisRunner: vi.fn(),
    initialAnalysis: { request, result, recommendedMethod: "welch_t" as const },
    conditionOptions: conditions,
    analysisValueUnit: "mg/L",
    statisticalUnitLabel: "animal",
  };
  const view = render(<GraphStatisticsPanel {...panelProps} analysisContextKey="original" />);
  expect(screen.getByRole("img", { name: "実行対象2群と平均差95%CIの合成図" })).toBeVisible();
  expect(panelProps.analysisRunner).not.toHaveBeenCalled();
  view.rerender(<GraphStatisticsPanel {...panelProps} analysisContextKey="changed" />);
  expect(
    screen.queryByRole("img", { name: "実行対象2群と平均差95%CIの合成図" }),
  ).not.toBeInTheDocument();
});

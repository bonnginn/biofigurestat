import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import type { AxisMaterialRelationship, OrderedAxisMeaning } from "@lsaa/adaptive-input";
import type { AnalysisRunner } from "../app/analysisClient";
import type { SaveProjectAction } from "../app/projectActions";
import { ProjectStateSchema, type ProjectState } from "@lsaa/project";
import { CommonCoveragePage } from "./CommonCoveragePage";
import { OpenProjectPage } from "./OpenProjectPage";

const regressionRunner: AnalysisRunner = vi.fn(async (request) => ({
  protocolVersion: request.protocolVersion,
  requestId: request.requestId,
  status: "ok" as const,
  engine: { name: "fixture", version: "0.13.0", packages: {} },
  estimates: [
    {
      name: "slope",
      value: 1.97,
      standardError: 0.07,
      confidenceInterval: { level: 0.95, lower: 1.7, upper: 2.2 },
    },
  ],
  tests: [
    {
      name: "slope_hypothesis_test",
      statisticName: "t",
      statistic: 26,
      degreesOfFreedom: [3],
      pValue: 0.0001,
      adjustedPValue: null,
      effectSizeName: "r_squared",
      effectSize: 0.99,
    },
  ],
  regression: {
    slope: 1.97,
    intercept: 0.15,
    rSquared: 0.99,
    xRange: [1, 5] as [number, number],
    confidenceLevel: 0.95,
    fittedLine: [
      { x: 1, y: 2.12, lower: 1.8, upper: 2.4 },
      { x: 5, y: 10, lower: 9.7, upper: 10.3 },
    ],
  },
  diagnostics: [],
  warnings: [],
  completedAt: "2026-08-24T00:00:00.000Z",
}));

const nonlinearRunner: AnalysisRunner = vi.fn(async (request) => {
  if (request.protocolVersion !== "0.14.0") throw new Error("Expected D17 request");
  const series = request.seriesIds.map((seriesId: string, index: number) => ({
    seriesId,
    converged: true as const,
    parameters:
      request.modelId === "michaelis_menten"
        ? [
            {
              name: "vmax",
              value: 12 - index,
              standardError:
                request.fitInterpretation === "descriptive_point_estimate_only" ? null : 0.6,
              confidenceInterval:
                request.fitInterpretation === "descriptive_point_estimate_only"
                  ? null
                  : { level: 0.95, lower: 10.5, upper: 13.5 },
            },
            {
              name: "km",
              value: 18 + index,
              standardError:
                request.fitInterpretation === "descriptive_point_estimate_only" ? null : 1.2,
              confidenceInterval:
                request.fitInterpretation === "descriptive_point_estimate_only"
                  ? null
                  : { level: 0.95, lower: 15, upper: 21 },
            },
          ]
        : [
            {
              name: "plateau",
              value: 1.6 - index * 0.2,
              standardError:
                request.fitInterpretation === "descriptive_point_estimate_only" ? null : 0.08,
              confidenceInterval:
                request.fitInterpretation === "descriptive_point_estimate_only"
                  ? null
                  : { level: 0.95, lower: 1.3, upper: 1.8 },
            },
            {
              name: "rate",
              value: 0.03 - index * 0.004,
              standardError:
                request.fitInterpretation === "descriptive_point_estimate_only" ? null : 0.003,
              confidenceInterval:
                request.fitInterpretation === "descriptive_point_estimate_only"
                  ? null
                  : { level: 0.95, lower: 0.02, upper: 0.04 },
            },
          ],
    diagnostics: {
      n: 5,
      distinctX: 5,
      residualDegreesOfFreedom: 3,
      rss: 0.02,
      rmse: 0.06,
      rSquared: 0.99,
      aic: -20,
    },
    initialValues: request.initialValues[seriesId] ?? {},
    bounds: request.bounds[seriesId] ?? {},
    fittedCurve: [
      { x: 0, y: 0 },
      { x: 30, y: 0.95 - index * 0.2 },
      { x: 120, y: 1.55 - index * 0.25 },
    ],
  }));
  return {
    protocolVersion: request.protocolVersion,
    requestId: request.requestId,
    status: "ok" as const,
    engine: { name: "fixture-d17", version: "0.7.0", packages: { scipy: "1.18.0" } },
    estimates: series.flatMap(({ parameters }: (typeof series)[number]) => parameters),
    tests: [],
    nonlinearFit: {
      modelId: request.modelId,
      modelVersion: "0.1.0",
      modelFormula:
        request.modelId === "michaelis_menten"
          ? "vmax * x / (km + x)"
          : "Y = plateau * (1 - exp(-rate * X))",
      selectionRationale: request.modelSelectionRationale,
      series,
    },
    diagnostics: [],
    warnings: [],
    completedAt: "2026-08-25T08:00:00.000Z",
  };
});

const orderedAxisQuestion = "実験で段階的に変えたものは何ですか？";
const materialRelationshipQuestion =
  "各点は同じ反応・同じ対象を続けて測りましたか、それとも点ごとに別の反応・試料を用意しましたか？";
const pointParentRelationshipQuestion =
  "点ごとに別の試料を用意した場合、それらに同じ由来（同じdonor・animal・dish・実験run・batchなど）を共有する組がありますか？";
const seriesMeaningQuestion = "Series列で分けた名前は、何を表しますか？";
const seriesParentRelationshipQuestion =
  "異なるSeriesの試料に、同じ由来（同じdonor・animal・dish・実験run・batchなど）を共有する組がありますか？";
const adaptiveOrderedCurveIntent = {
  schemaVersion: "0.1.0",
  moduleId: "ordered_curve_kinetics",
  destination: "nonlinear-fit",
  sourceContext: "protein_biochemical",
  entryRouteId: "ordered-curve-test-route",
  experimentName: "Ordered curve experiment",
  experimentDescription: "A response was measured along one ordered quantity.",
  subjectUnitLabel: "Reaction / experimental run",
  facts: { orderedAxisCount: 1 },
} as const;

function answerOrderedCurveFacts(
  axisMeaning: OrderedAxisMeaning,
  materialRelationship: AxisMaterialRelationship,
): void {
  const axisNames: Record<OrderedAxisMeaning, string> = {
    elapsed_time: "Elapsed time",
    substrate_concentration: "Substrate concentration",
    treatment_concentration: "Treatment concentration",
    temperature: "Temperature",
    distance: "Distance",
    other_ordered_quantity: "Ordered quantity",
  };
  const axisLabel = screen.queryByRole("textbox", { name: "横軸に表示する量の名前" });
  const readoutLabel = screen.queryByRole("textbox", { name: "測った値の名前" });
  if (axisLabel) fireEvent.change(axisLabel, { target: { value: axisNames[axisMeaning] } });
  if (readoutLabel) fireEvent.change(readoutLabel, { target: { value: "Measured response" } });
  fireEvent.change(screen.getByRole("combobox", { name: orderedAxisQuestion }), {
    target: { value: axisMeaning },
  });
  fireEvent.change(screen.getByRole("combobox", { name: materialRelationshipQuestion }), {
    target: { value: materialRelationship },
  });
  if (materialRelationship === "separate_material_per_axis_value") {
    fireEvent.change(screen.getByRole("combobox", { name: pointParentRelationshipQuestion }), {
      target: { value: "no_shared_parent_or_matching" },
    });
  }
  const seriesMeaning = screen.queryByRole("combobox", { name: seriesMeaningQuestion });
  if (seriesMeaning) {
    fireEvent.change(seriesMeaning, { target: { value: "experimental_conditions" } });
    fireEvent.change(screen.getByRole("combobox", { name: seriesParentRelationshipQuestion }), {
      target: { value: "no_shared_parent_or_matching" },
    });
  }
}

describe("final common coverage workflows", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });
  it("ブラウザレビューでengine未接続なら解析実行をdisabledで説明する", () => {
    render(<CommonCoveragePage mode="nonlinear-fit" onBack={vi.fn()} analysisAvailable={false} />);
    expect(screen.getByRole("button", { name: "選択したmodelでfitを実行" })).toBeDisabled();
    expect(screen.getByText(/ブラウザレビューでは解析エンジンを実行できません/)).toBeVisible();
  });
  it("runs regression separately from correlation and renders fitted Graph and Methods", async () => {
    render(
      <CommonCoveragePage mode="regression" onBack={vi.fn()} analysisRunner={regressionRunner} />,
    );
    expect(screen.getByText(/相関とは別/)).toBeVisible();
    fireEvent.click(screen.getByRole("button", { name: "解析を実行" }));
    await waitFor(() =>
      expect(screen.getByRole("img", { name: "Simple linear regression Graph" })).toBeVisible(),
    );
    expect(screen.getByText("Methods")).toBeVisible();
    expect(regressionRunner).toHaveBeenCalledWith(
      expect.objectContaining({ protocolVersion: "0.13.0", includeIntercept: true }),
    );
  });

  it("refuses a log axis containing zero without removing points", () => {
    render(<CommonCoveragePage mode="distribution" onBack={vi.fn()} />);
    fireEvent.change(screen.getByLabelText("Histogram / ECDF data"), {
      target: { value: "0 1 10" },
    });
    fireEvent.change(screen.getByLabelText("X scale"), { target: { value: "log10" } });
    expect(screen.getByRole("alert")).toHaveTextContent(/not removed/);
  });

  it("keeps the default nonlinear model rationale aligned with model selection", () => {
    render(<CommonCoveragePage mode="nonlinear-fit" onBack={vi.fn()} />);
    fireEvent.click(screen.getByRole("radio", { name: /One-phase association/ }));
    expect(
      (screen.getByRole("textbox", { name: "Model selectionの理由" }) as HTMLTextAreaElement).value,
    ).toContain("開始値をデータから推定");
  });

  it("starts both intent and cold curve routes with only a header and loads examples explicitly", () => {
    const view = render(
      <CommonCoveragePage
        mode="nonlinear-fit"
        onBack={vi.fn()}
        entryIntent={{
          schemaVersion: "0.1.0",
          moduleId: "ordered_curve_kinetics",
          destination: "nonlinear-fit",
          sourceContext: "protein_biochemical",
          entryRouteId: "ordered-curve-empty-start",
          experimentName: "Ordered curve",
          experimentDescription: "An ordered quantity and a response were measured.",
          subjectUnitLabel: "Reaction / experimental run",
          facts: { orderedAxisCount: 1 },
        }}
      />,
    );

    expect(screen.getByLabelText("非線形XYフィッティング data")).toHaveValue(
      "Unit ID\tSeries\tX\tY",
    );
    expect(screen.queryByRole("alert")).toBeNull();
    expect(screen.queryByRole("img", { name: "観測X/Y Graph" })).toBeNull();
    expect(screen.queryByRole("textbox", { name: "Model selectionの理由" })).toBeNull();
    expect(screen.getByRole("button", { name: "入力形式の例を読み込む（合成値）" })).toBeDisabled();

    answerOrderedCurveFacts("distance", "same_physical_material_across_axis");
    fireEvent.click(screen.getByRole("button", { name: "入力形式の例を読み込む（合成値）" }));
    expect(screen.getByLabelText("非線形XYフィッティング data")).toHaveValue(
      "Unit ID\tSeries\tX\tY\nunit-1\tSeries A\t0\t0\nunit-1\tSeries A\t1\t0.4\nunit-1\tSeries A\t2\t0.8",
    );
    expect(screen.getByRole("img", { name: "観測X/Y Graph" })).toBeVisible();
    expect(screen.queryByRole("textbox", { name: "Model selectionの理由" })).toBeNull();

    view.unmount();
    render(<CommonCoveragePage mode="nonlinear-fit" onBack={vi.fn()} />);
    expect(screen.getByLabelText("非線形XYフィッティング data")).toHaveValue(
      "Unit ID\tSeries\tX\tY",
    );
    expect(screen.getByRole("textbox", { name: "Model selectionの理由" })).toBeVisible();
    expect(screen.queryByRole("img", { name: "観測X/Y Graph" })).toBeNull();

    fireEvent.click(screen.getByRole("button", { name: "入力形式の例を読み込む（合成値）" }));
    expect(screen.getByLabelText("非線形XYフィッティング data")).not.toHaveValue(
      "Unit ID\tSeries\tX\tY",
    );
    expect(screen.getByRole("img", { name: "観測X/Y Graph" })).toBeVisible();
  });

  it("keeps separate points with a shared donor/run out of the independent curve projection", () => {
    const saveProject = vi.fn<SaveProjectAction>();
    render(
      <CommonCoveragePage
        mode="nonlinear-fit"
        onBack={vi.fn()}
        saveProject={saveProject}
        entryIntent={{
          schemaVersion: "0.1.0",
          moduleId: "ordered_curve_kinetics",
          destination: "nonlinear-fit",
          sourceContext: "protein_biochemical",
          entryRouteId: "ordered-curve-shared-parent",
          experimentName: "Matched reactions",
          experimentDescription: "Separate reactions at each point came from shared runs.",
          subjectUnitLabel: "Reaction / experimental run",
          facts: { orderedAxisCount: 1 },
        }}
      />,
    );
    const rawText =
      "Unit ID\tSeries\tX\tY\nrun1-x0\tA\t0\t0\nrun1-x1\tA\t1\t0.4\nrun1-x2\tA\t2\t0.8";
    fireEvent.change(screen.getByLabelText("非線形XYフィッティング data"), {
      target: { value: rawText },
    });
    fireEvent.change(screen.getByRole("combobox", { name: orderedAxisQuestion }), {
      target: { value: "treatment_concentration" },
    });
    fireEvent.change(screen.getByRole("combobox", { name: materialRelationshipQuestion }), {
      target: { value: "separate_material_per_axis_value" },
    });
    fireEvent.change(screen.getByRole("combobox", { name: pointParentRelationshipQuestion }), {
      target: { value: "shared_parent_or_matching" },
    });

    expect(screen.getByRole("img", { name: "観測X/Y Graph" })).toBeVisible();
    expect(screen.getByText(/親IDを保持できる一般の実験設定/)).toBeVisible();
    expect(screen.getByRole("button", { name: "統計解析を設定" })).toBeDisabled();
    expect(
      screen.getByRole("button", { name: "入力と観測Graphをプロジェクトへ保存" }),
    ).toBeDisabled();
    expect(screen.queryByRole("button", { name: "選択したmodelでfitを実行" })).toBeNull();
    expect(screen.getByLabelText("非線形XYフィッティング data")).toHaveValue(rawText);
    expect(saveProject).not.toHaveBeenCalled();
  });

  it("keeps multi-series shared preparation out of curve comparison", () => {
    const saveProject = vi.fn<SaveProjectAction>();
    const analysisRunner = vi.fn<AnalysisRunner>();
    render(
      <CommonCoveragePage
        mode="nonlinear-fit"
        onBack={vi.fn()}
        analysisRunner={analysisRunner}
        saveProject={saveProject}
        entryIntent={adaptiveOrderedCurveIntent}
      />,
    );
    const rawText =
      "Unit ID\tSeries\tX\tY\nrun1-control-0\tControl\t0\t0\nrun1-control-1\tControl\t1\t0.4\nrun1-drug-0\tDrug\t0\t0.1\nrun1-drug-1\tDrug\t1\t0.7";
    fireEvent.change(screen.getByLabelText("非線形XYフィッティング data"), {
      target: { value: rawText },
    });
    answerOrderedCurveFacts("treatment_concentration", "separate_material_per_axis_value");
    fireEvent.change(screen.getByRole("combobox", { name: seriesParentRelationshipQuestion }), {
      target: { value: "shared_parent_or_matching" },
    });

    expect(screen.getByRole("img", { name: "観測X/Y Graph" })).toBeVisible();
    expect(
      screen.getByText(/異なるSeriesの試料に共通の由来または対応関係があります/),
    ).toBeVisible();
    expect(screen.getByRole("button", { name: "統計解析を設定" })).toBeDisabled();
    expect(
      screen.getByRole("button", { name: "入力と観測Graphをプロジェクトへ保存" }),
    ).toBeDisabled();
    expect(screen.getByLabelText("非線形XYフィッティング data")).toHaveValue(rawText);
    expect(analysisRunner).not.toHaveBeenCalled();
    expect(saveProject).not.toHaveBeenCalled();
  });

  it.each([
    {
      label: "同じ対象を追うtime course",
      axisMeaning: "elapsed_time" as const,
      materialRelationship: "same_physical_material_across_axis" as const,
      expectedSummary: /同じ対象を追えるIDを保った入力表/,
    },
    {
      label: "濃度点ごとに別試料を用意するcurve",
      axisMeaning: "treatment_concentration" as const,
      materialRelationship: "separate_material_per_axis_value" as const,
      expectedSummary: /共通の由来や対応関係がないという回答に基づき/,
    },
  ])(
    "$labelをproduction画面で区別し、入力済みX/Yを保持する",
    async ({ axisMeaning, materialRelationship, expectedSummary }) => {
      vi.mocked(nonlinearRunner).mockClear();
      const onDraftChange = vi.fn();
      render(
        <CommonCoveragePage
          mode="nonlinear-fit"
          onBack={vi.fn()}
          analysisRunner={nonlinearRunner}
          onDraftChange={onDraftChange}
          entryIntent={adaptiveOrderedCurveIntent}
        />,
      );
      const setupButton = screen.getByRole("button", { name: "統計解析を設定" });
      const data = screen.getByLabelText("非線形XYフィッティング data");
      const retainedInput =
        materialRelationship === "same_physical_material_across_axis"
          ? "Unit ID\tSeries\tX\tY\nkept-1\tA\t0\t0\nkept-1\tA\t1\t0.4\nkept-1\tA\t2\t0.7\nkept-1\tA\t3\t0.9"
          : "Unit ID\tSeries\tX\tY\npoint-0\tA\t0\t0\npoint-1\tA\t1\t0.4\npoint-2\tA\t2\t0.7\npoint-3\tA\t3\t0.9";

      expect(setupButton).toBeDisabled();
      fireEvent.change(data, { target: { value: retainedInput } });
      answerOrderedCurveFacts(axisMeaning, materialRelationship);

      expect(screen.getByText(expectedSummary)).toBeVisible();
      expect(data).toHaveValue(retainedInput);
      if (materialRelationship === "same_physical_material_across_axis") {
        expect(setupButton).toBeEnabled();
        expect(screen.getByText(/modelを明示的に選んで/)).toBeVisible();
      } else {
        expect(setupButton).toBeEnabled();
      }
      await waitFor(() =>
        expect(onDraftChange).toHaveBeenLastCalledWith(
          expect.objectContaining({
            text: retainedInput,
            entryModuleFacts: expect.objectContaining({
              orderedAxisMeaning: axisMeaning,
              axisMaterialRelationship: materialRelationship,
              ...(materialRelationship === "separate_material_per_axis_value"
                ? { axisPointParentRelationship: "no_shared_parent_or_matching" }
                : {}),
              orderedAxisCount: 1,
            }),
          }),
        ),
      );
    },
  );

  it("runs a repeated trajectory as a descriptive fit without inferential uncertainty", async () => {
    vi.mocked(nonlinearRunner).mockClear();
    render(
      <CommonCoveragePage
        mode="nonlinear-fit"
        onBack={vi.fn()}
        analysisRunner={nonlinearRunner}
        entryIntent={adaptiveOrderedCurveIntent}
      />,
    );
    fireEvent.change(screen.getByLabelText("非線形XYフィッティング data"), {
      target: {
        value:
          "Unit ID\tSeries\tX\tY\nreaction-1\tControl\t0\t0\nreaction-1\tControl\t1\t0.4\nreaction-1\tControl\t2\t0.7\nreaction-1\tControl\t3\t0.9",
      },
    });
    answerOrderedCurveFacts("elapsed_time", "same_physical_material_across_axis");
    fireEvent.click(screen.getByRole("button", { name: "統計解析を設定" }));
    fireEvent.click(screen.getByRole("radio", { name: /Zero-baseline association/ }));

    fireEvent.click(screen.getByRole("button", { name: "選択したmodelで記述的fitを実行" }));

    await waitFor(() => expect(nonlinearRunner).toHaveBeenCalledOnce());
    expect(nonlinearRunner).toHaveBeenCalledWith(
      expect.objectContaining({
        protocolVersion: "0.14.0",
        fitInterpretation: "descriptive_point_estimate_only",
      }),
    );
    expect(screen.getByText(/Parameterは点推定として表示/)).toBeVisible();
    expect(screen.queryByRole("columnheader", { name: "SE" })).toBeNull();
    expect(screen.queryByRole("columnheader", { name: "95% CI" })).toBeNull();
    expect(screen.queryByText("AIC")).toBeNull();
  });

  it.each([
    {
      label: "同じ対象と回答したのに全点のIDが別",
      materialRelationship: "same_physical_material_across_axis" as const,
      text: "Unit ID\tSeries\tX\tY\np0\tA\t0\t0\np1\tA\t1\t0.4\np2\tA\t2\t0.7\np3\tA\t3\t0.9",
      expected: /Unit IDを複数のX点で同じにしてください/,
    },
    {
      label: "別試料と回答したのに同じIDを異なるXへ再利用",
      materialRelationship: "separate_material_per_axis_value" as const,
      text: "Unit ID\tSeries\tX\tY\nreaction-1\tA\t0\t0\nreaction-1\tA\t1\t0.4\nreaction-1\tA\t2\t0.7\nreaction-1\tA\t3\t0.9",
      expected: /異なるX点へ同じUnit IDを使わないでください/,
    },
  ])("$labelならfit前に停止する", async ({ materialRelationship, text, expected }) => {
    vi.mocked(nonlinearRunner).mockClear();
    render(
      <CommonCoveragePage
        mode="nonlinear-fit"
        onBack={vi.fn()}
        analysisRunner={nonlinearRunner}
        entryIntent={adaptiveOrderedCurveIntent}
      />,
    );
    fireEvent.change(screen.getByLabelText("非線形XYフィッティング data"), {
      target: { value: text },
    });
    answerOrderedCurveFacts("elapsed_time", materialRelationship);
    expect(screen.getByText(expected)).toBeVisible();
    expect(screen.getByRole("button", { name: "統計解析を設定" })).toBeDisabled();
    expect(screen.queryByRole("button", { name: "選択したmodelでfitを実行" })).toBeNull();
    expect(nonlinearRunner).not.toHaveBeenCalled();
  });

  it("safe-stops an unknown same-vs-separate answer without losing data or navigating", async () => {
    vi.mocked(nonlinearRunner).mockClear();
    const onNavigate = vi.fn();
    const onDraftChange = vi.fn();
    render(
      <CommonCoveragePage
        mode="nonlinear-fit"
        onBack={vi.fn()}
        onNavigate={onNavigate}
        analysisRunner={nonlinearRunner}
        onDraftChange={onDraftChange}
        entryIntent={adaptiveOrderedCurveIntent}
      />,
    );
    const data = screen.getByLabelText("非線形XYフィッティング data");
    const retainedInput =
      "Unit ID\tSeries\tX\tY\nunknown-1\tA\t0\t0\nunknown-1\tA\t1\t0.3\nunknown-1\tA\t2\t0.7\nunknown-1\tA\t3\t0.9";
    fireEvent.change(data, { target: { value: retainedInput } });
    answerOrderedCurveFacts("distance", "unknown");

    expect(screen.getByText(/推測せずここで止め、入力済みの内容は保持します/)).toBeVisible();
    expect(screen.getByRole("button", { name: "統計解析を設定" })).toBeDisabled();
    expect(screen.queryByRole("button", { name: "選択したmodelでfitを実行" })).toBeNull();
    expect(nonlinearRunner).not.toHaveBeenCalled();
    expect(onNavigate).not.toHaveBeenCalled();
    expect(data).toHaveValue(retainedInput);
    await waitFor(() =>
      expect(onDraftChange).toHaveBeenLastCalledWith(
        expect.objectContaining({
          text: retainedInput,
          entryModuleFacts: expect.objectContaining({
            orderedAxisMeaning: "distance",
            axisMaterialRelationship: "unknown",
          }),
        }),
      ),
    );
  });

  it("safe-stops multiple ordered axes without coercion and keeps the entered table", async () => {
    vi.mocked(nonlinearRunner).mockClear();
    const onNavigate = vi.fn();
    const onDraftChange = vi.fn();
    render(
      <CommonCoveragePage
        mode="nonlinear-fit"
        onBack={vi.fn()}
        onNavigate={onNavigate}
        analysisRunner={nonlinearRunner}
        onDraftChange={onDraftChange}
        entryIntent={adaptiveOrderedCurveIntent}
      />,
    );
    const data = screen.getByLabelText("非線形XYフィッティング data");
    const retainedInput =
      "Unit ID\tSeries\tX\tY\naxis-1\tA\t0\t0\naxis-1\tA\t1\t0.4\naxis-1\tA\t2\t0.8\naxis-1\tA\t3\t1";
    fireEvent.change(data, { target: { value: retainedInput } });
    answerOrderedCurveFacts("elapsed_time", "same_physical_material_across_axis");
    fireEvent.click(
      screen.getByRole("checkbox", {
        name: "時間と濃度など、順序のある量を2つ以上同時に変えた",
      }),
    );

    expect(screen.getByText(/2つの順序をもつ量があります。1つの軸へまとめず/)).toBeVisible();
    expect(screen.getByRole("button", { name: "統計解析を設定" })).toBeDisabled();
    expect(screen.queryByRole("button", { name: "選択したmodelでfitを実行" })).toBeNull();
    expect(data).toHaveValue(retainedInput);
    expect(nonlinearRunner).not.toHaveBeenCalled();
    expect(onNavigate).not.toHaveBeenCalled();
    await waitFor(() =>
      expect(onDraftChange).toHaveBeenLastCalledWith(
        expect.objectContaining({
          text: retainedInput,
          entryModuleFacts: expect.objectContaining({ orderedAxisCount: 2 }),
        }),
      ),
    );
  });

  it("hides an open model panel while the ordered-curve surface is structurally unavailable and restores it losslessly", () => {
    render(
      <CommonCoveragePage
        mode="nonlinear-fit"
        onBack={vi.fn()}
        analysisRunner={nonlinearRunner}
        entryIntent={adaptiveOrderedCurveIntent}
      />,
    );
    const retainedInput =
      "Unit ID\tSeries\tX\tY\naxis-1\tA\t0\t0\naxis-1\tA\t1\t0.4\naxis-1\tA\t2\t0.8\naxis-1\tA\t3\t1";
    const data = screen.getByLabelText("非線形XYフィッティング data");
    fireEvent.change(data, { target: { value: retainedInput } });
    answerOrderedCurveFacts("elapsed_time", "same_physical_material_across_axis");
    fireEvent.click(
      screen.getByRole("button", { name: /^(統計解析|曲線モデル)を設定$/ }),
    );
    const retainedModel = screen.getByRole("radio", { name: /One-phase association/ });
    fireEvent.click(retainedModel);
    expect(retainedModel).toBeChecked();

    const multipleAxes = screen.getByRole("checkbox", {
      name: "時間と濃度など、順序のある量を2つ以上同時に変えた",
    });
    fireEvent.click(multipleAxes);

    expect(screen.getByText(/2つの順序をもつ量があります。1つの軸へまとめず/)).toBeVisible();
    expect(screen.queryByRole("radio", { name: /One-phase association/ })).toBeNull();
    expect(
      screen.getByRole("button", { name: /^(統計解析|曲線モデル)を設定$/ }),
    ).toBeDisabled();
    expect(data).toHaveValue(retainedInput);
    expect(screen.getByRole("combobox", { name: orderedAxisQuestion })).toHaveValue(
      "elapsed_time",
    );

    fireEvent.click(multipleAxes);

    expect(screen.getByRole("radio", { name: /One-phase association/ })).toBeChecked();
    expect(data).toHaveValue(retainedInput);
  });

  it("preserves exact clipboard text and reopens ordered-curve input before fit without inventing an analysis", async () => {
    let savedState: Parameters<SaveProjectAction>[0] | null = null;
    const saveProject = vi.fn<SaveProjectAction>(async (state) => {
      savedState = state;
      return { state, target: "C:/tmp/prefit-ordered-curve.lsa" };
    });
    const rawText =
      "Unit ID\tSeries\tX\tY\r\nreaction-a\tControl\t0\t0\r\nreaction-a\tControl\t5\t0.4\r\nreaction-a\tControl\t10\t0.8\r\n";
    const view = render(
      <CommonCoveragePage
        mode="nonlinear-fit"
        onBack={vi.fn()}
        analysisRunner={nonlinearRunner}
        saveProject={saveProject}
        entryIntent={{
          schemaVersion: "0.1.0",
          moduleId: "ordered_curve_kinetics",
          destination: "nonlinear-fit",
          sourceContext: "protein_biochemical",
          entryRouteId: "ordered-curve-test",
          experimentName: "Reaction time course",
          experimentDescription: "The same reaction was measured at three elapsed times.",
          subjectUnitLabel: "Reaction / experimental run",
          facts: { orderedAxisCount: 1 },
        }}
      />,
    );
    const rawTextarea = screen.getByLabelText("非線形XYフィッティング data") as HTMLTextAreaElement;
    expect(rawTextarea).toHaveValue("Unit ID\tSeries\tX\tY");
    expect(screen.queryByRole("alert")).toBeNull();
    expect(screen.queryByRole("textbox", { name: "Model selectionの理由" })).toBeNull();
    rawTextarea.setSelectionRange(0, rawTextarea.value.length);
    fireEvent.paste(rawTextarea, {
      clipboardData: { getData: (format: string) => (format === "text/plain" ? rawText : "") },
    });
    answerOrderedCurveFacts("elapsed_time", "same_physical_material_across_axis");

    expect(screen.getByRole("img", { name: "観測X/Y Graph" })).toBeVisible();
    expect(nonlinearRunner).not.toHaveBeenCalled();
    fireEvent.click(screen.getByRole("button", { name: "入力と観測Graphをプロジェクトへ保存" }));
    await waitFor(() => expect(saveProject).toHaveBeenCalledOnce());

    const saved = ProjectStateSchema.parse(savedState);
    expect(saved.analysisRuns).toEqual([]);
    expect(saved.graphs).toEqual([]);
    expect(saved.adaptiveInput?.rawLineage?.rawText).toBe(rawText);
    expect(saved.adaptiveInput?.rawLineage?.transformations).toContain(
      "preserved clipboard text/plain exactly as delivered by the Clipboard API",
    );
    expect(saved.adaptiveInput?.canonicalObservations).toHaveLength(3);
    expect(saved.adaptiveInput?.contract.orderedAxes[0]).toMatchObject({
      sampling: "repeated_same_identity",
      identityRetained: true,
    });
    expect(saved.adaptiveInput?.surface.surfaceId).toBe("repeated_axis_matrix");
    expect(saved.adaptiveInput?.equivalence.status).toBe("equivalent");
    expect(saved.designRevisions[0]?.design.adaptiveStructure?.contract).toEqual(
      saved.adaptiveInput?.contract,
    );

    const observedGraph = screen.getByRole("img", { name: "観測X/Y Graph" });
    const setupAnalysis = screen.getByRole("button", { name: "統計解析を設定" });
    expect(
      observedGraph.compareDocumentPosition(setupAnalysis) & Node.DOCUMENT_POSITION_FOLLOWING,
    ).toBeTruthy();
    expect(setupAnalysis).toBeEnabled();
    expect(screen.getByText(/modelを明示的に選んで/)).toBeVisible();
    expect(screen.queryByRole("button", { name: "選択したmodelでfitを実行" })).toBeNull();
    expect(nonlinearRunner).not.toHaveBeenCalled();
    expect(
      screen.getByRole("button", { name: "入力と観測Graphをプロジェクトへ保存" }),
    ).toBeEnabled();
    expect(screen.queryByText(/full Statistics support/i)).toBeNull();

    view.unmount();
    const resaveProject = vi.fn<SaveProjectAction>(async (state, target) => ({
      state,
      target: target ?? "C:/tmp/unexpected.lsa",
    }));
    render(
      <OpenProjectPage
        onNavigate={vi.fn()}
        openProject={vi.fn(async () => null)}
        saveProject={resaveProject}
        persistedProject={{ state: saved, target: "C:/tmp/prefit-ordered-curve.lsa" }}
      />,
    );
    expect(screen.getByRole("heading", { name: "Reaction time course" })).toBeVisible();
    expect(screen.getByLabelText("非線形XYフィッティング data")).toHaveValue(
      rawText.replaceAll("\r\n", "\n"),
    );
    expect(screen.getByRole("img", { name: "観測X/Y Graph" })).toBeVisible();
    expect(screen.queryByLabelText("専門解析を切り替える")).toBeNull();
    fireEvent.click(screen.getByRole("button", { name: "入力と観測Graphをプロジェクトへ保存" }));
    await waitFor(() => expect(resaveProject).toHaveBeenCalledOnce());
    expect(resaveProject.mock.calls[0]?.[1]).toBe("C:/tmp/prefit-ordered-curve.lsa");
    const resaved = ProjectStateSchema.parse(resaveProject.mock.calls[0]?.[0]);
    expect(resaved.adaptiveInput?.rawLineage?.rawText).toBe(rawText);
  });

  it("imports a CSV file with its name, source kind, and exact raw lineage", async () => {
    let savedState: Parameters<SaveProjectAction>[0] | null = null;
    const saveProject = vi.fn<SaveProjectAction>(async (state) => {
      savedState = state;
      return { state, target: "C:/tmp/file-ordered-curve.lsa" };
    });
    render(
      <CommonCoveragePage
        mode="nonlinear-fit"
        onBack={vi.fn()}
        saveProject={saveProject}
        entryIntent={adaptiveOrderedCurveIntent}
      />,
    );
    const rawText =
      "Unit ID,Series,X,Y\r\npoint-0,Control,0,0\r\npoint-1,Control,1,0.4\r\npoint-2,Control,2,0.8\r\n";
    const file = new File([rawText], "curve-input.csv", { type: "text/csv" });
    Object.defineProperty(file, "text", { value: vi.fn(async () => rawText) });
    fireEvent.change(screen.getByLabelText("CSV / TSV / TXTを読み込む"), {
      target: { files: [file] },
    });
    await waitFor(() =>
      expect(screen.getByLabelText("非線形XYフィッティング data")).toHaveValue(
        rawText.replaceAll("\r\n", "\n"),
      ),
    );
    answerOrderedCurveFacts("treatment_concentration", "separate_material_per_axis_value");
    fireEvent.click(screen.getByRole("button", { name: "入力と観測Graphをプロジェクトへ保存" }));
    await waitFor(() => expect(saveProject).toHaveBeenCalledOnce());

    const saved = ProjectStateSchema.parse(savedState);
    expect(saved.adaptiveInput?.rawLineage).toMatchObject({
      sourceKind: "csv",
      sourceLabel: "curve-input.csv",
      rawText,
    });
    expect(saved.adaptiveInput?.rawLineage?.transformations).toContain(
      "preserved file text exactly as delivered by the File API",
    );
    expect(saved.adaptiveInput?.mapping?.delimiter).toBe("comma");
  });

  it("keeps an observed Graph but blocks fit and project projection when one ID spans series", () => {
    const saveProject = vi.fn<SaveProjectAction>();
    render(
      <CommonCoveragePage
        mode="nonlinear-fit"
        onBack={vi.fn()}
        analysisRunner={nonlinearRunner}
        saveProject={saveProject}
        entryIntent={adaptiveOrderedCurveIntent}
      />,
    );
    const rawText =
      "Unit ID\tSeries\tX\tY\nshared-1\tControl\t0\t0\nshared-1\tControl\t1\t0.4\nshared-1\tDrug\t0\t0.1\nshared-1\tDrug\t1\t0.7";
    fireEvent.change(screen.getByLabelText("非線形XYフィッティング data"), {
      target: { value: rawText },
    });
    answerOrderedCurveFacts("elapsed_time", "same_physical_material_across_axis");

    expect(screen.getByRole("img", { name: "観測X/Y Graph" })).toBeVisible();
    expect(screen.getByText(/同じUnit IDが複数のSeries/)).toBeVisible();
    expect(screen.getByRole("button", { name: "統計解析を設定" })).toBeDisabled();
    expect(screen.queryByRole("button", { name: "選択したmodelでfitを実行" })).toBeNull();
    expect(
      screen.getByRole("button", { name: "入力と観測Graphをプロジェクトへ保存" }),
    ).toBeDisabled();
    expect(screen.getByLabelText("非線形XYフィッティング data")).toHaveValue(rawText);
    expect(nonlinearRunner).not.toHaveBeenCalled();
    expect(saveProject).not.toHaveBeenCalled();
  });

  it("takes the dedicated enzyme sheet through deliberate Michaelis-Menten fit and lossless reopen", async () => {
    vi.mocked(nonlinearRunner).mockClear();
    const exactRawText =
      "Unit ID\tSeries\tX\tY\nrxn-0\tEnzyme A\t0\t0\nrxn-5\tEnzyme A\t5\t2.4\nrxn-10\tEnzyme A\t10\t4.1\nrxn-20\tEnzyme A\t20\t6.3\nrxn-50\tEnzyme A\t50\t8.8";
    let savedState: Parameters<SaveProjectAction>[0] | null = null;
    const saveProject = vi.fn<SaveProjectAction>(async (state) => {
      savedState = state;
      return { state, target: "C:/tmp/michaelis-menten.lsa" };
    });
    const view = render(
      <CommonCoveragePage
        mode="nonlinear-fit"
        onBack={vi.fn()}
        analysisRunner={nonlinearRunner}
        saveProject={saveProject}
        entryIntent={{
          ...adaptiveOrderedCurveIntent,
          entryRouteId: "michaelis-menten-adaptive",
          experimentName: "Michaelis–Menten enzyme kinetics",
        }}
      />,
    );

    expect(screen.getByRole("navigation", { name: "プロジェクトワークスペース" })).toBeVisible();
    expect(screen.getByRole("region", { name: "曲線データ表" })).toBeVisible();
    expect(screen.getByRole("combobox", { name: orderedAxisQuestion })).toHaveValue("");
    fireEvent.paste(screen.getByLabelText("曲線データ表 行2 列1"), {
      clipboardData: {
        getData: () => exactRawText.split("\n").slice(1).join("\n"),
      },
    });
    expect(screen.getByLabelText("曲線データ表 行2 列1")).toHaveValue("rxn-0");
    expect(screen.getByLabelText("曲線データ表 行2 列2")).toHaveValue("Enzyme A");
    expect(screen.getByLabelText("曲線データ表 行6 列4")).toHaveValue("8.8");
    expect(screen.getByLabelText("非線形XYフィッティング data")).toHaveValue(exactRawText);
    answerOrderedCurveFacts("substrate_concentration", "separate_material_per_axis_value");
    expect(screen.getByRole("img", { name: "観測X/Y Graph" })).toBeVisible();
    expect(screen.queryByRole("radio", { name: /Michaelis–Menten enzyme kinetics/ })).toBeNull();
    fireEvent.click(screen.getByRole("button", { name: "統計解析を設定" }));
    expect(screen.getByRole("radio", { name: /Zero-baseline association/ })).toBeVisible();
    expect(screen.getByRole("radio", { name: /One-phase association/ })).toBeVisible();
    expect(screen.getByRole("textbox", { name: "Model selectionの理由" })).toHaveValue("");
    fireEvent.click(screen.getByRole("radio", { name: /Michaelis–Menten enzyme kinetics/ }));
    expect(screen.getByText(/時系列をそのまま入力する欄ではありません/)).toBeVisible();
    fireEvent.change(screen.getByRole("textbox", { name: "横軸に表示する量の名前" }), {
      target: { value: "Substrate concentration" },
    });
    fireEvent.change(screen.getByRole("textbox", { name: "測った値の名前" }), {
      target: { value: "Initial velocity" },
    });
    expect(
      (screen.getByRole("textbox", { name: "Model selectionの理由" }) as HTMLTextAreaElement).value,
    ).toContain("VmaxとKm");
    fireEvent.change(screen.getByLabelText("Michaelis–MentenのY値"), {
      target: { value: "calculated_initial_velocity" },
    });

    fireEvent.click(screen.getByText(/Initial values \/ bounds/));
    expect(screen.getByRole("rowheader", { name: "Vmax" })).toBeVisible();
    expect(screen.getByRole("rowheader", { name: "Km" })).toBeVisible();
    expect(screen.queryByRole("rowheader", { name: "plateau" })).toBeNull();

    fireEvent.click(screen.getByRole("button", { name: "選択したmodelでfitを実行" }));
    await waitFor(() =>
      expect(
        screen.getByText(/Michaelis–Menten fitでは、基質濃度と反応初速度の単位/),
      ).toBeVisible(),
    );

    fireEvent.change(screen.getByLabelText("横方向の単位"), { target: { value: "µM" } });
    fireEvent.change(screen.getByLabelText("測った値の単位"), {
      target: { value: "µmol/min" },
    });
    fireEvent.click(screen.getByRole("button", { name: "選択したmodelでfitを実行" }));

    await waitFor(() =>
      expect(screen.getByRole("img", { name: "非線形フィットGraph" })).toHaveAttribute(
        "data-fit-model",
        "michaelis_menten",
      ),
    );
    expect(nonlinearRunner).toHaveBeenCalledWith(
      expect.objectContaining({
        protocolVersion: "0.14.0",
        templateVersion: "0.2.0",
        modelId: "michaelis_menten",
        xLabel: "Substrate concentration",
        yLabel: "Initial velocity",
        xUnit: "µM",
        yUnit: "µmol/min",
      }),
    );
    expect(screen.getAllByRole("rowheader", { name: "Vmax" })).toHaveLength(2);
    expect(screen.getAllByRole("rowheader", { name: "Km" })).toHaveLength(2);

    fireEvent.click(screen.getByRole("button", { name: "fit結果をプロジェクトへ保存" }));
    await waitFor(() =>
      expect(screen.getByText(/保存済みの適合曲線をプロジェクトへ保存しました/)).toBeVisible(),
    );
    await waitFor(() => expect(saveProject).toHaveBeenCalledOnce());
    const saved = ProjectStateSchema.parse(savedState);
    expect(saved.metadata.projectName).toBe("Michaelis–Menten enzyme kinetics");
    expect(saved.analysisRuns[0]?.request).toMatchObject({
      protocolVersion: "0.14.0",
      templateVersion: "0.2.0",
      modelId: "michaelis_menten",
    });
    expect(saved.adaptiveInput?.contract).toMatchObject({
      matching: { kind: "none" },
      orderedAxes: [{ sampling: "cross_sectional", identityRetained: false }],
    });
    expect(saved.adaptiveInput?.rawLineage).toMatchObject({
      sourceKind: "clipboard",
      sourceLabel: "spreadsheet edit",
      rawText: exactRawText,
    });
    expect(saved.adaptiveInput?.mapping).toMatchObject({
      delimiter: "tab",
      columns: {
        "Unit ID": { role: "identity" },
        Series: { role: "factor" },
        X: { role: "axis" },
        Y: { role: "value" },
      },
    });
    expect(saved.graphs[0]?.spec).toMatchObject({
      type: "nonlinear_xy",
      axes: {
        xLabel: "Substrate concentration",
        yLabel: "Initial velocity",
        xScale: "linear",
        yScale: "linear",
      },
      appearance: { showRawPoints: true },
    });
    expect(saved.adaptiveInput?.targetedConfirmations).toContainEqual(
      expect.objectContaining({
        key: "michaelis_readout_meaning",
        answer: "calculated_initial_velocity",
      }),
    );
    expect(saved.adaptiveInput?.rawLineage?.transformations).toContain(
      "recorded Y as calculated initial velocity for Michaelis–Menten readiness",
    );
    expect(
      saved.designRevisions[0]?.design.wizardDecisions.find(
        ({ questionId }) => questionId === "ordered-curve.biological-independence",
      )?.answer,
    ).toBe("explicit_no_shared_parent_or_matching");

    view.unmount();
    const reopened = render(
      <OpenProjectPage
        onNavigate={vi.fn()}
        openProject={vi.fn(async () => null)}
        persistedProject={{ state: saved, target: "C:/tmp/michaelis-menten.lsa" }}
      />,
    );
    expect(screen.getByRole("heading", { name: "Michaelis–Menten enzyme kinetics" })).toBeVisible();
    expect(screen.getByRole("img", { name: "非線形フィットGraph" })).toHaveAttribute(
      "data-fit-model",
      "michaelis_menten",
    );
    expect(screen.getByText(/Vmax=12/)).toBeVisible();
    expect(screen.getByText(/Km=18/)).toBeVisible();
    expect(screen.getByText(/Vmax（vmax）=12/)).toBeInTheDocument();
    expect(screen.getByText(/仮説検定のp値を生成していない/)).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "入力を編集して再解析" })).toBeVisible();

    reopened.unmount();
    render(
      <CommonCoveragePage
        mode="nonlinear-fit"
        onBack={vi.fn()}
        initialProject={{ state: saved, target: "C:/tmp/michaelis-menten.lsa" }}
      />,
    );
    expect(screen.getByLabelText("非線形XYフィッティング data")).toHaveValue(
      saved.adaptiveInput?.rawLineage?.rawText,
    );
    expect(screen.getByLabelText("曲線データ表 行2 列1")).toHaveValue("rxn-0");
    expect(screen.getByLabelText("曲線データ表 行6 列4")).toHaveValue("8.8");
    expect(screen.getByRole("img", { name: "非線形フィットGraph" })).toHaveAttribute(
      "data-fit-model",
      "michaelis_menten",
    );
    expect(screen.queryByRole("radio", { name: /Michaelis–Menten enzyme kinetics/ })).toBeNull();
    fireEvent.click(screen.getByRole("button", { name: "統計解析を設定" }));
    expect(screen.getByRole("radio", { name: /Michaelis–Menten enzyme kinetics/ })).toBeChecked();
    expect(screen.getByRole("textbox", { name: "横軸に表示する量の名前" })).toHaveValue(
      "Substrate concentration",
    );
    expect(screen.getByLabelText("Michaelis–MentenのY値")).toHaveValue(
      "calculated_initial_velocity",
    );
    expect(screen.getByLabelText("横方向の単位")).toHaveValue("µM");
    expect(screen.getByLabelText("測った値の単位")).toHaveValue("µmol/min");
  });

  it("retains a direct/raw response distinction and safe-stops it after reopen", async () => {
    let savedState: ProjectState | null = null;
    const saveProject = vi.fn<SaveProjectAction>(async (state) => {
      savedState = state;
      return { state, target: "C:/tmp/michaelis-raw-response.lsa" };
    });
    const rawText =
      "Unit ID\tSeries\tX\tY\nrxn-0\tEnzyme A\t0\t0\nrxn-5\tEnzyme A\t5\t2.4\nrxn-10\tEnzyme A\t10\t4.1";
    const view = render(
      <CommonCoveragePage
        mode="nonlinear-fit"
        onBack={vi.fn()}
        saveProject={saveProject}
        entryIntent={{
          ...adaptiveOrderedCurveIntent,
          entryRouteId: "michaelis-raw-response-adaptive",
          experimentName: "Raw enzyme response",
        }}
      />,
    );
    fireEvent.change(screen.getByLabelText("非線形XYフィッティング data"), {
      target: { value: rawText },
    });
    answerOrderedCurveFacts("substrate_concentration", "separate_material_per_axis_value");
    fireEvent.click(screen.getByRole("button", { name: "統計解析を設定" }));
    fireEvent.click(screen.getByRole("radio", { name: /Michaelis–Menten enzyme kinetics/ }));
    fireEvent.change(screen.getByLabelText("Michaelis–MentenのY値"), {
      target: { value: "raw_time_series_or_other" },
    });

    expect(screen.getByText(/Yは各濃度の反応初速度ではありません/)).toBeVisible();
    expect(screen.getByRole("img", { name: "観測X/Y Graph" })).toBeVisible();
    expect(screen.getByRole("button", { name: "選択したmodelでfitを実行" })).toBeDisabled();
    fireEvent.click(screen.getByRole("button", { name: "入力と観測Graphをプロジェクトへ保存" }));
    await waitFor(() => expect(saveProject).toHaveBeenCalledOnce());

    const saved = ProjectStateSchema.parse(savedState);
    expect(saved.analysisRuns).toEqual([]);
    expect(saved.adaptiveInput?.targetedConfirmations).toContainEqual(
      expect.objectContaining({
        key: "michaelis_readout_meaning",
        answer: "raw_time_series_or_other",
      }),
    );
    expect(saved.adaptiveInput?.rawLineage?.transformations).toContain(
      "recorded Y as raw time-series or another non-initial-velocity value; Michaelis–Menten fit remains stopped",
    );

    view.unmount();
    render(
      <OpenProjectPage
        onNavigate={vi.fn()}
        openProject={vi.fn(async () => null)}
        persistedProject={{ state: saved, target: "C:/tmp/michaelis-raw-response.lsa" }}
      />,
    );
    expect(screen.getByText(/Yは各濃度の反応初速度ではありません/)).toBeVisible();
    expect(screen.getByRole("button", { name: "統計解析を設定" })).toBeDisabled();
    expect(screen.queryByRole("button", { name: "選択したmodelでfitを実行" })).toBeNull();
  });

  it("runs, saves, and reopens an authoritative multi-series D17 fit", async () => {
    let savedState: Parameters<SaveProjectAction>[0] | null = null;
    const saveProject = vi.fn<SaveProjectAction>(async (state) => {
      savedState = state;
      return { state, target: "C:/tmp/nonlinear.lsa" };
    });
    const view = render(
      <CommonCoveragePage
        mode="nonlinear-fit"
        onBack={vi.fn()}
        analysisRunner={nonlinearRunner}
        saveProject={saveProject}
        entryIntent={adaptiveOrderedCurveIntent}
      />,
    );

    const exactRawText =
      "Unit ID\tSeries\tX\tY\ncontrol-0\tControl\t0\t0\ncontrol-15\tControl\t15\t0.55\ncontrol-30\tControl\t30\t0.9\ncontrol-60\tControl\t60\t1.25\ncontrol-120\tControl\t120\t1.5\ndrug-0\tDrug\t0\t0\ndrug-15\tDrug\t15\t0.35\ndrug-30\tDrug\t30\t0.62\ndrug-60\tDrug\t60\t0.9\ndrug-120\tDrug\t120\t1.1";
    expect(screen.getByText(/まず観測点をGraphに表示/)).toBeVisible();
    fireEvent.change(screen.getByLabelText("非線形XYフィッティング data"), {
      target: { value: exactRawText },
    });
    expect(screen.getByRole("img", { name: "観測X/Y Graph" })).toHaveAttribute(
      "data-graph-mode",
      "observed_only",
    );
    expect(screen.getByRole("button", { name: "SVGを書き出す" })).toBeEnabled();
    expect(screen.getByRole("button", { name: "PNGを書き出す" })).toBeEnabled();
    answerOrderedCurveFacts("elapsed_time", "separate_material_per_axis_value");
    fireEvent.click(screen.getByRole("button", { name: "統計解析を設定" }));
    fireEvent.click(screen.getByRole("radio", { name: /Zero-baseline association/ }));
    fireEvent.click(screen.getByRole("button", { name: "選択したmodelでfitを実行" }));
    await waitFor(() =>
      expect(screen.getByRole("img", { name: "非線形フィットGraph" })).toBeVisible(),
    );
    expect(screen.getByText("Parameter estimates & fit diagnostics")).toBeVisible();
    expect(screen.getByRole("button", { name: "SVGを書き出す" })).toBeEnabled();
    expect(screen.getByRole("button", { name: "PNGを書き出す" })).toBeEnabled();
    expect(screen.getAllByText(/R²/).length).toBeGreaterThan(0);
    expect(nonlinearRunner).toHaveBeenCalledWith(
      expect.objectContaining({
        protocolVersion: "0.14.0",
        modelId: "zero_baseline_association",
        seriesIds: ["condition.1", "condition.2"],
      }),
    );

    fireEvent.click(screen.getByRole("button", { name: "fit結果をプロジェクトへ保存" }));
    await waitFor(() =>
      expect(screen.getByText(/保存済みの適合曲線をプロジェクトへ保存/)).toBeVisible(),
    );
    await waitFor(() => expect(saveProject).toHaveBeenCalledOnce());
    const saved = savedState as ProjectState | null;
    expect(ProjectStateSchema.safeParse(saved).success).toBe(true);
    expect(saved?.analysisRuns[0]?.request.protocolVersion).toBe("0.14.0");
    expect(saved?.analysisRuns[0]?.result.nonlinearFit?.series).toHaveLength(2);
    expect(saved?.graphs[0]?.spec.type).toBe("nonlinear_xy");
    const savedRun = saved!.analysisRuns[0]!;
    expect(() =>
      ProjectStateSchema.parse({
        ...saved,
        analysisRuns: [
          {
            ...savedRun,
            request: {
              ...savedRun.request,
              points:
                savedRun.request.protocolVersion === "0.14.0"
                  ? savedRun.request.points.map((point, index) =>
                      index === 0 ? { ...point, y: point.y + 1 } : point,
                    )
                  : [],
            },
          },
        ],
      }),
    ).toThrow(/nonlinear XY input must reproduce/);
    expect(saved?.observations).toHaveLength(10);
    expect(saved?.adaptiveInput?.rawLineage?.rawText).toBe(exactRawText);
    expect(saved?.adaptiveInput?.canonicalObservations).toHaveLength(10);
    expect(saved?.adaptiveInput?.contract.matching.kind).toBe("none");
    expect(saved?.adaptiveInput?.contract.orderedAxes[0]?.sampling).toBe("cross_sectional");
    expect(saved?.adaptiveInput?.surface.surfaceId).toBe("factor_observation_table");
    expect(saved?.provenanceEvents.at(-1)?.detail).toMatch(/model rationale.*fitted curves/);

    view.unmount();
    const reviseProject = vi.fn<SaveProjectAction>(async (state, target) => ({
      state,
      target: target ?? "C:/tmp/unexpected.lsa",
    }));
    render(
      <OpenProjectPage
        onNavigate={vi.fn()}
        openProject={vi.fn(async () => null)}
        saveProject={reviseProject}
        persistedProject={{ state: saved!, target: "C:/tmp/nonlinear.lsa" }}
      />,
    );
    expect(screen.getByText("Saved authoritative D17 result")).toBeVisible();
    expect(screen.getByRole("img", { name: "非線形フィットGraph" })).toHaveAttribute(
      "data-fit-model",
      "zero_baseline_association",
    );
    expect(screen.getByText("Methods / provenance")).toBeVisible();
    fireEvent.click(screen.getByRole("button", { name: "入力を編集して再解析" }));
    expect(screen.getByLabelText("非線形XYフィッティング data")).toHaveValue(exactRawText);
    expect(screen.queryByLabelText("専門解析を切り替える")).toBeNull();
    expect(screen.getByRole("img", { name: "非線形フィットGraph" })).toBeVisible();
    const editedRawText = exactRawText.replace("\t15\t0.55", "\t15\t0.56");
    fireEvent.change(screen.getByLabelText("非線形XYフィッティング data"), {
      target: { value: editedRawText },
    });
    expect(screen.getByRole("img", { name: "観測X/Y Graph" })).toBeVisible();
    fireEvent.click(screen.getByRole("button", { name: "入力と観測Graphをプロジェクトへ保存" }));
    await waitFor(() => expect(reviseProject).toHaveBeenCalledOnce());
    expect(reviseProject.mock.calls[0]?.[1]).toBe("C:/tmp/nonlinear.lsa");
    const revised = ProjectStateSchema.parse(reviseProject.mock.calls[0]?.[0]);
    expect(revised.rawRevisions).toHaveLength(2);
    expect(revised.designRevisions).toHaveLength(1);
    expect(revised.analysisRuns).toHaveLength(1);
    expect(revised.analysisRuns[0]).toMatchObject({ state: "stale" });
    expect(revised.graphs).toHaveLength(1);
    expect(revised.graphs[0]).toMatchObject({ state: "stale" });
    expect(revised.observations).toHaveLength(20);
    expect(revised.adaptiveInput?.rawLineage?.rawText).toBe(editedRawText);
    expect(revised.adaptiveInput?.rawLineage?.transformations).toContain(
      "edited ordered-curve raw text while retaining the declared experiment structure",
    );
    expect(
      revised.observations.some(({ id }) => id.startsWith("raw.nonlinear.2.observation.")),
    ).toBe(true);

    fireEvent.click(screen.getByRole("button", { name: "入力と観測Graphをプロジェクトへ保存" }));
    await waitFor(() => expect(reviseProject).toHaveBeenCalledTimes(2));
    expect(reviseProject.mock.calls[1]?.[1]).toBe("C:/tmp/nonlinear.lsa");
    const consecutiveSave = ProjectStateSchema.parse(reviseProject.mock.calls[1]?.[0]);
    expect(consecutiveSave.rawRevisions).toHaveLength(2);
    expect(consecutiveSave.designRevisions).toHaveLength(1);
    expect(consecutiveSave.analysisRuns).toHaveLength(1);
    expect(consecutiveSave.analysisRuns[0]).toMatchObject({ state: "stale" });
    expect(consecutiveSave.graphs[0]).toMatchObject({ state: "stale" });
    expect(consecutiveSave.adaptiveInput?.rawLineage?.rawText).toBe(editedRawText);
  });

  it("preserves the no-intent direct nonlinear route without adaptive questions or staging", async () => {
    const saveProject = vi.fn<SaveProjectAction>(async (state) => ({
      state,
      target: "C:/tmp/direct-nonlinear.lsa",
    }));
    render(
      <CommonCoveragePage
        mode="nonlinear-fit"
        onBack={vi.fn()}
        analysisRunner={nonlinearRunner}
        saveProject={saveProject}
      />,
    );

    expect(screen.queryByLabelText("曲線データの測定方法")).toBeNull();
    expect(screen.queryByRole("button", { name: "統計解析を設定" })).toBeNull();
    expect(screen.getByRole("radio", { name: /Zero-baseline association/ })).toBeChecked();
    expect(screen.getByLabelText("非線形XYフィッティング data")).toHaveValue(
      "Unit ID\tSeries\tX\tY",
    );
    fireEvent.click(screen.getByRole("button", { name: "入力形式の例を読み込む（合成値）" }));
    expect(screen.getByRole("button", { name: "選択したmodelでfitを実行" })).toBeEnabled();
    fireEvent.click(screen.getByRole("button", { name: "選択したmodelでfitを実行" }));
    await waitFor(() =>
      expect(screen.getByRole("img", { name: "非線形フィットGraph" })).toBeVisible(),
    );
    fireEvent.click(screen.getByRole("button", { name: "fit結果をプロジェクトへ保存" }));
    await waitFor(() => expect(saveProject).toHaveBeenCalledOnce());
    expect(ProjectStateSchema.parse(saveProject.mock.calls[0]?.[0]).adaptiveInput).toBeNull();
  });

  it("requires meaningful Graph labels before compiling or saving an adaptive contract", () => {
    const saveProject = vi.fn<SaveProjectAction>();
    render(
      <CommonCoveragePage
        mode="nonlinear-fit"
        onBack={vi.fn()}
        saveProject={saveProject}
        entryIntent={adaptiveOrderedCurveIntent}
      />,
    );
    fireEvent.change(screen.getByLabelText("非線形XYフィッティング data"), {
      target: {
        value: "Unit ID\tSeries\tX\tY\np0\tA\t0\t1\np1\tA\t1\t2\np2\tA\t2\t3",
      },
    });
    fireEvent.change(screen.getByRole("combobox", { name: orderedAxisQuestion }), {
      target: { value: "distance" },
    });
    fireEvent.change(screen.getByRole("combobox", { name: materialRelationshipQuestion }), {
      target: { value: "separate_material_per_axis_value" },
    });
    fireEvent.change(screen.getByRole("combobox", { name: pointParentRelationshipQuestion }), {
      target: { value: "no_shared_parent_or_matching" },
    });

    expect(screen.getByRole("img", { name: "観測X/Y Graph" })).toBeVisible();
    expect(screen.getByText(/X \/ Yのままでは意味を推測しません/)).toBeVisible();
    expect(
      screen.getByRole("button", { name: "入力と観測Graphをプロジェクトへ保存" }),
    ).toBeDisabled();
    expect(screen.getByRole("button", { name: "統計解析を設定" })).toBeDisabled();

    fireEvent.change(screen.getByRole("textbox", { name: "横軸に表示する量の名前" }), {
      target: { value: "Position from wound edge" },
    });
    fireEvent.change(screen.getByRole("textbox", { name: "測った値の名前" }), {
      target: { value: "Cell density" },
    });
    expect(
      screen.getByRole("button", { name: "入力と観測Graphをプロジェクトへ保存" }),
    ).toBeEnabled();
    expect(screen.getByRole("button", { name: "統計解析を設定" })).toBeEnabled();
  });

  it("disables ordered-curve saving with a visible reason when the save bridge is absent", () => {
    render(
      <CommonCoveragePage
        mode="nonlinear-fit"
        onBack={vi.fn()}
        entryIntent={adaptiveOrderedCurveIntent}
      />,
    );
    fireEvent.change(screen.getByLabelText("非線形XYフィッティング data"), {
      target: {
        value: "Unit ID\tSeries\tX\tY\np0\tA\t0\t1\np1\tA\t1\t2\np2\tA\t2\t3",
      },
    });
    answerOrderedCurveFacts("distance", "separate_material_per_axis_value");
    fireEvent.change(screen.getByRole("textbox", { name: "横軸に表示する量の名前" }), {
      target: { value: "Position from wound edge" },
    });
    fireEvent.change(screen.getByRole("textbox", { name: "測った値の名前" }), {
      target: { value: "Cell density" },
    });

    expect(screen.getByRole("img", { name: "観測X/Y Graph" })).toBeVisible();
    const saveButton = screen.getByRole("button", {
      name: "入力と観測Graphをプロジェクトへ保存",
    });
    const unavailableNote = screen.getByText(
      "このブラウザレビューではプロジェクトを保存できません。デスクトップ版で利用できます。",
    );
    expect(saveButton).toBeDisabled();
    expect(unavailableNote).toBeVisible();
    expect(saveButton).toHaveAttribute("aria-describedby", unavailableNote.id);
    fireEvent.click(saveButton);
    expect(screen.queryByText("デスクトップ版で保存できます。")).toBeNull();
  });

  it("keeps sparse and explicitly missing rows in lineage/canonical data while plotting observed points", async () => {
    let savedState: ProjectState | null = null;
    const saveProject = vi.fn<SaveProjectAction>(async (state) => {
      savedState = state;
      return { state, target: "C:/tmp/sparse-ordered.lsa" };
    });
    const rawText = "Unit ID\tSeries\tX\tY\nposition-negative\tA\t-5\t1.2\nposition-zero\tA\t0\tNA";
    const view = render(
      <CommonCoveragePage
        mode="nonlinear-fit"
        onBack={vi.fn()}
        saveProject={saveProject}
        entryIntent={adaptiveOrderedCurveIntent}
      />,
    );
    fireEvent.change(screen.getByLabelText("非線形XYフィッティング data"), {
      target: { value: rawText },
    });
    answerOrderedCurveFacts("distance", "separate_material_per_axis_value");

    expect(screen.getByRole("img", { name: "観測X/Y Graph" })).toBeVisible();
    fireEvent.click(screen.getByRole("button", { name: "入力と観測Graphをプロジェクトへ保存" }));
    await waitFor(() => expect(saveProject).toHaveBeenCalledOnce());
    const saved = ProjectStateSchema.parse(savedState);
    expect(saved.adaptiveInput?.rawLineage?.rawText).toBe(rawText);
    expect(saved.adaptiveInput?.canonicalObservations).toHaveLength(2);
    expect(Object.values(saved.adaptiveInput?.canonicalObservations[1]?.values ?? {})).toEqual([
      null,
    ]);
    expect(Object.values(saved.adaptiveInput?.canonicalObservations[1]?.missingness ?? {})).toEqual(
      ["unknown"],
    );
    expect(saved.observations).toHaveLength(1);

    view.unmount();
    render(
      <CommonCoveragePage
        mode="nonlinear-fit"
        onBack={vi.fn()}
        saveProject={saveProject}
        initialProject={{ state: saved, target: "C:/tmp/sparse-ordered.lsa" }}
      />,
    );
    expect(screen.getByLabelText("非線形XYフィッティング data")).toHaveValue(rawText);
    expect(screen.getByRole("textbox", { name: "横軸に表示する量の名前" })).toHaveValue("Distance");
    expect(screen.getByRole("img", { name: "観測X/Y Graph" })).toBeVisible();
    expect(screen.queryByLabelText("専門解析を切り替える")).toBeNull();
    expect(screen.queryByRole("radio", { name: /Zero-baseline association/ })).toBeNull();
    expect(screen.getByRole("button", { name: "統計解析を設定" })).toBeEnabled();
  });

  it.each([
    {
      label: "quoted comma CSV",
      delimiter: "comma" as const,
      series: "Control, vehicle",
      rawText:
        '"Unit ID","Series","X","Y"\n"p0","Control, vehicle",-1,1\n"p1","Control, vehicle",0,2',
    },
    {
      label: "quoted semicolon text",
      delimiter: "semicolon" as const,
      series: "Control; vehicle",
      rawText:
        '"Unit ID";"Series";"X";"Y"\n"p0";"Control; vehicle";-1;1\n"p1";"Control; vehicle";0;2',
    },
  ])("imports $label with the same delimiter semantics used by lineage", async (example) => {
    let savedState: ProjectState | null = null;
    const saveProject = vi.fn<SaveProjectAction>(async (state) => {
      savedState = state;
      return { state, target: "C:/tmp/quoted-ordered.lsa" };
    });
    render(
      <CommonCoveragePage
        mode="nonlinear-fit"
        onBack={vi.fn()}
        saveProject={saveProject}
        entryIntent={adaptiveOrderedCurveIntent}
      />,
    );
    fireEvent.change(screen.getByLabelText("非線形XYフィッティング data"), {
      target: { value: example.rawText },
    });
    answerOrderedCurveFacts("distance", "separate_material_per_axis_value");
    fireEvent.click(screen.getByRole("button", { name: "入力と観測Graphをプロジェクトへ保存" }));
    await waitFor(() => expect(saveProject).toHaveBeenCalledOnce());
    const saved = ProjectStateSchema.parse(savedState);
    expect(saved.adaptiveInput?.mapping?.delimiter).toBe(example.delimiter);
    expect(saved.adaptiveInput?.contract.factors[0]?.levels).toEqual([example.series]);
    expect(saved.adaptiveInput?.rawLineage?.rawText).toBe(example.rawText);
  });

  it.each([
    {
      label: "substrate concentration with an association model",
      axis: "substrate_concentration" as const,
      model: /Zero-baseline association/,
      readout: null,
      expected: /基質濃度を横軸にしたデータと選択modelの意味が一致しません/,
    },
    {
      label: "elapsed time with Michaelis-Menten",
      axis: "elapsed_time" as const,
      model: /Michaelis–Menten enzyme kinetics/,
      readout: null,
      expected: /現在の横軸とは一致しないため/,
    },
    {
      label: "raw time-series Y with Michaelis-Menten",
      axis: "substrate_concentration" as const,
      model: /Michaelis–Menten enzyme kinetics/,
      readout: "raw_time_series_or_other",
      expected: /Yは各濃度の反応初速度ではありません/,
    },
  ])("safe-stops $label without replacing the selected model", (example) => {
    render(
      <CommonCoveragePage
        mode="nonlinear-fit"
        onBack={vi.fn()}
        analysisRunner={nonlinearRunner}
        entryIntent={adaptiveOrderedCurveIntent}
      />,
    );
    fireEvent.change(screen.getByLabelText("非線形XYフィッティング data"), {
      target: {
        value: "Unit ID\tSeries\tX\tY\np0\tA\t0\t1\np1\tA\t1\t2\np2\tA\t2\t3",
      },
    });
    answerOrderedCurveFacts(example.axis, "separate_material_per_axis_value");
    fireEvent.click(screen.getByRole("button", { name: "統計解析を設定" }));
    fireEvent.click(screen.getByRole("radio", { name: example.model }));
    if (example.readout) {
      fireEvent.change(screen.getByLabelText("Michaelis–MentenのY値"), {
        target: { value: example.readout },
      });
    }
    expect(screen.getByText(example.expected)).toBeVisible();
    expect(screen.getByRole("radio", { name: example.model })).toBeChecked();
    expect(screen.getByRole("button", { name: "選択したmodelでfitを実行" })).toBeDisabled();
    expect(nonlinearRunner).not.toHaveBeenCalled();
  });

  it("applies the nonnegative X rule only after Michaelis-Menten is explicitly selected", async () => {
    render(
      <CommonCoveragePage
        mode="nonlinear-fit"
        onBack={vi.fn()}
        analysisRunner={nonlinearRunner}
        entryIntent={adaptiveOrderedCurveIntent}
      />,
    );
    fireEvent.change(screen.getByLabelText("非線形XYフィッティング data"), {
      target: {
        value: "Unit ID\tSeries\tX\tY\np-negative\tA\t-1\t1\np-zero\tA\t0\t2\np-positive\tA\t1\t3",
      },
    });
    answerOrderedCurveFacts("substrate_concentration", "separate_material_per_axis_value");
    expect(screen.getByRole("img", { name: "観測X/Y Graph" })).toBeVisible();
    fireEvent.change(screen.getByLabelText("横方向の単位"), { target: { value: "µM" } });
    fireEvent.change(screen.getByLabelText("測った値の単位"), {
      target: { value: "µmol/min" },
    });
    fireEvent.click(screen.getByRole("button", { name: "統計解析を設定" }));
    fireEvent.click(screen.getByRole("radio", { name: /Michaelis–Menten enzyme kinetics/ }));
    fireEvent.change(screen.getByLabelText("Michaelis–MentenのY値"), {
      target: { value: "calculated_initial_velocity" },
    });
    fireEvent.click(screen.getByRole("button", { name: "選択したmodelでfitを実行" }));
    expect(await screen.findByText(/基質濃度Xは0以上/)).toBeVisible();
    expect(nonlinearRunner).not.toHaveBeenCalled();
  });

  it("does not reinterpret multiple Series declared as replicate runs as conditions", () => {
    render(
      <CommonCoveragePage
        mode="nonlinear-fit"
        onBack={vi.fn()}
        analysisRunner={nonlinearRunner}
        entryIntent={adaptiveOrderedCurveIntent}
      />,
    );
    fireEvent.change(screen.getByLabelText("非線形XYフィッティング data"), {
      target: {
        value:
          "Unit ID\tSeries\tX\tY\na0\tRun A\t0\t1\na1\tRun A\t1\t2\na2\tRun A\t2\t3\nb0\tRun B\t0\t1\nb1\tRun B\t1\t2\nb2\tRun B\t2\t3",
      },
    });
    answerOrderedCurveFacts("elapsed_time", "separate_material_per_axis_value");
    fireEvent.change(screen.getByRole("combobox", { name: seriesMeaningQuestion }), {
      target: { value: "replicate_runs_or_units" },
    });

    expect(screen.getByRole("img", { name: "観測X/Y Graph" })).toBeVisible();
    expect(screen.getByText(/別条件へ読み替えず/)).toBeVisible();
    expect(screen.getByRole("button", { name: "統計解析を設定" })).toBeDisabled();
    expect(
      screen.getByRole("button", { name: "入力と観測Graphをプロジェクトへ保存" }),
    ).toBeDisabled();
    expect(nonlinearRunner).not.toHaveBeenCalled();
  });

  it("rejects fractional contingency input before inference", () => {
    render(<CommonCoveragePage mode="contingency" onBack={vi.fn()} />);
    fireEvent.change(screen.getByLabelText("Categorical / contingency data"), {
      target: { value: "Category\tYes\tNo\nA\t12.5\t87.5\nB\t20\t80" },
    });
    expect(screen.getByRole("alert")).toHaveTextContent(/integer counts/);
  });
});

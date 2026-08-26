import { useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";
import {
  AnalysisEngineRequestSchema,
  type AnalysisEngineResult,
  type AnalysisRecommendation,
} from "@lsaa/analysis-contracts";
import {
  parseContingencyPaste,
  parseDistributionPaste,
  parseMatchedLongPaste,
  parseXyPaste,
} from "@lsaa/data-sheet";
import {
  createDistributionGraphSpec,
  createEcdfModel,
  createHistogramModel,
  createNonlinearFitGraphModel,
  createNonlinearFitGraphSpec,
  createRegressionGraphModel,
  createRegressionGraphSpec,
  validateGraphScale,
} from "@lsaa/graph-spec";
import { createInitialProjectState } from "@lsaa/project";
import type { ExperimentDesign, Observation, UnitInstance } from "@lsaa/domain";
import { defaultAnalysisRunner, type AnalysisRunner } from "../app/analysisClient";
import type { SaveProjectAction } from "../app/projectActions";
import type { AppRoute } from "../app/routes";
import {
  COMPLETE_BENCHMARK_ARTIFACT_NAMES,
  beginDefaultGraphCapture,
  blobToBase64,
  completeDefaultGraphCapture,
  currentBenchmarkRun,
  recordBenchmarkEvent,
  recordFinalGraphCapture,
  setBenchmarkOutcome,
  sha256Hex,
  useBenchmarkRun,
  writeBenchmarkArtifacts,
} from "../app/benchmarkEvaluation";
import { evaluationMode } from "../app/evaluationMode";
import { downloadTextFile, serializeGraphSvg, svgToPngBlob } from "../app/graphExport";
import { generateCommonCoverageMethods } from "../app/commonCoverageMethods";
import { generateMethodsText } from "../app/methodsText";
import type { LiteratureExperimenterCase } from "../app/literatureBenchmark";
import { PRODUCT_IDENTITY } from "../app/productIdentity";
import {
  CountGraph,
  DistributionGraph,
  RegressionGraph,
} from "../components/graph/CommonMethodGraphs";
import { NonlinearFitGraph } from "../components/graph/NonlinearFitGraph";
import { AnalysisRouteSwitcher } from "../components/AnalysisRouteSwitcher";

type Mode =
  "contingency" | "repeated-nonparametric" | "regression" | "nonlinear-fit" | "distribution";
type Props = Readonly<{
  mode: Mode;
  onBack: () => void;
  analysisRunner?: AnalysisRunner;
  analysisAvailable?: boolean;
  saveProject?: SaveProjectAction;
  onNavigate?: (route: AppRoute) => void;
}>;
const defaults: Record<Mode, string> = {
  contingency: "Category\tEvent\tNo event\nControl\t1\t9\nTreatment\t6\t4",
  "repeated-nonparametric":
    "Unit ID\tCondition\tValue\nu1\tBaseline\t8\nu1\tDay 1\t7\nu1\tDay 2\t6\nu2\tBaseline\t9\nu2\tDay 1\t7\nu2\tDay 2\t5\nu3\tBaseline\t6\nu3\tDay 1\t5\nu3\tDay 2\t4",
  regression: "Unit ID\tX\tY\nu1\t1\t2.1\nu2\t2\t4.2\nu3\t3\t5.8\nu4\t4\t8.3\nu5\t5\t9.9",
  "nonlinear-fit":
    "Unit ID\tSeries\tX\tY\nK5.r1\tK5\t0\t0\nK5.r1\tK5\t15\t0.55\nK5.r1\tK5\t30\t0.95\nK5.r1\tK5\t60\t1.30\nK5.r1\tK5\t120\t1.52\nK14.r1\tK14\t0\t0\nK14.r1\tK14\t15\t0.35\nK14.r1\tK14\t30\t0.66\nK14.r1\tK14\t60\t1.02\nK14.r1\tK14\t120\t1.28",
  distribution: "1 2 2 3 5 8 13 21 34",
};
const titles: Record<Mode, string> = {
  contingency: "Categorical / contingency",
  "repeated-nonparametric": "Repeated nonparametric",
  regression: "Simple linear regression",
  "nonlinear-fit": "非線形XYフィッティング",
  distribution: "Histogram / ECDF",
};
const options = {
  alternative: "two_sided" as const,
  confidenceLevel: 0.95,
  multiplicityMethod: null,
};

type NonlinearModelId = "one_phase_association" | "zero_baseline_association";
type NonlinearParameter = "baseline" | "plateau" | "rate";
type FitSetting = Readonly<{ initial: string; lower: string; upper: string }>;
const nonlinearModelRationales: Record<NonlinearModelId, string> = {
  zero_baseline_association:
    "反応時間に対する単調な飽和過程で、開始時点が0に固定されるため、最小のzero-baseline association modelを選択しました。",
  one_phase_association:
    "反応時間に対する単調な飽和過程で、開始値をデータから推定する必要があるため、one-phase association modelを選択しました。",
};
type ParsedNonlinear = Readonly<{
  points: ReadonlyArray<{
    observationId: string;
    experimentalUnitId: string;
    unitLabel: string;
    seriesId: string;
    seriesLabel: string;
    x: number;
    y: number;
  }>;
  series: ReadonlyArray<{ id: string; label: string }>;
  units: ReadonlyArray<{ id: string; label: string; seriesId: string }>;
}>;

function parseNonlinearXyPaste(text: string): ParsedNonlinear {
  const lines = text
    .trim()
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter(Boolean);
  if (lines.length < 4) throw new Error("headerを含め4行以上のX/Yデータが必要です");
  const header = lines[0]!.split(/\t|,/).map((value) => value.trim().toLowerCase());
  const unitIndex = header.findIndex((value) => ["unit id", "unit", "sample id"].includes(value));
  const seriesIndex = header.findIndex((value) => value === "series");
  const xIndex = header.findIndex((value) => value === "x");
  const yIndex = header.findIndex((value) => value === "y");
  if ([unitIndex, seriesIndex, xIndex, yIndex].some((index) => index < 0)) {
    throw new Error("列は Unit ID、Series、X、Y の4列にしてください");
  }
  const seriesByLabel = new Map<string, string>();
  const unitByLabel = new Map<string, { id: string; seriesId: string }>();
  const points = lines.slice(1).map((line, index) => {
    const cells = line.split(/\t|,/).map((value) => value.trim());
    const unitLabel = cells[unitIndex] ?? "";
    const seriesLabel = cells[seriesIndex] ?? "";
    const x = Number(cells[xIndex]);
    const y = Number(cells[yIndex]);
    if (!unitLabel || !seriesLabel || !Number.isFinite(x) || !Number.isFinite(y) || x < 0) {
      throw new Error(`${index + 2}行目のUnit ID、Series、非負X、有限Yを確認してください`);
    }
    let seriesId = seriesByLabel.get(seriesLabel);
    if (!seriesId) {
      seriesId = `series.${seriesByLabel.size + 1}`;
      seriesByLabel.set(seriesLabel, seriesId);
    }
    let unit = unitByLabel.get(unitLabel);
    if (!unit) {
      unit = { id: `unit.${unitByLabel.size + 1}`, seriesId };
      unitByLabel.set(unitLabel, unit);
    } else if (unit.seriesId !== seriesId) {
      throw new Error(
        `Unit ID「${unitLabel}」が複数seriesに使われています。seriesごとに安定IDを分けてください`,
      );
    }
    return {
      observationId: `observation.${index + 1}`,
      experimentalUnitId: unit.id,
      unitLabel,
      seriesId,
      seriesLabel,
      x,
      y,
    };
  });
  return {
    points,
    series: [...seriesByLabel].map(([label, id]) => ({ id, label })),
    units: [...unitByLabel].map(([label, unit]) => ({
      id: unit.id,
      label,
      seriesId: unit.seriesId,
    })),
  };
}

function finiteOptional(value: string, label: string) {
  if (!value.trim()) return undefined;
  const parsed = Number(value);
  if (!Number.isFinite(parsed)) throw new Error(`${label}は有限値にしてください`);
  return parsed;
}

function createNonlinearDesignData(
  parsed: ParsedNonlinear,
  input: Readonly<{
    xLabel: string;
    yLabel: string;
    yUnit: string;
    modelId: NonlinearModelId;
    rationale: string;
    createdAt: string;
  }>,
) {
  const factorId = "factor.series";
  const outcomeId = "outcome.nonlinear-y";
  const design: ExperimentDesign = {
    schemaVersion: "0.2.0",
    id: "design.nonlinear",
    name: "Nonlinear XY fitting",
    purpose: "custom",
    outcomes: [
      {
        id: outcomeId,
        key: "nonlinear-y",
        label: input.yLabel || "Y",
        type: "continuous",
        ...(input.yUnit ? { unit: input.yUnit } : {}),
      },
    ],
    factors: [
      {
        id: factorId,
        key: "series",
        label: "Series",
        levels: parsed.series.map((series, order) => ({
          id: `level.series.${order + 1}`,
          label: series.label,
          order,
        })),
      },
    ],
    conditions: parsed.series.map((series, order) => ({
      id: series.id,
      label: series.label,
      factorLevels: { [factorId]: `level.series.${order + 1}` },
    })),
    unitLevels: [
      {
        id: "level.reaction",
        key: "reaction",
        label: "Independent reaction / biological unit",
        role: "experimental_unit",
        parentLevelId: null,
      },
    ],
    experimentalUnitLevelId: "level.reaction",
    pairing: { kind: "independent" },
    plannedN: parsed.units.length,
    normalizationPlans: [],
    primaryContrast:
      parsed.series.length >= 2
        ? {
            id: "contrast.nonlinear-series-identity",
            label: `${parsed.series[0]!.label} / ${parsed.series[1]!.label} fit identity (no hypothesis test)`,
            conditionIds: [parsed.series[0]!.id, parsed.series[1]!.id],
          }
        : null,
    wizardRuleVersion: "nonlinear-xy-core-0.1.0",
    wizardDecisions: [
      { questionId: "nonlinear.model", answer: input.modelId },
      { questionId: "nonlinear.model-rationale", answer: input.rationale },
      { questionId: "nonlinear.x-label", answer: input.xLabel },
    ],
    createdAt: input.createdAt,
  };
  const units: UnitInstance[] = parsed.units.map((unit) => ({
    id: unit.id,
    levelId: "level.reaction",
    parentUnitId: null,
    label: unit.label,
    metadata: { seriesId: unit.seriesId },
  }));
  const observations: Observation[] = parsed.points.map((point) => ({
    id: point.observationId,
    rawRevisionId: "raw.nonlinear.1",
    unitInstanceId: point.experimentalUnitId,
    conditionId: point.seriesId,
    outcomeId,
    measurement: { kind: "scalar", value: point.y },
    time: point.x,
    sourceLocation: `pasted XY; ${input.xLabel}=${point.x}`,
  }));
  return { design, units, observations, outcomeId };
}

export function CommonCoveragePage({
  mode,
  onBack,
  analysisRunner = defaultAnalysisRunner,
  analysisAvailable = true,
  saveProject,
  onNavigate,
}: Props) {
  const [text, setText] = useState(defaults[mode]),
    [result, setResult] = useState<AnalysisEngineResult | null>(null),
    [executedRequest, setExecutedRequest] = useState<ReturnType<
      typeof AnalysisEngineRequestSchema.parse
    > | null>(null),
    [message, setMessage] = useState<string | null>(null);
  const [literatureCase, setLiteratureCase] = useState<LiteratureExperimenterCase | null>(null);
  const [contingencyMethod, setContingencyMethod] = useState<
      "fisher_exact" | "pearson_chi_square" | "mcnemar_exact"
    >("fisher_exact"),
    [display, setDisplay] = useState<"count" | "fraction" | "stacked">("count");
  const [includeIntercept, setIncludeIntercept] = useState(true),
    [xLabel, setXLabel] = useState("X"),
    [yLabel, setYLabel] = useState("Y"),
    [xUnit, setXUnit] = useState(""),
    [yUnit, setYUnit] = useState(""),
    [xScale, setXScale] = useState<"linear" | "log10">("linear"),
    [yScale, setYScale] = useState<"linear" | "log10">("linear"),
    [showBand, setShowBand] = useState(true);
  const [distributionType, setDistributionType] = useState<"histogram" | "ecdf">("histogram"),
    [binCount, setBinCount] = useState(""),
    svgRef = useRef<SVGSVGElement>(null);
  const [nonlinearModel, setNonlinearModel] = useState<NonlinearModelId>(
    "zero_baseline_association",
  );
  const [modelRationale, setModelRationale] = useState(
    nonlinearModelRationales.zero_baseline_association,
  );
  const [fitSettings, setFitSettings] = useState<Record<NonlinearParameter, FitSetting>>({
    baseline: { initial: "", lower: "", upper: "" },
    plateau: { initial: "", lower: "", upper: "" },
    rate: { initial: "", lower: "", upper: "" },
  });
  const benchmarkRun = useBenchmarkRun();
  useEffect(() => {
    const identity = benchmarkRun.identity;
    setLiteratureCase(null);
    if (!import.meta.env.DEV || !identity) return;
    let cancelled = false;
    void import("../app/literatureBenchmark").then(
      ({ fetchLiteratureExperimenterCase, isLiteratureCaseId }) => {
        if (!isLiteratureCaseId(identity.caseId)) return;
        void fetchLiteratureExperimenterCase(identity)
          .then((loaded) => {
            if (!cancelled) setLiteratureCase(loaded);
          })
          .catch(() => {
            if (!cancelled) setLiteratureCase(null);
          });
      },
    );
    return () => {
      cancelled = true;
    };
  }, [benchmarkRun.identity]);

  const loadLiteratureRegression = () => {
    if (!literatureCase || mode !== "regression") return;
    const rows = literatureCase.syntheticData;
    if (!rows.length || rows.some(({ x_value }) => x_value === null)) {
      setMessage("このcaseはstable unitごとのX/Y関係を完全には保持していません。");
      return;
    }
    setText(
      [
        "Unit ID\tX\tY",
        ...rows.map((row) => [row.unit_id, row.x_value, row.value].join("\t")),
      ].join("\n"),
    );
    setXLabel("Numeric covariate");
    setYLabel(literatureCase.researcherPacket.readouts.split("||")[0]?.trim() || "Outcome");
    setResult(null);
    setExecutedRequest(null);
    setMessage(`${rows.length}件のstable X/Y identityを単回帰表へ入力しました。`);
    recordBenchmarkEvent("literature_benchmark_data_loaded", {
      caseId: literatureCase.caseId,
      mappedCells: rows.length,
      route: "simple_linear_regression",
    });
  };
  const parsed = useMemo(() => {
    try {
      if (mode === "contingency") return { kind: mode, data: parseContingencyPaste(text) } as const;
      if (mode === "repeated-nonparametric")
        return { kind: mode, data: parseMatchedLongPaste(text) } as const;
      if (mode === "regression") return { kind: mode, data: parseXyPaste(text) } as const;
      if (mode === "nonlinear-fit")
        return { kind: mode, data: parseNonlinearXyPaste(text) } as const;
      return { kind: mode, data: parseDistributionPaste(text) } as const;
    } catch (error) {
      return { error: error instanceof Error ? error.message : "入力を確認してください" } as const;
    }
  }, [mode, text]);
  const run = async () => {
    try {
      setMessage("解析中…");
      if ("error" in parsed) throw new Error(parsed.error);
      let request;
      if (parsed.kind === "contingency") {
        const { rowLabels, columnLabels, counts } = parsed.data;
        request = {
          protocolVersion: "0.11.0",
          requestId: "request.contingency.1",
          projectId: "project.contingency",
          analysisId: "analysis.contingency.1",
          templateId: "D14",
          templateVersion: "0.1.0",
          method: contingencyMethod,
          structure: contingencyMethod === "mcnemar_exact" ? "paired_binary" : "independent",
          experimentalUnit: "independent biological unit",
          rowCategoryIds: rowLabels.map((_, i) => `row.${i + 1}`),
          columnCategoryIds: columnLabels.map((_, i) => `column.${i + 1}`),
          cells: counts.flatMap((row, i) =>
            row.map((count, j) => ({
              rowCategoryId: `row.${i + 1}`,
              columnCategoryId: `column.${j + 1}`,
              count,
            })),
          ),
          options,
        };
      } else if (parsed.kind === "repeated-nonparametric") {
        const conditions = [...new Set(parsed.data.map(({ condition }) => condition))];
        request = {
          protocolVersion: "0.12.0",
          requestId: "request.friedman.1",
          projectId: "project.friedman",
          analysisId: "analysis.friedman.1",
          templateId: "D15",
          templateVersion: "0.1.0",
          method: "friedman",
          conditionIds: conditions.map((_, i) => `condition.${i + 1}`),
          observations: parsed.data.map((row, i) => ({
            observationId: `observation.${i + 1}`,
            conditionId: `condition.${conditions.indexOf(row.condition) + 1}`,
            experimentalUnitId: row.unitId,
            pairId: row.unitId,
            value: row.value,
          })),
          options: { ...options, multiplicityMethod: "holm_wilcoxon_all_pairs" },
        };
      } else if (parsed.kind === "regression") {
        request = {
          protocolVersion: "0.13.0",
          requestId: "request.regression.1",
          projectId: "project.regression",
          analysisId: "analysis.regression.1",
          templateId: "D16",
          templateVersion: "0.1.0",
          method: "simple_linear_regression",
          xLabel,
          yLabel,
          xUnit: "",
          yUnit: "",
          includeIntercept,
          points: parsed.data.map((row, i) => ({
            observationId: `observation.${i + 1}`,
            experimentalUnitId: row.unitId,
            x: row.x,
            y: row.y,
          })),
          options,
        };
      } else if (parsed.kind === "nonlinear-fit") {
        if (!modelRationale.trim())
          throw new Error("model selectionの科学的理由を記録してください");
        const parameters: NonlinearParameter[] =
          nonlinearModel === "one_phase_association"
            ? ["baseline", "plateau", "rate"]
            : ["plateau", "rate"];
        const initialTemplate: Record<string, number> = {};
        const boundsTemplate: Record<string, { lower: number; upper: number }> = {};
        for (const parameter of parameters) {
          const setting = fitSettings[parameter];
          const initial = finiteOptional(setting.initial, `${parameter} initial value`);
          const lower = finiteOptional(setting.lower, `${parameter} lower bound`);
          const upper = finiteOptional(setting.upper, `${parameter} upper bound`);
          if ((lower === undefined) !== (upper === undefined)) {
            throw new Error(`${parameter}のboundはlowerとupperを両方指定してください`);
          }
          if (lower !== undefined && upper !== undefined && lower >= upper) {
            throw new Error(`${parameter}のboundはlower < upperにしてください`);
          }
          if (initial !== undefined) initialTemplate[parameter] = initial;
          if (lower !== undefined && upper !== undefined) {
            boundsTemplate[parameter] = { lower, upper };
          }
        }
        request = {
          protocolVersion: "0.14.0",
          requestId: "request.nonlinear.1",
          projectId: "project.nonlinear",
          analysisId: "analysis.nonlinear.1",
          templateId: "D17",
          templateVersion: "0.1.0",
          method: "nonlinear_xy_fit",
          modelId: nonlinearModel,
          modelSelectionRationale: modelRationale.trim(),
          xLabel: xLabel.trim() || "X",
          yLabel: yLabel.trim() || "Y",
          xUnit: xUnit.trim(),
          yUnit: yUnit.trim(),
          seriesIds: parsed.data.series.map(({ id }) => id),
          points: parsed.data.points.map(
            ({ observationId, experimentalUnitId, seriesId, x, y }) => ({
              observationId,
              experimentalUnitId,
              seriesId,
              x,
              y,
            }),
          ),
          initialValues: Object.fromEntries(
            parsed.data.series.map(({ id }) => [id, { ...initialTemplate }]),
          ),
          bounds: Object.fromEntries(
            parsed.data.series.map(({ id }) => [id, { ...boundsTemplate }]),
          ),
          observations: [],
          options,
        };
      } else
        throw new Error(
          "Distribution Graph is exploratory and does not automatically run an inferential test",
        );
      const validated = AnalysisEngineRequestSchema.parse(request);
      const next = await analysisRunner(validated);
      setExecutedRequest(validated);
      setResult(next);
      recordBenchmarkEvent("statistics_executed", {
        method: validated.method,
        recommendedMethod: validated.method,
        recommendationDiffers: false,
        recommendationReasonCode:
          parsed.kind === "regression"
            ? "explicit_numeric_covariate"
            : parsed.kind === "nonlinear-fit"
              ? "explicit_saturating_xy_model"
              : "explicit_core_route",
        recommendationExplanation:
          parsed.kind === "regression"
            ? `The paired ${xLabel || "numeric covariate"} and ${yLabel || "outcome"} values are modeled at the stable experimental-unit level.`
            : parsed.kind === "nonlinear-fit"
              ? modelRationale.trim()
              : "The explicitly selected Core route matches the entered data structure.",
        recommendationDecision: null,
        recommendationSelectedMethod: validated.method,
        contrast:
          parsed.kind === "regression"
            ? "slope"
            : parsed.kind === "nonlinear-fit"
              ? `model:${nonlinearModel}`
              : null,
        protocolVersion: validated.protocolVersion,
        engineVersion: next.engine.version,
      });
      setMessage("解析とprovenance記録が完了しました。");
    } catch (error) {
      setExecutedRequest(null);
      setResult(null);
      setMessage(error instanceof Error ? error.message : "解析できませんでした");
    }
  };
  let graph: React.ReactNode = null;
  let graphExportAvailable = false;
  try {
    if (!("error" in parsed) && parsed.kind === "contingency") {
      graph = <CountGraph ref={svgRef} {...parsed.data} display={display} />;
      graphExportAvailable = true;
    }
    if (!("error" in parsed) && parsed.kind === "distribution") {
      validateGraphScale(parsed.data, xScale, "X");
      const model =
        distributionType === "histogram"
          ? createHistogramModel(parsed.data, binCount ? Number(binCount) : undefined)
          : createEcdfModel(parsed.data);
      createDistributionGraphSpec({
        graphId: "graph.distribution.1",
        type: distributionType,
        dataSource: { kind: "raw_revision", id: "raw.1", revision: "raw.1" },
        xLabel,
        xScale,
        binCount: "binCount" in model ? model.binCount : null,
        binWidth: "binWidth" in model ? model.binWidth : null,
      });
      graph = (
        <DistributionGraph
          ref={svgRef}
          model={model}
          type={distributionType}
          xLabel={xLabel}
          xScale={xScale}
        />
      );
      graphExportAvailable = true;
    }
    if (!("error" in parsed) && parsed.kind === "regression" && result?.regression) {
      const spec = createRegressionGraphSpec({
        graphId: "graph.regression.1",
        dataSource: { kind: "analysis_result", id: result.requestId, revision: result.requestId },
        analysisResultId: result.requestId,
        xLabel,
        yLabel,
        xScale,
        yScale,
      });
      const points = parsed.data.map(({ unitId, x, y }) => ({ experimentalUnitId: unitId, x, y }));
      graph = (
        <RegressionGraph
          ref={svgRef}
          model={createRegressionGraphModel(spec, points, result, showBand)}
          xLabel={xLabel}
          yLabel={yLabel}
          xScale={xScale}
          yScale={yScale}
        />
      );
      graphExportAvailable = true;
    }
    if (!("error" in parsed) && parsed.kind === "nonlinear-fit" && result?.nonlinearFit) {
      const spec = createNonlinearFitGraphSpec({
        graphId: "graph.nonlinear.1",
        dataSource: { kind: "analysis_result", id: result.requestId, revision: result.requestId },
        analysisResultId: result.requestId,
        xLabel: xLabel.trim() || "X",
        yLabel: yLabel.trim() || "Y",
        seriesIds: parsed.data.series.map(({ id }) => id),
      });
      graph = (
        <NonlinearFitGraph
          ref={svgRef}
          model={createNonlinearFitGraphModel(spec, parsed.data.points, result)}
          xLabel={`${xLabel.trim() || "X"}${xUnit.trim() ? ` (${xUnit.trim()})` : ""}`}
          yLabel={`${yLabel.trim() || "Y"}${yUnit.trim() ? ` (${yUnit.trim()})` : ""}`}
          seriesLabels={Object.fromEntries(
            parsed.data.series.map(({ id, label: seriesLabel }) => [id, seriesLabel]),
          )}
        />
      );
      graphExportAvailable = true;
    }
  } catch (error) {
    graph = <p role="alert">{error instanceof Error ? error.message : "Graphを表示できません"}</p>;
  }
  const nonlinearRecommendation: AnalysisRecommendation | null =
    executedRequest?.protocolVersion === "0.14.0"
      ? {
          templateId: "D17",
          templateVersion: "0.1.0",
          recommendedMethod: "nonlinear_xy_fit",
          alternativeMethods: [],
          reasonCode: "explicit_saturating_xy_model",
          explanation: executedRequest.modelSelectionRationale,
          statisticalNDefinition: `${new Set(executedRequest.points.map(({ experimentalUnitId }) => experimentalUnitId)).size} stable units; observed XY points are retained separately from fitted curves`,
          multiplicityMethod: null,
          decision: { kind: "accepted", selectedMethod: "nonlinear_xy_fit" },
        }
      : null;
  const nonlinearDesignData =
    !("error" in parsed) &&
    parsed.kind === "nonlinear-fit" &&
    executedRequest?.protocolVersion === "0.14.0"
      ? createNonlinearDesignData(parsed.data, {
          xLabel: executedRequest.xLabel,
          yLabel: executedRequest.yLabel,
          yUnit: executedRequest.yUnit,
          modelId: executedRequest.modelId,
          rationale: executedRequest.modelSelectionRationale,
          createdAt: result?.completedAt ?? new Date().toISOString(),
        })
      : null;
  const nonlinearSpec =
    result && executedRequest?.protocolVersion === "0.14.0"
      ? createNonlinearFitGraphSpec({
          graphId: "graph.nonlinear.1",
          dataSource: { kind: "analysis_result", id: result.requestId, revision: result.requestId },
          analysisResultId: result.requestId,
          xLabel: executedRequest.xLabel,
          yLabel: executedRequest.yLabel,
          seriesIds: executedRequest.seriesIds,
        })
      : null;
  const methods =
    result && executedRequest
      ? executedRequest.protocolVersion === "0.14.0" &&
        nonlinearRecommendation &&
        nonlinearDesignData
        ? generateMethodsText({
            design: nonlinearDesignData.design,
            recommendation: nonlinearRecommendation,
            request: executedRequest,
            result,
            graphSpec: nonlinearSpec,
            outcomeId: nonlinearDesignData.outcomeId,
          })
        : generateCommonCoverageMethods(executedRequest, result)
      : null;

  const saveNonlinearProject = async () => {
    if (!saveProject) {
      setMessage("デスクトップ版で保存できます。");
      return;
    }
    if (
      !result ||
      executedRequest?.protocolVersion !== "0.14.0" ||
      !nonlinearRecommendation ||
      !nonlinearDesignData ||
      !nonlinearSpec
    ) {
      setMessage("先に非線形fitを実行してください。");
      return;
    }
    try {
      const createdAt = result.completedAt;
      await saveProject(
        createInitialProjectState({
          metadata: {
            projectId: "project.nonlinear",
            projectName: "Nonlinear XY fitting",
            experimentDate: createdAt.slice(0, 10),
            createdAt,
            updatedAt: createdAt,
          },
          design: nonlinearDesignData.design,
          rawRevision: {
            id: "raw.nonlinear.1",
            previousRevisionId: null,
            sourceKind: "paste",
            createdAt,
            createdBy: "researcher",
            note: "Observed X/Y points retained separately from the authoritative D17 fit result.",
          },
          unitInstances: nonlinearDesignData.units,
          observations: nonlinearDesignData.observations,
          actor: "researcher",
          analysis: {
            recommendation: nonlinearRecommendation,
            request: executedRequest,
            result,
            graphSpec: nonlinearSpec,
          },
        }),
      );
      setMessage(
        "model、parameter、診断、raw points、saved fit curveをプロジェクトへ保存しました。",
      );
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "プロジェクトを保存できませんでした");
    }
  };
  const benchmarkAnalysisState = JSON.stringify({
    mode,
    request: executedRequest,
    result,
    graph: { xLabel, yLabel, xScale, yScale, showBand },
  });

  useLayoutEffect(() => {
    if (
      !import.meta.env.DEV ||
      mode !== "regression" ||
      !result ||
      !executedRequest ||
      !benchmarkRun.identity ||
      benchmarkRun.defaultGraphCapture ||
      !svgRef.current
    )
      return;
    void (async () => {
      try {
        const capturedAt = new Date().toISOString();
        if (!beginDefaultGraphCapture(capturedAt)) return;
        const svg = svgRef.current;
        if (!svg) return;
        const svgText = serializeGraphSvg(svg);
        const viewBox = svg.viewBox.baseVal;
        const png = await svgToPngBlob(
          svgText,
          viewBox.width || svg.width.baseVal.value || 900,
          viewBox.height || svg.height.baseVal.value || 520,
        );
        const [svgSha256, pngSha256, analysisStateFingerprint] = await Promise.all([
          sha256Hex(svgText),
          sha256Hex(png),
          sha256Hex(benchmarkAnalysisState),
        ]);
        await writeBenchmarkArtifacts([
          { name: "default_graph.svg", content: svgText, mediaType: "image/svg+xml" },
          {
            name: "default_graph.png",
            content: await blobToBase64(png),
            encoding: "base64",
            mediaType: "image/png",
          },
        ]);
        completeDefaultGraphCapture({
          graphStateFingerprint: svgSha256,
          analysisStateFingerprint,
          svgSha256,
          pngSha256,
        });
        setMessage("Benchmarkの既定Regression Graphを保存しました。");
      } catch {
        setBenchmarkOutcome("infrastructure_failure");
        setMessage("既定Regression Graphの評価artifactを保存できませんでした。");
      }
    })();
  }, [
    benchmarkAnalysisState,
    benchmarkRun.defaultGraphCapture,
    benchmarkRun.identity,
    executedRequest,
    mode,
    result,
  ]);

  const finalizeRegressionBenchmark = async () => {
    const svg = svgRef.current;
    const runState = currentBenchmarkRun();
    if (
      mode !== "regression" ||
      !svg ||
      !result ||
      !executedRequest ||
      !methods ||
      !runState.identity ||
      !runState.supportStatus ||
      !runState.defaultGraphCaptured
    ) {
      setMessage("完了前に解析、Default Graph保存、Scientific support選択を完了してください。");
      return;
    }
    try {
      const svgText = serializeGraphSvg(svg);
      const viewBox = svg.viewBox.baseVal;
      const png = await svgToPngBlob(
        svgText,
        viewBox.width || svg.width.baseVal.value || 900,
        viewBox.height || svg.height.baseVal.value || 520,
      );
      const capturedAt = new Date().toISOString();
      const [svgSha256, pngSha256, analysisStateFingerprint] = await Promise.all([
        sha256Hex(svgText),
        sha256Hex(png),
        sha256Hex(benchmarkAnalysisState),
      ]);
      recordFinalGraphCapture({
        capturedAt,
        graphStateFingerprint: svgSha256,
        analysisStateFingerprint,
        svgSha256,
        pngSha256,
      });
      setBenchmarkOutcome("completed");
      recordBenchmarkEvent("benchmark_run_finalized", {
        selectedGraph: "simple_linear_regression",
        selectedStatistics: executedRequest.method,
      });
      const finalRun = currentBenchmarkRun();
      const graphState = {
        graphType: "simple_linear_regression",
        xLabel,
        yLabel,
        xScale,
        yScale,
        showBand,
        analysis: { request: executedRequest, result },
      };
      await writeBenchmarkArtifacts(
        [
          {
            name: "run.json",
            content: JSON.stringify(
              {
                ...finalRun.identity,
                appVersion: PRODUCT_IDENTITY.version,
                sourceRevision: evaluationMode.sourceRevision,
                engineVersion: result.engine.version,
                startedAt: finalRun.startedAt,
                completedAt: capturedAt,
                outcome: finalRun.outcome,
                supportStatus: finalRun.supportStatus,
                artifactCompleteness: "complete",
                defaultGraphCaptured: finalRun.defaultGraphCaptured,
                captureProvenanceVersion: "1.1.0",
                defaultCapturedAt: finalRun.defaultGraphCapture?.capturedAt ?? null,
                defaultCapturedEventIndex: finalRun.defaultGraphCapture?.eventIndex ?? null,
                finalCapturedAt: finalRun.finalGraphCapture?.capturedAt ?? null,
                finalCapturedEventIndex: finalRun.finalGraphCapture?.eventIndex ?? null,
                defaultGraphStateFingerprint:
                  finalRun.defaultGraphCapture?.graphStateFingerprint ?? null,
                finalGraphStateFingerprint:
                  finalRun.finalGraphCapture?.graphStateFingerprint ?? null,
                defaultAnalysisStateFingerprint:
                  finalRun.defaultGraphCapture?.analysisStateFingerprint ?? null,
                finalAnalysisStateFingerprint:
                  finalRun.finalGraphCapture?.analysisStateFingerprint ?? null,
                defaultSvgSha256: finalRun.defaultGraphCapture?.svgSha256 ?? null,
                defaultPngSha256: finalRun.defaultGraphCapture?.pngSha256 ?? null,
                finalSvgSha256: finalRun.finalGraphCapture?.svgSha256 ?? null,
                finalPngSha256: finalRun.finalGraphCapture?.pngSha256 ?? null,
                interactionCount: finalRun.events.length,
                graphEditCount: 0,
                renderedGraphEditCount: 0,
                analysisEditCount: finalRun.events.filter(
                  ({ effect }) => effect === "analysis_only" || effect === "both",
                ).length,
              },
              null,
              2,
            ),
          },
          { name: "final_graph.svg", content: svgText, mediaType: "image/svg+xml" },
          {
            name: "final_graph.png",
            content: await blobToBase64(png),
            encoding: "base64",
            mediaType: "image/png",
          },
          {
            name: "statistics.json",
            content: JSON.stringify(
              {
                statisticalUnit: "biological unit",
                recommendedMethod: "simple_linear_regression",
                selectedMethod: executedRequest.method,
                correction: executedRequest.options.multiplicityMethod,
                request: executedRequest,
                result,
                state: "current",
                applicationVersion: PRODUCT_IDENTITY.version,
              },
              null,
              2,
            ),
          },
          { name: "methods.txt", content: methods },
          { name: "graph_state.json", content: JSON.stringify(graphState, null, 2) },
          { name: "interaction_log.json", content: JSON.stringify(finalRun.events, null, 2) },
        ],
        { requiredArtifacts: COMPLETE_BENCHMARK_ARTIFACT_NAMES },
      );
      setMessage("Regression benchmark runの9 artifactsを保存しました。");
    } catch {
      setBenchmarkOutcome("infrastructure_failure");
      setMessage("Regression benchmark artifactを保存できませんでした。");
    }
  };
  return (
    <div className="page-stack specialized-analysis-page">
      <button className="back-link" type="button" onClick={onBack}>
        ← 戻る
      </button>
      <AnalysisRouteSwitcher current={mode} onNavigate={onNavigate} />
      <section className="workspace-panel specialized-workspace-panel">
        <p className="overline">専門解析</p>
        <h1>{titles[mode]}</h1>
        <p>
          {mode === "contingency"
            ? "独立した実験単位の整数count、または対応binaryの2×2遷移表だけを入力します。percentageをcountへ変換しません。"
            : mode === "repeated-nonparametric"
              ? "同じ生物学的単位のIDを保ったままFriedman検定とHolm補正済みWilcoxon比較を行います。"
              : mode === "regression"
                ? "相関とは別にOLS回帰を実行します。切片は既定で推定します。"
                : mode === "nonlinear-fit"
                  ? "観測X/Y点に明示した飽和modelをfitします。Graphは保存済み解析結果のcurveだけを描き、見た目の変更では再計算しません。"
                  : "元の個別値を保持した探索的Graphです。検定は自動追加しません。"}
        </p>
        {import.meta.env.DEV && mode === "regression" && literatureCase ? (
          <section className="benchmark-pilot-loader" aria-label="Literature単回帰合成値">
            <div>
              <strong>{literatureCase.caseId}</strong>
              <span>stable unitごとのX/Y関係を単回帰表へ入力します。</span>
            </div>
            <button type="button" onClick={loadLiteratureRegression}>
              このLiterature caseを単回帰表へ入力
            </button>
          </section>
        ) : null}
        <textarea
          aria-label={`${titles[mode]} data`}
          rows={9}
          value={text}
          onChange={(e) => {
            setText(e.target.value);
            setResult(null);
            setExecutedRequest(null);
          }}
          style={{ width: "100%", fontFamily: "monospace" }}
        />
        {mode === "contingency" ? (
          <>
            <label>
              Analysis{" "}
              <select
                value={contingencyMethod}
                onChange={(e) => setContingencyMethod(e.target.value as typeof contingencyMethod)}
              >
                <option value="fisher_exact">Fisher exact (2×2 independent)</option>
                <option value="pearson_chi_square">Pearson Chi-square (independent)</option>
                <option value="mcnemar_exact">McNemar exact (paired binary)</option>
              </select>
            </label>
            <label>
              Graph{" "}
              <select
                value={display}
                onChange={(e) => setDisplay(e.target.value as typeof display)}
              >
                <option value="count">Count bars</option>
                <option value="fraction">Fraction bars</option>
                <option value="stacked">100% stacked</option>
              </select>
            </label>
          </>
        ) : null}
        {mode === "regression" ? (
          <>
            <label>
              X label <input value={xLabel} onChange={(e) => setXLabel(e.target.value)} />
            </label>
            <label>
              Y label <input value={yLabel} onChange={(e) => setYLabel(e.target.value)} />
            </label>
            <label>
              <input
                type="checkbox"
                checked={includeIntercept}
                onChange={(e) => setIncludeIntercept(e.target.checked)}
              />{" "}
              Estimate intercept
            </label>
            <label>
              <input
                type="checkbox"
                checked={showBand}
                onChange={(e) => setShowBand(e.target.checked)}
              />{" "}
              Confidence band
            </label>
          </>
        ) : null}
        {mode === "nonlinear-fit" ? (
          <div className="nonlinear-fit-settings">
            <fieldset>
              <legend>Fit model</legend>
              <label>
                <input
                  type="radio"
                  name="nonlinear-model"
                  value="zero_baseline_association"
                  checked={nonlinearModel === "zero_baseline_association"}
                  onChange={() => {
                    setNonlinearModel("zero_baseline_association");
                    setModelRationale((current) =>
                      Object.values(nonlinearModelRationales).includes(current)
                        ? nonlinearModelRationales.zero_baseline_association
                        : current,
                    );
                    setResult(null);
                    setExecutedRequest(null);
                  }}
                />
                <span>
                  <strong>Zero-baseline association</strong>
                  <small>Y = plateau × (1 − exp(−rate × X))</small>
                </span>
              </label>
              <label>
                <input
                  type="radio"
                  name="nonlinear-model"
                  value="one_phase_association"
                  checked={nonlinearModel === "one_phase_association"}
                  onChange={() => {
                    setNonlinearModel("one_phase_association");
                    setModelRationale((current) =>
                      Object.values(nonlinearModelRationales).includes(current)
                        ? nonlinearModelRationales.one_phase_association
                        : current,
                    );
                    setResult(null);
                    setExecutedRequest(null);
                  }}
                />
                <span>
                  <strong>One-phase association</strong>
                  <small>Y = baseline + (plateau − baseline) × (1 − exp(−rate × X))</small>
                </span>
              </label>
            </fieldset>
            <label>
              Model selectionの理由
              <textarea
                aria-label="Model selectionの理由"
                rows={3}
                value={modelRationale}
                onChange={(event) => {
                  setModelRationale(event.target.value);
                  setResult(null);
                  setExecutedRequest(null);
                }}
              />
            </label>
            <div className="nonlinear-fit-axis-fields">
              <label>
                X label <input value={xLabel} onChange={(event) => setXLabel(event.target.value)} />
              </label>
              <label>
                X unit <input value={xUnit} onChange={(event) => setXUnit(event.target.value)} />
              </label>
              <label>
                Y label <input value={yLabel} onChange={(event) => setYLabel(event.target.value)} />
              </label>
              <label>
                Y unit <input value={yUnit} onChange={(event) => setYUnit(event.target.value)} />
              </label>
            </div>
            <details>
              <summary>Initial values / bounds（必要な場合のみ）</summary>
              <p>
                指定値は各seriesへ適用し、requestとprovenanceに保存します。空欄はengineのdeterministic
                defaultです。
              </p>
              <div className="nonlinear-fit-parameter-scroll">
                <table className="nonlinear-fit-parameter-inputs">
                  <thead>
                    <tr>
                      <th>Parameter</th>
                      <th>Initial</th>
                      <th>Lower</th>
                      <th>Upper</th>
                    </tr>
                  </thead>
                  <tbody>
                    {(["baseline", "plateau", "rate"] as const)
                      .filter(
                        (parameter) =>
                          parameter !== "baseline" || nonlinearModel === "one_phase_association",
                      )
                      .map((parameter) => (
                        <tr key={parameter}>
                          <th>{parameter}</th>
                          {(["initial", "lower", "upper"] as const).map((field) => (
                            <td key={field}>
                              <input
                                aria-label={`${parameter} ${field}`}
                                inputMode="decimal"
                                value={fitSettings[parameter][field]}
                                onChange={(event) =>
                                  setFitSettings((current) => ({
                                    ...current,
                                    [parameter]: {
                                      ...current[parameter],
                                      [field]: event.target.value,
                                    },
                                  }))
                                }
                              />
                            </td>
                          ))}
                        </tr>
                      ))}
                  </tbody>
                </table>
              </div>
            </details>
          </div>
        ) : null}
        {mode === "distribution" ? (
          <>
            <label>
              Graph{" "}
              <select
                value={distributionType}
                onChange={(e) => setDistributionType(e.target.value as typeof distributionType)}
              >
                <option value="histogram">Histogram</option>
                <option value="ecdf">ECDF</option>
              </select>
            </label>
            <label>
              Histogram bins (blank = deterministic){" "}
              <input
                type="number"
                min="1"
                max="200"
                value={binCount}
                onChange={(e) => setBinCount(e.target.value)}
              />
            </label>
          </>
        ) : null}
        {mode === "regression" || mode === "distribution" ? (
          <>
            <label>
              X scale{" "}
              <select value={xScale} onChange={(e) => setXScale(e.target.value as typeof xScale)}>
                <option value="linear">Linear</option>
                <option value="log10">Log10</option>
              </select>
            </label>
            {mode === "regression" ? (
              <label>
                Y scale{" "}
                <select value={yScale} onChange={(e) => setYScale(e.target.value as typeof yScale)}>
                  <option value="linear">Linear</option>
                  <option value="log10">Log10</option>
                </select>
              </label>
            ) : null}
          </>
        ) : null}
        {mode !== "distribution" ? (
          <button
            className="analysis-run-button"
            type="button"
            disabled={!analysisAvailable}
            onClick={() => void run()}
          >
            {mode === "nonlinear-fit" ? "選択したmodelでfitを実行" : "解析を実行"}
          </button>
        ) : null}
        {mode !== "distribution" && !analysisAvailable ? (
          <p className="specialized-engine-note" role="note">
            このブラウザレビューでは解析エンジンを実行できません。デスクトップ版では利用できます。
          </p>
        ) : null}
        {mode === "nonlinear-fit" ? (
          <button
            type="button"
            disabled={!result?.nonlinearFit}
            onClick={() => void saveNonlinearProject()}
          >
            fit結果をプロジェクトへ保存
          </button>
        ) : null}
        <button
          type="button"
          disabled={!graphExportAvailable}
          onClick={() =>
            svgRef.current &&
            downloadTextFile(serializeGraphSvg(svgRef.current), `${mode}.svg`, "image/svg+xml")
          }
        >
          SVGを書き出す
        </button>
        {import.meta.env.DEV && mode === "regression" && benchmarkRun.identity ? (
          <button type="button" onClick={() => void finalizeRegressionBenchmark()}>
            Benchmark runを完了
          </button>
        ) : null}
        {message ? <p role="status">{message}</p> : null}
        {"error" in parsed ? <p role="alert">{parsed.error}</p> : null}
      </section>
      <section className="workspace-panel specialized-workspace-panel">
        {graph}
        {result?.nonlinearFit ? (
          <div className="nonlinear-fit-results" role="region" aria-label="非線形fit結果">
            <header>
              <p className="overline">保存対象の解析結果</p>
              <h2>Parameter estimates & fit diagnostics</h2>
              <p>
                Model: <strong>{result.nonlinearFit.modelId}</strong> · version{" "}
                {result.nonlinearFit.modelVersion}
              </p>
              <p>{result.nonlinearFit.selectionRationale}</p>
            </header>
            {result.nonlinearFit.series.map((seriesFit) => (
              <section key={seriesFit.seriesId} className="nonlinear-fit-series-result">
                <h3>
                  {!("error" in parsed) && parsed.kind === "nonlinear-fit"
                    ? (parsed.data.series.find(({ id }) => id === seriesFit.seriesId)?.label ??
                      seriesFit.seriesId)
                    : seriesFit.seriesId}
                </h3>
                <table>
                  <thead>
                    <tr>
                      <th>Parameter</th>
                      <th>Estimate</th>
                      <th>SE</th>
                      <th>95% CI</th>
                    </tr>
                  </thead>
                  <tbody>
                    {seriesFit.parameters.map((parameter) => (
                      <tr key={parameter.name}>
                        <th>{parameter.name}</th>
                        <td>{parameter.value.toPrecision(5)}</td>
                        <td>{parameter.standardError?.toPrecision(4) ?? "—"}</td>
                        <td>
                          {parameter.confidenceInterval
                            ? `${parameter.confidenceInterval.lower.toPrecision(4)} – ${parameter.confidenceInterval.upper.toPrecision(4)}`
                            : "—"}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
                <dl className="nonlinear-fit-diagnostics">
                  <div>
                    <dt>n</dt>
                    <dd>{seriesFit.diagnostics.n}</dd>
                  </div>
                  <div>
                    <dt>Distinct X</dt>
                    <dd>{seriesFit.diagnostics.distinctX}</dd>
                  </div>
                  <div>
                    <dt>RMSE</dt>
                    <dd>{seriesFit.diagnostics.rmse.toPrecision(4)}</dd>
                  </div>
                  <div>
                    <dt>R²</dt>
                    <dd>{seriesFit.diagnostics.rSquared.toPrecision(4)}</dd>
                  </div>
                  <div>
                    <dt>AIC</dt>
                    <dd>{seriesFit.diagnostics.aic.toPrecision(5)}</dd>
                  </div>
                  <div>
                    <dt>Residual df</dt>
                    <dd>{seriesFit.diagnostics.residualDegreesOfFreedom}</dd>
                  </div>
                </dl>
                <details>
                  <summary>Fit provenance</summary>
                  <pre>
                    {JSON.stringify(
                      { initialValues: seriesFit.initialValues, bounds: seriesFit.bounds },
                      null,
                      2,
                    )}
                  </pre>
                </details>
              </section>
            ))}
            <p>
              Engine: {result.engine.name} {result.engine.version} ·{" "}
              {Object.entries(result.engine.packages)
                .map(([name, version]) => `${name} ${version}`)
                .join(", ")}
            </p>
          </div>
        ) : result ? (
          <pre style={{ whiteSpace: "pre-wrap" }}>
            {JSON.stringify(
              { estimates: result.estimates, tests: result.tests, diagnostics: result.diagnostics },
              null,
              2,
            )}
          </pre>
        ) : null}
        {methods ? (
          <details>
            <summary>Methods</summary>
            <pre style={{ whiteSpace: "pre-wrap" }}>{methods}</pre>
          </details>
        ) : null}
      </section>
    </div>
  );
}

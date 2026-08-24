import { useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";
import { AnalysisEngineRequestSchema, type AnalysisEngineResult } from "@lsaa/analysis-contracts";
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
  createRegressionGraphModel,
  createRegressionGraphSpec,
  validateGraphScale,
} from "@lsaa/graph-spec";
import { defaultAnalysisRunner, type AnalysisRunner } from "../app/analysisClient";
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
import {
  fetchLiteratureExperimenterCase,
  isLiteratureCaseId,
  type LiteratureExperimenterCase,
} from "../app/literatureBenchmark";
import { PRODUCT_IDENTITY } from "../app/productIdentity";
import {
  CountGraph,
  DistributionGraph,
  RegressionGraph,
} from "../components/graph/CommonMethodGraphs";

type Mode = "contingency" | "repeated-nonparametric" | "regression" | "distribution";
type Props = Readonly<{ mode: Mode; onBack: () => void; analysisRunner?: AnalysisRunner }>;
const defaults: Record<Mode, string> = {
  contingency: "Category\tEvent\tNo event\nControl\t1\t9\nTreatment\t6\t4",
  "repeated-nonparametric":
    "Unit ID\tCondition\tValue\nu1\tBaseline\t8\nu1\tDay 1\t7\nu1\tDay 2\t6\nu2\tBaseline\t9\nu2\tDay 1\t7\nu2\tDay 2\t5\nu3\tBaseline\t6\nu3\tDay 1\t5\nu3\tDay 2\t4",
  regression: "Unit ID\tX\tY\nu1\t1\t2.1\nu2\t2\t4.2\nu3\t3\t5.8\nu4\t4\t8.3\nu5\t5\t9.9",
  distribution: "1 2 2 3 5 8 13 21 34",
};
const titles: Record<Mode, string> = {
  contingency: "Categorical / contingency",
  "repeated-nonparametric": "Repeated nonparametric",
  regression: "Simple linear regression",
  distribution: "Histogram / ECDF",
};
const options = {
  alternative: "two_sided" as const,
  confidenceLevel: 0.95,
  multiplicityMethod: null,
};

export function CommonCoveragePage({
  mode,
  onBack,
  analysisRunner = defaultAnalysisRunner,
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
    [xScale, setXScale] = useState<"linear" | "log10">("linear"),
    [yScale, setYScale] = useState<"linear" | "log10">("linear"),
    [showBand, setShowBand] = useState(true);
  const [distributionType, setDistributionType] = useState<"histogram" | "ecdf">("histogram"),
    [binCount, setBinCount] = useState(""),
    svgRef = useRef<SVGSVGElement>(null);
  const benchmarkRun = useBenchmarkRun();
  useEffect(() => {
    const identity = benchmarkRun.identity;
    setLiteratureCase(null);
    if (!identity || !isLiteratureCaseId(identity.caseId)) return;
    let cancelled = false;
    void fetchLiteratureExperimenterCase(identity)
      .then((loaded) => {
        if (!cancelled) setLiteratureCase(loaded);
      })
      .catch(() => {
        if (!cancelled) setLiteratureCase(null);
      });
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
          parsed.kind === "regression" ? "explicit_numeric_covariate" : "explicit_core_route",
        recommendationExplanation:
          parsed.kind === "regression"
            ? `The paired ${xLabel || "numeric covariate"} and ${yLabel || "outcome"} values are modeled at the stable experimental-unit level.`
            : "The explicitly selected Core route matches the entered data structure.",
        recommendationDecision: null,
        recommendationSelectedMethod: validated.method,
        contrast: parsed.kind === "regression" ? "slope" : null,
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
  try {
    if (!("error" in parsed) && parsed.kind === "contingency")
      graph = <CountGraph ref={svgRef} {...parsed.data} display={display} />;
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
    }
  } catch (error) {
    graph = <p role="alert">{error instanceof Error ? error.message : "Graphを表示できません"}</p>;
  }
  const methods =
    result && executedRequest ? generateCommonCoverageMethods(executedRequest, result) : null;
  const benchmarkAnalysisState = JSON.stringify({
    mode,
    request: executedRequest,
    result,
    graph: { xLabel, yLabel, xScale, yScale, showBand },
  });

  useLayoutEffect(() => {
    if (
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
    <div className="page-stack">
      <button type="button" onClick={onBack}>
        ← 戻る
      </button>
      <section className="workspace-panel">
        <p className="overline">Common Core</p>
        <h1>{titles[mode]}</h1>
        <p>
          {mode === "contingency"
            ? "独立した実験単位の整数count、または対応binaryの2×2遷移表だけを入力します。percentageをcountへ変換しません。"
            : mode === "repeated-nonparametric"
              ? "同じ生物学的単位のIDを保ったままFriedman検定とHolm補正済みWilcoxon比較を行います。"
              : mode === "regression"
                ? "相関とは別にOLS回帰を実行します。切片は既定で推定します。"
                : "元の個別値を保持した探索的Graphです。検定は自動追加しません。"}
        </p>
        {mode === "regression" && literatureCase ? (
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
          <button type="button" onClick={() => void run()}>
            解析を実行
          </button>
        ) : null}
        <button
          type="button"
          onClick={() =>
            svgRef.current &&
            downloadTextFile(serializeGraphSvg(svgRef.current), `${mode}.svg`, "image/svg+xml")
          }
        >
          SVGを書き出す
        </button>
        {mode === "regression" && benchmarkRun.identity ? (
          <button type="button" onClick={() => void finalizeRegressionBenchmark()}>
            Benchmark runを完了
          </button>
        ) : null}
        {message ? <p role="status">{message}</p> : null}
        {"error" in parsed ? <p role="alert">{parsed.error}</p> : null}
      </section>
      <section className="workspace-panel">
        {graph}
        {result ? (
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

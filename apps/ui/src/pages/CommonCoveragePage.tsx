import { useMemo, useRef, useState } from "react";
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
import { downloadTextFile, serializeGraphSvg } from "../app/graphExport";
import { generateCommonCoverageMethods } from "../app/commonCoverageMethods";
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
        {result && executedRequest ? (
          <details>
            <summary>Methods</summary>
            <pre style={{ whiteSpace: "pre-wrap" }}>
              {generateCommonCoverageMethods(executedRequest, result)}
            </pre>
          </details>
        ) : null}
      </section>
    </div>
  );
}

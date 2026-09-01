import { useRef, useState } from "react";
import type { RefObject } from "react";

import type {
  AnalysisEngineRequest,
  AnalysisEngineResult,
  AnalysisRecommendation,
} from "@lsaa/analysis-contracts";
import type {
  DerivedDatasetRevision,
  DerivedScalarValue,
  ExperimentDesign,
  TransformationSpec,
} from "@lsaa/domain";
import type { CoreGraphModel, GraphSpec } from "@lsaa/graph-spec";

import { copyMethodsText, copyText, generateMethodsText } from "../app/methodsText";
import { downloadTextFile, serializeAnalyzedDataCsv, serializeGraphSvg } from "../app/graphExport";
import { methodLabel, templateLabel } from "../app/recommendationLabels";
import { createNiceTicks, createPlotRectangle } from "../components/graph/graphLayout";

type AnalysisResultViewProps = {
  result: AnalysisEngineResult;
  recommendation: AnalysisRecommendation;
  graphSpec: GraphSpec | null;
  graphModel: CoreGraphModel | null;
  design?: ExperimentDesign;
  request?: AnalysisEngineRequest;
  presentation?: "all" | "numeric" | "graph";
  onGraphSpecChange?: (spec: GraphSpec) => void;
  nestedSummary?: Readonly<{
    transformation: TransformationSpec;
    revision: DerivedDatasetRevision;
    values: DerivedScalarValue[];
  }> | null;
};

function formatNumber(value: number | null | undefined) {
  if (value === null || value === undefined || !Number.isFinite(value)) return "—";
  return new Intl.NumberFormat("en-US", { maximumFractionDigits: 4 }).format(value);
}

function formatPValue(value: number | null | undefined) {
  if (value === null || value === undefined || !Number.isFinite(value)) return "—";
  if (value === 0) return "0";
  return value < 0.0001 ? value.toExponential(2) : formatNumber(value);
}

function formatConfidenceLevel(value: number) {
  return `${formatNumber(value * 100)}% CI`;
}

function formatDegreesOfFreedom(degrees: number[] | null) {
  if (!degrees || degrees.length === 0) return "—";
  return degrees.map(formatNumber).join(", ");
}

function resultStatusLabel(status: AnalysisEngineResult["status"]) {
  if (status === "ok") return "解析完了（ローカル）";
  if (status === "validation_error") return "解析エラー（入力検証）";
  return "解析エラー";
}

function resultStatusChipLabel(status: AnalysisEngineResult["status"]) {
  if (status === "ok") return "完了";
  if (status === "validation_error") return "入力エラー";
  return "解析エラー";
}

function estimateLabel(name: string) {
  if (["mean difference", "mean_difference", "paired_mean_difference"].includes(name)) {
    return "平均値の差";
  }
  return name;
}

function MultiGroupResultSummary({
  design,
  estimates,
  tests,
  templateId,
}: Pick<AnalysisEngineResult, "estimates" | "tests"> & {
  design: ExperimentDesign;
  templateId: "D03" | "D04";
}) {
  const omnibus = tests[0];
  const pairwiseTests = tests.slice(1);
  const conditionLabels = new Map(
    design.conditions.map((condition) => [condition.id, condition.label]),
  );
  const comparisonLabel = (name: string) => {
    const [, firstId, secondId] = name.split(":");
    if (!firstId || !secondId) return name;
    return `${conditionLabels.get(firstId) ?? firstId} vs ${conditionLabels.get(secondId) ?? secondId}`;
  };
  return (
    <div className="d03-result-summary" aria-label={`${templateId}の多群解析結果`}>
      <article className="d03-omnibus-card">
        <div>
          <span className="recommendation-kicker">全体検定</span>
          <h4>{templateId === "D04" ? "反復測定分散分析" : "Welch分散分析"}</h4>
        </div>
        <dl className="analysis-metrics analysis-metrics--compact">
          <div>
            <dt>検定統計量</dt>
            <dd>
              {omnibus ? `${omnibus.statisticName} = ${formatNumber(omnibus.statistic)}` : "—"}
            </dd>
            <small>自由度：{formatDegreesOfFreedom(omnibus?.degreesOfFreedom ?? null)}</small>
          </div>
          <div>
            <dt>p値</dt>
            <dd>{omnibus ? formatPValue(omnibus.pValue) : "—"}</dd>
          </div>
        </dl>
      </article>
      {pairwiseTests.length > 0 && (
        <div className="data-table-scroll">
          <table className="data-table d03-pairwise-table">
            <caption>
              {templateId === "D04"
                ? "Holm補正を用いた対応のある全ペア比較"
                : "Games–Howellによる全ペア比較"}
            </caption>
            <thead>
              <tr>
                <th scope="col">比較</th>
                <th scope="col">平均値の差</th>
                <th scope="col">信頼区間</th>
                <th scope="col">p値</th>
                <th scope="col">調整済みp値</th>
              </tr>
            </thead>
            <tbody>
              {pairwiseTests.map((test, index) => {
                const estimate = estimates[index];
                return (
                  <tr key={`${test.name}-${index}`}>
                    <th scope="row">{comparisonLabel(test.name)}</th>
                    <td>{estimate ? formatNumber(estimate.value) : "—"}</td>
                    <td>
                      {estimate?.confidenceInterval
                        ? `${formatNumber(estimate.confidenceInterval.lower)}～${formatNumber(estimate.confidenceInterval.upper)}`
                        : "—"}
                    </td>
                    <td>{formatPValue(test.pValue)}</td>
                    <td>{formatPValue(test.adjustedPValue)}</td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}

function FactorialResultSummary({
  design,
  estimates,
  tests,
}: Pick<AnalysisEngineResult, "estimates" | "tests"> & { design: ExperimentDesign }) {
  const [interaction, factorA, factorB] = tests.slice(0, 3);
  const pairwiseTests = tests.slice(3);
  const conditionLabels = new Map(
    design.conditions.map((condition) => [condition.id, condition.label]),
  );
  const effectRows = [
    {
      label: `${design.factors[0]?.label ?? "因子A"} × ${design.factors[1]?.label ?? "因子B"}（交互作用）`,
      test: interaction,
    },
    { label: design.factors[0]?.label ?? "因子A", test: factorA },
    { label: design.factors[1]?.label ?? "因子B", test: factorB },
  ];
  const comparisonLabel = (name: string) => {
    const [, firstId, secondId] = name.split(":");
    return firstId && secondId
      ? `${conditionLabels.get(firstId) ?? firstId} vs ${conditionLabels.get(secondId) ?? secondId}`
      : name;
  };

  return (
    <div className="d03-result-summary" aria-label="D05の二元配置分散分析結果">
      <div className="data-table-scroll">
        <table className="data-table d03-pairwise-table">
          <caption>Type III検定（交互作用を先に確認）</caption>
          <thead>
            <tr>
              <th scope="col">効果</th>
              <th scope="col">F</th>
              <th scope="col">自由度</th>
              <th scope="col">p値</th>
              <th scope="col">偏η²</th>
            </tr>
          </thead>
          <tbody>
            {effectRows.map(({ label, test }, index) => (
              <tr key={label} className={index === 0 ? "factorial-interaction-row" : undefined}>
                <th scope="row">{label}</th>
                <td>{test ? formatNumber(test.statistic) : "—"}</td>
                <td>{formatDegreesOfFreedom(test?.degreesOfFreedom ?? null)}</td>
                <td>{test ? formatPValue(test.pValue) : "—"}</td>
                <td>{formatNumber(test?.effectSize)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      {pairwiseTests.length > 0 && (
        <div className="data-table-scroll">
          <table className="data-table d03-pairwise-table">
            <caption>Holm補正を用いた{design.conditions.length}条件の全ペア比較</caption>
            <thead>
              <tr>
                <th scope="col">比較</th>
                <th scope="col">平均値の差</th>
                <th scope="col">同時信頼区間</th>
                <th scope="col">p値</th>
                <th scope="col">Holm調整済みp値</th>
              </tr>
            </thead>
            <tbody>
              {pairwiseTests.map((test, index) => {
                const estimate = estimates[index];
                return (
                  <tr key={`${test.name}-${index}`}>
                    <th scope="row">{comparisonLabel(test.name)}</th>
                    <td>{formatNumber(estimate?.value)}</td>
                    <td>
                      {estimate?.confidenceInterval
                        ? `${formatNumber(estimate.confidenceInterval.lower)}～${formatNumber(estimate.confidenceInterval.upper)}`
                        : "—"}
                    </td>
                    <td>{formatPValue(test.pValue)}</td>
                    <td>{formatPValue(test.adjustedPValue)}</td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}

function CorrelationResultSummary({
  recommendation,
  result,
}: Pick<AnalysisResultViewProps, "recommendation" | "result">) {
  const estimate = result.estimates[0];
  const test = result.tests[0];
  const coefficientLabel = recommendation.recommendedMethod === "spearman" ? "ρ" : "r";
  const correlationN =
    test?.degreesOfFreedom?.length === 1 && Number.isFinite(test.degreesOfFreedom[0])
      ? test.degreesOfFreedom[0] + 2
      : null;
  return (
    <div className="correlation-result-summary" role="region" aria-label="D09相関解析結果">
      <div className="correlation-result-heading">
        <div>
          <span className="recommendation-kicker">関係の強さ</span>
          <h4>
            {recommendation.recommendedMethod === "spearman"
              ? "Spearmanの順位相関"
              : "Pearsonの相関"}
          </h4>
        </div>
        <span className="correlation-coefficient">
          {coefficientLabel} = {formatNumber(estimate?.value)}
        </span>
      </div>
      <dl className="analysis-metrics analysis-metrics--compact">
        <div>
          <dt>相関係数</dt>
          <dd>{estimate ? `${coefficientLabel} = ${formatNumber(estimate.value)}` : "—"}</dd>
          <small>
            {estimate?.confidenceInterval
              ? `${formatConfidenceLevel(estimate.confidenceInterval.level)}：${formatNumber(estimate.confidenceInterval.lower)}～${formatNumber(estimate.confidenceInterval.upper)}`
              : "信頼区間なし（順位相関）"}
          </small>
        </div>
        <div>
          <dt>p値</dt>
          <dd>{test ? formatPValue(test.pValue) : "—"}</dd>
          <small>両側検定・調整なし</small>
        </div>
        <div>
          <dt>統計上のn</dt>
          <dd>{formatNumber(correlationN)}</dd>
          <small>自由度 = n − 2</small>
        </div>
      </dl>
    </div>
  );
}

function GraphLegend({
  model,
  palette,
  design,
}: {
  model: CoreGraphModel;
  palette: string[];
  design?: ExperimentDesign;
}) {
  const seriesLevels = design?.factors.length === 2 ? design.factors[1].levels : null;
  const entries = seriesLevels
    ? seriesLevels.map((level, index) => ({ id: level.id, label: level.label, colorIndex: index }))
    : model.groups.map((group, index) => ({
        id: group.conditionId,
        label: group.label,
        colorIndex: index,
      }));
  return (
    <div className="graph-legend" aria-label="条件群">
      {entries.map((entry) => (
        <span key={entry.id}>
          <i
            className="graph-legend-swatch"
            style={{ backgroundColor: palette[entry.colorIndex % palette.length] }}
            aria-hidden="true"
          />
          {entry.label}
        </span>
      ))}
    </div>
  );
}

const PALETTE_PRESETS = [
  {
    id: "publication",
    label: "論文向け",
    colors: ["#1f4e79", "#c45a2b", "#4f7d61", "#7a5c91", "#9a7b24", "#3f7788"],
  },
  {
    id: "accessible",
    label: "色覚に配慮",
    colors: ["#0072b2", "#d55e00", "#009e73", "#e69f00", "#56b4e9", "#cc79a7"],
  },
  {
    id: "slate",
    label: "落ち着いた配色",
    colors: ["#334155", "#b45309", "#3f7664", "#6d5b8c", "#846b28", "#527080"],
  },
] as const;

function GraphInspector({
  spec,
  onChange,
}: {
  spec: GraphSpec;
  onChange?: (spec: GraphSpec) => void;
}) {
  if (!onChange) return null;
  const errorBarLabel =
    spec.summary.interval === "sem" ? "SEM" : spec.summary.interval === "sd" ? "SD" : "なし";
  const updateAppearance = (appearance: Partial<GraphSpec["appearance"]>) =>
    onChange({ ...spec, appearance: { ...spec.appearance, ...appearance } });
  const updateAxes = (axes: Partial<GraphSpec["axes"]>) =>
    onChange({ ...spec, axes: { ...spec.axes, ...axes } });

  return (
    <aside className="graph-inspector" aria-label="グラフ設定" data-graph-inspector>
      <div className="graph-inspector-heading">
        <div>
          <p className="overline">グラフ設定</p>
          <h3>論文向けの外観</h3>
        </div>
        <span className="graph-inspector-badge">外観のみ</span>
      </div>
      <p className="graph-inspector-note">
        解析結果・入力データは変更されません。誤差バーは平均±{errorBarLabel}のままです。
      </p>
      <div className="graph-inspector-grid">
        <label className="graph-inspector-field">
          <span>点の大きさ</span>
          <output>{spec.appearance.pointSize.toFixed(1)}</output>
          <input
            type="range"
            min="2"
            max="10"
            step="0.5"
            value={spec.appearance.pointSize}
            aria-label="点の大きさ"
            onChange={(event) => updateAppearance({ pointSize: Number(event.target.value) })}
          />
        </label>
        <label className="graph-inspector-field">
          <span>点の不透明度</span>
          <output>{Math.round(spec.appearance.opacity * 100)}%</output>
          <input
            type="range"
            min="0.4"
            max="1"
            step="0.05"
            value={spec.appearance.opacity}
            aria-label="点の不透明度"
            onChange={(event) => updateAppearance({ opacity: Number(event.target.value) })}
          />
        </label>
        <label className="graph-inspector-field graph-inspector-field--wide">
          {spec.type === "scatter" && (
            <>
              <span>横軸ラベル</span>
              <input
                type="text"
                value={spec.axes.xLabel}
                aria-label="横軸ラベル"
                onChange={(event) => updateAxes({ xLabel: event.target.value })}
              />
            </>
          )}
          <span>縦軸ラベル</span>
          <input
            type="text"
            value={spec.axes.yLabel}
            aria-label="縦軸ラベル"
            onChange={(event) => updateAxes({ yLabel: event.target.value })}
          />
        </label>
      </div>
      <fieldset className="graph-inspector-palette">
        <legend>配色プリセット</legend>
        <div className="graph-inspector-palette-options">
          {PALETTE_PRESETS.map((preset) => {
            const selected = preset.colors.every(
              (color, index) => spec.appearance.palette[index] === color,
            );
            return (
              <button
                key={preset.id}
                type="button"
                className={`graph-palette-option ${selected ? "is-selected" : ""}`}
                aria-label={`配色：${preset.label}`}
                aria-pressed={selected}
                onClick={() => updateAppearance({ palette: [...preset.colors] })}
              >
                <span className="graph-palette-swatches" aria-hidden="true">
                  {preset.colors.map((color) => (
                    <i key={color} style={{ backgroundColor: color }} />
                  ))}
                </span>
                <span>{preset.label}</span>
              </button>
            );
          })}
        </div>
      </fieldset>
      <label className="graph-inspector-checkbox">
        <input
          type="checkbox"
          checked={spec.axes.yStartAtZero}
          aria-label="縦軸を0から開始"
          onChange={(event) => updateAxes({ yStartAtZero: event.target.checked })}
        />
        <span>縦軸を0から開始</span>
      </label>
    </aside>
  );
}

function InlineCoreGraph({
  model,
  spec,
  design,
  svgRef,
}: {
  model: CoreGraphModel;
  spec: GraphSpec;
  design?: ExperimentDesign;
  svgRef?: RefObject<SVGSVGElement | null>;
}) {
  // A one-factor D03 design can also carry scientific level groups. They are
  // visual brackets only; each level remains its own plotted condition.
  const groupedDesign = design?.factors[0]?.levelGroups?.length ? design : null;
  const factorialDesign = design?.factors.length === 2 ? design : null;
  const factorA = (groupedDesign ?? factorialDesign)?.factors[0];
  const factorB = factorialDesign?.factors[1];
  const width = factorA ? Math.max(520, 105 * factorA.levels.length + 120) : 520;
  const height = factorA?.levelGroups?.length ? 390 : 350;
  const margin = {
    top: 24,
    right: 26,
    bottom: factorA?.levelGroups?.length ? 128 : factorA ? 96 : 88,
    left: 61,
  };
  const plot = createPlotRectangle(width, height, margin);
  const allValues = model.groups.flatMap((group) => [
    ...group.values.map((value) => value.value),
    ...group.rawValues.map((value) => value.value),
    ...(group.errorBar === null ? [] : [group.mean - group.errorBar, group.mean + group.errorBar]),
  ]);
  const minimum = Math.min(...allValues);
  const maximum = Math.max(...allValues);
  const observedRange = maximum - minimum;
  const padding = observedRange > 0 ? observedRange * 0.08 : Math.max(Math.abs(maximum) * 0.08, 1);
  const domainMin = model.yStartAtZero ? 0 : minimum - padding;
  const domainMax = Math.max(domainMin + 1, maximum + padding);
  const domainRange = domainMax - domainMin;
  const yFor = (value: number) => plot.top + ((domainMax - value) / domainRange) * plot.height;
  const flatSpacing = Math.min(170, plot.width / Math.max(model.groups.length + 1, 3));
  const conditionById = new Map(design?.conditions.map((condition) => [condition.id, condition]));
  const factorAIndex = new Map(factorA?.levels.map((level, index) => [level.id, index]));
  const factorBIndex = new Map(factorB?.levels.map((level, index) => [level.id, index]));
  const clusterWidth = factorA ? plot.width / factorA.levels.length : 0;
  const seriesSpacing = factorB
    ? Math.min(30, (clusterWidth * 0.68) / Math.max(factorB.levels.length, 2))
    : 0;
  const xForFactorALevel = (index: number) => plot.left + clusterWidth * (index + 0.5);
  const xForGroup = (index: number) => {
    const group = model.groups[index];
    const condition = group ? conditionById.get(group.conditionId) : undefined;
    const aIndex = factorA
      ? factorAIndex.get(condition?.factorLevels[factorA.id] ?? "")
      : undefined;
    const bIndex = factorB
      ? factorBIndex.get(condition?.factorLevels[factorB.id] ?? "")
      : undefined;
    if (aIndex !== undefined && bIndex !== undefined && factorB) {
      return xForFactorALevel(aIndex) + (bIndex - (factorB.levels.length - 1) / 2) * seriesSpacing;
    }
    const center = plot.left + plot.width / 2;
    return center + (index - (model.groups.length - 1) / 2) * flatSpacing;
  };
  const xForPoint = (groupIndex: number, pointIndex: number, count: number) =>
    xForGroup(groupIndex) + (pointIndex - (count - 1) / 2) * 12;
  const xForRawPoint = (groupIndex: number, pointIndex: number) =>
    xForGroup(groupIndex) + (((pointIndex * 37) % 101) / 100 - 0.5) * 54;
  const yTicks = createNiceTicks(domainMin, domainMax, 5, null);
  const palette = spec.appearance.palette;
  const errorBarKind =
    model.groups.find((group) => group.errorBar !== null)?.errorBarKind ?? "none";
  const errorBarLabel = errorBarKind === "sem" ? "SEM" : errorBarKind === "sd" ? "SD" : "—";

  return (
    <figure className="core-graph-figure">
      <div className="core-graph-heading">
        <div>
          <p className="overline">グラフプレビュー</p>
          <h3>
            {model.type === "paired_dot"
              ? `対応のある個別点（平均±${errorBarLabel}）`
              : model.type === "raw_and_replicate_summary"
                ? `cell / ROIと生物学的反復（平均±${errorBarLabel}）`
                : `個別点と平均±${errorBarLabel}`}
          </h3>
        </div>
        <GraphLegend model={model} palette={palette} design={design} />
      </div>
      <div className="core-graph-scroll">
        <svg
          ref={svgRef}
          className="core-graph-svg"
          style={{ minWidth: `${width}px` }}
          viewBox={`0 0 ${width} ${height}`}
          role="img"
          aria-label={`${model.yLabel}：${model.groups.length}条件のグラフ`}
          data-graph-type={model.type}
        >
          <title>{model.yLabel}</title>
          <desc>
            {model.type === "paired_dot"
              ? "同じ生物学的単位の値を線で結んでいます。"
              : model.type === "raw_and_replicate_summary"
                ? `薄い小点はcell/ROI、濃い大点は生物学的反復の要約値です。平均±${errorBarLabel}は生物学的反復間から計算しています。`
                : `生物学的反復の個別点と、平均±${errorBarLabel}を示しています。`}
          </desc>
          {yTicks.map((tick, index) => {
            const y = yFor(tick);
            return (
              <g key={`tick-${index}`}>
                <line x1={plot.left - 5} x2={plot.left} y1={y} y2={y} className="graph-tick" />
                <text x={plot.left - 9} y={y + 4} textAnchor="end" className="graph-axis-label">
                  {formatNumber(tick)}
                </text>
              </g>
            );
          })}
          <line
            x1={plot.left}
            x2={plot.left}
            y1={plot.top}
            y2={plot.bottom}
            className="graph-axis-line"
          />
          <line
            x1={plot.left}
            x2={plot.right}
            y1={plot.bottom}
            y2={plot.bottom}
            className="graph-axis-line"
          />
          <text
            x={15}
            y={plot.top + plot.height / 2}
            transform={`rotate(-90 15 ${plot.top + plot.height / 2})`}
            className="graph-axis-title"
            textAnchor="middle"
          >
            {model.yLabel}
          </text>
          {factorA?.levels.map((level, levelIndex) => (
            <text
              key={level.id}
              x={xForFactorALevel(levelIndex)}
              y={plot.bottom + 28}
              className="graph-condition-label"
              textAnchor="middle"
            >
              {level.label}
            </text>
          ))}
          {factorA?.levelGroups?.map((levelGroup) => {
            const memberIndexes = factorA.levels
              .map((level, index) => (level.groupId === levelGroup.id ? index : -1))
              .filter((index) => index >= 0);
            if (memberIndexes.length === 0) return null;
            const start = xForFactorALevel(Math.min(...memberIndexes)) - clusterWidth * 0.38;
            const end = xForFactorALevel(Math.max(...memberIndexes)) + clusterWidth * 0.38;
            const y = plot.bottom + 53;
            return (
              <g key={levelGroup.id} data-factor-level-group={levelGroup.id}>
                <path
                  d={`M ${start} ${y - 5} V ${y} H ${end} V ${y - 5}`}
                  className="graph-factor-group-bracket"
                />
                <text
                  x={(start + end) / 2}
                  y={y + 20}
                  className="graph-factor-group-label"
                  textAnchor="middle"
                >
                  {levelGroup.label}
                </text>
              </g>
            );
          })}
          {model.groups.map((group, groupIndex) => {
            const x = xForGroup(groupIndex);
            const condition = conditionById.get(group.conditionId);
            const seriesIndex = factorB
              ? (factorBIndex.get(condition?.factorLevels[factorB.id] ?? "") ?? groupIndex)
              : groupIndex;
            const meanHalfWidth = factorB ? Math.min(12, seriesSpacing * 0.34) : 25;
            return (
              <g key={group.conditionId}>
                {!factorA && (
                  <text
                    x={x}
                    y={plot.bottom + 25}
                    className="graph-condition-label"
                    textAnchor="middle"
                  >
                    {group.label}
                  </text>
                )}
                {group.errorBar !== null && (
                  <>
                    <line
                      x1={x}
                      x2={x}
                      y1={yFor(group.mean - group.errorBar)}
                      y2={yFor(group.mean + group.errorBar)}
                      className="graph-error-line"
                    />
                    <line
                      x1={x - 8}
                      x2={x + 8}
                      y1={yFor(group.mean - group.errorBar)}
                      y2={yFor(group.mean - group.errorBar)}
                      className="graph-error-cap"
                    />
                    <line
                      x1={x - 8}
                      x2={x + 8}
                      y1={yFor(group.mean + group.errorBar)}
                      y2={yFor(group.mean + group.errorBar)}
                      className="graph-error-cap"
                    />
                  </>
                )}
                <line
                  x1={x - meanHalfWidth}
                  x2={x + meanHalfWidth}
                  y1={yFor(group.mean)}
                  y2={yFor(group.mean)}
                  className="graph-mean-line"
                />
                {group.rawValues.map((value, pointIndex) => (
                  <circle
                    key={`raw-${value.observationId}`}
                    cx={xForRawPoint(groupIndex, pointIndex)}
                    cy={yFor(value.value)}
                    r={Math.max(2, spec.appearance.pointSize * 0.48)}
                    fill={palette[seriesIndex % palette.length]}
                    opacity={0.2}
                    className="graph-raw-point"
                    data-graph-raw-point={value.observationId}
                    aria-label={`${group.label} cell/ROI: ${formatNumber(value.value)}`}
                  />
                ))}
                {group.values.map((value, pointIndex) => (
                  <circle
                    key={value.observationId}
                    cx={xForPoint(groupIndex, pointIndex, group.values.length)}
                    cy={yFor(value.value)}
                    r={spec.appearance.pointSize}
                    fill={palette[seriesIndex % palette.length]}
                    opacity={spec.appearance.opacity}
                    className="graph-point"
                    data-graph-point={value.observationId}
                    aria-label={`${group.label}: ${formatNumber(value.value)}`}
                  />
                ))}
              </g>
            );
          })}
          {model.connections.map((connection) => {
            const fromGroup = model.groups.findIndex(
              (group) => group.conditionId === connection.from.conditionId,
            );
            const toGroup = model.groups.findIndex(
              (group) => group.conditionId === connection.to.conditionId,
            );
            const fromX = xForPoint(fromGroup, connection.pointIndex, connection.pointCount);
            const toX = xForPoint(toGroup, connection.pointIndex, connection.pointCount);
            return (
              <line
                key={`${connection.pairId}-${connection.segmentIndex}`}
                x1={fromX}
                x2={toX}
                y1={yFor(connection.from.value)}
                y2={yFor(connection.to.value)}
                className="graph-paired-line"
                data-paired-line={connection.pairId}
              />
            );
          })}
        </svg>
      </div>
      <figcaption>
        {model.type === "paired_dot"
          ? `線は同じ生物学的単位の対応を示します。点は個々の値、横線は平均、エラーバーは${errorBarLabel}です。`
          : model.type === "raw_and_replicate_summary"
            ? `薄い小点はcell/ROI（統計上のnではありません）、濃い点は生物学的反復の要約値です。横線と${errorBarLabel}は生物学的反復の要約値だけから計算しています。`
            : `点は生物学的反復、横線は平均、エラーバーは${errorBarLabel}（平均±${errorBarLabel}）です。`}
      </figcaption>
    </figure>
  );
}

function InlineCorrelationGraph({
  model,
  spec,
  svgRef,
}: {
  model: CoreGraphModel;
  spec: GraphSpec;
  svgRef?: RefObject<SVGSVGElement | null>;
}) {
  const points = model.scatterPoints ?? [];
  const width = 640;
  const height = 450;
  const margin = { top: 28, right: 28, bottom: 76, left: 82 };
  const plot = createPlotRectangle(width, height, margin);
  const xValues = points.map((point) => point.x);
  const yValues = points.map((point) => point.y);
  const extent = (values: number[]) => {
    const minimum = Math.min(...values);
    const maximum = Math.max(...values);
    const range = maximum - minimum;
    const padding = range > 0 ? range * 0.08 : Math.max(Math.abs(maximum) * 0.08, 1);
    return [minimum - padding, maximum + padding] as const;
  };
  const [xMin, xMax] = extent(xValues);
  const [yMin, yMax] = extent(yValues);
  const xRange = xMax - xMin;
  const yRange = yMax - yMin;
  const xFor = (value: number) => plot.left + ((value - xMin) / xRange) * plot.width;
  const yFor = (value: number) => plot.top + ((yMax - value) / yRange) * plot.height;
  const xTicks = createNiceTicks(xMin, xMax, 5, null);
  const yTicks = createNiceTicks(yMin, yMax, 5, null);

  return (
    <figure className="core-graph-figure correlation-graph-figure">
      <div className="core-graph-heading">
        <div>
          <p className="overline">散布図</p>
          <h3>同じ実験単位のX–Y対応</h3>
        </div>
      </div>
      <div className="core-graph-scroll">
        <svg
          ref={svgRef}
          className="core-graph-svg correlation-graph-svg"
          style={{ minWidth: `${width}px` }}
          viewBox={`0 0 ${width} ${height}`}
          role="img"
          aria-label={`${spec.axes.xLabel}と${spec.axes.yLabel}の散布図`}
          data-graph-type="scatter"
        >
          <title>
            {spec.axes.xLabel}と{spec.axes.yLabel}の散布図
          </title>
          <desc>各点は同じ実験単位から得た1つのX–Yペアです。</desc>
          {xTicks.map((tick, index) => (
            <g key={`x-tick-${index}`}>
              <line
                x1={xFor(tick)}
                x2={xFor(tick)}
                y1={plot.top}
                y2={plot.bottom}
                className="graph-grid-line"
              />
              <text
                x={xFor(tick)}
                y={plot.bottom + 25}
                textAnchor="middle"
                className="graph-axis-label"
              >
                {formatNumber(tick)}
              </text>
            </g>
          ))}
          {yTicks.map((tick, index) => (
            <g key={`y-tick-${index}`}>
              <line
                x1={plot.left}
                x2={plot.right}
                y1={yFor(tick)}
                y2={yFor(tick)}
                className="graph-grid-line"
              />
              <text
                x={plot.left - 11}
                y={yFor(tick) + 4}
                textAnchor="end"
                className="graph-axis-label"
              >
                {formatNumber(tick)}
              </text>
            </g>
          ))}
          <line
            x1={plot.left}
            x2={plot.left}
            y1={plot.top}
            y2={plot.bottom}
            className="graph-axis-line"
          />
          <line
            x1={plot.left}
            x2={plot.right}
            y1={plot.bottom}
            y2={plot.bottom}
            className="graph-axis-line"
          />
          <text
            x={plot.left + plot.width / 2}
            y={height - 18}
            textAnchor="middle"
            className="graph-axis-title"
          >
            {spec.axes.xLabel}
          </text>
          <text
            x={18}
            y={plot.top + plot.height / 2}
            transform={`rotate(-90 18 ${plot.top + plot.height / 2})`}
            textAnchor="middle"
            className="graph-axis-title"
          >
            {spec.axes.yLabel}
          </text>
          {points.map((point) => (
            <circle
              key={point.pairId}
              cx={xFor(point.x)}
              cy={yFor(point.y)}
              r={Math.max(3.5, spec.appearance.pointSize)}
              fill={spec.appearance.palette[0]}
              opacity={spec.appearance.opacity}
              className="graph-point correlation-graph-point"
              data-graph-point={point.pairId}
              aria-label={`ペア ${point.pairId}: ${spec.axes.xLabel} ${formatNumber(point.x)}、${spec.axes.yLabel} ${formatNumber(point.y)}`}
            />
          ))}
        </svg>
      </div>
      <figcaption>
        各点は同じ実験単位から得た1つのX–Yペアです。相関は関連を示しますが、因果関係を示すものではありません。
      </figcaption>
    </figure>
  );
}

function exportFilenamePart(value: string): string {
  return value.replace(/[^a-zA-Z0-9._-]+/g, "-").replace(/^-+|-+$/g, "") || "graph";
}

function GraphExportPanel({
  svgRef,
  graphSpec,
  graphModel,
  request,
  conditionLabels,
}: {
  svgRef: RefObject<SVGSVGElement | null>;
  graphSpec: GraphSpec;
  graphModel: CoreGraphModel;
  request?: AnalysisEngineRequest;
  conditionLabels?: ReadonlyArray<{ id: string; label: string }>;
}) {
  const [status, setStatus] = useState<"idle" | "copied" | "downloaded" | "failed">("idle");

  const saveSvg = () => {
    if (!svgRef.current) {
      setStatus("failed");
      return;
    }
    const saved = downloadTextFile(
      serializeGraphSvg(svgRef.current),
      `${exportFilenamePart(graphSpec.id)}.svg`,
      "image/svg+xml;charset=utf-8",
    );
    setStatus(saved ? "downloaded" : "failed");
  };

  const copySvg = async () => {
    if (!svgRef.current) {
      setStatus("failed");
      return;
    }
    setStatus((await copyText(serializeGraphSvg(svgRef.current))) ? "copied" : "failed");
  };

  const saveCsv = () => {
    if (!request) return;
    const saved = downloadTextFile(
      serializeAnalyzedDataCsv(
        request.observations,
        graphModel,
        graphSpec.axes.yLabel,
        conditionLabels,
      ),
      `${exportFilenamePart(request.requestId)}-analyzed-data.csv`,
      "text/csv;charset=utf-8",
    );
    setStatus(saved ? "downloaded" : "failed");
  };

  return (
    <aside className="graph-export-panel" aria-label="グラフのエクスポート" data-graph-export>
      <div className="graph-export-heading">
        <div>
          <p className="overline">論文用エクスポート</p>
          <h3>グラフと解析済みデータ</h3>
        </div>
        <span className="graph-inspector-badge">SVG / CSV</span>
      </div>
      <p className="graph-export-note">
        現在の外観（点・線・エラーバー・ラベル）をそのまま出力します。解析結果と入力データは変更されません。
      </p>
      <div className="graph-export-actions">
        <button type="button" onClick={saveSvg}>
          SVGをダウンロード
        </button>
        <button type="button" onClick={copySvg}>
          SVGをコピー
        </button>
        {request && (
          <button type="button" onClick={saveCsv}>
            解析済みデータCSVをダウンロード
          </button>
        )}
      </div>
      {status === "copied" && (
        <p className="graph-export-status" role="status">
          SVGをクリップボードにコピーしました。
        </p>
      )}
      {status === "downloaded" && (
        <p className="graph-export-status" role="status">
          ダウンロードを開始しました。
        </p>
      )}
      {status === "failed" && (
        <p className="graph-export-status graph-export-status--error" role="alert">
          エクスポートできませんでした。ブラウザのダウンロード／コピー権限を確認してください。
        </p>
      )}
    </aside>
  );
}

function MethodsPanel({
  design,
  recommendation,
  request,
  result,
  graphSpec,
  nestedSummary,
}: {
  design: ExperimentDesign;
  recommendation: AnalysisRecommendation;
  request: AnalysisEngineRequest;
  result: AnalysisEngineResult;
  graphSpec: GraphSpec | null;
  nestedSummary?: AnalysisResultViewProps["nestedSummary"];
}) {
  const [copyState, setCopyState] = useState<"idle" | "copied" | "failed">("idle");
  const text = generateMethodsText({
    design,
    recommendation,
    request,
    result,
    graphSpec,
    nestedSummary,
  });

  const copy = async () => {
    const copied = await copyMethodsText(text);
    setCopyState(copied ? "copied" : "failed");
  };

  return (
    <details className="methods-panel" open>
      <summary>解析方法（日本語）</summary>
      <div className="methods-panel-body">
        <div className="methods-panel-heading">
          <p>実行済みのデザイン・解析・結果から再現可能な記載を生成します。</p>
          <button className="methods-copy-button" type="button" onClick={copy}>
            解析方法をコピー
          </button>
        </div>
        <pre className="methods-text" aria-label="解析方法本文">
          {text}
        </pre>
        {copyState === "copied" && (
          <p className="methods-copy-status" role="status">
            解析方法をクリップボードにコピーしました。
          </p>
        )}
        {copyState === "failed" && (
          <p className="methods-copy-status methods-copy-status--error" role="alert">
            コピーできませんでした。本文を選択してコピーしてください。
          </p>
        )}
      </div>
    </details>
  );
}

export function AnalysisResultView({
  result,
  recommendation,
  graphSpec,
  graphModel,
  design,
  request,
  presentation = "all",
  onGraphSpecChange,
  nestedSummary,
}: AnalysisResultViewProps) {
  const estimate = result.estimates[0];
  const test = result.tests[0];
  const isSuccessful = result.status === "ok";
  const messages = [
    ...result.diagnostics.map((diagnostic) => ({ ...diagnostic, kind: "diagnostic" })),
    ...result.warnings.map((warning) => ({ ...warning, kind: "warning" })),
  ];
  const showNumeric = presentation !== "graph";
  const showGraph = presentation !== "numeric";
  const graphSvgRef = useRef<SVGSVGElement | null>(null);

  return (
    <section
      className={`analysis-result-section ${isSuccessful ? "" : "analysis-result-section--error"}`}
    >
      {showNumeric && (
        <div className="section-heading-row">
          <div>
            <p className="overline">解析結果</p>
            <h2>{resultStatusLabel(result.status)}</h2>
          </div>
          <span className="section-hint">ローカル実行</span>
        </div>
      )}

      {showNumeric && (
        <article className="analysis-result-card" aria-labelledby="analysis-result-heading">
          <div className="analysis-result-header">
            <div>
              <span className="recommendation-kicker">実行した推奨解析</span>
              <h3 id="analysis-result-heading">{templateLabel(recommendation.templateId)}</h3>
              <p>{methodLabel(recommendation.recommendedMethod)}</p>
            </div>
            <span className="analysis-status-chip">{resultStatusChipLabel(result.status)}</span>
          </div>

          {isSuccessful &&
            (recommendation.templateId === "D03" || recommendation.templateId === "D04") &&
            design && (
              <MultiGroupResultSummary
                templateId={recommendation.templateId}
                design={design}
                estimates={result.estimates}
                tests={result.tests}
              />
            )}

          {isSuccessful && recommendation.templateId === "D05" && design && (
            <FactorialResultSummary
              design={design}
              estimates={result.estimates}
              tests={result.tests}
            />
          )}

          {isSuccessful && recommendation.templateId === "D09" && (
            <CorrelationResultSummary recommendation={recommendation} result={result} />
          )}

          {isSuccessful &&
            recommendation.templateId !== "D03" &&
            recommendation.templateId !== "D04" &&
            recommendation.templateId !== "D05" &&
            recommendation.templateId !== "D09" && (
              <dl className="analysis-metrics">
                <div>
                  <dt>推定値</dt>
                  <dd>
                    {estimate
                      ? `${estimateLabel(estimate.name)}：${formatNumber(estimate.value)}`
                      : "—"}
                  </dd>
                  <small>
                    {estimate?.confidenceInterval
                      ? `${formatConfidenceLevel(estimate.confidenceInterval.level)}：${formatNumber(estimate.confidenceInterval.lower)}～${formatNumber(estimate.confidenceInterval.upper)}`
                      : "信頼区間なし"}
                  </small>
                </div>
                <div>
                  <dt>検定統計量</dt>
                  <dd>{test ? `${test.statisticName} = ${formatNumber(test.statistic)}` : "—"}</dd>
                  <small>自由度：{formatDegreesOfFreedom(test?.degreesOfFreedom ?? null)}</small>
                </div>
                <div>
                  <dt>p値</dt>
                  <dd>{test ? formatPValue(test.pValue) : "—"}</dd>
                  <small>
                    {test?.adjustedPValue === null || test?.adjustedPValue === undefined
                      ? "調整なし"
                      : `調整済み：${formatPValue(test.adjustedPValue)}`}
                  </small>
                </div>
                <div>
                  <dt>効果量</dt>
                  <dd>{test?.effectSizeName ?? "定義なし"}</dd>
                  <small>
                    {test?.effectSize === null || test?.effectSize === undefined
                      ? "—"
                      : formatNumber(test.effectSize)}
                  </small>
                </div>
              </dl>
            )}

          {!isSuccessful && (
            <p className="analysis-error-copy">
              解析を完了できませんでした。入力したデータは保持されています。
            </p>
          )}

          {messages.length > 0 && (
            <div className="analysis-messages" role={isSuccessful ? "status" : "alert"}>
              {messages.map((message, index) => (
                <p key={`${message.code}-${index}`}>
                  <strong>{message.kind === "warning" ? "注意" : "診断"}：</strong>{" "}
                  {message.message}
                </p>
              ))}
            </div>
          )}

          <div className="engine-version">
            <span>
              エンジン：{result.engine.name} {result.engine.version}
            </span>
            <span>
              パッケージ：{" "}
              {Object.entries(result.engine.packages)
                .map(([name, version]) => `${name} ${version}`)
                .join(", ") || "—"}
            </span>
          </div>
        </article>
      )}

      {showNumeric && design && request && (
        <MethodsPanel
          design={design}
          recommendation={recommendation}
          request={request}
          result={result}
          graphSpec={graphSpec}
          nestedSummary={nestedSummary}
        />
      )}

      {showGraph && isSuccessful && graphSpec && graphModel && (
        <>
          <GraphInspector spec={graphSpec} onChange={onGraphSpecChange} />
          <GraphExportPanel
            svgRef={graphSvgRef}
            graphSpec={graphSpec}
            graphModel={graphModel}
            request={request}
            conditionLabels={design?.conditions}
          />
          {graphModel.type === "scatter" ? (
            <InlineCorrelationGraph spec={graphSpec} model={graphModel} svgRef={graphSvgRef} />
          ) : (
            <InlineCoreGraph
              spec={graphSpec}
              model={graphModel}
              design={design}
              svgRef={graphSvgRef}
            />
          )}
        </>
      )}
    </section>
  );
}

import { useRef, useState } from "react";
import type { AnalysisEngineRequest, AnalysisEngineResult } from "@lsaa/analysis-contracts";
import { GraphExportActions, type GraphExportFeedback } from "./GraphExportActions";

export function ExecutedMeanDifferencePlot({
  request,
  result,
  conditions,
}: Readonly<{
  request: AnalysisEngineRequest | null;
  result: AnalysisEngineResult;
  conditions: readonly Readonly<{ id: string; label: string }>[];
}>) {
  const svgRef = useRef<SVGSVGElement | null>(null);
  const [feedback, setFeedback] = useState<GraphExportFeedback | null>(null);
  // Only display the existing D01 result contract; never estimate an interval in the renderer.
  if (
    !request ||
    request.protocolVersion !== "0.1.0" ||
    result.protocolVersion !== "0.1.0" ||
    request.templateId !== "D01" ||
    request.templateVersion !== "0.1.0" ||
    !["welch_t", "student_t"].includes(request.method) ||
    result.status !== "ok" ||
    result.requestId !== request.requestId ||
    request.options.alternative !== "two_sided" ||
    request.options.multiplicityMethod !== null
  )
    return null;
  const [first, second] = request.contrastConditionIds;
  const units = request.observations.map((observation) => observation.experimentalUnitId);
  const estimates = result.estimates.filter((estimate) => estimate.name === "mean_difference");
  const estimate = estimates.length === 1 ? estimates[0] : null;
  const ci = estimate?.confidenceInterval;
  if (
    first === second ||
    !estimate ||
    !ci ||
    ci.level !== request.options.confidenceLevel ||
    new Set(units).size !== units.length ||
    request.observations.some(
      (observation) => observation.conditionId !== first && observation.conditionId !== second,
    ) ||
    !request.observations.some((observation) => observation.conditionId === first) ||
    !request.observations.some((observation) => observation.conditionId === second) ||
    ![estimate.value, ci.lower, ci.upper].every(Number.isFinite) ||
    ci.lower > estimate.value ||
    estimate.value > ci.upper ||
    result.tests.some((test) => test.adjustedPValue !== null)
  )
    return null;
  const label = (id: string) => {
    const candidates = conditions.filter((condition) => condition.id === id);
    return candidates.length === 1 ? `${candidates[0]!.label} (${id})` : id;
  };
  const direction = `${label(first)} − ${label(second)}`;
  const low = Math.min(0, ci.lower),
    high = Math.max(0, ci.upper);
  const pad = (high - low || 1) * 0.12;
  const x = (value: number) => 60 + ((value - (low - pad)) / (high - low + pad * 2)) * 560;
  const values = `平均差 ${estimate.value}、${ci.level * 100}% CI ${ci.lower}–${ci.upper}`;
  return (
    <section aria-label="実行済み平均差と信頼区間">
      <h4>平均差と信頼区間</h4>
      <p>{direction}</p>
      <p>{request.method} · 両側 · 多重性調整なし · 解析値の尺度</p>
      <svg
        ref={svgRef}
        role="img"
        aria-label="実行済み平均差CIプロット"
        viewBox="0 0 680 220"
        width="680"
        height="220"
        style={{ maxWidth: "100%", height: "auto" }}
      >
        <title>
          {direction}: {values}
        </title>
        <rect width="680" height="220" fill="white" />
        <text x="340" y="25" textAnchor="middle" fontSize="14">
          平均差 ({request.method}, {ci.level * 100}% CI)
        </text>
        <line x1={x(0)} x2={x(0)} y1="45" y2="145" stroke="#666" strokeDasharray="4 4" />
        <line
          data-effect-ci="interval"
          data-lower={ci.lower}
          data-upper={ci.upper}
          x1={x(ci.lower)}
          x2={x(ci.upper)}
          y1="95"
          y2="95"
          stroke="#274f70"
          strokeWidth="3"
        />
        {[ci.lower, ci.upper].map((value, index) => (
          <line
            key={index}
            x1={x(value)}
            x2={x(value)}
            y1="86"
            y2="104"
            stroke="#274f70"
            strokeWidth="2"
          />
        ))}
        <circle
          data-effect-ci="estimate"
          data-value={estimate.value}
          cx={x(estimate.value)}
          cy="95"
          r="6"
          fill="#274f70"
        />
        <line x1="60" x2="620" y1="145" y2="145" stroke="#111" />
        {[low, (low + high) / 2, high].map((value, index) => (
          <text key={index} x={x(value)} y="165" textAnchor="middle" fontSize="12">
            {Number(value.toPrecision(4))}
          </text>
        ))}
        <text x="340" y="192" textAnchor="middle" fontSize="12">
          {values}
        </text>
        <text x="340" y="212" textAnchor="middle" fontSize="11">
          {first} − {second} · 解析値の尺度
        </text>
      </svg>
      <GraphExportActions
        svgRef={svgRef}
        fileStem="executed-mean-difference"
        onFeedback={setFeedback}
      />
      {feedback ? (
        <p role={feedback.kind === "error" ? "alert" : "status"}>{feedback.text}</p>
      ) : null}
    </section>
  );
}

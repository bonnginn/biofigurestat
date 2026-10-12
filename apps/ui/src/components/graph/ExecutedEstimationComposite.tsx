import { useLayoutEffect, useRef, useState } from "react";
import type { AnalysisEngineRequest, AnalysisEngineResult } from "@lsaa/analysis-contracts";
import { continuousSummary } from "../../app/experimentDraft";
import { ExecutedMeanDifferencePlot } from "./ExecutedMeanDifferencePlot";
import { GraphExportActions, type GraphExportFeedback } from "./GraphExportActions";

export function ExecutedEstimationComposite({
  request,
  result,
  conditions,
  nByCondition,
  valueUnit,
  unitLabel,
}: Readonly<{
  request: AnalysisEngineRequest | null;
  result: AnalysisEngineResult;
  conditions: readonly Readonly<{ id: string; label: string }>[];
  nByCondition: readonly Readonly<{ conditionId: string; n: number }>[];
  valueUnit?: string | null;
  unitLabel?: string;
}>) {
  const effectHolder = useRef<HTMLDivElement | null>(null);
  const svgRef = useRef<SVGSVGElement | null>(null);
  const [effectMarkup, setEffectMarkup] = useState("");
  const [feedback, setFeedback] = useState<GraphExportFeedback | null>(null);
  useLayoutEffect(() => {
    // Reuse the completed effect renderer's own escaped SVG, without reimplementing its CI.
    setEffectMarkup(effectHolder.current?.querySelector("svg")?.innerHTML ?? "");
    setFeedback(null);
  }, [request, result, conditions]);
  const eligible =
    request?.protocolVersion === "0.1.0" &&
    request.options.confidenceLevel === 0.95 &&
    result.estimates.filter((item) => item.name === "mean_difference").length === 1 &&
    result.estimates.find((item) => item.name === "mean_difference")?.confidenceInterval?.level ===
      0.95;
  const groups = eligible
    ? request.contrastConditionIds.map((id) => {
        const observations = request.observations.filter((item) => item.conditionId === id);
        const metadata = nByCondition.filter((item) => item.conditionId === id);
        const labels = conditions.filter((item) => item.id === id);
        return {
          id,
          observations,
          n: metadata.length === 1 ? metadata[0]!.n : null,
          label: labels.length === 1 ? labels[0]!.label : id,
          summary: continuousSummary(observations.map((item) => item.value)),
        };
      })
    : [];
  const safe =
    eligible &&
    effectMarkup &&
    groups.length === 2 &&
    groups.every(
      (group) =>
        group.n !== null &&
        group.n === group.observations.length &&
        group.observations.every((item) => Number.isFinite(item.value)),
    );
  const unit = valueUnit?.trim() || "単位未記録（解析値の尺度）";
  const values = groups.flatMap((group) => group.observations.map((item) => item.value));
  const low = values.length ? Math.min(...values) : 0,
    high = values.length ? Math.max(...values) : 1;
  const pad = (high - low || 1) * 0.15;
  const y = (value: number) => 340 - ((value - (low - pad)) / (high - low + 2 * pad)) * 210;
  return (
    <section aria-label="実行対象2群の推定図">
      <div hidden ref={effectHolder}>
        <ExecutedMeanDifferencePlot request={request} result={result} conditions={conditions} />
      </div>
      <h4>実行対象2群と平均差・95%CI</h4>
      {!safe ? (
        <p role="note">
          表示条件外：実行対象2群・記録済み95%CI・解析単位nの一致が必要です。CIの再計算や付け替えは行いません。
        </p>
      ) : (
        <>
          <svg
            ref={svgRef}
            role="img"
            aria-label="実行対象2群と平均差95%CIの合成図"
            viewBox="0 0 1120 480"
            width="1120"
            height="480"
            fontFamily="Arial, sans-serif"
            style={{ maxWidth: "100%", height: "auto" }}
          >
            <title>
              {groups[0]!.label} − {groups[1]!.label}: 実行対象2群の点と記録済み平均差95%CI
            </title>
            <rect width="1120" height="480" fill="white" />
            <text x="560" y="35" textAnchor="middle" fontSize="22" fill="#111">
              実行対象2群の推定図
            </text>
            <text x="280" y="78" textAnchor="middle" fontSize="17">
              実験単位の値（{unitLabel || "実験単位"}）
            </text>
            <text x="825" y="78" textAnchor="middle" fontSize="17">
              平均差・95%個別CI
            </text>
            <line x1="565" x2="565" y1="90" y2="375" stroke="#ddd" />
            <line x1="85" x2="85" y1="115" y2="340" stroke="#111" />
            <line x1="85" x2="510" y1="340" y2="340" stroke="#111" />
            {[low, (low + high) / 2, high].map((value, index) => (
              <text key={index} x="75" y={y(value) + 4} textAnchor="end" fontSize="13">
                {Number(value.toPrecision(4))}
              </text>
            ))}
            {groups.map((group, index) => {
              const x = 210 + index * 200;
              return (
                <g key={group.id} data-composite-group={group.id}>
                  {group.observations.map((item, pointIndex) => (
                    <circle
                      key={item.observationId}
                      data-unit-id={item.experimentalUnitId}
                      data-value={item.value}
                      cx={x + ((pointIndex % 7) - 3) * 7}
                      cy={y(item.value)}
                      r="5"
                      fill={index === 0 ? "#4477aa" : "#bb5566"}
                    >
                      <title>
                        {group.label}: {item.value} ({item.experimentalUnitId})
                      </title>
                    </circle>
                  ))}
                  {group.summary.mean !== null ? (
                    <line
                      data-group-summary="mean"
                      x1={x - 30}
                      x2={x + 30}
                      y1={y(group.summary.mean)}
                      y2={y(group.summary.mean)}
                      stroke="#111"
                      strokeWidth="3"
                    />
                  ) : null}
                  <text x={x} y="366" textAnchor="middle" fontSize="15">
                    {group.label}
                  </text>
                  <text x={x} y="388" textAnchor="middle" fontSize="14">
                    n={group.n}
                  </text>
                </g>
              );
            })}
            <svg
              x="585"
              y="130"
              width="510"
              height="200"
              viewBox="0 0 680 220"
              dangerouslySetInnerHTML={{ __html: effectMarkup }}
            />
            <text x="560" y="418" textAnchor="middle" fontSize="14">
              単位: {unit} · 差の方向: {groups[0]!.label} − {groups[1]!.label}
            </text>
            <text x="560" y="444" textAnchor="middle" fontSize="14">
              {request!.method === "welch_t" ? "Welchの2標本t検定" : "Studentの2標本t検定"} · 両側 ·
              95%個別CI（多重性未調整） · 左の横線: 群平均
            </text>
            <text x="560" y="466" textAnchor="middle" fontSize="12">
              各点は解析に用いた実験単位の値
            </text>
          </svg>
          <GraphExportActions
            svgRef={svgRef}
            fileStem="executed-estimation-composite"
            onFeedback={setFeedback}
          />
          {feedback ? (
            <p role={feedback.kind === "error" ? "alert" : "status"}>{feedback.text}</p>
          ) : null}
        </>
      )}
    </section>
  );
}

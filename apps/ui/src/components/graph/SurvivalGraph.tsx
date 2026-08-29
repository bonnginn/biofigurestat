import { forwardRef } from "react";
import type { KaplanMeierGraphModel } from "@lsaa/graph-spec";
import { createNiceTicks } from "./graphLayout";
import { createMinorTicks } from "./graphSemantics";

export const DEFAULT_SURVIVAL_COLORS = [
  "#4477AA",
  "#CC6677",
  "#228833",
  "#AA3377",
  "#66CCEE",
] as const;

export const SurvivalGraph = forwardRef<
  SVGSVGElement,
  {
    model: KaplanMeierGraphModel;
    timeLabel?: string;
    probabilityLabel?: string;
    palette?: readonly string[];
    annotation?: string;
    countSemantics?: "biological_n" | "records";
  }
>(function SurvivalGraph(
  {
    model,
    timeLabel = "Follow-up time",
    probabilityLabel = "Survival probability",
    palette = DEFAULT_SURVIVAL_COLORS,
    annotation,
    countSemantics = "biological_n",
  },
  ref,
) {
  const colors = palette.length > 0 ? palette : DEFAULT_SURVIVAL_COLORS;
  const width = 820,
    plotHeight = 410,
    left = 80,
    top = 30,
    right = 30;
  const axisY = plotHeight - 10;
  const riskHeadingY = plotHeight + 76;
  const riskTimeHeaderY = riskHeadingY + 24;
  const riskGroupStartY = riskTimeHeaderY + 26;
  const riskRows = model.groups.length * 24 + 132;
  const height = plotHeight + riskRows;
  const maxTime = Math.max(
    ...model.groups.flatMap((group) => group.steps.map(({ time }) => time)),
    1,
  );
  const x = (time: number) => left + (time / maxTime) * (width - left - right);
  const y = (survival: number) => top + (1 - survival) * (plotHeight - top - 40);
  const stepPath = (steps: readonly Readonly<{ time: number; survival: number }>[]) => {
    let path = `M ${x(0)} ${y(1)}`;
    for (let index = 1; index < steps.length; index += 1) {
      const previous = steps[index - 1]!,
        current = steps[index]!;
      path += ` H ${x(current.time)} V ${y(current.survival)}`;
      if (current.survival === previous.survival) path += ` H ${x(current.time)}`;
    }
    return path;
  };
  const riskTimes = [
    ...new Set(model.groups.flatMap((group) => group.numberAtRisk.map(({ time }) => time))),
  ].sort((a, b) => a - b);
  const yTicks = [0, 0.25, 0.5, 0.75, 1];
  const xTicks = createNiceTicks(0, maxTime, 6, null);
  const xMinorTicks = createMinorTicks(xTicks, 0, maxTime, 5);
  const yMinorTicks = createMinorTicks(yTicks, 0, 1, 5);
  return (
    <svg
      ref={ref}
      role="img"
      aria-label="Kaplan–Meier survival graph"
      viewBox={`0 0 ${width} ${height}`}
      width={width}
      height={height}
    >
      <line x1={left} y1={top} x2={left} y2={axisY} stroke="#111" />
      <line x1={left} y1={axisY} x2={width - right} y2={axisY} stroke="#111" />
      {yMinorTicks.map((tick) => (
        <line
          key={`y.minor.${tick}`}
          x1={left}
          x2={left - 3.5}
          y1={y(tick)}
          y2={y(tick)}
          stroke="#111"
          data-axis-tick="y-minor"
          data-tick-direction="outside"
          data-tick-value={tick}
        />
      ))}
      {xMinorTicks.map((tick) => (
        <line
          key={`x.minor.${tick}`}
          x1={x(tick)}
          x2={x(tick)}
          y1={axisY}
          y2={axisY + 3.5}
          stroke="#111"
          data-axis-tick="x-minor"
          data-tick-direction="outside"
          data-tick-value={tick}
        />
      ))}
      {yTicks.map((tick) => (
        <g key={tick}>
          <line
            x1={left}
            x2={left - 5}
            y1={y(tick)}
            y2={y(tick)}
            stroke="#111"
            data-axis-tick="y"
            data-tick-direction="outside"
            data-tick-value={tick}
          />
          <text
            x={left - 10}
            y={y(tick) + 4}
            textAnchor="end"
            fontSize="12"
            data-axis-tick-label="y"
            data-tick-value={tick}
          >
            {tick.toFixed(2).replace(/0+$/, "").replace(/\.$/, "")}
          </text>
        </g>
      ))}
      {xTicks.map((tick) => (
        <g key={`x.${tick}`}>
          <line
            x1={x(tick)}
            x2={x(tick)}
            y1={axisY}
            y2={axisY + 6}
            stroke="#111"
            data-axis-tick="x"
            data-tick-direction="outside"
            data-tick-value={tick}
          />
          <text
            x={x(tick)}
            y={axisY + 22}
            textAnchor="middle"
            fontSize="12"
            data-axis-tick-label="x"
            data-tick-value={tick}
          >
            {tick.toFixed(3).replace(/0+$/, "").replace(/\.$/, "")}
          </text>
        </g>
      ))}
      <text
        x={18}
        y={plotHeight / 2}
        transform={`rotate(-90 18 ${plotHeight / 2})`}
        textAnchor="middle"
      >
        {probabilityLabel}
      </text>
      <text x={(left + width - right) / 2} y={plotHeight + 48} textAnchor="middle">
        {timeLabel}
      </text>
      {annotation ? (
        <text
          x={left + 8}
          y={18}
          fontSize="13"
          fontWeight="600"
          data-graph-layer="statistics-annotation"
        >
          {annotation}
        </text>
      ) : null}
      {model.groups.map((group, index) => (
        <g key={group.conditionId} data-condition-series={group.conditionId}>
          <path
            d={stepPath(group.steps)}
            fill="none"
            stroke={colors[index % colors.length] ?? DEFAULT_SURVIVAL_COLORS[0]}
            strokeWidth="2.5"
            data-condition-id={group.conditionId}
            data-graph-layer="survival-curve"
          />
          {group.censorMarks.map((mark) => (
            <g
              key={`${mark.experimentalUnitId}.${mark.time}`}
              stroke={colors[index % colors.length] ?? DEFAULT_SURVIVAL_COLORS[0]}
              strokeWidth="2"
            >
              <line
                x1={x(mark.time) - 4}
                x2={x(mark.time) + 4}
                y1={y(mark.survival)}
                y2={y(mark.survival)}
              />
              <line
                x1={x(mark.time)}
                x2={x(mark.time)}
                y1={y(mark.survival) - 4}
                y2={y(mark.survival) + 4}
              />
            </g>
          ))}
          <g data-graph-layer="series-legend" data-series-id={group.conditionId}>
            <line
              x1={width - 210}
              x2={width - 180}
              y1={45 + index * 22}
              y2={45 + index * 22}
              stroke={colors[index % colors.length] ?? DEFAULT_SURVIVAL_COLORS[0]}
              strokeWidth="3"
            />
            <text x={width - 172} y={50 + index * 22} fontSize="13">
              {group.label} ({countSemantics === "biological_n" ? "n" : "records"}={group.n})
            </text>
          </g>
        </g>
      ))}
      <text x={left} y={riskHeadingY} fontWeight="600" data-graph-layer="risk-table-title">
        {countSemantics === "biological_n"
          ? "Number at risk"
          : "Records at risk (not biological n)"}
      </text>
      {riskTimes.map((time) => (
        <text
          key={time}
          x={x(time)}
          y={riskTimeHeaderY}
          textAnchor="middle"
          fontSize="11"
          data-graph-layer="risk-time-header"
          data-risk-time={time}
        >
          {time}
        </text>
      ))}
      {model.groups.map((group, index) => (
        <g key={`risk.${group.conditionId}`}>
          <text
            x={left - 8}
            y={riskGroupStartY + index * 24}
            textAnchor="end"
            fontSize="12"
            data-graph-layer="risk-group-label"
            data-series-id={group.conditionId}
          >
            {group.label}
          </text>
          {riskTimes.map((time) => (
            <text
              key={time}
              x={x(time)}
              y={riskGroupStartY + index * 24}
              textAnchor="middle"
              fontSize="12"
              data-graph-layer="risk-count"
              data-series-id={group.conditionId}
              data-risk-time={time}
            >
              {group.numberAtRisk.find((entry) => entry.time === time)?.count ??
                group.numberAtRisk.find((entry) => entry.time >= time)?.count ??
                0}
            </text>
          ))}
        </g>
      ))}
    </svg>
  );
});

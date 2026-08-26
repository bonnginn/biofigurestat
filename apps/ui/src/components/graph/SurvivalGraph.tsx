import { forwardRef } from "react";
import type { KaplanMeierGraphModel } from "@lsaa/graph-spec";

const COLORS = ["#4477AA", "#CC6677", "#228833", "#AA3377", "#66CCEE"];

export const SurvivalGraph = forwardRef<
  SVGSVGElement,
  { model: KaplanMeierGraphModel; timeLabel?: string; annotation?: string }
>(function SurvivalGraph({ model, timeLabel = "Follow-up time", annotation }, ref) {
  const width = 820,
    plotHeight = 410,
    left = 80,
    top = 30,
    right = 30;
  const riskRows = model.groups.length * 24 + 54;
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
  return (
    <svg
      ref={ref}
      role="img"
      aria-label="Kaplan–Meier survival graph"
      viewBox={`0 0 ${width} ${height}`}
      width={width}
      height={height}
    >
      <line x1={left} y1={top} x2={left} y2={plotHeight - 10} stroke="#111" />
      <line x1={left} y1={plotHeight - 10} x2={width - right} y2={plotHeight - 10} stroke="#111" />
      {yTicks.map((tick) => (
        <g key={tick}>
          <line x1={left - 5} x2={left} y1={y(tick)} y2={y(tick)} stroke="#111" />
          <text x={left - 10} y={y(tick) + 4} textAnchor="end" fontSize="12">
            {tick.toFixed(2).replace(/0+$/, "").replace(/\.$/, "")}
          </text>
        </g>
      ))}
      <text
        x={18}
        y={plotHeight / 2}
        transform={`rotate(-90 18 ${plotHeight / 2})`}
        textAnchor="middle"
      >
        Survival probability
      </text>
      <text x={(left + width - right) / 2} y={plotHeight + 22} textAnchor="middle">
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
        <g key={group.conditionId}>
          <path
            d={stepPath(group.steps)}
            fill="none"
            stroke={COLORS[index % COLORS.length]}
            strokeWidth="2.5"
          />
          {group.censorMarks.map((mark) => (
            <g
              key={`${mark.experimentalUnitId}.${mark.time}`}
              stroke={COLORS[index % COLORS.length]}
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
          <line
            x1={width - 210}
            x2={width - 180}
            y1={45 + index * 22}
            y2={45 + index * 22}
            stroke={COLORS[index % COLORS.length]}
            strokeWidth="3"
          />
          <text x={width - 172} y={50 + index * 22} fontSize="13">
            {group.label} (n={group.n})
          </text>
        </g>
      ))}
      <text x={left} y={plotHeight + 50} fontWeight="600">
        Number at risk
      </text>
      {riskTimes.map((time) => (
        <text key={time} x={x(time)} y={plotHeight + 50} textAnchor="middle" fontSize="11">
          {time}
        </text>
      ))}
      {model.groups.map((group, index) => (
        <g key={`risk.${group.conditionId}`}>
          <text x={left - 8} y={plotHeight + 74 + index * 24} textAnchor="end" fontSize="12">
            {group.label}
          </text>
          {riskTimes.map((time) => (
            <text
              key={time}
              x={x(time)}
              y={plotHeight + 74 + index * 24}
              textAnchor="middle"
              fontSize="12"
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

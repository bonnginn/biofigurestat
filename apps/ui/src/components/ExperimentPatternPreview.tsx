import "./ExperimentPatternPreview.css";

import type { ReactNode } from "react";

export type ExperimentPatternPreviewKind =
  "two-condition" | "multi-group" | "repeated" | "factorial" | "correlation";

export type ExperimentPatternPreviewProps = {
  kind: ExperimentPatternPreviewKind;
  conditionLabels: readonly string[];
  factorAName?: string;
  factorALevels?: readonly string[];
  factorBName?: string;
  factorBLevels?: readonly string[];
};

type PlotFrameProps = {
  children: ReactNode;
  label: string;
};

const PLOT = {
  bottom: 208,
  height: 248,
  left: 68,
  right: 700,
  top: 24,
  width: 720,
};

const DOT_OFFSETS = [
  [-14, 12],
  [-6, -10],
  [4, 7],
  [13, -2],
  [0, 18],
] as const;

const SERIES_OFFSETS = [-16, -7, 5, 14] as const;
const FACTOR_COLORS = ["#3167d5", "#e27738", "#3c9b72", "#9a61c9", "#c44e52", "#7b8794"];

const KIND_COPY: Record<ExperimentPatternPreviewKind, { description: string; title: string }> = {
  "two-condition": {
    title: "2条件の見え方",
    description: "条件ごとに点を並べ、入力した名前を横軸に表示します。",
  },
  "multi-group": {
    title: "多群の見え方",
    description: "各群を横に並べ、条件名をそのまま横軸ラベルにします。",
  },
  repeated: {
    title: "繰り返し測定の見え方",
    description: "同じ実験単位の値を線で結び、どの条件を順に測ったかを示します。",
  },
  factorial: {
    title: "2種類の処置を組み合わせた見え方",
    description: "処置Aを横軸に置き、処置Bを色の系列として重ねます。",
  },
  correlation: {
    title: "2つの測定値の見え方",
    description: "同じ実験単位から得た2つの名前を、横軸と縦軸に置きます。",
  },
};

function displayLabel(value: string | undefined, fallback: string) {
  return value?.trim() || fallback;
}

function displayLabels(
  labels: readonly string[],
  minimum: number,
  fallbackPrefix: string,
): string[] {
  return Array.from({ length: Math.max(minimum, labels.length) }, (_, index) =>
    displayLabel(labels[index], `${fallbackPrefix}${index + 1}`),
  );
}

function xPosition(index: number, count: number) {
  if (count <= 1) return (PLOT.left + PLOT.right) / 2;
  return PLOT.left + (index / (count - 1)) * (PLOT.right - PLOT.left);
}

function PlotFrame({ children, label }: PlotFrameProps) {
  return (
    <svg
      className="experiment-pattern-preview__chart"
      viewBox={`0 0 ${PLOT.width} ${PLOT.height}`}
      role="img"
      aria-label={label}
    >
      <line
        className="experiment-pattern-preview__axis-line"
        x1={PLOT.left}
        y1={PLOT.top}
        x2={PLOT.left}
        y2={PLOT.bottom}
      />
      <line
        className="experiment-pattern-preview__axis-line"
        x1={PLOT.left}
        y1={PLOT.bottom}
        x2={PLOT.right}
        y2={PLOT.bottom}
      />
      {[70, 115, 160].map((y) => (
        <line
          className="experiment-pattern-preview__grid-line"
          key={y}
          x1={PLOT.left}
          y1={y}
          x2={PLOT.right}
          y2={y}
        />
      ))}
      {children}
    </svg>
  );
}

function GroupedPlot({ labels, repeated }: { labels: readonly string[]; repeated: boolean }) {
  const safeLabels = displayLabels(labels, 2, "条件");
  const chartLabel = repeated ? "繰り返し測定の架空データ模式図" : "条件ごとの架空データ模式図";

  if (!repeated) {
    return (
      <PlotFrame label={chartLabel}>
        {safeLabels.map((label, labelIndex) => {
          const x = xPosition(labelIndex, safeLabels.length);
          return (
            <g key={`${label}-${labelIndex}`}>
              <line
                className="experiment-pattern-preview__group-guide"
                x1={x}
                y1={PLOT.top}
                x2={x}
                y2={PLOT.bottom}
              />
              {DOT_OFFSETS.map(([dx, dy], pointIndex) => (
                <circle
                  className="experiment-pattern-preview__point"
                  cx={x + dx}
                  cy={142 + dy}
                  key={pointIndex}
                  r="6"
                />
              ))}
              <text
                className="experiment-pattern-preview__x-label"
                data-axis-label="x"
                textAnchor="middle"
                x={x}
                y={232}
              >
                {label}
              </text>
            </g>
          );
        })}
        <text
          className="experiment-pattern-preview__axis-title"
          textAnchor="middle"
          x="384"
          y="254"
        >
          条件
        </text>
      </PlotFrame>
    );
  }

  const series = Array.from(
    { length: Math.min(4, Math.max(3, safeLabels.length + 1)) },
    (_, index) =>
      safeLabels.map(
        (_, labelIndex) => 132 + SERIES_OFFSETS[index] + ((labelIndex + index) % 3) * 5,
      ),
  );

  return (
    <PlotFrame label={chartLabel}>
      {series.map((values, seriesIndex) => {
        const points = values
          .map((value, labelIndex) => `${xPosition(labelIndex, safeLabels.length)},${value}`)
          .join(" ");
        return (
          <polyline
            className="experiment-pattern-preview__connection"
            data-preview-connection="true"
            fill="none"
            key={seriesIndex}
            points={points}
          />
        );
      })}
      {safeLabels.map((label, labelIndex) => {
        const x = xPosition(labelIndex, safeLabels.length);
        return (
          <g key={`${label}-${labelIndex}`}>
            <line
              className="experiment-pattern-preview__group-guide"
              x1={x}
              y1={PLOT.top}
              x2={x}
              y2={PLOT.bottom}
            />
            {series.map((values, seriesIndex) => (
              <circle
                className="experiment-pattern-preview__point experiment-pattern-preview__point--repeated"
                cx={x}
                cy={values[labelIndex]}
                key={seriesIndex}
                r="5"
              />
            ))}
            <text
              className="experiment-pattern-preview__x-label"
              data-axis-label="x"
              textAnchor="middle"
              x={x}
              y={232}
            >
              {label}
            </text>
          </g>
        );
      })}
      <text className="experiment-pattern-preview__axis-title" textAnchor="middle" x="384" y="254">
        測定条件
      </text>
    </PlotFrame>
  );
}

function CorrelationPlot({ labels }: { labels: readonly string[] }) {
  const safeLabels = displayLabels(labels, 2, "測定値");
  const xLabel = safeLabels[0] ?? "測定値1";
  const yLabel = safeLabels[1] ?? "測定値2";
  const points = [
    [116, 177],
    [174, 158],
    [238, 165],
    [300, 122],
    [364, 135],
    [430, 90],
    [498, 104],
    [568, 64],
    [638, 78],
  ] as const;

  return (
    <PlotFrame label="2つの測定値の関係を示す架空データ模式図">
      {points.map(([cx, cy], index) => (
        <circle
          className="experiment-pattern-preview__point experiment-pattern-preview__point--correlation"
          cx={cx}
          cy={cy}
          key={index}
          r="6"
        />
      ))}
      <text
        className="experiment-pattern-preview__x-label"
        data-axis-label="x"
        textAnchor="middle"
        x="384"
        y="232"
      >
        {xLabel}
      </text>
      <text
        className="experiment-pattern-preview__y-label"
        data-axis-label="y"
        textAnchor="middle"
        transform="translate(20 126) rotate(-90)"
      >
        {yLabel}
      </text>
    </PlotFrame>
  );
}

function FactorialPlot({
  factorAName,
  factorALevels,
  factorBName,
  factorBLevels,
}: Pick<
  ExperimentPatternPreviewProps,
  "factorAName" | "factorALevels" | "factorBName" | "factorBLevels"
>) {
  const aName = displayLabel(factorAName, "処置A");
  const bName = displayLabel(factorBName, "処置B");
  const aLevels = displayLabels(factorALevels ?? [], 2, "条件A-");
  const bLevels = displayLabels(factorBLevels ?? [], 2, "条件B-");

  return (
    <>
      <PlotFrame label="2種類の処置を組み合わせた架空データ模式図">
        {aLevels.map((label, aIndex) => {
          const x = xPosition(aIndex, aLevels.length);
          return (
            <g key={`${label}-${aIndex}`}>
              <line
                className="experiment-pattern-preview__group-guide"
                x1={x}
                y1={PLOT.top}
                x2={x}
                y2={PLOT.bottom}
              />
              {bLevels.map((bLevel, bIndex) => (
                <g key={`${bLevel}-${bIndex}`}>
                  {DOT_OFFSETS.slice(0, 3).map(([dx, dy], pointIndex) => (
                    <circle
                      className="experiment-pattern-preview__point"
                      cx={x + (bIndex - (bLevels.length - 1) / 2) * 16 + dx / 2}
                      cy={136 + dy + bIndex * 9}
                      key={pointIndex}
                      style={{ fill: FACTOR_COLORS[bIndex % FACTOR_COLORS.length] }}
                      r="5"
                    />
                  ))}
                </g>
              ))}
            </g>
          );
        })}
        <text
          className="experiment-pattern-preview__axis-title"
          textAnchor="middle"
          x="384"
          y="254"
        >
          {aName}（横軸）
        </text>
      </PlotFrame>
      <div
        className="experiment-pattern-preview__factorial-labels"
        role="group"
        aria-label="組み合わせ条件の2段ラベル"
      >
        <div className="experiment-pattern-preview__factorial-row">
          <span className="experiment-pattern-preview__factorial-row-title">{aName}（横軸）</span>
          <div
            className="experiment-pattern-preview__factorial-level-grid"
            style={{ gridTemplateColumns: `repeat(${aLevels.length}, minmax(0, 1fr))` }}
          >
            {aLevels.map((level, index) => (
              <span data-axis-label="factor-a" key={`${level}-${index}`}>
                {level}
              </span>
            ))}
          </div>
        </div>
        <div className="experiment-pattern-preview__factorial-row">
          <span className="experiment-pattern-preview__factorial-row-title">{bName}（色系列）</span>
          <div
            className="experiment-pattern-preview__factorial-level-grid"
            style={{ gridTemplateColumns: `repeat(${aLevels.length}, minmax(0, 1fr))` }}
          >
            {aLevels.map((_, aIndex) => (
              <span data-axis-label="factor-b" key={aIndex}>
                {bLevels.join(" / ")}
              </span>
            ))}
          </div>
        </div>
      </div>
      <div
        className="experiment-pattern-preview__legend"
        role="group"
        aria-label={`${bName}の色系列`}
      >
        {bLevels.map((level, index) => (
          <span key={`${level}-${index}`}>
            <i
              aria-hidden="true"
              className="experiment-pattern-preview__legend-swatch"
              style={{ backgroundColor: FACTOR_COLORS[index % FACTOR_COLORS.length] }}
            />
            {level}
          </span>
        ))}
      </div>
    </>
  );
}

export function ExperimentPatternPreview({
  kind,
  conditionLabels,
  factorAName,
  factorALevels,
  factorBName,
  factorBLevels,
}: ExperimentPatternPreviewProps) {
  const copy = KIND_COPY[kind];
  const labels =
    kind === "factorial"
      ? []
      : kind === "correlation"
        ? displayLabels(conditionLabels, 2, "測定値")
        : displayLabels(
            conditionLabels,
            kind === "multi-group" || kind === "repeated" ? 3 : 2,
            "条件",
          );

  return (
    <section
      className="experiment-pattern-preview"
      aria-label="実験デザインの模式プレビュー"
      data-preview-kind={kind}
    >
      <div className="experiment-pattern-preview__header">
        <div>
          <p className="experiment-pattern-preview__overline">入力内容の見え方</p>
          <h3 className="experiment-pattern-preview__title">{copy.title}</h3>
        </div>
        <span className="experiment-pattern-preview__badge">架空データ</span>
      </div>
      <p className="experiment-pattern-preview__hint">{copy.description}</p>
      {kind === "factorial" ? (
        <FactorialPlot
          factorAName={factorAName}
          factorALevels={factorALevels}
          factorBName={factorBName}
          factorBLevels={factorBLevels}
        />
      ) : kind === "correlation" ? (
        <CorrelationPlot labels={labels} />
      ) : (
        <GroupedPlot labels={labels} repeated={kind === "repeated"} />
      )}
      <p className="experiment-pattern-preview__footnote">
        実際の測定値は使わず、条件名と配置だけを先に確認しています。
      </p>
    </section>
  );
}

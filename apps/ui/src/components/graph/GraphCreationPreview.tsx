import {
  continuousSummary,
  experimentCellKey,
  percentage,
  timePointLabel,
  orderedAxisUnit,
  wbRatio,
  type ExperimentCellMap,
  type ExperimentSetDraft,
  type TimeAnalysisPlan,
} from "../../app/experimentDraft";
import { deriveTimeMetricValue } from "../../app/experimentDraftAnalysis";
import { defaultLayersForGraphType } from "../../app/graphDefaults";
import type { WorkspaceGraphState } from "../../app/experimentWorkspaceProject";
import { localizedText, useAppLocale } from "../../app/appLocale";
import { violinDensityPath } from "./graphGeometry";
import { createPlotRectangle } from "./graphLayout";

import "./graph-creation-preview.css";

export type CreatableGraphType = Extract<
  WorkspaceGraphState["graphType"],
  | "dot"
  | "paired_dot"
  | "box"
  | "violin"
  | "bar"
  | "line"
  | "scatter"
  | "stacked"
  | "stacked_100"
  | "category_percentage"
>;

type PreviewGroup = Readonly<{
  key: string;
  conditionId: string;
  label: string;
  experimentValues: readonly number[];
  experimentPoints: readonly Readonly<{ experimentId: string; value: number }>[];
  observationValues: readonly number[];
}>;

function mean(values: readonly number[]): number | null {
  if (values.length === 0) return null;
  return values.reduce((total, value) => total + value, 0) / values.length;
}

function sd(values: readonly number[]): number {
  if (values.length < 2) return 0;
  const average = mean(values) ?? 0;
  return Math.sqrt(
    values.reduce((total, value) => total + (value - average) ** 2, 0) / (values.length - 1),
  );
}

function quantile(values: readonly number[], fraction: number): number | null {
  if (values.length === 0) return null;
  const ordered = [...values].sort((first, second) => first - second);
  const position = (ordered.length - 1) * fraction;
  const lower = Math.floor(position);
  const upper = Math.ceil(position);
  if (lower === upper) return ordered[lower] ?? null;
  return (
    (ordered[lower] ?? 0) + ((ordered[upper] ?? 0) - (ordered[lower] ?? 0)) * (position - lower)
  );
}

function previewGroups(
  draft: ExperimentSetDraft,
  cells: ExperimentCellMap,
  readoutId?: string,
  sourceMode: "raw_readout" | "derived_metric" = "raw_readout",
  timeAnalysis: TimeAnalysisPlan = { kind: "selected_timepoint" },
): PreviewGroup[] {
  const readout = draft.readouts.find(({ id }) => id === readoutId) ?? draft.readouts[0];
  if (!readout) return [];
  const timePoints =
    sourceMode === "derived_metric"
      ? [undefined]
      : draft.time.points.length > 0
        ? draft.time.points
        : [undefined];
  return draft.conditions.flatMap((condition) =>
    timePoints.map((timePoint) => {
      const experimentValues: number[] = [];
      const experimentPoints: Array<{ experimentId: string; value: number }> = [];
      const observationValues: number[] = [];
      draft.experiments.forEach((experiment) => {
        if (
          sourceMode === "derived_metric" &&
          timeAnalysis.kind !== "selected_timepoint" &&
          timeAnalysis.kind !== "full_time_course"
        ) {
          const value = deriveTimeMetricValue({
            draft,
            cells,
            experimentId: experiment.id,
            conditionId: condition.id,
            readoutId: readout.id,
            plan: timeAnalysis,
          });
          if (value !== null) {
            experimentValues.push(value);
            experimentPoints.push({ experimentId: experiment.id, value });
          }
          return;
        }
        const cell =
          cells[
            experimentCellKey({
              experimentId: experiment.id,
              conditionId: condition.id,
              readoutId: readout.id,
              timePointId: timePoint?.id,
            })
          ];
        if (cell?.availability === "not_planned") return;
        if (cell?.kind === "proportion") {
          const value = percentage(cell);
          if (value !== null) {
            experimentValues.push(value);
            experimentPoints.push({ experimentId: experiment.id, value });
          }
        }
        if (cell?.kind === "nested_continuous") {
          observationValues.push(...cell.rawValues);
          const summary = continuousSummary(cell.rawValues);
          if (summary.mean !== null) {
            experimentValues.push(summary.mean);
            experimentPoints.push({ experimentId: experiment.id, value: summary.mean });
          }
        }
        if (cell?.kind === "wb_ratio") {
          const value = wbRatio(cell);
          if (value !== null) {
            experimentValues.push(value);
            experimentPoints.push({ experimentId: experiment.id, value });
          }
        }
      });
      const time = timePoint ? timePointLabel(timePoint, orderedAxisUnit(draft.time)) : "";
      return {
        key: `${condition.id}:${timePoint?.id ?? "none"}`,
        conditionId: condition.id,
        label: time ? `${condition.label} · ${time}` : condition.label,
        experimentValues,
        experimentPoints,
        observationValues,
      };
    }),
  );
}

export function GraphTypeThumbnail({ type }: { type: CreatableGraphType }) {
  const locale = useAppLocale();
  const points = [48, 36, 42];
  return (
    <svg
      className="graph-type-thumbnail"
      viewBox="0 0 128 76"
      role="img"
      aria-label={localizedText(locale, `${type}の模式図`, `${type} schematic`)}
    >
      <line x1="15" x2="15" y1="10" y2="62" />
      <line x1="15" x2="118" y1="62" y2="62" />
      {type === "bar" ? <rect x="45" y="26" width="30" height="36" /> : null}
      {type === "box" ? (
        <>
          <line x1="60" x2="60" y1="22" y2="55" />
          <rect x="43" y="31" width="34" height="17" />
          <line x1="43" x2="77" y1="39" y2="39" />
        </>
      ) : null}
      {type === "violin" ? (
        <path d="M60 17 C42 26 45 35 53 40 C45 47 48 56 60 59 C72 56 75 47 67 40 C75 35 78 26 60 17 Z" />
      ) : null}
      {type === "line" ? <polyline points="32,49 64,33 96,22" /> : null}
      {type === "paired_dot" ? (
        <>
          <polyline points="38,49 90,31" />
          <polyline points="38,37 90,42" />
          <circle cx="38" cy="49" r="3" />
          <circle cx="90" cy="31" r="3" />
          <circle cx="38" cy="37" r="3" />
          <circle cx="90" cy="42" r="3" />
        </>
      ) : null}
      {type === "scatter" ? (
        <>
          <circle cx="35" cy="51" r="3" />
          <circle cx="52" cy="43" r="3" />
          <circle cx="72" cy="36" r="3" />
          <circle cx="94" cy="23" r="3" />
        </>
      ) : null}
      {type === "stacked" || type === "stacked_100" || type === "category_percentage" ? (
        <>
          <rect x="35" y="42" width="24" height="20" />
          <rect x="35" y="28" width="24" height="14" className="graph-type-thumbnail__secondary" />
          <rect x="35" y="17" width="24" height="11" className="graph-type-thumbnail__tertiary" />
          <rect x="78" y="36" width="24" height="26" />
          <rect x="78" y="24" width="24" height="12" className="graph-type-thumbnail__secondary" />
          <rect x="78" y="17" width="24" height="7" className="graph-type-thumbnail__tertiary" />
        </>
      ) : null}
      {(type === "dot" || type === "bar" || type === "box" || type === "violin") &&
        points.map((y, index) => <circle key={y} cx={54 + index * 7} cy={y} r="3" />)}
      {type === "dot" ? (
        <>
          <line x1="42" x2="78" y1="42" y2="42" />
          <line x1="60" x2="60" y1="32" y2="52" />
        </>
      ) : null}
    </svg>
  );
}

export function CurrentDataGraphPreview({
  type,
  draft,
  cells,
  readoutId,
  sourceMode = "raw_readout",
  timeAnalysis = { kind: "selected_timepoint" },
  layers: requestedLayers,
}: {
  type: CreatableGraphType;
  draft: ExperimentSetDraft;
  cells: ExperimentCellMap;
  readoutId?: string;
  sourceMode?: "raw_readout" | "derived_metric";
  timeAnalysis?: TimeAnalysisPlan;
  layers?: WorkspaceGraphState["layers"];
}) {
  const locale = useAppLocale();
  const t = (ja: string, en: string) => localizedText(locale, ja, en);
  const selectedReadout = draft.readouts.find(({ id }) => id === readoutId) ?? draft.readouts[0];
  if (type === "stacked" || type === "stacked_100" || type === "category_percentage") {
    const previewPlot = createPlotRectangle(620, 300, {
      top: 22,
      right: 40,
      bottom: 78,
      left: 62,
    });
    const readout = selectedReadout;
    const categories = readout?.categories ?? [];
    const groups = draft.conditions.map((condition) => {
      const percentages = categories.map((category) => {
        const values = draft.experiments.flatMap((experiment) => {
          const cell =
            cells[
              experimentCellKey({
                experimentId: experiment.id,
                conditionId: condition.id,
                readoutId: readout?.id ?? "",
              })
            ];
          if (cell?.kind !== "categorical_counts") return [];
          const total = Object.values(cell.counts).reduce<number>(
            (sum, value) => sum + (value ?? 0),
            0,
          );
          const value = cell.counts[category.id];
          return total > 0 && value !== null && value !== undefined ? [(value / total) * 100] : [];
        });
        return mean(values) ?? 0;
      });
      return { condition, percentages };
    });
    if (!groups.some(({ percentages }) => percentages.some((value) => value > 0))) {
      return (
        <p className="graph-current-preview__empty">
          {t(
            "カテゴリ別countを入力するとpreviewします。",
            "Enter category counts to preview the Graph.",
          )}
        </p>
      );
    }
    return (
      <svg
        className="graph-current-preview"
        viewBox="0 0 620 300"
        role="img"
        aria-label={t(
          "現在のカテゴリ構成を表示したpreview",
          "Preview of the current category composition",
        )}
      >
        <line
          x1={previewPlot.left}
          x2={previewPlot.left}
          y1={previewPlot.top}
          y2={previewPlot.bottom}
        />
        <line
          x1={previewPlot.left}
          x2={previewPlot.right}
          y1={previewPlot.bottom}
          y2={previewPlot.bottom}
        />
        {groups.map(({ condition, percentages }, groupIndex) => {
          let cumulative = 0;
          return percentages.map((value, categoryIndex) => {
            const height = value * 2;
            cumulative += height;
            return (
              <rect
                key={`${condition.id}-${categories[categoryIndex]?.id}`}
                x={previewPlot.left + 23 + groupIndex * 72}
                y={previewPlot.bottom - cumulative}
                width="38"
                height={height}
                className={`graph-current-preview__category graph-current-preview__category--${categoryIndex + 1}`}
              />
            );
          });
        })}
      </svg>
    );
  }
  const groups = previewGroups(draft, cells, selectedReadout?.id, sourceMode, timeAnalysis);
  const layers =
    requestedLayers ?? defaultLayersForGraphType(type, selectedReadout?.shape ?? "proportion");
  const allValues = groups.flatMap((group) => [
    ...group.experimentValues,
    ...(type === "violin" ? group.observationValues : []),
  ]);
  if (allValues.length === 0) {
    return (
      <p className="graph-current-preview__empty">
        {t(
          "測定値を入力するとここにpreviewします。",
          "Enter measured values to preview the Graph here.",
        )}
      </p>
    );
  }
  if (type === "scatter") {
    const previewPlot = createPlotRectangle(620, 300, {
      top: 22,
      right: 58,
      bottom: 78,
      left: 62,
    });
    const [xGroup, yGroup] = groups;
    const yByExperiment = new Map(
      yGroup?.experimentPoints.map((point) => [point.experimentId, point.value]) ?? [],
    );
    const pairs =
      xGroup?.experimentPoints.flatMap((point) => {
        const y = yByExperiment.get(point.experimentId);
        return y === undefined ? [] : [{ id: point.experimentId, x: point.value, y }];
      }) ?? [];
    if (pairs.length === 0) {
      return (
        <p className="graph-current-preview__empty">
          {t("XとYを入力するとここにpreviewします。", "Enter X and Y to preview the Graph here.")}
        </p>
      );
    }
    const xValues = pairs.map(({ x }) => x);
    const yValues = pairs.map(({ y }) => y);
    const xMin = Math.min(...xValues);
    const xMax = Math.max(...xValues);
    const yMin = Math.min(...yValues);
    const yMax = Math.max(...yValues);
    const xRange = Math.max(1, xMax - xMin);
    const yRange = Math.max(1, yMax - yMin);
    const xForPair = (value: number) =>
      previewPlot.left + ((value - xMin) / xRange) * previewPlot.width;
    const yForPair = (value: number) =>
      previewPlot.top + ((yMax - value) / yRange) * previewPlot.height;
    return (
      <svg
        className="graph-current-preview"
        viewBox="0 0 620 300"
        role="img"
        aria-label={t(
          `${xGroup?.label ?? "X"}と${yGroup?.label ?? "Y"}の現在のデータによる散布図preview`,
          `Scatter-plot preview of the current ${xGroup?.label ?? "X"} and ${yGroup?.label ?? "Y"} data`,
        )}
      >
        <line
          x1={previewPlot.left}
          x2={previewPlot.left}
          y1={previewPlot.top}
          y2={previewPlot.bottom}
        />
        <line
          x1={previewPlot.left}
          x2={previewPlot.right}
          y1={previewPlot.bottom}
          y2={previewPlot.bottom}
        />
        {pairs.map((pair) => (
          <circle key={pair.id} cx={xForPair(pair.x)} cy={yForPair(pair.y)} r="5" />
        ))}
        <text x={previewPlot.left + previewPlot.width / 2} y="275" textAnchor="middle">
          {xGroup?.label ?? "X"}
        </text>
        <text
          x="20"
          y={previewPlot.top + previewPlot.height / 2}
          textAnchor="middle"
          transform={`rotate(-90 20 ${previewPlot.top + previewPlot.height / 2})`}
        >
          {yGroup?.label ?? "Y"}
        </text>
      </svg>
    );
  }
  // Keep a short axis for ordinary two- or three-group previews. Wider designs
  // still grow horizontally and remain scrollable instead of compressing labels.
  const width = Math.max(360, 100 + groups.length * 72);
  const height = 300;
  const previewPlot = createPlotRectangle(width, height, {
    top: 22,
    right: 20,
    bottom: 78,
    left: 46,
  });
  const observedMin = Math.min(...allValues);
  const observedMax = Math.max(...allValues);
  const observedRange = observedMax - observedMin;
  const scale = Math.max(Math.abs(observedMin), Math.abs(observedMax), 1);
  const padding = Math.max(observedRange * 0.1, scale * 0.04);
  const domainMin =
    selectedReadout?.shape === "proportion"
      ? 0
      : type === "bar"
        ? Math.min(0, observedMin - padding)
        : observedMin - padding;
  const domainMax =
    selectedReadout?.shape === "proportion"
      ? 100
      : type === "bar"
        ? Math.max(0, observedMax + padding)
        : observedMax + padding;
  const yFor = (value: number) =>
    previewPlot.top +
    ((domainMax - value) / (domainMax - domainMin)) * previewPlot.height;
  const xFor = (index: number) => previewPlot.left + 16 + index * 72;
  const summaryLines = [...new Set(groups.map(({ conditionId }) => conditionId))].flatMap(
    (conditionId) => {
      const points = groups.flatMap((group, index) => {
        if (group.conditionId !== conditionId) return [];
        const average = mean(group.experimentValues);
        return average === null ? [] : [`${xFor(index)},${yFor(average)}`];
      });
      return points.length > 1 ? [{ conditionId, points }] : [];
    },
  );
  const showUnitConnections =
    layers.connectingLine &&
    (draft.time.sampling === "longitudinal" ||
      (type === "paired_dot" && draft.conditionAssignment.kind === "matched"));
  const trajectoryGroups =
    draft.time.sampling === "longitudinal"
      ? [...new Set(groups.map(({ conditionId }) => conditionId))]
      : ["matched"];
  const unitConnections = showUnitConnections
    ? trajectoryGroups.flatMap((trajectoryGroup) =>
        [
          ...new Set(
            groups
              .filter(
                (group) => trajectoryGroup === "matched" || group.conditionId === trajectoryGroup,
              )
              .flatMap((group) => group.experimentPoints.map(({ experimentId }) => experimentId)),
          ),
        ].flatMap((experimentId) => {
          const points = groups.flatMap((group, index) => {
            if (trajectoryGroup !== "matched" && group.conditionId !== trajectoryGroup) return [];
            const point = group.experimentPoints.find(
              (candidate) => candidate.experimentId === experimentId,
            );
            return point ? [`${xFor(index)},${yFor(point.value)}`] : [];
          });
          return points.length > 1
            ? [{ experimentId: `${trajectoryGroup}:${experimentId}`, points }]
            : [];
        }),
      )
    : [];

  return (
    <div className="graph-current-preview__scroll">
      <svg
        className="graph-current-preview"
        width={width}
        viewBox={`0 0 ${width} ${height}`}
        role="img"
        aria-label={t(
          `${type}で現在のデータを表示したpreview`,
          `Preview of current data as ${type}`,
        )}
        data-domain-min={domainMin}
        data-domain-max={domainMax}
      >
        <line
          className="graph-current-preview__axis"
          x1={previewPlot.left}
          x2={previewPlot.left}
          y1={previewPlot.top}
          y2={previewPlot.bottom}
        />
        <line
          className="graph-current-preview__axis"
          x1={previewPlot.left}
          x2={previewPlot.right}
          y1={previewPlot.bottom}
          y2={previewPlot.bottom}
        />
        {type === "line"
          ? summaryLines.map(({ conditionId, points }) => (
              <polyline
                key={conditionId}
                className="graph-current-preview__line"
                points={points.join(" ")}
              />
            ))
          : null}
        {unitConnections.map(({ experimentId, points }) => (
          <polyline
            key={experimentId}
            className="graph-current-preview__unit-line"
            points={points.join(" ")}
          />
        ))}
        {groups.map((group, groupIndex) => {
          const x = xFor(groupIndex);
          const average = mean(group.experimentValues);
          const error = sd(group.experimentValues);
          const q1 = quantile(group.experimentValues, 0.25);
          const median = quantile(group.experimentValues, 0.5);
          const q3 = quantile(group.experimentValues, 0.75);
          const source =
            group.observationValues.length > 0 ? group.observationValues : group.experimentValues;
          const currentViolinPath = violinDensityPath(source, x, yFor, 22);
          return (
            <g key={group.key}>
              {type === "bar" && average !== null ? (
                <rect
                  className="graph-current-preview__bar"
                  x={x - 18}
                  y={yFor(average)}
                  width="36"
                  height={previewPlot.bottom - yFor(average)}
                />
              ) : null}
              {type === "box" && q1 !== null && median !== null && q3 !== null ? (
                <>
                  <rect
                    className="graph-current-preview__box"
                    x={x - 18}
                    y={yFor(q3)}
                    width="36"
                    height={Math.max(2, yFor(q1) - yFor(q3))}
                  />
                  <line
                    className="graph-current-preview__summary"
                    x1={x - 18}
                    x2={x + 18}
                    y1={yFor(median)}
                    y2={yFor(median)}
                  />
                </>
              ) : null}
              {type === "violin" && currentViolinPath ? (
                <path
                  className="graph-current-preview__violin"
                  data-graph-layer="violin"
                  d={currentViolinPath}
                />
              ) : null}
              {layers.raw &&
                group.observationValues
                  .slice(0, 45)
                  .map((value, index) => (
                    <circle
                      className="graph-current-preview__raw"
                      key={`raw-${index}`}
                      cx={x + (((index * 29) % 17) - 8) * 1.4}
                      cy={yFor(value)}
                      r="1.8"
                    />
                  ))}
              {layers.experiment &&
                group.experimentValues.map((value, index) => (
                  <circle
                    className="graph-current-preview__point"
                    key={`exp-${index}`}
                    cx={x + (index - (group.experimentValues.length - 1) / 2) * 7}
                    cy={yFor(value)}
                    r="3.5"
                  />
                ))}
              {layers.overall && average !== null ? (
                <line
                  className="graph-current-preview__summary"
                  x1={x - 20}
                  x2={x + 20}
                  y1={yFor(average)}
                  y2={yFor(average)}
                />
              ) : null}
              {layers.errorBar && average !== null && error > 0 ? (
                <line
                  className="graph-current-preview__error"
                  x1={x}
                  x2={x}
                  y1={yFor(average + error)}
                  y2={yFor(average - error)}
                />
              ) : null}
              <text x={x} y={previewPlot.bottom + 21} textAnchor="middle">
                <title>{group.label}</title>
                {group.label.length > 12 ? `${group.label.slice(0, 11)}…` : group.label}
              </text>
            </g>
          );
        })}
      </svg>
    </div>
  );
}

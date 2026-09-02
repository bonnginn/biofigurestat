import {
  categoricalPercentage,
  categoricalTotal,
  experimentCellKey,
  type continuousSummary,
  type ExperimentCellMap,
  type ExperimentSetDraft,
  type ReadoutDraft,
} from "../../app/experimentDraft";
import type { AppLocale } from "../../app/appLocale";

export type ProportionPoint = Readonly<{
  experimentId: string;
  experimentLabel: string;
  value: number;
  positive: number;
  eligible: number;
}>;

export type ExperimentPoint = Readonly<{
  experimentId: string;
  experimentLabel: string;
  value: number;
}>;

export type RawPoint = Readonly<{
  experimentId: string;
  experimentLabel: string;
  value: number;
  index: number;
}>;

export type GraphSeries = Readonly<{
  seriesKey: string;
  conditionId: string;
  conditionLabel: string;
  xGroupKey: string;
  xGroupLabel: string;
  visualSeriesKey: string;
  visualSeriesLabel: string;
  facetKey: string;
  facetLabel: string;
  auxiliaryReference: boolean;
  timePointId?: string;
  timeLabel?: string;
  xValue?: number;
  proportionPoints: readonly ProportionPoint[];
  experimentPoints: readonly ExperimentPoint[];
  rawPoints: readonly RawPoint[];
  summary: ReturnType<typeof continuousSummary>;
}>;

function csvField(value: string | number): string {
  return `"${String(value).replaceAll('"', '""')}"`;
}

export function serializeVisibleGraphData(
  series: readonly GraphSeries[],
  readout: ReadoutDraft,
  locale: AppLocale = "ja",
): string {
  const shape = readout.shape;
  const t = (ja: string, en: string) => (locale === "ja" ? ja : en);
  const rows: Array<Array<string | number>> = [
    [
      t("条件", "Condition"),
      t("時点", "Time point"),
      t("実験回", "Experiment"),
      t("データ層", "Data layer"),
      t("値", "Value"),
      t("陽性数", "Positive count"),
      t("対象数", "Eligible count"),
    ],
  ];
  series.forEach((item) => {
    if (shape === "proportion") {
      item.proportionPoints.forEach((point) => {
        rows.push([
          item.conditionLabel,
          item.timeLabel ?? "",
          point.experimentLabel,
          t("実験単位の割合", "Experimental-unit proportion"),
          point.value,
          point.positive,
          point.eligible,
        ]);
      });
      return;
    }
    if (shape === "nested_continuous" && readout.nestedInputMode !== "unit_summary") {
      item.rawPoints.forEach((point) => {
        rows.push([
          item.conditionLabel,
          item.timeLabel ?? "",
          point.experimentLabel,
          t("細胞・ROI生データ", "Raw Cell/ROI value"),
          point.value,
          "",
          "",
        ]);
      });
    }
    item.experimentPoints.forEach((point) => {
      rows.push([
        item.conditionLabel,
        item.timeLabel ?? "",
        point.experimentLabel,
        shape === "wb_ratio"
          ? t("標的/reference比", "Target/reference ratio")
          : readout.nestedInputMode === "unit_summary"
            ? t("実験単位の値", "Experimental-unit value")
            : t("実験単位平均", "Experimental-unit mean"),
        point.value,
        "",
        "",
      ]);
    });
  });
  return `\uFEFF${rows.map((row) => row.map(csvField).join(",")).join("\n")}\n`;
}

export function serializeCompositionData(
  draft: ExperimentSetDraft,
  cells: ExperimentCellMap,
  readout: ReadoutDraft,
  conditionIds: readonly string[],
  timePointIds: readonly string[],
  locale: AppLocale = "ja",
): string {
  const categories = readout.categories ?? [];
  const t = (ja: string, en: string) => (locale === "ja" ? ja : en);
  const rows: Array<Array<string | number>> = [
    [
      t("条件", "Condition"),
      t("時点", "Time point"),
      t("実験回", "Experiment"),
      ...categories.map(({ label }) => `${label} count`),
      ...categories.map(({ label }) => `${label} %`),
    ],
  ];
  const times =
    draft.time.points.length > 0
      ? draft.time.points.filter(({ id }) => timePointIds.includes(id))
      : [undefined];
  draft.conditions
    .filter(({ id }) => conditionIds.includes(id))
    .forEach((condition) => {
      times.forEach((timePoint) => {
        draft.experiments.forEach((experiment) => {
          const cell =
            cells[
              experimentCellKey({
                experimentId: experiment.id,
                conditionId: condition.id,
                readoutId: readout.id,
                timePointId: timePoint?.id,
              })
            ];
          if (cell?.kind !== "categorical_counts" || categoricalTotal(cell) === null) return;
          rows.push([
            condition.label,
            timePoint ? `${timePoint.value} ${draft.time.unit}` : "",
            experiment.label,
            ...categories.map(({ id }) => cell.counts[id] ?? ""),
            ...categories.map(({ id }) => categoricalPercentage(cell, id) ?? ""),
          ]);
        });
      });
    });
  return `\uFEFF${rows.map((row) => row.map(csvField).join(",")).join("\n")}\n`;
}

export function safeGraphFileStem(value: string): string {
  return (
    value
      .trim()
      .replace(/[^\p{L}\p{N}._-]+/gu, "_")
      .slice(0, 80) || "graph"
  );
}

/** Preserve researcher-facing spacing while excluding characters forbidden by native save dialogs. */
export function safeNativeGraphFileStem(value: string): string {
  const reserved = '<>:"/\\|?*';
  const sanitized = Array.from(value.trim(), (character) =>
    character.charCodeAt(0) < 32 || reserved.includes(character) ? "-" : character,
  ).join("");
  return sanitized || "graph";
}

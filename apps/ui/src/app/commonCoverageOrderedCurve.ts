import { parseAdaptiveDelimited, type DelimitedSourceKind } from "@lsaa/adaptive-input";
import type { ExperimentDesign, Observation, UnitInstance } from "@lsaa/domain";
import type { ProjectState } from "@lsaa/project";

import {
  NONLINEAR_MODEL_DEFINITIONS,
  type nonlinearModelDefinition,
  type NonlinearModelId,
  type NonlinearParameterId,
} from "./nonlinearModelRegistry";
import type { OrderedCurveEntryResult } from "./orderedCurveEntry";

export const ORDERED_CURVE_HEADER = "Unit ID\tSeries\tX\tY";

export type FitSetting = Readonly<{ initial: string; lower: string; upper: string }>;
const EMPTY_FIT_SETTING: FitSetting = { initial: "", lower: "", upper: "" };

export function completeFitSettings(
  input?: Readonly<Partial<Record<NonlinearParameterId, FitSetting>>>,
): Record<NonlinearParameterId, FitSetting> {
  return {
    baseline: input?.baseline ?? EMPTY_FIT_SETTING,
    plateau: input?.plateau ?? EMPTY_FIT_SETTING,
    rate: input?.rate ?? EMPTY_FIT_SETTING,
    vmax: input?.vmax ?? EMPTY_FIT_SETTING,
    km: input?.km ?? EMPTY_FIT_SETTING,
  };
}
export type ParsedNonlinear = Readonly<{
  allPoints: ReadonlyArray<{
    observationId: string;
    experimentalUnitId: string;
    unitLabel: string;
    seriesId: string;
    seriesLabel: string;
    x: number;
    y: number | null;
  }>;
  points: ReadonlyArray<{
    observationId: string;
    experimentalUnitId: string;
    unitLabel: string;
    seriesId: string;
    seriesLabel: string;
    x: number;
    y: number;
  }>;
  series: ReadonlyArray<{ id: string; label: string }>;
  units: ReadonlyArray<{ id: string; label: string; seriesId: string }>;
}>;

export function parseNonlinearXyPaste(text: string): ParsedNonlinear {
  const delimited = parseAdaptiveDelimited(text);
  if (delimited.rows.length < 1) throw new Error("headerと1行以上のX/Yデータが必要です");
  const header = delimited.headers.map((value) => value.trim().toLowerCase());
  const unitIndex = header.findIndex((value) => ["unit id", "unit", "sample id"].includes(value));
  const seriesIndex = header.findIndex((value) => value === "series");
  const xIndex = header.findIndex((value) => value === "x");
  const yIndex = header.findIndex((value) => value === "y");
  if ([unitIndex, seriesIndex, xIndex, yIndex].some((index) => index < 0)) {
    throw new Error("列は Unit ID、Series、X、Y の4列にしてください");
  }
  const seriesByLabel = new Map<string, string>();
  const unitByLabel = new Map<string, { id: string; seriesId: string }>();
  const missingTokens = new Set(["", "na", "n/a", "undetermined", "over"]);
  const allPoints = delimited.rows.map((cells, index) => {
    const unitLabel = cells[unitIndex] ?? "";
    const seriesLabel = cells[seriesIndex] ?? "";
    const x = Number(cells[xIndex]);
    const rawY = (cells[yIndex] ?? "").trim();
    const y = missingTokens.has(rawY.toLowerCase()) ? null : Number(rawY);
    if (!unitLabel || !seriesLabel || !Number.isFinite(x) || (y !== null && !Number.isFinite(y))) {
      throw new Error(`${index + 2}行目のUnit ID、Series、有限X/Yを確認してください`);
    }
    let seriesId = seriesByLabel.get(seriesLabel);
    if (!seriesId) {
      seriesId = `series.${seriesByLabel.size + 1}`;
      seriesByLabel.set(seriesLabel, seriesId);
    }
    let unit = unitByLabel.get(unitLabel);
    if (!unit) {
      unit = { id: `unit.${unitByLabel.size + 1}`, seriesId };
      unitByLabel.set(unitLabel, unit);
    }
    return {
      observationId: `observation.${index + 1}`,
      experimentalUnitId: unit.id,
      unitLabel,
      seriesId,
      seriesLabel,
      x,
      y,
    };
  });
  const points = allPoints.filter(
    (point): point is (typeof allPoints)[number] & Readonly<{ y: number }> => point.y !== null,
  );
  return {
    allPoints,
    points,
    series: [...seriesByLabel].map(([label, id]) => ({ id, label })),
    units: [...unitByLabel].map(([label, unit]) => ({
      id: unit.id,
      label,
      seriesId: unit.seriesId,
    })),
  };
}

export function generatedCurveExample(
  definition: ReturnType<typeof nonlinearModelDefinition>,
  relationship: "same_physical_material_across_axis" | "separate_material_per_axis_value",
): string {
  const lines = definition.examplePaste.split(/\r?\n/);
  const seriesIds = new Map<string, string>();
  return lines
    .map((line, index) => {
      if (index === 0) return line;
      const cells = line.split("\t");
      const series = cells[1] ?? "Series";
      let seriesId = seriesIds.get(series);
      if (!seriesId) {
        seriesId = `curve-${seriesIds.size + 1}`;
        seriesIds.set(series, seriesId);
      }
      cells[0] =
        relationship === "same_physical_material_across_axis"
          ? seriesId
          : `${seriesId}-point-${index}`;
      return cells.join("\t");
    })
    .join("\n");
}

export function genericOrderedCurveExample(
  relationship: "same_physical_material_across_axis" | "separate_material_per_axis_value",
): string {
  const unitIds =
    relationship === "same_physical_material_across_axis"
      ? ["unit-1", "unit-1", "unit-1"]
      : ["unit-at-0", "unit-at-1", "unit-at-2"];
  return [
    ORDERED_CURVE_HEADER,
    `${unitIds[0]}\tSeries A\t0\t0`,
    `${unitIds[1]}\tSeries A\t1\t0.4`,
    `${unitIds[2]}\tSeries A\t2\t0.8`,
  ].join("\n");
}

export function isGenericOrderedCurveExample(value: string): boolean {
  return [
    genericOrderedCurveExample("same_physical_material_across_axis"),
    genericOrderedCurveExample("separate_material_per_axis_value"),
  ].includes(value);
}

export function orderedCurveFileSourceKind(file: Pick<File, "name" | "type">): DelimitedSourceKind {
  const lowerName = file.name.toLowerCase();
  if (lowerName.endsWith(".csv") || file.type === "text/csv") return "csv";
  if (lowerName.endsWith(".tsv") || file.type === "text/tab-separated-values") return "tsv";
  return "generic_file";
}

/** Legacy/direct advanced projection retained behind the non-adaptive route. */
export function createLegacyNonlinearDesignData(
  parsed: ParsedNonlinear,
  input: Readonly<{
    xLabel: string;
    yLabel: string;
    yUnit: string;
    modelId: NonlinearModelId;
    rationale: string;
    createdAt: string;
  }>,
) {
  const factorId = "factor.series";
  const outcomeId = "outcome.nonlinear-y";
  const design: ExperimentDesign = {
    schemaVersion: "0.2.0",
    id: "design.nonlinear",
    name: "Nonlinear XY fitting",
    purpose: "custom",
    outcomes: [
      {
        id: outcomeId,
        key: "nonlinear-y",
        label: input.yLabel || "Y",
        type: "continuous",
        ...(input.yUnit ? { unit: input.yUnit } : {}),
      },
    ],
    factors: [
      {
        id: factorId,
        key: "series",
        label: "Series",
        levels: parsed.series.map((series, order) => ({
          id: `level.series.${order + 1}`,
          label: series.label,
          order,
        })),
      },
    ],
    conditions: parsed.series.map((series, order) => ({
      id: series.id,
      label: series.label,
      factorLevels: { [factorId]: `level.series.${order + 1}` },
    })),
    unitLevels: [
      {
        id: "level.reaction",
        key: "reaction",
        label: "Independent reaction / biological unit",
        role: "experimental_unit",
        parentLevelId: null,
      },
    ],
    experimentalUnitLevelId: "level.reaction",
    pairing: { kind: "independent" },
    plannedN: parsed.units.length,
    normalizationPlans: [],
    primaryContrast:
      parsed.series.length >= 2
        ? {
            id: "contrast.nonlinear-series-identity",
            label: `${parsed.series[0]!.label} / ${parsed.series[1]!.label} fit identity (no hypothesis test)`,
            conditionIds: [parsed.series[0]!.id, parsed.series[1]!.id],
          }
        : null,
    wizardRuleVersion: "nonlinear-xy-core-0.1.0",
    wizardDecisions: [
      { questionId: "nonlinear.model", answer: input.modelId },
      { questionId: "nonlinear.model-rationale", answer: input.rationale },
      { questionId: "nonlinear.x-label", answer: input.xLabel },
    ],
    createdAt: input.createdAt,
  };
  const units: UnitInstance[] = parsed.units.map((unit) => ({
    id: unit.id,
    levelId: "level.reaction",
    parentUnitId: null,
    label: unit.label,
    metadata: { seriesId: unit.seriesId },
  }));
  const observations: Observation[] = parsed.points.map((point) => ({
    id: point.observationId,
    rawRevisionId: "raw.nonlinear.1",
    unitInstanceId: point.experimentalUnitId,
    conditionId: point.seriesId,
    outcomeId,
    measurement: { kind: "scalar", value: point.y },
    time: point.x,
    sourceLocation: `pasted XY; ${input.xLabel}=${point.x}`,
  }));
  return { design, units, observations, outcomeId };
}

export function isGeneratedCurveExample(value: string): boolean {
  return NONLINEAR_MODEL_DEFINITIONS.some((definition) =>
    [
      definition.examplePaste,
      generatedCurveExample(definition, "same_physical_material_across_axis"),
      generatedCurveExample(definition, "separate_material_per_axis_value"),
    ].includes(value),
  );
}

export function finiteOptional(value: string, label: string) {
  if (!value.trim()) return undefined;
  const parsed = Number(value);
  if (!Number.isFinite(parsed)) throw new Error(`${label}は有限値にしてください`);
  return parsed;
}

export function orderedCurveStatusMessage(entry: OrderedCurveEntryResult | null): string | null {
  if (!entry || entry.status === "surface_ready") return null;
  const diagnostics = entry.dualWrite.diagnostics;
  if (diagnostics.includes("ORDERED_CURVE_STABLE_ID_NOT_REUSED_ACROSS_AXIS")) {
    return "同じ反応・対象を続けて測った場合は、その対象のUnit IDを複数のX点で同じにしてください。";
  }
  if (diagnostics.includes("ORDERED_CURVE_SEPARATE_MATERIAL_REUSES_ID_ACROSS_AXIS")) {
    return "X点ごとに別の反応・試料を用意した場合は、異なるX点へ同じUnit IDを使わないでください。";
  }
  if (diagnostics.includes("ORDERED_CURVE_UNIT_ID_SPANS_MULTIPLE_SERIES")) {
    return "同じUnit IDが複数のSeriesにあります。IDは変更せず保持しました。Seriesが条件、別run・個体、別readoutのどれを表すかと、共通の由来をもつかを一般の実験設定で確認してください。";
  }
  if (diagnostics.includes("ORDERED_CURVE_DUPLICATE_UNIT_AXIS_POINT_REQUIRES_OBSERVATION_LEVEL")) {
    return "同じUnit ID・Series・Xに複数の値があります。下位の観測単位を定義するまで別の1点へまとめません。";
  }
  if (diagnostics.includes("ORDERED_CURVE_REQUIRES_TWO_AXIS_LEVELS")) {
    return "曲線として扱うには、少なくとも2つの異なるX値が必要です。";
  }
  if (
    diagnostics.includes("ORDERED_CURVE_AXIS_LABEL_REQUIRED") ||
    diagnostics.includes("ORDERED_CURVE_READOUT_LABEL_REQUIRED")
  ) {
    return "Graphと保存用の構造を確定するため、横方向に変えたものと測った値の名前を入力してください。X / Yのままでは意味を推測しません。入力済みの値は保持します。";
  }
  if (diagnostics.includes("AXIS_POINT_PARENT_RELATIONSHIP_UNRESOLVED")) {
    return "別々に用意した試料が同じdonor・animal・dish・実験run・batchなどを共有するか確認してください。推測せず入力済みの値を保持します。";
  }
  if (diagnostics.includes("SEPARATE_AXIS_MATERIAL_HAS_SHARED_PARENT_REQUIRES_HIERARCHY")) {
    return "共通の由来または対応関係をもつ試料です。この簡易曲線表で独立した試料へ読み替えず、親IDを保持できる一般の実験設定で続けてください。入力済みの値は保持します。";
  }
  if (diagnostics.includes("ORDERED_CURVE_SERIES_MEANING_UNRESOLVED")) {
    return "複数のSeriesが比較条件、別run・個体、別readoutのどれを表すか確認してください。推測せず入力済みの値とIDを保持します。";
  }
  if (diagnostics.includes("ORDERED_CURVE_SERIES_PARENT_RELATIONSHIP_UNRESOLVED")) {
    return "異なるSeriesの試料が同じdonor・animal・dish・実験run・batchなどを共有するか確認してください。推測せず入力済みの値とIDを保持します。";
  }
  if (
    diagnostics.includes("ORDERED_CURVE_SERIES_REPLICATES_REQUIRE_RESHAPING") ||
    diagnostics.includes("ORDERED_CURVE_MULTIPLE_READOUTS_REQUIRE_TYPED_READOUTS") ||
    diagnostics.includes("ORDERED_CURVE_SERIES_SHARED_PARENT_REQUIRES_HIERARCHY")
  ) {
    return "Seriesの意味または対応関係をこの簡易曲線表では安全に保持できません。別条件へ読み替えず、入力済みの値とIDを保持して一般の実験設定で続けます。";
  }
  if (
    diagnostics.some((code) =>
      [
        "ORDERED_CURVE_OBSERVATION_ID_INVALID",
        "ORDERED_CURVE_OBSERVATION_ID_DUPLICATE",
        "ORDERED_CURVE_UNIT_ID_REQUIRED",
        "ORDERED_CURVE_SERIES_VALUE_REQUIRED",
        "ORDERED_CURVE_X_MUST_BE_FINITE",
        "ORDERED_CURVE_Y_MUST_BE_FINITE",
      ].includes(code),
    )
  ) {
    return "入力表のUnit ID、Series、X、Yを確認してください。入力済みの値は保持しています。";
  }
  if (entry.status === "dual_write_mismatch" || entry.status === "surface_mismatch") {
    return "実験構造と保存用designの意味が一致しないため停止しました。別のdesignへ変換していません。";
  }
  return "実験構造を安全に確定できないため停止しました。入力済みの値は保持しています。";
}

export function nextOrderedCurveRawRevisionId(state: ProjectState): string {
  let index = state.rawRevisions.length + 1;
  while (state.rawRevisions.some(({ id }) => id === `raw.nonlinear.${index}`)) index += 1;
  return `raw.nonlinear.${index}`;
}

function rawOffsetForTextareaOffset(rawText: string, textareaOffset: number): number {
  let rawOffset = 0;
  let normalizedOffset = 0;
  while (rawOffset < rawText.length && normalizedOffset < textareaOffset) {
    if (rawText[rawOffset] === "\r" && rawText[rawOffset + 1] === "\n") rawOffset += 2;
    else rawOffset += 1;
    normalizedOffset += 1;
  }
  return rawOffset;
}

export function replaceTextareaSelectionWithClipboardText(
  rawText: string,
  clipboardText: string,
  selectionStart: number,
  selectionEnd: number,
): string {
  const rawStart = rawOffsetForTextareaOffset(rawText, selectionStart);
  const rawEnd = rawOffsetForTextareaOffset(rawText, selectionEnd);
  return `${rawText.slice(0, rawStart)}${clipboardText}${rawText.slice(rawEnd)}`;
}

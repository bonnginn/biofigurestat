export type GraphCanvasPreset = "compact" | "standard" | "wide";

export type CategoryLayoutInput = Readonly<{
  gapWeights: readonly number[];
  denseGaps?: readonly boolean[];
  spacing: number;
  sidePadding: number;
  canvasPreset: GraphCanvasPreset;
  requiredSlotWidths?: readonly number[];
}>;

const SLOT_WIDTH: Record<GraphCanvasPreset, number> = {
  compact: 72,
  standard: 88,
  wide: 120,
};

/** Stable category slots: sparse graphs stay compact while hierarchy gaps widen naturally. */
export function createCategoryLayout(input: CategoryLayoutInput) {
  const categoryCount = input.gapWeights.length + 1;
  const baseSlot = SLOT_WIDTH[input.canvasPreset] * input.spacing;
  const offsets = input.gapWeights.reduce<number[]>(
    (current, weight, index) => {
      const labelSafeGap =
        ((input.requiredSlotWidths?.[index] ?? 0) + (input.requiredSlotWidths?.[index + 1] ?? 0)) /
          2 +
        20;
      const minimumGap = input.denseGaps?.[index] ? 0 : labelSafeGap;
      return [...current, current[current.length - 1] + Math.max(baseSlot * weight, minimumGap)];
    },
    categoryCount > 0 ? [0] : [],
  );
  const span = offsets.at(-1) ?? 0;
  const minimumSidePadding = Math.max(68, input.sidePadding);
  return {
    offsets,
    span,
    innerWidth: span + minimumSidePadding * 2,
    sidePadding: minimumSidePadding,
    baseSlot,
  };
}

function niceNumber(value: number, round: boolean): number {
  if (!Number.isFinite(value) || value <= 0) return 1;
  const exponent = Math.floor(Math.log10(value));
  const fraction = value / 10 ** exponent;
  const niceFraction = round
    ? fraction < 1.5
      ? 1
      : fraction < 3
        ? 2
        : fraction < 5
          ? 5
          : 10
    : fraction <= 1
      ? 1
      : fraction <= 2
        ? 2
        : fraction <= 5
          ? 5
          : 10;
  return niceFraction * 10 ** exponent;
}

/** Standard 1/2/5 nice-number ticks, with an optional manual interval. */
export function createNiceTicks(
  minimum: number,
  maximum: number,
  targetTickCount = 5,
  manualInterval: number | null = null,
): readonly number[] {
  if (!Number.isFinite(minimum) || !Number.isFinite(maximum) || maximum <= minimum) {
    return [minimum, maximum].filter(Number.isFinite);
  }
  const interval =
    manualInterval && manualInterval > 0
      ? manualInterval
      : niceNumber((maximum - minimum) / Math.max(2, targetTickCount - 1), true);
  const first = Math.ceil((minimum - Number.EPSILON) / interval) * interval;
  const last = Math.floor((maximum + Number.EPSILON) / interval) * interval;
  const ticks: number[] = [];
  for (let value = first; value <= last + interval * 1e-9; value += interval) {
    ticks.push(Number(value.toPrecision(12)));
    if (ticks.length > 100) break;
  }
  if (ticks.length >= 2) return ticks.reverse();
  return [maximum, minimum];
}

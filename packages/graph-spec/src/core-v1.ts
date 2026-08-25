export type ResolvedSeriesStyle = Readonly<{
  id: string;
  label: string;
  order: number;
  visible: boolean;
  color: string;
  fill: "none" | "white" | "series" | "custom";
  fillColor?: string;
  lineStyle: "solid" | "dashed" | "dotted";
  lineWidth?: number;
  pointStyle: "circle" | "square" | "triangle" | "diamond";
}>;

/** One deterministic source for marks and legends: hidden series never leak into the legend. */
export function resolveVisibleSeries(
  input: readonly ResolvedSeriesStyle[],
): readonly ResolvedSeriesStyle[] {
  return input
    .filter(({ visible }) => visible)
    .sort((first, second) => first.order - second.order || first.id.localeCompare(second.id));
}

export type ComparisonSpan = Readonly<{ id: string; start: number; end: number }>;

/** Interval-partitioning layout for deterministic bracket stacking and collision avoidance. */
export function layoutComparisonBrackets(
  input: readonly ComparisonSpan[],
): readonly (ComparisonSpan & Readonly<{ level: number }>)[] {
  const occupiedByLevel: Array<Array<readonly [number, number]>> = [];
  return [...input]
    .map((span) => ({
      ...span,
      start: Math.min(span.start, span.end),
      end: Math.max(span.start, span.end),
    }))
    .sort(
      (first, second) =>
        first.end - first.start - (second.end - second.start) || first.start - second.start,
    )
    .map((span) => {
      let level = 0;
      while (
        occupiedByLevel[level]?.some(([start, end]) => !(span.end < start || span.start > end))
      ) {
        level += 1;
      }
      (occupiedByLevel[level] ??= []).push([span.start, span.end]);
      return { ...span, level };
    });
}

export function continuousAxisPosition(
  input: Readonly<{
    value: number;
    minimum: number;
    maximum: number;
    scale: "linear" | "log10";
  }>,
): number {
  if (!(input.maximum > input.minimum)) return 0;
  if (input.scale === "log10") {
    if (input.minimum <= 0 || input.value <= 0) return Number.NaN;
    const minimum = Math.log10(input.minimum);
    const maximum = Math.log10(input.maximum);
    return (Math.log10(input.value) - minimum) / (maximum - minimum);
  }
  return (input.value - input.minimum) / (input.maximum - input.minimum);
}

export type FacetEntry<T> = Readonly<{ levelId: string; order: number; value: T }>;

export function resolveFacetOrder<T>(input: readonly FacetEntry<T>[]): readonly FacetEntry<T>[] {
  return [...input].sort(
    (first, second) => first.order - second.order || first.levelId.localeCompare(second.levelId),
  );
}

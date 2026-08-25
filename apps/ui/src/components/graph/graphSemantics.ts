export type BoxWhiskerMode = "tukey_1_5_iqr" | "min_max";

export type BoxWhiskerSummary = Readonly<{
  q1: number;
  median: number;
  q3: number;
  lowerWhisker: number;
  upperWhisker: number;
  outliers: readonly number[];
}>;

function quantile(sortedValues: readonly number[], probability: number): number {
  const position = (sortedValues.length - 1) * probability;
  const lower = Math.floor(position);
  const upper = Math.ceil(position);
  if (lower === upper) return sortedValues[lower]!;
  const fraction = position - lower;
  return sortedValues[lower]! * (1 - fraction) + sortedValues[upper]! * fraction;
}

/** Deterministic box-and-whisker statistics; inference never uses these display summaries. */
export function computeBoxWhiskerSummary(
  values: readonly number[],
  mode: BoxWhiskerMode,
): BoxWhiskerSummary | null {
  const ordered = values.filter(Number.isFinite).sort((a, b) => a - b);
  if (ordered.length === 0) return null;
  const q1 = quantile(ordered, 0.25);
  const median = quantile(ordered, 0.5);
  const q3 = quantile(ordered, 0.75);
  if (mode === "min_max") {
    return {
      q1,
      median,
      q3,
      lowerWhisker: ordered[0]!,
      upperWhisker: ordered.at(-1)!,
      outliers: [],
    };
  }
  const iqr = q3 - q1;
  const lowerFence = q1 - 1.5 * iqr;
  const upperFence = q3 + 1.5 * iqr;
  const inliers = ordered.filter((value) => value >= lowerFence && value <= upperFence);
  return {
    q1,
    median,
    q3,
    lowerWhisker: inliers[0] ?? ordered[0]!,
    upperWhisker: inliers.at(-1) ?? ordered.at(-1)!,
    outliers: ordered.filter((value) => value < lowerFence || value > upperFence),
  };
}

/** Minor tick marks are independent from grid lines and remain inside the numeric domain. */
export function createMinorTicks(
  majorTicks: readonly number[],
  minimum: number,
  maximum: number,
  subdivisions = 5,
): readonly number[] {
  const ordered = [...new Set(majorTicks)].sort((a, b) => a - b);
  if (ordered.length < 2 || subdivisions < 2) return [];
  const ticks: number[] = [];
  for (let index = 1; index < ordered.length; index += 1) {
    const start = ordered[index - 1]!;
    const end = ordered[index]!;
    for (let step = 1; step < subdivisions; step += 1) {
      const value = start + ((end - start) * step) / subdivisions;
      if (value > minimum && value < maximum) ticks.push(Number(value.toPrecision(12)));
    }
  }
  return ticks;
}

const SAFE_READOUT_LABELS: Readonly<Record<string, string>> = {
  ciliated_fraction: "Ciliated fraction",
  normalized_fluorescence: "Normalized fluorescence",
  nuclear_to_cytosol_ratio: "Nuclear/cytosol ratio",
  normalized_cell_area: "Normalized cell area",
  circularity: "Circularity",
};

export function graphDisplayLabel(input: {
  explicitLabel?: string | null;
  designLabel?: string | null;
  internalName: string;
}): string {
  const explicit = input.explicitLabel?.trim();
  if (explicit) return explicit;
  const design = input.designLabel?.trim();
  if (design && design !== input.internalName) return design;
  const safe = SAFE_READOUT_LABELS[input.internalName.trim().toLowerCase()];
  if (safe) return safe;
  const humanized = input.internalName.trim().replaceAll("_", " ").replace(/\s+/g, " ");
  return humanized ? `${humanized[0]!.toUpperCase()}${humanized.slice(1)}` : "Measurement";
}

export function omitGenericCategoricalAxisTitle(title: string): string {
  return /^(condition|group|genotype|time)$/i.test(title.trim()) ? "" : title.trim();
}

export function resolveSeriesLinePresentation(
  style: Readonly<{ lineStyle?: "solid" | "dashed" | "dotted"; lineWidth?: number }> | undefined,
  fallbackWidth: number,
) {
  const lineStyle = style?.lineStyle ?? "solid";
  return {
    lineStyle,
    lineWidth: style?.lineWidth ?? fallbackWidth,
    dashArray: lineStyle === "dashed" ? "8 5" : lineStyle === "dotted" ? "2 4" : undefined,
  } as const;
}

export type HierarchicalAxisLabel = Readonly<{
  levels: readonly Readonly<{ value: string }>[];
}>;

export function buildHierarchyGroups(labels: readonly HierarchicalAxisLabel[]) {
  const depth = Math.max(0, ...labels.map(({ levels }) => levels.length));
  return Array.from({ length: depth }, (_, levelIndex) =>
    labels.reduce<Array<{ key: string; label: string; start: number; end: number }>>(
      (groups, label, index) => {
        const level = label.levels[levelIndex];
        if (!level) return groups;
        const key = label.levels
          .slice(0, levelIndex + 1)
          .map(({ value }) => value)
          .join("\u001f");
        const previous = groups.at(-1);
        if (previous?.key === key) previous.end = index;
        else groups.push({ key, label: level.value, start: index, end: index });
        return groups;
      },
      [],
    ),
  );
}

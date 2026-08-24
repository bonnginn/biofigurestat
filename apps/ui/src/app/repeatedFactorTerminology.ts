export type RepeatedFactorSemantics = Readonly<{
  role: "time" | "numeric_covariate" | "categorical";
  title: string;
  unit: string;
}>;

function fallbackLabel(role: RepeatedFactorSemantics["role"]): string {
  if (role === "time") return "時間";
  if (role === "numeric_covariate") return "数値軸";
  return "反復状態";
}

export function repeatedFactorLabel(factor: RepeatedFactorSemantics | undefined): string {
  return factor?.title.trim() || fallbackLabel(factor?.role ?? "time");
}

export function repeatedFactorAssessmentText(
  factor: RepeatedFactorSemantics,
  unitLabel: string,
): Readonly<{ title: string; reason: string }> {
  const label = repeatedFactorLabel(factor);
  return {
    title: `条件×${label}の反復測定分散分析を推奨`,
    reason: `条件間は独立、${label}軸内は同じ${unitLabel}を追跡します。まず条件×${label}の交互作用を評価し、次に条件と${label}の全体効果を示します。`,
  };
}

export function repeatedFactorCanonicalExplanation(
  factor: RepeatedFactorSemantics | undefined,
): string {
  const label = repeatedFactorLabel(factor);
  return `Conditions use independent experimental units while repeated observations across ${label} preserve stable unit identity; the condition-by-${label} interaction is evaluated first.`;
}

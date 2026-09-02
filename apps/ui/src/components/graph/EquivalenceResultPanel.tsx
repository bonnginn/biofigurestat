import type { EquivalenceAnalysisResult } from "@lsaa/analysis-contracts";

import { localizedText, useAppLocale } from "../../app/appLocale";

type Props = Readonly<{
  result: EquivalenceAnalysisResult;
  comparisonLabels?: Readonly<Record<string, string>>;
}>;

function format(value: number): string {
  return new Intl.NumberFormat(undefined, { maximumSignificantDigits: 6 }).format(value);
}

export function EquivalenceResultPanel({ result, comparisonLabels = {} }: Props) {
  const locale = useAppLocale();
  const t = (ja: string, en: string) => localizedText(locale, ja, en);
  const { lowerBound, upperBound, unit } = result.plan.margin;
  const conclusionLabels = {
    equivalence_supported: t("同等性を支持", "Equivalence supported"),
    meaningful_difference_supported: t("意味のある差を支持", "Meaningful difference supported"),
    inconclusive: t("結論不確定", "Inconclusive"),
  } as const;

  return (
    <section aria-label={t("同等性解析結果", "Equivalence analysis results")}>
      <h3>{t("同等性解析", "Equivalence analysis")}</h3>
      <p>
        {t("事前指定した許容範囲", "Prespecified equivalence range")}: {format(lowerBound)}–
        {format(upperBound)} {unit}
      </p>
      {result.comparisons.map((comparison, index) => {
        const minimum = Math.min(lowerBound, comparison.lowerConfidenceBound, 0);
        const maximum = Math.max(upperBound, comparison.upperConfidenceBound, 0);
        const span = maximum - minimum || 1;
        const x = (value: number) => 24 + ((value - minimum) / span) * 592;
        const label =
          comparisonLabels[comparison.comparisonId] ??
          t(`比較 ${index + 1}`, `Comparison ${index + 1}`);
        return (
          <article key={comparison.comparisonId}>
            <h4>{label}</h4>
            <strong>{conclusionLabels[comparison.conclusion]}</strong>
            <p>
              {t("推定差", "Estimated difference")} {format(comparison.estimate)} {unit};{" "}
              {comparison.confidenceLevel * 100}% CI {format(comparison.lowerConfidenceBound)}–
              {format(comparison.upperConfidenceBound)} {unit}; TOST p ={" "}
              {format(comparison.tostPValue)}
            </p>
            {comparison.analysisSet ? (
              <p>
                {t("完全な対応組", "Complete pairs")}: {comparison.analysisSet.completePairCount}
                {comparison.analysisSet.excludedIncompletePairIds.length > 0
                  ? t(
                      `。解析から除外した不完全な組：${comparison.analysisSet.excludedIncompletePairIds.join("、")}（DataとGraphには保持）`,
                      `. Incomplete pairs excluded from analysis: ${comparison.analysisSet.excludedIncompletePairIds.join(", ")} (retained in Data and Graph)`,
                    )
                  : t("。不完全な組の除外なし", ". No incomplete pairs were excluded")}
              </p>
            ) : null}
            <svg
              viewBox="0 0 640 76"
              role="img"
              aria-label={t(
                `${label}の信頼区間と同等性許容範囲`,
                `Confidence interval and equivalence range for ${label}`,
              )}
            >
              <line x1={24} y1={55} x2={616} y2={55} stroke="currentColor" />
              <rect
                x={x(lowerBound)}
                y={20}
                width={x(upperBound) - x(lowerBound)}
                height={28}
                fill="#dbeafe"
              />
              <line x1={x(0)} y1={15} x2={x(0)} y2={55} stroke="#64748b" />
              <line
                x1={x(comparison.lowerConfidenceBound)}
                y1={34}
                x2={x(comparison.upperConfidenceBound)}
                y2={34}
                stroke="#111827"
                strokeWidth={3}
              />
              <circle cx={x(comparison.estimate)} cy={34} r={5} fill="#2563eb" />
            </svg>
          </article>
        );
      })}
    </section>
  );
}

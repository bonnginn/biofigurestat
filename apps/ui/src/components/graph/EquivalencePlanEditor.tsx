import { useEffect, useState } from "react";
import {
  EquivalenceAnalysisPlanSchema,
  type EquivalenceAnalysisPlan,
  type EquivalenceMargin,
} from "@lsaa/analysis-contracts";

import { localizedText, useAppLocale } from "../../app/appLocale";

type Draft = Readonly<{
  lowerBound: string;
  upperBound: string;
  rationale: string;
  declaredAsPrespecified: boolean;
  claimMode: EquivalenceAnalysisPlan["claimMode"];
  primaryComparisonId: string;
}>;

type ComparisonOption = Readonly<{ id: string; label: string }>;

type Props = Readonly<{
  plan?: EquivalenceAnalysisPlan | null;
  scale: EquivalenceMargin["scale"];
  unit: string;
  comparisonCount: number;
  comparisonOptions?: readonly ComparisonOption[];
  onPlanChange?: (plan: EquivalenceAnalysisPlan | null) => void;
}>;

function initialDraft(plan?: EquivalenceAnalysisPlan | null): Draft {
  return {
    lowerBound: plan ? String(plan.margin.lowerBound) : "",
    upperBound: plan ? String(plan.margin.upperBound) : "",
    rationale: plan?.margin.rationale ?? "",
    declaredAsPrespecified: Boolean(plan),
    claimMode: plan?.claimMode ?? "all_selected_comparisons",
    primaryComparisonId: plan?.primaryComparisonId ?? "",
  };
}

export function EquivalencePlanEditor({
  plan,
  scale,
  unit,
  comparisonCount,
  comparisonOptions = [],
  onPlanChange,
}: Props) {
  const locale = useAppLocale();
  const t = (ja: string, en: string) => localizedText(locale, ja, en);
  const [draft, setDraft] = useState<Draft>(() => initialDraft(plan));
  const [validation, setValidation] = useState<string | null>(null);

  useEffect(() => {
    // An incomplete edit deliberately clears the persisted plan, but must not erase the draft
    // that the researcher is still completing. Non-null plans remain authoritative on reopen.
    if (!plan) return;
    setDraft(initialDraft(plan));
    setValidation(null);
  }, [plan]);

  const commit = (candidate: Draft) => {
    if (!candidate.declaredAsPrespecified) {
      setValidation(null);
      onPlanChange?.(null);
      return;
    }
    const parsed = EquivalenceAnalysisPlanSchema.safeParse({
      schemaVersion: "0.1.0",
      margin: {
        scale,
        lowerBound: Number(candidate.lowerBound),
        upperBound: Number(candidate.upperBound),
        unit,
        ...(candidate.rationale.trim() ? { rationale: candidate.rationale.trim() } : {}),
        declaredAsPrespecified: true,
      },
      alpha: 0.05,
      claimMode: candidate.claimMode,
      ...(candidate.claimMode === "single_primary_comparison"
        ? { primaryComparisonId: candidate.primaryComparisonId }
        : {}),
    });
    if (!parsed.success) {
      setValidation(
        t(
          "下限は0より小さく、上限は0より大きい有限値で指定してください。",
          "Enter a finite lower bound below 0 and an upper bound above 0.",
        ),
      );
      onPlanChange?.(null);
      return;
    }
    setValidation(null);
    onPlanChange?.(parsed.data);
  };

  const update = (patch: Partial<Draft>, commitNow = false) => {
    const candidate = { ...draft, ...patch };
    setDraft(candidate);
    if (commitNow) commit(candidate);
  };

  return (
    <fieldset className="experiment-equivalence-plan">
      <legend>{t("同等性解析の事前計画", "Prespecified equivalence plan")}</legend>
      <p>
        {t(
          "どの程度までの差なら科学的に無視できるかを、観測結果から自動生成せず指定します。",
          "Specify the largest scientifically negligible difference; it is never generated from the observed results.",
        )}
      </p>
      <div className="experiment-equivalence-plan__bounds">
        <label>
          <span>{t("下限", "Lower bound")}</span>
          <input
            type="number"
            step="any"
            value={draft.lowerBound}
            onChange={(event) => update({ lowerBound: event.currentTarget.value })}
            onBlur={() => commit(draft)}
          />
        </label>
        <label>
          <span>{t("上限", "Upper bound")}</span>
          <input
            type="number"
            step="any"
            value={draft.upperBound}
            onChange={(event) => update({ upperBound: event.currentTarget.value })}
            onBlur={() => commit(draft)}
          />
        </label>
        <span>{unit}</span>
      </div>
      <label>
        <span>{t("科学的根拠（任意）", "Scientific rationale (optional)")}</span>
        <textarea
          value={draft.rationale}
          onChange={(event) => update({ rationale: event.currentTarget.value })}
          onBlur={() => commit(draft)}
        />
      </label>
      {comparisonCount > 1 ? (
        <label>
          <span>{t("複数比較で示したい結論", "Claim across multiple comparisons")}</span>
          <select
            value={draft.claimMode}
            onChange={(event) =>
              update(
                {
                  claimMode: event.currentTarget.value as Draft["claimMode"],
                },
                true,
              )
            }
          >
            <option value="all_selected_comparisons">
              {t(
                "選択した比較がすべて同等であること",
                "All selected comparisons must be equivalent",
              )}
            </option>
            <option value="single_primary_comparison">
              {t("事前に決めた1つの主比較", "One prespecified primary comparison")}
            </option>
            <option value="individual_comparison_claims">
              {t(
                "各比較について個別に結論を示す",
                "Make an individual claim for each comparison",
              )}
            </option>
          </select>
        </label>
      ) : null}
      {comparisonCount > 1 && draft.claimMode === "single_primary_comparison" ? (
        <label>
          <span>{t("主比較", "Primary comparison")}</span>
          <select
            value={draft.primaryComparisonId}
            onChange={(event) =>
              update({ primaryComparisonId: event.currentTarget.value }, true)
            }
          >
            <option value="">{t("選択してください", "Select a comparison")}</option>
            {comparisonOptions.map((comparison) => (
              <option key={comparison.id} value={comparison.id}>
                {comparison.label}
              </option>
            ))}
          </select>
        </label>
      ) : null}
      <label>
        <input
          type="checkbox"
          checked={draft.declaredAsPrespecified}
          onChange={(event) =>
            update({ declaredAsPrespecified: event.currentTarget.checked }, true)
          }
        />
        <span>
          {t(
            "この許容範囲は観測結果から自動決定せず、科学的判断として指定しました",
            "I specified these bounds scientifically; they were not generated from the observed results",
          )}
        </span>
      </label>
      {validation ? <p role="alert">{validation}</p> : null}
      {plan ? (
        <p role="status">
          {t(
            "同等性marginをこのGraphの解析計画として保存します。解析方法はまだ実行不可です。",
            "The equivalence margin is saved with this Graph's analysis plan. The method remains non-executable.",
          )}
        </p>
      ) : null}
    </fieldset>
  );
}

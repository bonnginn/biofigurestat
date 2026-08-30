import { DESIGN_SCHEMA_VERSION, ExperimentDesignSchema, type ExperimentDesign } from "@lsaa/domain";

type FactorialPurpose = "western_blot" | "microscopy";

type FactorialOutcome = {
  id: string;
  key: string;
  label: string;
  type: "continuous" | "proportion_counts";
};

export type FactorialDesignDraft = {
  purpose: FactorialPurpose;
  experimentalUnitId: string;
  experimentalUnitKey: string;
  experimentalUnitLabel: string;
  plannedN: number;
  outcome: FactorialOutcome;
  factorAName: string;
  factorALevels: string[];
  factorALevelGroups?: string[];
  factorBName: string;
  factorBLevels: string[];
  factorBLevelGroups?: string[];
};

function buildLevelGroups(labels: string[] | undefined, prefix: "a" | "b") {
  const normalized = (labels ?? []).map((label) => label.trim());
  const uniqueLabels = [...new Set(normalized.filter(Boolean))];
  const definitions = uniqueLabels.map((label, index) => ({
    id: `group.${prefix}.${index + 1}`,
    key: `group_${prefix}_${index + 1}`,
    label,
    order: index,
  }));
  const idByLabel = new Map(definitions.map((group) => [group.label, group.id]));
  return { normalized, definitions, idByLabel };
}

/** Builds a complete independent two-factor design accepted by the approved D05 contract. */
export function buildFactorialDesign(draft: FactorialDesignDraft): ExperimentDesign | null {
  const factorAName = draft.factorAName.trim();
  const factorBName = draft.factorBName.trim();
  const factorALevels = draft.factorALevels.map((level) => level.trim());
  const factorBLevels = draft.factorBLevels.map((level) => level.trim());
  if (
    !factorAName ||
    !factorBName ||
    factorALevels.length < 2 ||
    factorALevels.length > 6 ||
    factorBLevels.length < 2 ||
    factorBLevels.length > 6 ||
    factorALevels.some((level) => !level) ||
    factorBLevels.some((level) => !level) ||
    new Set(factorALevels).size !== factorALevels.length ||
    new Set(factorBLevels).size !== factorBLevels.length
  ) {
    return null;
  }

  const factorAId = "factor.a";
  const factorBId = "factor.b";
  const factorALevelIds = factorALevels.map((_, index) => `level.a.${index + 1}`);
  const factorBLevelIds = factorBLevels.map((_, index) => `level.b.${index + 1}`);
  const factorAGroups = buildLevelGroups(draft.factorALevelGroups, "a");
  const factorBGroups = buildLevelGroups(draft.factorBLevelGroups, "b");
  if (
    (draft.factorALevelGroups?.length &&
      draft.factorALevelGroups.length !== factorALevels.length) ||
    (draft.factorBLevelGroups?.length && draft.factorBLevelGroups.length !== factorBLevels.length)
  ) {
    return null;
  }
  const conditions = factorALevels.flatMap((aLabel, aIndex) =>
    factorBLevels.map((bLabel, bIndex) => ({
      id: `condition.a${aIndex + 1}.b${bIndex + 1}`,
      label: `${aLabel} / ${bLabel}`,
      factorLevels: {
        [factorAId]: factorALevelIds[aIndex],
        [factorBId]: factorBLevelIds[bIndex],
      },
    })),
  );

  try {
    return ExperimentDesignSchema.parse({
      schemaVersion: DESIGN_SCHEMA_VERSION,
      id: `design.${draft.purpose}.factorial.${draft.outcome.id}`,
      name: `${factorAName} × ${factorBName}（${factorALevels.length}×${factorBLevels.length}要因配置）`,
      purpose: draft.purpose,
      outcomes: [draft.outcome],
      factors: [
        {
          id: factorAId,
          key: "factor_a",
          label: factorAName,
          ...(factorAGroups.definitions.length ? { levelGroups: factorAGroups.definitions } : {}),
          levels: factorALevels.map((label, index) => ({
            id: factorALevelIds[index],
            label,
            order: index,
            ...(factorAGroups.normalized[index]
              ? { groupId: factorAGroups.idByLabel.get(factorAGroups.normalized[index]) }
              : {}),
          })),
        },
        {
          id: factorBId,
          key: "factor_b",
          label: factorBName,
          ...(factorBGroups.definitions.length ? { levelGroups: factorBGroups.definitions } : {}),
          levels: factorBLevels.map((label, index) => ({
            id: factorBLevelIds[index],
            label,
            order: index,
            ...(factorBGroups.normalized[index]
              ? { groupId: factorBGroups.idByLabel.get(factorBGroups.normalized[index]) }
              : {}),
          })),
        },
      ],
      conditions,
      unitLevels: [
        {
          id: draft.experimentalUnitId,
          key: draft.experimentalUnitKey,
          label: draft.experimentalUnitLabel,
          role: "experimental_unit",
          parentLevelId: null,
        },
      ],
      experimentalUnitLevelId: draft.experimentalUnitId,
      pairing: { kind: "independent" },
      plannedN: draft.plannedN,
      normalizationPlans: [],
      primaryContrast: {
        id: "contrast.factorial-extremes",
        label: `${conditions[0].label} と ${conditions[conditions.length - 1].label} の主比較`,
        conditionIds: [conditions[0].id, conditions[conditions.length - 1].id],
      },
      wizardRuleVersion: "factorial-independent-0.1.0",
      wizardDecisions: [
        { questionId: "comparison-kind", answer: "factorial-independent" },
        { questionId: "assignment-relationship", answer: "independent" },
        { questionId: "experimental-unit", answer: draft.experimentalUnitKey },
        { questionId: "factor-a-name", answer: factorAName },
        { questionId: "factor-a-levels", answer: factorALevels },
        { questionId: "factor-b-name", answer: factorBName },
        { questionId: "factor-b-levels", answer: factorBLevels },
      ],
      createdAt: new Date().toISOString(),
    });
  } catch {
    return null;
  }
}

export type TwoByTwoFactorialDraft = FactorialDesignDraft & {
  factorALevels: [string, string];
  factorBLevels: [string, string];
};

/** Compatibility wrapper for callers and saved fixtures created by the first 2×2 UI. */
export function buildTwoByTwoFactorialDesign(
  draft: TwoByTwoFactorialDraft,
): ExperimentDesign | null {
  return buildFactorialDesign(draft);
}

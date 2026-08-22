import { useMemo, useState } from "react";

import {
  recommendD09,
  recommendD01OrD02,
  recommendD03,
  recommendD04,
  recommendD05,
} from "@lsaa/analysis-contracts";
import {
  createIndependentMultiConditionDataSheet,
  createRepeatedConditionDataSheet,
  createTwoConditionDataSheet,
  type IndependentMultiConditionDataSheet,
  type RepeatedConditionDataSheet,
  type TwoConditionDataSheet,
} from "@lsaa/data-sheet";
import { DESIGN_SCHEMA_VERSION, ExperimentDesignSchema, type ExperimentDesign } from "@lsaa/domain";

import type { AnalysisRunner } from "../app/analysisClient";
import { buildFactorialDesign } from "../app/factorialDesign";
import {
  defaultProjectMetadataDraft,
  metadataDraftIsComplete,
  type ProjectMetadataDraft,
} from "../app/projectMetadata";
import type { SaveProjectAction } from "../app/projectActions";
import { methodLabel, recommendationExplanation } from "../app/recommendationLabels";
import {
  ExperimentPatternPreview,
  type ExperimentPatternPreviewKind,
} from "../components/ExperimentPatternPreview";
import { DataSheetPage } from "./DataSheetPage";
import { MultiConditionDataSheetPage } from "./MultiConditionDataSheetPage";
import type { VisualPatternPreset } from "./VisualPatternGallery";

type ComparisonWizardProps = {
  purpose: "western_blot" | "microscopy";
  onBack: () => void;
  analysisRunner?: AnalysisRunner;
  saveProject?: SaveProjectAction;
  initialMetadata?: ProjectMetadataDraft;
  initialPattern?: VisualPatternPreset;
};

type Relationship = "independent" | "matched" | "blocked";
type ComparisonKind =
  | "two-condition-continuous"
  | "correlation"
  | "multi-group-independent"
  | "multi-group-matched"
  | "factorial-independent";
type UnitKind = "dish" | "animal" | "donor" | "sample" | "tracked-cell";
type OutcomeChoice =
  "wb-loading-control-ratio" | "wb-intensity" | "microscopy-intensity" | "positive-cell-proportion";
type CorrelationRelationshipForm = "linear" | "monotonic_or_ranked";
type ComparisonFamily = "independent-groups" | "repeated-units" | "correlation";

type OutcomeSpec = {
  choice: OutcomeChoice;
  id: string;
  key: string;
  label: string;
  type: "continuous" | "proportion_counts";
  description: string;
  measurementMode?: "loading_control_ratio";
};

const PURPOSE_LABELS: Record<ComparisonWizardProps["purpose"], string> = {
  western_blot: "ウェスタンブロット（WB）",
  microscopy: "顕微鏡解析",
};

const UNIT_LABELS: Record<UnitKind, string> = {
  dish: "ディッシュ／サンプル",
  animal: "動物",
  donor: "ドナー",
  sample: "サンプル",
  "tracked-cell": "追跡細胞・単位",
};

const OUTCOME_OPTIONS: Record<ComparisonWizardProps["purpose"], OutcomeSpec[]> = {
  western_blot: [
    {
      choice: "wb-loading-control-ratio",
      id: "outcome.loading-control-wb-ratio",
      key: "loading_control_wb_ratio",
      label: "WB生バンド（標的／ローディングコントロール）",
      type: "continuous",
      description:
        "実験単位ごとに標的バンドとローディングコントロールを入力し、比を自動計算します（推奨）。",
      measurementMode: "loading_control_ratio",
    },
    {
      choice: "wb-intensity",
      id: "outcome.normalized-wb-intensity",
      key: "normalized_wb_intensity",
      label: "正規化WB強度",
      type: "continuous",
      description: "すでに正規化済みのバンド強度を、実験単位ごとに1つ入力します。",
    },
  ],
  microscopy: [
    {
      choice: "microscopy-intensity",
      id: "outcome.microscopy-intensity",
      key: "microscopy_intensity",
      label: "顕微鏡強度",
      type: "continuous",
      description: "実験単位ごとに強度を1つ入力します。",
    },
    {
      choice: "positive-cell-proportion",
      id: "outcome.positive-cell-proportion",
      key: "positive_cell_proportion",
      label: "陽性細胞率 (%)",
      type: "proportion_counts",
      description: "陽性細胞数と総細胞数を入力し、割合を自動計算します。",
    },
  ],
};

function unitLevel(
  kind: UnitKind,
  role: "experimental_unit" | "block",
  parentLevelId: string | null,
) {
  return {
    id: `unit.${kind}`,
    key: kind,
    label: UNIT_LABELS[kind],
    role,
    parentLevelId,
  } as const;
}

function buildDesign({
  purpose,
  relationship,
  experimentalUnit,
  conditionA,
  conditionB,
  plannedN,
  outcome,
  correlationRelationshipForm,
}: {
  purpose: ComparisonWizardProps["purpose"];
  relationship: Relationship;
  experimentalUnit: UnitKind;
  conditionA: string;
  conditionB: string;
  plannedN: number;
  outcome: OutcomeSpec;
  correlationRelationshipForm?: CorrelationRelationshipForm;
}): ExperimentDesign | null {
  if (!conditionA.trim() || !conditionB.trim()) return null;

  const conditionIds = ["condition.a", "condition.b"] as [string, string];
  const experimentalUnitId = `unit.${experimentalUnit}`;
  const blockLevelId = "unit.run";
  const levels =
    relationship === "blocked"
      ? [
          {
            id: blockLevelId,
            key: "run",
            label: "独立ラン／バッチ",
            role: "block" as const,
            parentLevelId: null,
          },
          unitLevel(experimentalUnit, "experimental_unit", blockLevelId),
        ]
      : [unitLevel(experimentalUnit, "experimental_unit", null)];

  const pairing =
    relationship === "independent"
      ? ({ kind: "independent" } as const)
      : relationship === "matched"
        ? ({
            kind: "matched",
            matchLevelId: experimentalUnitId,
            completePairsRequired: true,
          } as const)
        : ({
            kind: "blocked",
            blockLevelId,
            completePairsRequired: true,
            explicitlyRequested: true,
          } as const);

  try {
    return ExperimentDesignSchema.parse({
      schemaVersion: DESIGN_SCHEMA_VERSION,
      id: `design.${purpose}.two-condition.${outcome.choice}`,
      name: `${PURPOSE_LABELS[purpose]} two-condition comparison`,
      purpose,
      outcomes: [
        {
          id: outcome.id,
          key: outcome.key,
          label: outcome.label,
          type: outcome.type,
        },
      ],
      factors: [
        {
          id: "factor.condition",
          key: "condition",
          label: "条件",
          levels: [
            { id: "level.a", label: conditionA.trim(), order: 0 },
            { id: "level.b", label: conditionB.trim(), order: 1 },
          ],
        },
      ],
      conditions: [
        {
          id: conditionIds[0],
          label: conditionA.trim(),
          factorLevels: { "factor.condition": "level.a" },
        },
        {
          id: conditionIds[1],
          label: conditionB.trim(),
          factorLevels: { "factor.condition": "level.b" },
        },
      ],
      unitLevels: levels,
      experimentalUnitLevelId: experimentalUnitId,
      pairing,
      plannedN,
      normalizationPlans: outcome.measurementMode
        ? [
            {
              id: "normalization.loading-control",
              method: "loading_control",
              parameters: { transformationVersion: "0.1.0" },
            },
          ]
        : [],
      primaryContrast: {
        id: "contrast.a-b",
        label: `${conditionA.trim()} と ${conditionB.trim()} の比較`,
        conditionIds,
      },
      wizardRuleVersion: "pairing-blocking-0.1.0",
      wizardDecisions: [
        {
          questionId: "comparison-kind",
          answer: correlationRelationshipForm ? "correlation" : "two-condition-continuous",
        },
        { questionId: "outcome", answer: outcome.choice },
        ...(purpose === "western_blot"
          ? [
              {
                questionId: "wb-input-mode",
                answer: outcome.measurementMode ? "raw-band-loading-control" : "already-normalized",
              },
            ]
          : []),
        { questionId: "assignment-relationship", answer: relationship },
        { questionId: "experimental-unit", answer: experimentalUnit },
        { questionId: "separate-dishes-are-independent", answer: relationship === "independent" },
        ...(correlationRelationshipForm
          ? [{ questionId: "correlation.relationship_form", answer: correlationRelationshipForm }]
          : []),
      ],
      createdAt: new Date().toISOString(),
    });
  } catch {
    return null;
  }
}

function buildMultiGroupDesign({
  purpose,
  experimentalUnit,
  conditionLabels,
  conditionGroups,
  plannedN,
  outcome,
  relationship,
}: {
  purpose: ComparisonWizardProps["purpose"];
  experimentalUnit: UnitKind;
  conditionLabels: string[];
  conditionGroups?: string[];
  plannedN: number;
  outcome: OutcomeSpec;
  relationship: "independent" | "matched";
}): ExperimentDesign | null {
  const labels = conditionLabels.map((label) => label.trim());
  if (labels.length < 3 || labels.some((label) => label.length === 0)) return null;
  const groups = (conditionGroups ?? []).map((label) => label.trim());
  const groupLabels = labels.map((_, index) => groups[index] ?? "");
  const uniqueGroupLabels = Array.from(new Set(groupLabels.filter((label) => label.length > 0)));
  const groupIdByLabel = new Map(
    uniqueGroupLabels.map((label, index) => [label, `group.${index + 1}`]),
  );
  const levelGroups = uniqueGroupLabels.map((label, index) => ({
    id: `group.${index + 1}`,
    key: `group-${index + 1}`,
    label,
    order: index,
  }));
  const factorLevels = labels.map((label, index) => ({
    id: `level.${index + 1}`,
    label,
    order: index,
    ...(groupIdByLabel.get(groupLabels[index])
      ? { groupId: groupIdByLabel.get(groupLabels[index]) }
      : {}),
  }));
  const conditions = labels.map((label, index) => ({
    id: `condition.${index + 1}`,
    label,
    factorLevels: { "factor.condition": `level.${index + 1}` },
  }));
  try {
    return ExperimentDesignSchema.parse({
      schemaVersion: DESIGN_SCHEMA_VERSION,
      id: `design.${purpose}.multi-group.${outcome.choice}`,
      name: `${PURPOSE_LABELS[purpose]} multi-group comparison`,
      purpose,
      outcomes: [{ id: outcome.id, key: outcome.key, label: outcome.label, type: outcome.type }],
      factors: [
        {
          id: "factor.condition",
          key: "condition",
          label: "条件",
          levels: factorLevels,
          ...(levelGroups.length > 0 ? { levelGroups } : {}),
        },
      ],
      conditions,
      unitLevels: [unitLevel(experimentalUnit, "experimental_unit", null)],
      experimentalUnitLevelId: `unit.${experimentalUnit}`,
      pairing:
        relationship === "matched"
          ? {
              kind: "matched",
              matchLevelId: `unit.${experimentalUnit}`,
              completePairsRequired: true,
            }
          : { kind: "independent" },
      plannedN,
      normalizationPlans: [],
      primaryContrast: {
        id: "contrast.primary",
        label: `${labels[0]} と ${labels[1]} の主比較`,
        conditionIds: [conditions[0].id, conditions[1].id],
      },
      wizardRuleVersion: `multi-group-${relationship}-0.1.0`,
      wizardDecisions: [
        { questionId: "comparison-kind", answer: `multi-group-${relationship}` },
        { questionId: "assignment-relationship", answer: relationship },
        { questionId: "outcome", answer: outcome.choice },
        { questionId: "experimental-unit", answer: experimentalUnit },
        { questionId: "condition-labels", answer: labels },
        ...(levelGroups.length > 0
          ? [{ questionId: "condition-scientific-groups", answer: groupLabels }]
          : []),
      ],
      createdAt: new Date().toISOString(),
    });
  } catch {
    return null;
  }
}

function statisticalUnitLabel(relationship: Relationship, unit: UnitKind) {
  if (relationship === "blocked") return `完全なラン／バッチ（各ラン内の${UNIT_LABELS[unit]}）`;
  if (relationship === "matched") return `対応のある${UNIT_LABELS[unit]}`;
  return `独立した${UNIT_LABELS[unit]}`;
}

export function ComparisonWizard({
  purpose,
  onBack,
  analysisRunner,
  saveProject,
  initialMetadata,
  initialPattern,
}: ComparisonWizardProps) {
  const [relationship, setRelationship] = useState<Relationship>(
    initialPattern?.templateId === "D02" ||
      initialPattern?.templateId === "D04" ||
      initialPattern?.templateId === "D09"
      ? "matched"
      : "independent",
  );
  const [comparisonKind, setComparisonKind] = useState<ComparisonKind>(
    initialPattern?.templateId === "D09"
      ? "correlation"
      : initialPattern?.templateId === "D05"
        ? "factorial-independent"
        : initialPattern?.templateId === "D03"
          ? "multi-group-independent"
          : initialPattern?.templateId === "D04"
            ? "multi-group-matched"
            : "two-condition-continuous",
  );
  const [experimentalUnit, setExperimentalUnit] = useState<UnitKind>(
    initialPattern?.templateId === "D02" || initialPattern?.templateId === "D04"
      ? "animal"
      : "dish",
  );
  const [conditionA, setConditionA] = useState(
    initialPattern
      ? initialPattern.templateId === "D02"
        ? "時点1"
        : initialPattern.templateId === "D09"
          ? "測定値X"
          : "条件A"
      : "対照",
  );
  const [conditionB, setConditionB] = useState(
    initialPattern
      ? initialPattern.templateId === "D02"
        ? "時点2"
        : initialPattern.templateId === "D09"
          ? "測定値Y"
          : "条件B"
      : "処理",
  );
  const [multiConditionLabels, setMultiConditionLabels] = useState(() =>
    initialPattern?.templateId === "D03" && initialPattern.multiGroupPreset === "sirna-series"
      ? ["Control", "siRNA #1", "siRNA #2", "siRNA #3"]
      : initialPattern?.templateId === "D03" || initialPattern?.templateId === "D04"
        ? Array.from(
            { length: initialPattern.conditionCount },
            (_, index) => `条件${String.fromCharCode(65 + index)}`,
          )
        : ["対照", "処理A", "処理B"],
  );
  const [multiConditionGroups, setMultiConditionGroups] = useState(() =>
    initialPattern?.templateId === "D03" && initialPattern.multiGroupPreset === "sirna-series"
      ? ["対照群", "標的群", "標的群", "標的群"]
      : [],
  );
  const startsWithSirnaPreset = initialPattern?.factorialPreset === "sirna-drug";
  const [factorAName, setFactorAName] = useState(startsWithSirnaPreset ? "siRNA" : "処置A");
  const [factorALevels, setFactorALevels] = useState<string[]>(
    startsWithSirnaPreset ? ["Control", "siRNA #1", "siRNA #2", "siRNA #3"] : ["なし", "あり"],
  );
  const [factorALevelGroups, setFactorALevelGroups] = useState<string[]>(
    startsWithSirnaPreset ? ["対照群", "標的群", "標的群", "標的群"] : [],
  );
  const [factorBName, setFactorBName] = useState(startsWithSirnaPreset ? "薬剤" : "処置B");
  const [factorBLevels, setFactorBLevels] = useState<string[]>(
    startsWithSirnaPreset ? ["−", "+"] : ["なし", "あり"],
  );
  const [plannedN, setPlannedN] = useState(initialPattern?.plannedN ?? 3);
  const [correlationRelationshipForm, setCorrelationRelationshipForm] =
    useState<CorrelationRelationshipForm>("linear");
  const [confirmed, setConfirmed] = useState(false);
  const [selectedOutcome, setSelectedOutcome] = useState<OutcomeChoice | null>(null);
  const [sheet, setSheet] = useState<
    TwoConditionDataSheet | IndependentMultiConditionDataSheet | RepeatedConditionDataSheet | null
  >(null);
  const [metadataDraft, setMetadataDraft] = useState<ProjectMetadataDraft>(
    initialMetadata ?? defaultProjectMetadataDraft(purpose),
  );

  const outcome =
    OUTCOME_OPTIONS[purpose].find((candidate) => candidate.choice === selectedOutcome) ??
    OUTCOME_OPTIONS[purpose][0];

  const design = useMemo(() => {
    if (comparisonKind === "factorial-independent") {
      return buildFactorialDesign({
        purpose,
        experimentalUnitId: `unit.${experimentalUnit}`,
        experimentalUnitKey: experimentalUnit,
        experimentalUnitLabel: UNIT_LABELS[experimentalUnit],
        plannedN,
        outcome,
        factorAName,
        factorALevels,
        factorALevelGroups,
        factorBName,
        factorBLevels,
      });
    }
    if (comparisonKind !== "two-condition-continuous" && comparisonKind !== "correlation") {
      return buildMultiGroupDesign({
        purpose,
        experimentalUnit,
        conditionLabels: multiConditionLabels,
        conditionGroups:
          comparisonKind === "multi-group-independent" ? multiConditionGroups : undefined,
        plannedN,
        outcome,
        relationship: comparisonKind === "multi-group-matched" ? "matched" : "independent",
      });
    }
    return buildDesign({
      purpose,
      relationship,
      experimentalUnit,
      conditionA,
      conditionB,
      plannedN,
      outcome,
      ...(comparisonKind === "correlation" ? { correlationRelationshipForm } : {}),
    });
  }, [
    comparisonKind,
    purpose,
    relationship,
    experimentalUnit,
    conditionA,
    conditionB,
    multiConditionLabels,
    multiConditionGroups,
    factorAName,
    factorALevels,
    factorALevelGroups,
    factorBName,
    factorBLevels,
    plannedN,
    outcome,
    correlationRelationshipForm,
  ]);
  const matchResult = useMemo(() => {
    if (!design) return null;
    if (comparisonKind === "multi-group-independent") return recommendD03(design);
    if (comparisonKind === "multi-group-matched") return recommendD04(design);
    if (comparisonKind === "factorial-independent") return recommendD05(design);
    if (comparisonKind === "correlation") return recommendD09(design);
    return recommendD01OrD02(design);
  }, [comparisonKind, design]);
  const recommendation = matchResult?.matched ? matchResult.recommendation : null;

  if (
    sheet &&
    design &&
    recommendation &&
    comparisonKind !== "two-condition-continuous" &&
    sheet.conditions.length >= 3
  ) {
    return (
      <MultiConditionDataSheetPage
        design={design}
        recommendation={recommendation}
        sheet={sheet as IndependentMultiConditionDataSheet | RepeatedConditionDataSheet}
        outcomeLabel={outcome.label}
        analysisRunner={analysisRunner}
        saveProject={saveProject}
        metadataDraft={metadataDraft}
        onBack={() => {
          setSheet(null);
          setSelectedOutcome(null);
        }}
      />
    );
  }

  if (
    sheet &&
    design &&
    recommendation &&
    (comparisonKind === "two-condition-continuous" || comparisonKind === "correlation") &&
    sheet.conditions.length === 2
  ) {
    return (
      <DataSheetPage
        design={design}
        recommendation={recommendation}
        sheet={sheet as TwoConditionDataSheet}
        outcomeLabel={outcome.label}
        analysisRunner={analysisRunner}
        saveProject={saveProject}
        metadataDraft={metadataDraft}
        onBack={() => {
          setSheet(null);
          setSelectedOutcome(null);
        }}
      />
    );
  }

  const updateRelationship = (next: Relationship) => {
    if (comparisonKind !== "two-condition-continuous") return;
    setRelationship(next);
    setConfirmed(false);
    setSelectedOutcome(null);
    setSheet(null);
    if (next === "matched") setExperimentalUnit("animal");
    if (next === "independent") setExperimentalUnit("dish");
  };

  const updateComparisonKind = (next: ComparisonKind) => {
    setComparisonKind(next);
    setConfirmed(false);
    setSelectedOutcome(null);
    setSheet(null);
    if (next === "multi-group-independent" || next === "factorial-independent") {
      setRelationship("independent");
      setExperimentalUnit("dish");
    } else if (next === "multi-group-matched") {
      setRelationship("matched");
      setExperimentalUnit("animal");
    } else if (next === "correlation") {
      setRelationship("matched");
      setExperimentalUnit("dish");
      // Keep the correlation entry point semantically clear without
      // overwriting labels the user has already customized.
      if (conditionA === "対照" && conditionB === "処理") {
        setConditionA("測定値X");
        setConditionB("測定値Y");
      }
    }
  };

  const comparisonFamily: ComparisonFamily =
    comparisonKind === "correlation"
      ? "correlation"
      : comparisonKind === "multi-group-matched" ||
          (comparisonKind === "two-condition-continuous" && relationship === "matched")
        ? "repeated-units"
        : "independent-groups";

  const previewKind: ExperimentPatternPreviewKind =
    comparisonKind === "correlation"
      ? "correlation"
      : comparisonKind === "factorial-independent"
        ? "factorial"
        : comparisonFamily === "repeated-units"
          ? "repeated"
          : comparisonKind === "multi-group-independent"
            ? "multi-group"
            : "two-condition";

  const previewConditionLabels =
    previewKind === "two-condition" || previewKind === "correlation"
      ? [conditionA, conditionB]
      : multiConditionLabels;

  const resizeMultiConditions = (count: number) => {
    const bounded = Math.max(3, Math.min(12, Math.trunc(count)));
    setMultiConditionLabels((previous) =>
      Array.from(
        { length: bounded },
        (_, index) => previous[index] ?? `条件${String.fromCharCode(65 + index)}`,
      ),
    );
    setMultiConditionGroups((previous) =>
      Array.from({ length: bounded }, (_, index) => previous[index] ?? ""),
    );
    setConfirmed(false);
    setSelectedOutcome(null);
    setSheet(null);
  };

  const selectComparisonFamily = (family: ComparisonFamily) => {
    if (family === "correlation") {
      updateComparisonKind("correlation");
      return;
    }
    if (family === "repeated-units") {
      updateComparisonKind("two-condition-continuous");
      setRelationship("matched");
      setExperimentalUnit("animal");
      return;
    }
    updateComparisonKind("two-condition-continuous");
    setRelationship("independent");
    setExperimentalUnit("dish");
  };

  const updateOneFactorConditionCount = (value: string, matched: boolean) => {
    const parsed = Number(value);
    if (!Number.isInteger(parsed) || parsed < 2 || parsed > 12) return;
    if (parsed === 2) {
      updateComparisonKind("two-condition-continuous");
      setRelationship(matched ? "matched" : "independent");
      if (matched) setExperimentalUnit("animal");
      return;
    }
    resizeMultiConditions(parsed);
    updateComparisonKind(matched ? "multi-group-matched" : "multi-group-independent");
  };

  const updateCondition = (setter: (value: string) => void, value: string) => {
    setter(value);
    setConfirmed(false);
    setSelectedOutcome(null);
    setSheet(null);
  };

  const updateMultiCondition = (index: number, value: string) => {
    setMultiConditionLabels((previous) =>
      previous.map((label, labelIndex) => (labelIndex === index ? value : label)),
    );
    setConfirmed(false);
    setSelectedOutcome(null);
    setSheet(null);
  };

  const updateFactorText = (setter: (value: string) => void, value: string) => {
    setter(value);
    setConfirmed(false);
    setSelectedOutcome(null);
    setSheet(null);
  };

  const updateFactorLevel = (
    setter: (value: string[]) => void,
    levels: string[],
    index: number,
    value: string,
  ) => {
    setter(levels.map((level, levelIndex) => (levelIndex === index ? value : level)));
    setConfirmed(false);
    setSelectedOutcome(null);
    setSheet(null);
  };

  const updateFactorLevelGroup = (index: number, value: string) => {
    setFactorALevelGroups((previous) =>
      factorALevels.map((_, levelIndex) =>
        levelIndex === index ? value : (previous[levelIndex] ?? ""),
      ),
    );
    setConfirmed(false);
    setSelectedOutcome(null);
    setSheet(null);
  };

  const addFactorLevel = (
    setter: (value: string[]) => void,
    levels: string[],
    factorLabel: "A" | "B",
  ) => {
    if (levels.length >= 6) return;
    setter([...levels, `条件${factorLabel}${levels.length + 1}`]);
    if (factorLabel === "A") {
      setFactorALevelGroups((previous) => [
        ...factorALevels.map((_, index) => previous[index] ?? ""),
        "",
      ]);
    }
    setConfirmed(false);
    setSelectedOutcome(null);
    setSheet(null);
  };

  const removeFactorLevel = (
    setter: (value: string[]) => void,
    levels: string[],
    index: number,
    factorLabel: "A" | "B",
  ) => {
    if (levels.length <= 2) return;
    setter(levels.filter((_, levelIndex) => levelIndex !== index));
    if (factorLabel === "A") {
      setFactorALevelGroups((previous) => previous.filter((_, levelIndex) => levelIndex !== index));
    }
    setConfirmed(false);
    setSelectedOutcome(null);
    setSheet(null);
  };

  const applySirnaFactorPreset = () => {
    setFactorAName("siRNA");
    setFactorALevels(["Control", "siRNA #1", "siRNA #2", "siRNA #3"]);
    setFactorALevelGroups(["対照群", "標的群", "標的群", "標的群"]);
    setFactorBName("薬剤");
    setFactorBLevels(["−", "+"]);
    setConfirmed(false);
    setSelectedOutcome(null);
    setSheet(null);
  };

  const addMultiCondition = () => {
    if (multiConditionLabels.length >= 12) return;
    setMultiConditionLabels((previous) => [...previous, `条件${previous.length + 1}`]);
    setMultiConditionGroups((previous) => [...previous, ""]);
    setConfirmed(false);
    setSelectedOutcome(null);
    setSheet(null);
  };

  const removeMultiCondition = (index: number) => {
    if (multiConditionLabels.length <= 3) return;
    setMultiConditionLabels((previous) => previous.filter((_, labelIndex) => labelIndex !== index));
    setMultiConditionGroups((previous) => previous.filter((_, labelIndex) => labelIndex !== index));
    setConfirmed(false);
    setSelectedOutcome(null);
    setSheet(null);
  };

  const updateMultiConditionGroup = (index: number, value: string) => {
    setMultiConditionGroups((previous) => {
      const next = [...previous];
      while (next.length < multiConditionLabels.length) next.push("");
      next[index] = value;
      return next;
    });
    setConfirmed(false);
    setSelectedOutcome(null);
    setSheet(null);
  };

  const updatePlannedN = (value: string) => {
    setPlannedN(
      Math.max(
        comparisonKind === "correlation"
          ? 3
          : comparisonKind === "two-condition-continuous"
            ? 1
            : 2,
        Number(value) || 1,
      ),
    );
    setConfirmed(false);
    setSelectedOutcome(null);
    setSheet(null);
  };

  const updateExperimentalUnit = (value: string) => {
    setExperimentalUnit(value as UnitKind);
    setConfirmed(false);
    setSelectedOutcome(null);
    setSheet(null);
  };

  const confirmDesign = () => {
    setConfirmed(true);
    setSelectedOutcome(null);
    setSheet(null);
  };

  const createSheetForOutcome = (choice: OutcomeChoice) => {
    const nextOutcome = OUTCOME_OPTIONS[purpose].find((candidate) => candidate.choice === choice);
    if (!nextOutcome) return;
    const nextDesign =
      comparisonKind === "factorial-independent"
        ? buildFactorialDesign({
            purpose,
            experimentalUnitId: `unit.${experimentalUnit}`,
            experimentalUnitKey: experimentalUnit,
            experimentalUnitLabel: UNIT_LABELS[experimentalUnit],
            plannedN,
            outcome: nextOutcome,
            factorAName,
            factorALevels,
            factorALevelGroups,
            factorBName,
            factorBLevels,
          })
        : comparisonKind !== "two-condition-continuous" && comparisonKind !== "correlation"
          ? buildMultiGroupDesign({
              purpose,
              experimentalUnit,
              conditionLabels: multiConditionLabels,
              conditionGroups:
                comparisonKind === "multi-group-independent" ? multiConditionGroups : undefined,
              plannedN,
              outcome: nextOutcome,
              relationship: comparisonKind === "multi-group-matched" ? "matched" : "independent",
            })
          : buildDesign({
              purpose,
              relationship: comparisonKind === "correlation" ? "matched" : relationship,
              experimentalUnit,
              conditionA,
              conditionB,
              plannedN,
              outcome: nextOutcome,
              ...(comparisonKind === "correlation" ? { correlationRelationshipForm } : {}),
            });
    if (!nextDesign) return;
    setSelectedOutcome(choice);
    setSheet(
      comparisonKind === "multi-group-independent" || comparisonKind === "factorial-independent"
        ? createIndependentMultiConditionDataSheet(
            nextDesign,
            nextOutcome.id,
            metadataDraft.experimentDate,
          )
        : comparisonKind === "multi-group-matched"
          ? createRepeatedConditionDataSheet(
              nextDesign,
              nextOutcome.id,
              metadataDraft.experimentDate,
            )
          : createTwoConditionDataSheet(
              nextDesign,
              nextOutcome.id,
              nextOutcome.measurementMode,
              metadataDraft.experimentDate,
            ),
    );
  };

  return (
    <div className="page-stack narrow-page">
      <button className="back-link" type="button" onClick={onBack}>
        <span aria-hidden="true">←</span> 測定方法の選択に戻る
      </button>

      <section className="wizard-intro" aria-labelledby="wizard-heading">
        <div>
          <p className="overline">実験デザイン</p>
          <h1 id="wizard-heading">
            {comparisonKind === "correlation"
              ? "2つの測定値の関係を設計する"
              : comparisonKind === "factorial-independent"
                ? "2種類の処置を組み合わせた実験を設計する"
                : comparisonFamily === "repeated-units"
                  ? "同じ実験単位を繰り返し測定する"
                  : "別々の実験群を比べる"}
          </h1>
          <p>実験で行った操作を答えてください。解析前に比較構造と推奨手法を表示します。</p>
          <p className="hero-japanese">統計用語ではなく、実験の操作から設計を確認します。</p>
        </div>
        <span className="wizard-purpose-chip">{PURPOSE_LABELS[purpose]}</span>
      </section>

      <details className="metadata-disclosure">
        <summary>プロジェクト情報（保存時に記録）</summary>
        <div className="metadata-form-grid">
          <label className="field-label">
            プロジェクト名 <span aria-hidden="true">*</span>
            <input
              required
              value={metadataDraft.projectName}
              onChange={(event) =>
                setMetadataDraft((previous) => ({ ...previous, projectName: event.target.value }))
              }
            />
          </label>
          <label className="field-label">
            最初の実験日 <span aria-hidden="true">*</span>
            <input
              required
              type="date"
              value={metadataDraft.experimentDate}
              onChange={(event) =>
                setMetadataDraft((previous) => ({
                  ...previous,
                  experimentDate: event.target.value,
                }))
              }
            />
            <small>入力シートでは、実験単位ごとに別の日付を記録できます。</small>
          </label>
          <label className="field-label">
            実施者（任意）
            <input
              value={metadataDraft.operator ?? ""}
              onChange={(event) =>
                setMetadataDraft((previous) => ({ ...previous, operator: event.target.value }))
              }
            />
          </label>
          <label className="field-label">
            バッチ／ロット（任意）
            <input
              value={metadataDraft.batch ?? ""}
              onChange={(event) =>
                setMetadataDraft((previous) => ({ ...previous, batch: event.target.value }))
              }
            />
          </label>
          <label className="field-label metadata-note-field">
            メモ（任意）
            <textarea
              value={metadataDraft.note ?? ""}
              rows={2}
              onChange={(event) =>
                setMetadataDraft((previous) => ({ ...previous, note: event.target.value }))
              }
            />
          </label>
        </div>
      </details>

      <section className="wizard-step-card" aria-labelledby="comparison-step-heading">
        <div className="wizard-step-heading">
          <span className="step-number">01</span>
          <div>
            <p className="overline">最初の質問</p>
            <h2 id="comparison-step-heading">実験単位をどのように測定しましたか？</h2>
          </div>
        </div>

        <fieldset className="wizard-fieldset">
          <legend>実験の大きな分類</legend>
          <div className="comparison-kind-grid comparison-kind-grid--families">
            <label
              className={`choice-card ${comparisonFamily === "independent-groups" ? "choice-card--selected" : ""}`}
            >
              <input
                type="radio"
                name="comparison-family"
                value="independent-groups"
                checked={comparisonFamily === "independent-groups"}
                onChange={() => selectComparisonFamily("independent-groups")}
              />
              <span>
                <strong>別々の実験単位を群に分けた</strong>
                <small>例：別のディッシュを対照、siRNA #1、#2、薬剤−/+などへ割り当てた。</small>
              </span>
              <span className="choice-status">よく使う</span>
            </label>
            <label
              className={`choice-card ${comparisonFamily === "repeated-units" ? "choice-card--selected" : ""}`}
            >
              <input
                type="radio"
                name="comparison-family"
                value="repeated-units"
                checked={comparisonFamily === "repeated-units"}
                onChange={() => selectComparisonFamily("repeated-units")}
              />
              <span>
                <strong>同じ動物・試料を複数条件で測定した</strong>
                <small>例：同じ個体の処理前後、同じドナーをすべての条件で測定した。</small>
              </span>
            </label>
            <label
              className={`choice-card ${comparisonFamily === "correlation" ? "choice-card--selected" : ""}`}
            >
              <input
                type="radio"
                name="comparison-family"
                value="correlation"
                checked={comparisonFamily === "correlation"}
                onChange={() => selectComparisonFamily("correlation")}
              />
              <span>
                <strong>同じ実験単位の2つの測定値の関係を見たい</strong>
                <small>例：各サンプルの測定値XとYを散布図で評価する。</small>
              </span>
            </label>
          </div>
        </fieldset>

        {comparisonFamily === "independent-groups" && (
          <fieldset className="wizard-fieldset">
            <legend>条件はどのように作りましたか？</legend>
            <div className="comparison-kind-grid comparison-kind-grid--compact">
              <label
                className={`choice-card ${comparisonKind !== "factorial-independent" ? "choice-card--selected" : ""}`}
              >
                <input
                  type="radio"
                  name="independent-structure"
                  checked={comparisonKind !== "factorial-independent"}
                  onChange={() => selectComparisonFamily("independent-groups")}
                />
                <span>
                  <strong>1種類の処置で群を作った</strong>
                  <small>例：対照、siRNA #1、#2、#3。</small>
                </span>
              </label>
              <label
                className={`choice-card ${comparisonKind === "factorial-independent" ? "choice-card--selected" : ""}`}
              >
                <input
                  type="radio"
                  name="independent-structure"
                  checked={comparisonKind === "factorial-independent"}
                  onChange={() => updateComparisonKind("factorial-independent")}
                />
                <span>
                  <strong>2種類の処置を組み合わせた</strong>
                  <small>例：siRNA種類 × 薬剤−/+ の全組み合わせ。</small>
                </span>
              </label>
            </div>
            {comparisonKind !== "factorial-independent" && (
              <label className="field-label field-label--small">
                独立した条件の数
                <input
                  aria-label="独立した条件の数"
                  type="number"
                  min={2}
                  max={12}
                  step={1}
                  value={
                    comparisonKind === "multi-group-independent" ? multiConditionLabels.length : 2
                  }
                  onChange={(event) => updateOneFactorConditionCount(event.target.value, false)}
                />
              </label>
            )}
          </fieldset>
        )}

        {comparisonFamily === "repeated-units" && (
          <fieldset className="wizard-fieldset">
            <legend>同じ実験単位を何条件で測定しましたか？</legend>
            <label className="field-label field-label--small">
              繰り返し測定した条件の数
              <input
                aria-label="繰り返し測定した条件の数"
                type="number"
                min={2}
                max={12}
                step={1}
                value={comparisonKind === "multi-group-matched" ? multiConditionLabels.length : 2}
                onChange={(event) => updateOneFactorConditionCount(event.target.value, true)}
              />
            </label>
          </fieldset>
        )}

        {comparisonKind === "two-condition-continuous" || comparisonKind === "correlation" ? (
          <div className="condition-input-grid">
            <label className="field-label">
              条件A
              <input
                value={conditionA}
                onChange={(event) => updateCondition(setConditionA, event.target.value)}
              />
            </label>
            <label className="field-label">
              条件B
              <input
                value={conditionB}
                onChange={(event) => updateCondition(setConditionB, event.target.value)}
              />
            </label>
            <label className="field-label field-label--small">
              {comparisonKind === "correlation"
                ? "入力する同じ実験単位の数"
                : "各条件で入力する実験単位の数"}
              <input
                type="number"
                min={1}
                step={1}
                value={plannedN}
                onChange={(event) => updatePlannedN(event.target.value)}
              />
            </label>
          </div>
        ) : comparisonKind === "factorial-independent" ? (
          <div className="multi-condition-editor" aria-label="2種類の処置と条件名">
            <div className="multi-condition-editor-heading">
              <strong>2種類の処置（各2〜6通り）</strong>
              <span>
                {factorALevels.length * factorBLevels.length}個の組み合わせ条件を自動で作成します。
              </span>
            </div>
            <button
              className="secondary-button factorial-preset-button"
              type="button"
              onClick={applySirnaFactorPreset}
            >
              例：Control / siRNA #1〜#3 × 薬剤 −/+ を入力
            </button>
            <div className="factorial-factor-grid">
              {(
                [
                  ["A", factorAName, setFactorAName, factorALevels, setFactorALevels],
                  ["B", factorBName, setFactorBName, factorBLevels, setFactorBLevels],
                ] as const
              ).map(([factorKey, factorName, setFactorName, levels, setLevels]) => (
                <section className="factorial-factor-card" key={factorKey}>
                  <label className="field-label">
                    処置{factorKey}の名前
                    <input
                      aria-label={`処置${factorKey}の名前`}
                      value={factorName}
                      onChange={(event) => updateFactorText(setFactorName, event.target.value)}
                    />
                  </label>
                  <div className="factorial-level-grid">
                    {levels.map((level, index) => (
                      <div className="factorial-level-entry" key={`factor-${factorKey}-${index}`}>
                        <label className="field-label">
                          条件名 {index + 1}
                          <span className="factorial-level-row">
                            <input
                              aria-label={`処置${factorKey} 条件名${index + 1}`}
                              value={level}
                              onChange={(event) =>
                                updateFactorLevel(setLevels, levels, index, event.target.value)
                              }
                            />
                            <button
                              className="compact-icon-button"
                              type="button"
                              aria-label={`処置${factorKey} 条件名${index + 1}を削除`}
                              disabled={levels.length <= 2}
                              onClick={() => removeFactorLevel(setLevels, levels, index, factorKey)}
                            >
                              −
                            </button>
                          </span>
                        </label>
                        {factorKey === "A" && (
                          <label className="field-label factorial-parent-group-field">
                            表示上の分類（任意）
                            <input
                              aria-label={`処置A 条件名${index + 1}の表示上の分類`}
                              placeholder="例：対照群／標的X群"
                              value={factorALevelGroups[index] ?? ""}
                              onChange={(event) =>
                                updateFactorLevelGroup(index, event.target.value)
                              }
                            />
                          </label>
                        )}
                      </div>
                    ))}
                  </div>
                  <button
                    className="secondary-button factorial-add-level"
                    type="button"
                    disabled={levels.length >= 6}
                    onClick={() => addFactorLevel(setLevels, levels, factorKey)}
                  >
                    処置{factorKey}の条件名を追加
                  </button>
                </section>
              ))}
            </div>
            <details className="factorial-condition-preview">
              <summary>作成する{factorALevels.length * factorBLevels.length}条件を確認</summary>
              <div className="factorial-condition-chips">
                {factorALevels.flatMap((aLevel) =>
                  factorBLevels.map((bLevel) => (
                    <span key={`${aLevel}-${bLevel}`}>
                      {aLevel} / {bLevel}
                    </span>
                  )),
                )}
              </div>
            </details>
            <p className="wizard-safety-note">
              siRNA #1・#2・#3はそれぞれ別の条件です。配列番号を実験単位の数として合算しません。
              {factorALevelGroups.length > 0 && (
                <> 表示上は「対照群」と「標的群」にまとめますが、統計解析では合算しません。</>
              )}
            </p>
            <label className="field-label field-label--small">
              各組み合わせで入力する実験単位の数
              <input
                aria-label="各組み合わせで入力する実験単位の数"
                type="number"
                min={2}
                step={1}
                value={plannedN}
                onChange={(event) => updatePlannedN(event.target.value)}
              />
            </label>
          </div>
        ) : (
          <div className="multi-condition-editor" aria-label="3条件以上の条件">
            <div className="multi-condition-editor-heading">
              <strong>条件ラベル（3つ以上）</strong>
              <span>
                {comparisonKind === "multi-group-matched"
                  ? "すべての条件で同じ実験単位を完全に測定します。"
                  : "各条件は別の独立した実験単位です。"}
              </span>
            </div>
            <div className="multi-condition-label-list">
              {multiConditionLabels.map((label, index) => (
                <div className="multi-condition-entry" key={`condition-label-${index}`}>
                  <label className="field-label">
                    条件 {index + 1}
                    <span className="multi-condition-label-row">
                      <input
                        value={label}
                        onChange={(event) => updateMultiCondition(index, event.target.value)}
                      />
                      <button
                        className="secondary-button"
                        type="button"
                        disabled={multiConditionLabels.length <= 3}
                        onClick={() => removeMultiCondition(index)}
                      >
                        削除
                      </button>
                    </span>
                  </label>
                </div>
              ))}
            </div>
            {comparisonKind === "multi-group-independent" && (
              <details className="advanced-disclosure">
                <summary>詳細設定：関連する条件を見た目上まとめる</summary>
                <div className="advanced-content multi-condition-label-list">
                  {multiConditionLabels.map((label, index) => (
                    <label className="field-label field-label--group" key={`group-${index}`}>
                      {label || `条件 ${index + 1}`} の表示上の分類（任意）
                      <input
                        aria-label={`条件 ${index + 1} の表示上の分類`}
                        value={multiConditionGroups[index] ?? ""}
                        placeholder="例：対照／標的X"
                        onChange={(event) => updateMultiConditionGroup(index, event.target.value)}
                      />
                    </label>
                  ))}
                  <p className="wizard-question-help scientific-group-warning">
                    分類は図の括弧や説明にだけ使います。siRNA
                    #1〜#3などの各条件は別々に比較し、値を合算しません。
                  </p>
                </div>
              </details>
            )}
            <button className="secondary-button" type="button" onClick={addMultiCondition}>
              条件を追加
            </button>
            <label className="field-label field-label--small">
              各条件で入力する実験単位の数
              <input
                type="number"
                min={2}
                step={1}
                value={plannedN}
                onChange={(event) => updatePlannedN(event.target.value)}
              />
            </label>
          </div>
        )}
      </section>

      <ExperimentPatternPreview
        kind={previewKind}
        conditionLabels={previewConditionLabels}
        factorAName={factorAName}
        factorALevels={factorALevels}
        factorBName={factorBName}
        factorBLevels={factorBLevels}
      />

      <section className="wizard-step-card" aria-labelledby="assignment-step-heading">
        <div className="wizard-step-heading">
          <span className="step-number">02</span>
          <div>
            <p className="overline">実験操作</p>
            <h2 id="assignment-step-heading">条件はどのように割り当てましたか？</h2>
          </div>
        </div>
        {comparisonKind !== "two-condition-continuous" ? (
          <>
            <p className="wizard-question-help">
              {comparisonKind === "correlation"
                ? "同じ実験単位から、測定値Xと測定値Yを1つずつ得て対応付けます。別ディッシュの同じ位置を自動で対応付けません。"
                : comparisonKind === "multi-group-matched"
                  ? "同じ実験単位がすべての条件に対応します。単に同じ日に扱った別ディッシュは含みません。"
                  : comparisonKind === "factorial-independent"
                    ? `${factorALevels.length * factorBLevels.length}条件それぞれに別の実験単位を割り当てます。同じ細胞株や同じ実験日は対応を意味しません。`
                    : "各条件のディッシュ／サンプルを別の生物学的単位として扱います。"}
            </p>
            {comparisonKind === "correlation" && (
              <fieldset className="wizard-fieldset correlation-form-fieldset">
                <legend>どのような関係を評価しますか？</legend>
                <div className="relationship-list">
                  <label
                    className={`relationship-card ${correlationRelationshipForm === "linear" ? "is-selected" : ""}`}
                  >
                    <input
                      type="radio"
                      name="correlation-relationship-form"
                      value="linear"
                      checked={correlationRelationshipForm === "linear"}
                      onChange={() => {
                        setCorrelationRelationshipForm("linear");
                        setConfirmed(false);
                        setSelectedOutcome(null);
                        setSheet(null);
                      }}
                    />
                    <span className="relationship-copy">
                      <strong>直線的な関係を評価</strong>
                      <small>Xが増えるとYも、おおむね直線に沿って増減する関係を見ます。</small>
                    </span>
                  </label>
                  <label
                    className={`relationship-card ${correlationRelationshipForm === "monotonic_or_ranked" ? "is-selected" : ""}`}
                  >
                    <input
                      type="radio"
                      name="correlation-relationship-form"
                      value="monotonic_or_ranked"
                      checked={correlationRelationshipForm === "monotonic_or_ranked"}
                      onChange={() => {
                        setCorrelationRelationshipForm("monotonic_or_ranked");
                        setConfirmed(false);
                        setSelectedOutcome(null);
                        setSheet(null);
                      }}
                    />
                    <span className="relationship-copy">
                      <strong>単調／順位の関係を評価</strong>
                      <small>
                        正確な直線でなくても、値の並び順が同じ方向に変わる関係を見ます。
                      </small>
                    </span>
                  </label>
                </div>
              </fieldset>
            )}
            <label className="field-label unit-select-label">
              {comparisonKind === "multi-group-matched"
                ? "繰り返し測定する生物学的単位"
                : "実験単位"}
              <select
                value={experimentalUnit}
                onChange={(event) => updateExperimentalUnit(event.target.value)}
              >
                <option value="dish">ディッシュ／サンプル</option>
                <option value="animal">動物</option>
                <option value="donor">ドナー</option>
                <option value="sample">サンプル</option>
                {comparisonKind === "multi-group-matched" && (
                  <option value="tracked-cell">追跡細胞・単位</option>
                )}
              </select>
            </label>
          </>
        ) : (
          <>
            <p className="wizard-question-help">
              同じ細胞株・継代・実験日ではなく、実際の生物学的単位に合う説明を選びます。
            </p>

            <fieldset className="wizard-fieldset">
              <legend className="sr-only">条件間の関係</legend>
              <div className="relationship-list">
                <label
                  className={`relationship-card ${relationship === "independent" ? "is-selected" : ""}`}
                >
                  <input
                    type="radio"
                    name="relationship"
                    value="independent"
                    checked={relationship === "independent"}
                    onChange={() => updateRelationship("independent")}
                  />
                  <span className="relationship-copy">
                    <strong>別々のディッシュ・動物・サンプル</strong>
                    <small>各条件を異なる実験単位に割り当てました。</small>
                    <em>
                      同じRPE1細胞株・同じ日・同じ継代でも、別ディッシュは対応のあるデータになりません。
                    </em>
                  </span>
                  <span className="inferred-badge">別群</span>
                </label>

                <label
                  className={`relationship-card ${relationship === "matched" ? "is-selected" : ""}`}
                >
                  <input
                    type="radio"
                    name="relationship"
                    value="matched"
                    checked={relationship === "matched"}
                    onChange={() => updateRelationship("matched")}
                  />
                  <span className="relationship-copy">
                    <strong>同じ生物学的単位を両条件で測定</strong>
                    <small>例：同じ動物・ドナー・サンプル・追跡単位を前後で測定します。</small>
                  </span>
                  <span className="inferred-badge inferred-badge--blue">対応あり</span>
                </label>
              </div>

              <details className="advanced-disclosure" open={relationship === "blocked"}>
                <summary>詳細設定：実験ラン／バッチをブロックとして指定</summary>
                <div className="advanced-content">
                  <label
                    className={`relationship-card ${relationship === "blocked" ? "is-selected" : ""}`}
                  >
                    <input
                      type="radio"
                      name="relationship"
                      value="blocked"
                      checked={relationship === "blocked"}
                      onChange={() => updateRelationship("blocked")}
                    />
                    <span className="relationship-copy">
                      すべての独立ランで両条件を測定
                      <small>
                        ランやバッチの対応を実験計画で明示し、完全なブロックを作る場合だけ選びます。
                      </small>
                    </span>
                    <span className="inferred-badge inferred-badge--blue">ブロック</span>
                  </label>
                </div>
              </details>
            </fieldset>

            <label className="field-label unit-select-label">
              {relationship === "matched" ? "繰り返し測定する生物学的単位" : "実験単位"}
              <select
                value={experimentalUnit}
                onChange={(event) => updateExperimentalUnit(event.target.value)}
              >
                <option value="dish">ディッシュ／サンプル</option>
                <option value="animal">動物</option>
                <option value="donor">ドナー</option>
                <option value="sample">サンプル</option>
                {relationship === "matched" && <option value="tracked-cell">追跡細胞・単位</option>}
              </select>
            </label>
          </>
        )}
      </section>

      <section className="inference-section" aria-labelledby="inference-heading">
        <div className="section-heading-row">
          <div>
            <p className="overline">入力シートの確認</p>
            <h2 id="inference-heading">この実験として進めますか？</h2>
          </div>
          <span className="section-hint">解析前に確認</span>
        </div>
        {recommendation ? (
          <div
            className={`inference-card inference-card--${recommendation.templateId.toLowerCase()}`}
          >
            <div className="inference-card-header">
              <div>
                <span className="recommendation-kicker">あなたの実験</span>
                <h3>
                  {comparisonKind === "correlation"
                    ? "同じ実験単位の2つの測定値を入力"
                    : comparisonFamily === "repeated-units"
                      ? `同じ実験単位を${design?.conditions.length ?? 0}条件で測定`
                      : `別々の実験単位を${design?.conditions.length ?? 0}条件で比較`}
                </h3>
              </div>
            </div>
            <p className="inference-note">
              条件を割り当てた1つの単位は「{statisticalUnitLabel(relationship, experimentalUnit)}
              」です。次の画面で条件名、各実験単位の日付、測定値を入力します。
            </p>
            {relationship === "independent" && (
              <p className="inference-note">
                同じRPE1細胞株を同じ日に扱っても、別ディッシュは独立のままです。ラン／バッチの対応は詳細設定で明示します。
              </p>
            )}
            {relationship === "blocked" && (
              <p className="inference-note">
                ラン／バッチごとに両条件を測定した設計として扱います。すべてのランに両条件の値を入力してください。
              </p>
            )}
            <details className="advanced-disclosure">
              <summary>詳しい解析情報</summary>
              <div className="advanced-content">
                <p>
                  内部テンプレート：{recommendation.templateId} / 推奨手法：
                  {methodLabel(recommendation.recommendedMethod)}
                </p>
                <p>
                  代替手法：
                  {recommendation.alternativeMethods
                    .map((method) => methodLabel(method))
                    .join(" または ")}
                </p>
                <p>{recommendationExplanation(recommendation)}</p>
              </div>
            </details>
            <button
              className="confirm-design-button"
              type="button"
              disabled={!metadataDraftIsComplete(metadataDraft)}
              onClick={confirmDesign}
            >
              このデザインを確定 <span aria-hidden="true">→</span>
            </button>
            {confirmed && !sheet && (
              <div className="outcome-picker" aria-labelledby="outcome-picker-heading">
                <p className="outcome-picker-kicker">次：データシート</p>
                <h4 id="outcome-picker-heading">入力する解析項目を選ぶ</h4>
                <p>
                  ここでの選択に合わせて入力欄を作ります。推奨されたテンプレートで、入力値をローカルに解析します。
                </p>
                <div className="outcome-option-grid">
                  {OUTCOME_OPTIONS[purpose]
                    .filter(
                      (option) =>
                        (!option.measurementMode ||
                          comparisonKind === "two-condition-continuous") &&
                        (comparisonKind !== "correlation" || option.type === "continuous"),
                    )
                    .map((option) => (
                      <button
                        className="outcome-option"
                        type="button"
                        key={option.choice}
                        data-outcome-choice={option.choice}
                        onClick={() => createSheetForOutcome(option.choice)}
                      >
                        <span className="outcome-option-title">{option.label}</span>
                        <span className="outcome-option-description">{option.description}</span>
                        <span className="outcome-option-arrow" aria-hidden="true">
                          →
                        </span>
                      </button>
                    ))}
                </div>
              </div>
            )}
          </div>
        ) : (
          <div className="inference-card inference-card--invalid" role="status">
            {comparisonKind !== "two-condition-continuous"
              ? "3つ以上の条件名を入力すると推定デザインが表示されます。"
              : "条件名を2つ入力すると推定デザインが表示されます。"}
          </div>
        )}
      </section>
    </div>
  );
}

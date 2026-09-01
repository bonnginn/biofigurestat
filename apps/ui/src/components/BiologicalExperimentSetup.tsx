import { useLayoutEffect, useMemo, useRef, useState } from "react";
import { buildStructureContract, type MinimalBiologicalAnswers } from "@lsaa/adaptive-input";
import type { StructureContract } from "@lsaa/domain";

import { useWorkspaceDirtyBaseline } from "../app/useWorkspaceDirtyBaseline";
import { createExperimentConsultationPrompt } from "../app/externalLlmConsultation";
import { ExternalLlmConsultation } from "./ExternalLlmConsultation";
import { moveSpreadsheetFocus } from "./spreadsheetGrid";
import { localizedText, useAppLocale, type AppLocale } from "../app/appLocale";
import "./BiologicalExperimentSetup.css";

export type ConditionCombinationStatus = "performed" | "not_performed" | "unknown";
export type ReceiverRelationship = "separate" | "same" | "shared_source" | "unknown_or_mixed";
export type OriginalValueForm = "single" | "positive_total" | "target_reference" | "category_count";

export type AdditionalReadoutEntry = Readonly<{
  id: string;
  label: string;
  valueForm: OriginalValueForm;
  usesNestedObservation: boolean | null;
  usesOrderedAxis: boolean | null;
}>;

export type ConditionEntryBlock = Readonly<{
  id: string;
  name: string;
  showGroups: boolean;
  groupLabels: readonly string[];
  values: readonly (readonly string[])[];
}>;

export type ConditionCombination = Readonly<{
  id: string;
  labels: readonly string[];
  displayLabel: string;
}>;

export type BiologicalExperimentSetupResult = Readonly<{
  answers: MinimalBiologicalAnswers;
  contract: StructureContract;
  conditionBlocks: readonly ConditionEntryBlock[];
  conditionCombinations: readonly Readonly<
    ConditionCombination & { status: ConditionCombinationStatus }
  >[];
}>;

export type BiologicalExperimentSetupProps = Readonly<{
  enabled: boolean;
  onReady: (result: BiologicalExperimentSetupResult) => boolean | void;
  onCancel?: () => void;
  onDirtyChange?: (dirty: boolean) => void;
  externalError?: string | null;
  initial?: Readonly<{
    title?: string;
    experimentDescription?: string;
    measurementLabel?: string;
    valueForm?: OriginalValueForm;
    measurementUsesNestedObservation?: boolean;
    measurementUsesOrderedAxis?: boolean;
    additionalReadouts?: readonly Readonly<{
      label: string;
      valueForm: OriginalValueForm;
      usesNestedObservation?: boolean;
      usesOrderedAxis?: boolean;
    }>[];
    conditionBlocks?: readonly Readonly<
      | { name: string; levels: readonly string[] }
      | {
          id: string;
          name: string;
          showGroups: boolean;
          groupLabels: readonly string[];
          values: readonly (readonly string[])[];
        }
    >[];
    statuses?: Readonly<Record<string, ConditionCombinationStatus>>;
    receiverLabel?: string;
    receiverIdLabel?: string;
    relationship?: ReceiverRelationship;
    sourceLabel?: string;
    sourceIdLabel?: string;
    sharedSourcePairedBlockId?: string;
    childLabel?: string;
    orderedAxis?: Readonly<{
      label: string;
      unit: string;
      levels: readonly (string | number)[];
      sameIdentity: boolean;
    }>;
    /** Existing-workspace revision mode; it never implies that data may be discarded. */
    revisionMode?: boolean;
    notice?: string;
    /**
     * The condition/readout facts came from a retained Graph-only table.
     * Keep them visible as a concise summary and ask only the still-missing
     * biological facts; the researcher can explicitly reopen them to edit.
     */
    statisticsHandoff?: boolean;
  }>;
}>;

// Condition levels are normally entered left-to-right. Additional rows are
// created only when the researcher asks for a real parent/subgroup dimension.
const VISIBLE_ROWS = 1;
const VISIBLE_VALUE_COLUMNS = 4;

type PendingDeletionFocus = Readonly<{
  collection: "blocks" | "readouts";
  candidateIds: readonly string[];
}>;

const VALUE_FORM_OPTIONS = [
  ["single", "1つの数値", "強度、長さ、生存率など"],
  ["positive_total", "陽性数＋全体数", "陽性数と数えた全体数"],
  ["target_reference", "標的値＋1つの基準値", "WBなどで比として補正する2つの値"],
  ["category_count", "カテゴリ＋数", "分類名とその件数"],
] as const satisfies readonly [OriginalValueForm, string, string][];

const VALUE_FORM_OPTIONS_EN = [
  ["single", "One numeric value", "Intensity, length, viability, etc."],
  ["positive_total", "Positive count + total count", "Number positive and total counted"],
  [
    "target_reference",
    "Target value + one reference value",
    "Two values used to normalize a ratio, such as a western blot",
  ],
  ["category_count", "Category + count", "Category name and its count"],
] as const satisfies readonly [OriginalValueForm, string, string][];

function blankGrid(rows = VISIBLE_ROWS, columns = VISIBLE_VALUE_COLUMNS): string[][] {
  return Array.from({ length: rows }, () => Array.from({ length: columns }, () => ""));
}

function createBlock(index: number): ConditionEntryBlock {
  return {
    id: `condition-block.${index}`,
    name: "",
    showGroups: false,
    groupLabels: Array.from({ length: VISIBLE_ROWS }, () => ""),
    values: blankGrid(),
  };
}

function conditionBlockActionLabel(block: ConditionEntryBlock, index: number): string {
  const name = block.name.trim();
  return `処理・群分け ${index + 1}${name ? `（${name}）` : ""}`;
}

function createInitialBlock(
  index: number,
  initial: Readonly<
    | { name: string; levels: readonly string[] }
    | {
        id: string;
        name: string;
        showGroups: boolean;
        groupLabels: readonly string[];
        values: readonly (readonly string[])[];
      }
  >,
): ConditionEntryBlock {
  if ("values" in initial) {
    const columnCount = Math.max(VISIBLE_VALUE_COLUMNS, ...initial.values.map((row) => row.length));
    const rowCount = Math.max(VISIBLE_ROWS, initial.values.length);
    return {
      id: initial.id,
      name: initial.name,
      showGroups: initial.showGroups,
      groupLabels: Array.from({ length: rowCount }, (_, row) => initial.groupLabels[row] ?? ""),
      values: Array.from({ length: rowCount }, (_, row) =>
        Array.from({ length: columnCount }, (_, column) => initial.values[row]?.[column] ?? ""),
      ),
    };
  }
  const columnCount = VISIBLE_VALUE_COLUMNS;
  const rowCount = Math.max(VISIBLE_ROWS, Math.ceil(initial.levels.length / columnCount));
  const values = blankGrid(rowCount, columnCount);
  initial.levels.forEach((level, levelIndex) => {
    values[Math.floor(levelIndex / columnCount)]![levelIndex % columnCount] = level;
  });
  return {
    ...createBlock(index),
    name: initial.name,
    values,
    groupLabels: Array.from({ length: rowCount }, () => ""),
  };
}

function populatedCells(block: ConditionEntryBlock) {
  return block.values.flatMap((row, rowIndex) =>
    row.flatMap((value, columnIndex) => {
      const label = value.trim();
      if (!label) return [];
      const group = block.showGroups ? block.groupLabels[rowIndex]?.trim() : "";
      return [
        {
          id: `${block.id}:${rowIndex}:${columnIndex}`,
          label,
          displayLabel: group ? `${group} / ${label}` : label,
        },
      ];
    }),
  );
}

/** Complete Cartesian preview. Empty cells are presentation space, not conditions. */
export function buildConditionCombinations(
  blocks: readonly ConditionEntryBlock[],
): readonly ConditionCombination[] {
  const populated = blocks.map(populatedCells);
  if (populated.some((entries) => entries.length === 0)) return [];
  return populated.reduce<ConditionCombination[]>(
    (current, entries) =>
      current.flatMap((combination) =>
        entries.map((entry) => ({
          id: combination.id ? `${combination.id}|${entry.id}` : entry.id,
          labels: [...combination.labels, entry.label],
          displayLabel: combination.displayLabel
            ? `${combination.displayLabel} × ${entry.displayLabel}`
            : entry.displayLabel,
        })),
      ),
    [{ id: "", labels: [], displayLabel: "" }],
  );
}

function representationFor(
  form: OriginalValueForm,
): MinimalBiologicalAnswers["readoutRepresentation"] {
  return {
    single: "scalar",
    positive_total: "proportion_counts",
    target_reference: "target_reference",
    category_count: "category_counts",
  }[form] as MinimalBiologicalAnswers["readoutRepresentation"];
}

export type SafeBuildInput = Readonly<{
  title: string;
  /** Preserve the original research record when revising an existing contract. */
  experimentDescription?: string;
  measurementLabel: string;
  valueForm: OriginalValueForm;
  /** Additional measurements recorded from the same experimental structure. */
  additionalReadouts?: readonly Readonly<{
    label: string;
    valueForm: OriginalValueForm;
    usesNestedObservation?: boolean | null;
    usesOrderedAxis?: boolean | null;
  }>[];
  measurementUsesNestedObservation?: boolean | null;
  measurementUsesOrderedAxis?: boolean | null;
  blocks: readonly ConditionEntryBlock[];
  combinations: readonly ConditionCombination[];
  statuses: Readonly<Record<string, ConditionCombinationStatus>>;
  receiverLabel: string;
  receiverIdLabel: string;
  relationship: ReceiverRelationship;
  sourceLabel: string;
  sourceIdLabel: string;
  /** Which single condition block was varied after splitting a shared source. */
  sharedSourcePairedBlockId?: string | null;
  childLabel: string;
  orderedAxis?: Readonly<{
    label: string;
    unit: string;
    levels: readonly (string | number)[];
    sameIdentity: boolean | null;
  }>;
}>;

export type SafeBuildResult =
  | Readonly<{ status: "ready"; result: BiologicalExperimentSetupResult }>
  | Readonly<{ status: "stopped"; reason: string }>;

/** Builds only the complete common structures supported by the current production contract. */
export function safelyBuildBiologicalSetup(input: SafeBuildInput): SafeBuildResult {
  const measurementLabel = input.measurementLabel.trim();
  const additionalReadouts = (input.additionalReadouts ?? []).map((readout) => ({
    label: readout.label.trim(),
    valueForm: readout.valueForm,
    usesNestedObservation: readout.usesNestedObservation,
    usesOrderedAxis: readout.usesOrderedAxis,
  }));
  const hasSeveralReadouts = additionalReadouts.length > 0;
  const receiverLabel = input.receiverLabel.trim();
  const receiverIdLabel = input.receiverIdLabel.trim() || `${receiverLabel} ID`;
  if (!measurementLabel || !receiverLabel) {
    return {
      status: "stopped",
      reason: "測定項目と、条件を直接受けた、または群として分けた対象・試料を入力してください。",
    };
  }
  if (additionalReadouts.some(({ label }) => !label)) {
    return {
      status: "stopped",
      reason: "追加した測定項目にも名前を入力してください。入力内容は保持されています。",
    };
  }
  if (
    hasSeveralReadouts &&
    input.childLabel.trim() &&
    [
      ...(input.valueForm === "single" ? [input.measurementUsesNestedObservation] : []),
      ...additionalReadouts
        .filter(({ valueForm }) => valueForm === "single")
        .map(({ usesNestedObservation }) => usesNestedObservation),
    ].some((binding) => binding === null || binding === undefined)
  ) {
    return {
      status: "stopped",
      reason:
        "Cell・ROIなどを個別に測った項目を選んでください。測定項目ごとの違いを推測せず、入力内容を保持して停止しました。",
    };
  }
  if (
    hasSeveralReadouts &&
    input.childLabel.trim() &&
    !(input.valueForm === "single" && input.measurementUsesNestedObservation) &&
    !additionalReadouts.some(
      ({ valueForm, usesNestedObservation }) => valueForm === "single" && usesNestedObservation,
    )
  ) {
    return {
      status: "stopped",
      reason:
        "Cell・ROIなどを個別に測った項目が1つも選ばれていません。入力内容は保持されています。",
    };
  }
  if (
    hasSeveralReadouts &&
    input.orderedAxis &&
    [
      input.measurementUsesOrderedAxis,
      ...additionalReadouts.map(({ usesOrderedAxis }) => usesOrderedAxis),
    ].some((binding) => binding === null || binding === undefined)
  ) {
    return {
      status: "stopped",
      reason:
        "この時間・距離の系列で測った項目を選んでください。測定項目ごとの違いを推測せず、入力内容を保持して停止しました。",
    };
  }
  if (
    hasSeveralReadouts &&
    input.orderedAxis &&
    !input.measurementUsesOrderedAxis &&
    !additionalReadouts.some(({ usesOrderedAxis }) => usesOrderedAxis)
  ) {
    return {
      status: "stopped",
      reason: "この系列で測った項目が1つも選ばれていません。入力内容は保持されています。",
    };
  }
  if (
    input.blocks.length === 0 ||
    input.blocks.some((block) => !block.name.trim() || populatedCells(block).length === 0)
  ) {
    return {
      status: "stopped",
      reason: "各処理・群分けに名前と1つ以上の具体的な値を入力してください。",
    };
  }
  if (input.combinations.length === 0) {
    return { status: "stopped", reason: "条件の組み合わせを作れる具体的な値がありません。" };
  }
  if (input.relationship === "unknown_or_mixed") {
    return {
      status: "stopped",
      reason:
        "受け手どうしの関係が混在または不明なため、安全な入力表をまだ作れません。入力内容は保持されています。",
    };
  }
  if (input.relationship === "shared_source" && !input.sourceLabel.trim()) {
    return {
      status: "stopped",
      reason: "別々の対象を対応づける、共通の由来・実験回を入力してください。",
    };
  }
  const sharedSourcePairedBlock =
    input.relationship === "shared_source"
      ? input.blocks.length === 1
        ? input.blocks[0]!
        : input.blocks.find(({ id }) => id === input.sharedSourcePairedBlockId)
      : null;
  if (input.relationship === "shared_source" && !sharedSourcePairedBlock) {
    return {
      status: "stopped",
      reason:
        "対応する組の中で変えた処理・群分けを1つ選んでください。2つ以上の処理で対応が異なる場合は、現在の版では推測せず入力内容を保持して停止します。",
    };
  }
  if (input.orderedAxis?.sameIdentity === null) {
    return {
      status: "stopped",
      reason: "順序に沿った各測定で、同じ対象を追ったのかを確認してください。",
    };
  }
  if (
    input.orderedAxis &&
    (!input.orderedAxis.label.trim() || input.orderedAxis.levels.length === 0)
  ) {
    return {
      status: "stopped",
      reason: "時間など、順序に沿って測った項目の名前と値を入力してください。",
    };
  }

  // StructureContract 0.1.0 can retain one shared-source matching relation.
  // Put the explicitly selected post-split block in that semantic position;
  // display order remains unchanged in conditionBlocks/conditionCombinations.
  const semanticBlocks = sharedSourcePairedBlock
    ? [
        sharedSourcePairedBlock,
        ...input.blocks.filter(({ id }) => id !== sharedSourcePairedBlock.id),
      ]
    : input.blocks;
  const first = semanticBlocks[0]!;
  const additional = semanticBlocks.slice(1);
  const relationship =
    input.relationship === "same"
      ? ({ kind: "same_entity_across_conditions" } as const)
      : input.relationship === "shared_source"
        ? ({
            kind: "distinct_condition_units_shared_source",
            sourceUnitLabel: input.sourceLabel.trim(),
            sourceIdentityLabel: input.sourceIdLabel.trim() || `${input.sourceLabel.trim()} ID`,
            sourceRole: "block" as const,
            completeSetsRequired: true,
          } as const)
        : ({ kind: "independent_condition_units" } as const);
  const answers: MinimalBiologicalAnswers = {
    experimentName: input.title.trim() || `${measurementLabel}の実験`,
    experimentDescription:
      input.experimentDescription?.trim() ||
      `${input.blocks.map(({ name }) => name.trim()).join("、")}を組み合わせ、${[
        measurementLabel,
        ...additionalReadouts.map(({ label }) => label),
      ].join("、")}を測定`,
    experimentalUnitLabel: receiverLabel,
    identityLabel: receiverIdLabel,
    readoutLabel: measurementLabel,
    readoutRepresentation: representationFor(input.valueForm),
    ...(hasSeveralReadouts && input.childLabel.trim()
      ? {
          readoutUsesNestedObservation:
            input.valueForm === "single" && input.measurementUsesNestedObservation === true,
        }
      : {}),
    ...(hasSeveralReadouts && input.orderedAxis
      ? { readoutUsesOrderedAxis: input.measurementUsesOrderedAxis === true }
      : {}),
    ...(additionalReadouts.length
      ? {
          additionalReadouts: additionalReadouts.map(
            ({ label, valueForm, usesNestedObservation, usesOrderedAxis }) => ({
              label,
              representation: representationFor(valueForm),
              ...(input.childLabel.trim()
                ? {
                    usesNestedObservation: valueForm === "single" && usesNestedObservation === true,
                  }
                : {}),
              ...(input.orderedAxis ? { usesOrderedAxis: usesOrderedAxis === true } : {}),
            }),
          ),
        }
      : {}),
    factorName: first.name.trim(),
    factorLevels: populatedCells(first).map(({ displayLabel }) => displayLabel),
    additionalFactors: additional.map((block) => ({
      name: block.name.trim(),
      levels: populatedCells(block).map(({ displayLabel }) => displayLabel),
      sameIdentityAcrossConditions: input.relationship === "same",
    })),
    sameIdentityAcrossConditions: input.relationship === "same",
    conditionEntityRelationship: relationship,
    ...(input.orderedAxis
      ? {
          orderedAxis: {
            label: input.orderedAxis.label.trim(),
            unit: input.orderedAxis.unit.trim(),
            levels: input.orderedAxis.levels,
            sameIdentity: input.orderedAxis.sameIdentity === true,
          },
        }
      : {}),
    ...(input.childLabel.trim() ? { nestedObservationLabel: input.childLabel.trim() } : {}),
  };

  try {
    const contract = buildStructureContract(answers);
    return {
      status: "ready",
      result: {
        answers,
        contract,
        conditionBlocks: input.blocks,
        conditionCombinations: input.combinations.map((combination) => ({
          ...combination,
          status: input.statuses[combination.id] ?? "performed",
        })),
      },
    };
  } catch {
    return {
      status: "stopped",
      reason: "この組み合わせは現在の入力表では安全に表せません。入力内容は保持されています。",
    };
  }
}

function pastedGrid(text: string): string[][] {
  return text
    .replace(/\r\n?/g, "\n")
    .split("\n")
    .map((row) => row.split("\t"));
}

export type BiologicalExperimentSummaryInput = Readonly<{
  locale?: AppLocale;
  blocks: readonly ConditionEntryBlock[];
  receiverLabel: string;
  readoutLabels: readonly string[];
  relationship: ReceiverRelationship;
  sourceLabel: string;
  sharedSourcePairedBlockId?: string;
  childLabel: string;
  nestedReadoutLabels?: readonly string[];
  aggregateReadoutLabels?: readonly string[];
  orderedAxis?: Readonly<{
    label: string;
    unit?: string;
    levels: readonly (string | number)[];
    sameIdentity: boolean | null;
    readoutLabels?: readonly string[];
  }>;
}>;

/**
 * Keep the live preview in experiment language while exposing the semantic
 * decisions that would otherwise be easy to miss before creating the table.
 * It is deliberately a pure formatter: it does not infer a relationship.
 */
export function buildBiologicalExperimentSummary(input: BiologicalExperimentSummaryInput): string {
  if (input.locale === "en") {
    const receiver = input.receiverLabel.trim() || "experimental unit";
    const factors = input.blocks
      .map((block) => {
        const name = block.name.trim() || "Condition";
        const levels = populatedCells(block)
          .map(({ displayLabel }) => displayLabel)
          .join(", ");
        return `${name}: ${levels || "not entered"}`;
      })
      .join("; ");
    const readouts = input.readoutLabels
      .map((label) => label.trim())
      .filter(Boolean)
      .join(", ");
    const parts = [
      `${factors || "Condition: not entered"}.`,
      `Record ${readouts || "the measured value"} for each ${receiver}.`,
    ];
    if (input.relationship === "same")
      parts.push(`The same ${receiver} is measured repeatedly across conditions.`);
    else if (input.relationship === "shared_source")
      parts.push(
        `Separate ${receiver}s are assigned to conditions, while matched sets sharing the same ${input.sourceLabel.trim() || "source or experimental run"} are retained.`,
      );
    else if (input.relationship === "separate")
      parts.push(`Each condition uses separate ${receiver}s.`);
    else
      parts.push(`Whether the same ${receiver} is used across conditions has not been confirmed.`);
    if (input.childLabel.trim())
      parts.push(
        `${input.childLabel.trim()} observations within each ${receiver} are retained individually but are not counted as independent biological n.`,
      );
    if (input.orderedAxis) {
      const axis = input.orderedAxis;
      const levels =
        axis.levels
          .map((level) => `${String(level)}${axis.unit?.trim() ? ` ${axis.unit.trim()}` : ""}`)
          .join(", ") || "values not entered";
      if (axis.sameIdentity === true)
        parts.push(
          `The same ${receiver} is followed across ${axis.label.trim() || "the ordered axis"} (${levels}).`,
        );
      else if (axis.sameIdentity === false)
        parts.push(
          `Separate ${receiver}s are measured at each ${axis.label.trim() || "ordered-axis"} value (${levels}).`,
        );
      else
        parts.push(
          `Identity across ${axis.label.trim() || "the ordered axis"} (${levels}) has not been confirmed.`,
        );
    }
    return parts.join(" ");
  }
  const receiver = input.receiverLabel.trim() || "対象・試料";
  const factors = input.blocks
    .map((block) => {
      const name = block.name.trim() || "処理・群分け";
      const levels = populatedCells(block)
        .map(({ displayLabel }) => displayLabel)
        .join("、");
      return `${name}: ${levels || "未入力"}`;
    })
    .join("、");
  const readoutLabels = input.readoutLabels.map((label) => label.trim()).filter(Boolean);
  const readouts = readoutLabels.join("、");
  const parts = [
    `${factors || "処理・群分け: 未入力"}。`,
    `${receiver}ごとに${readouts || "測定値"}を記録します。`,
  ];
  if (input.relationship === "same") {
    parts.push(`同じ${receiver}を条件間で繰り返し測定します。`);
  } else if (input.relationship === "shared_source") {
    parts.push(
      `別々の${receiver}を条件に割り当て、${input.sourceLabel.trim() || "共通の由来・実験回"}が同じ組どうしの対応を保持します。`,
    );
    if (input.blocks.length > 1) {
      const pairedBlock = input.blocks.find(({ id }) => id === input.sharedSourcePairedBlockId);
      if (pairedBlock) {
        parts.push(
          `「${pairedBlock.name.trim() || "処理・群分け"}」について、同じ${input.sourceLabel.trim() || "由来・実験回"}に属する${receiver}を対応づけます。`,
        );
      } else if (input.sharedSourcePairedBlockId === "multiple_or_unknown") {
        parts.push(
          "由来・実験回と処理の対応が複数または一部だけのため、現在の入力内容のままでは統計構造を確定できません。",
        );
      } else {
        parts.push("対応する組の中で変えた処理・群分けは未確認です。");
      }
    }
  } else if (input.relationship === "separate") {
    parts.push(`条件ごとに別々の${receiver}を用います。`);
  } else {
    parts.push(`条件間で${receiver}が同じかどうかは未確認です。`);
  }
  if (input.childLabel.trim()) {
    const child = input.childLabel.trim();
    const nestedReadouts = (input.nestedReadoutLabels ?? [])
      .map((label) => label.trim())
      .filter(Boolean)
      .join("、");
    const aggregateReadouts = (input.aggregateReadoutLabels ?? [])
      .map((label) => label.trim())
      .filter(Boolean)
      .join("、");
    if (input.nestedReadoutLabels === undefined) {
      parts.push(
        `各${receiver}内の${child}は個別の測定値として残しますが、独立した生物学的なnには数えません。`,
      );
    } else {
      if (nestedReadouts) {
        parts.push(
          `各${receiver}内の${child}で${nestedReadouts}を測定し、個別の測定値として残しますが、独立した生物学的なnには数えません。`,
        );
      }
      if (aggregateReadouts) {
        parts.push(
          `${aggregateReadouts}は各${receiver}について記録した集計値として保持し、${child}ごとのIDや個別の測定値は作りません。`,
        );
      }
      if (!nestedReadouts && !aggregateReadouts) {
        parts.push(`${child}ごとに測った項目は未選択です。`);
      }
    }
  }
  if (input.orderedAxis) {
    const axis = input.orderedAxis;
    const axisUnit = axis.unit?.trim();
    const levels =
      axis.levels.map((level) => `${String(level)}${axisUnit ? ` ${axisUnit}` : ""}`).join("、") ||
      "値未入力";
    const axisReadouts = (axis.readoutLabels ?? [])
      .map((label) => label.trim())
      .filter(Boolean)
      .join("、");
    const axisReadoutSentence = axisReadouts ? `${axisReadouts}を、` : "";
    if (axis.readoutLabels !== undefined && !axisReadouts) {
      parts.push(`${axis.label.trim() || "順序"}（${levels}）の系列で測った項目は未選択です。`);
    } else if (axis.sameIdentity === true) {
      parts.push(
        `${axis.label.trim() || "順序"}（${levels}）に沿って、${axisReadoutSentence}同じ${receiver}を追って測定します。`,
      );
    } else if (axis.sameIdentity === false) {
      parts.push(
        `${axis.label.trim() || "順序"}（${levels}）ごとに、別々の${receiver}を測定します。`,
      );
    } else {
      parts.push(
        `${axis.label.trim() || "順序"}（${levels}）で測った対象が同じかどうかは未確認です。`,
      );
    }
  }
  return parts.join("");
}

export function BiologicalExperimentSetup({
  enabled,
  onReady,
  onCancel,
  onDirtyChange,
  externalError,
  initial,
}: BiologicalExperimentSetupProps) {
  const locale = useAppLocale();
  const t = (ja: string, en: string) => localizedText(locale, ja, en);
  const valueFormOptions = locale === "ja" ? VALUE_FORM_OPTIONS : VALUE_FORM_OPTIONS_EN;
  const firstEditableControlRef = useRef<HTMLInputElement | null>(null);
  const messageRef = useRef<HTMLParagraphElement | null>(null);
  const addBlockControlRef = useRef<HTMLButtonElement | null>(null);
  const addReadoutControlRef = useRef<HTMLButtonElement | null>(null);
  const blockDeleteControlRefs = useRef(new Map<string, HTMLButtonElement>());
  const readoutDeleteControlRefs = useRef(new Map<string, HTMLButtonElement>());
  const pendingDeletionFocusRef = useRef<PendingDeletionFocus | null>(null);
  const [title, setTitle] = useState(initial?.title ?? "");
  const [measurementLabel, setMeasurementLabel] = useState(initial?.measurementLabel ?? "");
  const [valueForm, setValueForm] = useState<OriginalValueForm>(initial?.valueForm ?? "single");
  const [measurementUsesNestedObservation, setMeasurementUsesNestedObservation] = useState<
    boolean | null
  >(initial?.measurementUsesNestedObservation ?? null);
  const [measurementUsesOrderedAxis, setMeasurementUsesOrderedAxis] = useState<boolean | null>(
    initial?.measurementUsesOrderedAxis ?? null,
  );
  const [additionalReadouts, setAdditionalReadouts] = useState<AdditionalReadoutEntry[]>(() =>
    (initial?.additionalReadouts ?? []).map((readout, index) => ({
      id: `additional-readout.${index + 1}`,
      label: readout.label,
      valueForm: readout.valueForm,
      usesNestedObservation: readout.usesNestedObservation ?? null,
      usesOrderedAxis: readout.usesOrderedAxis ?? null,
    })),
  );
  const additionalReadoutCounterRef = useRef(initial?.additionalReadouts?.length ?? 0);
  const [blocks, setBlocks] = useState<ConditionEntryBlock[]>(() =>
    initial?.conditionBlocks?.length
      ? initial.conditionBlocks.map((block, index) => createInitialBlock(index + 1, block))
      : [createBlock(1)],
  );
  const [statuses, setStatuses] = useState<Record<string, ConditionCombinationStatus>>(() => ({
    ...(initial?.statuses ?? {}),
  }));
  const [editCombinationExceptions, setEditCombinationExceptions] = useState(false);
  const [receiverLabel, setReceiverLabel] = useState(initial?.receiverLabel ?? "");
  const [relationship, setRelationship] = useState<ReceiverRelationship>(
    initial?.relationship ?? "unknown_or_mixed",
  );
  const [relationshipAnswered, setRelationshipAnswered] = useState(Boolean(initial?.relationship));
  const [sourceLabel, setSourceLabel] = useState(initial?.sourceLabel ?? "");
  const [sharedSourcePairedBlockId, setSharedSourcePairedBlockId] = useState(
    initial?.sharedSourcePairedBlockId ?? "",
  );
  const [childObservationEnabled, setChildObservationEnabled] = useState(
    Boolean(initial?.childLabel?.trim()),
  );
  const [childLabel, setChildLabel] = useState(initial?.childLabel ?? "");
  const [orderedAxisEnabled, setOrderedAxisEnabled] = useState(Boolean(initial?.orderedAxis));
  const [orderedAxisLabel, setOrderedAxisLabel] = useState(initial?.orderedAxis?.label ?? "");
  const [orderedAxisUnit, setOrderedAxisUnit] = useState(initial?.orderedAxis?.unit ?? "");
  const [orderedAxisLevels, setOrderedAxisLevels] = useState<string[]>(() => {
    const levels = (initial?.orderedAxis?.levels ?? []).map(String);
    return [
      ...levels,
      ...Array.from({ length: Math.max(0, VISIBLE_VALUE_COLUMNS - levels.length) }, () => ""),
    ];
  });
  const [orderedAxisSameIdentity, setOrderedAxisSameIdentity] = useState<boolean | null>(
    initial?.orderedAxis?.sameIdentity ?? null,
  );
  const [editingInheritedFacts, setEditingInheritedFacts] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const [messagePlacement, setMessagePlacement] = useState<"summary" | "material">("summary");
  const combinations = useMemo(() => buildConditionCombinations(blocks), [blocks]);
  // The questions are the general route's required outline. Keep their sections visible so the
  // researcher can understand the whole interview before typing; only optional inner controls
  // are progressively revealed by the relevant answer.
  const showMeasurementSection = true;
  const showMaterialSection = true;
  const showOrderedAxisSection = true;
  const { interactionCaptureProps } = useWorkspaceDirtyBaseline(
    {
      title,
      measurementLabel,
      valueForm,
      measurementUsesNestedObservation,
      measurementUsesOrderedAxis,
      additionalReadouts,
      blocks,
      statuses,
      receiverLabel,
      relationship,
      relationshipAnswered,
      sourceLabel,
      sharedSourcePairedBlockId,
      childObservationEnabled,
      childLabel,
      orderedAxisEnabled,
      orderedAxisLabel,
      orderedAxisUnit,
      orderedAxisLevels,
      orderedAxisSameIdentity,
    },
    onDirtyChange,
  );

  useLayoutEffect(() => {
    if (!initial?.revisionMode) return;
    firstEditableControlRef.current?.focus({ preventScroll: true });
  }, [initial?.revisionMode]);

  useLayoutEffect(() => {
    if (!message) return;
    messageRef.current?.focus({ preventScroll: true });
    messageRef.current?.scrollIntoView?.({ block: "center" });
  }, [message]);

  useLayoutEffect(() => {
    const pending = pendingDeletionFocusRef.current;
    if (!pending) return;
    pendingDeletionFocusRef.current = null;
    const controls =
      pending.collection === "blocks" ? blockDeleteControlRefs : readoutDeleteControlRefs;
    const fallback =
      pending.collection === "blocks" ? addBlockControlRef.current : addReadoutControlRef.current;
    const target = pending.candidateIds
      .map((id) => controls.current.get(id))
      .find((control): control is HTMLButtonElement => Boolean(control));
    (target ?? fallback)?.focus({ preventScroll: true });
  }, [additionalReadouts, blocks]);

  const updateAdditionalReadout = (
    id: string,
    update: (readout: AdditionalReadoutEntry) => AdditionalReadoutEntry,
  ) => {
    setAdditionalReadouts((current) =>
      current.map((readout) => (readout.id === id ? update(readout) : readout)),
    );
    setMessage(null);
  };
  const nestedBindingResolved =
    measurementUsesNestedObservation !== null &&
    additionalReadouts.every(({ usesNestedObservation }) => usesNestedObservation !== null);
  const axisBindingResolved =
    measurementUsesOrderedAxis !== null &&
    additionalReadouts.every(({ usesOrderedAxis }) => usesOrderedAxis !== null);
  const setNestedReadoutBinding = (id: "primary" | string, selected: boolean) => {
    if (!nestedBindingResolved) {
      setMeasurementUsesNestedObservation(false);
      setAdditionalReadouts((current) =>
        current.map((readout) => ({ ...readout, usesNestedObservation: false })),
      );
    }
    if (id === "primary") setMeasurementUsesNestedObservation(selected);
    else
      updateAdditionalReadout(id, (readout) => ({
        ...readout,
        usesNestedObservation: selected,
      }));
    setMessage(null);
  };
  const setAxisReadoutBinding = (id: "primary" | string, selected: boolean) => {
    if (!axisBindingResolved) {
      setMeasurementUsesOrderedAxis(false);
      setAdditionalReadouts((current) =>
        current.map((readout) => ({ ...readout, usesOrderedAxis: false })),
      );
    }
    if (id === "primary") setMeasurementUsesOrderedAxis(selected);
    else
      updateAdditionalReadout(id, (readout) => ({
        ...readout,
        usesOrderedAxis: selected,
      }));
    setMessage(null);
  };

  if (!enabled) return null;

  const updateBlock = (id: string, update: (block: ConditionEntryBlock) => ConditionEntryBlock) => {
    setBlocks((current) => current.map((block) => (block.id === id ? update(block) : block)));
    setMessage(null);
  };
  const removeBlock = (id: string) => {
    setBlocks((current) => {
      const index = current.findIndex((block) => block.id === id);
      if (index < 0) return current;
      pendingDeletionFocusRef.current = {
        collection: "blocks",
        candidateIds: [current[index + 1]?.id, current[index - 1]?.id].filter(
          (candidate): candidate is string => Boolean(candidate),
        ),
      };
      return current.filter((block) => block.id !== id);
    });
  };
  const removeAdditionalReadout = (id: string) => {
    setAdditionalReadouts((current) => {
      const index = current.findIndex((readout) => readout.id === id);
      if (index < 0) return current;
      pendingDeletionFocusRef.current = {
        collection: "readouts",
        candidateIds: [current[index + 1]?.id, current[index - 1]?.id].filter(
          (candidate): candidate is string => Boolean(candidate),
        ),
      };
      return current.filter((readout) => readout.id !== id);
    });
  };
  const updateCell = (block: ConditionEntryBlock, row: number, column: number, value: string) =>
    updateBlock(block.id, (current) => ({
      ...current,
      values: current.values.map((cells, rowIndex) =>
        rowIndex === row
          ? cells.map((cell, columnIndex) => (columnIndex === column ? value : cell))
          : cells,
      ),
    }));
  const pasteAt = (
    block: ConditionEntryBlock,
    startRow: number,
    startColumn: number,
    text: string,
  ) => {
    const pasted = pastedGrid(text);
    updateBlock(block.id, (current) => {
      const rowCount = Math.max(current.values.length, startRow + pasted.length);
      const columnCount = Math.max(
        current.values[0]?.length ?? 0,
        startColumn + Math.max(...pasted.map((row) => row.length)),
      );
      const values = Array.from({ length: rowCount }, (_, row) =>
        Array.from({ length: columnCount }, (_, column) => current.values[row]?.[column] ?? ""),
      );
      pasted.forEach((cells, rowOffset) =>
        cells.forEach((value, columnOffset) => {
          values[startRow + rowOffset]![startColumn + columnOffset] = value;
        }),
      );
      return {
        ...current,
        values,
        groupLabels: Array.from({ length: rowCount }, (_, row) => current.groupLabels[row] ?? ""),
      };
    });
  };
  const submit = () => {
    if (!measurementLabel.trim() || !receiverLabel.trim()) {
      setMessagePlacement(receiverLabel.trim() ? "summary" : "material");
      setMessage(
        t(
          "測定項目と、条件を直接受けた、または群として分けた対象・試料を入力してください。",
          "Enter the measured readout and the subject or specimen that directly received the condition or group assignment.",
        ),
      );
      return;
    }
    if (showMaterialSection && !relationshipAnswered) {
      setMessagePlacement("material");
      setMessage(
        t(
          "異なる条件の間で、対象・試料がどのような関係かを選んでください。",
          "Select how subjects or specimens are related across conditions.",
        ),
      );
      return;
    }
    if (childObservationEnabled && !childLabel.trim()) {
      setMessagePlacement("material");
      setMessage(
        t(
          "個別に測ったものの名前を入力してください（例：Cell、ROI、視野）。",
          "Enter a name for the individually measured items (for example, cell, ROI, or field of view).",
        ),
      );
      return;
    }
    const built = safelyBuildBiologicalSetup({
      title,
      experimentDescription: initial?.experimentDescription,
      measurementLabel,
      valueForm,
      additionalReadouts: additionalReadouts.map(
        ({ label, valueForm: readoutValueForm, usesNestedObservation, usesOrderedAxis }) => ({
          label,
          valueForm: readoutValueForm,
          usesNestedObservation,
          usesOrderedAxis,
        }),
      ),
      measurementUsesNestedObservation,
      measurementUsesOrderedAxis,
      blocks,
      combinations,
      statuses,
      receiverLabel,
      receiverIdLabel: initial?.receiverIdLabel ?? "",
      relationship,
      sourceLabel,
      sourceIdLabel: initial?.sourceIdLabel ?? "",
      sharedSourcePairedBlockId: sharedSourcePairedBlockId || null,
      childLabel,
      ...(orderedAxisEnabled
        ? {
            orderedAxis: {
              label: orderedAxisLabel,
              unit: orderedAxisUnit,
              levels: orderedAxisLevels
                .map((level) => level.trim())
                .filter(Boolean)
                .map((level) => (Number.isFinite(Number(level)) ? Number(level) : level)),
              sameIdentity: orderedAxisSameIdentity,
            },
          }
        : {}),
    });
    if (built.status === "stopped") {
      setMessagePlacement("summary");
      setMessage(
        locale === "ja"
          ? built.reason
          : "The experiment structure could not be confirmed. Review the highlighted answers; no data were discarded or reinterpreted.",
      );
    } else {
      const accepted = onReady(built.result);
      setMessagePlacement("summary");
      setMessage(
        accepted === false
          ? null
          : t(
              "条件と材料のつながりを確認できました。入力表を作成します。",
              "The relationship between conditions and materials is confirmed. Creating the data table.",
            ),
      );
    }
  };
  const experimentSummary = buildBiologicalExperimentSummary({
    locale,
    blocks,
    receiverLabel,
    readoutLabels: [measurementLabel, ...additionalReadouts.map(({ label }) => label)],
    relationship,
    sourceLabel,
    sharedSourcePairedBlockId,
    childLabel,
    ...(childLabel.trim()
      ? {
          nestedReadoutLabels: [
            ...(valueForm === "single" &&
            (additionalReadouts.length === 0 || measurementUsesNestedObservation === true)
              ? [measurementLabel]
              : []),
            ...additionalReadouts
              .filter(
                ({ valueForm: readoutValueForm, usesNestedObservation }) =>
                  readoutValueForm === "single" && usesNestedObservation === true,
              )
              .map(({ label }) => label),
          ],
          aggregateReadoutLabels: [
            ...(valueForm !== "single" ? [measurementLabel] : []),
            ...additionalReadouts
              .filter(({ valueForm: readoutValueForm }) => readoutValueForm !== "single")
              .map(({ label }) => label),
          ],
        }
      : {}),
    ...(orderedAxisEnabled
      ? {
          orderedAxis: {
            label: orderedAxisLabel,
            unit: orderedAxisUnit,
            levels: orderedAxisLevels.filter((level) => level.trim()),
            sameIdentity: orderedAxisSameIdentity,
            ...(additionalReadouts.length > 0
              ? {
                  readoutLabels: [
                    ...(measurementUsesOrderedAxis ? [measurementLabel] : []),
                    ...additionalReadouts
                      .filter(({ usesOrderedAxis }) => usesOrderedAxis)
                      .map(({ label }) => label),
                  ],
                }
              : {}),
          },
        }
      : {}),
  });
  const inheritedFactsSummary = initial?.statisticsHandoff
    ? [
        ...blocks.map((block) => {
          const values = populatedCells(block).map(({ displayLabel }) => displayLabel);
          return `${block.name.trim() || t("処理・群分け", "Treatment or group")}: ${values.join(t("、", ", ")) || t("未入力", "not entered")}`;
        }),
        `${t("測定", "Measurement")}: ${measurementLabel.trim() || t("未入力", "not entered")}`,
      ].join(t("。", ". "))
    : "";
  const submitLabel = initial?.revisionMode
    ? t("変更を適用", "Apply changes")
    : initial?.statisticsHandoff
      ? t("統計設定へ進む", "Continue to statistics setup")
      : t("この内容で入力表を作る", "Create data table");
  const externalLlmPrompt = createExperimentConsultationPrompt({
    title,
    conditionFactors: blocks.map((block) => ({
      name: block.name,
      levels: populatedCells(block).map(({ displayLabel }) => displayLabel),
    })),
    measurement: measurementLabel,
    valueForm: valueFormOptions.find(([value]) => value === valueForm)?.[1] ?? valueForm,
    receiver: receiverLabel,
    relationship:
      relationship === "separate"
        ? t("条件ごとに別々のもの", "Separate experimental units for each condition")
        : relationship === "same"
          ? t(
              "同じ対象・試料を複数条件で測定",
              "The same unit was measured under multiple conditions",
            )
          : relationship === "shared_source"
            ? t(
                `別々のものだが共通の${sourceLabel.trim() || "由来・実験回"}に属する`,
                `Separate units sharing the same ${sourceLabel.trim() || "source or experimental run"}`,
              )
            : relationship === "unknown_or_mixed"
              ? t("不明または混在", "Unknown or mixed")
              : "",
    nestedObservation: childLabel,
    orderedAxis: orderedAxisEnabled
      ? `${orderedAxisLabel || t("順序軸", "ordered axis")} (${orderedAxisLevels.filter(Boolean).join(" / ") || t("値未入力", "values not entered")} ${orderedAxisUnit})`
      : t("なし", "None"),
  });

  return (
    <section
      className="biological-setup"
      aria-labelledby="biological-setup-heading"
      {...interactionCaptureProps}
    >
      <header>
        <p className="biological-setup__eyebrow">
          {initial?.revisionMode
            ? t("入力済みデータを保持して修正", "Revise while preserving entered data")
            : initial?.statisticsHandoff
              ? t("統計のための確認", "Information needed for statistics")
              : t("実験から始める", "Start from the experiment")}
        </p>
        <h1 id="biological-setup-heading">
          {initial?.revisionMode
            ? t("実験の組み立てを修正", "Revise experiment structure")
            : initial?.statisticsHandoff
              ? t("統計に必要な実験情報", "Experiment information needed for statistics")
              : t("実験の条件と測定内容", "Experimental conditions and measurements")}
        </h1>
        <p>
          {initial?.revisionMode
            ? t(
                "入力済みの測定値は変更せず、実験の組み立てだけを確認します。安全に引き継げない変更は適用しません。",
                "Review only the experiment structure without changing entered measurements. Changes that cannot be carried forward safely will not be applied.",
              )
            : initial?.statisticsHandoff
              ? t(
                  "表だけでは分からない、値を得た材料のつながりを確認します。",
                  "Confirm how the measured materials are related when this cannot be determined from the table alone.",
                )
              : t(
                  "実際に行った処理と、値を得た材料のつながりを順に整理します。",
                  "Describe the treatments you performed and how the measured materials are related.",
                )}
        </p>
        <details className="biological-setup__help">
          <summary aria-label={t("この画面の詳しい説明", "More about this screen")}>?</summary>
          <p>
            {t(
              "小さな実験は少ない入力で完了します。必要な場合だけ処理や材料の情報を追加します。分からない関係を推測して解析へ進めることはありません。",
              "Simple experiments require only a few answers. Add treatment or material details only when needed. BioFigureStat will not guess an unknown relationship in order to proceed with analysis.",
            )}
          </p>
        </details>
        <ExternalLlmConsultation prompt={externalLlmPrompt} placement="experiment_setup" />
      </header>

      {initial?.notice ? (
        <p className="biological-setup__handoff-note" role="status">
          {initial.notice}
        </p>
      ) : null}
      {externalError ? (
        <p className="experiment-start__validation" role="alert">
          {externalError}
        </p>
      ) : null}

      <div className="biological-setup__layout">
        <div className="biological-setup__main">
          <label className="biological-setup__field">
            <span>{t("実験タイトル（任意）", "Experiment title (optional)")}</span>
            <input
              ref={firstEditableControlRef}
              value={title}
              onChange={(event) => setTitle(event.currentTarget.value)}
            />
          </label>

          {initial?.statisticsHandoff && !editingInheritedFacts ? (
            <section
              className="biological-setup__inherited-facts"
              aria-labelledby="inherited-facts-heading"
            >
              <div>
                <h2 id="inherited-facts-heading">
                  {t("表から引き継いだ内容", "Information carried over from the table")}
                </h2>
                <p>{inheritedFactsSummary}</p>
              </div>
              <button type="button" onClick={() => setEditingInheritedFacts(true)}>
                {t("条件・測定を修正", "Edit conditions and measurements")}
              </button>
            </section>
          ) : null}

          {!initial?.statisticsHandoff || editingInheritedFacts ? (
            <>
              <section
                className="biological-setup__section"
                aria-labelledby="condition-plan-heading"
                data-usage-area="condition_definition"
              >
                <div className="biological-setup__section-heading">
                  <div>
                    <p>1</p>
                    <h2 id="condition-plan-heading">
                      {t("処理・群分け", "Treatments and groups")}
                    </h2>
                  </div>
                  <button
                    ref={addBlockControlRef}
                    className="biological-setup__add-factor"
                    type="button"
                    onClick={() =>
                      setBlocks((current) => {
                        const nextIndex =
                          Math.max(
                            0,
                            ...current.map(({ id }) => Number(id.split(".").at(-1)) || 0),
                          ) + 1;
                        return [...current, createBlock(nextIndex)];
                      })
                    }
                  >
                    {t(
                      "＋ 別の種類の処理・群分けを追加",
                      "+ Add another treatment or grouping factor",
                    )}
                  </button>
                </div>
                <div className="biological-setup__section-intro">
                  <p>
                    {t(
                      "条件として変えた項目を「名前」に、実際に比較する条件名を下の表へ横方向に入力します。",
                      "Enter the factor you changed as the name, then enter the conditions you will compare across the table.",
                    )}
                  </p>
                  <details className="biological-setup__inline-help">
                    <summary
                      aria-label={t("処理・群分けの入力方法", "How to enter treatments and groups")}
                    >
                      ?
                    </summary>
                    <p>
                      {t(
                        "通常は1行のまま使います。たとえばVehicle、Drug A、Drug Bは同じ行へ入力します。Drugという親分類も図に残したい場合だけ「親グループも記録する」を使い、親分類と実際の条件を分けて入力します。",
                        "Usually, keep a single row and enter Vehicle, Drug A, and Drug B across it. Use a parent group only when you need to preserve a higher-level category, such as Drug, separately from the actual conditions.",
                      )}
                    </p>
                  </details>
                </div>
                {blocks.map((block, blockIndex) => (
                  <article className="biological-setup__condition" key={block.id}>
                    <div className="biological-setup__condition-heading">
                      <label>
                        <span>{t("名前", "Name")}</span>
                        <input
                          aria-label={t(
                            `処理・群分け ${blockIndex + 1}の名前`,
                            `Name of treatment or grouping factor ${blockIndex + 1}`,
                          )}
                          placeholder={t("例：薬剤濃度", "Example: drug concentration")}
                          value={block.name}
                          onChange={(event) => {
                            const name = event.currentTarget.value;
                            updateBlock(block.id, (current) => ({
                              ...current,
                              name,
                            }));
                          }}
                        />
                      </label>
                      <label className="biological-setup__check">
                        <input
                          type="checkbox"
                          aria-label={t(
                            `${conditionBlockActionLabel(block, blockIndex)}に親グループ列を追加する`,
                            `Add a parent-group column to treatment or grouping factor ${blockIndex + 1}`,
                          )}
                          checked={block.showGroups}
                          onChange={(event) => {
                            const showGroups = event.currentTarget.checked;
                            updateBlock(block.id, (current) => ({
                              ...current,
                              showGroups,
                            }));
                          }}
                        />
                        <span>
                          {t(
                            "親グループも記録する（必要な場合）",
                            "Also record parent groups (if needed)",
                          )}
                        </span>
                      </label>
                      {blocks.length > 1 ? (
                        <button
                          ref={(control) => {
                            if (control) blockDeleteControlRefs.current.set(block.id, control);
                            else blockDeleteControlRefs.current.delete(block.id);
                          }}
                          type="button"
                          aria-label={t(
                            `${conditionBlockActionLabel(block, blockIndex)}を削除`,
                            `Delete treatment or grouping factor ${blockIndex + 1}`,
                          )}
                          onClick={() => removeBlock(block.id)}
                        >
                          {t("削除", "Remove")}
                        </button>
                      ) : null}
                    </div>
                    <div className="biological-setup__grid-wrap">
                      <table
                        aria-label={t(
                          `${block.name || `処理・群分け ${blockIndex + 1}`}の具体的な値`,
                          `Specific values for ${block.name || `treatment or grouping factor ${blockIndex + 1}`}`,
                        )}
                      >
                        <thead>
                          <tr>
                            {block.showGroups ? (
                              <th scope="col">{t("親グループ", "Parent group")}</th>
                            ) : null}
                            {block.values[0]?.map((_, column) => (
                              <th scope="col" key={column}>
                                {t(`値 ${column + 1}`, `Value ${column + 1}`)}
                              </th>
                            ))}
                          </tr>
                        </thead>
                        <tbody>
                          {block.values.map((row, rowIndex) => (
                            <tr key={rowIndex}>
                              {block.showGroups ? (
                                <td>
                                  <input
                                    aria-label={t(
                                      `${
                                        blocks.length > 1
                                          ? `${block.name.trim() || `処理・群分け ${blockIndex + 1}`}：`
                                          : ""
                                      }行 ${rowIndex + 1}のまとまり`,
                                      `${block.name.trim() || `Treatment or grouping factor ${blockIndex + 1}`}: parent group for row ${rowIndex + 1}`,
                                    )}
                                    value={block.groupLabels[rowIndex] ?? ""}
                                    data-spreadsheet-cell="true"
                                    data-spreadsheet-row={rowIndex}
                                    data-spreadsheet-column={0}
                                    onKeyDown={moveSpreadsheetFocus}
                                    onChange={(event) => {
                                      const label = event.currentTarget.value;
                                      updateBlock(block.id, (current) => ({
                                        ...current,
                                        groupLabels: current.groupLabels.map(
                                          (currentLabel, index) =>
                                            index === rowIndex ? label : currentLabel,
                                        ),
                                      }));
                                    }}
                                  />
                                </td>
                              ) : null}
                              {row.map((value, columnIndex) => (
                                <td key={columnIndex}>
                                  <input
                                    aria-label={t(
                                      `${
                                        blocks.length > 1
                                          ? `${block.name.trim() || `処理・群分け ${blockIndex + 1}`}：`
                                          : ""
                                      }行 ${rowIndex + 1} 列 ${columnIndex + 1}`,
                                      `${block.name.trim() || `Treatment or grouping factor ${blockIndex + 1}`}: row ${rowIndex + 1}, column ${columnIndex + 1}`,
                                    )}
                                    value={value}
                                    data-spreadsheet-cell="true"
                                    data-spreadsheet-row={rowIndex}
                                    data-spreadsheet-column={
                                      columnIndex + (block.showGroups ? 1 : 0)
                                    }
                                    onKeyDown={moveSpreadsheetFocus}
                                    onChange={(event) =>
                                      updateCell(
                                        block,
                                        rowIndex,
                                        columnIndex,
                                        event.currentTarget.value,
                                      )
                                    }
                                    onPaste={(event) => {
                                      const text = event.clipboardData.getData("text");
                                      if (text.includes("\t") || /[\r\n]/.test(text)) {
                                        event.preventDefault();
                                        pasteAt(block, rowIndex, columnIndex, text);
                                      }
                                    }}
                                  />
                                </td>
                              ))}
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                    <div className="biological-setup__grid-actions">
                      <button
                        type="button"
                        aria-label={t(
                          `${conditionBlockActionLabel(block, blockIndex)}に行を追加`,
                          `Add a row to treatment or grouping factor ${blockIndex + 1}`,
                        )}
                        onClick={() =>
                          updateBlock(block.id, (current) => ({
                            ...current,
                            values: [
                              ...current.values,
                              Array.from({ length: current.values[0]?.length ?? 1 }, () => ""),
                            ],
                            groupLabels: [...current.groupLabels, ""],
                          }))
                        }
                      >
                        {t("＋ 行", "+ Row")}
                      </button>
                      <button
                        type="button"
                        aria-label={t(
                          `${conditionBlockActionLabel(block, blockIndex)}に列を追加`,
                          `Add a column to treatment or grouping factor ${blockIndex + 1}`,
                        )}
                        onClick={() =>
                          updateBlock(block.id, (current) => ({
                            ...current,
                            values: current.values.map((row) => [...row, ""]),
                          }))
                        }
                      >
                        {t("＋ 列", "+ Column")}
                      </button>
                    </div>
                  </article>
                ))}
              </section>

              {showMeasurementSection ? (
                <section
                  className="biological-setup__section"
                  aria-labelledby="measurement-heading"
                  data-usage-area="measurement_definition"
                >
                  <div className="biological-setup__section-heading">
                    <div>
                      <p>2</p>
                      <h2 id="measurement-heading">{t("測定した値", "Measured values")}</h2>
                    </div>
                  </div>
                  <label className="biological-setup__field">
                    <span>{t("測定項目", "Measured readout")}</span>
                    <input
                      placeholder={t("例：細胞生存率", "Example: cell viability")}
                      value={measurementLabel}
                      onChange={(event) => setMeasurementLabel(event.currentTarget.value)}
                    />
                    <small>
                      {t(
                        "グラフの縦軸名の候補として使います。後から変更できます。",
                        "This will be suggested as the Graph Y-axis title. You can change it later.",
                      )}
                    </small>
                  </label>
                  <fieldset>
                    <legend>
                      {t("この測定値をどの形で記録しましたか？", "How was this readout recorded?")}
                    </legend>
                    <div className="biological-setup__choices">
                      {valueFormOptions.map(([value, label, example]) => (
                        <label key={value}>
                          <input
                            type="radio"
                            name="original-value-form"
                            checked={valueForm === value}
                            onChange={() => setValueForm(value)}
                          />
                          <span>
                            <strong>{label}</strong>
                            <small>{example}</small>
                          </span>
                        </label>
                      ))}
                    </div>
                  </fieldset>
                  <section
                    className="biological-setup__additional-readouts"
                    aria-labelledby="additional-readouts-heading"
                  >
                    <div className="biological-setup__subsection-heading">
                      <div>
                        <h3 id="additional-readouts-heading">
                          {t(
                            "同じ条件で、ほかにも測りましたか？",
                            "Did you measure any other readouts under the same conditions?",
                          )}
                        </h3>
                        <small>
                          {t(
                            "同じ対象・条件から得た別の測定値を追加できます。別の実験単位や条件をここへ追加する必要はありません。",
                            "Add other readouts obtained from the same units and conditions. Do not add a different experimental unit or condition here.",
                          )}
                        </small>
                      </div>
                      <button
                        ref={addReadoutControlRef}
                        type="button"
                        onClick={() =>
                          setAdditionalReadouts((current) => {
                            additionalReadoutCounterRef.current += 1;
                            return [
                              ...current,
                              {
                                id: `readout.additional.${additionalReadoutCounterRef.current}`,
                                label: "",
                                valueForm: "single",
                                usesNestedObservation: null,
                                usesOrderedAxis: null,
                              },
                            ];
                          })
                        }
                      >
                        {t("＋ 測定項目を追加", "+ Add readout")}
                      </button>
                    </div>
                    {additionalReadouts.map((readout, index) => (
                      <fieldset className="biological-setup__additional-readout" key={readout.id}>
                        <legend>
                          {t(`追加の測定項目 ${index + 2}`, `Additional readout ${index + 2}`)}
                        </legend>
                        <div className="biological-setup__additional-readout-heading">
                          <label className="biological-setup__field">
                            <span>{t("測定項目の名前", "Readout name")}</span>
                            <input
                              aria-label={t(
                                `追加の測定項目 ${index + 2}の名前`,
                                `Name of additional measured readout ${index + 2}`,
                              )}
                              placeholder={t(
                                "例：細胞数、total protein",
                                "Example: cell count, total protein",
                              )}
                              value={readout.label}
                              onChange={(event) => {
                                const label = event.currentTarget.value;
                                updateAdditionalReadout(readout.id, (current) => ({
                                  ...current,
                                  label,
                                }));
                              }}
                            />
                          </label>
                          <button
                            ref={(control) => {
                              if (control)
                                readoutDeleteControlRefs.current.set(readout.id, control);
                              else readoutDeleteControlRefs.current.delete(readout.id);
                            }}
                            type="button"
                            aria-label={t(
                              `追加の測定項目 ${index + 2}を削除`,
                              `Delete additional measured readout ${index + 2}`,
                            )}
                            onClick={() => removeAdditionalReadout(readout.id)}
                          >
                            {t("削除", "Remove")}
                          </button>
                        </div>
                        <div className="biological-setup__choices">
                          {valueFormOptions.map(([value, label, example]) => (
                            <label key={value}>
                              <input
                                type="radio"
                                name={`additional-readout-form-${readout.id}`}
                                checked={readout.valueForm === value}
                                onChange={() =>
                                  updateAdditionalReadout(readout.id, (current) => ({
                                    ...current,
                                    valueForm: value,
                                  }))
                                }
                              />
                              <span>
                                <strong>{label}</strong>
                                <small>{example}</small>
                              </span>
                            </label>
                          ))}
                        </div>
                      </fieldset>
                    ))}
                  </section>
                </section>
              ) : null}

              {showMaterialSection ? (
                <section
                  className="biological-setup__section"
                  aria-labelledby="combination-heading"
                  data-usage-area="combination_review"
                >
                  <div className="biological-setup__section-heading">
                    <div>
                      <p>3</p>
                      <h2 id="combination-heading">
                        {t("実施した組み合わせ", "Condition combinations performed")}
                      </h2>
                    </div>
                  </div>
                  {combinations.length ? (
                    <>
                      <label className="biological-setup__all-combinations">
                        <input
                          type="checkbox"
                          checked={!editCombinationExceptions}
                          onChange={(event) => {
                            const allPerformed = event.currentTarget.checked;
                            setEditCombinationExceptions(!allPerformed);
                            if (allPerformed) setStatuses({});
                          }}
                        />
                        <span>
                          {t(
                            "作った組み合わせはすべて実施した",
                            "All listed combinations were performed",
                          )}
                        </span>
                      </label>
                      {editCombinationExceptions ? (
                        <div className="biological-setup__combinations">
                          {combinations.map((combination) => (
                            <label key={combination.id}>
                              <span>{combination.displayLabel}</span>
                              <select
                                aria-label={`${combination.displayLabel}の実施状況`}
                                value={statuses[combination.id] ?? "performed"}
                                onChange={(event) => {
                                  const status = event.currentTarget
                                    .value as ConditionCombinationStatus;
                                  setStatuses((current) => ({
                                    ...current,
                                    [combination.id]: status,
                                  }));
                                }}
                              >
                                <option value="performed">{t("実施した", "Performed")}</option>
                                <option value="not_performed">
                                  {t("実施していない", "Not performed")}
                                </option>
                                <option value="unknown">{t("未確認", "Not confirmed")}</option>
                              </select>
                            </label>
                          ))}
                        </div>
                      ) : (
                        <small>
                          {t(
                            `${combinations.length}通りを実施する予定として扱います。実施しない組み合わせがある場合だけ、チェックを外してください。`,
                            `All ${combinations.length} combinations will be treated as performed. Clear the checkbox only if some combinations were not performed.`,
                          )}
                        </small>
                      )}
                    </>
                  ) : (
                    <p className="biological-setup__empty">
                      {t(
                        "具体的な値を入力すると、組み合わせを確認できます。",
                        "Enter condition values to review their combinations.",
                      )}
                    </p>
                  )}
                </section>
              ) : null}
            </>
          ) : null}

          {showMaterialSection ? (
            <section
              className="biological-setup__section"
              aria-labelledby="material-heading"
              data-usage-area="unit_relationship"
            >
              <div className="biological-setup__section-heading">
                <div>
                  <p>{initial?.statisticsHandoff ? "1" : "4"}</p>
                  <h2 id="material-heading">
                    {t(
                      "条件を受けたものと材料のつながり",
                      "Experimental units and their relationships",
                    )}
                  </h2>
                </div>
              </div>
              {message && messagePlacement === "material" ? (
                <p
                  ref={messageRef}
                  className="biological-setup__message"
                  role="alert"
                  tabIndex={-1}
                >
                  {message}
                </p>
              ) : null}
              <label className="biological-setup__field">
                <span>
                  {t(
                    "条件を直接受けた、または群として分けた対象・試料は？",
                    "What unit directly received a condition or was assigned to a group?",
                  )}
                </span>
                <input
                  placeholder={t(
                    "例：culture dish、mouse、donor由来試料",
                    "Example: culture dish, mouse, donor-derived sample",
                  )}
                  value={receiverLabel}
                  onChange={(event) => setReceiverLabel(event.currentTarget.value)}
                />
              </label>
              <details className="biological-setup__inline-help">
                <summary
                  aria-label={t(
                    "対象・試料の入力について詳しく見る",
                    "More about the experimental unit",
                  )}
                >
                  ?
                </summary>
                <p>
                  {t(
                    "例はmouse、culture dish、well、donor由来試料などです。測定値そのものを得たCellや視野ではなく、処置や群分けを個別に割り当てたものを入力します。同じ対象を複数条件で測った場合も、その対象を入力します。",
                    "Examples include a mouse, culture dish, well, or donor-derived sample. Enter the unit individually assigned to a treatment or group, not the Cell or field from which a measurement was read. If the same unit was measured under multiple conditions, enter that unit.",
                  )}
                </p>
              </details>
              <fieldset>
                <legend>
                  {t(
                    "異なる条件の間で、これらはどのような関係ですか？",
                    "How are these units related across conditions?",
                  )}
                </legend>
                <div className="biological-setup__choices biological-setup__choices--relations">
                  {(
                    (locale === "ja"
                      ? [
                          ["separate", "条件ごとに別々のもの", "別dishを各1条件に割り当てた"],
                          [
                            "same",
                            "同じ試料・細胞を、処理前後または複数条件で繰り返し測定した",
                            "同じanimalを処理前後で測定した",
                          ],
                          [
                            "shared_source",
                            "別々のものだが、同じ由来・実験回として対応する組がある",
                            "同じdonor由来、または同じ実験run内のControl/Drugを別dishで行った",
                          ],
                          [
                            "unknown_or_mixed",
                            "分からない、または混在している",
                            "関係が条件ごとに異なる場合を含む",
                          ],
                        ]
                      : [
                          [
                            "separate",
                            "Separate units for each condition",
                            "A different dish was assigned to each condition",
                          ],
                          [
                            "same",
                            "The same sample or cell was measured before/after treatment or under multiple conditions",
                            "The same animal was measured before and after treatment",
                          ],
                          [
                            "shared_source",
                            "Separate units form matched sets from the same source or experimental run",
                            "Control and Drug used separate dishes from the same donor or experimental run",
                          ],
                          [
                            "unknown_or_mixed",
                            "Unknown or mixed",
                            "Includes relationships that differ between conditions",
                          ],
                        ]) as readonly (readonly [ReceiverRelationship, string, string])[]
                  ).map(([value, label, example]) => (
                    <label key={value}>
                      <input
                        type="radio"
                        name="receiver-relationship"
                        checked={relationshipAnswered && relationship === value}
                        onChange={() => {
                          setRelationship(value);
                          setRelationshipAnswered(true);
                          setMessage(null);
                        }}
                      />
                      <span>
                        <strong>{label}</strong>
                        <small>{example}</small>
                      </span>
                    </label>
                  ))}
                </div>
              </fieldset>
              {relationship === "shared_source" ? (
                <>
                  <label className="biological-setup__field">
                    <span>
                      {t(
                        "別々の対象を対応づける、共通の由来・実験回は？",
                        "What shared source or experimental run matches the separate units?",
                      )}
                    </span>
                    <input
                      placeholder={t(
                        "例：donor、実験run、細胞調製batch",
                        "Example: donor, experimental run, cell-preparation batch",
                      )}
                      value={sourceLabel}
                      onChange={(event) => setSourceLabel(event.currentTarget.value)}
                    />
                  </label>
                  {blocks.length > 1 ? (
                    <label className="biological-setup__field">
                      <span>
                        {t(
                          "その対応する組の中で変えた処理・群分けは？",
                          "Which treatment or grouping factor varied within each matched set?",
                        )}
                      </span>
                      <select
                        aria-label="対応する組の中で変えた処理・群分け"
                        value={sharedSourcePairedBlockId}
                        onChange={(event) =>
                          setSharedSourcePairedBlockId(event.currentTarget.value)
                        }
                      >
                        <option value="">{t("選択してください", "Select one")}</option>
                        {blocks.map((block, index) => (
                          <option value={block.id} key={block.id}>
                            {block.name.trim() ||
                              t(
                                `${index + 1}つ目の処理・群分け`,
                                `Treatment or grouping factor ${index + 1}`,
                              )}
                          </option>
                        ))}
                        <option value="multiple_or_unknown">
                          {t(
                            "2つ以上、または共通材料との対応が一部だけ",
                            "More than one, or only partially matched by source",
                          )}
                        </option>
                      </select>
                      <small>
                        {t(
                          "例：各実験runでControl/Drugを行った場合は「Treatment」、siRNA処理後にdishへ分けてDoxを変えた場合は「Dox」です。",
                          "Example: choose Treatment when each run includes Control and Drug; choose Dox when dishes were split after siRNA treatment and then assigned different Dox conditions.",
                        )}
                      </small>
                    </label>
                  ) : null}
                </>
              ) : null}
              <label className="biological-setup__all-combinations">
                <input
                  type="checkbox"
                  checked={childObservationEnabled}
                  onChange={(event) => {
                    const enabled = event.currentTarget.checked;
                    setChildObservationEnabled(enabled);
                    if (!enabled) {
                      setChildLabel("");
                      setMeasurementUsesNestedObservation(null);
                      setAdditionalReadouts((current) =>
                        current.map((readout) => ({
                          ...readout,
                          usesNestedObservation: null,
                        })),
                      );
                    }
                    setMessage(null);
                  }}
                />
                <span>
                  {t(
                    "1つの対象・試料の中で、複数のCell・ROI・視野などを個別に測った",
                    "Multiple Cells, ROIs, fields, or similar observations were measured within each experimental unit",
                  )}
                </span>
              </label>
              {childObservationEnabled ? (
                <label className="biological-setup__field">
                  <span>{t("個別に測ったものは？", "What was measured individually?")}</span>
                  <input
                    placeholder={t("例：Cell、ROI、視野", "Example: Cell, ROI, field")}
                    value={childLabel}
                    onChange={(event) => setChildLabel(event.currentTarget.value)}
                  />
                </label>
              ) : null}
              {childObservationEnabled && childLabel.trim() && additionalReadouts.length > 0 ? (
                <fieldset>
                  <legend>
                    {t(
                      `${childLabel.trim()}ごとに測った項目`,
                      `Readouts measured for each ${childLabel.trim()}`,
                    )}
                  </legend>
                  <small>
                    {t(
                      `dish全体の値と、個々の${childLabel.trim()}から得た値を区別します。`,
                      `Distinguish values for the whole experimental unit from values obtained from each ${childLabel.trim()}.`,
                    )}
                  </small>
                  <div className="biological-setup__choices">
                    {valueForm === "single" ? (
                      <label>
                        <input
                          type="checkbox"
                          checked={measurementUsesNestedObservation === true}
                          onChange={(event) =>
                            setNestedReadoutBinding("primary", event.currentTarget.checked)
                          }
                        />
                        <span>
                          <strong>
                            {measurementLabel.trim() || t("最初の測定項目", "First readout")}
                          </strong>
                        </span>
                      </label>
                    ) : null}
                    {additionalReadouts
                      .filter(({ valueForm: form }) => form === "single")
                      .map((readout) => (
                        <label key={readout.id}>
                          <input
                            type="checkbox"
                            checked={readout.usesNestedObservation === true}
                            onChange={(event) =>
                              setNestedReadoutBinding(readout.id, event.currentTarget.checked)
                            }
                          />
                          <span>
                            <strong>
                              {readout.label.trim() || t("名前未入力の測定項目", "Unnamed readout")}
                            </strong>
                          </span>
                        </label>
                      ))}
                  </div>
                  {[valueForm, ...additionalReadouts.map(({ valueForm: form }) => form)].some(
                    (form) => form !== "single",
                  ) ? (
                    <small>
                      {t(
                        `陽性数＋全体数など、試料全体でまとめた値は${childLabel.trim()}ごとの測定にはしません。`,
                        `Aggregate values for the whole unit, such as positive count plus total count, are not treated as measurements for each ${childLabel.trim()}.`,
                      )}
                    </small>
                  ) : null}
                </fieldset>
              ) : null}
            </section>
          ) : null}

          {showOrderedAxisSection ? (
            <section
              className="biological-setup__section"
              aria-labelledby="ordered-axis-heading"
              data-usage-area="ordered_structure"
            >
              <div className="biological-setup__section-heading">
                <div>
                  <p>{initial?.statisticsHandoff ? "2" : "5"}</p>
                  <h2 id="ordered-axis-heading">
                    {t(
                      "時間などに沿った測定（必要な場合）",
                      "Measurements along time or another ordered axis (if needed)",
                    )}
                  </h2>
                </div>
              </div>
              <label className="biological-setup__all-combinations">
                <input
                  type="checkbox"
                  checked={orderedAxisEnabled}
                  onChange={(event) => setOrderedAxisEnabled(event.currentTarget.checked)}
                />
                <span>
                  {t(
                    "同じ条件の中で、時間・距離などの順序に沿って測った",
                    "Measurements were made along time, distance, or another ordered axis within the same condition",
                  )}
                </span>
              </label>
              {orderedAxisEnabled ? (
                <>
                  <div className="biological-setup__two-fields">
                    <label>
                      <span>
                        {t("何に沿って測りましたか？", "What ordered axis did you measure along?")}
                      </span>
                      <input
                        placeholder={t("例：時間", "Example: time")}
                        value={orderedAxisLabel}
                        onChange={(event) => setOrderedAxisLabel(event.currentTarget.value)}
                      />
                    </label>
                    <label>
                      <span>{t("単位", "Unit")}</span>
                      <input
                        placeholder={t("例：h、min、µm", "Example: h, min, µm")}
                        value={orderedAxisUnit}
                        onChange={(event) => setOrderedAxisUnit(event.currentTarget.value)}
                      />
                    </label>
                  </div>
                  <div className="biological-setup__grid-wrap">
                    <table aria-label={t("順序に沿った測定値", "Ordered-axis values")}>
                      <thead>
                        <tr>
                          {orderedAxisLevels.map((_, index) => (
                            <th scope="col" key={index}>
                              {orderedAxisLabel.trim() || t("値", "Value")} {index + 1}
                              {orderedAxisUnit.trim() ? `（${orderedAxisUnit.trim()}）` : ""}
                            </th>
                          ))}
                        </tr>
                      </thead>
                      <tbody>
                        <tr>
                          {orderedAxisLevels.map((value, index) => (
                            <td key={index}>
                              <input
                                aria-label={t(
                                  `${orderedAxisLabel.trim() || "順序"}の値 ${index + 1}${
                                    orderedAxisUnit.trim() ? `（${orderedAxisUnit.trim()}）` : ""
                                  }`,
                                  `${orderedAxisLabel.trim() || "Ordered axis"} value ${index + 1}${
                                    orderedAxisUnit.trim() ? ` (${orderedAxisUnit.trim()})` : ""
                                  }`,
                                )}
                                value={value}
                                data-spreadsheet-cell="true"
                                data-spreadsheet-row={0}
                                data-spreadsheet-column={index}
                                onKeyDown={moveSpreadsheetFocus}
                                onChange={(event) => {
                                  const value = event.currentTarget.value;
                                  setOrderedAxisLevels((current) =>
                                    current.map((cell, cellIndex) =>
                                      cellIndex === index ? value : cell,
                                    ),
                                  );
                                }}
                                onPaste={(event) => {
                                  const pasted = event.clipboardData
                                    .getData("text")
                                    .replace(/\r\n?/g, "\n")
                                    .split(/[\t\n]/)
                                    .filter(Boolean);
                                  if (pasted.length > 1) {
                                    event.preventDefault();
                                    setOrderedAxisLevels((current) => {
                                      const next = [...current];
                                      pasted.forEach((cell, offset) => {
                                        next[index + offset] = cell;
                                      });
                                      return next;
                                    });
                                  }
                                }}
                              />
                            </td>
                          ))}
                        </tr>
                      </tbody>
                    </table>
                  </div>
                  <button
                    type="button"
                    onClick={() => setOrderedAxisLevels((current) => [...current, ""])}
                  >
                    {t("＋ 値", "+ Value")}
                  </button>
                  {additionalReadouts.length > 0 ? (
                    <fieldset>
                      <legend>
                        {t(
                          `この${orderedAxisLabel.trim() || "時間・距離の系列"}で測った項目`,
                          `Readouts measured along this ${orderedAxisLabel.trim() || "time or distance series"}`,
                        )}
                      </legend>
                      <div className="biological-setup__choices">
                        <label>
                          <input
                            type="checkbox"
                            checked={measurementUsesOrderedAxis === true}
                            onChange={(event) =>
                              setAxisReadoutBinding("primary", event.currentTarget.checked)
                            }
                          />
                          <span>
                            <strong>
                              {measurementLabel.trim() || t("最初の測定項目", "First readout")}
                            </strong>
                          </span>
                        </label>
                        {additionalReadouts.map((readout) => (
                          <label key={readout.id}>
                            <input
                              type="checkbox"
                              checked={readout.usesOrderedAxis === true}
                              onChange={(event) =>
                                setAxisReadoutBinding(readout.id, event.currentTarget.checked)
                              }
                            />
                            <span>
                              <strong>
                                {readout.label.trim() ||
                                  t("名前未入力の測定項目", "Unnamed readout")}
                              </strong>
                            </span>
                          </label>
                        ))}
                      </div>
                    </fieldset>
                  ) : null}
                  <fieldset>
                    <legend>
                      {t(
                        "各値で測った対象は同じですか？",
                        "Was the same unit measured at each value?",
                      )}
                    </legend>
                    <div className="biological-setup__choices biological-setup__choices--relations">
                      <label>
                        <input
                          type="radio"
                          name="axis-identity"
                          checked={orderedAxisSameIdentity === true}
                          onChange={() => setOrderedAxisSameIdentity(true)}
                        />
                        <span>
                          <strong>
                            {t("同じ対象を追って測った", "The same unit was followed")}
                          </strong>
                          <small>
                            {t(
                              "同じCellやanimalを時点ごとに測定",
                              "The same Cell or animal was measured at each time point",
                            )}
                          </small>
                        </span>
                      </label>
                      <label>
                        <input
                          type="radio"
                          name="axis-identity"
                          checked={orderedAxisSameIdentity === false}
                          onChange={() => setOrderedAxisSameIdentity(false)}
                        />
                        <span>
                          <strong>
                            {t(
                              "各値で別の対象を測った",
                              "A different unit was measured at each value",
                            )}
                          </strong>
                          <small>
                            {t(
                              "時点ごとに別dishを回収",
                              "A different dish was collected at each time point",
                            )}
                          </small>
                        </span>
                      </label>
                    </div>
                  </fieldset>
                </>
              ) : null}
            </section>
          ) : null}
          <div className="biological-setup__completion" data-usage-area="setup_summary">
            <p>
              {t(
                "入力内容を確認できたら、共通のデータ入力表へ進みます。",
                "After reviewing these answers, continue to the shared data-entry table.",
              )}
            </p>
            <button
              type="button"
              className="biological-setup__submit"
              aria-label={
                initial?.revisionMode
                  ? t("変更を適用（入力内容の末尾）", "Apply changes (end of form)")
                  : initial?.statisticsHandoff
                    ? t(
                        "統計設定へ進む（入力内容の末尾）",
                        "Continue to statistics setup (end of form)",
                      )
                    : t("入力表を作る（入力内容の末尾）", "Create data table (end of form)")
              }
              onClick={submit}
            >
              {submitLabel}
            </button>
          </div>
        </div>

        <aside
          className="biological-setup__rail"
          aria-label={t("現在の実験と操作", "Current experiment and actions")}
          data-usage-area="setup_summary"
        >
          <div className="biological-setup__summary" aria-live="polite">
            <strong>{t("現在の実験", "Current experiment")}</strong>
            <p>{experimentSummary}</p>
            {message && messagePlacement === "summary" ? (
              <p ref={messageRef} className="biological-setup__message" role="alert" tabIndex={-1}>
                {message}
              </p>
            ) : null}
          </div>
          <div className="biological-setup__actions">
            {onCancel ? (
              <button type="button" onClick={onCancel}>
                {initial?.revisionMode
                  ? t("変更せず戻る", "Back without changes")
                  : t("戻る", "Back")}
              </button>
            ) : null}
            <button type="button" className="biological-setup__submit" onClick={submit}>
              {submitLabel}
            </button>
          </div>
        </aside>
      </div>
    </section>
  );
}

import { useLayoutEffect, useMemo, useRef, useState } from "react";
import { buildStructureContract, type MinimalBiologicalAnswers } from "@lsaa/adaptive-input";
import type { StructureContract } from "@lsaa/domain";

import { useWorkspaceDirtyBaseline } from "../app/useWorkspaceDirtyBaseline";
import { createExperimentConsultationPrompt } from "../app/externalLlmConsultation";
import { ExternalLlmConsultation } from "./ExternalLlmConsultation";
import { moveSpreadsheetFocus } from "./spreadsheetGrid";
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
  const firstEditableControlRef = useRef<HTMLInputElement | null>(null);
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
  const [simpleFactsConfirmed, setSimpleFactsConfirmed] = useState(false);
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
  const combinations = useMemo(() => buildConditionCombinations(blocks), [blocks]);
  const conditionDefinitionReady = blocks.every(
    (block) => Boolean(block.name.trim()) && populatedCells(block).length > 0,
  );
  const measurementDefinitionReady = Boolean(measurementLabel.trim());
  const showMeasurementSection = Boolean(initial) || conditionDefinitionReady;
  const showMaterialSection =
    Boolean(initial) ||
    (showMeasurementSection && measurementDefinitionReady && combinations.length > 0);
  const showOrderedAxisSection =
    Boolean(initial) ||
    (showMaterialSection && Boolean(receiverLabel.trim()) && relationshipAnswered);
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
      simpleFactsConfirmed,
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
    if (showMaterialSection && !relationshipAnswered) {
      setMessage("異なる条件の間で、対象・試料がどのような関係かを選んでください。");
      return;
    }
    if (childObservationEnabled && !childLabel.trim()) {
      setMessage("個別に測ったものの名前を入力してください（例：Cell、ROI、視野）。");
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
    if (built.status === "stopped") setMessage(built.reason);
    else {
      const accepted = onReady(built.result);
      setMessage(
        accepted === false ? null : "条件と材料のつながりを確認できました。入力表を作成します。",
      );
    }
  };
  const submitSimpleIndependentExperiment = () => {
    if (!receiverLabel.trim()) {
      setMessage("条件を個別に割り当てた対象・試料の名前を入力してください。");
      return;
    }
    if (!simpleFactsConfirmed) {
      setMessage("3つの実験事実を確認してから入力表を作ってください。");
      return;
    }
    const built = safelyBuildBiologicalSetup({
      title,
      experimentDescription: initial?.experimentDescription,
      measurementLabel,
      valueForm,
      additionalReadouts: [],
      measurementUsesNestedObservation: false,
      measurementUsesOrderedAxis: false,
      blocks,
      combinations,
      statuses,
      receiverLabel,
      receiverIdLabel: initial?.receiverIdLabel ?? "",
      relationship: "separate",
      sourceLabel: "",
      sourceIdLabel: initial?.sourceIdLabel ?? "",
      sharedSourcePairedBlockId: null,
      childLabel: "",
    });
    if (built.status === "stopped") {
      setMessage(built.reason);
      return;
    }
    const accepted = onReady(built.result);
    setMessage(accepted === false ? null : "単純な独立条件の入力表を作成します。");
  };
  const experimentSummary = buildBiologicalExperimentSummary({
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
          return `${block.name.trim() || "処理・群分け"}: ${values.join("、") || "未入力"}`;
        }),
        `測定: ${measurementLabel.trim() || "未入力"}`,
      ].join("。")
    : "";
  const externalLlmPrompt = createExperimentConsultationPrompt({
    title,
    conditionFactors: blocks.map((block) => ({
      name: block.name,
      levels: populatedCells(block).map(({ displayLabel }) => displayLabel),
    })),
    measurement: measurementLabel,
    valueForm: VALUE_FORM_OPTIONS.find(([value]) => value === valueForm)?.[1] ?? valueForm,
    receiver: receiverLabel,
    relationship:
      relationship === "separate"
        ? "条件ごとに別々のもの"
        : relationship === "same"
          ? "同じ対象・試料を複数条件で測定"
          : relationship === "shared_source"
            ? `別々のものだが共通の${sourceLabel.trim() || "由来・実験回"}に属する`
            : relationship === "unknown_or_mixed"
              ? "不明または混在"
              : "",
    nestedObservation: childLabel,
    orderedAxis: orderedAxisEnabled
      ? `${orderedAxisLabel || "順序軸"} (${orderedAxisLevels.filter(Boolean).join(" / ") || "値未入力"} ${orderedAxisUnit})`
      : "なし",
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
            ? "入力済みデータを保持して修正"
            : initial?.statisticsHandoff
              ? "統計のための確認"
              : "実験から始める"}
        </p>
        <h1 id="biological-setup-heading">
          {initial?.revisionMode
            ? "実験の組み立てを修正"
            : initial?.statisticsHandoff
              ? "統計に必要な実験情報"
              : "実験の条件と測定内容"}
        </h1>
        <p>
          {initial?.revisionMode
            ? "入力済みの測定値は変更せず、実験の組み立てだけを確認します。安全に引き継げない変更は適用しません。"
            : initial?.statisticsHandoff
              ? "表だけでは分からない、値を得た材料のつながりを確認します。"
              : "実際に行った処理と、値を得た材料のつながりを順に整理します。"}
        </p>
        <details className="biological-setup__help">
          <summary aria-label="この画面の詳しい説明">?</summary>
          <p>
            小さな実験は少ない入力で完了します。必要な場合だけ処理や材料の情報を追加します。分からない関係を推測して解析へ進めることはありません。
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
            <span>実験タイトル（任意）</span>
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
                <h2 id="inherited-facts-heading">表から引き継いだ内容</h2>
                <p>{inheritedFactsSummary}</p>
              </div>
              <button type="button" onClick={() => setEditingInheritedFacts(true)}>
                条件・測定を修正
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
                    <h2 id="condition-plan-heading">処理・群分け</h2>
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
                    ＋ 別の種類の処理・群分けを追加
                  </button>
                </div>
                <div className="biological-setup__section-intro">
                  <p>
                    条件として変えた項目を「名前」に、実際に比較する条件名を下の表へ横方向に入力します。
                  </p>
                  <details className="biological-setup__inline-help">
                    <summary aria-label="処理・群分けの入力方法">?</summary>
                    <p>
                      通常は1行のまま使います。たとえばVehicle、Drug A、Drug
                      Bは同じ行へ入力します。Drugという親分類も図に残したい場合だけ「親グループも記録する」を使い、親分類と実際の条件を分けて入力します。
                    </p>
                  </details>
                </div>
                {blocks.map((block, blockIndex) => (
                  <article className="biological-setup__condition" key={block.id}>
                    <div className="biological-setup__condition-heading">
                      <label>
                        <span>名前</span>
                        <input
                          aria-label={`処理・群分け ${blockIndex + 1}の名前`}
                          placeholder="例：薬剤濃度"
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
                          aria-label={`${conditionBlockActionLabel(block, blockIndex)}に親グループ列を追加する`}
                          checked={block.showGroups}
                          onChange={(event) => {
                            const showGroups = event.currentTarget.checked;
                            updateBlock(block.id, (current) => ({
                              ...current,
                              showGroups,
                            }));
                          }}
                        />
                        <span>親グループも記録する（必要な場合）</span>
                      </label>
                      {blocks.length > 1 ? (
                        <button
                          ref={(control) => {
                            if (control) blockDeleteControlRefs.current.set(block.id, control);
                            else blockDeleteControlRefs.current.delete(block.id);
                          }}
                          type="button"
                          aria-label={`${conditionBlockActionLabel(block, blockIndex)}を削除`}
                          onClick={() => removeBlock(block.id)}
                        >
                          削除
                        </button>
                      ) : null}
                    </div>
                    <div className="biological-setup__grid-wrap">
                      <table
                        aria-label={`${block.name || `処理・群分け ${blockIndex + 1}`}の具体的な値`}
                      >
                        <thead>
                          <tr>
                            {block.showGroups ? <th scope="col">親グループ</th> : null}
                            {block.values[0]?.map((_, column) => (
                              <th scope="col" key={column}>
                                値 {column + 1}
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
                                    aria-label={`${
                                      blocks.length > 1
                                        ? `${block.name.trim() || `処理・群分け ${blockIndex + 1}`}：`
                                        : ""
                                    }行 ${rowIndex + 1}のまとまり`}
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
                                    aria-label={`${
                                      blocks.length > 1
                                        ? `${block.name.trim() || `処理・群分け ${blockIndex + 1}`}：`
                                        : ""
                                    }行 ${rowIndex + 1} 列 ${columnIndex + 1}`}
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
                        aria-label={`${conditionBlockActionLabel(block, blockIndex)}に行を追加`}
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
                        ＋ 行
                      </button>
                      <button
                        type="button"
                        aria-label={`${conditionBlockActionLabel(block, blockIndex)}に列を追加`}
                        onClick={() =>
                          updateBlock(block.id, (current) => ({
                            ...current,
                            values: current.values.map((row) => [...row, ""]),
                          }))
                        }
                      >
                        ＋ 列
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
                      <h2 id="measurement-heading">測定した値</h2>
                    </div>
                  </div>
                  <label className="biological-setup__field">
                    <span>測定項目</span>
                    <input
                      placeholder="例：細胞生存率"
                      value={measurementLabel}
                      onChange={(event) => setMeasurementLabel(event.currentTarget.value)}
                    />
                    <small>グラフの縦軸名の候補として使います。後から変更できます。</small>
                  </label>
                  <fieldset>
                    <legend>この測定値をどの形で記録しましたか？</legend>
                    <div className="biological-setup__choices">
                      {VALUE_FORM_OPTIONS.map(([value, label, example]) => (
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
                        <h3 id="additional-readouts-heading">同じ条件で、ほかにも測りましたか？</h3>
                        <small>
                          同じ対象・条件から得た別の測定値を追加できます。別の実験単位や条件をここへ追加する必要はありません。
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
                        ＋ 測定項目を追加
                      </button>
                    </div>
                    {additionalReadouts.map((readout, index) => (
                      <fieldset className="biological-setup__additional-readout" key={readout.id}>
                        <legend>追加の測定項目 {index + 2}</legend>
                        <div className="biological-setup__additional-readout-heading">
                          <label className="biological-setup__field">
                            <span>測定項目の名前</span>
                            <input
                              aria-label={`追加の測定項目 ${index + 2}の名前`}
                              placeholder="例：細胞数、total protein"
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
                            aria-label={`追加の測定項目 ${index + 2}を削除`}
                            onClick={() => removeAdditionalReadout(readout.id)}
                          >
                            削除
                          </button>
                        </div>
                        <div className="biological-setup__choices">
                          {VALUE_FORM_OPTIONS.map(([value, label, example]) => (
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

              {!initial &&
              showMaterialSection &&
              valueForm === "single" &&
              additionalReadouts.length === 0 ? (
                <section
                  className="biological-setup__simple-path"
                  aria-labelledby="simple-path-heading"
                >
                  <div>
                    <p className="biological-setup__eyebrow">短い経路</p>
                    <h2 id="simple-path-heading">単純な独立条件なら、ここから入力表へ進めます</h2>
                    <p>
                      統計手法ではなく、次の実験事実を確認します。該当しない場合は下の通常質問へ進んでください。
                    </p>
                  </div>
                  <label className="biological-setup__field">
                    <span>各条件を個別に割り当てた対象・試料</span>
                    <input
                      aria-label="短い経路の対象・試料"
                      placeholder="例：culture dish、mouse"
                      value={receiverLabel}
                      onChange={(event) => setReceiverLabel(event.currentTarget.value)}
                    />
                  </label>
                  <label className="biological-setup__simple-confirmation">
                    <input
                      type="checkbox"
                      checked={simpleFactsConfirmed}
                      onChange={(event) => setSimpleFactsConfirmed(event.currentTarget.checked)}
                    />
                    <span>
                      条件ごとに別々の対象を使い、1つの対象から複数Cell・視野などを数えておらず、同じ対象の経時・反復測定もしていない
                    </span>
                  </label>
                  <button
                    className="primary-button"
                    type="button"
                    onClick={submitSimpleIndependentExperiment}
                  >
                    この実験事実で入力表を作る
                  </button>
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
                      <h2 id="combination-heading">実施した組み合わせ</h2>
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
                        <span>作った組み合わせはすべて実施した</span>
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
                                <option value="performed">実施した</option>
                                <option value="not_performed">実施していない</option>
                                <option value="unknown">未確認</option>
                              </select>
                            </label>
                          ))}
                        </div>
                      ) : (
                        <small>
                          {combinations.length}
                          通りを実施する予定として扱います。実施しない組み合わせがある場合だけ、チェックを外してください。
                        </small>
                      )}
                    </>
                  ) : (
                    <p className="biological-setup__empty">
                      具体的な値を入力すると、組み合わせを確認できます。
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
                  <h2 id="material-heading">条件を受けたものと材料のつながり</h2>
                </div>
              </div>
              <label className="biological-setup__field">
                <span>条件を直接受けた、または群として分けた対象・試料は？</span>
                <input
                  placeholder="例：culture dish、mouse、donor由来試料"
                  value={receiverLabel}
                  onChange={(event) => setReceiverLabel(event.currentTarget.value)}
                />
              </label>
              <details className="biological-setup__inline-help">
                <summary aria-label="対象・試料の入力について詳しく見る">?</summary>
                <p>
                  例はmouse、culture
                  dish、well、donor由来試料などです。測定値そのものを得たCellや視野ではなく、処置や群分けを個別に割り当てたものを入力します。同じ対象を複数条件で測った場合も、その対象を入力します。
                </p>
              </details>
              <fieldset>
                <legend>異なる条件の間で、これらはどのような関係ですか？</legend>
                <div className="biological-setup__choices biological-setup__choices--relations">
                  {(
                    [
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
                    ] as const
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
                    <span>別々の対象を対応づける、共通の由来・実験回は？</span>
                    <input
                      placeholder="例：donor、実験run、細胞調製batch"
                      value={sourceLabel}
                      onChange={(event) => setSourceLabel(event.currentTarget.value)}
                    />
                  </label>
                  {blocks.length > 1 ? (
                    <label className="biological-setup__field">
                      <span>その対応する組の中で変えた処理・群分けは？</span>
                      <select
                        aria-label="対応する組の中で変えた処理・群分け"
                        value={sharedSourcePairedBlockId}
                        onChange={(event) =>
                          setSharedSourcePairedBlockId(event.currentTarget.value)
                        }
                      >
                        <option value="">選択してください</option>
                        {blocks.map((block, index) => (
                          <option value={block.id} key={block.id}>
                            {block.name.trim() || `${index + 1}つ目の処理・群分け`}
                          </option>
                        ))}
                        <option value="multiple_or_unknown">
                          2つ以上、または共通材料との対応が一部だけ
                        </option>
                      </select>
                      <small>
                        例：各実験runでControl/Drugを行った場合は「Treatment」、siRNA処理後にdishへ分けてDoxを変えた場合は「Dox」です。
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
                <span>1つの対象・試料の中で、複数のCell・ROI・視野などを個別に測った</span>
              </label>
              {childObservationEnabled ? (
                <label className="biological-setup__field">
                  <span>個別に測ったものは？</span>
                  <input
                    placeholder="例：Cell、ROI、視野"
                    value={childLabel}
                    onChange={(event) => setChildLabel(event.currentTarget.value)}
                  />
                </label>
              ) : null}
              {childObservationEnabled && childLabel.trim() && additionalReadouts.length > 0 ? (
                <fieldset>
                  <legend>{childLabel.trim()}ごとに測った項目</legend>
                  <small>dish全体の値と、個々の{childLabel.trim()}から得た値を区別します。</small>
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
                          <strong>{measurementLabel.trim() || "最初の測定項目"}</strong>
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
                            <strong>{readout.label.trim() || "名前未入力の測定項目"}</strong>
                          </span>
                        </label>
                      ))}
                  </div>
                  {[valueForm, ...additionalReadouts.map(({ valueForm: form }) => form)].some(
                    (form) => form !== "single",
                  ) ? (
                    <small>
                      陽性数＋全体数など、試料全体でまとめた値は{childLabel.trim()}
                      ごとの測定にはしません。
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
                  <h2 id="ordered-axis-heading">時間などに沿った測定（必要な場合）</h2>
                </div>
              </div>
              <label className="biological-setup__all-combinations">
                <input
                  type="checkbox"
                  checked={orderedAxisEnabled}
                  onChange={(event) => setOrderedAxisEnabled(event.currentTarget.checked)}
                />
                <span>同じ条件の中で、時間・距離などの順序に沿って測った</span>
              </label>
              {orderedAxisEnabled ? (
                <>
                  <div className="biological-setup__two-fields">
                    <label>
                      <span>何に沿って測りましたか？</span>
                      <input
                        placeholder="例：時間"
                        value={orderedAxisLabel}
                        onChange={(event) => setOrderedAxisLabel(event.currentTarget.value)}
                      />
                    </label>
                    <label>
                      <span>単位</span>
                      <input
                        placeholder="例：h、min、µm"
                        value={orderedAxisUnit}
                        onChange={(event) => setOrderedAxisUnit(event.currentTarget.value)}
                      />
                    </label>
                  </div>
                  <div className="biological-setup__grid-wrap">
                    <table aria-label="順序に沿った測定値">
                      <thead>
                        <tr>
                          {orderedAxisLevels.map((_, index) => (
                            <th scope="col" key={index}>
                              {orderedAxisLabel.trim() || "値"} {index + 1}
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
                                aria-label={`${orderedAxisLabel.trim() || "順序"}の値 ${index + 1}${
                                  orderedAxisUnit.trim() ? `（${orderedAxisUnit.trim()}）` : ""
                                }`}
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
                    ＋ 値
                  </button>
                  {additionalReadouts.length > 0 ? (
                    <fieldset>
                      <legend>
                        この{orderedAxisLabel.trim() || "時間・距離の系列"}で測った項目
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
                            <strong>{measurementLabel.trim() || "最初の測定項目"}</strong>
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
                              <strong>{readout.label.trim() || "名前未入力の測定項目"}</strong>
                            </span>
                          </label>
                        ))}
                      </div>
                    </fieldset>
                  ) : null}
                  <fieldset>
                    <legend>各値で測った対象は同じですか？</legend>
                    <div className="biological-setup__choices biological-setup__choices--relations">
                      <label>
                        <input
                          type="radio"
                          name="axis-identity"
                          checked={orderedAxisSameIdentity === true}
                          onChange={() => setOrderedAxisSameIdentity(true)}
                        />
                        <span>
                          <strong>同じ対象を追って測った</strong>
                          <small>同じCellやanimalを時点ごとに測定</small>
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
                          <strong>各値で別の対象を測った</strong>
                          <small>時点ごとに別dishを回収</small>
                        </span>
                      </label>
                    </div>
                  </fieldset>
                </>
              ) : null}
            </section>
          ) : null}
          <div className="biological-setup__completion" data-usage-area="setup_summary">
            <p>入力内容を確認できたら、共通のデータ入力表へ進みます。</p>
            <button
              type="button"
              className="biological-setup__submit"
              aria-label={
                initial?.revisionMode
                  ? "変更を適用（入力内容の末尾）"
                  : "入力表を作る（入力内容の末尾）"
              }
              onClick={submit}
            >
              {initial?.revisionMode ? "変更を適用" : "この内容で入力表を作る"}
            </button>
          </div>
        </div>

        <aside
          className="biological-setup__rail"
          aria-label="現在の実験と操作"
          data-usage-area="setup_summary"
        >
          <div className="biological-setup__summary" aria-live="polite">
            <strong>現在の実験</strong>
            <p>{experimentSummary}</p>
            {message ? <p className="biological-setup__message">{message}</p> : null}
          </div>
          <div className="biological-setup__actions">
            {onCancel ? (
              <button type="button" onClick={onCancel}>
                {initial?.revisionMode ? "変更せず戻る" : "戻る"}
              </button>
            ) : null}
            <button type="button" className="biological-setup__submit" onClick={submit}>
              {initial?.revisionMode ? "変更を適用" : "この内容で入力表を作る"}
            </button>
          </div>
        </aside>
      </div>
    </section>
  );
}

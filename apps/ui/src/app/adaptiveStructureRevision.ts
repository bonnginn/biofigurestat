import {
  buildStructureContract,
  semanticKey,
  validateCanonicalObservationsForContract,
  type MinimalBiologicalAnswers,
} from "@lsaa/adaptive-input";
import type {
  AdaptiveColumnMapping,
  BiologicalSetupPresentation,
  CanonicalAdaptiveObservation,
  StructureContract,
} from "@lsaa/domain";
import {
  BIOLOGICAL_SETUP_PRESENTATION_VERSION,
  BiologicalSetupPresentationSchema,
} from "@lsaa/domain";

export type BiologicalSetupValueForm =
  "single" | "positive_total" | "target_reference" | "category_count";

export type BiologicalSetupPrefill = Readonly<{
  /** The retained contract is the no-op submit boundary. */
  originalContract: StructureContract;
  title: string;
  experimentDescription: string;
  measurementLabel: string;
  valueForm: BiologicalSetupValueForm;
  measurementUsesNestedObservation: boolean;
  measurementUsesOrderedAxis: boolean;
  additionalReadouts: readonly Readonly<{
    id: string;
    label: string;
    valueForm: BiologicalSetupValueForm;
    usesNestedObservation: boolean;
    usesOrderedAxis: boolean;
  }>[];
  conditionBlocks: readonly Readonly<{
    id: string;
    name: string;
    showGroups: boolean;
    groupLabels: readonly string[];
    values: readonly (readonly string[])[];
  }>[];
  statuses: Readonly<Record<string, "performed" | "not_performed" | "unknown">>;
  receiverLabel: string;
  receiverIdLabel: string;
  relationship: "separate" | "same" | "shared_source";
  sourceLabel: string;
  sourceIdLabel: string;
  sharedSourcePairedBlockId: string;
  childLabel: string;
  orderedAxis?: Readonly<{
    label: string;
    unit: string;
    levels: readonly (string | number)[];
    sameIdentity: boolean;
  }>;
}>;

type BiologicalSetupResultLike = Readonly<{
  contract: StructureContract;
  answers?: MinimalBiologicalAnswers;
  conditionBlocks?: readonly Readonly<{
    id: string;
    name: string;
    showGroups: boolean;
    groupLabels: readonly string[];
    values: readonly (readonly string[])[];
  }>[];
  conditionCombinations?: readonly Readonly<{
    id: string;
    labels?: readonly string[];
    displayLabel?: string;
    status: "performed" | "not_performed" | "unknown";
  }>[];
}>;

export type BiologicalSetupPrefillStopCode =
  | "UNSUPPORTED_FACTOR_PROFILE"
  | "UNSUPPORTED_UNIT_HIERARCHY"
  | "UNSUPPORTED_IDENTITY_PROFILE"
  | "UNSUPPORTED_MATCHING_PROFILE"
  | "UNSUPPORTED_READOUT_REPRESENTATION"
  | "UNSUPPORTED_ORDERED_AXIS_PROFILE"
  | "CONTRACT_NOT_PRODUCED_BY_BIOLOGICAL_SETUP"
  | "SETUP_RESULT_CONTRACT_MISMATCH";

export type BiologicalSetupPrefillResult =
  | Readonly<{ status: "ready"; prefill: BiologicalSetupPrefill }>
  | Readonly<{
      status: "stopped";
      code: BiologicalSetupPrefillStopCode;
      reason: string;
    }>;

const VALUE_FORM_BY_REPRESENTATION: Partial<
  Record<StructureContract["readouts"][number]["representation"], BiologicalSetupValueForm>
> = {
  scalar: "single",
  proportion_counts: "positive_total",
  target_reference: "target_reference",
  category_counts: "category_count",
};

const PREFILL_REASONS: Record<BiologicalSetupPrefillStopCode, string> = {
  UNSUPPORTED_FACTOR_PROFILE:
    "この条件間関係は現在の実験組み立て画面では安全に再現できないため、編集を開始できません。",
  UNSUPPORTED_UNIT_HIERARCHY:
    "この実験単位の階層は現在の実験組み立て画面では安全に再現できないため、編集を開始できません。",
  UNSUPPORTED_IDENTITY_PROFILE:
    "この対象IDの構造は現在の実験組み立て画面では安全に再現できないため、編集を開始できません。",
  UNSUPPORTED_MATCHING_PROFILE:
    "この対応・反復構造は現在の実験組み立て画面では安全に再現できないため、編集を開始できません。",
  UNSUPPORTED_READOUT_REPRESENTATION:
    "この測定値形式は現在の実験組み立て画面では安全に再現できないため、編集を開始できません。",
  UNSUPPORTED_ORDERED_AXIS_PROFILE:
    "この順序軸は現在の実験組み立て画面では安全に再現できないため、編集を開始できません。",
  CONTRACT_NOT_PRODUCED_BY_BIOLOGICAL_SETUP:
    "この実験構造には現在の組み立て画面で保持できない情報があるため、推測して編集せず停止しました。",
  SETUP_RESULT_CONTRACT_MISMATCH:
    "保持された組み立て内容と実験構造が一致しないため、推測して編集せず停止しました。",
};

function stoppedPrefill(code: BiologicalSetupPrefillStopCode): BiologicalSetupPrefillResult {
  return { status: "stopped", code, reason: PREFILL_REASONS[code] };
}

function isSetupResultLike(
  source: StructureContract | BiologicalSetupResultLike,
): source is BiologicalSetupResultLike {
  return "contract" in source;
}

function sameJson(left: unknown, right: unknown): boolean {
  return JSON.stringify(left) === JSON.stringify(right);
}

function gridForLevels(levels: readonly string[]): readonly (readonly string[])[] {
  const columnCount = 5;
  const rowCount = Math.max(5, Math.ceil(levels.length / columnCount));
  return Array.from({ length: rowCount }, (_, rowIndex) =>
    Array.from(
      { length: columnCount },
      (_, columnIndex) => levels[rowIndex * columnCount + columnIndex] ?? "",
    ),
  );
}

function displayedLevels(block: BiologicalSetupPrefill["conditionBlocks"][number]): string[] {
  return block.values.flatMap((row, rowIndex) =>
    row.flatMap((value) => {
      const label = value.trim();
      if (!label) return [];
      const group = block.showGroups ? block.groupLabels[rowIndex]?.trim() : "";
      return [group ? `${group} / ${label}` : label];
    }),
  );
}

function expectedConditionCombinations(
  blocks: BiologicalSetupPrefill["conditionBlocks"],
): readonly Readonly<{ id: string; labels: readonly string[]; displayLabel: string }>[] {
  const populated = blocks.map((block) =>
    block.values.flatMap((row, rowIndex) =>
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
    ),
  );
  if (populated.some((entries) => entries.length === 0)) return [];
  return populated.reduce<Array<{ id: string; labels: string[]; displayLabel: string }>>(
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

type DerivedSetupProfile = Readonly<{
  answers: MinimalBiologicalAnswers;
  relationship: BiologicalSetupPrefill["relationship"];
  receiverIdentityLabel: string;
  sourceLabel: string;
  sourceIdentityLabel: string;
  nestedLabel: string;
}>;

type DerivedSetupProfileResult =
  | Readonly<{ status: "ready"; profile: DerivedSetupProfile }>
  | Readonly<{ status: "stopped"; code: BiologicalSetupPrefillStopCode }>;

function deriveSetupProfile(contract: StructureContract): DerivedSetupProfileResult {
  if (contract.factors.length === 0 || contract.factors.some(({ ordered }) => ordered)) {
    return { status: "stopped", code: "UNSUPPORTED_FACTOR_PROFILE" };
  }

  const valueForms = contract.readouts.map(
    ({ representation }) => VALUE_FORM_BY_REPRESENTATION[representation],
  );
  if (valueForms.some((valueForm) => valueForm === undefined)) {
    return { status: "stopped", code: "UNSUPPORTED_READOUT_REPRESENTATION" };
  }
  if (contract.orderedAxes.length > 1) {
    return { status: "stopped", code: "UNSUPPORTED_ORDERED_AXIS_PROFILE" };
  }
  const axis = contract.orderedAxes[0];
  if (
    axis &&
    (axis.levels.length === 0 ||
      !(
        (axis.sampling === "repeated_same_identity" && axis.identityRetained) ||
        (axis.sampling === "cross_sectional" && !axis.identityRetained)
      ))
  ) {
    return { status: "stopped", code: "UNSUPPORTED_ORDERED_AXIS_PROFILE" };
  }

  const levelsByKey = new Map(contract.unitLevels.map((level) => [level.key, level]));
  const experimentalLevel = levelsByKey.get(contract.experimentalUnitLevelKey);
  if (!experimentalLevel) {
    return { status: "stopped", code: "UNSUPPORTED_UNIT_HIERARCHY" };
  }
  const receiverIdentities = contract.identities.filter(
    ({ unitLevelKey }) => unitLevelKey === experimentalLevel.key,
  );
  if (receiverIdentities.length !== 1) {
    return { status: "stopped", code: "UNSUPPORTED_IDENTITY_PROFILE" };
  }
  const receiverIdentity = receiverIdentities[0]!;

  const nestedLevels = contract.unitLevels.filter(
    ({ parentKey }) => parentKey === experimentalLevel.key,
  );
  if (
    nestedLevels.length > 1 ||
    (nestedLevels[0] !== undefined && nestedLevels[0].role !== "subsample")
  ) {
    return { status: "stopped", code: "UNSUPPORTED_UNIT_HIERARCHY" };
  }
  const nestedLevel = nestedLevels[0];
  if (nestedLevel) {
    const nestedIdentities = contract.identities.filter(
      ({ unitLevelKey }) => unitLevelKey === nestedLevel.key,
    );
    if (nestedIdentities.length !== 1) {
      return { status: "stopped", code: "UNSUPPORTED_IDENTITY_PROFILE" };
    }
  }

  let relationship: BiologicalSetupPrefill["relationship"];
  let sourceLabel = "";
  let sourceIdentityLabel = "";
  let conditionEntityRelationship: MinimalBiologicalAnswers["conditionEntityRelationship"];
  if (experimentalLevel.parentKey) {
    const sourceLevel = levelsByKey.get(experimentalLevel.parentKey);
    const sourceIdentities = contract.identities.filter(
      ({ unitLevelKey }) => unitLevelKey === sourceLevel?.key,
    );
    if (!sourceLevel || sourceLevel.role !== "block") {
      return { status: "stopped", code: "UNSUPPORTED_UNIT_HIERARCHY" };
    }
    if (sourceIdentities.length !== 1) {
      return { status: "stopped", code: "UNSUPPORTED_IDENTITY_PROFILE" };
    }
    if (
      contract.matching.kind !== "matched" ||
      contract.matching.identityKey !== sourceIdentities[0]!.key ||
      contract.matching.completeSetsRequired !== true
    ) {
      return { status: "stopped", code: "UNSUPPORTED_MATCHING_PROFILE" };
    }
    if (
      contract.factors[0]?.relationship !== "paired" ||
      contract.factors[0]?.unitRole !== "between_unit" ||
      contract.factors
        .slice(1)
        .some(
          ({ relationship: factorRelationship, unitRole }) =>
            factorRelationship !== "independent" || unitRole !== "between_unit",
        )
    ) {
      return { status: "stopped", code: "UNSUPPORTED_FACTOR_PROFILE" };
    }
    relationship = "shared_source";
    sourceLabel = sourceLevel.label;
    sourceIdentityLabel = sourceIdentities[0]!.label;
    conditionEntityRelationship = {
      kind: "distinct_condition_units_shared_source",
      sourceUnitLabel: sourceLabel,
      sourceIdentityLabel,
      sourceRole: "block",
      completeSetsRequired: true,
    };
  } else if (
    contract.matching.kind === "matched" &&
    contract.matching.identityKey === receiverIdentity.key &&
    contract.matching.completeSetsRequired === true
  ) {
    if (
      contract.factors.some(
        ({ relationship: factorRelationship, unitRole }) =>
          factorRelationship !== "repeated" || unitRole !== "within_unit",
      )
    ) {
      return { status: "stopped", code: "UNSUPPORTED_FACTOR_PROFILE" };
    }
    relationship = "same";
    conditionEntityRelationship = { kind: "same_entity_across_conditions" };
  } else if (
    contract.matching.kind === "independent" &&
    contract.matching.identityKey === null &&
    contract.matching.completeSetsRequired === null
  ) {
    if (
      contract.factors.some(
        ({ relationship: factorRelationship, unitRole }) =>
          factorRelationship !== "independent" || unitRole !== "between_unit",
      )
    ) {
      return { status: "stopped", code: "UNSUPPORTED_FACTOR_PROFILE" };
    }
    relationship = "separate";
    conditionEntityRelationship = { kind: "independent_condition_units" };
  } else {
    return { status: "stopped", code: "UNSUPPORTED_MATCHING_PROFILE" };
  }

  const readoutAnswers = contract.readouts.map((readout, index) => ({
    label: readout.label,
    representation: readout.representation,
    valueForm: valueForms[index]!,
    usesNestedObservation: readout.observationLevelKey !== contract.experimentalUnitLevelKey,
    usesOrderedAxis: axis ? readout.axisKeys.includes(axis.key) : false,
  }));
  const answers: MinimalBiologicalAnswers = {
    experimentName: contract.experimentName,
    experimentDescription: contract.experimentDescription,
    experimentalUnitLabel: experimentalLevel.label,
    identityLabel: receiverIdentity.label,
    readoutLabel: readoutAnswers[0]!.label,
    readoutRepresentation: readoutAnswers[0]!.representation,
    readoutUsesNestedObservation: readoutAnswers[0]!.usesNestedObservation,
    readoutUsesOrderedAxis: readoutAnswers[0]!.usesOrderedAxis,
    ...(readoutAnswers.length > 1
      ? {
          additionalReadouts: readoutAnswers
            .slice(1)
            .map(({ label, representation, usesNestedObservation, usesOrderedAxis }) => ({
              label,
              representation,
              usesNestedObservation,
              usesOrderedAxis,
            })),
        }
      : {}),
    factorName: contract.factors[0]!.label,
    factorLevels: contract.factors[0]!.levels,
    ...(contract.factors.length > 1
      ? {
          additionalFactors: contract.factors.slice(1).map((factor) => ({
            name: factor.label,
            levels: factor.levels,
            sameIdentityAcrossConditions: factor.unitRole === "within_unit",
          })),
        }
      : {}),
    sameIdentityAcrossConditions: relationship === "same",
    conditionEntityRelationship,
    ...(axis
      ? {
          orderedAxis: {
            label: axis.label,
            unit: axis.unit,
            levels: axis.levels,
            sameIdentity: axis.identityRetained,
          },
        }
      : {}),
    ...(nestedLevel ? { nestedObservationLabel: nestedLevel.label } : {}),
  };

  let rebuilt: StructureContract;
  try {
    rebuilt = buildStructureContract(answers);
  } catch {
    return { status: "stopped", code: "CONTRACT_NOT_PRODUCED_BY_BIOLOGICAL_SETUP" };
  }
  if (!sameJson(rebuilt, contract)) {
    return { status: "stopped", code: "CONTRACT_NOT_PRODUCED_BY_BIOLOGICAL_SETUP" };
  }
  return {
    status: "ready",
    profile: {
      answers,
      relationship,
      receiverIdentityLabel: receiverIdentity.label,
      sourceLabel,
      sourceIdentityLabel,
      nestedLabel: nestedLevel?.label ?? "",
    },
  };
}

/**
 * Losslessly reverse-projects the subset emitted by BiologicalExperimentSetup.
 * Profiles that need inference or coercion stop before any editable state is made.
 */
export function createBiologicalSetupPrefill(
  source: StructureContract | BiologicalSetupResultLike,
): BiologicalSetupPrefillResult {
  const resultSource = isSetupResultLike(source) ? source : null;
  const contract: StructureContract = resultSource
    ? resultSource.contract
    : (source as StructureContract);
  const derived = deriveSetupProfile(contract);
  if (derived.status === "stopped") return stoppedPrefill(derived.code);

  if (resultSource?.answers) {
    try {
      if (!sameJson(buildStructureContract(resultSource.answers), contract)) {
        return stoppedPrefill("SETUP_RESULT_CONTRACT_MISMATCH");
      }
    } catch {
      return stoppedPrefill("SETUP_RESULT_CONTRACT_MISMATCH");
    }
  }

  const retainedBlocks = resultSource?.conditionBlocks;
  let conditionBlocks: BiologicalSetupPrefill["conditionBlocks"];
  if (retainedBlocks?.length) {
    const factorsByKey = new Map(contract.factors.map((factor) => [factor.key, factor]));
    const retainedKeys = retainedBlocks.map((block) => semanticKey(block.name.trim()));
    const blocksMatch =
      retainedBlocks.length === contract.factors.length &&
      new Set(retainedKeys).size === contract.factors.length &&
      retainedKeys.every((key, index) => {
        const factor = factorsByKey.get(key);
        return (
          factor !== undefined && sameJson(displayedLevels(retainedBlocks[index]!), factor.levels)
        );
      });
    if (!blocksMatch) return stoppedPrefill("SETUP_RESULT_CONTRACT_MISMATCH");
    conditionBlocks = retainedBlocks;
  } else {
    conditionBlocks = contract.factors.map((factor, index) => ({
      id: `condition-block.${index + 1}`,
      name: factor.label,
      showGroups: false,
      groupLabels: Array.from(
        { length: Math.max(5, Math.ceil(factor.levels.length / 5)) },
        () => "",
      ),
      values: gridForLevels(factor.levels),
    }));
  }

  if (resultSource?.conditionCombinations?.some(({ status }) => status !== "performed")) {
    return stoppedPrefill("SETUP_RESULT_CONTRACT_MISMATCH");
  }
  if (resultSource?.conditionCombinations?.length) {
    const expected = expectedConditionCombinations(conditionBlocks);
    const retained = resultSource.conditionCombinations;
    const coordinatesMatch =
      retained.length === expected.length &&
      retained.every((combination, index) => {
        const coordinate = expected[index];
        return (
          coordinate !== undefined &&
          combination.id === coordinate.id &&
          (combination.labels === undefined || sameJson(combination.labels, coordinate.labels)) &&
          (combination.displayLabel === undefined ||
            combination.displayLabel === coordinate.displayLabel)
        );
      });
    if (!coordinatesMatch) return stoppedPrefill("SETUP_RESULT_CONTRACT_MISMATCH");
  }
  const statuses = Object.fromEntries(
    (resultSource?.conditionCombinations ?? []).map(({ id, status }) => [id, status]),
  );
  const pairedFactorKey =
    derived.profile.relationship === "shared_source" ? contract.factors[0]!.key : null;
  const sharedSourcePairedBlockId = pairedFactorKey
    ? (conditionBlocks.find((block) => semanticKey(block.name.trim()) === pairedFactorKey)?.id ??
      "")
    : "";
  if (pairedFactorKey && !sharedSourcePairedBlockId) {
    return stoppedPrefill("SETUP_RESULT_CONTRACT_MISMATCH");
  }

  const axis = contract.orderedAxes[0];
  const readouts = contract.readouts.map((readout) => ({
    label: readout.label,
    valueForm: VALUE_FORM_BY_REPRESENTATION[readout.representation]!,
    usesNestedObservation: readout.observationLevelKey !== contract.experimentalUnitLevelKey,
    usesOrderedAxis: axis ? readout.axisKeys.includes(axis.key) : false,
  }));
  const retainedChildLabel = resultSource?.answers?.nestedObservationLabel?.trim() ?? "";
  if (
    derived.profile.nestedLabel &&
    retainedChildLabel &&
    retainedChildLabel !== derived.profile.nestedLabel
  ) {
    return stoppedPrefill("SETUP_RESULT_CONTRACT_MISMATCH");
  }
  return {
    status: "ready",
    prefill: {
      originalContract: contract,
      title: contract.experimentName,
      experimentDescription: contract.experimentDescription,
      measurementLabel: readouts[0]!.label,
      valueForm: readouts[0]!.valueForm,
      measurementUsesNestedObservation: readouts[0]!.usesNestedObservation,
      measurementUsesOrderedAxis: readouts[0]!.usesOrderedAxis,
      additionalReadouts: readouts.slice(1).map((readout, index) => ({
        id: `readout.additional.${index + 1}`,
        ...readout,
      })),
      conditionBlocks,
      statuses,
      receiverLabel: derived.profile.answers.experimentalUnitLabel,
      receiverIdLabel: derived.profile.receiverIdentityLabel,
      relationship: derived.profile.relationship,
      sourceLabel: derived.profile.sourceLabel,
      sourceIdLabel: derived.profile.sourceIdentityLabel,
      sharedSourcePairedBlockId,
      childLabel: retainedChildLabel || derived.profile.nestedLabel,
      ...(axis
        ? {
            orderedAxis: {
              label: axis.label,
              unit: axis.unit,
              levels: axis.levels,
              sameIdentity: axis.identityRetained,
            },
          }
        : {}),
    },
  };
}

export type BiologicalSetupPresentationResult =
  | Readonly<{ status: "ready"; presentation: BiologicalSetupPresentation }>
  | Readonly<{ status: "stopped"; reason: string }>;

/**
 * Converts a completed researcher interview into versioned presentation
 * provenance only after its answers and canvas are proven to reproduce the
 * supplied StructureContract. The contract remains the semantic authority.
 */
export function createBiologicalSetupPresentation(
  result: BiologicalSetupResultLike &
    Readonly<{
      answers: MinimalBiologicalAnswers;
      conditionBlocks: NonNullable<BiologicalSetupResultLike["conditionBlocks"]>;
      conditionCombinations: readonly Readonly<{
        id: string;
        labels: readonly string[];
        displayLabel: string;
        status: "performed" | "not_performed" | "unknown";
      }>[];
    }>,
): BiologicalSetupPresentationResult {
  const validated = createBiologicalSetupPrefill(result);
  if (validated.status === "stopped") return validated;
  try {
    return {
      status: "ready",
      presentation: BiologicalSetupPresentationSchema.parse({
        schemaVersion: BIOLOGICAL_SETUP_PRESENTATION_VERSION,
        answers: result.answers,
        conditionBlocks: result.conditionBlocks,
        conditionCombinations: result.conditionCombinations,
      }),
    };
  } catch {
    return {
      status: "stopped",
      reason: PREFILL_REASONS.SETUP_RESULT_CONTRACT_MISMATCH,
    };
  }
}

export type AdaptiveStructureRevisionStopCode =
  | "IDENTITY_CHANGED"
  | "MATCHING_CHANGED"
  | "UNIT_HIERARCHY_CHANGED"
  | "NESTING_CHANGED"
  | "FACTOR_KEYS_CHANGED"
  | "FACTOR_RELATIONSHIP_CHANGED"
  | "READOUT_KEYS_CHANGED"
  | "READOUT_REPRESENTATION_CHANGED"
  | "READOUT_STRUCTURE_CHANGED"
  | "AXIS_KEYS_CHANGED"
  | "AXIS_RETENTION_CHANGED"
  | "AXIS_UNIT_CHANGED"
  | "MISSINGNESS_POLICY_CHANGED"
  | "OBSERVED_FACTOR_LEVEL_REMOVED"
  | "OBSERVED_AXIS_LEVEL_REMOVED"
  | "CANONICAL_OBSERVATIONS_INVALID"
  | "MAPPING_SEMANTIC_KEY_INVALID";

export type AdaptiveStructureRevisionCompatibility =
  | Readonly<{ status: "compatible" }>
  | Readonly<{
      status: "stopped";
      code: AdaptiveStructureRevisionStopCode;
      reason: string;
      diagnostics?: readonly string[];
    }>;

export type AdaptiveStructureRevisionCompatibilityInput = Readonly<{
  previousContract: StructureContract;
  nextContract: StructureContract;
  canonicalObservations: readonly CanonicalAdaptiveObservation[];
  mapping?: AdaptiveColumnMapping | null;
}>;

const REVISION_REASONS: Record<AdaptiveStructureRevisionStopCode, string> = {
  IDENTITY_CHANGED: "対象IDの意味または必須性が変わるため、既存データを安全に引き継げません。",
  MATCHING_CHANGED: "条件間の対応・反復関係が変わるため、既存データを安全に引き継げません。",
  UNIT_HIERARCHY_CHANGED: "実験単位の階層が変わるため、既存データを安全に引き継げません。",
  NESTING_CHANGED: "対象内の個別測定の階層が変わるため、既存データを安全に引き継げません。",
  FACTOR_KEYS_CHANGED: "処理・群分けの識別キーが変わるため、既存データを安全に引き継げません。",
  FACTOR_RELATIONSHIP_CHANGED:
    "処理・群分けと対象の関係が変わるため、既存データを安全に引き継げません。",
  READOUT_KEYS_CHANGED: "測定項目の識別キーが変わるため、既存データを安全に引き継げません。",
  READOUT_REPRESENTATION_CHANGED:
    "測定値の記録形式が変わるため、既存データを安全に引き継げません。",
  READOUT_STRUCTURE_CHANGED:
    "測定値の構成要素または観測階層が変わるため、既存データを安全に引き継げません。",
  AXIS_KEYS_CHANGED:
    "時間・距離などの順序軸の識別キーが変わるため、既存データを安全に引き継げません。",
  AXIS_RETENTION_CHANGED:
    "順序軸で同じ対象を追跡するかどうかが変わるため、既存データを安全に引き継げません。",
  AXIS_UNIT_CHANGED: "順序軸の単位が変わると既存値の意味が変わるため、安全に引き継げません。",
  MISSINGNESS_POLICY_CHANGED: "欠測理由の扱いが変わるため、既存データを安全に引き継げません。",
  OBSERVED_FACTOR_LEVEL_REMOVED:
    "既存データで使われている処理・群の値が削除されるため、変更を適用できません。",
  OBSERVED_AXIS_LEVEL_REMOVED:
    "既存データで使われている順序軸の値が削除されるため、変更を適用できません。",
  CANONICAL_OBSERVATIONS_INVALID:
    "既存の観測行を新しい実験構造へ一意に対応づけられないため、変更を適用できません。",
  MAPPING_SEMANTIC_KEY_INVALID:
    "元データの列対応に、新しい実験構造では使えない識別キーまたは値が残るため、変更を適用できません。",
};

function stoppedRevision(
  code: AdaptiveStructureRevisionStopCode,
  diagnostics?: readonly string[],
): AdaptiveStructureRevisionCompatibility {
  return {
    status: "stopped",
    code,
    reason: REVISION_REASONS[code],
    ...(diagnostics?.length ? { diagnostics } : {}),
  };
}

function keys<T extends { key: string }>(items: readonly T[]): readonly string[] {
  return items.map(({ key }) => key);
}

function nestedSignature(contract: StructureContract): unknown {
  const levels = new Map(contract.unitLevels.map((level) => [level.key, level]));
  const isBelowExperimentalUnit = (key: string): boolean => {
    let cursor = levels.get(key);
    const visited = new Set<string>();
    while (cursor?.parentKey && !visited.has(cursor.key)) {
      if (cursor.parentKey === contract.experimentalUnitLevelKey) return true;
      visited.add(cursor.key);
      cursor = levels.get(cursor.parentKey);
    }
    return false;
  };
  return contract.unitLevels
    .filter(({ key }) => isBelowExperimentalUnit(key))
    .map(({ key, role, parentKey }) => ({ key, role, parentKey }));
}

const coordinateValue = (value: string | number): string => String(value).normalize("NFKC").trim();

function mappingDiagnostics(
  contract: StructureContract,
  mapping: AdaptiveColumnMapping,
): readonly string[] {
  const identities = new Set(contract.identities.map(({ key }) => key));
  const factors = new Map(contract.factors.map((factor) => [factor.key, factor]));
  const axes = new Map(contract.orderedAxes.map((axis) => [axis.key, axis]));
  const hierarchy = new Set(contract.unitLevels.map(({ key }) => key));
  const valueKeys = new Set(
    contract.readouts.flatMap((readout) => [
      readout.key,
      ...readout.componentKeys,
      ...readout.componentKeys.map((component) => `${readout.key}_${component}`),
    ]),
  );
  const diagnostics: string[] = [];
  Object.entries(mapping.columns).forEach(([column, assignment]) => {
    const key = assignment.semanticKey;
    if (assignment.role === "identity" && (!key || !identities.has(key))) {
      diagnostics.push(`mapping:${column}:unknown_identity:${key ?? "null"}`);
    } else if (assignment.role === "factor" && (!key || !factors.has(key))) {
      diagnostics.push(`mapping:${column}:unknown_factor:${key ?? "null"}`);
    } else if (assignment.role === "axis" && (!key || !axes.has(key))) {
      diagnostics.push(`mapping:${column}:unknown_axis:${key ?? "null"}`);
    } else if (assignment.role === "hierarchy" && (!key || !hierarchy.has(key))) {
      diagnostics.push(`mapping:${column}:unknown_hierarchy:${key ?? "null"}`);
    } else if (
      (assignment.role === "value" || assignment.role === "missingness") &&
      (!key || !valueKeys.has(key))
    ) {
      diagnostics.push(`mapping:${column}:unknown_value:${key ?? "null"}`);
    } else if ((assignment.role === "metadata" || assignment.role === "ignore") && key !== null) {
      diagnostics.push(`mapping:${column}:unexpected_semantic_key:${key}`);
    }
    Object.entries(assignment.fixedFactors).forEach(([factorKey, level]) => {
      const factor = factors.get(factorKey);
      if (!factor || !factor.levels.includes(level)) {
        diagnostics.push(`mapping:${column}:unknown_fixed_factor:${factorKey}:${level}`);
      }
    });
    Object.entries(assignment.fixedAxes).forEach(([axisKey, level]) => {
      const axis = axes.get(axisKey);
      if (
        !axis ||
        !axis.levels.some((candidate) => coordinateValue(candidate) === coordinateValue(level))
      ) {
        diagnostics.push(`mapping:${column}:unknown_fixed_axis:${axisKey}:${String(level)}`);
      }
    });
  });
  return diagnostics;
}

type CanonicalValue = CanonicalAdaptiveObservation["values"][string];

type ReadoutValueSlot = Readonly<{
  component: string;
  candidates: readonly string[];
}>;

function readoutValueSlots(
  readout: StructureContract["readouts"][number],
): readonly ReadoutValueSlot[] {
  if (readout.representation === "scalar") {
    const component = readout.componentKeys[0] ?? "value";
    return [
      {
        component,
        candidates: [...new Set([readout.key, component, `${readout.key}_${component}`])],
      },
    ];
  }
  return readout.componentKeys.map((component) => ({
    component,
    candidates: [...new Set([component, `${readout.key}_${component}`])],
  }));
}

function valueMatchesReadoutType(
  readout: StructureContract["readouts"][number],
  component: string,
  value: CanonicalValue,
): boolean {
  if (value === null) return true;
  const finiteNumber = typeof value === "number" && Number.isFinite(value);
  if (
    readout.representation === "proportion_counts" ||
    readout.representation === "target_reference" ||
    readout.representation === "paired_readouts" ||
    readout.representation === "dose_response"
  ) {
    return finiteNumber;
  }
  if (readout.representation === "category_counts") {
    // Some retained category-count tables use the category component as a
    // label, while the current cell model stores one numeric count per named
    // component. Both are explicit typed records; booleans are never counts.
    return component.toLowerCase() === "category"
      ? typeof value === "string" || finiteNumber
      : finiteNumber;
  }
  if (readout.representation === "event_censoring") {
    return /event|status|observed/i.test(component)
      ? typeof value === "boolean"
      : finiteNumber || typeof value === "string";
  }
  if (readout.representation === "scalar") {
    const valueType = readout.valueType.toLowerCase();
    if (/bool|binary/.test(valueType)) return typeof value === "boolean";
    if (/text|string|categor/.test(valueType)) return typeof value === "string";
    if (/scalar|continuous|number|numeric|integer|count|ratio|proportion/.test(valueType)) {
      return finiteNumber;
    }
  }
  // A custom other_typed_bundle has no primitive-type vocabulary in
  // StructureContract 0.1.0. Its schema-safe primitive is still retained,
  // while its declared component address is checked strictly above.
  return typeof value === "string" || finiteNumber || typeof value === "boolean";
}

function canonicalRowSemanticDiagnostics(
  contract: StructureContract,
  observations: readonly CanonicalAdaptiveObservation[],
  boundary: "previous" | "next",
): readonly string[] {
  const diagnostics: string[] = [];
  const readouts = new Map(contract.readouts.map((readout) => [readout.key, readout]));
  const levels = new Map(contract.unitLevels.map((level) => [level.key, level]));
  const identities = new Map(contract.identities.map((identity) => [identity.key, identity]));
  const allowedMissingness = new Set(contract.allowedMissingness);

  observations.forEach((observation) => {
    const prefix = `${boundary}:adaptive_observation:${observation.observationId}`;
    const readout = readouts.get(observation.readoutKey);
    if (!readout) return;

    const applicableLevels = new Set<string>();
    const visited = new Set<string>();
    let cursor = levels.get(readout.observationLevelKey);
    while (cursor && !visited.has(cursor.key)) {
      applicableLevels.add(cursor.key);
      visited.add(cursor.key);
      cursor = cursor.parentKey ? levels.get(cursor.parentKey) : undefined;
    }
    Object.entries(observation.identities).forEach(([key, value]) => {
      if (!identities.has(key)) diagnostics.push(`${prefix}:unknown_identity:${key}`);
      if (!value.trim()) diagnostics.push(`${prefix}:empty_identity:${key}`);
    });
    contract.identities
      .filter(({ required, unitLevelKey }) => required && applicableLevels.has(unitLevelKey))
      .forEach(({ key }) => {
        if (!observation.identities[key]?.trim()) {
          diagnostics.push(`${prefix}:missing_required_identity:${key}`);
        }
      });

    Object.entries(observation.hierarchy).forEach(([key, value]) => {
      if (!levels.has(key)) diagnostics.push(`${prefix}:unknown_hierarchy:${key}`);
      if (!value.trim()) diagnostics.push(`${prefix}:empty_hierarchy:${key}`);
    });

    const slots = readoutValueSlots(readout);
    const allowedValueKeys = new Set(slots.flatMap(({ candidates }) => candidates));
    Object.keys(observation.values).forEach((key) => {
      if (!allowedValueKeys.has(key)) diagnostics.push(`${prefix}:unknown_value:${key}`);
    });
    slots.forEach(({ component, candidates }) => {
      const present = candidates.filter((key) =>
        Object.prototype.hasOwnProperty.call(observation.values, key),
      );
      if (present.length !== 1) {
        diagnostics.push(`${prefix}:value_component_address_count:${component}:${present.length}`);
        return;
      }
      const key = present[0]!;
      const value = observation.values[key]!;
      if (!valueMatchesReadoutType(readout, component, value)) {
        diagnostics.push(`${prefix}:invalid_value_type:${key}:${typeof value}`);
      }
      const missingness = observation.missingness[key];
      if (value === null && missingness === undefined) {
        diagnostics.push(`${prefix}:null_without_missingness:${key}`);
      }
      if (value !== null && missingness !== undefined) {
        diagnostics.push(`${prefix}:missingness_for_present_value:${key}`);
      }
    });
    Object.entries(observation.missingness).forEach(([key, kind]) => {
      if (!allowedValueKeys.has(key)) diagnostics.push(`${prefix}:unknown_missingness_key:${key}`);
      if (!Object.prototype.hasOwnProperty.call(observation.values, key)) {
        diagnostics.push(`${prefix}:missingness_without_value:${key}`);
      }
      if (!allowedMissingness.has(kind)) {
        diagnostics.push(`${prefix}:disallowed_missingness:${key}:${kind}`);
      }
    });
  });
  return diagnostics;
}

/**
 * Alpha preservation boundary for changing only an adaptive experiment's structure.
 * It proves that every retained row and mapping still has the same semantic address.
 */
export function checkAdaptiveStructureRevisionCompatibility({
  previousContract,
  nextContract,
  canonicalObservations,
  mapping,
}: AdaptiveStructureRevisionCompatibilityInput): AdaptiveStructureRevisionCompatibility {
  if (!sameJson(nestedSignature(previousContract), nestedSignature(nextContract))) {
    return stoppedRevision("NESTING_CHANGED");
  }
  if (
    !sameJson(
      previousContract.identities.map(({ key, unitLevelKey, required }) => ({
        key,
        unitLevelKey,
        required,
      })),
      nextContract.identities.map(({ key, unitLevelKey, required }) => ({
        key,
        unitLevelKey,
        required,
      })),
    )
  ) {
    return stoppedRevision("IDENTITY_CHANGED");
  }
  if (!sameJson(previousContract.matching, nextContract.matching)) {
    return stoppedRevision("MATCHING_CHANGED");
  }
  if (
    previousContract.experimentalUnitLevelKey !== nextContract.experimentalUnitLevelKey ||
    !sameJson(
      previousContract.unitLevels.map(({ key, role, parentKey }) => ({ key, role, parentKey })),
      nextContract.unitLevels.map(({ key, role, parentKey }) => ({ key, role, parentKey })),
    )
  ) {
    return stoppedRevision("UNIT_HIERARCHY_CHANGED");
  }
  if (!sameJson(keys(previousContract.factors), keys(nextContract.factors))) {
    return stoppedRevision("FACTOR_KEYS_CHANGED");
  }
  if (
    !sameJson(
      previousContract.factors.map(({ key, unitRole, relationship, ordered }) => ({
        key,
        unitRole,
        relationship,
        ordered,
      })),
      nextContract.factors.map(({ key, unitRole, relationship, ordered }) => ({
        key,
        unitRole,
        relationship,
        ordered,
      })),
    )
  ) {
    return stoppedRevision("FACTOR_RELATIONSHIP_CHANGED");
  }
  if (!sameJson(keys(previousContract.readouts), keys(nextContract.readouts))) {
    return stoppedRevision("READOUT_KEYS_CHANGED");
  }
  if (
    !sameJson(
      previousContract.readouts.map(({ key, representation }) => ({ key, representation })),
      nextContract.readouts.map(({ key, representation }) => ({ key, representation })),
    )
  ) {
    return stoppedRevision("READOUT_REPRESENTATION_CHANGED");
  }
  if (!sameJson(keys(previousContract.orderedAxes), keys(nextContract.orderedAxes))) {
    return stoppedRevision("AXIS_KEYS_CHANGED");
  }
  if (
    !sameJson(
      previousContract.orderedAxes.map(({ key, sampling, identityRetained }) => ({
        key,
        sampling,
        identityRetained,
      })),
      nextContract.orderedAxes.map(({ key, sampling, identityRetained }) => ({
        key,
        sampling,
        identityRetained,
      })),
    ) ||
    !sameJson(
      previousContract.readouts.map(({ key, axisKeys }) => ({ key, axisKeys })),
      nextContract.readouts.map(({ key, axisKeys }) => ({ key, axisKeys })),
    )
  ) {
    return stoppedRevision("AXIS_RETENTION_CHANGED");
  }
  if (
    !sameJson(
      previousContract.orderedAxes.map(({ key, unit }) => ({ key, unit })),
      nextContract.orderedAxes.map(({ key, unit }) => ({ key, unit })),
    )
  ) {
    return stoppedRevision("AXIS_UNIT_CHANGED");
  }
  if (
    !sameJson(
      previousContract.readouts.map(
        ({ key, valueType, componentKeys, referenceRole, observationLevelKey }) => ({
          key,
          valueType,
          componentKeys,
          referenceRole,
          observationLevelKey,
        }),
      ),
      nextContract.readouts.map(
        ({ key, valueType, componentKeys, referenceRole, observationLevelKey }) => ({
          key,
          valueType,
          componentKeys,
          referenceRole,
          observationLevelKey,
        }),
      ),
    )
  ) {
    return stoppedRevision("READOUT_STRUCTURE_CHANGED");
  }
  if (!sameJson(previousContract.allowedMissingness, nextContract.allowedMissingness)) {
    return stoppedRevision("MISSINGNESS_POLICY_CHANGED");
  }

  const previousCoordinateDiagnostics = validateCanonicalObservationsForContract(
    previousContract,
    canonicalObservations,
  );
  const previousObservationDiagnostics = [
    ...previousCoordinateDiagnostics.map((diagnostic) => `previous:${diagnostic}`),
    ...canonicalRowSemanticDiagnostics(previousContract, canonicalObservations, "previous"),
  ];
  if (previousObservationDiagnostics.length) {
    return stoppedRevision("CANONICAL_OBSERVATIONS_INVALID", previousObservationDiagnostics);
  }

  const nextCoordinateDiagnostics = validateCanonicalObservationsForContract(
    nextContract,
    canonicalObservations,
  );
  const nextObservationDiagnostics = [
    ...nextCoordinateDiagnostics.map((diagnostic) => `next:${diagnostic}`),
    ...canonicalRowSemanticDiagnostics(nextContract, canonicalObservations, "next"),
  ];
  if (
    nextCoordinateDiagnostics.some((diagnostic) => diagnostic.includes(":unknown_factor_level:"))
  ) {
    return stoppedRevision("OBSERVED_FACTOR_LEVEL_REMOVED", nextObservationDiagnostics);
  }
  if (nextCoordinateDiagnostics.some((diagnostic) => diagnostic.includes(":unknown_axis_level:"))) {
    return stoppedRevision("OBSERVED_AXIS_LEVEL_REMOVED", nextObservationDiagnostics);
  }
  if (nextObservationDiagnostics.length) {
    return stoppedRevision("CANONICAL_OBSERVATIONS_INVALID", nextObservationDiagnostics);
  }

  if (mapping) {
    const diagnostics = mappingDiagnostics(nextContract, mapping);
    if (diagnostics.length) {
      return stoppedRevision("MAPPING_SEMANTIC_KEY_INVALID", diagnostics);
    }
  }
  return { status: "compatible" };
}

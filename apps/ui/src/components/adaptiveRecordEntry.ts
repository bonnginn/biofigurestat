import {
  CanonicalAdaptiveObservationSchema,
  type CanonicalAdaptiveObservation,
  type StructureContract,
} from "@lsaa/domain";
import {
  validateCanonicalObservationsForContract,
} from "@lsaa/adaptive-input";
import type {
  AdaptiveObservationCoordinates,
  CompactScalarObservationIdFactoryContext,
} from "@lsaa/data-sheet";

export type AdaptiveRecordEntryDraft = Readonly<{
  readoutKey: string;
  identities: Readonly<Record<string, string>>;
  factors: Readonly<Record<string, string>>;
  axes: Readonly<Record<string, string>>;
  hierarchy: Readonly<Record<string, string>>;
  values: Readonly<Record<string, string>>;
  missingness: Readonly<Record<string, CanonicalAdaptiveObservation["missingness"][string]>>;
}>;

export type AdaptiveRecordEntryIdentityField = Readonly<{
  key: string;
  label: string;
  unitLevelKey: string;
  required: boolean;
}>;

export type AdaptiveRecordEntryHierarchyField = Readonly<{
  key: string;
  label: string;
  parentKey: string | null;
  required: boolean;
}>;

const numericValueTypes = /(?:scalar|continuous|numeric|number|count|integer|proportion|fraction|time|duration)/iu;
const booleanValueTypes = /(?:boolean|bool)/iu;
const booleanComponentKeys = new Set(["event", "censored", "censoring", "observed"]);
const numericBundleRepresentations = new Set<
  StructureContract["readouts"][number]["representation"]
>(["proportion_counts", "target_reference", "paired_readouts", "dose_response"]);

function applicableLevelKeys(
  contract: StructureContract,
  observationLevelKey: string,
): readonly string[] {
  const levels = new Map(contract.unitLevels.map((level) => [level.key, level]));
  const result: string[] = [];
  const seen = new Set<string>();
  let cursor = levels.get(observationLevelKey);
  while (cursor && !seen.has(cursor.key)) {
    result.push(cursor.key);
    seen.add(cursor.key);
    cursor = cursor.parentKey ? levels.get(cursor.parentKey) : undefined;
  }
  return result;
}

export function recordEntryReadout(
  contract: StructureContract,
  readoutKey: string,
): StructureContract["readouts"][number] | null {
  return contract.readouts.find(({ key }) => key === readoutKey) ?? null;
}

export function recordEntryIdentityFields(
  contract: StructureContract,
  readoutKey: string,
): readonly AdaptiveRecordEntryIdentityField[] {
  const readout = recordEntryReadout(contract, readoutKey);
  if (!readout) return [];
  const applicable = new Set(applicableLevelKeys(contract, readout.observationLevelKey));
  const matchingKey = contract.matching.identityKey;
  return contract.identities.filter(
    ({ key, required, unitLevelKey }) =>
      (required || key === matchingKey) &&
      (applicable.has(unitLevelKey) || key === matchingKey),
  );
}

/**
 * Expose a hierarchy address only when the contract does not already expose a
 * required identity for that unit level.  Identity values are copied into the
 * canonical hierarchy map on commit, so the researcher never has to type the
 * same parent/child ID twice.
 */
export function recordEntryHierarchyFields(
  contract: StructureContract,
  readoutKey: string,
): readonly AdaptiveRecordEntryHierarchyField[] {
  const readout = recordEntryReadout(contract, readoutKey);
  if (!readout) return [];
  const applicable = new Set(applicableLevelKeys(contract, readout.observationLevelKey));
  const requiredIdentityLevels = new Set(
    recordEntryIdentityFields(contract, readoutKey).map(({ unitLevelKey }) => unitLevelKey),
  );
  return contract.unitLevels
    .filter(({ key }) => applicable.has(key) && !requiredIdentityLevels.has(key))
    .map((level) => ({
      key: level.key,
      label: level.label,
      parentKey: level.parentKey,
      required: true,
    }));
}

export function recordEntryValueKey(
  readout: StructureContract["readouts"][number],
  componentKey: string,
): string {
  return readout.representation === "scalar"
    ? readout.key
    : `${readout.key}_${componentKey}`;
}

export function recordEntryComponentLabel(componentKey: string, ordinal: number): string {
  const normalized = componentKey.toLowerCase();
  if (["numerator", "positive", "success", "event"].includes(normalized)) return "該当数";
  if (["denominator", "total", "eligible", "count"].includes(normalized)) return "総数";
  return componentKey || `値 ${ordinal + 1}`;
}

export function recordEntryUsesNumericValue(
  readout: StructureContract["readouts"][number],
  componentKey: string,
): boolean {
  return (
    numericBundleRepresentations.has(readout.representation) ||
    numericValueTypes.test(readout.valueType) ||
    numericValueTypes.test(componentKey)
  );
}

export function recordEntryUsesBooleanValue(
  readout: StructureContract["readouts"][number],
  componentKey: string,
): boolean {
  return booleanValueTypes.test(readout.valueType) || booleanComponentKeys.has(componentKey.toLowerCase());
}

function firstLevelValue<T extends string | number>(levels: readonly T[]): string {
  return levels.length === 1 ? String(levels[0]) : "";
}

export function createEmptyAdaptiveRecordEntryDraft(
  contract: StructureContract,
  preferredReadoutKey?: string,
): AdaptiveRecordEntryDraft {
  const readoutKey =
    preferredReadoutKey ?? (contract.readouts.length === 1 ? (contract.readouts[0]?.key ?? "") : "");
  const readout = recordEntryReadout(contract, readoutKey);
  const identities = Object.fromEntries(
    recordEntryIdentityFields(contract, readoutKey).map(({ key }) => [key, ""]),
  );
  const factors = Object.fromEntries(
    contract.factors.map((factor) => [factor.key, firstLevelValue(factor.levels)]),
  );
  const axes = Object.fromEntries(
    (readout?.axisKeys ?? []).flatMap((axisKey) => {
      const axis = contract.orderedAxes.find(({ key }) => key === axisKey);
      return axis ? [[axis.key, firstLevelValue(axis.levels)]] : [];
    }),
  );
  const hierarchy = Object.fromEntries(
    recordEntryHierarchyFields(contract, readoutKey).map(({ key }) => [key, ""]),
  );
  const values = Object.fromEntries(
    (readout?.componentKeys ?? []).map((component) => [recordEntryValueKey(readout!, component), ""]),
  );
  return { readoutKey, identities, factors, axes, hierarchy, values, missingness: {} };
}

function normalizedText(value: string | undefined): string {
  return value?.normalize("NFKC").trim() ?? "";
}

function parseAxisValue(
  contract: StructureContract,
  axisKey: string,
  raw: string,
): string | number {
  const text = normalizedText(raw);
  const axis = contract.orderedAxes.find(({ key }) => key === axisKey);
  const matchingLevel = axis?.levels.find((level) => String(level) === text);
  if (typeof matchingLevel === "number") return matchingLevel;
  return text;
}

function parseValue(
  readout: StructureContract["readouts"][number],
  componentKey: string,
  raw: string,
): string | number | boolean | null {
  const text = normalizedText(raw);
  if (!text) return null;
  if (recordEntryUsesBooleanValue(readout, componentKey)) {
    if (text.toLowerCase() === "true" || text === "1" || text === "はい") return true;
    if (text.toLowerCase() === "false" || text === "0" || text === "いいえ") return false;
    throw new Error(`「${recordEntryComponentLabel(componentKey, 0)}」には、はい／いいえを入力してください。`);
  }
  if (recordEntryUsesNumericValue(readout, componentKey)) {
    const value = Number(text);
    if (!Number.isFinite(value)) {
      throw new Error(`「${recordEntryComponentLabel(componentKey, 0)}」には数値を入力してください。`);
    }
    return value;
  }
  return text;
}

function assertRequiredEntryFields(
  contract: StructureContract,
  draft: AdaptiveRecordEntryDraft,
  readout: StructureContract["readouts"][number],
): void {
  if (!draft.readoutKey || !recordEntryReadout(contract, draft.readoutKey)) {
    throw new Error("測定項目を選択してください。");
  }
  contract.factors.forEach((factor) => {
    const value = normalizedText(draft.factors[factor.key]);
    if (!value) throw new Error(`「${factor.label}」を選択してください。`);
    if (!factor.levels.includes(value)) throw new Error(`「${factor.label}」の選択肢を確認してください。`);
  });
  readout.axisKeys.forEach((axisKey) => {
    const axis = contract.orderedAxes.find(({ key }) => key === axisKey);
    const value = normalizedText(draft.axes[axisKey]);
    if (!axis || !value) throw new Error(`「${axis?.label ?? axisKey}」を入力してください。`);
    if (
      axis.levels.length > 0 &&
      !axis.levels.some((level) => normalizedText(String(level)) === value)
    ) {
      throw new Error(`「${axis.label}」は実験で定義した値から選択してください。`);
    }
  });
  recordEntryIdentityFields(contract, draft.readoutKey).forEach((identity) => {
    if (!normalizedText(draft.identities[identity.key])) {
      throw new Error(`「${identity.label}」を入力してください。`);
    }
  });
  recordEntryHierarchyFields(contract, draft.readoutKey).forEach((level) => {
    if (!normalizedText(draft.hierarchy[level.key])) {
      throw new Error(`「${level.label}」の対応IDを入力してください。`);
    }
  });
  readout.componentKeys.forEach((component) => {
    const valueKey = recordEntryValueKey(readout, component);
    const rawValue = normalizedText(draft.values[valueKey]);
    const missingness = draft.missingness[valueKey];
    if (rawValue && missingness) {
      throw new Error(`「${recordEntryComponentLabel(component, 0)}」は値か欠測理由のどちらか一方を指定してください。`);
    }
    if (!rawValue && !missingness) {
      throw new Error(`「${recordEntryComponentLabel(component, 0)}」を入力するか、欠測理由を選択してください。`);
    }
    if (missingness && !contract.allowedMissingness.includes(missingness)) {
      throw new Error("この実験で許可された欠測理由を選択してください。");
    }
  });
}

function identityValueForLevel(
  contract: StructureContract,
  draft: AdaptiveRecordEntryDraft,
  levelKey: string,
): string | undefined {
  const identity = contract.identities.find(({ unitLevelKey }) => unitLevelKey === levelKey);
  const value = identity ? normalizedText(draft.identities[identity.key]) : "";
  return value || undefined;
}

function assertTypedCountValues(
  readout: StructureContract["readouts"][number],
  values: Readonly<Record<string, string | number | boolean | null>>,
): void {
  if (readout.representation !== "proportion_counts") return;
  const [numeratorComponent, denominatorComponent] = readout.componentKeys;
  if (!numeratorComponent || !denominatorComponent) return;
  const numerator = values[recordEntryValueKey(readout, numeratorComponent)];
  const denominator = values[recordEntryValueKey(readout, denominatorComponent)];
  for (const value of [numerator, denominator]) {
    if (typeof value === "number" && (!Number.isInteger(value) || value < 0)) {
      throw new Error("該当数と総数には0以上の整数を入力してください。");
    }
  }
  if (typeof numerator === "number" && typeof denominator === "number" && numerator > denominator) {
    throw new Error("該当数は総数以下にしてください。");
  }
}

export type BuildAdaptiveRecordEntryInput = Readonly<{
  contract: StructureContract;
  observations: readonly CanonicalAdaptiveObservation[];
  draft: AdaptiveRecordEntryDraft;
  nextObservationId: (context: CompactScalarObservationIdFactoryContext) => string;
  ordinal?: number;
}>;

/**
 * Convert one completed researcher-facing row into one canonical observation.
 * No callback is invoked and no caller-owned array is mutated.  All contract
 * and duplicate-coordinate checks happen before the caller publishes it.
 */
export function buildAdaptiveRecordEntryObservation(
  input: BuildAdaptiveRecordEntryInput,
): CanonicalAdaptiveObservation {
  const { contract, observations, draft, nextObservationId } = input;
  const readout = recordEntryReadout(contract, draft.readoutKey);
  if (!readout) throw new Error("測定項目を選択してください。");
  assertRequiredEntryFields(contract, draft, readout);

  const values: Record<string, string | number | boolean | null> = {};
  const missingness: CanonicalAdaptiveObservation["missingness"] = {};
  readout.componentKeys.forEach((component) => {
    const valueKey = recordEntryValueKey(readout, component);
    const missingReason = draft.missingness[valueKey];
    values[valueKey] = missingReason ? null : parseValue(readout, component, draft.values[valueKey] ?? "");
    if (missingReason) missingness[valueKey] = missingReason;
  });
  assertTypedCountValues(readout, values);

  const factors = Object.fromEntries(
    contract.factors.map((factor) => [factor.key, normalizedText(draft.factors[factor.key])]),
  );
  const axes = Object.fromEntries(
    readout.axisKeys.map((axisKey) => [axisKey, parseAxisValue(contract, axisKey, draft.axes[axisKey] ?? "")]),
  );
  const hierarchy: Record<string, string> = {};
  const identities: Record<string, string> = Object.fromEntries(
    Object.entries(draft.identities)
      .map(([key, value]) => [key, normalizedText(value)] as const)
      .filter(([, value]) => Boolean(value)),
  );
  const applicableLevels = applicableLevelKeys(contract, readout.observationLevelKey);
  applicableLevels.forEach((levelKey) => {
    const explicitHierarchy = normalizedText(draft.hierarchy[levelKey]);
    const identityValue = identityValueForLevel(contract, draft, levelKey);
    if (explicitHierarchy) hierarchy[levelKey] = explicitHierarchy;
    else if (identityValue) hierarchy[levelKey] = identityValue;
  });

  const firstValueKey = recordEntryValueKey(readout, readout.componentKeys[0] ?? "value");
  const targetCoordinates: AdaptiveObservationCoordinates = {
    readoutKey: readout.key,
    factors,
    axes,
    hierarchy,
  };
  const context: CompactScalarObservationIdFactoryContext = {
    targetCoordinates,
    valueKey: firstValueKey,
    ordinal: input.ordinal ?? observations.length + 1,
    existingObservationIds: observations.map(({ observationId }) => observationId),
  };
  const observationId = nextObservationId(context);
  if (typeof observationId !== "string" || !normalizedText(observationId)) {
    throw new Error("新しい記録IDを作成できませんでした。");
  }
  if (observations.some(({ observationId: existingId }) => existingId === observationId)) {
    throw new Error("新しい記録IDが重複しています。入力内容は変更していません。");
  }

  // A non-required root identity is still given an internal stable address so
  // the observation remains a valid experimental-unit record.  This does not
  // fabricate a pairing or cross-condition relationship.
  const rootIdentity = contract.identities.find(
    ({ unitLevelKey }) => unitLevelKey === contract.experimentalUnitLevelKey,
  );
  const rootHasAddress =
    identityValueForLevel(contract, draft, contract.experimentalUnitLevelKey) ||
    normalizedText(draft.hierarchy[contract.experimentalUnitLevelKey]);
  if (!rootHasAddress && rootIdentity) identities[rootIdentity.key] = observationId;
  if (!rootHasAddress && !rootIdentity) hierarchy[contract.experimentalUnitLevelKey] = observationId;
  if (!hierarchy[contract.experimentalUnitLevelKey] && identities[rootIdentity?.key ?? ""]) {
    hierarchy[contract.experimentalUnitLevelKey] = identities[rootIdentity!.key]!;
  }

  const candidate = CanonicalAdaptiveObservationSchema.parse({
    observationId,
    readoutKey: readout.key,
    identities,
    factors,
    axes,
    hierarchy,
    values,
    missingness,
    sourceRow: null,
  });
  const diagnostics = validateCanonicalObservationsForContract(contract, [...observations, candidate]);
  if (diagnostics.length) {
    throw new Error(`この測定行は追加できません。${diagnostics.join(" / ")}`);
  }
  return candidate;
}

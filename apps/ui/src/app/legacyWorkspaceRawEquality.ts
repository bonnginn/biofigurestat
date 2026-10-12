import type { ExperimentCellMap, ExperimentSetDraft } from "./experimentDraft";
import { createCellsForDraft } from "./experimentWorkspaceDefaultCells";

export type LegacyWorkspaceRawSnapshot = Readonly<{
  draft: ExperimentSetDraft;
  cells: ExperimentCellMap;
}>;

/**
 * Exact data comparison with optional undefined properties retained as keys.
 * Rejects non-finite numbers, accessors, non-data objects, sparse arrays and cycles.
 */
function strictPayloadEqual(
  left: unknown,
  right: unknown,
  leftAncestors = new Set<object>(),
  rightAncestors = new Set<object>(),
): boolean {
  if (typeof left !== typeof right) return false;
  if (typeof left === "number") {
    return typeof right === "number" && Number.isFinite(left) && Number.isFinite(right) && Object.is(left, right);
  }
  if (left === null || right === null) return left === right;
  if (typeof left === "string" || typeof left === "boolean" || typeof left === "undefined") {
    return left === right;
  }
  if (typeof left !== "object" || typeof right !== "object") return false;
  if (leftAncestors.has(left) || rightAncestors.has(right)) return false;
  const leftArray = Array.isArray(left);
  const rightArray = Array.isArray(right);
  if (leftArray !== rightArray) return false;
  if (!leftArray) {
    const leftPrototype = Object.getPrototypeOf(left);
    const rightPrototype = Object.getPrototypeOf(right);
    if (
      (leftPrototype !== Object.prototype && leftPrototype !== null) ||
      (rightPrototype !== Object.prototype && rightPrototype !== null)
    ) return false;
  }
  const leftKeys = Reflect.ownKeys(left);
  const rightKeys = Reflect.ownKeys(right);
  if (
    leftKeys.some((key) => typeof key !== "string") ||
    rightKeys.some((key) => typeof key !== "string") ||
    leftKeys.length !== rightKeys.length
  ) return false;
  if (leftArray && rightArray) {
    if (left.length !== right.length || leftKeys.length !== left.length + 1) return false;
    for (let index = 0; index < left.length; index += 1) {
      if (!Object.hasOwn(left, index) || !Object.hasOwn(right, index)) return false;
    }
  }
  leftAncestors.add(left);
  rightAncestors.add(right);
  try {
    for (const key of leftKeys) {
      const leftProperty = Object.getOwnPropertyDescriptor(left, key);
      const rightProperty = Object.getOwnPropertyDescriptor(right, key);
      if (
        !leftProperty || !rightProperty ||
        !("value" in leftProperty) || !("value" in rightProperty) ||
        (!(leftArray && key === "length") && (!leftProperty.enumerable || !rightProperty.enumerable)) ||
        (leftArray && key !== "length" && (leftProperty.value === undefined || rightProperty.value === undefined)) ||
        !strictPayloadEqual(leftProperty.value, rightProperty.value, leftAncestors, rightAncestors)
      ) return false;
    }
    return true;
  } finally {
    leftAncestors.delete(left);
    rightAncestors.delete(right);
  }
}

/**
 * Recognizes unchanged legacy UI projections so the caller can retain canonical
 * raw/unit records. It does not certify lossless rehydration of those records.
 */
export function legacyWorkspaceRawEqualsRehydrated(
  current: LegacyWorkspaceRawSnapshot,
  baseline: LegacyWorkspaceRawSnapshot,
): boolean {
  try {
    // Validate before reading/spreading, including excluded presentation fields.
    if (!strictPayloadEqual(current, current) || !strictPayloadEqual(baseline, baseline)) return false;
    if (current.draft.adaptiveInput || baseline.draft.adaptiveInput) return false;
    // Rehydration writes these known optional top-level fields as undefined.
    // Match only that representation; all actual values and unknown keys stay strict.
    const draftPayload = (draft: ExperimentSetDraft) => {
      const { name: _name, ...payload } = draft;
      return {
        ...payload,
        entryRoute: draft.entryRoute,
        controlConditionId: draft.controlConditionId,
        comparisons: draft.comparisons,
        importProvenance: draft.importProvenance,
        entrySourceHistory: draft.entrySourceHistory,
        adaptiveInput: draft.adaptiveInput,
      };
    };
    const currentDraft = draftPayload(current.draft);
    const baselineDraft = draftPayload(baseline.draft);
    const currentCells = { ...createCellsForDraft(current.draft), ...current.cells };
    const baselineCells = { ...createCellsForDraft(baseline.draft), ...baseline.cells };
    return strictPayloadEqual(currentDraft, baselineDraft) && strictPayloadEqual(currentCells, baselineCells);
  } catch {
    // Unsupported payloads remain on the existing raw-changed path.
    return false;
  }
}

import { describe, expect, it } from "vitest";
import { buildStructureContract } from "@lsaa/adaptive-input";
import {
  createUnresolvedVisualizationProjectState,
  createUnresolvedVisualizationPromotionHistory,
} from "@lsaa/project";

import { createAdaptiveWorkspace } from "./adaptiveWorkspace";
import type { ExperimentCellMap, ExperimentSetDraft } from "./experimentDraft";
import {
  createPairedTwoConditionFixture,
  createSimpleIndependentContinuousFixture,
  createWbReferenceFixture,
} from "./syntheticFixtures";
import { createCellsForDraft } from "./experimentWorkspaceDefaultCells";
import { legacyWorkspaceRawEqualsRehydrated } from "./legacyWorkspaceRawEquality";

const now = "2026-10-08T06:00:00Z";

function sourceHistory() {
  const sourceState = createUnresolvedVisualizationProjectState({
    metadata: { projectId: "source.history", projectName: "Source history", experimentDate: "", createdAt: now, updatedAt: now },
    entryIntent: "graph_only",
    table: { id: "table.history", headers: ["Condition", "Value"], rows: [["Control", "1"]], delimiter: "tab", headerRow: 1 },
    rawLineage: { sourceKind: "clipboard", sourceLabel: "clipboard", importedAt: now, rawText: "Condition\tValue\nControl\t1", sha256: null, transformations: ["delimiter_detection"] },
    mapping: { schemaVersion: "0.1.0", sourceLabel: "clipboard", delimiter: "tab", headerRow: 1, columns: [{ index: 0, header: "Condition", role: "x" }, { index: 1, header: "Value", role: "y" }], identityDecision: "no_id", confirmedAt: now },
    actor: "test",
  });
  return createUnresolvedVisualizationPromotionHistory({ sourceState, promotedWorkspaceGraphId: null, capturedAt: now });
}

describe("legacy workspace raw equality", () => {
  it("recognizes an unchanged paired projection and name change without mutating either side", () => {
    const source = createPairedTwoConditionFixture();
    const baseline = { draft: source.draft, cells: source.cells };
    const current = structuredClone(baseline);
    current.draft = { ...current.draft, name: "Renamed project" };
    const before = structuredClone({ current, baseline });
    expect(legacyWorkspaceRawEqualsRehydrated(current, baseline)).toBe(true);
    expect({ current, baseline }).toEqual(before);
  });

  it("uses shared UI defaults for sparse planned blanks while retaining not-planned differences", () => {
    const { draft } = createPairedTwoConditionFixture();
    const cells = createCellsForDraft(draft);
    const key = Object.keys(cells)[0];
    expect(legacyWorkspaceRawEqualsRehydrated({ draft, cells }, { draft, cells: {} })).toBe(true);
    const notPlanned = { ...cells, [key]: { ...cells[key], availability: "not_planned" as const } };
    expect(legacyWorkspaceRawEqualsRehydrated({ draft, cells: notPlanned }, { draft, cells: {} })).toBe(false);
  });

  it("does not discard a true raw measurement edit or an unknown extra cell key", () => {
    const { draft, cells } = createPairedTwoConditionFixture();
    const key = Object.keys(cells)[0];
    const changed: ExperimentCellMap = { ...cells, [key]: { kind: "proportion", positive: 46, eligible: 100 } };
    expect(legacyWorkspaceRawEqualsRehydrated({ draft, cells: changed }, { draft, cells })).toBe(false);
    expect(legacyWorkspaceRawEqualsRehydrated({ draft, cells: { ...cells, "unknown.extra": cells[key] } }, { draft, cells })).toBe(false);
  });

  it("preserves raw array order, source kind, location and lower-unit identity", () => {
    const { draft, cells: baseCells } = createSimpleIndependentContinuousFixture();
    const key = Object.keys(baseCells)[0];
    const cell = { kind: "nested_continuous" as const, source: "paste" as const, rawValues: [2, 5, 11], sourceLocations: ["row:1", "row:2", "row:3"], observationUnitIds: ["roi.1", "roi.2", "roi.3"] };
    const cells = { ...baseCells, [key]: cell };
    const alternatives = [
      { ...cell, rawValues: [11, 5, 2] },
      { ...cell, source: "manual" as const },
      { ...cell, sourceLocations: ["row:1", "row:2", "changed:3"] },
      { ...cell, observationUnitIds: ["roi.1", "roi.2", "roi.other"] },
    ];
    for (const changed of alternatives) {
      expect(legacyWorkspaceRawEqualsRehydrated({ draft, cells: { ...cells, [key]: changed } }, { draft, cells })).toBe(false);
    }
  });

  it("detects scientific unit, control, family, normalization, time and design edits", () => {
    const source = createPairedTwoConditionFixture();
    const draft = { ...source.draft, controlConditionId: source.draft.conditions[0].id };
    const changes: ExperimentSetDraft[] = [
      { ...draft, experiments: draft.experiments.map((row, index) => index === 0 ? { ...row, stableUnitId: "unit.other" } : row) },
      { ...draft, experiments: draft.experiments.map((row, index) => index === 0 ? { ...row, sessionId: "session.other" } : row) },
      { ...draft, controlConditionId: draft.conditions[1].id },
      { ...draft, comparisons: [{ id: "comparison.changed", label: "Family", role: "primary", conditionIds: [draft.conditions[0].id, draft.conditions[1].id] }] },
      { ...draft, readouts: draft.readouts.map((readout) => ({ ...readout, withinExperimentNormalization: { method: "control_equals_one", baselineConditionId: draft.conditions[0].id } })) },
      { ...draft, time: { ...draft.time, points: [{ id: "time.1", value: 1 }] } },
      { ...draft, conditionAssignment: { kind: "independent", unitLabel: "animal" } },
    ];
    for (const changed of changes) {
      expect(legacyWorkspaceRawEqualsRehydrated({ draft: changed, cells: source.cells }, { draft, cells: source.cells })).toBe(false);
    }
  });

  it("retains entry history in the comparison", () => {
    const source = createPairedTwoConditionFixture();
    const history = sourceHistory();
    const draft = { ...source.draft, entrySourceHistory: history };
    expect(legacyWorkspaceRawEqualsRehydrated({ draft, cells: source.cells }, { draft: structuredClone(draft), cells: source.cells })).toBe(true);
    const changedHistory = { ...history, entries: history.entries.map((entry) => ({ ...entry, capturedAt: "2026-10-08T06:01:00Z" })) };
    expect(legacyWorkspaceRawEqualsRehydrated({ draft: { ...draft, entrySourceHistory: changedHistory }, cells: source.cells }, { draft, cells: source.cells })).toBe(false);
  });

  it("compares WB source measurements even when the corrected value can remain equal", () => {
    const { draft, cells: baseCells } = createWbReferenceFixture();
    const key = Object.keys(baseCells)[0];
    const cell = { kind: "wb_ratio" as const, target: null, reference: null, inputMode: "imagej_mean_background_area" as const, targetSource: { intensity: 5, background: 1, area: 2 }, referenceSource: { intensity: 3, background: 1, area: 2 } };
    const cells = { ...baseCells, [key]: cell };
    const changed = { ...cell, targetSource: { intensity: 6, background: 2, area: 2 } };
    expect(legacyWorkspaceRawEqualsRehydrated({ draft, cells: { ...cells, [key]: changed } }, { draft, cells })).toBe(false);
  });

  it("does not fold non-finite numbers into null or missing unknown keys into undefined", () => {
    const { draft } = createPairedTwoConditionFixture();
    const cells = createCellsForDraft(draft);
    const key = Object.keys(cells)[0];
    for (const value of [NaN, Infinity, -Infinity]) {
      const changed = { ...cells, [key]: { kind: "proportion" as const, positive: value, eligible: null } };
      expect(legacyWorkspaceRawEqualsRehydrated({ draft, cells: changed }, { draft, cells })).toBe(false);
      expect(legacyWorkspaceRawEqualsRehydrated({ draft, cells: changed }, { draft, cells: changed })).toBe(false);
    }
    const explicitUndefined = { ...draft, unknownScientificMetadata: undefined };
    expect(legacyWorkspaceRawEqualsRehydrated({ draft: explicitUndefined, cells }, { draft, cells })).toBe(false);
    expect(legacyWorkspaceRawEqualsRehydrated({ draft: explicitUndefined, cells }, { draft: structuredClone(explicitUndefined), cells })).toBe(true);
  });

  it("matches only known optional top-level missing and undefined representations", () => {
    const { draft, cells } = createPairedTwoConditionFixture();
    const optionalKeys = [
      "entryRoute", "controlConditionId", "comparisons", "importProvenance",
      "entrySourceHistory", "adaptiveInput",
    ] as const;
    for (const key of optionalKeys) {
      const absent = { ...draft };
      delete absent[key];
      const explicitUndefined = { ...absent, [key]: undefined };
      const before = structuredClone({ absent, explicitUndefined, cells });
      expect(legacyWorkspaceRawEqualsRehydrated({ draft: absent, cells }, { draft: explicitUndefined, cells })).toBe(true);
      expect(legacyWorkspaceRawEqualsRehydrated({ draft: explicitUndefined, cells }, { draft: absent, cells })).toBe(true);
      expect({ absent, explicitUndefined, cells }).toEqual(before);
      const explicitNull = { ...absent, [key]: null } as unknown as ExperimentSetDraft;
      expect(legacyWorkspaceRawEqualsRehydrated({ draft: absent, cells }, { draft: explicitNull, cells })).toBe(false);
    }
    expect(legacyWorkspaceRawEqualsRehydrated({ draft: { ...draft, comparisons: [] }, cells }, { draft, cells })).toBe(false);
    const nestedUndefined = { ...draft, readouts: draft.readouts.map((readout) => ({ ...readout, unknownScientificMetadata: undefined })) };
    expect(legacyWorkspaceRawEqualsRehydrated({ draft: nestedUndefined, cells }, { draft, cells })).toBe(false);
  });

  it("safely rejects non-data payloads and cycles without invoking accessors", () => {
    const { draft, cells } = createPairedTwoConditionFixture();
    const cycle: Record<string, unknown> = {};
    cycle.self = cycle;
    for (const extra of [cycle, new Date(now), () => 1, Symbol("source"), BigInt(1)]) {
      const changed = { draft: { ...draft, extra }, cells };
      expect(legacyWorkspaceRawEqualsRehydrated(changed, { draft, cells })).toBe(false);
    }
    let reads = 0;
    const changedDraft = Object.defineProperty({ ...draft }, "extra", { enumerable: true, get: () => { reads += 1; return 1; } });
    expect(legacyWorkspaceRawEqualsRehydrated({ draft: changedDraft, cells }, { draft, cells })).toBe(false);
    expect(reads).toBe(0);
  });

  it("rejects an adaptive companion on either side", () => {
    const contract = buildStructureContract({ experimentName: "Adaptive", experimentDescription: "Comparator boundary", experimentalUnitLabel: "dish", identityLabel: "Dish ID", readoutLabel: "Signal", readoutRepresentation: "scalar", factorName: "Treatment", factorLevels: ["Control", "Drug"], sameIdentityAcrossConditions: false, conditionEntityRelationship: { kind: "independent_condition_units" } });
    const identityKey = contract.identities.find(({ unitLevelKey }) => unitLevelKey === contract.experimentalUnitLevelKey)!.key;
    const factorKey = contract.factors[0].key;
    const readoutKey = contract.readouts[0].key;
    const observations = ["Control", "Drug"].map((condition, index) => ({
      observationId: `observation.${index + 1}`,
      readoutKey,
      identities: { [identityKey]: `Dish-${index + 1}` },
      factors: { [factorKey]: condition },
      axes: {}, hierarchy: {}, values: { [readoutKey]: 10 + index }, missingness: {}, sourceRow: null,
    }));
    const adaptive = createAdaptiveWorkspace({ contract, observations, mapping: null, lineage: null, now });
    if (adaptive.status !== "ready" || !adaptive.draft) throw new Error("Invalid adaptive comparator fixture");
    const snapshot = { draft: adaptive.draft, cells: adaptive.cells };
    const legacy = createPairedTwoConditionFixture();
    expect(legacyWorkspaceRawEqualsRehydrated(snapshot, snapshot)).toBe(false);
    expect(legacyWorkspaceRawEqualsRehydrated(snapshot, legacy)).toBe(false);
    expect(legacyWorkspaceRawEqualsRehydrated(legacy, snapshot)).toBe(false);
  });
});

import { buildStructureContract } from "@lsaa/adaptive-input";
import {
  AdaptiveColumnMappingSchema,
  AdaptiveRawLineageSchema,
  CanonicalAdaptiveObservationSchema,
} from "@lsaa/domain";
import {
  createUnresolvedVisualizationProjectState,
  createUnresolvedVisualizationPromotionHistory,
} from "@lsaa/project";

import {
  createExperimentSetDraft,
  reuseExperimentDesign,
  type ExperimentSetDraft,
} from "./experimentDraft";
import { loadFavoriteDesigns, removeFavoriteDesign, saveFavoriteDesign } from "./favoriteDesigns";
import { createAdaptiveWorkspace } from "./adaptiveWorkspace";

const now = "2026-08-21T00:00:00.000Z";

function sensitiveAdaptiveDraft(): ExperimentSetDraft {
  const contract = buildStructureContract({
    experimentName: "Sensitive Favorite fixture",
    experimentDescription: "Separate dishes received Control or Drug.",
    experimentalUnitLabel: "culture dish",
    identityLabel: "Dish ID",
    readoutLabel: "Signal",
    readoutRepresentation: "scalar",
    factorName: "Treatment",
    factorLevels: ["Control", "Drug"],
    sameIdentityAcrossConditions: false,
    conditionEntityRelationship: { kind: "independent_condition_units" },
  });
  const identityKey = contract.identities[0]!.key;
  const factorKey = contract.factors[0]!.key;
  const readoutKey = contract.readouts[0]!.key;
  const rawText =
    "PRIVATE_DISH_ID\tTreatment\tSignal\nDish-secret-1\tControl\t10\nDish-secret-2\tDrug\t14";
  const observations = [
    ["Dish-secret-1", "Control", 10],
    ["Dish-secret-2", "Drug", 14],
  ].map(([identity, treatment, value], index) =>
    CanonicalAdaptiveObservationSchema.parse({
      observationId: `favorite-sensitive.${index + 1}`,
      readoutKey,
      identities: { [identityKey]: identity },
      factors: { [factorKey]: treatment },
      axes: {},
      hierarchy: {},
      values: { [readoutKey]: value },
      missingness: {},
      sourceRow: index + 2,
    }),
  );
  const mapping = AdaptiveColumnMappingSchema.parse({
    schemaVersion: "0.1.0",
    sourceLabel: "private.tsv",
    delimiter: "tab",
    headerRow: 1,
    columns: {
      PRIVATE_DISH_ID: { role: "identity", semanticKey: identityKey },
      Treatment: { role: "factor", semanticKey: factorKey },
      Signal: { role: "value", semanticKey: readoutKey },
    },
    confirmedAt: now,
  });
  const lineage = AdaptiveRawLineageSchema.parse({
    schemaVersion: "0.1.0",
    sourceKind: "tsv",
    sourceLabel: "private.tsv",
    importedAt: now,
    rawText,
    sha256: null,
    transformations: ["confirmed_column_mapping"],
  });
  const workspace = createAdaptiveWorkspace({ contract, observations, mapping, lineage, now });
  if (!workspace.draft) throw new Error(workspace.diagnostics.join(" / "));
  const sourceState = createUnresolvedVisualizationProjectState({
    metadata: {
      projectId: "visualization.favorite-sensitive",
      projectName: "Sensitive source",
      experimentDate: "",
      createdAt: now,
      updatedAt: now,
    },
    entryIntent: "graph_only",
    table: {
      id: "table.favorite-sensitive",
      headers: ["PRIVATE_DISH_ID", "Treatment", "Signal"],
      rows: [
        ["Dish-secret-1", "Control", "10"],
        ["Dish-secret-2", "Drug", "14"],
      ],
      delimiter: "tab",
      headerRow: 1,
    },
    rawLineage: {
      sourceKind: "tsv",
      sourceLabel: "private.tsv",
      importedAt: now,
      rawText,
      sha256: null,
      transformations: ["delimiter_detection"],
    },
    mapping: {
      schemaVersion: "0.1.0",
      sourceLabel: "private.tsv",
      delimiter: "tab",
      headerRow: 1,
      columns: [
        { index: 0, header: "PRIVATE_DISH_ID", role: "id" },
        { index: 1, header: "Treatment", role: "x" },
        { index: 2, header: "Signal", role: "y" },
      ],
      identityDecision: "selected_column",
      confirmedAt: now,
    },
    actor: "test",
  });
  return {
    ...workspace.draft,
    importProvenance: {
      sourceLabel: "private.tsv",
      importedAt: now,
      headers: ["PRIVATE_DISH_ID", "Treatment", "Signal"],
      sourceRows: [["Dish-secret-1", "Control", "10"]],
      mapping: { identity: "PRIVATE_DISH_ID" },
      excludedRowNumbers: [],
      duplicateDecision: "none",
    },
    entrySourceHistory: createUnresolvedVisualizationPromotionHistory({
      sourceState,
      promotedWorkspaceGraphId: null,
      capturedAt: now,
    }),
  };
}

describe("favorite designs", () => {
  beforeEach(() => localStorage.clear());

  it("stores design structure without measurement cells and can remove it", () => {
    const draft = createExperimentSetDraft("cell_culture", "proportion");
    const saved = saveFavoriteDesign(draft, [], new Date("2026-08-21T00:00:00.000Z"));
    expect(loadFavoriteDesigns()).toEqual([saved]);
    expect(JSON.stringify(saved)).not.toContain("rawValues");

    removeFavoriteDesign(saved.id);
    expect(loadFavoriteDesigns()).toEqual([]);
  });

  it("ignores corrupted local data", () => {
    localStorage.setItem("lsaa.favorite-designs.v1", "not-json");
    expect(loadFavoriteDesigns()).toEqual([]);
    expect(localStorage.getItem("lsaa.favorite-designs.v1")).toBe("[]");

    localStorage.setItem(
      "lsaa.favorite-designs.v1",
      JSON.stringify({ rawText: "PRIVATE_UNKNOWN_LEGACY_PAYLOAD" }),
    );
    expect(loadFavoriteDesigns()).toEqual([]);
    expect(localStorage.getItem("lsaa.favorite-designs.v1")).toBe("[]");
  });

  it("sanitizes adaptive observations and all source lineage before saving", () => {
    const saved = saveFavoriteDesign(
      sensitiveAdaptiveDraft(),
      [],
      new Date("2026-08-21T00:00:00.000Z"),
    );
    const persisted = localStorage.getItem("lsaa.favorite-designs.v1")!;

    expect(saved.draft.adaptiveInput).toBeUndefined();
    expect(saved.draft.importProvenance).toBeUndefined();
    expect(saved.draft.entrySourceHistory).toBeUndefined();
    expect(saved.draft.adaptiveTemplate).toBeDefined();
    const reused = reuseExperimentDesign(sensitiveAdaptiveDraft());
    expect(reused.adaptiveInput).toBeUndefined();
    expect(reused.importProvenance).toBeUndefined();
    expect(reused.entrySourceHistory).toBeUndefined();
    for (const forbidden of [
      "canonicalObservations",
      "mapping",
      "rawLineage",
      "entrySourceHistory",
      "sourceState",
      "rawText",
      "Dish-secret-1",
    ]) {
      expect(persisted).not.toContain(forbidden);
    }
  });

  it("scrubs legacy Favorites on load and rewrites local storage data-free", () => {
    const liveDraft = sensitiveAdaptiveDraft();
    localStorage.setItem(
      "lsaa.favorite-designs.v1",
      JSON.stringify([
        {
          id: "favorite.legacy-sensitive",
          name: liveDraft.name,
          savedAt: now,
          draft: liveDraft,
          graphDefaults: [],
        },
      ]),
    );

    const loaded = loadFavoriteDesigns();
    const rewritten = localStorage.getItem("lsaa.favorite-designs.v1")!;
    expect(loaded[0]?.draft.adaptiveTemplate).toBeDefined();
    expect(loaded[0]?.draft.adaptiveInput).toBeUndefined();
    expect(loaded[0]?.draft.entrySourceHistory).toBeUndefined();
    expect(rewritten).not.toContain("canonicalObservations");
    expect(rewritten).not.toContain("sourceState");
    expect(rewritten).not.toContain("rawText");
    expect(rewritten).not.toContain("Dish-secret-1");
  });
});

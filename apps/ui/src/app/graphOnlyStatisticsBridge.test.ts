import { buildStructureContract } from "@lsaa/adaptive-input";
import type { StructureContract } from "@lsaa/domain";
import {
  createUnresolvedVisualizationProjectState,
  type UnresolvedVisualizationColumnMapping,
} from "@lsaa/project";
import { describe, expect, it } from "vitest";

import { createAdaptiveWorkspace } from "./adaptiveWorkspace";
import { bridgeGraphOnlyTableToStatistics } from "./graphOnlyStatisticsBridge";
import {
  createExperimentWorkspaceProject,
  rehydrateExperimentWorkspace,
} from "./experimentWorkspaceProject";

const now = "2026-08-28T00:00:00.000Z";

function mapping(id = false, series = false): UnresolvedVisualizationColumnMapping {
  return {
    schemaVersion: "0.1.0",
    sourceLabel: "clipboard",
    delimiter: "tab",
    headerRow: 1,
    columns: [
      { index: 0, header: "Condition", role: "x" },
      { index: 1, header: "Value", role: "y" },
      ...(id ? [{ index: 2, header: "DishID", role: "id" as const }] : []),
      ...(series ? [{ index: id ? 3 : 2, header: "Batch", role: "series" as const }] : []),
    ],
    identityDecision: id ? "selected_column" : "no_id",
    sourceRowUnitDecision: id ? "unanswered" : "each_row_distinct_unit",
    confirmedAt: now,
  };
}

function state(
  options: {
    id?: boolean;
    series?: boolean;
    ids?: readonly [string, string];
  } = {},
) {
  const hasId = options.id || Boolean(options.ids);
  const headers = [
    "Condition",
    "Value",
    ...(hasId ? ["DishID"] : []),
    ...(options.series ? ["Batch"] : []),
  ];
  const rows = [
    [
      "Control",
      "10",
      ...(hasId ? [options.ids?.[0] ?? "dish-1"] : []),
      ...(options.series ? ["A"] : []),
    ],
    [
      "Drug",
      "14",
      ...(hasId ? [options.ids?.[1] ?? "dish-1"] : []),
      ...(options.series ? ["A"] : []),
    ],
  ];
  return createUnresolvedVisualizationProjectState({
    metadata: {
      projectId: "visualization.bridge",
      projectName: "Bridge",
      experimentDate: "",
      createdAt: now,
      updatedAt: now,
    },
    entryIntent: "graph_only",
    table: { id: "table.bridge", headers, rows, delimiter: "tab", headerRow: 1 },
    rawLineage: {
      sourceKind: "clipboard",
      sourceLabel: "clipboard",
      importedAt: now,
      rawText: [headers.join("\t"), ...rows.map((row) => row.join("\t"))].join("\n"),
      sha256: null,
      transformations: ["delimiter_detection"],
    },
    mapping: mapping(hasId, options.series),
    actor: "test",
  });
}

function contract(matched = false) {
  return buildStructureContract({
    experimentName: "Graph-only bridge",
    experimentDescription: "Researcher confirmed one treatment factor.",
    experimentalUnitLabel: "culture dish",
    identityLabel: "Dish ID",
    readoutLabel: "Cell area",
    readoutRepresentation: "scalar",
    factorName: "Condition",
    factorLevels: ["Control", "Drug"],
    sameIdentityAcrossConditions: matched,
    conditionEntityRelationship: matched
      ? { kind: "same_entity_across_conditions" }
      : { kind: "independent_condition_units" },
  });
}

describe("bridgeGraphOnlyTableToStatistics", () => {
  it("generates stable local unit IDs only after an independent row relationship is confirmed", () => {
    const result = bridgeGraphOnlyTableToStatistics(state(), contract(), now);

    expect(result.status).toBe("ready");
    if (result.status !== "ready") return;
    expect(result.observations.map(({ identities }) => identities.dishid)).toEqual([
      "unit-001",
      "unit-002",
    ]);
    expect(result.lineage.transformations).toContain(
      "generated_independent_unit_ids_from_confirmed_source_rows",
    );
    expect(Object.values(result.mapping.columns)).not.toContainEqual({
      role: "identity",
      semanticKey: "dishid",
    });

    const workspace = createAdaptiveWorkspace({
      contract: contract(),
      observations: result.observations,
      mapping: result.mapping,
      lineage: result.lineage,
      now,
    });
    expect(workspace.status).toBe("ready");
    const reopened = rehydrateExperimentWorkspace(
      createExperimentWorkspaceProject({
        draft: workspace.draft!,
        cells: workspace.cells,
        graphs: [],
        now,
      }),
    );
    expect(
      reopened?.draft.adaptiveInput?.canonicalObservations.map(
        ({ identities }) => identities.dishid,
      ),
    ).toEqual(["unit-001", "unit-002"]);
    expect(reopened?.draft.adaptiveInput?.rawLineage?.rawText).toBe(
      state().rawLineage.rawText,
    );
  });

  it("requires an explicit ID decision before attempting the bridge", () => {
    const unanswered = state();
    const result = bridgeGraphOnlyTableToStatistics(
      {
        ...unanswered,
        mapping: { ...unanswered.mapping!, identityDecision: "unanswered" },
      },
      contract(),
      now,
    );

    expect(result).toMatchObject({
      status: "stopped",
      code: "IDENTITY_DECISION_REQUIRED",
    });
  });

  it.each([
    ["unanswered", "ROW_UNIT_DECISION_REQUIRED"],
    ["unknown", "ROW_UNIT_DECISION_REQUIRED"],
    ["multiple_rows_per_unit", "PARENT_IDENTITY_COLUMN_REQUIRED"],
  ] as const)("safe-stops a no-ID table when source-row grain is %s", (decision, code) => {
    const unresolved = state();
    const result = bridgeGraphOnlyTableToStatistics(
      {
        ...unresolved,
        mapping: { ...unresolved.mapping!, sourceRowUnitDecision: decision },
      },
      contract(),
      now,
    );

    expect(result).toMatchObject({ status: "stopped", code });
  });

  it("treats a legacy no-ID mapping without a row-grain fact as unanswered", () => {
    const legacy = state();
    const { sourceRowUnitDecision: _sourceRowUnitDecision, ...mappingWithoutRowGrain } =
      legacy.mapping!;
    expect(
      bridgeGraphOnlyTableToStatistics(
        { ...legacy, mapping: mappingWithoutRowGrain },
        contract(),
        now,
      ),
    ).toMatchObject({ status: "stopped", code: "ROW_UNIT_DECISION_REQUIRED" });
  });

  it("requires an explicit ID column for matched observations", () => {
    expect(bridgeGraphOnlyTableToStatistics(state(), contract(true), now)).toMatchObject({
      status: "stopped",
      code: "IDENTITY_COLUMN_REQUIRED",
    });

    const result = bridgeGraphOnlyTableToStatistics(state({ id: true }), contract(true), now);
    expect(result.status).toBe("ready");
    if (result.status !== "ready") return;
    expect(result.observations.map(({ identities }) => identities.dishid)).toEqual([
      "dish-1",
      "dish-1",
    ]);

    const workspace = createAdaptiveWorkspace({
      contract: contract(true),
      observations: result.observations,
      mapping: result.mapping,
      lineage: result.lineage,
      now,
    });
    expect(workspace.draft).not.toBeNull();
    const reopened = rehydrateExperimentWorkspace(
      createExperimentWorkspaceProject({
        draft: workspace.draft!,
        cells: workspace.cells,
        graphs: [],
        now,
      }),
    );
    expect(
      reopened?.draft.adaptiveInput?.canonicalObservations.map(
        ({ identities }) => identities.dishid,
      ),
    ).toEqual(["dish-1", "dish-1"]);
  });

  it("does not silently reuse an identity in an independent design", () => {
    expect(bridgeGraphOnlyTableToStatistics(state({ id: true }), contract(), now)).toMatchObject({
      status: "stopped",
      code: "IDENTITY_SET_INVALID",
    });

    const result = bridgeGraphOnlyTableToStatistics(
      state({ ids: ["dish-1", "dish-2"] }),
      contract(),
      now,
    );
    expect(result.status).toBe("ready");
    if (result.status !== "ready") return;
    expect(result.observations.map(({ identities }) => identities.dishid)).toEqual([
      "dish-1",
      "dish-2",
    ]);
    expect(result.mapping.columns.DishID).toMatchObject({
      role: "identity",
      semanticKey: "dishid",
    });

    const workspace = createAdaptiveWorkspace({
      contract: contract(),
      observations: result.observations,
      mapping: result.mapping,
      lineage: result.lineage,
      now,
    });
    expect(workspace.draft).not.toBeNull();
    const saved = createExperimentWorkspaceProject({
      draft: workspace.draft!,
      cells: workspace.cells,
      graphs: [],
      now,
    });
    const reopened = rehydrateExperimentWorkspace(saved);
    expect(
      reopened?.draft.adaptiveInput?.canonicalObservations.map(
        ({ identities }) => identities.dishid,
      ),
    ).toEqual(["dish-1", "dish-2"]);
    expect(reopened?.draft.adaptiveInput?.mapping?.columns.DishID).toMatchObject({
      role: "identity",
      semanticKey: "dishid",
    });
    expect(reopened?.draft.adaptiveInput?.rawLineage?.rawText).toContain("Control\t10\tdish-1");
  });

  it.each([
    ["independent", false],
    ["matched", true],
  ] as const)("stops NFKC-equivalent source ID variants in a %s design", (_label, matched) => {
    expect(
      bridgeGraphOnlyTableToStatistics(
        state({ ids: ["dish-1", "ｄｉｓｈ－１"] }),
        contract(matched),
        now,
      ),
    ).toMatchObject({ status: "stopped", code: "IDENTITY_SET_INVALID" });
  });

  it.each([
    ["independent", false],
    ["matched", true],
  ] as const)("stops a blank selected ID in a %s design", (_label, matched) => {
    const blankId = state({ ids: ["", "dish-2"] });
    expect(bridgeGraphOnlyTableToStatistics(blankId, contract(matched), now)).toMatchObject({
      status: "stopped",
      code: "IDENTITY_COLUMN_REQUIRED",
    });
  });

  it("retains unequal n, a missing measurement, explicit IDs, source rows, and lineage", () => {
    const headers = ["Condition", "Value", "DishID"];
    const rows = [
      ["Control", "10", "dish-c1"],
      ["Control", "", "dish-c2"],
      ["Control", "12", "dish-c3"],
      ["Drug", "14", "dish-d1"],
      ["Drug", "15", "dish-d2"],
    ];
    const source = state({ ids: ["dish-c1", "dish-d1"] });
    const unequal = {
      ...source,
      table: { ...source.table, headers, rows },
      rawLineage: {
        ...source.rawLineage,
        rawText: [headers.join("\t"), ...rows.map((row) => row.join("\t"))].join("\n"),
      },
    };
    const result = bridgeGraphOnlyTableToStatistics(unequal, contract(), now);

    expect(result.status).toBe("ready");
    if (result.status !== "ready") return;
    expect(result.observations.map(({ identities }) => identities.dishid)).toEqual([
      "dish-c1",
      "dish-c2",
      "dish-c3",
      "dish-d1",
      "dish-d2",
    ]);
    expect(result.observations.map(({ sourceRow }) => sourceRow)).toEqual([2, 3, 4, 5, 6]);
    expect(result.observations[1]).toMatchObject({
      values: { cellarea: null },
      missingness: { cellarea: "unknown" },
    });

    const workspace = createAdaptiveWorkspace({
      contract: contract(),
      observations: result.observations,
      mapping: result.mapping,
      lineage: result.lineage,
      now,
    });
    expect(workspace.draft).not.toBeNull();
    const reopened = rehydrateExperimentWorkspace(
      createExperimentWorkspaceProject({
        draft: workspace.draft!,
        cells: workspace.cells,
        graphs: [],
        now,
      }),
    );
    expect(reopened?.draft.adaptiveInput?.canonicalObservations).toEqual(result.observations);
    expect(reopened?.draft.adaptiveInput?.mapping).toEqual(result.mapping);
    expect(reopened?.draft.adaptiveInput?.rawLineage).toEqual(result.lineage);
  });

  it("requires every matched ID to occur exactly once at every factor level", () => {
    expect(
      bridgeGraphOnlyTableToStatistics(state({ ids: ["dish-1", "dish-2"] }), contract(true), now),
    ).toMatchObject({ status: "stopped", code: "IDENTITY_SET_INVALID" });

    const duplicate = state({ id: true });
    const rows = [
      ["Control", "10", "dish-1"],
      ["Control", "11", "dish-1"],
      ["Drug", "14", "dish-1"],
    ];
    const duplicateCoordinate = {
      ...duplicate,
      table: { ...duplicate.table, rows },
      rawLineage: {
        ...duplicate.rawLineage,
        rawText: [duplicate.table.headers.join("\t"), ...rows.map((row) => row.join("\t"))].join(
          "\n",
        ),
      },
    };
    expect(
      bridgeGraphOnlyTableToStatistics(duplicateCoordinate, contract(true), now),
    ).toMatchObject({ status: "stopped", code: "IDENTITY_SET_INVALID" });

    const reorderedRows = [
      ["Control", "9", "dish-2"],
      ["Drug", "14", "dish-1"],
      ["Control", "10", "dish-1"],
      ["Drug", "15", "dish-2"],
    ];
    const reordered = {
      ...duplicate,
      table: { ...duplicate.table, rows: reorderedRows },
      rawLineage: {
        ...duplicate.rawLineage,
        rawText: [
          duplicate.table.headers.join("\t"),
          ...reorderedRows.map((row) => row.join("\t")),
        ].join("\n"),
      },
    };
    const matched = bridgeGraphOnlyTableToStatistics(reordered, contract(true), now);
    expect(matched.status).toBe("ready");
    if (matched.status !== "ready") return;
    expect(
      matched.observations.map(({ identities, factors }) => [identities.dishid, factors.condition]),
    ).toEqual([
      ["dish-2", "Control"],
      ["dish-1", "Drug"],
      ["dish-1", "Control"],
      ["dish-2", "Drug"],
    ]);
  });

  it("does not silently reinterpret or ignore a Graph series column", () => {
    expect(
      bridgeGraphOnlyTableToStatistics(
        state({ ids: ["dish-1", "dish-2"], series: true }),
        contract(),
        now,
      ),
    ).toMatchObject({
      status: "stopped",
      code: "SERIES_MEANING_REQUIRED",
    });
  });

  it("stops matching structures outside the explicit independent/matched slice", () => {
    const unsupported = {
      ...contract(),
      matching: { kind: "none", identityKey: null, completeSetsRequired: null },
    } as StructureContract;
    expect(bridgeGraphOnlyTableToStatistics(state(), unsupported, now)).toMatchObject({
      status: "stopped",
      code: "UNSUPPORTED_MATCHING_STRUCTURE",
    });

    expect(
      bridgeGraphOnlyTableToStatistics(
        { ...state(), entryIntent: "matrix_visualization" },
        contract(),
        now,
      ),
    ).toMatchObject({ status: "stopped", code: "INVALID_SOURCE_TABLE" });

    const sharedSource = buildStructureContract({
      experimentName: "Shared donor source",
      experimentDescription: "Separate culture dishes from each donor received Control or Drug.",
      experimentalUnitLabel: "culture dish",
      identityLabel: "Dish ID",
      readoutLabel: "Cell area",
      readoutRepresentation: "scalar",
      factorName: "Condition",
      factorLevels: ["Control", "Drug"],
      sameIdentityAcrossConditions: false,
      conditionEntityRelationship: {
        kind: "distinct_condition_units_shared_source",
        sourceUnitLabel: "donor",
        sourceIdentityLabel: "Donor ID",
        sourceRole: "block",
        completeSetsRequired: true,
      },
    });
    expect(
      bridgeGraphOnlyTableToStatistics(
        state({ ids: ["dish-control-1", "dish-drug-1"] }),
        sharedSource,
        now,
      ),
    ).toMatchObject({
      status: "stopped",
      code: "UNSUPPORTED_MATCHING_STRUCTURE",
    });
  });

  it("safe-stops ordered, nested, multifactor, and typed structures", () => {
    const ordered = buildStructureContract({
      experimentName: "Ordered",
      experimentDescription: "Signal was measured over time.",
      experimentalUnitLabel: "animal",
      identityLabel: "Animal ID",
      readoutLabel: "Signal",
      readoutRepresentation: "scalar",
      factorName: "Condition",
      factorLevels: ["Control", "Drug"],
      sameIdentityAcrossConditions: false,
      orderedAxis: { label: "Time", unit: "day", levels: [0, 7], sameIdentity: true },
    });
    const nested = buildStructureContract({
      experimentName: "Nested",
      experimentDescription: "Cells were measured within dishes.",
      experimentalUnitLabel: "culture dish",
      identityLabel: "Dish ID",
      readoutLabel: "Cell area",
      readoutRepresentation: "scalar",
      factorName: "Condition",
      factorLevels: ["Control", "Drug"],
      sameIdentityAcrossConditions: false,
      nestedObservationLabel: "Cell",
    });
    const orderedFactor = {
      ...contract(),
      factors: contract().factors.map((factor) => ({ ...factor, ordered: true })),
    } as StructureContract;
    const multifactor = {
      ...contract(),
      factors: [
        ...contract().factors,
        {
          ...contract().factors[0]!,
          key: "genotype",
          label: "Genotype",
          levels: ["WT", "KO"],
        },
      ],
    } as StructureContract;
    const typed = buildStructureContract({
      experimentName: "Counts",
      experimentDescription: "Positive and total counts were recorded.",
      experimentalUnitLabel: "culture dish",
      identityLabel: "Dish ID",
      readoutLabel: "Positive fraction",
      readoutRepresentation: "proportion_counts",
      factorName: "Condition",
      factorLevels: ["Control", "Drug"],
      sameIdentityAcrossConditions: false,
    });

    expect(bridgeGraphOnlyTableToStatistics(state(), ordered, now)).toMatchObject({
      status: "stopped",
      code: "ORDERED_OR_NESTED_STRUCTURE_REQUIRES_MAPPING",
    });
    expect(bridgeGraphOnlyTableToStatistics(state(), nested, now)).toMatchObject({
      status: "stopped",
      code: "ORDERED_OR_NESTED_STRUCTURE_REQUIRES_MAPPING",
    });
    expect(bridgeGraphOnlyTableToStatistics(state(), orderedFactor, now)).toMatchObject({
      status: "stopped",
      code: "ORDERED_OR_NESTED_STRUCTURE_REQUIRES_MAPPING",
    });
    expect(bridgeGraphOnlyTableToStatistics(state(), multifactor, now)).toMatchObject({
      status: "stopped",
      code: "ONE_FACTOR_SCALAR_ONLY",
    });
    expect(bridgeGraphOnlyTableToStatistics(state(), typed, now)).toMatchObject({
      status: "stopped",
      code: "ONE_FACTOR_SCALAR_ONLY",
    });
  });

  it("stops when the confirmed condition levels do not match the source table", () => {
    const mismatched = buildStructureContract({
      ...{
        experimentName: "Mismatch",
        experimentDescription: "Mismatch",
        experimentalUnitLabel: "culture dish",
        identityLabel: "Dish ID",
        readoutLabel: "Cell area",
        readoutRepresentation: "scalar" as const,
        factorName: "Condition",
        factorLevels: ["Control", "Drug A"],
        sameIdentityAcrossConditions: false,
        conditionEntityRelationship: { kind: "independent_condition_units" as const },
      },
    });
    expect(
      bridgeGraphOnlyTableToStatistics(state({ ids: ["dish-1", "dish-2"] }), mismatched, now),
    ).toMatchObject({
      status: "stopped",
      code: "FACTOR_LEVEL_MISMATCH",
    });
  });
});

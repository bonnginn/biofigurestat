import { describe, expect, it } from "vitest";
import { createHeatmapGraphSpec } from "@lsaa/graph-spec";
import {
  UnresolvedVisualizationProjectStateSchema,
  appendUnresolvedVisualizationDataRevision,
  appendUnresolvedVisualizationGraph,
  createUnresolvedVisualizationProjectState,
  deserializeUnresolvedVisualizationProjectState,
  migrateUnresolvedVisualizationProjectState,
  parseUnresolvedVisualizationProjectState,
  serializeUnresolvedVisualizationProjectState,
} from "./unresolved-visualization";
import {
  openProjectStatePackage,
  openUnresolvedVisualizationProjectPackage,
  saveUnresolvedVisualizationProjectPackage,
} from "./round-trip";
import type { AtomicProjectWrite, ProjectPackageStorage } from "./package-io";

const metadata = {
  projectId: "project.graph-only",
  projectName: "Descriptive table",
  experimentDate: "",
  createdAt: "2026-08-28T00:00:00Z",
  updatedAt: "2026-08-28T00:00:00Z",
};

class MemoryStorage implements ProjectPackageStorage {
  readonly packages = new Map<string, Map<string, Uint8Array>>();

  async readFile(target: string, relativePath: string): Promise<Uint8Array> {
    const file = this.packages.get(target)?.get(relativePath);
    if (!file) throw new Error(`missing ${relativePath}`);
    return file;
  }

  async beginAtomicWrite(target: string): Promise<AtomicProjectWrite> {
    const staged = new Map<string, Uint8Array>();
    return {
      writeFile: async (relativePath, data) => {
        staged.set(relativePath, data);
      },
      commit: async () => {
        this.packages.set(target, staged);
      },
      rollback: async () => undefined,
    };
  }
}

const sha256 = async (data: Uint8Array) => {
  let checksum = 0;
  for (const byte of data) checksum = (checksum * 31 + byte) % 0xffffffff;
  return checksum.toString(16).padStart(64, "0");
};

function fixture() {
  return createUnresolvedVisualizationProjectState({
    metadata,
    entryIntent: "matrix_visualization",
    table: {
      id: "table.graph-only.1",
      headers: ["sample", "condition", "value"],
      rows: [
        ["S1", "control", "1.2"],
        ["S2", "treated", "2.4"],
        ["S3", "treated", ""],
      ],
      delimiter: "tab",
      headerRow: 1,
    },
    rawLineage: {
      sourceKind: "clipboard",
      sourceLabel: "clipboard paste",
      importedAt: "2026-08-28T00:00:00Z",
      rawText: "sample\tcondition\tvalue\r\nS1\tcontrol\t1.2\r\nS2\ttreated\t2.4\r\nS3\ttreated\t",
      sha256: null,
      transformations: ["delimiter_detection"],
    },
    mapping: {
      schemaVersion: "0.1.0",
      sourceLabel: "clipboard paste",
      delimiter: "tab",
      headerRow: 1,
      columns: [
        { index: 0, header: "sample", role: "id" },
        { index: 1, header: "condition", role: "x" },
        { index: 2, header: "value", role: "y" },
      ],
      identityDecision: "selected_column",
      confirmedAt: "2026-08-28T00:00:00Z",
    },
    actor: "researcher",
  });
}

describe("unresolved visualization project state", () => {
  it("retains raw table, unresolved readiness, and descriptive graph specs across byte round trip", () => {
    const state = fixture();
    const spec = createHeatmapGraphSpec({
      graphId: "graph.table.1",
      dataSource: {
        kind: "visualization_table",
        id: state.table.id,
        revision: state.activeDataRevisionId,
      },
      transform: "none",
    });
    const withGraph = {
      ...state,
      graphSpecs: [spec],
      activeGraphId: spec.id,
    };
    const parsed = UnresolvedVisualizationProjectStateSchema.parse(withGraph);
    const reopened = deserializeUnresolvedVisualizationProjectState(
      serializeUnresolvedVisualizationProjectState(parsed),
    );

    expect(reopened).toEqual(parsed);
    expect(reopened.table.rows[2]?.[2]).toBe("");
    expect(reopened.rawLineage.rawText).toContain("S3\ttreated\t");
    expect(reopened.statisticsReadiness.status).toBe("unresolved");
    expect(reopened.graphSpecs[0]?.analysisResultId).toBeNull();
    expect(reopened.graphSpecs[0]?.dataSource.kind).toBe("visualization_table");
  });

  it("migrates the explicitly versioned 0.0.0 shape without creating a design", () => {
    const current = fixture();
    const legacy = {
      ...current,
      schemaVersion: "0.0.0",
      rawTable: { ...current.table, schemaVersion: undefined },
      table: undefined,
      rawLineage: { ...current.rawLineage, schemaVersion: undefined },
      mapping: undefined,
      graphSpecs: undefined,
      activeGraphId: undefined,
      statisticsReadiness: undefined,
      provenanceEvents: undefined,
    };
    const migrated = parseUnresolvedVisualizationProjectState(legacy);
    expect(migrated.schemaVersion).toBe("0.2.0");
    expect(migrated.dataRevisions).toHaveLength(1);
    expect(migrated.activeDataRevisionId).toBe(migrated.dataRevisions[0]?.id);
    expect(migrated.table.id).toBe(current.table.id);
    expect(migrated.statisticsReadiness.status).toBe("unresolved");
    expect(migrated.graphSpecs).toEqual([]);
    expect("design" in (migrated as unknown as Record<string, unknown>)).toBe(false);
    expect(migrateUnresolvedVisualizationProjectState({ schemaVersion: "9.9.9" })).toEqual({
      schemaVersion: "9.9.9",
    });
    expect(() =>
      parseUnresolvedVisualizationProjectState({
        ...legacy,
        entryIntent: "unknown_visualization_intent",
      }),
    ).toThrow();
  });

  it("synthesizes one retained revision for 0.1.0 and rebinds its legacy Graph", () => {
    const current = fixture();
    const legacyGraph = createHeatmapGraphSpec({
      graphId: "graph.legacy-table",
      dataSource: {
        kind: "visualization_table",
        id: current.table.id,
        revision: current.rawLineage.importedAt,
      },
      transform: "none",
    });
    const legacy = {
      ...current,
      schemaVersion: "0.1.0",
      dataRevisions: undefined,
      activeDataRevisionId: undefined,
      graphSpecs: [legacyGraph],
      activeGraphId: legacyGraph.id,
    };

    const migrated = parseUnresolvedVisualizationProjectState(legacy);
    expect(migrated.dataRevisions).toHaveLength(1);
    expect(migrated.graphSpecs[0]?.dataSource.revision).toBe(migrated.activeDataRevisionId);
    expect(migrated.dataRevisions[0]?.table).toEqual(migrated.table);
    expect(migrated.dataRevisions[0]?.rawLineage).toEqual(migrated.rawLineage);
  });

  it("migrates legacy ID decisions without treating an absent ID column as confirmed no-ID", () => {
    const selected = fixture();
    const legacySelected = {
      ...selected,
      schemaVersion: "0.1.0",
      dataRevisions: undefined,
      activeDataRevisionId: undefined,
      mapping: { ...selected.mapping, identityDecision: undefined },
    };
    expect(parseUnresolvedVisualizationProjectState(legacySelected).mapping).toMatchObject({
      identityDecision: "selected_column",
    });

    const legacyUnanswered = {
      ...selected,
      schemaVersion: "0.1.0",
      dataRevisions: undefined,
      activeDataRevisionId: undefined,
      mapping: {
        ...selected.mapping,
        columns: selected.mapping!.columns.filter(({ role }) => role !== "id"),
        identityDecision: undefined,
      },
    };
    const migrated = parseUnresolvedVisualizationProjectState(legacyUnanswered);
    expect(migrated.mapping?.identityDecision).toBe("unanswered");
    expect(migrated.mapping?.columns.some(({ role }) => role === "id")).toBe(false);

    const explicitlyNoId = parseUnresolvedVisualizationProjectState({
      ...legacyUnanswered,
      mapping: {
        ...legacyUnanswered.mapping,
        identityDecision: "no_id",
        sourceRowUnitDecision: "each_row_distinct_unit",
      },
    });
    const reopenedNoId = deserializeUnresolvedVisualizationProjectState(
      serializeUnresolvedVisualizationProjectState(explicitlyNoId),
    );
    expect(reopenedNoId.mapping?.identityDecision).toBe("no_id");
    expect(reopenedNoId.mapping?.sourceRowUnitDecision).toBe("each_row_distinct_unit");
    expect(migrated.mapping?.sourceRowUnitDecision).toBeUndefined();
  });

  it("rejects non-rectangular tables and mapping/lineage disagreement", () => {
    const state = fixture();
    expect(
      UnresolvedVisualizationProjectStateSchema.safeParse({
        ...state,
        table: { ...state.table, rows: [["S1", "control"]] },
      }).success,
    ).toBe(false);
    expect(
      UnresolvedVisualizationProjectStateSchema.safeParse({
        ...state,
        mapping: { ...state.mapping!, sourceLabel: "different.csv" },
      }).success,
    ).toBe(false);
    expect(
      UnresolvedVisualizationProjectStateSchema.safeParse({
        ...state,
        mapping: { ...state.mapping!, delimiter: "comma" },
      }).success,
    ).toBe(false);
    expect(
      UnresolvedVisualizationProjectStateSchema.safeParse({
        ...state,
        design: { id: "fabricated.design" },
      }).success,
    ).toBe(false);
    expect(
      UnresolvedVisualizationProjectStateSchema.safeParse({
        ...state,
        statisticsReadiness: {
          ...state.statisticsReadiness,
          reasonCode: "GRAPH_VALUES_DO_NOT_ESTABLISH_EXPERIMENT_STRUCTURE",
        },
      }).success,
    ).toBe(false);
  });

  it("rejects moving the active aliases behind the append-only revision tip", () => {
    const initial = fixture();
    const revised = appendUnresolvedVisualizationDataRevision(initial, {
      table: {
        id: initial.table.id,
        headers: [...initial.table.headers],
        rows: initial.table.rows.map((row, index) =>
          index === 0 ? [row[0]!, row[1]!, "7.7"] : [...row],
        ),
        delimiter: initial.table.delimiter,
        headerRow: initial.table.headerRow,
      },
      rawLineage: {
        sourceKind: initial.rawLineage.sourceKind,
        sourceLabel: initial.rawLineage.sourceLabel,
        importedAt: initial.rawLineage.importedAt,
        rawText: initial.rawLineage.rawText.replace("1.2", "7.7"),
        sha256: null,
        transformations: [...initial.rawLineage.transformations, "table_edit"],
      },
      mapping: initial.mapping,
      actor: "researcher",
      createdAt: "2026-08-28T00:10:00Z",
    });
    const first = revised.dataRevisions[0]!;

    expect(
      UnresolvedVisualizationProjectStateSchema.safeParse({
        ...revised,
        activeDataRevisionId: first.id,
        table: first.table,
        rawLineage: first.rawLineage,
        mapping: first.mapping,
      }).success,
    ).toBe(false);
  });

  it("rejects an analysis-backed or non-visualization source graph instead of coercing it", () => {
    const state = fixture();
    const invalid = {
      ...state,
      graphSpecs: [
        {
          ...createHeatmapGraphSpec({
            graphId: "graph.invalid",
            dataSource: { kind: "raw_revision", id: state.table.id, revision: "raw.1" },
            transform: "none",
          }),
        },
      ],
    };
    expect(UnresolvedVisualizationProjectStateSchema.safeParse(invalid).success).toBe(false);
  });

  it("appends only a graph whose source is the unresolved table and keeps Statistics unresolved", () => {
    const state = fixture();
    const spec = createHeatmapGraphSpec({
      graphId: "graph.table.appended",
      dataSource: {
        kind: "visualization_table",
        id: state.table.id,
        revision: state.activeDataRevisionId,
      },
      transform: "none",
    });
    const next = appendUnresolvedVisualizationGraph(state, {
      spec,
      actor: "researcher",
      createdAt: "2026-08-28T00:30:00Z",
    });
    expect(next.graphSpecs).toHaveLength(1);
    expect(next.activeGraphId).toBe(spec.id);
    expect(next.statisticsReadiness.status).toBe("unresolved");
    expect(next.provenanceEvents.at(-1)?.kind).toBe("visualization_graph_created");
  });

  it("saves and reopens a graph-only package while the ordinary project reader refuses it", async () => {
    const storage = new MemoryStorage();
    const saved = await saveUnresolvedVisualizationProjectPackage({
      storage,
      target: "table.lsa",
      state: fixture(),
      sha256,
      appVersion: "0.1.0",
      savedAt: "2026-08-28T01:00:00Z",
    });
    const reopened = await openUnresolvedVisualizationProjectPackage({
      storage,
      target: "table.lsa",
      sha256,
    });
    expect(reopened).toEqual(saved);
    expect(storage.packages.get("table.lsa")?.has("project.json")).toBe(true);
    expect(
      [...(storage.packages.get("table.lsa")?.keys() ?? [])].some((path) =>
        path.includes(saved.activeDataRevisionId),
      ),
    ).toBe(true);
    await expect(
      openProjectStatePackage({
        storage,
        databaseCodec: {
          encode: async () => new Uint8Array(),
          decode: async () => ({}),
        },
        target: "table.lsa",
        sha256,
      }),
    ).rejects.toMatchObject({ code: "PROJECT_KIND_MISMATCH" });
  });

  it("keeps intent, raw bytes, mapping, and Graph specs stable across save-open-resave", async () => {
    const storage = new MemoryStorage();
    const initial = fixture();
    const spec = createHeatmapGraphSpec({
      graphId: "graph.table.stable",
      dataSource: {
        kind: "visualization_table",
        id: initial.table.id,
        revision: initial.activeDataRevisionId,
      },
      transform: "column_z_score",
      range: { min: -2, max: 2 },
      missingColor: "#aabbcc",
      showCellValues: true,
    });
    const state = appendUnresolvedVisualizationGraph(initial, {
      spec,
      actor: "researcher",
      createdAt: "2026-08-28T00:30:00Z",
    });
    await saveUnresolvedVisualizationProjectPackage({
      storage,
      target: "stable.lsa",
      state,
      sha256,
      appVersion: "0.1.0",
      savedAt: "2026-08-28T01:00:00Z",
    });
    const reopened = await openUnresolvedVisualizationProjectPackage({
      storage,
      target: "stable.lsa",
      sha256,
    });
    await saveUnresolvedVisualizationProjectPackage({
      storage,
      target: "stable.lsa",
      state: reopened,
      sha256,
      appVersion: "0.1.0",
      savedAt: "2026-08-28T02:00:00Z",
    });
    const reopenedAgain = await openUnresolvedVisualizationProjectPackage({
      storage,
      target: "stable.lsa",
      sha256,
    });

    expect(reopenedAgain.entryIntent).toBe(state.entryIntent);
    expect(reopenedAgain.table).toEqual(state.table);
    expect(reopenedAgain.rawLineage).toEqual(state.rawLineage);
    expect(reopenedAgain.mapping).toEqual(state.mapping);
    expect(reopenedAgain.graphSpecs).toEqual(state.graphSpecs);
    expect(reopenedAgain.activeGraphId).toBe(state.activeGraphId);
    expect(reopenedAgain.provenanceEvents).toEqual(state.provenanceEvents);
  });

  it("retains every raw revision and binds old and new Graphs to their original data", async () => {
    const storage = new MemoryStorage();
    const initial = fixture();
    const oldRevisionId = initial.activeDataRevisionId;
    const oldGraph = createHeatmapGraphSpec({
      graphId: "graph.table.old",
      dataSource: {
        kind: "visualization_table",
        id: initial.table.id,
        revision: oldRevisionId,
      },
      transform: "none",
    });
    const firstSavedState = appendUnresolvedVisualizationGraph(initial, {
      spec: oldGraph,
      actor: "researcher",
      createdAt: "2026-08-28T00:30:00Z",
    });
    await saveUnresolvedVisualizationProjectPackage({
      storage,
      target: "revision-history.lsa",
      state: firstSavedState,
      sha256,
      appVersion: "0.1.0",
      savedAt: "2026-08-28T01:00:00Z",
    });
    const opened = await openUnresolvedVisualizationProjectPackage({
      storage,
      target: "revision-history.lsa",
      sha256,
    });
    const revised = appendUnresolvedVisualizationDataRevision(opened, {
      table: {
        id: opened.table.id,
        headers: [...opened.table.headers],
        rows: [
          ["S1", "control", "1.2"],
          ["S2", "treated", "9.9"],
          ["S3", "treated", ""],
        ],
        delimiter: opened.table.delimiter,
        headerRow: opened.table.headerRow,
      },
      rawLineage: {
        sourceKind: opened.rawLineage.sourceKind,
        sourceLabel: opened.rawLineage.sourceLabel,
        importedAt: opened.rawLineage.importedAt,
        rawText:
          "sample\tcondition\tvalue\r\nS1\tcontrol\t1.2\r\nS2\ttreated\t9.9\r\nS3\ttreated\t",
        sha256: null,
        transformations: [
          ...opened.rawLineage.transformations,
          "visualization_table_or_source_updated",
        ],
      },
      mapping: opened.mapping,
      actor: "researcher",
      createdAt: "2026-08-28T01:30:00Z",
    });
    const newRevisionId = revised.activeDataRevisionId;
    const newGraph = createHeatmapGraphSpec({
      graphId: "graph.table.new",
      dataSource: {
        kind: "visualization_table",
        id: revised.table.id,
        revision: newRevisionId,
      },
      transform: "none",
    });
    const revisedWithGraph = appendUnresolvedVisualizationGraph(revised, {
      spec: newGraph,
      actor: "researcher",
      createdAt: "2026-08-28T01:31:00Z",
    });
    await saveUnresolvedVisualizationProjectPackage({
      storage,
      target: "revision-history.lsa",
      state: revisedWithGraph,
      sha256,
      appVersion: "0.1.0",
      savedAt: "2026-08-28T02:00:00Z",
    });
    const reopened = await openUnresolvedVisualizationProjectPackage({
      storage,
      target: "revision-history.lsa",
      sha256,
    });

    expect(reopened.dataRevisions).toHaveLength(2);
    expect(reopened.dataRevisions[0]?.rawLineage.rawText).toBe(initial.rawLineage.rawText);
    expect(reopened.dataRevisions[1]?.rawLineage.rawText).toContain("S2\ttreated\t9.9");
    expect(reopened.graphSpecs.find(({ id }) => id === oldGraph.id)?.dataSource.revision).toBe(
      oldRevisionId,
    );
    expect(reopened.graphSpecs.find(({ id }) => id === newGraph.id)?.dataSource.revision).toBe(
      newRevisionId,
    );
    expect(
      [...storage.packages.get("revision-history.lsa")!.keys()].filter((path) =>
        path.startsWith("raw/exports/visualization-revisions/"),
      ),
    ).toHaveLength(2);
  });

  it("rejects a package with the wrong reader or incompatible unresolved semantics", async () => {
    const storage = new MemoryStorage();
    await saveUnresolvedVisualizationProjectPackage({
      storage,
      target: "wrong-kind.lsa",
      state: fixture(),
      sha256,
      appVersion: "0.1.0",
      savedAt: "2026-08-28T01:00:00Z",
    });
    const packageFiles = storage.packages.get("wrong-kind.lsa")!;
    const manifestBytes = packageFiles.get("manifest.json")!;
    const manifest = JSON.parse(new TextDecoder().decode(manifestBytes)) as Record<string, unknown>;
    packageFiles.set(
      "manifest.json",
      new TextEncoder().encode(
        `${JSON.stringify({ ...manifest, projectKind: "experiment" }, null, 2)}\n`,
      ),
    );
    await expect(
      openUnresolvedVisualizationProjectPackage({
        storage,
        target: "wrong-kind.lsa",
        sha256,
      }),
    ).rejects.toMatchObject({ code: "PROJECT_KIND_MISMATCH" });

    await saveUnresolvedVisualizationProjectPackage({
      storage,
      target: "wrong-semantics.lsa",
      state: fixture(),
      sha256,
      appVersion: "0.1.0",
      savedAt: "2026-08-28T01:00:00Z",
    });
    const semanticFiles = storage.packages.get("wrong-semantics.lsa")!;
    const semanticManifest = JSON.parse(
      new TextDecoder().decode(semanticFiles.get("manifest.json")!),
    ) as Record<string, unknown>;
    semanticFiles.set(
      "manifest.json",
      new TextEncoder().encode(
        `${JSON.stringify(
          {
            ...semanticManifest,
            schemaVersions: {
              ...(semanticManifest.schemaVersions as Record<string, unknown>),
              design: "0.2.0",
            },
          },
          null,
          2,
        )}\n`,
      ),
    );
    await expect(
      openUnresolvedVisualizationProjectPackage({
        storage,
        target: "wrong-semantics.lsa",
        sha256,
      }),
    ).rejects.toThrow("incompatible schema semantics");
  });
});

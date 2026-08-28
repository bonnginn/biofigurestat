import { z } from "zod";
import {
  EntityIdSchema,
  IsoDateTimeSchema,
  ProjectMetadataSchema,
  Sha256Schema,
} from "@lsaa/domain";
import { GraphSpecSchema, type GraphSpec } from "@lsaa/graph-spec";

/**
 * A graph-only project deliberately has no ExperimentDesign, biological n,
 * unit identity, or analysis request. It is a persistence boundary for a
 * rectangular table and descriptive Graph specifications until the user
 * supplies the facts required to establish an experiment structure.
 */
export const UNRESOLVED_VISUALIZATION_STATE_SCHEMA_VERSION = "0.2.0" as const;
export const UNRESOLVED_VISUALIZATION_DATA_SCHEMA_VERSION = "0.1.0" as const;
export const UNRESOLVED_VISUALIZATION_STATE_KIND = "unresolved_visualization" as const;

const VisualizationDelimiterSchema = z.enum(["comma", "tab", "semicolon"]);
const VisualizationEntryIntentSchema = z.enum(["graph_only", "matrix_visualization"]);
export const UnresolvedVisualizationIdentityDecisionSchema = z.enum([
  "unanswered",
  "no_id",
  "selected_column",
]);
const VisualizationColumnRoleSchema = z.enum([
  "x",
  "y",
  "series",
  "id",
  "facet",
  "metadata",
  "ignore",
]);

export const UnresolvedVisualizationTableSchema = z.object({
  id: EntityIdSchema,
  schemaVersion: z.literal(UNRESOLVED_VISUALIZATION_DATA_SCHEMA_VERSION),
  headers: z.array(z.string()).min(1),
  /** Raw cells are intentionally strings; no biological or numeric semantics are inferred here. */
  rows: z.array(z.array(z.string())),
  delimiter: VisualizationDelimiterSchema.nullable(),
  headerRow: z.number().int().positive().nullable(),
});

export const UnresolvedVisualizationRawLineageSchema = z.object({
  schemaVersion: z.literal(UNRESOLVED_VISUALIZATION_DATA_SCHEMA_VERSION),
  sourceKind: z.enum(["clipboard", "csv", "tsv", "generic_file"]),
  sourceLabel: z.string().min(1),
  importedAt: IsoDateTimeSchema,
  rawText: z.string(),
  sha256: Sha256Schema.nullable(),
  transformations: z.array(z.string()),
});

export const UnresolvedVisualizationColumnMappingSchema = z.object({
  schemaVersion: z.literal(UNRESOLVED_VISUALIZATION_DATA_SCHEMA_VERSION),
  sourceLabel: z.string().min(1),
  delimiter: VisualizationDelimiterSchema.nullable(),
  headerRow: z.number().int().positive().nullable(),
  columns: z.array(
    z.object({
      index: z.number().int().nonnegative(),
      header: z.string(),
      role: VisualizationColumnRoleSchema,
    }),
  ),
  /**
   * Whether the researcher explicitly confirmed that no source ID exists or
   * selected a source column. Optional only for reading 0.1.0 files written
   * before this additive field existed; absence is resolved fail-closed.
   */
  identityDecision: UnresolvedVisualizationIdentityDecisionSchema.optional(),
  confirmedAt: IsoDateTimeSchema,
});

export const UnresolvedVisualizationDataRevisionSchema = z
  .object({
    id: EntityIdSchema,
    previousRevisionId: EntityIdSchema.nullable(),
    createdAt: IsoDateTimeSchema,
    table: UnresolvedVisualizationTableSchema,
    rawLineage: UnresolvedVisualizationRawLineageSchema,
    mapping: UnresolvedVisualizationColumnMappingSchema.nullable(),
  })
  .strict();

export const UnresolvedVisualizationStatisticsReadinessSchema = z.object({
  status: z.literal("unresolved"),
  reasonCode: z.string().min(1),
  /** Human-facing facts that must be established before any inferential route. */
  requiredFacts: z.array(z.string().min(1)).min(1),
});

export const UnresolvedVisualizationProvenanceEventSchema = z.object({
  id: EntityIdSchema,
  kind: z.enum([
    "visualization_project_created",
    "visualization_table_imported",
    "visualization_table_revised",
    "visualization_graph_created",
    "visualization_graph_updated",
  ]),
  targetId: EntityIdSchema,
  occurredAt: IsoDateTimeSchema,
  actor: z.string().min(1),
  detail: z.string().min(1),
});

export const UnresolvedVisualizationProjectStateSchema = z
  .object({
    projectKind: z.literal(UNRESOLVED_VISUALIZATION_STATE_KIND),
    schemaVersion: z.literal(UNRESOLVED_VISUALIZATION_STATE_SCHEMA_VERSION),
    metadata: ProjectMetadataSchema,
    entryIntent: VisualizationEntryIntentSchema,
    table: UnresolvedVisualizationTableSchema,
    rawLineage: UnresolvedVisualizationRawLineageSchema,
    mapping: UnresolvedVisualizationColumnMappingSchema.nullable(),
    dataRevisions: z.array(UnresolvedVisualizationDataRevisionSchema).min(1),
    activeDataRevisionId: EntityIdSchema,
    graphSpecs: z.array(GraphSpecSchema),
    activeGraphId: EntityIdSchema.nullable(),
    statisticsReadiness: UnresolvedVisualizationStatisticsReadinessSchema,
    provenanceEvents: z.array(UnresolvedVisualizationProvenanceEventSchema).min(1),
  })
  .strict()
  .superRefine((state, ctx) => {
    const revisionIds = new Set<string>();
    state.dataRevisions.forEach((revision, index) => {
      if (revisionIds.has(revision.id)) {
        ctx.addIssue({
          code: "custom",
          path: ["dataRevisions", index, "id"],
          message: "Visualization data revision IDs must be unique",
        });
      }
      if (index > 0 && revision.previousRevisionId !== state.dataRevisions[index - 1]?.id) {
        ctx.addIssue({
          code: "custom",
          path: ["dataRevisions", index, "previousRevisionId"],
          message: "Visualization data revisions must form an append-only chain",
        });
      }
      if (index === 0 && revision.previousRevisionId !== null) {
        ctx.addIssue({
          code: "custom",
          path: ["dataRevisions", index, "previousRevisionId"],
          message: "The first visualization data revision cannot have a predecessor",
        });
      }
      if (revision.table.id !== state.table.id) {
        ctx.addIssue({
          code: "custom",
          path: ["dataRevisions", index, "table", "id"],
          message: "All visualization data revisions must retain the same table identity",
        });
      }
      if (revision.rawLineage.rawText.length === 0 && revision.table.rows.length > 0) {
        ctx.addIssue({
          code: "custom",
          path: ["dataRevisions", index, "rawLineage", "rawText"],
          message: "A non-empty revision must retain its source text",
        });
      }
      revision.table.rows.forEach((row, rowIndex) => {
        if (row.length !== revision.table.headers.length) {
          ctx.addIssue({
            code: "custom",
            path: ["dataRevisions", index, "table", "rows", rowIndex],
            message: "Visualization revision rows must match their header count",
          });
        }
      });
      if (
        revision.mapping &&
        (revision.mapping.sourceLabel !== revision.rawLineage.sourceLabel ||
          revision.mapping.delimiter !== revision.table.delimiter ||
          revision.mapping.headerRow !== revision.table.headerRow)
      ) {
        ctx.addIssue({
          code: "custom",
          path: ["dataRevisions", index, "mapping"],
          message: "Visualization revision mapping must match its retained table and lineage",
        });
      }
      const revisionColumnIndexes = new Set<number>();
      revision.mapping?.columns.forEach((column, columnIndex) => {
        if (
          column.index >= revision.table.headers.length ||
          revisionColumnIndexes.has(column.index) ||
          revision.table.headers[column.index] !== column.header
        ) {
          ctx.addIssue({
            code: "custom",
            path: ["dataRevisions", index, "mapping", "columns", columnIndex],
            message: "Visualization revision mapping must identify each retained column exactly",
          });
        }
        revisionColumnIndexes.add(column.index);
      });
      revisionIds.add(revision.id);
    });
    const activeRevision = state.dataRevisions.find(({ id }) => id === state.activeDataRevisionId);
    if (!activeRevision) {
      ctx.addIssue({
        code: "custom",
        path: ["activeDataRevisionId"],
        message: "Active visualization data revision must exist",
      });
    } else if (activeRevision.id !== state.dataRevisions.at(-1)?.id) {
      ctx.addIssue({
        code: "custom",
        path: ["activeDataRevisionId"],
        message: "Active visualization data revision must be the append-only chain tip",
      });
    } else if (
      JSON.stringify(activeRevision.table) !== JSON.stringify(state.table) ||
      JSON.stringify(activeRevision.rawLineage) !== JSON.stringify(state.rawLineage) ||
      JSON.stringify(activeRevision.mapping) !== JSON.stringify(state.mapping)
    ) {
      ctx.addIssue({
        code: "custom",
        path: ["activeDataRevisionId"],
        message: "Active visualization aliases must exactly match their retained data revision",
      });
    }
    if (state.rawLineage.rawText.length === 0 && state.table.rows.length > 0) {
      ctx.addIssue({
        code: "custom",
        path: ["rawLineage", "rawText"],
        message: "A non-empty table must retain the original imported text",
      });
    }
    const tableColumnCount = state.table.headers.length;
    state.table.rows.forEach((row, rowIndex) => {
      if (row.length !== tableColumnCount) {
        ctx.addIssue({
          code: "custom",
          path: ["table", "rows", rowIndex],
          message: "Visualization table rows must contain exactly one cell for every header",
        });
      }
    });
    const graphTableId = state.table.id;
    const mappedIndexes = new Set<number>();
    const mappedRoles = new Map<string, number>();
    if (state.mapping && state.mapping.sourceLabel !== state.rawLineage.sourceLabel) {
      ctx.addIssue({
        code: "custom",
        path: ["mapping", "sourceLabel"],
        message: "Visualization mapping and retained lineage must identify the same source",
      });
    }
    if (state.mapping && state.mapping.delimiter !== state.table.delimiter) {
      ctx.addIssue({
        code: "custom",
        path: ["mapping", "delimiter"],
        message: "Visualization mapping delimiter must match the persisted table",
      });
    }
    if (state.mapping && state.mapping.headerRow !== state.table.headerRow) {
      ctx.addIssue({
        code: "custom",
        path: ["mapping", "headerRow"],
        message: "Visualization mapping header row must match the persisted table",
      });
    }
    state.mapping?.columns.forEach((column, index) => {
      mappedRoles.set(column.role, (mappedRoles.get(column.role) ?? 0) + 1);
      if (column.index >= tableColumnCount) {
        ctx.addIssue({
          code: "custom",
          path: ["mapping", "columns", index, "index"],
          message: "Visualization mapping references a column outside the table",
        });
      }
      if (mappedIndexes.has(column.index)) {
        ctx.addIssue({
          code: "custom",
          path: ["mapping", "columns", index, "index"],
          message: "Visualization mapping cannot assign one table column twice",
        });
      }
      mappedIndexes.add(column.index);
      const tableHeader = state.table.headers[column.index];
      if (tableHeader !== undefined && tableHeader !== column.header) {
        ctx.addIssue({
          code: "custom",
          path: ["mapping", "columns", index, "header"],
          message: "Visualization mapping header must match its source table column",
        });
      }
    });
    if (state.entryIntent === "graph_only" && state.mapping) {
      (["x", "y", "series", "id"] as const).forEach((role) => {
        const count = mappedRoles.get(role) ?? 0;
        const required = role === "x" || role === "y";
        if ((required && count !== 1) || (!required && count > 1)) {
          ctx.addIssue({
            code: "custom",
            path: ["mapping", "columns"],
            message: required
              ? `Graph-only mapping must contain exactly one ${role} column`
              : `Graph-only mapping cannot contain more than one ${role} column`,
          });
        }
      });
      const identityDecision = resolveUnresolvedVisualizationIdentityDecision(state.mapping);
      const idCount = mappedRoles.get("id") ?? 0;
      if (
        (identityDecision === "selected_column" && idCount !== 1) ||
        (identityDecision !== "selected_column" && idCount !== 0)
      ) {
        ctx.addIssue({
          code: "custom",
          path: ["mapping", "identityDecision"],
          message: "Graph-only identity decision must agree with the selected source ID column",
        });
      }
    }

    if (state.statisticsReadiness.reasonCode !== reasonCodeForIntent(state.entryIntent)) {
      ctx.addIssue({
        code: "custom",
        path: ["statisticsReadiness", "reasonCode"],
        message: "Statistics safe-stop reason must match the visualization entry intent",
      });
    }

    const graphIds = new Set<string>();
    state.graphSpecs.forEach((graph, index) => {
      if (graphIds.has(graph.id)) {
        ctx.addIssue({
          code: "custom",
          path: ["graphSpecs", index, "id"],
          message: "Visualization Graph IDs must be unique",
        });
      }
      graphIds.add(graph.id);
      if (graph.dataSource.kind !== "visualization_table") {
        ctx.addIssue({
          code: "custom",
          path: ["graphSpecs", index, "dataSource", "kind"],
          message: "Graph-only specifications must use a visualization-table source",
        });
      }
      if (graph.dataSource.id !== graphTableId) {
        ctx.addIssue({
          code: "custom",
          path: ["graphSpecs", index, "dataSource", "id"],
          message: "Graph-only specification must reference the persisted table",
        });
      }
      const sourceRevision = state.dataRevisions.find(({ id }) => id === graph.dataSource.revision);
      if (!sourceRevision || sourceRevision.table.id !== graph.dataSource.id) {
        ctx.addIssue({
          code: "custom",
          path: ["graphSpecs", index, "dataSource", "revision"],
          message: "Visualization Graph must reference a retained data revision",
        });
      }
      if (graph.analysisResultId !== null) {
        ctx.addIssue({
          code: "custom",
          path: ["graphSpecs", index, "analysisResultId"],
          message: "Graph-only specifications cannot contain an analysis result",
        });
      }
    });
    if (state.activeGraphId !== null && !graphIds.has(state.activeGraphId)) {
      ctx.addIssue({
        code: "custom",
        path: ["activeGraphId"],
        message: "Active Graph must reference a persisted visualization Graph",
      });
    }
    const provenanceIds = new Set<string>();
    state.provenanceEvents.forEach((event, index) => {
      if (provenanceIds.has(event.id)) {
        ctx.addIssue({
          code: "custom",
          path: ["provenanceEvents", index, "id"],
          message: "Visualization provenance event IDs must be unique",
        });
      }
      provenanceIds.add(event.id);
    });
  });

export type UnresolvedVisualizationTable = z.infer<typeof UnresolvedVisualizationTableSchema>;
export type UnresolvedVisualizationRawLineage = z.infer<
  typeof UnresolvedVisualizationRawLineageSchema
>;
export type UnresolvedVisualizationColumnMapping = z.infer<
  typeof UnresolvedVisualizationColumnMappingSchema
>;
export type UnresolvedVisualizationDataRevision = z.infer<
  typeof UnresolvedVisualizationDataRevisionSchema
>;
export type UnresolvedVisualizationIdentityDecision = z.infer<
  typeof UnresolvedVisualizationIdentityDecisionSchema
>;
export type UnresolvedVisualizationProjectState = z.infer<
  typeof UnresolvedVisualizationProjectStateSchema
>;
export type UnresolvedVisualizationProvenanceEvent = z.infer<
  typeof UnresolvedVisualizationProvenanceEventSchema
>;

export function resolveUnresolvedVisualizationIdentityDecision(
  mapping: UnresolvedVisualizationColumnMapping,
): UnresolvedVisualizationIdentityDecision {
  if (mapping.identityDecision) return mapping.identityDecision;
  return mapping.columns.some(({ role }) => role === "id") ? "selected_column" : "unanswered";
}

function migrateVisualizationIdentityDecision(mapping: unknown): unknown {
  if (!mapping || typeof mapping !== "object") return mapping;
  const record = mapping as Record<string, unknown>;
  if (record.identityDecision !== undefined) return mapping;
  const columns = Array.isArray(record.columns) ? record.columns : [];
  const hasIdColumn = columns.some(
    (column) =>
      column !== null &&
      typeof column === "object" &&
      (column as Record<string, unknown>).role === "id",
  );
  return {
    ...record,
    identityDecision: hasIdColumn ? "selected_column" : "unanswered",
  };
}

export type CreateUnresolvedVisualizationProjectStateInput = Readonly<{
  metadata: z.infer<typeof ProjectMetadataSchema>;
  entryIntent: z.infer<typeof VisualizationEntryIntentSchema>;
  table: Omit<UnresolvedVisualizationTable, "schemaVersion">;
  rawLineage: Omit<UnresolvedVisualizationRawLineage, "schemaVersion">;
  mapping?: UnresolvedVisualizationColumnMapping | null;
  graphSpecs?: readonly GraphSpec[];
  activeGraphId?: string | null;
  actor: string;
}>;

function revisionIdFor(tableId: string, ordinal: number): string {
  return `visualization.revision.${tableId}.${ordinal}`;
}

function dataRevision(input: {
  id: string;
  previousRevisionId: string | null;
  createdAt: string;
  table: Omit<UnresolvedVisualizationTable, "schemaVersion"> | UnresolvedVisualizationTable;
  rawLineage:
    Omit<UnresolvedVisualizationRawLineage, "schemaVersion"> | UnresolvedVisualizationRawLineage;
  mapping: UnresolvedVisualizationColumnMapping | null;
}): UnresolvedVisualizationDataRevision {
  return UnresolvedVisualizationDataRevisionSchema.parse({
    id: input.id,
    previousRevisionId: input.previousRevisionId,
    createdAt: input.createdAt,
    table: { ...input.table, schemaVersion: UNRESOLVED_VISUALIZATION_DATA_SCHEMA_VERSION },
    rawLineage: {
      ...input.rawLineage,
      schemaVersion: UNRESOLVED_VISUALIZATION_DATA_SCHEMA_VERSION,
    },
    mapping: input.mapping,
  });
}

const requiredStatisticsFacts = [
  "experimental unit",
  "identity and matching",
  "condition/factor assignment",
  "observation and nesting level",
] as const;

function reasonCodeForIntent(
  intent: CreateUnresolvedVisualizationProjectStateInput["entryIntent"],
): string {
  return intent === "matrix_visualization"
    ? "MATRIX_LAYOUT_DOES_NOT_ESTABLISH_EXPERIMENT_STRUCTURE"
    : "GRAPH_VALUES_DO_NOT_ESTABLISH_EXPERIMENT_STRUCTURE";
}

/** Create an unresolved graph/table state without constructing an ExperimentDesign. */
export function createUnresolvedVisualizationProjectState(
  input: CreateUnresolvedVisualizationProjectStateInput,
): UnresolvedVisualizationProjectState {
  const createdAt = input.metadata.createdAt;
  const firstRevision = dataRevision({
    id: revisionIdFor(input.table.id, 1),
    previousRevisionId: null,
    createdAt: input.rawLineage.importedAt,
    table: input.table,
    rawLineage: input.rawLineage,
    mapping: input.mapping ?? null,
  });
  const state = {
    projectKind: UNRESOLVED_VISUALIZATION_STATE_KIND,
    schemaVersion: UNRESOLVED_VISUALIZATION_STATE_SCHEMA_VERSION,
    metadata: input.metadata,
    entryIntent: input.entryIntent,
    table: firstRevision.table,
    rawLineage: firstRevision.rawLineage,
    mapping: firstRevision.mapping,
    dataRevisions: [firstRevision],
    activeDataRevisionId: firstRevision.id,
    graphSpecs: input.graphSpecs ? [...input.graphSpecs] : [],
    activeGraphId: input.activeGraphId ?? null,
    statisticsReadiness: {
      status: "unresolved" as const,
      reasonCode: reasonCodeForIntent(input.entryIntent),
      requiredFacts: [...requiredStatisticsFacts],
    },
    provenanceEvents: [
      {
        id: `provenance.${input.metadata.projectId}.visualization-created`,
        kind: "visualization_project_created" as const,
        targetId: input.metadata.projectId,
        occurredAt: createdAt,
        actor: input.actor,
        detail: "Graph-only table created without inferring an experiment structure.",
      },
      {
        id: `provenance.${input.table.id}.imported`,
        kind: "visualization_table_imported" as const,
        targetId: input.table.id,
        occurredAt: input.rawLineage.importedAt,
        actor: input.actor,
        detail: "Original table text and source lineage retained for descriptive visualization.",
      },
    ],
  };
  return UnresolvedVisualizationProjectStateSchema.parse(state);
}

/**
 * Appends a lossless table/mapping/raw revision. Existing revisions are never
 * rewritten, so Graphs created before an edit remain reproducible.
 */
export function appendUnresolvedVisualizationDataRevision(
  stateInput: UnresolvedVisualizationProjectState,
  input: Readonly<{
    table: Omit<UnresolvedVisualizationTable, "schemaVersion">;
    rawLineage: Omit<UnresolvedVisualizationRawLineage, "schemaVersion">;
    mapping: UnresolvedVisualizationColumnMapping | null;
    actor: string;
    createdAt: string;
  }>,
): UnresolvedVisualizationProjectState {
  const state = UnresolvedVisualizationProjectStateSchema.parse(stateInput);
  const active = state.dataRevisions.find(({ id }) => id === state.activeDataRevisionId)!;
  const candidate = dataRevision({
    id: revisionIdFor(state.table.id, state.dataRevisions.length + 1),
    previousRevisionId: active.id,
    createdAt: input.createdAt,
    table: input.table,
    rawLineage: input.rawLineage,
    mapping: input.mapping,
  });
  if (
    JSON.stringify(active.table) === JSON.stringify(candidate.table) &&
    JSON.stringify(active.rawLineage) === JSON.stringify(candidate.rawLineage) &&
    JSON.stringify(active.mapping) === JSON.stringify(candidate.mapping)
  ) {
    return state;
  }
  return UnresolvedVisualizationProjectStateSchema.parse({
    ...state,
    metadata: { ...state.metadata, updatedAt: input.createdAt },
    table: candidate.table,
    rawLineage: candidate.rawLineage,
    mapping: candidate.mapping,
    dataRevisions: [...state.dataRevisions, candidate],
    activeDataRevisionId: candidate.id,
    provenanceEvents: [
      ...state.provenanceEvents,
      {
        id: `provenance.${candidate.id}.revised`,
        kind: "visualization_table_revised" as const,
        targetId: candidate.id,
        occurredAt: input.createdAt,
        actor: input.actor,
        detail:
          "Visualization table, source lineage, or explicit mapping revised; prior data revision retained.",
      },
    ],
  });
}

/** Add a descriptive Graph without creating an analysis request or a biological design. */
export function appendUnresolvedVisualizationGraph(
  stateInput: UnresolvedVisualizationProjectState,
  input: Readonly<{ spec: GraphSpec; actor: string; createdAt: string }>,
): UnresolvedVisualizationProjectState {
  const state = UnresolvedVisualizationProjectStateSchema.parse(stateInput);
  const spec = GraphSpecSchema.parse(input.spec);
  if (spec.dataSource.kind !== "visualization_table" || spec.dataSource.id !== state.table.id) {
    throw new Error("GRAPH_ONLY_GRAPH_SOURCE_MISMATCH");
  }
  const sourceRevision = state.dataRevisions.find(({ id }) => id === spec.dataSource.revision);
  if (!sourceRevision || sourceRevision.table.id !== spec.dataSource.id) {
    throw new Error("GRAPH_ONLY_GRAPH_REVISION_MISMATCH");
  }
  if (spec.analysisResultId !== null) throw new Error("GRAPH_ONLY_ANALYSIS_RESULT_FORBIDDEN");
  if (state.graphSpecs.some(({ id }) => id === spec.id)) {
    throw new Error(`Visualization Graph ${spec.id} already exists`);
  }
  return UnresolvedVisualizationProjectStateSchema.parse({
    ...state,
    metadata: { ...state.metadata, updatedAt: input.createdAt },
    graphSpecs: [...state.graphSpecs, spec],
    activeGraphId: spec.id,
    provenanceEvents: [
      ...state.provenanceEvents,
      {
        id: `provenance.${spec.id}.created`,
        kind: "visualization_graph_created" as const,
        targetId: spec.id,
        occurredAt: input.createdAt,
        actor: input.actor,
        detail: "Descriptive Graph specification created from the unresolved table.",
      },
    ],
  });
}

/**
 * Migrate only the explicitly versioned graph-only state. Unknown versions are
 * returned unchanged so callers fail closed rather than guessing a structure.
 */
export function migrateUnresolvedVisualizationProjectState(input: unknown): unknown {
  if (!input || typeof input !== "object") return input;
  const record = input as Record<string, unknown>;
  if (
    record.projectKind === UNRESOLVED_VISUALIZATION_STATE_KIND &&
    (record.schemaVersion === "0.0.0" || record.schemaVersion === "0.1.0")
  ) {
    const entryIntent =
      record.entryIntent === "matrix_visualization" || record.entryIntent === "graph_only"
        ? record.entryIntent
        : null;
    const metadata = record.metadata as { projectId?: string } | undefined;
    const table = (record.table ?? record.rawTable) as Record<string, unknown> | undefined;
    const rawLineage = record.rawLineage as Record<string, unknown> | undefined;
    if (!entryIntent || !metadata || !table || !rawLineage) return input;
    const migratedRecord = { ...record };
    delete migratedRecord.rawTable;
    delete migratedRecord.dataRevisions;
    delete migratedRecord.activeDataRevisionId;
    const normalizedTable = {
      ...table,
      schemaVersion: UNRESOLVED_VISUALIZATION_DATA_SCHEMA_VERSION,
    };
    const normalizedRawLineage = {
      ...rawLineage,
      schemaVersion: UNRESOLVED_VISUALIZATION_DATA_SCHEMA_VERSION,
    };
    const normalizedMapping =
      record.mapping === null || record.mapping === undefined
        ? null
        : migrateVisualizationIdentityDecision({
            ...(record.mapping as Record<string, unknown>),
            schemaVersion: UNRESOLVED_VISUALIZATION_DATA_SCHEMA_VERSION,
          });
    const tableId = table.id;
    const importedAt = rawLineage.importedAt;
    if (typeof tableId !== "string" || typeof importedAt !== "string") return input;
    const firstRevision = {
      id: revisionIdFor(tableId, 1),
      previousRevisionId: null,
      createdAt: importedAt,
      table: normalizedTable,
      rawLineage: normalizedRawLineage,
      mapping: normalizedMapping,
    };
    const graphSpecs = Array.isArray(record.graphSpecs)
      ? record.graphSpecs.map((graph) => {
          if (!graph || typeof graph !== "object") return graph;
          const graphRecord = graph as Record<string, unknown>;
          const source = graphRecord.dataSource;
          if (!source || typeof source !== "object") return graph;
          const sourceRecord = source as Record<string, unknown>;
          if (sourceRecord.kind !== "visualization_table") return graph;
          return {
            ...graphRecord,
            dataSource: { ...sourceRecord, revision: firstRevision.id },
          };
        })
      : [];
    return {
      ...migratedRecord,
      schemaVersion: UNRESOLVED_VISUALIZATION_STATE_SCHEMA_VERSION,
      entryIntent,
      table: normalizedTable,
      rawLineage: normalizedRawLineage,
      mapping: normalizedMapping,
      dataRevisions: [firstRevision],
      activeDataRevisionId: firstRevision.id,
      graphSpecs,
      activeGraphId: record.activeGraphId ?? null,
      statisticsReadiness: record.statisticsReadiness ?? {
        status: "unresolved",
        reasonCode: reasonCodeForIntent(entryIntent),
        requiredFacts: [...requiredStatisticsFacts],
      },
      provenanceEvents: record.provenanceEvents ?? [
        {
          id: `provenance.${metadata.projectId ?? "unknown"}.visualization-migrated`,
          kind: "visualization_project_created",
          targetId: metadata.projectId ?? "project.visualization.migrated",
          occurredAt: importedAt,
          actor: "migration",
          detail: "Migrated graph-only state; no experiment structure was inferred.",
        },
      ],
    };
  }
  if (
    record.projectKind === UNRESOLVED_VISUALIZATION_STATE_KIND &&
    record.schemaVersion === UNRESOLVED_VISUALIZATION_STATE_SCHEMA_VERSION
  ) {
    const revisions = Array.isArray(record.dataRevisions)
      ? record.dataRevisions.map((revision) => {
          if (!revision || typeof revision !== "object") return revision;
          const revisionRecord = revision as Record<string, unknown>;
          return {
            ...revisionRecord,
            mapping:
              revisionRecord.mapping === null || revisionRecord.mapping === undefined
                ? null
                : migrateVisualizationIdentityDecision(revisionRecord.mapping),
          };
        })
      : record.dataRevisions;
    return {
      ...record,
      mapping:
        record.mapping === null || record.mapping === undefined
          ? null
          : migrateVisualizationIdentityDecision(record.mapping),
      dataRevisions: revisions,
    };
  }
  return input;
}

export function parseUnresolvedVisualizationProjectState(
  input: unknown,
): UnresolvedVisualizationProjectState {
  return UnresolvedVisualizationProjectStateSchema.parse(
    migrateUnresolvedVisualizationProjectState(input),
  );
}

export function serializeUnresolvedVisualizationProjectState(
  stateInput: UnresolvedVisualizationProjectState,
): Uint8Array {
  const state = UnresolvedVisualizationProjectStateSchema.parse(stateInput);
  return new TextEncoder().encode(`${JSON.stringify(state, null, 2)}\n`);
}

export function deserializeUnresolvedVisualizationProjectState(
  data: Uint8Array,
): UnresolvedVisualizationProjectState {
  const text = new TextDecoder("utf-8", { fatal: true }).decode(data);
  return parseUnresolvedVisualizationProjectState(JSON.parse(text));
}

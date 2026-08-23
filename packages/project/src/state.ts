import { z } from "zod";
import {
  AnalysisEngineRequestSchema,
  AnalysisEngineResultSchema,
  AnalysisRecommendationSchema,
} from "@lsaa/analysis-contracts";
import {
  EntityIdSchema,
  DerivedDatasetRevisionSchema,
  DerivedScalarValueSchema,
  ExperimentDesignSchema,
  IsoDateTimeSchema,
  ObservationSchema,
  ProjectMetadataSchema,
  RawDatasetRevisionSchema,
  TransformationSpecSchema,
  UnitInstanceSchema,
  measurementNumericValue,
  type Observation,
  type DerivedDatasetRevision,
  type DerivedScalarValue,
  type ProjectMetadata,
  type RawDatasetRevision,
  type TransformationSpec,
  type UnitInstance,
  type ExperimentDesign,
} from "@lsaa/domain";
import { GraphSpecSchema, type GraphSpec } from "@lsaa/graph-spec";

export const PROJECT_STATE_SCHEMA_VERSION = "0.3.0" as const;

function numericallyEquivalent(first: number, second: number): boolean {
  if (Object.is(first, second)) return true;
  if (!Number.isFinite(first) || !Number.isFinite(second)) return false;
  const scale = Math.max(1, Math.abs(first), Math.abs(second));
  return Math.abs(first - second) <= Number.EPSILON * scale * 16;
}

export const ExperimentWorkspaceStateSchema = z
  .object({
    version: z.literal("0.1.0"),
    dataOrigin: z.enum(["research", "synthetic_demo"]).default("research"),
    context: z.enum([
      "cell_culture",
      "microscopy_imaging",
      "protein_biochemical",
      "animal",
      "general_assay",
      "existing_data",
    ]),
    entryRoute: z.string().min(1).optional(),
    readoutDefinitions: z
      .array(
        z.object({
          id: EntityIdSchema,
          label: z.string().min(1),
          shape: z.enum(["proportion", "nested_continuous", "categorical_counts", "wb_ratio"]),
          unit: z.string().optional(),
          categories: z
            .array(z.object({ id: EntityIdSchema, label: z.string().min(1) }))
            .optional(),
          referenceLabel: z.string().min(1).optional(),
          wbInputMode: z.enum(["corrected_value", "imagej_mean_background_area"]).optional(),
          nestedInputMode: z.enum(["unit_summary", "nested_observations"]).optional(),
          withinExperimentNormalization: z
            .object({
              method: z.enum(["control_equals_one", "per_unit_maximum"]),
              baselineConditionId: EntityIdSchema.optional(),
            })
            .optional(),
        }),
      )
      .default([]),
    conditionAttributes: z.array(z.object({ id: EntityIdSchema, label: z.string().min(1) })),
    conditions: z
      .array(
        z.object({
          id: EntityIdSchema,
          label: z.string().min(1),
          attributes: z.record(EntityIdSchema, z.string()),
        }),
      )
      .min(2),
    controlConditionId: EntityIdSchema.optional(),
    analysisIntent: z
      .discriminatedUnion("kind", [
        z.object({ kind: z.literal("group_comparison") }),
        z.object({
          kind: z.literal("correlation"),
          relationshipForm: z.enum(["linear", "monotonic_or_ranked"]),
        }),
      ])
      .default({ kind: "group_comparison" }),
    conditionAssignment: z
      .object({
        kind: z.enum(["independent", "matched"]),
        unitLabel: z.string().min(1),
      })
      .default({ kind: "independent", unitLabel: "実験単位" }),
    timePlan: z.object({
      sampling: z.enum(["none", "cross_sectional", "longitudinal"]),
      unit: z.enum(["sec", "min", "h", "day"]),
      points: z.array(z.object({ id: EntityIdSchema, value: z.number().finite() })),
      axisSemantic: z.enum(["time", "numeric_covariate"]).optional(),
      axisTitle: z.string().min(1).optional(),
      axisUnit: z.string().optional(),
    }),
    experimentSessions: z
      .array(
        z.object({
          id: EntityIdSchema,
          label: z.string().min(1),
          sessionId: EntityIdSchema.optional(),
          stableUnitId: EntityIdSchema.optional(),
          date: z.iso.date().or(z.literal("")),
          note: z.string(),
        }),
      )
      .min(1),
    importProvenance: z
      .object({
        sourceLabel: z.string().min(1),
        importedAt: IsoDateTimeSchema,
        headers: z.array(z.string()),
        sourceRows: z.array(z.array(z.string())),
        mapping: z.record(z.string(), z.union([z.string(), z.number(), z.null()])),
        excludedRowNumbers: z.array(z.number().int().positive()),
        duplicateDecision: z.enum(["none", "nested_observations"]),
        transformations: z.array(z.string()).optional(),
      })
      .optional(),
    notPlannedCellKeys: z.array(z.string().min(1)).default([]),
    graphs: z.array(
      z.object({
        id: EntityIdSchema,
        displayName: z.string().min(1),
        analysisRunId: EntityIdSchema.nullable().default(null),
        selectedReadoutId: EntityIdSchema,
        sourceMode: z.enum(["raw_readout", "derived_metric"]).optional(),
        selectedConditionIds: z.array(EntityIdSchema),
        selectedTimePointIds: z.array(EntityIdSchema),
        analysisTimePointId: EntityIdSchema.nullable().optional(),
        analysisMetric: z
          .object({
            kind: z.enum([
              "selected_timepoint",
              "full_time_course",
              "endpoint",
              "maximum",
              "minimum",
              "auc",
              "change_from_baseline",
              "f_over_f0",
            ]),
            windowStart: z.number().finite().optional(),
            windowEnd: z.number().finite().optional(),
            baselineTime: z.number().finite().optional(),
          })
          .optional(),
        graphType: z
          .enum([
            "dot",
            "paired_dot",
            "box",
            "violin",
            "bar",
            "line",
            "scatter",
            "stacked",
            "stacked_100",
            "category_percentage",
          ])
          .default("dot"),
        layers: z.object({
          raw: z.boolean(),
          distribution: z.boolean().default(false),
          experiment: z.boolean(),
          overall: z.boolean(),
          violin: z.boolean().default(false),
          box: z.boolean().default(false),
          errorBar: z.boolean().default(true),
          connectingLine: z.boolean().default(false),
        }),
        appearance: z.object({
          errorBar: z.enum(["sd", "sem", "none"]),
          palette: z
            .enum(["single", "condition", "grayscale", "colorblind", "publication"])
            .default("single"),
          pointSize: z.number().min(4).max(10),
          axisLineWidth: z.number().min(0.8).max(2.4),
          hierarchicalLabels: z.boolean(),
          jitter: z.number().min(0).max(24).default(12),
          fontFamily: z.enum(["arial", "helvetica", "system"]).default("arial"),
          graphTitleFontSize: z.number().min(12).max(32).default(20),
          axisTitleFontSize: z.number().min(10).max(28).default(19),
          tickFontSize: z.number().min(9).max(24).default(17),
          hierarchyFontSize: z.number().min(9).max(24).default(17),
          legendFontSize: z.number().min(9).max(24).default(16),
          legendPosition: z.enum(["hidden", "top", "right", "inside"]).default("hidden"),
          seriesColors: z.record(EntityIdSchema, z.string()).default({}),
          rawPointColor: z.string().default("#8a96a3"),
          summaryColor: z.string().default("#111111"),
          errorBarColor: z.string().default("#111111"),
          connectingLineColor: z.string().default("#4b5563"),
          summaryLineWidth: z.number().min(0.6).max(4).default(2),
          errorBarLineWidth: z.number().min(0.6).max(4).default(1.5),
          connectingLineWidth: z.number().min(0.6).max(4).default(1.5),
          distributionLineWidth: z.number().min(0.6).max(4).default(1.2),
          canvasPreset: z.enum(["compact", "standard", "wide"]).default("standard"),
          sidePadding: z.number().min(56).max(180).default(72),
        }),
        axes: z
          .object({
            xSemantic: z.enum(["categorical", "time", "numeric_covariate"]).default("categorical"),
            xTitle: z.string().default(""),
            xUnit: z.string().default(""),
            yTitle: z.string(),
            yRangeMode: z.enum(["auto", "manual"]),
            yMin: z.number().finite().nullable(),
            yMax: z.number().finite().nullable(),
            yScale: z.enum(["linear", "log10"]),
            showCategoryLabels: z.boolean(),
            hierarchyOrder: z.array(EntityIdSchema),
            spacing: z.number().min(0.7).max(1.6),
            yTickMode: z.enum(["auto", "manual"]).default("auto"),
            yTickInterval: z.number().positive().nullable().default(null),
          })
          .default({
            xSemantic: "categorical",
            xTitle: "",
            xUnit: "",
            yTitle: "",
            yRangeMode: "auto",
            yMin: null,
            yMax: null,
            yScale: "linear",
            showCategoryLabels: true,
            hierarchyOrder: [],
            spacing: 1,
            yTickMode: "auto",
            yTickInterval: null,
          }),
        statisticsAnnotation: z
          .object({
            mode: z.enum(["hidden", "exact_p", "symbol"]),
            testIndex: z.number().int().min(0),
          })
          .optional(),
      }),
    ),
  })
  .superRefine((workspace, ctx) => {
    if (
      workspace.controlConditionId &&
      !workspace.conditions.some(({ id }) => id === workspace.controlConditionId)
    ) {
      ctx.addIssue({
        code: "custom",
        path: ["controlConditionId"],
        message: "The explicit control condition must reference a persisted condition",
      });
    }
  });

export const DesignRevisionSchema = z.object({
  id: EntityIdSchema,
  previousRevisionId: EntityIdSchema.nullable(),
  design: ExperimentDesignSchema,
  createdAt: IsoDateTimeSchema,
  createdBy: z.string().min(1),
});

export const PersistedAnalysisRunSchema = z.object({
  id: EntityIdSchema,
  inputDesignRevisionId: EntityIdSchema,
  inputRawRevisionId: EntityIdSchema,
  inputDerivedDatasetRevisionId: EntityIdSchema.nullable().default(null),
  recommendation: AnalysisRecommendationSchema,
  request: AnalysisEngineRequestSchema,
  result: AnalysisEngineResultSchema,
  state: z.enum(["current", "stale"]),
  staleReason: z.string().min(1).nullable(),
});

export const PersistedGraphSchema = z.object({
  id: EntityIdSchema,
  spec: GraphSpecSchema,
  sourceAnalysisRunId: EntityIdSchema,
  state: z.enum(["current", "stale"]),
  staleReason: z.string().min(1).nullable(),
});

export const ProvenanceEventSchema = z.object({
  id: EntityIdSchema,
  kind: z.enum([
    "project_created",
    "design_revision_created",
    "raw_revision_created",
    "analysis_executed",
    "analysis_marked_stale",
    "transformation_created",
    "derived_dataset_created",
  ]),
  targetId: EntityIdSchema,
  occurredAt: IsoDateTimeSchema,
  actor: z.string().min(1),
  detail: z.string().min(1),
});

function validateRevisionLinks(
  revisions: ReadonlyArray<{ id: string; previousRevisionId: string | null }>,
  path: "designRevisions" | "rawRevisions" | "derivedDatasetRevisions",
  ctx: z.RefinementCtx,
) {
  const indexesById = new Map<string, number>();
  revisions.forEach((revision, index) => {
    if (indexesById.has(revision.id)) {
      ctx.addIssue({
        code: "custom",
        path: [path, index, "id"],
        message: "Revision IDs must be unique within their history",
      });
    } else {
      indexesById.set(revision.id, index);
    }
  });
  revisions.forEach((revision, index) => {
    if (revision.previousRevisionId === null) return;
    if (!indexesById.has(revision.previousRevisionId)) {
      ctx.addIssue({
        code: "custom",
        path: [path, index, "previousRevisionId"],
        message: "Previous revision must reference a persisted revision",
      });
      return;
    }
    const visited = new Set<string>([revision.id]);
    let previousId: string | null = revision.previousRevisionId;
    while (previousId !== null) {
      if (visited.has(previousId)) {
        ctx.addIssue({
          code: "custom",
          path: [path, index, "previousRevisionId"],
          message: "Revision history must not contain a cycle",
        });
        return;
      }
      visited.add(previousId);
      const previousIndex = indexesById.get(previousId);
      if (previousIndex === undefined) return;
      previousId = revisions[previousIndex].previousRevisionId;
    }
  });
}

export const ProjectStateSchema = z
  .object({
    schemaVersion: z.literal(PROJECT_STATE_SCHEMA_VERSION),
    metadata: ProjectMetadataSchema,
    designRevisions: z.array(DesignRevisionSchema).min(1),
    activeDesignRevisionId: EntityIdSchema,
    rawRevisions: z.array(RawDatasetRevisionSchema).min(1),
    activeRawRevisionId: EntityIdSchema,
    unitInstances: z.array(UnitInstanceSchema),
    observations: z.array(ObservationSchema),
    transformations: z.array(TransformationSpecSchema).default([]),
    derivedDatasetRevisions: z.array(DerivedDatasetRevisionSchema).default([]),
    derivedValues: z.array(DerivedScalarValueSchema).default([]),
    analysisRuns: z.array(PersistedAnalysisRunSchema),
    graphs: z.array(PersistedGraphSchema),
    experimentWorkspace: ExperimentWorkspaceStateSchema.nullable().default(null),
    provenanceEvents: z.array(ProvenanceEventSchema).min(1),
  })
  .superRefine((state, ctx) => {
    validateRevisionLinks(state.designRevisions, "designRevisions", ctx);
    validateRevisionLinks(state.rawRevisions, "rawRevisions", ctx);
    validateRevisionLinks(state.derivedDatasetRevisions, "derivedDatasetRevisions", ctx);
    const designIds = new Set(state.designRevisions.map((revision) => revision.id));
    if (!designIds.has(state.activeDesignRevisionId)) {
      ctx.addIssue({
        code: "custom",
        path: ["activeDesignRevisionId"],
        message: "Active design revision must reference a persisted revision",
      });
    }

    const rawIds = new Set(state.rawRevisions.map((revision) => revision.id));
    if (!rawIds.has(state.activeRawRevisionId)) {
      ctx.addIssue({
        code: "custom",
        path: ["activeRawRevisionId"],
        message: "Active raw revision must reference a persisted revision",
      });
    }
    const unitIds = new Set<string>();
    const unitLevelById = new Map(
      state.designRevisions
        .flatMap((revision) => revision.design.unitLevels)
        .map((level) => [level.id, level]),
    );
    state.unitInstances.forEach((unit, index) => {
      if (unitIds.has(unit.id)) {
        ctx.addIssue({
          code: "custom",
          path: ["unitInstances", index, "id"],
          message: "Unit instance IDs must be unique across project history",
        });
      }
      unitIds.add(unit.id);
      if (!unitLevelById.has(unit.levelId)) {
        ctx.addIssue({
          code: "custom",
          path: ["unitInstances", index, "levelId"],
          message: "Unit instance level must be declared by a persisted design revision",
        });
      }
    });
    const unitById = new Map(state.unitInstances.map((unit) => [unit.id, unit]));
    state.unitInstances.forEach((unit, index) => {
      const level = unitLevelById.get(unit.levelId);
      if (unit.parentUnitId === null) {
        if (level?.parentLevelId !== null) {
          ctx.addIssue({
            code: "custom",
            path: ["unitInstances", index, "parentUnitId"],
            message: "A nested unit must reference a parent unit instance",
          });
        }
        return;
      }
      const parent = unitById.get(unit.parentUnitId);
      if (!parent || parent.levelId !== level?.parentLevelId) {
        ctx.addIssue({
          code: "custom",
          path: ["unitInstances", index, "parentUnitId"],
          message: "Unit parent must match the parent level declared by the design",
        });
      }
    });
    const observationKeys = new Set<string>();
    state.observations.forEach((observation, index) => {
      if (!rawIds.has(observation.rawRevisionId)) {
        ctx.addIssue({
          code: "custom",
          path: ["observations", index, "rawRevisionId"],
          message: "Observation references an unknown raw revision",
        });
      }
      if (!unitIds.has(observation.unitInstanceId)) {
        ctx.addIssue({
          code: "custom",
          path: ["observations", index, "unitInstanceId"],
          message: "Observation references an unknown unit instance",
        });
      }
      const observationKey = `${observation.rawRevisionId}\u0000${observation.id}`;
      if (observationKeys.has(observationKey)) {
        ctx.addIssue({
          code: "custom",
          path: ["observations", index, "id"],
          message: "Observation IDs must be unique within a raw revision",
        });
      }
      observationKeys.add(observationKey);
    });

    const transformationIds = new Set<string>();
    state.transformations.forEach((transformation, index) => {
      if (transformationIds.has(transformation.id)) {
        ctx.addIssue({
          code: "custom",
          path: ["transformations", index, "id"],
          message: "Transformation IDs must be unique across project history",
        });
      }
      transformationIds.add(transformation.id);
      transformation.inputRevisionIds.forEach((revisionId, revisionIndex) => {
        if (!rawIds.has(revisionId)) {
          ctx.addIssue({
            code: "custom",
            path: ["transformations", index, "inputRevisionIds", revisionIndex],
            message: "Transformation references an unknown raw revision",
          });
        }
      });
    });

    const transformationById = new Map(
      state.transformations.map((transformation) => [transformation.id, transformation]),
    );
    const derivedRevisionById = new Map<string, (typeof state.derivedDatasetRevisions)[number]>();
    state.derivedDatasetRevisions.forEach((revision, index) => {
      if (derivedRevisionById.has(revision.id)) {
        ctx.addIssue({
          code: "custom",
          path: ["derivedDatasetRevisions", index, "id"],
          message: "Derived dataset revision IDs must be unique",
        });
      }
      derivedRevisionById.set(revision.id, revision);
      if (!rawIds.has(revision.sourceRawRevisionId)) {
        ctx.addIssue({
          code: "custom",
          path: ["derivedDatasetRevisions", index, "sourceRawRevisionId"],
          message: "Derived dataset references an unknown source raw revision",
        });
      }
      if (!transformationById.has(revision.transformationId)) {
        ctx.addIssue({
          code: "custom",
          path: ["derivedDatasetRevisions", index, "transformationId"],
          message: "Derived dataset references an unknown transformation",
        });
      }
      const transformation = transformationById.get(revision.transformationId);
      if (
        transformation &&
        !transformation.inputRevisionIds.includes(revision.sourceRawRevisionId)
      ) {
        ctx.addIssue({
          code: "custom",
          path: ["derivedDatasetRevisions", index, "transformationId"],
          message: "Derived dataset transformation must declare its source raw revision",
        });
      }
    });

    const sourceObservationById = new Map(
      state.observations.map((observation) => [
        `${observation.rawRevisionId}\u0000${observation.id}`,
        observation,
      ]),
    );
    const derivedValueIds = new Set<string>();
    state.derivedValues.forEach((value, index) => {
      if (derivedValueIds.has(value.id)) {
        ctx.addIssue({
          code: "custom",
          path: ["derivedValues", index, "id"],
          message: "Derived value IDs must be unique",
        });
      }
      derivedValueIds.add(value.id);
      const revision = derivedRevisionById.get(value.derivedDatasetRevisionId);
      if (!revision) {
        ctx.addIssue({
          code: "custom",
          path: ["derivedValues", index, "derivedDatasetRevisionId"],
          message: "Derived value references an unknown derived dataset revision",
        });
        return;
      }
      if (value.outcomeId !== revision.outcomeId) {
        ctx.addIssue({
          code: "custom",
          path: ["derivedValues", index, "outcomeId"],
          message: "Derived value outcome must match its dataset revision",
        });
      }
      if (value.subsampleCount !== value.sourceObservationIds.length) {
        ctx.addIssue({
          code: "custom",
          path: ["derivedValues", index, "subsampleCount"],
          message: "Derived subsample count must equal the source-observation count",
        });
      }
      if (value.subsampleCount !== value.sourceUnitIds.length) {
        ctx.addIssue({
          code: "custom",
          path: ["derivedValues", index, "sourceUnitIds"],
          message: "Derived subsample count must equal the source-unit count",
        });
      }
      value.sourceObservationIds.forEach((observationId, sourceIndex) => {
        const source = sourceObservationById.get(
          `${revision.sourceRawRevisionId}\u0000${observationId}`,
        );
        if (!source || source.outcomeId !== value.outcomeId) {
          ctx.addIssue({
            code: "custom",
            path: ["derivedValues", index, "sourceObservationIds", sourceIndex],
            message:
              "Derived lineage must reference a source observation in the declared raw revision and outcome",
          });
        }
        if (source && source.unitInstanceId !== value.sourceUnitIds[sourceIndex]) {
          ctx.addIssue({
            code: "custom",
            path: ["derivedValues", index, "sourceUnitIds", sourceIndex],
            message: "Derived source unit must match the corresponding source observation",
          });
        }
      });
      value.sourceUnitIds.forEach((unitId, sourceIndex) => {
        if (!unitIds.has(unitId)) {
          ctx.addIssue({
            code: "custom",
            path: ["derivedValues", index, "sourceUnitIds", sourceIndex],
            message: "Derived lineage references an unknown source unit",
          });
        }
      });
    });

    state.analysisRuns.forEach((run, index) => {
      if (!designIds.has(run.inputDesignRevisionId)) {
        ctx.addIssue({
          code: "custom",
          path: ["analysisRuns", index, "inputDesignRevisionId"],
          message: "Analysis run references an unknown design revision",
        });
      }
      if (!rawIds.has(run.inputRawRevisionId)) {
        ctx.addIssue({
          code: "custom",
          path: ["analysisRuns", index, "inputRawRevisionId"],
          message: "Analysis run references an unknown raw revision",
        });
      }
      if (run.request.projectId !== state.metadata.projectId) {
        ctx.addIssue({
          code: "custom",
          path: ["analysisRuns", index, "request", "projectId"],
          message: "Analysis request project ID must match project metadata",
        });
      }
      if (run.result.requestId !== run.request.requestId) {
        ctx.addIssue({
          code: "custom",
          path: ["analysisRuns", index, "result", "requestId"],
          message: "Analysis result must identify the executed request",
        });
      }
      if (run.result.protocolVersion !== run.request.protocolVersion) {
        ctx.addIssue({
          code: "custom",
          path: ["analysisRuns", index, "result", "protocolVersion"],
          message: "Analysis result protocol must match its executed request protocol",
        });
      }
      const persistedRawById = new Map(
        state.observations
          .filter((observation) => observation.rawRevisionId === run.inputRawRevisionId)
          .map((observation) => [observation.id, observation]),
      );
      const persistedDerivedById = new Map(
        state.derivedValues
          .filter(
            (value) =>
              run.inputDerivedDatasetRevisionId !== null &&
              value.derivedDatasetRevisionId === run.inputDerivedDatasetRevisionId,
          )
          .map((value) => [value.id, value]),
      );
      if (
        run.inputDerivedDatasetRevisionId !== null &&
        !derivedRevisionById.has(run.inputDerivedDatasetRevisionId)
      ) {
        ctx.addIssue({
          code: "custom",
          path: ["analysisRuns", index, "inputDerivedDatasetRevisionId"],
          message: "Analysis run references an unknown derived dataset revision",
        });
      }
      run.request.observations.forEach((engineObservation, observationIndex) => {
        const raw = persistedRawById.get(engineObservation.observationId);
        const derived = persistedDerivedById.get(engineObservation.observationId);
        const matchesRaw =
          run.inputDerivedDatasetRevisionId === null &&
          raw !== undefined &&
          raw.conditionId === engineObservation.conditionId &&
          raw.unitInstanceId === engineObservation.experimentalUnitId &&
          numericallyEquivalent(measurementNumericValue(raw.measurement), engineObservation.value);
        const matchesDerived =
          run.inputDerivedDatasetRevisionId !== null &&
          derived !== undefined &&
          derived.conditionId === engineObservation.conditionId &&
          derived.experimentalUnitId === engineObservation.experimentalUnitId &&
          numericallyEquivalent(derived.value, engineObservation.value);
        if (!matchesRaw && !matchesDerived) {
          ctx.addIssue({
            code: "custom",
            path: ["analysisRuns", index, "request", "observations", observationIndex],
            message:
              "Executed analysis input must reproduce from its declared raw or derived dataset",
          });
        }
      });
      if (run.state === "current" && run.inputRawRevisionId !== state.activeRawRevisionId) {
        ctx.addIssue({
          code: "custom",
          path: ["analysisRuns", index, "state"],
          message: "An analysis of an older raw revision cannot be current",
        });
      }
      if (
        run.state === "current" &&
        run.inputDerivedDatasetRevisionId !== null &&
        derivedRevisionById.get(run.inputDerivedDatasetRevisionId)?.state !== "current"
      ) {
        ctx.addIssue({
          code: "custom",
          path: ["analysisRuns", index, "state"],
          message: "An analysis of a stale derived dataset cannot be current",
        });
      }
    });
    const analysisById = new Map(state.analysisRuns.map((run) => [run.id, run]));
    state.graphs.forEach((graph, index) => {
      const sourceRun = analysisById.get(graph.sourceAnalysisRunId);
      if (!sourceRun) {
        ctx.addIssue({
          code: "custom",
          path: ["graphs", index, "sourceAnalysisRunId"],
          message: "Graph references an unknown analysis run",
        });
      }
      if (graph.state === "current" && sourceRun?.state !== "current") {
        ctx.addIssue({
          code: "custom",
          path: ["graphs", index, "state"],
          message: "A graph from a stale analysis cannot be current",
        });
      }
    });

    if (state.experimentWorkspace) {
      const workspace = state.experimentWorkspace;
      const activeDesign = state.designRevisions.find(
        (revision) => revision.id === state.activeDesignRevisionId,
      )?.design;
      const conditionIds = new Set(activeDesign?.conditions.map(({ id }) => id) ?? []);
      const outcomeIds = new Set(activeDesign?.outcomes.map(({ id }) => id) ?? []);
      const timePointIds = new Set(workspace.timePlan.points.map(({ id }) => id));
      const workspaceConditionIds = new Set<string>();
      workspace.conditions.forEach((condition, index) => {
        if (workspaceConditionIds.has(condition.id)) {
          ctx.addIssue({
            code: "custom",
            path: ["experimentWorkspace", "conditions", index, "id"],
            message: "Workspace condition IDs must be unique",
          });
        }
        workspaceConditionIds.add(condition.id);
        if (!conditionIds.has(condition.id)) {
          ctx.addIssue({
            code: "custom",
            path: ["experimentWorkspace", "conditions", index, "id"],
            message: "Workspace conditions must exist in the active design",
          });
        }
      });
      const experimentIds = new Set<string>();
      workspace.experimentSessions.forEach((experiment, index) => {
        if (experimentIds.has(experiment.id)) {
          ctx.addIssue({
            code: "custom",
            path: ["experimentWorkspace", "experimentSessions", index, "id"],
            message: "Workspace experiment-session IDs must be unique",
          });
        }
        experimentIds.add(experiment.id);
      });
      const notPlannedKeys = new Set<string>();
      workspace.notPlannedCellKeys.forEach((key, index) => {
        if (notPlannedKeys.has(key)) {
          ctx.addIssue({
            code: "custom",
            path: ["experimentWorkspace", "notPlannedCellKeys", index],
            message: "Not-planned workspace cell keys must be unique",
          });
        }
        notPlannedKeys.add(key);
        const [experimentId, conditionId, timePointId, outcomeId, ...extra] = key.split("::");
        if (
          extra.length > 0 ||
          !experimentIds.has(experimentId) ||
          !workspaceConditionIds.has(conditionId) ||
          (timePointId !== "time.none" && !timePointIds.has(timePointId)) ||
          !outcomeIds.has(outcomeId)
        ) {
          ctx.addIssue({
            code: "custom",
            path: ["experimentWorkspace", "notPlannedCellKeys", index],
            message: "Not-planned workspace cell must reference the persisted workspace design",
          });
        }
      });
      const graphIds = new Set<string>();
      workspace.graphs.forEach((graph, index) => {
        if (graphIds.has(graph.id)) {
          ctx.addIssue({
            code: "custom",
            path: ["experimentWorkspace", "graphs", index, "id"],
            message: "Workspace graph IDs must be unique",
          });
        }
        graphIds.add(graph.id);
        if (graph.analysisRunId && !analysisById.has(graph.analysisRunId)) {
          ctx.addIssue({
            code: "custom",
            path: ["experimentWorkspace", "graphs", index, "analysisRunId"],
            message: "Workspace graph analysis must reference a persisted analysis run",
          });
        }
        if (!outcomeIds.has(graph.selectedReadoutId)) {
          ctx.addIssue({
            code: "custom",
            path: ["experimentWorkspace", "graphs", index, "selectedReadoutId"],
            message: "Workspace graph readout must exist in the active design",
          });
        }
        graph.selectedConditionIds.forEach((conditionId, conditionIndex) => {
          if (!workspaceConditionIds.has(conditionId)) {
            ctx.addIssue({
              code: "custom",
              path: [
                "experimentWorkspace",
                "graphs",
                index,
                "selectedConditionIds",
                conditionIndex,
              ],
              message: "Workspace graph condition must exist in the workspace design",
            });
          }
        });
        graph.selectedTimePointIds.forEach((timePointId, timeIndex) => {
          if (!timePointIds.has(timePointId)) {
            ctx.addIssue({
              code: "custom",
              path: ["experimentWorkspace", "graphs", index, "selectedTimePointIds", timeIndex],
              message: "Workspace graph time point must exist in the workspace design",
            });
          }
        });
      });
    }
  });

export type ProjectState = z.infer<typeof ProjectStateSchema>;
export type ExperimentWorkspaceState = z.infer<typeof ExperimentWorkspaceStateSchema>;

export function migrateProjectState(input: unknown): unknown {
  if (!input || typeof input !== "object") return input;
  const record = input as Record<string, unknown>;
  if (record.schemaVersion === "0.2.0") {
    return {
      ...record,
      schemaVersion: PROJECT_STATE_SCHEMA_VERSION,
      experimentWorkspace: null,
    };
  }
  return input;
}

export type CreateInitialProjectStateInput = {
  metadata: ProjectMetadata;
  design: ExperimentDesign;
  rawRevision: RawDatasetRevision;
  unitInstances: UnitInstance[];
  observations: Observation[];
  transformations?: TransformationSpec[];
  derivedDatasetRevisions?: DerivedDatasetRevision[];
  derivedValues?: DerivedScalarValue[];
  actor: string;
  analysis?: {
    recommendation: z.infer<typeof AnalysisRecommendationSchema>;
    request: z.infer<typeof AnalysisEngineRequestSchema>;
    result: z.infer<typeof AnalysisEngineResultSchema>;
    graphSpec: GraphSpec | null;
    inputDerivedDatasetRevisionId?: string | null;
  };
};

export function createInitialProjectState(input: CreateInitialProjectStateInput): ProjectState {
  const createdAt = input.metadata.createdAt;
  const designRevisionId = `design-revision.${input.design.id}.1`;
  const analysisRunId = input.analysis ? `analysis-run.${input.analysis.request.requestId}` : null;
  return ProjectStateSchema.parse({
    schemaVersion: PROJECT_STATE_SCHEMA_VERSION,
    metadata: input.metadata,
    designRevisions: [
      {
        id: designRevisionId,
        previousRevisionId: null,
        design: input.design,
        createdAt,
        createdBy: input.actor,
      },
    ],
    activeDesignRevisionId: designRevisionId,
    rawRevisions: [input.rawRevision],
    activeRawRevisionId: input.rawRevision.id,
    unitInstances: input.unitInstances,
    observations: input.observations,
    transformations: input.transformations ?? [],
    derivedDatasetRevisions: input.derivedDatasetRevisions ?? [],
    derivedValues: input.derivedValues ?? [],
    analysisRuns: input.analysis
      ? [
          {
            id: analysisRunId,
            inputDesignRevisionId: designRevisionId,
            inputRawRevisionId: input.rawRevision.id,
            inputDerivedDatasetRevisionId: input.analysis.inputDerivedDatasetRevisionId ?? null,
            recommendation: input.analysis.recommendation,
            request: input.analysis.request,
            result: input.analysis.result,
            state: "current",
            staleReason: null,
          },
        ]
      : [],
    graphs:
      input.analysis?.graphSpec && analysisRunId
        ? [
            {
              id: `graph-record.${input.analysis.graphSpec.id}`,
              spec: input.analysis.graphSpec,
              sourceAnalysisRunId: analysisRunId,
              state: "current",
              staleReason: null,
            },
          ]
        : [],
    experimentWorkspace: null,
    provenanceEvents: [
      {
        id: `provenance.${input.metadata.projectId}.created`,
        kind: "project_created",
        targetId: input.metadata.projectId,
        occurredAt: createdAt,
        actor: input.actor,
        detail: "Project created from a validated design-aware data sheet.",
      },
      {
        id: `provenance.${input.rawRevision.id}.created`,
        kind: "raw_revision_created",
        targetId: input.rawRevision.id,
        occurredAt: input.rawRevision.createdAt,
        actor: input.actor,
        detail: "Canonical observations created without overwriting earlier measurements.",
      },
      ...(analysisRunId && input.analysis
        ? [
            {
              id: `provenance.${analysisRunId}.executed`,
              kind: "analysis_executed" as const,
              targetId: analysisRunId,
              occurredAt: input.analysis.result.completedAt,
              actor: input.actor,
              detail: `${input.analysis.request.templateId} executed by ${input.analysis.result.engine.name} ${input.analysis.result.engine.version}.`,
            },
          ]
        : []),
      ...(input.transformations ?? []).map((transformation) => ({
        id: `provenance.${transformation.id}.created`,
        kind: "transformation_created" as const,
        targetId: transformation.id,
        occurredAt: input.rawRevision.createdAt,
        actor: input.actor,
        detail: `${transformation.method} transformation ${transformation.version} created with source-observation lineage.`,
      })),
      ...(input.derivedDatasetRevisions ?? []).map((revision) => ({
        id: `provenance.${revision.id}.created`,
        kind: "derived_dataset_created" as const,
        targetId: revision.id,
        occurredAt: revision.createdAt,
        actor: input.actor,
        detail: `Derived dataset created from ${revision.sourceRawRevisionId} using ${revision.transformationId}.`,
      })),
    ],
  });
}

export function appendRawRevision(
  stateInput: ProjectState,
  rawRevision: RawDatasetRevision,
  unitInstances: UnitInstance[],
  observations: Observation[],
  actor: string,
  transformations: TransformationSpec[] = [],
  derivedDatasetRevisions: DerivedDatasetRevision[] = [],
  derivedValues: DerivedScalarValue[] = [],
): ProjectState {
  const state = ProjectStateSchema.parse(stateInput);
  if (rawRevision.previousRevisionId !== state.activeRawRevisionId) {
    throw new Error("A new raw revision must descend from the active raw revision");
  }
  const staleReason = `Raw data changed from ${state.activeRawRevisionId} to ${rawRevision.id}`;
  const unitById = new Map(state.unitInstances.map((unit) => [unit.id, unit]));
  for (const unit of unitInstances) {
    const existing = unitById.get(unit.id);
    if (existing && JSON.stringify(existing) !== JSON.stringify(unit)) {
      throw new Error(`Unit ${unit.id} cannot change definition across raw revisions`);
    }
    unitById.set(unit.id, unit);
  }
  return ProjectStateSchema.parse({
    ...state,
    metadata: { ...state.metadata, updatedAt: rawRevision.createdAt },
    rawRevisions: [...state.rawRevisions, rawRevision],
    activeRawRevisionId: rawRevision.id,
    unitInstances: [...unitById.values()],
    observations: [...state.observations, ...observations],
    transformations: [...state.transformations, ...transformations],
    derivedDatasetRevisions: [
      ...state.derivedDatasetRevisions.map((revision) => ({
        ...revision,
        state: "stale" as const,
        staleReason,
      })),
      ...derivedDatasetRevisions,
    ],
    derivedValues: [...state.derivedValues, ...derivedValues],
    analysisRuns: state.analysisRuns.map((run) => ({
      ...run,
      state: "stale" as const,
      staleReason,
    })),
    graphs: state.graphs.map((graph) => ({
      ...graph,
      state: "stale" as const,
      staleReason,
    })),
    provenanceEvents: [
      ...state.provenanceEvents,
      {
        id: `provenance.${rawRevision.id}.created`,
        kind: "raw_revision_created" as const,
        targetId: rawRevision.id,
        occurredAt: rawRevision.createdAt,
        actor,
        detail: "A new immutable raw revision was created.",
      },
      ...state.analysisRuns.map((run) => ({
        id: `provenance.${run.id}.stale.${rawRevision.id}`,
        kind: "analysis_marked_stale" as const,
        targetId: run.id,
        occurredAt: rawRevision.createdAt,
        actor,
        detail: staleReason,
      })),
      ...transformations.map((transformation) => ({
        id: `provenance.${transformation.id}.created`,
        kind: "transformation_created" as const,
        targetId: transformation.id,
        occurredAt: rawRevision.createdAt,
        actor,
        detail: `${transformation.method} transformation ${transformation.version} created with source-observation lineage.`,
      })),
      ...derivedDatasetRevisions.map((revision) => ({
        id: `provenance.${revision.id}.created`,
        kind: "derived_dataset_created" as const,
        targetId: revision.id,
        occurredAt: revision.createdAt,
        actor,
        detail: `Derived dataset created from ${revision.sourceRawRevisionId} using ${revision.transformationId}.`,
      })),
    ],
  });
}

export function appendDesignRevision(
  stateInput: ProjectState,
  design: ExperimentDesign,
  actor: string,
  createdAt: string,
): ProjectState {
  const state = ProjectStateSchema.parse(stateInput);
  const previousRevision = state.designRevisions.find(
    (revision) => revision.id === state.activeDesignRevisionId,
  );
  if (!previousRevision) throw new Error("Active design revision is missing");
  const nextIndex =
    state.designRevisions.filter((revision) => revision.design.id === design.id).length + 1;
  const id = `design-revision.${design.id}.${nextIndex}`;
  const staleReason = `Experiment design changed from ${state.activeDesignRevisionId} to ${id}`;
  return ProjectStateSchema.parse({
    ...state,
    metadata: { ...state.metadata, updatedAt: createdAt },
    designRevisions: [
      ...state.designRevisions,
      {
        id,
        previousRevisionId: state.activeDesignRevisionId,
        design,
        createdAt,
        createdBy: actor,
      },
    ],
    activeDesignRevisionId: id,
    analysisRuns: state.analysisRuns.map((run) => ({
      ...run,
      state: "stale" as const,
      staleReason,
    })),
    graphs: state.graphs.map((graph) => ({
      ...graph,
      state: "stale" as const,
      staleReason,
    })),
    provenanceEvents: [
      ...state.provenanceEvents,
      {
        id: `provenance.${id}.created`,
        kind: "design_revision_created" as const,
        targetId: id,
        occurredAt: createdAt,
        actor,
        detail: staleReason,
      },
    ],
  });
}

export function appendAnalysisExecution(
  stateInput: ProjectState,
  analysis: NonNullable<CreateInitialProjectStateInput["analysis"]>,
  actor: string,
): ProjectState {
  const state = ProjectStateSchema.parse(stateInput);
  const analysisRunId = `analysis-run.${analysis.request.requestId}`;
  if (state.analysisRuns.some((run) => run.id === analysisRunId)) {
    throw new Error(`Analysis run ${analysisRunId} already exists in project history`);
  }
  const graphRecord = analysis.graphSpec
    ? {
        id: `graph-record.${analysis.graphSpec.id}.${analysis.request.requestId}`,
        spec: analysis.graphSpec,
        sourceAnalysisRunId: analysisRunId,
        state: "current" as const,
        staleReason: null,
      }
    : null;
  return ProjectStateSchema.parse({
    ...state,
    metadata: { ...state.metadata, updatedAt: analysis.result.completedAt },
    analysisRuns: [
      ...state.analysisRuns,
      {
        id: analysisRunId,
        inputDesignRevisionId: state.activeDesignRevisionId,
        inputRawRevisionId: state.activeRawRevisionId,
        inputDerivedDatasetRevisionId: analysis.inputDerivedDatasetRevisionId ?? null,
        recommendation: analysis.recommendation,
        request: analysis.request,
        result: analysis.result,
        state: "current" as const,
        staleReason: null,
      },
    ],
    graphs: graphRecord ? [...state.graphs, graphRecord] : state.graphs,
    provenanceEvents: [
      ...state.provenanceEvents,
      {
        id: `provenance.${analysisRunId}.executed`,
        kind: "analysis_executed" as const,
        targetId: analysisRunId,
        occurredAt: analysis.result.completedAt,
        actor,
        detail: `${analysis.request.templateId} executed by ${analysis.result.engine.name} ${analysis.result.engine.version}.`,
      },
    ],
  });
}

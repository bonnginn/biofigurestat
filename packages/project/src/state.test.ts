import { describe, expect, it } from "vitest";
import { createCoreMultiGroupGraphSpec, createCoreTwoConditionGraphSpec } from "@lsaa/graph-spec";
import {
  ExperimentWorkspaceStateSchema,
  ProjectStateSchema,
  appendAnalysisExecution,
  appendDerivedDatasetArtifacts,
  appendDesignRevision,
  appendRawRevision,
  createInitialProjectState,
  migrateProjectState,
  KNOWN_PROJECT_STATE_SCHEMA_VERSIONS,
} from "./state";
import { ProjectCompatibilityError } from "./compatibility-error";

const now = "2026-08-20T00:00:00Z";

describe("experiment-workspace graph channel persistence", () => {
  const workspace = {
    version: "0.1.0" as const,
    context: "general_assay" as const,
    conditionAttributes: [
      { id: "factor.sex", label: "Sex" },
      { id: "factor.region", label: "Region" },
      { id: "factor.readout", label: "Readout" },
    ],
    conditions: [{ id: "condition.female.hip", label: "Female / HIP", attributes: {} }],
    timePlan: { sampling: "none" as const, unit: "h" as const, points: [] },
    experimentSessions: [{ id: "session.1", label: "Experiment 1", date: "", note: "" }],
    graphs: [
      {
        id: "graph.grouped-channels",
        displayName: "Grouped expression",
        selectedReadoutId: "readout.expression",
        selectedConditionIds: ["condition.female.hip"],
        selectedTimePointIds: [],
        graphType: "dot" as const,
        grouping: {
          x: { source: "factor" as const, factorId: "factor.sex" },
          series: { source: "factor" as const, factorId: "factor.region" },
          color: { source: "factor" as const, factorId: "factor.sex" },
          shape: { source: "factor" as const, factorId: "factor.region" },
          facet: {
            source: "factor" as const,
            factorId: "factor.readout",
            axisPolicy: "shared" as const,
            levelOrder: ["readout.expression", "readout.percentage"],
          },
        },
        layers: { raw: true, experiment: true, overall: true },
        appearance: {
          errorBar: "sem" as const,
          pointSize: 5,
          axisLineWidth: 1.2,
          hierarchicalLabels: true,
        },
        axes: {
          xSemantic: "categorical" as const,
          xTitle: "Sex",
          xUnit: "",
          yTitle: "Relative expression",
          yRangeMode: "auto" as const,
          yMin: null,
          yMax: null,
          yScale: "linear" as const,
          showCategoryLabels: true,
          hierarchyOrder: ["factor.sex", "factor.region"],
          spacing: 1,
          yTickMode: "auto" as const,
          yTickInterval: null,
          tickDirection: "outside" as const,
          showCategoryGroupSeparators: true,
        },
      },
    ],
  };

  it("round-trips independent color/shape, series/facet, and categorical axis hints", () => {
    const parsed = ExperimentWorkspaceStateSchema.parse(workspace);
    const roundTrip = ExperimentWorkspaceStateSchema.parse(JSON.parse(JSON.stringify(parsed)));
    const graph = roundTrip.graphs[0];

    expect(graph?.grouping).toMatchObject({
      series: { source: "factor", factorId: "factor.region" },
      color: { source: "factor", factorId: "factor.sex" },
      shape: { source: "factor", factorId: "factor.region" },
      facet: { factorId: "factor.readout" },
    });
    expect(graph?.axes).toMatchObject({
      tickDirection: "outside",
      showCategoryGroupSeparators: true,
    });
  });

  it("accepts legacy workspace graphs without requiring new channels or axis hints", () => {
    const legacy = structuredClone(workspace) as unknown as {
      graphs: Array<{ grouping: Record<string, unknown>; axes: Record<string, unknown> }>;
    };
    delete legacy.graphs[0]!.grouping.color;
    delete legacy.graphs[0]!.grouping.shape;
    delete legacy.graphs[0]!.axes.tickDirection;
    delete legacy.graphs[0]!.axes.showCategoryGroupSeparators;

    const parsed = ExperimentWorkspaceStateSchema.parse(legacy);

    expect(parsed.graphs[0]?.grouping?.color).toBeUndefined();
    expect(parsed.graphs[0]?.grouping?.shape).toBeUndefined();
    expect(parsed.graphs[0]?.axes.tickDirection).toBeUndefined();
    expect(parsed.graphs[0]?.axes.showCategoryGroupSeparators).toBeUndefined();
  });

  it("keeps the scientific comparison goal optional for legacy projects and round-trips equivalence", () => {
    const legacy = ExperimentWorkspaceStateSchema.parse(workspace);
    expect(legacy.graphs[0]?.comparisonGoal).toBeUndefined();

    const withEquivalence = {
      ...structuredClone(workspace),
      graphs: workspace.graphs.map((graph, index) =>
        index === 0 ? { ...graph, comparisonGoal: "equivalence" as const } : graph,
      ),
    };
    const roundTrip = ExperimentWorkspaceStateSchema.parse(
      JSON.parse(JSON.stringify(ExperimentWorkspaceStateSchema.parse(withEquivalence))),
    );

    expect(roundTrip.graphs[0]?.comparisonGoal).toBe("equivalence");
  });

  it("round-trips a prespecified equivalence plan without changing legacy Graphs", () => {
    const legacy = ExperimentWorkspaceStateSchema.parse(workspace);
    expect(legacy.graphs[0]?.equivalencePlan).toBeUndefined();
    const withPlan = ExperimentWorkspaceStateSchema.parse({
      ...legacy,
      graphs: legacy.graphs.map((graph, index) =>
        index === 0
          ? {
              ...graph,
              comparisonGoal: "equivalence" as const,
              equivalencePlan: {
                schemaVersion: "0.1.0",
                margin: {
                  scale: "percentage_point_difference" as const,
                  lowerBound: -10,
                  upperBound: 10,
                  unit: "percentage points",
                  rationale: "Declared from the biological acceptance criterion.",
                  declaredAsPrespecified: true as const,
                },
                alpha: 0.05 as const,
                claimMode: "all_selected_comparisons" as const,
              },
            }
          : graph,
      ),
    });
    const reopened = ExperimentWorkspaceStateSchema.parse(JSON.parse(JSON.stringify(withPlan)));
    expect(reopened.graphs[0]?.equivalencePlan).toMatchObject({
      margin: { lowerBound: -10, upperBound: 10 },
      claimMode: "all_selected_comparisons",
    });
  });
});

const design = {
  schemaVersion: "0.2.0" as const,
  id: "design.test",
  name: "Microscopy intensity",
  purpose: "microscopy" as const,
  outcomes: [
    { id: "outcome.intensity", key: "intensity", label: "Intensity", type: "continuous" as const },
  ],
  factors: [
    {
      id: "factor.condition",
      key: "condition",
      label: "Condition",
      levels: [
        { id: "level.control", label: "Control", order: 0 },
        { id: "level.treated", label: "Treated", order: 1 },
      ],
    },
  ],
  conditions: [
    {
      id: "condition.control",
      label: "Control",
      factorLevels: { "factor.condition": "level.control" },
    },
    {
      id: "condition.treated",
      label: "Treated",
      factorLevels: { "factor.condition": "level.treated" },
    },
  ],
  unitLevels: [
    {
      id: "unit-level.dish",
      key: "dish",
      label: "Dish",
      role: "experimental_unit" as const,
      parentLevelId: null,
    },
  ],
  experimentalUnitLevelId: "unit-level.dish",
  pairing: { kind: "independent" as const },
  plannedN: 1,
  normalizationPlans: [],
  primaryContrast: {
    id: "contrast.primary",
    label: "Control vs treated",
    conditionIds: ["condition.control", "condition.treated"] as [string, string],
  },
  wizardRuleVersion: "0.1.0",
  wizardDecisions: [],
  createdAt: now,
};

const units = [
  {
    id: "unit.control.1",
    levelId: "unit-level.dish",
    parentUnitId: null,
    label: "Control 1",
    metadata: {},
  },
  {
    id: "unit.treated.1",
    levelId: "unit-level.dish",
    parentUnitId: null,
    label: "Treated 1",
    metadata: {},
  },
];

function observations(rawRevisionId: string, offset = 0) {
  return units.map((unit, index) => ({
    id: `observation.${index + 1}`,
    rawRevisionId,
    unitInstanceId: unit.id,
    conditionId: index === 0 ? "condition.control" : "condition.treated",
    outcomeId: "outcome.intensity",
    measurement: { kind: "scalar" as const, value: index + 1 + offset },
  }));
}

describe("project state lineage", () => {
  it("migrates v0.2 state to an explicit empty experiment workspace", () => {
    const current = createInitialProjectState({
      metadata: {
        projectId: "project.migration",
        projectName: "Migration",
        experimentDate: "2026-08-20",
        createdAt: now,
        updatedAt: now,
      },
      design,
      rawRevision: {
        id: "raw.migration.1",
        previousRevisionId: null,
        sourceKind: "manual",
        createdAt: now,
        createdBy: "researcher",
      },
      unitInstances: [],
      observations: [],
      actor: "researcher",
    });
    const migrated = ProjectStateSchema.parse(
      migrateProjectState({ ...current, schemaVersion: "0.2.0" }),
    );
    expect(migrated.schemaVersion).toBe("0.3.0");
    expect(migrated.experimentWorkspace).toBeNull();
  });

  it("opens every known project-state version through the migration matrix", () => {
    const current = createInitialProjectState({
      metadata: {
        projectId: "project.fixture-matrix",
        projectName: "Fixture matrix",
        experimentDate: "2026-08-20",
        createdAt: now,
        updatedAt: now,
      },
      design,
      rawRevision: {
        id: "raw.fixture-matrix.1",
        previousRevisionId: null,
        sourceKind: "manual",
        createdAt: now,
        createdBy: "researcher",
      },
      unitInstances: [],
      observations: [],
      actor: "researcher",
    });
    const fixtures: Record<(typeof KNOWN_PROJECT_STATE_SCHEMA_VERSIONS)[number], unknown> = {
      "0.2.0": { ...current, schemaVersion: "0.2.0" },
      "0.3.0": current,
    };

    for (const version of KNOWN_PROJECT_STATE_SCHEMA_VERSIONS) {
      expect(ProjectStateSchema.parse(migrateProjectState(fixtures[version])).schemaVersion).toBe(
        "0.3.0",
      );
    }
  });

  it("returns a stable compatibility error for newer and unsupported project schemas", () => {
    expect(() => migrateProjectState({ schemaVersion: "9.9.9", metadata: {} })).toThrowError(
      ProjectCompatibilityError,
    );
    try {
      migrateProjectState({ schemaVersion: "9.9.9", metadata: {} });
    } catch (error) {
      expect(error).toMatchObject({
        code: "PROJECT_SCHEMA_VERSION_NEWER_THAN_APP",
        foundVersion: "9.9.9",
        supportedVersion: "0.3.0",
      });
    }
    expect(() => migrateProjectState({ schemaVersion: "0.1.0", metadata: {} })).toThrowError(
      expect.objectContaining({ code: "PROJECT_SCHEMA_VERSION_UNSUPPORTED" }),
    );
  });

  it("adds a design revision before accepting a newly declared nested unit level", () => {
    const initial = createInitialProjectState({
      metadata: {
        projectId: "project.design-revision",
        projectName: "Nested design",
        experimentDate: "2026-08-20",
        createdAt: now,
        updatedAt: now,
      },
      design,
      rawRevision: {
        id: "raw.design.1",
        previousRevisionId: null,
        sourceKind: "manual",
        createdAt: now,
        createdBy: "researcher",
      },
      unitInstances: units,
      observations: observations("raw.design.1"),
      actor: "researcher",
    });
    const nestedDesign = {
      ...design,
      unitLevels: [
        ...design.unitLevels,
        {
          id: "unit-level.cell",
          key: "cell",
          label: "Cell",
          role: "subsample" as const,
          parentLevelId: "unit-level.dish",
        },
      ],
    };
    const revised = appendDesignRevision(initial, nestedDesign, "researcher", now);
    expect(revised.designRevisions).toHaveLength(2);
    expect(revised.activeDesignRevisionId).toContain("design.test.2");
  });

  it("adds derived artifacts against the active raw revision without a false raw revision", () => {
    const rawRevisionId = "raw.derived-only.1";
    const initial = createInitialProjectState({
      metadata: {
        projectId: "project.derived-only",
        projectName: "Derived-only update",
        experimentDate: "2026-08-20",
        createdAt: now,
        updatedAt: now,
      },
      design,
      rawRevision: {
        id: rawRevisionId,
        previousRevisionId: null,
        sourceKind: "manual",
        createdAt: now,
        createdBy: "researcher",
      },
      unitInstances: units,
      observations: observations(rawRevisionId),
      actor: "researcher",
    });
    const transformation = {
      id: "transformation.derived-only.1",
      version: "0.1.0",
      method: "replicate_summary" as const,
      inputRevisionIds: [rawRevisionId],
      parameters: { center: "mean" },
    };
    const revision = {
      id: "derived.derived-only.1",
      previousRevisionId: null,
      sourceRawRevisionId: rawRevisionId,
      sourceQcRevisionId: null,
      outcomeId: "outcome.intensity",
      transformationId: transformation.id,
      createdAt: "2026-08-20T01:00:00Z",
      createdBy: "researcher",
      state: "current" as const,
      staleReason: null,
    };
    const value = {
      id: "derived-value.derived-only.1",
      derivedDatasetRevisionId: revision.id,
      experimentalUnitId: units[0]!.id,
      conditionId: "condition.control",
      outcomeId: "outcome.intensity",
      value: 1,
      sourceObservationIds: ["observation.1"],
      sourceUnitIds: [units[0]!.id],
      subsampleCount: 1,
    };
    const revised = appendDerivedDatasetArtifacts(initial, {
      transformations: [transformation],
      derivedDatasetRevisions: [revision],
      derivedValues: [value],
      actor: "researcher",
      occurredAt: "2026-08-20T01:00:00Z",
    });

    expect(revised.rawRevisions).toEqual(initial.rawRevisions);
    expect(revised.designRevisions).toEqual(initial.designRevisions);
    expect(revised.transformations).toHaveLength(1);
    expect(revised.derivedDatasetRevisions).toHaveLength(1);
    expect(revised.provenanceEvents.slice(initial.provenanceEvents.length)).toEqual([
      expect.objectContaining({ kind: "transformation_created" }),
      expect.objectContaining({ kind: "derived_dataset_created" }),
    ]);
    expect(() =>
      appendDerivedDatasetArtifacts(revised, {
        transformations: [transformation],
        derivedDatasetRevisions: [revision],
        derivedValues: [value],
        actor: "researcher",
        occurredAt: "2026-08-20T02:00:00Z",
      }),
    ).toThrow(/already exists/);
  });

  it("reproduces an executed analysis from persisted D10 derived values and rejects broken lineage", () => {
    const transformation = {
      id: "transformation.d10.1",
      version: "0.2.0",
      method: "replicate_summary" as const,
      inputRevisionIds: ["raw.derived.1"],
      parameters: {
        center: "mean",
        weighting: "equal_observations_within_experimental_unit",
      },
    };
    const derivedRevision = {
      id: "derived.1",
      previousRevisionId: null,
      sourceRawRevisionId: "raw.derived.1",
      sourceQcRevisionId: null,
      outcomeId: "outcome.intensity",
      transformationId: transformation.id,
      createdAt: now,
      createdBy: "researcher",
      state: "current" as const,
      staleReason: null,
    };
    const raw = observations("raw.derived.1");
    const derivedValues = raw.map((observation, index) => ({
      id: `derived-value.${index + 1}`,
      derivedDatasetRevisionId: derivedRevision.id,
      experimentalUnitId: observation.unitInstanceId,
      conditionId: observation.conditionId,
      outcomeId: observation.outcomeId,
      value: observation.measurement.value,
      sourceObservationIds: [observation.id],
      sourceUnitIds: [observation.unitInstanceId],
      subsampleCount: 1,
    }));
    const request = {
      protocolVersion: "0.1.0" as const,
      requestId: "request.derived.1",
      projectId: "project.derived",
      analysisId: "analysis.derived",
      templateId: "D01" as const,
      templateVersion: "0.1.0",
      method: "welch_t" as const,
      contrastConditionIds: ["condition.control", "condition.treated"] as [string, string],
      observations: derivedValues.map((value) => ({
        observationId: value.id,
        conditionId: value.conditionId,
        value: value.value,
        experimentalUnitId: value.experimentalUnitId,
      })),
      options: {
        alternative: "two_sided" as const,
        confidenceLevel: 0.95,
        multiplicityMethod: null,
      },
    };
    const state = createInitialProjectState({
      metadata: {
        projectId: "project.derived",
        projectName: "Derived project",
        experimentDate: "2026-08-20",
        createdAt: now,
        updatedAt: now,
      },
      design,
      rawRevision: {
        id: "raw.derived.1",
        previousRevisionId: null,
        sourceKind: "paste",
        createdAt: now,
        createdBy: "researcher",
      },
      unitInstances: units,
      observations: raw,
      transformations: [transformation],
      derivedDatasetRevisions: [derivedRevision],
      derivedValues,
      actor: "researcher",
      analysis: {
        inputDerivedDatasetRevisionId: derivedRevision.id,
        recommendation: {
          templateId: "D01",
          templateVersion: "0.1.0",
          recommendedMethod: "welch_t",
          alternativeMethods: ["mann_whitney"],
          reasonCode: "two_independent_condition_groups",
          explanation: "Separate units.",
          statisticalNDefinition: "Independent dishes",
        },
        request,
        result: {
          protocolVersion: "0.1.0",
          requestId: request.requestId,
          status: "ok",
          engine: { name: "fixture", version: "0.1.0", packages: {} },
          estimates: [],
          tests: [],
          diagnostics: [],
          warnings: [],
          completedAt: now,
        },
        graphSpec: null,
      },
    });

    expect(state.analysisRuns[0].inputDerivedDatasetRevisionId).toBe("derived.1");
    const machineRoundoff = structuredClone(state);
    machineRoundoff.analysisRuns[0]!.request.observations[0]!.value! += Number.EPSILON * 4;
    expect(ProjectStateSchema.safeParse(machineRoundoff).success).toBe(true);
    const materiallyDifferent = structuredClone(state);
    materiallyDifferent.analysisRuns[0]!.request.observations[0]!.value! += 1e-8;
    expect(ProjectStateSchema.safeParse(materiallyDifferent).success).toBe(false);
    const broken = structuredClone(state);
    broken.derivedValues[0].sourceObservationIds = ["observation.missing"];
    expect(ProjectStateSchema.safeParse(broken).success).toBe(false);

    const revised = appendRawRevision(
      state,
      {
        id: "raw.derived.2",
        previousRevisionId: "raw.derived.1",
        sourceKind: "project_edit",
        createdAt: "2026-08-21T00:00:00Z",
        createdBy: "researcher",
      },
      units,
      observations("raw.derived.2", 2),
      "researcher",
    );
    expect(revised.derivedDatasetRevisions[0].state).toBe("stale");
    expect(revised.analysisRuns[0].state).toBe("stale");
  });

  it("persists a protocol 0.2 D03 execution without rewriting protocol 0.1 history", () => {
    const conditionIds = ["condition.a", "condition.b", "condition.c"];
    const multiDesign = {
      ...design,
      id: "design.d03",
      name: "Three groups",
      factors: [
        {
          id: "factor.condition",
          key: "condition",
          label: "Condition",
          levels: conditionIds.map((conditionId, index) => ({
            id: `level.${conditionId}`,
            label: conditionId,
            order: index,
          })),
        },
      ],
      conditions: conditionIds.map((conditionId) => ({
        id: conditionId,
        label: conditionId,
        factorLevels: { "factor.condition": `level.${conditionId}` },
      })),
      primaryContrast: {
        id: "contrast.a-c",
        label: "A vs C",
        conditionIds: ["condition.a", "condition.c"] as [string, string],
      },
    };
    const multiUnits = conditionIds.flatMap((conditionId) =>
      [1, 2].map((replicate) => ({
        id: `unit.${conditionId}.${replicate}`,
        levelId: "unit-level.dish",
        parentUnitId: null,
        label: `${conditionId} ${replicate}`,
        metadata: {},
      })),
    );
    const multiObservations = multiUnits.map((unit, index) => ({
      id: `observation.${index + 1}`,
      rawRevisionId: "raw.d03.1",
      unitInstanceId: unit.id,
      conditionId: conditionIds[Math.floor(index / 2)],
      outcomeId: "outcome.intensity",
      measurement: { kind: "scalar" as const, value: index + 1 },
    }));
    const request = {
      protocolVersion: "0.2.0" as const,
      requestId: "request.d03.1",
      projectId: "project.d03",
      analysisId: "analysis.d03",
      templateId: "D03" as const,
      templateVersion: "0.1.0",
      method: "welch_anova" as const,
      conditionIds,
      contrastIntent: "all_pairs" as const,
      primaryContrastConditionIds: ["condition.a", "condition.c"] as [string, string],
      observations: multiObservations.map((observation) => ({
        observationId: observation.id,
        conditionId: observation.conditionId,
        value: observation.measurement.value,
        experimentalUnitId: observation.unitInstanceId,
      })),
      options: {
        alternative: "two_sided" as const,
        confidenceLevel: 0.95,
        multiplicityMethod: "games_howell_all_pairs" as const,
      },
    };
    const result = {
      protocolVersion: "0.2.0" as const,
      requestId: request.requestId,
      status: "ok" as const,
      engine: { name: "fixture", version: "0.2.0", packages: { scipy: "1.18.0" } },
      estimates: [],
      tests: [
        {
          name: "welch_one_way_anova",
          statisticName: "F",
          statistic: 10,
          degreesOfFreedom: [2, 2.5],
          pValue: 0.04,
          adjustedPValue: null,
          effectSizeName: "cohen_f_welch",
          effectSize: 0.8,
        },
      ],
      diagnostics: [],
      warnings: [],
      completedAt: now,
    };
    const recommendation = {
      templateId: "D03" as const,
      templateVersion: "0.1.0",
      recommendedMethod: "welch_anova" as const,
      alternativeMethods: ["one_way_anova" as const, "kruskal_wallis" as const],
      reasonCode: "three_or_more_independent_groups_one_factor",
      explanation: "Independent groups.",
      statisticalNDefinition: "Independent dishes",
      multiplicityMethod: "games_howell_all_pairs",
    };
    const graphSpec = createCoreMultiGroupGraphSpec({
      graphId: "graph.d03.1",
      templateId: "D03",
      dataSource: { kind: "analysis_result", id: "analysis.d03", revision: request.requestId },
      analysisResultId: request.requestId,
      yLabel: "Intensity",
      yStartAtZero: true,
    });

    const state = createInitialProjectState({
      metadata: {
        projectId: "project.d03",
        projectName: "D03 project",
        experimentDate: "2026-08-20",
        createdAt: now,
        updatedAt: now,
      },
      design: multiDesign,
      rawRevision: {
        id: "raw.d03.1",
        previousRevisionId: null,
        sourceKind: "manual",
        createdAt: now,
        createdBy: "researcher",
      },
      unitInstances: multiUnits,
      observations: multiObservations,
      actor: "researcher",
      analysis: { recommendation, request, result, graphSpec },
    });

    expect(ProjectStateSchema.parse(state).analysisRuns[0].request.protocolVersion).toBe("0.2.0");
    expect(state.graphs[0].spec.type).toBe("grouped_dot");

    const mismatched = structuredClone(state);
    mismatched.analysisRuns[0].result.protocolVersion = "0.1.0";
    expect(ProjectStateSchema.safeParse(mismatched).success).toBe(false);
  });

  it("rejects unknown and cyclic previous-revision links", () => {
    const initial = createInitialProjectState({
      metadata: {
        projectId: "project.revision-links",
        projectName: "Revision links",
        experimentDate: "2026-08-20",
        createdAt: now,
        updatedAt: now,
      },
      design,
      rawRevision: {
        id: "raw.links.1",
        previousRevisionId: null,
        sourceKind: "manual",
        createdAt: now,
        createdBy: "researcher",
      },
      unitInstances: units,
      observations: observations("raw.links.1"),
      actor: "researcher",
    });
    const unknownPrevious = ProjectStateSchema.safeParse({
      ...initial,
      rawRevisions: [{ ...initial.rawRevisions[0], previousRevisionId: "raw.links.missing" }],
    });
    expect(unknownPrevious.success).toBe(false);
    if (!unknownPrevious.success) {
      expect(
        unknownPrevious.error.issues.some((issue) => issue.message.includes("Previous revision")),
      ).toBe(true);
    }

    const cycle = ProjectStateSchema.safeParse({
      ...initial,
      activeRawRevisionId: "raw.links.2",
      rawRevisions: [
        { ...initial.rawRevisions[0], previousRevisionId: "raw.links.2" },
        {
          ...initial.rawRevisions[0],
          id: "raw.links.2",
          previousRevisionId: "raw.links.1",
        },
      ],
    });
    expect(cycle.success).toBe(false);
    if (!cycle.success) {
      expect(cycle.error.issues.some((issue) => issue.message.includes("cycle"))).toBe(true);
    }
  });

  it("marks analysis and graph history stale when a new raw revision is appended", () => {
    const recommendation = {
      templateId: "D01" as const,
      templateVersion: "0.1.0",
      recommendedMethod: "welch_t" as const,
      alternativeMethods: ["mann_whitney" as const],
      reasonCode: "two_independent_condition_groups",
      explanation: "Separate experimental units.",
      statisticalNDefinition: "Independent dishes",
    };
    const request = {
      protocolVersion: "0.1.0" as const,
      requestId: "request.1",
      projectId: "project.test",
      analysisId: "analysis.1",
      templateId: "D01" as const,
      templateVersion: "0.1.0",
      method: "welch_t" as const,
      contrastConditionIds: ["condition.control", "condition.treated"] as [string, string],
      observations: observations("raw.1").map((observation) => ({
        observationId: observation.id,
        conditionId: observation.conditionId,
        value: observation.measurement.value,
        experimentalUnitId: observation.unitInstanceId,
      })),
      options: {
        alternative: "two_sided" as const,
        confidenceLevel: 0.95,
        multiplicityMethod: null,
      },
    };
    const result = {
      protocolVersion: "0.1.0" as const,
      requestId: "request.1",
      status: "ok" as const,
      engine: { name: "fixture", version: "0.1.0", packages: { scipy: "1.18.0" } },
      estimates: [],
      tests: [],
      diagnostics: [],
      warnings: [],
      completedAt: now,
    };
    const graphSpec = createCoreTwoConditionGraphSpec({
      graphId: "graph.1",
      templateId: "D01",
      dataSource: { kind: "analysis_result", id: "analysis.1", revision: "request.1" },
      analysisResultId: "request.1",
      yLabel: "Intensity",
      yStartAtZero: true,
    });
    const initial = createInitialProjectState({
      metadata: {
        projectId: "project.test",
        projectName: "Test project",
        experimentDate: "2026-08-20",
        createdAt: now,
        updatedAt: now,
      },
      design,
      rawRevision: {
        id: "raw.1",
        previousRevisionId: null,
        sourceKind: "manual",
        createdAt: now,
        createdBy: "researcher",
      },
      unitInstances: units,
      observations: observations("raw.1"),
      actor: "researcher",
      analysis: { recommendation, request, result, graphSpec },
    });

    const revised = appendRawRevision(
      initial,
      {
        id: "raw.2",
        previousRevisionId: "raw.1",
        sourceKind: "project_edit",
        createdAt: "2026-08-21T00:00:00Z",
        createdBy: "researcher",
      },
      units,
      observations("raw.2", 1),
      "researcher",
    );

    expect(revised.unitInstances).toHaveLength(2);
    expect(revised.observations).toHaveLength(4);
    expect(revised.analysisRuns[0].state).toBe("stale");
    expect(revised.graphs[0].state).toBe("stale");
    expect(revised.provenanceEvents.at(-1)?.kind).toBe("analysis_marked_stale");

    const request2 = {
      ...request,
      requestId: "request.2",
      observations: observations("raw.2", 1).map((observation) => ({
        observationId: observation.id,
        conditionId: observation.conditionId,
        value: observation.measurement.value,
        experimentalUnitId: observation.unitInstanceId,
      })),
    };
    const result2 = {
      ...result,
      requestId: "request.2",
      completedAt: "2026-08-21T01:00:00Z",
    };
    const graph2 = createCoreTwoConditionGraphSpec({
      graphId: "graph.2",
      templateId: "D01",
      dataSource: { kind: "analysis_result", id: "analysis.1", revision: "request.2" },
      analysisResultId: "request.2",
      yLabel: "Intensity",
      yStartAtZero: true,
    });
    const rerun = appendAnalysisExecution(
      revised,
      { recommendation, request: request2, result: result2, graphSpec: graph2 },
      "researcher",
    );
    expect(rerun.analysisRuns.map((run) => run.state)).toEqual(["stale", "current"]);
    expect(rerun.graphs.map((graph) => graph.state)).toEqual(["stale", "current"]);
    expect(rerun.analysisRuns[1].inputRawRevisionId).toBe("raw.2");
  });
});

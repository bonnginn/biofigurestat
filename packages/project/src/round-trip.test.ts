import { describe, expect, it } from "vitest";
import {
  appendMatrixView,
  createInitialProjectState,
  ProjectStateSchema,
  type ProjectState,
} from "./state";
import { createUnresolvedVisualizationProjectState } from "./unresolved-visualization";
import { createUnresolvedVisualizationPromotionHistory } from "./entry-source-history";
import { createCoreTwoConditionGraphSpec, createHeatmapGraphSpec } from "@lsaa/graph-spec";
import {
  openProjectStatePackage,
  saveProjectStatePackage,
  type ProjectDatabaseCodec,
} from "./round-trip";
import {
  saveProjectPackage,
  type AtomicProjectWrite,
  type ProjectPackageStorage,
  type Sha256Function,
} from "./package-io";

class MemoryStorage implements ProjectPackageStorage {
  packages = new Map<string, Map<string, Uint8Array>>();

  async readFile(target: string, relativePath: string) {
    const data = this.packages.get(target)?.get(relativePath);
    if (!data) throw new Error(`Missing ${relativePath}`);
    return Uint8Array.from(data);
  }

  async beginAtomicWrite(target: string): Promise<AtomicProjectWrite> {
    const staged = new Map<string, Uint8Array>();
    return {
      writeFile: async (path, data) => {
        staged.set(path, Uint8Array.from(data));
      },
      commit: async () => {
        this.packages.set(target, staged);
      },
      rollback: async () => undefined,
    };
  }
}

const jsonCodec: ProjectDatabaseCodec = {
  encode: async (state) => new TextEncoder().encode(JSON.stringify(state)),
  decode: async (database) => JSON.parse(new TextDecoder().decode(database)),
};

const sha256: Sha256Function = async (data) => {
  let hash = 0n;
  data.forEach((byte) => {
    hash = (hash * 257n + BigInt(byte)) % (1n << 256n);
  });
  return hash.toString(16).padStart(64, "0");
};

function fixtureState() {
  const createdAt = "2026-08-20T00:00:00Z";
  return createInitialProjectState({
    metadata: {
      projectId: "project.roundtrip",
      projectName: "WB d-L comparison",
      experimentDate: "2026-08-20",
      createdAt,
      updatedAt: createdAt,
    },
    design: {
      schemaVersion: "0.2.0",
      id: "design.roundtrip",
      name: "Western blot comparison",
      purpose: "western_blot",
      outcomes: [
        {
          id: "outcome.wb",
          key: "normalized_wb_intensity",
          label: "Normalized WB intensity",
          type: "continuous",
        },
      ],
      factors: [
        {
          id: "factor.condition",
          key: "condition",
          label: "Condition",
          levels: [
            { id: "level.dark", label: "Dark", order: 0 },
            { id: "level.light", label: "Light", order: 1 },
          ],
        },
      ],
      conditions: [
        { id: "condition.dark", label: "Dark", factorLevels: { "factor.condition": "level.dark" } },
        {
          id: "condition.light",
          label: "Light",
          factorLevels: { "factor.condition": "level.light" },
        },
      ],
      unitLevels: [
        {
          id: "unit-level.dish",
          key: "dish",
          label: "Dish",
          role: "experimental_unit",
          parentLevelId: null,
        },
      ],
      experimentalUnitLevelId: "unit-level.dish",
      pairing: { kind: "independent" },
      plannedN: 1,
      normalizationPlans: [],
      primaryContrast: {
        id: "contrast.dark-light",
        label: "Dark vs Light",
        conditionIds: ["condition.dark", "condition.light"],
      },
      wizardRuleVersion: "0.1.0",
      wizardDecisions: [],
      createdAt,
    },
    rawRevision: {
      id: "raw.1",
      previousRevisionId: null,
      sourceKind: "manual",
      createdAt,
      createdBy: "researcher",
    },
    unitInstances: [
      {
        id: "unit.dark.1",
        levelId: "unit-level.dish",
        parentUnitId: null,
        label: "Dark 1",
        metadata: {},
      },
      {
        id: "unit.light.1",
        levelId: "unit-level.dish",
        parentUnitId: null,
        label: "Light 1",
        metadata: {},
      },
    ],
    observations: [
      {
        id: "observation.dark.1",
        rawRevisionId: "raw.1",
        unitInstanceId: "unit.dark.1",
        conditionId: "condition.dark",
        outcomeId: "outcome.wb",
        measurement: { kind: "scalar", value: 1 },
      },
      {
        id: "observation.light.1",
        rawRevisionId: "raw.1",
        unitInstanceId: "unit.light.1",
        conditionId: "condition.light",
        outcomeId: "outcome.wb",
        measurement: { kind: "scalar", value: 1.4 },
      },
    ],
    actor: "researcher",
  });
}

function analyzedFixtureState() {
  const base = fixtureState();
  const request = {
    protocolVersion: "0.1.0" as const,
    requestId: "request.roundtrip.1",
    projectId: base.metadata.projectId,
    analysisId: "analysis.roundtrip.1",
    templateId: "D01" as const,
    templateVersion: "0.1.0",
    method: "welch_t" as const,
    contrastConditionIds: ["condition.dark", "condition.light"] as [string, string],
    observations: base.observations.map((item) => {
      if (item.measurement.kind !== "scalar") {
        throw new Error("The analyzed Public Alpha fixture requires scalar observations.");
      }
      return {
        observationId: item.id,
        conditionId: item.conditionId,
        value: item.measurement.value,
        experimentalUnitId: item.unitInstanceId,
      };
    }),
    options: {
      alternative: "two_sided" as const,
      confidenceLevel: 0.95,
      multiplicityMethod: null,
    },
  };
  const result = {
    protocolVersion: "0.1.0" as const,
    requestId: request.requestId,
    status: "ok" as const,
    engine: { name: "fixture", version: "0.1.0", packages: {} },
    estimates: [],
    tests: [
      {
        name: "welch_two_sample_t_test",
        statisticName: "t",
        statistic: -2,
        degreesOfFreedom: [1.8],
        pValue: 0.2,
        adjustedPValue: null,
        effectSizeName: "hedges_g",
        effectSize: -1,
      },
    ],
    diagnostics: [],
    warnings: [
      {
        code: "numerical_library_reliability_warning",
        message: "The numerical library reported a reliability warning.",
      },
    ],
    completedAt: "2026-08-20T00:30:00Z",
  };
  const recommendation = {
    templateId: "D01" as const,
    templateVersion: "0.1.0",
    recommendedMethod: "welch_t" as const,
    alternativeMethods: ["student_t" as const, "mann_whitney" as const],
    reasonCode: "two_independent_condition_groups",
    explanation: "Separate experimental units.",
    statisticalNDefinition: "Independent dishes",
  };
  const graphSpec = createCoreTwoConditionGraphSpec({
    graphId: "graph.roundtrip.1",
    templateId: "D01",
    dataSource: {
      kind: "analysis_result",
      id: request.analysisId,
      revision: request.requestId,
    },
    analysisResultId: request.requestId,
    yLabel: "Normalized WB intensity",
    yStartAtZero: true,
  });

  return createInitialProjectState({
    metadata: base.metadata,
    design: base.designRevisions.at(-1)!.design,
    rawRevision: base.rawRevisions.at(-1)!,
    unitInstances: base.unitInstances,
    observations: base.observations,
    actor: "researcher",
    analysis: { recommendation, request, result, graphSpec },
  });
}

async function savePublicAlphaV02Fixture(input: {
  storage: MemoryStorage;
  target: string;
  state: ProjectState;
  rawExport: string;
}) {
  const { experimentWorkspace: _workspace, adaptiveInput: _adaptiveInput, ...legacyState } =
    input.state;
  const alphaState = { ...legacyState, schemaVersion: "0.2.0" };
  const database = new TextEncoder().encode(JSON.stringify(alphaState));
  const rawExport = new TextEncoder().encode(input.rawExport);
  const databasePath = "project.sqlite";
  const rawPath = "raw/exports/canonical.csv";

  await saveProjectPackage(
    input.storage,
    input.target,
    {
      format: "life-science-analysis-project",
      formatVersion: "0.2.0",
      projectKind: "experiment",
      projectId: alphaState.metadata.projectId,
      metadata: alphaState.metadata,
      appVersion: "0.1.0-alpha.1",
      schemaVersions: {
        design: "0.2.0",
        data: "0.2.0",
        analysis: "0.1.0",
        graph: "0.1.0",
      },
      createdAt: alphaState.metadata.createdAt,
      savedAt: alphaState.metadata.updatedAt,
      files: [
        {
          path: databasePath,
          role: "database",
          sha256: await sha256(database),
          sizeBytes: database.byteLength,
        },
        {
          path: rawPath,
          role: "raw_export",
          sha256: await sha256(rawExport),
          sizeBytes: rawExport.byteLength,
        },
      ],
      recovery: {
        canonicalRawExportPath: rawPath,
        databasePath,
      },
    },
    { [databasePath]: database, [rawPath]: rawExport },
    sha256,
  );
}

describe("populated project round trip", () => {
  it("round-trips an executed independent Welch TOST without changing its margin or conclusion", async () => {
    const storage = new MemoryStorage();
    const source = analyzedFixtureState();
    const ordinaryRun = source.analysisRuns[0]!;
    const additionalUnits = [
      {
        id: "unit.dark.2",
        levelId: "unit-level.dish",
        parentUnitId: null,
        label: "Dark 2",
        metadata: {},
      },
      {
        id: "unit.light.2",
        levelId: "unit-level.dish",
        parentUnitId: null,
        label: "Light 2",
        metadata: {},
      },
    ];
    const additionalObservations = [
      {
        id: "observation.dark.2",
        rawRevisionId: "raw.1",
        unitInstanceId: "unit.dark.2",
        conditionId: "condition.dark",
        outcomeId: "outcome.wb",
        measurement: { kind: "scalar" as const, value: 1.1 },
      },
      {
        id: "observation.light.2",
        rawRevisionId: "raw.1",
        unitInstanceId: "unit.light.2",
        conditionId: "condition.light",
        outcomeId: "outcome.wb",
        measurement: { kind: "scalar" as const, value: 1.3 },
      },
    ];
    const canonicalObservations = [...source.observations, ...additionalObservations];
    const comparisonId = "equivalence:condition.dark:condition.light";
    const plan = {
      schemaVersion: "0.1.0" as const,
      margin: {
        scale: "raw_difference" as const,
        lowerBound: -0.5,
        upperBound: 0.5,
        unit: "AU",
        declaredAsPrespecified: true as const,
      },
      alpha: 0.05 as const,
      claimMode: "single_primary_comparison" as const,
      primaryComparisonId: comparisonId,
    };
    const request = {
      protocolVersion: "0.15.0" as const,
      requestId: ordinaryRun.request.requestId,
      projectId: ordinaryRun.request.projectId,
      analysisId: ordinaryRun.request.analysisId,
      templateId: "D01" as const,
      templateVersion: "0.2.0" as const,
      method: "welch_tost" as const,
      comparisonId,
      contrastConditionIds: ["condition.dark", "condition.light"] as [string, string],
      equivalencePlan: plan,
      observations: canonicalObservations.map((observation) => ({
        observationId: observation.id,
        conditionId: observation.conditionId,
        experimentalUnitId: observation.unitInstanceId,
        value:
          observation.measurement.kind === "scalar" ? observation.measurement.value : Number.NaN,
      })),
      options: {
        alternative: "two_sided" as const,
        confidenceLevel: 0.9 as const,
        multiplicityMethod: null,
      },
    };
    const result = {
      protocolVersion: "0.15.0" as const,
      requestId: request.requestId,
      status: "ok" as const,
      engine: { name: "fixture", version: "0.15.0", packages: {} },
      estimates: [
        {
          name: "condition.light_minus_condition.dark",
          value: 0.2,
          standardError: 0.1,
          confidenceInterval: { level: 0.9, lower: 0.01, upper: 0.39 },
        },
      ],
      tests: [],
      equivalence: {
        resultVersion: "0.1.0" as const,
        plan,
        comparisons: [
          {
            comparisonId,
            estimate: 0.2,
            standardError: 0.1,
            lowerConfidenceBound: 0.01,
            upperConfidenceBound: 0.39,
            confidenceLevel: 0.9,
            lowerOneSidedPValue: 0.001,
            upperOneSidedPValue: 0.02,
            tostPValue: 0.02,
            conclusion: "equivalence_supported" as const,
          },
        ],
      },
      diagnostics: [],
      warnings: [],
      completedAt: ordinaryRun.result.completedAt,
    };
    const state = ProjectStateSchema.parse({
      ...source,
      unitInstances: [...source.unitInstances, ...additionalUnits],
      observations: canonicalObservations,
      analysisRuns: [
        {
          ...ordinaryRun,
          request,
          result,
          recommendation: {
            ...ordinaryRun.recommendation,
            templateVersion: "0.2.0",
            recommendedMethod: "welch_tost",
            alternativeMethods: [],
            reasonCode: "prespecified_independent_continuous_equivalence",
            multiplicityMethod: null,
          },
        },
      ],
    });

    const saved = await saveProjectStatePackage({
      storage,
      databaseCodec: jsonCodec,
      target: "/projects/equivalence.lsa",
      state,
      sha256,
      appVersion: "0.1.0-alpha.2",
      savedAt: "2026-09-02T00:00:00Z",
    });
    const reopened = await openProjectStatePackage({
      storage,
      databaseCodec: jsonCodec,
      target: "/projects/equivalence.lsa",
      sha256,
    });

    expect(reopened).toEqual(saved);
    expect(reopened.analysisRuns[0]?.request).toMatchObject({
      protocolVersion: "0.15.0",
      method: "welch_tost",
      equivalencePlan: plan,
    });
    expect(reopened.analysisRuns[0]?.result.equivalence?.comparisons[0]).toMatchObject({
      comparisonId,
      conclusion: "equivalence_supported",
      lowerConfidenceBound: 0.01,
      upperConfidenceBound: 0.39,
    });
  });

  it("saves atomically and reopens the same validated canonical state", async () => {
    const storage = new MemoryStorage();
    const saved = await saveProjectStatePackage({
      storage,
      databaseCodec: jsonCodec,
      target: "/projects/wb.lsa",
      state: fixtureState(),
      sha256,
      appVersion: "0.1.0",
      savedAt: "2026-08-20T01:00:00Z",
    });
    const reopened = await openProjectStatePackage({
      storage,
      databaseCodec: jsonCodec,
      target: "/projects/wb.lsa",
      sha256,
    });

    expect(reopened).toEqual(saved);
    expect(storage.packages.get("/projects/wb.lsa")?.has("project.sqlite")).toBe(true);
    expect(storage.packages.get("/projects/wb.lsa")?.has("raw/exports/canonical.csv")).toBe(true);
  });

  it("opens a Public Alpha v0.2 package and preserves it through current save/reopen", async () => {
    const storage = new MemoryStorage();
    const current = analyzedFixtureState();
    await savePublicAlphaV02Fixture({
      storage,
      target: "/projects/public-alpha-v0.2.lsa",
      state: current,
      rawExport:
        "unit_id,condition,outcome,value\nunit.dark.1,condition.dark,outcome.wb,1\nunit.light.1,condition.light,outcome.wb,1.4\n",
    });

    const opened = await openProjectStatePackage({
      storage,
      databaseCodec: jsonCodec,
      target: "/projects/public-alpha-v0.2.lsa",
      sha256,
    });

    expect(opened.schemaVersion).toBe("0.3.0");
    expect(opened.experimentWorkspace).toBeNull();
    expect(opened.observations.map(({ measurement }) => measurement)).toEqual([
      { kind: "scalar", value: 1 },
      { kind: "scalar", value: 1.4 },
    ]);
    expect(opened.analysisRuns).toHaveLength(1);
    expect(opened.analysisRuns[0]?.request.requestId).toBe("request.roundtrip.1");
    expect(opened.analysisRuns[0]?.result.warnings).toEqual([
      {
        code: "numerical_library_reliability_warning",
        message: "The numerical library reported a reliability warning.",
      },
    ]);
    expect(opened.graphs).toHaveLength(1);
    expect(opened.graphs[0]?.spec.analysisResultId).toBe("request.roundtrip.1");

    const resaved = await saveProjectStatePackage({
      storage,
      databaseCodec: jsonCodec,
      target: "/projects/public-alpha-v0.2-resaved.lsa",
      state: opened,
      sha256,
      appVersion: "0.1.0-next",
      savedAt: "2026-08-20T02:00:00Z",
    });
    const reopened = await openProjectStatePackage({
      storage,
      databaseCodec: jsonCodec,
      target: "/projects/public-alpha-v0.2-resaved.lsa",
      sha256,
    });

    expect(reopened).toEqual(resaved);
    expect(reopened.observations).toEqual(opened.observations);
    expect(reopened.unitInstances).toEqual(opened.unitInstances);
    expect(reopened.analysisRuns).toEqual(opened.analysisRuns);
    expect(reopened.graphs).toEqual(opened.graphs);
  });

  it("migrates Public Alpha Survival event and censoring records without treating censoring as missing", async () => {
    const storage = new MemoryStorage();
    const base = fixtureState();
    const survivalState = createInitialProjectState({
      metadata: {
        ...base.metadata,
        projectId: "project.alpha-survival",
        projectName: "Alpha survival",
      },
      design: {
        ...base.designRevisions[0]!.design,
        id: "design.alpha-survival",
        outcomes: [
          {
            id: "outcome.survival",
            key: "survival",
            label: "Survival",
            type: "time_to_event",
            unit: "days",
          },
        ],
      },
      rawRevision: { ...base.rawRevisions[0]!, id: "raw.alpha-survival" },
      unitInstances: base.unitInstances,
      observations: base.observations.map((observation, index) => ({
        ...observation,
        id: `alpha-survival.${index}`,
        rawRevisionId: "raw.alpha-survival",
        outcomeId: "outcome.survival",
        measurement: {
          kind: "time_to_event" as const,
          followUpTime: index === 0 ? 12 : 18,
          eventObserved: index === 0,
        },
      })),
      actor: "researcher",
    });

    await savePublicAlphaV02Fixture({
      storage,
      target: "/projects/public-alpha-survival.lsa",
      state: survivalState,
      rawExport:
        "unit_id,condition,outcome,follow_up_time,event_observed\nunit.dark.1,condition.dark,outcome.survival,12,true\nunit.light.1,condition.light,outcome.survival,18,false\n",
    });
    const opened = await openProjectStatePackage({
      storage,
      databaseCodec: jsonCodec,
      target: "/projects/public-alpha-survival.lsa",
      sha256,
    });
    const resaved = await saveProjectStatePackage({
      storage,
      databaseCodec: jsonCodec,
      target: "/projects/public-alpha-survival-resaved.lsa",
      state: opened,
      sha256,
      appVersion: "0.1.0-next",
      savedAt: "2026-09-02T02:00:00Z",
    });
    const reopened = await openProjectStatePackage({
      storage,
      databaseCodec: jsonCodec,
      target: "/projects/public-alpha-survival-resaved.lsa",
      sha256,
    });

    expect(reopened).toEqual(resaved);
    expect(reopened.observations.map(({ measurement }) => measurement)).toEqual([
      { kind: "time_to_event", followUpTime: 12, eventObserved: true },
      { kind: "time_to_event", followUpTime: 18, eventObserved: false },
    ]);
  });

  it("migrates Public Alpha ordered X/Y points without changing unit, series, X, or Y identity", async () => {
    const storage = new MemoryStorage();
    const base = fixtureState();
    const orderedState = createInitialProjectState({
      metadata: {
        ...base.metadata,
        projectId: "project.alpha-ordered-xy",
        projectName: "Alpha ordered X/Y",
      },
      design: {
        ...base.designRevisions[0]!.design,
        id: "design.alpha-ordered-xy",
        outcomes: [
          {
            id: "outcome.response",
            key: "response",
            label: "Response",
            type: "continuous",
            unit: "AU",
          },
        ],
      },
      rawRevision: { ...base.rawRevisions[0]!, id: "raw.alpha-ordered-xy" },
      unitInstances: base.unitInstances,
      observations: [
        ["point.a.0", "unit.dark.1", "condition.dark", 0, 0.05],
        ["point.a.5", "unit.dark.1", "condition.dark", 5, 0.66],
        ["point.b.0", "unit.light.1", "condition.light", 0, 0.08],
        ["point.b.5", "unit.light.1", "condition.light", 5, 0.91],
      ].map(([id, unitInstanceId, conditionId, time, value]) => ({
        id: String(id),
        rawRevisionId: "raw.alpha-ordered-xy",
        unitInstanceId: String(unitInstanceId),
        conditionId: String(conditionId),
        outcomeId: "outcome.response",
        time: Number(time),
        measurement: { kind: "scalar" as const, value: Number(value) },
      })),
      actor: "researcher",
    });

    await savePublicAlphaV02Fixture({
      storage,
      target: "/projects/public-alpha-ordered-xy.lsa",
      state: orderedState,
      rawExport:
        "unit_id,series,x,y\nunit.dark.1,condition.dark,0,0.05\nunit.dark.1,condition.dark,5,0.66\nunit.light.1,condition.light,0,0.08\nunit.light.1,condition.light,5,0.91\n",
    });
    const opened = await openProjectStatePackage({
      storage,
      databaseCodec: jsonCodec,
      target: "/projects/public-alpha-ordered-xy.lsa",
      sha256,
    });
    const resaved = await saveProjectStatePackage({
      storage,
      databaseCodec: jsonCodec,
      target: "/projects/public-alpha-ordered-xy-resaved.lsa",
      state: opened,
      sha256,
      appVersion: "0.1.0-next",
      savedAt: "2026-09-02T02:00:00Z",
    });
    const reopened = await openProjectStatePackage({
      storage,
      databaseCodec: jsonCodec,
      target: "/projects/public-alpha-ordered-xy-resaved.lsa",
      sha256,
    });

    expect(reopened).toEqual(resaved);
    expect(
      reopened.observations.map(({ id, unitInstanceId, conditionId, time, measurement }) => ({
        id,
        unitInstanceId,
        conditionId,
        time,
        measurement,
      })),
    ).toEqual(
      orderedState.observations.map(
        ({ id, unitInstanceId, conditionId, time, measurement }) => ({
          id,
          unitInstanceId,
          conditionId,
          time,
          measurement,
        }),
      ),
    );
  });

  it("reopens exact unresolved entry history without making it canonical data", async () => {
    const storage = new MemoryStorage();
    const source = createUnresolvedVisualizationProjectState({
      metadata: {
        projectId: "visualization.roundtrip-source",
        projectName: "Roundtrip source",
        experimentDate: "",
        createdAt: "2026-08-20T00:00:00Z",
        updatedAt: "2026-08-20T00:00:00Z",
      },
      entryIntent: "graph_only",
      table: {
        id: "table.roundtrip-source",
        headers: ["Condition", "Value"],
        rows: [["Dark", "1"]],
        delimiter: "tab",
        headerRow: 1,
      },
      rawLineage: {
        sourceKind: "clipboard",
        sourceLabel: "clipboard",
        importedAt: "2026-08-20T00:00:00Z",
        rawText: "Condition\tValue\nDark\t1",
        sha256: null,
        transformations: ["delimiter_detection"],
      },
      mapping: {
        schemaVersion: "0.1.0",
        sourceLabel: "clipboard",
        delimiter: "tab",
        headerRow: 1,
        columns: [
          { index: 0, header: "Condition", role: "x" },
          { index: 1, header: "Value", role: "y" },
        ],
        identityDecision: "no_id",
        confirmedAt: "2026-08-20T00:00:00Z",
      },
      actor: "researcher",
    });
    const entrySourceHistory = createUnresolvedVisualizationPromotionHistory({
      sourceState: source,
      promotedWorkspaceGraphId: null,
      capturedAt: "2026-08-20T00:30:00Z",
    });
    const base = fixtureState();
    const state = ProjectStateSchema.parse({
      ...base,
      experimentWorkspace: {
        version: "0.1.0",
        dataOrigin: "research",
        context: "protein_biochemical",
        readoutDefinitions: [],
        conditionAttributes: [{ id: "factor.condition", label: "Condition" }],
        conditions: [
          {
            id: "condition.dark",
            label: "Dark",
            attributes: { "factor.condition": "Dark" },
          },
          {
            id: "condition.light",
            label: "Light",
            attributes: { "factor.condition": "Light" },
          },
        ],
        analysisIntent: { kind: "group_comparison" },
        conditionAssignment: { kind: "independent", unitLabel: "Dish" },
        timePlan: { sampling: "none", unit: "h", points: [] },
        experimentSessions: [{ id: "experiment.1", label: "Exp 1", date: "2026-08-20", note: "" }],
        entrySourceHistory,
        dataViewMode: "compact",
        adaptiveInput: null,
        notPlannedCellKeys: [],
        graphs: [],
      },
    });
    const saved = await saveProjectStatePackage({
      storage,
      databaseCodec: jsonCodec,
      target: "/projects/promoted.lsa",
      state,
      sha256,
      appVersion: "0.1.0",
      savedAt: "2026-08-20T01:00:00Z",
    });
    const reopened = await openProjectStatePackage({
      storage,
      databaseCodec: jsonCodec,
      target: "/projects/promoted.lsa",
      sha256,
    });

    expect(reopened.experimentWorkspace?.entrySourceHistory).toEqual(entrySourceHistory);
    expect(reopened.rawRevisions).toEqual(saved.rawRevisions);
    expect(reopened.activeRawRevisionId).toBe(saved.activeRawRevisionId);
  });

  it("reopens immutable raw heatmap data, transform provenance, and missing values", async () => {
    const storage = new MemoryStorage();
    const rawMatrix = {
      version: "0.1.0" as const,
      rowIds: ["feature.1", "feature.2"],
      rowLabels: ["Feature one", "Feature two"],
      columnIds: ["sample.1", "sample.2"],
      columnLabels: ["Sample one", "Sample two"],
      values: [
        [1, null],
        [2, 4],
      ],
    };
    const state = appendMatrixView(fixtureState(), {
      id: "matrix-view.1",
      rawMatrix,
      createdAt: "2026-08-20T00:30:00Z",
      actor: "researcher",
      spec: createHeatmapGraphSpec({
        graphId: "graph.heatmap.1",
        dataSource: { kind: "raw_revision", id: "raw.1", revision: "raw.1" },
        transform: "row_z_score",
        missingColor: "#cccccc",
      }),
    });
    const saved = await saveProjectStatePackage({
      storage,
      databaseCodec: jsonCodec,
      target: "/projects/heatmap.lsa",
      state,
      sha256,
      appVersion: "0.1.0",
      savedAt: "2026-08-20T01:00:00Z",
    });
    const reopened = await openProjectStatePackage({
      storage,
      databaseCodec: jsonCodec,
      target: "/projects/heatmap.lsa",
      sha256,
    });
    expect(reopened).toEqual(saved);
    expect(reopened.matrixViews?.[0]?.rawMatrix.values[0]?.[1]).toBeNull();
    expect(reopened.matrixViews?.[0]?.spec.heatmap).toMatchObject({
      transform: "row_z_score",
      transformVersion: "0.1.0",
    });
  });

  it("reopens event and censor status as scientific data, not missing values", async () => {
    const storage = new MemoryStorage();
    const base = fixtureState();
    const survivalState = createInitialProjectState({
      metadata: { ...base.metadata, projectId: "project.survival", projectName: "Survival" },
      design: {
        ...base.designRevisions[0]!.design,
        id: "design.survival",
        outcomes: [
          {
            id: "outcome.survival",
            key: "survival",
            label: "Survival",
            type: "time_to_event",
            unit: "days",
          },
        ],
      },
      rawRevision: { ...base.rawRevisions[0]!, id: "raw.survival" },
      unitInstances: base.unitInstances,
      observations: base.observations.map((observation, index) => ({
        ...observation,
        id: `survival.${index}`,
        rawRevisionId: "raw.survival",
        outcomeId: "outcome.survival",
        measurement: {
          kind: "time_to_event" as const,
          followUpTime: index + 3,
          eventObserved: index === 0,
        },
      })),
      actor: "researcher",
    });
    await saveProjectStatePackage({
      storage,
      databaseCodec: jsonCodec,
      target: "/projects/survival.lsa",
      state: survivalState,
      sha256,
      appVersion: "0.1.0",
      savedAt: "2026-08-20T01:00:00Z",
    });
    const reopened = await openProjectStatePackage({
      storage,
      databaseCodec: jsonCodec,
      target: "/projects/survival.lsa",
      sha256,
    });
    expect(reopened.observations.map(({ measurement }) => measurement)).toEqual([
      { kind: "time_to_event", followUpTime: 3, eventObserved: true },
      { kind: "time_to_event", followUpTime: 4, eventObserved: false },
    ]);
  });
});

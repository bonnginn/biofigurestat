import { describe, expect, it } from "vitest";
import type { ProjectState } from "./state";
import { assembleProjectPackage, createCanonicalRawCsv } from "./assembly";

const sha256 = async (data: Uint8Array) => data.byteLength.toString(16).padStart(64, "0");

const state = {
  schemaVersion: "0.3.0",
  metadata: {
    projectId: "project.test",
    projectName: "Cilia, experiment",
    experimentDate: "2026-08-20",
    createdAt: "2026-08-20T00:00:00Z",
    updatedAt: "2026-08-20T00:00:00Z",
  },
  designRevisions: [
    {
      id: "design-revision.1",
      previousRevisionId: null,
      createdAt: "2026-08-20T00:00:00Z",
      createdBy: "researcher",
      design: {
        schemaVersion: "0.2.0",
        id: "design.test",
        name: "Cilia",
        purpose: "microscopy",
        outcomes: [
          {
            id: "outcome.cilia",
            key: "cilia",
            label: "Cilia positive",
            type: "proportion_counts",
          },
        ],
        factors: [
          {
            id: "factor.condition",
            key: "condition",
            label: "Condition",
            levels: [
              { id: "level.a", label: "A", order: 0 },
              { id: "level.b", label: "B", order: 1 },
            ],
          },
        ],
        conditions: [
          { id: "condition.a", label: "A", factorLevels: { "factor.condition": "level.a" } },
          { id: "condition.b", label: "B", factorLevels: { "factor.condition": "level.b" } },
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
          id: "contrast.primary",
          label: "A vs B",
          conditionIds: ["condition.a", "condition.b"],
        },
        wizardRuleVersion: "0.1.0",
        wizardDecisions: [],
        createdAt: "2026-08-20T00:00:00Z",
      },
    },
  ],
  activeDesignRevisionId: "design-revision.1",
  rawRevisions: [
    {
      id: "raw.1",
      previousRevisionId: null,
      sourceKind: "manual",
      createdAt: "2026-08-20T00:00:00Z",
      createdBy: "researcher",
    },
  ],
  activeRawRevisionId: "raw.1",
  unitInstances: [
    { id: "unit.1", levelId: "unit-level.dish", parentUnitId: null, label: "Dish 1", metadata: {} },
  ],
  observations: [
    {
      id: "observation.1",
      rawRevisionId: "raw.1",
      unitInstanceId: "unit.1",
      conditionId: "condition.a",
      outcomeId: "outcome.cilia",
      experimentDate: "2026-08-18",
      measurement: { kind: "proportion", numerator: 42, denominator: 100 },
    },
  ],
  transformations: [],
  derivedDatasetRevisions: [],
  derivedValues: [],
  analysisRuns: [],
  graphs: [],
  experimentWorkspace: null,
  provenanceEvents: [
    {
      id: "provenance.created",
      kind: "project_created",
      targetId: "project.test",
      occurredAt: "2026-08-20T00:00:00Z",
      actor: "researcher",
      detail: "Created.",
    },
  ],
} satisfies ProjectState;

describe("project package assembly", () => {
  it("keeps proportion numerator and denominator in the recovery CSV", () => {
    const csv = new TextDecoder().decode(createCanonicalRawCsv(state));
    expect(csv).toContain("proportion,,42,100");
    expect(csv).toContain("unit.1,2026-08-18,condition.a");
  });

  it("keeps both source WB band intensities and transformation version in recovery CSV", () => {
    const wbState: ProjectState = {
      ...state,
      observations: [
        {
          ...state.observations[0],
          measurement: {
            kind: "loading_control_ratio",
            target: 120,
            loadingControl: 30,
            transformationVersion: "0.1.0",
          },
        },
      ],
    };
    const csv = new TextDecoder().decode(createCanonicalRawCsv(wbState));
    expect(csv).toContain("loading_control_ratio,,,,120,30,0.1.0");
  });

  it("keeps WB background-correction source measurements in the recovery CSV", () => {
    const wbState: ProjectState = {
      ...state,
      observations: [
        {
          ...state.observations[0],
          measurement: {
            kind: "loading_control_ratio",
            target: 900,
            loadingControl: 600,
            transformationVersion: "0.1.0",
            sourceMeasurements: {
              method: "mean_intensity_minus_mean_background_times_area",
              version: "0.1.0",
              target: { intensity: 20, background: 5, area: 60 },
              loadingControl: { intensity: 14, background: 4, area: 60 },
            },
          },
        },
      ],
    };
    const csv = new TextDecoder().decode(createCanonicalRawCsv(wbState));
    expect(csv).toContain("mean_intensity_minus_mean_background_times_area,20,5,60,14,4,60");
  });

  it("declares the SQLite database and canonical raw export with checksums", async () => {
    const database = Uint8Array.from([1, 2, 3]);
    const assembled = await assembleProjectPackage(
      state,
      database,
      sha256,
      "0.1.0",
      "2026-08-20T01:00:00Z",
    );
    expect(assembled.manifest.files.map((file) => file.path)).toEqual([
      "project.sqlite",
      "raw/exports/canonical.csv",
      "derived/lineage.json",
    ]);
    expect(assembled.payloads["project.sqlite"]).toEqual(database);
  });
});

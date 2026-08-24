import { describe, expect, it } from "vitest";
import { appendMatrixView, createInitialProjectState } from "./state";
import { createHeatmapGraphSpec } from "@lsaa/graph-spec";
import {
  openProjectStatePackage,
  saveProjectStatePackage,
  type ProjectDatabaseCodec,
} from "./round-trip";
import type { AtomicProjectWrite, ProjectPackageStorage, Sha256Function } from "./package-io";

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

describe("populated project round trip", () => {
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

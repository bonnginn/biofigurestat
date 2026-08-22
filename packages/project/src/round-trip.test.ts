import { describe, expect, it } from "vitest";
import { createInitialProjectState } from "./state";
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
});

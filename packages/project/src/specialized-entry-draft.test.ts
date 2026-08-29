import { describe, expect, it } from "vitest";

import type { AtomicProjectWrite, ProjectPackageStorage } from "./package-io";
import {
  createSpecializedEntryDraftProjectState,
  deserializeSpecializedEntryDraftProjectState,
  migrateSpecializedEntryDraftProjectState,
  serializeSpecializedEntryDraftProjectState,
} from "./specialized-entry-draft";
import {
  openProjectStatePackage,
  openSpecializedEntryDraftProjectPackage,
  openUnresolvedVisualizationProjectPackage,
  saveSpecializedEntryDraftProjectPackage,
} from "./round-trip";

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

const timestamp = "2026-08-28T10:00:00.000Z";

function survivalFixture() {
  const rawText =
    "Unit ID\tGroup\tFollow-up time\tStatus\r\nmouse-1\tControl\t4\tEvent\r\nmouse-2\tDrug\t\tCensored";
  return createSpecializedEntryDraftProjectState({
    metadata: {
      projectId: "project.specialized.survival",
      projectName: "Incomplete survival entry",
      experimentDate: "",
      createdAt: timestamp,
      updatedAt: timestamp,
    },
    route: "survival",
    entryIntent: {
      schemaVersion: "0.1.0",
      moduleId: "time_to_event",
      destination: "survival",
      sourceContext: "animal",
      entryRouteId: "time_to_event",
      experimentName: "Mouse survival",
      experimentDescription: "Animals were followed until a terminal event or censoring.",
      subjectUnitLabel: "Animal",
      facts: {
        timeToEventPattern: "single_terminal_event_or_censoring",
        subjectUnitRelationship: "unknown",
      },
    },
    rawTable: {
      schemaVersion: "0.1.0",
      headers: ["Unit ID", "Group", "Follow-up time", "Status"],
      rows: [
        ["mouse-1", "Control", "4", "Event"],
        ["mouse-2", "Drug", "", "Censored"],
      ],
      delimiter: "tab",
      headerRow: 1,
    },
    rawLineage: {
      schemaVersion: "0.1.0",
      sourceKind: "clipboard",
      sourceLabel: "survival-paste",
      capturedAt: timestamp,
      rawText,
    },
    answers: {
      kind: "survival",
      subjectUnitRelationship: "unknown",
      followUpUnit: "days",
      numericStatusMapping: null,
      statisticsSetupExpanded: false,
      showLogRankAnnotation: false,
    },
    safeStop: {
      status: "input_invalid",
      reasonCodes: ["SURVIVAL_FOLLOW_UP_TIME_REQUIRED"],
    },
    provenanceEvents: [
      {
        id: "specialized-draft.create.1",
        kind: "specialized_entry_draft_created",
        occurredAt: timestamp,
        actor: "researcher",
      },
    ],
  });
}

function orderedCurveFixture() {
  const rawText =
    "Unit ID\tSeries\tX\tY\nreaction-1\tEnzyme A\t0\t0\nreaction-1\tEnzyme A\t5\t2.4";
  return createSpecializedEntryDraftProjectState({
    metadata: {
      projectId: "project.specialized.curve",
      projectName: "Nested kinetic entry",
      experimentDate: "",
      createdAt: timestamp,
      updatedAt: timestamp,
    },
    route: "nonlinear-fit",
    entryIntent: {
      schemaVersion: "0.1.0",
      moduleId: "ordered_curve_kinetics",
      destination: "nonlinear-fit",
      sourceContext: "protein_biochemical",
      entryRouteId: "ordered_curve_kinetics",
      experimentName: "Enzyme kinetics",
      experimentDescription: "Initial velocity was measured across substrate concentrations.",
      subjectUnitLabel: "Reaction",
      facts: { orderedAxisCount: 1 },
    },
    rawTable: {
      schemaVersion: "0.1.0",
      headers: ["Unit ID", "Series", "X", "Y"],
      rows: [
        ["reaction-1", "Enzyme A", "0", "0"],
        ["reaction-1", "Enzyme A", "5", "2.4"],
      ],
      delimiter: "tab",
      headerRow: 1,
    },
    rawLineage: {
      schemaVersion: "0.1.0",
      sourceKind: "clipboard",
      sourceLabel: "ordered-curve-data",
      capturedAt: timestamp,
      rawText,
    },
    answers: {
      kind: "ordered_curve",
      facts: {
        orderedAxisCount: 2,
        orderedAxisMeaning: "substrate_concentration",
        axisMaterialRelationship: "separate_material_per_axis_value",
        axisPointParentRelationship: "shared_parent_or_matching",
      },
      xLabel: "Substrate concentration",
      yLabel: "Initial velocity",
      xUnit: "µM",
      yUnit: "µmol/min",
      nonlinearModel: "michaelis_menten",
      nonlinearModelExplicitlySelected: true,
      michaelisReadoutMeaning: "calculated_initial_velocity",
      modelRationale: "Explicit single-substrate initial-velocity model",
      fitSettings: {
        vmax: { initial: "", lower: "0", upper: "" },
        km: { initial: "", lower: "0", upper: "" },
      },
    },
    safeStop: {
      status: "safe_unsupported",
      reasonCodes: ["MULTIPLE_ORDERED_AXES_UNSUPPORTED"],
    },
    provenanceEvents: [
      {
        id: "specialized-draft.create.1",
        kind: "specialized_entry_draft_created",
        occurredAt: timestamp,
        actor: "researcher",
      },
    ],
  });
}

describe("specialized entry draft persistence", () => {
  it.each([survivalFixture, orderedCurveFixture])(
    "retains the exact raw text, route, answers, and safe stop in a byte round trip",
    (fixture) => {
      const state = fixture();
      const reopened = deserializeSpecializedEntryDraftProjectState(
        serializeSpecializedEntryDraftProjectState(state),
      );

      expect(reopened).toEqual(state);
      expect(reopened.rawLineage.rawText).toBe(state.rawLineage.rawText);
      expect(reopened.route).toBe(state.route);
      expect(reopened.answers).toEqual(state.answers);
      expect(reopened.safeStop).toEqual(state.safeStop);
      expect(reopened).not.toHaveProperty("designRevisions");
      expect(reopened).not.toHaveProperty("analysisRuns");
      expect(reopened).not.toHaveProperty("graphSpecs");
    },
  );

  it("round-trips through the common .lsa container and checks the raw recovery export", async () => {
    const storage = new MemoryStorage();
    const state = orderedCurveFixture();
    const savedAt = "2026-08-28T10:30:00.000Z";

    const saved = await saveSpecializedEntryDraftProjectPackage({
      storage,
      target: "curve-draft.lsa",
      state,
      sha256,
      appVersion: "0.1.0",
      savedAt,
    });
    const reopened = await openSpecializedEntryDraftProjectPackage({
      storage,
      target: "curve-draft.lsa",
      sha256,
    });

    expect(reopened).toEqual(saved);
    expect(reopened.metadata.updatedAt).toBe(savedAt);
    expect(reopened.rawLineage.rawText).toBe(state.rawLineage.rawText);
    expect(reopened.provenanceEvents.at(-1)?.kind).toBe("specialized_entry_draft_saved");
    await expect(
      openUnresolvedVisualizationProjectPackage({
        storage,
        target: "curve-draft.lsa",
        sha256,
      }),
    ).rejects.toThrow("PROJECT_KIND_IS_NOT_UNRESOLVED_VISUALIZATION");
    await expect(
      openProjectStatePackage({
        storage,
        target: "curve-draft.lsa",
        sha256,
        databaseCodec: {
          encode: async () => new Uint8Array(),
          decode: async () => {
            throw new Error("The specialized draft must be rejected before SQLite decode");
          },
        },
      }),
    ).rejects.toThrow("PROJECT_KIND_REQUIRES_UNRESOLVED_VISUALIZATION_READER");
  });

  it("fails closed for an unknown future version rather than guessing a design", () => {
    const future = { ...survivalFixture(), schemaVersion: "9.0.0" };
    expect(migrateSpecializedEntryDraftProjectState(future)).toBe(future);
    expect(() =>
      deserializeSpecializedEntryDraftProjectState(
        new TextEncoder().encode(JSON.stringify(future)),
      ),
    ).toThrow();
  });

  it("rejects route/intent mismatches and ragged retained rows", () => {
    const state = survivalFixture();
    expect(() =>
      createSpecializedEntryDraftProjectState({
        ...state,
        route: "nonlinear-fit",
      }),
    ).toThrow();
    expect(() =>
      createSpecializedEntryDraftProjectState({
        ...state,
        rawTable: { ...state.rawTable, rows: [["mouse-1"]] },
      }),
    ).toThrow();
  });
});

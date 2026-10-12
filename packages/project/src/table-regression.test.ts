import { expect, it } from "vitest";
import {
  createUnresolvedVisualizationProjectState,
  appendUnresolvedVisualizationDataRevision,
  UnresolvedVisualizationProjectStateSchema,
} from "./unresolved-visualization";
import {
  saveUnresolvedVisualizationProjectPackage,
  openUnresolvedVisualizationProjectPackage,
} from "./round-trip";
import type { ProjectPackageStorage } from "./package-io";

function fixture() {
  const at = "2026-10-12T00:00:00Z";
  const state = createUnresolvedVisualizationProjectState({
    metadata: {
      projectId: "p",
      projectName: "Synthetic",
      experimentDate: "",
      createdAt: at,
      updatedAt: at,
    },
    entryIntent: "graph_only",
    table: {
      id: "t",
      headers: ["ID", "X", "Y"],
      rows: [
        ["a", "1", "2"],
        ["b", "2", "4"],
        ["c", "3", "6"],
      ],
      delimiter: "tab",
      headerRow: 1,
    },
    rawLineage: {
      sourceKind: "clipboard",
      sourceLabel: "synthetic",
      importedAt: at,
      rawText: "ID\tX\tY\na\t1\t2\nb\t2\t4\nc\t3\t6",
      sha256: null,
      transformations: [],
    },
    actor: "test",
  });
  const draft = {
    text: state.rawLineage.rawText,
    includeIntercept: true,
    xLabel: "X",
    yLabel: "Y",
    xUnit: "",
    yUnit: "",
    xScale: "linear",
    yScale: "linear",
    showBand: true,
  };
  const request = {
    protocolVersion: "0.13.0",
    requestId: "run.1",
    projectId: "p",
    analysisId: "analysis.1",
    templateId: "D16",
    templateVersion: "0.1.0",
    method: "simple_linear_regression",
    xLabel: "X",
    yLabel: "Y",
    xUnit: "",
    yUnit: "",
    includeIntercept: true,
    points: [1, 2, 3].map((x, i) => ({
      observationId: `o.${i}`,
      experimentalUnitId: ["a", "b", "c"][i],
      x,
      y: 2 * x,
    })),
    options: { confidenceLevel: 0.95, alternative: "two_sided", multiplicityMethod: null },
  };
  const result = {
    protocolVersion: "0.13.0",
    requestId: "run.1",
    status: "ok",
    engine: { name: "fixture", version: "test", packages: {} },
    estimates: [],
    tests: [],
    diagnostics: [],
    warnings: [],
    completedAt: at,
  };
  return UnresolvedVisualizationProjectStateSchema.parse({
    ...state,
    regressionWorkspace: {
      schemaVersion: "0.1.0",
      independentUnitsConfirmed: true,
      sourceDataRevisionId: state.activeDataRevisionId,
      draft,
      draftHistory: [{ capturedAt: at, sourceDataRevisionId: state.activeDataRevisionId, draft }],
      executions: [{ sourceDataRevisionId: state.activeDataRevisionId, draft, request, result }],
      activeRequestId: "run.1",
    },
  });
}
it("roundtrips table, settings, execution and lineage through the checksummed atomic project boundary", async () => {
  const files = new Map<string, Uint8Array>();
  const storage: ProjectPackageStorage = {
    readFile: async (_, path) => files.get(path)!,
    beginAtomicWrite: async () => {
      const staged = new Map<string, Uint8Array>();
      return {
        writeFile: async (path, data) => {
          staged.set(path, data);
        },
        commit: async () => {
          files.clear();
          staged.forEach((v, k) => files.set(k, v));
        },
        rollback: async () => {},
      };
    },
  };
  const sha256 = async (data: Uint8Array) => {
    let n = 0;
    for (const b of data) n = (n * 31 + b) >>> 0;
    return n.toString(16).padStart(64, "0");
  };
  const original = fixture();
  const saved = await saveUnresolvedVisualizationProjectPackage({
    storage,
    target: "synthetic.lsa",
    state: original,
    sha256,
    appVersion: "0.1.1",
    savedAt: "2026-10-12T01:00:00Z",
  });
  const reopened = await openUnresolvedVisualizationProjectPackage({
    storage,
    target: "synthetic.lsa",
    sha256,
  });
  expect(reopened).toEqual(saved);
  expect(reopened.regressionWorkspace).toEqual(original.regressionWorkspace);
  expect(reopened.rawLineage).toEqual(original.rawLineage);
});
it("stales upstream edits while retaining every original revision and execution", () => {
  const state = fixture();
  const revised = appendUnresolvedVisualizationDataRevision(state, {
    table: {
      ...state.table,
      rows: [
        ["a", "1", "3"],
        ["b", "2", "4"],
        ["c", "3", "6"],
      ],
    },
    rawLineage: { ...state.rawLineage, rawText: "ID\tX\tY\na\t1\t3\nb\t2\t4\nc\t3\t6" },
    mapping: null,
    actor: "test",
    createdAt: "2026-10-12T01:00:00Z",
  });
  expect(revised.regressionWorkspace!.activeRequestId).toBeNull();
  expect(revised.regressionWorkspace!.executions).toEqual(state.regressionWorkspace!.executions);
  expect(revised.dataRevisions[0]).toEqual(state.dataRevisions[0]);
  expect(
    UnresolvedVisualizationProjectStateSchema.safeParse({
      ...revised,
      regressionWorkspace: { ...revised.regressionWorkspace, activeRequestId: "run.1" },
    }).success,
  ).toBe(false);
});
it("rejects result identity mismatches and future extension versions without rewriting them", () => {
  const state = fixture();
  const original = JSON.stringify(state);
  const bad = structuredClone(state);
  bad.regressionWorkspace!.executions[0].result.requestId = "other";
  expect(UnresolvedVisualizationProjectStateSchema.safeParse(bad).success).toBe(false);
  expect(
    UnresolvedVisualizationProjectStateSchema.safeParse({
      ...state,
      regressionWorkspace: { ...state.regressionWorkspace, schemaVersion: "9.0.0" },
    }).success,
  ).toBe(false);
  expect(JSON.stringify(state)).toBe(original);
});

import { describe, expect, it } from "vitest";
import { CanonicalAdaptiveObservationSchema, StructureContractSchema, type CanonicalAdaptiveObservation, type StructureContract } from "@lsaa/domain";
import { ProjectStateSchema } from "@lsaa/project";
import { createAdaptiveWorkspace } from "./adaptiveWorkspace";
import { createExperimentWorkspaceProject, rehydrateExperimentWorkspace } from "./experimentWorkspaceProject";
import { createAdaptiveSurvivalProject } from "./adaptiveSurvivalProject";
import traceFixture from "../../../../docs/evaluation/experiment-to-structure-navigation-pilot/experiment-first/prototype-runs/case-traces-65.json";

type PrototypeRow = Omit<CanonicalAdaptiveObservation, "observationId" | "readoutKey" | "missingness" | "sourceRow"> & { readoutKey: string | null; missingness: CanonicalAdaptiveObservation["missingness"] | null };
type PrototypeTrace = { caseId: string; structureContract: Omit<StructureContract, "schemaVersion" | "contractId" | "experimentName"> & { schemaVersion: string; caseId: string }; inputPayload: { rows: PrototypeRow[] } };
const traces = traceFixture as unknown as { traces: PrototypeTrace[] };
const now = "2026-08-26T00:00:00.000Z";

function inputFor(trace: PrototypeTrace) {
  const contract = StructureContractSchema.parse({ ...trace.structureContract, schemaVersion: "0.1.0", contractId: trace.caseId.toLowerCase(), experimentName: trace.caseId });
  const observations = trace.inputPayload.rows.map((row, index) => CanonicalAdaptiveObservationSchema.parse({
    observationId: `${contract.contractId}.${index + 1}`,
    readoutKey: row.readoutKey ?? contract.readouts.find((readout) => Object.keys(row.values).some((key) => key === readout.key || key.startsWith(`${readout.key}_`)))?.key ?? contract.readouts[0]!.key,
    identities: row.identities,
    factors: row.factors,
    axes: row.axes,
    hierarchy: row.hierarchy,
    values: row.values,
    missingness: row.missingness ?? {},
    sourceRow: index + 2,
  }));
  return { contract, observations };
}

describe("production UI adapter over the 65-case Gold set", () => {
  it("preserves adaptive semantics through workspace save/open for every representable case", () => {
    const counts = { ready: 0, dedicated_route_required: 0, not_representable: 0 };
    for (const trace of traces.traces) {
      const input = inputFor(trace);
      const result = createAdaptiveWorkspace({ ...input, mapping: null, lineage: null, now });
      counts[result.status]++;
      expect(result.snapshot.contract, trace.caseId).toEqual(input.contract);
      expect(result.snapshot.equivalence.status, trace.caseId).toBe("equivalent");
      if (result.status === "dedicated_route_required") {
        const reopened = ProjectStateSchema.parse(JSON.parse(JSON.stringify(createAdaptiveSurvivalProject(result.snapshot, now))));
        expect(reopened.adaptiveInput?.contract, trace.caseId).toEqual(input.contract);
        expect(reopened.observations.every(({ measurement }) => measurement.kind === "time_to_event"), trace.caseId).toBe(true);
        continue;
      }
      if (result.status !== "ready" || !result.draft) continue;
      const state = createExperimentWorkspaceProject({ draft: result.draft, cells: result.cells, graphs: [], now });
      const reopened = ProjectStateSchema.parse(JSON.parse(JSON.stringify(state)));
      expect(reopened.adaptiveInput?.contract, trace.caseId).toEqual(input.contract);
      expect(reopened.experimentWorkspace?.adaptiveInput?.rawLineage, trace.caseId).toBeNull();
      expect(rehydrateExperimentWorkspace(reopened)?.draft.adaptiveInput?.contract, trace.caseId).toEqual(input.contract);
    }
    expect(Object.values(counts).reduce((sum, value) => sum + value, 0)).toBe(65);
    expect(counts).toEqual({ ready: 63, dedicated_route_required: 2, not_representable: 0 });
  });

  it("rejects a persisted snapshot whose contract no longer matches the active design", () => {
    const input = inputFor(traces.traces[0]!);
    const workspace = createAdaptiveWorkspace({ ...input, mapping: null, lineage: null, now });
    const state = createExperimentWorkspaceProject({ draft: workspace.draft!, cells: workspace.cells, graphs: [], now });
    const corrupted = { ...state, adaptiveInput: { ...state.adaptiveInput!, contract: { ...state.adaptiveInput!.contract, experimentName: "corrupted" } } };
    expect(ProjectStateSchema.safeParse(corrupted).success).toBe(false);
  });
});

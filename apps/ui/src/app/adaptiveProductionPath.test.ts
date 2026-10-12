import { describe, expect, it } from "vitest";
import {
  CanonicalAdaptiveObservationSchema,
  StructureContractSchema,
  type CanonicalAdaptiveObservation,
  type StructureContract,
} from "@lsaa/domain";
import { ProjectStateSchema } from "@lsaa/project";
import { buildStructureContract, projectContractToExperimentDesign } from "@lsaa/adaptive-input";
import { createAdaptiveWorkspace } from "./adaptiveWorkspace";
import { experimentCellKey } from "./experimentDraft";
import {
  createExperimentWorkspaceDesign,
  createExperimentWorkspaceProject,
  rehydrateExperimentWorkspace,
} from "./experimentWorkspaceProject";
import { createAdaptiveSurvivalProject } from "./adaptiveSurvivalProject";
import traceFixture from "../../../../docs/evaluation/experiment-to-structure-navigation-pilot/experiment-first/prototype-runs/case-traces-65.json";

type PrototypeRow = Omit<
  CanonicalAdaptiveObservation,
  "observationId" | "readoutKey" | "missingness" | "sourceRow"
> & { readoutKey: string | null; missingness: CanonicalAdaptiveObservation["missingness"] | null };
type PrototypeTrace = {
  caseId: string;
  structureContract: Omit<StructureContract, "schemaVersion" | "contractId" | "experimentName"> & {
    schemaVersion: string;
    caseId: string;
  };
  inputPayload: { rows: PrototypeRow[] };
};
const traces = traceFixture as unknown as { traces: PrototypeTrace[] };
const now = "2026-08-26T00:00:00.000Z";

function inputFor(trace: PrototypeTrace) {
  const contract = StructureContractSchema.parse({
    ...trace.structureContract,
    schemaVersion: "0.1.0",
    contractId: trace.caseId.toLowerCase(),
    experimentName: trace.caseId,
  });
  const observations = trace.inputPayload.rows.map((row, index) =>
    CanonicalAdaptiveObservationSchema.parse({
      observationId: `${contract.contractId}.${index + 1}`,
      readoutKey:
        row.readoutKey ??
        contract.readouts.find((readout) =>
          Object.keys(row.values).some(
            (key) => key === readout.key || key.startsWith(`${readout.key}_`),
          ),
        )?.key ??
        contract.readouts[0]!.key,
      identities: row.identities,
      factors: row.factors,
      axes: row.axes,
      hierarchy: row.hierarchy,
      values: row.values,
      missingness: row.missingness ?? {},
      sourceRow: index + 2,
    }),
  );
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
      expect(result.snapshot.equivalence.status, trace.caseId).not.toBe("mismatch");
      const design = projectContractToExperimentDesign(
        input.contract,
        Math.max(1, input.observations.length),
        now,
      );
      if (design.adaptiveStructure?.analysisCompatibility === "blocked") {
        expect(result.status, trace.caseId).not.toBe("ready");
      }
      if (result.status === "dedicated_route_required") {
        expect(result.snapshot.equivalence.status, trace.caseId).toBe("equivalent");
        const reopened = ProjectStateSchema.parse(
          JSON.parse(JSON.stringify(createAdaptiveSurvivalProject(result.snapshot, now))),
        );
        expect(reopened.adaptiveInput?.contract, trace.caseId).toEqual(input.contract);
        expect(
          reopened.observations.every(({ measurement }) => measurement.kind === "time_to_event"),
          trace.caseId,
        ).toBe(true);
        continue;
      }
      if (result.status !== "ready" || !result.draft) {
        expect(result.draft, trace.caseId).toBeNull();
        expect(result.cells, trace.caseId).toEqual({});
        expect(result.snapshot.canonicalObservations, trace.caseId).toEqual(input.observations);
        continue;
      }
      expect(result.snapshot.equivalence.status, trace.caseId).toBe("equivalent");
      const state = createExperimentWorkspaceProject({
        draft: result.draft,
        cells: result.cells,
        graphs: [],
        now,
      });
      const reopened = ProjectStateSchema.parse(JSON.parse(JSON.stringify(state)));
      expect(reopened.adaptiveInput?.contract, trace.caseId).toEqual(input.contract);
      expect(reopened.experimentWorkspace?.adaptiveInput?.rawLineage, trace.caseId).toBeNull();
      expect(
        rehydrateExperimentWorkspace(reopened)?.draft.adaptiveInput?.contract,
        trace.caseId,
      ).toEqual(input.contract);
    }
    expect(Object.values(counts).reduce((sum, value) => sum + value, 0)).toBe(65);
    expect(counts).toEqual({ ready: 31, dedicated_route_required: 2, not_representable: 32 });
  });

  it("safe-stops blocked matching without relabelling it as independent", () => {
    const trace = traces.traces.find(
      ({ structureContract }) => structureContract.matching.kind === "blocked",
    )!;
    const input = inputFor(trace);
    const workspace = createAdaptiveWorkspace({ ...input, mapping: null, lineage: null, now });

    expect(workspace.status).toBe("not_representable");
    expect(workspace.draft).toBeNull();
    expect(workspace.cells).toEqual({});
    expect(workspace.snapshot.contract.matching.kind).toBe("blocked");
    expect(workspace.snapshot.canonicalObservations).toEqual(input.observations);
    expect(workspace.diagnostics).toContain("legacy_workspace_does_not_support_blocked_matching");
  });

  it("retains finite numeric axes and safe-stops a string axis that the legacy model would lose", () => {
    const trace = traces.traces.find(({ caseId }) => caseId === "ETS-Z8P2HC")!;
    const temporal = inputFor(trace);
    const temporalWorkspace = createAdaptiveWorkspace({
      ...temporal,
      mapping: null,
      lineage: null,
      now,
    });
    expect(temporalWorkspace.status).toBe("ready");
    expect(temporalWorkspace.draft?.time.axisSemantic).toBe("time");
    expect(temporalWorkspace.draft?.time.axisUnit).toBe("week");

    const distanceContract = StructureContractSchema.parse({
      ...temporal.contract,
      contractId: "ordered-distance-axis",
      orderedAxes: temporal.contract.orderedAxes.map((axis) => ({
        ...axis,
        key: "radius",
        label: "Radius",
        unit: "um",
      })),
      readouts: temporal.contract.readouts.map((readout) => ({
        ...readout,
        axisKeys: ["radius"],
      })),
    });
    const distanceObservations = temporal.observations.map((observation) => ({
      ...observation,
      axes: { radius: observation.axes.week! },
    }));
    const distanceWorkspace = createAdaptiveWorkspace({
      contract: distanceContract,
      observations: distanceObservations,
      mapping: null,
      lineage: null,
      now,
    });
    expect(distanceWorkspace.status).toBe("ready");
    expect(distanceWorkspace.draft?.time.axisSemantic).toBe("numeric_covariate");
    expect(distanceWorkspace.draft?.time.axisTitle).toBe("Radius");
    expect(distanceWorkspace.draft?.time.axisUnit).toBe("um");

    const stringAxisContract = StructureContractSchema.parse({
      ...distanceContract,
      contractId: "ordered-string-axis",
      orderedAxes: distanceContract.orderedAxes.map((axis) => ({
        ...axis,
        levels: axis.levels.map(String),
      })),
    });
    const stringAxisObservations = distanceObservations.map((observation) => ({
      ...observation,
      axes: { radius: String(observation.axes.radius) },
    }));
    const stringAxisWorkspace = createAdaptiveWorkspace({
      contract: stringAxisContract,
      observations: stringAxisObservations,
      mapping: null,
      lineage: null,
      now,
    });
    expect(stringAxisWorkspace.status).toBe("not_representable");
    expect(stringAxisWorkspace.draft).toBeNull();
    expect(stringAxisWorkspace.cells).toEqual({});
    expect(stringAxisWorkspace.snapshot.canonicalObservations).toEqual(stringAxisObservations);
    expect(stringAxisWorkspace.diagnostics).toContain(
      'legacy_workspace_cannot_losslessly_project_ordered_axis_level:radius:1:"0"',
    );
  });

  it("does not invent one global control cell when a factorial reference is incomplete", () => {
    const contract = buildStructureContract({
      experimentName: "Factorial treatment",
      experimentDescription: "Independent dishes received one treatment and one induction state.",
      experimentalUnitLabel: "culture dish",
      identityLabel: "Dish ID",
      readoutLabel: "Signal",
      readoutRepresentation: "scalar",
      factorName: "Treatment",
      factorLevels: ["Control", "Drug"],
      additionalFactors: [
        { name: "Induction", levels: ["−", "+"], sameIdentityAcrossConditions: false },
      ],
      sameIdentityAcrossConditions: false,
    });

    const workspace = createAdaptiveWorkspace({
      contract,
      observations: [],
      mapping: null,
      lineage: null,
      now,
    });

    expect(workspace.status).toBe("ready");
    expect(workspace.draft?.controlConditionId).toBeUndefined();
    expect(workspace.draft?.conditions.some(({ role }) => role === "primary")).toBe(false);
  });

  it("does not infer a run, day, or batch identity from adaptive worksheet row order", () => {
    const independentContract = buildStructureContract({
      experimentName: "Independent dishes",
      experimentDescription: "Separate dishes received vehicle or drug independently.",
      experimentalUnitLabel: "Culture dish",
      identityLabel: "Dish ID",
      readoutLabel: "Signal",
      readoutRepresentation: "scalar",
      factorName: "Treatment",
      factorLevels: ["Vehicle", "Drug"],
      sameIdentityAcrossConditions: false,
    });
    const independentObservations = [
      ["vehicle-1", "Vehicle", 1],
      ["vehicle-2", "Vehicle", 2],
      ["drug-1", "Drug", 3],
      ["drug-2", "Drug", 4],
    ].map(([identity, treatment, value], index) =>
      CanonicalAdaptiveObservationSchema.parse({
        observationId: `independent-session.${index + 1}`,
        readoutKey: "signal",
        identities: { dishid: identity },
        factors: { treatment },
        axes: {},
        hierarchy: {},
        values: { signal: value },
        missingness: {},
        sourceRow: index + 2,
      }),
    );
    const independent = createAdaptiveWorkspace({
      contract: independentContract,
      observations: independentObservations,
      mapping: null,
      lineage: null,
      now,
    });
    expect(independent.status).toBe("ready");
    expect(independent.draft?.experiments).toHaveLength(2);
    expect(independent.draft?.experiments.every(({ sessionId }) => sessionId === undefined)).toBe(
      true,
    );
    expect(independent.draft?.experiments.every(({ date }) => date === "")).toBe(true);

    const matchedContract = buildStructureContract({
      experimentName: "Repeated cells",
      experimentDescription: "The same cells were measured before and after treatment.",
      experimentalUnitLabel: "Cell",
      identityLabel: "Cell ID",
      readoutLabel: "Signal",
      readoutRepresentation: "scalar",
      factorName: "Condition",
      factorLevels: ["Before", "After"],
      sameIdentityAcrossConditions: true,
    });
    const emptyMatched = createAdaptiveWorkspace({
      contract: matchedContract,
      observations: [],
      mapping: null,
      lineage: null,
      now,
    });
    expect(emptyMatched.status).toBe("ready");
    expect(emptyMatched.draft?.experiments[0]?.label).toBe("Cell 1");
    const researcherIdentities = ["Run Alpha", "実験回 2", "A B", "A-B"];
    const matchedObservations = researcherIdentities.flatMap((identity, identityIndex) =>
      ["Before", "After"].map((condition, conditionIndex) =>
        CanonicalAdaptiveObservationSchema.parse({
          observationId: `matched-session.${identityIndex * 2 + conditionIndex + 1}`,
          readoutKey: "signal",
          identities: { cellid: identity },
          factors: { condition },
          axes: {},
          hierarchy: {},
          values: { signal: 5 + identityIndex * 2 + conditionIndex },
          missingness: {},
          sourceRow: identityIndex * 2 + conditionIndex + 2,
        }),
      ),
    );
    const matched = createAdaptiveWorkspace({
      contract: matchedContract,
      observations: matchedObservations,
      mapping: null,
      lineage: null,
      now,
    });
    expect(matched.status).toBe("ready");
    expect(matched.draft?.experiments.map(({ stableUnitId }) => stableUnitId)).toEqual([
      "adaptive-unit.1",
      "adaptive-unit.2",
      "adaptive-unit.3",
      "adaptive-unit.4",
    ]);
    expect(matched.draft?.experiments.map(({ label }) => label)).toEqual(researcherIdentities);
    expect(matched.draft?.experiments.every(({ sessionId }) => sessionId === undefined)).toBe(true);

    const saved = createExperimentWorkspaceProject({
      draft: matched.draft!,
      cells: matched.cells,
      graphs: [],
      now,
    });
    const reopened = rehydrateExperimentWorkspace(
      ProjectStateSchema.parse(JSON.parse(JSON.stringify(saved))),
    );
    expect(reopened?.draft.experiments.map(({ stableUnitId }) => stableUnitId)).toEqual([
      "adaptive-unit.1",
      "adaptive-unit.2",
      "adaptive-unit.3",
      "adaptive-unit.4",
    ]);
    expect(reopened?.draft.experiments.map(({ label }) => label)).toEqual(researcherIdentities);
    expect(
      reopened?.draft.adaptiveInput?.canonicalObservations.map(
        ({ observationId }) => observationId,
      ),
    ).toEqual(matchedObservations.map(({ observationId }) => observationId));
    expect(
      reopened?.draft.adaptiveInput?.canonicalObservations.map(
        ({ identities }) => identities.cellid,
      ),
    ).toEqual(matchedObservations.map(({ identities }) => identities.cellid));
  });

  it("safe-stops when an explicitly declared run/source level has no identity", () => {
    const base = buildStructureContract({
      experimentName: "Run-aware dishes",
      experimentDescription: "Dishes were prepared in explicitly recorded independent runs.",
      experimentalUnitLabel: "Culture dish",
      identityLabel: "Dish ID",
      readoutLabel: "Signal",
      readoutRepresentation: "scalar",
      factorName: "Treatment",
      factorLevels: ["Vehicle", "Drug"],
      sameIdentityAcrossConditions: false,
    });
    const contract = StructureContractSchema.parse({
      ...base,
      contractId: "contract.run-aware-dishes",
      unitLevels: [
        { key: "run", label: "Experimental run", role: "block", parentKey: null },
        {
          ...base.unitLevels[0],
          parentKey: "run",
        },
      ],
      identities: [
        { key: "run_id", label: "Run ID", unitLevelKey: "run", required: true },
        ...base.identities,
      ],
    });
    const observation = CanonicalAdaptiveObservationSchema.parse({
      observationId: "run-aware.1",
      readoutKey: "signal",
      identities: { dishid: "dish-1" },
      factors: { treatment: "Vehicle" },
      axes: {},
      hierarchy: {},
      values: { signal: 1 },
      missingness: {},
      sourceRow: 2,
    });

    const workspace = createAdaptiveWorkspace({
      contract,
      observations: [observation],
      mapping: null,
      lineage: null,
      now,
    });
    expect(workspace.status).toBe("not_representable");
    expect(workspace.draft).toBeNull();
    expect(workspace.snapshot.canonicalObservations).toEqual([observation]);
    expect(workspace.diagnostics).toContain(
      "adaptive_observation:run-aware.1:missing_required_identity:run_id",
    );

    const explicitObservation = CanonicalAdaptiveObservationSchema.parse({
      ...observation,
      observationId: "run-aware.explicit.1",
      identities: { run_id: "run-a", dishid: "dish-1" },
    });
    const explicitWorkspace = createAdaptiveWorkspace({
      contract,
      observations: [explicitObservation],
      mapping: null,
      lineage: null,
      now,
    });
    expect(explicitWorkspace.status).toBe("ready");
    if (!explicitWorkspace.draft) throw new Error("Explicit run workspace should be ready");
    const state = createExperimentWorkspaceProject({
      draft: explicitWorkspace.draft,
      cells: explicitWorkspace.cells,
      graphs: [],
      now,
    });
    const runUnit = state.unitInstances.find(({ levelId }) => levelId === "unit-level.run");
    const dishUnit = state.unitInstances.find(
      ({ levelId }) => levelId === "unit-level.culturedish",
    );
    expect(runUnit?.label).toBe("run-a");
    expect(dishUnit?.parentUnitId).toBe(runUnit?.id);
    expect(dishUnit?.metadata.experimentSessionId).toBeUndefined();
    expect(state.designRevisions.at(-1)?.design.pairing).toEqual({ kind: "independent" });
  });

  it("keeps a missing secondary readout aligned to the stable unit order", () => {
    const contract = buildStructureContract({
      experimentName: "Unequal readouts",
      experimentDescription:
        "Three dishes were measured for a primary readout; two also had a secondary readout.",
      experimentalUnitLabel: "culture dish",
      identityLabel: "Dish ID",
      readoutLabel: "Primary",
      readoutRepresentation: "scalar",
      additionalReadouts: [{ label: "Secondary", representation: "scalar" }],
      sameIdentityAcrossConditions: false,
    });
    const observations = [
      ["primary", "dish-A", 10] as const,
      ["primary", "dish-B", 20] as const,
      ["primary", "dish-C", 30] as const,
      ["secondary", "dish-A", 100] as const,
      ["secondary", "dish-C", 300] as const,
    ].map(([readoutKey, identity, value], index) =>
      CanonicalAdaptiveObservationSchema.parse({
        observationId: `unequal-readout.${index + 1}`,
        readoutKey,
        identities: { dishid: identity },
        factors: {},
        axes: {},
        hierarchy: {},
        values: { [readoutKey]: value },
        missingness: {},
        sourceRow: index + 2,
      }),
    );

    const workspace = createAdaptiveWorkspace({
      contract,
      observations,
      mapping: null,
      lineage: null,
      now,
    });

    expect(workspace.status).toBe("ready");
    if (!workspace.draft) throw new Error("Expected a ready workspace draft");
    const observed = workspace.draft.conditions[0]!;
    const cell = (sessionIndex: number, readoutKey: string) =>
      workspace.cells[
        experimentCellKey({
          experimentId: `adaptive-session.${sessionIndex}`,
          conditionId: observed.id,
          readoutId: `outcome.${readoutKey}`,
        })
      ];
    expect(cell(1, "primary")).toMatchObject({ rawValues: [10] });
    expect(cell(2, "primary")).toMatchObject({ rawValues: [20] });
    expect(cell(3, "primary")).toMatchObject({ rawValues: [30] });
    expect(cell(1, "secondary")).toMatchObject({ rawValues: [100] });
    expect(cell(2, "secondary")).toMatchObject({ rawValues: [] });
    expect(cell(3, "secondary")).toMatchObject({ rawValues: [300] });
  });

  it("retains dose/response canonical rows but refuses a generic continuous fallback", () => {
    const trace = traces.traces.find(({ structureContract }) =>
      structureContract.readouts.some(({ representation }) => representation === "dose_response"),
    );
    expect(trace).toBeDefined();
    const input = inputFor(trace!);
    const workspace = createAdaptiveWorkspace({ ...input, mapping: null, lineage: null, now });

    expect(workspace.status).toBe("not_representable");
    expect(workspace.draft).toBeNull();
    expect(workspace.cells).toEqual({});
    expect(workspace.snapshot.canonicalObservations).toEqual(input.observations);
    expect(workspace.diagnostics).toContain(
      "dose_response_requires_explicit_nonlinear_model_route",
    );
  });

  it("rejects a persisted snapshot whose contract no longer matches the active design", () => {
    const input = inputFor(traces.traces[0]!);
    const workspace = createAdaptiveWorkspace({ ...input, mapping: null, lineage: null, now });
    const state = createExperimentWorkspaceProject({
      draft: workspace.draft!,
      cells: workspace.cells,
      graphs: [],
      now,
    });
    const corrupted = {
      ...state,
      adaptiveInput: {
        ...state.adaptiveInput!,
        contract: { ...state.adaptiveInput!.contract, experimentName: "corrupted" },
      },
    };
    expect(ProjectStateSchema.safeParse(corrupted).success).toBe(false);
  });

  it("preserves shared-source matched siblings as distinct experimental units across save/open", () => {
    const contract = buildStructureContract({
      experimentName: "Donor split",
      experimentDescription: "Each donor culture was split into separate vehicle and drug dishes.",
      experimentalUnitLabel: "condition dish",
      identityLabel: "Dish ID",
      readoutLabel: "Signal",
      readoutRepresentation: "scalar",
      factorName: "Treatment",
      factorLevels: ["Vehicle", "Drug"],
      sameIdentityAcrossConditions: false,
      conditionEntityRelationship: {
        kind: "distinct_condition_units_shared_source",
        sourceUnitLabel: "Donor culture",
        sourceIdentityLabel: "Donor ID",
        sourceRole: "block",
        completeSetsRequired: true,
      },
    });
    const observations = [
      ["Donor-1", "Dish-1-Vehicle", "Vehicle", 1],
      ["Donor-1", "Dish-1-Drug", "Drug", 2],
      ["Donor-2", "Dish-2-Vehicle", "Vehicle", 3],
      ["Donor-2", "Dish-2-Drug", "Drug", 4],
    ].map(([donor, dish, treatment, value], index) =>
      CanonicalAdaptiveObservationSchema.parse({
        observationId: `shared-source.${index + 1}`,
        readoutKey: "signal",
        identities: { donorid: donor, dishid: dish },
        factors: { treatment },
        axes: {},
        hierarchy: {},
        values: { signal: value },
        missingness: {},
        sourceRow: index + 2,
      }),
    );

    const workspace = createAdaptiveWorkspace({
      contract,
      observations,
      mapping: null,
      lineage: null,
      now,
    });
    expect(workspace.status).toBe("ready");
    expect(workspace.draft?.conditionAssignment).toEqual({
      kind: "matched",
      unitLabel: "condition dish",
      matchedTopology: {
        kind: "distinct_condition_units_shared_source",
        sourceUnitLabel: "Donor culture",
        sourceIdentityLabel: "Donor ID",
        sourceRole: "block",
      },
    });
    expect(createExperimentWorkspaceDesign(workspace.draft!, now).pairing).toEqual({
      kind: "matched",
      matchLevelId: "unit-level.donorculture",
      completePairsRequired: true,
    });

    const state = createExperimentWorkspaceProject({
      draft: workspace.draft!,
      cells: workspace.cells,
      graphs: [],
      now,
    });
    const reopened = ProjectStateSchema.parse(JSON.parse(JSON.stringify(state)));
    expect(reopened.experimentWorkspace?.conditionAssignment.matchedTopology?.kind).toBe(
      "distinct_condition_units_shared_source",
    );
    expect(
      rehydrateExperimentWorkspace(reopened)?.draft.conditionAssignment.matchedTopology,
    ).toEqual({
      kind: "distinct_condition_units_shared_source",
      sourceUnitLabel: "Donor culture",
      sourceIdentityLabel: "Donor ID",
      sourceRole: "block",
    });
    const experimentalUnits = reopened.unitInstances.filter(
      ({ levelId }) => levelId === "unit-level.conditiondish",
    );
    const sourceUnits = reopened.unitInstances.filter(
      ({ levelId }) => levelId === "unit-level.donorculture",
    );
    expect(experimentalUnits).toHaveLength(4);
    expect(sourceUnits).toHaveLength(2);
    expect(new Set(experimentalUnits.map(({ parentUnitId }) => parentUnitId))).toEqual(
      new Set(sourceUnits.map(({ id }) => id)),
    );
    expect(reopened.designRevisions.at(-1)?.design.pairing).toEqual({
      kind: "matched",
      matchLevelId: "unit-level.donorculture",
      completePairsRequired: true,
    });
    expect(reopened.designRevisions.at(-1)?.design.plannedN).toBe(4);

    const { adaptiveInput: _omitted, ...contractlessDraft } = workspace.draft!;
    expect(() =>
      createExperimentWorkspaceProject({
        draft: contractlessDraft,
        cells: workspace.cells,
        graphs: [],
        now,
      }),
    ).toThrow(/SHARED_SOURCE_REQUIRES_ADAPTIVE_CONTRACT_PROJECTION/);
  });

  it("records only targeted confirmation evidence supplied by the caller", () => {
    const contract = buildStructureContract({
      experimentName: "Incomplete donor split",
      experimentDescription: "Some donor cultures did not yield both condition dishes.",
      experimentalUnitLabel: "condition dish",
      identityLabel: "Dish ID",
      readoutLabel: "Signal",
      readoutRepresentation: "scalar",
      factorName: "Treatment",
      factorLevels: ["Vehicle", "Drug"],
      sameIdentityAcrossConditions: false,
      conditionEntityRelationship: {
        kind: "distinct_condition_units_shared_source",
        sourceUnitLabel: "Donor culture",
        sourceIdentityLabel: "Donor ID",
        sourceRole: "block",
        completeSetsRequired: false,
      },
    });
    const withoutEvidence = createAdaptiveWorkspace({
      contract,
      observations: [],
      mapping: null,
      lineage: null,
      now,
    });
    expect(withoutEvidence.snapshot.targetedConfirmations).toEqual([]);

    const evidence = [{ key: "missingness", answer: "confirmed", confirmedAt: now }];
    const withEvidence = createAdaptiveWorkspace({
      contract,
      observations: [],
      mapping: null,
      lineage: null,
      confirmedTargetedConfirmations: evidence,
      now,
    });
    expect(withEvidence.snapshot.targetedConfirmations).toEqual(evidence);
  });

  it("safe-stops multi-factor shared-source matching in the legacy workspace", () => {
    const contract = buildStructureContract({
      experimentName: "Donor split factorial",
      experimentDescription:
        "Each donor culture was split into dishes receiving treatment and induction combinations.",
      experimentalUnitLabel: "condition dish",
      identityLabel: "Dish ID",
      readoutLabel: "Signal",
      readoutRepresentation: "scalar",
      factorName: "Treatment",
      factorLevels: ["Vehicle", "Drug"],
      additionalFactors: [
        { name: "Induction", levels: ["−", "+"], sameIdentityAcrossConditions: false },
      ],
      sameIdentityAcrossConditions: false,
      conditionEntityRelationship: {
        kind: "distinct_condition_units_shared_source",
        sourceUnitLabel: "Donor culture",
        sourceIdentityLabel: "Donor ID",
        sourceRole: "block",
        completeSetsRequired: true,
      },
    });
    const workspace = createAdaptiveWorkspace({
      contract,
      observations: [],
      mapping: null,
      lineage: null,
      now,
    });

    expect(workspace.status).toBe("not_representable");
    expect(workspace.draft).toBeNull();
    expect(workspace.cells).toEqual({});
    expect(workspace.diagnostics).toContain(
      "legacy_workspace_does_not_support_multifactor_shared_source_matching",
    );
  });

  it("requires explicit child tracking IDs for an identity-retained nested axis", () => {
    const contract = buildStructureContract({
      experimentName: "Tracked cells",
      experimentDescription: "The same cells were followed at two times.",
      experimentalUnitLabel: "culture dish",
      identityLabel: "Dish ID",
      readoutLabel: "Signal",
      readoutRepresentation: "scalar",
      sameIdentityAcrossConditions: false,
      orderedAxis: { label: "Time", unit: "h", levels: [0, 1], sameIdentity: true },
      nestedObservationLabel: "Cell",
    });
    const withoutTrackingIds = createAdaptiveWorkspace({
      contract,
      observations: [],
      mapping: null,
      lineage: null,
      now,
    });
    expect(withoutTrackingIds.status).toBe("not_representable");
    expect(withoutTrackingIds.diagnostics).toContain(
      "legacy_workspace_requires_explicit_nested_axis_tracking_identity",
    );

    const observations = [0, 1].map((time, index) =>
      CanonicalAdaptiveObservationSchema.parse({
        observationId: `tracked-cell.${index + 1}`,
        readoutKey: "signal",
        identities: { dishid: "Dish-1", cell_id: "Cell-1" },
        factors: {},
        axes: { time },
        hierarchy: {},
        values: { signal: index + 1 },
        missingness: {},
        sourceRow: index + 2,
      }),
    );
    const withTrackingIds = createAdaptiveWorkspace({
      contract,
      observations,
      mapping: null,
      lineage: null,
      now,
    });
    expect(withTrackingIds.status).toBe("ready");
  });

  it("safe-stops canonical rows that do not project to exactly one known condition", () => {
    const contract = buildStructureContract({
      experimentName: "Required treatment",
      experimentDescription: "Each dish received Control or Drug.",
      experimentalUnitLabel: "culture dish",
      identityLabel: "Dish ID",
      readoutLabel: "Signal",
      readoutRepresentation: "scalar",
      factorName: "Treatment",
      factorLevels: ["Control", "Drug"],
      sameIdentityAcrossConditions: false,
    });
    const observation = CanonicalAdaptiveObservationSchema.parse({
      observationId: "missing-treatment.1",
      readoutKey: "signal",
      identities: { dishid: "Dish-1" },
      factors: {},
      axes: {},
      hierarchy: {},
      values: { signal: 1 },
      missingness: {},
      sourceRow: 2,
    });
    const workspace = createAdaptiveWorkspace({
      contract,
      observations: [observation],
      mapping: null,
      lineage: null,
      now,
    });

    expect(workspace.status).toBe("not_representable");
    expect(workspace.diagnostics).toContain(
      "adaptive_observation:missing-treatment.1:missing_factor:treatment",
    );
    expect(workspace.diagnostics).toContain(
      "adaptive_observation:missing-treatment.1:condition_projection_count:0",
    );
    expect(workspace.snapshot.canonicalObservations).toEqual([observation]);
  });
});

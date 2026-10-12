import { existsSync, readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";
import {
  CanonicalAdaptiveObservationSchema,
  StructureContractSchema,
  type CanonicalAdaptiveObservation,
  type StructureContract,
} from "@lsaa/domain";
import { assertDualWriteEquivalence, projectContractToExperimentDesign } from "./dual-write";
import { buildStructureContract, compileStructureContract } from "./contract-builder";
import { mapAdaptiveRawText, type AdaptiveRawMappingPlan } from "./raw-mapping-plan";
import { selectAdaptiveSurface } from "./surface-selector";
import { targetedConfirmationsFor } from "./questions";
import { importForSelectedSurface } from "./surface-import";

const evidenceRoot = [
  resolve(
    process.cwd(),
    "docs/evaluation/experiment-to-structure-navigation-pilot/experiment-first",
  ),
  resolve(
    process.cwd(),
    "../../docs/evaluation/experiment-to-structure-navigation-pilot/experiment-first",
  ),
].find(existsSync)!;
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
  surfaceSelection: { surfaceId: string };
  inputPayload: { rows: PrototypeRow[] };
};
const traces = JSON.parse(
  readFileSync(resolve(evidenceRoot, "prototype-runs/case-traces-65.json"), "utf8"),
) as { traces: PrototypeTrace[] };

function productionContract(trace: PrototypeTrace): StructureContract {
  const source = trace.structureContract;
  const contract = StructureContractSchema.parse({
    ...source,
    schemaVersion: "0.1.0",
    contractId: source.caseId.toLowerCase(),
    experimentName: source.caseId,
  });
  const { schemaVersion: _version, ...answers } = contract;
  return compileStructureContract(answers);
}

describe("production adaptive-input path", () => {
  it("runs all 65 Gold traces through contract, selector, canonical observations, and dual-write", () => {
    expect(traces.traces).toHaveLength(65);
    const surfaces = new Set<string>();
    const equivalenceCounts = { equivalent: 0, not_representable: 0 };
    for (const trace of traces.traces) {
      const contract = productionContract(trace);
      const selection = selectAdaptiveSurface(contract);
      expect(selection.surfaceId, trace.caseId).toBe(trace.surfaceSelection.surfaceId);
      surfaces.add(selection.surfaceId);
      for (const [index, row] of trace.inputPayload.rows.entries()) {
        const readoutKey =
          row.readoutKey ??
          contract.readouts.find((readout) =>
            Object.keys(row.values).some(
              (key) => key === readout.key || key.startsWith(`${readout.key}_`),
            ),
          )?.key ??
          contract.readouts[0]!.key;
        CanonicalAdaptiveObservationSchema.parse({
          observationId: `${contract.contractId}.${index + 1}`,
          readoutKey,
          identities: row.identities,
          factors: row.factors,
          axes: row.axes,
          hierarchy: row.hierarchy,
          values: row.values,
          missingness: row.missingness ?? {},
          sourceRow: index + 2,
        });
      }
      const design = projectContractToExperimentDesign(
        contract,
        Math.max(1, trace.inputPayload.rows.length),
      );
      const equivalence = assertDualWriteEquivalence(contract, design);
      expect(equivalence.status, trace.caseId).not.toBe("mismatch");
      expect(design.primaryContrast, trace.caseId).toBeNull();
      if (equivalence.status === "equivalent") equivalenceCounts.equivalent++;
      else equivalenceCounts.not_representable++;
      expect(design.adaptiveStructure?.contract).toEqual(contract);
    }
    expect([...surfaces].sort()).toEqual([
      "compact_unit_matrix",
      "factor_observation_table",
      "nested_observation_table",
      "repeated_axis_matrix",
      "typed_record_table",
    ]);
    expect(equivalenceCounts).toEqual({ equivalent: 50, not_representable: 15 });
  });

  it("asks no confirmation for 44 low-ambiguity cases and only semantic-changing confirmation for 21 boundary cases", () => {
    const counts = traces.traces.map(
      (trace) => targetedConfirmationsFor(productionContract(trace)).length,
    );
    expect(counts.filter((count) => count === 0)).toHaveLength(44);
    expect(counts.filter((count) => count > 0)).toHaveLength(21);
    for (const trace of traces.traces) {
      for (const confirmation of targetedConfirmationsFor(productionContract(trace)))
        expect(confirmation.changesSemanticStructure).toBe(true);
    }
  });

  it("retains missing and unequal rows without scalar imputation", () => {
    const contract = productionContract(
      traces.traces.find((trace) => trace.surfaceSelection.surfaceId === "compact_unit_matrix")!,
    );
    const identities = contract.identities.filter(({ required }) => required);
    const levels = contract.factors[0]!.levels;
    const rowIdentities = (suffix: string) =>
      identities.map(({ key }) => `${key}-${suffix}`).join("\t");
    const text = `${identities.map(({ label }) => label).join("\t")}\t${levels.join("\t")}\n${rowIdentities("1")}\t1\t\n${rowIdentities("2")}\t2\t3`;
    const imported = importForSelectedSurface(
      contract,
      text,
      "clipboard",
      "missing.tsv",
      "2026-08-26T00:00:00.000Z",
    );
    expect(imported.observations).toHaveLength(4);
    expect(imported.observations.some((row) => Object.values(row.values).includes(null))).toBe(
      true,
    );
    expect(imported.confirmations).toContain("classify_missingness_reason");
    expect(
      Object.values(imported.mapping.columns).filter(({ role }) => role === "value"),
    ).toHaveLength(levels.length);
    expect(
      Object.values(imported.mapping.columns).some(
        ({ fixedFactors }) => Object.keys(fixedFactors).length > 0,
      ),
    ).toBe(true);
  });

  it("rejects a repeated-axis matrix that omits a required condition factor", () => {
    const contract = buildStructureContract({
      experimentName: "Longitudinal signal",
      experimentDescription: "Independent treatment groups were followed over time.",
      experimentalUnitLabel: "animal",
      identityLabel: "Animal ID",
      readoutLabel: "Signal",
      readoutRepresentation: "scalar",
      factorName: "Treatment",
      factorLevels: ["Control", "Drug"],
      sameIdentityAcrossConditions: false,
      orderedAxis: { label: "Time", unit: "day", levels: [0, 7], sameIdentity: true },
    });
    expect(selectAdaptiveSurface(contract).surfaceId).toBe("repeated_axis_matrix");

    expect(() =>
      importForSelectedSurface(
        contract,
        "Animal ID\t0\t7\nM1\t1\t2",
        "clipboard",
        "missing-treatment.tsv",
        "2026-08-28T00:00:00.000Z",
      ),
    ).toThrow(/missing_factor:treatment/);
  });

  it("stops unsupported legacy projections instead of relabelling them", () => {
    const eventTrace = traces.traces.find((trace) =>
      trace.structureContract.readouts.some(
        (readout) => readout.representation === "event_censoring",
      ),
    )!;
    const contract = productionContract(eventTrace);
    const design = projectContractToExperimentDesign(contract, 6);
    expect(design.adaptiveStructure?.analysisCompatibility).toBe("blocked");
    expect(design.adaptiveStructure?.diagnostics).toContain(
      "legacy_workspace_uses_dedicated_survival_route",
    );
    expect(design.outcomes[0]?.type).toBe("time_to_event");
  });

  it("retains reference candidates without fabricating an inferential contrast", () => {
    const contract = buildStructureContract({
      experimentName: "Three treatments",
      experimentDescription: "Independent dishes received one of three treatments.",
      experimentalUnitLabel: "culture dish",
      identityLabel: "Dish ID",
      readoutLabel: "Signal",
      readoutRepresentation: "scalar",
      factorName: "Treatment",
      factorLevels: ["Control", "Drug A", "Drug B"],
      sameIdentityAcrossConditions: false,
    });

    expect(contract.factors[0]?.referenceLevel).toBe("Control");
    const design = projectContractToExperimentDesign(contract, 12);
    expect(design.primaryContrast).toBeNull();
    expect(assertDualWriteEquivalence(contract, design).status).toBe("equivalent");
  });

  it("safe-stops multi-factor shared-source matching before legacy projection", () => {
    const contract = buildStructureContract({
      experimentName: "Split donor factorial",
      experimentDescription:
        "Each donor culture was divided into condition dishes for treatment and induction.",
      experimentalUnitLabel: "condition dish",
      identityLabel: "Dish ID",
      readoutLabel: "Signal",
      readoutRepresentation: "scalar",
      factorName: "Treatment",
      factorLevels: ["Control", "Drug"],
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

    const design = projectContractToExperimentDesign(contract, 8);
    expect(design.adaptiveStructure?.analysisCompatibility).toBe("blocked");
    expect(design.adaptiveStructure?.diagnostics).toContain(
      "legacy_workspace_does_not_support_multifactor_shared_source_matching",
    );
    expect(assertDualWriteEquivalence(contract, design).status).toBe("not_representable");
  });

  it("keeps aggregate typed readouts at the experimental-unit level", () => {
    const aggregateOnly = buildStructureContract({
      experimentName: "Ciliated fraction",
      experimentDescription: "Positive and total cells were counted once for each dish.",
      experimentalUnitLabel: "culture dish",
      identityLabel: "Dish ID",
      readoutLabel: "Ciliated fraction",
      readoutRepresentation: "proportion_counts",
      sameIdentityAcrossConditions: false,
      nestedObservationLabel: "Cell",
    });
    expect(aggregateOnly.readouts[0]?.observationLevelKey).toBe(
      aggregateOnly.experimentalUnitLevelKey,
    );
    expect(aggregateOnly.unitLevels.map(({ label }) => label)).toEqual(["culture dish"]);
    expect(aggregateOnly.identities.map(({ label }) => label)).toEqual(["Dish ID"]);

    const mixedGrain = buildStructureContract({
      experimentName: "Cell signal and dish fraction",
      experimentDescription:
        "Individual cell signals and one positive/total count were retained for each dish.",
      experimentalUnitLabel: "culture dish",
      identityLabel: "Dish ID",
      readoutLabel: "Cell signal",
      readoutRepresentation: "scalar",
      readoutUsesNestedObservation: true,
      additionalReadouts: [
        {
          label: "Ciliated fraction",
          representation: "proportion_counts",
          usesNestedObservation: false,
        },
      ],
      sameIdentityAcrossConditions: false,
      nestedObservationLabel: "Cell",
    });
    expect(mixedGrain.readouts.map(({ observationLevelKey }) => observationLevelKey)).toEqual([
      "cell",
      "culturedish",
    ]);
    expect(mixedGrain.rawObservationGrain).toBe(
      "mixed by readout: one Cell observation or one culture dish observation",
    );
  });

  it("requires explicit per-readout nesting and ordered-axis bindings", () => {
    const common = {
      experimentName: "Mixed grain time course",
      experimentDescription: "Cell morphology was followed, with one endpoint viability value.",
      experimentalUnitLabel: "culture dish",
      identityLabel: "Dish ID",
      readoutLabel: "Cell morphology",
      readoutRepresentation: "scalar" as const,
      additionalReadouts: [{ label: "Viability", representation: "scalar" as const }],
      sameIdentityAcrossConditions: false,
      nestedObservationLabel: "Cell",
      orderedAxis: { label: "Time", unit: "h", levels: [0, 6, 24], sameIdentity: true },
    };

    expect(() => buildStructureContract(common)).toThrow(
      "MULTIPLE_READOUT_NESTING_BINDING_REQUIRED",
    );

    const contract = buildStructureContract({
      ...common,
      readoutUsesNestedObservation: true,
      readoutUsesOrderedAxis: true,
      additionalReadouts: [
        {
          label: "Viability",
          representation: "scalar",
          usesNestedObservation: false,
          usesOrderedAxis: false,
        },
      ],
    });
    expect(
      contract.readouts.map(({ label, observationLevelKey, axisKeys }) => ({
        label,
        observationLevelKey,
        axisKeys,
      })),
    ).toEqual([
      { label: "Cell morphology", observationLevelKey: "cell", axisKeys: ["time"] },
      { label: "Viability", observationLevelKey: "culturedish", axisKeys: [] },
    ]);
    expect(selectAdaptiveSurface(contract)).toEqual({
      surfaceId: "factor_observation_table",
      reasonCodes: ["heterogeneous_readout_bindings"],
    });
    const projected = projectContractToExperimentDesign(contract, 4);
    expect(projected.adaptiveStructure?.analysisCompatibility).toBe("blocked");
    expect(projected.adaptiveStructure?.diagnostics).toEqual(
      expect.arrayContaining([
        "legacy_analysis_does_not_support_heterogeneous_readout_grains",
        "legacy_analysis_does_not_support_heterogeneous_readout_axes",
      ]),
    );
    expect(assertDualWriteEquivalence(contract, projected)).toMatchObject({
      status: "not_representable",
      diagnostics: expect.arrayContaining([
        "design_projection_does_not_bind_heterogeneous_readout_grains",
        "design_projection_does_not_bind_heterogeneous_readout_axes",
      ]),
    });
  });

  it("keeps aggregate typed bundles unit-level while allowing an explicit axis binding", () => {
    const contract = buildStructureContract({
      experimentName: "Signal and fraction over time",
      experimentDescription:
        "Cell signal and a dish-level positive fraction were recorded over time.",
      experimentalUnitLabel: "culture dish",
      identityLabel: "Dish ID",
      readoutLabel: "Cell signal",
      readoutRepresentation: "scalar",
      readoutUsesNestedObservation: true,
      readoutUsesOrderedAxis: true,
      additionalReadouts: [
        {
          label: "Positive fraction",
          representation: "proportion_counts",
          usesNestedObservation: false,
          usesOrderedAxis: true,
        },
      ],
      sameIdentityAcrossConditions: false,
      nestedObservationLabel: "Cell",
      orderedAxis: { label: "Time", unit: "h", levels: [0, 24], sameIdentity: true },
    });
    expect(contract.readouts[1]).toMatchObject({
      observationLevelKey: "culturedish",
      axisKeys: ["time"],
    });
  });

  it("throws before commit when the dual-written contract differs", () => {
    const contract = productionContract(traces.traces[0]!);
    const design = projectContractToExperimentDesign(contract, 4);
    const changed = { ...contract, experimentName: `${contract.experimentName} changed` };
    expect(() => assertDualWriteEquivalence(changed, design)).toThrow(
      /ADAPTIVE_DUAL_WRITE_MISMATCH/,
    );
  });

  it("projects ordered-axis scientific roles only from explicit semantic hints", () => {
    const trace = traces.traces.find(
      ({ structureContract }) =>
        structureContract.orderedAxes.length === 1 &&
        structureContract.readouts.every(({ representation }) => representation === "scalar"),
    )!;
    const contract = productionContract(trace);
    const axisKey = contract.orderedAxes[0]!.key;

    const generic = projectContractToExperimentDesign(contract, 4);
    expect(generic.observationFactors?.[0]?.scientificRole).toBe("other");
    expect(assertDualWriteEquivalence(contract, generic).status).not.toBe("mismatch");

    const elapsedTimeHints = {
      orderedAxisScientificRoles: { [axisKey]: "time" as const },
    };
    const elapsedTime = projectContractToExperimentDesign(contract, 4, undefined, elapsedTimeHints);
    expect(elapsedTime.observationFactors?.[0]?.scientificRole).toBe("time");
    expect(
      assertDualWriteEquivalence(contract, elapsedTime, undefined, elapsedTimeHints).status,
    ).not.toBe("mismatch");
    expect(() => assertDualWriteEquivalence(contract, elapsedTime)).toThrow(
      /ordered_axis_projection_mismatch/,
    );
  });

  it("throws when projected design semantics differ even though the embedded contract still matches", () => {
    const contract = productionContract(traces.traces[0]!);
    const design = projectContractToExperimentDesign(contract, 4);
    const changed = {
      ...design,
      factors: design.factors.map((factor, index) =>
        index === 0 ? { ...factor, label: `${factor.label} changed` } : factor,
      ),
    };
    expect(() => assertDualWriteEquivalence(contract, changed)).toThrow(
      /factor_projection_mismatch/,
    );
  });

  it("marks blocked matching as incompatible with the common workspace", () => {
    const trace = traces.traces.find(
      ({ structureContract }) => structureContract.matching.kind === "blocked",
    )!;
    const contract = productionContract(trace);
    const design = projectContractToExperimentDesign(contract, 4);
    expect(design.pairing.kind).toBe("blocked");
    expect(design.adaptiveStructure?.analysisCompatibility).toBe("blocked");
    expect(design.adaptiveStructure?.diagnostics).toContain(
      "legacy_workspace_does_not_support_blocked_matching",
    );
  });

  it("compiles mixed between/within factors without flattening identity reuse", () => {
    const contract = buildStructureContract({
      experimentName: "mixed factors",
      experimentDescription:
        "Different cohorts each contribute the same identity under two conditions.",
      experimentalUnitLabel: "mouse",
      identityLabel: "MouseID",
      readoutLabel: "Response",
      readoutRepresentation: "scalar",
      factorName: "Cohort",
      factorLevels: ["A", "B"],
      additionalFactors: [
        { name: "Condition", levels: ["Before", "After"], sameIdentityAcrossConditions: true },
      ],
      sameIdentityAcrossConditions: false,
    });
    expect(contract.matching.kind).toBe("mixed");
    expect(contract.factors.map(({ unitRole }) => unitRole)).toEqual([
      "between_unit",
      "within_unit",
    ]);
    expect(selectAdaptiveSurface(contract).surfaceId).toBe("factor_observation_table");
    expect(targetedConfirmationsFor(contract).map(({ key }) => key)).toContain("relationship");
  });

  it("maps repeatable readout definitions without flattening them into one outcome", () => {
    const contract = buildStructureContract({
      experimentName: "Two cell readouts",
      experimentDescription: "The same dishes yielded area and cell-count measurements.",
      experimentalUnitLabel: "culture dish",
      identityLabel: "Dish ID",
      readoutLabel: "Cell area",
      readoutRepresentation: "scalar",
      additionalReadouts: [
        { label: "Cell count", representation: "scalar" },
        { label: "Ciliated fraction", representation: "proportion_counts" },
      ],
      factorName: "Treatment",
      factorLevels: ["Control", "Drug"],
      sameIdentityAcrossConditions: false,
    });

    expect(contract.readouts).toEqual([
      expect.objectContaining({
        key: "cellarea",
        label: "Cell area",
        representation: "scalar",
        componentKeys: ["value"],
      }),
      expect.objectContaining({
        key: "cellcount",
        label: "Cell count",
        representation: "scalar",
        componentKeys: ["value"],
      }),
      expect.objectContaining({
        key: "ciliatedfraction",
        label: "Ciliated fraction",
        representation: "proportion_counts",
        componentKeys: ["numerator", "denominator"],
      }),
    ]);
    expect(
      new Set(contract.readouts.map(({ observationLevelKey }) => observationLevelKey)),
    ).toEqual(new Set(["culturedish"]));
  });

  it("splits a wide typed-record row into one canonical observation per readout", () => {
    const contract = buildStructureContract({
      experimentName: "Wide readout export",
      experimentDescription: "One dish produced area, count, and positive-fraction values.",
      experimentalUnitLabel: "culture dish",
      identityLabel: "Dish ID",
      readoutLabel: "Cell area",
      readoutRepresentation: "scalar",
      additionalReadouts: [
        { label: "Cell count", representation: "scalar" },
        { label: "Ciliated fraction", representation: "proportion_counts" },
      ],
      factorName: "Treatment",
      factorLevels: ["Control", "Drug"],
      sameIdentityAcrossConditions: false,
    });
    const imported = importForSelectedSurface(
      contract,
      [
        "Dish ID\tTreatment\tCell area\tCell count\tCiliated fraction numerator\tCiliated fraction denominator",
        "dish-1\tControl\t12.5\t80\t4\t10",
      ].join("\n"),
      "tsv",
      "wide-readouts.tsv",
      "2026-08-28T00:00:00.000Z",
    );

    expect(selectAdaptiveSurface(contract).surfaceId).toBe("typed_record_table");
    expect(imported.observations).toHaveLength(3);
    expect(imported.observations.map(({ readoutKey }) => readoutKey)).toEqual([
      "cellarea",
      "cellcount",
      "ciliatedfraction",
    ]);
    expect(imported.observations.map(({ values, sourceRow }) => ({ values, sourceRow }))).toEqual([
      { values: { cellarea: 12.5 }, sourceRow: 2 },
      { values: { cellcount: 80 }, sourceRow: 2 },
      {
        values: { ciliatedfraction_numerator: 4, ciliatedfraction_denominator: 10 },
        sourceRow: 2,
      },
    ]);
    expect(
      imported.observations.every(
        ({ identities, factors }) =>
          identities.dishid === "dish-1" && factors.treatment === "Control",
      ),
    ).toBe(true);
  });

  it("keeps distinct condition units linked by a shared source without coercing them to one repeated entity", () => {
    const contract = buildStructureContract({
      experimentName: "Donor-matched dishes",
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
        completeSetsRequired: false,
      },
    });

    expect(contract.experimentalUnitLevelKey).toBe("conditiondish");
    expect(contract.unitLevels).toEqual([
      { key: "donorculture", label: "Donor culture", role: "block", parentKey: null },
      {
        key: "conditiondish",
        label: "condition dish",
        role: "experimental_unit",
        parentKey: "donorculture",
      },
    ]);
    expect(contract.identities).toEqual([
      { key: "donorid", label: "Donor ID", unitLevelKey: "donorculture", required: true },
      { key: "dishid", label: "Dish ID", unitLevelKey: "conditiondish", required: true },
    ]);
    expect(contract.factors[0]).toMatchObject({ unitRole: "between_unit", relationship: "paired" });
    expect(contract.matching).toEqual({
      kind: "matched",
      identityKey: "donorid",
      completeSetsRequired: false,
    });
    expect(selectAdaptiveSurface(contract)).toEqual({
      surfaceId: "factor_observation_table",
      reasonCodes: ["distinct_condition_units_shared_source"],
    });
    const imported = importForSelectedSurface(
      contract,
      "Donor ID\tDish ID\tTreatment\tSignal\nD1\tD1-V\tVehicle\t1\nD1\tD1-D\tDrug\t2",
      "clipboard",
      "shared-source.tsv",
      "2026-08-26T00:00:00.000Z",
    );
    expect(
      imported.observations.map(({ identities, factors }) => ({ identities, factors })),
    ).toEqual([
      { identities: { donorid: "D1", dishid: "D1-V" }, factors: { treatment: "Vehicle" } },
      { identities: { donorid: "D1", dishid: "D1-D" }, factors: { treatment: "Drug" } },
    ]);

    const design = projectContractToExperimentDesign(contract, 4);
    expect(design.experimentalUnitLevelId).toBe("unit-level.conditiondish");
    expect(design.pairing).toEqual({
      kind: "matched",
      matchLevelId: "unit-level.donorculture",
      completePairsRequired: false,
    });
    expect(assertDualWriteEquivalence(contract, design).status).toBe("equivalent");
  });

  it("does not relabel an additional independent factor as shared-source paired", () => {
    const contract = buildStructureContract({
      experimentName: "Donor-matched treatment across independent genotypes",
      experimentDescription:
        "Within each donor, separate vehicle and drug dishes were prepared; donors belonged to one genotype.",
      experimentalUnitLabel: "condition dish",
      identityLabel: "Dish ID",
      readoutLabel: "Signal",
      readoutRepresentation: "scalar",
      factorName: "Treatment",
      factorLevels: ["Vehicle", "Drug"],
      additionalFactors: [
        {
          name: "Genotype",
          levels: ["WT", "KO"],
          sameIdentityAcrossConditions: false,
        },
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

    expect(contract.factors.map(({ relationship }) => relationship)).toEqual([
      "paired",
      "independent",
    ]);
  });

  it("does not guess when shared-source and literal same-entity factors need different linkage identities", () => {
    expect(() =>
      buildStructureContract({
        experimentName: "Mixed linkage",
        experimentDescription: "Separate donor-derived dishes also contain a repeated condition.",
        experimentalUnitLabel: "condition dish",
        identityLabel: "Dish ID",
        readoutLabel: "Signal",
        readoutRepresentation: "scalar",
        factorName: "Treatment",
        factorLevels: ["Vehicle", "Drug"],
        additionalFactors: [
          {
            name: "Phase",
            levels: ["Before", "After"],
            sameIdentityAcrossConditions: true,
          },
        ],
        sameIdentityAcrossConditions: false,
        conditionEntityRelationship: {
          kind: "distinct_condition_units_shared_source",
          sourceUnitLabel: "Donor culture",
          sourceIdentityLabel: "Donor ID",
          sourceRole: "block",
          completeSetsRequired: true,
        },
      }),
    ).toThrow(/MULTIPLE_MATCHING_IDENTITIES_NOT_REPRESENTABLE/);
  });

  it("keeps a shared material preparation as a sample rather than relabelling it as a biological block", () => {
    const contract = buildStructureContract({
      experimentName: "Lysate split",
      experimentDescription:
        "One lysate was divided into separate reaction tubes for two conditions.",
      experimentalUnitLabel: "reaction tube",
      identityLabel: "Tube ID",
      readoutLabel: "Activity",
      readoutRepresentation: "scalar",
      factorName: "Condition",
      factorLevels: ["Control", "Inhibitor"],
      sameIdentityAcrossConditions: false,
      conditionEntityRelationship: {
        kind: "distinct_condition_units_shared_source",
        sourceUnitLabel: "Lysate preparation",
        sourceIdentityLabel: "Lysate ID",
        sourceRole: "sample",
        completeSetsRequired: true,
      },
    });

    expect(contract.unitLevels[0]).toMatchObject({
      label: "Lysate preparation",
      role: "sample",
      parentKey: null,
    });
    expect(contract.unitLevels[1]).toMatchObject({
      label: "reaction tube",
      role: "experimental_unit",
    });
  });
});

const rawPlans: Array<[string, AdaptiveRawMappingPlan]> = [
  [
    "RAW-01-imagej-results.csv",
    {
      identityColumns: ["DishID", "FieldID", "CellID"],
      factorColumns: ["Treatment"],
      valueColumns: ["Area", "Mean"],
      headerAliases: { Label: "CellID" },
      filename: {
        column: "Image",
        pattern: /^(D\d+)_(.+)_(F\d+)\.tif$/,
        groups: ["DishID", "Treatment", "FieldID"],
      },
    },
  ],
  [
    "RAW-02-plate-reader-export.csv",
    {
      identityColumns: ["Sample"],
      factorColumns: [],
      valueColumns: ["OD450"],
      missingTokens: ["Overflow"],
    },
  ],
  [
    "RAW-03-wb-densitometry.tsv",
    {
      delimiter: "\t",
      identityColumns: ["SampleName", "Lane"],
      factorColumns: ["Band"],
      valueColumns: ["IntegratedDensity", "Background"],
    },
  ],
  [
    "RAW-04-animal-longitudinal.csv",
    {
      identityColumns: ["Mouse"],
      factorColumns: ["Group", "Sex"],
      valueColumns: [],
      wideAxisHeaderPattern: /^Wk\d+$/,
    },
  ],
  [
    "RAW-05-filename-metadata.csv",
    {
      identityColumns: ["DishID", "FieldID", "CellID"],
      factorColumns: ["Treatment"],
      valueColumns: ["MeanIntensity", "Area_px"],
      filename: {
        column: "FileName",
        pattern: /^\d+_(Dish\d+)_(.+)_T(\d+)m_(F\d+)_C(\d+)\.tif$/,
        groups: ["DishID", "Treatment", "Time_min", "FieldID", "CellID"],
      },
    },
  ],
  [
    "RAW-06-qpcr-ct.csv",
    { identityColumns: ["Sample", "Well"], factorColumns: ["Target"], valueColumns: ["Cq"] },
  ],
  [
    "RAW-07-survival-log.csv",
    {
      identityColumns: ["AnimalID"],
      factorColumns: ["Arm"],
      valueColumns: ["Status"],
      deriveElapsedDays: {
        start: "StartDate",
        endCandidates: ["EndpointDate", "LastSeenDate"],
        output: "FollowUpDays",
      },
    },
  ],
  [
    "RAW-08-dose-response.csv",
    {
      identityColumns: ["Donor", "Well"],
      factorColumns: ["Compound", "Dose_uM"],
      valueColumns: ["Value"],
    },
  ],
  [
    "RAW-09-organoid-hierarchy.csv",
    {
      identityColumns: ["Patient", "Organoid", "Image", "ROI"],
      factorColumns: ["Treatment"],
      valueColumns: ["Area_um2"],
    },
  ],
  [
    "RAW-10-partial-pairs.csv",
    {
      identityColumns: ["PatientID", "SpecimenBarcode"],
      factorColumns: ["Tissue"],
      valueColumns: ["ProteinAA_ng_mg"],
    },
  ],
  [
    "RAW-11-flow-counts.csv",
    {
      identityColumns: ["Sample", "FCS_File"],
      factorColumns: ["Treatment", "Gate"],
      valueColumns: ["Count", "ParentCount"],
    },
  ],
  [
    "RAW-12-kinetic-plate.csv",
    {
      identityColumns: ["PlateID", "Well"],
      factorColumns: ["Treatment"],
      valueColumns: [],
      wideAxisHeaderPattern: /^\d+ min$/,
    },
  ],
];

describe("production design-first messy raw adapter", () => {
  it("maps all 12 raw-realism files with declarative plans", () => {
    expect(rawPlans).toHaveLength(12);
    for (const [file, plan] of rawPlans) {
      const result = mapAdaptiveRawText(
        readFileSync(resolve(evidenceRoot, "raw-realism", file), "utf8"),
        plan,
      );
      expect(result.success, `${file}: ${result.diagnostics.join(",")}`).toBe(true);
      expect(result.sourceRows).toBeGreaterThan(0);
    }
  });
});

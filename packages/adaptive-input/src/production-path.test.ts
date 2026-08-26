import { existsSync, readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";
import { CanonicalAdaptiveObservationSchema, StructureContractSchema, type CanonicalAdaptiveObservation, type StructureContract } from "@lsaa/domain";
import { assertDualWriteEquivalence, projectContractToExperimentDesign } from "./dual-write";
import { buildStructureContract, compileStructureContract } from "./contract-builder";
import { mapAdaptiveRawText, type AdaptiveRawMappingPlan } from "./raw-mapping-plan";
import { selectAdaptiveSurface } from "./surface-selector";
import { targetedConfirmationsFor } from "./questions";
import { importForSelectedSurface } from "./surface-import";

const evidenceRoot = [
  resolve(process.cwd(), "docs/evaluation/experiment-to-structure-navigation-pilot/experiment-first"),
  resolve(process.cwd(), "../../docs/evaluation/experiment-to-structure-navigation-pilot/experiment-first"),
].find(existsSync)!;
type PrototypeRow = Omit<CanonicalAdaptiveObservation, "observationId" | "readoutKey" | "missingness" | "sourceRow"> & { readoutKey: string | null; missingness: CanonicalAdaptiveObservation["missingness"] | null };
type PrototypeTrace = { caseId: string; structureContract: Omit<StructureContract, "schemaVersion" | "contractId" | "experimentName"> & { schemaVersion: string; caseId: string }; surfaceSelection: { surfaceId: string }; inputPayload: { rows: PrototypeRow[] } };
const traces = JSON.parse(readFileSync(resolve(evidenceRoot, "prototype-runs/case-traces-65.json"), "utf8")) as { traces: PrototypeTrace[] };

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
    for (const trace of traces.traces) {
      const contract = productionContract(trace);
      const selection = selectAdaptiveSurface(contract);
      expect(selection.surfaceId, trace.caseId).toBe(trace.surfaceSelection.surfaceId);
      surfaces.add(selection.surfaceId);
      for (const [index, row] of trace.inputPayload.rows.entries()) {
        const readoutKey = row.readoutKey ?? contract.readouts.find((readout) => Object.keys(row.values).some((key) => key === readout.key || key.startsWith(`${readout.key}_`)))?.key ?? contract.readouts[0]!.key;
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
      const design = projectContractToExperimentDesign(contract, Math.max(1, trace.inputPayload.rows.length));
      expect(assertDualWriteEquivalence(contract, design).status).toBe("equivalent");
      expect(design.adaptiveStructure?.contract).toEqual(contract);
    }
    expect([...surfaces].sort()).toEqual(["compact_unit_matrix", "factor_observation_table", "nested_observation_table", "repeated_axis_matrix", "typed_record_table"]);
  });

  it("asks no confirmation for 44 low-ambiguity cases and only semantic-changing confirmation for 21 boundary cases", () => {
    const counts = traces.traces.map((trace) => targetedConfirmationsFor(productionContract(trace)).length);
    expect(counts.filter((count) => count === 0)).toHaveLength(44);
    expect(counts.filter((count) => count > 0)).toHaveLength(21);
    for (const trace of traces.traces) {
      for (const confirmation of targetedConfirmationsFor(productionContract(trace))) expect(confirmation.changesSemanticStructure).toBe(true);
    }
  });

  it("retains missing and unequal rows without scalar imputation", () => {
    const contract = productionContract(traces.traces.find((trace) => trace.surfaceSelection.surfaceId === "compact_unit_matrix")!);
    const identity = contract.identities[0]!.label;
    const levels = contract.factors[0]!.levels;
    const text = `${identity}\t${levels.join("\t")}\nunit-1\t1\t\nunit-2\t2\t3`;
    const imported = importForSelectedSurface(contract, text, "clipboard", "missing.tsv", "2026-08-26T00:00:00.000Z");
    expect(imported.observations).toHaveLength(4);
    expect(imported.observations.some((row) => Object.values(row.values).includes(null))).toBe(true);
    expect(imported.confirmations).toContain("classify_missingness_reason");
    expect(Object.values(imported.mapping.columns).filter(({ role }) => role === "value")).toHaveLength(levels.length);
    expect(Object.values(imported.mapping.columns).some(({ fixedFactors }) => Object.keys(fixedFactors).length > 0)).toBe(true);
  });

  it("stops unsupported legacy projections instead of relabelling them", () => {
    const eventTrace = traces.traces.find((trace) => trace.structureContract.readouts.some((readout) => readout.representation === "event_censoring"))!;
    const contract = productionContract(eventTrace);
    const design = projectContractToExperimentDesign(contract, 6);
    expect(design.adaptiveStructure?.analysisCompatibility).toBe("blocked");
    expect(design.adaptiveStructure?.diagnostics).toContain("legacy_workspace_uses_dedicated_survival_route");
    expect(design.outcomes[0]?.type).toBe("time_to_event");
  });

  it("throws before commit when the dual-written contract differs", () => {
    const contract = productionContract(traces.traces[0]!);
    const design = projectContractToExperimentDesign(contract, 4);
    const changed = { ...contract, experimentName: `${contract.experimentName} changed` };
    expect(() => assertDualWriteEquivalence(changed, design)).toThrow(/ADAPTIVE_DUAL_WRITE_MISMATCH/);
  });

  it("compiles mixed between/within factors without flattening identity reuse", () => {
    const contract = buildStructureContract({ experimentName: "mixed factors", experimentDescription: "Different cohorts each contribute the same identity under two conditions.", experimentalUnitLabel: "mouse", identityLabel: "MouseID", readoutLabel: "Response", readoutRepresentation: "scalar", factorName: "Cohort", factorLevels: ["A", "B"], additionalFactors: [{ name: "Condition", levels: ["Before", "After"], sameIdentityAcrossConditions: true }], sameIdentityAcrossConditions: false });
    expect(contract.matching.kind).toBe("mixed");
    expect(contract.factors.map(({ unitRole }) => unitRole)).toEqual(["between_unit", "within_unit"]);
    expect(selectAdaptiveSurface(contract).surfaceId).toBe("factor_observation_table");
    expect(targetedConfirmationsFor(contract).map(({ key }) => key)).toContain("relationship");
  });
});


const rawPlans: Array<[string, AdaptiveRawMappingPlan]> = [
  ["RAW-01-imagej-results.csv", { identityColumns: ["DishID", "FieldID", "CellID"], factorColumns: ["Treatment"], valueColumns: ["Area", "Mean"], headerAliases: { Label: "CellID" }, filename: { column: "Image", pattern: /^(D\d+)_(.+)_(F\d+)\.tif$/, groups: ["DishID", "Treatment", "FieldID"] } }],
  ["RAW-02-plate-reader-export.csv", { identityColumns: ["Sample"], factorColumns: [], valueColumns: ["OD450"], missingTokens: ["Overflow"] }],
  ["RAW-03-wb-densitometry.tsv", { delimiter: "\t", identityColumns: ["SampleName", "Lane"], factorColumns: ["Band"], valueColumns: ["IntegratedDensity", "Background"] }],
  ["RAW-04-animal-longitudinal.csv", { identityColumns: ["Mouse"], factorColumns: ["Group", "Sex"], valueColumns: [], wideAxisHeaderPattern: /^Wk\d+$/ }],
  ["RAW-05-filename-metadata.csv", { identityColumns: ["DishID", "FieldID", "CellID"], factorColumns: ["Treatment"], valueColumns: ["MeanIntensity", "Area_px"], filename: { column: "FileName", pattern: /^\d+_(Dish\d+)_(.+)_T(\d+)m_(F\d+)_C(\d+)\.tif$/, groups: ["DishID", "Treatment", "Time_min", "FieldID", "CellID"] } }],
  ["RAW-06-qpcr-ct.csv", { identityColumns: ["Sample", "Well"], factorColumns: ["Target"], valueColumns: ["Cq"] }],
  ["RAW-07-survival-log.csv", { identityColumns: ["AnimalID"], factorColumns: ["Arm"], valueColumns: ["Status"], deriveElapsedDays: { start: "StartDate", endCandidates: ["EndpointDate", "LastSeenDate"], output: "FollowUpDays" } }],
  ["RAW-08-dose-response.csv", { identityColumns: ["Donor", "Well"], factorColumns: ["Compound", "Dose_uM"], valueColumns: ["Value"] }],
  ["RAW-09-organoid-hierarchy.csv", { identityColumns: ["Patient", "Organoid", "Image", "ROI"], factorColumns: ["Treatment"], valueColumns: ["Area_um2"] }],
  ["RAW-10-partial-pairs.csv", { identityColumns: ["PatientID", "SpecimenBarcode"], factorColumns: ["Tissue"], valueColumns: ["ProteinAA_ng_mg"] }],
  ["RAW-11-flow-counts.csv", { identityColumns: ["Sample", "FCS_File"], factorColumns: ["Treatment", "Gate"], valueColumns: ["Count", "ParentCount"] }],
  ["RAW-12-kinetic-plate.csv", { identityColumns: ["PlateID", "Well"], factorColumns: ["Treatment"], valueColumns: [], wideAxisHeaderPattern: /^\d+ min$/ }],
];

describe("production design-first messy raw adapter", () => {
  it("maps all 12 raw-realism files with declarative plans", () => {
    expect(rawPlans).toHaveLength(12);
    for (const [file, plan] of rawPlans) {
      const result = mapAdaptiveRawText(readFileSync(resolve(evidenceRoot, "raw-realism", file), "utf8"), plan);
      expect(result.success, `${file}: ${result.diagnostics.join(",")}`).toBe(true);
      expect(result.sourceRows).toBeGreaterThan(0);
    }
  });
});

import { describe, expect, it } from "vitest";
import {
  AdaptiveColumnMappingSchema,
  AdaptiveDesignTemplateSchema,
  AdaptiveRawLineageSchema,
  CanonicalAdaptiveObservationSchema,
  type CanonicalAdaptiveObservation,
  type StructureContract,
} from "@lsaa/domain";
import { buildStructureContract } from "@lsaa/adaptive-input";
import { ProjectStateSchema } from "@lsaa/project";

import { createAdaptiveWorkspace } from "./adaptiveWorkspace";
import { experimentCellKey, reuseExperimentDesign } from "./experimentDraft";
import {
  createExperimentWorkspaceProject,
  rehydrateExperimentWorkspace,
} from "./experimentWorkspaceProject";

const now = "2026-08-27T00:00:00.000Z";

function observation(input: {
  contract: StructureContract;
  index: number;
  identities: Record<string, string>;
  factors?: Record<string, string>;
  axes?: Record<string, string | number>;
  values: Record<string, string | number | boolean | null>;
  sourceRow?: number | null;
}): CanonicalAdaptiveObservation {
  return CanonicalAdaptiveObservationSchema.parse({
    observationId: `${input.contract.contractId}.${input.index}`,
    readoutKey: input.contract.readouts[0]!.key,
    identities: input.identities,
    factors: input.factors ?? {},
    axes: input.axes ?? {},
    hierarchy: {},
    values: input.values,
    missingness: {},
    sourceRow: input.sourceRow === undefined ? input.index + 1 : input.sourceRow,
  });
}

describe("adaptive canonical observation store", () => {
  it("safe-stops a legacy-cell edit that would bypass imported canonical lineage", () => {
    const contract = buildStructureContract({
      experimentName: "Donor split proportion",
      experimentDescription: "Each donor culture was split into vehicle and drug dishes.",
      experimentalUnitLabel: "condition dish",
      identityLabel: "Dish ID",
      readoutLabel: "Ciliated proportion",
      readoutRepresentation: "proportion_counts",
      factorName: "Treatment",
      factorLevels: ["Vehicle", "Drug"],
      sameIdentityAcrossConditions: false,
      conditionEntityRelationship: {
        kind: "distinct_condition_units_shared_source",
        sourceUnitLabel: "Donor",
        sourceIdentityLabel: "Donor ID",
        sourceRole: "block",
        completeSetsRequired: true,
      },
    });
    const donorIdentity = contract.matching.identityKey!;
    const dishIdentity = contract.identities.find(
      ({ unitLevelKey }) => unitLevelKey === contract.experimentalUnitLevelKey,
    )!.key;
    const readout = contract.readouts[0]!;
    const numeratorKey = `${readout.key}_${readout.componentKeys[0]!}`;
    const denominatorKey = `${readout.key}_${readout.componentKeys[1]!}`;
    const observations = ["D1", "D2"].flatMap((donor, donorIndex) =>
      ["Vehicle", "Drug"].map((treatment, treatmentIndex) =>
        observation({
          contract,
          index: donorIndex * 2 + treatmentIndex + 1,
          identities: {
            [donorIdentity]: donor,
            [dishIdentity]: `${donor}-${treatment}`,
          },
          factors: { [contract.factors[0]!.key]: treatment },
          values: { [numeratorKey]: 2 + donorIndex, [denominatorKey]: 10 },
        }),
      ),
    );
    const workspace = createAdaptiveWorkspace({
      contract,
      observations,
      mapping: AdaptiveColumnMappingSchema.parse({
        schemaVersion: "0.1.0",
        sourceLabel: "original clipboard",
        delimiter: "tab",
        headerRow: 1,
        columns: {
          "Donor ID": { role: "identity", semanticKey: donorIdentity },
          "Dish ID": { role: "identity", semanticKey: dishIdentity },
        },
        confirmedAt: now,
      }),
      lineage: AdaptiveRawLineageSchema.parse({
        schemaVersion: "0.1.0",
        sourceKind: "tsv",
        sourceLabel: "donor.tsv",
        importedAt: now,
        rawText: "original raw text",
        sha256: null,
        transformations: ["typed_canonicalization"],
      }),
      now,
    });
    if (!workspace.draft) throw new Error("Expected an editable adaptive workspace");
    const donor = workspace.draft.experiments.find(({ stableUnitId }) => stableUnitId === "D1")!;
    const drug = workspace.draft.conditions.find(({ label }) => label === "Drug")!;
    const key = experimentCellKey({
      experimentId: donor.id,
      conditionId: drug.id,
      readoutId: workspace.draft.readouts[0]!.id,
    });
    const cells = {
      ...workspace.cells,
      [key]: { kind: "proportion" as const, positive: 8, eligible: 12 },
    };

    expect(() =>
      createExperimentWorkspaceProject({
        draft: workspace.draft!,
        cells,
        graphs: [],
        now,
      }),
    ).toThrow("SOURCE_LINEAGE_CANONICAL_REVISION_REQUIRED");
    expect(workspace.snapshot.canonicalObservations).toEqual(observations);
    expect(workspace.snapshot.rawLineage?.transformations).toEqual(["typed_canonicalization"]);
  });

  it("persists nested values edited at one repeated-axis point without losing Cell identity", () => {
    const contract = buildStructureContract({
      experimentName: "Repeated nested imaging",
      experimentDescription: "Cells in each dish were measured at 0 and 6 hours.",
      experimentalUnitLabel: "Dish",
      identityLabel: "Dish ID",
      readoutLabel: "Intensity",
      readoutRepresentation: "scalar",
      sameIdentityAcrossConditions: false,
      orderedAxis: { label: "Time", unit: "h", levels: [0, 6], sameIdentity: true },
      nestedObservationLabel: "Cell",
    });
    const dishIdentity = contract.identities.find(
      ({ unitLevelKey }) => unitLevelKey === contract.experimentalUnitLevelKey,
    )!.key;
    const cellIdentity = contract.identities.find(
      ({ unitLevelKey }) => unitLevelKey === contract.readouts[0]!.observationLevelKey,
    )!.key;
    const axis = contract.orderedAxes[0]!;
    const observations = [0, 6].flatMap((time, timeIndex) =>
      ["Cell-1", "Cell-2"].map((cell, cellIndex) =>
        observation({
          contract,
          index: timeIndex * 2 + cellIndex + 1,
          identities: { [dishIdentity]: "Dish-1", [cellIdentity]: cell },
          axes: { [axis.key]: time },
          values: { [contract.readouts[0]!.key]: time + cellIndex + 1 },
          sourceRow: null,
        }),
      ),
    );
    const workspace = createAdaptiveWorkspace({
      contract,
      observations,
      mapping: null,
      lineage: null,
      now,
    });
    if (!workspace.draft) throw new Error("Expected an editable repeated workspace");
    const timePoint = workspace.draft.time.points.find(({ value }) => value === 6)!;
    const key = experimentCellKey({
      experimentId: workspace.draft.experiments[0]!.id,
      conditionId: workspace.draft.conditions[0]!.id,
      readoutId: workspace.draft.readouts[0]!.id,
      timePointId: timePoint.id,
    });
    const cells = {
      ...workspace.cells,
      [key]: { kind: "nested_continuous" as const, source: "manual" as const, rawValues: [21, 22] },
    };

    const state = createExperimentWorkspaceProject({
      draft: workspace.draft,
      cells,
      graphs: [],
      now,
    });
    const editedAtSix = state.adaptiveInput!.canonicalObservations.filter(
      (row) => row.axes[axis.key] === 6,
    );
    expect(editedAtSix.map((row) => row.values[contract.readouts[0]!.key])).toEqual([21, 22]);
    expect(editedAtSix.map((row) => row.identities[cellIdentity])).toEqual(["Cell-1", "Cell-2"]);
    const persisted = ProjectStateSchema.parse(JSON.parse(JSON.stringify(state)));
    const reopened = rehydrateExperimentWorkspace(persisted)!;
    expect(reopened.cells[key]).toMatchObject({
      kind: "nested_continuous",
      rawValues: [21, 22],
    });
  });

  it("creates a data-free versioned template when an adaptive design is reused", () => {
    const contract = buildStructureContract({
      experimentName: "Reusable donor split",
      experimentDescription: "Donor material was divided into separate condition dishes.",
      experimentalUnitLabel: "condition dish",
      identityLabel: "Dish ID",
      readoutLabel: "Signal",
      readoutRepresentation: "scalar",
      factorName: "Treatment",
      factorLevels: ["Vehicle", "Drug"],
      sameIdentityAcrossConditions: false,
      conditionEntityRelationship: {
        kind: "distinct_condition_units_shared_source",
        sourceUnitLabel: "Donor",
        sourceIdentityLabel: "Donor ID",
        sourceRole: "block",
        completeSetsRequired: true,
      },
    });
    const donorIdentity = contract.matching.identityKey!;
    const dishIdentity = contract.identities.find(
      ({ unitLevelKey }) => unitLevelKey === contract.experimentalUnitLevelKey,
    )!.key;
    const observations = ["Vehicle", "Drug"].map((treatment, index) =>
      observation({
        contract,
        index: index + 1,
        identities: { [donorIdentity]: "D1", [dishIdentity]: `D1-${treatment}` },
        factors: { [contract.factors[0]!.key]: treatment },
        values: { [contract.readouts[0]!.key]: index + 1 },
      }),
    );
    const workspace = createAdaptiveWorkspace({
      contract,
      observations,
      mapping: AdaptiveColumnMappingSchema.parse({
        schemaVersion: "0.1.0",
        sourceLabel: "original clipboard",
        delimiter: "tab",
        headerRow: 1,
        columns: {
          "Donor ID": { role: "identity", semanticKey: donorIdentity },
          "Dish ID": { role: "identity", semanticKey: dishIdentity },
        },
        confirmedAt: now,
      }),
      lineage: AdaptiveRawLineageSchema.parse({
        schemaVersion: "0.1.0",
        sourceKind: "clipboard",
        sourceLabel: "original clipboard",
        importedAt: now,
        rawText: "Donor ID\tDish ID\tTreatment\tSignal",
        sha256: null,
        transformations: [],
      }),
      now,
    });
    if (!workspace.draft) throw new Error("Expected a reusable adaptive workspace");
    const reused = reuseExperimentDesign({
      ...workspace.draft,
      importProvenance: {
        sourceLabel: "old.tsv",
        importedAt: now,
        headers: ["Signal"],
        sourceRows: [["1"]],
        mapping: { value: "Signal" },
        excludedRowNumbers: [],
        duplicateDecision: "none",
      },
    });

    expect(reused.adaptiveInput).toBeUndefined();
    expect(reused.importProvenance).toBeUndefined();
    expect(reused.adaptiveTemplate).toMatchObject({
      schemaVersion: "0.1.0",
      sourceSnapshotVersion: "0.1.0",
      contract,
    });
    expect(reused.adaptiveTemplate).not.toHaveProperty("canonicalObservations");
    expect(reused.adaptiveTemplate).not.toHaveProperty("mapping");
    expect(reused.adaptiveTemplate).not.toHaveProperty("rawLineage");
    expect(
      AdaptiveDesignTemplateSchema.safeParse({
        ...reused.adaptiveTemplate,
        canonicalObservations: observations,
      }).success,
    ).toBe(false);

    const state = createExperimentWorkspaceProject({ draft: reused, cells: {}, graphs: [], now });
    expect(state.adaptiveInput?.canonicalObservations).toEqual([]);
    expect(state.adaptiveInput?.mapping).toBeNull();
    expect(state.adaptiveInput?.rawLineage).toBeNull();
    expect(state.observations).toEqual([]);
    const persisted = ProjectStateSchema.parse(JSON.parse(JSON.stringify(state)));
    expect(rehydrateExperimentWorkspace(persisted)?.draft.adaptiveInput?.contract).toMatchObject({
      experimentName: reused.name,
    });
  });
});

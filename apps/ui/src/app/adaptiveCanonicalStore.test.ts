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
import {
  restoreLegacyScalarDisplayTexts,
  synchronizeAdaptiveSnapshot,
} from "./adaptiveCanonicalStore";
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
  it("restores published scalar spelling through a unique projection without changing scientific history", () => {
    const contract = buildStructureContract({
      experimentName: "Published scalar",
      experimentDescription: "Independent dishes",
      experimentalUnitLabel: "dish",
      identityLabel: "dish ID",
      readoutLabel: "Intensity",
      readoutRepresentation: "scalar",
      factorName: "Treatment",
      factorLevels: ["Control", "Drug"],
      sameIdentityAcrossConditions: false,
    });
    const valueKey = contract.readouts[0]!.key;
    const rows = ["Control", "Drug"].map((treatment, index) =>
      observation({
        contract,
        index,
        identities: { [contract.identities[0]!.key]: "dish-" + index },
        factors: { [contract.factors[0]!.key]: treatment },
        values: { [valueKey]: 10 + index },
        sourceRow: null,
      }),
    );
    const workspace = createAdaptiveWorkspace({
      contract,
      observations: rows,
      mapping: null,
      lineage: null,
      now,
    });
    if (!workspace.draft) throw new Error("Editable scalar fixture required");
    const firstKey = experimentCellKey({
      experimentId: workspace.draft.experiments[0]!.id,
      conditionId: workspace.draft.conditions[0]!.id,
      readoutId: workspace.draft.readouts[0]!.id,
    });
    const texts = { [firstKey]: "10.00" };
    const migrated = restoreLegacyScalarDisplayTexts(workspace.draft, workspace.cells, texts);
    expect(migrated.adaptiveInput!.numericPresentation!.displayTexts).toEqual({
      ["canonical-matrix:" + rows[0]!.observationId + ":" + valueKey]: "10.00",
    });
    expect(migrated.adaptiveInput!.canonicalObservations).toEqual(rows);
    expect(migrated.adaptiveInput!.contract).toEqual(contract);
    const original = createExperimentWorkspaceProject({
      draft: workspace.draft,
      cells: workspace.cells,
      graphs: [],
      cellDisplayTexts: texts,
      now,
    });
    const reopened = rehydrateExperimentWorkspace(original)!;
    expect(reopened.draft.adaptiveInput!.numericPresentation!.displayTexts).toEqual(
      migrated.adaptiveInput!.numericPresentation!.displayTexts,
    );
    const saved = createExperimentWorkspaceProject({
      ...reopened,
      existingState: original,
      now: "2026-10-12T08:00:00Z",
    });
    for (const key of [
      "rawRevisions",
      "observations",
      "unitInstances",
      "analysisRuns",
      "provenanceEvents",
    ] as const)
      expect(saved[key]).toEqual(original[key]);
    expect(
      restoreLegacyScalarDisplayTexts(workspace.draft, workspace.cells, {
        [firstKey]: "10.000000000000001",
      }).adaptiveInput!.numericPresentation,
    ).toBeUndefined();
    const changedCells = {
      ...workspace.cells,
      [firstKey]: {
        kind: "nested_continuous" as const,
        rawValues: [12],
        source: "manual" as const,
      },
    };
    expect(
      restoreLegacyScalarDisplayTexts(workspace.draft, changedCells, texts).adaptiveInput!
        .numericPresentation,
    ).toBeUndefined();
  });

  it("retains published independent WB session provenance during no-op synchronization", () => {
    const contract = buildStructureContract({
      experimentName: "Published WB",
      experimentDescription: "Independent dishes",
      experimentalUnitLabel: "dish",
      identityLabel: "dish ID",
      readoutLabel: "Protein",
      readoutRepresentation: "target_reference",
      factorName: "Treatment",
      factorLevels: ["Control", "Drug"],
      sameIdentityAcrossConditions: false,
    });
    const readout = contract.readouts[0]!;
    const rows = ["Control", "Drug"].map((treatment, index) => ({
      ...observation({
        contract,
        index,
        identities: { [contract.identities[0]!.key]: `dish-${index}` },
        factors: { [contract.factors[0]!.key]: treatment },
        values: { [`${readout.key}_target`]: 10 + index * 10, [`${readout.key}_reference`]: 5 },
        sourceRow: null,
      }),
      experimentSessionId: "published-run-label",
    }));
    const workspace = createAdaptiveWorkspace({
      contract,
      observations: rows,
      mapping: null,
      lineage: null,
      now,
    });
    if (!workspace.draft) throw new Error("Expected editable WB fixture");
    const snapshot = synchronizeAdaptiveSnapshot({
      draft: workspace.draft,
      cells: workspace.cells,
      now: "2026-10-12T00:00:00Z",
    });
    expect(snapshot?.canonicalObservations).toEqual(rows);
    expect(snapshot?.contract.matching.kind).toBe("independent");
    const first = ProjectStateSchema.parse(
      createExperimentWorkspaceProject({
        draft: workspace.draft,
        cells: workspace.cells,
        graphs: [],
        now,
      }),
    );
    const reopened = rehydrateExperimentWorkspace(first);
    if (!reopened) throw new Error("Expected reopened WB fixture");
    const second = ProjectStateSchema.parse(
      createExperimentWorkspaceProject({
        ...reopened,
        existingState: first,
        now: "2026-10-12T00:00:00Z",
      }),
    );
    expect(second.rawRevisions).toEqual(first.rawRevisions);
    expect(second.observations).toEqual(first.observations);
    expect(second.unitInstances).toEqual(first.unitInstances);
    expect(second.activeRawRevisionId).toBe(first.activeRawRevisionId);
    expect(second.adaptiveInput?.canonicalObservations).toEqual(rows);
  });

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
    const donor = workspace.draft.experiments.find(({ label }) => label === "D1")!;
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
      observationUnitIds: ["Cell-1", "Cell-2"],
    });
    const olderMetadata = {
      ...persisted,
      unitInstances: persisted.unitInstances.map((unit) => {
        if (unit.metadata.semanticIdentity !== "Cell-2") return unit;
        const metadata = { ...unit.metadata };
        delete metadata.semanticIdentity;
        return { ...unit, metadata };
      }),
    };
    expect(rehydrateExperimentWorkspace(olderMetadata)!.cells[key]).toMatchObject({
      rawValues: [21, 22],
      observationUnitIds: ["Cell-1", ""],
    });
    const resaved = createExperimentWorkspaceProject({
      draft: reopened.draft,
      cells: {
        ...reopened.cells,
        [key]: {
          ...reopened.cells[key],
          kind: "nested_continuous",
          source: "manual",
          rawValues: [23, 22],
        },
      },
      graphs: [],
      now,
      existingState: persisted,
    });
    expect(
      resaved
        .adaptiveInput!.canonicalObservations.filter((row) => row.axes[axis.key] === 6)
        .map((row) => row.identities[cellIdentity]),
    ).toEqual(["Cell-1", "Cell-2"]);
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

    const edited = {
      ...reused,
      conditions: reused.conditions.map((condition) =>
        condition.label === "Drug"
          ? {
              ...condition,
              label: "Drug revised",
              attributes: {
                ...condition.attributes,
                [`factor.${contract.factors[0]!.key}`]: "Drug revised",
              },
            }
          : condition,
      ),
    };
    const editedState = createExperimentWorkspaceProject({
      draft: edited,
      cells: {},
      graphs: [],
      now,
    });
    const reopened = rehydrateExperimentWorkspace(
      ProjectStateSchema.parse(JSON.parse(JSON.stringify(editedState))),
    )!;
    expect(reopened.draft.conditions.map(({ label }) => label)).toEqual([
      "Vehicle",
      "Drug revised",
    ]);
    expect(reopened.draft.adaptiveInput?.contract.factors[0]?.levels).toEqual([
      "Vehicle",
      "Drug revised",
    ]);
    expect(reopened.draft.adaptiveInput?.contract.matching).toEqual(contract.matching);
    expect(reopened.draft.adaptiveInput?.contract.unitLevels).toEqual(contract.unitLevels);
    expect(editedState.observations).toEqual([]);
    expect(workspace.snapshot.canonicalObservations).toEqual(observations);
    expect(workspace.snapshot.contract.factors[0]?.levels).toEqual(["Vehicle", "Drug"]);
  });
});

import { describe, expect, it } from "vitest";
import {
  CanonicalAdaptiveObservationSchema,
  StructureContractSchema,
  type CanonicalAdaptiveObservation,
  type StructureContract,
} from "@lsaa/domain";
import {
  applyCompactScalarEdit,
  assertAdaptiveObservationViewParity,
  assessCompactEditability,
  buildAdaptiveObservationViews,
  projectAdaptiveObservationView,
} from "./adaptive-observation-views";
import { buildAdaptiveSpreadsheetViewModel } from "./adaptive-spreadsheet-view-model";

function contract(overrides: Partial<StructureContract> = {}): StructureContract {
  return StructureContractSchema.parse({
    schemaVersion: "0.1.0",
    contractId: "contract.fixture",
    experimentName: "Fixture experiment",
    experimentDescription: "A fixture for adaptive spreadsheet projection.",
    unitLevels: [
      {
        key: "unit",
        label: "Dish",
        role: "experimental_unit",
        parentKey: null,
      },
    ],
    experimentalUnitLevelKey: "unit",
    identities: [
      {
        key: "unit_id",
        label: "Dish ID",
        unitLevelKey: "unit",
        required: false,
      },
    ],
    factors: [
      {
        key: "condition",
        label: "Condition",
        levels: ["control", "drug"],
        unitRole: "between_unit",
        relationship: "independent",
        ordered: false,
        referenceLevel: "control",
      },
    ],
    matching: {
      kind: "independent",
      identityKey: null,
      completeSetsRequired: null,
    },
    orderedAxes: [],
    readouts: [
      {
        key: "value",
        label: "Value",
        valueType: "scalar",
        representation: "scalar",
        componentKeys: ["value"],
        referenceRole: "none",
        observationLevelKey: "unit",
        axisKeys: [],
      },
    ],
    allowedMissingness: ["unknown", "not_collected"],
    rawObservationGrain: "one Dish observation",
    ...overrides,
  });
}

function observation(
  id: string,
  values: Record<string, string | number | boolean | null>,
  overrides: Partial<CanonicalAdaptiveObservation> = {},
): CanonicalAdaptiveObservation {
  return CanonicalAdaptiveObservationSchema.parse({
    observationId: id,
    readoutKey: "value",
    identities: {},
    factors: { condition: "control" },
    axes: {},
    hierarchy: {},
    values,
    missingness: {},
    sourceRow: null,
    ...overrides,
  });
}

describe("adaptive observation views", () => {
  it("seeds editable spreadsheet rows from the contract before observations exist", () => {
    const model = buildAdaptiveSpreadsheetViewModel(contract(), []);

    expect(model.compact.rows.map(({ group }) => group.coordinates.factors)).toEqual([
      { condition: "control" },
      { condition: "drug" },
    ]);
    expect(model.compact.rows.every(({ observationIds }) => observationIds.length === 0)).toBe(
      true,
    );
    expect(
      model.columns.some(({ role, semanticKey }) => role === "value" && semanticKey === "value"),
    ).toBe(true);
  });

  it("keeps independent unequal n as separate compact groups without padding or pairing", () => {
    const observations = [
      observation("obs.c1", { value: 1 }, { factors: { condition: "control" } }),
      observation("obs.c2", { value: 2 }, { factors: { condition: "control" } }),
      observation("obs.d1", { value: 3 }, { factors: { condition: "drug" } }),
      observation("obs.d2", { value: 4 }, { factors: { condition: "drug" } }),
      observation("obs.d3", { value: 5 }, { factors: { condition: "drug" } }),
    ];
    const views = buildAdaptiveObservationViews(contract(), observations);

    expect(views.compact.groups.map((group) => group.observationIds)).toEqual([
      ["obs.c1", "obs.c2"],
      ["obs.d1", "obs.d2", "obs.d3"],
    ]);
    expect(views.compact.groups.map((group) => group.observations.length)).toEqual([2, 3]);
    expect(views.compact.groups[0]?.observationIds).not.toEqual(
      views.compact.groups[1]?.observationIds,
    );
    expect(views.compact.observationCount).toBe(5);
    expect(views.expanded.rows).toHaveLength(5);
    expect(views.compactEditability.status).toBe("editable");
    expect(assertAdaptiveObservationViewParity(views)).toBe(true);
  });

  it("edits only one independent condition group, preserving IDs and unequal n", () => {
    const observations = [
      observation("obs.c1", { value: 1 }, { factors: { condition: "control" } }),
      observation("obs.c2", { value: 2 }, { factors: { condition: "control" } }),
      observation("obs.d1", { value: 3 }, { factors: { condition: "drug" } }),
    ];
    const target = {
      readoutKey: "value",
      factors: { condition: "control" },
      axes: {},
      hierarchy: {},
    } as const;
    const appended = applyCompactScalarEdit(contract(), observations, {
      targetCoordinates: target,
      values: [10, 20, 30],
      createObservationId: ({ ordinal }) => `obs.c${ordinal + 1}`,
    });

    expect(appended.addedObservationIds).toEqual(["obs.c4"]);
    expect(appended.updatedObservationIds).toEqual(["obs.c1", "obs.c2"]);
    expect(appended.observations.map(({ observationId }) => observationId)).toEqual([
      "obs.c1",
      "obs.c2",
      "obs.c4",
      "obs.d1",
    ]);
    expect(
      appended.observations.find(({ observationId }) => observationId === "obs.c4")?.identities,
    ).toEqual({ unit_id: "obs.c4" });
    expect(
      appended.observations.find(({ observationId }) => observationId === "obs.d1")?.values,
    ).toEqual({
      value: 3,
    });

    const shortened = applyCompactScalarEdit(contract(), appended.observations, {
      targetCoordinates: target,
      values: [99],
      createObservationId: () => {
        throw new Error("no new ID should be requested when shortening");
      },
    });
    expect(shortened.removedObservationIds).toEqual(["obs.c2", "obs.c4"]);
    expect(shortened.observations.map(({ observationId }) => observationId)).toEqual([
      "obs.c1",
      "obs.d1",
    ]);
    expect(
      shortened.observations.find(({ observationId }) => observationId === "obs.c1")?.values,
    ).toEqual({
      value: 99,
    });
    expect(
      shortened.observations.find(({ observationId }) => observationId === "obs.d1")?.values,
    ).toEqual({
      value: 3,
    });
  });

  it("allows independent scalar IDs without treating them as cross-condition linkage", () => {
    const independentWithIds = contract({
      identities: [{ key: "unit_id", label: "Dish ID", unitLevelKey: "unit", required: true }],
    });
    const observations = [
      observation("obs.c1", { value: 1 }, { identities: { unit_id: "dish-1" } }),
      observation("obs.c2", { value: 2 }, { identities: { unit_id: "dish-2" } }),
    ];
    const target = {
      readoutKey: "value",
      factors: { condition: "control" },
      axes: {},
      hierarchy: {},
    } as const;
    expect(assessCompactEditability(independentWithIds, observations).status).toBe("editable");
    const edited = applyCompactScalarEdit(independentWithIds, observations, {
      targetCoordinates: target,
      values: [11, 22],
      createObservationId: () => "unused",
    });
    expect(edited.observations.map(({ observationId }) => observationId)).toEqual([
      "obs.c1",
      "obs.c2",
    ]);
    expect(edited.observations.map(({ identities }) => identities)).toEqual([
      { unit_id: "dish-1" },
      { unit_id: "dish-2" },
    ]);
  });

  it("can append again when prior unit identities were generated from stable record IDs", () => {
    const target = {
      readoutKey: "value",
      factors: { condition: "control" },
      axes: {},
      hierarchy: {},
    } as const;
    const first = applyCompactScalarEdit(contract(), [], {
      targetCoordinates: target,
      values: [1],
      createObservationId: () => "obs.generated.1",
    });
    const second = applyCompactScalarEdit(contract(), first.observations, {
      targetCoordinates: target,
      values: [1, 2],
      createObservationId: () => "obs.generated.2",
    });

    expect(second.observations.map(({ observationId }) => observationId)).toEqual([
      "obs.generated.1",
      "obs.generated.2",
    ]);
    expect(second.observations.map(({ identities }) => identities)).toEqual([
      { unit_id: "obs.generated.1" },
      { unit_id: "obs.generated.2" },
    ]);
  });

  it("uses a caller-supplied human unit identity without replacing the stable observation ID", () => {
    const target = {
      readoutKey: "value",
      factors: { condition: "control" },
      axes: {},
      hierarchy: {},
    } as const;
    const identityContexts: Array<{ observationId: string; ordinal: number }> = [];
    const appended = applyCompactScalarEdit(contract(), [], {
      targetCoordinates: target,
      values: [1, 2],
      createObservationId: ({ ordinal }) => `obs.control.${ordinal}`,
      createExperimentalUnitIdentity: ({ observationId, ordinal }) => {
        identityContexts.push({ observationId, ordinal });
        return `control ${ordinal}`;
      },
    });

    expect(identityContexts).toEqual([
      { observationId: "obs.control.1", ordinal: 1 },
      { observationId: "obs.control.2", ordinal: 2 },
    ]);
    expect(appended.observations.map(({ observationId }) => observationId)).toEqual([
      "obs.control.1",
      "obs.control.2",
    ]);
    expect(appended.observations.map(({ identities }) => identities)).toEqual([
      { unit_id: "control 1" },
      { unit_id: "control 2" },
    ]);
  });

  it("blocks compact editing when a factor declares within-unit semantics", () => {
    const withinUnitContract = contract({
      factors: [
        {
          key: "condition",
          label: "Condition",
          levels: ["control", "drug"],
          unitRole: "within_unit",
          relationship: "repeated",
          ordered: false,
          referenceLevel: "control",
        },
      ],
      // Keep this intentionally inconsistent to protect the adapter boundary:
      // a factor's explicit within-unit declaration must not be ignored if a
      // caller has not yet populated the aggregate matching field.
      matching: { kind: "independent", identityKey: null, completeSetsRequired: null },
    });
    const decision = assessCompactEditability(withinUnitContract, [
      observation("obs.within", { value: 1 }),
    ]);
    expect(decision.status).toBe("expanded_required");
    expect(decision.reasonCodes).toContain("matching");
  });

  it("preserves paired identity coordinates and never uses row position as matching", () => {
    const pairedContract = contract({
      identities: [{ key: "unit_id", label: "Dish ID", unitLevelKey: "unit", required: true }],
      factors: [
        {
          key: "condition",
          label: "Condition",
          levels: ["control", "drug"],
          unitRole: "within_unit",
          relationship: "paired",
          ordered: false,
          referenceLevel: "control",
        },
      ],
      matching: { kind: "matched", identityKey: "unit_id", completeSetsRequired: true },
    });
    const observations = [
      observation(
        "obs.dish2.drug",
        { value: 20 },
        {
          identities: { unit_id: "dish-2" },
          factors: { condition: "drug" },
        },
      ),
      observation(
        "obs.dish1.control",
        { value: 10 },
        {
          identities: { unit_id: "dish-1" },
          factors: { condition: "control" },
        },
      ),
      observation(
        "obs.dish1.drug",
        { value: 11 },
        {
          identities: { unit_id: "dish-1" },
          factors: { condition: "drug" },
        },
      ),
      observation(
        "obs.dish2.control",
        { value: 21 },
        {
          identities: { unit_id: "dish-2" },
          factors: { condition: "control" },
        },
      ),
    ];
    const views = buildAdaptiveObservationViews(pairedContract, observations);

    expect(views.expanded.rows.map((row) => row.observationId)).toEqual(
      observations.map((item) => item.observationId),
    );
    expect(views.expanded.rows.map((row) => row.rowNumber)).toEqual([1, 2, 3, 4]);
    expect(views.compact.groups).toHaveLength(2);
    expect(views.compact.groups.every((group) => group.observationIds.length === 2)).toBe(true);
    expect(views.compactEditability.status).toBe("expanded_required");
    expect(views.compactEditability.reasonCodes).toEqual(
      expect.arrayContaining(["identity_coordinates", "matching"]),
    );
  });

  it("keeps repeated-axis observations and axis values explicit", () => {
    const repeatedContract = contract({
      identities: [{ key: "unit_id", label: "Dish ID", unitLevelKey: "unit", required: true }],
      orderedAxes: [
        {
          key: "time",
          label: "Time",
          unit: "hour",
          levels: [0, 24, 48],
          sampling: "repeated_same_identity",
          identityRetained: true,
        },
      ],
      readouts: [
        {
          key: "value",
          label: "Value",
          valueType: "scalar",
          representation: "scalar",
          componentKeys: ["value"],
          referenceRole: "none",
          observationLevelKey: "unit",
          axisKeys: ["time"],
        },
      ],
      matching: { kind: "matched", identityKey: "unit_id", completeSetsRequired: true },
    });
    const observations = [
      observation(
        "obs.1.0",
        { value: 1 },
        {
          identities: { unit_id: "dish-1" },
          axes: { time: 0 },
        },
      ),
      observation(
        "obs.1.24",
        { value: 2 },
        {
          identities: { unit_id: "dish-1" },
          axes: { time: 24 },
        },
      ),
      observation(
        "obs.1.48",
        { value: 3 },
        {
          identities: { unit_id: "dish-1" },
          axes: { time: 48 },
        },
      ),
    ];
    const compact = projectAdaptiveObservationView(repeatedContract, observations, "compact");
    if (compact.mode !== "compact") throw new Error("unexpected projection mode");

    expect(compact.groups).toHaveLength(3);
    expect(compact.groups.map((group) => group.coordinates.axes.time)).toEqual([0, 24, 48]);
    expect(compact.groups.flatMap((group) => group.observationIds)).toEqual(
      observations.map((item) => item.observationId),
    );
    expect(assessCompactEditability(repeatedContract, observations).reasonCodes).toEqual(
      expect.arrayContaining(["identity_coordinates", "ordered_axis", "matching"]),
    );
  });

  it("preserves nested parent/child coordinates instead of flattening child rows", () => {
    const nestedContract = contract({
      unitLevels: [
        { key: "dish", label: "Dish", role: "experimental_unit", parentKey: null },
        { key: "cell", label: "Cell", role: "subsample", parentKey: "dish" },
      ],
      experimentalUnitLevelKey: "dish",
      identities: [
        { key: "dish_id", label: "Dish ID", unitLevelKey: "dish", required: true },
        { key: "cell_id", label: "Cell ID", unitLevelKey: "cell", required: true },
      ],
      readouts: [
        {
          key: "value",
          label: "Value",
          valueType: "scalar",
          representation: "scalar",
          componentKeys: ["value"],
          referenceRole: "none",
          observationLevelKey: "cell",
          axisKeys: [],
        },
      ],
    });
    const observations = [
      observation(
        "obs.cell.1",
        { value: 0.1 },
        {
          identities: { dish_id: "dish-1", cell_id: "cell-1" },
          hierarchy: { dish: "dish-1", cell: "cell-1" },
        },
      ),
      observation(
        "obs.cell.2",
        { value: 0.2 },
        {
          identities: { dish_id: "dish-1", cell_id: "cell-2" },
          hierarchy: { dish: "dish-1", cell: "cell-2" },
        },
      ),
    ];
    const views = buildAdaptiveObservationViews(nestedContract, observations);

    expect(views.expanded.rows.map((row) => row.hierarchy)).toEqual([
      { dish: "dish-1", cell: "cell-1" },
      { dish: "dish-1", cell: "cell-2" },
    ]);
    expect(views.compact.groups).toHaveLength(2);
    expect(views.compact.groups.flatMap((group) => group.observationIds)).toEqual([
      "obs.cell.1",
      "obs.cell.2",
    ]);
    expect(views.compactEditability.reasonCodes).toContain("hierarchy");
    expect(views.compactEditability.reasonCodes).not.toContain("identity_coordinates");
  });

  it("keeps positive and total components together as a typed raw bundle", () => {
    const proportionContract = contract({
      readouts: [
        {
          key: "positive_rate",
          label: "Positive rate",
          valueType: "proportion_counts",
          representation: "proportion_counts",
          componentKeys: ["positive", "total"],
          referenceRole: "none",
          observationLevelKey: "unit",
          axisKeys: [],
        },
      ],
    });
    const proportions = [
      observation("obs.1", { positive: 4, total: 10 }, { readoutKey: "positive_rate" }),
      observation("obs.2", { positive: 7, total: 10 }, { readoutKey: "positive_rate" }),
    ];
    const views = buildAdaptiveObservationViews(proportionContract, proportions);

    expect(views.compact.groups[0]?.observations.map((item) => item.values)).toEqual([
      { positive: 4, total: 10 },
      { positive: 7, total: 10 },
    ]);
    expect(views.expanded.rows.map((row) => row.values)).toEqual([
      { positive: 4, total: 10 },
      { positive: 7, total: 10 },
    ]);
    expect(views.compactEditability.reasonCodes).toContain("typed_representation");
  });

  it("retains shared-source identities and condition-specific sample records", () => {
    const sharedSourceContract = contract({
      unitLevels: [
        { key: "donor", label: "Donor", role: "sample", parentKey: null },
        { key: "dish", label: "Dish", role: "experimental_unit", parentKey: "donor" },
      ],
      experimentalUnitLevelKey: "dish",
      identities: [
        { key: "donor_id", label: "Donor ID", unitLevelKey: "donor", required: true },
        { key: "dish_id", label: "Dish ID", unitLevelKey: "dish", required: true },
      ],
      readouts: [
        {
          key: "value",
          label: "Value",
          valueType: "scalar",
          representation: "scalar",
          componentKeys: ["value"],
          referenceRole: "none",
          observationLevelKey: "dish",
          axisKeys: [],
        },
      ],
      matching: { kind: "matched", identityKey: "donor_id", completeSetsRequired: true },
    });
    const observations = [
      observation(
        "obs.vehicle",
        { value: 1 },
        {
          identities: { donor_id: "donor-1", dish_id: "dish-v" },
          factors: { condition: "control" },
        },
      ),
      observation(
        "obs.drug",
        { value: 2 },
        {
          identities: { donor_id: "donor-1", dish_id: "dish-d" },
          factors: { condition: "drug" },
        },
      ),
    ];
    const views = buildAdaptiveObservationViews(sharedSourceContract, observations);

    expect(views.compact.groups.map((group) => group.identityValues)).toEqual([
      { dish_id: ["dish-v"], donor_id: ["donor-1"] },
      { dish_id: ["dish-d"], donor_id: ["donor-1"] },
    ]);
    expect(views.compact.groups.flatMap((group) => group.observationIds)).toEqual([
      "obs.vehicle",
      "obs.drug",
    ]);
    expect(views.compactEditability.reasonCodes).toEqual(
      expect.arrayContaining(["identity_coordinates", "hierarchy", "matching"]),
    );
  });

  it("does not collapse duplicate axis coordinates and requires expanded editing", () => {
    const axisContract = contract({
      identities: [{ key: "unit_id", label: "Dish ID", unitLevelKey: "unit", required: true }],
      orderedAxes: [
        {
          key: "time",
          label: "Time",
          unit: "hour",
          levels: [0, 24],
          sampling: "repeated_same_identity",
          identityRetained: true,
        },
      ],
      readouts: [
        {
          key: "value",
          label: "Value",
          valueType: "scalar",
          representation: "scalar",
          componentKeys: ["value"],
          referenceRole: "none",
          observationLevelKey: "unit",
          axisKeys: ["time"],
        },
      ],
      matching: { kind: "matched", identityKey: "unit_id", completeSetsRequired: false },
    });
    const observations = [
      observation(
        "obs.a",
        { value: 1 },
        {
          identities: { unit_id: "dish-1" },
          axes: { time: 24 },
        },
      ),
      observation(
        "obs.b",
        { value: 2 },
        {
          identities: { unit_id: "dish-1" },
          axes: { time: 24 },
        },
      ),
    ];
    const views = buildAdaptiveObservationViews(axisContract, observations);

    expect(views.compact.groups).toHaveLength(1);
    expect(views.compact.groups[0]?.observationIds).toEqual(["obs.a", "obs.b"]);
    expect(views.compact.groups[0]?.observations).toHaveLength(2);
    expect(views.compactEditability.reasonCodes).toEqual(
      expect.arrayContaining(["duplicate_axis_coordinate", "ordered_axis"]),
    );
    expect(new Set(views.expanded.observationIds)).toEqual(new Set(["obs.a", "obs.b"]));
  });

  it("preserves raw source-row lineage and makes compact editing unavailable", () => {
    const observations = [observation("obs.raw.4", { value: 4 }, { sourceRow: 4 })];
    const decision = assessCompactEditability(contract(), observations);
    expect(decision.status).toBe("expanded_required");
    expect(decision.reasonCodes).toContain("source_lineage");
    const views = buildAdaptiveObservationViews(contract(), observations);
    expect(views.expanded.rows[0]?.sourceRow).toBe(4);
    expect(views.compact.groups[0]?.observations[0]?.sourceRow).toBe(4);
  });

  it("gives a generic table renderer the same canonical rows in both view modes", () => {
    const observations = [
      observation(
        "obs.c1",
        { value: 1 },
        {
          identities: { unit_id: "dish-1" },
          factors: { condition: "control" },
        },
      ),
      observation(
        "obs.c2",
        { value: 2 },
        {
          identities: { unit_id: "dish-2" },
          factors: { condition: "control" },
        },
      ),
      observation(
        "obs.d1",
        { value: 3 },
        {
          identities: { unit_id: "dish-3" },
          factors: { condition: "drug" },
        },
      ),
    ];
    const model = buildAdaptiveSpreadsheetViewModel(contract(), observations);

    expect(model.compact.columns).toBe(model.expanded.columns);
    expect(model.compact.rows.flatMap((row) => row.observationIds)).toEqual(
      model.expanded.rows.map((row) => row.observationId),
    );
    expect(model.compact.rows.map((row) => row.cells["factor.condition"])).toEqual([
      "control",
      "drug",
    ]);
    expect(model.compact.rows[0]?.cells["value.value"]).toEqual([1, 2]);
    expect(model.expanded.rows[0]?.cells["identity.unit_id"]).toBe("dish-1");
    expect(model.expanded.rows[0]?.cells["value.value"]).toBe(1);
  });

  it("renders one compact row per condition while keeping multiple scalar readouts separate", () => {
    const multiReadoutContract = contract({
      factors: [
        {
          key: "condition",
          label: "Condition",
          levels: ["control", "drug", "rescue"],
          unitRole: "between_unit",
          relationship: "independent",
          ordered: false,
          referenceLevel: "control",
        },
      ],
      readouts: [
        {
          key: "response",
          label: "Response",
          valueType: "scalar",
          representation: "scalar",
          componentKeys: ["value"],
          referenceRole: "none",
          observationLevelKey: "unit",
          axisKeys: [],
        },
        {
          key: "count",
          label: "Cell count",
          valueType: "scalar",
          representation: "scalar",
          componentKeys: ["value"],
          referenceRole: "none",
          observationLevelKey: "unit",
          axisKeys: [],
        },
      ],
    });
    const observations = [
      observation("obs.control.response.1", { response: 1 }, {
        readoutKey: "response",
        identities: { unit_id: "control-1" },
        factors: { condition: "control" },
      }),
      observation("obs.control.response.2", { response: 2 }, {
        readoutKey: "response",
        identities: { unit_id: "control-2" },
        factors: { condition: "control" },
      }),
      observation("obs.control.count.1", { count: 10 }, {
        readoutKey: "count",
        identities: { unit_id: "control-1" },
        factors: { condition: "control" },
      }),
      observation("obs.drug.response.1", { response: 3 }, {
        readoutKey: "response",
        identities: { unit_id: "drug-1" },
        factors: { condition: "drug" },
      }),
      observation("obs.drug.count.1", { count: 20 }, {
        readoutKey: "count",
        identities: { unit_id: "drug-1" },
        factors: { condition: "drug" },
      }),
      observation("obs.drug.count.2", { count: 21 }, {
        readoutKey: "count",
        identities: { unit_id: "drug-2" },
        factors: { condition: "drug" },
      }),
      observation("obs.rescue.response.1", { response: 4 }, {
        readoutKey: "response",
        identities: { unit_id: "rescue-1" },
        factors: { condition: "rescue" },
      }),
      observation("obs.rescue.count.1", { count: 30 }, {
        readoutKey: "count",
        identities: { unit_id: "rescue-1" },
        factors: { condition: "rescue" },
      }),
    ];
    const model = buildAdaptiveSpreadsheetViewModel(multiReadoutContract, observations);

    expect(model.compact.rows).toHaveLength(3);
    expect(model.compact.rows.map((row) => row.cells["factor.condition"])).toEqual([
      "control",
      "drug",
      "rescue",
    ]);
    expect(model.compact.rows.map((row) => row.cells["value.response"])).toEqual([
      [1, 2],
      [3],
      [4],
    ]);
    expect(model.compact.rows.map((row) => row.cells["value.count"])).toEqual([
      [10],
      [20, 21],
      [30],
    ]);
    expect(model.compact.rows.every((row) => row.readoutGroups.length === 2)).toBe(true);
    expect(model.compact.rows.flatMap((row) => row.observationIds)).toHaveLength(8);
    expect(new Set(model.compact.rows.flatMap((row) => row.observationIds))).toEqual(
      new Set(observations.map(({ observationId }) => observationId)),
    );
    expect(model.compact.columns.filter(({ role }) => role === "value").map(({ label }) => label)).toEqual([
      "Response",
      "Cell count",
    ]);
    expect(model.expanded.rows).toHaveLength(8);
    expect(model.expanded.columns.some(({ role }) => role === "readout")).toBe(true);
    expect(model.expanded.rows.map((row) => row.cells.readout)).toEqual([
      "Response",
      "Response",
      "Cell count",
      "Response",
      "Cell count",
      "Cell count",
      "Response",
      "Cell count",
    ]);
  });

  it("keeps a mixed scalar and typed bundle on one condition row with explicit readout columns", () => {
    const mixedContract = contract({
      factors: [
        {
          key: "condition",
          label: "Condition",
          levels: ["control", "drug", "rescue"],
          unitRole: "between_unit",
          relationship: "independent",
          ordered: false,
          referenceLevel: "control",
        },
      ],
      readouts: [
        {
          key: "response",
          label: "Response",
          valueType: "scalar",
          representation: "scalar",
          componentKeys: ["value"],
          referenceRole: "none",
          observationLevelKey: "unit",
          axisKeys: [],
        },
        {
          key: "rate",
          label: "Ciliated fraction",
          valueType: "proportion_counts",
          representation: "proportion_counts",
          componentKeys: ["positive", "total"],
          referenceRole: "none",
          observationLevelKey: "unit",
          axisKeys: [],
        },
      ],
    });
    const observations = [
      ...["control", "drug", "rescue"].flatMap((condition, index) => [
        observation(`obs.${condition}.response`, { response: index + 1 }, {
          readoutKey: "response",
          factors: { condition },
        }),
        observation(`obs.${condition}.rate`, { positive: index + 2, total: 10 }, {
          readoutKey: "rate",
          factors: { condition },
        }),
      ]),
    ];
    const model = buildAdaptiveSpreadsheetViewModel(mixedContract, observations);

    expect(model.compact.rows).toHaveLength(3);
    expect(model.compact.columns.filter(({ role }) => role === "value").map(({ label }) => label)).toEqual([
      "Response",
      "Ciliated fraction · positive",
      "Ciliated fraction · total",
    ]);
    expect(model.compact.rows.map((row) => row.cells["value.response"])).toEqual([[1], [2], [3]]);
    expect(model.compact.rows.map((row) => row.cells["value.rate_positive"])).toEqual([
      [2],
      [3],
      [4],
    ]);
    expect(model.compact.rows.map((row) => row.cells["value.rate_total"])).toEqual([
      [10],
      [10],
      [10],
    ]);
    expect(model.compactEditability.status).toBe("expanded_required");
    expect(model.expanded.rows.map((row) => row.cells.readout)).toEqual([
      "Response",
      "Ciliated fraction",
      "Response",
      "Ciliated fraction",
      "Response",
      "Ciliated fraction",
    ]);
  });

  it("keeps adapter parity across scalar, proportion, repeated-axis, nested, and typed records", () => {
    const scalar = {
      contract: contract(),
      observations: [observation("obs.scalar", { value: 1 })],
    };
    const proportion = {
      contract: contract({
        readouts: [
          {
            key: "rate",
            label: "Rate",
            valueType: "proportion_counts",
            representation: "proportion_counts",
            componentKeys: ["positive", "total"],
            referenceRole: "none",
            observationLevelKey: "unit",
            axisKeys: [],
          },
        ],
      }),
      observations: [
        observation("obs.proportion", { positive: 4, total: 10 }, { readoutKey: "rate" }),
      ],
    };
    const repeatedAxis = {
      contract: contract({
        identities: [{ key: "unit_id", label: "Dish ID", unitLevelKey: "unit", required: true }],
        orderedAxes: [
          {
            key: "time",
            label: "Time",
            unit: "hour",
            levels: [0, 24],
            sampling: "repeated_same_identity",
            identityRetained: true,
          },
        ],
        readouts: [
          {
            key: "value",
            label: "Value",
            valueType: "scalar",
            representation: "scalar",
            componentKeys: ["value"],
            referenceRole: "none",
            observationLevelKey: "unit",
            axisKeys: ["time"],
          },
        ],
      }),
      observations: [
        observation(
          "obs.repeated",
          { value: 2 },
          {
            identities: { unit_id: "dish-1" },
            axes: { time: 24 },
          },
        ),
      ],
    };
    const nested = {
      contract: contract({
        unitLevels: [
          { key: "dish", label: "Dish", role: "experimental_unit", parentKey: null },
          { key: "cell", label: "Cell", role: "subsample", parentKey: "dish" },
        ],
        experimentalUnitLevelKey: "dish",
        identities: [
          { key: "dish_id", label: "Dish ID", unitLevelKey: "dish", required: true },
          { key: "cell_id", label: "Cell ID", unitLevelKey: "cell", required: true },
        ],
        readouts: [
          {
            key: "value",
            label: "Value",
            valueType: "scalar",
            representation: "scalar",
            componentKeys: ["value"],
            referenceRole: "none",
            observationLevelKey: "cell",
            axisKeys: [],
          },
        ],
      }),
      observations: [
        observation(
          "obs.nested",
          { value: 3 },
          {
            identities: { dish_id: "dish-1", cell_id: "cell-1" },
            hierarchy: { dish: "dish-1", cell: "cell-1" },
          },
        ),
      ],
    };
    const typed = {
      contract: contract({
        readouts: [
          {
            key: "target_reference",
            label: "Target / Reference",
            valueType: "target_reference",
            representation: "target_reference",
            componentKeys: ["target", "reference"],
            referenceRole: "loading_control",
            observationLevelKey: "unit",
            axisKeys: [],
          },
        ],
      }),
      observations: [
        observation(
          "obs.typed",
          { target: 100, reference: 25 },
          { readoutKey: "target_reference" },
        ),
      ],
    };

    [scalar, proportion, repeatedAxis, nested, typed].forEach(
      ({ contract: itemContract, observations }) => {
        const model = buildAdaptiveSpreadsheetViewModel(itemContract, observations);
        expect(model.compact.columns).toBe(model.expanded.columns);
        expect(model.compact.observationIds).toEqual(
          observations.map((item) => item.observationId),
        );
        expect(model.expanded.observationIds).toEqual(
          observations.map((item) => item.observationId),
        );
        expect(model.compact.rows.flatMap((row) => row.observationIds)).toEqual(
          model.expanded.rows.map((row) => row.observationId),
        );
        expect(model.expanded.rows.map((row) => row.observation)).toEqual(observations);
      },
    );
  });
});

import { CanonicalAdaptiveObservationSchema, StructureContractSchema } from "@lsaa/domain";

export const nestedContract = StructureContractSchema.parse({
  schemaVersion: "0.1.0",
  contractId: "windows.synthetic.nested",
  experimentName: "Synthetic nested input",
  experimentDescription: "Source-only fixture",
  unitLevels: [
    { key: "dish", label: "Dish", role: "experimental_unit", parentKey: null },
    { key: "cell", label: "Cell", role: "subsample", parentKey: "dish" },
  ],
  experimentalUnitLevelKey: "dish",
  identities: [
    { key: "dish_id", label: "Dish ID", unitLevelKey: "dish", required: true },
    { key: "cell_id", label: "Cell ID", unitLevelKey: "cell", required: true },
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
  matching: { kind: "independent", identityKey: null, completeSetsRequired: null },
  orderedAxes: [],
  readouts: [
    {
      key: "signal",
      label: "Signal",
      valueType: "scalar",
      representation: "scalar",
      componentKeys: ["signal"],
      referenceRole: "none",
      observationLevelKey: "cell",
      axisKeys: [],
    },
  ],
  allowedMissingness: ["unknown", "not_collected"],
  rawObservationGrain: "one cell in an explicit dish",
});
export const nestedObservations = ["C1", "C2", "D1", "D2"].flatMap((dish, index) =>
  ["old", "sibling"].map((cell, child) =>
    CanonicalAdaptiveObservationSchema.parse({
      observationId: `obs.${dish.toLowerCase()}.${child}`,
      readoutKey: "signal",
      identities: { dish_id: dish, cell_id: index === 1 && child === 0 ? "new" : cell },
      factors: { condition: index < 2 ? "control" : "drug" },
      axes: {},
      hierarchy: { dish, cell: index === 1 && child === 0 ? "new" : cell },
      values: { signal: index * 10 + child + 1 },
      missingness: {},
      sourceRow: index * 2 + child + 2,
    }),
  ),
);

import { describe, expect, it } from "vitest";
import type { Observation } from "./data";
import {
  createLinkedReadoutDataset,
  deriveCompositionPercentages,
  requireSupportedMultiReadoutInference,
} from "./multi-readout";

const observations: Observation[] = [
  {
    id: "o.composition",
    rawRevisionId: "raw.1",
    unitInstanceId: "sample.1",
    conditionId: "control",
    outcomeId: "cell-fates",
    measurement: { kind: "categorical_counts", counts: { live: 8, dead: 2 } },
  },
  {
    id: "o.protein",
    rawRevisionId: "raw.1",
    unitInstanceId: "sample.1",
    conditionId: "control",
    outcomeId: "protein",
    measurement: { kind: "scalar", value: 4.2 },
  },
];

describe("linked multi-readout data", () => {
  it("preserves unit linkage and readout identity", () => {
    const linked = createLinkedReadoutDataset(observations);
    expect(new Set(linked.map(({ biologicalUnitId }) => biologicalUnitId))).toEqual(
      new Set(["sample.1"]),
    );
    expect(linked.map(({ readoutId }) => readoutId)).toEqual(["cell-fates", "protein"]);
  });
  it("retains counts/denominator while deriving category percentages", () => {
    const percentages = deriveCompositionPercentages(createLinkedReadoutDataset(observations));
    expect(percentages).toEqual([
      expect.objectContaining({ categoryId: "live", count: 8, denominator: 10, percentage: 80 }),
      expect.objectContaining({ categoryId: "dead", count: 2, denominator: 10, percentage: 20 }),
    ]);
  });
  it("refuses unsupported composition inference", () => {
    expect(() =>
      requireSupportedMultiReadoutInference(createLinkedReadoutDataset(observations)),
    ).toThrow(/not implemented/u);
  });
});

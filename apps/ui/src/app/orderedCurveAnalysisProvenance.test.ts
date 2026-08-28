import { describe, expect, it } from "vitest";

import { createOrderedCurveEntry } from "./orderedCurveEntry";
import {
  restoredMichaelisReadoutMeaning,
  restoredNonlinearModelSelection,
  withOrderedCurveAnalysisProvenance,
} from "./orderedCurveAnalysisProvenance";

const now = "2026-08-28T00:00:00.000Z";

function readySnapshot() {
  const entry = createOrderedCurveEntry({
    points: [
      { observationId: "rxn-0", unitLabel: "rxn-0", seriesLabel: "Enzyme A", x: 0, y: 0 },
      { observationId: "rxn-5", unitLabel: "rxn-5", seriesLabel: "Enzyme A", x: 5, y: 2.4 },
      { observationId: "rxn-10", unitLabel: "rxn-10", seriesLabel: "Enzyme A", x: 10, y: 4.1 },
    ],
    orderedAxisMeaning: "substrate_concentration",
    axisMaterialRelationship: "separate_material_per_axis_value",
    axisPointParentRelationship: "no_shared_parent_or_matching",
    orderedAxisCount: 1,
    labels: {
      experimentName: "Enzyme kinetics",
      experimentDescription: "Response measured at separate substrate concentrations.",
      experimentalUnitLabel: "Reaction",
      identityLabel: "Reaction ID",
      seriesFactorLabel: "Enzyme",
      orderedAxisLabel: "Substrate concentration",
      readoutLabel: "Response",
    },
    units: { orderedAxisUnit: "µM", readoutUnit: "µmol/min" },
    rawText: "Unit ID\tSeries\tX\tY\nrxn-0\tEnzyme A\t0\t0",
    sourceLabel: "fixture",
    sourceKind: "clipboard",
    now,
  });
  expect(entry.status).toBe("surface_ready");
  if (entry.status !== "surface_ready") throw new Error("fixture did not compile");
  return entry.snapshot;
}

describe("ordered-curve analysis provenance", () => {
  it("retains explicit model and preparation facts without changing the contract", () => {
    const snapshot = readySnapshot();
    const enriched = withOrderedCurveAnalysisProvenance(
      snapshot,
      {
        modelId: "michaelis_menten",
        michaelisReadoutMeaning: "calculated_initial_velocity",
      },
      now,
    );

    expect(enriched.contract).toEqual(snapshot.contract);
    expect(restoredNonlinearModelSelection(enriched)).toBe("michaelis_menten");
    expect(restoredMichaelisReadoutMeaning(enriched)).toBe("calculated_initial_velocity");
    expect(enriched.targetedConfirmations).toContainEqual(
      expect.objectContaining({ key: "nonlinear_model_selection", answer: "michaelis_menten" }),
    );
    expect(enriched.rawLineage?.transformations).toContain(
      "recorded Y as calculated initial velocity for Michaelis–Menten readiness",
    );
  });

  it("replaces old analysis facts instead of accumulating contradictory answers", () => {
    const snapshot = readySnapshot();
    const first = withOrderedCurveAnalysisProvenance(
      snapshot,
      { modelId: "michaelis_menten", michaelisReadoutMeaning: "calculated_initial_velocity" },
      now,
    );
    const second = withOrderedCurveAnalysisProvenance(
      first,
      { modelId: "zero_baseline_association", michaelisReadoutMeaning: "raw_time_series_or_other" },
      now,
    );

    expect(
      second.targetedConfirmations.filter(({ key }) => key === "nonlinear_model_selection"),
    ).toHaveLength(1);
    expect(
      second.targetedConfirmations.filter(({ key }) => key === "michaelis_readout_meaning"),
    ).toHaveLength(1);
    expect(restoredNonlinearModelSelection(second)).toBe("zero_baseline_association");
    expect(restoredMichaelisReadoutMeaning(second)).toBe("raw_time_series_or_other");
  });

  it("does not add provenance when no analysis fact was selected", () => {
    const snapshot = readySnapshot();
    expect(withOrderedCurveAnalysisProvenance(snapshot, {}, now)).toBe(snapshot);
    expect(restoredNonlinearModelSelection(snapshot)).toBeUndefined();
    expect(restoredMichaelisReadoutMeaning(snapshot)).toBeUndefined();
  });
});

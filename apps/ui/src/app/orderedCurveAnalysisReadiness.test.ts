import { describe, expect, it } from "vitest";

import { resolveOrderedCurveAnalysisReadiness } from "./orderedCurveAnalysisReadiness";

describe("ordered-curve analysis readiness", () => {
  it("requires an explicit model selection without inferring one from an axis", () => {
    expect(
      resolveOrderedCurveAnalysisReadiness({
        orderedAxisMeaning: "elapsed_time",
        selectedModel: "zero_baseline_association",
        modelExplicitlySelected: false,
      }),
    ).toMatchObject({
      status: "needs_model_selection",
      reasonCode: "ORDERED_CURVE_MODEL_SELECTION_REQUIRED",
    });
  });

  it("stops a substrate-concentration axis from using an association model", () => {
    expect(
      resolveOrderedCurveAnalysisReadiness({
        orderedAxisMeaning: "substrate_concentration",
        selectedModel: "zero_baseline_association",
        modelExplicitlySelected: true,
      }),
    ).toMatchObject({
      status: "safe_stop",
      reasonCode: "SUBSTRATE_CONCENTRATION_REQUIRES_COMPATIBLE_MODEL",
      preserveInput: true,
    });
  });

  it("requires calculated initial velocity before Michaelis-Menten is ready", () => {
    const base = {
      orderedAxisMeaning: "substrate_concentration" as const,
      selectedModel: "michaelis_menten" as const,
      modelExplicitlySelected: true,
    };
    expect(resolveOrderedCurveAnalysisReadiness(base).status).toBe("needs_targeted_confirmation");
    expect(
      resolveOrderedCurveAnalysisReadiness({
        ...base,
        michaelisReadoutMeaning: "raw_time_series_or_other",
      }).status,
    ).toBe("safe_stop");
    expect(
      resolveOrderedCurveAnalysisReadiness({
        ...base,
        michaelisReadoutMeaning: "calculated_initial_velocity",
      }).status,
    ).toBe("ready");
  });

  it("stops Michaelis-Menten on elapsed time without changing the selected model", () => {
    expect(
      resolveOrderedCurveAnalysisReadiness({
        orderedAxisMeaning: "elapsed_time",
        selectedModel: "michaelis_menten",
        modelExplicitlySelected: true,
        michaelisReadoutMeaning: "calculated_initial_velocity",
      }),
    ).toMatchObject({
      status: "safe_stop",
      reasonCode: "MICHAELIS_MENTEN_REQUIRES_SUBSTRATE_CONCENTRATION_AXIS",
    });
  });

  it("keeps a repeated trajectory descriptive because D17 ignores within-unit correlation", () => {
    expect(
      resolveOrderedCurveAnalysisReadiness({
        orderedAxisMeaning: "elapsed_time",
        axisMaterialRelationship: "same_physical_material_across_axis",
        selectedModel: "zero_baseline_association",
        modelExplicitlySelected: true,
      }),
    ).toMatchObject({
      status: "safe_stop",
      reasonCode: "REPEATED_TRAJECTORY_INFERENTIAL_FIT_NOT_SUPPORTED",
      preserveInput: true,
    });
  });
});

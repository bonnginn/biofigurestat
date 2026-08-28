import { describe, expect, it } from "vitest";

import {
  NONLINEAR_MODEL_DEFINITIONS,
  nonlinearModelDefinition,
  nonlinearParameterLabel,
} from "./nonlinearModelRegistry";

describe("nonlinear model registry", () => {
  it("keeps the two association models and adds a bounded Michaelis-Menten definition", () => {
    expect(NONLINEAR_MODEL_DEFINITIONS.map(({ id }) => id)).toEqual([
      "zero_baseline_association",
      "one_phase_association",
      "michaelis_menten",
    ]);
    expect(nonlinearModelDefinition("michaelis_menten")).toMatchObject({
      parameters: ["vmax", "km"],
      requiresAxisUnits: true,
      templateVersion: "0.2.0",
    });
    expect(nonlinearParameterLabel("michaelis_menten", "vmax")).toBe("Vmax");
    expect(nonlinearParameterLabel("michaelis_menten", "km")).toBe("Km");
    expect(nonlinearParameterLabel("michaelis_menten", "series.enzyme-a.vmax")).toBe("Vmax");
    expect(nonlinearParameterLabel("michaelis_menten", "series.enzyme-a.km")).toBe("Km");
  });
});

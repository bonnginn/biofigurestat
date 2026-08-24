import { describe, expect, it } from "vitest";

import {
  classifyScientificSupport,
  expectedTerminalOutcomeForSupport,
  type SupportClassificationInput,
} from "./supportClassification";

const FORMAL_FIXTURES: ReadonlyArray<
  Readonly<{
    caseId: string;
    input: SupportClassificationInput;
    expected: string;
    expectedOutcome?: string;
  }>
> = [
  { caseId: "JCB001", input: { scientificallyValidRouteExists: true }, expected: "direct" },
  { caseId: "JCB003", input: { scientificallyValidRouteExists: true }, expected: "direct" },
  { caseId: "JCB005", input: { scientificallyValidRouteExists: true }, expected: "direct" },
  {
    caseId: "JCB011",
    input: { scientificallyValidRouteExists: true, limitations: ["reduced_inference"] },
    expected: "reasonable_workaround",
  },
  {
    caseId: "JCB018",
    input: {
      scientificallyValidRouteExists: true,
      limitations: ["material_representational_compromise"],
    },
    expected: "reasonable_workaround",
  },
  {
    caseId: "JCB024",
    input: {
      scientificallyValidRouteExists: true,
      limitations: ["missing_robust_alternative"],
    },
    expected: "reasonable_workaround",
  },
  {
    caseId: "NC033",
    input: { scientificallyValidRouteExists: false },
    expected: "impossible",
    expectedOutcome: "explicit_unsupported",
  },
];

describe("scientific support calibration", () => {
  it.each(FORMAL_FIXTURES)(
    "classifies formal fixture $caseId as $expected",
    ({ input, expected }) => {
      expect(classifyScientificSupport(input)).toBe(expected);
    },
  );

  it("pairs NC033 Impossible with an explicit unsupported terminal outcome", () => {
    const fixture = FORMAL_FIXTURES.find(({ caseId }) => caseId === "NC033");
    const support = classifyScientificSupport(fixture!.input);
    expect(support).toBe("impossible");
    expect(expectedTerminalOutcomeForSupport(support)).toBe(fixture!.expectedOutcome);
  });

  it("does not downgrade Direct for ordinary interaction, cosmetic edits, or minor UX friction", () => {
    expect(
      classifyScientificSupport({
        scientificallyValidRouteExists: true,
        limitations: ["ordinary_interaction", "cosmetic_graph_edit", "minor_ux_friction"],
      }),
    ).toBe("direct");
  });

  it("distinguishes a scientifically compromising route from a defensible workaround", () => {
    expect(
      classifyScientificSupport({
        scientificallyValidRouteExists: true,
        scientificMeaningOrStructureDistorted: true,
        limitations: ["generic_design_route"],
      }),
    ).toBe("scientifically_compromising");
  });
});

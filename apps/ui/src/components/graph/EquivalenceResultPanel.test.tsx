import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";

import { EquivalenceResultPanel } from "./EquivalenceResultPanel";

describe("EquivalenceResultPanel", () => {
  it("centers the result on the estimate, confidence interval, bounds, and three-state conclusion", () => {
    render(
      <EquivalenceResultPanel
        comparisonLabels={{ "parent:clone-2": "Parent vs clone #2" }}
        result={{
          resultVersion: "0.1.0",
          plan: {
            schemaVersion: "0.1.0",
            margin: {
              scale: "percentage_point_difference",
              lowerBound: -10,
              upperBound: 10,
              unit: "percentage points",
              declaredAsPrespecified: true,
            },
            alpha: 0.05,
            claimMode: "single_primary_comparison",
            primaryComparisonId: "parent:clone-2",
          },
          comparisons: [
            {
              comparisonId: "parent:clone-2",
              estimate: 1,
              standardError: 2,
              lowerConfidenceBound: -4,
              upperConfidenceBound: 6,
              confidenceLevel: 0.9,
              lowerOneSidedPValue: 0.001,
              upperOneSidedPValue: 0.02,
              tostPValue: 0.02,
              conclusion: "equivalence_supported",
            },
          ],
        }}
      />,
    );

    expect(screen.getByText("Parent vs clone #2")).toBeVisible();
    expect(screen.getByText("同等性を支持")).toBeVisible();
    expect(screen.getByText(/90% CI -4–6 percentage points/)).toBeVisible();
    expect(screen.getByText(/TOST p = 0.02/)).toBeVisible();
    expect(
      screen.getByRole("img", {
        name: "Parent vs clone #2の信頼区間と同等性許容範囲",
      }),
    ).toBeVisible();
  });
});

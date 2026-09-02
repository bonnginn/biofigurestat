import { describe, expect, it } from "vitest";

import { safeGraphFileStem, safeNativeGraphFileStem } from "./experimentGraphDataExport";

describe("Graph export filenames", () => {
  it("keeps portable workbench names bounded and filesystem-safe", () => {
    expect(safeGraphFileStem(" Relative activity / Figure 1 ")).toBe("Relative_activity_Figure_1");
    expect(safeGraphFileStem("  ")).toBe("graph");
  });

  it("preserves the established specialist Graph spacing while removing forbidden characters", () => {
    expect(safeNativeGraphFileStem(" Kaplan–Meier survival ")).toBe("Kaplan–Meier survival");
    expect(safeNativeGraphFileStem('A:B/C*D?E"F')).toBe("A-B-C-D-E-F");
  });
});

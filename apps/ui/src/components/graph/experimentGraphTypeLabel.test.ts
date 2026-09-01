import { describe, expect, it } from "vitest";

import { experimentGraphTypeLabel } from "./experimentGraphTypeLabel";

describe("experimentGraphTypeLabel", () => {
  it("keeps graph-type identity stable while localizing its display label", () => {
    expect(experimentGraphTypeLabel("paired_dot", "ja")).toBe("対応を線で結ぶ");
    expect(experimentGraphTypeLabel("paired_dot", "en")).toBe("Paired / matched dot");
    expect(experimentGraphTypeLabel("category_percentage", "ja")).toBe("カテゴリの割合");
    expect(experimentGraphTypeLabel("category_percentage", "en")).toBe("Category percentage");
  });
});

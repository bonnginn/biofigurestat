import { describe, expect, it } from "vitest";
import { nextRovingTabIndex } from "./rovingTab";

describe("nextRovingTabIndex", () => {
  it("wraps horizontal movement and supports Home and End", () => {
    expect(nextRovingTabIndex("ArrowRight", 3, 4)).toBe(0);
    expect(nextRovingTabIndex("ArrowLeft", 0, 4)).toBe(3);
    expect(nextRovingTabIndex("Home", 2, 4)).toBe(0);
    expect(nextRovingTabIndex("End", 1, 4)).toBe(3);
  });

  it("ignores unrelated keys and empty tablists", () => {
    expect(nextRovingTabIndex("Enter", 0, 4)).toBeNull();
    expect(nextRovingTabIndex("ArrowRight", 0, 0)).toBeNull();
  });
});

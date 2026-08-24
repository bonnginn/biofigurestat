import { describe, expect, it } from "vitest";
import {
  parseContingencyPaste,
  parseDistributionPaste,
  parseMatchedLongPaste,
  parseXyPaste,
} from "./common-methods";

describe("common method paste contracts", () => {
  it("accepts integer contingency counts but never percentages", () => {
    expect(
      parseContingencyPaste("Category\tEvent\tNo event\nControl\t1\t9\nTreatment\t6\t4").counts,
    ).toEqual([
      [1, 9],
      [6, 4],
    ]);
    expect(() => parseContingencyPaste("Category\tYes\tNo\nA\t12.5\t87.5\nB\t20\t80")).toThrow(
      /integer counts/,
    );
  });
  it("preserves matched identity and refuses duplicate cells", () => {
    expect(parseMatchedLongPaste("Unit ID\tCondition\tValue\nu1\tA\t1\nu1\tB\t2")).toHaveLength(2);
    expect(() => parseMatchedLongPaste("Unit ID\tCondition\tValue\nu1\tA\t1\nu1\tA\t2")).toThrow(
      /duplicate/,
    );
  });
  it("preserves independent XY identity and source distribution values", () => {
    expect(parseXyPaste("Unit ID\tX\tY\nu1\t1\t2\nu2\t2\t4")[1]).toEqual({
      unitId: "u2",
      x: 2,
      y: 4,
    });
    expect(parseDistributionPaste("1 2\n3,4")).toEqual([1, 2, 3, 4]);
  });
});

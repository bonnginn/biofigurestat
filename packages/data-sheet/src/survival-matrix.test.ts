import { describe, expect, it } from "vitest";

import { parseMatrixPaste } from "./matrix";
import { parseSurvivalPaste } from "./survival";

describe("survival spreadsheet paste", () => {
  it("parses Event/Censored labels and retains optional metadata", () => {
    const rows = parseSurvivalPaste(
      "Unit ID\tGroup\tFollow-up time\tStatus\tSex\nmouse-1\tControl\t4\tEvent\tF\nmouse-2\tControl\t7\tCensored\tM",
    );
    expect(rows).toEqual([
      {
        unitId: "mouse-1",
        conditionId: "Control",
        followUpTime: 4,
        eventObserved: true,
        metadata: { sex: "F" },
      },
      {
        unitId: "mouse-2",
        conditionId: "Control",
        followUpTime: 7,
        eventObserved: false,
        metadata: { sex: "M" },
      },
    ]);
  });

  it("requires an explicit numeric status mapping and rejects missing status", () => {
    const numeric = "Unit,Group,Time,Status\nu1,A,2,1\nu2,B,3,0";
    expect(() => parseSurvivalPaste(numeric)).toThrow(/explicit numeric mapping/u);
    expect(
      parseSurvivalPaste(numeric, { numericStatusMapping: { event: "1", censored: "0" } }),
    ).toMatchObject([{ eventObserved: true }, { eventObserved: false }]);
    expect(() => parseSurvivalPaste("Unit,Group,Time,Status\nu1,A,2,")).toThrow(/missing/u);
  });

  it("rejects duplicate units and negative follow-up", () => {
    expect(() => parseSurvivalPaste("Unit,Group,Time,Status\nu1,A,2,Event\nu1,B,3,Event")).toThrow(
      /Duplicate/u,
    );
    expect(() => parseSurvivalPaste("Unit,Group,Time,Status\nu1,A,-1,Event")).toThrow();
  });
});

describe("matrix spreadsheet paste", () => {
  it("preserves missing values and long labels", () => {
    const matrix = parseMatrixPaste(
      "Feature\tSample A\tSample B\nA very long feature label\t1\tNA\nFeature 2\t\t3",
    );
    expect(matrix.rowLabels[0]).toBe("A very long feature label");
    expect(matrix.values).toEqual([
      [1, null],
      [null, 3],
    ]);
  });

  it("rejects non-rectangular and non-numeric input", () => {
    expect(() => parseMatrixPaste("Feature,A,B\nx,1")).toThrow(/rectangular/u);
    expect(() => parseMatrixPaste("Feature,A\nx,nope")).toThrow(/non-numeric/u);
  });
});

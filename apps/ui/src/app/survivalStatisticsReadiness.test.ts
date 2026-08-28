import { describe, expect, it } from "vitest";

import { survivalStatisticsReadiness } from "./survivalStatisticsReadiness";

const groups = (counts: number[]) => counts.map((observationCount) => ({ observationCount }));

describe("survivalStatisticsReadiness", () => {
  it("allows the existing two-group event-containing D11 scope", () => {
    expect(
      survivalStatisticsReadiness({
        groups: groups([3, 2]),
        eventCount: 2,
        independentUnitsConfirmed: true,
      }),
    ).toEqual({ status: "ready", reasonCode: "READY", researcherMessage: null });
  });

  it("keeps one-group survival graphable while stopping Statistics", () => {
    const result = survivalStatisticsReadiness({
      groups: groups([4]),
      eventCount: 2,
      independentUnitsConfirmed: true,
    });
    expect(result.status).toBe("not_ready");
    expect(result.reasonCode).toBe("INSUFFICIENT_GROUPS");
    expect(result.researcherMessage).toMatch(/Graphは表示できます/iu);
  });

  it("keeps all-censored groups graphable while stopping Statistics", () => {
    const result = survivalStatisticsReadiness({
      groups: groups([3, 2]),
      eventCount: 0,
      independentUnitsConfirmed: true,
    });
    expect(result.status).toBe("not_ready");
    expect(result.reasonCode).toBe("NO_EVENTS");
    expect(result.researcherMessage).toMatch(/Eventが1件もない/iu);
  });

  it("does not infer independent n for nested observations", () => {
    const result = survivalStatisticsReadiness({
      groups: groups([2, 2]),
      eventCount: 2,
      independentUnitsConfirmed: false,
      nestedUnits: true,
    });
    expect(result.reasonCode).toBe("NESTED_UNITS_NOT_SUPPORTED");
  });

  it("stops until an unresolved unit relationship is answered", () => {
    const result = survivalStatisticsReadiness({
      groups: groups([2, 2]),
      eventCount: 2,
      independentUnitsConfirmed: false,
    });
    expect(result.reasonCode).toBe("INDEPENDENT_UNIT_NOT_CONFIRMED");
  });
});

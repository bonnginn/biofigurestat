import { describe, expect, it } from "vitest";
import { regressionSource } from "./graphOnlyRegressionFixture";
import { bridgeGraphOnlyTableToRegression } from "./graphOnlyRegressionBridge";

describe("Graph table to regression", () => {
  it("creates row IDs only after explicit no-ID and distinct-unit answers", () => {
    const source = structuredClone(regressionSource());
    source.mapping!.columns[0].role = "metadata";
    source.mapping!.identityDecision = "no_id";
    expect(bridgeGraphOnlyTableToRegression(source, true).status).toBe("stopped");
    source.mapping!.sourceRowUnitDecision = "each_row_distinct_unit";
    const bridge = bridgeGraphOnlyTableToRegression(source, true);
    expect(bridge.status).toBe("ready");
    if (bridge.status !== "ready") throw new Error(bridge.reason);
    expect(bridge.draft.text).toContain("source-row-1\t20\t0.9");
  });
  it("retains original source and IDs and requires explicit independent-unit confirmation", () => {
    const source = regressionSource();
    const original = structuredClone(source);
    expect(bridgeGraphOnlyTableToRegression(source, false).status).toBe("stopped");
    const bridged = bridgeGraphOnlyTableToRegression(source, true);
    expect(bridged.status).toBe("ready");
    if (bridged.status !== "ready") throw new Error(bridged.reason);
    expect(bridged.draft.text).toBe("Unit ID\tX\tY\na\t20\t0.9\nb\t25\t1.1\nc\t30\t1.4");
    expect(bridged.draft).toMatchObject({
      xLabel: "Weight",
      yLabel: "Organ",
      includeIntercept: true,
    });
    expect(source).toEqual(original);
  });
  it.each(["duplicate", "missing", "nonfinite", "constantX", "series", "idOverlapsX"])(
    "stops %s without dropping or aggregating rows",
    (problem) => {
      const source = structuredClone(regressionSource());
      if (problem === "duplicate") source.table.rows[1][0] = "a";
      if (problem === "missing") source.table.rows[1][2] = "";
      if (problem === "nonfinite") source.table.rows[1][2] = "Infinity";
      if (problem === "constantX")
        source.table.rows.forEach((row) => {
          row[1] = "20";
        });
      if (problem === "series")
        source.mapping!.columns.push({ index: 3, header: "Batch", role: "series" });
      if (problem === "idOverlapsX") source.mapping!.columns[0].index = 1;
      const original = structuredClone(source);
      expect(bridgeGraphOnlyTableToRegression(source, true).status).toBe("stopped");
      expect(source).toEqual(original);
    },
  );
});

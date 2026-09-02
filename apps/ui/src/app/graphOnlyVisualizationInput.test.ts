import { describe, expect, it } from "vitest";

import {
  createGraphOnlyColumnMapping,
  graphOnlyNumericValue,
  graphOnlySourceKind,
  parseVisualizationInput,
} from "./graphOnlyVisualizationInput";

describe("Graph-only visualization input", () => {
  it("parses a rectangular table and localizes blank-heading feedback", () => {
    const valid = parseVisualizationInput("Condition\tValue\nVehicle\t1.25", "en");
    expect(valid.error).toBeNull();
    expect(valid.parsed.headers).toEqual(["Condition", "Value"]);

    const blankHeading = parseVisualizationInput("Condition\t\nVehicle\t1.25", "en");
    expect(blankHeading.error).toBe("A column name is blank. Add column names in the first row.");
  });

  it("accepts finite values while retaining missing tokens as missing", () => {
    expect(graphOnlyNumericValue(" 1.2500 ")).toBe(1.25);
    expect(graphOnlyNumericValue("NA")).toBeNull();
    expect(graphOnlyNumericValue("Infinity")).toBeNull();
    expect(graphOnlyNumericValue(undefined)).toBeNull();
  });

  it("derives lineage source kind without changing the imported label", () => {
    expect(graphOnlySourceKind("direct-entry", "tab")).toBe("direct_entry");
    expect(graphOnlySourceKind("results.csv", "comma")).toBe("csv");
    expect(graphOnlySourceKind("results.tsv", "tab")).toBe("tsv");
    expect(graphOnlySourceKind("instrument.dat", "semicolon")).toBe("generic_file");
  });

  it("maps ordered column roles and preserves explicit identity decisions", () => {
    const parsed = parseVisualizationInput(
      "sample ID\tTreatment\tMeasurement\tBatch\nS01\tVehicle\t1.00\tA",
    ).parsed;
    const mapping = createGraphOnlyColumnMapping(
      parsed,
      1,
      2,
      "",
      0,
      "selected_column",
      "each_row_distinct_unit",
      "clipboard",
      "2026-09-03T00:00:00.000Z",
    );
    expect(mapping?.columns.map(({ role }) => role)).toEqual(["id", "x", "y", "metadata"]);
    expect(mapping?.identityDecision).toBe("selected_column");
    expect(mapping?.sourceRowUnitDecision).toBe("each_row_distinct_unit");
    expect(
      createGraphOnlyColumnMapping(
        parsed,
        "",
        2,
        "",
        0,
        "selected_column",
        "unanswered",
        "clipboard",
        "2026-09-03T00:00:00.000Z",
      ),
    ).toBeNull();
  });
});

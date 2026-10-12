import { describe, expect, it } from "vitest";
import { parseDelimitedRecords, type RecordDelimiter } from "./delimited-records";
import { parseAdaptiveDelimited } from "./import-adapter";

describe("Windows malformed closing-quote boundary", () => {
  it.each(["\t", ",", ";"] as const)(
    "rejects whitespace outside the closed quoted field with %j delimiter",
    (delimiter: RecordDelimiter) => {
      for (const suffix of [" ", "\u00a0"]) {
        const text = `Label${delimiter}Value\n"Drug"${suffix}${delimiter}1`;
        expect(() => parseDelimitedRecords(text, delimiter)).toThrow(
          "DELIMITED_UNEXPECTED_AFTER_QUOTE",
        );
        expect(() => parseAdaptiveDelimited(text)).toThrow();
      }
    },
  );
  it("rejects a tab after closing a quote in comma-delimited CSV", () => {
    expect(() => parseDelimitedRecords('Label,Value\n"Drug"\t,1', ",")).toThrow(
      "DELIMITED_UNEXPECTED_AFTER_QUOTE",
    );
  });
  it.each(["\t", ",", ";"] as const)(
    "retains whitespace inside a quoted field with %j delimiter",
    (delimiter) => {
      expect(
        parseDelimitedRecords(`Label${delimiter}Value\n"Drug \t"${delimiter}1`, delimiter),
      ).toEqual([
        ["Label", "Value"],
        ["Drug \t", "1"],
      ]);
    },
  );
});

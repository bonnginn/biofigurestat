import { describe, expect, it } from "vitest";
import {
  detectRecordDelimiter,
  encodeDelimitedCell,
  parseDelimitedRecords,
} from "./delimited-records";
import { parseAdaptiveDelimited } from "./import-adapter";

describe("delimited records", () => {
  it("retains quoted CRLF, escaped quotes, empty measurements and whitespace", () => {
    const source =
      '\uFEFFCondition,Value,Note\r\n"A\r\nB",1.25,"a,b;\tand ""quote"""\r\nC,,missing\r\nD,-2.5,  preserved  \r\n';
    expect(parseDelimitedRecords(source, ",")).toEqual([
      ["Condition", "Value", "Note"],
      ["A\nB", "1.25", 'a,b;\tand "quote"'],
      ["C", "", "missing"],
      ["D", "-2.5", "  preserved  "],
    ]);
    expect(parseAdaptiveDelimited(source).rows[2]).toEqual(["D", "-2.5", "preserved"]);
  });
  it.each(["\t", ",", ";"] as const)("round trips cells with %j separators", (delimiter) => {
    const rows = [
      ["A\nB", 'a"b', "", "a,b;c\td", "  raw  "],
      ["", "", "", "", ""],
    ];
    const text = rows
      .map((row) => row.map((cell) => encodeDelimitedCell(cell, delimiter)).join(delimiter))
      .join("\n");
    expect(parseDelimitedRecords(text, delimiter)).toEqual(rows);
  });
  it("detects the logical header without counting metadata separators", () => {
    expect(detectRecordDelimiter('Condition\tValue\tNote\nA\t1\t",,,,,;;;;;"')).toBe("\t");
    expect(detectRecordDelimiter('"long,;\nheader";Value\nA;1')).toBe(";");
    expect(detectRecordDelimiter("\nA,B\n1,2")).toBe(",");
  });
  it.each(['A,B\n"unclosed,1', 'A,B\n"closed"x,1', 'A,B\n"""'])(
    "rejects invalid quotes: %s",
    (text) => {
      expect(() => parseDelimitedRecords(text, ",")).toThrow();
      expect(() => parseAdaptiveDelimited(text)).toThrow();
    },
  );
});

it("treats quotes inside unquoted headers as literal text", () => {
  const text = 'Measurement 5",Value\nA,1';
  expect(detectRecordDelimiter(text)).toBe(",");
  expect(parseAdaptiveDelimited(text)).toMatchObject({
    headers: ['Measurement 5"', "Value"],
    rows: [["A", "1"]],
  });
});
it("retains explicit empty cells in a separator-only record", () => {
  expect(parseAdaptiveDelimited("Label\tValue\n\t\nA\t").rows).toEqual([
    ["", ""],
    ["A", ""],
  ]);
});

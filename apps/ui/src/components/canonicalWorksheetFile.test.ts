import { describe, expect, it } from "vitest";

import {
  CanonicalWorksheetFileError,
  parseCanonicalWorksheetFile,
  parseCanonicalWorksheetRecords,
  type CanonicalWorksheetFileLayout,
} from "./canonicalWorksheetFile";

const layout: CanonicalWorksheetFileLayout = {
  columns: [
    { key: "row_label", header: "入力行", role: "row_label" },
    { key: "control", header: "Control / Response", role: "value", semanticKey: "response" },
    { key: "drug", header: "Drug / Response", role: "value", semanticKey: "response" },
  ],
  optionalRowLabel: true,
};

describe("canonical worksheet file adapter", () => {
  it("parses quoted CSV values and keeps empty cells and a missing final value", () => {
    const imported = parseCanonicalWorksheetFile({
      fileName: "values.csv",
      mimeType: "text/csv",
      text: '入力行,"Control / Response","Drug / Response"\n1,10,""\n2,"11,5",12',
      layout,
      now: "2026-08-28T12:00:00.000Z",
    });

    expect(imported.sourceKind).toBe("csv");
    expect(imported.delimiter).toBe("comma");
    expect(imported.headers).toEqual(["入力行", "Control / Response", "Drug / Response"]);
    expect(imported.rows).toEqual([
      ["1", "10", ""],
      ["2", "11,5", "12"],
    ]);
    expect(imported.rawLineage.rawText).toContain("11,5");
    expect(imported.mapping.columns["Control / Response"]).toMatchObject({
      role: "value",
      semanticKey: "response",
    });
  });

  it("parses TSV and pads an omitted trailing cell without inventing a value", () => {
    const imported = parseCanonicalWorksheetFile({
      fileName: "unequal.tsv",
      mimeType: "text/tab-separated-values",
      text: "入力行\tControl / Response\tDrug / Response\n1\t10\n2\t\t12",
      layout,
    });

    expect(imported.sourceKind).toBe("tsv");
    expect(imported.delimiter).toBe("tab");
    expect(imported.rows).toEqual([
      ["1", "10", ""],
      ["2", "", "12"],
    ]);
  });

  it("detects an untyped TXT delimiter only when the choice is unambiguous", () => {
    const imported = parseCanonicalWorksheetFile({
      fileName: "values.txt",
      mimeType: "text/plain",
      text: "入力行\tControl / Response\tDrug / Response\n1\t10\t12",
      layout,
    });
    expect(imported.sourceKind).toBe("generic_file");
    expect(imported.delimiter).toBe("tab");

    expect(() =>
      parseCanonicalWorksheetFile({
        fileName: "ambiguous.txt",
        text: "入力行,Control / Response\tDrug / Response\n1,10\t12",
        layout,
      }),
    ).toThrow("区切り文字を安全に判定できません");
  });

  it("rejects an unexpected header or an extra data column before any mapping is returned", () => {
    expect(() =>
      parseCanonicalWorksheetFile({
        fileName: "wrong.csv",
        text: "入力行,Control / Response,Wrong\n1,10,12",
        layout,
      }),
    ).toThrow("現在の入力表にない見出し");

    expect(() =>
      parseCanonicalWorksheetFile({
        fileName: "too-wide.csv",
        text: "入力行,Control / Response,Drug / Response\n1,10,12,99",
        layout,
      }),
    ).toThrow("列数が見出しと一致しません");
  });

  it("rejects malformed UTF-8-like delimited text without swallowing the old data", () => {
    expect(() => parseCanonicalWorksheetRecords('"unterminated,10', ",")).toThrow(
      CanonicalWorksheetFileError,
    );
  });
});

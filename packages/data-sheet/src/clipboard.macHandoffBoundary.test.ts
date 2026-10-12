import { describe, expect, it } from "vitest";
import { parseTabularClipboard } from "./clipboard";

describe("Windows clipboard handoff row and quote boundaries", () => {
  it.each([
    ["plain LF", "Mean\n10\n\n30"],
    ["CRLF with surrounding empty lines", "\r\n \r\nMean\r\n10\r\n \r\n30\r\n\r\n"],
  ])("preserves the interior missing position for %s", (_label, text) => {
    const parsed = parseTabularClipboard(text);

    expect(parsed.rows).toEqual([["10"], [""], ["30"]]);
    expect(parsed.columns[0].values).toEqual([10, 30]);
    expect(parsed.columns[0].valueRowNumbers).toEqual([1, 3]);
    expect(parsed.columns[0].emptyRowNumbers).toEqual([2]);
    expect(parsed.columns[0].invalidRowNumbers).toEqual([]);
  });

  it("keeps an embedded unquoted quote invalid instead of turning it into 12", () => {
    const parsed = parseTabularClipboard('Label,Mean\nD1,1"2"\nD2,3');

    expect(parsed.rows).toEqual([
      ["D1", '1"2"'],
      ["D2", "3"],
    ]);
    expect(parsed.columns[1].values).toEqual([3]);
    expect(parsed.columns[1].valueRowNumbers).toEqual([2]);
    expect(parsed.columns[1].invalidRowNumbers).toEqual([1]);
    expect(parsed.columns[1].emptyRowNumbers).toEqual([]);
  });

  it.each([
    ["unclosed quoted cell", 'Label,Mean\n"D1,10\nD2,30'],
    ["text after a closed quoted cell", 'Label,Mean\n"D1"oops,10\nD2,30'],
  ])("fails closed for %s", (_label, text) => {
    const parsed = parseTabularClipboard(text);
    const parseError = "parseError" in parsed ? parsed.parseError : undefined;

    expect(typeof parseError).toBe("string");
    expect(parseError).not.toBe("");
    expect(parsed.headers).toEqual([]);
    expect(parsed.rows).toEqual([]);
    expect(parsed.columns).toEqual([]);
    expect(parsed.recommendedColumnIndex).toBeNull();
  });

  it("preserves a legal quoted multiline cell as one logical row", () => {
    const parsed = parseTabularClipboard('Label,Mean\n"D1\nsource note",10\n"D2 ""quoted""",30');

    expect(parsed.delimiter).toBe("comma");
    expect(parsed.rows).toEqual([
      ["D1\nsource note", "10"],
      ['D2 "quoted"', "30"],
    ]);
    expect(parsed.columns[1].values).toEqual([10, 30]);
    expect(parsed.columns[1].valueRowNumbers).toEqual([1, 2]);
    expect(parsed.columns[1].invalidRowNumbers).toEqual([]);
    expect(parsed.columns[1].emptyRowNumbers).toEqual([]);
  });

  it("retains the existing Windows Number cell policy during parser adaptation", () => {
    const parsed = parseTabularClipboard("Mean\n0x10\n1e2\n+3.5");

    expect(parsed.columns[0].values).toEqual([16, 100, 3.5]);
    expect(parsed.columns[0].valueRowNumbers).toEqual([1, 2, 3]);
    expect(parsed.columns[0].invalidRowNumbers).toEqual([]);
  });
});

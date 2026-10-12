import { describe, expect, it } from "vitest";
import { defaultProjectFileName } from "./projectFileName";

describe("defaultProjectFileName", () => {
  it("creates a safe default for macOS and Windows save dialogs", () => {
    expect(defaultProjectFileName('Case 5: survival / "reopen"?')).toBe(
      "Case 5- survival - -reopen--.lsa",
    );
    expect(defaultProjectFileName("...   ")).toBe("BioFigureStat project.lsa");
  });
  it.each(["CON", "nul.data", "Com9", "LPT³", "ＣＯＮ", "PRN.tar.gz", "AUX"])(
    "protects the reserved Windows device stem %s without changing the project name",
    (name) => {
      expect(defaultProjectFileName(name)).toBe(`_${name.normalize("NFKC")}.lsa`);
    },
  );
  it.each(["Control", "COM10", "LPT0", "connection"])(
    "preserves ordinary project name %s",
    (name) => {
      expect(defaultProjectFileName(name)).toBe(`${name}.lsa`);
    },
  );
});

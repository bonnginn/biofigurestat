import { describe, expect, it } from "vitest";
import { defaultProjectFileName } from "./projectFileName";

describe("defaultProjectFileName", () => {
  it("creates a safe default for macOS and Windows save dialogs", () => {
    expect(defaultProjectFileName('Case 5: survival / "reopen"?')).toBe("Case 5- survival - -reopen--.lsa");
    expect(defaultProjectFileName("...   ")).toBe("BioFigureStat project.lsa");
  });
});

import { describe, expect, it } from "vitest";

import { PRODUCT_IDENTITY } from "./productIdentity";

describe("product identity", () => {
  it("links to the canonical BioFigureStat repository", () => {
    expect(PRODUCT_IDENTITY.repositoryUrl).toBe("https://github.com/bonnginn/biofigurestat");
  });
});

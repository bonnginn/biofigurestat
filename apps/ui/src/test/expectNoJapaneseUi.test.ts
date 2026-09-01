import { describe, expect, it } from "vitest";

import { expectNoJapaneseUi } from "./expectNoJapaneseUi";

describe("English UI residue assertion", () => {
  it("checks editable values and accessible descriptions as well as visible text", () => {
    const container = document.createElement("div");
    container.innerHTML = '<input value="表から作成したGraph"><p aria-description="説明">Graph</p>';

    expect(() => expectNoJapaneseUi(container)).toThrow();
  });

  it("accepts fully English visible and editable UI copy", () => {
    const container = document.createElement("div");
    container.innerHTML =
      '<label>Graph title<input value="Graph from table" aria-description="Editable title"></label>';

    expectNoJapaneseUi(container);
  });
});


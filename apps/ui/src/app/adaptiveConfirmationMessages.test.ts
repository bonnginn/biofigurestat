import { describe, expect, it } from "vitest";

import { expectNoJapaneseUi } from "../test/expectNoJapaneseUi";
import { adaptiveConfirmationReason } from "./adaptiveConfirmationMessages";

describe("adaptive confirmation messages", () => {
  const confirmations = [
    {
      key: "relationship" as const,
      reason: "Block, mixed, and crossover answers change the identity relationship graph.",
    },
    {
      key: "missingness" as const,
      reason: "Incomplete sets must distinguish dropout, assay failure, and structural absence.",
    },
    {
      key: "axis_identity" as const,
      reason: "Identity can persist across one ordered axis but not another.",
    },
  ];

  it("uses reviewed Japanese explanations without changing semantic keys", () => {
    expect(confirmations.map((item) => adaptiveConfirmationReason("ja", item)).join(" ")).toContain(
      "欠測",
    );
    expect(confirmations.map((item) => item.key)).toEqual([
      "relationship",
      "missingness",
      "axis_identity",
    ]);
  });

  it("retains the canonical English explanations in English mode", () => {
    const renderedNotice = document.createElement("div");
    renderedNotice.textContent = confirmations
      .map((item) => adaptiveConfirmationReason("en", item))
      .join(" ");
    expectNoJapaneseUi(renderedNotice);
    expect(renderedNotice).toHaveTextContent("structural absence");
  });
});

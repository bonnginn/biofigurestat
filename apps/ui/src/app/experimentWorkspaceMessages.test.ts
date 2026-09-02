import { describe, expect, it } from "vitest";

import {
  analysisCorrectionNavigationMessage,
  scientificSourceInvalidatedMessage,
  structureRevisionAppliedMessage,
  structureRevisionErrorMessage,
  structureRevisionStoppedMessage,
} from "./experimentWorkspaceMessages";
import { expectNoJapaneseUi } from "../test/expectNoJapaneseUi";

describe("experiment workspace messages", () => {
  it("does not expose legacy Japanese details in English post-action messages", () => {
    const messages = [
      scientificSourceInvalidatedMessage("en"),
      analysisCorrectionNavigationMessage(
        "en",
        "INCOMPLETE_MATCHED_SET",
        "日本語タイトル",
        "日本語詳細",
      ),
      structureRevisionStoppedMessage("en", "日本語の停止理由"),
      structureRevisionErrorMessage("en", "compatibility", "日本語の互換性理由"),
      structureRevisionErrorMessage("en", "presentation"),
      structureRevisionErrorMessage("en", "rebuild"),
      structureRevisionErrorMessage("en", "lineage"),
      structureRevisionAppliedMessage("en", true),
      structureRevisionAppliedMessage("en", false),
    ];

    const renderedNotice = document.createElement("div");
    renderedNotice.textContent = messages.join(" ");
    expectNoJapaneseUi(renderedNotice);
    expect(messages.every((message) => message.length > 0)).toBe(true);
    expect(messages.join(" ")).toContain("matched set is incomplete");
  });

  it("retains the reviewed Japanese explanations in Japanese mode", () => {
    expect(scientificSourceInvalidatedMessage("ja")).toContain("以前の解析結果");
    expect(structureRevisionErrorMessage("ja", "compatibility", "互換性なし")).toContain(
      "互換性なし",
    );
    expect(structureRevisionAppliedMessage("ja", true)).toContain("測定値");
  });
});

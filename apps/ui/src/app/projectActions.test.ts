import { describe, expect, it } from "vitest";
import { ProjectCompatibilityError } from "@lsaa/project";

import { actionErrorMessage } from "./projectActions";

describe("project action error messages", () => {
  it("explains a newer project version without exposing parser output", () => {
    const message = actionErrorMessage(
      new ProjectCompatibilityError("PROJECT_SCHEMA_VERSION_NEWER_THAN_APP", {
        foundVersion: "9.9.9",
        supportedVersion: "0.3.0",
      }),
      "fallback",
    );

    expect(message).toContain("新しいBioFigureStat");
    expect(message).toContain("9.9.9");
    expect(message).not.toContain("PROJECT_SCHEMA_VERSION_NEWER_THAN_APP");
  });

  it("gives a safe recovery action for invalid project content", () => {
    const message = actionErrorMessage(
      new ProjectCompatibilityError("PROJECT_CONTENT_INVALID"),
      "fallback",
    );

    expect(message).toContain("安全に確認できません");
    expect(message).toContain("元ファイルを変更せず");
  });

  it("does not expose internal parser or project reconstruction text", () => {
    expect(
      actionErrorMessage(
        new Error("PROJECT_KIND_IS_NOT_PROGRESSIVE_EXPERIMENT"),
        "安全に復元できません。",
      ),
    ).toBe("安全に復元できません。");
    expect(
      actionErrorMessage(
        new Error("Workspace raw revision lineage is inconsistent"),
        "安全に復元できません。",
      ),
    ).toBe("安全に復元できません。");
  });

  it("localizes compatibility failures without exposing Japanese in English mode", () => {
    const message = actionErrorMessage(
      new ProjectCompatibilityError("PROJECT_SCHEMA_VERSION_NEWER_THAN_APP", {
        foundVersion: "9.9.9",
        supportedVersion: "0.3.0",
      }),
      "The project could not be opened.",
      "en",
    );

    expect(message).toContain("newer BioFigureStat");
    expect(message).toContain("9.9.9");
    expect(message).not.toMatch(/[\u3040-\u30ff\u3400-\u9fff]/u);
  });

  it("uses the English fallback when an internal exception contains Japanese", () => {
    expect(
      actionErrorMessage(
        new Error("プロジェクトを安全に復元できません"),
        "The project could not be restored safely.",
        "en",
      ),
    ).toBe("The project could not be restored safely.");
  });
});

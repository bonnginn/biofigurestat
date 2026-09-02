import { describe, expect, it } from "vitest";

import { expectNoJapaneseUi } from "../test/expectNoJapaneseUi";
import { adaptiveSurfaceGrammar, adaptiveSurfaceTitle } from "./adaptiveSurfaceMessages";

describe("adaptive surface messages", () => {
  it("localizes every surface without changing its semantic ID", () => {
    const surfaceIds = [
      "compact_unit_matrix",
      "factor_observation_table",
      "repeated_axis_matrix",
      "nested_observation_table",
      "typed_record_table",
    ] as const;
    const english = surfaceIds.flatMap((surfaceId) =>
      Object.values(adaptiveSurfaceGrammar("en", surfaceId)),
    );
    const renderedDescriptions = document.createElement("div");
    renderedDescriptions.textContent = english.join(" ");
    expectNoJapaneseUi(renderedDescriptions);
    expect(
      surfaceIds.flatMap((surfaceId) => Object.values(adaptiveSurfaceGrammar("ja", surfaceId))),
    ).toHaveLength(10);
    expect(surfaceIds.map((surfaceId) => adaptiveSurfaceTitle("ja", surfaceId))).not.toContain(
      "compact_unit_matrix",
    );
    expect(adaptiveSurfaceTitle("en", "typed_record_table")).toBe("Typed measurement table");
  });
});

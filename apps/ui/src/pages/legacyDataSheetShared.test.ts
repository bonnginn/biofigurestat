import { describe, expect, it } from "vitest";

import {
  createLegacyWorkspaceToken,
  LEGACY_WORKFLOW_TABS,
  numericEngineObservations,
} from "./legacyDataSheetShared";

describe("legacy Data Sheet shared orchestration", () => {
  it("keeps the same ordered workflow contract for two- and multi-condition sheets", () => {
    expect(LEGACY_WORKFLOW_TABS.map(({ id }) => id)).toEqual([
      "input",
      "analysis",
      "graph",
      "save",
    ]);
  });

  it("keeps only numeric observation payloads for graph projection", () => {
    const observations = [
      { id: "numeric", value: 1.25 },
      { id: "missing", value: null },
    ] as unknown as Parameters<typeof numericEngineObservations>[0];
    expect(numericEngineObservations(observations)).toEqual([{ id: "numeric", value: 1.25 }]);
  });

  it("creates distinct workspace-local identifiers", () => {
    expect(createLegacyWorkspaceToken()).not.toBe(createLegacyWorkspaceToken());
  });
});

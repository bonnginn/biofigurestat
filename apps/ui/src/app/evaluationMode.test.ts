import { describe, expect, it } from "vitest";

import { evaluationModeIsConfigured } from "./evaluationMode";

describe("evaluation browser boundary", () => {
  it("accepts only a same-origin API path from browser code", () => {
    expect(
      evaluationModeIsConfigured({
        enabled: true,
        apiBasePath: "/api/evaluation",
        sourceRevision: "fixture",
      }),
    ).toBe(true);
    expect(
      evaluationModeIsConfigured({
        enabled: true,
        apiBasePath: "http://127.0.0.1:43128/api/evaluation",
        sourceRevision: "fixture",
      }),
    ).toBe(false);
    expect(
      evaluationModeIsConfigured({
        enabled: true,
        apiBasePath: "https://external.example/api/evaluation",
        sourceRevision: "fixture",
      }),
    ).toBe(false);
    expect(
      evaluationModeIsConfigured({
        enabled: false,
        apiBasePath: "/api/evaluation",
        sourceRevision: null,
      }),
    ).toBe(false);
  });
});

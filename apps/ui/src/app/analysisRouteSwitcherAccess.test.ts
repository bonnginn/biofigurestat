import { describe, expect, it } from "vitest";

import { resolveAnalysisRouteSwitcherAccess } from "./analysisRouteSwitcherAccess";

describe("analysis route switcher production boundary", () => {
  it("fails closed in production even when audit access is requested", () => {
    expect(
      resolveAnalysisRouteSwitcherAccess({
        developmentBuild: false,
        auditModeRequested: true,
      }),
    ).toBeNull();
  });

  it("stays hidden in an ordinary development workspace", () => {
    expect(
      resolveAnalysisRouteSwitcherAccess({
        developmentBuild: true,
        auditModeRequested: false,
      }),
    ).toBeNull();
  });

  it("allows only an explicitly requested development audit workspace", () => {
    expect(
      resolveAnalysisRouteSwitcherAccess({
        developmentBuild: true,
        auditModeRequested: true,
      }),
    ).toBe("development_audit");
  });
});

import { beforeEach, describe, expect, it } from "vitest";

import {
  createDiagnosticReport,
  diagnosticFingerprint,
  recordDiagnosticError,
  recordDiagnosticEvent,
  resetDiagnosticsForTest,
  serializeDiagnosticReport,
} from "./diagnostics";

describe("privacy-safe diagnostic reports", () => {
  beforeEach(() => resetDiagnosticsForTest());

  it("exports reproducibility metadata without raw data, labels, paths, or secrets", () => {
    recordDiagnosticEvent("analysis_executed", {
      methodId: "welch_t",
      requestFingerprint: "fnv1a32:12345678",
      rawValues: "1,2,3",
      projectName: "Secret study",
      targetPath: String.raw`C:\Users\alice\study.lsa`,
      bearerToken: "Bearer secret-token",
    });
    recordDiagnosticError(
      "ENGINE_EXECUTION_FAILED",
      new Error(String.raw`failed at C:\Users\alice\project\engine.py`),
    );

    const ordinary = createDiagnosticReport({ route: "new-experiment", project: null });
    const text = serializeDiagnosticReport(ordinary);
    expect(text).toContain("welch_t");
    expect(text).toContain("ENGINE_EXECUTION_FAILED");
    expect(text).not.toContain("1,2,3");
    expect(text).not.toContain("Secret study");
    expect(text).not.toContain("alice");
    expect(text).not.toContain("secret-token");
    expect(ordinary.privacy).toEqual({
      rawMeasurementsIncluded: false,
      projectLabelsIncluded: false,
      automaticUpload: false,
      technicalDetailsIncluded: false,
    });
    expect(ordinary).not.toHaveProperty("technicalErrors");

    const expanded = createDiagnosticReport({
      route: "new-experiment",
      project: null,
      includeTechnicalDetails: true,
    });
    expect(expanded.technicalErrors?.[0]?.detail).toContain("<user-home>");
    expect(serializeDiagnosticReport(expanded)).not.toContain("alice");
  });

  it("creates stable opaque fingerprints without retaining the input", () => {
    const first = diagnosticFingerprint("same structural request");
    expect(first).toBe(diagnosticFingerprint("same structural request"));
    expect(first).not.toContain("structural request");
    expect(first).not.toBe(diagnosticFingerprint("different structural request"));
  });
});

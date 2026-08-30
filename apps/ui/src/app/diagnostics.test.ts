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
      templateId: "D01",
      methodId: "welch_t",
      protocolVersion: "0.1.0",
      engineVersion: "0.14.0",
      packageVersions: JSON.stringify({
        numpy: "2.3.5",
        scipy: "1.18.0",
        researcherLabel: "Secret study",
      }),
      requestFingerprint: "fnv1a32:12345678",
      // Runtime input can still contain extra keys through JavaScript or a
      // boundary cast. The closed event schema must ignore every such key.
      rawValues: "1,2,3",
      projectName: "Secret study",
      targetPath: String.raw`C:\Users\alice\study.lsa`,
      bearerToken: "Bearer secret-token",
    } as never);
    recordDiagnosticError(
      "ENGINE_EXECUTION_FAILED",
      new Error(String.raw`failed at C:\Users\alice\project\engine.py`),
    );

    const ordinary = createDiagnosticReport({ route: "new-experiment", project: null });
    const text = serializeDiagnosticReport(ordinary);
    expect(text).toContain("welch_t");
    expect(text).toContain('\\"numpy\\":\\"2.3.5\\"');
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
      researcherEnteredDescriptionIncluded: false,
    });
    expect(ordinary).not.toHaveProperty("technicalErrors");

    const expanded = createDiagnosticReport({
      route: "new-experiment",
      project: null,
      includeTechnicalDetails: true,
    });
    expect(expanded.technicalErrors?.[0]?.detail).toBe("Error");
    expect(serializeDiagnosticReport(expanded)).not.toContain("alice");
  });

  it("uses exact allowlists for every current diagnostic event call site", () => {
    recordDiagnosticEvent("project_saved", { state: "success" });
    recordDiagnosticEvent("project_save_failed", { stage: "container_commit" });
    recordDiagnosticEvent("route_changed", { route: "new-experiment" });
    recordDiagnosticEvent("project_opened", { state: "success", source: "recent" });
    recordDiagnosticEvent("graph_state_changed", {
      graphType: "paired_dot",
      graphFingerprint: "fnv1a32:abcdef01",
    });
    recordDiagnosticEvent("analysis_executed", {
      templateId: "D17",
      methodId: "nonlinear_xy_fit",
      protocolVersion: "0.14.0",
      engineVersion: "0.7.0",
      packageVersions: JSON.stringify({
        numpy: "2.3.5",
        scipy: "1.18.0",
        statsmodels: "0.14.5",
      }),
      requestFingerprint: "fnv1a32:1234abcd",
    });
    recordDiagnosticError("PROJECT_OPEN_FAILED");

    const report = createDiagnosticReport({ route: "home", project: null });
    expect(report.recentEvents).toHaveLength(7);
    expect(report.recentEvents.map(({ type }) => type)).toEqual([
      "project_saved",
      "project_save_failed",
      "route_changed",
      "project_opened",
      "graph_state_changed",
      "analysis_executed",
      "error",
    ]);
  });

  it("drops unknown event types, unknown keys, and invalid values without retaining their text", () => {
    const unsafeRecord = recordDiagnosticEvent as unknown as (
      type: unknown,
      detail: unknown,
    ) => void;
    unsafeRecord("research_note", {
      note: "Donor Alice sample 12.345",
      targetPath: String.raw`C:\Users\alice\study.lsa`,
    });
    unsafeRecord("route_changed", {
      route: "Donor Alice sample 12.345",
      projectName: "Secret study",
    });
    unsafeRecord("graph_state_changed", {
      graphType: "dot",
      graphFingerprint: "Donor Alice sample 12.345",
    });
    unsafeRecord("project_saved", {
      state: "success",
      projectName: "Secret study",
      rawValues: "12.345",
      targetPath: String.raw`C:\Users\alice\study.lsa`,
    });

    const report = createDiagnosticReport({ route: "home", project: null });
    expect(report.recentEvents).toEqual([
      expect.objectContaining({
        type: "project_saved",
        detail: { state: "success" },
      }),
    ]);
    const text = serializeDiagnosticReport(report);
    expect(text).not.toContain("Donor Alice");
    expect(text).not.toContain("Secret study");
    expect(text).not.toContain("12.345");
    expect(text).not.toContain("alice");
  });

  it("canonicalizes only known software packages and rejects arbitrary version text", () => {
    const unsafeRecord = recordDiagnosticEvent as unknown as (
      type: unknown,
      detail: unknown,
    ) => void;
    unsafeRecord("analysis_executed", {
      templateId: "D01",
      methodId: "welch_t",
      protocolVersion: "0.1.0",
      engineVersion: "0.14.0",
      packageVersions: JSON.stringify({
        numpy: "2.3.5",
        untrusted: "Donor Alice",
      }),
      requestFingerprint: "fnv1a32:12345678",
      rawValues: "12.345",
    });
    unsafeRecord("analysis_executed", {
      templateId: "D01",
      methodId: "welch_t",
      protocolVersion: "0.1.0",
      engineVersion: "Donor Alice",
      packageVersions: "{}",
      requestFingerprint: "fnv1a32:87654321",
    });

    const report = createDiagnosticReport({ route: "home", project: null });
    expect(report.recentEvents).toHaveLength(1);
    expect(report.recentEvents[0]?.detail).toEqual({
      templateId: "D01",
      methodId: "welch_t",
      protocolVersion: "0.1.0",
      engineVersion: "0.14.0",
      packageVersions: '{"numpy":"2.3.5"}',
      requestFingerprint: "fnv1a32:12345678",
    });
    expect(serializeDiagnosticReport(report)).not.toContain("Donor Alice");
    expect(serializeDiagnosticReport(report)).not.toContain("12.345");
  });

  it("labels an optional researcher-entered problem description as user supplied", () => {
    const report = createDiagnosticReport({
      route: "home",
      project: null,
      userDescription: "The Graph button did not respond.",
    });
    expect(report.privacy.researcherEnteredDescriptionIncluded).toBe(true);
    expect(report.userDescription).toBe("The Graph button did not respond.");
  });

  it("never exports unstructured error messages that may contain research labels or values", () => {
    recordDiagnosticError(
      "ENGINE_EXECUTION_FAILED",
      new Error(
        String.raw`failed at C:\Users\alice\Secret Study\raw measurements.csv with value 12.345`,
      ),
    );
    recordDiagnosticError(
      "ENGINE_EXECUTION_FAILED",
      new Error("failed at /home/alice/Secret Study/raw measurements.csv token=unpublished-secret"),
    );

    const expanded = createDiagnosticReport({
      route: "new-experiment",
      project: null,
      includeTechnicalDetails: true,
    });
    const text = serializeDiagnosticReport(expanded);
    expect(expanded.technicalErrors?.map(({ detail }) => detail)).toEqual(["Error", "Error"]);
    expect(text).not.toContain("alice");
    expect(text).not.toContain("Secret Study");
    expect(text).not.toContain("raw measurements.csv");
    expect(text).not.toContain("12.345");
    expect(text).not.toContain("unpublished-secret");
  });

  it("creates stable opaque fingerprints without retaining the input", () => {
    const first = diagnosticFingerprint("same structural request");
    expect(first).toBe(diagnosticFingerprint("same structural request"));
    expect(first).not.toContain("structural request");
    expect(first).not.toBe(diagnosticFingerprint("different structural request"));
  });
});

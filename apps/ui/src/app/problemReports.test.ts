import { describe, expect, it } from "vitest";
import { createProblemReportSubmission } from "./problemReports";

describe("problem report submission", () => {
  it("uses a closed report-only shape without project or telemetry content", () => {
    const report = createProblemReportSubmission(
      {
        type: "bug",
        screen: "home",
        attempted: "clicked save",
        observed: "no confirmation",
        reproducibility: "once",
        severity: "minor",
        contactEmail: "",
        includeDiagnostic: false,
      },
      undefined,
      {
        submissionId: "11111111-1111-4111-8111-111111111111",
        reporterId: "22222222-2222-4222-8222-222222222222",
        submittedAt: "2026-08-30T00:00:00.000Z",
      },
    );
    const serialized = JSON.stringify(report);
    expect(Object.keys(report).sort()).toEqual([
      "attempted",
      "noticeVersion",
      "observed",
      "reporterId",
      "reproducibility",
      "schemaVersion",
      "screen",
      "severity",
      "submissionId",
      "submittedAt",
      "type",
    ]);
    expect(serialized).not.toMatch(/project|measurement|clipboard|installId|sessionId/u);
  });
});

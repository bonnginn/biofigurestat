import { describe, expect, it, vi } from "vitest";

import collector, { handleTelemetryRequest, type TelemetryWorkerEnv } from "./index";
import { parseTelemetryBatch } from "./schema";
import { parseProblemReport } from "./problemReportSchema";

const application = { version: "0.1.0", buildRevision: "abc123", platform: "windows" };
const event = {
  kind: "route_view",
  occurredAt: "2026-08-30T00:00:00.000Z",
  route: "home",
  entryFamily: "home",
  sessionId: "22222222-2222-4222-8222-222222222222",
  application,
};
const batch = {
  schemaVersion: "2.0.0",
  consentNoticeVersion: "remote-alpha-2026-08-30",
  installId: "11111111-1111-4111-8111-111111111111",
  sessionId: "22222222-2222-4222-8222-222222222222",
  application,
  events: [event],
};

function fakeEnvironment(existingToday = 0) {
  const writes: unknown[][] = [];
  const runs: Array<{ query: string; values: unknown[] }> = [];
  const prepare = vi.fn((query: string) => {
    let values: unknown[] = [];
    const statement = {
      bind: (...next: unknown[]) => {
        values = next;
        return statement;
      },
      first: async () => ({ count: existingToday }),
      run: async () => {
        runs.push({ query, values });
        return { success: true };
      },
      all: async () => ({ results: [] }),
      query,
      values: () => values,
    };
    return statement;
  });
  const env = {
    INGEST_KEY: "public-alpha-key",
    ALLOWED_ORIGINS: "http://tauri.localhost",
    RETENTION_DAYS: "90",
    DB: {
      prepare,
      batch: async (statements: Array<{ values?: () => unknown[] }>) => {
        statements.forEach((statement) => writes.push(statement.values?.() ?? []));
        return statements.map(() => ({ success: true }));
      },
    },
  } as unknown as TelemetryWorkerEnv;
  return { env, writes, runs };
}

const problemReport = {
  schemaVersion: "1.0.0",
  noticeVersion: "public-alpha-2026-08-30",
  submissionId: "33333333-3333-4333-8333-333333333333",
  reporterId: "44444444-4444-4444-8444-444444444444",
  submittedAt: "2026-08-30T00:00:00.000Z",
  type: "bug",
  screen: "home",
  attempted: "Clicked the save control",
  observed: "No completion notice appeared",
  reproducibility: "once",
  severity: "minor",
};

function fakeReportEnvironment() {
  const writes: unknown[][] = [];
  const prepare = vi.fn((query: string) => {
    let values: unknown[] = [];
    const statement = {
      bind: (...next: unknown[]) => {
        values = next;
        return statement;
      },
      first: async () => (query.includes("COUNT(*)") ? { count: 0 } : null),
      run: async () => ({ success: true }),
      all: async () => ({ results: [] }),
      values: () => values,
    };
    return statement;
  });
  const env = {
    ...fakeEnvironment().env,
    REPORT_INGEST_KEY: "public-report-key_123456",
    REPORT_CONTACT_ENCRYPTION_KEY: "AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA",
    REPORT_RATE_LIMITER: { limit: async () => ({ success: true }) },
    DB: {
      prepare,
      batch: async (statements: Array<{ values?: () => unknown[] }>) => {
        statements.forEach((statement) => writes.push(statement.values?.() ?? []));
        return statements.map(() => ({ success: true }));
      },
    },
  } as unknown as TelemetryWorkerEnv;
  return { env, writes };
}

describe("BioFigureStat telemetry collector", () => {
  it("accepts only the exact research-data-free schema", () => {
    expect(parseTelemetryBatch(batch)).not.toBeNull();
    expect(parseTelemetryBatch({ ...batch, experimentName: "Secret study" })).toBeNull();
    expect(parseTelemetryBatch({ ...batch, events: [{ ...event, value: 12.3 }] })).toBeNull();
    expect(
      parseTelemetryBatch({ ...batch, consentNoticeVersion: "local-only-2026-08-28" }),
    ).toBeNull();
  });

  it("requires an allowed native origin and ingest key", async () => {
    const { env } = fakeEnvironment();
    const denied = await handleTelemetryRequest(
      new Request("https://collector.example/v1/usage", {
        method: "POST",
        headers: { Origin: "https://unknown.example", "Content-Type": "application/json" },
        body: JSON.stringify(batch),
      }),
      env,
    );
    expect(denied.status).toBe(403);
  });

  it("stores a validated batch without IP address, file path or researcher text fields", async () => {
    const { env, writes } = fakeEnvironment();
    const accepted = await handleTelemetryRequest(
      new Request("https://collector.example/v1/usage", {
        method: "POST",
        headers: {
          Origin: "http://tauri.localhost",
          "Content-Type": "application/json",
          "X-BioFigureStat-Ingest-Key": "public-alpha-key",
        },
        body: JSON.stringify(batch),
      }),
      env,
    );
    expect(accepted.status).toBe(202);
    expect(writes).toHaveLength(1);
    expect(JSON.stringify(writes)).not.toContain("Secret study");
    expect(JSON.stringify(writes)).not.toContain("C:\\");
  });

  it("answers preflight only for an exact native origin", async () => {
    const { env } = fakeEnvironment();
    const accepted = await handleTelemetryRequest(
      new Request("https://collector.example/v1/usage", {
        method: "OPTIONS",
        headers: { Origin: "http://tauri.localhost" },
      }),
      env,
    );
    expect(accepted.status).toBe(204);
    expect(accepted.headers.get("Access-Control-Allow-Origin")).toBe("http://tauri.localhost");
    expect(accepted.headers.get("Access-Control-Allow-Headers")).toContain(
      "X-BioFigureStat-Ingest-Key",
    );

    const denied = await handleTelemetryRequest(
      new Request("https://collector.example/v1/usage", {
        method: "OPTIONS",
        headers: { Origin: "https://unknown.example" },
      }),
      env,
    );
    expect(denied.status).toBe(403);
  });

  it("rejects oversized and over-quota uploads before writing", async () => {
    const overQuota = fakeEnvironment(5_000);
    const quotaResponse = await handleTelemetryRequest(
      new Request("https://collector.example/v1/usage", {
        method: "POST",
        headers: {
          Origin: "http://tauri.localhost",
          "Content-Type": "application/json",
          "X-BioFigureStat-Ingest-Key": "public-alpha-key",
        },
        body: JSON.stringify(batch),
      }),
      overQuota.env,
    );
    expect(quotaResponse.status).toBe(429);
    expect(overQuota.writes).toHaveLength(0);

    const ordinary = fakeEnvironment();
    const oversized = await handleTelemetryRequest(
      new Request("https://collector.example/v1/usage", {
        method: "POST",
        headers: {
          Origin: "http://tauri.localhost",
          "Content-Type": "application/json",
          "Content-Length": String(81 * 1024),
          "X-BioFigureStat-Ingest-Key": "public-alpha-key",
        },
        body: JSON.stringify(batch),
      }),
      ordinary.env,
    );
    expect(oversized.status).toBe(413);
    expect(ordinary.writes).toHaveLength(0);
  });

  it("deletes expired rows from the scheduled retention handler", async () => {
    const { env, writes } = fakeEnvironment();
    await collector.scheduled({}, env);
    expect(writes).toHaveLength(3);
    expect(writes.every((values) => values.length === 1)).toBe(true);
  });

  it("accepts a separate exact problem-report schema and returns a report ID", async () => {
    expect(parseProblemReport(problemReport)).not.toBeNull();
    expect(parseProblemReport({ ...problemReport, project: { measurements: [12.3] } })).toBeNull();
    const { env, writes } = fakeReportEnvironment();
    const accepted = await handleTelemetryRequest(
      new Request("https://collector.example/v1/problem-reports", {
        method: "POST",
        headers: {
          Origin: "http://tauri.localhost",
          "Content-Type": "application/json",
          "X-BioFigureStat-Report-Key": "public-report-key_123456",
        },
        body: JSON.stringify(problemReport),
      }),
      env,
    );
    expect(accepted.status).toBe(201);
    expect((await accepted.json()).reportId).toMatch(/^BFS-[0-9A-F]{20}$/u);
    expect(writes).toHaveLength(2);
    expect(JSON.stringify(writes)).not.toContain("measurements");
  });

  it("rejects report uploads, extra fields, wrong origins and oversized bodies", async () => {
    const { env } = fakeReportEnvironment();
    const withFile = await handleTelemetryRequest(
      new Request("https://collector.example/v1/problem-reports", {
        method: "POST",
        headers: {
          Origin: "http://tauri.localhost",
          "Content-Type": "application/json",
          "X-BioFigureStat-Report-Key": "public-report-key_123456",
        },
        body: JSON.stringify({ ...problemReport, screenshot: "base64" }),
      }),
      env,
    );
    expect(withFile.status).toBe(400);
    const wrongOrigin = await handleTelemetryRequest(
      new Request("https://collector.example/v1/problem-reports", {
        method: "POST",
        headers: {
          Origin: "https://example.test",
          "Content-Type": "application/json",
          "X-BioFigureStat-Report-Key": "public-report-key_123456",
        },
        body: JSON.stringify(problemReport),
      }),
      env,
    );
    expect(wrongOrigin.status).toBe(403);
    const oversized = await handleTelemetryRequest(
      new Request("https://collector.example/v1/problem-reports", {
        method: "POST",
        headers: {
          Origin: "http://tauri.localhost",
          "Content-Type": "application/json",
          "Content-Length": String(17 * 1024),
          "X-BioFigureStat-Report-Key": "public-report-key_123456",
        },
        body: JSON.stringify(problemReport),
      }),
      env,
    );
    expect(oversized.status).toBe(413);
  });
});

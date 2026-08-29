import { describe, expect, it, vi } from "vitest";

import { handleTelemetryRequest, type TelemetryWorkerEnv } from "./index";
import { parseTelemetryBatch } from "./schema";

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

function fakeEnvironment() {
  const writes: unknown[][] = [];
  const prepare = vi.fn((query: string) => {
    let values: unknown[] = [];
    const statement = {
      bind: (...next: unknown[]) => {
        values = next;
        return statement;
      },
      first: async () => ({ count: 0 }),
      run: async () => ({ success: true }),
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
});

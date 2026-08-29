import { parseTelemetryBatch, type AcceptedTelemetryBatch } from "./schema";

type D1Result = Readonly<{ success: boolean }>;
type D1Statement = {
  bind: (...values: unknown[]) => D1Statement;
  first: <T>() => Promise<T | null>;
  run: () => Promise<D1Result>;
};
type D1Database = {
  prepare: (query: string) => D1Statement;
  batch: (statements: D1Statement[]) => Promise<D1Result[]>;
};

export type TelemetryWorkerEnv = Readonly<{
  DB: D1Database;
  INGEST_KEY: string;
  ALLOWED_ORIGINS?: string;
  RETENTION_DAYS?: string;
}>;

const MAX_BODY_BYTES = 80 * 1024;
const MAX_EVENTS_PER_INSTALL_PER_DAY = 5_000;

function allowedOrigin(request: Request, env: TelemetryWorkerEnv): string | null {
  const origin = request.headers.get("Origin");
  if (!origin) return null;
  const allowed = new Set(
    (env.ALLOWED_ORIGINS ?? "tauri://localhost,http://tauri.localhost,https://tauri.localhost")
      .split(",")
      .map((value) => value.trim())
      .filter(Boolean),
  );
  return allowed.has(origin) ? origin : null;
}

function response(status: number, body: Record<string, unknown>, origin: string | null): Response {
  const headers = new Headers({
    "Content-Type": "application/json; charset=utf-8",
    "Cache-Control": "no-store",
    "X-Content-Type-Options": "nosniff",
  });
  if (origin) {
    headers.set("Access-Control-Allow-Origin", origin);
    headers.set("Vary", "Origin");
  }
  return new Response(JSON.stringify(body), { status, headers });
}

async function sha256(value: string): Promise<string> {
  const digest = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(value));
  return Array.from(new Uint8Array(digest), (byte) => byte.toString(16).padStart(2, "0")).join("");
}

function retentionDays(env: TelemetryWorkerEnv): number {
  const parsed = Number(env.RETENTION_DAYS ?? "90");
  return Number.isInteger(parsed) && parsed >= 7 && parsed <= 365 ? parsed : 90;
}

async function persistBatch(batch: AcceptedTelemetryBatch, env: TelemetryWorkerEnv): Promise<void> {
  const received = new Date();
  const expires = new Date(received.getTime() + retentionDays(env) * 24 * 60 * 60 * 1000);
  const dayStart = new Date(received);
  dayStart.setUTCHours(0, 0, 0, 0);
  const count = await env.DB.prepare(
    "SELECT COUNT(*) AS count FROM usage_events WHERE install_id = ? AND received_at >= ?",
  )
    .bind(batch.installId, dayStart.toISOString())
    .first<{ count: number }>();
  if ((count?.count ?? 0) + batch.events.length > MAX_EVENTS_PER_INSTALL_PER_DAY) {
    throw new Error("RATE_LIMIT");
  }
  const statements: D1Statement[] = [];
  for (const event of batch.events) {
    const eventJson = JSON.stringify(event);
    const id = await sha256(
      `${batch.installId}\n${event.sessionId}\n${event.occurredAt}\n${event.kind}\n${eventJson}`,
    );
    statements.push(
      env.DB.prepare(
        "INSERT OR IGNORE INTO usage_events (id, received_at, expires_at, consent_notice_version, install_id, session_id, application_version, build_revision, platform, event_kind, occurred_at, route, workflow_family, category, event_json) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)",
      ).bind(
        id,
        received.toISOString(),
        expires.toISOString(),
        batch.consentNoticeVersion,
        batch.installId,
        event.sessionId,
        event.application.version,
        event.application.buildRevision,
        event.application.platform,
        event.kind,
        event.occurredAt,
        event.route,
        event.workflowFamily ?? event.entryFamily ?? null,
        event.category ?? event.milestone ?? event.code ?? null,
        eventJson,
      ),
    );
  }
  const results = await env.DB.batch(statements);
  if (results.some((result) => !result.success)) throw new Error("WRITE_FAILED");
}

export async function handleTelemetryRequest(
  request: Request,
  env: TelemetryWorkerEnv,
): Promise<Response> {
  const url = new URL(request.url);
  const origin = allowedOrigin(request, env);
  if (request.method === "GET" && url.pathname === "/health")
    return response(200, { ok: true }, origin);
  if (request.method === "OPTIONS" && url.pathname === "/v1/usage") {
    if (!origin) return response(403, { ok: false }, null);
    const headers = new Headers({
      "Access-Control-Allow-Origin": origin,
      "Access-Control-Allow-Methods": "POST, OPTIONS",
      "Access-Control-Allow-Headers": "Content-Type, X-BioFigureStat-Ingest-Key",
      "Access-Control-Max-Age": "86400",
      "Cache-Control": "no-store",
      Vary: "Origin",
    });
    return new Response(null, { status: 204, headers });
  }
  if (request.method !== "POST" || url.pathname !== "/v1/usage")
    return response(404, { ok: false }, origin);
  if (
    !origin ||
    !env.INGEST_KEY ||
    request.headers.get("X-BioFigureStat-Ingest-Key") !== env.INGEST_KEY
  )
    return response(403, { ok: false }, origin);
  const declaredLength = Number(request.headers.get("Content-Length") ?? "0");
  if (declaredLength > MAX_BODY_BYTES) return response(413, { ok: false }, origin);
  const text = await request.text();
  if (new TextEncoder().encode(text).byteLength > MAX_BODY_BYTES)
    return response(413, { ok: false }, origin);
  let parsed: unknown;
  try {
    parsed = JSON.parse(text);
  } catch {
    return response(400, { ok: false }, origin);
  }
  const batch = parseTelemetryBatch(parsed);
  if (!batch) return response(400, { ok: false }, origin);
  try {
    await persistBatch(batch, env);
    return response(202, { ok: true, accepted: batch.events.length }, origin);
  } catch (error) {
    if (error instanceof Error && error.message === "RATE_LIMIT")
      return response(429, { ok: false }, origin);
    return response(503, { ok: false }, origin);
  }
}

export default {
  fetch: handleTelemetryRequest,
  async scheduled(_controller: unknown, env: TelemetryWorkerEnv): Promise<void> {
    await env.DB.prepare("DELETE FROM usage_events WHERE expires_at < ?")
      .bind(new Date().toISOString())
      .run();
  },
};

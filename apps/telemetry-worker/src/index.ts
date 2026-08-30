import { parseTelemetryBatch, type AcceptedTelemetryBatch } from "./schema";
import {
  parseProblemReport,
  REPORT_STATUSES,
  type AcceptedProblemReport,
} from "./problemReportSchema";

type D1Result = Readonly<{ success: boolean }>;
type D1Statement = {
  bind: (...values: unknown[]) => D1Statement;
  first: <T>() => Promise<T | null>;
  run: () => Promise<D1Result>;
  all: <T>() => Promise<Readonly<{ results: T[] }>>;
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
  REPORT_INGEST_KEY?: string;
  REPORT_CONTACT_ENCRYPTION_KEY?: string;
  REPORT_RATE_LIMITER?: Readonly<{
    limit: (input: { key: string }) => Promise<{ success: boolean }>;
  }>;
  ACCESS_TEAM_DOMAIN?: string;
  ADMIN_ACCESS_AUD?: string;
}>;

const MAX_BODY_BYTES = 80 * 1024;
const MAX_EVENTS_PER_INSTALL_PER_DAY = 5_000;
const MAX_REPORT_BODY_BYTES = 16 * 1024;
const MAX_REPORTS_PER_REPORTER_PER_DAY = 10;

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

function requestOrigin(request: Request, env: TelemetryWorkerEnv): string | null {
  return allowedOrigin(request, env);
}

function reportCorsHeaders(origin: string): Headers {
  return new Headers({
    "Access-Control-Allow-Origin": origin,
    "Access-Control-Allow-Methods": "POST, OPTIONS",
    "Access-Control-Allow-Headers": "Content-Type, X-BioFigureStat-Report-Key",
    "Access-Control-Max-Age": "86400",
    "Cache-Control": "no-store",
    Vary: "Origin",
  });
}

async function sha256(value: string): Promise<string> {
  const digest = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(value));
  return Array.from(new Uint8Array(digest), (byte) => byte.toString(16).padStart(2, "0")).join("");
}

function bytesToBase64Url(bytes: Uint8Array): string {
  let binary = "";
  bytes.forEach((byte) => {
    binary += String.fromCharCode(byte);
  });
  return btoa(binary).replaceAll("+", "-").replaceAll("/", "_").replace(/=+$/u, "");
}

function base64UrlToBytes(value: string): Uint8Array<ArrayBuffer> {
  const base64 = value
    .replaceAll("-", "+")
    .replaceAll("_", "/")
    .padEnd(Math.ceil(value.length / 4) * 4, "=");
  const binary = atob(base64);
  const bytes = new Uint8Array(new ArrayBuffer(binary.length));
  for (let index = 0; index < binary.length; index += 1) bytes[index] = binary.charCodeAt(index);
  return bytes;
}

async function encryptContact(
  email: string,
  secret: string,
): Promise<{ ciphertext: string; iv: string }> {
  const keyBytes = base64UrlToBytes(secret);
  if (keyBytes.byteLength !== 32) throw new Error("CONTACT_KEY_INVALID");
  const key = await crypto.subtle.importKey("raw", keyBytes, "AES-GCM", false, ["encrypt"]);
  const iv = crypto.getRandomValues(new Uint8Array(12));
  const encrypted = await crypto.subtle.encrypt(
    { name: "AES-GCM", iv },
    key,
    new TextEncoder().encode(email),
  );
  return { ciphertext: bytesToBase64Url(new Uint8Array(encrypted)), iv: bytesToBase64Url(iv) };
}

async function decryptContact(ciphertext: string, iv: string, secret: string): Promise<string> {
  const keyBytes = base64UrlToBytes(secret);
  if (keyBytes.byteLength !== 32) throw new Error("CONTACT_KEY_INVALID");
  const key = await crypto.subtle.importKey("raw", keyBytes, "AES-GCM", false, ["decrypt"]);
  const decrypted = await crypto.subtle.decrypt(
    { name: "AES-GCM", iv: base64UrlToBytes(iv) },
    key,
    base64UrlToBytes(ciphertext),
  );
  return new TextDecoder().decode(decrypted);
}

function reportId(): string {
  return `BFS-${Array.from(crypto.getRandomValues(new Uint8Array(10)), (byte) =>
    byte.toString(16).padStart(2, "0"),
  )
    .join("")
    .toUpperCase()}`;
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

type StoredReportRow = Readonly<{
  report_id: string;
  received_at: string;
  expires_at: string;
  report_type: string;
  screen: string;
  attempted: string;
  observed: string;
  reproducibility: string;
  user_severity: string;
  diagnostic_json: string | null;
  contact_ciphertext: string | null;
  contact_iv: string | null;
  current_status: string;
}>;

async function persistProblemReport(
  report: AcceptedProblemReport,
  env: TelemetryWorkerEnv,
): Promise<string> {
  const replay = await env.DB.prepare(
    "SELECT report_id FROM problem_reports WHERE submission_id = ?",
  )
    .bind(report.submissionId)
    .first<{ report_id: string }>();
  if (replay) return replay.report_id;

  const received = new Date();
  const dayStart = new Date(received);
  dayStart.setUTCHours(0, 0, 0, 0);
  const count = await env.DB.prepare(
    "SELECT COUNT(*) AS count FROM problem_reports WHERE reporter_id = ? AND received_at >= ?",
  )
    .bind(report.reporterId, dayStart.toISOString())
    .first<{ count: number }>();
  if ((count?.count ?? 0) >= MAX_REPORTS_PER_REPORTER_PER_DAY) throw new Error("RATE_LIMIT");

  const content = JSON.stringify({
    type: report.type,
    screen: report.screen,
    attempted: report.attempted.trim(),
    observed: report.observed.trim(),
    reproducibility: report.reproducibility,
    severity: report.severity,
    diagnostic: report.diagnostic ?? null,
  });
  const contentHash = await sha256(content);
  const duplicateSince = new Date(received.getTime() - 24 * 60 * 60 * 1000).toISOString();
  const duplicate = await env.DB.prepare(
    "SELECT report_id FROM problem_reports WHERE content_hash = ? AND received_at >= ? ORDER BY received_at DESC LIMIT 1",
  )
    .bind(contentHash, duplicateSince)
    .first<{ report_id: string }>();
  if (duplicate) return duplicate.report_id;

  const id = reportId();
  const expiresAt = new Date(
    received.getTime() + retentionDays(env) * 24 * 60 * 60 * 1000,
  ).toISOString();
  const contactExpiresAt = report.contactEmail ? expiresAt : null;
  const encryptedContact = report.contactEmail
    ? await encryptContact(
        report.contactEmail.trim().toLowerCase(),
        env.REPORT_CONTACT_ENCRYPTION_KEY ?? "",
      )
    : null;
  const results = await env.DB.batch([
    env.DB.prepare(
      "INSERT INTO problem_reports (report_id, submission_id, reporter_id, content_hash, received_at, expires_at, notice_version, report_type, screen, attempted, observed, reproducibility, user_severity, diagnostic_json, contact_ciphertext, contact_iv, contact_expires_at, current_status) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'new')",
    ).bind(
      id,
      report.submissionId,
      report.reporterId,
      contentHash,
      received.toISOString(),
      expiresAt,
      report.noticeVersion,
      report.type,
      report.screen,
      report.attempted.trim(),
      report.observed.trim(),
      report.reproducibility,
      report.severity,
      report.diagnostic ? JSON.stringify(report.diagnostic) : null,
      encryptedContact?.ciphertext ?? null,
      encryptedContact?.iv ?? null,
      contactExpiresAt,
    ),
    env.DB.prepare(
      "INSERT INTO problem_report_status_history (report_id, status, changed_at, actor, note, duplicate_of) VALUES (?, 'new', ?, 'system', NULL, NULL)",
    ).bind(id, received.toISOString()),
  ]);
  if (results.some((result) => !result.success)) throw new Error("WRITE_FAILED");
  return id;
}

async function handleProblemReportRequest(
  request: Request,
  env: TelemetryWorkerEnv,
): Promise<Response> {
  const origin = requestOrigin(request, env);
  if (
    !origin ||
    !env.REPORT_INGEST_KEY ||
    request.headers.get("X-BioFigureStat-Report-Key") !== env.REPORT_INGEST_KEY
  )
    return response(403, { ok: false }, origin);
  if (
    request.headers.get("Content-Type")?.split(";", 1)[0]?.trim().toLowerCase() !==
    "application/json"
  )
    return response(415, { ok: false }, origin);
  const declaredLength = Number(request.headers.get("Content-Length") ?? "0");
  if (declaredLength > MAX_REPORT_BODY_BYTES) return response(413, { ok: false }, origin);
  const text = await request.text();
  if (new TextEncoder().encode(text).byteLength > MAX_REPORT_BODY_BYTES)
    return response(413, { ok: false }, origin);
  let parsed: unknown;
  try {
    parsed = JSON.parse(text);
  } catch {
    return response(400, { ok: false }, origin);
  }
  const report = parseProblemReport(parsed);
  if (!report) return response(400, { ok: false }, origin);
  if (env.REPORT_RATE_LIMITER) {
    const limited = await env.REPORT_RATE_LIMITER.limit({ key: report.reporterId });
    if (!limited.success) return response(429, { ok: false }, origin);
  }
  try {
    const id = await persistProblemReport(report, env);
    return response(201, { ok: true, reportId: id }, origin);
  } catch (error) {
    if (error instanceof Error && error.message === "RATE_LIMIT")
      return response(429, { ok: false }, origin);
    return response(503, { ok: false }, origin);
  }
}

type AccessPayload = Readonly<{
  aud?: string | string[];
  exp?: number;
  iss?: string;
  email?: string;
  sub?: string;
}>;

async function authorizeAdmin(request: Request, env: TelemetryWorkerEnv): Promise<string | null> {
  const team = env.ACCESS_TEAM_DOMAIN?.replace(/^https?:\/\//u, "").replace(/\/$/u, "");
  const audience = env.ADMIN_ACCESS_AUD;
  const token = request.headers.get("Cf-Access-Jwt-Assertion");
  if (!team || !audience || !token) return null;
  const parts = token.split(".");
  if (parts.length !== 3) return null;
  try {
    const header = JSON.parse(new TextDecoder().decode(base64UrlToBytes(parts[0]!))) as {
      alg?: string;
      kid?: string;
    };
    const payload = JSON.parse(
      new TextDecoder().decode(base64UrlToBytes(parts[1]!)),
    ) as AccessPayload;
    if (
      header.alg !== "RS256" ||
      !header.kid ||
      payload.iss !== `https://${team}` ||
      !payload.exp ||
      payload.exp <= Date.now() / 1000
    )
      return null;
    const audiences = Array.isArray(payload.aud) ? payload.aud : [payload.aud];
    if (!audiences.includes(audience)) return null;
    const certResponse = await fetch(`https://${team}/cdn-cgi/access/certs`);
    if (!certResponse.ok) return null;
    const certs = (await certResponse.json()) as { keys?: Array<JsonWebKey & { kid?: string }> };
    const jwk = certs.keys?.find((key) => key.kid === header.kid);
    if (!jwk) return null;
    const key = await crypto.subtle.importKey(
      "jwk",
      jwk,
      { name: "RSASSA-PKCS1-v1_5", hash: "SHA-256" },
      false,
      ["verify"],
    );
    const verified = await crypto.subtle.verify(
      "RSASSA-PKCS1-v1_5",
      key,
      base64UrlToBytes(parts[2]!),
      new TextEncoder().encode(`${parts[0]}.${parts[1]}`),
    );
    return verified ? (payload.email ?? payload.sub ?? "access-user") : null;
  } catch {
    return null;
  }
}

function adminHtml(): string {
  return `<!doctype html><html lang="ja"><meta charset="utf-8"><meta name="viewport" content="width=device-width"><title>BioFigureStat report triage</title><style>body{font:14px system-ui;margin:2rem;max-width:1200px}table{border-collapse:collapse;width:100%}th,td{border:1px solid #ccc;padding:.5rem;vertical-align:top}textarea{width:100%}.detail{white-space:pre-wrap;max-width:32rem}button,select{padding:.35rem}</style><h1>BioFigureStat report triage</h1><p id="state">読み込み中…</p><table><thead><tr><th>ID / 受付</th><th>内容</th><th>分類</th><th>状態</th></tr></thead><tbody id="rows"></tbody></table><script src="/admin/app.js"></script></html>`;
}

function adminScript(): string {
  // Escapes below belong to the generated browser script, not this Worker source string.
  // eslint-disable-next-line no-useless-escape
  return `const statuses=${JSON.stringify([...REPORT_STATUSES])};const esc=v=>String(v??'').replace(/[&<>\"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','\"':'&quot;',"'":'&#39;'}[c]));async function load(){const r=await fetch('/v1/admin/problem-reports');if(!r.ok){state.textContent='取得できません: '+r.status;return}const d=await r.json();state.textContent=d.reports.length+'件';rows.innerHTML=d.reports.map(x=>'<tr><td><b>'+esc(x.reportId)+'</b><br>'+esc(x.receivedAt)+'</td><td><b>'+esc(x.type)+' / '+esc(x.screen)+'</b><div class="detail">'+esc(x.attempted)+'\n---\n'+esc(x.observed)+'</div><small id="c-'+esc(x.reportId)+'">返信先: '+(x.contactAvailable?'<button onclick="contact(\''+esc(x.reportId)+'\')">表示</button>':'なし')+'</small></td><td>'+esc(x.severity)+'<br>'+esc(x.reproducibility)+'</td><td><select id="s-'+esc(x.reportId)+'">'+statuses.map(s=>'<option '+(s===x.status?'selected':'')+'>'+s+'</option>').join('')+'</select><textarea id="n-'+esc(x.reportId)+'" placeholder="triage note"></textarea><button onclick="save(\''+esc(x.reportId)+'\')">更新</button></td></tr>').join('')}async function contact(id){const r=await fetch('/v1/admin/problem-reports/'+id+'/contact'),d=await r.json();document.getElementById('c-'+id).textContent='返信先: '+(d.contactEmail||'なし')}async function save(id){const status=document.getElementById('s-'+id).value,note=document.getElementById('n-'+id).value;const r=await fetch('/v1/admin/problem-reports/'+id,{method:'PATCH',headers:{'Content-Type':'application/json'},body:JSON.stringify({status,note})});if(!r.ok)alert('更新失敗 '+r.status);else load()}}load();`;
}

async function adminReports(
  request: Request,
  env: TelemetryWorkerEnv,
  actor: string,
): Promise<Response> {
  const url = new URL(request.url);
  if (request.method === "GET" && url.pathname === "/admin")
    return new Response(adminHtml(), {
      headers: {
        "Content-Type": "text/html; charset=utf-8",
        "Cache-Control": "no-store",
        "Content-Security-Policy":
          "default-src 'self'; style-src 'unsafe-inline'; object-src 'none'; frame-ancestors 'none'",
      },
    });
  if (request.method === "GET" && url.pathname === "/admin/app.js")
    return new Response(adminScript(), {
      headers: { "Content-Type": "text/javascript; charset=utf-8", "Cache-Control": "no-store" },
    });
  if (
    request.method === "GET" &&
    (url.pathname === "/v1/admin/problem-reports" || url.pathname === "/v1/admin/triage")
  ) {
    const since = url.searchParams.get("since") ?? "1970-01-01T00:00:00.000Z";
    if (Number.isNaN(Date.parse(since))) return response(400, { ok: false }, null);
    const rows = await env.DB.prepare(
      "SELECT report_id, received_at, expires_at, report_type, screen, attempted, observed, reproducibility, user_severity, diagnostic_json, contact_ciphertext, contact_iv, current_status FROM problem_reports WHERE received_at > ? ORDER BY received_at ASC LIMIT 500",
    )
      .bind(since)
      .all<StoredReportRow>();
    const reports = await Promise.all(
      rows.results.map(async (row) => ({
        reportId: row.report_id,
        receivedAt: row.received_at,
        expiresAt: row.expires_at,
        type: row.report_type,
        screen: row.screen,
        attempted: row.attempted,
        observed: row.observed,
        reproducibility: row.reproducibility,
        severity: row.user_severity,
        diagnostic: row.diagnostic_json ? JSON.parse(row.diagnostic_json) : null,
        status: row.current_status,
        contactAvailable: Boolean(row.contact_ciphertext && row.contact_iv),
      })),
    );
    if (url.pathname === "/v1/admin/triage") {
      const errors = await env.DB.prepare(
        "SELECT id, received_at, application_version, build_revision, platform, occurred_at, route, workflow_family, category FROM usage_events WHERE event_kind = 'error' AND received_at > ? ORDER BY received_at ASC LIMIT 1000",
      )
        .bind(since)
        .all<Record<string, unknown>>();
      return response(
        200,
        {
          ok: true,
          since,
          nextCursor: new Date().toISOString(),
          reports,
          fixedErrors: errors.results,
        },
        null,
      );
    }
    return response(200, { ok: true, reports }, null);
  }
  const contactMatch = url.pathname.match(
    /^\/v1\/admin\/problem-reports\/(BFS-[0-9A-F]{20})\/contact$/u,
  );
  if (request.method === "GET" && contactMatch) {
    const row = await env.DB.prepare(
      "SELECT contact_ciphertext, contact_iv FROM problem_reports WHERE report_id = ?",
    )
      .bind(contactMatch[1])
      .first<{ contact_ciphertext: string | null; contact_iv: string | null }>();
    if (!row) return response(404, { ok: false }, null);
    if (!row.contact_ciphertext || !row.contact_iv)
      return response(200, { ok: true, contactEmail: null }, null);
    if (!env.REPORT_CONTACT_ENCRYPTION_KEY) return response(503, { ok: false }, null);
    const contactEmail = await decryptContact(
      row.contact_ciphertext,
      row.contact_iv,
      env.REPORT_CONTACT_ENCRYPTION_KEY,
    ).catch(() => null);
    return contactEmail
      ? response(200, { ok: true, contactEmail }, null)
      : response(503, { ok: false }, null);
  }
  const match = url.pathname.match(/^\/v1\/admin\/problem-reports\/(BFS-[0-9A-F]{20})$/u);
  if (request.method === "PATCH" && match) {
    let body: unknown;
    try {
      body = await request.json();
    } catch {
      return response(400, { ok: false }, null);
    }
    if (!body || typeof body !== "object" || Array.isArray(body))
      return response(400, { ok: false }, null);
    const item = body as Record<string, unknown>;
    const keys = Object.keys(item);
    if (
      !keys.every((key) => ["status", "note", "duplicateOf"].includes(key)) ||
      !REPORT_STATUSES.has(String(item.status))
    )
      return response(400, { ok: false }, null);
    const note = typeof item.note === "string" && item.note.trim() ? item.note.trim() : null;
    if (note && note.length > 2000) return response(400, { ok: false }, null);
    const duplicateOf =
      typeof item.duplicateOf === "string" && /^BFS-[0-9A-F]{20}$/u.test(item.duplicateOf)
        ? item.duplicateOf
        : null;
    if (item.status === "duplicate" && !duplicateOf) return response(400, { ok: false }, null);
    const changedAt = new Date().toISOString();
    const results = await env.DB.batch([
      env.DB.prepare(
        "UPDATE problem_reports SET current_status = ?, contact_expires_at = CASE WHEN ? IN ('resolved','duplicate','not_actionable') THEN MIN(contact_expires_at, ?) ELSE contact_expires_at END WHERE report_id = ?",
      ).bind(
        item.status,
        item.status,
        new Date(Date.now() + 30 * 24 * 60 * 60 * 1000).toISOString(),
        match[1],
      ),
      env.DB.prepare(
        "INSERT INTO problem_report_status_history (report_id, status, changed_at, actor, note, duplicate_of) VALUES (?, ?, ?, ?, ?, ?)",
      ).bind(match[1], item.status, changedAt, actor.slice(0, 254), note, duplicateOf),
    ]);
    return results.every((result) => result.success)
      ? response(200, { ok: true }, null)
      : response(503, { ok: false }, null);
  }
  return response(404, { ok: false }, null);
}

export async function handleTelemetryRequest(
  request: Request,
  env: TelemetryWorkerEnv,
): Promise<Response> {
  const url = new URL(request.url);
  const origin = allowedOrigin(request, env);
  if (request.method === "GET" && url.pathname === "/health")
    return response(
      200,
      {
        ok: true,
        usage: true,
        problemReports: true,
        adminConfigured: Boolean(env.ACCESS_TEAM_DOMAIN && env.ADMIN_ACCESS_AUD),
      },
      origin,
    );
  if (request.method === "OPTIONS" && url.pathname === "/v1/problem-reports") {
    if (!origin) return response(403, { ok: false }, null);
    return new Response(null, { status: 204, headers: reportCorsHeaders(origin) });
  }
  if (request.method === "POST" && url.pathname === "/v1/problem-reports")
    return handleProblemReportRequest(request, env);
  if (
    url.pathname === "/admin" ||
    url.pathname === "/admin/app.js" ||
    url.pathname.startsWith("/v1/admin/")
  ) {
    if (!env.ACCESS_TEAM_DOMAIN || !env.ADMIN_ACCESS_AUD)
      return response(503, { ok: false, admin: "not_configured" }, null);
    const actor = await authorizeAdmin(request, env);
    return actor ? adminReports(request, env, actor) : response(403, { ok: false }, null);
  }
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
    const now = new Date().toISOString();
    await env.DB.batch([
      env.DB.prepare("DELETE FROM usage_events WHERE expires_at < ?").bind(now),
      env.DB.prepare(
        "UPDATE problem_reports SET contact_ciphertext = NULL, contact_iv = NULL WHERE contact_expires_at IS NOT NULL AND contact_expires_at < ?",
      ).bind(now),
      env.DB.prepare("DELETE FROM problem_reports WHERE expires_at < ?").bind(now),
    ]);
  },
};

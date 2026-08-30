import type { AppRoute } from "./routes";

export const PROBLEM_REPORT_SCHEMA_VERSION = "1.0.0" as const;
export const PROBLEM_REPORT_NOTICE_VERSION = "public-alpha-2026-08-30" as const;

const REPORTER_ID_KEY = "biofigurestat.problem-report.reporter-id.v1";

export const PROBLEM_REPORT_TYPES = [
  "bug",
  "usability",
  "feature_request",
  "scientific_concern",
] as const;
export const PROBLEM_REPORT_REPRODUCIBILITY = [
  "always",
  "sometimes",
  "once",
  "not_retried",
  "unknown",
] as const;
export const PROBLEM_REPORT_SEVERITIES = [
  "cannot_continue",
  "possible_data_integrity_risk",
  "workaround_available",
  "minor",
] as const;

export type ProblemReportType = (typeof PROBLEM_REPORT_TYPES)[number];
export type ProblemReportReproducibility = (typeof PROBLEM_REPORT_REPRODUCIBILITY)[number];
export type ProblemReportSeverity = (typeof PROBLEM_REPORT_SEVERITIES)[number];

export type PrivacyReducedDiagnostic = Readonly<{
  schemaVersion: "1.0.0";
  application: Readonly<{ version: string; buildRevision: string }>;
  environment: Readonly<{ platform: string; architecture: string; tauri: boolean }>;
  route: AppRoute;
  lastErrorCode: string | null;
  recentErrorCodes: readonly string[];
  recentErrorClasses: readonly string[];
}>;

export type ProblemReportDraft = Readonly<{
  type: ProblemReportType;
  screen: AppRoute;
  attempted: string;
  observed: string;
  reproducibility: ProblemReportReproducibility;
  severity: ProblemReportSeverity;
  contactEmail: string;
  includeDiagnostic: boolean;
}>;

export type ProblemReportSubmission = Readonly<{
  schemaVersion: typeof PROBLEM_REPORT_SCHEMA_VERSION;
  noticeVersion: typeof PROBLEM_REPORT_NOTICE_VERSION;
  submissionId: string;
  reporterId: string;
  submittedAt: string;
  type: ProblemReportType;
  screen: AppRoute;
  attempted: string;
  observed: string;
  reproducibility: ProblemReportReproducibility;
  severity: ProblemReportSeverity;
  contactEmail?: string;
  diagnostic?: PrivacyReducedDiagnostic;
}>;

function uuid(): string {
  return crypto.randomUUID();
}

function reporterId(): string {
  try {
    const existing = localStorage.getItem(REPORTER_ID_KEY);
    if (existing && /^[0-9a-f-]{36}$/iu.test(existing)) return existing;
    const created = uuid();
    localStorage.setItem(REPORTER_ID_KEY, created);
    return created;
  } catch {
    return uuid();
  }
}

export function configuredProblemReportEndpoint(): string | null {
  const value = import.meta.env.VITE_PROBLEM_REPORT_ENDPOINT?.trim();
  if (!value) return null;
  try {
    const url = new URL(value);
    return url.protocol === "https:" &&
      !url.username &&
      !url.password &&
      url.pathname === "/v1/problem-reports"
      ? url.toString()
      : null;
  } catch {
    return null;
  }
}

function configuredProblemReportKey(): string | null {
  const value = import.meta.env.VITE_PROBLEM_REPORT_INGEST_KEY?.trim();
  return value && /^[A-Za-z0-9._-]{16,128}$/u.test(value) ? value : null;
}

export function createProblemReportSubmission(
  draft: ProblemReportDraft,
  diagnostic?: PrivacyReducedDiagnostic,
  identity?: Readonly<{ submissionId: string; reporterId: string; submittedAt: string }>,
): ProblemReportSubmission {
  const contactEmail = draft.contactEmail.trim();
  return {
    schemaVersion: PROBLEM_REPORT_SCHEMA_VERSION,
    noticeVersion: PROBLEM_REPORT_NOTICE_VERSION,
    submissionId: identity?.submissionId ?? uuid(),
    reporterId: identity?.reporterId ?? reporterId(),
    submittedAt: identity?.submittedAt ?? new Date().toISOString(),
    type: draft.type,
    screen: draft.screen,
    attempted: draft.attempted.trim(),
    observed: draft.observed.trim(),
    reproducibility: draft.reproducibility,
    severity: draft.severity,
    ...(contactEmail ? { contactEmail } : {}),
    ...(draft.includeDiagnostic && diagnostic ? { diagnostic } : {}),
  };
}

export async function submitProblemReport(
  submission: ProblemReportSubmission,
  fetcher: typeof fetch = fetch,
): Promise<string> {
  const endpoint = configuredProblemReportEndpoint();
  const key = configuredProblemReportKey();
  if (!endpoint || !key) throw new Error("REPORTING_NOT_CONFIGURED");
  const controller = new AbortController();
  const timeout = window.setTimeout(() => controller.abort(), 7_000);
  try {
    const response = await fetcher(endpoint, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "X-BioFigureStat-Report-Key": key,
      },
      body: JSON.stringify(submission),
      signal: controller.signal,
    });
    const result = (await response.json().catch(() => null)) as { reportId?: unknown } | null;
    if (!response.ok || typeof result?.reportId !== "string")
      throw new Error(`REPORT_FAILED_${response.status}`);
    return result.reportId;
  } finally {
    window.clearTimeout(timeout);
  }
}

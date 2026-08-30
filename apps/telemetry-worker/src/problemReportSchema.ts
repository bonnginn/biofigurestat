const TYPES = new Set(["bug", "usability", "feature_request", "scientific_concern"]);
const ROUTES = new Set([
  "home",
  "new-experiment",
  "favorites",
  "recent",
  "open-project",
  "survival",
  "nonlinear-fit",
  "heatmap",
  "contingency",
  "repeated-nonparametric",
  "regression",
  "distribution",
]);
const REPRODUCIBILITY = new Set(["always", "sometimes", "once", "not_retried", "unknown"]);
const SEVERITIES = new Set([
  "cannot_continue",
  "possible_data_integrity_risk",
  "workaround_available",
  "minor",
]);
const ERROR_CODES = new Set([
  "ENGINE_INPUT_INVALID",
  "ENGINE_EXECUTION_FAILED",
  "PROJECT_SAVE_FAILED",
  "PROJECT_OPEN_FAILED",
  "PROJECT_SCHEMA_UNSUPPORTED",
  "GRAPH_EXPORT_FAILED",
  "STATISTICS_STALE",
  "INVALID_PAIRED_STRUCTURE",
  "INVALID_NESTED_STRUCTURE",
  "UNSUPPORTED_ANALYSIS",
  "IMPORT_MAPPING_INVALID",
  "DIAGNOSTIC_EXPORT_FAILED",
  "UNEXPECTED_APPLICATION_ERROR",
]);
const ERROR_CLASSES = new Set([
  "Error",
  "TypeError",
  "RangeError",
  "ReferenceError",
  "SyntaxError",
  "URIError",
  "EvalError",
  "AggregateError",
  "DOMException",
  "NonErrorThrow",
]);
const PLATFORMS = new Set(["windows", "macos", "linux", "other"]);
const ARCHITECTURES = new Set(["arm64", "aarch64", "x86_64", "x64", "win64", "wow64", "unknown"]);

export const REPORT_STATUSES = new Set([
  "new",
  "needs_review",
  "approved_for_fix",
  "in_progress",
  "resolved",
  "duplicate",
  "not_actionable",
]);

export type AcceptedProblemReport = Readonly<{
  schemaVersion: "1.0.0";
  noticeVersion: "public-alpha-2026-08-30";
  submissionId: string;
  reporterId: string;
  submittedAt: string;
  type: string;
  screen: string;
  attempted: string;
  observed: string;
  reproducibility: string;
  severity: string;
  contactEmail?: string;
  diagnostic?: Readonly<Record<string, unknown>>;
}>;

function exact(
  value: unknown,
  required: readonly string[],
  optional: readonly string[] = [],
): value is Record<string, unknown> {
  if (!value || typeof value !== "object" || Array.isArray(value)) return false;
  const keys = Object.keys(value as object);
  return (
    required.every((key) => keys.includes(key)) &&
    keys.every((key) => required.includes(key) || optional.includes(key))
  );
}

function uuid(value: unknown): value is string {
  return (
    typeof value === "string" &&
    /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/iu.test(value)
  );
}

function isoDate(value: unknown): value is string {
  return (
    typeof value === "string" &&
    /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/u.test(value) &&
    new Date(value).toISOString() === value
  );
}

function text(value: unknown, max: number): value is string {
  return (
    typeof value === "string" &&
    value.trim().length > 0 &&
    value.length <= max &&
    ![...value].some((character) => {
      const code = character.charCodeAt(0);
      return (code < 32 && code !== 9 && code !== 10 && code !== 13) || code === 127;
    })
  );
}

function softwareVersion(value: unknown): value is string {
  return (
    typeof value === "string" &&
    value.length > 0 &&
    value.length <= 128 &&
    /^[A-Za-z0-9.+_-]+$/u.test(value)
  );
}

function diagnostic(value: unknown, screen: string): value is Record<string, unknown> {
  if (
    !exact(value, [
      "schemaVersion",
      "application",
      "environment",
      "route",
      "lastErrorCode",
      "recentErrorCodes",
      "recentErrorClasses",
    ])
  )
    return false;
  if (value.schemaVersion !== "1.0.0" || value.route !== screen) return false;
  if (
    !exact(value.application, ["version", "buildRevision"]) ||
    !softwareVersion(value.application.version) ||
    !softwareVersion(value.application.buildRevision)
  )
    return false;
  if (
    !exact(value.environment, ["platform", "architecture", "tauri"]) ||
    !PLATFORMS.has(String(value.environment.platform)) ||
    !ARCHITECTURES.has(String(value.environment.architecture)) ||
    typeof value.environment.tauri !== "boolean"
  )
    return false;
  if (value.lastErrorCode !== null && !ERROR_CODES.has(String(value.lastErrorCode))) return false;
  if (
    !Array.isArray(value.recentErrorCodes) ||
    value.recentErrorCodes.length > 10 ||
    !value.recentErrorCodes.every((code) => ERROR_CODES.has(String(code)))
  )
    return false;
  return (
    Array.isArray(value.recentErrorClasses) &&
    value.recentErrorClasses.length <= 10 &&
    value.recentErrorClasses.every((kind) => ERROR_CLASSES.has(String(kind)))
  );
}

export function parseProblemReport(value: unknown): AcceptedProblemReport | null {
  const required = [
    "schemaVersion",
    "noticeVersion",
    "submissionId",
    "reporterId",
    "submittedAt",
    "type",
    "screen",
    "attempted",
    "observed",
    "reproducibility",
    "severity",
  ];
  if (!exact(value, required, ["contactEmail", "diagnostic"])) return null;
  if (
    value.schemaVersion !== "1.0.0" ||
    value.noticeVersion !== "public-alpha-2026-08-30" ||
    !uuid(value.submissionId) ||
    !uuid(value.reporterId) ||
    !isoDate(value.submittedAt)
  )
    return null;
  if (
    !TYPES.has(String(value.type)) ||
    !ROUTES.has(String(value.screen)) ||
    !REPRODUCIBILITY.has(String(value.reproducibility)) ||
    !SEVERITIES.has(String(value.severity))
  )
    return null;
  if (!text(value.attempted, 1500) || !text(value.observed, 2000)) return null;
  if (
    value.contactEmail !== undefined &&
    (typeof value.contactEmail !== "string" ||
      value.contactEmail.length > 254 ||
      !/^[^\s@]+@[^\s@]+\.[^\s@]+$/u.test(value.contactEmail))
  )
    return null;
  if (value.diagnostic !== undefined && !diagnostic(value.diagnostic, String(value.screen)))
    return null;
  return value as AcceptedProblemReport;
}

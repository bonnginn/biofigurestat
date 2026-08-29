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
const ENTRY_FAMILIES = new Set([
  "home",
  "experiment_interview",
  "graph_only",
  "survival",
  "ordered_curve",
  "heatmap",
  "specialized_analysis",
  "project_workspace",
]);
const MILESTONES = new Set([
  "entry_started",
  "structure_ready",
  "data_entry_started",
  "graph_created",
  "statistics_requested",
  "statistics_completed",
  "project_saved",
  "project_opened",
  "safe_stop",
]);
const INTERACTIONS = new Set([
  "navigation",
  "primary_action",
  "form_control",
  "spreadsheet",
  "graph_control",
  "entry_choice",
  "condition_definition",
  "measurement_definition",
  "combination_review",
  "unit_relationship",
  "ordered_structure",
  "setup_summary",
  "other_control",
]);
const GRAPH_EDITS = new Set([
  "graph_type",
  "series_selection",
  "axes",
  "layers",
  "appearance_layout",
  "statistics_annotation",
]);
const GRAPH_FAMILIES = new Set([
  "dot",
  "bar",
  "line",
  "scatter",
  "box",
  "violin",
  "paired_dot",
  "stacked",
  "stacked_100",
  "category_percentage",
  "kaplan_meier",
  "ordered_curve",
  "heatmap",
  "other",
]);
const GRAPH_ORIGINS = new Set([
  "recommended",
  "user_selected",
  "saved_default",
  "direct_table",
  "dedicated_entry",
]);
const UNCERTAINTY = new Set(["none", "sd", "sem", "ci", "other"]);
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

export type AcceptedTelemetryEvent = Readonly<{
  kind: string;
  occurredAt: string;
  route: string;
  sessionId: string;
  application: Readonly<{ version: string; buildRevision: string; platform: string }>;
  workflowFamily?: unknown;
  entryFamily?: unknown;
  category?: unknown;
  milestone?: unknown;
  code?: unknown;
  [key: string]: unknown;
}>;
export type AcceptedTelemetryBatch = Readonly<{
  schemaVersion: "2.0.0";
  consentNoticeVersion: string;
  installId: string;
  sessionId: string;
  application: Readonly<{ version: string; buildRevision: string; platform: string }>;
  events: readonly AcceptedTelemetryEvent[];
}>;

function exact(value: unknown, keys: readonly string[]): value is Record<string, unknown> {
  if (!value || typeof value !== "object" || Array.isArray(value)) return false;
  const actual = Object.keys(value as object).sort();
  const expected = [...keys].sort();
  return actual.length === expected.length && actual.every((key, index) => key === expected[index]);
}

function boundedText(value: unknown): value is string {
  return (
    typeof value === "string" &&
    value.length > 0 &&
    value.length <= 128 &&
    !/[\u0000-\u001f\u007f]/u.test(value)
  );
}

function uuid(value: unknown): value is string {
  return (
    typeof value === "string" &&
    /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/iu.test(value)
  );
}

function isoDate(value: unknown): value is string {
  if (typeof value !== "string" || !/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/u.test(value))
    return false;
  return new Date(value).toISOString() === value;
}

function boundedCount(value: unknown): value is number {
  return Number.isInteger(value) && Number(value) >= 0 && Number(value) <= 10_000;
}

function attributedEvent(value: unknown): value is AcceptedTelemetryEvent {
  if (!value || typeof value !== "object" || Array.isArray(value)) return false;
  const item = value as Record<string, unknown>;
  if (!uuid(item.sessionId) || !exact(item.application, ["version", "buildRevision", "platform"]))
    return false;
  const app = item.application;
  if (
    !boundedText(app.version) ||
    !boundedText(app.buildRevision) ||
    !new Set(["windows", "macos", "linux", "other"]).has(String(app.platform))
  )
    return false;
  if (!ROUTES.has(String(item.route)) || !isoDate(item.occurredAt)) return false;
  switch (item.kind) {
    case "route_view":
      return (
        exact(item, ["kind", "occurredAt", "route", "entryFamily", "sessionId", "application"]) &&
        ENTRY_FAMILIES.has(String(item.entryFamily))
      );
    case "task_milestone":
      return (
        exact(item, [
          "kind",
          "occurredAt",
          "route",
          "workflowFamily",
          "milestone",
          "sessionId",
          "application",
        ]) &&
        ENTRY_FAMILIES.has(String(item.workflowFamily)) &&
        MILESTONES.has(String(item.milestone))
      );
    case "error":
      return (
        exact(item, [
          "kind",
          "occurredAt",
          "route",
          "workflowFamily",
          "code",
          "sessionId",
          "application",
        ]) &&
        ENTRY_FAMILIES.has(String(item.workflowFamily)) &&
        ERROR_CODES.has(String(item.code))
      );
    case "interaction_counts":
      return (
        exact(item, [
          "kind",
          "occurredAt",
          "route",
          "workflowFamily",
          "category",
          "clicks",
          "changes",
          "sessionId",
          "application",
        ]) &&
        ENTRY_FAMILIES.has(String(item.workflowFamily)) &&
        INTERACTIONS.has(String(item.category)) &&
        boundedCount(item.clicks) &&
        boundedCount(item.changes)
      );
    case "graph_edit":
      return (
        exact(item, [
          "kind",
          "occurredAt",
          "route",
          "workflowFamily",
          "category",
          "count",
          "sessionId",
          "application",
        ]) &&
        ENTRY_FAMILIES.has(String(item.workflowFamily)) &&
        GRAPH_EDITS.has(String(item.category)) &&
        boundedCount(item.count)
      );
    case "graph_configuration":
      return (
        exact(item, [
          "kind",
          "occurredAt",
          "route",
          "workflowFamily",
          "graphFamily",
          "origin",
          "uncertainty",
          "rawPointsVisible",
          "summaryVisible",
          "sessionId",
          "application",
        ]) &&
        ENTRY_FAMILIES.has(String(item.workflowFamily)) &&
        GRAPH_FAMILIES.has(String(item.graphFamily)) &&
        GRAPH_ORIGINS.has(String(item.origin)) &&
        UNCERTAINTY.has(String(item.uncertainty)) &&
        typeof item.rawPointsVisible === "boolean" &&
        typeof item.summaryVisible === "boolean"
      );
    default:
      return false;
  }
}

export function parseTelemetryBatch(value: unknown): AcceptedTelemetryBatch | null {
  if (
    !exact(value, [
      "schemaVersion",
      "consentNoticeVersion",
      "installId",
      "sessionId",
      "application",
      "events",
    ])
  )
    return null;
  const item = value;
  if (
    item.schemaVersion !== "2.0.0" ||
    typeof item.consentNoticeVersion !== "string" ||
    !item.consentNoticeVersion.startsWith("remote-") ||
    !uuid(item.installId) ||
    !uuid(item.sessionId)
  )
    return null;
  if (!exact(item.application, ["version", "buildRevision", "platform"])) return null;
  const app = item.application;
  if (
    !boundedText(app.version) ||
    !boundedText(app.buildRevision) ||
    !new Set(["windows", "macos", "linux", "other"]).has(String(app.platform))
  )
    return null;
  if (
    !Array.isArray(item.events) ||
    item.events.length === 0 ||
    item.events.length > 120 ||
    !item.events.every(attributedEvent)
  )
    return null;
  return item as AcceptedTelemetryBatch;
}

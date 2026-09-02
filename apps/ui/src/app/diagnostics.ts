import { invoke, isTauri } from "@tauri-apps/api/core";
import { save } from "@tauri-apps/plugin-dialog";
import type { ProjectState } from "@lsaa/project";

import { APP_ERROR_CODES, type AppErrorCode } from "./errorCatalog";
import { PRODUCT_IDENTITY } from "./productIdentity";
import { evaluationMode } from "./evaluationMode";
import { primaryRoutes, routeFromPath, type AppRoute } from "./routes";
import { recordUsageError, usageTelemetryUploadConfigured } from "./usageTelemetry";
import type { PrivacyReducedDiagnostic } from "./problemReports";

const MAX_EVENTS = 50;
let nativeArchitecture: string | null = null;

const DIAGNOSTIC_GRAPH_TYPES = [
  "dot",
  "paired_dot",
  "box",
  "violin",
  "bar",
  "line",
  "scatter",
  "stacked",
  "stacked_100",
  "category_percentage",
] as const;
const DIAGNOSTIC_ANALYSIS_TEMPLATES = [
  "D01",
  "D02",
  "D03",
  "D04",
  "D05",
  "D06",
  "D07",
  "D08",
  "D09",
  "D10",
  "D11",
  "D12",
  "D13",
  "D14",
  "D15",
  "D16",
  "D17",
] as const;
const DIAGNOSTIC_STATISTICAL_METHODS = [
  "welch_tost",
  "welch_t",
  "student_t",
  "mann_whitney",
  "paired_t",
  "wilcoxon_signed_rank",
  "one_way_anova",
  "welch_anova",
  "kruskal_wallis",
  "repeated_measures_anova",
  "friedman",
  "two_way_anova",
  "mixed_anova",
  "mixed_model",
  "pearson",
  "spearman",
  "one_sample_t",
  "log_rank",
  "fisher_exact",
  "pearson_chi_square",
  "mcnemar_exact",
  "simple_linear_regression",
  "nonlinear_xy_fit",
] as const;
const DIAGNOSTIC_PROTOCOL_VERSIONS = [
  "0.1.0",
  "0.2.0",
  "0.3.0",
  "0.4.0",
  "0.5.0",
  "0.6.0",
  "0.7.0",
  "0.8.0",
  "0.9.0",
  "0.10.0",
  "0.11.0",
  "0.12.0",
  "0.13.0",
  "0.14.0",
  "0.15.0",
] as const;
const DIAGNOSTIC_PROJECT_IO_STAGES = [
  "checksum",
  "database_encode",
  "container_begin",
  "container_write",
  "container_commit",
  "package_assembly",
  "unknown",
] as const;
const DIAGNOSTIC_PROJECT_OPEN_SOURCES = [
  "workspace_file_menu",
  "system",
  "recent",
  "dialog",
] as const;
const DIAGNOSTIC_PACKAGE_NAMES = ["numpy", "scipy", "statsmodels"] as const;

type DiagnosticGraphType = (typeof DIAGNOSTIC_GRAPH_TYPES)[number];
type DiagnosticAnalysisTemplate = (typeof DIAGNOSTIC_ANALYSIS_TEMPLATES)[number];
type DiagnosticStatisticalMethod = (typeof DIAGNOSTIC_STATISTICAL_METHODS)[number];
type DiagnosticProtocolVersion = (typeof DIAGNOSTIC_PROTOCOL_VERSIONS)[number];
export type DiagnosticProjectIoStage = (typeof DIAGNOSTIC_PROJECT_IO_STAGES)[number];
export type DiagnosticProjectOpenSource = (typeof DIAGNOSTIC_PROJECT_OPEN_SOURCES)[number];

export type DiagnosticEventDetailMap = Readonly<{
  project_saved: Readonly<{ state: "success" }>;
  project_save_failed: Readonly<{ stage: DiagnosticProjectIoStage }>;
  route_changed: Readonly<{ route: AppRoute }>;
  project_opened: Readonly<{ state: "success"; source: DiagnosticProjectOpenSource }>;
  graph_state_changed: Readonly<{
    graphType: DiagnosticGraphType;
    graphFingerprint: string;
  }>;
  analysis_executed: Readonly<{
    templateId: DiagnosticAnalysisTemplate;
    methodId: DiagnosticStatisticalMethod;
    protocolVersion: DiagnosticProtocolVersion;
    engineVersion: string;
    packageVersions: string;
    requestFingerprint: string;
  }>;
  error: Readonly<{ code: AppErrorCode }>;
}>;

export type DiagnosticEventType = keyof DiagnosticEventDetailMap;

export type DiagnosticScalar = string | number | boolean | null;
export type DiagnosticEvent = {
  [Type in DiagnosticEventType]: Readonly<{
    occurredAt: string;
    type: Type;
    detail: DiagnosticEventDetailMap[Type];
  }>;
}[DiagnosticEventType];

type DiagnosticRuntime = {
  events: DiagnosticEvent[];
  lastErrorCode: AppErrorCode | null;
  technicalErrors: Array<Readonly<{ occurredAt: string; code: AppErrorCode; detail: string }>>;
};

const runtime: DiagnosticRuntime = { events: [], lastErrorCode: null, technicalErrors: [] };

const SAFE_ERROR_KINDS = new Set([
  "Error",
  "TypeError",
  "RangeError",
  "ReferenceError",
  "SyntaxError",
  "URIError",
  "EvalError",
  "AggregateError",
  "DOMException",
]);

function safeErrorKind(error: unknown): string {
  if (typeof error === "string") {
    if (/ENGINE_PROCESS_TIMEOUT/u.test(error)) return "EngineProcessTimeout";
    if (/ENGINE_PROCESS_CANCELLED/u.test(error)) return "EngineProcessCancelled";
    if (/missing from application resources/iu.test(error)) return "EngineResourceMissing";
    if (/Could not start the local analysis engine/iu.test(error)) return "EngineProcessLaunchError";
    if (/local analysis engine failed/iu.test(error)) return "EngineProcessFailure";
    if (/analysis engine returned invalid JSON/iu.test(error)) return "EngineInvalidJson";
    return "NonErrorThrow";
  }
  if (!(error instanceof Error)) return "NonErrorThrow";
  if (error.name === "ZodError") return "EngineResponseValidationError";
  return SAFE_ERROR_KINDS.has(error.name) ? error.name : "Error";
}

function redactString(value: string): string {
  return (
    value
      // Technical errors can contain an absolute path whose later segments include
      // researcher-entered project or sample names. Redact the complete remainder
      // of that line instead of retaining a supposedly harmless path tail.
      .replace(/(?:[A-Za-z]:\\|\\\\)[^\r\n]*/g, "<path>")
      .replace(/\/(?:Users|home|private|var|tmp)\/[^\r\n]*/g, "<path>")
      .replace(/Bearer\s+[A-Za-z0-9._~+/-]+=*/gi, "Bearer <redacted>")
      .slice(0, 500)
  );
}

function isRecord(value: unknown): value is Readonly<Record<string, unknown>> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function isOneOf<const Values extends readonly string[]>(
  value: unknown,
  values: Values,
): value is Values[number] {
  return typeof value === "string" && values.includes(value as Values[number]);
}

function isDiagnosticRoute(value: unknown): value is AppRoute {
  return (
    value === "home" || (typeof value === "string" && primaryRoutes.some(({ id }) => id === value))
  );
}

function isOpaqueFingerprint(value: unknown): value is string {
  return typeof value === "string" && /^fnv1a32:[0-9a-f]{8}$/u.test(value);
}

function isSoftwareVersion(value: unknown): value is string {
  return (
    typeof value === "string" &&
    (value === "test" || /^(?:v?\d+)(?:\.\d+){0,3}(?:[A-Za-z0-9.+-]{0,24})$/u.test(value))
  );
}

function safePackageVersions(value: unknown): string | null {
  if (typeof value !== "string" || value.length > 500) return null;
  let parsed: unknown;
  try {
    parsed = JSON.parse(value);
  } catch {
    return null;
  }
  if (!isRecord(parsed)) return null;
  const packages = Object.fromEntries(
    DIAGNOSTIC_PACKAGE_NAMES.flatMap((name) => {
      const version = parsed[name];
      return isSoftwareVersion(version) ? [[name, version] as const] : [];
    }),
  );
  return JSON.stringify(packages);
}

/**
 * Manual diagnostic exports use a closed, event-specific schema. Unknown event
 * types are not recorded. Unknown keys are ignored, and a known event with an
 * invalid required value is rejected in full rather than retaining arbitrary
 * strings that could have originated in research data or file metadata.
 */
function safeDiagnosticEvent(
  type: unknown,
  detail: unknown,
): Omit<DiagnosticEvent, "occurredAt"> | null {
  if (typeof type !== "string" || !isRecord(detail)) return null;
  switch (type) {
    case "project_saved":
      return detail.state === "success" ? { type, detail: { state: "success" } } : null;
    case "project_save_failed":
      return isOneOf(detail.stage, DIAGNOSTIC_PROJECT_IO_STAGES)
        ? { type, detail: { stage: detail.stage } }
        : null;
    case "route_changed":
      return isDiagnosticRoute(detail.route) ? { type, detail: { route: detail.route } } : null;
    case "project_opened":
      return detail.state === "success" && isOneOf(detail.source, DIAGNOSTIC_PROJECT_OPEN_SOURCES)
        ? { type, detail: { state: "success", source: detail.source } }
        : null;
    case "graph_state_changed":
      return isOneOf(detail.graphType, DIAGNOSTIC_GRAPH_TYPES) &&
        isOpaqueFingerprint(detail.graphFingerprint)
        ? {
            type,
            detail: {
              graphType: detail.graphType,
              graphFingerprint: detail.graphFingerprint,
            },
          }
        : null;
    case "analysis_executed": {
      const packageVersions = safePackageVersions(detail.packageVersions);
      return isOneOf(detail.templateId, DIAGNOSTIC_ANALYSIS_TEMPLATES) &&
        isOneOf(detail.methodId, DIAGNOSTIC_STATISTICAL_METHODS) &&
        isOneOf(detail.protocolVersion, DIAGNOSTIC_PROTOCOL_VERSIONS) &&
        isSoftwareVersion(detail.engineVersion) &&
        packageVersions !== null &&
        isOpaqueFingerprint(detail.requestFingerprint)
        ? {
            type,
            detail: {
              templateId: detail.templateId,
              methodId: detail.methodId,
              protocolVersion: detail.protocolVersion,
              engineVersion: detail.engineVersion,
              packageVersions,
              requestFingerprint: detail.requestFingerprint,
            },
          }
        : null;
    }
    case "error":
      return isOneOf(detail.code, APP_ERROR_CODES) ? { type, detail: { code: detail.code } } : null;
    default:
      return null;
  }
}

export function diagnosticFingerprint(value: string): string {
  let hash = 0x811c9dc5;
  for (let index = 0; index < value.length; index += 1) {
    hash ^= value.charCodeAt(index);
    hash = Math.imul(hash, 0x01000193);
  }
  return `fnv1a32:${(hash >>> 0).toString(16).padStart(8, "0")}`;
}

export function recordDiagnosticEvent<Type extends DiagnosticEventType>(
  type: Type,
  detail: DiagnosticEventDetailMap[Type],
): void {
  const event = safeDiagnosticEvent(type, detail);
  if (!event) return;
  runtime.events = [
    ...runtime.events,
    { occurredAt: new Date().toISOString(), ...event } as DiagnosticEvent,
  ].slice(-MAX_EVENTS);
}

export function recordDiagnosticError(code: AppErrorCode, error?: unknown): void {
  runtime.lastErrorCode = code;
  recordUsageError(routeFromPath(window.location.pathname), code);
  recordDiagnosticEvent("error", { code });
  if (error !== undefined) {
    runtime.technicalErrors = [
      ...runtime.technicalErrors,
      // Error messages are deliberately excluded. They are unstructured and can
      // echo researcher-entered labels, values, paths, or secrets in forms that
      // deterministic redaction cannot safely recognize.
      { occurredAt: new Date().toISOString(), code, detail: safeErrorKind(error) },
    ].slice(-10);
  }
}

function projectSummary(project: ProjectState | null): Record<string, DiagnosticScalar> | null {
  if (!project) return null;
  const design = project.designRevisions.find(
    ({ id }) => id === project.activeDesignRevisionId,
  )?.design;
  return {
    stateSchemaVersion: project.schemaVersion,
    conditionCount: design?.conditions.length ?? 0,
    factorCount: design?.factors.length ?? 0,
    outcomeCount: design?.outcomes.length ?? 0,
    unitLevelCount: design?.unitLevels.length ?? 0,
    pairingKind: design?.pairing.kind ?? "unknown",
    rawRevisionCount: project.rawRevisions.length,
    analysisRunCount: project.analysisRuns.length,
    graphCount: project.graphs.length,
  };
}

function browserArchitecture(): string {
  if (nativeArchitecture) return nativeArchitecture;
  const match = navigator.userAgent.match(/\b(arm64|aarch64|x86_64|x64|win64|wow64)\b/i);
  return match?.[1]?.toLowerCase() ?? "unknown";
}

export async function initializeNativeDiagnosticEnvironment(): Promise<void> {
  if (!isTauri()) return;
  try {
    const architecture = await invoke<string>("native_architecture");
    if (/^(aarch64|arm64|x86_64|x86|i686)$/u.test(architecture)) {
      nativeArchitecture = architecture;
    }
  } catch {
    // Diagnostics remain available with a conservative browser-derived fallback.
  }
}

export type DiagnosticReport = Readonly<{
  schemaVersion: "1.0.0";
  generatedAt: string;
  privacy: Readonly<{
    rawMeasurementsIncluded: false;
    projectLabelsIncluded: false;
    automaticUpload: false;
    technicalDetailsIncluded: boolean;
    researcherEnteredDescriptionIncluded: boolean;
  }>;
  application: Readonly<{
    name: string;
    version: string;
    buildRevision: string;
    route: AppRoute;
    evaluationMode: boolean;
    featureFlags: Readonly<{
      contextualHelp: "local_deterministic";
      externalLlmHelp: false;
      remoteTelemetry: boolean;
    }>;
  }>;
  environment: Readonly<{
    platform: string;
    architecture: string;
    language: string;
    devicePixelRatio: number;
    screen: string;
    tauri: boolean;
  }>;
  project: Record<string, DiagnosticScalar> | null;
  userDescription?: string;
  lastErrorCode: AppErrorCode | null;
  recentEvents: readonly DiagnosticEvent[];
  technicalErrors?: readonly Readonly<{
    occurredAt: string;
    code: AppErrorCode;
    detail: string;
  }>[];
}>;

export function createDiagnosticReport(input: {
  route: AppRoute;
  project: ProjectState | null;
  includeTechnicalDetails?: boolean;
  userDescription?: string;
}): DiagnosticReport {
  const includeTechnicalDetails = input.includeTechnicalDetails === true;
  return {
    schemaVersion: "1.0.0",
    generatedAt: new Date().toISOString(),
    privacy: {
      rawMeasurementsIncluded: false,
      projectLabelsIncluded: false,
      automaticUpload: false,
      technicalDetailsIncluded: includeTechnicalDetails,
      researcherEnteredDescriptionIncluded: Boolean(input.userDescription?.trim()),
    },
    application: {
      name: PRODUCT_IDENTITY.developmentName,
      version: PRODUCT_IDENTITY.version,
      buildRevision: PRODUCT_IDENTITY.buildRevision,
      route: input.route,
      evaluationMode: evaluationMode.enabled,
      featureFlags: {
        contextualHelp: "local_deterministic",
        externalLlmHelp: false,
        remoteTelemetry: usageTelemetryUploadConfigured(),
      },
    },
    environment: {
      platform: navigator.platform || "unknown",
      architecture: browserArchitecture(),
      language: navigator.language,
      devicePixelRatio: window.devicePixelRatio,
      screen: `${window.screen.width}x${window.screen.height}`,
      tauri: isTauri(),
    },
    project: projectSummary(input.project),
    ...(input.userDescription?.trim()
      ? { userDescription: redactString(input.userDescription.trim()).slice(0, 1000) }
      : {}),
    lastErrorCode: runtime.lastErrorCode,
    recentEvents: [...runtime.events],
    ...(includeTechnicalDetails ? { technicalErrors: [...runtime.technicalErrors] } : {}),
  };
}

export function createPrivacyReducedDiagnostic(route: AppRoute): PrivacyReducedDiagnostic {
  const platform = navigator.platform.toLowerCase();
  return {
    schemaVersion: "1.0.0",
    application: {
      version: PRODUCT_IDENTITY.version,
      buildRevision: PRODUCT_IDENTITY.buildRevision,
    },
    environment: {
      platform: platform.includes("win")
        ? "windows"
        : platform.includes("mac")
          ? "macos"
          : platform.includes("linux")
            ? "linux"
            : "other",
      architecture: browserArchitecture(),
      tauri: isTauri(),
    },
    route,
    lastErrorCode: runtime.lastErrorCode,
    recentErrorCodes: runtime.events
      .filter(
        (event): event is Extract<DiagnosticEvent, { type: "error" }> => event.type === "error",
      )
      .map((event) => event.detail.code)
      .slice(-10),
    recentErrorClasses: runtime.technicalErrors.map(({ detail }) => detail).slice(-10),
  };
}

export function serializeDiagnosticReport(report: DiagnosticReport): string {
  return `${JSON.stringify(report, null, 2)}\n`;
}

export async function copyDiagnosticReport(report: DiagnosticReport): Promise<void> {
  await navigator.clipboard.writeText(serializeDiagnosticReport(report));
}

export async function saveDiagnosticReport(report: DiagnosticReport): Promise<boolean> {
  const content = serializeDiagnosticReport(report);
  const filename = `lsa-diagnostic-${report.generatedAt.replaceAll(":", "-")}.json`;
  if (isTauri()) {
    const target = await save({
      title: "診断情報を保存",
      defaultPath: filename,
      filters: [{ name: "Diagnostic report", extensions: ["json"] }],
    });
    if (!target) return false;
    await invoke("write_diagnostic_report", { target, content });
    return true;
  }
  const url = URL.createObjectURL(new Blob([content], { type: "application/json" }));
  const anchor = document.createElement("a");
  anchor.href = url;
  anchor.download = filename;
  anchor.click();
  URL.revokeObjectURL(url);
  return true;
}

export function resetDiagnosticsForTest(): void {
  nativeArchitecture = null;
  runtime.events = [];
  runtime.lastErrorCode = null;
  runtime.technicalErrors = [];
}

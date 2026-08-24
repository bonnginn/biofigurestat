import { invoke, isTauri } from "@tauri-apps/api/core";
import { save } from "@tauri-apps/plugin-dialog";
import type { ProjectState } from "@lsaa/project";

import type { AppRoute } from "./routes";
import type { AppErrorCode } from "./errorCatalog";
import { PRODUCT_IDENTITY } from "./productIdentity";
import { evaluationMode } from "./evaluationMode";

const MAX_EVENTS = 50;
const FORBIDDEN_KEY =
  /(raw|measurement|value|label|name|note|path|target|token|secret|key|gold|paper)/i;

export type DiagnosticScalar = string | number | boolean | null;
export type DiagnosticEvent = Readonly<{
  occurredAt: string;
  type: string;
  detail: Readonly<Record<string, DiagnosticScalar>>;
}>;

type DiagnosticRuntime = {
  events: DiagnosticEvent[];
  lastErrorCode: AppErrorCode | null;
  technicalErrors: Array<Readonly<{ occurredAt: string; code: AppErrorCode; detail: string }>>;
};

const runtime: DiagnosticRuntime = { events: [], lastErrorCode: null, technicalErrors: [] };

function redactString(value: string): string {
  return value
    .replace(/[A-Za-z]:\\Users\\[^\\\s]+/gi, "<user-home>")
    .replace(/\/Users\/[^/\s]+/g, "<user-home>")
    .replace(/Bearer\s+[A-Za-z0-9._~+/-]+=*/gi, "Bearer <redacted>")
    .slice(0, 500);
}

function safeDetail(
  detail: Readonly<Record<string, DiagnosticScalar>>,
): Readonly<Record<string, DiagnosticScalar>> {
  return Object.fromEntries(
    Object.entries(detail)
      .filter(([key]) => !FORBIDDEN_KEY.test(key))
      .map(([key, value]) => [key, typeof value === "string" ? redactString(value) : value]),
  );
}

export function diagnosticFingerprint(value: string): string {
  let hash = 0x811c9dc5;
  for (let index = 0; index < value.length; index += 1) {
    hash ^= value.charCodeAt(index);
    hash = Math.imul(hash, 0x01000193);
  }
  return `fnv1a32:${(hash >>> 0).toString(16).padStart(8, "0")}`;
}

export function recordDiagnosticEvent(
  type: string,
  detail: Readonly<Record<string, DiagnosticScalar>> = {},
): void {
  runtime.events = [
    ...runtime.events,
    { occurredAt: new Date().toISOString(), type, detail: safeDetail(detail) },
  ].slice(-MAX_EVENTS);
}

export function recordDiagnosticError(code: AppErrorCode, error?: unknown): void {
  runtime.lastErrorCode = code;
  recordDiagnosticEvent("error", { code });
  if (error !== undefined) {
    const detail = error instanceof Error ? `${error.name}: ${error.message}` : String(error);
    runtime.technicalErrors = [
      ...runtime.technicalErrors,
      { occurredAt: new Date().toISOString(), code, detail: redactString(detail) },
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
  const match = navigator.userAgent.match(/\b(arm64|aarch64|x86_64|x64|win64|wow64)\b/i);
  return match?.[1]?.toLowerCase() ?? "unknown";
}

export type DiagnosticReport = Readonly<{
  schemaVersion: "1.0.0";
  generatedAt: string;
  privacy: Readonly<{
    rawMeasurementsIncluded: false;
    projectLabelsIncluded: false;
    automaticUpload: false;
    technicalDetailsIncluded: boolean;
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
      remoteTelemetry: false;
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
        remoteTelemetry: false,
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
  runtime.events = [];
  runtime.lastErrorCode = null;
  runtime.technicalErrors = [];
}

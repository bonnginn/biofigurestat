import { useSyncExternalStore } from "react";

import { APP_ERROR_CODES, type AppErrorCode } from "./errorCatalog";
import { PRODUCT_IDENTITY } from "./productIdentity";
import { primaryRoutes, type AppRoute } from "./routes";

const CONSENT_STORAGE_KEY = "lsaa.usage-telemetry.consent.v1";
const CONSENT_NOTICE_STORAGE_KEY = "lsaa.usage-telemetry.consent-notice.v1";
const INSTALL_ID_STORAGE_KEY = "lsaa.usage-telemetry.install-id.v1";
const QUEUE_STORAGE_KEY = "lsaa.usage-telemetry.queue.v2";
const LEGACY_QUEUE_STORAGE_KEY = "lsaa.usage-telemetry.queue.v1";

// The persisted queue is deliberately small and short-lived. These limits apply to the
// serialized UTF-8 queue envelope, not just to the number of JavaScript objects.
export const USAGE_TELEMETRY_SCHEMA_VERSION = "2.0.0" as const;
export const USAGE_TELEMETRY_QUEUE_SCHEMA_VERSION = "2.0.0" as const;
export const USAGE_TELEMETRY_MAX_QUEUE_EVENTS = 120;
export const USAGE_TELEMETRY_MAX_QUEUE_AGE_MS = 30 * 24 * 60 * 60 * 1000;
export const USAGE_TELEMETRY_MAX_QUEUE_BYTES = 64 * 1024;
const MAX_AGGREGATE_COUNT = 10_000;

// A single upload attempt is finite. At most two delayed retries are made by one
// explicit upload() call; there is no retry timer or background loop of its own.
export const USAGE_TELEMETRY_UPLOAD_TIMEOUT_MS = 5_000;
export const USAGE_TELEMETRY_UPLOAD_RETRY_DELAYS_MS = [250, 1_000] as const;
const MAX_UPLOAD_ATTEMPTS = USAGE_TELEMETRY_UPLOAD_RETRY_DELAYS_MS.length + 1;

export const USAGE_TELEMETRY_CONSENT_NOTICE_VERSION = "local-only-2026-08-28";

export type UsageConsent = "undecided" | "opted_in" | "opted_out";

export const USAGE_ENTRY_FAMILIES = [
  "home",
  "experiment_interview",
  "graph_only",
  "survival",
  "ordered_curve",
  "heatmap",
  "specialized_analysis",
  "project_workspace",
] as const;
export type UsageEntryFamily = (typeof USAGE_ENTRY_FAMILIES)[number];

export const USAGE_MILESTONES = [
  "entry_started",
  "structure_ready",
  "data_entry_started",
  "graph_created",
  "statistics_requested",
  "statistics_completed",
  "project_saved",
  "project_opened",
  "safe_stop",
] as const;
export type UsageMilestone = (typeof USAGE_MILESTONES)[number];

export const USAGE_INTERACTION_CATEGORIES = [
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
] as const;
export type UsageInteractionCategory = (typeof USAGE_INTERACTION_CATEGORIES)[number];

export const USAGE_GRAPH_EDIT_CATEGORIES = [
  "graph_type",
  "series_selection",
  "axes",
  "layers",
  "appearance_layout",
  "statistics_annotation",
] as const;
export type UsageGraphEditCategory = (typeof USAGE_GRAPH_EDIT_CATEGORIES)[number];

export const USAGE_GRAPH_FAMILIES = [
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
] as const;
export type UsageGraphFamily = (typeof USAGE_GRAPH_FAMILIES)[number];

export const USAGE_GRAPH_CREATION_ORIGINS = [
  "recommended",
  "user_selected",
  "saved_default",
  "direct_table",
  "dedicated_entry",
] as const;
export type UsageGraphCreationOrigin = (typeof USAGE_GRAPH_CREATION_ORIGINS)[number];

export const USAGE_UNCERTAINTY_MODES = ["none", "sd", "sem", "ci", "other"] as const;
export type UsageUncertaintyMode = (typeof USAGE_UNCERTAINTY_MODES)[number];

type UsagePlatform = "windows" | "macos" | "linux" | "other";

type UsageApplication = Readonly<{
  version: string;
  buildRevision: string;
  platform: UsagePlatform;
}>;

type UsageEvent =
  | Readonly<{
      kind: "route_view";
      occurredAt: string;
      route: AppRoute;
      entryFamily: UsageEntryFamily;
    }>
  | Readonly<{
      kind: "task_milestone";
      occurredAt: string;
      route: AppRoute;
      workflowFamily: UsageEntryFamily;
      milestone: UsageMilestone;
    }>
  | Readonly<{
      kind: "error";
      occurredAt: string;
      route: AppRoute;
      workflowFamily: UsageEntryFamily;
      code: AppErrorCode;
    }>
  | Readonly<{
      kind: "interaction_counts";
      occurredAt: string;
      route: AppRoute;
      workflowFamily: UsageEntryFamily;
      category: UsageInteractionCategory;
      clicks: number;
      changes: number;
    }>
  | Readonly<{
      kind: "graph_edit";
      occurredAt: string;
      route: AppRoute;
      workflowFamily: UsageEntryFamily;
      category: UsageGraphEditCategory;
      count: number;
    }>
  | Readonly<{
      kind: "graph_configuration";
      occurredAt: string;
      route: AppRoute;
      workflowFamily: UsageEntryFamily;
      graphFamily: UsageGraphFamily;
      origin: UsageGraphCreationOrigin;
      uncertainty: UsageUncertaintyMode;
      rawPointsVisible: boolean;
      summaryVisible: boolean;
    }>;

export type UsageTelemetryBatch = Readonly<{
  schemaVersion: typeof USAGE_TELEMETRY_SCHEMA_VERSION;
  consentNoticeVersion: typeof USAGE_TELEMETRY_CONSENT_NOTICE_VERSION;
  installId: string;
  // These fields describe the sender. Each event also carries its originating
  // session/application so a relaunch cannot relabel queued events.
  sessionId: string;
  application: UsageApplication;
  events: readonly UsageAttributedEvent[];
}>;

export type LocalUsageTelemetryReport = Readonly<{
  schemaVersion: typeof USAGE_TELEMETRY_SCHEMA_VERSION;
  consentNoticeVersion: typeof USAGE_TELEMETRY_CONSENT_NOTICE_VERSION;
  generatedAt: string;
  privacy: Readonly<{
    measurementsIncluded: false;
    researcherTextIncluded: false;
    fileOrClipboardContentIncluded: false;
    projectIdentifiersIncluded: false;
  }>;
  uploadEndpointConfigured: boolean;
  installId: string | null;
  sessionId: string | null;
  application: UsageApplication;
  eventCount: number;
  events: readonly UsageAttributedEvent[];
}>;

type UsageAttributedEvent = UsageEvent & Readonly<{
  sessionId: string;
  application: UsageApplication;
}>;

type UsageQueueStorage = Readonly<{
  schemaVersion: typeof USAGE_TELEMETRY_QUEUE_SCHEMA_VERSION;
  events: readonly UsageAttributedEvent[];
}>;

type StorageLike = Pick<Storage, "getItem" | "setItem" | "removeItem">;
type FetchLike = (input: RequestInfo | URL, init?: RequestInit) => Promise<Response>;

type UsageTelemetryOptions = Readonly<{
  storage: StorageLike | null;
  fetcher: FetchLike;
  endpoint?: string;
  now?: () => Date;
  randomId?: () => string;
  platform?: UsagePlatform;
  sleep?: (milliseconds: number) => Promise<void>;
  uploadTimeoutMs?: number;
}>;

type InteractionAggregate = {
  route: AppRoute;
  workflowFamily: UsageEntryFamily;
  category: UsageInteractionCategory;
  clicks: number;
  changes: number;
};

const ALLOWED_ROUTES = new Set<AppRoute>(["home", ...primaryRoutes.map(({ id }) => id)]);
const ALLOWED_ERRORS = new Set<AppErrorCode>(APP_ERROR_CODES);
const ALLOWED_ENTRY_FAMILIES = new Set<UsageEntryFamily>(USAGE_ENTRY_FAMILIES);
const ALLOWED_MILESTONES = new Set<UsageMilestone>(USAGE_MILESTONES);
const ALLOWED_INTERACTIONS = new Set<UsageInteractionCategory>(USAGE_INTERACTION_CATEGORIES);
const ALLOWED_GRAPH_EDITS = new Set<UsageGraphEditCategory>(USAGE_GRAPH_EDIT_CATEGORIES);
const ALLOWED_GRAPH_FAMILIES = new Set<UsageGraphFamily>(USAGE_GRAPH_FAMILIES);
const ALLOWED_GRAPH_ORIGINS = new Set<UsageGraphCreationOrigin>(USAGE_GRAPH_CREATION_ORIGINS);
const ALLOWED_UNCERTAINTY_MODES = new Set<UsageUncertaintyMode>(USAGE_UNCERTAINTY_MODES);

function isExactObject(value: unknown, keys: readonly string[]): value is Record<string, unknown> {
  if (!value || typeof value !== "object" || Array.isArray(value)) return false;
  const actual = Object.keys(value as object).sort();
  const expected = [...keys].sort();
  return actual.length === expected.length && actual.every((key, index) => key === expected[index]);
}

function isIsoDate(value: unknown): value is string {
  if (typeof value !== "string" || !/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/.test(value)) {
    return false;
  }
  const parsed = new Date(value);
  return !Number.isNaN(parsed.getTime()) && parsed.toISOString() === value;
}

function isUuid(value: unknown): value is string {
  return (
    typeof value === "string" &&
    /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(value)
  );
}

function isBoundedMetadataText(value: unknown): value is string {
  if (typeof value !== "string" || value.length === 0 || value.length > 128) return false;
  return !Array.from(value).some((character) => {
    const code = character.charCodeAt(0);
    return code < 32 || code === 127;
  });
}

function isUsageApplication(value: unknown): value is UsageApplication {
  if (!isExactObject(value, ["version", "buildRevision", "platform"])) return false;
  const candidate = value as Record<string, unknown>;
  return (
    isBoundedMetadataText(candidate.version) &&
    isBoundedMetadataText(candidate.buildRevision) &&
    (candidate.platform === "windows" ||
      candidate.platform === "macos" ||
      candidate.platform === "linux" ||
      candidate.platform === "other")
  );
}

function isBoundedCount(value: unknown): value is number {
  return Number.isInteger(value) && Number(value) >= 0 && Number(value) <= MAX_AGGREGATE_COUNT;
}

function isUsageEvent(value: unknown): value is UsageEvent {
  if (!value || typeof value !== "object") return false;
  const candidate = value as Record<string, unknown>;
  if (!ALLOWED_ROUTES.has(candidate.route as AppRoute) || !isIsoDate(candidate.occurredAt)) {
    return false;
  }
  switch (candidate.kind) {
    case "route_view":
      return (
        isExactObject(candidate, ["kind", "occurredAt", "route", "entryFamily"]) &&
        ALLOWED_ENTRY_FAMILIES.has(candidate.entryFamily as UsageEntryFamily)
      );
    case "task_milestone":
      return (
        isExactObject(candidate, ["kind", "occurredAt", "route", "workflowFamily", "milestone"]) &&
        ALLOWED_ENTRY_FAMILIES.has(candidate.workflowFamily as UsageEntryFamily) &&
        ALLOWED_MILESTONES.has(candidate.milestone as UsageMilestone)
      );
    case "error":
      return (
        isExactObject(candidate, ["kind", "occurredAt", "route", "workflowFamily", "code"]) &&
        ALLOWED_ENTRY_FAMILIES.has(candidate.workflowFamily as UsageEntryFamily) &&
        ALLOWED_ERRORS.has(candidate.code as AppErrorCode)
      );
    case "interaction_counts":
      return (
        isExactObject(candidate, [
          "kind",
          "occurredAt",
          "route",
          "workflowFamily",
          "category",
          "clicks",
          "changes",
        ]) &&
        ALLOWED_ENTRY_FAMILIES.has(candidate.workflowFamily as UsageEntryFamily) &&
        ALLOWED_INTERACTIONS.has(candidate.category as UsageInteractionCategory) &&
        isBoundedCount(candidate.clicks) &&
        isBoundedCount(candidate.changes)
      );
    case "graph_edit":
      return (
        isExactObject(candidate, [
          "kind",
          "occurredAt",
          "route",
          "workflowFamily",
          "category",
          "count",
        ]) &&
        ALLOWED_ENTRY_FAMILIES.has(candidate.workflowFamily as UsageEntryFamily) &&
        ALLOWED_GRAPH_EDITS.has(candidate.category as UsageGraphEditCategory) &&
        isBoundedCount(candidate.count)
      );
    case "graph_configuration":
      return (
        isExactObject(candidate, [
          "kind",
          "occurredAt",
          "route",
          "workflowFamily",
          "graphFamily",
          "origin",
          "uncertainty",
          "rawPointsVisible",
          "summaryVisible",
        ]) &&
        ALLOWED_ENTRY_FAMILIES.has(candidate.workflowFamily as UsageEntryFamily) &&
        ALLOWED_GRAPH_FAMILIES.has(candidate.graphFamily as UsageGraphFamily) &&
        ALLOWED_GRAPH_ORIGINS.has(candidate.origin as UsageGraphCreationOrigin) &&
        ALLOWED_UNCERTAINTY_MODES.has(candidate.uncertainty as UsageUncertaintyMode) &&
        typeof candidate.rawPointsVisible === "boolean" &&
        typeof candidate.summaryVisible === "boolean"
      );
    default:
      return false;
  }
}

function isUsageAttributedEvent(value: unknown): value is UsageAttributedEvent {
  if (!value || typeof value !== "object" || Array.isArray(value)) return false;
  const candidate = value as Record<string, unknown>;
  if (!isUuid(candidate.sessionId) || !isUsageApplication(candidate.application)) return false;
  const { sessionId: _sessionId, application: _application, ...event } = candidate;
  return isUsageEvent(event);
}

function isUsageQueueStorage(value: unknown): value is UsageQueueStorage {
  if (!isExactObject(value, ["schemaVersion", "events"])) return false;
  const candidate = value as Record<string, unknown>;
  return (
    candidate.schemaVersion === USAGE_TELEMETRY_QUEUE_SCHEMA_VERSION &&
    Array.isArray(candidate.events)
  );
}

function utf8ByteLength(value: string): number {
  try {
    return new TextEncoder().encode(value).byteLength;
  } catch {
    // TextEncoder is available in supported browsers. Keep the fallback conservative
    // for restricted test/webview environments so queue bounds still apply.
    return Array.from(value).reduce((bytes, character) => {
      const codePoint = character.codePointAt(0) ?? 0;
      if (codePoint <= 0x7f) return bytes + 1;
      if (codePoint <= 0x7ff) return bytes + 2;
      if (codePoint <= 0xffff) return bytes + 3;
      return bytes + 4;
    }, 0);
  }
}

function isFreshQueueEvent(event: UsageAttributedEvent, nowMs: number): boolean {
  const occurredAtMs = Date.parse(event.occurredAt);
  if (!Number.isFinite(occurredAtMs) || !Number.isFinite(nowMs)) return false;
  const ageMs = nowMs - occurredAtMs;
  return ageMs >= 0 && ageMs <= USAGE_TELEMETRY_MAX_QUEUE_AGE_MS;
}

function validHttpsEndpoint(value: string | undefined): string | null {
  if (!value?.trim()) return null;
  try {
    const endpoint = new URL(value.trim());
    if (
      endpoint.protocol !== "https:" ||
      endpoint.username ||
      endpoint.password ||
      endpoint.hash
    ) {
      return null;
    }
    return endpoint.toString();
  } catch {
    return null;
  }
}

/**
 * Environment configuration is allowed to activate remote collection only when
 * the compiled consent notice explicitly describes a remote-collection policy.
 * This prevents an endpoint-only build change from uploading a queue collected
 * under the current local-only notice.
 */
export function resolveConfiguredUsageTelemetryEndpoint(
  value: string | undefined,
  consentNoticeVersion: string = USAGE_TELEMETRY_CONSENT_NOTICE_VERSION,
): string | null {
  if (!consentNoticeVersion.startsWith("remote-")) return null;
  return validHttpsEndpoint(value);
}

function defaultRandomId(): string {
  try {
    const generated = globalThis.crypto?.randomUUID?.();
    if (isUuid(generated)) return generated.toLowerCase();
  } catch {
    // Some embedded webviews expose crypto but throw from randomUUID().
  }
  try {
    const time = Date.now().toString(16).padStart(12, "0");
    const random = Array.from({ length: 20 }, () => Math.floor(Math.random() * 16).toString(16)).join("");
    const hex = `${time}${random}`.slice(0, 32).padEnd(32, "0").split("");
    hex[12] = "4";
    hex[16] = ((Number.parseInt(hex[16] ?? "8", 16) & 0x3) | 0x8).toString(16);
    return `${hex.slice(0, 8).join("")}-${hex.slice(8, 12).join("")}-${hex.slice(12, 16).join("")}-${hex.slice(16, 20).join("")}-${hex.slice(20).join("")}`;
  } catch {
    // A valid constant is the last-resort availability guard. It is not used as
    // a security token; telemetry must never prevent the application from opening.
    return "00000000-0000-4000-8000-000000000000";
  }
}

function currentPlatform(): UsagePlatform {
  const platform = navigator.platform.toLowerCase();
  if (platform.includes("win")) return "windows";
  if (platform.includes("mac")) return "macos";
  if (platform.includes("linux")) return "linux";
  return "other";
}

function safeStorage(): StorageLike | null {
  try {
    return globalThis.localStorage ?? null;
  } catch {
    return null;
  }
}

export function browserRequestsNoTracking(): boolean {
  const privacyNavigator = navigator as Navigator & { globalPrivacyControl?: boolean };
  return navigator.doNotTrack === "1" || privacyNavigator.globalPrivacyControl === true;
}

export function entryFamilyForRoute(route: AppRoute): UsageEntryFamily {
  if (route === "home") return "home";
  if (route === "new-experiment") return "experiment_interview";
  if (route === "survival") return "survival";
  if (route === "nonlinear-fit") return "ordered_curve";
  if (route === "heatmap") return "heatmap";
  if (route === "open-project" || route === "favorites" || route === "recent") {
    return "project_workspace";
  }
  return "specialized_analysis";
}

export class UsageTelemetryService {
  readonly endpoint: string | null;
  private readonly storage: StorageLike | null;
  private readonly fetcher: FetchLike;
  private readonly now: () => Date;
  private readonly randomId: () => string;
  private readonly platform: UsagePlatform;
  private readonly application: UsageApplication;
  private readonly sessionId: string;
  private readonly sleep: (milliseconds: number) => Promise<void>;
  private readonly uploadTimeoutMs: number;
  private consent: UsageConsent;
  private queue: UsageAttributedEvent[] = [];
  private aggregates = new Map<string, InteractionAggregate>();
  private graphAggregates = new Map<
    string,
    {
      route: AppRoute;
      workflowFamily: UsageEntryFamily;
      category: UsageGraphEditCategory;
      count: number;
    }
  >();
  private workflowFamilies = new Map<AppRoute, UsageEntryFamily>();
  private listeners = new Set<() => void>();
  private uploadInFlight = false;

  constructor(options: UsageTelemetryOptions) {
    this.storage = options.storage;
    this.fetcher = options.fetcher;
    this.endpoint = validHttpsEndpoint(options.endpoint);
    this.now = options.now ?? (() => new Date());
    this.randomId = options.randomId ?? defaultRandomId;
    this.platform = options.platform ?? currentPlatform();
    this.application = {
      version: PRODUCT_IDENTITY.version,
      buildRevision: PRODUCT_IDENTITY.buildRevision,
      platform: this.platform,
    };
    this.sessionId = this.createIdentifier();
    this.sleep = options.sleep ?? ((milliseconds) => new Promise((resolve) => setTimeout(resolve, milliseconds)));
    this.uploadTimeoutMs =
      Number.isFinite(options.uploadTimeoutMs) && (options.uploadTimeoutMs ?? 0) > 0
        ? options.uploadTimeoutMs!
        : USAGE_TELEMETRY_UPLOAD_TIMEOUT_MS;
    const storedConsent = this.readStorage(CONSENT_STORAGE_KEY);
    const storedNoticeVersion = this.readStorage(CONSENT_NOTICE_STORAGE_KEY);
    this.consent =
      storedConsent === "opted_out"
        ? "opted_out"
        : storedConsent === "opted_in" &&
            storedNoticeVersion === USAGE_TELEMETRY_CONSENT_NOTICE_VERSION
          ? "opted_in"
          : "undecided";
    if (this.consent !== "opted_in") {
      this.removeStorage(QUEUE_STORAGE_KEY);
      this.removeStorage(LEGACY_QUEUE_STORAGE_KEY);
      this.removeStorage(INSTALL_ID_STORAGE_KEY);
      if (storedConsent !== "opted_out") {
        this.removeStorage(CONSENT_STORAGE_KEY);
        this.removeStorage(CONSENT_NOTICE_STORAGE_KEY);
      }
    }
    if (this.consent === "opted_in") this.queue = this.readQueue();
  }

  getConsent = (): UsageConsent => this.consent;

  subscribe = (listener: () => void): (() => void) => {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  };

  setConsent(next: Exclude<UsageConsent, "undecided">): void {
    this.consent = next;
    this.writeStorage(CONSENT_STORAGE_KEY, next);
    this.writeStorage(CONSENT_NOTICE_STORAGE_KEY, USAGE_TELEMETRY_CONSENT_NOTICE_VERSION);
    if (next === "opted_out") {
      this.aggregates.clear();
      this.graphAggregates.clear();
      this.workflowFamilies.clear();
      this.queue = [];
      this.removeStorage(QUEUE_STORAGE_KEY);
      this.removeStorage(LEGACY_QUEUE_STORAGE_KEY);
      this.removeStorage(INSTALL_ID_STORAGE_KEY);
    } else {
      this.queue = this.readQueue();
    }
    this.listeners.forEach((listener) => listener());
  }

  recordRoute(route: AppRoute): void {
    this.recordEntry(route, entryFamilyForRoute(route));
  }

  recordEntry(route: AppRoute, entryFamily: UsageEntryFamily): void {
    if (!this.canRecord() || !ALLOWED_ROUTES.has(route) || !ALLOWED_ENTRY_FAMILIES.has(entryFamily))
      return;
    this.workflowFamilies.set(route, entryFamily);
    this.enqueue({
      kind: "route_view",
      occurredAt: this.now().toISOString(),
      route,
      entryFamily,
    });
  }

  recordMilestone(route: AppRoute, milestone: UsageMilestone): void {
    if (!this.canRecord() || !ALLOWED_ROUTES.has(route) || !ALLOWED_MILESTONES.has(milestone))
      return;
    this.enqueue({
      kind: "task_milestone",
      occurredAt: this.now().toISOString(),
      route,
      workflowFamily: this.workflowFamilyFor(route),
      milestone,
    });
  }

  recordError(route: AppRoute, code: AppErrorCode): void {
    if (!this.canRecord() || !ALLOWED_ROUTES.has(route) || !ALLOWED_ERRORS.has(code)) return;
    this.enqueue({
      kind: "error",
      occurredAt: this.now().toISOString(),
      route,
      workflowFamily: this.workflowFamilyFor(route),
      code,
    });
  }

  recordInteraction(
    route: AppRoute,
    interaction: "click" | "change",
    category: UsageInteractionCategory,
  ): void {
    if (!this.canRecord() || !ALLOWED_ROUTES.has(route) || !ALLOWED_INTERACTIONS.has(category))
      return;
    const workflowFamily = this.workflowFamilyFor(route);
    const key = `${route}:${workflowFamily}:${category}`;
    const current = this.aggregates.get(key) ?? {
      route,
      workflowFamily,
      category,
      clicks: 0,
      changes: 0,
    };
    current[interaction === "click" ? "clicks" : "changes"] = Math.min(
      MAX_AGGREGATE_COUNT,
      current[interaction === "click" ? "clicks" : "changes"] + 1,
    );
    this.aggregates.set(key, current);
  }

  recordGraphEdit(route: AppRoute, category: UsageGraphEditCategory): void {
    if (!this.canRecord() || !ALLOWED_ROUTES.has(route) || !ALLOWED_GRAPH_EDITS.has(category))
      return;
    const workflowFamily = this.workflowFamilyFor(route);
    const key = `${route}:${workflowFamily}:${category}`;
    const current = this.graphAggregates.get(key) ?? {
      route,
      workflowFamily,
      category,
      count: 0,
    };
    current.count = Math.min(MAX_AGGREGATE_COUNT, current.count + 1);
    this.graphAggregates.set(key, current);
  }

  recordGraphConfiguration(
    route: AppRoute,
    configuration: Readonly<{
      graphFamily: UsageGraphFamily;
      origin: UsageGraphCreationOrigin;
      uncertainty: UsageUncertaintyMode;
      rawPointsVisible: boolean;
      summaryVisible: boolean;
    }>,
  ): void {
    if (
      !this.canRecord() ||
      !ALLOWED_ROUTES.has(route) ||
      !ALLOWED_GRAPH_FAMILIES.has(configuration.graphFamily) ||
      !ALLOWED_GRAPH_ORIGINS.has(configuration.origin) ||
      !ALLOWED_UNCERTAINTY_MODES.has(configuration.uncertainty)
    )
      return;
    this.enqueue({
      kind: "graph_configuration",
      occurredAt: this.now().toISOString(),
      route,
      workflowFamily: this.workflowFamilyFor(route),
      ...configuration,
    });
  }

  flushAggregates(): void {
    if (!this.canRecord()) return;
    const occurredAt = this.now().toISOString();
    for (const aggregate of this.aggregates.values()) {
      this.enqueue({ kind: "interaction_counts", occurredAt, ...aggregate });
    }
    for (const aggregate of this.graphAggregates.values()) {
      this.enqueue({ kind: "graph_edit", occurredAt, ...aggregate });
    }
    this.aggregates.clear();
    this.graphAggregates.clear();
  }

  async upload(): Promise<boolean> {
    if (!this.canRecord() || !this.endpoint || this.uploadInFlight) return false;
    this.flushAggregates();
    this.queue = this.boundQueue(this.queue);
    this.persistQueue();
    if (this.queue.length === 0) return true;
    this.uploadInFlight = true;
    const sent = [...this.queue];
    try {
      for (let attempt = 0; attempt < MAX_UPLOAD_ATTEMPTS; attempt += 1) {
        let response: Response;
        try {
          response = await this.fetchWithTimeout(sent);
        } catch {
          if (attempt >= MAX_UPLOAD_ATTEMPTS - 1) return false;
          await this.sleep(USAGE_TELEMETRY_UPLOAD_RETRY_DELAYS_MS[attempt] ?? 0);
          continue;
        }
        if (response.ok) break;
        const retryable =
          response.status === 408 || response.status === 429 || response.status >= 500;
        if (!retryable || attempt >= MAX_UPLOAD_ATTEMPTS - 1) return false;
        await this.sleep(USAGE_TELEMETRY_UPLOAD_RETRY_DELAYS_MS[attempt] ?? 0);
      }
      // Recording continues while a request is in flight. Queue bounding may
      // also drop an old prefix during that time, so removing by prefix length
      // could delete newly recorded events. The queued event objects remain
      // stable within this service instance; remove only the exact batch that
      // was acknowledged.
      const acknowledged = new Set<UsageAttributedEvent>(sent);
      this.queue = this.queue.filter((event) => !acknowledged.has(event));
      this.persistQueue();
      return true;
    } catch {
      return false;
    } finally {
      this.uploadInFlight = false;
    }
  }

  queuedEventsForTest(): readonly UsageAttributedEvent[] {
    this.flushAggregates();
    return [...this.queue];
  }

  localReport(): LocalUsageTelemetryReport {
    this.flushAggregates();
    return {
      schemaVersion: USAGE_TELEMETRY_SCHEMA_VERSION,
      consentNoticeVersion: USAGE_TELEMETRY_CONSENT_NOTICE_VERSION,
      generatedAt: this.now().toISOString(),
      privacy: {
        measurementsIncluded: false,
        researcherTextIncluded: false,
        fileOrClipboardContentIncluded: false,
        projectIdentifiersIncluded: false,
      },
      uploadEndpointConfigured: this.endpoint !== null,
      installId: this.canRecord() ? this.installId() : null,
      sessionId: this.canRecord() ? this.sessionId : null,
      application: this.application,
      eventCount: this.queue.length,
      events: [...this.queue],
    };
  }

  resetForTest(): void {
    this.consent = "undecided";
    this.queue = [];
    this.aggregates.clear();
    this.graphAggregates.clear();
    this.workflowFamilies.clear();
    this.removeStorage(CONSENT_STORAGE_KEY);
    this.removeStorage(CONSENT_NOTICE_STORAGE_KEY);
    this.removeStorage(QUEUE_STORAGE_KEY);
    this.removeStorage(LEGACY_QUEUE_STORAGE_KEY);
    this.removeStorage(INSTALL_ID_STORAGE_KEY);
    this.listeners.forEach((listener) => listener());
  }

  private canRecord(): boolean {
    return this.consent === "opted_in";
  }

  private enqueue(event: UsageEvent): void {
    if (!isUsageEvent(event)) return;
    const attributedEvent: UsageAttributedEvent = {
      ...event,
      sessionId: this.sessionId,
      application: this.application,
    };
    if (!isUsageAttributedEvent(attributedEvent)) return;
    this.queue = this.boundQueue([...this.queue, attributedEvent]);
    this.persistQueue();
  }

  private createBatch(events: readonly UsageAttributedEvent[]): UsageTelemetryBatch {
    return {
      schemaVersion: USAGE_TELEMETRY_SCHEMA_VERSION,
      consentNoticeVersion: USAGE_TELEMETRY_CONSENT_NOTICE_VERSION,
      installId: this.installId(),
      sessionId: this.sessionId,
      application: this.application,
      events,
    };
  }

  private installId(): string {
    const stored = this.readStorage(INSTALL_ID_STORAGE_KEY);
    if (isUuid(stored)) return stored.toLowerCase();
    if (stored) this.removeStorage(INSTALL_ID_STORAGE_KEY);
    const generated = this.createIdentifier();
    this.writeStorage(INSTALL_ID_STORAGE_KEY, generated);
    return generated;
  }

  private createIdentifier(): string {
    try {
      const generated = this.randomId();
      if (isUuid(generated)) return generated.toLowerCase();
    } catch {
      // Fall through to the platform generator. Telemetry must never block the app.
    }
    return defaultRandomId();
  }

  private workflowFamilyFor(route: AppRoute): UsageEntryFamily {
    return this.workflowFamilies.get(route) ?? entryFamilyForRoute(route);
  }

  private readQueue(): UsageAttributedEvent[] {
    const stored = this.readStorage(QUEUE_STORAGE_KEY);
    if (!stored) {
      // The v1 key held un-attributed event objects. It cannot be migrated without
      // inventing their source session/application, so remove it rather than relabel it.
      this.removeStorage(LEGACY_QUEUE_STORAGE_KEY);
      return [];
    }
    try {
      const parsed = JSON.parse(stored) as unknown;
      if (!isUsageQueueStorage(parsed)) {
        this.removeStorage(QUEUE_STORAGE_KEY);
        this.removeStorage(LEGACY_QUEUE_STORAGE_KEY);
        return [];
      }
      const valid = parsed.events.filter(
        (event): event is UsageAttributedEvent =>
          isUsageAttributedEvent(event) && isFreshQueueEvent(event, this.nowMillis()),
      );
      const bounded = this.boundQueue(valid);
      const normalized = this.serializeQueue(bounded);
      if (normalized !== stored) {
        if (bounded.length === 0) this.removeStorage(QUEUE_STORAGE_KEY);
        else this.writeStorage(QUEUE_STORAGE_KEY, normalized);
      }
      this.removeStorage(LEGACY_QUEUE_STORAGE_KEY);
      return bounded;
    } catch {
      this.removeStorage(QUEUE_STORAGE_KEY);
      this.removeStorage(LEGACY_QUEUE_STORAGE_KEY);
      return [];
    }
  }

  private persistQueue(): void {
    if (!this.canRecord()) return;
    const bounded = this.boundQueue(this.queue);
    this.queue = bounded;
    if (bounded.length === 0) {
      this.removeStorage(QUEUE_STORAGE_KEY);
      return;
    }
    this.writeStorage(QUEUE_STORAGE_KEY, this.serializeQueue(bounded));
  }

  private nowMillis(): number {
    try {
      const timestamp = this.now().getTime();
      if (Number.isFinite(timestamp)) return timestamp;
    } catch {
      // Use the platform clock if a test/webview clock is unavailable.
    }
    return Date.now();
  }

  private serializeQueue(events: readonly UsageAttributedEvent[]): string {
    const queue: UsageQueueStorage = {
      schemaVersion: USAGE_TELEMETRY_QUEUE_SCHEMA_VERSION,
      events,
    };
    return JSON.stringify(queue);
  }

  private boundQueue(events: readonly UsageAttributedEvent[]): UsageAttributedEvent[] {
    const nowMs = this.nowMillis();
    let bounded = events.filter(
      (event) => isUsageAttributedEvent(event) && isFreshQueueEvent(event, nowMs),
    );
    bounded = bounded.slice(-USAGE_TELEMETRY_MAX_QUEUE_EVENTS);
    while (
      bounded.length > 0 &&
      utf8ByteLength(this.serializeQueue(bounded)) > USAGE_TELEMETRY_MAX_QUEUE_BYTES
    ) {
      bounded = bounded.slice(1);
    }
    return bounded;
  }

  private async fetchWithTimeout(events: readonly UsageAttributedEvent[]): Promise<Response> {
    const controller = typeof AbortController === "undefined" ? null : new AbortController();
    let timeoutId: ReturnType<typeof setTimeout> | undefined;
    const timeout = new Promise<never>((_, reject) => {
      timeoutId = setTimeout(() => {
        controller?.abort();
        reject(new Error("usage telemetry upload timed out"));
      }, this.uploadTimeoutMs);
    });
    let request: Promise<Response>;
    try {
      request = this.fetcher(this.endpoint!, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(this.createBatch(events)),
        keepalive: true,
        ...(controller ? { signal: controller.signal } : {}),
      });
    } catch (error) {
      if (timeoutId !== undefined) clearTimeout(timeoutId);
      throw error;
    }
    // Promise.race does not observe the losing request. Attach a rejection handler
    // so a late webview rejection cannot become an unhandled application error.
    void request.catch(() => undefined);
    try {
      return await Promise.race([request, timeout]);
    } finally {
      if (timeoutId !== undefined) clearTimeout(timeoutId);
    }
  }

  private readStorage(key: string): string | null {
    try {
      return this.storage?.getItem(key) ?? null;
    } catch {
      return null;
    }
  }

  private writeStorage(key: string, value: string): void {
    try {
      this.storage?.setItem(key, value);
    } catch {
      // Privacy-safe usage telemetry must never block the application.
    }
  }

  private removeStorage(key: string): void {
    try {
      this.storage?.removeItem(key);
    } catch {
      // Privacy-safe usage telemetry must never block the application.
    }
  }
}

const usageTelemetry = new UsageTelemetryService({
  storage: safeStorage(),
  fetcher: (...args) => fetch(...args),
  endpoint:
    resolveConfiguredUsageTelemetryEndpoint(import.meta.env.VITE_USAGE_TELEMETRY_ENDPOINT) ??
    undefined,
});

export function useUsageConsent(): UsageConsent {
  return useSyncExternalStore(
    usageTelemetry.subscribe,
    usageTelemetry.getConsent,
    usageTelemetry.getConsent,
  );
}

export function setUsageConsent(consent: Exclude<UsageConsent, "undecided">): void {
  usageTelemetry.setConsent(consent);
}

export function recordUsageRoute(route: AppRoute): void {
  usageTelemetry.recordRoute(route);
}

export function recordUsageEntry(route: AppRoute, entryFamily: UsageEntryFamily): void {
  usageTelemetry.recordEntry(route, entryFamily);
}

export function recordUsageMilestone(route: AppRoute, milestone: UsageMilestone): void {
  usageTelemetry.recordMilestone(route, milestone);
}

export function recordUsageError(route: AppRoute, code: AppErrorCode): void {
  usageTelemetry.recordError(route, code);
}

export function recordUsageInteraction(
  route: AppRoute,
  interaction: "click" | "change",
  category: UsageInteractionCategory,
): void {
  usageTelemetry.recordInteraction(route, interaction, category);
}

export function recordUsageGraphEdit(route: AppRoute, category: UsageGraphEditCategory): void {
  usageTelemetry.recordGraphEdit(route, category);
}

export function recordUsageGraphConfiguration(
  route: AppRoute,
  configuration: Readonly<{
    graphFamily: UsageGraphFamily;
    origin: UsageGraphCreationOrigin;
    uncertainty: UsageUncertaintyMode;
    rawPointsVisible: boolean;
    summaryVisible: boolean;
  }>,
): void {
  usageTelemetry.recordGraphConfiguration(route, configuration);
}

export function flushUsageTelemetry(): void {
  usageTelemetry.flushAggregates();
  void usageTelemetry.upload();
}

export function usageTelemetryUploadConfigured(): boolean {
  return usageTelemetry.endpoint !== null;
}

export function usageTelemetryEventCount(): number {
  return usageTelemetry.localReport().eventCount;
}

export function serializeLocalUsageTelemetryReport(): string {
  return `${JSON.stringify(usageTelemetry.localReport(), null, 2)}\n`;
}

export async function copyLocalUsageTelemetryReport(): Promise<void> {
  await navigator.clipboard.writeText(serializeLocalUsageTelemetryReport());
}

export function resetUsageTelemetryForTest(): void {
  usageTelemetry.resetForTest();
}

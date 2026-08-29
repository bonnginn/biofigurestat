import { beforeEach, describe, expect, it, vi } from "vitest";

import {
  USAGE_TELEMETRY_CONSENT_NOTICE_VERSION,
  USAGE_TELEMETRY_MAX_QUEUE_AGE_MS,
  USAGE_TELEMETRY_MAX_QUEUE_BYTES,
  USAGE_TELEMETRY_MAX_QUEUE_EVENTS,
  USAGE_TELEMETRY_QUEUE_SCHEMA_VERSION,
  USAGE_TELEMETRY_SCHEMA_VERSION,
  UsageTelemetryService,
  resolveConfiguredUsageTelemetryEndpoint,
} from "./usageTelemetry";

class MemoryStorage implements Storage {
  private values = new Map<string, string>();
  get length() {
    return this.values.size;
  }
  clear() {
    this.values.clear();
  }
  getItem(key: string) {
    return this.values.get(key) ?? null;
  }
  key(index: number) {
    return [...this.values.keys()][index] ?? null;
  }
  removeItem(key: string) {
    this.values.delete(key);
  }
  setItem(key: string, value: string) {
    this.values.set(key, value);
  }
}

const fixedOptions = (storage: Storage, fetcher = vi.fn()) => ({
  storage,
  fetcher,
  endpoint: "https://usage.example.test/v1/batch",
  now: () => new Date("2026-08-28T01:02:03.000Z"),
  randomId: vi
    .fn()
    .mockReturnValueOnce("11111111-1111-4111-8111-111111111111")
    .mockReturnValue("22222222-2222-4222-8222-222222222222"),
  platform: "windows" as const,
  sleep: vi.fn(async () => undefined),
});

const attributedRouteView = (overrides: Record<string, unknown> = {}) => ({
  kind: "route_view",
  occurredAt: "2026-08-28T00:00:00.000Z",
  route: "new-experiment",
  entryFamily: "experiment_interview",
  sessionId: "44444444-4444-4444-8444-444444444444",
  application: {
    version: "0.1.0",
    buildRevision: "test-build",
    platform: "windows",
  },
  ...overrides,
});

const attributedMilestone = (overrides: Record<string, unknown> = {}) => ({
  kind: "task_milestone",
  occurredAt: "2026-08-28T00:00:00.000Z",
  route: "new-experiment",
  workflowFamily: "experiment_interview",
  milestone: "structure_ready",
  sessionId: "44444444-4444-4444-8444-444444444444",
  application: {
    version: "0.1.0",
    buildRevision: "test-build",
    platform: "windows",
  },
  ...overrides,
});

const currentQueue = (events: readonly Record<string, unknown>[]) =>
  JSON.stringify({ schemaVersion: USAGE_TELEMETRY_QUEUE_SCHEMA_VERSION, events });

function seedCurrentOptIn(storage: Storage): void {
  storage.setItem("lsaa.usage-telemetry.consent.v1", "opted_in");
  storage.setItem("lsaa.usage-telemetry.consent-notice.v1", USAGE_TELEMETRY_CONSENT_NOTICE_VERSION);
}

describe("consent-first usage telemetry", () => {
  let storage: MemoryStorage;

  beforeEach(() => {
    storage = new MemoryStorage();
  });

  it("records and sends nothing before explicit opt-in or after opt-out", async () => {
    const fetcher = vi.fn();
    const service = new UsageTelemetryService(fixedOptions(storage, fetcher));

    service.recordRoute("new-experiment");
    service.recordInteraction("new-experiment", "click", "primary_action");
    expect(service.queuedEventsForTest()).toHaveLength(0);
    expect(await service.upload()).toBe(false);

    service.setConsent("opted_out");
    service.recordMilestone("new-experiment", "structure_ready");
    expect(service.queuedEventsForTest()).toHaveLength(0);
    expect(fetcher).not.toHaveBeenCalled();
  });

  it("uses exact allowlisted event shapes and rejects unknown values or stored extra fields", () => {
    seedCurrentOptIn(storage);
    storage.setItem(
      "lsaa.usage-telemetry.queue.v2",
      currentQueue([
        attributedRouteView({ rawMeasurement: "should-never-leave-storage" }),
      ]),
    );
    const service = new UsageTelemetryService(fixedOptions(storage));
    (
      service as unknown as { recordMilestone: (route: string, value: string) => void }
    ).recordMilestone("new-experiment", "free text from researcher");
    service.recordRoute("new-experiment");
    service.recordEntry("new-experiment", "graph_only");
    service.recordInteraction("new-experiment", "change", "spreadsheet");
    service.recordGraphEdit("new-experiment", "axes");
    service.recordGraphConfiguration("new-experiment", {
      graphFamily: "dot",
      origin: "recommended",
      uncertainty: "sd",
      rawPointsVisible: true,
      summaryVisible: true,
    });

    const report = service.localReport();
    expect(report.eventCount).toBe(5);
    expect(report.events).toContainEqual(
      expect.objectContaining({ entryFamily: "graph_only", route: "new-experiment" }),
    );
    expect(JSON.stringify(report)).not.toContain("should-never-leave-storage");
    expect(JSON.stringify(report)).not.toContain("free text from researcher");
    expect(report.privacy).toEqual({
      measurementsIncluded: false,
      researcherTextIncluded: false,
      fileOrClipboardContentIncluded: false,
      projectIdentifiersIncluded: false,
    });
  });

  it("purges the bounded local queue and random app id when consent is turned off", async () => {
    const fetcher = vi.fn().mockResolvedValue({ ok: false } as Response);
    const service = new UsageTelemetryService(fixedOptions(storage, fetcher));
    service.setConsent("opted_in");
    service.recordRoute("home");
    await service.upload();
    expect(storage.getItem("lsaa.usage-telemetry.install-id.v1")).toBe(
      "22222222-2222-4222-8222-222222222222",
    );
    expect(storage.getItem("lsaa.usage-telemetry.queue.v2")).not.toBeNull();

    service.setConsent("opted_out");
    expect(storage.getItem("lsaa.usage-telemetry.queue.v2")).toBeNull();
    expect(storage.getItem("lsaa.usage-telemetry.install-id.v1")).toBeNull();
    expect(service.queuedEventsForTest()).toHaveLength(0);
  });

  it("batch POSTs only to a valid HTTPS endpoint", async () => {
    const fetcher = vi.fn().mockResolvedValue({ ok: true } as Response);
    const service = new UsageTelemetryService(fixedOptions(storage, fetcher));
    service.setConsent("opted_in");
    service.recordRoute("survival");
    service.recordMilestone("survival", "data_entry_started");

    expect(await service.upload()).toBe(true);
    expect(fetcher).toHaveBeenCalledTimes(1);
    const [url, init] = fetcher.mock.calls[0] as [string, RequestInit];
    expect(url).toBe("https://usage.example.test/v1/batch");
    const batch = JSON.parse(String(init.body));
    expect(batch).toMatchObject({
      schemaVersion: USAGE_TELEMETRY_SCHEMA_VERSION,
      installId: "22222222-2222-4222-8222-222222222222",
      sessionId: "11111111-1111-4111-8111-111111111111",
      application: { platform: "windows" },
    });
    expect(batch.events).toHaveLength(2);

    const unsafeFetcher = vi.fn();
    const unsafe = new UsageTelemetryService({
      ...fixedOptions(new MemoryStorage(), unsafeFetcher),
      endpoint: "http://usage.example.test/batch",
    });
    unsafe.setConsent("opted_in");
    unsafe.recordRoute("home");
    expect(await unsafe.upload()).toBe(false);
    expect(unsafeFetcher).not.toHaveBeenCalled();

    for (const endpoint of [
      "https://user:secret@usage.example.test/batch",
      "https://usage.example.test/batch#fragment",
    ]) {
      const guardedFetcher = vi.fn();
      const guarded = new UsageTelemetryService({
        ...fixedOptions(new MemoryStorage(), guardedFetcher),
        endpoint,
      });
      guarded.setConsent("opted_in");
      guarded.recordRoute("home");
      expect(await guarded.upload()).toBe(false);
      expect(guardedFetcher).not.toHaveBeenCalled();
    }
  });

  it("cannot activate an environment endpoint under a local-only consent notice", () => {
    expect(
      resolveConfiguredUsageTelemetryEndpoint(
        "https://usage.example.test/v1/batch",
        USAGE_TELEMETRY_CONSENT_NOTICE_VERSION,
      ),
    ).toBeNull();
    expect(
      resolveConfiguredUsageTelemetryEndpoint(
        "https://usage.example.test/v1/batch",
        "remote-alpha-2026-09-01",
      ),
    ).toBe("https://usage.example.test/v1/batch");
  });

  it("keeps the app path nonblocking and retains the queue when upload fails", async () => {
    const fetcher = vi.fn().mockRejectedValue(new Error("offline"));
    const service = new UsageTelemetryService(fixedOptions(storage, fetcher));
    service.setConsent("opted_in");
    service.recordError("new-experiment", "UNSUPPORTED_ANALYSIS");

    await expect(service.upload()).resolves.toBe(false);
    expect(service.queuedEventsForTest()).toHaveLength(1);
  });

  it("keeps events recorded while an earlier batch is being uploaded", async () => {
    let finishUpload: ((response: Response) => void) | undefined;
    const fetcher = vi.fn(
      () =>
        new Promise<Response>((resolve) => {
          finishUpload = resolve;
        }),
    );
    const service = new UsageTelemetryService(fixedOptions(storage, fetcher));
    service.setConsent("opted_in");
    service.recordRoute("home");

    const upload = service.upload();
    await vi.waitFor(() => expect(fetcher).toHaveBeenCalledTimes(1));
    service.recordMilestone("home", "entry_started");
    finishUpload?.({ ok: true, status: 200 } as Response);

    await expect(upload).resolves.toBe(true);
    expect(service.queuedEventsForTest()).toEqual([
      expect.objectContaining({ kind: "task_milestone", milestone: "entry_started" }),
    ]);
  });

  it("caps the persistent queue so telemetry cannot grow without bound", () => {
    const service = new UsageTelemetryService(fixedOptions(storage));
    service.setConsent("opted_in");
    for (let index = 0; index < 200; index += 1) service.recordRoute("home");
    expect(service.queuedEventsForTest()).toHaveLength(120);
  });

  it("carries the typed entry workflow into milestones, interactions, and graph edits", () => {
    const service = new UsageTelemetryService(fixedOptions(storage));
    service.setConsent("opted_in");
    service.recordRoute("new-experiment");
    service.recordEntry("new-experiment", "graph_only");
    service.recordMilestone("new-experiment", "graph_created");
    service.recordInteraction("new-experiment", "click", "primary_action");
    service.recordGraphEdit("new-experiment", "axes");
    service.recordGraphConfiguration("new-experiment", {
      graphFamily: "dot",
      origin: "user_selected",
      uncertainty: "sd",
      rawPointsVisible: true,
      summaryVisible: true,
    });
    service.recordError("new-experiment", "UNSUPPORTED_ANALYSIS");

    const events = service.localReport().events;
    expect(events).toContainEqual(
      expect.objectContaining({
        kind: "task_milestone",
        workflowFamily: "graph_only",
        milestone: "graph_created",
      }),
    );
    expect(events).toContainEqual(
      expect.objectContaining({
        kind: "interaction_counts",
        workflowFamily: "graph_only",
        category: "primary_action",
      }),
    );
    expect(events).toContainEqual(
      expect.objectContaining({
        kind: "graph_edit",
        workflowFamily: "graph_only",
        category: "axes",
      }),
    );
    expect(events).toContainEqual(
      expect.objectContaining({
        kind: "graph_configuration",
        workflowFamily: "graph_only",
        graphFamily: "dot",
        origin: "user_selected",
        uncertainty: "sd",
        rawPointsVisible: true,
        summaryVisible: true,
      }),
    );
    expect(events).toContainEqual(
      expect.objectContaining({
        kind: "error",
        workflowFamily: "graph_only",
        code: "UNSUPPORTED_ANALYSIS",
      }),
    );
  });

  it("rejects poisoned consent, noncanonical timestamps, extra fields, and non-UUID app ids", () => {
    seedCurrentOptIn(storage);
    storage.setItem("lsaa.usage-telemetry.install-id.v1", "../../secret-project-name");
    storage.setItem(
      "lsaa.usage-telemetry.queue.v2",
      currentQueue([
        attributedMilestone(),
        {
          ...attributedMilestone(),
          kind: "task_milestone",
          occurredAt: "2026-08-28T00:00:00Z",
        },
        {
          ...attributedMilestone(),
          kind: "task_milestone",
          occurredAt: "2026-02-30T00:00:00.000Z",
        },
        {
          ...attributedMilestone(),
          kind: "task_milestone",
          projectTitle: "must not survive",
        },
      ]),
    );

    const service = new UsageTelemetryService(fixedOptions(storage));
    const report = service.localReport();
    expect(report.eventCount).toBe(1);
    expect(report.installId).toBe("22222222-2222-4222-8222-222222222222");
    expect(storage.getItem("lsaa.usage-telemetry.install-id.v1")).toBe(
      "22222222-2222-4222-8222-222222222222",
    );
    expect(JSON.stringify(report)).not.toContain("must not survive");

    const poisonedConsentStorage = new MemoryStorage();
    poisonedConsentStorage.setItem("lsaa.usage-telemetry.consent.v1", "opted_in<script>");
    poisonedConsentStorage.setItem("lsaa.usage-telemetry.queue.v2", JSON.stringify(report.events));
    const undecided = new UsageTelemetryService(fixedOptions(poisonedConsentStorage));
    expect(undecided.getConsent()).toBe("undecided");
    expect(undecided.localReport()).toMatchObject({
      eventCount: 0,
      installId: null,
      sessionId: null,
    });
  });

  it("requires fresh opt-in after a consent-notice version change and discards the old queue", () => {
    storage.setItem("lsaa.usage-telemetry.consent.v1", "opted_in");
    storage.setItem("lsaa.usage-telemetry.consent-notice.v1", "older-local-notice");
    storage.setItem("lsaa.usage-telemetry.install-id.v1", "33333333-3333-4333-8333-333333333333");
    storage.setItem(
      "lsaa.usage-telemetry.queue.v2",
      currentQueue([
        {
          ...attributedRouteView(),
          route: "home",
          entryFamily: "home",
        },
      ]),
    );

    const service = new UsageTelemetryService(fixedOptions(storage));
    expect(service.getConsent()).toBe("undecided");
    expect(service.localReport().eventCount).toBe(0);
    expect(storage.getItem("lsaa.usage-telemetry.queue.v2")).toBeNull();
    expect(storage.getItem("lsaa.usage-telemetry.install-id.v1")).toBeNull();
    expect(storage.getItem("lsaa.usage-telemetry.consent.v1")).toBeNull();
  });

  it("preserves the originating session and application for queued events after relaunch", async () => {
    const first = new UsageTelemetryService({
      ...fixedOptions(storage),
      randomId: vi.fn().mockReturnValue("11111111-1111-4111-8111-111111111111"),
      platform: "windows",
    });
    first.setConsent("opted_in");
    first.recordRoute("home");

    const fetcher = vi.fn().mockResolvedValue({ ok: true } as Response);
    const second = new UsageTelemetryService({
      ...fixedOptions(storage, fetcher),
      randomId: vi.fn().mockReturnValue("33333333-3333-4333-8333-333333333333"),
      platform: "macos",
    });

    expect(second.queuedEventsForTest()[0]).toMatchObject({
      sessionId: "11111111-1111-4111-8111-111111111111",
      application: { platform: "windows" },
    });
    await expect(second.upload()).resolves.toBe(true);
    const [, init] = fetcher.mock.calls[0] as [string, RequestInit];
    const batch = JSON.parse(String(init.body));
    expect(batch.sessionId).toBe("33333333-3333-4333-8333-333333333333");
    expect(batch.application.platform).toBe("macos");
    expect(batch.events[0]).toMatchObject({
      sessionId: "11111111-1111-4111-8111-111111111111",
      application: { platform: "windows" },
    });
  });

  it("drops the legacy un-attributed queue instead of relabeling it", () => {
    seedCurrentOptIn(storage);
    storage.setItem(
      "lsaa.usage-telemetry.queue.v1",
      JSON.stringify([attributedRouteView()]),
    );
    const service = new UsageTelemetryService(fixedOptions(storage));
    expect(service.queuedEventsForTest()).toHaveLength(0);
    expect(storage.getItem("lsaa.usage-telemetry.queue.v1")).toBeNull();
  });

  it("drops events older than the bounded queue age and normalizes the stored envelope", () => {
    seedCurrentOptIn(storage);
    const nowMs = new Date("2026-08-28T01:02:03.000Z").getTime();
    const oldOccurredAt = new Date(nowMs - USAGE_TELEMETRY_MAX_QUEUE_AGE_MS - 1).toISOString();
    storage.setItem(
      "lsaa.usage-telemetry.queue.v2",
      currentQueue([
        attributedRouteView({ occurredAt: oldOccurredAt }),
        attributedRouteView(),
      ]),
    );
    const service = new UsageTelemetryService(fixedOptions(storage));
    expect(service.queuedEventsForTest()).toHaveLength(1);
    expect(JSON.parse(storage.getItem("lsaa.usage-telemetry.queue.v2") ?? "{}").events).toHaveLength(1);
  });

  it("enforces the serialized UTF-8 queue size as well as the event-count cap", () => {
    seedCurrentOptIn(storage);
    const longApplication = {
      version: "v".repeat(128),
      buildRevision: "r".repeat(128),
      platform: "windows",
    };
    const events = Array.from({ length: USAGE_TELEMETRY_MAX_QUEUE_EVENTS }, (_, index) => ({
      kind: "interaction_counts",
      occurredAt: "2026-08-28T00:00:00.000Z",
      route: "new-experiment",
      workflowFamily: "experiment_interview",
      category: "spreadsheet",
      clicks: index,
      changes: index,
      sessionId: "44444444-4444-4444-8444-444444444444",
      application: longApplication,
    }));
    storage.setItem("lsaa.usage-telemetry.queue.v2", currentQueue(events));
    const service = new UsageTelemetryService(fixedOptions(storage));
    const serialized = storage.getItem("lsaa.usage-telemetry.queue.v2") ?? "";
    expect(new TextEncoder().encode(serialized).byteLength).toBeLessThanOrEqual(
      USAGE_TELEMETRY_MAX_QUEUE_BYTES,
    );
    expect(service.queuedEventsForTest().length).toBeLessThan(USAGE_TELEMETRY_MAX_QUEUE_EVENTS);
  });

  it("falls back to a non-blocking valid identifier when UUID providers fail", () => {
    const originalCrypto = globalThis.crypto;
    const randomSpy = vi.spyOn(Math, "random").mockImplementation(() => {
      throw new Error("random unavailable");
    });
    vi.stubGlobal("crypto", { randomUUID: () => { throw new Error("crypto unavailable"); } });
    try {
      const service = new UsageTelemetryService({
        ...fixedOptions(storage),
        randomId: () => { throw new Error("custom provider unavailable"); },
      });
      service.setConsent("opted_in");
      expect(service.localReport().sessionId).toBe("00000000-0000-4000-8000-000000000000");
    } finally {
      randomSpy.mockRestore();
      vi.stubGlobal("crypto", originalCrypto);
    }
  });

  it("makes only bounded delayed retries for transient upload failures", async () => {
    const fetcher = vi
      .fn()
      .mockRejectedValueOnce(new Error("offline"))
      .mockRejectedValueOnce(new Error("offline"))
      .mockResolvedValue({ ok: true } as Response);
    const sleep = vi.fn(async () => undefined);
    const service = new UsageTelemetryService({ ...fixedOptions(storage, fetcher), sleep });
    service.setConsent("opted_in");
    service.recordRoute("home");

    await expect(service.upload()).resolves.toBe(true);
    expect(fetcher).toHaveBeenCalledTimes(3);
    expect(sleep).toHaveBeenNthCalledWith(1, 250);
    expect(sleep).toHaveBeenNthCalledWith(2, 1_000);
  });

  it("aborts each timed-out request and stops after the bounded retry count", async () => {
    const signals: AbortSignal[] = [];
    const fetcher = vi.fn((_input: RequestInfo | URL, init?: RequestInit) => {
      const signal = init?.signal as AbortSignal | undefined;
      if (signal) signals.push(signal);
      return new Promise<Response>((_resolve, reject) => {
        signal?.addEventListener("abort", () => reject(new Error("aborted")), { once: true });
      });
    });
    const service = new UsageTelemetryService({
      ...fixedOptions(storage, fetcher),
      sleep: vi.fn(async () => undefined),
      uploadTimeoutMs: 1,
    });
    service.setConsent("opted_in");
    service.recordRoute("home");

    await expect(service.upload()).resolves.toBe(false);
    expect(fetcher).toHaveBeenCalledTimes(3);
    expect(signals.every((signal) => signal.aborted)).toBe(true);
    expect(service.queuedEventsForTest()).toHaveLength(1);
  });
});

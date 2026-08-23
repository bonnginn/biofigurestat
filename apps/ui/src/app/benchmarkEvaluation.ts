import { useSyncExternalStore } from "react";

import { evaluationMode, evaluationModeIsConfigured } from "./evaluationMode";

export type BenchmarkSupportStatus =
  "direct" | "reasonable_workaround" | "scientifically_compromising" | "impossible";

export type BenchmarkOutcome =
  | "in_progress"
  | "completed"
  | "explicit_unsupported"
  | "infrastructure_failure"
  | "contaminated"
  | "aborted_not_started";

export type BenchmarkIdentity = Readonly<{
  benchmarkVersion: string;
  caseId: string;
  track: "track_A" | "track_B";
  runId: string;
}>;

export type BenchmarkEventEffect = "analysis_only" | "rendered_graph" | "both" | "non_rendering_ui";

export type BenchmarkEvent = Readonly<{
  sequence: number;
  occurredAt: string;
  type: string;
  effect: BenchmarkEventEffect;
  detail: Readonly<Record<string, string | number | boolean | null>>;
}>;

export type BenchmarkGraphCapture = Readonly<{
  status: "pending" | "complete";
  capturedAt: string;
  eventIndex: number;
  graphStateFingerprint: string | null;
  analysisStateFingerprint: string | null;
  svgSha256: string | null;
  pngSha256: string | null;
}>;

export type BenchmarkRunState = Readonly<{
  identity: BenchmarkIdentity | null;
  startedAt: string | null;
  outcome: BenchmarkOutcome | null;
  supportStatus: BenchmarkSupportStatus | null;
  defaultGraphCaptured: boolean;
  defaultGraphCapture: BenchmarkGraphCapture | null;
  finalGraphCapture: BenchmarkGraphCapture | null;
  events: readonly BenchmarkEvent[];
}>;

const EMPTY: BenchmarkRunState = {
  identity: null,
  startedAt: null,
  outcome: null,
  supportStatus: null,
  defaultGraphCaptured: false,
  defaultGraphCapture: null,
  finalGraphCapture: null,
  events: [],
};
let state: BenchmarkRunState = EMPTY;
const listeners = new Set<() => void>();

function publish(next: BenchmarkRunState) {
  state = next;
  listeners.forEach((listener) => listener());
}

export function useBenchmarkRun(): BenchmarkRunState {
  return useSyncExternalStore(
    (listener) => {
      listeners.add(listener);
      return () => listeners.delete(listener);
    },
    () => state,
    () => EMPTY,
  );
}

export function startBenchmarkRun(identity: BenchmarkIdentity): void {
  if (!evaluationModeIsConfigured(evaluationMode)) return;
  const startedAt = new Date().toISOString();
  publish({
    identity,
    startedAt,
    outcome: "in_progress",
    supportStatus: null,
    defaultGraphCaptured: false,
    defaultGraphCapture: null,
    finalGraphCapture: null,
    events: [
      {
        sequence: 1,
        occurredAt: startedAt,
        type: "benchmark_run_started",
        effect: "non_rendering_ui",
        detail: { ...identity, sourceRevision: evaluationMode.sourceRevision },
      },
    ],
  });
}

export function resetBenchmarkRun(): void {
  publish(EMPTY);
}

export function recordBenchmarkEvent(
  type: string,
  detail: Readonly<Record<string, string | number | boolean | null>> = {},
  effect: BenchmarkEventEffect = "non_rendering_ui",
): void {
  if (!state.identity || !evaluationModeIsConfigured(evaluationMode)) return;
  publish({
    ...state,
    events: [
      ...state.events,
      {
        sequence: state.events.length + 1,
        occurredAt: new Date().toISOString(),
        type,
        effect,
        detail,
      },
    ],
  });
}

export function setBenchmarkSupportStatus(supportStatus: BenchmarkSupportStatus | null): void {
  if (!state.identity) return;
  publish({ ...state, supportStatus });
  recordBenchmarkEvent("support_status_selected", { supportStatus });
}

export function setBenchmarkOutcome(outcome: BenchmarkOutcome): void {
  if (!state.identity) return;
  const preservesScientificSupport =
    outcome === "in_progress" || outcome === "completed" || outcome === "explicit_unsupported";
  publish({
    ...state,
    outcome,
    supportStatus: preservesScientificSupport ? state.supportStatus : null,
  });
  recordBenchmarkEvent("benchmark_outcome_selected", { outcome });
}

export function beginDefaultGraphCapture(capturedAt: string): boolean {
  if (!state.identity || state.defaultGraphCapture) return false;
  const eventIndex = state.events.length + 1;
  const capture: BenchmarkGraphCapture = {
    status: "pending",
    capturedAt,
    eventIndex,
    graphStateFingerprint: null,
    analysisStateFingerprint: null,
    svgSha256: null,
    pngSha256: null,
  };
  publish({
    ...state,
    defaultGraphCapture: capture,
    events: [
      ...state.events,
      {
        sequence: eventIndex,
        occurredAt: capturedAt,
        type: "default_graph_capture_started",
        effect: "non_rendering_ui",
        detail: {},
      },
    ],
  });
  return true;
}

export function completeDefaultGraphCapture(input: {
  graphStateFingerprint: string;
  analysisStateFingerprint: string;
  svgSha256: string;
  pngSha256: string;
}): void {
  if (
    !state.identity ||
    !state.defaultGraphCapture ||
    state.defaultGraphCapture.status !== "pending"
  )
    return;
  const capture: BenchmarkGraphCapture = {
    ...state.defaultGraphCapture,
    status: "complete",
    graphStateFingerprint: input.graphStateFingerprint,
    analysisStateFingerprint: input.analysisStateFingerprint,
    svgSha256: input.svgSha256,
    pngSha256: input.pngSha256,
  };
  const sequence = state.events.length + 1;
  publish({
    ...state,
    defaultGraphCaptured: true,
    defaultGraphCapture: capture,
    events: [
      ...state.events,
      {
        sequence,
        occurredAt: new Date().toISOString(),
        type: "default_graph_captured",
        effect: "non_rendering_ui",
        detail: {
          defaultCapturedEventIndex: capture.eventIndex,
          graphStateFingerprint: input.graphStateFingerprint,
          analysisStateFingerprint: input.analysisStateFingerprint,
          svgSha256: input.svgSha256,
          pngSha256: input.pngSha256,
        },
      },
    ],
  });
}

export function recordFinalGraphCapture(input: {
  capturedAt: string;
  graphStateFingerprint: string;
  analysisStateFingerprint: string;
  svgSha256: string;
  pngSha256: string;
}): BenchmarkRunState {
  if (!state.identity) return state;
  const eventIndex = state.events.length + 1;
  const capture: BenchmarkGraphCapture = {
    status: "complete",
    capturedAt: input.capturedAt,
    eventIndex,
    graphStateFingerprint: input.graphStateFingerprint,
    analysisStateFingerprint: input.analysisStateFingerprint,
    svgSha256: input.svgSha256,
    pngSha256: input.pngSha256,
  };
  publish({
    ...state,
    finalGraphCapture: capture,
    events: [
      ...state.events,
      {
        sequence: eventIndex,
        occurredAt: input.capturedAt,
        type: "final_graph_captured",
        effect: "non_rendering_ui",
        detail: {
          finalCapturedEventIndex: eventIndex,
          graphStateFingerprint: input.graphStateFingerprint,
          analysisStateFingerprint: input.analysisStateFingerprint,
          svgSha256: input.svgSha256,
          pngSha256: input.pngSha256,
        },
      },
    ],
  });
  return state;
}

export function currentBenchmarkRun(): BenchmarkRunState {
  return state;
}

export type BenchmarkArtifact = Readonly<{
  name: string;
  content: string;
  encoding?: "text" | "base64";
  mediaType?: string;
}>;

export const COMPLETE_BENCHMARK_ARTIFACT_NAMES = [
  "run.json",
  "default_graph.png",
  "default_graph.svg",
  "final_graph.png",
  "final_graph.svg",
  "statistics.json",
  "methods.txt",
  "graph_state.json",
  "interaction_log.json",
] as const;

export async function writeBenchmarkArtifacts(
  artifacts: readonly BenchmarkArtifact[],
  options: Readonly<{ requiredArtifacts?: readonly string[] }> = {},
) {
  if (!state.identity || !evaluationModeIsConfigured(evaluationMode)) {
    throw new Error("Benchmark run is not configured");
  }
  const response = await fetch(`${evaluationMode.apiBasePath}/artifacts`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      mode: "evaluation",
      syntheticOnly: true,
      benchmark: state.identity,
      artifacts,
      ...(options.requiredArtifacts ? { requiredArtifacts: options.requiredArtifacts } : {}),
    }),
  });
  if (!response.ok) throw new Error("Benchmark artifacts could not be written");
  const result = (await response.json()) as {
    written: string[];
    present?: string[];
    directory: string;
  };
  if (options.requiredArtifacts) {
    const present = new Set(result.present ?? []);
    const missing = options.requiredArtifacts.filter((name) => !present.has(name));
    if (missing.length) {
      throw new Error(`Benchmark artifact set is incomplete: ${missing.join(", ")}`);
    }
  }
  return result;
}

export async function blobToBase64(blob: Blob): Promise<string> {
  const bytes = new Uint8Array(await blob.arrayBuffer());
  let binary = "";
  bytes.forEach((byte) => {
    binary += String.fromCharCode(byte);
  });
  return btoa(binary);
}

export async function sha256Hex(value: string | Blob): Promise<string> {
  const bytes =
    typeof value === "string"
      ? new TextEncoder().encode(value)
      : new Uint8Array(await value.arrayBuffer());
  const digest = await crypto.subtle.digest("SHA-256", bytes);
  return [...new Uint8Array(digest)].map((byte) => byte.toString(16).padStart(2, "0")).join("");
}

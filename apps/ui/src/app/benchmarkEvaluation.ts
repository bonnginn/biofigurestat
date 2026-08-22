import { useSyncExternalStore } from "react";

import { evaluationMode, evaluationModeIsConfigured } from "./evaluationMode";

export type BenchmarkSupportStatus =
  "direct" | "reasonable_workaround" | "scientifically_compromising" | "impossible";

export type BenchmarkIdentity = Readonly<{
  benchmarkVersion: string;
  caseId: string;
  track: "track_A" | "track_B";
  runId: string;
}>;

export type BenchmarkEvent = Readonly<{
  sequence: number;
  occurredAt: string;
  type: string;
  detail: Readonly<Record<string, string | number | boolean | null>>;
}>;

export type BenchmarkRunState = Readonly<{
  identity: BenchmarkIdentity | null;
  startedAt: string | null;
  supportStatus: BenchmarkSupportStatus | null;
  defaultGraphCaptured: boolean;
  events: readonly BenchmarkEvent[];
}>;

const EMPTY: BenchmarkRunState = {
  identity: null,
  startedAt: null,
  supportStatus: null,
  defaultGraphCaptured: false,
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
    supportStatus: null,
    defaultGraphCaptured: false,
    events: [
      {
        sequence: 1,
        occurredAt: startedAt,
        type: "benchmark_run_started",
        detail: { ...identity, sourceRevision: evaluationMode.sourceRevision },
      },
    ],
  });
}

export function recordBenchmarkEvent(
  type: string,
  detail: Readonly<Record<string, string | number | boolean | null>> = {},
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

export function markDefaultGraphCaptured(): void {
  if (!state.identity || state.defaultGraphCaptured) return;
  publish({ ...state, defaultGraphCaptured: true });
  recordBenchmarkEvent("default_graph_captured");
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

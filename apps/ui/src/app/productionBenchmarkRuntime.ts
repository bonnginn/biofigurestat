const EMPTY_RUN = Object.freeze({
  identity: null,
  startedAt: null,
  outcome: null,
  supportStatus: null,
  defaultGraphCaptured: false,
  defaultGraphCapture: null,
  finalGraphCapture: null,
  events: Object.freeze([]),
});

export function useBenchmarkRun() {
  return EMPTY_RUN;
}

export function startBenchmarkRun() {
  return undefined;
}
export function resetBenchmarkRun() {
  return undefined;
}
export function recordBenchmarkEvent() {
  return undefined;
}
export function setBenchmarkSupportStatus() {
  return undefined;
}
export function setBenchmarkOutcome() {
  return undefined;
}
export function completeDefaultGraphCapture() {
  return undefined;
}

export function beginDefaultGraphCapture() {
  return false;
}

export function recordFinalGraphCapture() {
  return EMPTY_RUN;
}

export function currentBenchmarkRun() {
  return EMPTY_RUN;
}

export const COMPLETE_BENCHMARK_ARTIFACT_NAMES = Object.freeze([]);

export async function writeBenchmarkArtifacts(): Promise<never> {
  throw new Error("Development instrumentation is unavailable in the production build");
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

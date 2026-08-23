import { evaluationMode, evaluationModeIsConfigured } from "./evaluationMode";

export type BlindBatchCurrent = Readonly<{
  batchId: string;
  benchmarkVersion: string;
  status: "running" | "ready_to_advance" | "paused" | "completed";
  position: number;
  total: number;
  completed: number;
  current: Readonly<{
    position: number;
    caseId: string;
    track: "track_B";
    runId: string;
    packageSha256: string;
    status: "active" | "completed" | "infrastructure_failure" | "contaminated" | "aborted";
  }> | null;
}>;

async function batchRequest(path: string, init?: RequestInit): Promise<BlindBatchCurrent | null> {
  if (!evaluationModeIsConfigured(evaluationMode)) return null;
  const response = await fetch(`${evaluationMode.apiBasePath}/blind-batch/${path}`, init);
  if (response.status === 404) return null;
  if (!response.ok) throw new Error("Blind batch request failed");
  return (await response.json()) as BlindBatchCurrent;
}

export function fetchBlindBatchCurrent(): Promise<BlindBatchCurrent | null> {
  return batchRequest("current");
}

export function advanceBlindBatch(): Promise<BlindBatchCurrent | null> {
  return batchRequest("next", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ mode: "evaluation", syntheticOnly: true }),
  });
}

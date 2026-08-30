import type { AnalysisEngineRequest } from "@lsaa/analysis-contracts";

const FINGERPRINT_VERSION = "analysis-structure-v1";

type JsonValue = null | boolean | number | string | JsonValue[] | { [key: string]: JsonValue };

function canonicalize(value: JsonValue): JsonValue {
  if (Array.isArray(value)) return value.map(canonicalize);
  if (value !== null && typeof value === "object") {
    return Object.fromEntries(
      Object.entries(value)
        .sort(([first], [second]) => first.localeCompare(second))
        .map(([key, item]) => [key, canonicalize(item)]),
    );
  }
  return value;
}

export function analysisRequestStructuralFingerprint(request: AnalysisEngineRequest): string {
  const observations = [...request.observations]
    .map(({ value: _value, ...observation }) => observation)
    .sort((first, second) => first.observationId.localeCompare(second.observationId));
  const { requestId: _requestId, ...stableRequest } = request;
  return JSON.stringify(
    canonicalize({
      fingerprintVersion: FINGERPRINT_VERSION,
      ...stableRequest,
      observations,
    } as JsonValue),
  );
}

export function canSafelyAutomaticallyRerun(
  previous: AnalysisEngineRequest,
  next: AnalysisEngineRequest,
): boolean {
  return (
    analysisRequestStructuralFingerprint(previous) === analysisRequestStructuralFingerprint(next)
  );
}

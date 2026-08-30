/**
 * Decodes an adaptive survival status without inventing censoring.
 * Numeric encodings are intentionally rejected until the user has supplied an
 * explicit 0/1 mapping through a dedicated import contract.
 */
export function decodeAdaptiveSurvivalStatus(value: unknown): boolean {
  if (typeof value === "boolean") return value;

  if (typeof value === "number") {
    throw new Error("ADAPTIVE_SURVIVAL_NUMERIC_STATUS_REQUIRES_EXPLICIT_MAPPING");
  }

  if (typeof value !== "string" || !value.trim()) {
    throw new Error("ADAPTIVE_SURVIVAL_STATUS_MISSING");
  }

  const normalized = value.normalize("NFKC").trim().toLowerCase().replace(/[_-]+/gu, " ");
  if (["event", "observed", "event observed"].includes(normalized)) return true;
  if (["censored", "censor"].includes(normalized)) return false;

  if (Number.isFinite(Number(normalized))) {
    throw new Error("ADAPTIVE_SURVIVAL_NUMERIC_STATUS_REQUIRES_EXPLICIT_MAPPING");
  }

  throw new Error(`ADAPTIVE_SURVIVAL_STATUS_INVALID:${value}`);
}

import type { CanonicalAdaptiveObservation } from "@lsaa/domain";

export function canonicalMatrixDisplayTextKey(observationId: string, valueKey: string): string {
  return `canonical-matrix:${observationId}:${valueKey}`;
}

// Display only exact decimal spellings of the canonical number, never rounded digits.
export function canonicalMatrixLexicalText(value: number | null, text: string): string | null {
  if (value === null) return null;
  const trimmed = text.trim();
  if (!/^[+-]?(?:\d+(?:\.\d*)?|\.\d+)$/.test(trimmed)) return null;
  const negative = trimmed.startsWith("-");
  const [whole = "", fractional = ""] = trimmed.replace(/^[+-]/, "").split(".");
  const integer = whole.replace(/^0+/, "") || "0";
  const fraction = fractional.replace(/0+$/, "");
  const normalized = `${negative && (integer !== "0" || fraction) ? "-" : ""}${integer}${fraction ? `.${fraction}` : ""}`;
  return normalized === String(value) && trimmed !== String(value) ? trimmed : null;
}

export function pruneNumericDisplayTexts(
  observations: readonly CanonicalAdaptiveObservation[],
  texts: Readonly<Record<string, string>>,
): Record<string, string> {
  const retained: Record<string, string> = {};
  for (const observation of observations) {
    for (const [valueKey, value] of Object.entries(observation.values)) {
      const key = canonicalMatrixDisplayTextKey(observation.observationId, valueKey);
      const text = texts[key];
      if (
        typeof value !== "number" ||
        typeof text !== "string" ||
        observation.missingness[valueKey]
      )
        continue;
      const exact = canonicalMatrixLexicalText(value, text);
      if (exact !== null) retained[key] = exact;
    }
  }
  return retained;
}

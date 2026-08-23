/** Formats a stored value for an "exact p-value" surface without rounding a positive p to zero. */
export function formatExactPValue(value: number | null | undefined): string {
  if (value === null || value === undefined || !Number.isFinite(value)) return "—";
  if (value === 0) return "0";
  if (value > 0 && value < 0.0001) return value.toExponential(2);
  return Number(value.toPrecision(6)).toString();
}

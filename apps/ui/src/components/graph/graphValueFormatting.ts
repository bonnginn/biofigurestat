export function formatGraphNumber(value: number | null, fractionDigits = 2): string {
  if (value === null || !Number.isFinite(value)) return "—";
  return new Intl.NumberFormat("ja-JP", { maximumFractionDigits: fractionDigits }).format(value);
}

export function formatGraphPercentage(value: number | null): string {
  return value === null ? "—" : `${formatGraphNumber(value, 1)}%`;
}

export function graphSignificanceSymbol(pValue: number): string {
  if (pValue < 0.0001) return "****";
  if (pValue < 0.001) return "***";
  if (pValue < 0.01) return "**";
  if (pValue < 0.05) return "*";
  return "n.s.";
}

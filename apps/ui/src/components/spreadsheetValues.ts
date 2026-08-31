export function parseSpreadsheetNumber(value: string, integer = false): number | null {
  const trimmed = value.trim();
  if (trimmed === "") return null;
  const parsed = Number(trimmed);
  if (!Number.isFinite(parsed) || (integer && !Number.isInteger(parsed))) return null;
  return parsed;
}

export function formatProportionPercentage(input: {
  numerator: number | null;
  denominator: number | null;
}): string {
  if (
    input.numerator === null ||
    input.denominator === null ||
    input.denominator <= 0 ||
    input.numerator > input.denominator
  ) {
    return "—";
  }
  return `${((input.numerator / input.denominator) * 100).toFixed(1)}%`;
}

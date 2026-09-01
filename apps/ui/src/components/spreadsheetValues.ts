export type SpreadsheetNumberParseResult =
  | Readonly<{ kind: "empty" }>
  | Readonly<{ kind: "invalid" }>
  | Readonly<{ kind: "value"; value: number }>;

export function parseOptionalSpreadsheetNumber(
  value: string,
  integer = false,
): SpreadsheetNumberParseResult {
  const trimmed = value.trim();
  if (trimmed === "") return { kind: "empty" };
  const parsed = Number(trimmed);
  if (!Number.isFinite(parsed) || (integer && !Number.isInteger(parsed))) {
    return { kind: "invalid" };
  }
  return { kind: "value", value: parsed };
}

export function parseSpreadsheetNumber(value: string, integer = false): number | null {
  const result = parseOptionalSpreadsheetNumber(value, integer);
  return result.kind === "value" ? result.value : null;
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

export interface AdaptiveRawMappingPlan {
  identityColumns: string[];
  factorColumns: string[];
  valueColumns: string[];
  metadataColumns?: string[];
  delimiter?: "," | "\t";
  headerAliases?: Record<string, string>;
  filename?: { column: string; pattern: RegExp; groups: string[] };
  wideAxisHeaderPattern?: RegExp;
  missingTokens?: string[];
  deriveElapsedDays?: { start: string; endCandidates: string[]; output: string };
}

export interface AdaptiveRawMappingResult {
  success: boolean;
  headerRow: number;
  sourceRows: number;
  normalizedRows: Array<Record<string, string | number | null>>;
  axisColumns: string[];
  derivedColumns: string[];
  missingValueCount: number;
  targetedConfirmations: string[];
  diagnostics: string[];
}

function split(line: string, delimiter: string): string[] {
  const cells: string[] = [];
  let current = "";
  let quoted = false;
  for (let index = 0; index < line.length; index++) {
    const character = line[index]!;
    if (character === '"') {
      if (quoted && line[index + 1] === '"') { current += '"'; index++; }
      else quoted = !quoted;
    } else if (character === delimiter && !quoted) { cells.push(current.trim()); current = ""; }
    else current += character;
  }
  cells.push(current.trim());
  return cells;
}

const typed = (raw: string): string | number => raw !== "" && Number.isFinite(Number(raw)) ? Number(raw) : raw;

export function mapAdaptiveRawText(text: string, plan: AdaptiveRawMappingPlan): AdaptiveRawMappingResult {
  const lines = text.replace(/\r\n/g, "\n").split("\n").filter((line) => line.trim());
  if (!lines.length) throw new Error("ADAPTIVE_INPUT_EMPTY");
  const delimiter = plan.delimiter ?? ((lines.slice(0, 8).join("\n").match(/\t/g)?.length ?? 0) > (lines.slice(0, 8).join("\n").match(/,/g)?.length ?? 0) ? "\t" : ",");
  const alias = plan.headerAliases ?? {};
  const normalizeHeaders = (line: string) => split(line, delimiter).map((header) => alias[header.replace(/^\uFEFF/, "").trim()] ?? header.replace(/^\uFEFF/, "").trim());
  const expected = new Set([...plan.identityColumns, ...plan.factorColumns, ...plan.valueColumns]);
  let headerIndex = 0;
  let score = -1;
  for (let index = 0; index < Math.min(lines.length, 12); index++) {
    const headers = normalizeHeaders(lines[index]!);
    const candidate = headers.filter((header) => expected.has(header) || Boolean(plan.wideAxisHeaderPattern?.test(header))).length * 10 + headers.length;
    if (candidate > score) { score = candidate; headerIndex = index; }
  }
  const headers = normalizeHeaders(lines[headerIndex]!);
  const axisColumns = headers.filter((header) => Boolean(plan.wideAxisHeaderPattern?.test(header)));
  const missingTokens = new Set(["", "NA", "N/A", "Undetermined", "OVER", ...(plan.missingTokens ?? [])]);
  const derivedColumns = new Set<string>();
  const diagnostics: string[] = [];
  let missingValueCount = 0;
  const normalizedRows = lines.slice(headerIndex + 1).map((line) => {
    const cells = split(line, delimiter);
    const raw = Object.fromEntries(headers.map((header, index) => [header, cells[index] ?? ""]));
    const row: Record<string, string | number | null> = {};
    headers.forEach((header) => {
      const value = raw[header] ?? "";
      row[header] = missingTokens.has(value) ? null : typed(value);
      if (row[header] === null && (plan.valueColumns.includes(header) || axisColumns.includes(header))) missingValueCount++;
    });
    if (plan.filename) {
      const match = plan.filename.pattern.exec(raw[plan.filename.column] ?? "");
      if (match) plan.filename.groups.forEach((group, index) => { row[group] = match[index + 1] ?? null; derivedColumns.add(group); });
      else diagnostics.push(`filename_not_matched:${raw[plan.filename.column] ?? ""}`);
    }
    if (plan.deriveElapsedDays) {
      const start = raw[plan.deriveElapsedDays.start] ?? "";
      const end = plan.deriveElapsedDays.endCandidates.map((column) => raw[column]).find(Boolean) ?? "";
      const startMs = Date.parse(`${start}T00:00:00Z`);
      const endMs = Date.parse(`${end}T00:00:00Z`);
      row[plan.deriveElapsedDays.output] = Number.isFinite(startMs) && Number.isFinite(endMs) ? Math.round((endMs - startMs) / 86_400_000) : null;
      derivedColumns.add(plan.deriveElapsedDays.output);
    }
    return row;
  });
  const required = [...plan.identityColumns, ...plan.factorColumns];
  const missingRequired = required.filter((field) => !headers.includes(field) && !derivedColumns.has(field));
  if (missingRequired.length) diagnostics.push(`missing_required_headers:${missingRequired.join("|")}`);
  const targetedConfirmations = [
    ...(plan.filename && derivedColumns.size ? ["confirm_filename_token_mapping"] : []),
    ...(axisColumns.length ? ["confirm_wide_axis_unit_and_order"] : []),
    ...(missingValueCount ? ["classify_missingness_reason"] : []),
  ];
  return { success: normalizedRows.length > 0 && missingRequired.length === 0, headerRow: headerIndex + 1, sourceRows: normalizedRows.length, normalizedRows, axisColumns, derivedColumns: [...derivedColumns], missingValueCount, targetedConfirmations, diagnostics: [...new Set(diagnostics)] };
}

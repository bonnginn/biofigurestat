import { parseAdaptiveDelimited, type ParsedAdaptiveInput } from "@lsaa/adaptive-input";
import type {
  UnresolvedVisualizationColumnMapping,
  UnresolvedVisualizationIdentityDecision,
  UnresolvedVisualizationSourceRowUnitDecision,
} from "@lsaa/project";

import { localizedText, type AppLocale } from "./appLocale";

export type GraphOnlyColumnIndex = number | "";

export type ParsedVisualizationInput = Readonly<{
  parsed: ParsedAdaptiveInput;
  error: string | null;
}>;

export function parseVisualizationInput(
  text: string,
  locale: AppLocale = "ja",
): ParsedVisualizationInput {
  if (!text.trim())
    return { parsed: { headers: [], rows: [], delimiter: "tab", headerRow: 1 }, error: null };
  try {
    const parsed = parseAdaptiveDelimited(text);
    if (parsed.headers.some((header) => !header.trim())) {
      return {
        parsed,
        error: localizedText(
          locale,
          "列名が空です。1行目に列名を入れてください。",
          "A column name is blank. Add column names in the first row.",
        ),
      };
    }
    if (parsed.rows.some((row) => row.length !== parsed.headers.length)) {
      return {
        parsed,
        error: localizedText(
          locale,
          "行ごとの列数がそろっていません。元の表で空欄の列も区切りを残してください。",
          "Rows do not contain the same number of columns. Preserve delimiters for blank columns in the source table.",
        ),
      };
    }
    return { parsed, error: null };
  } catch {
    return {
      parsed: { headers: [], rows: [], delimiter: "tab", headerRow: 1 },
      error: localizedText(
        locale,
        "表を読み取れませんでした。1行目を列名にしたCSVまたはTSVを貼り付けてください。",
        "The table could not be read. Paste CSV or TSV with column names in the first row.",
      ),
    };
  }
}

export function graphOnlyNumericValue(raw: string | undefined): number | null {
  const value = raw?.trim() ?? "";
  if (!value || ["NA", "N/A", "—"].includes(value)) return null;
  const number = Number(value);
  return Number.isFinite(number) ? number : null;
}

export function graphOnlySourceKind(
  sourceLabel: string,
  delimiter: ParsedAdaptiveInput["delimiter"],
): "direct_entry" | "clipboard" | "csv" | "tsv" | "generic_file" {
  if (sourceLabel === "direct-entry") return "direct_entry";
  if (sourceLabel === "clipboard") return "clipboard";
  if (/\.tsv$/i.test(sourceLabel) || delimiter === "tab") return "tsv";
  if (/\.csv$/i.test(sourceLabel) || delimiter === "comma") return "csv";
  return "generic_file";
}

export function createGraphOnlyColumnMapping(
  parsed: ParsedAdaptiveInput,
  xColumn: GraphOnlyColumnIndex,
  yColumn: GraphOnlyColumnIndex,
  seriesColumn: GraphOnlyColumnIndex,
  idColumn: GraphOnlyColumnIndex,
  identityDecision: UnresolvedVisualizationIdentityDecision,
  sourceRowUnitDecision: UnresolvedVisualizationSourceRowUnitDecision,
  sourceLabel: string,
  confirmedAt: string,
): UnresolvedVisualizationColumnMapping | null {
  if (xColumn === "" || yColumn === "") return null;
  const roles = new Map<number, "x" | "y" | "series" | "id">([
    [xColumn, "x"],
    [yColumn, "y"],
    ...(seriesColumn === "" ? [] : [[seriesColumn, "series"] as const]),
    ...(idColumn === "" ? [] : [[idColumn, "id"] as const]),
  ]);
  return {
    schemaVersion: "0.1.0",
    sourceLabel,
    delimiter: parsed.delimiter,
    headerRow: parsed.headerRow,
    columns: parsed.headers.map((header, index) => ({
      index,
      header,
      role: roles.get(index) ?? "metadata",
    })),
    identityDecision,
    sourceRowUnitDecision,
    confirmedAt,
  };
}

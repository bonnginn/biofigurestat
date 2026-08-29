import {
  AdaptiveColumnMappingSchema,
  AdaptiveRawLineageSchema,
  type AdaptiveColumnMapping,
  type AdaptiveRawLineage,
} from "@lsaa/domain";

export type CanonicalWorksheetFileSourceKind = "csv" | "tsv" | "generic_file";
export type CanonicalWorksheetFileDelimiter = "comma" | "tab";

export type CanonicalWorksheetFileColumnRole = "row_label" | "identity" | "date" | "value";

export type CanonicalWorksheetFileColumn = Readonly<{
  key: string;
  header: string;
  role: CanonicalWorksheetFileColumnRole;
  semanticKey?: string;
  /**
   * Stable presentation group used to associate an independent-unit ID with
   * the condition columns it identifies.  This is intentionally not written
   * into the user-facing mapping; it is only needed while applying the
   * generated worksheet back to the current contract.
   */
  groupKey?: string;
  aliases?: readonly string[];
}>;

export type CanonicalWorksheetFileLayout = Readonly<{
  columns: readonly CanonicalWorksheetFileColumn[];
  /** A presentation-only row label may be omitted from a saved worksheet. */
  optionalRowLabel?: boolean;
}>;

export type CanonicalWorksheetFileImport = Readonly<{
  sourceKind: CanonicalWorksheetFileSourceKind;
  delimiter: CanonicalWorksheetFileDelimiter;
  headers: readonly string[];
  rows: readonly (readonly string[])[];
  /** The source-file column index for each current-sheet column key. */
  columnIndexes: Readonly<Record<string, number>>;
  mapping: AdaptiveColumnMapping;
  rawLineage: AdaptiveRawLineage;
}>;

export class CanonicalWorksheetFileError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "CanonicalWorksheetFileError";
  }
}

type DelimiterCharacter = "\t" | ",";

const delimiterName = (delimiter: DelimiterCharacter): CanonicalWorksheetFileDelimiter =>
  delimiter === "\t" ? "tab" : "comma";

const normalizedHeader = (value: string): string => value.normalize("NFKC").trim();

/**
 * Parse a delimited UTF-8 text file while retaining empty cells and quoted
 * delimiters/newlines. The caller supplies the delimiter; this function never
 * guesses a biological schema from cell contents.
 */
export function parseCanonicalWorksheetRecords(
  text: string,
  delimiter: DelimiterCharacter,
): readonly (readonly string[])[] {
  const normalized = text.replace(/^\uFEFF/u, "").replace(/\r\n?/gu, "\n");
  if (!normalized.trim()) {
    throw new CanonicalWorksheetFileError(
      "ファイルが空です。見出し行と測定値を含むUTF-8の表を選択してください。",
    );
  }

  const rows: string[][] = [];
  let row: string[] = [];
  let field = "";
  let quoted = false;
  let justClosedQuote = false;

  const pushField = () => {
    row.push(field);
    field = "";
    justClosedQuote = false;
  };
  const pushRow = () => {
    pushField();
    rows.push(row);
    row = [];
  };

  for (let index = 0; index < normalized.length; index += 1) {
    const character = normalized[index]!;
    if (quoted) {
      if (character === '"') {
        if (normalized[index + 1] === '"') {
          field += '"';
          index += 1;
        } else {
          quoted = false;
          justClosedQuote = true;
        }
      } else {
        field += character;
      }
      continue;
    }

    if (character === '"' && field === "") {
      quoted = true;
    } else if (character === delimiter) {
      pushField();
    } else if (character === "\n") {
      pushRow();
    } else if (justClosedQuote && character.trim() !== "") {
      throw new CanonicalWorksheetFileError(
        "引用符の後ろに予期しない文字があります。CSV/TSVを確認してください。",
      );
    } else {
      field += character;
    }
  }
  if (quoted) {
    throw new CanonicalWorksheetFileError("引用符が閉じていないため、ファイルを読み込めません。");
  }
  if (field !== "" || row.length > 0 || !normalized.endsWith("\n")) pushRow();
  if (rows.length === 0 || rows[0]!.every((header) => !normalizedHeader(header))) {
    throw new CanonicalWorksheetFileError(
      "見出し行がありません。1行目に表の見出しを入れてください。",
    );
  }
  return rows;
}

function candidateIsRectangular(records: readonly (readonly string[])[]): boolean {
  const width = records[0]?.length ?? 0;
  return width > 1 && records.every((record) => record.length <= width);
}

function detectTextDelimiter(text: string): DelimiterCharacter {
  const candidates = (["\t", ","] as const).flatMap((delimiter) => {
    try {
      const records = parseCanonicalWorksheetRecords(text, delimiter);
      return candidateIsRectangular(records) ? [{ delimiter, records }] : [];
    } catch {
      return [];
    }
  });
  if (candidates.length === 1) return candidates[0]!.delimiter;
  if (candidates.length > 1) {
    throw new CanonicalWorksheetFileError(
      "TXTファイルの区切り文字を安全に判定できません。CSVまたはTSVとして保存してから読み込んでください。",
    );
  }
  throw new CanonicalWorksheetFileError(
    "CSV/TSVの区切り文字を確認できません。列を区切ったUTF-8の表を選択してください。",
  );
}

function sourceAndDelimiter(
  input: Readonly<{
    fileName: string;
    mimeType?: string;
    text: string;
  }>,
): { sourceKind: CanonicalWorksheetFileSourceKind; delimiter: DelimiterCharacter } {
  const lowerName = input.fileName.toLowerCase();
  const mimeType = input.mimeType?.toLowerCase() ?? "";
  if (lowerName.endsWith(".csv") || mimeType === "text/csv") {
    return { sourceKind: "csv", delimiter: "," };
  }
  if (lowerName.endsWith(".tsv") || mimeType === "text/tab-separated-values") {
    return { sourceKind: "tsv", delimiter: "\t" };
  }
  return { sourceKind: "generic_file", delimiter: detectTextDelimiter(input.text) };
}

function layoutHeaderMap(
  layout: CanonicalWorksheetFileLayout,
): Map<string, CanonicalWorksheetFileColumn> {
  const headers = new Map<string, CanonicalWorksheetFileColumn>();
  layout.columns.forEach((column) => {
    const candidates = [column.header, ...(column.aliases ?? [])];
    candidates.forEach((candidate) => {
      const normalized = normalizedHeader(candidate);
      if (!normalized) {
        throw new CanonicalWorksheetFileError(
          "入力表の見出しが空です。現在の表を更新してください。",
        );
      }
      const previous = headers.get(normalized);
      if (previous && previous.key !== column.key) {
        throw new CanonicalWorksheetFileError(
          "入力表の見出しが重複しています。現在の表を更新してください。",
        );
      }
      headers.set(normalized, column);
    });
  });
  return headers;
}

function fileMapping(
  input: Readonly<{
    headers: readonly string[];
    layout: CanonicalWorksheetFileLayout;
    sourceLabel: string;
    delimiter: DelimiterCharacter;
    now: string;
  }>,
): { columnIndexes: Readonly<Record<string, number>>; mapping: AdaptiveColumnMapping } {
  const expected = layoutHeaderMap(input.layout);
  const indexes: Record<string, number> = {};
  const seen = new Set<string>();
  input.headers.forEach((header, index) => {
    const normalized = normalizedHeader(header);
    const column = expected.get(normalized);
    if (!column) {
      throw new CanonicalWorksheetFileError(
        `現在の入力表にない見出し「${header || `列 ${index + 1}`}」があります。表の見出しをそのまま使ってください。`,
      );
    }
    if (seen.has(column.key)) {
      throw new CanonicalWorksheetFileError(`見出し「${header}」が重複しています。`);
    }
    seen.add(column.key);
    indexes[column.key] = index;
  });

  const missing = input.layout.columns.filter((column) => {
    if (seen.has(column.key)) return false;
    return !(input.layout.optionalRowLabel && column.role === "row_label");
  });
  if (missing.length > 0) {
    throw new CanonicalWorksheetFileError(
      `入力表の見出し「${missing.map(({ header }) => header).join("、")}」がありません。現在の表の見出しを1行目に残してください。`,
    );
  }

  const columns = Object.fromEntries(
    input.headers.map((header) => {
      const column = expected.get(normalizedHeader(header))!;
      if (column.role === "identity" && column.semanticKey) {
        return [header, { role: "identity" as const, semanticKey: column.semanticKey }];
      }
      if (column.role === "value" && column.semanticKey) {
        return [header, { role: "value" as const, semanticKey: column.semanticKey }];
      }
      return [header, { role: "metadata" as const, semanticKey: null }];
    }),
  );
  return {
    columnIndexes: indexes,
    mapping: AdaptiveColumnMappingSchema.parse({
      schemaVersion: "0.1.0",
      sourceLabel: input.sourceLabel,
      delimiter: delimiterName(input.delimiter),
      headerRow: 1,
      columns,
      confirmedAt: input.now,
    }),
  };
}

/**
 * Parse and validate a file against the already-generated worksheet layout.
 * No factor, level, identity, or readout is inferred from the file.
 */
export function parseCanonicalWorksheetFile(
  input: Readonly<{
    text: string;
    fileName: string;
    mimeType?: string;
    sourceLabel?: string;
    layout: CanonicalWorksheetFileLayout;
    now?: string;
  }>,
): CanonicalWorksheetFileImport {
  const now = input.now ?? new Date().toISOString();
  const { sourceKind, delimiter } = sourceAndDelimiter({
    fileName: input.fileName,
    mimeType: input.mimeType,
    text: input.text,
  });
  const records = parseCanonicalWorksheetRecords(input.text, delimiter);
  const headers = records[0]!.map((header) => normalizedHeader(header));
  const { columnIndexes, mapping } = fileMapping({
    headers,
    layout: input.layout,
    sourceLabel: input.sourceLabel?.trim() || input.fileName.trim() || "入力ファイル",
    delimiter,
    now,
  });
  const width = headers.length;
  const rows = records.slice(1).map((record) => {
    if (record.length > width) {
      throw new CanonicalWorksheetFileError(
        `データ行の列数が見出しと一致しません（${record.length}列）。既存の値は変更していません。`,
      );
    }
    return Array.from({ length: width }, (_, index) => record[index] ?? "");
  });
  const rawLineage = AdaptiveRawLineageSchema.parse({
    schemaVersion: "0.1.0",
    sourceKind,
    sourceLabel: input.sourceLabel?.trim() || input.fileName.trim() || "入力ファイル",
    importedAt: now,
    rawText: input.text,
    sha256: null,
    transformations: ["delimiter_detection", "confirmed_column_mapping", "typed_canonicalization"],
  });
  return {
    sourceKind,
    delimiter: delimiterName(delimiter),
    headers,
    rows,
    columnIndexes,
    mapping,
    rawLineage,
  };
}

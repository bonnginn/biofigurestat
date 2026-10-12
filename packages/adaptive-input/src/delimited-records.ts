export type RecordDelimiter = "\t" | "," | ";";

/** Retains cell text; normalizes file line endings without changing row boundaries inside quotes. */
export function parseDelimitedRecords(text: string, delimiter: RecordDelimiter): string[][] {
  const normalized = text.replace(/^\uFEFF/u, "").replace(/\r\n?/gu, "\n");
  if (!normalized) return [];
  const rows: string[][] = [];
  let row: string[] = [],
    field = "",
    quoted = false,
    closed = false;
  const pushField = () => {
    row.push(field);
    field = "";
    closed = false;
  };
  const pushRow = () => {
    pushField();
    rows.push(row);
    row = [];
  };
  for (let i = 0; i < normalized.length; i++) {
    const c = normalized[i]!;
    if (quoted) {
      if (c === '"') {
        if (normalized[i + 1] === '"') {
          field += '"';
          i++;
        } else {
          quoted = false;
          closed = true;
        }
      } else field += c;
    } else if (closed && c !== delimiter && c !== "\n") {
      throw new Error("DELIMITED_UNEXPECTED_AFTER_QUOTE");
    } else if (c === '"' && field === "" && !closed) quoted = true;
    else if (c === delimiter) pushField();
    else if (c === "\n") pushRow();
    else field += c;
  }
  if (quoted) throw new Error("DELIMITED_UNCLOSED_QUOTE");
  if (field !== "" || row.length > 0 || !normalized.endsWith("\n")) pushRow();
  return rows;
}

/** Count separators only outside quotes in the first nonblank logical header. */
export function detectRecordDelimiter(text: string): RecordDelimiter {
  const normalized = text.replace(/^\uFEFF/u, "").replace(/\r\n?/gu, "\n");
  const candidates: RecordDelimiter[] = ["\t", ",", ";"];
  const counts = [0, 0, 0];
  let quoted = false,
    nonblank = false,
    fieldStart = true;
  for (let i = 0; i < normalized.length; i++) {
    const c = normalized[i]!;
    if (quoted) {
      if (c === '"') {
        if (normalized[i + 1] === '"') i++;
        else quoted = false;
      }
      continue;
    }
    if (c === '"' && fieldStart) {
      quoted = true;
      nonblank = true;
      fieldStart = false;
    } else if (c === "\n") {
      if (nonblank) break;
      fieldStart = true;
    } else {
      const index = candidates.indexOf(c as RecordDelimiter);
      if (index >= 0) {
        counts[index] = counts[index]! + 1;
        nonblank = true;
        fieldStart = true;
      } else {
        if (c.trim()) nonblank = true;
        fieldStart = false;
      }
    }
  }
  return candidates[counts.indexOf(Math.max(...counts))]!;
}

export function encodeDelimitedCell(value: string, delimiter: RecordDelimiter): string {
  const normalized = value.replace(/\r\n?/gu, "\n");
  return normalized.includes(delimiter) || /["\n]/u.test(normalized)
    ? '"' + normalized.replace(/"/gu, '""') + '"'
    : normalized;
}

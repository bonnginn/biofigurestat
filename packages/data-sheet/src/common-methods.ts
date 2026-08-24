export type ContingencyPaste = Readonly<{
  rowLabels: string[];
  columnLabels: string[];
  counts: number[][];
}>;
export type LongValueRow = Readonly<{ unitId: string; condition: string; value: number }>;
export type XyRow = Readonly<{ unitId: string; x: number; y: number }>;

function table(text: string): string[][] {
  const lines = text
    .split(/\r?\n/u)
    .map((line) => line.trim())
    .filter(Boolean);
  if (lines.length < 2) throw new Error("A header and at least one data row are required");
  const delimiter = lines[0]!.includes("\t") ? "\t" : ",";
  return lines.map((line) => line.split(delimiter).map((cell) => cell.trim()));
}

export function parseContingencyPaste(text: string): ContingencyPaste {
  const rows = table(text);
  const columnLabels = rows[0]!.slice(1);
  if (columnLabels.length < 2 || new Set(columnLabels).size !== columnLabels.length)
    throw new Error("Contingency table requires at least two unique column categories");
  const rowLabels: string[] = [];
  const counts = rows.slice(1).map((row, index) => {
    const label = row[0] ?? "";
    if (!label || rowLabels.includes(label))
      throw new Error(`Contingency row ${index + 2} needs a unique category label`);
    rowLabels.push(label);
    if (row.length !== columnLabels.length + 1)
      throw new Error(`Contingency row ${index + 2} has the wrong number of cells`);
    return row.slice(1).map((cell) => {
      const value = Number(cell);
      if (!Number.isInteger(value) || value < 0)
        throw new Error(
          "Contingency data must be non-negative integer counts, not percentages or normalized values",
        );
      return value;
    });
  });
  if (rowLabels.length < 2)
    throw new Error("Contingency table requires at least two row categories");
  return { rowLabels, columnLabels, counts };
}

export function parseMatchedLongPaste(text: string): LongValueRow[] {
  const rows = table(text);
  const header = rows[0]!.map((cell) => cell.toLowerCase());
  const indexes = [header.indexOf("unit id"), header.indexOf("condition"), header.indexOf("value")];
  if (indexes.some((index) => index < 0))
    throw new Error("Repeated table header must contain Unit ID, Condition, Value");
  const seen = new Set<string>();
  return rows.slice(1).map((row, index) => {
    const unitId = row[indexes[0]!] ?? "",
      condition = row[indexes[1]!] ?? "",
      value = Number(row[indexes[2]!]);
    if (!unitId || !condition || !Number.isFinite(value))
      throw new Error(`Repeated row ${index + 2} is incomplete`);
    const key = `${unitId}\u0000${condition}`;
    if (seen.has(key)) throw new Error(`Repeated unit ${unitId} has duplicate ${condition} values`);
    seen.add(key);
    return { unitId, condition, value };
  });
}

export function parseXyPaste(text: string): XyRow[] {
  const rows = table(text);
  const header = rows[0]!.map((cell) => cell.toLowerCase());
  const unitIndex = header.indexOf("unit id"),
    xIndex = header.indexOf("x"),
    yIndex = header.indexOf("y");
  if ([unitIndex, xIndex, yIndex].some((index) => index < 0))
    throw new Error("Regression table header must contain Unit ID, X, Y");
  const seen = new Set<string>();
  return rows.slice(1).map((row, index) => {
    const unitId = row[unitIndex] ?? "",
      x = Number(row[xIndex]),
      y = Number(row[yIndex]);
    if (!unitId || !Number.isFinite(x) || !Number.isFinite(y))
      throw new Error(`Regression row ${index + 2} is incomplete`);
    if (seen.has(unitId)) throw new Error(`Regression unit ${unitId} appears more than once`);
    seen.add(unitId);
    return { unitId, x, y };
  });
}

export function parseDistributionPaste(text: string): number[] {
  const cells = text
    .split(/[\s,]+/u)
    .map((cell) => cell.trim())
    .filter(Boolean);
  const values = cells.map(Number);
  if (values.length === 0 || values.some((value) => !Number.isFinite(value)))
    throw new Error("Distribution data must contain only finite numeric source values");
  return values;
}

export interface RawMappingSpec {
  file: string;
  delimiter?: "," | "\t";
  identityColumns: string[];
  factorColumns: string[];
  valueColumns: string[];
  metadataColumns?: string[];
  filenameColumn?: string;
  filenamePattern?: RegExp;
  filenameGroups?: string[];
  wideAxisHeaderPattern?: RegExp;
  missingTokens?: string[];
  headerAliases?: Record<string, string>;
  headerRequiredAny?: string[];
  deriveFollowUpDays?: { start: string; endCandidates: string[]; output: string };
}

export interface RawMappingResult {
  file: string;
  success: boolean;
  sourceRows: number;
  mappedRows: number;
  headerLine: number;
  identityFields: string[];
  factorFields: string[];
  valueFields: string[];
  axisFields: string[];
  metadataFields: string[];
  missingValueCount: number;
  filenameDerivedFields: string[];
  targetedConfirmations: string[];
  warnings: string[];
  normalizedRows: Array<Record<string, string | number | null>>;
}

function splitLine(line: string, delimiter: string): string[] {
  const cells: string[] = [];
  let current = "";
  let quoted = false;
  for (let index = 0; index < line.length; index++) {
    const char = line[index]!;
    if (char === '"') {
      if (quoted && line[index + 1] === '"') {
        current += '"';
        index++;
      } else quoted = !quoted;
    } else if (char === delimiter && !quoted) {
      cells.push(current.trim());
      current = "";
    } else current += char;
  }
  cells.push(current.trim());
  return cells;
}

function detectDelimiter(lines: string[]): "," | "\t" {
  const sample = lines.slice(0, 8).join("\n");
  return (sample.match(/\t/g)?.length ?? 0) > (sample.match(/,/g)?.length ?? 0) ? "\t" : ",";
}

function normalizeHeader(header: string, aliases: Record<string, string>): string {
  const clean = header.replace(/^\uFEFF/, "").trim();
  return aliases[clean] ?? clean;
}

export function parseDelimitedWithHeaderDetection(text: string, spec: RawMappingSpec): {
  headerLine: number;
  headers: string[];
  rows: string[][];
} {
  const lines = text.replace(/\r\n/g, "\n").split("\n").filter((line) => line.trim().length > 0);
  const delimiter = spec.delimiter ?? detectDelimiter(lines);
  const aliases = spec.headerAliases ?? {};
  const expected = new Set([...spec.identityColumns, ...spec.factorColumns, ...spec.valueColumns, ...(spec.headerRequiredAny ?? [])]);
  let bestIndex = 0;
  let bestScore = -1;
  for (let index = 0; index < Math.min(lines.length, 12); index++) {
    const headers = splitLine(lines[index]!, delimiter).map((header) => normalizeHeader(header, aliases));
    const score = headers.filter((header) => expected.has(header) || spec.wideAxisHeaderPattern?.test(header)).length * 10 + headers.length;
    if (score > bestScore) {
      bestScore = score;
      bestIndex = index;
    }
  }
  const headers = splitLine(lines[bestIndex]!, delimiter).map((header) => normalizeHeader(header, aliases));
  const rows = lines.slice(bestIndex + 1).map((line) => splitLine(line, delimiter));
  return { headerLine: bestIndex + 1, headers, rows };
}

const numericOrText = (value: string): string | number => {
  const numeric = Number(value);
  return value !== "" && Number.isFinite(numeric) ? numeric : value;
};

function daysBetween(start: string, end: string): number | null {
  const startMs = Date.parse(`${start}T00:00:00Z`);
  const endMs = Date.parse(`${end}T00:00:00Z`);
  if (!Number.isFinite(startMs) || !Number.isFinite(endMs)) return null;
  return Math.round((endMs - startMs) / 86_400_000);
}

export function mapRawText(text: string, spec: RawMappingSpec): RawMappingResult {
  const parsed = parseDelimitedWithHeaderDetection(text, spec);
  const missingTokens = new Set(["", "NA", "N/A", "Undetermined", "OVER", ...(spec.missingTokens ?? [])]);
  const axisHeaders = parsed.headers.filter((header) => spec.wideAxisHeaderPattern?.test(header));
  const filenameDerived = new Set<string>();
  const normalizedRows: Array<Record<string, string | number | null>> = [];
  let missingValueCount = 0;
  const warnings: string[] = [];

  for (const cells of parsed.rows) {
    const raw = Object.fromEntries(parsed.headers.map((header, index) => [header, cells[index] ?? ""]));
    const base: Record<string, string | number | null> = {};
    for (const [header, value] of Object.entries(raw)) {
      if (missingTokens.has(value)) {
        base[header] = null;
        if (spec.valueColumns.includes(header) || axisHeaders.includes(header)) missingValueCount++;
      } else base[header] = numericOrText(value);
    }
    if (spec.filenameColumn && spec.filenamePattern && typeof raw[spec.filenameColumn] === "string") {
      const match = spec.filenamePattern.exec(raw[spec.filenameColumn]);
      if (match) {
        spec.filenameGroups?.forEach((group, index) => {
          base[group] = match[index + 1] ?? null;
          filenameDerived.add(group);
        });
      } else warnings.push(`filename_not_matched:${raw[spec.filenameColumn]}`);
    }
    if (spec.deriveFollowUpDays) {
      const start = raw[spec.deriveFollowUpDays.start] ?? "";
      const end = spec.deriveFollowUpDays.endCandidates.map((key) => raw[key]).find((value) => value);
      base[spec.deriveFollowUpDays.output] = end ? daysBetween(start, end) : null;
    }
    normalizedRows.push(base);
  }

  const required = [...spec.identityColumns, ...spec.factorColumns];
  const missingRequiredHeaders = required.filter(
    (field) => !parsed.headers.includes(field) && !filenameDerived.has(field),
  );
  if (missingRequiredHeaders.length) warnings.push(`missing_required_headers:${missingRequiredHeaders.join("|")}`);
  const targetedConfirmations: string[] = [];
  if (filenameDerived.size > 0) targetedConfirmations.push("confirm_filename_token_mapping");
  if (axisHeaders.length > 0) targetedConfirmations.push("confirm_wide_axis_unit_and_order");
  if (missingValueCount > 0) targetedConfirmations.push("classify_missingness_reason");

  return {
    file: spec.file,
    success: missingRequiredHeaders.length === 0 && normalizedRows.length > 0,
    sourceRows: parsed.rows.length,
    mappedRows: normalizedRows.length,
    headerLine: parsed.headerLine,
    identityFields: spec.identityColumns,
    factorFields: spec.factorColumns,
    valueFields: spec.valueColumns,
    axisFields: axisHeaders,
    metadataFields: spec.metadataColumns ?? [],
    missingValueCount,
    filenameDerivedFields: [...filenameDerived],
    targetedConfirmations,
    warnings: [...new Set(warnings)],
    normalizedRows,
  };
}

export const RAW_MAPPING_SPECS: RawMappingSpec[] = [
  {
    file: "RAW-01-imagej-results.csv",
    identityColumns: ["DishID", "FieldID", "CellID"],
    factorColumns: ["Treatment"],
    valueColumns: ["Area", "Mean"],
    metadataColumns: ["Min", "Max", "X", "Y", "Slice"],
    filenameColumn: "Image",
    filenamePattern: /^(D\d+)_(.+)_(F\d+)\.tif$/,
    filenameGroups: ["DishID", "Treatment", "FieldID"],
    headerAliases: { Label: "CellID" },
  },
  {
    file: "RAW-02-plate-reader-export.csv",
    identityColumns: ["Sample"],
    factorColumns: [],
    valueColumns: ["OD450"],
    metadataColumns: ["Well", "Flag"],
    missingTokens: ["Overflow"],
  },
  {
    file: "RAW-03-wb-densitometry.tsv",
    delimiter: "\t",
    identityColumns: ["SampleName", "Lane"],
    factorColumns: ["Band"],
    valueColumns: ["IntegratedDensity", "Background"],
    metadataColumns: ["Image", "Comment"],
  },
  {
    file: "RAW-04-animal-longitudinal.csv",
    identityColumns: ["Mouse"],
    factorColumns: ["Group", "Sex"],
    valueColumns: [],
    metadataColumns: ["Notes"],
    wideAxisHeaderPattern: /^Wk\d+$/,
  },
  {
    file: "RAW-05-filename-metadata.csv",
    identityColumns: ["DishID", "FieldID", "CellID"],
    factorColumns: ["Treatment"],
    valueColumns: ["MeanIntensity", "Area_px"],
    metadataColumns: ["QC"],
    filenameColumn: "FileName",
    filenamePattern: /^\d+_(Dish\d+)_(.+)_T(\d+)m_(F\d+)_C(\d+)\.tif$/,
    filenameGroups: ["DishID", "Treatment", "Time_min", "FieldID", "CellID"],
  },
  {
    file: "RAW-06-qpcr-ct.csv",
    identityColumns: ["Sample", "Well"],
    factorColumns: ["Target"],
    valueColumns: ["Cq"],
    metadataColumns: ["Call", "Plate"],
  },
  {
    file: "RAW-07-survival-log.csv",
    identityColumns: ["AnimalID"],
    factorColumns: ["Arm"],
    valueColumns: ["Status"],
    metadataColumns: ["Reason", "Operator"],
    deriveFollowUpDays: { start: "StartDate", endCandidates: ["EndpointDate", "LastSeenDate"], output: "FollowUpDays" },
  },
  {
    file: "RAW-08-dose-response.csv",
    identityColumns: ["Donor", "Well"],
    factorColumns: ["Compound", "Dose_uM"],
    valueColumns: ["Value"],
    metadataColumns: ["Plate", "Readout", "QC"],
  },
  {
    file: "RAW-09-organoid-hierarchy.csv",
    identityColumns: ["Patient", "Organoid", "Image", "ROI"],
    factorColumns: ["Treatment"],
    valueColumns: ["Area_um2"],
    metadataColumns: ["FocusScore"],
  },
  {
    file: "RAW-10-partial-pairs.csv",
    identityColumns: ["PatientID", "SpecimenBarcode"],
    factorColumns: ["Tissue"],
    valueColumns: ["ProteinAA_ng_mg"],
    metadataColumns: ["RIN", "Comment"],
  },
  {
    file: "RAW-11-flow-counts.csv",
    identityColumns: ["Sample", "FCS_File"],
    factorColumns: ["Treatment", "Gate"],
    valueColumns: ["Count", "ParentCount"],
    metadataColumns: ["AcquiredEvents"],
  },
  {
    file: "RAW-12-kinetic-plate.csv",
    identityColumns: ["PlateID", "Well"],
    factorColumns: ["Treatment"],
    valueColumns: [],
    wideAxisHeaderPattern: /^\d+ min$/,
  },
];

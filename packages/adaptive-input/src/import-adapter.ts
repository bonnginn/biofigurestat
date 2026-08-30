import {
  AdaptiveColumnMappingSchema,
  AdaptiveRawLineageSchema,
  CanonicalAdaptiveObservationSchema,
  type AdaptiveColumnMapping,
  type AdaptiveRawLineage,
  type CanonicalAdaptiveObservation,
  type StructureContract,
} from "@lsaa/domain";
import { assertCanonicalObservationsForContract } from "./observation-validator";

export type DelimitedSourceKind = "clipboard" | "csv" | "tsv" | "generic_file";

export type ParsedAdaptiveInput = Readonly<{
  headers: readonly string[];
  rows: readonly (readonly string[])[];
  delimiter: "comma" | "tab" | "semicolon";
  headerRow: number;
}>;

function splitLine(line: string, delimiter: string): string[] {
  const cells: string[] = [];
  let value = "";
  let quoted = false;
  for (let index = 0; index < line.length; index++) {
    const character = line[index]!;
    if (character === '"') {
      if (quoted && line[index + 1] === '"') { value += '"'; index++; }
      else quoted = !quoted;
    } else if (character === delimiter && !quoted) { cells.push(value.trim()); value = ""; }
    else value += character;
  }
  cells.push(value.trim());
  return cells;
}

function detectDelimiter(text: string): { character: string; name: ParsedAdaptiveInput["delimiter"] } {
  const sample = text.split(/\r?\n/).slice(0, 8).join("\n");
  const candidates = [
    { character: "\t", name: "tab" as const, count: sample.match(/\t/g)?.length ?? 0 },
    { character: ",", name: "comma" as const, count: sample.match(/,/g)?.length ?? 0 },
    { character: ";", name: "semicolon" as const, count: sample.match(/;/g)?.length ?? 0 },
  ];
  return candidates.sort((left, right) => right.count - left.count)[0]!;
}

export function parseAdaptiveDelimited(text: string): ParsedAdaptiveInput {
  const lines = text.replace(/\r\n/g, "\n").split("\n").filter((line) => line.trim());
  if (!lines.length) throw new Error("ADAPTIVE_INPUT_EMPTY");
  const delimiter = detectDelimiter(text);
  const headers = splitLine(lines[0]!, delimiter.character).map((header) => header.replace(/^\uFEFF/, ""));
  return { headers, rows: lines.slice(1).map((line) => splitLine(line, delimiter.character)), delimiter: delimiter.name, headerRow: 1 };
}

const normalize = (value: string) => value.normalize("NFKC").trim().toLowerCase().replace(/[^a-z0-9]+/g, "");

export function suggestAdaptiveColumnMapping(
  contract: StructureContract,
  parsed: ParsedAdaptiveInput,
  sourceLabel: string,
  now = new Date().toISOString(),
): AdaptiveColumnMapping {
  const candidates = [
    ...contract.identities.map((item) => ({ role: "identity" as const, key: item.key, labels: [item.key, item.label] })),
    ...contract.factors.map((item) => ({ role: "factor" as const, key: item.key, labels: [item.key, item.label] })),
    ...contract.orderedAxes.map((item) => ({ role: "axis" as const, key: item.key, labels: [item.key, item.label] })),
    ...contract.unitLevels.filter((item) => item.key !== contract.experimentalUnitLevelKey).map((item) => ({ role: "hierarchy" as const, key: item.key, labels: [item.key, item.label] })),
    ...contract.readouts.flatMap((readout) => readout.componentKeys.map((component) => ({ role: "value" as const, key: readout.representation === "scalar" ? readout.key : `${readout.key}_${component}`, labels: [readout.key, readout.label, component, `${readout.label} ${component}`] }))),
  ];
  const columns = Object.fromEntries(parsed.headers.map((header) => {
    const match = candidates.find((candidate) => candidate.labels.some((label) => normalize(label) === normalize(header)));
    return [header, match ? { role: match.role, semanticKey: match.key } : { role: "metadata" as const, semanticKey: null }];
  }));
  return AdaptiveColumnMappingSchema.parse({ schemaVersion: "0.1.0", sourceLabel, delimiter: parsed.delimiter, headerRow: parsed.headerRow, columns, confirmedAt: now });
}

const numericOrText = (value: string): string | number => value !== "" && Number.isFinite(Number(value)) ? Number(value) : value;

function identityAppliesToReadout(
  contract: StructureContract,
  readout: StructureContract["readouts"][number],
  identity: StructureContract["identities"][number],
): boolean {
  const levels = new Map(contract.unitLevels.map((level) => [level.key, level]));
  let level = levels.get(readout.observationLevelKey);
  while (level) {
    if (level.key === identity.unitLevelKey) return true;
    level = level.parentKey ? levels.get(level.parentKey) : undefined;
  }
  return false;
}

export function canonicalizeAdaptiveRows(
  contract: StructureContract,
  parsed: ParsedAdaptiveInput,
  mapping: AdaptiveColumnMapping,
): { observations: CanonicalAdaptiveObservation[]; confirmations: string[] } {
  const missingTokens = new Set(["", "NA", "N/A", "Undetermined", "OVER"]);
  const confirmations = new Set<string>();
  const observations = parsed.rows.flatMap((row, rowIndex) => {
    const identities: Record<string, string> = {};
    const factors: Record<string, string> = {};
    const axes: Record<string, string | number> = {};
    const hierarchy: Record<string, string> = {};
    const values: Record<string, string | number | boolean | null> = {};
    const missingness: Record<string, "unknown"> = {};
    parsed.headers.forEach((header, columnIndex) => {
      const assignment = mapping.columns[header];
      if (!assignment?.semanticKey || ["ignore", "metadata"].includes(assignment.role)) return;
      const raw = row[columnIndex] ?? "";
      if (assignment.role === "identity") identities[assignment.semanticKey] = raw;
      if (assignment.role === "factor") factors[assignment.semanticKey] = raw;
      if (assignment.role === "axis") axes[assignment.semanticKey] = numericOrText(raw);
      if (assignment.role === "hierarchy") hierarchy[assignment.semanticKey] = raw;
      if (assignment.role === "value") {
        values[assignment.semanticKey] = missingTokens.has(raw) ? null : numericOrText(raw);
        if (missingTokens.has(raw)) { missingness[assignment.semanticKey] = "unknown"; confirmations.add("classify_missingness_reason"); }
      }
    });
    for (const factor of contract.factors) {
      const value = factors[factor.key];
      if (value !== undefined && !factor.levels.includes(value)) throw new Error(`ADAPTIVE_UNKNOWN_FACTOR_LEVEL:${factor.key}:${value}`);
    }
    const readoutsInRow = contract.readouts.filter((candidate) =>
      Object.keys(values).some(
        (key) => key === candidate.key || key.startsWith(`${candidate.key}_`),
      ),
    );
    // A typed-record paste may be wide (one source row contains several
    // readouts from the same unit).  Keep one canonical observation per
    // readout instead of assigning the complete row to whichever readout
    // happens to be listed first.  A conventional one-readout row retains
    // the historical ID shape for round-trip compatibility.
    const rowReadouts = readoutsInRow.length ? readoutsInRow : [contract.readouts[0]!];
    return rowReadouts.map((readout, readoutIndex) => {
      for (const identity of contract.identities.filter(
        (candidate) => candidate.required && identityAppliesToReadout(contract, readout, candidate),
      )) {
        if (!identities[identity.key])
          throw new Error(
            `ADAPTIVE_REQUIRED_IDENTITY_MISSING:${identity.key}:row_${rowIndex + 2}`,
          );
      }
      const readoutValues = Object.fromEntries(
        Object.entries(values).filter(
          ([key]) => key === readout.key || key.startsWith(`${readout.key}_`),
        ),
      );
      const readoutMissingness = Object.fromEntries(
        Object.entries(missingness).filter(
          ([key]) => key === readout.key || key.startsWith(`${readout.key}_`),
        ),
      );
      const observationId =
        rowReadouts.length === 1
          ? `adaptive.${contract.contractId}.${rowIndex + 1}`
          : `adaptive.${contract.contractId}.${rowIndex + 1}.${readoutIndex + 1}`;
      return CanonicalAdaptiveObservationSchema.parse({
        observationId,
        readoutKey: readout.key,
        identities,
        factors,
        axes,
        hierarchy,
        values: readoutValues,
        missingness: readoutMissingness,
        sourceRow: rowIndex + 2,
      });
    });
  });
  assertCanonicalObservationsForContract(contract, observations);
  return { observations, confirmations: [...confirmations] };
}

export function createAdaptiveRawLineage(sourceKind: DelimitedSourceKind, sourceLabel: string, rawText: string, now = new Date().toISOString()): AdaptiveRawLineage {
  return AdaptiveRawLineageSchema.parse({ schemaVersion: "0.1.0", sourceKind, sourceLabel, importedAt: now, rawText, sha256: null, transformations: ["delimiter_detection", "confirmed_column_mapping", "typed_canonicalization"] });
}

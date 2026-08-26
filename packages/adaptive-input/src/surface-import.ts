import {
  AdaptiveColumnMappingSchema,
  CanonicalAdaptiveObservationSchema,
  type AdaptiveColumnMapping,
  type CanonicalAdaptiveObservation,
  type StructureContract,
} from "@lsaa/domain";
import {
  canonicalizeAdaptiveRows,
  createAdaptiveRawLineage,
  parseAdaptiveDelimited,
  suggestAdaptiveColumnMapping,
  type DelimitedSourceKind,
} from "./import-adapter";
import { selectAdaptiveSurface } from "./surface-selector";

export type SurfaceImportResult = Readonly<{
  observations: readonly CanonicalAdaptiveObservation[];
  mapping: AdaptiveColumnMapping;
  lineage: ReturnType<typeof createAdaptiveRawLineage>;
  confirmations: readonly string[];
}>;

const normalize = (value: string | number) => String(value).normalize("NFKC").trim().toLowerCase();
const value = (raw: string): string | number | null => raw === "" || ["NA", "N/A"].includes(raw) ? null : Number.isFinite(Number(raw)) ? Number(raw) : raw;

export function importForSelectedSurface(
  contract: StructureContract,
  text: string,
  sourceKind: DelimitedSourceKind,
  sourceLabel: string,
  now = new Date().toISOString(),
): SurfaceImportResult {
  const surface = selectAdaptiveSurface(contract).surfaceId;
  const parsed = parseAdaptiveDelimited(text);
  const readout = contract.readouts[0]!;
  const identityHeaders = new Map(contract.identities.map((identity) => [normalize(identity.label), identity]));
  const factorHeaders = new Map(contract.factors.map((factor) => [normalize(factor.label), factor]));
  const observations: CanonicalAdaptiveObservation[] = [];
  const confirmations = new Set<string>();

  if (surface === "compact_unit_matrix") {
    const factor = contract.factors.find((item) => item.unitRole === "within_unit") ?? contract.factors[0];
    if (!factor || contract.readouts.length !== 1) throw new Error("ADAPTIVE_COMPACT_REQUIRES_ONE_FACTOR_AND_READOUT");
    parsed.rows.forEach((row, rowIndex) => {
      const identities = Object.fromEntries(parsed.headers.flatMap((header, index) => {
        const identity = identityHeaders.get(normalize(header));
        return identity ? [[identity.key, row[index] ?? ""]] : [];
      }));
      factor.levels.forEach((level) => {
        const columnIndex = parsed.headers.findIndex((header) => normalize(header) === normalize(level));
        if (columnIndex < 0) throw new Error(`ADAPTIVE_COMPACT_LEVEL_COLUMN_MISSING:${level}`);
        const parsedValue = value(row[columnIndex] ?? "");
        const missingness = parsedValue === null ? { [readout.key]: "unknown" as const } : {};
        if (parsedValue === null) confirmations.add("classify_missingness_reason");
        observations.push(CanonicalAdaptiveObservationSchema.parse({ observationId: `adaptive.${contract.contractId}.${rowIndex + 1}.${factor.levels.indexOf(level) + 1}`, readoutKey: readout.key, identities, factors: { [factor.key]: level }, axes: {}, hierarchy: {}, values: { [readout.key]: parsedValue }, missingness, sourceRow: rowIndex + 2 }));
      });
    });
  } else if (surface === "repeated_axis_matrix") {
    const axis = contract.orderedAxes[0];
    if (!axis || contract.readouts.length !== 1) throw new Error("ADAPTIVE_REPEATED_REQUIRES_ONE_AXIS_AND_READOUT");
    parsed.rows.forEach((row, rowIndex) => {
      const identities = Object.fromEntries(parsed.headers.flatMap((header, index) => {
        const identity = identityHeaders.get(normalize(header));
        return identity ? [[identity.key, row[index] ?? ""]] : [];
      }));
      const factors = Object.fromEntries(parsed.headers.flatMap((header, index) => {
        const factor = factorHeaders.get(normalize(header));
        return factor ? [[factor.key, row[index] ?? ""]] : [];
      }));
      axis.levels.forEach((level) => {
        const columnIndex = parsed.headers.findIndex((header) => normalize(header) === normalize(level) || normalize(header) === normalize(`${axis.label} ${level}`));
        if (columnIndex < 0) throw new Error(`ADAPTIVE_AXIS_LEVEL_COLUMN_MISSING:${level}`);
        const parsedValue = value(row[columnIndex] ?? "");
        const missingness = parsedValue === null ? { [readout.key]: "unknown" as const } : {};
        if (parsedValue === null) confirmations.add("classify_missingness_reason");
        observations.push(CanonicalAdaptiveObservationSchema.parse({ observationId: `adaptive.${contract.contractId}.${rowIndex + 1}.${axis.levels.indexOf(level) + 1}`, readoutKey: readout.key, identities, factors, axes: { [axis.key]: level }, hierarchy: {}, values: { [readout.key]: parsedValue }, missingness, sourceRow: rowIndex + 2 }));
      });
    });
  } else {
    const suggested = suggestAdaptiveColumnMapping(contract, parsed, sourceLabel, now);
    const result = canonicalizeAdaptiveRows(contract, parsed, suggested);
    observations.push(...result.observations);
    result.confirmations.forEach((item) => confirmations.add(item));
  }

  const columns = Object.fromEntries(parsed.headers.map((header) => {
    const identity = identityHeaders.get(normalize(header));
    const betweenFactor = factorHeaders.get(normalize(header));
    if (identity) return [header, { role: "identity" as const, semanticKey: identity.key }];
    if (surface === "repeated_axis_matrix" && betweenFactor) return [header, { role: "factor" as const, semanticKey: betweenFactor.key }];
    if (surface === "compact_unit_matrix") {
      const factor = contract.factors.find((item) => item.unitRole === "within_unit") ?? contract.factors[0]!;
      const level = factor.levels.find((candidate) => normalize(candidate) === normalize(header));
      if (level) return [header, { role: "value" as const, semanticKey: readout.key, fixedFactors: { [factor.key]: level } }];
    }
    if (surface === "repeated_axis_matrix") {
      const axis = contract.orderedAxes[0]!;
      const level = axis.levels.find((candidate) => normalize(candidate) === normalize(header) || normalize(`${axis.label} ${candidate}`) === normalize(header));
      if (level !== undefined) return [header, { role: "value" as const, semanticKey: readout.key, fixedAxes: { [axis.key]: level } }];
    }
    return [header, { role: "metadata" as const, semanticKey: null }];
  }));
  const mapping = surface === "compact_unit_matrix" || surface === "repeated_axis_matrix"
    ? AdaptiveColumnMappingSchema.parse({ schemaVersion: "0.1.0", sourceLabel, delimiter: parsed.delimiter, headerRow: 1, columns, confirmedAt: now })
    : suggestAdaptiveColumnMapping(contract, parsed, sourceLabel, now);
  return { observations, mapping, lineage: createAdaptiveRawLineage(sourceKind, sourceLabel, text, now), confirmations: [...confirmations] };
}

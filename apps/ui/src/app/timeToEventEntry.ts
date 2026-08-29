import {
  AdaptiveColumnMappingSchema,
  AdaptiveInputSnapshotSchema,
  AdaptiveRawLineageSchema,
  CanonicalAdaptiveObservationSchema,
  STRUCTURE_CONTRACT_VERSION,
  StructureContractSchema,
  type AdaptiveInputSnapshot,
  type AdaptiveRawLineage,
  type DualWriteEquivalence,
  type ExperimentDesign,
  type StructureContract,
} from "@lsaa/domain";
import {
  parseAdaptiveDelimited,
  resolveEntryModule,
  selectAdaptiveSurface,
  semanticKey,
  type EntryModuleResolution,
  type ParsedAdaptiveInput,
  type SubjectUnitRelationship,
  type TimeToEventPattern,
} from "@lsaa/adaptive-input";
import {
  SurvivalSheetRowSchema,
  type SurvivalPasteOptions,
  type SurvivalSheetRow,
} from "@lsaa/data-sheet";
import { createTimeToEventContractProjection } from "./timeToEventProjection";

export type TimeToEventEntryInput = Readonly<{
  experimentName: string;
  experimentDescription: string;
  subjectUnitLabel: string;
  subjectUnitRelationship: SubjectUnitRelationship;
  tsvText: string;
  timeToEventPattern: TimeToEventPattern;
  sourceLabel?: string;
  sourceKind?: "clipboard" | "csv" | "tsv" | "generic_file";
  followUpUnit?: string;
  numericStatusMapping?: Readonly<{ event: "0" | "1"; censored: "0" | "1" }>;
  now?: string;
}>;

export type TimeToEventDualWriteAssessment = Readonly<{
  status: "evaluated" | "stopped_before_projection";
  equivalence: DualWriteEquivalence | null;
  diagnostics: readonly string[];
}>;

type TimeToEventEntryBase = Readonly<{
  entryResolution: EntryModuleResolution;
  rawLineage: AdaptiveRawLineage;
  dualWrite: TimeToEventDualWriteAssessment;
}>;

export type TimeToEventEntryResult =
  | (TimeToEventEntryBase &
      Readonly<{
        status: "surface_ready";
        contract: StructureContract;
        snapshot: AdaptiveInputSnapshot;
        design: ExperimentDesign;
      }>)
  | (TimeToEventEntryBase &
      Readonly<{
        status: "contract_deferred" | "needs_targeted_facts" | "safe_unsupported";
        contract: null;
        snapshot: null;
        design: null;
      }>)
  | (TimeToEventEntryBase &
      Readonly<{
        status: "input_mapping_required" | "input_invalid" | "dual_write_mismatch";
        contract: StructureContract | null;
        snapshot: null;
        design: ExperimentDesign | null;
      }>);

const requiredAliases = {
  identity: new Set([
    "unit id", "unit", "subject id", "subject", "sample id", "animal id", "animal",
    "mouse id", "mouse", "個体id", "動物id", "マウスid",
  ]),
  group: new Set([
    "group", "condition", "condition id", "treatment", "cohort", "arm", "群", "条件", "処置",
  ]),
  followUp: new Set([
    "follow-up time", "follow up time", "follow-up", "time-to-event", "survival time",
    "duration", "time", "追跡時間", "生存時間",
  ]),
  status: new Set([
    "event/censor status", "event status", "censoring status", "status", "event", "outcome",
    "状態", "イベント",
  ]),
} as const;

const normalizedHeader = (value: string): string =>
  value
    .normalize("NFKC")
    .replace(/^\uFEFF/u, "")
    .trim()
    .toLowerCase()
    .replace(/\s*[（(][^）)]*[）)]\s*$/u, "");

function parseTimeToEventStatus(value: string, options: SurvivalPasteOptions): boolean {
  const normalized = value.normalize("NFKC").trim().toLowerCase();
  if (
    ["event", "observed", "event observed", "死亡", "イベント", "イベント発生"].includes(
      normalized,
    )
  )
    return true;
  if (["censored", "censor", "打ち切り", "観察終了", "生存"].includes(normalized))
    return false;
  const mapping = options.numericStatusMapping;
  if (mapping && mapping.event !== mapping.censored && normalized === mapping.event) return true;
  if (mapping && mapping.event !== mapping.censored && normalized === mapping.censored)
    return false;
  throw new Error(
    `Invalid survival status '${value}'. Use Event/Censored（死亡・イベント発生／打ち切り・観察終了）or select an explicit numeric mapping.`,
  );
}

/**
 * Parses the values and headers from one shared adaptive delimited table. This
 * keeps quoted CSV and semicolon inputs identical between compilation, mapping,
 * and the experiment-first graph preview.
 */
export function parseTimeToEventTable(
  text: string,
  options: SurvivalPasteOptions = {},
): Readonly<{ parsed: ParsedAdaptiveInput; rows: SurvivalSheetRow[] }> {
  const parsed = parseAdaptiveDelimited(text);
  if (parsed.rows.length === 0)
    throw new Error("Survival paste requires a header and at least one row");
  const headers = parsed.headers.map(normalizedHeader);
  const column = (aliases: ReadonlySet<string>) =>
    headers.findIndex((header) => aliases.has(header));
  const indexes = {
    identity: column(requiredAliases.identity),
    group: column(requiredAliases.group),
    followUp: column(requiredAliases.followUp),
    status: column(requiredAliases.status),
  };
  if (Object.values(indexes).some((index) => index < 0)) {
    const missing = Object.entries(indexes)
      .filter(([, index]) => index < 0)
      .map(([key]) =>
        key === "identity"
          ? "個体ID"
          : key === "group"
            ? "群・処置"
            : key === "followUp"
              ? "追跡時間"
              : "Event/Censored状態",
      );
    throw new Error(`Survival表に必要な列がありません: ${missing.join("、")}`);
  }
  const requiredColumns = new Set(Object.values(indexes));
  const seen = new Set<string>();
  const rows = parsed.rows.map((cells, rowIndex) => {
    const unitId = cells[indexes.identity]?.trim() ?? "";
    const conditionId = cells[indexes.group]?.trim() ?? "";
    const followUpText = cells[indexes.followUp]?.trim() ?? "";
    const statusText = cells[indexes.status]?.trim() ?? "";
    if (!unitId || !conditionId || !followUpText || !statusText) {
      throw new Error(`Survival row ${rowIndex + 2} has a missing required value`);
    }
    if (seen.has(unitId)) throw new Error(`Duplicate survival unit ID '${unitId}'`);
    seen.add(unitId);
    return SurvivalSheetRowSchema.parse({
      unitId,
      conditionId,
      followUpTime: Number(followUpText),
      eventObserved: parseTimeToEventStatus(statusText, options),
      metadata: Object.fromEntries(
        parsed.headers.flatMap((header, index) =>
          requiredColumns.has(index) || !header ? [] : [[header, cells[index] ?? ""]],
        ),
      ),
    });
  });
  return { parsed, rows };
}

function inputLineage(input: TimeToEventEntryInput, now: string): AdaptiveRawLineage {
  return AdaptiveRawLineageSchema.parse({
    schemaVersion: "0.1.0",
    sourceKind: input.sourceKind ?? "clipboard",
    sourceLabel: input.sourceLabel?.trim() || "time-to-event.tsv",
    importedAt: now,
    rawText: input.tsvText,
    sha256: null,
    transformations: [],
  });
}

function stoppedDualWrite(diagnostics: readonly string[]): TimeToEventDualWriteAssessment {
  return {
    status: "stopped_before_projection",
    equivalence: null,
    diagnostics: [...diagnostics],
  };
}

function issueCode(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

function isNumericStatusMappingIssue(error: unknown): boolean {
  return /explicit numeric mapping/iu.test(issueCode(error));
}

function sourceColumns(
  parsed: ParsedAdaptiveInput,
  semanticKeys: Readonly<{
    identity: string;
    group: string;
    followUpAxis: string;
    eventObservedValue: string;
  }>,
  sourceLabel: string,
  confirmedAt: string,
) {
  const roleFor = (header: string) => {
    const normalized = normalizedHeader(header);
    if (requiredAliases.identity.has(normalized))
      return { role: "identity" as const, semanticKey: semanticKeys.identity };
    if (requiredAliases.group.has(normalized))
      return { role: "factor" as const, semanticKey: semanticKeys.group };
    if (requiredAliases.followUp.has(normalized))
      return { role: "axis" as const, semanticKey: semanticKeys.followUpAxis };
    if (requiredAliases.status.has(normalized))
      return { role: "value" as const, semanticKey: semanticKeys.eventObservedValue };
    return { role: "metadata" as const, semanticKey: null };
  };
  return AdaptiveColumnMappingSchema.parse({
    schemaVersion: "0.1.0",
    sourceLabel,
    delimiter: parsed.delimiter,
    headerRow: parsed.headerRow,
    columns: Object.fromEntries(parsed.headers.map((header) => [header, roleFor(header)])),
    confirmedAt,
  });
}

function buildContract(
  input: TimeToEventEntryInput,
  groups: readonly string[],
  followUpLevels: readonly number[],
): StructureContract {
  const unitKey = semanticKey(input.subjectUnitLabel);
  const identityKey = `${unitKey}_id`;
  const groupKey = "group";
  const axisKey = "follow_up";
  const readoutKey = "time_to_event";
  return StructureContractSchema.parse({
    schemaVersion: STRUCTURE_CONTRACT_VERSION,
    contractId: `contract.${semanticKey(input.experimentName)}.time_to_event`,
    experimentName: input.experimentName,
    experimentDescription: input.experimentDescription,
    unitLevels: [
      {
        key: unitKey,
        label: input.subjectUnitLabel,
        role: "experimental_unit",
        parentKey: null,
      },
    ],
    experimentalUnitLevelKey: unitKey,
    identities: [
      {
        key: identityKey,
        label: `${input.subjectUnitLabel} ID`,
        unitLevelKey: unitKey,
        required: true,
      },
    ],
    factors: [
      {
        key: groupKey,
        label: "Group",
        levels: groups,
        unitRole: "between_unit",
        relationship: "independent",
        ordered: false,
        referenceLevel: null,
      },
    ],
    matching: { kind: "independent", identityKey: null, completeSetsRequired: null },
    orderedAxes: [
      {
        key: axisKey,
        label: "Follow-up time",
        unit: input.followUpUnit?.trim() ?? "",
        levels: followUpLevels,
        sampling: "event_follow_up",
        identityRetained: true,
      },
    ],
    readouts: [
      {
        key: readoutKey,
        label: "Time to event",
        valueType: "time_to_event",
        representation: "event_censoring",
        componentKeys: ["follow_up", "event_observed"],
        referenceRole: "none",
        observationLevelKey: unitKey,
        axisKeys: [axisKey],
      },
    ],
    allowedMissingness: ["censored", "not_collected", "unknown"],
    rawObservationGrain: `one ${input.subjectUnitLabel} time-to-event record`,
  });
}

/**
 * Compiles the standard one-terminal-event table without running the general
 * biological interview. Unsupported event processes and unresolved parent
 * nesting retain their raw TSV but stop before StructureContract projection.
 */
export function createTimeToEventEntry(input: TimeToEventEntryInput): TimeToEventEntryResult {
  const now = input.now ?? new Date().toISOString();
  const rawLineage = inputLineage(input, now);
  const entryResolution = resolveEntryModule("time_to_event", {
    timeToEventPattern: input.timeToEventPattern,
    subjectUnitRelationship: input.subjectUnitRelationship,
  });

  if (entryResolution.status !== "surface_ready") {
    return {
      status: entryResolution.status,
      entryResolution,
      rawLineage,
      contract: null,
      snapshot: null,
      design: null,
      dualWrite: stoppedDualWrite(entryResolution.capabilityReasonCodes),
    };
  }

  if (!input.experimentName.trim() || !input.experimentDescription.trim()) {
    const diagnostics = ["TIME_TO_EVENT_EXPERIMENT_NAME_AND_DESCRIPTION_REQUIRED"];
    return {
      status: "input_invalid",
      entryResolution,
      rawLineage,
      contract: null,
      snapshot: null,
      design: null,
      dualWrite: stoppedDualWrite(diagnostics),
    };
  }
  if (!input.subjectUnitLabel.trim()) {
    const diagnostics = ["TIME_TO_EVENT_SUBJECT_UNIT_LABEL_REQUIRED"];
    return {
      status: "input_invalid",
      entryResolution,
      rawLineage,
      contract: null,
      snapshot: null,
      design: null,
      dualWrite: stoppedDualWrite(diagnostics),
    };
  }

  let parsedTable: ReturnType<typeof parseTimeToEventTable>;
  try {
    parsedTable = parseTimeToEventTable(input.tsvText, {
      numericStatusMapping: input.numericStatusMapping,
    });
  } catch (error) {
    const diagnostics = [issueCode(error)];
    return {
      status: isNumericStatusMappingIssue(error) ? "input_mapping_required" : "input_invalid",
      entryResolution,
      rawLineage,
      contract: null,
      snapshot: null,
      design: null,
      dualWrite: stoppedDualWrite(diagnostics),
    };
  }
  const { parsed, rows } = parsedTable;

  const groups = [...new Set(rows.map(({ conditionId }) => conditionId))];
  const followUpLevels = [...new Set(rows.map(({ followUpTime }) => followUpTime))].sort(
    (left, right) => left - right,
  );
  const contract = buildContract(input, groups, followUpLevels);
  const identityKey = contract.identities[0]!.key;
  const factorKey = contract.factors[0]!.key;
  const axisKey = contract.orderedAxes[0]!.key;
  const readoutKey = contract.readouts[0]!.key;
  let mapping;
  try {
    mapping = sourceColumns(
      parsed,
      {
        identity: identityKey,
        group: factorKey,
        followUpAxis: axisKey,
        eventObservedValue: `${readoutKey}_event_observed`,
      },
      rawLineage.sourceLabel,
      now,
    );
  } catch (error) {
    const diagnostics = [issueCode(error)];
    return {
      status: "input_invalid",
      entryResolution,
      rawLineage,
      contract,
      snapshot: null,
      design: null,
      dualWrite: stoppedDualWrite(diagnostics),
    };
  }

  const observations = rows.map((row, index) =>
    CanonicalAdaptiveObservationSchema.parse({
      observationId: `adaptive.${contract.contractId}.${index + 1}`,
      readoutKey,
      identities: { [identityKey]: row.unitId },
      factors: { [factorKey]: row.conditionId },
      axes: { [axisKey]: row.followUpTime },
      hierarchy: {},
      values: {
        [`${readoutKey}_follow_up`]: row.followUpTime,
        [`${readoutKey}_event_observed`]: row.eventObserved,
      },
      missingness: {},
      sourceRow: index + 2,
    }),
  );
  const typedLineage = AdaptiveRawLineageSchema.parse({
    ...rawLineage,
    transformations: [
      "parsed standard single-terminal time-to-event TSV",
      input.numericStatusMapping
        ? `decoded numeric status mapping ${input.numericStatusMapping.event}=Event, ${input.numericStatusMapping.censored}=Censored`
        : "decoded explicit event/censoring status labels",
      "retained stable subject identity and observed group",
    ],
  });
  const projection = createTimeToEventContractProjection(contract);
  const design = projection.toExperimentDesign(rows.length, now);

  let equivalence: DualWriteEquivalence;
  try {
    equivalence = projection.assertEquivalent(design, now);
  } catch (error) {
    return {
      status: "dual_write_mismatch",
      entryResolution,
      rawLineage: typedLineage,
      contract,
      snapshot: null,
      design,
      dualWrite: stoppedDualWrite([issueCode(error)]),
    };
  }
  if (equivalence.status !== "equivalent") {
    return {
      status: "dual_write_mismatch",
      entryResolution,
      rawLineage: typedLineage,
      contract,
      snapshot: null,
      design,
      dualWrite: stoppedDualWrite(equivalence.diagnostics),
    };
  }

  const snapshot = AdaptiveInputSnapshotSchema.parse({
    schemaVersion: "0.1.0",
    featureFlag: "experiment_first_adaptive_input_alpha",
    contract,
    surface: selectAdaptiveSurface(contract),
    mapping,
    rawLineage: typedLineage,
    canonicalObservations: observations,
    equivalence,
    targetedConfirmations: [
      {
        key: "subject_unit_relationship",
        answer: input.subjectUnitRelationship,
        confirmedAt: now,
      },
      ...(input.numericStatusMapping
        ? [
            {
              key: "time_to_event_status_mapping",
              answer: `${input.numericStatusMapping.event}=event;${input.numericStatusMapping.censored}=censored`,
              confirmedAt: now,
            },
          ]
        : []),
    ],
  });
  return {
    status: "surface_ready",
    entryResolution,
    rawLineage: typedLineage,
    contract,
    snapshot,
    design,
    dualWrite: {
      status: "evaluated",
      equivalence,
      diagnostics: [...(design.adaptiveStructure?.diagnostics ?? []), ...equivalence.diagnostics],
    },
  };
}

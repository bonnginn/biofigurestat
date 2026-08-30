import {
  createProgressiveEntrySnapshot,
  type ExperimentCanvas,
  type ObservationPatternSet,
  type ProgressiveEntrySnapshot,
  type StagedObservationRecord,
} from "@lsaa/domain";
import { serializeProgressiveCanonicalDraft } from "@lsaa/project";

export type SparseDraftRow = Readonly<{
  rowKey: string;
  identity: string;
  components: readonly string[];
  recordId?: string;
  observationId?: string;
  sourceRow?: number | null;
}>;

export type SparseSheetSection = Readonly<{
  sectionKey: string;
  conditionCellId: string;
  conditionLabel: string;
  readoutKey: string;
  readoutLabel: string;
  representation: "scalar" | "proportion_counts";
  componentKeys: readonly string[];
  recordSetKey: string;
  identityKey: string;
  identityLabel: string;
  identityPurpose: ObservationPatternSet["identities"][number]["purpose"];
  identityAvailability: ObservationPatternSet["identities"][number]["availability"];
  identityOrigin: ObservationPatternSet["identities"][number]["origin"];
}>;

export type SparseDraft = Readonly<Record<string, readonly SparseDraftRow[]>>;

export function labelForCondition(canvas: ExperimentCanvas, conditionCellId: string): string {
  const cell = canvas.conditionCells.find(
    (candidate) => candidate.conditionCellId === conditionCellId,
  );
  if (!cell) return conditionCellId;
  return canvas.dimensions
    .map((dimension) => {
      const valueKey = cell.values[dimension.key];
      const value = dimension.values.find(({ key }) => key === valueKey);
      if (!value) return valueKey;
      const group = value.groupKey
        ? dimension.groups.find(({ key }) => key === value.groupKey)
        : null;
      return group ? `${group.label} / ${value.label}` : value.label;
    })
    .join(" / ");
}

export function sparseSheetCompatibility(
  canvas: ExperimentCanvas,
  pattern: ObservationPatternSet,
): { sections: SparseSheetSection[]; issues: string[] } {
  const sections: SparseSheetSection[] = [];
  const issues = new Set<string>();
  pattern.readoutBindings.forEach((binding) => {
    if (binding.status !== "measured" || !binding.recordSetKey) return [];
    const cell = canvas.conditionCells.find(
      ({ conditionCellId }) => conditionCellId === binding.conditionCellId,
    );
    if (!cell || cell.status !== "performed") return [];
    const readout = canvas.readouts.find(({ key }) => key === binding.readoutKey);
    if (
      !readout ||
      (readout.representation !== "scalar" && readout.representation !== "proportion_counts")
    ) {
      issues.add(`${binding.readoutKey}: scalarまたは陽性数/総数以外の測定形式`);
      return;
    }
    const recordSet = pattern.recordSets.find(({ key }) => key === binding.recordSetKey);
    if (!recordSet) {
      issues.add(`${binding.readoutKey}: 入力行の単位が見つかりません`);
      return;
    }
    const observedLevel = pattern.levels.find(({ key }) => key === recordSet.observedLevelKey);
    if (!observedLevel || observedLevel.parentKey !== null || recordSet.axisUses.length > 0) {
      issues.add(`${binding.readoutKey}: 親子階層または反復軸を持つ測定行`);
      return;
    }
    const identity =
      pattern.identities.find(
        ({ levelKey, purpose }) =>
          levelKey === recordSet.observedLevelKey &&
          (purpose === "instance_key" || purpose === "both"),
      ) ?? pattern.identities.find(({ levelKey }) => levelKey === recordSet.observedLevelKey);
    if (!identity) {
      issues.add(`${binding.readoutKey}: 測定行を区別するIDがありません`);
      return;
    }
    sections.push({
      sectionKey: `${binding.conditionCellId}|${binding.readoutKey}`,
      conditionCellId: binding.conditionCellId,
      conditionLabel: labelForCondition(canvas, binding.conditionCellId),
      readoutKey: binding.readoutKey,
      readoutLabel: readout.label,
      representation: readout.representation,
      componentKeys: readout.componentKeys,
      recordSetKey: binding.recordSetKey,
      identityKey: identity.key,
      identityLabel: identity.label,
      identityPurpose: identity.purpose,
      identityAvailability: identity.availability,
      identityOrigin: identity.origin,
    });
  });
  return { sections, issues: [...issues] };
}

export function sparseSheetSections(
  canvas: ExperimentCanvas,
  pattern: ObservationPatternSet,
): SparseSheetSection[] {
  return sparseSheetCompatibility(canvas, pattern).sections;
}

export function emptySparseDraft(sections: readonly SparseSheetSection[]): SparseDraft {
  return Object.fromEntries(
    sections.map((section) => [
      section.sectionKey,
      [
        {
          rowKey: `${section.sectionKey}|row.1`,
          identity: "",
          components: section.componentKeys.map(() => ""),
        },
      ],
    ]),
  );
}

export function sparseDraftFromSnapshot(
  sections: readonly SparseSheetSection[],
  snapshot: ProgressiveEntrySnapshot,
): SparseDraft {
  return Object.fromEntries(
    sections.map((section) => {
      const records = snapshot.stagedRecords.filter(
        (record) =>
          record.conditionCellId === section.conditionCellId &&
          record.observation.readoutKey === section.readoutKey &&
          record.eligibility === "active",
      );
      return [
        section.sectionKey,
        records.length
          ? records.map((record, index) => ({
              rowKey: `${section.sectionKey}|row.${index + 1}`,
              identity: record.observation.identities[section.identityKey] ?? "",
              components: section.componentKeys.map((key) =>
                String(record.observation.values[key] ?? ""),
              ),
              recordId: record.recordId,
              observationId: record.observation.observationId,
              sourceRow: record.observation.sourceRow,
            }))
          : [
              {
                rowKey: `${section.sectionKey}|row.1`,
                identity: "",
                components: section.componentKeys.map(() => ""),
              },
            ],
      ];
    }),
  );
}

export function parseSparseClipboard(
  text: string,
  section: SparseSheetSection,
): { rows: SparseDraftRow[]; error: string | null } {
  const lines = text
    .replace(/\r\n?/g, "\n")
    .split("\n")
    .filter((line) => line.trim().length > 0);
  const rows: SparseDraftRow[] = [];
  for (const [index, line] of lines.entries()) {
    const cells = line.split("\t").map((cell) => cell.trim());
    const expectedComponents = section.representation === "scalar" ? 1 : 2;
    if (cells.length !== expectedComponents && cells.length !== expectedComponents + 1) {
      return {
        rows: [],
        error: `${index + 1}行目はIDを含めて${expectedComponents + 1}列、または測定値だけの${expectedComponents}列にしてください。`,
      };
    }
    const hasIdentity = cells.length === expectedComponents + 1;
    const mayAssignIdentity =
      section.identityPurpose === "instance_key" &&
      section.identityOrigin === "app_assigned_before_entry" &&
      section.identityAvailability !== "irrecoverable" &&
      section.identityAvailability !== "unknown";
    if (!hasIdentity && !mayAssignIdentity) {
      return {
        rows: [],
        error: `${index + 1}行目に${section.identityLabel}が必要です。このIDは対応関係に使うため自動生成できません。`,
      };
    }
    rows.push({
      rowKey: `${section.sectionKey}|paste.${index + 1}`,
      identity: hasIdentity ? cells[0]! : `${section.conditionLabel}-${index + 1}`,
      components: cells.slice(hasIdentity ? 1 : 0),
    });
  }
  return rows.length ? { rows, error: null } : { rows: [], error: "貼り付ける行がありません。" };
}

function numericComponents(
  row: SparseDraftRow,
  section: SparseSheetSection,
): { values: Record<string, number>; error: string | null } {
  const values: Record<string, number> = {};
  for (const [index, componentKey] of section.componentKeys.entries()) {
    const raw = row.components[index]?.trim() ?? "";
    const value = Number(raw);
    if (!raw || !Number.isFinite(value))
      return { values: {}, error: "測定値は数値で入力してください。" };
    values[componentKey] = value;
  }
  if (section.representation === "proportion_counts") {
    const positive = values[section.componentKeys[0]!]!;
    const total = values[section.componentKeys[1]!]!;
    if (
      !Number.isInteger(positive) ||
      !Number.isInteger(total) ||
      positive < 0 ||
      total <= 0 ||
      positive > total
    ) {
      return { values: {}, error: "陽性数と総数は整数で、0 ≤ 陽性数 ≤ 総数にしてください。" };
    }
  }
  return { values, error: null };
}

export function stagedRecordsFromSparseDraft(input: {
  canvas: ExperimentCanvas;
  sections: readonly SparseSheetSection[];
  draft: SparseDraft;
  baseSnapshot?: ProgressiveEntrySnapshot | null;
}): { records: Omit<StagedObservationRecord, "eligibility">[]; errors: Record<string, string> } {
  const records: Omit<StagedObservationRecord, "eligibility">[] = [];
  const errors: Record<string, string> = {};
  for (const section of input.sections) {
    const cell = input.canvas.conditionCells.find(
      ({ conditionCellId }) => conditionCellId === section.conditionCellId,
    )!;
    for (const [index, row] of (input.draft[section.sectionKey] ?? []).entries()) {
      const entirelyEmpty = !row.identity.trim() && row.components.every((value) => !value.trim());
      if (entirelyEmpty) continue;
      if (!row.identity.trim()) {
        errors[row.rowKey] = "試料IDを入力してください。";
        continue;
      }
      const numeric = numericComponents(row, section);
      if (numeric.error) {
        errors[row.rowKey] = numeric.error;
        continue;
      }
      const safeSection = section.sectionKey.replace(/[^a-z0-9._-]/gi, ".").toLowerCase();
      const safeRowKey = row.rowKey.replace(/[^a-z0-9._-]/gi, ".").toLowerCase();
      const recordId = row.recordId ?? `record.${safeSection}.${safeRowKey}`;
      const baseRecord = row.recordId
        ? input.baseSnapshot?.stagedRecords.find((candidate) => candidate.recordId === row.recordId)
        : undefined;
      records.push({
        recordId,
        conditionCellId: section.conditionCellId,
        recordSetKey: section.recordSetKey,
        mappingState: baseRecord?.mappingState ?? "mapped",
        observation: baseRecord
          ? {
              ...baseRecord.observation,
              readoutKey: section.readoutKey,
              identities: {
                ...baseRecord.observation.identities,
                [section.identityKey]: row.identity.trim(),
              },
              factors: { ...baseRecord.observation.factors, ...cell.values },
              values: { ...baseRecord.observation.values, ...numeric.values },
            }
          : {
              observationId: row.observationId ?? `observation.${safeSection}.${safeRowKey}`,
              readoutKey: section.readoutKey,
              identities: { [section.identityKey]: row.identity.trim() },
              factors: cell.values,
              axes: {},
              hierarchy: {},
              values: numeric.values,
              missingness: {},
              sourceRow: row.sourceRow ?? index + 1,
            },
      });
    }
  }
  return { records, errors };
}

export function serializeSparseDraft(
  sections: readonly SparseSheetSection[],
  draft: SparseDraft,
): string {
  const rows = ["condition_cell\treadout\tidentity\tcomponent_1\tcomponent_2"];
  for (const section of sections) {
    for (const row of draft[section.sectionKey] ?? []) {
      if (!row.identity.trim() && row.components.every((value) => !value.trim())) continue;
      rows.push(
        [section.conditionCellId, section.readoutKey, row.identity, ...row.components]
          .map((value) => value.replace(/\t/g, " "))
          .join("\t"),
      );
    }
  }
  return rows.join("\n");
}

export function snapshotFromSparseDraft(input: {
  snapshotId: string;
  projectId: string;
  savedAt: string;
  canvas: ExperimentCanvas;
  pattern: ObservationPatternSet;
  sections: readonly SparseSheetSection[];
  draft: SparseDraft;
  sourceKind: "direct_entry" | "clipboard";
  baseSnapshot?: ProgressiveEntrySnapshot | null;
}): { snapshot: ProgressiveEntrySnapshot; errors: Record<string, string> } {
  const converted = stagedRecordsFromSparseDraft(input);
  const visibleBaseRecordIds = new Set(
    Object.values(input.draft).flatMap((rows) =>
      rows.flatMap(({ recordId }) => (recordId ? [recordId] : [])),
    ),
  );
  const retainedNonSurfaceRecords =
    input.baseSnapshot?.stagedRecords.flatMap((record) => {
      if (record.eligibility === "active" || visibleBaseRecordIds.has(record.recordId)) return [];
      const { eligibility: _eligibility, ...withoutEligibility } = record;
      return [withoutEligibility];
    }) ?? [];
  const rawText = serializeSparseDraft(input.sections, input.draft);
  const preliminarySnapshot = createProgressiveEntrySnapshot({
    snapshotId: input.snapshotId,
    projectId: input.projectId,
    savedAt: input.savedAt,
    canvas: input.canvas,
    activePattern: input.pattern,
    pendingPattern: null,
    mapping: input.baseSnapshot?.mapping ?? null,
    rawLineage: {
      schemaVersion: "0.1.0",
      sourceKind: input.sourceKind,
      sourceLabel:
        input.sourceKind === "clipboard" ? "clipboard-derived editable table" : "editable table",
      capturedAt: input.savedAt,
      rawText,
      sha256: null,
      transformations: [
        input.sourceKind === "clipboard"
          ? "rectangular_clipboard_merged_into_complete_editable_table"
          : "editable_table_to_staged_records",
      ],
    },
    stagedRecords: [...converted.records, ...retainedNonSurfaceRecords],
    fullContract: null,
    scopedContracts: [],
    provenance: input.baseSnapshot?.provenance ?? [
      {
        eventId: "event.progressive.canvas",
        occurredAt: input.savedAt,
        actor: "researcher",
        kind: "canvas_created",
        details: { source: "known_sparse_entry" },
      },
    ],
  });
  return {
    errors: converted.errors,
    snapshot: createProgressiveEntrySnapshot({
      ...preliminarySnapshot,
      rawLineage: {
        ...preliminarySnapshot.rawLineage!,
        rawText: serializeProgressiveCanonicalDraft(preliminarySnapshot),
        sha256: null,
        transformations: [
          ...preliminarySnapshot.rawLineage!.transformations,
          "canonical_staged_records_v1",
        ],
      },
    }),
  };
}

export function graphValue(
  record: StagedObservationRecord,
  section: SparseSheetSection,
): number | null {
  if (record.eligibility !== "active") return null;
  if (section.representation === "scalar") {
    const value = record.observation.values[section.componentKeys[0]!];
    return typeof value === "number" && Number.isFinite(value) ? value : null;
  }
  const positive = record.observation.values[section.componentKeys[0]!];
  const total = record.observation.values[section.componentKeys[1]!];
  return typeof positive === "number" && typeof total === "number" && total > 0
    ? positive / total
    : null;
}

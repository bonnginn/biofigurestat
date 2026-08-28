import {
  AdaptiveColumnMappingSchema,
  AdaptiveInputSnapshotSchema,
  CanonicalAdaptiveObservationSchema,
  type AdaptiveInputSnapshot,
  type ExperimentDesign,
  type Observation,
  type StructureContract,
  type UnitInstance,
} from "@lsaa/domain";
import {
  appendAnalysisExecution,
  appendDesignRevision,
  appendRawRevision,
  createInitialProjectState,
  ProjectStateSchema,
  type ProjectState,
} from "@lsaa/project";
import { parseAdaptiveDelimited } from "@lsaa/adaptive-input";
import type { SurvivalSheetRow } from "@lsaa/data-sheet";
import { decodeAdaptiveSurvivalStatus } from "./adaptiveSurvivalStatus";
import { createTimeToEventContractProjection } from "./timeToEventProjection";

const token = (value: string) =>
  value
    .normalize("NFKC")
    .replace(/[^A-Za-z0-9._:-]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 64) || "unit";

const identityToken = (value: string): string =>
  Array.from(value.normalize("NFKC"))
    .map((character) => character.codePointAt(0)!.toString(16))
    .join(".") || "empty";

export function adaptiveSurvivalUnitId(identity: string): string {
  // Encode every normalized code point. A display-safe slug would collapse
  // distinct Japanese identities (for example マウス甲 and マウス乙) and could
  // silently attach observations to the wrong unit.
  return `unit.adaptive.identity.${identityToken(identity)}`;
}

export function adaptiveSurvivalObservationId(rawRevisionId: string, index: number): string {
  return `observation.adaptive.${token(rawRevisionId)}.${index + 1}`;
}

function eventFollowUpAxis(
  contract: StructureContract,
  readout: StructureContract["readouts"][number],
): StructureContract["orderedAxes"][number] | null {
  const axes = contract.orderedAxes.filter(
    (axis) => readout.axisKeys.includes(axis.key) && axis.sampling === "event_follow_up",
  );
  if (axes.length > 1) throw new Error("ADAPTIVE_SURVIVAL_MULTIPLE_FOLLOW_UP_AXES");
  if (axes[0]) return axes[0];
  const unbound = contract.orderedAxes.filter(({ sampling }) => sampling === "event_follow_up");
  if (unbound.length > 1) throw new Error("ADAPTIVE_SURVIVAL_MULTIPLE_FOLLOW_UP_AXES");
  return unbound[0] ?? null;
}

function rawRevisionSourceKind(snapshot: AdaptiveInputSnapshot): "paste" | "csv" {
  return snapshot.rawLineage?.sourceKind === "clipboard" ? "paste" : "csv";
}

const normalizedHeader = (value: string): string =>
  value
    .normalize("NFKC")
    .replace(/^\uFEFF/u, "")
    .trim()
    .toLowerCase()
    .replace(/[^\p{L}\p{N}]+/gu, "");

const identityAliases = new Set(["unitid", "unit", "subjectid", "sampleid"]);
const groupAliases = new Set(["group", "condition", "conditionid", "treatment"]);
const followUpAliases = new Set(["followuptime", "timeto-event", "timetoevent", "time"]);
const statusAliases = new Set([
  "eventcensorstatus",
  "eventstatus",
  "status",
  "event",
  "eventobserved",
]);

type AdaptiveSurvivalNumericStatusMapping = Readonly<{
  event: "0" | "1";
  censored: "0" | "1";
}>;

function confirmedNumericStatusMapping(
  snapshot: AdaptiveInputSnapshot,
): AdaptiveSurvivalNumericStatusMapping | undefined {
  const answer = snapshot.targetedConfirmations.find(
    ({ key }) => key === "time_to_event_status_mapping",
  )?.answer;
  if (!answer) return undefined;
  const assignments = answer
    .normalize("NFKC")
    .toLowerCase()
    .replace(/\s+/gu, "")
    .split(";")
    .map((item) => /^([01])=(event|censored)$/u.exec(item));
  if (assignments.length !== 2 || assignments.some((item) => !item)) return undefined;
  const mapping = Object.fromEntries(
    assignments.map((item) => [item![2]!, item![1]!]),
  ) as Partial<AdaptiveSurvivalNumericStatusMapping>;
  if (!mapping.event || !mapping.censored || mapping.event === mapping.censored) return undefined;
  return { event: mapping.event, censored: mapping.censored };
}

function decodeConfirmedAdaptiveSurvivalStatus(
  value: unknown,
  numericMapping: AdaptiveSurvivalNumericStatusMapping | undefined,
): boolean {
  const normalized =
    typeof value === "string" || typeof value === "number"
      ? String(value).normalize("NFKC").trim()
      : null;
  if (numericMapping && normalized === numericMapping.event) return true;
  if (numericMapping && normalized === numericMapping.censored) return false;
  return decodeAdaptiveSurvivalStatus(value);
}

function editableSurvivalMapping(
  snapshot: AdaptiveInputSnapshot,
  text: string,
  confirmedAt: string,
) {
  const parsed = parseAdaptiveDelimited(text);
  const contract = snapshot.contract;
  const readout = contract.readouts.find(
    ({ representation }) => representation === "event_censoring",
  );
  if (!readout) throw new Error("ADAPTIVE_SURVIVAL_READOUT_MISSING");
  const identityKey =
    contract.identities.find(
      ({ unitLevelKey }) => unitLevelKey === contract.experimentalUnitLevelKey,
    )?.key ?? contract.identities[0]!.key;
  const factor = contract.factors[0];
  if (!factor) throw new Error("ADAPTIVE_SURVIVAL_GROUP_FACTOR_MISSING");
  const followUpAxis = eventFollowUpAxis(contract, readout);
  const followUpValueKey = `${readout.key}_follow_up`;
  const eventObservedValueKey = `${readout.key}_event_observed`;
  const identityLabels = new Set(
    contract.identities
      .filter(({ key }) => key === identityKey)
      .flatMap(({ key, label }) => [normalizedHeader(key), normalizedHeader(label)]),
  );
  const factorLabels = new Set([normalizedHeader(factor.key), normalizedHeader(factor.label)]);
  const followUpLabels = new Set([
    ...(followUpAxis
      ? [normalizedHeader(followUpAxis.key), normalizedHeader(followUpAxis.label)]
      : []),
    normalizedHeader("follow_up"),
    normalizedHeader(followUpValueKey),
  ]);
  const statusLabels = new Set([
    normalizedHeader("event_observed"),
    normalizedHeader(eventObservedValueKey),
  ]);

  const roleFor = (header: string) => {
    const normalized = normalizedHeader(header);
    const prior = snapshot.mapping?.columns[header];
    if (prior?.semanticKey === identityKey)
      return { ...prior, role: "identity" as const, semanticKey: identityKey };
    if (prior?.semanticKey === factor.key)
      return { ...prior, role: "factor" as const, semanticKey: factor.key };
    if (
      prior &&
      (prior.semanticKey === followUpAxis?.key || prior.semanticKey === followUpValueKey)
    )
      return followUpAxis
        ? { ...prior, role: "axis" as const, semanticKey: followUpAxis.key }
        : { ...prior, role: "value" as const, semanticKey: followUpValueKey };
    if (prior?.semanticKey === eventObservedValueKey)
      return { ...prior, role: "value" as const, semanticKey: eventObservedValueKey };
    if (identityAliases.has(normalized) || identityLabels.has(normalized))
      return { role: "identity" as const, semanticKey: identityKey };
    if (groupAliases.has(normalized) || factorLabels.has(normalized))
      return { role: "factor" as const, semanticKey: factor.key };
    if (followUpAliases.has(normalized) || followUpLabels.has(normalized))
      return followUpAxis
        ? { role: "axis" as const, semanticKey: followUpAxis.key }
        : { role: "value" as const, semanticKey: followUpValueKey };
    if (statusAliases.has(normalized) || statusLabels.has(normalized))
      return { role: "value" as const, semanticKey: eventObservedValueKey };
    return prior ?? { role: "metadata" as const, semanticKey: null };
  };
  const mapping = AdaptiveColumnMappingSchema.parse({
    schemaVersion: "0.1.0",
    sourceLabel:
      snapshot.mapping?.sourceLabel ??
      snapshot.rawLineage?.sourceLabel ??
      "editable-survival-table.tsv",
    delimiter: parsed.delimiter,
    headerRow: parsed.headerRow,
    columns: Object.fromEntries(parsed.headers.map((header) => [header, roleFor(header)])),
    confirmedAt,
  });
  return { parsed, mapping, identityKey, factor, followUpAxis, readout };
}

/**
 * Parses the exact source text through its persisted semantic column mapping.
 * This lets a reopened project keep original headers, column order, and extra
 * metadata instead of replacing them with a display-only four-column table.
 */
export function parseAdaptiveSurvivalText(
  snapshot: AdaptiveInputSnapshot,
  text: string,
): SurvivalSheetRow[] {
  const confirmedAt = snapshot.mapping?.confirmedAt ?? new Date().toISOString();
  const { parsed, mapping, identityKey, factor, followUpAxis, readout } =
    editableSurvivalMapping(snapshot, text, confirmedAt);
  const columnIndex = (
    predicate: (assignment: (typeof mapping.columns)[string]) => boolean,
  ): number =>
    parsed.headers.findIndex((header) => {
      const assignment = mapping.columns[header];
      return Boolean(assignment && predicate(assignment));
    });
  const indexes = {
    identity: columnIndex(
      ({ role, semanticKey }) => role === "identity" && semanticKey === identityKey,
    ),
    factor: columnIndex(
      ({ role, semanticKey }) => role === "factor" && semanticKey === factor.key,
    ),
    followUp: columnIndex(
      ({ role, semanticKey }) =>
        (role === "axis" && semanticKey === followUpAxis?.key) ||
        (role === "value" && semanticKey === `${readout.key}_follow_up`),
    ),
    status: columnIndex(
      ({ role, semanticKey }) =>
        role === "value" && semanticKey === `${readout.key}_event_observed`,
    ),
  };
  if (Object.values(indexes).some((index) => index < 0)) {
    throw new Error(
      "Survival header must map identity, group, follow-up time, and Event/Censored status",
    );
  }
  const requiredColumns = new Set(Object.values(indexes));
  const numericStatusMapping = confirmedNumericStatusMapping(snapshot);
  const seen = new Set<string>();
  return parsed.rows.map((cells, rowIndex) => {
    const unitId = cells[indexes.identity]?.trim() ?? "";
    const conditionId = cells[indexes.factor]?.trim() ?? "";
    const followUpText = cells[indexes.followUp]?.trim() ?? "";
    const statusText = cells[indexes.status]?.trim() ?? "";
    if (!unitId || !conditionId || !followUpText || !statusText) {
      throw new Error(`Survival row ${rowIndex + 2} has a missing required value`);
    }
    if (seen.has(unitId)) throw new Error(`Duplicate survival unit ID '${unitId}'`);
    seen.add(unitId);
    const followUpTime = Number(followUpText);
    if (!Number.isFinite(followUpTime) || followUpTime < 0) {
      throw new Error(`Survival row ${rowIndex + 2} has an invalid follow-up time`);
    }
    return {
      unitId,
      conditionId,
      followUpTime,
      eventObserved: decodeConfirmedAdaptiveSurvivalStatus(statusText, numericStatusMapping),
      metadata: Object.fromEntries(
        parsed.headers.flatMap((header, index) =>
          requiredColumns.has(index) || !header ? [] : [[header, cells[index] ?? ""]],
        ),
      ),
    };
  });
}

function adaptiveSurvivalRecords(
  snapshot: AdaptiveInputSnapshot,
  design: ExperimentDesign,
  rawRevisionId: string,
): { units: UnitInstance[]; observations: Observation[] } {
  const contract = snapshot.contract;
  const readout = contract.readouts.find(
    ({ representation }) => representation === "event_censoring",
  );
  if (!readout) throw new Error("ADAPTIVE_SURVIVAL_READOUT_MISSING");
  const rows = snapshot.canonicalObservations.filter(
    ({ readoutKey }) => readoutKey === readout.key,
  );
  const identityKey =
    contract.identities.find(
      ({ unitLevelKey }) => unitLevelKey === contract.experimentalUnitLevelKey,
    )?.key ?? contract.identities[0]!.key;
  const combinations = contract.factors.reduce<Array<Record<string, string>>>(
    (items, factor) =>
      items.flatMap((item) => factor.levels.map((level) => ({ ...item, [factor.key]: level }))),
    [{}],
  );
  const units: UnitInstance[] = [];
  const observations: Observation[] = [];
  const seenUnits = new Set<string>();
  rows.forEach((row, index) => {
    const identity = row.identities[identityKey];
    if (!identity) throw new Error(`ADAPTIVE_REQUIRED_IDENTITY_MISSING:${row.observationId}`);
    const unitId = adaptiveSurvivalUnitId(identity);
    if (seenUnits.has(unitId)) throw new Error(`ADAPTIVE_DUPLICATE_SURVIVAL_IDENTITY:${identity}`);
    seenUnits.add(unitId);
    units.push({
      id: unitId,
      levelId: design.experimentalUnitLevelId,
      parentUnitId: null,
      label: identity,
      metadata: { semanticIdentity: identity },
    });
    const conditionIndex = combinations.findIndex((combination) =>
      contract.factors.every((factor) => combination[factor.key] === row.factors[factor.key]),
    );
    const followUp = row.values[`${readout.key}_follow_up`] ?? row.values.follow_up;
    const event = row.values[`${readout.key}_event_observed`] ?? row.values.event_observed;
    const eventObserved = decodeAdaptiveSurvivalStatus(event);
    if (
      conditionIndex < 0 ||
      typeof followUp !== "number" ||
      !Number.isFinite(followUp) ||
      followUp < 0
    )
      throw new Error(`ADAPTIVE_INVALID_SURVIVAL_ROW:${row.observationId}`);
    observations.push({
      id: adaptiveSurvivalObservationId(rawRevisionId, index),
      rawRevisionId,
      unitInstanceId: unitId,
      conditionId: `condition.${conditionIndex + 1}`,
      outcomeId: `outcome.${readout.key}`,
      measurement: { kind: "time_to_event", followUpTime: followUp, eventObserved },
      sourceLocation: `adaptive:${row.observationId}`,
    });
  });
  return { units, observations };
}

/** Rebuilds typed canonical rows after an editable Case 5 reopen. */
export function updateAdaptiveSurvivalSnapshot(
  snapshot: AdaptiveInputSnapshot,
  text: string,
  updatedAt = new Date().toISOString(),
): AdaptiveInputSnapshot {
  const { contract } = snapshot;
  const readout = contract.readouts.find(
    ({ representation }) => representation === "event_censoring",
  );
  if (!readout) throw new Error("ADAPTIVE_SURVIVAL_READOUT_MISSING");
  if (contract.factors.length !== 1)
    throw new Error("ADAPTIVE_SURVIVAL_EDIT_REQUIRES_SINGLE_GROUP_FACTOR");
  const factor = contract.factors[0]!;
  const identityKey =
    contract.identities.find(
      ({ unitLevelKey }) => unitLevelKey === contract.experimentalUnitLevelKey,
    )?.key ?? contract.identities[0]!.key;
  const followUpAxis = eventFollowUpAxis(contract, readout);
  const priorLineage = snapshot.rawLineage;
  const rawUnchanged = priorLineage?.rawText === text;
  const mappingConfirmedAt =
    rawUnchanged && snapshot.mapping ? snapshot.mapping.confirmedAt : updatedAt;
  const { mapping } = editableSurvivalMapping(snapshot, text, mappingConfirmedAt);
  const rows = parseAdaptiveSurvivalText(snapshot, text);
  const observations = rawUnchanged
    ? snapshot.canonicalObservations
    : rows.map((row, index) => {
        if (!factor.levels.includes(row.conditionId))
          throw new Error(`ADAPTIVE_SURVIVAL_GROUP_MISMATCH:${row.conditionId}`);
        return CanonicalAdaptiveObservationSchema.parse({
          observationId: `adaptive.${contract.contractId}.edit.${index + 1}`,
          readoutKey: readout.key,
          identities: { [identityKey]: row.unitId },
          factors: { [factor.key]: row.conditionId },
          axes: followUpAxis ? { [followUpAxis.key]: row.followUpTime } : {},
          hierarchy: {},
          values: {
            [`${readout.key}_follow_up`]: row.followUpTime,
            [`${readout.key}_event_observed`]: row.eventObserved,
          },
          missingness: {},
          sourceRow: index + 2,
        });
      });
  const projection = createTimeToEventContractProjection(contract);
  const design = projection.toExperimentDesign(Math.max(1, rows.length), updatedAt);
  const equivalence = projection.assertEquivalent(design, updatedAt);
  return AdaptiveInputSnapshotSchema.parse({
    ...snapshot,
    mapping,
    rawLineage:
      rawUnchanged && priorLineage
        ? priorLineage
        : {
            schemaVersion: "0.1.0",
            sourceKind: priorLineage?.sourceKind ?? "clipboard",
            sourceLabel: priorLineage?.sourceLabel ?? "editable-survival-table.tsv",
            importedAt: priorLineage?.importedAt ?? updatedAt,
            rawText: text,
            sha256: null,
            transformations: [
              ...(priorLineage?.transformations ?? []),
              `edited in typed survival workspace at ${updatedAt}; event/censoring retained`,
              ...(followUpAxis
                ? [`mapped follow-up time to ordered axis ${followUpAxis.key} and typed readout value`]
                : []),
            ],
          },
    canonicalObservations: observations,
    equivalence,
  });
}

/** Creates the save/open companion for a typed event/censoring snapshot. */
export function createAdaptiveSurvivalProject(
  snapshot: AdaptiveInputSnapshot,
  now = new Date().toISOString(),
): ProjectState {
  const contract = snapshot.contract;
  const readout = contract.readouts.find(
    ({ representation }) => representation === "event_censoring",
  );
  if (!readout) throw new Error("ADAPTIVE_SURVIVAL_READOUT_MISSING");
  const rows = snapshot.canonicalObservations.filter(
    ({ readoutKey }) => readoutKey === readout.key,
  );
  const projection = createTimeToEventContractProjection(contract);
  const design = projection.toExperimentDesign(Math.max(1, rows.length), now);
  const equivalence = projection.assertEquivalent(design, now);
  if (equivalence.status !== "equivalent") {
    throw new Error(
      `ADAPTIVE_SURVIVAL_DUAL_WRITE_NOT_EQUIVALENT:${equivalence.diagnostics.join(",")}`,
    );
  }
  const checkedSnapshot = AdaptiveInputSnapshotSchema.parse({ ...snapshot, equivalence });
  const rawRevisionId = "raw.adaptive.1";
  const { units, observations } = adaptiveSurvivalRecords(checkedSnapshot, design, rawRevisionId);
  const base = createInitialProjectState({
    metadata: {
      projectId: `project.${contract.contractId}`,
      projectName: contract.experimentName,
      experimentDate: "",
      createdAt: now,
      updatedAt: now,
    },
    design,
    rawRevision: {
      id: rawRevisionId,
      previousRevisionId: null,
      sourceKind: rawRevisionSourceKind(checkedSnapshot),
      sourceName: checkedSnapshot.rawLineage?.sourceLabel,
      createdAt: now,
      createdBy: "local-user",
    },
    unitInstances: units,
    observations,
    actor: "local-user",
  });
  return ProjectStateSchema.parse({ ...base, adaptiveInput: checkedSnapshot });
}

function nextAdaptiveRawRevisionId(state: ProjectState): string {
  let index = state.rawRevisions.length + 1;
  while (state.rawRevisions.some(({ id }) => id === `raw.adaptive.${index}`)) index += 1;
  return `raw.adaptive.${index}`;
}

/**
 * Appends an editable survival save as immutable project revisions. Existing
 * design/raw/analysis/graph/provenance history is retained rather than rebuilt.
 */
export function reviseAdaptiveSurvivalProject(
  stateInput: ProjectState,
  snapshotInput: AdaptiveInputSnapshot,
  now = new Date().toISOString(),
  actor = "local-user",
): ProjectState {
  const original = ProjectStateSchema.parse(stateInput);
  const snapshot = AdaptiveInputSnapshotSchema.parse(snapshotInput);
  if (!original.adaptiveInput) {
    throw new Error("ADAPTIVE_SURVIVAL_EXISTING_SNAPSHOT_MISSING");
  }
  if (original.adaptiveInput.contract.contractId !== snapshot.contract.contractId) {
    throw new Error("ADAPTIVE_SURVIVAL_CONTRACT_ID_MISMATCH");
  }
  const readout = snapshot.contract.readouts.find(
    ({ representation }) => representation === "event_censoring",
  );
  if (!readout) throw new Error("ADAPTIVE_SURVIVAL_READOUT_MISSING");
  const rows = snapshot.canonicalObservations.filter(
    ({ readoutKey }) => readoutKey === readout.key,
  );
  const currentDesign = original.designRevisions.find(
    ({ id }) => id === original.activeDesignRevisionId,
  )?.design;
  if (!currentDesign) throw new Error("ADAPTIVE_SURVIVAL_ACTIVE_DESIGN_MISSING");

  const projection = createTimeToEventContractProjection(snapshot.contract);
  const comparableDesign = projection.toExperimentDesign(
    Math.max(1, rows.length),
    currentDesign.createdAt,
  );
  const designChanged = JSON.stringify(currentDesign) !== JSON.stringify(comparableDesign);
  let state = designChanged
    ? appendDesignRevision(
        original,
        projection.toExperimentDesign(Math.max(1, rows.length), now),
        actor,
        now,
      )
    : original;
  const activeDesign = state.designRevisions.find(
    ({ id }) => id === state.activeDesignRevisionId,
  )?.design;
  if (!activeDesign) throw new Error("ADAPTIVE_SURVIVAL_ACTIVE_DESIGN_MISSING");
  const equivalence = projection.assertEquivalent(activeDesign, now);
  if (equivalence.status !== "equivalent") {
    throw new Error(
      `ADAPTIVE_SURVIVAL_DUAL_WRITE_NOT_EQUIVALENT:${equivalence.diagnostics.join(",")}`,
    );
  }
  const checkedSnapshot = AdaptiveInputSnapshotSchema.parse({ ...snapshot, equivalence });
  const rawRevisionId = nextAdaptiveRawRevisionId(state);
  const { units, observations } = adaptiveSurvivalRecords(
    checkedSnapshot,
    activeDesign,
    rawRevisionId,
  );
  state = appendRawRevision(
    state,
    {
      id: rawRevisionId,
      previousRevisionId: state.activeRawRevisionId,
      sourceKind: "project_edit",
      sourceName: checkedSnapshot.rawLineage?.sourceLabel,
      createdAt: now,
      createdBy: actor,
      note: "Editable time-to-event table revision",
    },
    units,
    observations,
    actor,
  );
  return ProjectStateSchema.parse({
    ...state,
    metadata: {
      ...state.metadata,
      projectName: snapshot.contract.experimentName,
      updatedAt: now,
    },
    adaptiveInput: checkedSnapshot,
  });
}

const withoutEquivalence = (snapshot: AdaptiveInputSnapshot) => {
  const { equivalence: _equivalence, ...rest } = snapshot;
  return rest;
};

/**
 * Revalidates a no-raw-change save against the actual active design without
 * creating a raw/design revision. If no semantic or mapping metadata changed,
 * the original state is returned unchanged at the persisted-data boundary.
 */
export function synchronizeAdaptiveSurvivalProject(
  stateInput: ProjectState,
  snapshotInput: AdaptiveInputSnapshot,
  now = new Date().toISOString(),
): ProjectState {
  const original = ProjectStateSchema.parse(stateInput);
  const snapshot = AdaptiveInputSnapshotSchema.parse(snapshotInput);
  if (!original.adaptiveInput) {
    throw new Error("ADAPTIVE_SURVIVAL_EXISTING_SNAPSHOT_MISSING");
  }
  if (original.adaptiveInput.contract.contractId !== snapshot.contract.contractId) {
    throw new Error("ADAPTIVE_SURVIVAL_CONTRACT_ID_MISMATCH");
  }
  const activeDesign = original.designRevisions.find(
    ({ id }) => id === original.activeDesignRevisionId,
  )?.design;
  if (!activeDesign) throw new Error("ADAPTIVE_SURVIVAL_ACTIVE_DESIGN_MISSING");
  const projection = createTimeToEventContractProjection(snapshot.contract);
  const equivalence = projection.assertEquivalent(activeDesign, now);
  if (equivalence.status !== "equivalent") {
    throw new Error(
      `ADAPTIVE_SURVIVAL_DUAL_WRITE_NOT_EQUIVALENT:${equivalence.diagnostics.join(",")}`,
    );
  }
  const checkedSnapshot = AdaptiveInputSnapshotSchema.parse({ ...snapshot, equivalence });
  const unchangedSnapshot =
    JSON.stringify(withoutEquivalence(original.adaptiveInput)) ===
      JSON.stringify(withoutEquivalence(checkedSnapshot)) &&
    original.adaptiveInput.equivalence.status === equivalence.status &&
    original.adaptiveInput.equivalence.contractFingerprint === equivalence.contractFingerprint &&
    original.adaptiveInput.equivalence.designFingerprint === equivalence.designFingerprint;
  if (unchangedSnapshot) return original;
  return ProjectStateSchema.parse({
    ...original,
    metadata: { ...original.metadata, updatedAt: now },
    adaptiveInput: checkedSnapshot,
  });
}

type AnalysisExecution = Parameters<typeof appendAnalysisExecution>[1];

/**
 * Appends a rerun as the sole current analysis for the active raw/design
 * revisions. Superseded executions and graphs remain immutable history.
 */
export function appendSupersedingAnalysisExecution(
  stateInput: ProjectState,
  analysis: AnalysisExecution,
  actor: string,
): ProjectState {
  const state = ProjectStateSchema.parse(stateInput);
  const currentRunIds = new Set(
    state.analysisRuns.filter(({ state }) => state === "current").map(({ id }) => id),
  );
  if (currentRunIds.size === 0) return appendAnalysisExecution(state, analysis, actor);
  const staleReason = `Analysis superseded by ${analysis.request.requestId}`;
  const occurredAt = analysis.result.completedAt;
  const prepared = ProjectStateSchema.parse({
    ...state,
    analysisRuns: state.analysisRuns.map((run) =>
      currentRunIds.has(run.id)
        ? { ...run, state: "stale" as const, staleReason }
        : run,
    ),
    graphs: state.graphs.map((graph) =>
      currentRunIds.has(graph.sourceAnalysisRunId)
        ? { ...graph, state: "stale" as const, staleReason }
        : graph,
    ),
    provenanceEvents: [
      ...state.provenanceEvents,
      ...[...currentRunIds].map((runId) => ({
        id: `provenance.${runId}.stale.${analysis.request.requestId}`,
        kind: "analysis_marked_stale" as const,
        targetId: runId,
        occurredAt,
        actor,
        detail: staleReason,
      })),
    ],
  });
  return appendAnalysisExecution(prepared, analysis, actor);
}

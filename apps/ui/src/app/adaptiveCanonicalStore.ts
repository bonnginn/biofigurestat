import {
  AdaptiveInputSnapshotSchema,
  CanonicalAdaptiveObservationSchema,
  StructureContractSchema,
  type AdaptiveInputSnapshot,
  type CanonicalAdaptiveObservation,
  type StructureContract,
} from "@lsaa/domain";
import {
  assertDualWriteEquivalence,
  projectContractToExperimentDesign,
  selectAdaptiveSurface,
} from "@lsaa/adaptive-input";

import {
  cellIsNotPlanned,
  experimentCellKey,
  hasSharedSourceConditionUnits,
  plannedExperimentalUnitCount,
  wbCorrectedBandValue,
  type ExperimentCellDraft,
  type ExperimentCellMap,
  type ExperimentSetDraft,
} from "./experimentDraft";
import { createAdaptiveWorkspace } from "./adaptiveWorkspace";

type Coordinate = Readonly<{
  experimentIndex: number;
  conditionIndex: number;
  readout: StructureContract["readouts"][number];
  timePointIndex: number | null;
  key: string;
}>;

const factorCombinations = (contract: StructureContract): Array<Record<string, string>> =>
  contract.factors.reduce<Array<Record<string, string>>>(
    (rows, factor) =>
      rows.flatMap((row) => factor.levels.map((level) => ({ ...row, [factor.key]: level }))),
    [{}],
  );

const sameAxisValue = (left: string | number | undefined, right: number): boolean =>
  left !== undefined && String(left) === String(right);

function stableFingerprint(value: unknown): string {
  const normalize = (candidate: unknown): unknown => {
    if (Array.isArray(candidate)) return candidate.map(normalize);
    if (candidate && typeof candidate === "object")
      return Object.fromEntries(
        Object.entries(candidate)
          .sort(([left], [right]) => left.localeCompare(right))
          .map(([key, entry]) => [key, normalize(entry)]),
      );
    return candidate;
  };
  return JSON.stringify(normalize(value));
}

/**
 * Imported canonical rows remain the authority when source lineage exists.
 * A reopened workspace cannot reconstruct projection-only cell metadata such
 * as `observationUnitIds` or `sourceLocations` from the legacy project record
 * shape, and it omits unused empty cells.  Compare only the editable scientific
 * cell payload so a byte-unchanged reopen is accepted without weakening the
 * guard against value or planned/missingness changes.
 */
function sourceLineageCellFingerprint(cells: ExperimentCellMap): string {
  const semanticCells = Object.entries(cells).flatMap(([key, cell]) => {
    if (
      cell.kind === "nested_continuous" &&
      cell.rawValues.length === 0 &&
      cell.availability !== "not_planned"
    ) {
      return [];
    }
    const payload =
      cell.kind === "nested_continuous"
        ? {
            kind: cell.kind,
            rawValues: cell.rawValues,
            availability: cell.availability ?? "planned",
          }
        : cell.kind === "proportion"
          ? {
              kind: cell.kind,
              positive: cell.positive,
              eligible: cell.eligible,
              availability: cell.availability ?? "planned",
            }
          : cell.kind === "categorical_counts"
            ? {
                kind: cell.kind,
                counts: cell.counts,
                availability: cell.availability ?? "planned",
              }
            : {
                kind: cell.kind,
                target: cell.target,
                reference: cell.reference,
                inputMode: cell.inputMode ?? "corrected_value",
                targetSource: cell.targetSource ?? null,
                referenceSource: cell.referenceSource ?? null,
                availability: cell.availability ?? "planned",
              };
    return [[key, payload] as const];
  });
  return stableFingerprint(Object.fromEntries(semanticCells));
}

function adaptiveContract(draft: ExperimentSetDraft): StructureContract | null {
  if (draft.adaptiveInput) return draft.adaptiveInput.contract;
  if (!draft.adaptiveTemplate) return null;
  return StructureContractSchema.parse({
    ...draft.adaptiveTemplate.contract,
    experimentName: draft.name,
  });
}

function conditionIndexForRow(
  contract: StructureContract,
  row: CanonicalAdaptiveObservation,
): number {
  const combinations = factorCombinations(contract);
  if (contract.factors.length === 0) return 0;
  return combinations.findIndex((combination) =>
    contract.factors.every((factor) => row.factors[factor.key] === combination[factor.key]),
  );
}

function experimentalIdentityKey(contract: StructureContract): string {
  return (
    contract.identities.find(
      ({ unitLevelKey }) => unitLevelKey === contract.experimentalUnitLevelKey,
    )?.key ?? contract.identities[0]!.key
  );
}

function priorIdentityOrderByCondition(
  contract: StructureContract,
  observations: readonly CanonicalAdaptiveObservation[],
): Map<number, string[]> {
  const result = new Map<number, string[]>();
  const identityKey = experimentalIdentityKey(contract);
  observations.forEach((row) => {
    const conditionIndex = conditionIndexForRow(contract, row);
    const identity = row.identities[identityKey];
    if (conditionIndex < 0 || !identity) return;
    const values = result.get(conditionIndex) ?? [];
    if (!values.includes(identity)) values.push(identity);
    result.set(conditionIndex, values);
  });
  return result;
}

function coordinateForPriorRow(input: {
  draft: ExperimentSetDraft;
  contract: StructureContract;
  row: CanonicalAdaptiveObservation;
  identityOrder: Map<number, string[]>;
}): Coordinate | null {
  const { draft, contract, row, identityOrder } = input;
  const conditionIndex = conditionIndexForRow(contract, row);
  const condition = draft.conditions[conditionIndex];
  if (conditionIndex < 0 || !condition) return null;
  const sessionIdentityKey =
    draft.conditionAssignment.kind === "matched"
      ? (contract.matching.identityKey ?? experimentalIdentityKey(contract))
      : experimentalIdentityKey(contract);
  const semanticIdentity = row.identities[sessionIdentityKey];
  if (!semanticIdentity) return null;
  const experimentIndex =
    draft.conditionAssignment.kind === "matched"
      ? draft.experiments.findIndex(
          ({ stableUnitId, label }) =>
            stableUnitId === semanticIdentity || label === semanticIdentity,
        )
      : (identityOrder.get(conditionIndex)?.indexOf(semanticIdentity) ?? -1);
  const experiment = draft.experiments[experimentIndex];
  if (experimentIndex < 0 || !experiment) return null;
  const readout = contract.readouts.find(({ key }) => key === row.readoutKey);
  if (!readout) return null;
  const draftReadout = draft.readouts.find(({ id }) => id === `outcome.${readout.key}`);
  if (!draftReadout) return null;
  const axis = contract.orderedAxes.length === 1 ? contract.orderedAxes[0] : null;
  const timePointIndex = axis
    ? draft.time.points.findIndex(({ value }) => sameAxisValue(row.axes[axis.key], value))
    : null;
  const timePoint =
    timePointIndex === null || timePointIndex < 0 ? undefined : draft.time.points[timePointIndex];
  return {
    experimentIndex,
    conditionIndex,
    readout,
    timePointIndex: timePointIndex !== null && timePointIndex >= 0 ? timePointIndex : null,
    key: experimentCellKey({
      experimentId: experiment.id,
      conditionId: condition.id,
      readoutId: draftReadout.id,
      ...(timePoint ? { timePointId: timePoint.id } : {}),
    }),
  };
}

function factorsForCondition(
  draft: ExperimentSetDraft,
  contract: StructureContract,
  conditionIndex: number,
): Record<string, string> {
  const condition = draft.conditions[conditionIndex];
  const fallback = factorCombinations(contract)[conditionIndex] ?? {};
  return Object.fromEntries(
    contract.factors.map((factor) => [
      factor.key,
      condition?.attributes[`factor.${factor.key}`] ?? fallback[factor.key] ?? factor.levels[0]!,
    ]),
  );
}

function identitiesForNewRow(input: {
  draft: ExperimentSetDraft;
  contract: StructureContract;
  coordinate: Coordinate;
  observationIndex: number;
  cell: ExperimentCellDraft;
}): { identities: Record<string, string>; hierarchy: Record<string, string> } {
  const { draft, contract, coordinate, observationIndex, cell } = input;
  const experiment = draft.experiments[coordinate.experimentIndex]!;
  const condition = draft.conditions[coordinate.conditionIndex]!;
  const stableSessionIdentity = experiment.stableUnitId ?? experiment.id;
  const semanticSessionIdentity = experiment.label.trim() || stableSessionIdentity;
  const sharedSource = hasSharedSourceConditionUnits(draft);
  const experimentalIdentity =
    draft.conditionAssignment.kind === "matched" && !sharedSource
      ? semanticSessionIdentity
      : `${semanticSessionIdentity} · ${condition.label}`;
  const matchingIdentityKey =
    draft.conditionAssignment.kind === "matched" ? contract.matching.identityKey : null;
  const observationIdentity =
    cell.kind === "nested_continuous" ? cell.observationUnitIds?.[observationIndex] : undefined;
  const identities = Object.fromEntries(
    contract.identities.map((identity) => {
      if (identity.key === matchingIdentityKey) return [identity.key, semanticSessionIdentity];
      if (identity.unitLevelKey === contract.experimentalUnitLevelKey)
        return [identity.key, experimentalIdentity];
      if (identity.unitLevelKey === coordinate.readout.observationLevelKey && observationIdentity)
        return [identity.key, observationIdentity];
      return [
        identity.key,
        `${experimentalIdentity}.${identity.unitLevelKey}.${observationIndex + 1}`,
      ];
    }),
  );
  const identityByLevel = new Set(contract.identities.map(({ unitLevelKey }) => unitLevelKey));
  const hierarchy = Object.fromEntries(
    contract.unitLevels
      .filter(({ key }) => !identityByLevel.has(key))
      .map(({ key }) => [key, `${experimentalIdentity}.${key}.${observationIndex + 1}`]),
  );
  return { identities, hierarchy };
}

function missingnessFor(
  base: CanonicalAdaptiveObservation | undefined,
  values: Readonly<Record<string, string | number | boolean | null>>,
  notPlanned: boolean,
): CanonicalAdaptiveObservation["missingness"] {
  const next = { ...(base?.missingness ?? {}) };
  Object.entries(values).forEach(([key, value]) => {
    if (value === null) next[key] = notPlanned ? "not_applicable" : (next[key] ?? "unknown");
    else delete next[key];
  });
  return next;
}

function rowWithValues(input: {
  base: CanonicalAdaptiveObservation | undefined;
  draft: ExperimentSetDraft;
  contract: StructureContract;
  coordinate: Coordinate;
  cell: ExperimentCellDraft;
  observationIndex: number;
  values: Record<string, string | number | boolean | null>;
  nextObservationId: () => string;
}): CanonicalAdaptiveObservation {
  const { base, draft, contract, coordinate, cell, observationIndex, values, nextObservationId } =
    input;
  const generated = identitiesForNewRow({
    draft,
    contract,
    coordinate,
    observationIndex,
    cell,
  });
  const factors = factorsForCondition(draft, contract, coordinate.conditionIndex);
  const axis = contract.orderedAxes.length === 1 ? contract.orderedAxes[0] : null;
  const point =
    coordinate.timePointIndex === null ? undefined : draft.time.points[coordinate.timePointIndex];
  const axes = axis && point ? { [axis.key]: point.value } : {};
  const mergedValues = { ...(base?.values ?? {}), ...values };
  const missingness = missingnessFor(base, values, cellIsNotPlanned(cell));
  const changed =
    !base ||
    Object.entries(values).some(([key, value]) => base.values[key] !== value) ||
    Object.keys(values).some(
      (key) => (base.missingness[key] ?? null) !== (missingness[key] ?? null),
    );
  return CanonicalAdaptiveObservationSchema.parse({
    observationId: base?.observationId ?? nextObservationId(),
    readoutKey: coordinate.readout.key,
    identities: base?.identities ?? generated.identities,
    factors: base?.factors ?? factors,
    axes: base?.axes ?? axes,
    hierarchy: base?.hierarchy ?? generated.hierarchy,
    values: mergedValues,
    missingness,
    sourceRow: changed ? null : (base?.sourceRow ?? null),
  });
}

function updatedRowsForCell(input: {
  draft: ExperimentSetDraft;
  contract: StructureContract;
  coordinate: Coordinate;
  cell: ExperimentCellDraft | undefined;
  prior: readonly CanonicalAdaptiveObservation[];
  nextObservationId: () => string;
}): CanonicalAdaptiveObservation[] {
  const { draft, contract, coordinate, cell, prior, nextObservationId } = input;
  if (!cell) return [...prior];
  const readout = coordinate.readout;
  const notPlanned = cellIsNotPlanned(cell);
  if (readout.representation === "scalar") {
    if (cell.kind !== "nested_continuous") throw new Error("ADAPTIVE_CELL_SHAPE_MISMATCH:scalar");
    const rowCount = Math.max(
      cell.rawValues.length,
      prior.length,
      notPlanned && prior.length === 0 ? 1 : 0,
    );
    return Array.from({ length: rowCount }, (_, index) =>
      rowWithValues({
        base: prior[index],
        draft,
        contract,
        coordinate,
        cell,
        observationIndex: index,
        values: { [readout.key]: cell.rawValues[index] ?? null },
        nextObservationId,
      }),
    );
  }
  if (readout.representation === "proportion_counts") {
    if (cell.kind !== "proportion")
      throw new Error("ADAPTIVE_CELL_SHAPE_MISMATCH:proportion_counts");
    if (cell.positive !== null && cell.eligible !== null && cell.positive > cell.eligible)
      throw new Error("ADAPTIVE_INVALID_PROPORTION:NUMERATOR_EXCEEDS_DENOMINATOR");
    if (cell.positive === null && cell.eligible === null && prior.length === 0 && !notPlanned)
      return [];
    const numeratorKey = `${readout.key}_${readout.componentKeys[0]!}`;
    const denominatorKey = `${readout.key}_${readout.componentKeys[1]!}`;
    return [
      rowWithValues({
        base: prior[0],
        draft,
        contract,
        coordinate,
        cell,
        observationIndex: 0,
        values: { [numeratorKey]: cell.positive, [denominatorKey]: cell.eligible },
        nextObservationId,
      }),
    ];
  }
  if (readout.representation === "category_counts") {
    if (cell.kind !== "categorical_counts")
      throw new Error("ADAPTIVE_CELL_SHAPE_MISMATCH:category_counts");
    const values = Object.fromEntries(
      readout.componentKeys.map((component) => [
        `${readout.key}_${component}`,
        cell.counts[component] ?? null,
      ]),
    );
    if (Object.values(values).every((value) => value === null) && prior.length === 0 && !notPlanned)
      return [];
    return [
      rowWithValues({
        base: prior[0],
        draft,
        contract,
        coordinate,
        cell,
        observationIndex: 0,
        values,
        nextObservationId,
      }),
    ];
  }
  if (readout.representation === "target_reference") {
    if (cell.kind !== "wb_ratio") throw new Error("ADAPTIVE_CELL_SHAPE_MISMATCH:target_reference");
    const target = wbCorrectedBandValue(cell, "target");
    const reference = wbCorrectedBandValue(cell, "reference");
    if (target === null && reference === null && prior.length === 0 && !notPlanned) return [];
    return [
      rowWithValues({
        base: prior[0],
        draft,
        contract,
        coordinate,
        cell,
        observationIndex: 0,
        values: {
          [`${readout.key}_${readout.componentKeys[0]!}`]: target,
          [`${readout.key}_${readout.componentKeys[1]!}`]: reference,
        },
        nextObservationId,
      }),
    ];
  }
  // Dedicated/typed surfaces are not editable through ExperimentWorkspace.
  // Keep their canonical records intact rather than coercing them into scalar cells.
  return [...prior];
}

export function synchronizeAdaptiveSnapshot(input: {
  draft: ExperimentSetDraft;
  cells: ExperimentCellMap;
  now: string;
}): AdaptiveInputSnapshot | null {
  const contract = adaptiveContract(input.draft);
  if (!contract) return null;
  const existingSnapshot = input.draft.adaptiveInput;
  const canonicalHasSourceLineage = Boolean(
    existingSnapshot &&
    (existingSnapshot.mapping ||
      existingSnapshot.rawLineage ||
      existingSnapshot.canonicalObservations.some(({ sourceRow }) => sourceRow !== null)),
  );
  if (existingSnapshot && canonicalHasSourceLineage) {
    // Imported/promoted canonical rows are the lossless authority.  The legacy
    // workspace cell shape omits interior missing rows and cannot round-trip
    // source-row identity safely.  Until edits carry explicit canonical
    // observation provenance, an unchanged save must not regenerate these rows
    // from that lossy projection.
    const projected = createAdaptiveWorkspace({
      contract,
      observations: existingSnapshot.canonicalObservations,
      mapping: existingSnapshot.mapping,
      lineage: existingSnapshot.rawLineage,
      biologicalSetup: existingSnapshot.biologicalSetup,
      confirmedTargetedConfirmations: existingSnapshot.targetedConfirmations,
      now: input.now,
    });
    if (
      projected.status !== "ready" ||
      sourceLineageCellFingerprint(projected.cells) !== sourceLineageCellFingerprint(input.cells)
    ) {
      throw new Error("SOURCE_LINEAGE_CANONICAL_REVISION_REQUIRED");
    }
    const design = projectContractToExperimentDesign(
      contract,
      plannedExperimentalUnitCount(input.draft),
      input.now,
    );
    return AdaptiveInputSnapshotSchema.parse({
      ...existingSnapshot,
      contract,
      equivalence: assertDualWriteEquivalence(contract, design, input.now),
    });
  }
  const previous = input.draft.adaptiveInput?.canonicalObservations ?? [];
  const identityOrder = priorIdentityOrderByCondition(contract, previous);
  const grouped = new Map<string, CanonicalAdaptiveObservation[]>();
  const unassigned: CanonicalAdaptiveObservation[] = [];
  previous.forEach((row) => {
    const coordinate = coordinateForPriorRow({
      draft: input.draft,
      contract,
      row,
      identityOrder,
    });
    if (!coordinate) unassigned.push(row);
    else grouped.set(coordinate.key, [...(grouped.get(coordinate.key) ?? []), row]);
  });
  const existingIds = new Set(previous.map(({ observationId }) => observationId));
  let generatedIndex = 0;
  const nextObservationId = () => {
    let candidate = "";
    do {
      generatedIndex += 1;
      candidate = `adaptive.${contract.contractId}.workspace.${generatedIndex}`;
    } while (existingIds.has(candidate));
    existingIds.add(candidate);
    return candidate;
  };
  const observations: CanonicalAdaptiveObservation[] = [];
  const consumedKeys = new Set<string>();
  const timePoints = input.draft.time.points.length
    ? input.draft.time.points.map((_, index) => index)
    : [null];
  input.draft.experiments.forEach((experiment, experimentIndex) => {
    input.draft.conditions.forEach((condition, conditionIndex) => {
      contract.readouts.forEach((readout) => {
        const draftReadout = input.draft.readouts.find(({ id }) => id === `outcome.${readout.key}`);
        if (!draftReadout) return;
        timePoints.forEach((timePointIndex) => {
          const timePoint =
            timePointIndex === null ? undefined : input.draft.time.points[timePointIndex];
          const key = experimentCellKey({
            experimentId: experiment.id,
            conditionId: condition.id,
            readoutId: draftReadout.id,
            ...(timePoint ? { timePointId: timePoint.id } : {}),
          });
          consumedKeys.add(key);
          observations.push(
            ...updatedRowsForCell({
              draft: input.draft,
              contract,
              coordinate: { experimentIndex, conditionIndex, readout, timePointIndex, key },
              cell: input.cells[key],
              prior: grouped.get(key) ?? [],
              nextObservationId,
            }),
          );
        });
      });
    });
  });
  grouped.forEach((rows, key) => {
    if (!consumedKeys.has(key)) observations.push(...rows);
  });
  observations.push(...unassigned);

  const canonicalFingerprint = (rows: readonly CanonicalAdaptiveObservation[]) =>
    JSON.stringify(
      [...rows]
        .sort((left, right) => left.observationId.localeCompare(right.observationId))
        .map((row) => ({
          ...row,
          identities: Object.fromEntries(Object.entries(row.identities).sort()),
          factors: Object.fromEntries(Object.entries(row.factors).sort()),
          axes: Object.fromEntries(Object.entries(row.axes).sort()),
          hierarchy: Object.fromEntries(Object.entries(row.hierarchy).sort()),
          values: Object.fromEntries(Object.entries(row.values).sort()),
          missingness: Object.fromEntries(Object.entries(row.missingness).sort()),
        })),
    );
  const changed = canonicalFingerprint(previous) !== canonicalFingerprint(observations);
  const rawLineage = input.draft.adaptiveInput?.rawLineage
    ? {
        ...input.draft.adaptiveInput.rawLineage,
        transformations: [
          ...input.draft.adaptiveInput.rawLineage.transformations,
          ...(changed &&
          !input.draft.adaptiveInput.rawLineage.transformations.includes(
            "workspace_edit_applied_to_canonical_observations",
          )
            ? ["workspace_edit_applied_to_canonical_observations"]
            : []),
        ],
      }
    : null;
  const design = projectContractToExperimentDesign(
    contract,
    plannedExperimentalUnitCount(input.draft),
    input.now,
  );
  return AdaptiveInputSnapshotSchema.parse({
    schemaVersion: "0.1.0",
    featureFlag: "experiment_first_adaptive_input_alpha",
    contract,
    surface:
      input.draft.adaptiveInput?.surface ??
      input.draft.adaptiveTemplate?.surface ??
      selectAdaptiveSurface(contract),
    mapping: input.draft.adaptiveInput?.mapping ?? null,
    rawLineage,
    canonicalObservations: observations,
    equivalence: assertDualWriteEquivalence(contract, design, input.now),
    targetedConfirmations:
      input.draft.adaptiveInput?.targetedConfirmations ??
      input.draft.adaptiveTemplate?.targetedConfirmations ??
      [],
    ...(input.draft.adaptiveInput?.biologicalSetup !== undefined
      ? { biologicalSetup: input.draft.adaptiveInput.biologicalSetup }
      : {}),
  });
}

export function synchronizeAdaptiveDraft(input: {
  draft: ExperimentSetDraft;
  cells: ExperimentCellMap;
  now: string;
}): ExperimentSetDraft {
  const snapshot = synchronizeAdaptiveSnapshot(input);
  if (!snapshot) return input.draft;
  const { adaptiveTemplate: _template, ...draft } = input.draft;
  return { ...draft, adaptiveInput: snapshot };
}

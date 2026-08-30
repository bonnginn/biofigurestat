import {
  STRUCTURE_CONTRACT_VERSION,
  StructureContractSchema,
  type StructureContract,
} from "@lsaa/domain";

export type MinimalBiologicalAnswers = Readonly<{
  experimentName: string;
  experimentDescription: string;
  experimentalUnitLabel: string;
  identityLabel: string;
  readoutLabel: string;
  readoutRepresentation: StructureContract["readouts"][number]["representation"];
  /**
   * Required only when several readouts do not share the same observation
   * grain. A single readout keeps the established safe inference.
   */
  readoutUsesNestedObservation?: boolean;
  /** Required for multi-readout ordered experiments; single readouts infer it. */
  readoutUsesOrderedAxis?: boolean;
  /**
   * Other measurements recorded from the same declared structure.  This is
   * intentionally a small repeatable definition, not a request to design a
   * table. Factors are shared, while observation grain and an ordered axis
   * must be bound explicitly when several readouts differ.
   */
  additionalReadouts?: readonly Readonly<{
    label: string;
    representation: StructureContract["readouts"][number]["representation"];
    usesNestedObservation?: boolean;
    usesOrderedAxis?: boolean;
  }>[];
  factorName?: string;
  factorLevels?: readonly string[];
  additionalFactors?: readonly Readonly<{
    name: string;
    levels: readonly string[];
    sameIdentityAcrossConditions?: boolean;
  }>[];
  sameIdentityAcrossConditions: boolean;
  /**
   * Explicit physical relationship among condition receivers. The legacy
   * boolean above remains as a compatibility fallback, but it cannot
   * distinguish one literal entity from separate condition-specific units
   * made from one donor/preparation.
   */
  conditionEntityRelationship?:
    | Readonly<{ kind: "independent_condition_units" }>
    | Readonly<{ kind: "same_entity_across_conditions" }>
    | Readonly<{
        kind: "distinct_condition_units_shared_source";
        sourceUnitLabel: string;
        sourceIdentityLabel: string;
        sourceRole: "block" | "sample";
        completeSetsRequired: boolean;
      }>;
  orderedAxis?: Readonly<{
    label: string;
    unit: string;
    levels: readonly (string | number)[];
    sameIdentity: boolean;
  }>;
  nestedObservationLabel?: string;
}>;

export const semanticKey = (label: string): string => {
  const tokens: string[] = [];
  let separator = false;
  for (const character of label.normalize("NFKC")) {
    if (/[A-Za-z0-9]/.test(character)) {
      tokens.push(character.toLowerCase());
      separator = false;
    } else if (/\p{Letter}|\p{Number}/u.test(character)) {
      if (separator && tokens.length) tokens.push("_");
      tokens.push(`u${character.codePointAt(0)!.toString(16)}`);
      separator = false;
    } else separator = tokens.length > 0;
  }
  return tokens.join("").replace(/^_+|_+$/g, "") || "field";
};

export type BiologicalStructureAnswers = Readonly<Omit<StructureContract, "schemaVersion">>;

/** Compiles confirmed/inferred biological facts; it performs no statistical inference. */
export function compileStructureContract(answers: BiologicalStructureAnswers): StructureContract {
  return StructureContractSchema.parse({ schemaVersion: STRUCTURE_CONTRACT_VERSION, ...answers });
}

const components = (
  representation: MinimalBiologicalAnswers["readoutRepresentation"],
): string[] => {
  if (representation === "proportion_counts") return ["numerator", "denominator"];
  if (representation === "category_counts") return ["category", "count"];
  if (representation === "target_reference") return ["target", "reference"];
  if (representation === "paired_readouts") return ["x", "y"];
  if (representation === "event_censoring") return ["follow_up", "event_observed"];
  if (representation === "dose_response") return ["dose", "response"];
  return ["value"];
};

const aggregateTypedRepresentations = new Set<MinimalBiologicalAnswers["readoutRepresentation"]>([
  "proportion_counts",
  "category_counts",
  "target_reference",
]);

export function buildStructureContract(answers: MinimalBiologicalAnswers): StructureContract {
  const unitKey = semanticKey(answers.experimentalUnitLabel);
  const identityKey = semanticKey(answers.identityLabel);
  const readoutAnswers = [
    {
      label: answers.readoutLabel.trim(),
      representation: answers.readoutRepresentation,
      usesNestedObservation: answers.readoutUsesNestedObservation,
      usesOrderedAxis: answers.readoutUsesOrderedAxis,
    },
    ...(answers.additionalReadouts ?? []).map((readout) => ({
      label: readout.label.trim(),
      representation: readout.representation,
      usesNestedObservation: readout.usesNestedObservation,
      usesOrderedAxis: readout.usesOrderedAxis,
    })),
  ];
  if (readoutAnswers.some(({ label }) => !label)) {
    throw new Error("READOUT_LABEL_REQUIRED");
  }
  const readoutKeys = readoutAnswers.map(({ label }) => semanticKey(label));
  if (new Set(readoutKeys).size !== readoutKeys.length) {
    throw new Error("DUPLICATE_READOUT_LABEL");
  }
  const declaredNestedKey = answers.nestedObservationLabel?.trim()
    ? semanticKey(answers.nestedObservationLabel)
    : null;
  const axisKey = answers.orderedAxis ? semanticKey(answers.orderedAxis.label) : null;
  const hasSeveralReadouts = readoutAnswers.length > 1;
  if (
    hasSeveralReadouts &&
    declaredNestedKey &&
    readoutAnswers.some(
      ({ representation, usesNestedObservation }) =>
        !aggregateTypedRepresentations.has(representation) && usesNestedObservation === undefined,
    )
  ) {
    throw new Error("MULTIPLE_READOUT_NESTING_BINDING_REQUIRED");
  }
  if (
    hasSeveralReadouts &&
    axisKey &&
    readoutAnswers.some(({ usesOrderedAxis }) => usesOrderedAxis === undefined)
  ) {
    throw new Error("MULTIPLE_READOUT_AXIS_BINDING_REQUIRED");
  }
  const readoutUsesNestedObservation = readoutAnswers.map(
    ({ representation, usesNestedObservation }) =>
      !aggregateTypedRepresentations.has(representation) &&
      (hasSeveralReadouts ? usesNestedObservation === true : declaredNestedKey !== null),
  );
  const readoutUsesOrderedAxis = readoutAnswers.map(({ usesOrderedAxis }) =>
    hasSeveralReadouts ? usesOrderedAxis === true : axisKey !== null,
  );
  if (declaredNestedKey && hasSeveralReadouts && !readoutUsesNestedObservation.some(Boolean)) {
    throw new Error("NESTED_OBSERVATION_READOUT_REQUIRED");
  }
  if (axisKey && !readoutUsesOrderedAxis.some(Boolean)) {
    throw new Error("ORDERED_AXIS_READOUT_REQUIRED");
  }
  const nestedKey = readoutUsesNestedObservation.some(Boolean) ? declaredNestedKey : null;
  const factorKey =
    answers.factorName?.trim() && answers.factorLevels?.length
      ? semanticKey(answers.factorName)
      : null;
  const conditionRelationship =
    answers.conditionEntityRelationship ??
    (answers.sameIdentityAcrossConditions
      ? { kind: "same_entity_across_conditions" as const }
      : { kind: "independent_condition_units" as const });
  const primaryFactorUsesSameEntity =
    conditionRelationship.kind === "same_entity_across_conditions";
  const factorAnswers = [
    ...(factorKey
      ? [
          {
            key: factorKey,
            name: answers.factorName!,
            levels: answers.factorLevels!,
            sameIdentity: primaryFactorUsesSameEntity,
            isPrimary: true,
          },
        ]
      : []),
    ...(answers.additionalFactors ?? [])
      .filter(({ name, levels }) => name.trim() && levels.length)
      .map(({ name, levels, sameIdentityAcrossConditions }) => ({
        key: semanticKey(name),
        name,
        levels,
        sameIdentity: sameIdentityAcrossConditions ?? primaryFactorUsesSameEntity,
        isPrimary: false,
      })),
  ];
  const sharedSource =
    conditionRelationship.kind === "distinct_condition_units_shared_source"
      ? conditionRelationship
      : null;
  const sourceUnitKey = sharedSource ? semanticKey(sharedSource.sourceUnitLabel) : null;
  const sourceIdentityKey = sharedSource ? semanticKey(sharedSource.sourceIdentityLabel) : null;
  if (
    sharedSource &&
    (!sharedSource.sourceUnitLabel.trim() || !sharedSource.sourceIdentityLabel.trim())
  ) {
    throw new Error("SHARED_SOURCE_LABELS_REQUIRED");
  }
  if (sharedSource && (sourceUnitKey === unitKey || sourceIdentityKey === identityKey)) {
    throw new Error("SHARED_SOURCE_AND_CONDITION_UNIT_KEYS_MUST_BE_DISTINCT");
  }
  const hasWithinFactor = factorAnswers.some(({ sameIdentity }) => sameIdentity);
  const hasBetweenFactor = factorAnswers.some(({ sameIdentity }) => !sameIdentity);
  if (sharedSource && hasWithinFactor) {
    // Contract 0.1.0 has only one global matching identity. It cannot safely
    // encode a literal same-entity factor and a different shared-source factor
    // when those relationships require identities at two unit levels.
    throw new Error("MULTIPLE_MATCHING_IDENTITIES_NOT_REPRESENTABLE");
  }
  return StructureContractSchema.parse({
    schemaVersion: STRUCTURE_CONTRACT_VERSION,
    contractId: `contract.${semanticKey(answers.experimentName)}`,
    experimentName: answers.experimentName,
    experimentDescription: answers.experimentDescription,
    unitLevels: [
      ...(sharedSource && sourceUnitKey
        ? [
            {
              key: sourceUnitKey,
              label: sharedSource.sourceUnitLabel,
              role: sharedSource.sourceRole,
              parentKey: null,
            },
          ]
        : []),
      {
        key: unitKey,
        label: answers.experimentalUnitLabel,
        role: "experimental_unit",
        parentKey: sourceUnitKey,
      },
      ...(nestedKey
        ? [
            {
              key: nestedKey,
              label: answers.nestedObservationLabel!,
              role: "subsample" as const,
              parentKey: unitKey,
            },
          ]
        : []),
    ],
    experimentalUnitLevelKey: unitKey,
    identities: [
      ...(sharedSource && sourceUnitKey && sourceIdentityKey
        ? [
            {
              key: sourceIdentityKey,
              label: sharedSource.sourceIdentityLabel,
              unitLevelKey: sourceUnitKey,
              required: true,
            },
          ]
        : []),
      { key: identityKey, label: answers.identityLabel, unitLevelKey: unitKey, required: true },
      ...(nestedKey
        ? [
            {
              key: `${nestedKey}_id`,
              label: `${answers.nestedObservationLabel} ID`,
              unitLevelKey: nestedKey,
              required: true,
            },
          ]
        : []),
    ],
    factors: factorAnswers.map((factor) => ({
      key: factor.key,
      label: factor.name,
      levels: factor.levels,
      unitRole: factor.sameIdentity ? "within_unit" : "between_unit",
      relationship: factor.sameIdentity
        ? "repeated"
        : sharedSource && factor.isPrimary
          ? "paired"
          : "independent",
      ordered: false,
      referenceLevel:
        factor.levels.find((level) => /^(vehicle|control|untreated|mock|baseline)$/i.test(level)) ??
        null,
    })),
    matching:
      sharedSource && sourceIdentityKey
        ? {
            kind: "matched",
            identityKey: sourceIdentityKey,
            completeSetsRequired: sharedSource.completeSetsRequired,
          }
        : hasWithinFactor && hasBetweenFactor
          ? { kind: "mixed", identityKey, completeSetsRequired: null }
          : hasWithinFactor || conditionRelationship.kind === "same_entity_across_conditions"
            ? { kind: "matched", identityKey, completeSetsRequired: true }
            : { kind: "independent", identityKey: null, completeSetsRequired: null },
    orderedAxes:
      answers.orderedAxis && axisKey
        ? [
            {
              key: axisKey,
              label: answers.orderedAxis.label,
              unit: answers.orderedAxis.unit,
              levels: answers.orderedAxis.levels,
              sampling: answers.orderedAxis.sameIdentity
                ? "repeated_same_identity"
                : "cross_sectional",
              identityRetained: answers.orderedAxis.sameIdentity,
            },
          ]
        : [],
    readouts: readoutAnswers.map(({ label, representation }, index) => ({
      key: readoutKeys[index]!,
      label,
      valueType: representation,
      representation,
      componentKeys: components(representation),
      referenceRole: representation === "target_reference" ? "loading_control" : "none",
      // These typed bundles are aggregate records for the experimental unit.
      // A counted Cell/category or normalization component is not itself the
      // row-level biological observation unless a later contract explicitly
      // models and retains those raw records.
      observationLevelKey: aggregateTypedRepresentations.has(representation)
        ? unitKey
        : readoutUsesNestedObservation[index] && nestedKey
          ? nestedKey
          : unitKey,
      axisKeys: axisKey && readoutUsesOrderedAxis[index] ? [axisKey] : [],
    })),
    allowedMissingness: [
      "not_applicable",
      "not_collected",
      "assay_failed",
      "dropout",
      "censored",
      "unknown",
    ],
    rawObservationGrain: nestedKey
      ? readoutUsesNestedObservation.every(Boolean)
        ? `one ${answers.nestedObservationLabel} observation`
        : `mixed by readout: one ${answers.nestedObservationLabel} observation or one ${answers.experimentalUnitLabel} observation`
      : `one ${answers.experimentalUnitLabel} observation`,
  });
}

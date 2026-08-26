import { STRUCTURE_CONTRACT_VERSION, StructureContractSchema, type StructureContract } from "@lsaa/domain";

export type MinimalBiologicalAnswers = Readonly<{
  experimentName: string;
  experimentDescription: string;
  experimentalUnitLabel: string;
  identityLabel: string;
  readoutLabel: string;
  readoutRepresentation: StructureContract["readouts"][number]["representation"];
  factorName?: string;
  factorLevels?: readonly string[];
  additionalFactors?: readonly Readonly<{ name: string; levels: readonly string[]; sameIdentityAcrossConditions?: boolean }>[];
  sameIdentityAcrossConditions: boolean;
  orderedAxis?: Readonly<{ label: string; unit: string; levels: readonly (string | number)[]; sameIdentity: boolean }>;
  nestedObservationLabel?: string;
}>;

export const semanticKey = (label: string): string => {
  const tokens: string[] = [];
  let separator = false;
  for (const character of label.normalize("NFKC")) {
    if (/[A-Za-z0-9]/.test(character)) { tokens.push(character.toLowerCase()); separator = false; }
    else if (/\p{Letter}|\p{Number}/u.test(character)) { if (separator && tokens.length) tokens.push("_"); tokens.push(`u${character.codePointAt(0)!.toString(16)}`); separator = false; }
    else separator = tokens.length > 0;
  }
  return tokens.join("").replace(/^_+|_+$/g, "") || "field";
};

export type BiologicalStructureAnswers = Readonly<Omit<StructureContract, "schemaVersion">>;

/** Compiles confirmed/inferred biological facts; it performs no statistical inference. */
export function compileStructureContract(answers: BiologicalStructureAnswers): StructureContract {
  return StructureContractSchema.parse({ schemaVersion: STRUCTURE_CONTRACT_VERSION, ...answers });
}

const components = (representation: MinimalBiologicalAnswers["readoutRepresentation"]): string[] => {
  if (representation === "proportion_counts") return ["numerator", "denominator"];
  if (representation === "category_counts") return ["category", "count"];
  if (representation === "target_reference") return ["target", "reference"];
  if (representation === "paired_readouts") return ["x", "y"];
  if (representation === "event_censoring") return ["follow_up", "event_observed"];
  if (representation === "dose_response") return ["dose", "response"];
  return ["value"];
};

export function buildStructureContract(answers: MinimalBiologicalAnswers): StructureContract {
  const unitKey = semanticKey(answers.experimentalUnitLabel);
  const identityKey = semanticKey(answers.identityLabel);
  const readoutKey = semanticKey(answers.readoutLabel);
  const nestedKey = answers.nestedObservationLabel?.trim() ? semanticKey(answers.nestedObservationLabel) : null;
  const axisKey = answers.orderedAxis ? semanticKey(answers.orderedAxis.label) : null;
  const factorKey = answers.factorName?.trim() && answers.factorLevels?.length ? semanticKey(answers.factorName) : null;
  const factorAnswers = [
    ...(factorKey ? [{ key: factorKey, name: answers.factorName!, levels: answers.factorLevels!, sameIdentity: answers.sameIdentityAcrossConditions }] : []),
    ...(answers.additionalFactors ?? []).filter(({ name, levels }) => name.trim() && levels.length).map(({ name, levels, sameIdentityAcrossConditions }) => ({ key: semanticKey(name), name, levels, sameIdentity: sameIdentityAcrossConditions ?? answers.sameIdentityAcrossConditions })),
  ];
  const hasWithinFactor = factorAnswers.some(({ sameIdentity }) => sameIdentity);
  const hasBetweenFactor = factorAnswers.some(({ sameIdentity }) => !sameIdentity);
  return StructureContractSchema.parse({
    schemaVersion: STRUCTURE_CONTRACT_VERSION,
    contractId: `contract.${semanticKey(answers.experimentName)}`,
    experimentName: answers.experimentName,
    experimentDescription: answers.experimentDescription,
    unitLevels: [
      { key: unitKey, label: answers.experimentalUnitLabel, role: "experimental_unit", parentKey: null },
      ...(nestedKey ? [{ key: nestedKey, label: answers.nestedObservationLabel!, role: "subsample" as const, parentKey: unitKey }] : []),
    ],
    experimentalUnitLevelKey: unitKey,
    identities: [
      { key: identityKey, label: answers.identityLabel, unitLevelKey: unitKey, required: true },
      ...(nestedKey ? [{ key: `${nestedKey}_id`, label: `${answers.nestedObservationLabel} ID`, unitLevelKey: nestedKey, required: true }] : []),
    ],
    factors: factorAnswers.map((factor) => ({ key: factor.key, label: factor.name, levels: factor.levels, unitRole: factor.sameIdentity ? "within_unit" : "between_unit", relationship: factor.sameIdentity ? "repeated" : "independent", ordered: false, referenceLevel: factor.levels.find((level) => /^(vehicle|control|untreated|mock|baseline)$/i.test(level)) ?? null })),
    matching: hasWithinFactor && hasBetweenFactor ? { kind: "mixed", identityKey, completeSetsRequired: null } : hasWithinFactor || answers.sameIdentityAcrossConditions ? { kind: "matched", identityKey, completeSetsRequired: true } : { kind: "independent", identityKey: null, completeSetsRequired: null },
    orderedAxes: answers.orderedAxis && axisKey ? [{ key: axisKey, label: answers.orderedAxis.label, unit: answers.orderedAxis.unit, levels: answers.orderedAxis.levels, sampling: answers.orderedAxis.sameIdentity ? "repeated_same_identity" : "cross_sectional", identityRetained: answers.orderedAxis.sameIdentity }] : [],
    readouts: [{ key: readoutKey, label: answers.readoutLabel, valueType: answers.readoutRepresentation, representation: answers.readoutRepresentation, componentKeys: components(answers.readoutRepresentation), referenceRole: answers.readoutRepresentation === "target_reference" ? "loading_control" : "none", observationLevelKey: nestedKey ?? unitKey, axisKeys: axisKey ? [axisKey] : [] }],
    allowedMissingness: ["not_applicable", "not_collected", "assay_failed", "dropout", "censored", "unknown"],
    rawObservationGrain: nestedKey ? `one ${answers.nestedObservationLabel} observation` : `one ${answers.experimentalUnitLabel} observation`,
  });
}

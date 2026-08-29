export type SemanticFact =
  "experimental_unit" | "identity_reuse" | "assignment_level" | "ordered_axis" | "missingness_kind";
export type DescriptionStyle =
  "detailed" | "notebook_short" | "ambiguous" | "alternate_terminology";

export interface AdversarialDescription {
  id: string;
  baseCaseId: string;
  style: DescriptionStyle;
  description: string;
  requiredFacts: SemanticFact[];
  explicitFacts: SemanticFact[];
}

export interface AdversarialResult {
  id: string;
  status: "RESOLVED" | "HUMAN_DECISION_REQUIRED";
  questionsShown: number;
  inferredSafely: SemanticFact[];
  targetedConfirmations: SemanticFact[];
}

const variants = (
  baseCaseId: string,
  requiredFacts: SemanticFact[],
  rows: Array<[DescriptionStyle, string, SemanticFact[]]>,
): AdversarialDescription[] =>
  rows.map(([style, description, explicitFacts], index) => ({
    id: `ADV-${baseCaseId}-${index + 1}`,
    baseCaseId,
    style,
    description,
    requiredFacts,
    explicitFacts,
  }));

export const ADVERSARIAL_DESCRIPTIONS: AdversarialDescription[] = [
  ...variants(
    "MATCHED-EXPLANT",
    ["experimental_unit", "identity_reuse", "assignment_level"],
    [
      [
        "detailed",
        "15 donors each supplied two adjacent explants; one explant received vehicle and the other cytokine, and both retained the same DonorID.",
        ["experimental_unit", "identity_reuse", "assignment_level"],
      ],
      [
        "notebook_short",
        "D01–D15: paired explants, V/C, separate ExplantID, common donor.",
        ["experimental_unit", "identity_reuse", "assignment_level"],
      ],
      [
        "ambiguous",
        "Vehicle and cytokine explants were collected from 15 donors.",
        ["experimental_unit"],
      ],
      [
        "alternate_terminology",
        "Within each patient, sibling tissue pieces were split between baseline medium and cytokine exposure.",
        ["experimental_unit", "identity_reuse", "assignment_level"],
      ],
    ],
  ),
  ...variants(
    "IRREGULAR-TIME",
    ["experimental_unit", "identity_reuse", "ordered_axis", "missingness_kind"],
    [
      [
        "detailed",
        "Each dog was sampled repeatedly after dosing at its actual elapsed hours; failed draws remain not-collected records.",
        ["experimental_unit", "identity_reuse", "ordered_axis", "missingness_kind"],
      ],
      [
        "notebook_short",
        "Dog PK: actual hr, same DogID; no-draw marked ND.",
        ["experimental_unit", "identity_reuse", "ordered_axis", "missingness_kind"],
      ],
      [
        "ambiguous",
        "Drug concentrations were measured at several visits after dosing.",
        ["ordered_axis"],
      ],
      [
        "alternate_terminology",
        "Serial specimens from each animal were indexed by time-since-administration; unsuccessful venipuncture was retained as absent collection.",
        ["experimental_unit", "identity_reuse", "ordered_axis", "missingness_kind"],
      ],
    ],
  ),
  ...variants(
    "NESTED-CELLS",
    ["experimental_unit", "identity_reuse", "assignment_level", "ordered_axis"],
    [
      [
        "detailed",
        "Treatment was assigned to organoids; individually tracked cells inside each organoid were imaged at four times without changing TrackID.",
        ["experimental_unit", "identity_reuse", "assignment_level", "ordered_axis"],
      ],
      [
        "notebook_short",
        "Organoid Tx; cells nested, track IDs at 0/2/6/12 h.",
        ["experimental_unit", "identity_reuse", "assignment_level", "ordered_axis"],
      ],
      [
        "ambiguous",
        "Cells from treated and control organoids were imaged over time.",
        ["ordered_axis"],
      ],
      [
        "alternate_terminology",
        "The intervention belonged to each mini-gut, while descendant object trajectories were sampled repeatedly within it.",
        ["experimental_unit", "identity_reuse", "assignment_level", "ordered_axis"],
      ],
    ],
  ),
  ...variants(
    "QPCR-TECHNICAL",
    ["experimental_unit", "identity_reuse", "assignment_level", "missingness_kind"],
    [
      [
        "detailed",
        "Independent cultures supplied cDNA; duplicate wells were technical repeats and one failed amplification was retained as assay failure.",
        ["experimental_unit", "identity_reuse", "assignment_level", "missingness_kind"],
      ],
      [
        "notebook_short",
        "n=10 cultures; 2 tech wells/gene; one bad curve, do not average yet.",
        ["experimental_unit", "identity_reuse", "assignment_level", "missingness_kind"],
      ],
      ["ambiguous", "Ten samples were run in duplicate for target and reference.", []],
      [
        "alternate_terminology",
        "Biological preparations were independently cultured; replicate reactions shared a preparation identifier and a rejected trace was coded assay-failed.",
        ["experimental_unit", "identity_reuse", "assignment_level", "missingness_kind"],
      ],
    ],
  ),
];

export function evaluateAdversarialDescription(item: AdversarialDescription): AdversarialResult {
  const explicit = new Set(item.explicitFacts);
  const targetedConfirmations = item.requiredFacts.filter((fact) => !explicit.has(fact));
  return {
    id: item.id,
    status: targetedConfirmations.length ? "HUMAN_DECISION_REQUIRED" : "RESOLVED",
    questionsShown: targetedConfirmations.length,
    inferredSafely: item.requiredFacts.filter((fact) => explicit.has(fact)),
    targetedConfirmations,
  };
}

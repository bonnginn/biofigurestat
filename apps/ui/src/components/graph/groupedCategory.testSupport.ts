import { buildStructureContract } from "@lsaa/adaptive-input";
import { CanonicalAdaptiveObservationSchema } from "@lsaa/domain";
import { createAdaptiveWorkspace } from "../../app/adaptiveWorkspace";

/** Disposable synthetic data; never copied from a research project. */
export function groupedCategoryFixture() {
  const levels = ["WT", "Parent", "Tagged / #2", "Tagged / #3", "Tagged / #10", "Tagged / #11"];
  const answers = {
    experimentName: "Grouped category fixture",
    experimentDescription: "Independent dishes",
    experimentalUnitLabel: "dish",
    identityLabel: "Dish ID",
    readoutLabel: "Signal",
    readoutRepresentation: "scalar" as const,
    factorName: "Cell line",
    factorLevels: levels,
    sameIdentityAcrossConditions: false,
  };
  const contract = buildStructureContract(answers);
  const observations = levels.flatMap((cellline, g) =>
    [0, 1, 2].map((i) =>
      CanonicalAdaptiveObservationSchema.parse({
        observationId: `synthetic.${g}.${i}`,
        readoutKey: "signal",
        identities: { dishid: `dish.${g}.${i}` },
        factors: { cellline },
        axes: {},
        hierarchy: {},
        values: { signal: 10 + g + i },
        missingness: {},
        sourceRow: i + 1,
      }),
    ),
  );
  const workspace = createAdaptiveWorkspace({
    contract,
    observations,
    mapping: null,
    lineage: null,
    now: "2026-09-09T00:00:00.000Z",
  });
  if (!workspace.draft?.adaptiveInput) throw new Error("Expected adaptive fixture");
  return {
    ...workspace,
    draft: {
      ...workspace.draft,
      adaptiveInput: {
        ...workspace.draft.adaptiveInput,
        biologicalSetup: {
          schemaVersion: "0.1.0" as const,
          answers,
          conditionBlocks: [
            {
              id: "condition-block.1",
              name: "Cell line",
              showGroups: true,
              groupLabels: ["", "Tagged"],
              values: [
                ["WT", "Parent"],
                ["#2", "#3", "#10", "#11"],
              ],
            },
          ],
          conditionCombinations: levels.map((displayLabel, i) => ({
            id: `condition-block.1:${i < 2 ? 0 : 1}:${i < 2 ? i : i - 2}`,
            labels: [i < 2 ? displayLabel : ["#2", "#3", "#10", "#11"][i - 2]],
            displayLabel,
            status: "performed" as const,
          })),
        },
      },
    },
  };
}

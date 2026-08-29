import { describe, expect, it } from "vitest";
import { buildStructureContract, importForSelectedSurface } from "@lsaa/adaptive-input";

import { createAdaptiveWorkspace } from "./adaptiveWorkspace";
import { createExperimentSetDraft } from "./experimentDraft";
import {
  draftUnitIdentityCorrection,
  nestedIndependentSourceContext,
  nestedIndependentSourceCorrection,
  pairedDifferenceCorrection,
} from "./draftAnalysisDiagnostics";

describe("draft analysis semantic diagnostics", () => {
  it("locates duplicate adaptive row identities without changing either row", () => {
    const base = createExperimentSetDraft("cell_culture", "nested_continuous");
    const draft = {
      ...base,
      experiments: base.experiments.slice(0, 2).map((experiment, index) => ({
        ...experiment,
        id: `adaptive-session.${index + 1}`,
        label: `入力行 ${index + 1}`,
        stableUnitId: "unit.1",
      })),
    };

    expect(
      draftUnitIdentityCorrection({
        draft,
        contributingExperimentIds: new Set(draft.experiments.map(({ id }) => id)),
      }),
    ).toMatchObject({
      code: "DUPLICATE_EXPERIMENTAL_UNIT_ID",
      target: "data_identity",
      experimentIds: ["adaptive-session.1", "adaptive-session.2"],
      focusExperimentId: "adaptive-session.2",
    });
    expect(draft.experiments.map(({ stableUnitId }) => stableUnitId)).toEqual(["unit.1", "unit.1"]);
  });

  it("explains a zero-variance matched difference instead of changing the data", () => {
    const base = createExperimentSetDraft("microscopy_imaging", "nested_continuous");
    const draft = {
      ...base,
      conditions: [
        { id: "condition.dark", label: "Dark", attributes: {} },
        { id: "condition.lit", label: "Lit", attributes: {} },
      ],
    };
    const observations = [1, 2, 3].flatMap((value, index) => [
      {
        conditionId: "condition.dark",
        value,
        pairId: `pair.${index + 1}`,
        sourceExperimentId: `experiment.${index + 1}`,
      },
      {
        conditionId: "condition.lit",
        value: value + 5,
        pairId: `pair.${index + 1}`,
        sourceExperimentId: `experiment.${index + 1}`,
      },
    ]);

    expect(
      pairedDifferenceCorrection({
        draft,
        conditionIds: ["condition.dark", "condition.lit"],
        observations,
      }),
    ).toMatchObject({
      code: "PAIRED_DIFFERENCES_HAVE_ZERO_VARIANCE",
      target: "data_values",
      experimentIds: ["experiment.1", "experiment.2", "experiment.3"],
    });
    expect(observations.map(({ value }) => value)).toEqual([1, 6, 2, 7, 3, 8]);
  });

  it("requires a targeted source confirmation only for independent nested observations", () => {
    const contract = buildStructureContract({
      experimentName: "Nested dish comparison",
      experimentDescription:
        "The experimental unit and nested observation relationship are explicitly declared.",
      experimentalUnitLabel: "culture dish",
      identityLabel: "Dish ID",
      readoutLabel: "Circularity",
      readoutRepresentation: "scalar",
      factorName: "Treatment",
      factorLevels: ["Vehicle", "Drug"],
      sameIdentityAcrossConditions: false,
      nestedObservationLabel: "Cell",
    });
    const imported = importForSelectedSurface(
      contract,
      [
        "Dish ID\tCell ID\tTreatment\tCircularity",
        "V1\tV1-C1\tVehicle\t0.8",
        "D1\tD1-C1\tDrug\t0.6",
      ].join("\n"),
      "clipboard",
      "nested-source-test",
      "2026-08-28T00:00:00.000Z",
    );
    const workspace = createAdaptiveWorkspace({
      contract,
      observations: imported.observations,
      mapping: imported.mapping,
      lineage: imported.lineage,
      now: "2026-08-28T00:00:00.000Z",
    });
    const draft = workspace.draft!;
    const context = nestedIndependentSourceContext({ draft, readoutId: draft.readouts[0]!.id });

    expect(context).toEqual({ unitLabel: "culture dish", nestedObservationLabel: "Cell" });
    expect(nestedIndependentSourceCorrection(context!)).toMatchObject({
      target: "experiment_structure",
      actionLabel: "共通材料・実験回を確認",
    });
  });
});

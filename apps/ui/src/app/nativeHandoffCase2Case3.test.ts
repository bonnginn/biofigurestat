import { describe, expect, it } from "vitest";
import { buildStructureContract, importForSelectedSurface } from "@lsaa/adaptive-input";

import { createAdaptiveWorkspace } from "./adaptiveWorkspace";
import { assessDraftGraphAnalysis } from "./experimentDraftAnalysis";

const now = "2026-08-28T00:00:00.000Z";
const description =
  "The treatment assignment, stable identity, experimental unit, and measured object are explicit.";

describe("native handoff Cases 2 and 3 analysis requests", () => {
  it("Case 2 retains six Dark/Lit cell pairs in an executable D02 request", () => {
    const contract = buildStructureContract({
      experimentName: "Matched Dark Lit cells",
      experimentDescription: description,
      experimentalUnitLabel: "Cell",
      identityLabel: "Cell ID",
      readoutLabel: "Reporter intensity",
      readoutRepresentation: "scalar",
      factorName: "Light state",
      factorLevels: ["Dark", "Lit"],
      sameIdentityAcrossConditions: true,
    });
    const text = [
      "Cell ID\tDark\tLit",
      "Cell-1\t0.31\t0.66",
      "Cell-2\t0.37\t0.71",
      "Cell-3\t0.34\t0.62",
      "Cell-4\t0.41\t0.78",
      "Cell-5\t0.35\t0.69",
      "Cell-6\t0.39\t0.74",
    ].join("\n");
    const imported = importForSelectedSurface(contract, text, "clipboard", "case2", now);
    const workspace = createAdaptiveWorkspace({
      contract,
      observations: imported.observations,
      mapping: imported.mapping,
      lineage: imported.lineage,
      now,
    });
    expect(workspace.status).toBe("ready");
    const draft = workspace.draft!;
    const assessment = assessDraftGraphAnalysis({
      draft,
      cells: workspace.cells,
      readoutId: draft.readouts[0]!.id,
      conditionIds: draft.conditions.map(({ id }) => id),
    });

    expect(assessment).toMatchObject({
      state: "ready",
      request: { templateId: "D02", method: "paired_t" },
      nByCondition: [{ n: 6 }, { n: 6 }],
    });
    expect(assessment.correction).toBeUndefined();
    expect(assessment.request?.observations).toHaveLength(12);
    expect(new Set(assessment.request?.observations.map(({ pairId }) => pairId)).size).toBe(6);
    expect(assessment.request?.observations.map(({ value }) => value)).toEqual([
      0.31, 0.37, 0.34, 0.41, 0.35, 0.39, 0.66, 0.71, 0.62, 0.78, 0.69, 0.74,
    ]);
  });

  it("Case 2 reports a constant paired difference and requires an explicit valid alternative", () => {
    const contract = buildStructureContract({
      experimentName: "Matched Dark Lit cells with constant difference",
      experimentDescription: description,
      experimentalUnitLabel: "Cell",
      identityLabel: "Cell ID",
      readoutLabel: "Reporter intensity",
      readoutRepresentation: "scalar",
      factorName: "Light state",
      factorLevels: ["Dark", "Lit"],
      sameIdentityAcrossConditions: true,
    });
    const text = [
      "Cell ID\tDark\tLit",
      ...Array.from({ length: 6 }, (_, index) => `Cell-${index + 1}\t${20 + index}\t${25 + index}`),
    ].join("\n");
    const imported = importForSelectedSurface(contract, text, "clipboard", "case2-constant", now);
    const workspace = createAdaptiveWorkspace({
      contract,
      observations: imported.observations,
      mapping: imported.mapping,
      lineage: imported.lineage,
      now,
    });
    const draft = workspace.draft!;
    const input = {
      draft,
      cells: workspace.cells,
      readoutId: draft.readouts[0]!.id,
      conditionIds: draft.conditions.map(({ id }) => id),
    };

    const paired = assessDraftGraphAnalysis(input);
    expect(paired).toMatchObject({
      state: "unsupported",
      request: null,
      correction: {
        code: "PAIRED_DIFFERENCES_HAVE_ZERO_VARIANCE",
        target: "data_values",
        suggestedMethod: "wilcoxon_signed_rank",
      },
    });
    expect(paired.reason).toContain("全6組");
    expect(paired.reason).toContain("標準誤差が0");

    const explicitAlternative = assessDraftGraphAnalysis({
      ...input,
      selectedMethod: "wilcoxon_signed_rank",
    });
    expect(explicitAlternative).toMatchObject({
      state: "ready",
      method: "wilcoxon_signed_rank",
      request: { templateId: "D02", method: "wilcoxon_signed_rank" },
    });
  });

  it("Case 3 sends eight dish means to D01 and never the forty nested Cells", () => {
    const contract = buildStructureContract({
      experimentName: "Cells nested in dishes",
      experimentDescription: description,
      experimentalUnitLabel: "culture dish",
      identityLabel: "Dish ID",
      readoutLabel: "Mitochondrial circularity",
      readoutRepresentation: "scalar",
      factorName: "Treatment",
      factorLevels: ["Vehicle", "Drug"],
      sameIdentityAcrossConditions: false,
      nestedObservationLabel: "Cell",
    });
    const rows = [
      ["V1", "Vehicle", [0.78, 0.82, 0.8, 0.75, 0.84]],
      ["V2", "Vehicle", [0.81, 0.79, 0.85, 0.77, 0.83]],
      ["V3", "Vehicle", [0.76, 0.8, 0.78, 0.82, 0.79]],
      ["V4", "Vehicle", [0.83, 0.86, 0.81, 0.84, 0.8]],
      ["D1", "Drug", [0.55, 0.61, 0.58, 0.63, 0.57]],
      ["D2", "Drug", [0.6, 0.56, 0.62, 0.59, 0.64]],
      ["D3", "Drug", [0.54, 0.57, 0.59, 0.55, 0.6]],
      ["D4", "Drug", [0.61, 0.65, 0.63, 0.58, 0.62]],
    ] as const;
    const text = [
      "Dish ID\tCell ID\tTreatment\tMitochondrial circularity",
      ...rows.flatMap(([dish, condition, values]) =>
        values.map((value, index) => `${dish}\t${dish}-Cell-${index + 1}\t${condition}\t${value}`),
      ),
    ].join("\n");
    const imported = importForSelectedSurface(contract, text, "clipboard", "case3", now);
    const workspace = createAdaptiveWorkspace({
      contract,
      observations: imported.observations,
      mapping: imported.mapping,
      lineage: imported.lineage,
      now,
    });
    expect(workspace.status).toBe("ready");
    const draft = workspace.draft!;
    const assessment = assessDraftGraphAnalysis({
      draft,
      cells: workspace.cells,
      readoutId: draft.readouts[0]!.id,
      conditionIds: draft.conditions.map(({ id }) => id),
    });

    expect(imported.observations).toHaveLength(40);
    expect(assessment).toMatchObject({
      state: "ready",
      request: { templateId: "D01", method: "welch_t" },
      nByCondition: [{ n: 4 }, { n: 4 }],
    });
    expect(assessment.correction).toBeUndefined();
    expect(assessment.request?.observations).toHaveLength(8);
    expect(
      new Set(assessment.request?.observations.map(({ experimentalUnitId }) => experimentalUnitId))
        .size,
    ).toBe(8);
    const dishMeans = assessment.request?.observations.map(({ value }) => value) ?? [];
    const expectedDishMeans = [0.798, 0.81, 0.79, 0.828, 0.588, 0.602, 0.57, 0.618];
    dishMeans.forEach((value, index) => expect(value).toBeCloseTo(expectedDishMeans[index]!, 12));
  });
});

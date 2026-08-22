import { describe, expect, it } from "vitest";

import {
  activeConditions,
  conditionAttributeLevels,
  conditionDisplayLabel,
  continuousSummary,
  createExperimentSetDraft,
  expectedAnalysisLabel,
  experimentCellKey,
  normalizeWithinExperiment,
  parseNumericPaste,
  percentage,
  reuseExperimentDesign,
  wbCorrectedBandValue,
  wbRatio,
} from "./experimentDraft";

describe("experiment-first UX draft", () => {
  it("starts from a research context and keeps experiments explicit", () => {
    const draft = createExperimentSetDraft("cell_culture", "proportion");
    expect(draft.experiments.map(({ label }) => label)).toEqual(["Exp 1", "Exp 2", "Exp 3"]);
    expect(draft.readouts[0].shape).toBe("proportion");
    expect(draft.conditions).toHaveLength(10);
    expect(activeConditions(draft)).toHaveLength(0);
    expect(expectedAnalysisLabel(draft)).toBe("独立した2条件の比較");
  });

  it("keeps repeated descriptor values as shared levels without merging rows", () => {
    const base = createExperimentSetDraft("cell_culture", "proportion");
    const attributes = [
      { id: "attribute.gene", label: "Gene" },
      { id: "attribute.sequence", label: "Sequence" },
    ];
    const conditions = [
      {
        id: "condition.1",
        label: "NDEL1 / #1",
        attributes: { "attribute.gene": "NDEL1", "attribute.sequence": "#1" },
      },
      {
        id: "condition.2",
        label: "NDEL1 / #2",
        attributes: { "attribute.gene": "NDEL1", "attribute.sequence": "#2" },
      },
    ];
    const draft = { ...base, attributes, conditions };

    expect(activeConditions(draft)).toHaveLength(2);
    expect(conditionDisplayLabel(conditions[0], attributes)).toBe("NDEL1 / #1");
    expect(conditionAttributeLevels(draft)["attribute.gene"].NDEL1).toEqual([
      "condition.1",
      "condition.2",
    ]);
  });

  it("describes time-course expectations without choosing a named test", () => {
    const base = createExperimentSetDraft("cell_culture", "nested_continuous");
    const crossSectional = {
      ...base,
      time: { ...base.time, sampling: "cross_sectional" as const },
    };
    expect(expectedAnalysisLabel(crossSectional)).toBe(
      "時間点ごとに別サンプルとして扱う条件と時間の比較候補",
    );

    expect(
      expectedAnalysisLabel({
        ...base,
        time: { ...base.time, sampling: "longitudinal" },
      }),
    ).toBe("同じ単位を時間点間で追った解析候補");
  });

  it("uses stable cell coordinates without implying statistical pairing", () => {
    expect(
      experimentCellKey({
        experimentId: "experiment.1",
        conditionId: "condition.2",
        readoutId: "readout.1",
      }),
    ).toBe("experiment.1::condition.2::time.none::readout.1");
  });

  it("derives proportions without overwriting source counts", () => {
    expect(percentage({ kind: "proportion", positive: 40, eligible: 100 })).toBe(40);
    expect(percentage({ kind: "proportion", positive: 101, eligible: 100 })).toBeNull();
  });

  it("applies only explicitly selected within-experiment normalization", () => {
    const readout = {
      id: "readout.wb",
      label: "NDEL1",
      shape: "wb_ratio" as const,
      withinExperimentNormalization: {
        method: "control_equals_one" as const,
        baselineConditionId: "control",
      },
    };
    const values = { control: 2, treatment: 5 };
    expect(normalizeWithinExperiment(5, values, "treatment", readout)).toBe(2.5);
    expect(
      normalizeWithinExperiment(5, values, "treatment", {
        ...readout,
        withinExperimentNormalization: undefined,
      }),
    ).toBe(5);
  });

  it("WBのImageJ入力から補正値と比を決定的に計算する", () => {
    const cell = {
      kind: "wb_ratio" as const,
      target: null,
      reference: null,
      inputMode: "imagej_mean_background_area" as const,
      targetSource: { intensity: 20, background: 5, area: 60 },
      referenceSource: { intensity: 14, background: 4, area: 60 },
    };
    expect(wbCorrectedBandValue(cell, "target")).toBe(900);
    expect(wbCorrectedBandValue(cell, "reference")).toBe(600);
    expect(wbRatio(cell)).toBe(1.5);
    expect(
      wbRatio({ ...cell, referenceSource: { intensity: 4, background: 4, area: 60 } }),
    ).toBeNull();
  });

  it("summarizes nested raw values and accepts practical pasted numbers", () => {
    const values = parseNumericPaste("10\t12\n14, 16;18");
    expect(values).toEqual([10, 12, 14, 16, 18]);
    expect(continuousSummary(values)).toEqual({ n: 5, mean: 14, median: 14, sd: Math.sqrt(10) });
  });

  it("設計再利用は構造だけをコピーし、実験回メタデータを新規化する", () => {
    const base = createExperimentSetDraft("protein_biochemical", "wb_ratio");
    const original = {
      ...base,
      name: "NDEL1 WB",
      experiments: base.experiments.map((experiment) => ({
        ...experiment,
        date: "2025-01-02",
        note: "original raw source",
      })),
    };
    const reused = reuseExperimentDesign(original);

    expect(reused.name).toBe("NDEL1 WB（設計再利用）");
    expect(reused.readouts).toEqual(original.readouts);
    expect(reused.conditions).toEqual(original.conditions);
    expect(reused.experiments.every(({ note }) => note === "")).toBe(true);
    expect(reused.experiments.some(({ date }) => date === "2025-01-02")).toBe(false);
  });
});

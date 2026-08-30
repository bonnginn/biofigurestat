import { describe, expect, it } from "vitest";

import {
  createExperimentSetDraft,
  experimentCellKey,
  type ExperimentCellMap,
} from "./experimentDraft";
import { assessDraftGraphAnalysis } from "./experimentDraftAnalysis";
import { createLongitudinalFixture, createXyCorrelationFixture } from "./syntheticFixtures";

function fixture(conditionLabels: readonly string[]) {
  const base = createExperimentSetDraft("cell_culture", "proportion");
  const conditions = conditionLabels.map((label, index) => ({
    ...base.conditions[index],
    label,
    attributes: { "attribute.1": label },
  }));
  const draft = { ...base, conditions };
  const cells: Record<string, ExperimentCellMap[string]> = {};
  draft.experiments.forEach((experiment, experimentIndex) => {
    conditions.forEach((condition, conditionIndex) => {
      cells[
        experimentCellKey({
          experimentId: experiment.id,
          conditionId: condition.id,
          readoutId: draft.readouts[0].id,
        })
      ] = {
        kind: "proportion",
        // Keep paired differences non-degenerate so a request advertised as
        // executable is also accepted by the authoritative engine.
        positive: 20 + experimentIndex * 4 + conditionIndex * (8 + experimentIndex),
        eligible: 100,
      };
    });
  });
  return { draft, cells };
}

describe("temporary experiment-first analysis adapter", () => {
  it("supports one cohort without inventing a second group", () => {
    const base = createExperimentSetDraft("general_assay", "nested_continuous");
    const condition = {
      ...base.conditions[0]!,
      label: "Patient cohort",
      attributes: { "attribute.1": "Patient cohort" },
    };
    const cells: ExperimentCellMap = Object.fromEntries(
      base.experiments.map((experiment, index) => [
        experimentCellKey({
          experimentId: experiment.id,
          conditionId: condition.id,
          readoutId: base.readouts[0]!.id,
        }),
        { kind: "nested_continuous" as const, rawValues: [4 + index], source: "manual" as const },
      ]),
    );
    const descriptive = assessDraftGraphAnalysis({
      draft: {
        ...base,
        conditions: [condition],
        analysisIntent: { kind: "single_cohort", mode: "descriptive" },
      },
      cells,
      readoutId: base.readouts[0]!.id,
      conditionIds: [condition.id],
    });
    expect(descriptive).toMatchObject({
      state: "descriptive",
      request: null,
      nByCondition: [{ n: 3 }],
    });

    const inferential = assessDraftGraphAnalysis({
      draft: {
        ...base,
        conditions: [condition],
        analysisIntent: { kind: "single_cohort", mode: "one_sample", referenceValue: 3.5 },
      },
      cells,
      readoutId: base.readouts[0]!.id,
      conditionIds: [condition.id],
    });
    expect(inferential.request).toMatchObject({
      protocolVersion: "0.9.0",
      templateId: "D12",
      conditionId: condition.id,
      nullValue: 3.5,
    });
    expect("contrastConditionIds" in inferential.request!).toBe(false);
  });

  it("routes three same-unit conditions to the existing repeated-measures backend", () => {
    const { draft: independent, cells } = fixture(["Baseline", "6 h", "24 h"]);
    const draft = {
      ...independent,
      conditionAssignment: { kind: "matched" as const, unitLabel: "Cell" },
    };
    const assessment = assessDraftGraphAnalysis({
      draft,
      cells,
      readoutId: draft.readouts[0].id,
      conditionIds: draft.conditions.map(({ id }) => id),
    });
    expect(assessment.request).toMatchObject({
      protocolVersion: "0.3.0",
      templateId: "D04",
      method: "repeated_measures_anova",
      options: { multiplicityMethod: "holm_paired_all_pairs" },
    });
    expect(new Set(assessment.request?.observations.map(({ pairId }) => pairId)).size).toBe(3);
  });

  it("reports every missing condition for an incomplete repeated-measures stable unit", () => {
    const { draft: independent, cells: completeCells } = fixture(["Baseline", "6 h", "24 h"]);
    const draft = {
      ...independent,
      conditionAssignment: { kind: "matched" as const, unitLabel: "Cell" },
    };
    const cells = { ...completeCells };
    [draft.conditions[1], draft.conditions[2]].forEach((condition) => {
      delete cells[
        experimentCellKey({
          experimentId: draft.experiments[0].id,
          conditionId: condition.id,
          readoutId: draft.readouts[0].id,
        })
      ];
    });
    const cellsBeforeAssessment = structuredClone(cells);

    const assessment = assessDraftGraphAnalysis({
      draft,
      cells,
      readoutId: draft.readouts[0].id,
      conditionIds: draft.conditions.map(({ id }) => id),
    });

    expect(assessment).toMatchObject({ state: "ready", method: "repeated_measures_anova" });
    expect(assessment.inputDiagnostics).toEqual([
      expect.objectContaining({
        code: "INCOMPLETE_MATCHED_SET",
        incompleteMatchedSets: [
          expect.objectContaining({
            pairId: draft.experiments[0].stableUnitId,
            experimentId: draft.experiments[0].id,
            missingConditions: [
              { conditionId: draft.conditions[1].id, label: "6 h" },
              { conditionId: draft.conditions[2].id, label: "24 h" },
            ],
          }),
        ],
      }),
    ]);
    expect(new Set(assessment.request?.observations.map(({ pairId }) => pairId))).toEqual(
      new Set(draft.experiments.slice(1).map(({ stableUnitId }) => stableUnitId)),
    );
    expect(cells).toEqual(cellsBeforeAssessment);
  });

  it("uses explicit within-Exp WB control=1 values without overwriting bands", () => {
    const base = createExperimentSetDraft("protein_biochemical", "wb_ratio");
    const conditions = base.conditions.slice(0, 2).map((condition, index) => ({
      ...condition,
      label: index === 0 ? "Control" : "Treatment",
      attributes: { "attribute.1": index === 0 ? "Control" : "Treatment" },
    }));
    const readout = {
      ...base.readouts[0],
      withinExperimentNormalization: {
        method: "control_equals_one" as const,
        baselineConditionId: conditions[0].id,
      },
    };
    const draft = { ...base, conditions, readouts: [readout] };
    const cells: Record<string, ExperimentCellMap[string]> = {};
    draft.experiments.forEach((experiment, index) => {
      conditions.forEach((condition, conditionIndex) => {
        cells[
          experimentCellKey({
            experimentId: experiment.id,
            conditionId: condition.id,
            readoutId: readout.id,
          })
        ] = {
          kind: "wb_ratio",
          target: conditionIndex === 0 ? 20 + index : 40 + index * 2,
          reference: 10,
        };
      });
    });
    const assessment = assessDraftGraphAnalysis({
      draft,
      cells,
      readoutId: readout.id,
      conditionIds: conditions.map(({ id }) => id),
    });
    expect(assessment.request?.observations.map(({ value }) => value)).toEqual([1, 1, 1, 2, 2, 2]);
    expect(cells[Object.keys(cells)[0]]).toMatchObject({ target: 20, reference: 10 });
  });

  it("builds a validated independent two-condition request from Exp-level values", () => {
    const { draft, cells } = fixture(["Control", "Treatment"]);
    const assessment = assessDraftGraphAnalysis({
      draft,
      cells,
      readoutId: draft.readouts[0].id,
      conditionIds: draft.conditions.map(({ id }) => id),
    });

    expect(assessment.state).toBe("ready");
    expect(assessment.request).toMatchObject({ templateId: "D01", method: "welch_t" });
    expect(assessment.request?.observations).toHaveLength(6);
    expect(
      new Set(assessment.request?.observations.map(({ experimentalUnitId }) => experimentalUnitId))
        .size,
    ).toBe(6);
  });

  it("offers and executes Tier A alternatives without changing the declared independent design", () => {
    const { draft, cells } = fixture(["Control", "Treatment"]);
    const mann = assessDraftGraphAnalysis({
      draft,
      cells,
      readoutId: draft.readouts[0].id,
      conditionIds: draft.conditions.map(({ id }) => id),
      selectedMethod: "mann_whitney",
    });
    expect(mann).toMatchObject({
      recommendedMethod: "welch_t",
      method: "mann_whitney",
      request: { templateId: "D01", method: "mann_whitney" },
    });
    expect(mann.methodChoices?.map(({ method, enabled }) => ({ method, enabled }))).toEqual([
      { method: "welch_t", enabled: true },
      { method: "mann_whitney", enabled: true },
      { method: "student_t", enabled: true },
    ]);
  });

  it("WBは標的とreferenceの比だけを解析入力にし、生値を保持する", () => {
    const base = createExperimentSetDraft("protein_biochemical", "wb_ratio");
    const draft = {
      ...base,
      conditions: base.conditions.slice(0, 2).map((condition, index) => ({
        ...condition,
        label: index === 0 ? "Control" : "Treatment",
        attributes: { "attribute.1": index === 0 ? "Control" : "Treatment" },
      })),
    };
    const cells: Record<string, ExperimentCellMap[string]> = {};
    draft.experiments.forEach((experiment, experimentIndex) => {
      draft.conditions.forEach((condition, conditionIndex) => {
        cells[
          experimentCellKey({
            experimentId: experiment.id,
            conditionId: condition.id,
            readoutId: draft.readouts[0].id,
          })
        ] = {
          kind: "wb_ratio",
          target: (conditionIndex + 1) * (experimentIndex + 2) * 10,
          reference: (experimentIndex + 2) * 10,
        };
      });
    });
    const assessment = assessDraftGraphAnalysis({
      draft,
      cells,
      readoutId: draft.readouts[0].id,
      conditionIds: draft.conditions.map(({ id }) => id),
    });

    expect(assessment.request).toMatchObject({ templateId: "D01", method: "welch_t" });
    expect(assessment.request?.observations.map(({ value }) => value)).toEqual([1, 1, 1, 2, 2, 2]);
    expect(cells[Object.keys(cells)[0]]).toMatchObject({ target: 20, reference: 20 });
  });

  it("uses only explicitly matched complete units for a paired comparison", () => {
    const { draft: baseDraft, cells } = fixture(["Before", "After"]);
    const draft = {
      ...baseDraft,
      conditionAssignment: { kind: "matched" as const, unitLabel: "動物" },
    };
    delete cells[
      experimentCellKey({
        experimentId: draft.experiments[2].id,
        conditionId: draft.conditions[1].id,
        readoutId: draft.readouts[0].id,
      })
    ];
    const assessment = assessDraftGraphAnalysis({
      draft,
      cells,
      readoutId: draft.readouts[0].id,
      conditionIds: draft.conditions.map(({ id }) => id),
    });
    expect(assessment.request).toMatchObject({ templateId: "D02", method: "paired_t" });
    expect(assessment.request?.observations).toHaveLength(4);
    expect(new Set(assessment.request?.observations.map(({ pairId }) => pairId)).size).toBe(2);
    expect(assessment.reason).toContain("完全な組 2");
    expect(assessment.analysisSetSummary).toBe(
      "完全な対応組 2組を統計解析に使います。対応相手がそろわない観測 1件は解析から除外します。",
    );
    expect(assessment.graphAnalysisSetDifference).toContain("Graphには入力済みの観測を残します");
  });

  it("pairs shared-source siblings without reusing the source as their experimental-unit ID", () => {
    const { draft: baseDraft, cells } = fixture(["Vehicle", "Drug"]);
    const draft = {
      ...baseDraft,
      conditionAssignment: {
        kind: "matched" as const,
        unitLabel: "dish",
        matchedTopology: {
          kind: "distinct_condition_units_shared_source" as const,
          sourceUnitLabel: "Donor",
          sourceIdentityLabel: "Donor ID",
          sourceRole: "block" as const,
        },
      },
    };

    const assessment = assessDraftGraphAnalysis({
      draft,
      cells,
      readoutId: draft.readouts[0].id,
      conditionIds: draft.conditions.map(({ id }) => id),
    });

    expect(assessment.request).toMatchObject({ templateId: "D02", method: "paired_t" });
    expect(new Set(assessment.request?.observations.map(({ pairId }) => pairId)).size).toBe(3);
    expect(
      new Set(assessment.request?.observations.map(({ experimentalUnitId }) => experimentalUnitId))
        .size,
    ).toBe(6);
    expect(assessment.reason).toContain("同じDonorに由来する条件別dish");
    expect(assessment.methodChoices?.[0]?.explanation).toContain("条件別試料の差");
  });

  it("executes Wilcoxon only on explicit complete stable pairs", () => {
    const { draft: baseDraft, cells } = fixture(["Before", "After"]);
    const draft = {
      ...baseDraft,
      conditionAssignment: { kind: "matched" as const, unitLabel: "動物" },
    };
    const assessment = assessDraftGraphAnalysis({
      draft,
      cells,
      readoutId: draft.readouts[0].id,
      conditionIds: draft.conditions.map(({ id }) => id),
      selectedMethod: "wilcoxon_signed_rank",
    });
    expect(assessment).toMatchObject({
      recommendedMethod: "paired_t",
      method: "wilcoxon_signed_rank",
      request: { templateId: "D02", method: "wilcoxon_signed_rank" },
    });
    expect(new Set(assessment.request?.observations.map(({ pairId }) => pairId)).size).toBe(3);
  });

  it("uses Welch ANOVA with Games–Howell for three or more independent conditions", () => {
    const { draft, cells } = fixture(["Control", "siRNA #1", "siRNA #2"]);
    const assessment = assessDraftGraphAnalysis({
      draft,
      cells,
      readoutId: draft.readouts[0].id,
      conditionIds: draft.conditions.map(({ id }) => id),
    });

    expect(assessment.request).toMatchObject({
      templateId: "D03",
      method: "welch_anova",
      options: { multiplicityMethod: "games_howell_all_pairs" },
    });
  });

  it("uses an explicit stable control ID for a selected Dunnett control-vs-many workflow", () => {
    const { draft: baseDraft, cells } = fixture(["Control", "siRNA #1", "siRNA #2"]);
    const draft = { ...baseDraft, controlConditionId: baseDraft.conditions[0].id };
    const assessment = assessDraftGraphAnalysis({
      draft,
      cells,
      readoutId: draft.readouts[0].id,
      conditionIds: draft.conditions.map(({ id }) => id),
      selectedMethod: "one_way_anova",
      contrastIntent: "control_vs_many",
    });
    expect(assessment).toMatchObject({
      recommendedMethod: "one_way_anova",
      method: "one_way_anova",
      contrastIntent: "control_vs_many",
      request: {
        method: "one_way_anova",
        controlConditionId: draft.conditions[0].id,
        contrastIntent: "control_vs_many",
        options: { multiplicityMethod: "dunnett_control_vs_many" },
      },
    });
  });

  it("shapes Kruskal–Wallis with Dunn-Holm all-pairs comparisons", () => {
    const { draft, cells } = fixture(["Control", "siRNA #1", "siRNA #2"]);
    const assessment = assessDraftGraphAnalysis({
      draft,
      cells,
      readoutId: draft.readouts[0].id,
      conditionIds: draft.conditions.map(({ id }) => id),
      selectedMethod: "kruskal_wallis",
      contrastIntent: "all_pairs",
    });
    expect(assessment.request).toMatchObject({
      method: "kruskal_wallis",
      contrastIntent: "all_pairs",
      options: { multiplicityMethod: "dunn_holm_all_pairs" },
    });
  });

  it("shapes only explicitly selected planned pairs with Holm correction", () => {
    const { draft, cells } = fixture(["Control", "siRNA #1", "siRNA #2"]);
    const plannedPairs = [
      [draft.conditions[0].id, draft.conditions[1].id],
      [draft.conditions[0].id, draft.conditions[2].id],
    ] as const;
    const assessment = assessDraftGraphAnalysis({
      draft,
      cells,
      readoutId: draft.readouts[0].id,
      conditionIds: draft.conditions.map(({ id }) => id),
      selectedMethod: "one_way_anova",
      contrastIntent: "planned_comparisons",
      plannedContrastConditionIds: plannedPairs,
    });
    expect(assessment).toMatchObject({
      recommendedMethod: "one_way_anova",
      method: "one_way_anova",
      contrastIntent: "planned_comparisons",
      request: {
        method: "one_way_anova",
        contrastIntent: "planned_comparisons",
        plannedContrastConditionIds: plannedPairs,
        options: { multiplicityMethod: "holm_planned_comparisons" },
      },
    });
  });

  it("does not run when one condition has fewer than two Exp-level values", () => {
    const { draft, cells } = fixture(["Control", "Treatment"]);
    delete cells[
      experimentCellKey({
        experimentId: draft.experiments[1].id,
        conditionId: draft.conditions[1].id,
        readoutId: draft.readouts[0].id,
      })
    ];
    delete cells[
      experimentCellKey({
        experimentId: draft.experiments[2].id,
        conditionId: draft.conditions[1].id,
        readoutId: draft.readouts[0].id,
      })
    ];

    const assessment = assessDraftGraphAnalysis({
      draft,
      cells,
      readoutId: draft.readouts[0].id,
      conditionIds: draft.conditions.map(({ id }) => id),
    });
    expect(assessment.state).toBe("insufficient");
    expect(assessment.request).toBeNull();
    expect(assessment.missingCount).toBe(2);
  });

  it("縦断時系列は各実験単位のAUCを群比較に使える", () => {
    const fixture = createLongitudinalFixture();
    const assessment = assessDraftGraphAnalysis({
      draft: fixture.draft,
      cells: fixture.cells,
      readoutId: fixture.draft.readouts[0].id,
      conditionIds: fixture.draft.conditions.map(({ id }) => id),
      timeAnalysis: { kind: "auc" },
    });

    expect(assessment).toMatchObject({ state: "ready", method: "paired_t" });
    expect(assessment.request?.observations).toHaveLength(8);
    expect(assessment.request?.observations[0]?.value).toBe(762);
  });

  it("縦断endpointはstable unitごとに1値×2条件の有限な4 pairを作る", () => {
    const fixture = createLongitudinalFixture();
    const assessment = assessDraftGraphAnalysis({
      draft: fixture.draft,
      cells: fixture.cells,
      readoutId: fixture.draft.readouts[0].id,
      conditionIds: fixture.draft.conditions.map(({ id }) => id),
      timeAnalysis: { kind: "endpoint" },
    });

    expect(assessment).toMatchObject({ state: "ready", method: "paired_t" });
    expect(assessment.request?.observations).toHaveLength(8);
    const observations = assessment.request?.observations ?? [];
    const byPair = new Map<string, Map<string, number>>();
    observations.forEach(({ pairId, conditionId, value }) => {
      const pair = byPair.get(pairId ?? "") ?? new Map<string, number>();
      expect(value).toBeTypeOf("number");
      pair.set(conditionId, value!);
      byPair.set(pairId ?? "", pair);
    });
    expect(byPair.size).toBe(4);
    expect([...byPair.values()].every((pair) => pair.size === 2)).toBe(true);
    const [controlId, stimulatedId] = fixture.draft.conditions.map(({ id }) => id);
    const differences = [...byPair.values()].map(
      (pair) => pair.get(controlId)! - pair.get(stimulatedId)!,
    );
    expect(new Set(differences).size).toBeGreaterThan(1);
    expect(differences.every(Number.isFinite)).toBe(true);
  });

  it("完全なbalanced縦断設計はidentityを保持したD06条件×時間requestを作る", () => {
    const fixture = createLongitudinalFixture();
    const draft = {
      ...fixture.draft,
      conditionAssignment: { kind: "independent" as const, unitLabel: "sample" },
    };
    const assessment = assessDraftGraphAnalysis({
      draft,
      cells: fixture.cells,
      readoutId: draft.readouts[0].id,
      conditionIds: draft.conditions.map(({ id }) => id),
      timeAnalysis: { kind: "full_time_course" },
    });

    expect(assessment).toMatchObject({ state: "ready", method: "mixed_anova" });
    expect(assessment.request).toMatchObject({
      protocolVersion: "0.6.0",
      templateId: "D06",
      method: "mixed_anova",
    });
    expect(assessment.request?.observations).toHaveLength(
      draft.experiments.length * draft.conditions.length * draft.time.points.length,
    );
    const d06 = assessment.request?.protocolVersion === "0.6.0" ? assessment.request : null;
    expect(new Set(d06?.observations.map(({ pairId }) => pairId)).size).toBe(
      draft.experiments.length * draft.conditions.length,
    );
    expect(
      d06?.observations.every(({ pairId, experimentalUnitId }) => pairId === experimentalUnitId),
    ).toBe(true);
  });

  it("D06は欠測を暗黙除外せずunsupportedにする", () => {
    const fixture = createLongitudinalFixture();
    const draft = {
      ...fixture.draft,
      conditionAssignment: { kind: "independent" as const, unitLabel: "sample" },
    };
    const cells = { ...fixture.cells };
    delete cells[
      experimentCellKey({
        experimentId: draft.experiments[0].id,
        conditionId: draft.conditions[0].id,
        readoutId: draft.readouts[0].id,
        timePointId: draft.time.points[0].id,
      })
    ];
    const assessment = assessDraftGraphAnalysis({
      draft,
      cells,
      readoutId: draft.readouts[0].id,
      conditionIds: draft.conditions.map(({ id }) => id),
      timeAnalysis: { kind: "full_time_course" },
    });
    expect(assessment).toMatchObject({ state: "unsupported", request: null, missingCount: 1 });
  });

  it("時点ごとに独立なbalanced設計はD07条件×軸requestを作る", () => {
    const fixture = createLongitudinalFixture();
    const draft = {
      ...fixture.draft,
      conditionAssignment: { kind: "independent" as const, unitLabel: "sample" },
      time: { ...fixture.draft.time, sampling: "cross_sectional" as const },
    };
    const assessment = assessDraftGraphAnalysis({
      draft,
      cells: fixture.cells,
      readoutId: draft.readouts[0].id,
      conditionIds: draft.conditions.map(({ id }) => id),
      timeAnalysis: { kind: "full_time_course" },
      withinFactor: { role: "time", title: "Time", unit: "h" },
    });

    expect(assessment).toMatchObject({
      state: "ready",
      method: "two_way_anova",
      recommendedMethod: "two_way_anova",
      nDisplay: "n=4 / 条件×Timeセル、独立した実験単位は全32個",
      statisticalNDefinition: "各条件×Timeセルで独立した実験単位 n=4、全32実験単位",
    });
    expect(assessment.request).toMatchObject({
      protocolVersion: "0.7.0",
      templateId: "D07",
      withinFactor: { role: "time", title: "Time", unit: "h" },
    });
    const d07 = assessment.request?.protocolVersion === "0.7.0" ? assessment.request : null;
    expect(d07?.observations).toHaveLength(
      draft.experiments.length * draft.conditions.length * draft.time.points.length,
    );
    expect(
      new Set(d07?.observations.map(({ experimentalUnitId }) => experimentalUnitId)).size,
    ).toBe(d07?.observations.length);
    expect(d07?.observations.every(({ pairId, blockId }) => !pairId && !blockId)).toBe(true);
  });

  it("D06/D07は研究者の空白・日本語・slug衝突IDをengine EntityIdへ漏らさない", () => {
    const fixture = createLongitudinalFixture();
    const researcherIds = ["Run Alpha", "実験回 2", "A B", "A-B"];
    const baseDraft = {
      ...fixture.draft,
      conditionAssignment: { kind: "independent" as const, unitLabel: "sample" },
      experiments: fixture.draft.experiments.map((experiment, index) => ({
        ...experiment,
        label: researcherIds[index]!,
        stableUnitId: researcherIds[index]!,
      })),
    };
    const assess = (sampling: "longitudinal" | "cross_sectional") =>
      assessDraftGraphAnalysis({
        draft: { ...baseDraft, time: { ...baseDraft.time, sampling } },
        cells: fixture.cells,
        readoutId: baseDraft.readouts[0].id,
        conditionIds: baseDraft.conditions.map(({ id }) => id),
        timeAnalysis: { kind: "full_time_course" },
        withinFactor: { role: "time", title: "Time", unit: "h" },
      });

    const longitudinal = assess("longitudinal");
    const crossSectional = assess("cross_sectional");
    expect(longitudinal).toMatchObject({ state: "ready", method: "mixed_anova" });
    expect(crossSectional).toMatchObject({ state: "ready", method: "two_way_anova" });
    for (const assessment of [longitudinal, crossSectional]) {
      const unitIds = assessment.request?.observations.map(
        ({ experimentalUnitId }) => experimentalUnitId,
      );
      expect(unitIds?.every((id) => /^[A-Za-z0-9][A-Za-z0-9._:-]*$/u.test(id))).toBe(true);
      expect(unitIds?.some((id) => researcherIds.includes(id))).toBe(false);
    }
  });

  it("縦断endpointのpair matchingはexperiment row順に依存しない", () => {
    const fixture = createLongitudinalFixture();
    const assess = (draft: typeof fixture.draft) =>
      assessDraftGraphAnalysis({
        draft,
        cells: fixture.cells,
        readoutId: draft.readouts[0].id,
        conditionIds: draft.conditions.map(({ id }) => id),
        timeAnalysis: { kind: "endpoint" },
      });
    const original = assess(fixture.draft);
    const reordered = assess({
      ...fixture.draft,
      experiments: [...fixture.draft.experiments].reverse(),
    });
    const values = (assessment: typeof original) =>
      (assessment.request?.observations ?? [])
        .map(({ pairId, conditionId, value }) => `${pairId}:${conditionId}:${value}`)
        .sort();
    expect(values(reordered)).toEqual(values(original));
  });

  it("縦断endpointが片条件で欠けたstable unitを独立群へ変換しない", () => {
    const fixture = createLongitudinalFixture();
    const missingKey = experimentCellKey({
      experimentId: fixture.draft.experiments[0].id,
      conditionId: fixture.draft.conditions[1].id,
      readoutId: fixture.draft.readouts[0].id,
      timePointId: fixture.draft.time.points.at(-1)?.id,
    });
    const cells = { ...fixture.cells };
    delete cells[missingKey];
    const assessment = assessDraftGraphAnalysis({
      draft: fixture.draft,
      cells,
      readoutId: fixture.draft.readouts[0].id,
      conditionIds: fixture.draft.conditions.map(({ id }) => id),
      timeAnalysis: { kind: "endpoint" },
    });
    expect(assessment).toMatchObject({ state: "ready", method: "paired_t" });
    expect(new Set(assessment.request?.observations.map(({ pairId }) => pairId)).size).toBe(3);
    expect(assessment.request?.observations).toHaveLength(6);
  });

  it("複数の不完全pairでstable unit IDごとの不足条件を示し、対応設計を保つ", () => {
    const fixture = createLongitudinalFixture();
    const endpointId = fixture.draft.time.points.at(-1)?.id;
    const cells = { ...fixture.cells };
    const missingEntries = [
      { experimentIndex: 0, conditionIndex: 1 },
      { experimentIndex: 1, conditionIndex: 0 },
    ] as const;
    missingEntries.forEach(({ experimentIndex, conditionIndex }) => {
      const key = experimentCellKey({
        experimentId: fixture.draft.experiments[experimentIndex].id,
        conditionId: fixture.draft.conditions[conditionIndex].id,
        readoutId: fixture.draft.readouts[0].id,
        timePointId: endpointId,
      });
      cells[key] = {
        ...(cells[key] as Extract<ExperimentCellMap[string], { kind: "nested_continuous" }>),
        rawValues: [],
      };
    });
    const cellsBeforeAssessment = structuredClone(cells);

    const assessment = assessDraftGraphAnalysis({
      draft: fixture.draft,
      cells,
      readoutId: fixture.draft.readouts[0].id,
      conditionIds: fixture.draft.conditions.map(({ id }) => id),
      timeAnalysis: { kind: "endpoint" },
    });

    expect(assessment).toMatchObject({ state: "ready", method: "paired_t", missingCount: 2 });
    expect(assessment.inputDiagnostics?.[0]).toMatchObject({
      code: "INCOMPLETE_MATCHED_SET",
      incompleteMatchedSets: [
        {
          pairId: "unit.cell.1",
          experimentId: "experiment.cell.1",
          experimentLabel: "Cell 1",
          missingConditions: [{ conditionId: "condition.longitudinal.2", label: "Stimulated" }],
        },
        {
          pairId: "unit.cell.2",
          experimentId: "experiment.cell.2",
          experimentLabel: "Cell 2",
          missingConditions: [{ conditionId: "condition.longitudinal.1", label: "Control" }],
        },
      ],
      correction: {
        code: "INCOMPLETE_MATCHED_SET",
        target: "data_values",
        experimentIds: ["experiment.cell.1", "experiment.cell.2"],
        focusExperimentId: "experiment.cell.1",
      },
    });
    expect(new Set(assessment.request?.observations.map(({ pairId }) => pairId))).toEqual(
      new Set(["unit.cell.3", "unit.cell.4"]),
    );
    expect(cells).toEqual(cellsBeforeAssessment);
    expect(fixture.draft.conditionAssignment.kind).toBe("matched");
  });

  it("時点ごとに別サンプルの設計でAUCを推測しない", () => {
    const fixture = createLongitudinalFixture();
    const draft = {
      ...fixture.draft,
      time: { ...fixture.draft.time, sampling: "cross_sectional" as const },
    };
    const assessment = assessDraftGraphAnalysis({
      draft,
      cells: fixture.cells,
      readoutId: draft.readouts[0].id,
      conditionIds: draft.conditions.map(({ id }) => id),
      timeAnalysis: { kind: "auc" },
    });

    expect(assessment).toMatchObject({ state: "unsupported", request: null });
    expect(assessment.reason).toContain("AUC");
  });

  it("routes a complete two-treatment combination to the factorial engine contract", () => {
    const { draft: baseDraft, cells } = fixture(["Control −", "Control +", "siRNA −", "siRNA +"]);
    const draft = {
      ...baseDraft,
      attributes: [
        { id: "attribute.sirna", label: "siRNA" },
        { id: "attribute.drug", label: "薬剤" },
      ],
      conditions: baseDraft.conditions.map((condition, index) => ({
        ...condition,
        attributes: {
          "attribute.sirna": index < 2 ? "Control" : "siRNA",
          "attribute.drug": index % 2 === 1 ? "+" : "−",
        },
      })),
    };
    const assessment = assessDraftGraphAnalysis({
      draft,
      cells,
      readoutId: draft.readouts[0].id,
      conditionIds: draft.conditions.map(({ id }) => id),
    });

    expect(assessment.state).toBe("ready");
    expect(assessment.request).toMatchObject({
      protocolVersion: "0.4.0",
      templateId: "D05",
      method: "two_way_anova",
      options: { multiplicityMethod: "holm_all_cell_pairs" },
    });
  });

  it("builds D09 from stable complete X-Y pairs and excludes an incomplete pair", () => {
    const { draft, cells } = createXyCorrelationFixture();
    const assessment = assessDraftGraphAnalysis({
      draft,
      cells,
      readoutId: draft.readouts[0].id,
      conditionIds: draft.conditions.map(({ id }) => id),
    });

    expect(assessment.state).toBe("ready");
    expect(assessment.request).toMatchObject({
      protocolVersion: "0.5.0",
      templateId: "D09",
      method: "pearson",
      variableConditionIds: ["condition.xy.x", "condition.xy.y"],
    });
    expect(assessment.request?.observations).toHaveLength(10);
    expect(new Set(assessment.request?.observations.map(({ pairId }) => pairId)).size).toBe(5);
    expect(assessment.missingCount).toBe(1);
  });

  it("同じsessionでも別の安定unit IDを1つの対応にまとめない", () => {
    const { draft: baseDraft, cells } = fixture(["Before", "After"]);
    const draft = {
      ...baseDraft,
      conditionAssignment: { kind: "matched" as const, unitLabel: "細胞" },
      experiments: baseDraft.experiments.map((experiment, index) => ({
        ...experiment,
        sessionId: "session.same-day",
        stableUnitId: `cell.${index + 1}`,
      })),
    };
    const assessment = assessDraftGraphAnalysis({
      draft,
      cells,
      readoutId: draft.readouts[0].id,
      conditionIds: draft.conditions.map(({ id }) => id),
    });

    expect(assessment).toMatchObject({ state: "ready", method: "paired_t" });
    expect(new Set(assessment.request?.observations.map(({ pairId }) => pairId))).toEqual(
      new Set(["cell.1", "cell.2", "cell.3"]),
    );
  });

  it("安定unit IDは条件間で同じ実単位のpair IDとして使う", () => {
    const { draft: baseDraft, cells } = fixture(["Before", "After"]);
    const draft = {
      ...baseDraft,
      conditionAssignment: { kind: "matched" as const, unitLabel: "動物" },
      experiments: baseDraft.experiments.map((experiment, index) => ({
        ...experiment,
        sessionId: `session.${index + 1}`,
        stableUnitId: `mouse.${index + 1}`,
      })),
    };
    const assessment = assessDraftGraphAnalysis({
      draft,
      cells,
      readoutId: draft.readouts[0].id,
      conditionIds: draft.conditions.map(({ id }) => id),
    });

    const byPair = new Map<string, Set<string>>();
    assessment.request?.observations.forEach((observation) => {
      const conditions = byPair.get(observation.pairId ?? "") ?? new Set<string>();
      conditions.add(observation.conditionId);
      byPair.set(observation.pairId ?? "", conditions);
    });
    expect([...byPair.entries()]).toHaveLength(3);
    expect([...byPair.values()].every((conditionIds) => conditionIds.size === 2)).toBe(true);
  });
});

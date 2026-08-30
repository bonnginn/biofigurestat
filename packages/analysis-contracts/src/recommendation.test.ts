import { describe, expect, it } from "vitest";
import { ExperimentDesignSchema, type ExperimentDesign } from "@lsaa/domain";

import { AnalysisEngineRequestSchema, type AnalysisEngineRequest } from "./contracts";
import { recommendD01OrD02 } from "./d01-d02";
import { recommendAnalysisRequest } from "./recommendation";

const now = "2026-08-28T00:00:00.000Z";

function designFixture(input: {
  conditionCount: number;
  factorCount?: 1 | 2;
  pairing?: "independent" | "matched";
  observationRelationship?: "independent" | "repeated";
  relationshipForm?: "linear" | "monotonic_or_ranked";
}): ExperimentDesign {
  const factorCount = input.factorCount ?? 1;
  const conditions = Array.from({ length: input.conditionCount }, (_, index) => {
    const aIndex = factorCount === 2 ? Math.floor(index / 2) : index;
    const bIndex = factorCount === 2 ? index % 2 : 0;
    return {
      id: `condition.${index + 1}`,
      label: `Condition ${index + 1}`,
      factorLevels: {
        "factor.a": `level.a.${aIndex + 1}`,
        ...(factorCount === 2 ? { "factor.b": `level.b.${bIndex + 1}` } : {}),
      },
    };
  });
  return ExperimentDesignSchema.parse({
    schemaVersion: "0.2.0",
    id: "design.recommendation-test",
    name: "Recommendation authority fixture",
    purpose: "general_assay",
    outcomes: [{ id: "outcome.value", key: "value", label: "Value", type: "continuous" }],
    factors: [
      {
        id: "factor.a",
        key: "a",
        label: "Condition",
        levels: Array.from(
          { length: factorCount === 2 ? 2 : input.conditionCount },
          (_, index) => ({ id: `level.a.${index + 1}`, label: `A${index + 1}`, order: index }),
        ),
      },
      ...(factorCount === 2
        ? [
            {
              id: "factor.b",
              key: "b",
              label: "Treatment",
              levels: [
                { id: "level.b.1", label: "B1", order: 0 },
                { id: "level.b.2", label: "B2", order: 1 },
              ],
            },
          ]
        : []),
    ],
    ...(input.observationRelationship
      ? {
          observationFactors: [
            {
              id: "factor.axis",
              key: "axis",
              label: "Time",
              unitRole:
                input.observationRelationship === "repeated" ? "within_unit" : "between_unit",
              relationship: { kind: input.observationRelationship },
              levels: [
                { id: "axis.1", label: "0 h", order: 0 },
                { id: "axis.2", label: "24 h", order: 1 },
              ],
            },
          ],
        }
      : {}),
    conditions,
    unitLevels: [
      {
        id: "unit-level.experimental",
        key: "experimental",
        label: "Experimental unit",
        role: "experimental_unit",
        parentLevelId: null,
      },
    ],
    experimentalUnitLevelId: "unit-level.experimental",
    pairing:
      input.pairing === "matched"
        ? {
            kind: "matched",
            matchLevelId: "unit-level.experimental",
            completePairsRequired: true,
          }
        : { kind: "independent" },
    plannedN: 2,
    normalizationPlans: [],
    primaryContrast:
      input.conditionCount >= 2
        ? {
            id: "contrast.primary",
            label: "Primary",
            conditionIds: ["condition.1", "condition.2"],
          }
        : null,
    wizardRuleVersion: "test.0.1.0",
    wizardDecisions: input.relationshipForm
      ? [
          {
            questionId: "correlation.relationship_form",
            answer: input.relationshipForm,
          },
        ]
      : [],
    createdAt: now,
  });
}

function observations(conditionCount: number, paired = false) {
  return Array.from({ length: conditionCount }, (_, conditionIndex) =>
    [1, 2].map((replicate) => ({
      observationId: `observation.${conditionIndex + 1}.${replicate}`,
      conditionId: `condition.${conditionIndex + 1}`,
      experimentalUnitId: paired ? `unit.${replicate}` : `unit.${conditionIndex + 1}.${replicate}`,
      ...(paired ? { pairId: `unit.${replicate}` } : {}),
      value: conditionIndex + replicate,
    })),
  ).flat();
}

function parseRequest(value: unknown): AnalysisEngineRequest {
  return AnalysisEngineRequestSchema.parse(value);
}

describe("canonical experiment-workspace recommendation authority", () => {
  it("returns package-owned canonical recommendations for D01-D07 and D09", () => {
    const cases: Array<{
      design: ExperimentDesign;
      request: AnalysisEngineRequest;
      expectedTemplate: string;
      expectedMethod: string;
    }> = [
      {
        design: designFixture({ conditionCount: 2 }),
        request: parseRequest({
          protocolVersion: "0.1.0",
          requestId: "request.d01",
          projectId: "project.test",
          analysisId: "analysis.d01",
          templateId: "D01",
          templateVersion: "0.1.0",
          method: "welch_t",
          contrastConditionIds: ["condition.1", "condition.2"],
          observations: observations(2),
          options: { alternative: "two_sided", confidenceLevel: 0.95, multiplicityMethod: null },
        }),
        expectedTemplate: "D01",
        expectedMethod: "welch_t",
      },
      {
        design: designFixture({ conditionCount: 2, pairing: "matched" }),
        request: parseRequest({
          protocolVersion: "0.1.0",
          requestId: "request.d02",
          projectId: "project.test",
          analysisId: "analysis.d02",
          templateId: "D02",
          templateVersion: "0.1.0",
          method: "paired_t",
          contrastConditionIds: ["condition.1", "condition.2"],
          observations: observations(2, true),
          options: { alternative: "two_sided", confidenceLevel: 0.95, multiplicityMethod: null },
        }),
        expectedTemplate: "D02",
        expectedMethod: "paired_t",
      },
      {
        design: designFixture({ conditionCount: 3 }),
        request: parseRequest({
          protocolVersion: "0.2.0",
          requestId: "request.d03",
          projectId: "project.test",
          analysisId: "analysis.d03",
          templateId: "D03",
          templateVersion: "0.1.0",
          method: "welch_anova",
          conditionIds: ["condition.1", "condition.2", "condition.3"],
          contrastIntent: "all_pairs",
          primaryContrastConditionIds: ["condition.1", "condition.2"],
          observations: observations(3),
          options: {
            alternative: "two_sided",
            confidenceLevel: 0.95,
            multiplicityMethod: "games_howell_all_pairs",
          },
        }),
        expectedTemplate: "D03",
        expectedMethod: "welch_anova",
      },
      {
        design: designFixture({ conditionCount: 3, pairing: "matched" }),
        request: parseRequest({
          protocolVersion: "0.3.0",
          requestId: "request.d04",
          projectId: "project.test",
          analysisId: "analysis.d04",
          templateId: "D04",
          templateVersion: "0.1.0",
          method: "repeated_measures_anova",
          conditionIds: ["condition.1", "condition.2", "condition.3"],
          primaryContrastConditionIds: ["condition.1", "condition.2"],
          observations: observations(3, true),
          options: {
            alternative: "two_sided",
            confidenceLevel: 0.95,
            multiplicityMethod: "holm_paired_all_pairs",
          },
        }),
        expectedTemplate: "D04",
        expectedMethod: "repeated_measures_anova",
      },
      {
        design: designFixture({ conditionCount: 4, factorCount: 2 }),
        request: parseRequest({
          protocolVersion: "0.4.0",
          requestId: "request.d05",
          projectId: "project.test",
          analysisId: "analysis.d05",
          templateId: "D05",
          templateVersion: "0.1.0",
          method: "two_way_anova",
          factors: [
            { factorId: "factor.a", levelIds: ["level.a.1", "level.a.2"] },
            { factorId: "factor.b", levelIds: ["level.b.1", "level.b.2"] },
          ],
          conditions: [
            {
              conditionId: "condition.1",
              factorALevelId: "level.a.1",
              factorBLevelId: "level.b.1",
            },
            {
              conditionId: "condition.2",
              factorALevelId: "level.a.1",
              factorBLevelId: "level.b.2",
            },
            {
              conditionId: "condition.3",
              factorALevelId: "level.a.2",
              factorBLevelId: "level.b.1",
            },
            {
              conditionId: "condition.4",
              factorALevelId: "level.a.2",
              factorBLevelId: "level.b.2",
            },
          ],
          primaryContrastConditionIds: ["condition.1", "condition.2"],
          observations: observations(4),
          options: {
            alternative: "two_sided",
            confidenceLevel: 0.95,
            multiplicityMethod: "holm_all_cell_pairs",
          },
        }),
        expectedTemplate: "D05",
        expectedMethod: "two_way_anova",
      },
      {
        design: designFixture({
          conditionCount: 2,
          observationRelationship: "repeated",
        }),
        request: parseRequest({
          protocolVersion: "0.6.0",
          requestId: "request.d06",
          projectId: "project.test",
          analysisId: "analysis.d06",
          templateId: "D06",
          templateVersion: "0.1.0",
          method: "mixed_anova",
          withinFactor: { role: "time", title: "Time", unit: "h" },
          conditionIds: ["condition.1", "condition.2"],
          timePoints: [
            { timePointId: "axis.1", value: 0 },
            { timePointId: "axis.2", value: 24 },
          ],
          observations: ["condition.1", "condition.2"].flatMap((conditionId, conditionIndex) =>
            [1, 2].flatMap((replicate) =>
              ["axis.1", "axis.2"].map((timePointId, axisIndex) => ({
                observationId: `observation.${conditionIndex}.${replicate}.${axisIndex}`,
                conditionId,
                experimentalUnitId: `unit.${conditionIndex}.${replicate}`,
                pairId: `unit.${conditionIndex}.${replicate}`,
                timePointId,
                value: conditionIndex + replicate + axisIndex,
              })),
            ),
          ),
          options: { alternative: "two_sided", confidenceLevel: 0.95, multiplicityMethod: null },
        }),
        expectedTemplate: "D06",
        expectedMethod: "mixed_anova",
      },
      {
        design: designFixture({
          conditionCount: 2,
          observationRelationship: "independent",
        }),
        request: parseRequest({
          protocolVersion: "0.7.0",
          requestId: "request.d07",
          projectId: "project.test",
          analysisId: "analysis.d07",
          templateId: "D07",
          templateVersion: "0.1.0",
          method: "two_way_anova",
          conditionIds: ["condition.1", "condition.2"],
          withinFactor: {
            role: "time",
            title: "Time",
            unit: "h",
            levels: [
              { levelId: "axis.1", value: 0 },
              { levelId: "axis.2", value: 24 },
            ],
          },
          observations: ["condition.1", "condition.2"].flatMap((conditionId, conditionIndex) =>
            ["axis.1", "axis.2"].flatMap((withinFactorLevelId, axisIndex) =>
              [1, 2].map((replicate) => ({
                observationId: `observation.${conditionIndex}.${axisIndex}.${replicate}`,
                conditionId,
                withinFactorLevelId,
                experimentalUnitId: `unit.${conditionIndex}.${axisIndex}.${replicate}`,
                value: conditionIndex + axisIndex + replicate,
              })),
            ),
          ),
          options: { alternative: "two_sided", confidenceLevel: 0.95, multiplicityMethod: null },
        }),
        expectedTemplate: "D07",
        expectedMethod: "two_way_anova",
      },
      {
        design: designFixture({
          conditionCount: 2,
          pairing: "matched",
          relationshipForm: "linear",
        }),
        request: parseRequest({
          protocolVersion: "0.5.0",
          requestId: "request.d09",
          projectId: "project.test",
          analysisId: "analysis.d09",
          templateId: "D09",
          templateVersion: "0.1.0",
          method: "pearson",
          variableConditionIds: ["condition.1", "condition.2"],
          observations: Array.from({ length: 3 }, (_, index) =>
            ["condition.1", "condition.2"].map((conditionId, conditionIndex) => ({
              observationId: `observation.${index}.${conditionIndex}`,
              conditionId,
              experimentalUnitId: `unit.${index}`,
              pairId: `unit.${index}`,
              value: index + conditionIndex,
            })),
          ).flat(),
          options: { alternative: "two_sided", confidenceLevel: 0.95, multiplicityMethod: null },
        }),
        expectedTemplate: "D09",
        expectedMethod: "pearson",
      },
    ];

    cases.forEach(({ design, request, expectedTemplate, expectedMethod }) => {
      const result = recommendAnalysisRequest(design, request, { outcomeId: "outcome.value" });
      expect(result).toMatchObject({
        matched: true,
        recommendation: { templateId: expectedTemplate, recommendedMethod: expectedMethod },
      });
    });

    const d01 = cases[0]!;
    expect(recommendAnalysisRequest(d01.design, d01.request)).toEqual(
      recommendD01OrD02(d01.design),
    );
  });

  it("safe-stops instead of coercing a mismatched or repeated-unit request", () => {
    const d01Request = parseRequest({
      protocolVersion: "0.1.0",
      requestId: "request.mismatch",
      projectId: "project.test",
      analysisId: "analysis.mismatch",
      templateId: "D01",
      templateVersion: "0.1.0",
      method: "welch_t",
      contrastConditionIds: ["condition.1", "condition.2"],
      observations: observations(2),
      options: { alternative: "two_sided", confidenceLevel: 0.95, multiplicityMethod: null },
    });
    expect(
      recommendAnalysisRequest(
        designFixture({ conditionCount: 2, pairing: "matched" }),
        d01Request,
      ),
    ).toMatchObject({ matched: false, reasonCode: "request_design_template_mismatch" });

    const d07Design = designFixture({
      conditionCount: 2,
      observationRelationship: "independent",
    });
    const reusedUnitRequest = parseRequest({
      protocolVersion: "0.7.0",
      requestId: "request.d07.reused",
      projectId: "project.test",
      analysisId: "analysis.d07.reused",
      templateId: "D07",
      templateVersion: "0.1.0",
      method: "two_way_anova",
      conditionIds: ["condition.1", "condition.2"],
      withinFactor: {
        role: "time",
        title: "Time",
        unit: "h",
        levels: [
          { levelId: "axis.1", value: 0 },
          { levelId: "axis.2", value: 24 },
        ],
      },
      observations: ["condition.1", "condition.2"].flatMap((conditionId, conditionIndex) =>
        ["axis.1", "axis.2"].flatMap((withinFactorLevelId, axisIndex) =>
          [1, 2].map((replicate) => ({
            observationId: `observation.${conditionIndex}.${axisIndex}.${replicate}`,
            conditionId,
            withinFactorLevelId,
            experimentalUnitId: `unit.${conditionIndex}.${replicate}`,
            value: conditionIndex + axisIndex + replicate,
          })),
        ),
      ),
      options: { alternative: "two_sided", confidenceLevel: 0.95, multiplicityMethod: null },
    });
    expect(recommendAnalysisRequest(d07Design, reusedUnitRequest)).toMatchObject({
      matched: false,
      reasonCode: "requires_independent_units_in_every_cell",
    });
  });

  it("keeps explicit planned cell comparisons distinct from factorial-effect inference", () => {
    const design = designFixture({ conditionCount: 4, factorCount: 2 });
    const request = parseRequest({
      protocolVersion: "0.2.0",
      requestId: "request.planned-cells",
      projectId: "project.test",
      analysisId: "analysis.planned-cells",
      templateId: "D03",
      templateVersion: "0.1.0",
      method: "one_way_anova",
      conditionIds: ["condition.1", "condition.2", "condition.3", "condition.4"],
      contrastIntent: "planned_comparisons",
      plannedContrastConditionIds: [["condition.1", "condition.4"]],
      primaryContrastConditionIds: ["condition.1", "condition.4"],
      observations: observations(4),
      options: {
        alternative: "two_sided",
        confidenceLevel: 0.95,
        multiplicityMethod: "holm_planned_comparisons",
      },
    });

    expect(recommendAnalysisRequest(design, request)).toMatchObject({
      matched: true,
      recommendation: {
        templateId: "D03",
        reasonCode: "planned_comparisons_across_independent_condition_cells",
        recommendedMethod: "one_way_anova",
        multiplicityMethod: "holm_planned_comparisons",
      },
    });
  });
});

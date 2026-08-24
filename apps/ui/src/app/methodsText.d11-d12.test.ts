import { describe, expect, it } from "vitest";
import type {
  AnalysisEngineRequest,
  AnalysisEngineResult,
  AnalysisRecommendation,
} from "@lsaa/analysis-contracts";
import type { ExperimentDesign } from "@lsaa/domain";
import { generateMethodsText } from "./methodsText";

const baseDesign: ExperimentDesign = {
  schemaVersion: "0.2.0",
  id: "design.methods.special",
  name: "Special methods",
  purpose: "custom",
  outcomes: [
    { id: "outcome.1", key: "outcome", label: "Outcome", type: "time_to_event", unit: "days" },
  ],
  factors: [
    {
      id: "factor.group",
      key: "group",
      label: "Group",
      levels: [
        { id: "level.a", label: "A", order: 0 },
        { id: "level.b", label: "B", order: 1 },
      ],
    },
  ],
  conditions: [
    { id: "A", label: "Control", factorLevels: { "factor.group": "level.a" } },
    { id: "B", label: "Treatment", factorLevels: { "factor.group": "level.b" } },
  ],
  unitLevels: [
    {
      id: "level.unit",
      key: "unit",
      label: "Animal",
      role: "experimental_unit",
      parentLevelId: null,
    },
  ],
  experimentalUnitLevelId: "level.unit",
  pairing: { kind: "independent" },
  plannedN: 2,
  normalizationPlans: [],
  primaryContrast: { id: "contrast.1", label: "A vs B", conditionIds: ["A", "B"] },
  wizardRuleVersion: "test",
  wizardDecisions: [],
  createdAt: "2026-08-24T00:00:00.000Z",
};
const resultBase = {
  status: "ok" as const,
  engine: { name: "lsaa-python", version: "0.9.0", packages: { scipy: "1" } },
  diagnostics: [],
  warnings: [],
  completedAt: "2026-08-24T00:00:00.000Z",
};

describe("specialized Methods", () => {
  it("states survival analysis, event/censor counts, and log-rank output", () => {
    const request: AnalysisEngineRequest = {
      protocolVersion: "0.8.0",
      requestId: "request.s",
      projectId: "project.1",
      analysisId: "analysis.s",
      templateId: "D11",
      templateVersion: "0.1.0",
      method: "log_rank",
      conditionIds: ["A", "B"],
      observations: [
        {
          observationId: "o1",
          conditionId: "A",
          experimentalUnitId: "u1",
          followUpTime: 2,
          eventObserved: true,
        },
        {
          observationId: "o2",
          conditionId: "B",
          experimentalUnitId: "u2",
          followUpTime: 3,
          eventObserved: false,
        },
      ],
      options: { alternative: "two_sided", confidenceLevel: 0.95, multiplicityMethod: null },
    };
    const recommendation: AnalysisRecommendation = {
      templateId: "D11",
      templateVersion: "0.1.0",
      recommendedMethod: "log_rank",
      alternativeMethods: [],
      reasonCode: "survival_groups",
      explanation: "Time-to-event",
      statisticalNDefinition: "Biological units",
    };
    const result: AnalysisEngineResult = {
      ...resultBase,
      protocolVersion: "0.8.0",
      requestId: request.requestId,
      estimates: [],
      tests: [
        {
          name: "log_rank",
          statisticName: "chi-square",
          statistic: 4.1,
          degreesOfFreedom: [1],
          pValue: 0.043,
          adjustedPValue: null,
          effectSizeName: null,
          effectSize: null,
        },
      ],
      survival: {
        groups: [
          { conditionId: "A", n: 1, events: 1, censored: 0, curve: [], censorTimes: [] },
          { conditionId: "B", n: 1, events: 0, censored: 1, curve: [], censorTimes: [3] },
        ],
      },
    };
    const text = generateMethodsText({
      design: baseDesign,
      recommendation,
      request,
      result,
      outcomeId: "outcome.1",
    });
    expect(text).toContain("生存・time-to-event");
    expect(text).toContain("event=1、censored=0");
    expect(text).toContain("log-rank検定");
  });

  it("states the explicit one-sample reference without a fake second group", () => {
    const design: ExperimentDesign = {
      ...baseDesign,
      outcomes: [{ ...baseDesign.outcomes[0]!, type: "continuous" }],
      factors: [{ ...baseDesign.factors[0]!, levels: [baseDesign.factors[0]!.levels[0]!] }],
      conditions: [baseDesign.conditions[0]!],
      primaryContrast: null,
    };
    const request: AnalysisEngineRequest = {
      protocolVersion: "0.9.0",
      requestId: "request.one",
      projectId: "project.1",
      analysisId: "analysis.one",
      templateId: "D12",
      templateVersion: "0.1.0",
      method: "one_sample_t",
      conditionId: "A",
      nullValue: 7.5,
      observations: [
        { observationId: "o1", conditionId: "A", experimentalUnitId: "u1", value: 8 },
        { observationId: "o2", conditionId: "A", experimentalUnitId: "u2", value: 9 },
      ],
      options: { alternative: "two_sided", confidenceLevel: 0.95, multiplicityMethod: null },
    };
    const recommendation: AnalysisRecommendation = {
      templateId: "D12",
      templateVersion: "0.1.0",
      recommendedMethod: "one_sample_t",
      alternativeMethods: [],
      reasonCode: "single_cohort_explicit_reference",
      explanation: "Explicit reference",
      statisticalNDefinition: "Biological units",
    };
    const result: AnalysisEngineResult = {
      ...resultBase,
      protocolVersion: "0.9.0",
      requestId: request.requestId,
      estimates: [
        {
          name: "mean difference from reference",
          value: 1,
          standardError: 0.5,
          confidenceInterval: { level: 0.95, lower: -1, upper: 3 },
        },
      ],
      tests: [
        {
          name: "one_sample_t",
          statisticName: "t",
          statistic: 2,
          degreesOfFreedom: [1],
          pValue: 0.29,
          adjustedPValue: null,
          effectSizeName: "cohen_dz",
          effectSize: 1.4,
        },
      ],
    };
    const text = generateMethodsText({
      design,
      recommendation,
      request,
      result,
      outcomeId: "outcome.1",
    });
    expect(text).toContain("単一コホート／基準値：Control／7.5");
    expect(text).not.toContain("Control vs");
  });

  it("uses categorical repeated-state terminology without calling it time", () => {
    const states = [
      { levelId: "baseline", label: "Baseline", order: 0 },
      { levelId: "challenge", label: "Challenge", order: 1 },
    ];
    const request: AnalysisEngineRequest = {
      protocolVersion: "0.10.0",
      requestId: "request.state",
      projectId: "project.1",
      analysisId: "analysis.state",
      templateId: "D13",
      templateVersion: "0.1.0",
      method: "mixed_anova",
      conditionIds: ["A", "B"],
      withinFactor: { role: "categorical", title: "Experimental phase", unit: "" },
      stateLevels: states,
      observations: ["A", "B"].flatMap((conditionId) =>
        [1, 2].flatMap((unit) =>
          states.map((state, index) => ({
            observationId: `o.${conditionId}.${unit}.${index}`,
            conditionId,
            experimentalUnitId: `u.${conditionId}.${unit}`,
            pairId: `u.${conditionId}.${unit}`,
            stateLevelId: state.levelId,
            value: unit + index,
          })),
        ),
      ),
      options: { alternative: "two_sided", confidenceLevel: 0.95, multiplicityMethod: null },
    };
    const recommendation: AnalysisRecommendation = {
      templateId: "D13",
      templateVersion: "0.1.0",
      recommendedMethod: "mixed_anova",
      alternativeMethods: [],
      reasonCode: "categorical_repeated_state",
      explanation: "Repeated categorical states",
      statisticalNDefinition: "Stable biological units",
    };
    const result: AnalysisEngineResult = {
      ...resultBase,
      protocolVersion: "0.10.0",
      requestId: request.requestId,
      estimates: [],
      tests: [
        "condition_by_within_factor_interaction",
        "condition_main_effect",
        "within_factor_main_effect",
      ].map((name) => ({
        name,
        statisticName: "F",
        statistic: 2.5,
        degreesOfFreedom: [1, 4],
        pValue: 0.1,
        adjustedPValue: null,
        effectSizeName: "partial_eta_squared",
        effectSize: 0.2,
      })),
      factorMetadata: {
        withinFactor: request.withinFactor,
        effectIds: {
          interaction: "condition_by_within_factor_interaction",
          condition: "condition_main_effect",
          withinFactor: "within_factor_main_effect",
        },
        legacyEffectAliases: {},
      },
    };
    const text = generateMethodsText({
      design: baseDesign,
      recommendation,
      request,
      result,
      repeatedAxis: { semantic: "categorical", title: "Experimental phase", unit: "" },
    });
    expect(text).toContain("Experimental phase");
    expect(text).toContain("反復カテゴリ状態");
    expect(text).not.toContain("時間");
  });
});

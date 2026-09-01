import { act, renderHook } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { useExperimentGraphStatisticsIntent } from "./useExperimentGraphStatisticsIntent";

describe("useExperimentGraphStatisticsIntent", () => {
  const equivalencePlan = {
    schemaVersion: "0.1.0" as const,
    margin: {
      scale: "raw_difference" as const,
      lowerBound: -0.2,
      upperBound: 0.2,
      unit: "AU",
      declaredAsPrespecified: true as const,
    },
    alpha: 0.05 as const,
    claimMode: "single_primary_comparison" as const,
    primaryComparisonId: "vehicle:drug-a",
  };

  it("owns method selection, benchmark reporting, and stale-analysis clearing", () => {
    const clearAnalysis = vi.fn();
    const recordEvent = vi.fn();
    const { result } = renderHook(() =>
      useExperimentGraphStatisticsIntent({ clearAnalysis, recordEvent }),
    );

    act(() => result.current.changeSelectedMethod("one_way_anova", "welch_anova"));

    expect(result.current.selectedMethod).toBe("one_way_anova");
    expect(recordEvent).toHaveBeenCalledWith(
      "statistics_method_selected",
      { recommended: "welch_anova", selected: "one_way_anova" },
      "analysis_only",
    );
    expect(clearAnalysis).toHaveBeenCalledOnce();
  });

  it("updates planned comparisons without changing their condition identities", () => {
    const clearAnalysis = vi.fn();
    const recordEvent = vi.fn();
    const { result } = renderHook(() =>
      useExperimentGraphStatisticsIntent({ clearAnalysis, recordEvent }),
    );

    act(() =>
      result.current.changePlannedContrastConditionIds([
        ["vehicle", "drug-a"],
        ["vehicle", "drug-b"],
      ]),
    );

    expect(result.current.plannedContrastConditionIds).toEqual([
      ["vehicle", "drug-a"],
      ["vehicle", "drug-b"],
    ]);
    expect(recordEvent).toHaveBeenCalledWith(
      "statistics_planned_comparisons_selected",
      { pairs: "vehicle:drug-a|vehicle:drug-b", count: 2 },
      "analysis_only",
    );
    expect(clearAnalysis).toHaveBeenCalledOnce();

    act(() => result.current.removeConditionFromPlannedContrasts("drug-a"));
    expect(result.current.plannedContrastConditionIds).toEqual([["vehicle", "drug-b"]]);
  });

  it("maps contrast intent to the existing method policy and clears stale results", () => {
    const clearAnalysis = vi.fn();
    const recordEvent = vi.fn();
    const { result } = renderHook(() =>
      useExperimentGraphStatisticsIntent({ clearAnalysis, recordEvent }),
    );

    act(() => result.current.changeContrastIntent("control_vs_many"));

    expect(result.current.contrastIntent).toBe("control_vs_many");
    expect(result.current.selectedMethod).toBe("one_way_anova");
    expect(recordEvent).toHaveBeenCalledWith(
      "statistics_contrast_selected",
      { intent: "control_vs_many" },
      "analysis_only",
    );
    expect(clearAnalysis).toHaveBeenCalledOnce();
  });

  it("keeps equivalence separate from contrast intent and does not select an NHST method", () => {
    const clearAnalysis = vi.fn();
    const recordEvent = vi.fn();
    const { result } = renderHook(() =>
      useExperimentGraphStatisticsIntent({ clearAnalysis, recordEvent }),
    );
    const initialMethod = result.current.selectedMethod;

    act(() => result.current.changeComparisonGoal("equivalence"));

    expect(result.current.comparisonGoal).toBe("equivalence");
    expect(result.current.contrastIntent).toBe("all_pairs");
    expect(result.current.selectedMethod).toBe(initialMethod);
    expect(recordEvent).toHaveBeenCalledWith(
      "statistics_comparison_goal_selected",
      { goal: "equivalence" },
      "analysis_only",
    );
    expect(clearAnalysis).toHaveBeenCalledOnce();
  });

  it("owns a prespecified equivalence plan and invalidates stale results when it changes", () => {
    const clearAnalysis = vi.fn();
    const recordEvent = vi.fn();
    const { result } = renderHook(() =>
      useExperimentGraphStatisticsIntent({ clearAnalysis, recordEvent }),
    );

    act(() => result.current.changeEquivalencePlan(equivalencePlan));

    expect(result.current.equivalencePlan).toEqual(equivalencePlan);
    expect(recordEvent).toHaveBeenCalledWith(
      "statistics_equivalence_plan_changed",
      {
        complete: true,
        scale: "raw_difference",
        claimMode: "single_primary_comparison",
      },
      "analysis_only",
    );
    expect(clearAnalysis).toHaveBeenCalledOnce();
  });

  it("keeps correlation choice synchronized with the selected method", () => {
    const clearAnalysis = vi.fn();
    const { result } = renderHook(() =>
      useExperimentGraphStatisticsIntent({ clearAnalysis, recordEvent: vi.fn() }),
    );

    act(() => result.current.changeCorrelationMethod("spearman", "pearson"));

    expect(result.current.correlationMethod).toBe("spearman");
    expect(result.current.selectedMethod).toBe("spearman");
    expect(clearAnalysis).toHaveBeenCalledOnce();
  });
});

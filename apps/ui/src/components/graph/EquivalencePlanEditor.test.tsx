import { useState } from "react";
import { act, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

import { resetAppLocaleForTests, setAppLocale } from "../../app/appLocale";
import { EquivalencePlanEditor } from "./EquivalencePlanEditor";
import type { EquivalenceAnalysisPlan } from "@lsaa/analysis-contracts";

afterEach(() => act(() => resetAppLocaleForTests("ja")));

describe("EquivalencePlanEditor", () => {
  it("requires valid prespecified bounds before emitting a saved plan", () => {
    const onPlanChange = vi.fn();
    render(
      <EquivalencePlanEditor
        scale="percentage_point_difference"
        unit="percentage points"
          comparisonCount={4}
          comparisonOptions={[
            { id: "parent:clone-2", label: "Parent vs clone #2" },
            { id: "parent:clone-3", label: "Parent vs clone #3" },
          ]}
        onPlanChange={onPlanChange}
      />,
    );

    fireEvent.change(screen.getByLabelText("下限"), { target: { value: "-10" } });
    fireEvent.change(screen.getByLabelText("上限"), { target: { value: "10" } });
    fireEvent.click(
      screen.getByRole("checkbox", {
        name: /この許容範囲は観測結果から自動決定せず/,
      }),
    );

    expect(onPlanChange).toHaveBeenLastCalledWith(
      expect.objectContaining({
        margin: expect.objectContaining({
          scale: "percentage_point_difference",
          lowerBound: -10,
          upperBound: 10,
        }),
        claimMode: "all_selected_comparisons",
      }),
    );
  });

  it("records one explicitly selected primary comparison", () => {
    function ControlledEditor() {
      const [plan, setPlan] = useState<EquivalenceAnalysisPlan | null>(null);
      return (
        <EquivalencePlanEditor
          plan={plan}
          scale="percentage_point_difference"
          unit="percentage points"
          comparisonCount={2}
          comparisonOptions={[
            { id: "parent:clone-2", label: "Parent vs clone #2" },
            { id: "parent:clone-3", label: "Parent vs clone #3" },
          ]}
          onPlanChange={setPlan}
        />
      );
    }
    render(
      <ControlledEditor />,
    );

    fireEvent.change(screen.getByLabelText("下限"), { target: { value: "-10" } });
    fireEvent.change(screen.getByLabelText("上限"), { target: { value: "10" } });
    fireEvent.change(screen.getByLabelText("複数比較で示したい結論"), {
      target: { value: "single_primary_comparison" },
    });
    fireEvent.change(screen.getByLabelText("主比較"), {
      target: { value: "parent:clone-3" },
    });
    fireEvent.click(
      screen.getByRole("checkbox", {
        name: /この許容範囲は観測結果から自動決定せず/,
      }),
    );

    expect(screen.getByLabelText("下限")).toHaveValue(-10);
    expect(screen.getByLabelText("上限")).toHaveValue(10);
    expect(screen.getByLabelText("主比較")).toHaveValue("parent:clone-3");
    expect(screen.getByRole("status")).toHaveTextContent(
      "同等性marginをこのGraphの解析計画として保存します",
    );
  });

  it("keeps an invalid or unacknowledged plan non-executable and unsaved", () => {
    act(() => setAppLocale("en"));
    const onPlanChange = vi.fn();
    render(
      <EquivalencePlanEditor
        scale="raw_difference"
        unit="AU"
        comparisonCount={1}
        onPlanChange={onPlanChange}
      />,
    );

    fireEvent.change(screen.getByLabelText("Lower bound"), { target: { value: "2" } });
    fireEvent.change(screen.getByLabelText("Upper bound"), { target: { value: "10" } });
    fireEvent.click(
      screen.getByRole("checkbox", {
        name: /I specified these bounds scientifically/,
      }),
    );

    expect(screen.getByRole("alert")).toHaveTextContent("lower bound below 0");
    expect(onPlanChange).toHaveBeenLastCalledWith(null);
  });

  it("records the sole comparison as the primary claim without asking for a redundant choice", () => {
    const onPlanChange = vi.fn();
    render(
      <EquivalencePlanEditor
        scale="raw_difference"
        unit="AU"
        comparisonCount={1}
        comparisonOptions={[{ id: "equivalence:control:treatment", label: "Control vs treatment" }]}
        onPlanChange={onPlanChange}
      />,
    );

    fireEvent.change(screen.getByLabelText("下限"), { target: { value: "-0.5" } });
    fireEvent.change(screen.getByLabelText("上限"), { target: { value: "0.5" } });
    fireEvent.click(
      screen.getByRole("checkbox", {
        name: /この許容範囲は観測結果から自動決定せず/,
      }),
    );

    expect(onPlanChange).toHaveBeenLastCalledWith(
      expect.objectContaining({
        claimMode: "single_primary_comparison",
        primaryComparisonId: "equivalence:control:treatment",
      }),
    );
  });
});

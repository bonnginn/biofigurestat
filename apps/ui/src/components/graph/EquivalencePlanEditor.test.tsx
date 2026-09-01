import { act, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

import { resetAppLocaleForTests, setAppLocale } from "../../app/appLocale";
import { EquivalencePlanEditor } from "./EquivalencePlanEditor";

afterEach(() => act(() => resetAppLocaleForTests("ja")));

describe("EquivalencePlanEditor", () => {
  it("requires valid prespecified bounds before emitting a saved plan", () => {
    const onPlanChange = vi.fn();
    render(
      <EquivalencePlanEditor
        scale="percentage_point_difference"
        unit="percentage points"
        comparisonCount={4}
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
});

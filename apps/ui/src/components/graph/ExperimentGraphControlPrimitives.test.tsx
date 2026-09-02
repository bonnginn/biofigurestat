import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";

import {
  ExperimentGraphColorControl,
  ExperimentGraphRangeControl,
  ExperimentGraphVisibilityControl,
} from "./ExperimentGraphControlPrimitives";

describe("Experiment Graph control primitives", () => {
  it("exposes one checked-state boundary", () => {
    const onChange = vi.fn();
    render(<ExperimentGraphVisibilityControl label="Points" checked={true} onChange={onChange} />);

    fireEvent.click(screen.getByRole("checkbox", { name: "Points" }));
    expect(onChange).toHaveBeenCalledWith(false);
  });

  it("normalizes slider values to numbers", () => {
    const onChange = vi.fn();
    render(
      <ExperimentGraphRangeControl
        label="Width"
        ariaLabel="Line width"
        value={1.2}
        min={0.5}
        max={4}
        step={0.1}
        suffix="px"
        formatValue={(value) => value.toFixed(1)}
        onChange={onChange}
      />,
    );

    fireEvent.change(screen.getByRole("slider", { name: "Line width" }), {
      target: { value: "2.4" },
    });
    expect(onChange).toHaveBeenCalledWith(2.4);
  });

  it("offers named colors without removing unrestricted color input", () => {
    const onChange = vi.fn();
    render(
      <ExperimentGraphColorControl
        label="Outline"
        ariaLabel="Outline color"
        value="#111111"
        showPresets
        onChange={onChange}
      />,
    );

    expect(screen.getByLabelText("Outline color")).toHaveValue("#111111");
    fireEvent.click(screen.getByRole("button", { name: "赤を選択" }));
    expect(onChange).toHaveBeenCalledWith("#b42318");
  });
});

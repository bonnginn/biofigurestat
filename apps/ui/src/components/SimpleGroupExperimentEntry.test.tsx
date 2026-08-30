import { fireEvent, render, screen } from "@testing-library/react";
import { vi } from "vitest";

import { SimpleGroupExperimentEntry } from "./SimpleGroupExperimentEntry";

describe("SimpleGroupExperimentEntry", () => {
  it("creates a bounded independent scalar worksheet without the general interview", () => {
    const onReady = vi.fn();
    render(<SimpleGroupExperimentEntry onBack={vi.fn()} onReady={onReady} />);

    fireEvent.change(screen.getByLabelText("単純な群比較の条件 1"), {
      target: { value: "Vehicle" },
    });
    fireEvent.change(screen.getByLabelText("単純な群比較の条件 2"), {
      target: { value: "Drug" },
    });
    fireEvent.change(screen.getByLabelText("単純な群比較の対照群"), {
      target: { value: "0" },
    });
    fireEvent.change(screen.getByPlaceholderText("例：Relative protein amount"), {
      target: { value: "Relative protein amount" },
    });
    fireEvent.change(screen.getByPlaceholderText("例：culture dish、mouse"), {
      target: { value: "culture dish" },
    });
    fireEvent.click(screen.getByRole("checkbox"));
    fireEvent.click(screen.getByRole("button", { name: "条件別スプレッドシートを作る" }));

    expect(onReady).toHaveBeenCalledOnce();
    expect(onReady.mock.calls[0]?.[0]).toMatchObject({
      entryRoute: "simple_independent_groups",
      attributes: [{ label: "Treatment", relationship: "independent" }],
      conditions: [{ label: "Vehicle" }, { label: "Drug" }],
      controlConditionId: "condition.1",
      conditionAssignment: { kind: "independent", unitLabel: "culture dish" },
      readouts: [{ label: "Relative protein amount", nestedInputMode: "unit_summary" }],
    });
    expect(screen.queryByText("条件を受けたものと材料のつながり")).toBeNull();
  });
});

import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { vi } from "vitest";

import { SimpleGroupExperimentEntry } from "./SimpleGroupExperimentEntry";

describe("SimpleGroupExperimentEntry", () => {
  it("reports a manually edited experiment title as unsaved work", async () => {
    const onDirtyChange = vi.fn();
    render(
      <SimpleGroupExperimentEntry
        onBack={vi.fn()}
        onReady={vi.fn()}
        onDirtyChange={onDirtyChange}
      />,
    );

    fireEvent.change(screen.getByRole("textbox", { name: "実験タイトル（任意）" }), {
      target: { value: "手入力した実験" },
    });

    await waitFor(() => expect(onDirtyChange).toHaveBeenLastCalledWith(true));
  });

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

  it("adds conditions beyond the four initially visible fields", () => {
    const onReady = vi.fn();
    render(<SimpleGroupExperimentEntry onBack={vi.fn()} onReady={onReady} />);

    fireEvent.click(screen.getByRole("button", { name: "＋ 条件を追加" }));
    ["Vehicle", "Drug A", "Drug B", "Drug C", "Drug D"].forEach((label, index) => {
      fireEvent.change(screen.getByLabelText(`単純な群比較の条件 ${index + 1}`), {
        target: { value: label },
      });
    });
    fireEvent.change(screen.getByPlaceholderText("例：Relative protein amount"), {
      target: { value: "Relative protein amount" },
    });
    fireEvent.change(screen.getByPlaceholderText("例：culture dish、mouse"), {
      target: { value: "culture dish" },
    });
    fireEvent.click(screen.getByRole("checkbox"));
    fireEvent.click(screen.getByRole("button", { name: "条件別スプレッドシートを作る" }));

    expect(onReady.mock.calls[0]?.[0].conditions).toHaveLength(5);
    expect(onReady.mock.calls[0]?.[0].conditions[4]).toMatchObject({ label: "Drug D" });
  });
});

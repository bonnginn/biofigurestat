import { fireEvent, render, screen, within } from "@testing-library/react";
import { vi } from "vitest";

import { NewExperimentEntryHub, type NewExperimentEntryHubProps } from "./NewExperimentEntryHub";

function callbacks(): Pick<
  NewExperimentEntryHubProps,
  "onGeneral" | "onGraphOnly" | "onSurvival" | "onOrderedCurve" | "onHeatmap"
> {
  return {
    onGeneral: vi.fn(),
    onGraphOnly: vi.fn(),
    onSurvival: vi.fn(),
    onOrderedCurve: vi.fn(),
    onHeatmap: vi.fn(),
  };
}

describe("NewExperimentEntryHub", () => {
  it("shows task-oriented destinations without simple/complex or import categories", () => {
    render(<NewExperimentEntryHub {...callbacks()} />);

    expect(screen.getByRole("heading", { level: 1, name: "何から始めますか？" })).toBeVisible();
    expect(screen.getByRole("button", { name: "実験から始めるを開く" })).toBeVisible();
    expect(screen.getByRole("button", { name: "手元の表からGraphを作るを開く" })).toBeVisible();
    expect(screen.getByRole("button", { name: "生存時間（Kaplan–Meier）を開く" })).toBeVisible();
    expect(screen.getByRole("button", { name: "酵素反応・飽和カーブを開く" })).toBeVisible();
    expect(
      screen.getByText(
        "基質濃度–初速度、または時間–応答を入力します。対応するmodelを選んだ後だけfitします。",
      ),
    ).toBeVisible();
    expect(screen.getByRole("button", { name: "ヒートマップを開く" })).toBeVisible();
    const primary = screen.getByRole("heading", { name: "主な始め方" }).closest("section");
    const dedicated = screen.getByRole("heading", { name: "専用の入力形式" }).closest("section");
    expect(primary).not.toBeNull();
    expect(dedicated).not.toBeNull();
    expect(within(primary!).getAllByRole("button")).toHaveLength(2);
    expect(within(dedicated!).getAllByRole("button")).toHaveLength(3);
    expect(screen.queryByText(/simple|complex|単純|複雑/i)).toBeNull();
    expect(screen.queryByText(/特殊/)).toBeNull();
    expect(screen.queryByRole("button", { name: /取込|import/i })).toBeNull();
    expect(screen.queryByText(/D0[1-9]|D1[0-9]/)).toBeNull();
  });

  it("calls only the callback belonging to the selected task", () => {
    const props = callbacks();
    render(<NewExperimentEntryHub {...props} />);

    fireEvent.click(screen.getByRole("button", { name: "酵素反応・飽和カーブを開く" }));

    expect(props.onOrderedCurve).toHaveBeenCalledOnce();
    expect(props.onGeneral).not.toHaveBeenCalled();
    expect(props.onGraphOnly).not.toHaveBeenCalled();
    expect(props.onSurvival).not.toHaveBeenCalled();
    expect(props.onHeatmap).not.toHaveBeenCalled();
  });

  it("disables an unavailable destination, explains why, and never falls back", () => {
    const props = callbacks();
    render(
      <NewExperimentEntryHub
        {...props}
        availability={{
          survival: { available: false, reason: "専用の入力画面を準備中です。" },
        }}
      />,
    );

    const card = screen
      .getByRole("heading", { name: "生存時間（Kaplan–Meier）" })
      .closest("article");
    expect(card).not.toBeNull();
    const button = within(card!).getByRole("button", {
      name: "生存時間（Kaplan–Meier）を開く",
    });
    expect(button).toBeDisabled();
    expect(within(card!).getByText("専用の入力画面を準備中です。")).toBeVisible();
    fireEvent.click(button);
    expect(props.onSurvival).not.toHaveBeenCalled();
    expect(props.onGeneral).not.toHaveBeenCalled();
  });

  it("shows the compatibility control only when its callback is supplied", () => {
    const props = callbacks();
    const { rerender } = render(<NewExperimentEntryHub {...props} />);
    expect(screen.queryByRole("button", { name: "以前の入口を使う" })).toBeNull();

    const onCompatibility = vi.fn();
    rerender(<NewExperimentEntryHub {...props} onCompatibility={onCompatibility} />);
    fireEvent.click(screen.getByRole("button", { name: "以前の入口を使う" }));
    expect(onCompatibility).toHaveBeenCalledOnce();
  });
});

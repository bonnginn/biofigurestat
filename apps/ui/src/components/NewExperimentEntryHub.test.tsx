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
    expect(screen.getByRole("button", { name: "濃度–反応・酵素反応を開く" })).toBeVisible();
    expect(
      screen.getByText(
        "基質濃度–計算済み反応初速度と、時間–応答・飽和カーブのX/Yデータを入力します。",
      ),
    ).toBeVisible();
    expect(screen.queryByText(/dose.response/i)).toBeNull();
    expect(screen.getByRole("button", { name: "ヒートマップを開く" })).toBeVisible();
    const primary = screen.getByRole("heading", { name: "主な始め方" }).closest("section");
    const dedicated = screen
      .getByRole("heading", { name: "形式が決まっているデータ" })
      .closest("section");
    expect(primary).not.toBeNull();
    expect(dedicated).not.toBeNull();
    expect(within(primary!).getAllByRole("button")).toHaveLength(2);
    expect(within(dedicated!).getAllByRole("button")).toHaveLength(3);
    expect(screen.queryByText(/simple|complex|単純|複雑/i)).toBeNull();
    expect(screen.queryByText(/特殊/)).toBeNull();
    expect(screen.queryByRole("button", { name: /取込|import/i })).toBeNull();
    expect(screen.queryByText(/D0[1-9]|D1[0-9]/)).toBeNull();
  });

  it("makes each complete card one keyboard-focusable action and emphasizes only the default route", () => {
    render(<NewExperimentEntryHub {...callbacks()} />);

    const cards = document.querySelectorAll<HTMLElement>("[data-entry-id]");
    expect(cards).toHaveLength(5);
    for (const card of cards) {
      expect(within(card).getAllByRole("button")).toHaveLength(1);
    }
    expect(document.querySelectorAll(".new-entry-hub__card.is-recommended")).toHaveLength(1);
    expect(
      within(document.querySelector<HTMLElement>('[data-entry-id="general"]')!).getByText(
        "通常はこちら",
      ),
    ).toBeVisible();
  });

  it("calls only the callback belonging to the selected task", () => {
    const props = callbacks();
    render(<NewExperimentEntryHub {...props} />);

    fireEvent.click(screen.getByRole("button", { name: "濃度–反応・酵素反応を開く" }));

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

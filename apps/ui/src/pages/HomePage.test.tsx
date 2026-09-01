import { fireEvent, render, screen } from "@testing-library/react";
import { vi } from "vitest";

import { HomePage } from "./HomePage";

describe("HomePage workspace contract", () => {
  it("shows only the four primary project routes", () => {
    const onNavigate = vi.fn();
    const onStartFiveMinuteGuide = vi.fn();
    render(
      <HomePage
        onNavigate={onNavigate}
        onStartFiveMinuteGuide={onStartFiveMinuteGuide}
      />,
    );

    expect(screen.getByText("4つの入口")).toBeVisible();
    expect(screen.getAllByRole("button")).toHaveLength(5);
    expect(screen.getByRole("button", { name: /お気に入り/ })).toBeVisible();
    expect(screen.getByRole("button", { name: /新しい実験/ })).toBeVisible();
    expect(screen.queryByRole("button", { name: /生存時間解析/ })).toBeNull();

    fireEvent.click(screen.getByRole("button", { name: /新しい実験/ }));
    expect(onNavigate).toHaveBeenCalledWith("new-experiment");

    fireEvent.click(screen.getByRole("button", { name: "5分ガイドを開始" }));
    expect(onStartFiveMinuteGuide).toHaveBeenCalledOnce();
  });
});

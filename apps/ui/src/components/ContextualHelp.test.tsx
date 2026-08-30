import "@testing-library/jest-dom/vitest";

import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";

import type { ReadOnlyHelpProvider } from "../app/readOnlyHelpProvider";
import { ContextualHelp } from "./ContextualHelp";

describe("ContextualHelp", () => {
  it("opens an accessible local-only panel with context suggestions", () => {
    render(
      <ContextualHelp
        context={{
          surface: "statistics",
          nested: true,
          selectedMethod: "welch_t",
        }}
      />,
    );

    const trigger = screen.getByRole("button", { name: "ヘルプ" });
    fireEvent.click(trigger);

    expect(screen.getByRole("dialog", { name: "用語と解析の考え方" })).toBeVisible();
    expect(screen.getByText("データは送信されません。", { exact: false })).toBeVisible();
    expect(screen.getByRole("button", { name: /入れ子/ })).toBeVisible();
    expect(screen.getByRole("button", { name: /Welchのt検定/ })).toBeVisible();

    fireEvent.click(screen.getByRole("button", { name: /入れ子/ }));
    expect(screen.getByText(/擬似反復/)).toBeVisible();

    fireEvent.click(screen.getByRole("button", { name: "ヘルプを閉じる" }));
    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
    expect(trigger).toHaveFocus();
  });

  it("closes with Escape and restores focus", () => {
    render(<ContextualHelp context={{ surface: "graph" }} />);
    const trigger = screen.getByRole("button", { name: "ヘルプ" });
    fireEvent.click(trigger);
    expect(screen.getByRole("dialog")).toBeVisible();
    expect(document.body.style.overflow).toBe("hidden");
    fireEvent.keyDown(document, { key: "Escape" });
    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
    expect(document.body.style.overflow).toBe("");
    expect(trigger).toHaveFocus();
  });

  it("closes from the footer or by clicking the backdrop", () => {
    render(<ContextualHelp context={{ surface: "graph" }} />);
    const trigger = screen.getByRole("button", { name: "ヘルプ" });

    fireEvent.click(trigger);
    fireEvent.click(screen.getByRole("button", { name: "閉じる" }));
    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();

    fireEvent.click(trigger);
    const backdrop = screen.getByRole("dialog").parentElement;
    expect(backdrop).not.toBeNull();
    fireEvent.pointerDown(backdrop!);
    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
  });

  it("uses the Help trigger as an open-close toggle", () => {
    render(<ContextualHelp context={{ surface: "home" }} />);
    const trigger = screen.getByRole("button", { name: "ヘルプ" });
    fireEvent.click(trigger);
    expect(screen.getByRole("dialog")).toBeVisible();
    fireEvent.click(trigger);
    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
  });

  it("passes only the read-only request to the configured provider", async () => {
    const explain = vi.fn<ReadOnlyHelpProvider["explain"]>().mockResolvedValue({
      providerId: "mock",
      advisory: true,
      answer: "説明だけを返します。",
      topicIds: ["biological-n"],
    });
    const provider: ReadOnlyHelpProvider = {
      id: "mock",
      processing: "local",
      explain,
    };
    render(
      <ContextualHelp
        context={{ surface: "data", experimentalUnit: "dish", biologicalN: 3 }}
        provider={provider}
        initialTopicId="biological-n"
      />,
    );

    fireEvent.click(screen.getByRole("button", { name: "ヘルプ" }));
    fireEvent.click(screen.getByRole("button", { name: "文脈に合わせて説明" }));

    await waitFor(() => expect(screen.getByText("説明だけを返します。")).toBeVisible());
    expect(explain).toHaveBeenCalledWith({
      locale: "ja",
      context: { surface: "data", experimentalUnit: "dish", biologicalN: 3 },
      topicId: "biological-n",
    });
  });

  it("cannot invoke a future external provider before explicit opt-in", () => {
    const explain = vi.fn<ReadOnlyHelpProvider["explain"]>();
    render(
      <ContextualHelp
        context={{ surface: "statistics" }}
        provider={{ id: "future", processing: "external", explain }}
      />,
    );

    fireEvent.click(screen.getByRole("button", { name: "ヘルプ" }));

    expect(screen.getByText(/明示的にopt-in/)).toBeVisible();
    expect(screen.getByRole("button", { name: "文脈に合わせて説明" })).toBeDisabled();
    expect(explain).not.toHaveBeenCalled();
  });
});

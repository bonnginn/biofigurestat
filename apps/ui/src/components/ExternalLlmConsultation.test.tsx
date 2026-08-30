import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";

import { ExternalLlmConsultation } from "./ExternalLlmConsultation";

describe("ExternalLlmConsultation", () => {
  it("states the external and no-auto-send boundary before revealing the prompt", () => {
    render(<ExternalLlmConsultation prompt="相談内容" placement="experiment_setup" />);

    expect(screen.getByText(/アプリ内AIではありません/)).toBeVisible();
    expect(screen.getByText(/自動送信しません/)).toBeVisible();
    expect(screen.queryByLabelText("外部LLMへ渡す相談文")).toBeNull();

    fireEvent.click(screen.getByRole("button", { name: "外部LLMに相談する" }));
    expect(screen.getByLabelText("外部LLMへ渡す相談文")).toHaveValue("相談内容");
    expect(screen.getByText(/アプリから外部サイトを開いたり送信したりしません/)).toBeVisible();
    expect(screen.getByRole("link", { name: "BioFigureStat使用ガイドを開く" })).toBeVisible();
  });

  it("copies only after the researcher asks for a copy", async () => {
    const writeText = vi.fn().mockResolvedValue(undefined);
    Object.defineProperty(navigator, "clipboard", {
      configurable: true,
      value: { writeText },
    });
    render(<ExternalLlmConsultation prompt="確認済み相談文" placement="statistics" />);

    expect(writeText).not.toHaveBeenCalled();
    fireEvent.click(screen.getByRole("button", { name: "外部LLMに相談する" }));
    fireEvent.click(screen.getByRole("button", { name: "相談文をコピー" }));

    expect(writeText).toHaveBeenCalledWith("確認済み相談文");
    await waitFor(() =>
      expect(screen.getByRole("status")).toHaveTextContent("相談文をコピーしました"),
    );
  });

  it("turns a reviewed LLM answer into a manual improvement-request copy", async () => {
    const writeText = vi.fn().mockResolvedValue(undefined);
    Object.defineProperty(navigator, "clipboard", {
      configurable: true,
      value: { writeText },
    });
    render(<ExternalLlmConsultation prompt="相談内容" placement="experiment_setup" />);

    fireEvent.click(screen.getByRole("button", { name: "外部LLMに相談する" }));
    fireEvent.click(screen.getByText("相談結果から改善要望を作る"));
    const copyButton = screen.getByRole("button", { name: "実装要望をコピー" });
    expect(copyButton).toBeDisabled();

    fireEvent.change(screen.getByLabelText("外部LLMの回答（任意）"), {
      target: { value: "質問を短くするとよい" },
    });
    fireEvent.change(screen.getByLabelText("実装してほしい内容"), {
      target: { value: "選択肢の違いを例で示してほしい" },
    });
    fireEvent.click(copyButton);

    await waitFor(() => expect(writeText).toHaveBeenCalledTimes(1));
    const copied = String(writeText.mock.calls[0]?.[0]);
    expect(copied).toContain("選択肢の違いを例で示してほしい");
    expect(copied).toContain("質問を短くするとよい");
    expect(copied).toContain("参考情報・未検証");
    expect(copied).not.toContain("相談内容");
    expect(screen.getByRole("status")).toHaveTextContent("実装要望をコピーしました");
  });
});

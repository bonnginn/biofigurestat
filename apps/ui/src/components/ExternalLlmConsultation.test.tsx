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
});

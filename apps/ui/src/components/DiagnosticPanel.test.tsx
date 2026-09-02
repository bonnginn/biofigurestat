import { act, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { recordDiagnosticError, resetDiagnosticsForTest } from "../app/diagnostics";
import { openProblemReportWithPrefill } from "../app/problemReports";
import { DiagnosticPanel } from "./DiagnosticPanel";

describe("DiagnosticPanel", () => {
  beforeEach(() => {
    resetDiagnosticsForTest();
    localStorage.clear();
    vi.unstubAllEnvs();
    Object.assign(navigator, { clipboard: { writeText: vi.fn(async () => undefined) } });
  });

  it("requires explicit preview and shows every field before transmission", () => {
    const fetcher = vi.spyOn(globalThis, "fetch");
    render(<DiagnosticPanel route="home" project={null} />);
    fireEvent.click(screen.getByRole("button", { name: "問題を報告" }));
    expect(screen.getByLabelText("不具合報告").parentElement).toBe(document.body);
    expect(screen.getByText(/研究情報を書かないでください/)).toBeVisible();
    expect(screen.getByText(/自動送信はしません/)).toBeVisible();
    expect(screen.getByRole("button", { name: "送信内容を確認" })).toBeDisabled();
    fireEvent.change(screen.getByLabelText("何をしようとしたか"), {
      target: { value: "保存ボタンを押した" },
    });
    fireEvent.change(screen.getByLabelText("何が起きたか"), {
      target: { value: "完了表示が出なかった" },
    });
    fireEvent.click(screen.getByRole("button", { name: "送信内容を確認" }));
    expect(screen.getByText("送信内容の確認")).toBeVisible();
    expect(screen.getByText("保存ボタンを押した")).toBeVisible();
    expect(screen.getByText("添付しない")).toBeVisible();
    expect(screen.getByRole("button", { name: "この内容を送信" })).toBeVisible();
    expect(fetcher).not.toHaveBeenCalled();
  });

  it("opens with an external-LLM improvement request prefilled but unsent", () => {
    const fetcher = vi.spyOn(globalThis, "fetch");
    render(<DiagnosticPanel route="home" project={null} />);

    act(() => {
      openProblemReportWithPrefill({
        type: "feature_request",
        attempted: "相談結果から改善したい",
        observed: "比較目的の説明を追加してほしい",
      });
    });

    expect(screen.getByLabelText("不具合報告")).toBeVisible();
    expect(screen.getByLabelText("何をしようとしたか")).toHaveValue("相談結果から改善したい");
    expect(screen.getByLabelText("何が起きたか")).toHaveValue("比較目的の説明を追加してほしい");
    expect(screen.getByLabelText("種類")).toHaveValue("feature_request");
    expect(fetcher).not.toHaveBeenCalled();
  });

  it("includes privacy-reduced diagnostics only after selection", () => {
    render(<DiagnosticPanel route="home" project={null} />);
    fireEvent.click(screen.getByRole("button", { name: "問題を報告" }));
    fireEvent.change(screen.getByLabelText("何をしようとしたか"), {
      target: { value: "Graphを開いた" },
    });
    fireEvent.change(screen.getByLabelText("何が起きたか"), {
      target: { value: "表示が止まった" },
    });
    fireEvent.click(screen.getByRole("checkbox", { name: /privacy-reduced診断を添付する/u }));
    fireEvent.click(screen.getByRole("button", { name: "送信内容を確認" }));
    const preview = screen.getByText(/"schemaVersion": "1.0.0"/).textContent ?? "";
    expect(preview).toContain('"route": "home"');
    expect(preview).not.toContain("project");
    expect(preview).not.toContain("measurement");
  });

  it("keeps the report available when submission fails", async () => {
    vi.stubEnv("VITE_PROBLEM_REPORT_ENDPOINT", "https://collector.example/v1/problem-reports");
    vi.stubEnv("VITE_PROBLEM_REPORT_INGEST_KEY", "public-report-key_123456");
    vi.spyOn(globalThis, "fetch").mockRejectedValue(new Error("offline"));
    render(<DiagnosticPanel route="home" project={null} />);
    fireEvent.click(screen.getByRole("button", { name: "問題を報告" }));
    fireEvent.change(screen.getByLabelText("何をしようとしたか"), {
      target: { value: "保存した" },
    });
    fireEvent.change(screen.getByLabelText("何が起きたか"), { target: { value: "失敗した" } });
    fireEvent.click(screen.getByRole("button", { name: "送信内容を確認" }));
    fireEvent.click(screen.getByRole("button", { name: "この内容を送信" }));
    await waitFor(() => expect(screen.getByRole("status")).toHaveTextContent("入力内容は保持"));
    expect(screen.getByText("保存した")).toBeVisible();
  });

  it("keeps local diagnostic copy as a separate explicit action", async () => {
    render(<DiagnosticPanel route="home" project={null} />);
    fireEvent.click(screen.getByRole("button", { name: "問題を報告" }));
    fireEvent.click(screen.getByText("ローカル診断レポートをコピー・保存"));
    fireEvent.click(screen.getByRole("button", { name: "診断レポートをコピー" }));
    await waitFor(() => expect(navigator.clipboard.writeText).toHaveBeenCalledOnce());
    expect(await screen.findByRole("status")).toHaveTextContent("自動送信はしていません");
  });

  it("includes privacy-safe technical error classifications only after explicit selection", async () => {
    recordDiagnosticError("ENGINE_EXECUTION_FAILED", "native bridge rejected the request");
    render(<DiagnosticPanel route="new-experiment" project={null} />);
    fireEvent.click(screen.getByRole("button", { name: "問題を報告" }));
    fireEvent.click(screen.getByText("ローカル診断レポートをコピー・保存"));

    fireEvent.click(screen.getByRole("button", { name: "診断レポートをコピー" }));
    await waitFor(() => expect(navigator.clipboard.writeText).toHaveBeenCalledOnce());
    const ordinary = JSON.parse(
      String(vi.mocked(navigator.clipboard.writeText).mock.calls[0]?.[0]),
    ) as Record<string, unknown>;
    expect(ordinary.technicalErrors).toBeUndefined();

    fireEvent.click(
      screen.getByRole("checkbox", { name: /技術的なエラー分類を含める/u }),
    );
    fireEvent.click(screen.getByRole("button", { name: "診断レポートをコピー" }));
    await waitFor(() => expect(navigator.clipboard.writeText).toHaveBeenCalledTimes(2));
    const expanded = JSON.parse(
      String(vi.mocked(navigator.clipboard.writeText).mock.calls[1]?.[0]),
    ) as {
      privacy: { technicalDetailsIncluded: boolean };
      technicalErrors: Array<{ code: string; detail: string }>;
    };
    expect(expanded.privacy.technicalDetailsIncluded).toBe(true);
    expect(expanded.technicalErrors).toEqual([
      expect.objectContaining({ code: "ENGINE_EXECUTION_FAILED", detail: "NonErrorThrow" }),
    ]);
  });
});

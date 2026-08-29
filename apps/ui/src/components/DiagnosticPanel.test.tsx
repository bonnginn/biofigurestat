import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";

import { resetDiagnosticsForTest } from "../app/diagnostics";
import { DiagnosticPanel } from "./DiagnosticPanel";

describe("DiagnosticPanel", () => {
  beforeEach(() => {
    resetDiagnosticsForTest();
    Object.assign(navigator, { clipboard: { writeText: vi.fn(async () => undefined) } });
  });

  it("previews privacy boundaries and copies only after an explicit action", async () => {
    render(<DiagnosticPanel route="home" project={null} />);
    fireEvent.click(screen.getByRole("button", { name: "問題を報告" }));
    expect(screen.getByLabelText("診断情報").parentElement).toBe(document.body);
    expect(screen.getByText(/raw測定値、実験名・条件名/)).toBeVisible();
    expect(screen.getByText(/自動送信/)).toBeVisible();
    expect(screen.getByText(/報告フォームがまだ設定されていません/)).toBeVisible();
    expect(navigator.clipboard.writeText).not.toHaveBeenCalled();

    fireEvent.click(screen.getByRole("button", { name: "診断レポートをコピー" }));
    await waitFor(() => expect(navigator.clipboard.writeText).toHaveBeenCalledOnce());
    const report = String(vi.mocked(navigator.clipboard.writeText).mock.calls[0]?.[0]);
    expect(report).toContain('"rawMeasurementsIncluded": false');
    expect(report).toContain('"automaticUpload": false');
    expect(await screen.findByRole("status")).toHaveTextContent("自動送信はしていません");
  });

  it("closes from an explicit control or an outside click", () => {
    const { rerender } = render(<DiagnosticPanel route="home" project={null} />);
    fireEvent.click(screen.getByRole("button", { name: "問題を報告" }));
    fireEvent.click(screen.getByRole("button", { name: "診断を閉じる" }));
    expect(screen.queryByLabelText("診断情報")).toBeNull();

    rerender(<DiagnosticPanel route="home" project={null} />);
    fireEvent.click(screen.getByRole("button", { name: "問題を報告" }));
    fireEvent.pointerDown(document.body);
    expect(screen.queryByLabelText("診断情報")).toBeNull();
  });

  it("does not treat interactions inside the portaled panel as outside clicks", () => {
    render(<DiagnosticPanel route="home" project={null} />);
    fireEvent.click(screen.getByRole("button", { name: "問題を報告" }));
    fireEvent.pointerDown(screen.getByText("詳細な診断情報を含める"));
    expect(screen.getByLabelText("診断情報")).toBeVisible();
  });
});

import { beforeEach, describe, expect, it, vi } from "vitest";
import { runGraphClipboardCopy, runGraphUserExport } from "./experimentGraphUserExports";

const diagnostic = vi.hoisted(() => vi.fn());
vi.mock("../../app/diagnostics", () => ({ recordDiagnosticError: diagnostic }));

describe("Graph user export feedback", () => {
  beforeEach(() => diagnostic.mockClear());

  it("reports saved output and keeps native cancellation silent", async () => {
    const setFeedback = vi.fn();
    await runGraphUserExport("svg", async () => ({ status: "saved" }), setFeedback);
    expect(setFeedback).toHaveBeenLastCalledWith({ kind: "success", text: "SVGを保存しました。" });

    setFeedback.mockClear();
    await runGraphUserExport("png", async () => ({ status: "cancelled" }), setFeedback);
    expect(setFeedback).toHaveBeenCalledOnce();
    expect(setFeedback).toHaveBeenCalledWith(null);
    expect(diagnostic).not.toHaveBeenCalled();
  });

  it("records export and clipboard failures without throwing into the workspace", async () => {
    const exportError = new Error("save failed");
    const setFeedback = vi.fn();
    await runGraphUserExport(
      "csv",
      async () => ({ status: "failed", error: exportError }),
      setFeedback,
    );
    expect(diagnostic).toHaveBeenCalledWith("GRAPH_EXPORT_FAILED", exportError);
    expect(setFeedback).toHaveBeenLastCalledWith({
      kind: "error",
      text: "CSVを保存できませんでした。グラフとデータは保持されています。",
    });

    const copyError = new Error("clipboard failed");
    const setStatus = vi.fn();
    await runGraphClipboardCopy(async () => Promise.reject(copyError), setStatus);
    expect(diagnostic).toHaveBeenLastCalledWith("GRAPH_EXPORT_FAILED", copyError);
    expect(setStatus).toHaveBeenLastCalledWith(
      "この環境ではクリップボードへコピーできませんでした。SVG書き出しを利用してください。",
    );
  });

  it("keeps the clipboard format-specific success messages", async () => {
    const setStatus = vi.fn();
    await runGraphClipboardCopy(async () => "svg", setStatus);
    expect(setStatus).toHaveBeenLastCalledWith("ベクター形式でコピーしました。");
    await runGraphClipboardCopy(async () => "png", setStatus);
    expect(setStatus).toHaveBeenLastCalledWith("透明背景のPNGでコピーしました。");
    await runGraphClipboardCopy(async () => "text", setStatus);
    expect(setStatus).toHaveBeenLastCalledWith("SVGテキストでコピーしました。");
  });
});

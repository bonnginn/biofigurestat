import { beforeEach, describe, expect, it, vi } from "vitest";
import {
  runGraphClipboardCopy,
  runGraphClipboardCopyWithFeedback,
  runGraphUserExport,
} from "./experimentGraphUserExports";

const diagnostic = vi.hoisted(() => vi.fn());
vi.mock("../../app/diagnostics", () => ({ recordDiagnosticError: diagnostic }));

describe("Graph user export feedback", () => {
  beforeEach(() => diagnostic.mockClear());

  it("reports saved output and keeps native cancellation silent", async () => {
    const setFeedback = vi.fn();
    await runGraphUserExport("svg", "ja", async () => ({ status: "saved" }), setFeedback);
    expect(setFeedback).toHaveBeenLastCalledWith({ kind: "success", text: "SVGを保存しました。" });

    setFeedback.mockClear();
    await runGraphUserExport("png", "ja", async () => ({ status: "cancelled" }), setFeedback);
    expect(setFeedback).toHaveBeenCalledOnce();
    expect(setFeedback).toHaveBeenCalledWith(null);
    expect(diagnostic).not.toHaveBeenCalled();

    await runGraphUserExport("review", "en", async () => ({ status: "saved" }), setFeedback);
    expect(setFeedback).toHaveBeenLastCalledWith({
      kind: "success",
      text: "Saved the analysis review set.",
    });
  });

  it("records export and clipboard failures without throwing into the workspace", async () => {
    const exportError = new Error("save failed");
    const setFeedback = vi.fn();
    await runGraphUserExport(
      "csv",
      "ja",
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
    await runGraphClipboardCopy("ja", async () => Promise.reject(copyError), setStatus);
    expect(diagnostic).toHaveBeenLastCalledWith("GRAPH_EXPORT_FAILED", copyError);
    expect(setStatus).toHaveBeenLastCalledWith(
      "この環境ではクリップボードへコピーできませんでした。SVG書き出しを利用してください。",
    );
  });

  it("keeps the clipboard format-specific success messages", async () => {
    const setStatus = vi.fn();
    await runGraphClipboardCopy("ja", async () => "svg", setStatus);
    expect(setStatus).toHaveBeenLastCalledWith("ベクター形式でコピーしました。");
    await runGraphClipboardCopy("ja", async () => "png", setStatus);
    expect(setStatus).toHaveBeenLastCalledWith("透明背景のPNGでコピーしました。");
    await runGraphClipboardCopy("ja", async () => "text", setStatus);
    expect(setStatus).toHaveBeenLastCalledWith("SVGテキストでコピーしました。");
  });

  it("keeps export and clipboard feedback in English mode", async () => {
    const setFeedback = vi.fn();
    await runGraphUserExport("png", "en", async () => ({ status: "saved" }), setFeedback);
    expect(setFeedback).toHaveBeenLastCalledWith({
      kind: "success",
      text: "Exported the current Graph as a white-background PNG.",
    });

    const setStatus = vi.fn();
    await runGraphClipboardCopy(
      "en",
      async () => Promise.reject(new Error("コピー失敗")),
      setStatus,
    );
    expect(setStatus).toHaveBeenLastCalledWith(
      "Could not copy to the clipboard in this environment. Use SVG export instead.",
    );
  });

  it("supports legacy surface copy while retaining success and error roles", async () => {
    const setFeedback = vi.fn();
    await runGraphClipboardCopyWithFeedback("ja", async () => "png", setFeedback, {
      png: "PNGでコピーしました。",
    });
    expect(setFeedback).toHaveBeenLastCalledWith({
      kind: "success",
      text: "PNGでコピーしました。",
    });

    const failure = new Error("legacy copy failed");
    await runGraphClipboardCopyWithFeedback(
      "ja",
      async () => Promise.reject(failure),
      setFeedback,
      { failed: "従来の失敗表示" },
      false,
    );
    expect(setFeedback).toHaveBeenLastCalledWith({ kind: "error", text: "従来の失敗表示" });
    expect(diagnostic).not.toHaveBeenCalledWith("GRAPH_EXPORT_FAILED", failure);
  });
});

import { describe, expect, it, vi } from "vitest";
import { createBenchmarkGraphCapturePayload } from "./experimentGraphBenchmarkCapture";

describe("benchmark Graph capture payload", () => {
  it("renders once and fingerprints the SVG, PNG, and analysis state independently", async () => {
    const png = new Blob(["png"], { type: "image/png" });
    const renderPng = vi.fn(async () => png);
    const sha256 = vi.fn(async (value: string | Blob) =>
      typeof value === "string" ? `hash:${value}` : "hash:png",
    );
    const encodeBase64 = vi.fn(async () => "cG5n");

    await expect(
      createBenchmarkGraphCapturePayload(
        {
          svgText: "<svg />",
          width: 900,
          height: 520,
          analysisState: "analysis.state",
        },
        { renderPng, sha256, encodeBase64 },
      ),
    ).resolves.toEqual({
      png,
      pngBase64: "cG5n",
      svgSha256: "hash:<svg />",
      pngSha256: "hash:png",
      analysisStateFingerprint: "hash:analysis.state",
    });
    expect(renderPng).toHaveBeenCalledOnce();
    expect(renderPng).toHaveBeenCalledWith("<svg />", 900, 520);
    expect(sha256.mock.calls.map(([value]) => value)).toEqual([
      "<svg />",
      png,
      "analysis.state",
    ]);
    expect(encodeBase64).toHaveBeenCalledWith(png);
  });

  it("does not hash or encode when PNG rendering fails", async () => {
    const error = new Error("render failed");
    const sha256 = vi.fn(async () => "unused");
    const encodeBase64 = vi.fn(async () => "unused");

    await expect(
      createBenchmarkGraphCapturePayload(
        { svgText: "<svg />", width: 1, height: 1, analysisState: "analysis" },
        {
          renderPng: vi.fn(async () => Promise.reject(error)),
          sha256,
          encodeBase64,
        },
      ),
    ).rejects.toBe(error);
    expect(sha256).not.toHaveBeenCalled();
    expect(encodeBase64).not.toHaveBeenCalled();
  });
});

import { beforeEach, describe, expect, it, vi } from "vitest";

const tauri = vi.hoisted(() => ({
  invoke: vi.fn(),
  save: vi.fn(),
}));

vi.mock("@tauri-apps/api/core", () => ({
  invoke: tauri.invoke,
  isTauri: () => true,
}));

vi.mock("@tauri-apps/plugin-dialog", () => ({
  save: tauri.save,
}));

import { saveExportBytes, saveExportText } from "./graphExport";

describe("native graph export", () => {
  beforeEach(() => {
    tauri.invoke.mockReset();
    tauri.save.mockReset();
  });

  it("asks for an SVG target and writes the encoded bytes through the native command", async () => {
    tauri.save.mockResolvedValue("C:\\Figures\\result.svg");
    tauri.invoke.mockResolvedValue(undefined);

    await expect(
      saveExportText("<svg>α</svg>", "result.svg", "image/svg+xml;charset=utf-8"),
    ).resolves.toBe("saved");

    expect(tauri.save).toHaveBeenCalledWith({
      title: "書き出し先を選択",
      defaultPath: "result.svg",
      filters: [{ name: "SVG image", extensions: ["svg"] }],
    });
    const expectedBytes = [...new TextEncoder().encode("<svg>α</svg>")];
    expect(tauri.invoke).toHaveBeenCalledWith("write_export_file", {
      target: "C:\\Figures\\result.svg",
      bytes: expectedBytes,
    });
  });

  it("does not write when the researcher cancels the save dialog", async () => {
    tauri.save.mockResolvedValue(null);

    await expect(
      saveExportText("<svg/>", "result.svg", "image/svg+xml"),
    ).resolves.toBe("cancelled");
    expect(tauri.invoke).not.toHaveBeenCalled();
  });

  it("uses the same native Save path for CSV data", async () => {
    tauri.save.mockResolvedValue("C:\\Figures\\result.csv");
    tauri.invoke.mockResolvedValue(undefined);

    await expect(saveExportText("x,y\n1,2\n", "result.csv", "text/csv;charset=utf-8"))
      .resolves.toBe("saved");
    expect(tauri.save).toHaveBeenCalledWith(expect.objectContaining({
      defaultPath: "result.csv",
      filters: [{ name: "CSV data", extensions: ["csv"] }],
    }));
    expect(tauri.invoke).toHaveBeenCalledWith(
      "write_export_file",
      expect.objectContaining({ target: "C:\\Figures\\result.csv" }),
    );
  });

  it("uses the native Save dialog for rendered PNG bytes", async () => {
    tauri.save.mockResolvedValue("C:\\Figures\\ordered-curve.png");
    tauri.invoke.mockResolvedValue(undefined);

    await expect(
      saveExportBytes(new Uint8Array([137, 80, 78, 71]), "ordered-curve.png", "image/png"),
    ).resolves.toBe("saved");

    expect(tauri.save).toHaveBeenCalledWith({
      title: "書き出し先を選択",
      defaultPath: "ordered-curve.png",
      filters: [{ name: "PNG image", extensions: ["png"] }],
    });
    expect(tauri.invoke).toHaveBeenCalledWith("write_export_file", {
      target: "C:\\Figures\\ordered-curve.png",
      bytes: [137, 80, 78, 71],
    });
  });
});

import { createRef } from "react";
import { act, fireEvent, render, screen } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
const exports = vi.hoisted(() => ({ copy: vi.fn(), png: vi.fn(), save: vi.fn() }));
vi.mock("../../app/graphExport", () => ({
  copyGraphToClipboard: exports.copy,
  exportGraphPng: exports.png,
  saveExportText: exports.save,
  serializeGraphSvg: () => "<svg/>",
  ExportCancelledError: class extends Error {},
}));
import { GraphExportActions } from "./GraphExportActions";
function show(name = "figure") {
  const svgRef = createRef<SVGSVGElement>();
  svgRef.current = document.createElementNS("http://www.w3.org/2000/svg", "svg");
  const feedback = vi.fn();
  render(<GraphExportActions svgRef={svgRef} fileStem={name} onFeedback={feedback} />);
  return feedback;
}
describe("graph export action lifecycle", () => {
  beforeEach(() => {
    exports.copy.mockReset();
    exports.png.mockReset();
    exports.save.mockReset();
  });
  it("keeps one export active and releases the controls after cancellation", async () => {
    let done!: (value: "cancelled") => void;
    exports.save.mockReturnValue(
      new Promise((resolve) => {
        done = resolve;
      }),
    );
    const feedback = show();
    fireEvent.click(screen.getByRole("button", { name: "SVGを書き出す" }));
    fireEvent.click(screen.getByRole("button", { name: "SVGを書き出す" }));
    fireEvent.click(screen.getByRole("button", { name: "PNGを書き出す" }));
    expect(exports.save).toHaveBeenCalledTimes(1);
    expect(exports.png).not.toHaveBeenCalled();
    expect(screen.getByRole("status")).toHaveTextContent("書き出しています");
    await act(async () => {
      done("cancelled");
    });
    expect(screen.getByRole("button", { name: "PNGを書き出す" })).toBeEnabled();
    expect(feedback).toHaveBeenCalledTimes(1); // cancellation is not a success
  });
  it("releases controls and offers retry after a failed copy", async () => {
    exports.copy.mockRejectedValue(new Error("unavailable"));
    const feedback = show();
    await act(async () => {
      fireEvent.click(screen.getByRole("button", { name: "グラフをコピー" }));
    });
    expect(feedback).toHaveBeenLastCalledWith(expect.objectContaining({ kind: "error" }));
    expect(screen.getByRole("button", { name: "SVGを書き出す" })).toBeEnabled();
    exports.save.mockResolvedValue("saved");
    await act(async () => {
      fireEvent.click(screen.getByRole("button", { name: "SVGを書き出す" }));
    });
    expect(feedback).toHaveBeenLastCalledWith(expect.objectContaining({ kind: "success" }));
  });
  it.each([
    ["CON", "_CON.svg"],
    ["ＡＵＸ", "_ＡＵＸ.svg"],
    ["figure.  ", "figure.svg"],
  ])(
    "protects the native suggested filename for %s without renaming the graph",
    async (name, expected) => {
      exports.save.mockResolvedValue("saved");
      show(name);
      await act(async () => {
        fireEvent.click(screen.getByRole("button", { name: "SVGを書き出す" }));
      });
      expect(exports.save).toHaveBeenCalledWith("<svg/>", expected, "image/svg+xml;charset=utf-8");
    },
  );
});

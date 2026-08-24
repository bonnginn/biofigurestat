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
    fireEvent.click(screen.getByRole("button", { name: "診断" }));
    expect(screen.getByText(/raw測定値、実験名・条件名/)).toBeVisible();
    expect(screen.getByText(/自動送信/)).toBeVisible();
    expect(navigator.clipboard.writeText).not.toHaveBeenCalled();

    fireEvent.click(screen.getByRole("button", { name: "Copy diagnostic report" }));
    await waitFor(() => expect(navigator.clipboard.writeText).toHaveBeenCalledOnce());
    const report = String(vi.mocked(navigator.clipboard.writeText).mock.calls[0]?.[0]);
    expect(report).toContain('"rawMeasurementsIncluded": false');
    expect(report).toContain('"automaticUpload": false');
    expect(await screen.findByRole("status")).toHaveTextContent("自動送信はしていません");
  });
});

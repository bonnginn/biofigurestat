import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { buildStructureContract, importForSelectedSurface } from "@lsaa/adaptive-input";
import { vi } from "vitest";

import type { AnalysisRunner } from "../../app/analysisClient";
import { createAdaptiveWorkspace } from "../../app/adaptiveWorkspace";
import { ExperimentGraphWorkbench } from "./ExperimentGraphWorkbench";

describe("native handoff Case 3 statistics UX", () => {
  it("confirms run/source independence, retains dish n, and routes structure correction", async () => {
    const now = "2026-08-28T00:00:00.000Z";
    const contract = buildStructureContract({
      experimentName: "Cells nested in dishes",
      experimentDescription:
        "The experimental unit, nested Cell observations, and Treatment are explicit.",
      experimentalUnitLabel: "culture dish",
      identityLabel: "Dish ID",
      readoutLabel: "Mitochondrial circularity",
      readoutRepresentation: "scalar",
      factorName: "Treatment",
      factorLevels: ["Vehicle", "Drug"],
      sameIdentityAcrossConditions: false,
      nestedObservationLabel: "Cell",
    });
    const rows = [
      ["V1", "Vehicle", [0.78, 0.82, 0.8, 0.75, 0.84]],
      ["V2", "Vehicle", [0.81, 0.79, 0.85, 0.77, 0.83]],
      ["V3", "Vehicle", [0.76, 0.8, 0.78, 0.82, 0.79]],
      ["V4", "Vehicle", [0.83, 0.86, 0.81, 0.84, 0.8]],
      ["D1", "Drug", [0.55, 0.61, 0.58, 0.63, 0.57]],
      ["D2", "Drug", [0.6, 0.56, 0.62, 0.59, 0.64]],
      ["D3", "Drug", [0.54, 0.57, 0.59, 0.55, 0.6]],
      ["D4", "Drug", [0.61, 0.65, 0.63, 0.58, 0.62]],
    ] as const;
    const imported = importForSelectedSurface(
      contract,
      [
        "Dish ID\tCell ID\tTreatment\tMitochondrial circularity",
        ...rows.flatMap(([dish, condition, values]) =>
          values.map(
            (value, index) => `${dish}\t${dish}-Cell-${index + 1}\t${condition}\t${value}`,
          ),
        ),
      ].join("\n"),
      "clipboard",
      "case3-ui",
      now,
    );
    const workspace = createAdaptiveWorkspace({
      contract,
      observations: imported.observations,
      mapping: imported.mapping,
      lineage: imported.lineage,
      now,
    });
    const onAnalysisCorrection = vi.fn();
    const analysisRunner = vi.fn<AnalysisRunner>(async (request) => ({
      protocolVersion: request.protocolVersion,
      requestId: request.requestId,
      status: "ok",
      engine: { name: "lsaa-python", version: "test", packages: {} },
      estimates: [],
      tests: [],
      diagnostics: [],
      warnings: [],
      completedAt: now,
    }));

    render(
      <ExperimentGraphWorkbench
        draft={workspace.draft!}
        cells={workspace.cells}
        workspaceMode="statistics"
        analysisRunner={analysisRunner}
        onAnalysisCorrection={onAnalysisCorrection}
        onClose={vi.fn()}
      />,
    );

    expect(screen.getByText(/Vehicle: 4、Drug: 4/)).toBeVisible();
    const runButton = screen.getByRole("button", { name: "選択した解析を実行" });
    expect(runButton).toBeDisabled();
    const confirmation = screen.getByRole("checkbox", {
      name: /同じrun\/source preparationから分けた組ではなく/,
    });
    fireEvent.click(screen.getByText("確認内容の詳細"));
    fireEvent.click(screen.getByRole("button", { name: "共通材料・実験回を確認" }));
    expect(onAnalysisCorrection).toHaveBeenCalledWith(
      expect.objectContaining({ target: "experiment_structure" }),
    );

    fireEvent.click(confirmation);
    fireEvent.click(runButton);
    await waitFor(() => expect(analysisRunner).toHaveBeenCalledTimes(1));
    const request = analysisRunner.mock.calls[0]![0];
    expect(request).toMatchObject({ templateId: "D01", method: "welch_t" });
    expect(request.observations).toHaveLength(8);
    expect(
      new Set(request.observations.map(({ experimentalUnitId }) => experimentalUnitId)).size,
    ).toBe(8);
  });
});

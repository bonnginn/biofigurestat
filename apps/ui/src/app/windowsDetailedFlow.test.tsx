import { act, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import type { AnalysisEngineRequest, AnalysisEngineResult } from "@lsaa/analysis-contracts";
import { ProjectStateSchema, type ProjectState } from "@lsaa/project";
import { nestedContract, nestedObservations } from "../test/windowsDetailedFixture";
import { createAdaptiveWorkspace } from "./adaptiveWorkspace";
import { rehydrateExperimentWorkspace } from "./experimentWorkspaceProject";
import { ExperimentWorkspace } from "../pages/ExperimentWorkspace";

const now = "2026-10-07T18:10:00.000Z";
describe("Windows detailed input to graph, analysis request, and project roundtrip", () => {
  it("preserves parent n, child identity, immutable source and result history across reviewed paste and Undo/Redo", async () => {
    const mapping = {
      schemaVersion: "0.1.0" as const,
      sourceLabel: "synthetic.tsv",
      delimiter: "tab" as const,
      headerRow: 1,
      columns: {
        Dish: {
          role: "identity" as const,
          semanticKey: "dish_id",
          fixedFactors: {},
          fixedAxes: {},
        },
        Cell: {
          role: "identity" as const,
          semanticKey: "cell_id",
          fixedFactors: {},
          fixedAxes: {},
        },
        Condition: {
          role: "factor" as const,
          semanticKey: "condition",
          fixedFactors: {},
          fixedAxes: {},
        },
        Signal: { role: "value" as const, semanticKey: "signal", fixedFactors: {}, fixedAxes: {} },
      },
      confirmedAt: now,
    };
    const lineage = {
      schemaVersion: "0.1.0" as const,
      sourceKind: "tsv" as const,
      sourceLabel: "synthetic.tsv",
      importedAt: now,
      rawText:
        "Dish\tCell\tCondition\tSignal\n" +
        nestedObservations
          .map(
            (o) =>
              `${o.identities.dish_id}\t${o.identities.cell_id}\t${o.factors.condition}\t${o.values.signal}`,
          )
          .join("\n"),
      sha256: null,
      transformations: ["confirmed_column_mapping"],
    };
    const workspace = createAdaptiveWorkspace({
      contract: nestedContract,
      observations: nestedObservations,
      mapping,
      lineage,
      now,
    });
    expect(workspace.status).toBe("ready");
    const saveProject = vi.fn(async (state: ProjectState, target?: string) => ({
      state,
      target: target ?? "synthetic-source-only.lsa",
    }));
    const analysisRunner = vi.fn(
      async (request: AnalysisEngineRequest): Promise<AnalysisEngineResult> => ({
        protocolVersion: request.protocolVersion,
        requestId: request.requestId,
        status: "ok",
        engine: { name: "synthetic-contract-stub", version: "0.1.0", packages: {} },
        estimates: [],
        tests: [
          {
            name: "welch_two_sample_t_test",
            statisticName: "t",
            statistic: 1,
            degreesOfFreedom: [2],
            pValue: 0.12,
            adjustedPValue: null,
            effectSizeName: null,
            effectSize: null,
          },
        ],
        diagnostics: [],
        warnings: [],
        completedAt: now,
      }),
    );
    const mounted = render(
      <ExperimentWorkspace
        initialDraft={workspace.draft!}
        initialCells={workspace.cells}
        onBack={vi.fn()}
        saveProject={saveProject}
        analysisRunner={analysisRunner}
        analysisAvailable
      />,
    );
    const signal = () => screen.getByRole("textbox", { name: "C1・Cell ID=oldのSignal" });
    fireEvent.paste(signal(), { clipboardData: { getData: () => "101\n103" } });
    expect(signal()).toHaveValue("1");
    fireEvent.click(screen.getByRole("button", { name: "貼り付けを確定" }));
    expect(signal()).toHaveValue("101");
    fireEvent.click(screen.getByRole("button", { name: "入力を元に戻す" }));
    expect(signal()).toHaveValue("1");
    fireEvent.click(screen.getByRole("button", { name: "入力をやり直す" }));
    expect(signal()).toHaveValue("101");
    fireEvent.click(screen.getByText("新しい測定記録を追加", { selector: "summary span" }));
    const entry = screen.getByRole("form", { name: "新しい測定記録を追加" });
    fireEvent.change(within(entry).getByRole("textbox", { name: "Dish ID" }), {
      target: { value: "C1" },
    });
    fireEvent.change(within(entry).getByRole("textbox", { name: "Cell ID" }), {
      target: { value: "third" },
    });
    fireEvent.change(within(entry).getByRole("combobox", { name: "Condition" }), {
      target: { value: "control" },
    });
    const measurement = within(entry)
      .getAllByRole("textbox")
      .find((input) => input.getAttribute("aria-label")?.startsWith("Signal・"))!;
    fireEvent.change(measurement, { target: { value: "105" } });
    fireEvent.click(within(entry).getByRole("button", { name: "測定行を追加" }));
    expect(screen.getByRole("textbox", { name: "C1・Cell ID=thirdのSignal" })).toHaveValue("105");
    fireEvent.click(screen.getByRole("button", { name: "C1・Cell ID=thirdを削除" }));
    expect(
      screen.queryByRole("textbox", { name: "C1・Cell ID=thirdのSignal" }),
    ).not.toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "入力を元に戻す" }));
    expect(screen.getByRole("textbox", { name: "C1・Cell ID=thirdのSignal" })).toHaveValue("105");
    fireEvent.click(screen.getByRole("button", { name: "＋ グラフを作成" }));
    fireEvent.click(screen.getByRole("button", { name: "このグラフを作成" }));
    expect(screen.getByRole("img", { name: /実験単位ごとのグラフ/ })).toBeVisible();
    fireEvent.click(screen.getByRole("button", { name: "統計" }));
    // The synthetic fixture explicitly has four independent dishes and no shared
    // source. Exercise the required confirmation rather than bypassing the guard.
    fireEvent.click(
      screen.getByRole("checkbox", { name: /同じrun\/source preparationから分けた組ではなく/ }),
    );
    const execute = screen.getByRole("button", { name: "選択した解析を実行" });
    expect(
      execute,
      screen.getByRole("region", { name: "統計ワークスペース" }).textContent ?? "",
    ).toBeEnabled();
    fireEvent.click(execute);
    await waitFor(() => expect(analysisRunner).toHaveBeenCalledTimes(1));
    const request = analysisRunner.mock.calls[0]![0];
    expect(new Set(request.observations.map((o) => o.experimentalUnitId)).size).toBe(4);
    expect(request.observations).toHaveLength(4);
    expect(request.observations.map((o) => ("value" in o ? o.value : null))).toContain(103);
    expect(await screen.findByRole("group", { name: "統計解析結果" })).toHaveTextContent(
      "p = 0.12",
    );
    await act(async () => {
      fireEvent.click(screen.getByRole("button", { name: "プロジェクトを保存" }));
    });
    await waitFor(() => expect(saveProject).toHaveBeenCalledTimes(1));
    const saved = ProjectStateSchema.parse(
      JSON.parse(JSON.stringify(saveProject.mock.calls[0]![0])),
    );
    expect(saved.adaptiveInput?.contract).toEqual(nestedContract);
    expect(saved.adaptiveInput?.mapping).toEqual(mapping);
    expect(saved.adaptiveInput?.rawLineage?.rawText).toBe(lineage.rawText);
    expect(saved.adaptiveInput?.canonicalObservations).toHaveLength(9);
    expect(
      saved.adaptiveInput?.canonicalObservations.slice(0, 8).map((o) => ({
        id: o.observationId,
        identities: o.identities,
        hierarchy: o.hierarchy,
        sourceRow: o.sourceRow,
      })),
    ).toEqual(
      nestedObservations.map((o) => ({
        id: o.observationId,
        identities: o.identities,
        hierarchy: o.hierarchy,
        sourceRow: o.sourceRow,
      })),
    );
    expect(saved.analysisRuns).toHaveLength(1);
    const restored = rehydrateExperimentWorkspace(saved)!;
    // Persistence remaps draft IDs to stored unit/derived-record IDs and may
    // reorder records. Compare scientific coordinates and values, then compare
    // the complete stored request on subsequent unchanged save.
    const storedRequest = restored.graphs[0]!.analysis!.request;
    if (storedRequest.protocolVersion !== "0.1.0" || request.protocolVersion !== "0.1.0") {
      throw new Error(
        "Synthetic independent scalar fixture must retain its scalar request protocol",
      );
    }
    expect(storedRequest.method).toBe(request.method);
    expect(storedRequest.options).toEqual(request.options);
    expect(storedRequest.contrastConditionIds).toEqual(request.contrastConditionIds);
    const conditionValues = (r: AnalysisEngineRequest) =>
      r.observations.map((o) => `${o.conditionId}:${"value" in o ? o.value : ""}`).sort();
    expect(conditionValues(storedRequest)).toEqual(conditionValues(request));
    expect(new Set(storedRequest.observations.map((o) => o.experimentalUnitId)).size).toBe(4);
    mounted.unmount();
    render(
      <ExperimentWorkspace
        initialDraft={restored.draft}
        initialCells={restored.cells}
        initialGraphs={restored.graphs}
        initialProject={{ state: saved, target: "synthetic-source-only.lsa" }}
        onBack={vi.fn()}
        saveProject={saveProject}
      />,
    );
    expect(signal()).toHaveValue("101");
    expect(screen.getByRole("button", { name: "入力を元に戻す" })).toBeDisabled();
    await act(async () => {
      fireEvent.click(screen.getByRole("button", { name: "プロジェクトを保存" }));
    });
    await waitFor(() => expect(saveProject).toHaveBeenCalledTimes(2));
    expect(saveProject.mock.calls[1]![0].analysisRuns).toEqual(saved.analysisRuns);
  }, 20_000);
});

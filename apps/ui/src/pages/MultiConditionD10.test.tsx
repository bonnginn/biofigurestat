import { fireEvent, render, screen, waitFor, cleanup } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

import type { AnalysisEngineRequest, AnalysisEngineResult } from "@lsaa/analysis-contracts";
import type { ProjectState } from "@lsaa/project";
import type { SaveProjectAction } from "../app/projectActions";
import { ComparisonWizard } from "./ComparisonWizard";
import { OpenProjectPage } from "./OpenProjectPage";

afterEach(() => cleanup());

function fixtureResult(request: AnalysisEngineRequest): AnalysisEngineResult {
  return {
    protocolVersion: request.protocolVersion,
    requestId: request.requestId,
    status: "ok",
    engine: { name: "d10-test-engine", version: "0.2.0", packages: {} },
    estimates: [],
    tests: [
      {
        name: "welch_one_way_anova",
        statisticName: "F",
        statistic: 1.2,
        degreesOfFreedom: [2, 6],
        pValue: 0.35,
        adjustedPValue: null,
        effectSizeName: "cohen_f_welch",
        effectSize: 0.2,
      },
    ],
    diagnostics: [],
    warnings: [],
    completedAt: "2026-08-20T12:00:00Z",
  };
}

function pasteAndAssignCondition(conditionId: string) {
  const condition = screen.getByRole("combobox", { name: "D10貼り付け先の条件" });
  fireEvent.change(condition, {
    target: { value: conditionId },
  });
  fireEvent.change(screen.getByRole("textbox", { name: "ImageJの細胞・ROI行を貼り付け" }), {
    target: { value: "Area\tMean\n120\t10\n130\t20\n140\t30" },
  });
  screen
    .getAllByRole("combobox", { name: /ImageJ行 .*実験単位/ })
    .forEach((select, index) => fireEvent.change(select, { target: { value: String(index) } }));
  fireEvent.click(screen.getByRole("button", { name: "要約値をデータシートへ適用" }));
}

describe("多条件D10", () => {
  it("D03の全条件をImageJ行から要約し、解析・raw/summaryグラフ・保存・再編集へ進める", async () => {
    const saveProject = vi.fn<SaveProjectAction>(async (state: ProjectState) => ({
      state,
      target: "/tmp/d03-d10.lsa",
    }));
    const analysisRunner = vi.fn(async (request: AnalysisEngineRequest) => fixtureResult(request));
    render(
      <ComparisonWizard
        purpose="microscopy"
        onBack={() => undefined}
        analysisRunner={analysisRunner}
        saveProject={saveProject}
      />,
    );
    fireEvent.change(screen.getByRole("spinbutton", { name: "独立した条件の数" }), {
      target: { value: "3" },
    });
    fireEvent.click(screen.getByRole("button", { name: /このデザインを確定/ }));
    fireEvent.click(screen.getByRole("button", { name: /顕微鏡強度/ }));

    expect(
      screen.getByRole("button", { name: /ImageJの細胞・ROI行を実験単位ごとに要約/ }),
    ).toBeVisible();
    fireEvent.click(
      screen.getByRole("button", { name: /ImageJの細胞・ROI行を実験単位ごとに要約/ }),
    );
    pasteAndAssignCondition("condition.1");
    pasteAndAssignCondition("condition.2");
    pasteAndAssignCondition("condition.3");

    fireEvent.click(screen.getByRole("button", { name: /検証して解析へ/ }));
    expect(screen.getByRole("tab", { name: /2 解析/ })).toHaveAttribute("aria-selected", "true");
    fireEvent.click(screen.getByRole("button", { name: /推奨解析を実行/ }));
    await waitFor(() => expect(analysisRunner).toHaveBeenCalledOnce());
    expect(screen.getByText(/D10要約 0.2.0/)).toBeVisible();
    fireEvent.click(screen.getByRole("tab", { name: /3 グラフ/ }));
    expect(screen.getByRole("img")).toHaveAttribute("data-graph-type", "raw_and_replicate_summary");

    fireEvent.click(screen.getByRole("tab", { name: /4 保存/ }));
    fireEvent.click(screen.getByRole("button", { name: "プロジェクトを保存" }));
    await waitFor(() => expect(saveProject).toHaveBeenCalledOnce());
    const saved = saveProject.mock.calls[0]?.[0];
    if (!saved) throw new Error("D03 D10 state was not saved");
    expect(saved.observations).toHaveLength(9);
    expect(saved.transformations).toHaveLength(1);
    expect(saved.derivedDatasetRevisions).toHaveLength(1);
    expect(saved.derivedValues).toHaveLength(9);
    expect(saved.designRevisions.at(-1)?.design.unitLevels).toEqual(
      expect.arrayContaining([expect.objectContaining({ id: "unit.imagej-row" })]),
    );
    expect(saved.graphs[0]?.spec.type).toBe("raw_and_replicate_summary");

    cleanup();
    render(
      <OpenProjectPage
        onNavigate={() => undefined}
        openProject={async () => null}
        persistedProject={{ state: saved, target: "/tmp/d03-d10.lsa" }}
        saveProject={saveProject}
      />,
    );
    const restored = screen.getByRole("spinbutton", { name: /対照 実験単位 1/ });
    expect(restored).toHaveValue(10);
    fireEvent.change(restored, { target: { value: "42" } });
    expect(restored).toHaveValue(42);
  });

  it("D05の4条件でもImageJ行の要約を全条件へ適用できる", async () => {
    const analysisRunner = vi.fn(async (request: AnalysisEngineRequest) => fixtureResult(request));
    render(
      <ComparisonWizard
        purpose="microscopy"
        onBack={() => undefined}
        analysisRunner={analysisRunner}
      />,
    );
    fireEvent.click(screen.getByRole("radio", { name: /2種類の処置を組み合わせた/ }));
    fireEvent.click(screen.getByRole("button", { name: /このデザインを確定/ }));
    fireEvent.click(screen.getByRole("button", { name: /顕微鏡強度/ }));
    fireEvent.click(
      screen.getByRole("button", { name: /ImageJの細胞・ROI行を実験単位ごとに要約/ }),
    );

    ["condition.a1.b1", "condition.a1.b2", "condition.a2.b1", "condition.a2.b2"].forEach(
      pasteAndAssignCondition,
    );
    fireEvent.click(screen.getByRole("button", { name: /検証して解析へ/ }));
    expect(screen.getByRole("tab", { name: /2 解析/ })).toHaveAttribute("aria-selected", "true");
    fireEvent.click(screen.getByRole("button", { name: /推奨解析を実行/ }));
    await waitFor(() => expect(analysisRunner).toHaveBeenCalledOnce());
    fireEvent.click(screen.getByRole("tab", { name: /3 グラフ/ }));
    expect(screen.getByRole("img")).toHaveAttribute("data-graph-type", "raw_and_replicate_summary");
  });
});

import { fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import type { AnalysisEngineResult } from "@lsaa/analysis-contracts";
import { vi } from "vitest";
import type { AnalysisRunner } from "../../app/analysisClient";
import { copyGraphToClipboard, serializeGraphSvg } from "../../app/graphExport";
import {
  createComplexProportionFixture,
  createLongitudinalFixture,
  createPairedTwoConditionFixture,
  createXyCorrelationFixture,
} from "../../app/syntheticFixtures";

import {
  createExperimentSetDraft,
  experimentCellKey,
  type ExperimentCellMap,
  type ExperimentCellDraft,
  type ExperimentSetDraft,
} from "../../app/experimentDraft";

import { ExperimentGraphWorkbench } from "./ExperimentGraphWorkbench";

const analysisResult: AnalysisEngineResult = {
  protocolVersion: "0.1.0",
  requestId: "request.draft.graph",
  status: "ok",
  engine: { name: "fixture-engine", version: "0.1.0", packages: { scipy: "1" } },
  estimates: [],
  tests: [
    {
      name: "welch_two_sample_t_test",
      statisticName: "t",
      statistic: -2.5,
      degreesOfFreedom: [3.8],
      pValue: 0.042,
      adjustedPValue: null,
      effectSizeName: "hedges_g",
      effectSize: -1.1,
    },
  ],
  diagnostics: [{ code: "assumptions_not_fully_evaluated", message: "fixture" }],
  warnings: [],
  completedAt: "2026-08-21T00:00:00+09:00",
};

function withTwoConditions(base: ExperimentSetDraft): ExperimentSetDraft {
  return {
    ...base,
    conditions: [
      {
        ...base.conditions[0],
        label: "Control",
        attributes: { "attribute.1": "Control" },
      },
      {
        ...base.conditions[1],
        label: "Treatment",
        attributes: { "attribute.1": "Treatment" },
      },
    ],
  };
}

function proportionFixture(): { draft: ExperimentSetDraft; cells: ExperimentCellMap } {
  const draft = withTwoConditions(createExperimentSetDraft("cell_culture", "proportion"));
  const readoutId = draft.readouts[0].id;
  const cells: Record<string, ExperimentCellDraft> = {};
  const values = [
    [40, 100, 42, 100],
    [55, 100, 50, 100],
    [60, 100, 58, 100],
  ];
  draft.experiments.forEach((experiment, experimentIndex) => {
    draft.conditions.forEach((condition, conditionIndex) => {
      const [positive, eligible] = values[experimentIndex].slice(
        conditionIndex * 2,
        conditionIndex * 2 + 2,
      );
      cells[
        experimentCellKey({
          experimentId: experiment.id,
          conditionId: condition.id,
          readoutId,
        })
      ] = { kind: "proportion", positive, eligible };
    });
  });
  return { draft, cells };
}

function simpleThreeGroupFixture(): { draft: ExperimentSetDraft; cells: ExperimentCellMap } {
  const base = createExperimentSetDraft("cell_culture", "proportion");
  const draft: ExperimentSetDraft = {
    ...base,
    attributes: [{ id: "attribute.group", label: "Group" }],
    conditions: ["Control", "Treatment A", "Treatment B"].map((label, index) => ({
      id: `condition.${index + 1}`,
      label,
      attributes: { "attribute.group": label },
    })),
  };
  const cells: Record<string, ExperimentCellDraft> = {};
  draft.experiments.forEach((experiment, experimentIndex) => {
    draft.conditions.forEach((condition, conditionIndex) => {
      cells[
        experimentCellKey({
          experimentId: experiment.id,
          conditionId: condition.id,
          readoutId: draft.readouts[0].id,
        })
      ] = {
        kind: "proportion",
        positive: 30 + experimentIndex * 3 + conditionIndex * 8,
        eligible: 100,
      };
    });
  });
  return { draft, cells };
}

function longLabelFourGroupFixture(): { draft: ExperimentSetDraft; cells: ExperimentCellMap } {
  const base = createExperimentSetDraft("cell_culture", "proportion");
  const labels = [
    "Control",
    "Treatment A",
    "Treatment B",
    "Very long condition name for label geometry",
  ];
  const draft: ExperimentSetDraft = {
    ...base,
    attributes: [{ id: "attribute.group", label: "Group" }],
    conditions: labels.map((label, index) => ({
      id: `condition.long.${index + 1}`,
      label,
      attributes: { "attribute.group": label },
    })),
  };
  const cells: Record<string, ExperimentCellDraft> = {};
  draft.experiments.forEach((experiment, experimentIndex) => {
    draft.conditions.forEach((condition, conditionIndex) => {
      cells[
        experimentCellKey({
          experimentId: experiment.id,
          conditionId: condition.id,
          readoutId: draft.readouts[0].id,
        })
      ] = {
        kind: "proportion",
        positive: 30 + experimentIndex + conditionIndex * 5,
        eligible: 100,
      };
    });
  });
  return { draft, cells };
}

function nestedFixture(): { draft: ExperimentSetDraft; cells: ExperimentCellMap } {
  const draft = withTwoConditions(createExperimentSetDraft("cell_culture", "nested_continuous"));
  const readoutId = draft.readouts[0].id;
  const cells: Record<string, ExperimentCellDraft> = {};
  draft.experiments.forEach((experiment, experimentIndex) => {
    draft.conditions.forEach((condition, conditionIndex) => {
      const base = (experimentIndex + 1) * 10 + conditionIndex * 3;
      cells[
        experimentCellKey({
          experimentId: experiment.id,
          conditionId: condition.id,
          readoutId,
        })
      ] = {
        kind: "nested_continuous",
        source: "manual",
        rawValues: [base, base + 2, base + 4],
      };
    });
  });
  return { draft, cells };
}

function hierarchicalProportionFixture(): {
  draft: ExperimentSetDraft;
  cells: ExperimentCellMap;
} {
  const baseDraft = createExperimentSetDraft("cell_culture", "proportion");
  const draft: ExperimentSetDraft = {
    ...baseDraft,
    attributes: [
      { id: "attribute.gene", label: "Gene" },
      { id: "attribute.drug", label: "薬剤" },
    ],
    conditions: [
      {
        ...baseDraft.conditions[0],
        label: "Control",
        attributes: { "attribute.gene": "Control", "attribute.drug": "−" },
      },
      {
        ...baseDraft.conditions[1],
        id: "condition.control.plus",
        label: "Control",
        attributes: { "attribute.gene": "Control", "attribute.drug": "＋" },
      },
    ],
  };
  const readoutId = draft.readouts[0].id;
  const cells: Record<string, ExperimentCellDraft> = {};
  draft.experiments.forEach((experiment, experimentIndex) => {
    draft.conditions.forEach((condition, conditionIndex) => {
      cells[
        experimentCellKey({
          experimentId: experiment.id,
          conditionId: condition.id,
          readoutId,
        })
      ] = {
        kind: "proportion",
        positive: 40 + experimentIndex * 5 + conditionIndex,
        eligible: 100,
      };
    });
  });
  return { draft, cells };
}

describe("ExperimentGraphWorkbench", () => {
  const selectInspectorTarget = (target: string) => {
    fireEvent.change(screen.getByRole("combobox", { name: "編集対象" }), {
      target: { value: target },
    });
  };

  it("3群は安定スロットと左右余白でコンパクトに表示する", () => {
    const { draft, cells } = simpleThreeGroupFixture();
    render(<ExperimentGraphWorkbench draft={draft} cells={cells} onClose={vi.fn()} />);

    const svg = screen.getByRole("img", {
      name: /実験単位ごとのグラフ/,
    }) as unknown as SVGSVGElement;
    expect(Number(svg.getAttribute("width"))).toBeLessThan(620);
    expect(svg).toHaveAttribute("data-category-slot-width", "88");
    expect(svg).toHaveAttribute("data-side-padding", "72");
    const groups = [...svg.querySelectorAll<SVGGElement>("[data-condition-index]")];
    const positions = groups.map((group) =>
      Number(group.querySelector(".experiment-graph-point")?.getAttribute("cx")),
    );
    expect(positions[1] - positions[0]).toBeGreaterThanOrEqual(88);
    expect(positions[2] - positions[1]).toBeGreaterThanOrEqual(88);
    expect(positions[1] - positions[0]).toBeLessThan(150);
    expect(positions[0] - 88).toBeGreaterThanOrEqual(60);
    expect(Number(svg.getAttribute("width")) - 34 - positions[2]).toBeGreaterThanOrEqual(60);
    expect(svg.querySelectorAll(".experiment-graph-hierarchy-line")).toHaveLength(0);
    expect(svg.querySelectorAll(".experiment-graph-category-tick")).toHaveLength(3);
    expect(
      [...svg.querySelectorAll<SVGLineElement>(".experiment-graph-category-tick")].every(
        (tick) => Number(tick.getAttribute("y2")) < Number(tick.getAttribute("y1")),
      ),
    ).toBe(true);
  });

  it("4群の長い条件名を階層文字15px/18pxで重ねず、必要以上に引き延ばさない", () => {
    const { draft, cells } = longLabelFourGroupFixture();
    render(<ExperimentGraphWorkbench draft={draft} cells={cells} onClose={vi.fn()} />);

    const svg = screen.getByRole("img", { name: /実験単位ごとのグラフ/ });
    const widthAt15 = Number(svg.getAttribute("width"));
    expect(widthAt15).toBeGreaterThan(500);
    expect(widthAt15).toBeLessThan(1000);
    const positionsAt15 = [...svg.querySelectorAll<SVGGElement>("[data-condition-index]")].map(
      (group) => Number(group.querySelector(".experiment-graph-point")?.getAttribute("cx")),
    );
    expect(
      Math.min(...positionsAt15.slice(1).map((x, index) => x - positionsAt15[index]!)),
    ).toBeGreaterThanOrEqual(88);
    expect(svg).toHaveTextContent("Control");
    expect(svg).toHaveTextContent("Treatment A");
    expect(svg).toHaveTextContent("Treatment B");

    selectInspectorTarget("x-axis");
    fireEvent.change(screen.getByRole("slider", { name: "階層ラベルの文字サイズ" }), {
      target: { value: "18" },
    });
    const widthAt18 = Number(svg.getAttribute("width"));
    expect(widthAt18).toBe(widthAt15);
    expect(widthAt18).toBeLessThan(1100);
    expect(
      svg
        .querySelector(
          '[data-condition-parent-label="Very long condition name for label geometry"]',
        )
        ?.querySelectorAll("tspan").length,
    ).toBeGreaterThan(1);
  });

  it("割合を実験単位ごとの点と平均±SDとして表示し、分子と分母を要約に残す", () => {
    const { draft, cells } = proportionFixture();
    const onClose = vi.fn();
    render(<ExperimentGraphWorkbench draft={draft} cells={cells} onClose={onClose} />);

    const workbench = screen.getByRole("region", { name: "実験からグラフを作成" });
    expect(within(workbench).getByRole("img", { name: /実験単位ごとのグラフ/ })).toBeVisible();
    expect(
      within(workbench).getByRole("heading", { name: "Biological replicates + Mean ± SD" }),
    ).toBeVisible();
    expect(workbench.querySelectorAll('[data-graph-layer="proportion-experiment"]')).toHaveLength(
      6,
    );
    expect(workbench.querySelectorAll('[data-graph-layer="proportion-summary"]')).toHaveLength(8);
    fireEvent.click(within(workbench).getByText("使用データの内訳を表示"));
    expect(within(workbench).getByText(/40\/100/)).toBeVisible();
    expect(within(workbench).getByText(/42\/100/)).toBeVisible();
    expect(within(workbench).getByText(/割合と要約は実験単位（Exp）から計算/)).toBeVisible();
    expect(within(workbench).getByRole("combobox", { name: "測定項目" })).toBeDisabled();
    selectInspectorTarget("statistics");
    expect(within(workbench).getByRole("button", { name: "選択した解析を実行" })).toBeDisabled();
    expect(within(workbench).getByText("Welchの2標本t検定を推奨")).toBeVisible();
    expect(within(workbench).getByRole("button", { name: "SVGを書き出す" })).toBeEnabled();
    expect(workbench).not.toHaveTextContent(/D0\d|D10/);

    const exportActions = within(workbench).getByLabelText("グラフの書き出し");
    expect(getComputedStyle(exportActions).width).toBe("198px");
    within(exportActions)
      .getAllByRole("button")
      .forEach((button) => expect(getComputedStyle(button).whiteSpace).toBe("nowrap"));

    const svg = within(workbench).getByRole("img", { name: /実験単位ごとのグラフ/ });
    selectInspectorTarget("data");
    fireEvent.click(within(workbench).getByRole("checkbox", { name: "Treatment" }));
    expect(workbench.querySelector(".experiment-graph-legend")).not.toBeInTheDocument();
    expect(
      new Set(
        [...svg.querySelectorAll('[data-graph-layer="proportion-experiment"]')].map((point) =>
          point.getAttribute("fill"),
        ),
      ),
    ).toEqual(new Set(["#245c8a"]));
    expect(svg.querySelectorAll(".experiment-graph-grid-line")).toHaveLength(0);
    expect(svg.querySelectorAll("path, polyline")).toHaveLength(0);

    fireEvent.click(within(workbench).getByRole("button", { name: "閉じる" }));
    expect(onClose).toHaveBeenCalledTimes(1);
  });

  it("requires an independent-unit confirmation and runs the validated local recommendation", async () => {
    const { draft, cells } = proportionFixture();
    const runner = vi.fn<AnalysisRunner>(async () => analysisResult);
    render(
      <ExperimentGraphWorkbench
        draft={draft}
        cells={cells}
        analysisRunner={runner}
        onClose={vi.fn()}
      />,
    );

    selectInspectorTarget("statistics");
    fireEvent.click(screen.getByRole("checkbox", { name: /各条件は別々のdish/ }));
    fireEvent.click(screen.getByRole("button", { name: "選択した解析を実行" }));

    await waitFor(() => expect(runner).toHaveBeenCalledTimes(1));
    expect(runner.mock.calls[0][0]).toMatchObject({ templateId: "D01", method: "welch_t" });
    expect(screen.getByRole("group", { name: "統計解析結果" })).toHaveTextContent("p = 0.042");
    expect(screen.getByText(/少数例の有意差検定だけで正規性を断定/)).toBeVisible();
    fireEvent.click(screen.getByText("解析エンジンと再現情報"));
    expect(screen.getByText("fixture-engine 0.1.0")).toBeVisible();
    expect(screen.getByText("scipy 1")).toBeVisible();
    expect(screen.getByText("Life Science Analysis App 0.1.0")).toBeVisible();
    const graph = screen.getByRole("img", { name: /実験単位ごとのグラフ/ });
    expect(graph.querySelector('[data-graph-layer="statistics-annotation"]')).toBeNull();
    fireEvent.change(screen.getByRole("combobox", { name: "統計注釈の表示" }), {
      target: { value: "exact_p" },
    });
    expect(graph.querySelector('[data-graph-layer="statistics-annotation"]')).toHaveTextContent(
      "p = 0.042",
    );
  });

  it("keeps the finite JCB024-sized p-value non-zero in an exact Graph annotation", async () => {
    const { draft, cells } = proportionFixture();
    const runner = vi.fn<AnalysisRunner>(async () => ({
      ...analysisResult,
      tests: [
        {
          ...analysisResult.tests[0],
          statistic: 35.104709034897084,
          degreesOfFreedom: [2, 14],
          pValue: 3.5105210908680844e-6,
        },
      ],
    }));
    render(
      <ExperimentGraphWorkbench
        draft={draft}
        cells={cells}
        analysisRunner={runner}
        onClose={vi.fn()}
      />,
    );

    selectInspectorTarget("statistics");
    fireEvent.click(screen.getByRole("checkbox", { name: /各条件は別々のdish/ }));
    fireEvent.click(screen.getByRole("button", { name: "選択した解析を実行" }));
    await waitFor(() => expect(runner).toHaveBeenCalledTimes(1));
    fireEvent.change(screen.getByRole("combobox", { name: "統計注釈の表示" }), {
      target: { value: "exact_p" },
    });

    const annotation = screen
      .getByRole("img", { name: /実験単位ごとのグラフ/ })
      .querySelector('[data-graph-layer="statistics-annotation"]');
    expect(annotation).toHaveTextContent("p = 3.51e-6");
    expect(annotation).not.toHaveTextContent(/p = 0(?:\D|$)/);
  });

  it("lets the researcher reject Recommended and executes the selected supported alternative", async () => {
    const { draft, cells } = proportionFixture();
    const runner = vi.fn<AnalysisRunner>(async (request) => ({
      ...analysisResult,
      protocolVersion: request.protocolVersion,
      requestId: request.requestId,
    }));
    render(
      <ExperimentGraphWorkbench
        draft={draft}
        cells={cells}
        analysisRunner={runner}
        onClose={vi.fn()}
      />,
    );
    selectInspectorTarget("statistics");
    expect(screen.getByText("推奨")).toBeVisible();
    expect(screen.getByText("代替案")).toBeVisible();
    expect(screen.getByText("詳細設定")).toBeVisible();
    fireEvent.click(screen.getByRole("radio", { name: /Mann–Whitney/ }));
    expect(screen.getByText(/推奨法と異なる方法/)).toBeVisible();
    fireEvent.click(screen.getByRole("checkbox", { name: /各条件は別々のdish/ }));
    fireEvent.click(screen.getByRole("button", { name: "選択した解析を実行" }));
    await waitFor(() => expect(runner).toHaveBeenCalledTimes(1));
    expect(runner.mock.calls[0][0]).toMatchObject({
      templateId: "D01",
      method: "mann_whitney",
    });
  });

  it("keeps the matched-unit confirmation when Wilcoxon is selected", async () => {
    const fixture = createPairedTwoConditionFixture();
    const runner = vi.fn<AnalysisRunner>(async (request) => ({
      ...analysisResult,
      protocolVersion: request.protocolVersion,
      requestId: request.requestId,
    }));
    render(
      <ExperimentGraphWorkbench
        draft={fixture.draft}
        cells={fixture.cells}
        analysisRunner={runner}
        onClose={vi.fn()}
      />,
    );

    selectInspectorTarget("statistics");
    fireEvent.click(screen.getByRole("radio", { name: /Wilcoxon/ }));
    expect(screen.getByRole("checkbox", { name: /同じ実験単位の2条件/ })).toBeVisible();
    expect(screen.queryByRole("checkbox", { name: /各条件は別々のdish/ })).toBeNull();
    fireEvent.click(screen.getByRole("checkbox", { name: /同じ実験単位の2条件/ }));
    fireEvent.click(screen.getByRole("button", { name: "選択した解析を実行" }));

    await waitFor(() => expect(runner).toHaveBeenCalledTimes(1));
    expect(runner.mock.calls[0][0]).toMatchObject({
      templateId: "D02",
      method: "wilcoxon_signed_rank",
    });
  });

  it("executes only researcher-selected planned condition pairs with Holm correction", async () => {
    const { draft, cells } = simpleThreeGroupFixture();
    const runner = vi.fn<AnalysisRunner>(async (request) => ({
      ...analysisResult,
      protocolVersion: request.protocolVersion,
      requestId: request.requestId,
    }));
    render(
      <ExperimentGraphWorkbench
        draft={draft}
        cells={cells}
        analysisRunner={runner}
        onClose={vi.fn()}
      />,
    );

    selectInspectorTarget("statistics");
    fireEvent.click(screen.getByRole("radio", { name: "事前に決めた条件ペアだけを比較" }));
    expect(screen.getByRole("button", { name: "選択した解析を実行" })).toBeDisabled();
    fireEvent.click(screen.getByRole("checkbox", { name: "Control vs Treatment B" }));
    fireEvent.click(screen.getByRole("checkbox", { name: /各条件は別々のdish/ }));
    expect(screen.getByRole("button", { name: "選択した解析を実行" })).toBeEnabled();
    fireEvent.click(screen.getByRole("button", { name: "選択した解析を実行" }));

    await waitFor(() => expect(runner).toHaveBeenCalledTimes(1));
    expect(runner.mock.calls[0][0]).toMatchObject({
      templateId: "D03",
      method: "one_way_anova",
      contrastIntent: "planned_comparisons",
      plannedContrastConditionIds: [[draft.conditions[0].id, draft.conditions[2].id]],
      options: { multiplicityMethod: "holm_planned_comparisons" },
    });
  });

  it("PearsonとSpearmanを検証済みの実行可能な選択として切り替える", async () => {
    const fixture = createXyCorrelationFixture();
    const runner = vi.fn<AnalysisRunner>(async (request) => ({
      ...analysisResult,
      protocolVersion: request.protocolVersion,
      requestId: request.requestId,
    }));
    render(
      <ExperimentGraphWorkbench
        draft={fixture.draft}
        cells={fixture.cells}
        analysisRunner={runner}
        onClose={vi.fn()}
      />,
    );

    selectInspectorTarget("statistics");
    const method = screen.getByRole("combobox", { name: "相関の方法" });
    expect(method).toHaveValue("pearson");
    fireEvent.change(method, { target: { value: "spearman" } });
    expect(screen.getByText("Pearsonの相関を推奨")).toBeVisible();
    fireEvent.click(screen.getByRole("checkbox", { name: /XとYが、同じ実験単位/ }));
    fireEvent.click(screen.getByRole("button", { name: "選択した解析を実行" }));

    await waitFor(() => expect(runner).toHaveBeenCalledTimes(1));
    expect(runner.mock.calls[0][0]).toMatchObject({ templateId: "D09", method: "spearman" });
  });

  it("値だけが変わったら古い結果を外し、同じ解析をdebounce後に再実行する", async () => {
    const { draft, cells } = proportionFixture();
    const runner = vi.fn<AnalysisRunner>(async () => analysisResult);
    const view = render(
      <ExperimentGraphWorkbench
        draft={draft}
        cells={cells}
        analysisRunner={runner}
        onClose={vi.fn()}
      />,
    );

    selectInspectorTarget("statistics");
    fireEvent.click(screen.getByRole("checkbox", { name: /各条件は別々のdish/ }));
    fireEvent.click(screen.getByRole("button", { name: "選択した解析を実行" }));
    await screen.findByRole("group", { name: "統計解析結果" });

    const changedCells = { ...cells };
    const changedKey = Object.keys(changedCells)[0];
    changedCells[changedKey] = { kind: "proportion", positive: 45, eligible: 100 };
    view.rerender(
      <ExperimentGraphWorkbench
        draft={draft}
        cells={changedCells}
        analysisRunner={runner}
        onClose={vi.fn()}
      />,
    );

    await waitFor(() => {
      expect(screen.queryByRole("group", { name: "統計解析結果" })).not.toBeInTheDocument();
    });
    expect(screen.getByRole("status")).toHaveTextContent("同じ解析を自動再実行します");
    expect(
      screen
        .getByRole("img", { name: /実験単位ごとのグラフ/ })
        .querySelector('[data-graph-layer="statistics-annotation"]'),
    ).not.toBeInTheDocument();
    await waitFor(() => expect(runner).toHaveBeenCalledTimes(2));
    expect(await screen.findByRole("group", { name: "統計解析結果" })).toBeVisible();
    expect(screen.getByRole("status")).toHaveTextContent("同じ解析を自動再実行しました");
    expect(runner.mock.calls[1][0]).toMatchObject({ templateId: "D01", method: "welch_t" });
    expect(runner.mock.calls[1][0].observations[0]?.value).toBe(45);
  });

  it("実験単位構造が変わったら別のmethodへ自動変換しない", async () => {
    const { draft, cells } = proportionFixture();
    const runner = vi.fn<AnalysisRunner>(async () => analysisResult);
    const view = render(
      <ExperimentGraphWorkbench
        draft={draft}
        cells={cells}
        analysisRunner={runner}
        onClose={vi.fn()}
      />,
    );
    selectInspectorTarget("statistics");
    fireEvent.click(screen.getByRole("checkbox", { name: /各条件は別々のdish/ }));
    fireEvent.click(screen.getByRole("button", { name: "選択した解析を実行" }));
    await screen.findByRole("group", { name: "統計解析結果" });

    view.rerender(
      <ExperimentGraphWorkbench
        draft={{
          ...draft,
          experiments: draft.experiments.map((experiment, index) =>
            index === 0 ? { ...experiment, stableUnitId: "unit.changed" } : experiment,
          ),
        }}
        cells={cells}
        analysisRunner={runner}
        onClose={vi.fn()}
      />,
    );

    expect(await screen.findByRole("status")).toHaveTextContent("解析法は自動変更しません");
    await new Promise((resolve) => window.setTimeout(resolve, 750));
    expect(runner).toHaveBeenCalledTimes(1);
    expect(screen.queryByRole("group", { name: "統計解析結果" })).toBeNull();
  });

  it("edits the publication appearance without changing the underlying values", () => {
    const { draft, cells } = proportionFixture();
    render(<ExperimentGraphWorkbench draft={draft} cells={cells} onClose={vi.fn()} />);

    selectInspectorTarget("error-bar");
    fireEvent.change(screen.getByRole("combobox", { name: "誤差線の要約方法" }), {
      target: { value: "sem" },
    });
    expect(screen.getByRole("heading", { name: /Mean ± SEM/ })).toBeVisible();
    selectInspectorTarget("background");
    fireEvent.change(screen.getByRole("combobox", { name: "色の使い方" }), {
      target: { value: "condition" },
    });
    selectInspectorTarget("legend");
    fireEvent.change(screen.getByRole("combobox", { name: "凡例の位置" }), {
      target: { value: "top" },
    });
    expect(screen.getByLabelText("条件の色")).toBeVisible();
    selectInspectorTarget("experiment-summary");
    fireEvent.change(screen.getByRole("slider", { name: "実験単位点の大きさ" }), {
      target: { value: "9" },
    });
    expect(
      screen
        .getByRole("img", { name: /実験単位ごとのグラフ/ })
        .querySelector('[data-graph-layer="proportion-experiment"]'),
    ).toHaveAttribute("r", "9");
  });

  it("論文向けの文字・キャンバス・目盛・線幅を編集できる", () => {
    const { draft, cells } = proportionFixture();
    render(<ExperimentGraphWorkbench draft={draft} cells={cells} onClose={vi.fn()} />);
    const svg = screen.getByRole("img", { name: /実験単位ごとのグラフ/ });

    selectInspectorTarget("background");
    fireEvent.change(screen.getByRole("combobox", { name: "グラフのフォント" }), {
      target: { value: "helvetica" },
    });
    fireEvent.change(screen.getByRole("combobox", { name: "グラフの大きさ" }), {
      target: { value: "compact" },
    });
    fireEvent.change(screen.getByRole("slider", { name: "グラフ左右の余白" }), {
      target: { value: "100" },
    });
    expect(svg).toHaveStyle({ fontFamily: "Helvetica, Arial, sans-serif" });
    expect(svg).toHaveAttribute("data-side-padding", "100");

    selectInspectorTarget("y-axis");
    fireEvent.change(screen.getByRole("slider", { name: "軸タイトルの文字サイズ" }), {
      target: { value: "20" },
    });
    fireEvent.change(screen.getByRole("slider", { name: "目盛ラベルの文字サイズ" }), {
      target: { value: "13" },
    });
    fireEvent.change(screen.getByRole("combobox", { name: "Y軸の目盛間隔" }), {
      target: { value: "manual" },
    });
    fireEvent.change(screen.getByRole("spinbutton", { name: "Y軸目盛の間隔値" }), {
      target: { value: "25" },
    });
    expect(svg.querySelector(".experiment-graph-axis-title")).toHaveStyle({ fontSize: "20px" });
    expect(svg.querySelector(".experiment-graph-axis-label")).toHaveStyle({ fontSize: "13px" });
    expect(
      [...svg.querySelectorAll(".experiment-graph-axis-label")].map((node) => node.textContent),
    ).toEqual(["100", "75", "50", "25", "0"]);

    selectInspectorTarget("error-bar");
    fireEvent.change(screen.getByRole("slider", { name: "誤差線の太さ" }), {
      target: { value: "2.3" },
    });
    expect(svg.querySelector(".experiment-graph-error-line")).toHaveStyle({ strokeWidth: "2.3" });
  });

  it("同じ基底条件は時間・下位属性・親条件の階層にまとめる", () => {
    const { draft, cells } = hierarchicalProportionFixture();
    render(<ExperimentGraphWorkbench draft={draft} cells={cells} onClose={vi.fn()} />);

    const workbench = screen.getByRole("region", { name: "実験からグラフを作成" });
    const svg = within(workbench).getByRole("img", { name: /実験単位ごとのグラフ/ });
    const parentGroups = [
      ...svg.querySelectorAll<SVGGElement>('[data-condition-parent="Control"]'),
    ];
    expect(parentGroups).toHaveLength(2);
    expect(svg.querySelectorAll('[data-condition-level-label="−"]')).toHaveLength(1);
    expect(svg.querySelectorAll('[data-condition-level-label="＋"]')).toHaveLength(1);
    expect(svg.querySelectorAll('[data-condition-parent-label="Control"]')).toHaveLength(1);
    const xPositions = parentGroups.map((group) =>
      Number(group.querySelector(".experiment-graph-point")?.getAttribute("cx")),
    );
    expect(Math.abs(xPositions[1] - xPositions[0])).toBeLessThan(150);
  });

  it("8条件×3時点は省略せず24群を階層表示する", () => {
    const { draft, cells } = createComplexProportionFixture();
    render(<ExperimentGraphWorkbench draft={draft} cells={cells} onClose={vi.fn()} />);

    const svg = screen.getByRole("img", { name: /実験単位ごとのグラフ/ });
    expect(svg.querySelectorAll("[data-condition-index]")).toHaveLength(24);
    expect(svg.querySelectorAll('[data-condition-level-index="2"]')).toHaveLength(8);
    expect(svg.querySelectorAll('[data-condition-level-index="0"]')).toHaveLength(3);
    expect(svg.querySelectorAll('[data-condition-level-index="1"]')).toHaveLength(4);
    expect(svg.querySelectorAll("[data-condition-time-label]")).toHaveLength(24);
    const timePositions = [
      ...svg.querySelectorAll<SVGTextElement>("[data-condition-time-label]"),
    ].map((label) => Number(label.getAttribute("x")));
    const adjacentGaps = timePositions
      .slice(1)
      .map((position, index) => position - timePositions[index]!);
    expect(Math.min(...adjacentGaps)).toBeGreaterThanOrEqual(41.9);
    expect(Number(svg.getAttribute("width"))).toBeGreaterThan(900);
    expect(svg).toHaveTextContent("遺伝子");
    expect(svg).toHaveTextContent("配列");
    expect(svg).toHaveTextContent("処置");
    expect(svg).not.toHaveTextContent("配列 / 処置");
    expect(svg).toHaveTextContent("Time (h)");
    expect(svg).toHaveAccessibleName(/Percentage of Marker X-positive cells/);
    expect(svg.querySelectorAll('[data-condition-parent-label="Control"]')).toHaveLength(1);
    expect(svg.querySelectorAll('[data-condition-parent-label="Gene A"]')).toHaveLength(1);
    expect(
      svg.querySelectorAll('[data-condition-parent-label="Gene B（長いラベルの確認用）"]'),
    ).toHaveLength(1);
    expect(
      svg
        .querySelector('[data-condition-parent-label="Gene B（長いラベルの確認用）"]')
        ?.querySelectorAll("tspan").length,
    ).toBeGreaterThan(1);
  });

  it("Barは単純3群で棒本体・生物学的反復点・SDを同じ位置に描きSVGとclipboardへ保持する", async () => {
    const { draft, cells } = simpleThreeGroupFixture();
    render(<ExperimentGraphWorkbench draft={draft} cells={cells} onClose={vi.fn()} />);

    selectInspectorTarget("background");
    fireEvent.change(screen.getByRole("combobox", { name: "グラフの基本形" }), {
      target: { value: "bar" },
    });

    const svg = screen.getByRole("img", {
      name: /実験単位ごとのグラフ/,
    }) as unknown as SVGSVGElement;
    const bars = [...svg.querySelectorAll<SVGRectElement>('[data-graph-layer="bar"]')];
    expect(bars).toHaveLength(3);
    bars.forEach((bar) => {
      expect(Number(bar.getAttribute("width"))).toBeGreaterThan(0);
      expect(Number(bar.getAttribute("height"))).toBeGreaterThan(0);
      expect(Number(bar.dataset.summaryValue)).toBeGreaterThan(0);
      expect(bar).toHaveAttribute("opacity", "0.24");
    });
    expect(svg.querySelectorAll('[data-graph-layer="proportion-experiment"]')).toHaveLength(9);
    expect(svg.querySelectorAll(".experiment-graph-error-line")).toHaveLength(3);
    expect(svg.querySelectorAll(".experiment-graph-error-cap")).toHaveLength(6);

    const serialized = serializeGraphSvg(svg);
    expect(serialized).toContain('data-graph-layer="bar"');
    expect(serialized).toContain(".experiment-graph-bar");
    expect(serialized.match(/<rect[^>]+data-graph-layer="bar"/g)).toHaveLength(3);

    class TestClipboardItem {
      constructor(readonly data: Record<string, Blob>) {}
    }
    const write = vi.fn(async (_items: readonly TestClipboardItem[]) => {});
    Object.defineProperty(globalThis, "ClipboardItem", {
      configurable: true,
      value: TestClipboardItem,
    });
    Object.defineProperty(navigator, "clipboard", {
      configurable: true,
      value: { write },
    });
    await expect(copyGraphToClipboard(svg)).resolves.toBe("svg");
    expect(write).toHaveBeenCalledTimes(1);
    expect(write.mock.calls[0]![0][0]?.data["image/svg+xml"]).toBeInstanceOf(Blob);
  });

  it("Barは階層条件と複数時点でも全24群を省略せず描く", () => {
    const { draft, cells } = createComplexProportionFixture();
    render(<ExperimentGraphWorkbench draft={draft} cells={cells} onClose={vi.fn()} />);

    selectInspectorTarget("background");
    fireEvent.change(screen.getByRole("combobox", { name: "グラフの基本形" }), {
      target: { value: "bar" },
    });

    const svg = screen.getByRole("img", { name: /実験単位ごとのグラフ/ });
    const bars = [...svg.querySelectorAll<SVGRectElement>('[data-graph-layer="bar"]')];
    expect(bars).toHaveLength(24);
    expect(bars.every((bar) => Number(bar.getAttribute("height")) > 0)).toBe(true);
    expect(svg.querySelectorAll('[data-graph-layer="proportion-experiment"]')).toHaveLength(70);
    expect(svg.querySelectorAll(".experiment-graph-error-line")).toHaveLength(24);
  });

  it("表示中のレイヤーだけから図の説明を更新する", () => {
    const { draft, cells } = nestedFixture();
    render(<ExperimentGraphWorkbench draft={draft} cells={cells} onClose={vi.fn()} />);

    expect(
      screen.getByRole("heading", {
        name: "Box plot + Raw observations + Experiment summaries + Mean ± SD",
      }),
    ).toBeVisible();
    selectInspectorTarget("experiment-summary");
    fireEvent.click(screen.getByRole("checkbox", { name: "全体平均を表示" }));
    expect(
      screen.getByRole("heading", {
        name: "Box plot + Raw observations + Experiment summaries",
      }),
    ).toBeVisible();
    expect(
      screen.getByRole("heading", {
        name: "Box plot + Raw observations + Experiment summaries",
      }),
    ).not.toHaveTextContent(/Mean|SD|SEM/);

    selectInspectorTarget("violin");
    fireEvent.click(screen.getByRole("checkbox", { name: "バイオリンを表示" }));
    expect(
      screen.getByRole("heading", {
        name: "Distribution + Box plot + Raw observations + Experiment summaries",
      }),
    ).not.toHaveTextContent(/Mean|SD|SEM/);
  });

  it("Boxの見出し・SVG説明・書き出しmetadataを実際のレイヤーに同期する", () => {
    const { draft, cells } = proportionFixture();
    render(<ExperimentGraphWorkbench draft={draft} cells={cells} onClose={vi.fn()} />);

    selectInspectorTarget("background");
    fireEvent.change(screen.getByRole("combobox", { name: "グラフの基本形" }), {
      target: { value: "box" },
    });
    const svg = screen.getByRole("img", {
      name: /実験単位ごとのグラフ/,
    }) as unknown as SVGSVGElement;
    expect(screen.getByRole("heading", { name: "Box plot + Biological replicates" })).toBeVisible();
    expect(svg.querySelector("desc")).toHaveTextContent("Box plot + Biological replicates");
    expect(svg.querySelector("desc")).not.toHaveTextContent(/SD|SEM|細胞・ROI分布/);

    selectInspectorTarget("box");
    fireEvent.click(screen.getByRole("checkbox", { name: "箱ひげを表示" }));
    expect(screen.getByRole("heading", { name: "Biological replicates" })).toBeVisible();
    expect(svg.querySelector("desc")).toHaveTextContent("Biological replicates");
    expect(svg.querySelector("desc")).not.toHaveTextContent("Box plot");

    fireEvent.click(screen.getByRole("checkbox", { name: "箱ひげを表示" }));
    selectInspectorTarget("experiment-summary");
    fireEvent.click(screen.getByRole("checkbox", { name: "全体平均を表示" }));
    selectInspectorTarget("error-bar");
    fireEvent.click(screen.getByRole("checkbox", { name: "誤差線を表示" }));
    expect(
      screen.getByRole("heading", {
        name: "Box plot + Biological replicates + SD error bars",
      }),
    ).toBeVisible();
    expect(serializeGraphSvg(svg)).toContain("Box plot + Biological replicates + SD error bars");
  });

  it("複数属性×時間を単純な一時点比較へ黙って縮約しない", () => {
    const { draft, cells } = createComplexProportionFixture();
    render(<ExperimentGraphWorkbench draft={draft} cells={cells} onClose={vi.fn()} />);

    selectInspectorTarget("statistics");
    expect(
      screen.getByRole("heading", { name: "複数の処置と時間が含まれる実験です" }),
    ).toBeVisible();
    expect(screen.getByText(/遺伝子×配列×処置×時間/)).toBeVisible();
    expect(screen.getByText(/全体の交互作用を一度に検定する因子×時間モデルに未対応/)).toBeVisible();
    expect(screen.getByText(/実験全体の因子×時間交互作を検定するものではありません/)).toBeVisible();

    fireEvent.change(screen.getByRole("combobox", { name: "解析する時点" }), {
      target: { value: "time.24" },
    });
    expect(screen.getByRole("heading", { name: "今回に解析する範囲" })).toBeVisible();
    expect(screen.getByText(/因子候補：遺伝子、配列、処置/)).toBeVisible();
    expect(screen.getByText(/属性を自動的にプールしません/)).toBeVisible();
  });

  it("全体表示を明示的に切り替えても表示群と構造を変えない", () => {
    const { draft, cells } = createComplexProportionFixture();
    render(<ExperimentGraphWorkbench draft={draft} cells={cells} onClose={vi.fn()} />);

    const graphScroll = document.querySelector(".experiment-graph-svg-scroll")!;
    expect(graphScroll).toHaveAttribute("data-view-mode", "readable");
    expect(graphScroll.querySelectorAll("[data-condition-index]")).toHaveLength(24);
    fireEvent.click(screen.getByRole("button", { name: "全体表示" }));
    expect(graphScroll).toHaveAttribute("data-view-mode", "fit");
    expect(graphScroll).toHaveClass("is-fit-overview");
    expect(graphScroll.querySelectorAll("[data-condition-index]")).toHaveLength(24);
    fireEvent.click(screen.getByRole("button", { name: "読みやすい表示" }));
    expect(graphScroll).toHaveAttribute("data-view-mode", "readable");
  });

  it("raw dotsのjitterを各カテゴリ中心の局所範囲に制限する", () => {
    const { draft, cells } = nestedFixture();
    render(<ExperimentGraphWorkbench draft={draft} cells={cells} onClose={vi.fn()} />);

    const firstGroup = document.querySelector<SVGGElement>('[data-condition-index="0"]')!;
    const centerLine = firstGroup.querySelector<SVGLineElement>(
      '[data-graph-layer="nested-overall"]',
    )!;
    const center =
      (Number(centerLine.getAttribute("x1")) + Number(centerLine.getAttribute("x2"))) / 2;
    const rawX = [
      ...firstGroup.querySelectorAll<SVGCircleElement>('[data-graph-layer="nested-raw"]'),
    ].map((point) => Number(point.getAttribute("cx")));
    expect(rawX.length).toBeGreaterThan(0);
    expect(Math.max(...rawX.map((value) => Math.abs(value - center)))).toBeLessThanOrEqual(12);
  });

  it("Y軸タイトルと手動範囲をInspectorから編集する", async () => {
    const { draft, cells } = proportionFixture();
    const onStateChange = vi.fn();
    render(
      <ExperimentGraphWorkbench
        draft={draft}
        cells={cells}
        onClose={vi.fn()}
        onStateChange={onStateChange}
      />,
    );

    selectInspectorTarget("y-axis");
    fireEvent.change(screen.getByRole("textbox", { name: "Y軸タイトル" }), {
      target: { value: "陽性細胞（%）" },
    });
    fireEvent.change(screen.getByRole("combobox", { name: "Y軸の範囲" }), {
      target: { value: "manual" },
    });
    fireEvent.change(screen.getByRole("spinbutton", { name: "Y軸の最小値" }), {
      target: { value: "10" },
    });
    fireEvent.change(screen.getByRole("spinbutton", { name: "Y軸の最大値" }), {
      target: { value: "80" },
    });

    expect(screen.getByRole("img", { name: /陽性細胞（%）/ })).toBeVisible();
    await waitFor(() =>
      expect(onStateChange).toHaveBeenLastCalledWith(
        expect.objectContaining({
          axes: expect.objectContaining({
            yTitle: "陽性細胞（%）",
            yRangeMode: "manual",
            yMin: 10,
            yMax: 80,
          }),
        }),
      ),
    );
  });

  it("図の要素を1回クリックすると対応するInspectorへ移動する", () => {
    const { draft, cells } = nestedFixture();
    render(<ExperimentGraphWorkbench draft={draft} cells={cells} onClose={vi.fn()} />);

    const svg = screen.getByRole("img", { name: /実験単位ごとのグラフ/ });
    const yAxis = svg.querySelector(".experiment-graph-axis-hit-target");
    fireEvent.click(yAxis!);
    expect(screen.getByRole("combobox", { name: "編集対象" })).toHaveValue("y-axis");
    expect(screen.getByRole("heading", { name: "Y軸" })).toBeVisible();
    expect(yAxis).toHaveAttribute("data-selected", "true");

    const rawPoint = svg.querySelector('[data-graph-layer="nested-raw"]');
    fireEvent.click(rawPoint!);
    expect(screen.getByRole("combobox", { name: "編集対象" })).toHaveValue("raw-dots");

    const experimentPoint = svg.querySelector('[data-graph-layer="nested-experiment"]');
    fireEvent.click(experimentPoint!);
    expect(screen.getByRole("combobox", { name: "編集対象" })).toHaveValue("experiment-summary");
    expect(experimentPoint).toHaveAttribute("data-selected", "true");

    const xLabel = svg.querySelector("[data-condition-level-label]");
    fireEvent.click(xLabel!);
    expect(screen.getByRole("combobox", { name: "編集対象" })).toHaveValue("x-axis");
    expect(xLabel?.closest('[data-inspector-target="x-axis"]')).toHaveAttribute(
      "data-selected",
      "true",
    );

    const box = svg.querySelector(".experiment-graph-distribution-box");
    fireEvent.click(box!);
    expect(screen.getByRole("combobox", { name: "編集対象" })).toHaveValue("box");

    selectInspectorTarget("violin");
    fireEvent.click(screen.getByRole("checkbox", { name: "バイオリンを表示" }));
    const violin = svg.querySelector('[data-graph-layer="violin"]');
    fireEvent.click(violin!);
    expect(screen.getByRole("combobox", { name: "編集対象" })).toHaveValue("violin");
    expect(violin).toHaveAttribute("data-selected", "true");

    const errorBar = svg.querySelector(".experiment-graph-error-hit-target");
    fireEvent.click(errorBar!);
    expect(screen.getByRole("combobox", { name: "編集対象" })).toHaveValue("error-bar");
    expect(errorBar).toHaveAttribute("data-selected", "true");

    selectInspectorTarget("background");
    fireEvent.change(screen.getByRole("combobox", { name: "色の使い方" }), {
      target: { value: "condition" },
    });
    selectInspectorTarget("legend");
    fireEvent.change(screen.getByRole("combobox", { name: "凡例の位置" }), {
      target: { value: "top" },
    });
    fireEvent.doubleClick(screen.getByLabelText("条件の色"));
    expect(screen.getByRole("combobox", { name: "編集対象" })).toHaveValue("legend");
    expect(screen.getByLabelText("条件の色")).toHaveAttribute("data-selected", "true");

    fireEvent.doubleClick(svg);
    expect(screen.getByRole("combobox", { name: "編集対象" })).toHaveValue("background");
  });

  it("編集対象ごとに関連する設定だけを表示する", () => {
    const { draft, cells } = nestedFixture();
    render(<ExperimentGraphWorkbench draft={draft} cells={cells} onClose={vi.fn()} />);

    selectInspectorTarget("raw-dots");
    expect(screen.getByRole("slider", { name: "生データ点のjitter" })).toBeVisible();
    expect(screen.queryByRole("checkbox", { name: "箱ひげを表示" })).not.toBeInTheDocument();

    selectInspectorTarget("box");
    expect(screen.getByRole("checkbox", { name: "箱ひげを表示" })).toBeVisible();
    expect(screen.queryByRole("slider", { name: "生データ点のjitter" })).not.toBeInTheDocument();

    selectInspectorTarget("error-bar");
    expect(screen.getByRole("combobox", { name: "誤差線の要約方法" })).toBeVisible();

    selectInspectorTarget("legend");
    expect(screen.getByRole("combobox", { name: "凡例の位置" })).toBeVisible();
    expect(screen.getByRole("slider", { name: "凡例の文字サイズ" })).toBeVisible();
  });

  it("nested連続値のraw・実験単位平均・全体平均±SDを独立して切り替える", () => {
    const { draft, cells } = nestedFixture();
    render(<ExperimentGraphWorkbench draft={draft} cells={cells} onClose={vi.fn()} />);

    const workbench = screen.getByRole("region", { name: "実験からグラフを作成" });
    expect(workbench.querySelectorAll('[data-graph-layer="nested-raw"]')).toHaveLength(18);
    expect(workbench.querySelectorAll('[data-graph-layer="nested-distribution"]')).toHaveLength(2);
    expect(workbench.querySelectorAll('[data-graph-layer="nested-experiment"]')).toHaveLength(6);
    expect(workbench.querySelectorAll('[data-graph-layer="nested-overall"]')).toHaveLength(8);
    expect(within(workbench).getByText(/統計上のnは実験単位/)).toBeVisible();
    fireEvent.click(within(workbench).getByText("使用データの内訳を表示"));
    expect(within(workbench).getAllByText(/実験単位 3、細胞・ROI 9/)).toHaveLength(2);

    selectInspectorTarget("raw-dots");
    fireEvent.click(within(workbench).getByRole("checkbox", { name: "生データの点を表示" }));
    expect(workbench.querySelectorAll('[data-graph-layer="nested-raw"]')).toHaveLength(0);
    selectInspectorTarget("box");
    fireEvent.click(within(workbench).getByRole("checkbox", { name: "箱ひげを表示" }));
    expect(workbench.querySelectorAll('[data-graph-layer="nested-distribution"]')).toHaveLength(0);
    selectInspectorTarget("experiment-summary");
    fireEvent.click(within(workbench).getByRole("checkbox", { name: "実験単位の点を表示" }));
    expect(workbench.querySelectorAll('[data-graph-layer="nested-experiment"]')).toHaveLength(0);
    fireEvent.click(within(workbench).getByRole("checkbox", { name: "全体平均を表示" }));
    expect(workbench.querySelectorAll('[data-graph-layer="nested-overall"]')).toHaveLength(0);
  });

  it("同じ単位を追った時間変化だけに個体軌跡を描き、平均線を強く残す", () => {
    const fixture = createLongitudinalFixture();
    render(
      <ExperimentGraphWorkbench draft={fixture.draft} cells={fixture.cells} onClose={vi.fn()} />,
    );
    selectInspectorTarget("background");
    fireEvent.change(screen.getByRole("combobox", { name: "グラフの基本形" }), {
      target: { value: "line" },
    });
    const graph = screen.getByRole("img", { name: /実験単位ごとのグラフ/ });
    expect(graph.querySelectorAll('[data-graph-layer="unit-trajectory"]')).toHaveLength(8);
    expect(graph.querySelectorAll('[data-graph-layer="summary-trend"]')).toHaveLength(2);
  });

  it("時間点ごとに別サンプルなら個体を結ばない", () => {
    const fixture = createLongitudinalFixture();
    const draft = {
      ...fixture.draft,
      time: { ...fixture.draft.time, sampling: "cross_sectional" as const },
    };
    render(<ExperimentGraphWorkbench draft={draft} cells={fixture.cells} onClose={vi.fn()} />);
    selectInspectorTarget("background");
    fireEvent.change(screen.getByRole("combobox", { name: "グラフの基本形" }), {
      target: { value: "line" },
    });
    const graph = screen.getByRole("img", { name: /実験単位ごとのグラフ/ });
    expect(graph.querySelectorAll('[data-graph-layer="unit-trajectory"]')).toHaveLength(0);
    expect(graph.querySelectorAll('[data-graph-layer="summary-trend"]')).toHaveLength(2);
  });

  it("全時間の図を保ったままAUCを解析値に選べる", () => {
    const fixture = createLongitudinalFixture();
    render(
      <ExperimentGraphWorkbench draft={fixture.draft} cells={fixture.cells} onClose={vi.fn()} />,
    );
    const workbench = screen.getByRole("region", { name: "実験からグラフを作成" });
    const plottedBefore = workbench.querySelectorAll("[data-graph-value]").length;
    selectInspectorTarget("statistics");
    fireEvent.change(within(workbench).getByRole("combobox", { name: "時系列の解析値" }), {
      target: { value: "auc" },
    });

    expect(
      within(workbench).queryByRole("combobox", { name: "解析する時点" }),
    ).not.toBeInTheDocument();
    expect(within(workbench).getByRole("combobox", { name: "解析windowの開始" })).toBeVisible();
    expect(within(workbench).getByRole("combobox", { name: "解析windowの終了" })).toBeVisible();
    expect(within(workbench).getByText("対応のあるt検定を推奨")).toBeVisible();
    expect(workbench.querySelectorAll("[data-graph-value]")).toHaveLength(plottedBefore);
  });

  it("各単位のAUCをgraph sourceにしても図を表示し、元の測定項目をlineageに明示する", () => {
    const fixture = createLongitudinalFixture();
    render(
      <ExperimentGraphWorkbench draft={fixture.draft} cells={fixture.cells} onClose={vi.fn()} />,
    );
    selectInspectorTarget("data");
    fireEvent.change(screen.getByRole("combobox", { name: "グラフのデータソース" }), {
      target: { value: "derived_metric" },
    });

    expect(screen.getByRole("img", { name: /実験単位ごとのグラフ/ })).toBeVisible();
    fireEvent.click(screen.getByText("派生値の計算根拠を確認"));
    expect(
      screen.getByText(new RegExp(`元の測定項目：${fixture.draft.readouts[0].label}`)),
    ).toBeVisible();
    expect(screen.getByRole("table", { name: "派生値のラインネージ" })).toBeVisible();
  });

  it("明示した同じ単位を対応グラフとpaired解析へ接続する", async () => {
    const { draft: baseDraft, cells } = proportionFixture();
    const draft = {
      ...baseDraft,
      conditionAssignment: { kind: "matched" as const, unitLabel: "動物" },
    };
    const runner = vi.fn<AnalysisRunner>(async () => analysisResult);
    render(
      <ExperimentGraphWorkbench
        draft={draft}
        cells={cells}
        analysisRunner={runner}
        onClose={vi.fn()}
      />,
    );
    selectInspectorTarget("background");
    fireEvent.change(screen.getByRole("combobox", { name: "グラフの基本形" }), {
      target: { value: "paired_dot" },
    });
    const graph = screen.getByRole("img", { name: /実験単位ごとのグラフ/ });
    expect(graph.querySelectorAll('[data-graph-layer="unit-trajectory"]')).toHaveLength(3);
    selectInspectorTarget("statistics");
    expect(screen.getByText("対応のあるt検定を推奨")).toBeVisible();
    fireEvent.click(screen.getByRole("checkbox", { name: /同じ実験単位の2条件/ }));
    fireEvent.click(screen.getByRole("button", { name: "選択した解析を実行" }));
    await waitFor(() => expect(runner).toHaveBeenCalledTimes(1));
    expect(runner.mock.calls[0][0]).toMatchObject({ templateId: "D02", method: "paired_t" });
    fireEvent.click(screen.getByText("Methodsと再現記録"));
    expect(screen.getByText(/対応構造：同じ／対応づけた実験単位/)).toBeVisible();
  });

  it("条件と時点を最小限の選択で絞り込み、表示時点の変更で古い解析を外す", async () => {
    const { draft: baseDraft, cells: baseCells } = proportionFixture();
    const draft: ExperimentSetDraft = {
      ...baseDraft,
      time: {
        ...baseDraft.time,
        sampling: "cross_sectional",
        points: [
          { id: "time.1", value: 1 },
          { id: "time.2", value: 2 },
        ],
      },
    };
    const readoutId = draft.readouts[0].id;
    const cells: Record<string, ExperimentCellDraft> = {};
    draft.experiments.forEach((experiment, experimentIndex) => {
      draft.conditions.forEach((condition, conditionIndex) => {
        cells[
          experimentCellKey({
            experimentId: experiment.id,
            conditionId: condition.id,
            readoutId,
            timePointId: "time.1",
          })
        ] = {
          kind: "proportion",
          positive: 20 + experimentIndex + conditionIndex,
          eligible: 100,
        };
        cells[
          experimentCellKey({
            experimentId: experiment.id,
            conditionId: condition.id,
            readoutId,
            timePointId: "time.2",
          })
        ] = {
          kind: "proportion",
          positive: 70 + experimentIndex + conditionIndex,
          eligible: 100,
        };
      });
    });
    const runner = vi.fn<AnalysisRunner>(async () => analysisResult);
    render(
      <ExperimentGraphWorkbench
        draft={draft}
        cells={{ ...baseCells, ...cells }}
        analysisRunner={runner}
        onClose={vi.fn()}
      />,
    );

    const workbench = screen.getByRole("region", { name: "実験からグラフを作成" });
    expect(within(workbench).getByRole("checkbox", { name: "すべての時点" })).toBeChecked();
    expect(workbench.querySelector('[data-graph-value="20"]')).toBeInTheDocument();
    expect(workbench.querySelector('[data-graph-value="70"]')).toBeInTheDocument();
    selectInspectorTarget("statistics");
    expect(within(workbench).getByText(/図には全時間を表示したまま/)).toBeVisible();
    fireEvent.change(within(workbench).getByRole("combobox", { name: "解析する時点" }), {
      target: { value: "time.1" },
    });
    expect(workbench.querySelector('[data-graph-value="20"]')).toBeInTheDocument();
    expect(workbench.querySelector('[data-graph-value="70"]')).toBeInTheDocument();
    expect(within(workbench).getByText("Welchの2標本t検定を推奨")).toBeVisible();
    fireEvent.click(within(workbench).getByRole("checkbox", { name: /各条件は別々のdish/ }));
    fireEvent.click(within(workbench).getByRole("button", { name: "選択した解析を実行" }));
    await within(workbench).findByRole("group", { name: "統計解析結果" });

    selectInspectorTarget("data");
    fireEvent.click(within(workbench).getByRole("checkbox", { name: "1 h" }));
    expect(workbench.querySelector('[data-graph-value="70"]')).toBeInTheDocument();
    expect(workbench.querySelector('[data-graph-value="20"]')).not.toBeInTheDocument();
    selectInspectorTarget("statistics");
    expect(within(workbench).queryByRole("group", { name: "統計解析結果" })).toBeNull();
    expect(within(workbench).getByRole("button", { name: "選択した解析を実行" })).toBeDisabled();

    selectInspectorTarget("data");
    const treatmentCheckbox = within(workbench).getByRole("checkbox", { name: "Treatment" });
    fireEvent.click(treatmentCheckbox);
    expect(workbench.querySelectorAll('[data-graph-layer="proportion-experiment"]')).toHaveLength(
      3,
    );
  });

  it("測定項目を変えるとそのグラフの古い結果・注釈・Methodsを外す", async () => {
    const fixture = proportionFixture();
    const secondReadout = {
      id: "readout.intensity",
      label: "Intensity",
      shape: "nested_continuous" as const,
      unit: "a.u.",
    };
    const draft: ExperimentSetDraft = {
      ...fixture.draft,
      readouts: [...fixture.draft.readouts, secondReadout],
    };
    const cells: Record<string, ExperimentCellDraft> = { ...fixture.cells };
    draft.experiments.forEach((experiment, experimentIndex) => {
      draft.conditions.forEach((condition, conditionIndex) => {
        cells[
          experimentCellKey({
            experimentId: experiment.id,
            conditionId: condition.id,
            readoutId: secondReadout.id,
          })
        ] = {
          kind: "nested_continuous",
          source: "manual",
          rawValues: [10 + experimentIndex + conditionIndex],
        };
      });
    });
    const runner = vi.fn<AnalysisRunner>(async () => analysisResult);
    render(
      <ExperimentGraphWorkbench
        draft={draft}
        cells={cells}
        analysisRunner={runner}
        onClose={vi.fn()}
      />,
    );

    selectInspectorTarget("statistics");
    fireEvent.click(screen.getByRole("checkbox", { name: /各条件は別々のdish/ }));
    fireEvent.click(screen.getByRole("button", { name: "選択した解析を実行" }));
    await screen.findByRole("group", { name: "統計解析結果" });
    fireEvent.change(screen.getByRole("combobox", { name: "統計注釈の表示" }), {
      target: { value: "exact_p" },
    });
    fireEvent.click(screen.getByText("Methodsと再現記録"));
    expect(screen.getByText(/解析した測定項目/)).toBeVisible();

    selectInspectorTarget("data");
    fireEvent.change(screen.getByRole("combobox", { name: "測定項目" }), {
      target: { value: secondReadout.id },
    });
    selectInspectorTarget("statistics");

    expect(screen.queryByRole("group", { name: "統計解析結果" })).toBeNull();
    expect(screen.queryByText("Methodsと再現記録")).toBeNull();
    expect(
      screen
        .getByRole("img", { name: /実験単位ごとのグラフ/ })
        .querySelector('[data-graph-layer="statistics-annotation"]'),
    ).toBeNull();
  });
});

import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { vi } from "vitest";

import { createInitialProjectState, ProjectStateSchema } from "@lsaa/project";
import type { AnalysisRunner } from "../app/analysisClient";
import type { SaveProjectAction } from "../app/projectActions";
import { createExperimentSetDraft } from "../app/experimentDraft";
import { createExperimentWorkspaceProject } from "../app/experimentWorkspaceProject";
import { ComparisonWizard } from "./ComparisonWizard";
import { OpenProjectPage } from "./OpenProjectPage";

function openWorkflowTab(name: RegExp) {
  fireEvent.click(screen.getByRole("tab", { name }));
}

function fillAllExperimentalUnits(valueForInput: (inputIndex: number) => string) {
  const unitTabs = screen.getAllByRole("tab", { name: /^N\d+$/ });
  let inputIndex = 0;
  unitTabs.forEach((tab) => {
    fireEvent.click(tab);
    screen.getAllByRole("spinbutton").forEach((input) => {
      fireEvent.change(input, { target: { value: valueForInput(inputIndex) } });
      inputIndex += 1;
    });
  });
}

describe("project UI actions", () => {
  const projectState = createInitialProjectState({
    metadata: {
      projectId: "project.fixture",
      projectName: "Cilia experiment",
      experimentDate: "2026-08-20",
      createdAt: "2026-08-20T00:00:00.000Z",
      updatedAt: "2026-08-20T00:00:00.000Z",
    },
    design: {
      schemaVersion: "0.2.0",
      id: "design.fixture",
      name: "Fixture comparison",
      purpose: "microscopy",
      outcomes: [{ id: "outcome.fixture", key: "fixture", label: "Intensity", type: "continuous" }],
      factors: [
        {
          id: "factor.condition",
          key: "condition",
          label: "Condition",
          levels: [
            { id: "level.a", label: "Control", order: 0 },
            { id: "level.b", label: "Treatment", order: 1 },
          ],
        },
      ],
      conditions: [
        { id: "condition.a", label: "Control", factorLevels: { "factor.condition": "level.a" } },
        { id: "condition.b", label: "Treatment", factorLevels: { "factor.condition": "level.b" } },
      ],
      unitLevels: [
        {
          id: "unit.dish",
          key: "dish",
          label: "Dish",
          role: "experimental_unit",
          parentLevelId: null,
        },
      ],
      experimentalUnitLevelId: "unit.dish",
      pairing: { kind: "independent" },
      plannedN: 1,
      normalizationPlans: [],
      primaryContrast: {
        id: "contrast.fixture",
        label: "Control vs Treatment",
        conditionIds: ["condition.a", "condition.b"],
      },
      wizardRuleVersion: "fixture",
      wizardDecisions: [],
      createdAt: "2026-08-20T00:00:00.000Z",
    },
    rawRevision: {
      id: "raw.fixture.1",
      previousRevisionId: null,
      sourceKind: "manual",
      createdAt: "2026-08-20T00:00:00.000Z",
      createdBy: "test",
    },
    unitInstances: [
      {
        id: "unit.fixture",
        levelId: "unit.dish",
        parentUnitId: null,
        label: "Fixture unit",
        metadata: {},
      },
      {
        id: "unit.fixture.b",
        levelId: "unit.dish",
        parentUnitId: null,
        label: "Fixture unit B",
        metadata: {},
      },
    ],
    observations: [
      {
        id: "observation.fixture",
        rawRevisionId: "raw.fixture.1",
        unitInstanceId: "unit.fixture",
        conditionId: "condition.a",
        outcomeId: "outcome.fixture",
        measurement: { kind: "scalar", value: 1 },
      },
      {
        id: "observation.fixture.b",
        rawRevisionId: "raw.fixture.1",
        unitInstanceId: "unit.fixture.b",
        conditionId: "condition.b",
        outcomeId: "outcome.fixture",
        measurement: { kind: "scalar", value: 2 },
      },
    ],
    actor: "test",
  });

  it("native入口では画面内ボタンをもう一度押さずにfile dialogを開く", async () => {
    const openProject = vi.fn(async () => null);
    render(
      <OpenProjectPage onNavigate={() => undefined} openProject={openProject} autoOpen={true} />,
    );
    await waitFor(() => expect(openProject).toHaveBeenCalledOnce());
  });

  it("旧形式のprojectフォルダは明示的な取込入口から開く", async () => {
    const openProject = vi.fn(async () => null);
    const openLegacyProject = vi.fn(async () => null);
    render(
      <OpenProjectPage
        onNavigate={() => undefined}
        openProject={openProject}
        openLegacyProject={openLegacyProject}
      />,
    );

    fireEvent.click(screen.getByRole("button", { name: "旧形式のprojectフォルダを取り込む" }));
    await waitFor(() => expect(openLegacyProject).toHaveBeenCalledOnce());
    expect(openProject).not.toHaveBeenCalled();
  });

  it("successful local open replaces the large open guidance with the project", async () => {
    const openProject = vi.fn(async () => ({
      state: projectState,
      target: "/tmp/Cilia experiment.lsa",
    }));
    render(<OpenProjectPage onNavigate={() => undefined} openProject={openProject} />);

    fireEvent.click(screen.getByRole("button", { name: /プロジェクトファイルを選ぶ/ }));

    await waitFor(() => expect(openProject).toHaveBeenCalledOnce());
    expect(await screen.findByRole("spinbutton", { name: "Control 実験単位 1" })).toBeVisible();
    expect(
      screen.queryByRole("heading", { name: "ローカルプロジェクトを開く" }),
    ).not.toBeInTheDocument();
  });

  it("新しいworkspace projectを同じ実験回タブとData Sheetで再度開く", async () => {
    const base = createExperimentSetDraft("cell_culture", "proportion");
    const draft = {
      ...base,
      conditions: [
        { ...base.conditions[0], label: "Control", attributes: { "attribute.1": "Control" } },
        { ...base.conditions[1], label: "Treatment", attributes: { "attribute.1": "Treatment" } },
      ],
    };
    const state = createExperimentWorkspaceProject({
      draft,
      cells: {},
      graphs: [],
      now: "2026-08-21T04:00:00.000Z",
    });
    const openProject = vi.fn(async () => ({ state, target: "/tmp/workspace.lsa" }));
    render(<OpenProjectPage onNavigate={() => undefined} openProject={openProject} />);

    fireEvent.click(screen.getByRole("button", { name: /プロジェクトファイルを選ぶ/ }));
    expect(await screen.findByRole("tab", { name: "Exp 1" })).toBeInTheDocument();
    fireEvent.click(screen.getByRole("tab", { name: "Exp 1" }));
    expect(screen.getByRole("columnheader", { name: "条件" })).toBeVisible();
    expect(screen.getByRole("spinbutton", { name: "Controlの陽性数" })).toBeInTheDocument();
  });

  it("開いたプロジェクトを再編集し、同じ保存先へ新しい生データ履歴として保存する", async () => {
    const target = "/tmp/Cilia experiment.lsa";
    const openProject = vi.fn(async () => ({ state: projectState, target }));
    const saveProject = vi.fn<SaveProjectAction>(async (state, existingTarget) => ({
      state,
      target: existingTarget ?? target,
    }));
    render(
      <OpenProjectPage
        onNavigate={() => undefined}
        openProject={openProject}
        saveProject={saveProject}
      />,
    );

    fireEvent.click(screen.getByRole("button", { name: /プロジェクトファイルを選ぶ/ }));
    const measurement = await screen.findByRole("spinbutton", {
      name: "Control 実験単位 1",
    });
    expect(measurement).toHaveValue(1);
    const experimentDate = screen.getByLabelText("Control 実験単位 1：実験日");
    fireEvent.change(experimentDate, { target: { value: "2026-08-19" } });
    fireEvent.change(measurement, { target: { value: "9" } });
    fireEvent.click(screen.getByRole("button", { name: /検証して続ける/ }));
    openWorkflowTab(/4 保存/);
    fireEvent.click(screen.getByRole("button", { name: "プロジェクトを保存" }));

    await waitFor(() => expect(saveProject).toHaveBeenCalledOnce());
    expect(saveProject.mock.calls[0]?.[1]).toBe(target);
    const revised = saveProject.mock.calls[0]?.[0];
    expect(revised?.rawRevisions).toHaveLength(2);
    expect(
      revised?.observations.find((item) => item.rawRevisionId === "raw.fixture.1")?.measurement,
    ).toEqual({ kind: "scalar", value: 1 });
    expect(
      revised?.observations.find(
        (item) =>
          item.rawRevisionId === revised.activeRawRevisionId && item.conditionId === "condition.a",
      )?.measurement,
    ).toEqual({ kind: "scalar", value: 9 });
    expect(
      revised?.observations.find(
        (item) =>
          item.rawRevisionId === revised.activeRawRevisionId && item.conditionId === "condition.a",
      )?.experimentDate,
    ).toBe("2026-08-19");
  });

  it("keeps the open page unchanged and reports handler errors", async () => {
    const openProject = vi.fn(async () => {
      throw new Error("The package is corrupted");
    });
    render(<OpenProjectPage onNavigate={() => undefined} openProject={openProject} />);

    fireEvent.click(screen.getByRole("button", { name: /プロジェクトファイルを選ぶ/ }));

    expect(await screen.findByRole("alert")).toHaveTextContent("The package is corrupted");
    expect(screen.getByRole("heading", { name: "ローカルプロジェクトを開く" })).toBeVisible();
    expect(screen.getByRole("button", { name: /プロジェクトファイルを選ぶ/ })).toBeEnabled();
  });

  it("shows Save as not ready when no desktop save handler is injected", () => {
    render(<ComparisonWizard purpose="microscopy" onBack={() => undefined} />);
    fireEvent.click(screen.getByRole("button", { name: /このデザインを確定/ }));
    fireEvent.click(screen.getByRole("button", { name: /顕微鏡強度/ }));
    openWorkflowTab(/4 保存/);

    expect(screen.getByRole("button", { name: "プロジェクトを保存" })).toBeDisabled();
    expect(screen.getByText(/デスクトップのプロジェクト保存機能が未接続/)).toBeVisible();
  });

  it("preserves the data sheet when the injected save handler fails", async () => {
    const saveProject = vi.fn<SaveProjectAction>(async () => {
      throw new Error("Disk is full");
    });
    render(
      <ComparisonWizard purpose="microscopy" onBack={() => undefined} saveProject={saveProject} />,
    );
    fireEvent.click(screen.getByRole("button", { name: /このデザインを確定/ }));
    fireEvent.click(screen.getByRole("button", { name: /顕微鏡強度/ }));

    fillAllExperimentalUnits((index) => (index === 0 ? "12.5" : String(index + 1)));
    fireEvent.click(screen.getByRole("tab", { name: "N1" }));
    const firstMeasurement = screen.getByRole("spinbutton", {
      name: /^(条件A|対照) 実験単位 1$/,
    });
    fireEvent.click(screen.getByRole("button", { name: /検証して続ける/ }));
    openWorkflowTab(/4 保存/);
    fireEvent.click(screen.getByRole("button", { name: "プロジェクトを保存" }));

    expect(await screen.findByRole("alert")).toHaveTextContent("Disk is full");
    expect(firstMeasurement).toHaveValue(12.5);
    expect(saveProject).toHaveBeenCalledOnce();
    const savedState = saveProject.mock.calls[0]?.[0];
    expect(savedState).toBeDefined();
    expect(ProjectStateSchema.safeParse(savedState).success).toBe(true);
    expect(
      savedState?.observations.every((observation) =>
        observation.rawRevisionId.startsWith("raw-revision."),
      ),
    ).toBe(true);
  });

  it("persists wizard metadata without changing canonical measurements", async () => {
    const saveProject = vi.fn<SaveProjectAction>(async (state) => ({
      state,
      target: "/tmp/metadata.lsa",
    }));
    render(
      <ComparisonWizard purpose="microscopy" onBack={() => undefined} saveProject={saveProject} />,
    );
    fireEvent.change(screen.getByRole("textbox", { name: "プロジェクト名" }), {
      target: { value: "Cilia dose response" },
    });
    fireEvent.change(screen.getByLabelText(/実験日/), { target: { value: "2026-08-19" } });
    fireEvent.change(screen.getByRole("textbox", { name: "実施者（任意）" }), {
      target: { value: "A. Researcher" },
    });
    fireEvent.change(screen.getByRole("textbox", { name: "バッチ／ロット（任意）" }), {
      target: { value: "batch-7" },
    });
    fireEvent.change(screen.getByRole("textbox", { name: "メモ（任意）" }), {
      target: { value: "Metadata only" },
    });
    fireEvent.click(screen.getByRole("button", { name: /このデザインを確定/ }));
    fireEvent.click(screen.getByRole("button", { name: /顕微鏡強度/ }));
    fillAllExperimentalUnits((index) => String(index + 1));
    fireEvent.click(screen.getByRole("button", { name: /検証して続ける/ }));
    openWorkflowTab(/4 保存/);
    fireEvent.click(screen.getByRole("button", { name: "プロジェクトを保存" }));

    await waitFor(() => expect(saveProject).toHaveBeenCalledOnce());
    const saved = saveProject.mock.calls[0]?.[0];
    expect(saved?.metadata).toMatchObject({
      projectName: "Cilia dose response",
      experimentDate: "2026-08-19",
      operator: "A. Researcher",
      batch: "batch-7",
      note: "Metadata only",
    });
    expect(saved?.analysisRuns).toHaveLength(0);
    expect(saved?.observations).toHaveLength(6);
    expect(saved?.observations.map((observation) => observation.measurement)).toEqual([
      { kind: "scalar", value: 1 },
      { kind: "scalar", value: 3 },
      { kind: "scalar", value: 5 },
      { kind: "scalar", value: 2 },
      { kind: "scalar", value: 4 },
      { kind: "scalar", value: 6 },
    ]);
  });

  it("creates a new immutable raw revision when saved data is edited", async () => {
    const saveProject = vi.fn<SaveProjectAction>(async (state) => ({
      state,
      target: "/tmp/revisions.lsa",
    }));
    render(
      <ComparisonWizard purpose="microscopy" onBack={() => undefined} saveProject={saveProject} />,
    );
    fireEvent.click(screen.getByRole("button", { name: /このデザインを確定/ }));
    fireEvent.click(screen.getByRole("button", { name: /顕微鏡強度/ }));
    fillAllExperimentalUnits((index) => String(index + 1));
    fireEvent.click(screen.getByRole("button", { name: /検証して続ける/ }));
    openWorkflowTab(/4 保存/);
    fireEvent.click(screen.getByRole("button", { name: "プロジェクトを保存" }));
    await waitFor(() => expect(saveProject).toHaveBeenCalledTimes(1));

    openWorkflowTab(/1 データ入力/);
    fireEvent.click(screen.getByRole("tab", { name: "N1" }));
    const firstMeasurement = screen.getByRole("spinbutton", {
      name: /^(条件A|対照) 実験単位 1$/,
    });
    fireEvent.change(firstMeasurement, { target: { value: "9" } });
    fireEvent.click(screen.getByRole("button", { name: /検証して続ける/ }));
    openWorkflowTab(/4 保存/);
    fireEvent.click(screen.getByRole("button", { name: "プロジェクトを保存" }));
    await waitFor(() => expect(saveProject).toHaveBeenCalledTimes(2));

    const first = saveProject.mock.calls[0]?.[0];
    const second = saveProject.mock.calls[1]?.[0];
    expect(first?.rawRevisions).toHaveLength(1);
    expect(second?.rawRevisions).toHaveLength(2);
    expect(second?.rawRevisions[1].previousRevisionId).toBe(first?.activeRawRevisionId);
    expect(second?.observations).toHaveLength((first?.observations.length ?? 0) * 2);
  });

  it("ImageJ貼り付けの出所を保存し、手修正した値だけ出所を解除する", async () => {
    const saveProject = vi.fn<SaveProjectAction>(async (state) => ({
      state,
      target: "/tmp/imagej-paste.lsa",
    }));
    render(
      <ComparisonWizard purpose="microscopy" onBack={() => undefined} saveProject={saveProject} />,
    );
    fireEvent.click(screen.getByRole("button", { name: /このデザインを確定/ }));
    fireEvent.click(screen.getByRole("button", { name: /顕微鏡強度/ }));

    const paste = screen.getByRole("textbox", { name: "スカラー値を貼り付け" });
    fireEvent.change(paste, { target: { value: "Area\tMean\n1\t10\n2\t20\n3\t30" } });
    fireEvent.click(screen.getByRole("button", { name: "選択した条件に適用" }));
    fireEvent.change(screen.getByRole("spinbutton", { name: /^(条件A|対照) 実験単位 1$/ }), {
      target: { value: "11" },
    });

    fireEvent.change(screen.getByRole("combobox", { name: "貼り付け先の条件" }), {
      target: { value: "condition.b" },
    });
    fireEvent.change(paste, { target: { value: "Mean\n40\n50\n60" } });
    fireEvent.click(screen.getByRole("button", { name: "選択した条件に適用" }));

    fireEvent.click(screen.getByRole("button", { name: /検証して続ける/ }));
    openWorkflowTab(/4 保存/);
    fireEvent.click(screen.getByRole("button", { name: "プロジェクトを保存" }));
    await waitFor(() => expect(saveProject).toHaveBeenCalledOnce());

    const saved = saveProject.mock.calls[0]?.[0];
    expect(saved?.rawRevisions[0].sourceKind).toBe("paste");
    const manuallyChanged = saved?.observations.find(
      (observation) =>
        observation.measurement.kind === "scalar" && observation.measurement.value === 11,
    );
    const retainedPasteOrigin = saved?.observations.find(
      (observation) =>
        observation.measurement.kind === "scalar" && observation.measurement.value === 20,
    );
    expect(manuallyChanged?.sourceLocation).toBeUndefined();
    expect(retainedPasteOrigin?.sourceLocation).toBe("clipboard:Mean:row:2");
  });

  it.each([
    ["western_blot", "wb-intensity", "scalar"],
    ["microscopy", "microscopy-intensity", "scalar"],
    ["microscopy", "positive-cell-proportion", "proportion"],
  ] as const)(
    "persists analysis and graph history for %s / %s",
    async (purpose, outcomeChoice, measurementKind) => {
      const analysisRunner: AnalysisRunner = async (request) => ({
        protocolVersion: "0.1.0",
        requestId: request.requestId,
        status: "ok",
        engine: { name: "fixture-engine", version: "0.1.0", packages: { scipy: "1.18.0" } },
        estimates: [
          {
            name: "mean_difference",
            value: -1,
            standardError: 0.2,
            confidenceInterval: { level: 0.95, lower: -1.5, upper: -0.5 },
          },
        ],
        tests: [
          {
            name: "welch_two_sample_t_test",
            statisticName: "t",
            statistic: -5,
            degreesOfFreedom: [4],
            pValue: 0.01,
            adjustedPValue: null,
            effectSizeName: "hedges_g",
            effectSize: -1.2,
          },
        ],
        diagnostics: [],
        warnings: [],
        completedAt: "2026-08-20T01:00:00Z",
      });
      const saveProject = vi.fn<SaveProjectAction>(async (state) => ({
        state,
        target: `/tmp/${outcomeChoice}.lsa`,
      }));
      render(
        <ComparisonWizard
          purpose={purpose}
          onBack={() => undefined}
          analysisRunner={analysisRunner}
          saveProject={saveProject}
        />,
      );
      fireEvent.click(screen.getByRole("button", { name: /このデザインを確定/ }));
      fireEvent.click(document.querySelector(`[data-outcome-choice="${outcomeChoice}"]`)!);
      fillAllExperimentalUnits((index) =>
        measurementKind === "proportion"
          ? index % 2 === 0
            ? String(40 + Math.floor(index / 2))
            : "100"
          : String(index + 1),
      );
      fireEvent.click(screen.getByRole("button", { name: /検証して続ける/ }));
      fireEvent.click(screen.getByRole("button", { name: /推奨解析を実行/ }));
      expect((await screen.findAllByText(/fixture-engine 0.1.0/))[0]).toBeVisible();
      openWorkflowTab(/4 保存/);
      fireEvent.click(screen.getByRole("button", { name: "プロジェクトを保存" }));
      await waitFor(() => expect(saveProject).toHaveBeenCalledOnce());

      const saved = saveProject.mock.calls[0]?.[0];
      expect(ProjectStateSchema.safeParse(saved).success).toBe(true);
      expect(saved?.analysisRuns).toHaveLength(1);
      expect(saved?.graphs).toHaveLength(1);
      expect(saved?.observations[0].measurement.kind).toBe(measurementKind);

      openWorkflowTab(/3 グラフ/);
      fireEvent.change(screen.getByRole("slider", { name: "点の大きさ" }), {
        target: { value: "8" },
      });
      openWorkflowTab(/4 保存/);
      fireEvent.click(screen.getByRole("button", { name: "プロジェクトを保存" }));
      await waitFor(() => expect(saveProject).toHaveBeenCalledTimes(2));
      const restyled = saveProject.mock.calls[1]?.[0];
      expect(restyled?.analysisRuns).toHaveLength(1);
      expect(restyled?.graphs).toHaveLength(1);
      expect(restyled?.graphs[0].spec.appearance.pointSize).toBe(8);
      expect(restyled?.graphs[0].spec.summary.interval).toBe("sd");
    },
  );
});

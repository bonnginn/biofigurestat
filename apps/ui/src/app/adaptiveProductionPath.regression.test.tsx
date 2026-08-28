import { fireEvent, render, screen, within } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import type { AnalysisEngineResult } from "@lsaa/analysis-contracts";

import {
  CanonicalAdaptiveObservationSchema,
  type CanonicalAdaptiveObservation,
  type StructureContract,
} from "@lsaa/domain";
import { ProjectStateSchema, type ProjectState } from "@lsaa/project";
import {
  BiologicalExperimentSetup,
  buildConditionCombinations,
  safelyBuildBiologicalSetup,
  type ConditionEntryBlock,
} from "../components/BiologicalExperimentSetup";
import { createAdaptiveWorkspace } from "./adaptiveWorkspace";
import { assessDraftGraphAnalysis } from "./experimentDraftAnalysis";
import {
  createExperimentWorkspaceProject,
  rehydrateExperimentWorkspace,
} from "./experimentWorkspaceProject";
import { ExperimentWorkspace } from "../pages/ExperimentWorkspace";

const now = "2026-08-28T00:00:00.000Z";

function block(id: string, name: string, values: string[]): ConditionEntryBlock {
  return {
    id,
    name,
    showGroups: false,
    groupLabels: ["", "", "", "", ""],
    values: [
      [...values, ...Array.from({ length: Math.max(0, 5 - values.length) }, () => "")],
      ["", "", "", "", ""],
      ["", "", "", "", ""],
      ["", "", "", "", ""],
      ["", "", "", "", ""],
    ],
  };
}

function biologicalContract(input: {
  title: string;
  measurement: string;
  form: "single" | "positive_total";
  blocks: readonly ConditionEntryBlock[];
  receiver: string;
  relationship?: "separate" | "same" | "shared_source";
  source?: string;
  orderedAxis?: {
    label: string;
    unit: string;
    levels: readonly (string | number)[];
    sameIdentity: boolean;
  };
  child?: string;
}): StructureContract {
  const combinations = buildConditionCombinations(input.blocks);
  const built = safelyBuildBiologicalSetup({
    title: input.title,
    measurementLabel: input.measurement,
    valueForm: input.form,
    blocks: input.blocks,
    combinations,
    statuses: {},
    receiverLabel: input.receiver,
    receiverIdLabel: "",
    relationship: input.relationship ?? "separate",
    sourceLabel: input.source ?? "",
    sourceIdLabel: "",
    childLabel: input.child ?? "",
    ...(input.orderedAxis ? { orderedAxis: input.orderedAxis } : {}),
    ...(input.relationship === "shared_source" && input.blocks.length > 1
      ? { sharedSourcePairedBlockId: input.blocks[0]!.id }
      : {}),
  });
  if (built.status !== "ready") throw new Error(built.reason);
  return built.result.contract;
}

function observation(
  contract: StructureContract,
  index: number,
  input: {
    identities: Record<string, string>;
    factors: Record<string, string>;
    axes?: Record<string, string | number>;
    values: Record<string, number | null>;
    sourceRow?: number | null;
    missingness?: Record<string, "unknown" | "not_collected" | "not_applicable">;
  },
): CanonicalAdaptiveObservation {
  return CanonicalAdaptiveObservationSchema.parse({
    observationId: `${contract.contractId}.observation.${index}`,
    readoutKey: contract.readouts[0]!.key,
    identities: input.identities,
    factors: input.factors,
    axes: input.axes ?? {},
    hierarchy: {},
    values: input.values,
    missingness: input.missingness ?? {},
    sourceRow: input.sourceRow ?? null,
  });
}

describe("adaptive production path regressions", () => {
  it("takes an independent scalar experiment through unequal-n entry, save/open, Graph, and Statistics", async () => {
    const contract = biologicalContract({
      title: "Independent drug response",
      measurement: "Fluorescence intensity",
      form: "single",
      blocks: [block("treatment", "Treatment", ["Control", "Drug"])],
      receiver: "culture dish",
    });
    const workspace = createAdaptiveWorkspace({
      contract,
      observations: [],
      mapping: null,
      lineage: null,
      now,
    });
    expect(workspace.status).toBe("ready");
    expect(workspace.draft).not.toBeNull();

    const saveProject = vi.fn(async (state: ProjectState, target?: string) => ({
      state,
      target: target ?? "/tmp/adaptive-scalar.lsa",
    }));
    const analysisRunner = vi.fn(async (request): Promise<AnalysisEngineResult> => ({
      protocolVersion: request.protocolVersion,
      requestId: request.requestId,
      status: "ok",
      engine: { name: "adaptive-regression-engine", version: "0.1.0", packages: {} },
      estimates: [],
      tests: [
        {
          name: "welch_two_sample_t_test",
          statisticName: "t",
          statistic: -2.1,
          degreesOfFreedom: [2.8],
          pValue: 0.12,
          adjustedPValue: null,
          effectSizeName: "hedges_g",
          effectSize: -1,
        },
      ],
      diagnostics: [],
      warnings: [],
      completedAt: now,
    }));
    render(
      <ExperimentWorkspace
        initialDraft={workspace.draft!}
        initialCells={workspace.cells}
        onBack={vi.fn()}
        saveProject={saveProject}
        analysisRunner={analysisRunner}
        analysisAvailable
      />,
    );
    const control = screen.getByRole("textbox", {
      name: "Fluorescence intensity・Treatment=Controlの測定値",
    });
    fireEvent.change(control, { target: { value: "12.5\n13.5" } });
    fireEvent.blur(control);
    const drug = screen.getByRole("textbox", {
      name: "Fluorescence intensity・Treatment=Drugの測定値",
    });
    fireEvent.change(drug, { target: { value: "15\n16\n17" } });
    fireEvent.blur(drug);
    expect(screen.getByLabelText("入力した測定値の件数")).toHaveTextContent("5件の測定値");
    expect(screen.queryByRole("navigation", { name: "実験の表示切り替え" })).toBeNull();
    expect(screen.queryByRole("button", { name: /＋ 入力行/ })).toBeNull();

    fireEvent.click(screen.getByRole("button", { name: "すべての値" }));
    const expanded = screen.getByRole("table", { name: "すべての値を表示" });
    expect(
      within(expanded).getByRole("textbox", {
        name: "Control 1のFluorescence intensity",
      }),
    ).toHaveValue("12.5");
    expect(within(expanded).getByRole("button", { name: "Control 1を削除" })).toBeVisible();
    expect(
      within(expanded).getByRole("textbox", {
        name: "Drug 3のFluorescence intensity",
      }),
    ).toHaveValue("17");

    // Capture the canonical IDs before the researcher-facing identity is edited. The
    // display identity is allowed to change; the internal observation identity is not.
    fireEvent.click(screen.getByRole("button", { name: "プロジェクトを保存" }));
    await vi.waitFor(() => expect(saveProject).toHaveBeenCalledTimes(1));
    const beforeIdentityEdit = saveProject.mock.calls[0]![0];
    const beforeCanonicalIds = beforeIdentityEdit.adaptiveInput!.canonicalObservations.map(
      ({ observationId }) => observationId,
    );

    const firstIdentity = within(expanded).getByRole("textbox", {
      name: "Control 1のculture dish ID",
    });
    fireEvent.change(firstIdentity, { target: { value: "Dish-C1" } });
    fireEvent.blur(firstIdentity);
    expect(
      within(expanded).getByRole("textbox", {
        name: "Dish-C1のFluorescence intensity",
      }),
    ).toHaveValue("12.5");
    expect(within(expanded).getByRole("button", { name: "Dish-C1を削除" })).toBeVisible();

    const secondIdentity = within(expanded).getByRole("textbox", {
      name: "Control 2のculture dish ID",
    });
    fireEvent.change(secondIdentity, { target: { value: "Dish-C1" } });
    fireEvent.blur(secondIdentity);
    expect(screen.getByRole("alert")).toHaveTextContent("同じ名前がすでにあります");
    expect(
      within(expanded).getByRole("textbox", {
        name: "Control 2のFluorescence intensity",
      }),
    ).toHaveValue("13.5");

    fireEvent.click(screen.getByRole("button", { name: "プロジェクトを保存" }));
    await vi.waitFor(() => expect(saveProject).toHaveBeenCalledTimes(2));
    const saved = saveProject.mock.calls[1]![0];
    expect(saved.adaptiveInput?.canonicalObservations).toHaveLength(5);
    expect(
      saved.observations.filter(({ rawRevisionId }) => rawRevisionId === saved.activeRawRevisionId),
    ).toHaveLength(5);
    expect(
      saved.adaptiveInput?.canonicalObservations.map(({ observationId }) => observationId),
    ).toEqual(beforeCanonicalIds);
    const experimentalIdentityKey = contract.identities.find(
      ({ unitLevelKey }) => unitLevelKey === contract.experimentalUnitLevelKey,
    )!.key;
    const savedHumanIdentities = saved.adaptiveInput!.canonicalObservations.map(
      ({ identities }) => identities[experimentalIdentityKey],
    );
    expect(savedHumanIdentities).toContain("Dish-C1");
    expect(savedHumanIdentities).toContain("Control 2");
    expect(new Set(savedHumanIdentities)).toHaveLength(5);
    expect(
      new Set(
        saved.observations
          .filter(({ rawRevisionId }) => rawRevisionId === saved.activeRawRevisionId)
          .map(({ unitInstanceId }) => unitInstanceId),
      ),
    ).toHaveLength(5);
    const reopened = rehydrateExperimentWorkspace(
      ProjectStateSchema.parse(JSON.parse(JSON.stringify(saved))),
    );
    expect(reopened?.draft.adaptiveInput?.canonicalObservations).toHaveLength(5);
    expect(
      reopened?.draft.adaptiveInput?.canonicalObservations.map(
        ({ observationId }) => observationId,
      ),
    ).toEqual(beforeCanonicalIds);
    expect(
      reopened?.draft.adaptiveInput?.canonicalObservations.map(
        ({ identities }) => identities[experimentalIdentityKey],
      ),
    ).toEqual(savedHumanIdentities);
    expect(
      reopened?.draft.adaptiveInput?.canonicalObservations.filter(
        ({ factors }) => factors.treatment === "Control",
      ),
    ).toHaveLength(2);
    expect(
      reopened?.draft.adaptiveInput?.canonicalObservations.filter(
        ({ factors }) => factors.treatment === "Drug",
      ),
    ).toHaveLength(3);

    fireEvent.click(screen.getByRole("button", { name: "＋ グラフを作成" }));
    fireEvent.click(screen.getByRole("button", { name: "このグラフを作成" }));
    expect(screen.getByRole("img", { name: /実験単位ごとのグラフ/ })).toBeVisible();
    expect(screen.getByLabelText(/Control 入力行 1の実験単位平均/)).toBeVisible();
    expect(screen.queryByLabelText(/Control Run 1/)).toBeNull();
    expect(screen.queryByRole("region", { name: "統計ワークスペース" })).toBeNull();
    fireEvent.click(screen.getByRole("button", { name: "統計" }));
    expect(screen.getByRole("region", { name: "統計ワークスペース" })).toBeVisible();
    expect(screen.queryByRole("checkbox", { name: /各条件は別々のdish・試料/ })).toBeNull();
    expect(screen.getByRole("status", { name: "実験構造の確認状況" })).toHaveTextContent(
      "条件ごとに別々の実験単位",
    );
    expect(screen.queryByText(/表上の空欄または無効な値/)).toBeNull();
    fireEvent.click(screen.getByRole("button", { name: "選択した解析を実行" }));
    await vi.waitFor(() => expect(analysisRunner).toHaveBeenCalledTimes(1));
    expect(analysisRunner.mock.calls[0]![0]).toMatchObject({
      templateId: "D01",
      method: "welch_t",
    });
    expect(analysisRunner.mock.calls[0]![0].observations).toHaveLength(5);
    expect(
      new Set(
        analysisRunner.mock.calls[0]![0].observations.map(
          ({ experimentalUnitId }: { experimentalUnitId: string }) => experimentalUnitId,
        ),
      ),
    ).toHaveLength(5);
    expect(await screen.findByRole("group", { name: "統計解析結果" })).toHaveTextContent(
      "p = 0.12",
    );
  });

  it("distinguishes an explicitly retained missing unit from unequal-n projection padding", () => {
    const contract = biologicalContract({
      title: "Independent response with one missing measurement",
      measurement: "Fluorescence intensity",
      form: "single",
      blocks: [block("treatment", "Treatment", ["Control", "Drug"])],
      receiver: "culture dish",
    });
    const factorKey = contract.factors[0]!.key;
    const readoutKey = contract.readouts[0]!.key;
    const identityKey = contract.identities.find(
      ({ unitLevelKey }) => unitLevelKey === contract.experimentalUnitLevelKey,
    )!.key;
    const rows = [
      ["Control", "Dish-C1", 10],
      ["Control", "Dish-C2", 12],
      ["Drug", "Dish-D1", 14],
      ["Drug", "Dish-D2", 16],
      ["Drug", "Dish-D3", null],
    ] as const;
    const workspace = createAdaptiveWorkspace({
      contract,
      observations: rows.map(([condition, identity, value], index) =>
        observation(contract, index, {
          identities: { [identityKey]: identity },
          factors: { [factorKey]: condition },
          values: { [readoutKey]: value },
          ...(value === null ? { missingness: { [readoutKey]: "not_collected" } } : {}),
        }),
      ),
      mapping: null,
      lineage: null,
      now,
    });
    expect(workspace.status).toBe("ready");
    const draft = workspace.draft!;
    const assessment = assessDraftGraphAnalysis({
      draft,
      cells: workspace.cells,
      readoutId: draft.readouts[0]!.id,
      conditionIds: draft.conditions.map(({ id }) => id),
    });

    expect(assessment).toMatchObject({
      state: "ready",
      missingCount: 1,
      nByCondition: [{ n: 2 }, { n: 2 }],
    });
  });

  it("shows imported canonical data in compact and all-value views without breaking lineage", async () => {
    const contract = biologicalContract({
      title: "Imported drug response",
      measurement: "Cell area",
      form: "single",
      blocks: [block("treatment", "Treatment", ["Control", "Drug"])],
      receiver: "culture dish",
    });
    const factorKey = contract.factors[0]!.key;
    const readoutKey = contract.readouts[0]!.key;
    const identityKey = contract.identities.find(
      ({ unitLevelKey }) => unitLevelKey === contract.experimentalUnitLevelKey,
    )!.key;
    const observations = [
      observation(contract, 0, {
        identities: { [identityKey]: "Dish-C1" },
        factors: { [factorKey]: "Control" },
        values: { [readoutKey]: 10 },
        sourceRow: 2,
      }),
      observation(contract, 1, {
        identities: { [identityKey]: "Dish-D1" },
        factors: { [factorKey]: "Drug" },
        values: { [readoutKey]: 14 },
        sourceRow: 3,
      }),
    ];
    const mapping = {
      schemaVersion: "0.1.0" as const,
      sourceLabel: "clipboard",
      delimiter: "tab" as const,
      headerRow: 1,
      columns: {
        DishID: {
          role: "identity" as const,
          semanticKey: identityKey,
          fixedFactors: {},
          fixedAxes: {},
        },
        Condition: {
          role: "factor" as const,
          semanticKey: factorKey,
          fixedFactors: {},
          fixedAxes: {},
        },
        Value: {
          role: "value" as const,
          semanticKey: readoutKey,
          fixedFactors: {},
          fixedAxes: {},
        },
      },
      confirmedAt: now,
    };
    const lineage = {
      schemaVersion: "0.1.0" as const,
      sourceKind: "clipboard" as const,
      sourceLabel: "clipboard",
      importedAt: now,
      rawText: "DishID\tCondition\tValue\nDish-C1\tControl\t10\nDish-D1\tDrug\t14",
      sha256: null,
      transformations: ["confirmed_column_mapping"],
    };
    const workspace = createAdaptiveWorkspace({
      contract,
      observations,
      mapping,
      lineage,
      now,
    });
    expect(workspace.status).toBe("ready");
    const saveProject = vi.fn(async (state: ProjectState, target?: string) => ({
      state,
      target: target ?? "/tmp/imported-adaptive.lsa",
    }));

    render(
      <ExperimentWorkspace
        initialDraft={workspace.draft!}
        initialCells={workspace.cells}
        onBack={vi.fn()}
        saveProject={saveProject}
      />,
    );

    const compact = screen.getByRole("table", { name: "条件ごとにまとめて表示" });
    expect(within(compact).queryByRole("textbox")).toBeNull();
    expect(within(compact).getByText("10")).toBeVisible();
    expect(within(compact).getByText("14")).toBeVisible();
    expect(screen.getByLabelText("保持している測定値の件数")).toHaveTextContent("2件の測定値");
    expect(screen.queryByRole("navigation", { name: "実験の表示切り替え" })).toBeNull();
    expect(screen.queryByRole("button", { name: /＋ 入力行/ })).toBeNull();

    fireEvent.click(screen.getByRole("button", { name: "すべての値" }));
    const expanded = screen.getByRole("table", { name: "すべての値を表示" });
    expect(within(expanded).getByRole("columnheader", { name: "元データ行" })).toBeVisible();
    expect(within(expanded).getAllByText("Dish-C1").length).toBeGreaterThan(0);
    expect(within(expanded).getAllByText("Dish-D1").length).toBeGreaterThan(0);
    expect(
      [...expanded.querySelectorAll('[data-column-role="source_row"]')].map(
        (cell) => cell.textContent,
      ),
    ).toEqual(["2", "3"]);
    expect(within(expanded).queryByRole("textbox")).toBeNull();
    expect(within(expanded).queryByRole("button", { name: /削除/ })).toBeNull();

    fireEvent.click(screen.getByRole("button", { name: "プロジェクトを保存" }));
    await vi.waitFor(() => expect(saveProject).toHaveBeenCalledTimes(1));
    const saved = saveProject.mock.calls[0]![0];
    expect(saved.adaptiveInput?.mapping).toEqual(mapping);
    expect(saved.adaptiveInput?.rawLineage).toEqual(lineage);
    expect(saved.adaptiveInput?.canonicalObservations).toEqual(observations);
  });

  it("treats a canonical source-row marker as read-only lineage even without snapshot metadata", () => {
    const contract = biologicalContract({
      title: "Source-row-only import",
      measurement: "Signal",
      form: "single",
      blocks: [block("treatment", "Treatment", ["Control", "Drug"])],
      receiver: "culture dish",
    });
    const factorKey = contract.factors[0]!.key;
    const readoutKey = contract.readouts[0]!.key;
    const identityKey = contract.identities.find(
      ({ unitLevelKey }) => unitLevelKey === contract.experimentalUnitLevelKey,
    )!.key;
    const workspace = createAdaptiveWorkspace({
      contract,
      observations: [
        observation(contract, 0, {
          identities: { [identityKey]: "Dish-1" },
          factors: { [factorKey]: "Control" },
          values: { [readoutKey]: 5 },
          sourceRow: 7,
        }),
      ],
      mapping: null,
      lineage: null,
      now,
    });
    expect(workspace.status).toBe("ready");

    render(
      <ExperimentWorkspace
        initialDraft={workspace.draft!}
        initialCells={workspace.cells}
        onBack={vi.fn()}
      />,
    );

    expect(screen.getByRole("table", { name: "条件ごとにまとめて表示" })).toBeVisible();
    expect(screen.getByRole("button", { name: "まとめて表示" })).toBeVisible();
    expect(screen.queryByRole("navigation", { name: "実験の表示切り替え" })).toBeNull();
    expect(screen.queryByRole("button", { name: /＋ 入力行/ })).toBeNull();
  });

  it("preserves imported child IDs and source rows across an interior missing value and unchanged save", async () => {
    const contract = biologicalContract({
      title: "Imported cell measurements",
      measurement: "Cell intensity",
      form: "single",
      blocks: [block("treatment", "Treatment", ["Control", "Drug"])],
      receiver: "culture dish",
      child: "Cell",
    });
    const factorKey = contract.factors[0]!.key;
    const readout = contract.readouts[0]!;
    const experimentalIdentityKey = contract.identities.find(
      ({ unitLevelKey }) => unitLevelKey === contract.experimentalUnitLevelKey,
    )!.key;
    const childIdentityKey = contract.identities.find(
      ({ unitLevelKey }) => unitLevelKey === readout.observationLevelKey,
    )!.key;
    const observations = [1, null, 3].map((value, index) =>
      observation(contract, index, {
        identities: {
          [experimentalIdentityKey]: "Dish-C1",
          [childIdentityKey]: `Cell-${index + 1}`,
        },
        factors: { [factorKey]: "Control" },
        values: { [readout.key]: value },
        missingness: value === null ? { [readout.key]: "not_collected" } : {},
        sourceRow: index + 2,
      }),
    );
    const mapping = {
      schemaVersion: "0.1.0" as const,
      sourceLabel: "cells.tsv",
      delimiter: "tab" as const,
      headerRow: 1,
      columns: {
        DishID: {
          role: "identity" as const,
          semanticKey: experimentalIdentityKey,
          fixedFactors: {},
          fixedAxes: {},
        },
        CellID: {
          role: "identity" as const,
          semanticKey: childIdentityKey,
          fixedFactors: {},
          fixedAxes: {},
        },
        Condition: {
          role: "factor" as const,
          semanticKey: factorKey,
          fixedFactors: {},
          fixedAxes: {},
        },
        Value: {
          role: "value" as const,
          semanticKey: readout.key,
          fixedFactors: {},
          fixedAxes: {},
        },
      },
      confirmedAt: now,
    };
    const lineage = {
      schemaVersion: "0.1.0" as const,
      sourceKind: "tsv" as const,
      sourceLabel: "cells.tsv",
      importedAt: now,
      rawText:
        "DishID\tCellID\tCondition\tValue\nDish-C1\tCell-1\tControl\t1\nDish-C1\tCell-2\tControl\t\nDish-C1\tCell-3\tControl\t3",
      sha256: null,
      transformations: ["confirmed_column_mapping"],
    };
    const workspace = createAdaptiveWorkspace({
      contract,
      observations,
      mapping,
      lineage,
      now,
    });
    expect(workspace.status).toBe("ready");
    const scalarCell = Object.values(workspace.cells).find(
      (cell) => cell.kind === "nested_continuous" && cell.rawValues.length > 0,
    );
    expect(scalarCell).toMatchObject({
      kind: "nested_continuous",
      rawValues: [1, 3],
      observationUnitIds: ["Cell-1", "Cell-3"],
    });
    const saveProject = vi.fn(async (state: ProjectState, target?: string) => ({
      state,
      target: target ?? "/tmp/imported-missing.lsa",
    }));

    render(
      <ExperimentWorkspace
        initialDraft={workspace.draft!}
        initialCells={workspace.cells}
        onBack={vi.fn()}
        saveProject={saveProject}
      />,
    );
    expect(screen.getByRole("table", { name: "条件ごとにまとめて表示" })).toBeVisible();
    fireEvent.click(screen.getByRole("button", { name: "すべての値" }));
    const expanded = screen.getByRole("table", { name: "すべての値を表示" });
    expect(within(expanded).getByText("Cell-1")).toBeVisible();
    expect(within(expanded).getByText("Cell-2")).toBeVisible();
    expect(within(expanded).getByText("Cell-3")).toBeVisible();
    expect(
      [...expanded.querySelectorAll('[data-column-role="source_row"]')].map(
        (cell) => cell.textContent,
      ),
    ).toEqual(["2", "3", "4"]);

    fireEvent.click(screen.getByRole("button", { name: "プロジェクトを保存" }));
    await vi.waitFor(() => expect(saveProject).toHaveBeenCalledTimes(1));
    const saved = saveProject.mock.calls[0]![0];
    expect(saved.adaptiveInput?.canonicalObservations).toEqual(observations);
    expect(saved.adaptiveInput?.mapping).toEqual(mapping);
    expect(saved.adaptiveInput?.rawLineage).toEqual(lineage);
    expect(saved.adaptiveInput?.rawLineage?.transformations).not.toContain(
      "workspace_edit_applied_to_canonical_observations",
    );
  });

  it("retains positive and denominator counts through adaptive cells and canonical save", () => {
    const contract = biologicalContract({
      title: "Marker proportion",
      measurement: "Marker positive fraction",
      form: "positive_total",
      blocks: [block("treatment", "Treatment", ["Control", "Drug"])],
      receiver: "culture dish",
    });
    const readoutKey = contract.readouts[0]!.key;
    const rows = ["Control", "Drug"].map((treatment, index) =>
      observation(contract, index, {
        identities: { culturedishid: `Dish-${index + 1}` },
        factors: { treatment },
        values: {
          [`${readoutKey}_numerator`]: index + 2,
          [`${readoutKey}_denominator`]: 10,
        },
      }),
    );
    const workspace = createAdaptiveWorkspace({
      contract,
      observations: rows,
      mapping: null,
      lineage: null,
      now,
    });
    expect(workspace.status).toBe("ready");
    const state = createExperimentWorkspaceProject({
      draft: workspace.draft!,
      cells: workspace.cells,
      graphs: [],
      now,
    });
    const reopened = ProjectStateSchema.parse(JSON.parse(JSON.stringify(state)));
    const measurements = reopened.observations.map(({ measurement }) => measurement);
    expect(measurements).toEqual([
      { kind: "proportion", numerator: 2, denominator: 10 },
      { kind: "proportion", numerator: 3, denominator: 10 },
    ]);

    render(
      <ExperimentWorkspace
        initialDraft={workspace.draft!}
        initialCells={workspace.cells}
        onBack={vi.fn()}
      />,
    );
    const table = screen.getByRole("table", { name: "Marker positive fractionをまとめて入力" });
    expect(
      within(table).getByRole("spinbutton", { name: "入力行 1・Controlの陽性数" }),
    ).toHaveValue(2);
    expect(
      within(table).getByRole("spinbutton", { name: "入力行 1・Controlの対象数" }),
    ).toHaveValue(10);
    expect(within(table).getByLabelText("入力行 1・Controlの計算された割合")).toHaveTextContent(
      "20%",
    );
  });

  it("keeps unequal nested child values in compact and expanded views without padding", () => {
    const contract = biologicalContract({
      title: "Nested cell morphology",
      measurement: "Circularity",
      form: "single",
      blocks: [block("treatment", "Treatment", ["Control", "Drug"])],
      receiver: "culture dish",
      child: "Cell",
    });
    const rows = [
      ["Control", "Dish-C", "C1", 0.4],
      ["Control", "Dish-C", "C2", 0.5],
      ["Control", "Dish-C", "C3", 0.6],
      ["Drug", "Dish-D", "D1", 0.8],
    ].map(([treatment, dish, cell, value], index) =>
      observation(contract, index, {
        identities: { culturedishid: String(dish), cell_id: String(cell) },
        factors: { treatment: String(treatment) },
        values: { circularity: Number(value) },
      }),
    );
    const workspace = createAdaptiveWorkspace({
      contract,
      observations: rows,
      mapping: null,
      lineage: null,
      now,
    });
    expect(workspace.status).toBe("ready");

    render(
      <ExperimentWorkspace
        initialDraft={workspace.draft!}
        initialCells={workspace.cells}
        onBack={vi.fn()}
      />,
    );
    const compact = screen.getByRole("table", {
      name: "条件ごとに複数の測定値をまとめて入力",
    });
    expect(
      within(compact).getByRole("textbox", { name: "入力行 1・ControlのCircularity" }),
    ).toHaveValue("0.4\n0.5\n0.6");
    expect(
      within(compact).getByRole("textbox", { name: "入力行 1・DrugのCircularity" }),
    ).toHaveValue("0.8");

    fireEvent.click(screen.getByRole("button", { name: "すべての値" }));
    const expanded = screen.getByRole("table", { name: "個々の測定値をすべて表示" });
    expect(within(expanded).getByDisplayValue("C1")).toBeVisible();
    expect(within(expanded).getByDisplayValue("D1")).toBeVisible();
    expect(
      within(expanded).getAllByRole("textbox", {
        name: /Control・入力行 1・測定\dの値/,
      }),
    ).toHaveLength(4);
    expect(
      within(expanded).getAllByRole("textbox", {
        name: /Drug・入力行 1・測定\dの値/,
      }),
    ).toHaveLength(2);
  });

  it("creates a repeated-axis workspace and preserves the ordered axis after save/open", () => {
    const contract = biologicalContract({
      title: "Longitudinal culture response",
      measurement: "Signal",
      form: "single",
      blocks: [block("treatment", "Treatment", ["Control", "Drug"])],
      receiver: "culture dish",
      orderedAxis: {
        label: "Time",
        unit: "h",
        levels: [0, 24, 48],
        sameIdentity: true,
      },
    });
    const rows = ["Control", "Drug"].flatMap((treatment, conditionIndex) =>
      [0, 24, 48].map((time, timeIndex) =>
        observation(contract, conditionIndex * 3 + timeIndex, {
          identities: { culturedishid: `Dish-${conditionIndex + 1}` },
          factors: { treatment },
          axes: { time },
          values: { signal: 1 + conditionIndex + timeIndex / 10 },
        }),
      ),
    );
    const workspace = createAdaptiveWorkspace({
      contract,
      observations: rows,
      mapping: null,
      lineage: null,
      now,
    });
    expect(workspace.status).toBe("ready");
    expect(workspace.draft?.time.sampling).toBe("longitudinal");
    expect(workspace.draft?.time.relationship).toBe("repeated");
    expect(workspace.draft?.time.axisTitle).toBe("Time");
    expect(workspace.draft?.time.points.map(({ value }) => value)).toEqual([0, 24, 48]);

    const state = createExperimentWorkspaceProject({
      draft: workspace.draft!,
      cells: workspace.cells,
      graphs: [],
      now,
    });
    const reopened = ProjectStateSchema.parse(JSON.parse(JSON.stringify(state)));
    const restored = rehydrateExperimentWorkspace(reopened);
    expect(restored?.draft.time.sampling).toBe("longitudinal");
    expect(restored?.draft.time.relationship).toBe("repeated");
    expect(restored?.draft.time.axisTitle).toBe("Time");
    expect(restored?.draft.time.points.map(({ value }) => value)).toEqual([0, 24, 48]);
    expect(restored?.draft.adaptiveInput?.contract).toEqual(contract);
  });

  it("safe-stops unknown material linkage and never assumes the first factor is the split factor", () => {
    const blocks = [
      block("sirna", "siRNA", ["Control", "Gene A"]),
      block("dox", "Dox", ["−", "+"]),
    ];
    const combinations = buildConditionCombinations(blocks);
    const stopped = safelyBuildBiologicalSetup({
      title: "siRNA and Dox",
      measurementLabel: "Ciliated-cell proportion",
      valueForm: "positive_total",
      blocks,
      combinations,
      statuses: {},
      receiverLabel: "culture dish",
      receiverIdLabel: "",
      relationship: "shared_source",
      sourceLabel: "donor culture",
      sourceIdLabel: "",
      childLabel: "Cell",
    });
    expect(stopped.status).toBe("stopped");
    if (stopped.status === "stopped") {
      expect(stopped.reason).toMatch(/分けた後に変えた処理・群分けを1つ選んでください/);
    }

    const selected = safelyBuildBiologicalSetup({
      title: "siRNA and Dox",
      measurementLabel: "Ciliated-cell proportion",
      valueForm: "positive_total",
      blocks,
      combinations,
      statuses: {},
      receiverLabel: "culture dish",
      receiverIdLabel: "",
      relationship: "shared_source",
      sourceLabel: "donor culture",
      sourceIdLabel: "",
      sharedSourcePairedBlockId: "dox",
      childLabel: "Cell",
    });
    expect(selected.status).toBe("ready");
    if (selected.status === "ready") {
      expect(selected.result.contract.factors.map(({ label }) => label)).toEqual(["Dox", "siRNA"]);
      expect(selected.result.contract.factors.map(({ relationship }) => relationship)).toEqual([
        "paired",
        "independent",
      ]);
      expect(selected.result.contract.matching.kind).toBe("matched");
    }
  });

  it("retains an unknown relation in the researcher-facing setup instead of navigating", () => {
    const onReady = vi.fn();
    render(<BiologicalExperimentSetup enabled onReady={onReady} />);
    const conditionName = screen.getByRole("textbox", { name: "処理・群分け 1の名前" });
    fireEvent.change(conditionName, { target: { value: "Treatment" } });
    fireEvent.change(screen.getByRole("textbox", { name: "行 1 列 1" }), {
      target: { value: "Control" },
    });
    fireEvent.change(screen.getByPlaceholderText("例：細胞生存率"), {
      target: { value: "Signal" },
    });
    fireEvent.change(screen.getByPlaceholderText("例：culture dish、mouse、donor由来試料"), {
      target: { value: "culture dish" },
    });
    fireEvent.click(screen.getByRole("button", { name: "この内容で入力表を作る" }));

    expect(onReady).not.toHaveBeenCalled();
    expect(screen.getByText(/関係が混在または不明/)).toBeVisible();
    expect(conditionName).toHaveValue("Treatment");
    expect(screen.getByPlaceholderText("例：細胞生存率")).toHaveValue("Signal");
    expect(screen.getByPlaceholderText("例：culture dish、mouse、donor由来試料")).toHaveValue(
      "culture dish",
    );
  });
});

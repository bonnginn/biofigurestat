import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { createElement } from "react";
import { describe, expect, it, vi } from "vitest";
import { ProjectStateSchema } from "@lsaa/project";
import { StructureContractSchema } from "@lsaa/domain";
import {
  buildStructureContract,
  importForSelectedSurface,
  selectAdaptiveSurface,
} from "@lsaa/adaptive-input";
import { adaptiveSurvivalPaste, createAdaptiveWorkspace } from "./adaptiveWorkspace";
import {
  createExperimentWorkspaceProject,
  rehydrateExperimentWorkspace,
} from "./experimentWorkspaceProject";
import { ExperimentWorkspace } from "../pages/ExperimentWorkspace";
import { SpecializedCorePage } from "../pages/SpecializedCorePage";
import type { SaveProjectAction } from "./projectActions";
import { adaptiveSurvivalUnitId, createAdaptiveSurvivalProject } from "./adaptiveSurvivalProject";
import { OpenProjectPage } from "../pages/OpenProjectPage";

const now = "2026-08-26T00:00:00.000Z";
const base = {
  experimentDescription:
    "The biological unit, treatment assignment, sample collection, identity reuse, and measurement are explicitly recorded.",
  readoutRepresentation: "scalar" as const,
};

const cases = [
  {
    id: "manual-1",
    contract: buildStructureContract({
      ...base,
      experimentName: "Independent drug experiment",
      experimentalUnitLabel: "culture run",
      identityLabel: "RunID",
      readoutLabel: "Signal",
      factorName: "Treatment",
      factorLevels: ["Vehicle", "Drug A", "Drug B"],
      sameIdentityAcrossConditions: false,
    }),
    surface: "factor_observation_table",
    text: [
      "RunID\tTreatment\tSignal",
      ...["Vehicle", "Drug A", "Drug B"].flatMap((condition, group) =>
        Array.from(
          { length: 4 },
          (_, index) => `${condition[0]}${index + 1}\t${condition}\t${10 + group * 4 + index}`,
        ),
      ),
    ].join("\n"),
    observations: 12,
  },
  {
    id: "manual-2",
    contract: buildStructureContract({
      ...base,
      experimentName: "Matched illumination",
      experimentalUnitLabel: "cell",
      identityLabel: "Cell ID",
      readoutLabel: "Intensity",
      factorName: "Illumination",
      factorLevels: ["Dark", "Lit"],
      sameIdentityAcrossConditions: true,
    }),
    surface: "compact_unit_matrix",
    text: [
      "CellID\tDark\tLit",
      ...Array.from({ length: 6 }, (_, index) => `Cell${index + 1}\t${20 + index}\t${25 + index}`),
    ].join("\n"),
    observations: 12,
  },
  {
    id: "manual-3",
    contract: buildStructureContract({
      ...base,
      experimentName: "Nested cell morphology",
      experimentalUnitLabel: "culture dish",
      identityLabel: "DishID",
      readoutLabel: "Circularity",
      factorName: "Treatment",
      factorLevels: ["Vehicle", "Drug"],
      sameIdentityAcrossConditions: false,
      nestedObservationLabel: "cell",
    }),
    surface: "nested_observation_table",
    text: [
      "DishID\tCell ID\tTreatment\tCircularity",
      ...["Vehicle", "Drug"].flatMap((condition, group) =>
        Array.from({ length: 4 }, (_, dish) =>
          Array.from(
            { length: 5 },
            (_, cell) =>
              `${condition[0]}${dish + 1}\t${condition[0]}${dish + 1}-C${cell + 1}\t${condition}\t${(0.4 + group * 0.1 + dish * 0.01 + cell * 0.001).toFixed(3)}`,
          ),
        ).flat(),
      ),
    ].join("\n"),
    observations: 40,
  },
  {
    id: "manual-4",
    contract: StructureContractSchema.parse({
      schemaVersion: "0.1.0",
      contractId: "manual.4",
      experimentName: "siRNA rescue factorial",
      experimentDescription: base.experimentDescription,
      unitLevels: [
        { key: "culture_run", label: "culture run", role: "experimental_unit", parentKey: null },
      ],
      experimentalUnitLevelKey: "culture_run",
      identities: [{ key: "runid", label: "RunID", unitLevelKey: "culture_run", required: true }],
      factors: [
        {
          key: "sirna",
          label: "siRNA",
          levels: ["Control", "Target"],
          unitRole: "between_unit",
          relationship: "independent",
          ordered: false,
          referenceLevel: "Control",
        },
        {
          key: "construct",
          label: "Construct",
          levels: ["Empty", "Rescue"],
          unitRole: "between_unit",
          relationship: "independent",
          ordered: false,
          referenceLevel: "Empty",
        },
      ],
      matching: { kind: "independent", identityKey: null, completeSetsRequired: null },
      orderedAxes: [],
      readouts: [
        {
          key: "expression",
          label: "Expression",
          valueType: "continuous",
          representation: "scalar",
          componentKeys: ["value"],
          referenceRole: "none",
          observationLevelKey: "culture_run",
          axisKeys: [],
        },
      ],
      allowedMissingness: ["not_collected", "assay_failed", "unknown"],
      rawObservationGrain: "one culture run",
    }),
    surface: "factor_observation_table",
    text: [
      "RunID\tsiRNA\tConstruct\tExpression",
      ...["Control\tEmpty", "Control\tRescue", "Target\tEmpty", "Target\tRescue"].flatMap(
        (combination, group) =>
          Array.from(
            { length: 4 },
            (_, index) => `R${group + 1}-${index + 1}\t${combination}\t${50 + group * 10 + index}`,
          ),
      ),
    ].join("\n"),
    observations: 16,
  },
] as const;

function manualSurvivalFixture() {
  const contract = buildStructureContract({
    ...base,
    experimentName: "Animal survival",
    experimentalUnitLabel: "mouse",
    identityLabel: "MouseID",
    readoutLabel: "Survival",
    readoutRepresentation: "event_censoring",
    factorName: "Treatment",
    factorLevels: ["Vehicle", "Treatment"],
    sameIdentityAcrossConditions: false,
  });
  const text = [
    "MouseID\tTreatment\tfollow_up\tevent_observed",
    ...["Vehicle", "Treatment"].flatMap((condition, group) =>
      Array.from(
        { length: 6 },
        (_, index) =>
          `M${group + 1}-${index + 1}\t${condition}\t${5 + index + group}\t${index % 3 === 0 ? "Censored" : "Event"}`,
      ),
    ),
  ].join("\n");
  const imported = importForSelectedSurface(contract, text, "tsv", "manual-survival.tsv", now);
  const workspace = createAdaptiveWorkspace({
    contract,
    observations: imported.observations,
    mapping: imported.mapping,
    lineage: imported.lineage,
    now,
  });
  return { contract, text, workspace, handoff: adaptiveSurvivalPaste(workspace.snapshot) };
}

describe("Human Manual Validation Cases 1-5 on the adaptive path", () => {
  it.each(cases)(
    "$id reaches its selected surface and survives canonical save/open",
    ({ id, contract, surface, text, observations }) => {
      expect(selectAdaptiveSurface(contract).surfaceId).toBe(surface);
      const imported = importForSelectedSurface(
        contract,
        text,
        "clipboard",
        "manual-validation",
        now,
      );
      expect(imported.observations).toHaveLength(observations);
      const workspace = createAdaptiveWorkspace({
        contract,
        observations: imported.observations,
        mapping: imported.mapping,
        lineage: imported.lineage,
        now,
      });
      expect(workspace.status).toBe("ready");
      const state = createExperimentWorkspaceProject({
        draft: workspace.draft!,
        cells: workspace.cells,
        graphs: [],
        now,
      });
      if (id === "manual-2") {
        expect(workspace.draft?.experiments).toHaveLength(6);
        expect(state.designRevisions[0]?.design.plannedN).toBe(6);
        expect(
          state.unitInstances.filter(
            ({ levelId }) => levelId === state.designRevisions[0]?.design.experimentalUnitLevelId,
          ),
        ).toHaveLength(6);
      }
      const reopened = ProjectStateSchema.parse(JSON.parse(JSON.stringify(state)));
      expect(reopened.observations).toHaveLength(observations);
      expect(reopened.adaptiveInput?.canonicalObservations).toHaveLength(observations);
      expect(reopened.adaptiveInput?.mapping?.sourceLabel).toBe("manual-validation");
      expect(reopened.adaptiveInput?.rawLineage?.rawText).toBe(text);
      const rehydrated = rehydrateExperimentWorkspace(reopened);
      expect(rehydrated?.draft.adaptiveInput?.contract).toEqual(contract);
      expect(
        Object.values(rehydrated?.cells ?? {}).reduce(
          (total, cell) => total + (cell.kind === "nested_continuous" ? cell.rawValues.length : 0),
          0,
        ),
      ).toBe(observations);
      const persistedExperimentalUnits = reopened.unitInstances.filter(
        ({ levelId }) => levelId === reopened.designRevisions[0]?.design.experimentalUnitLevelId,
      );
      if (contract.matching.kind === "matched") {
        expect(
          persistedExperimentalUnits.every(
            ({ metadata }) => typeof metadata.experimentSessionId === "string",
          ),
        ).toBe(true);
      } else {
        // Independent table rows are presentation order, not evidence that the
        // nth row in different conditions belongs to one experimental session.
        expect(
          persistedExperimentalUnits.every(
            ({ metadata }) => metadata.experimentSessionId === undefined,
          ),
        ).toBe(true);
      }
      if (id === "manual-3") {
        const legacyWithoutSessionMetadata = ProjectStateSchema.parse({
          ...reopened,
          unitInstances: reopened.unitInstances.map((unit) => {
            const { experimentSessionId: _removed, ...metadata } = unit.metadata;
            return { ...unit, metadata };
          }),
        });
        const legacyCells = rehydrateExperimentWorkspace(legacyWithoutSessionMetadata)?.cells ?? {};
        expect(
          Object.values(legacyCells).reduce(
            (total, cell) =>
              total + (cell.kind === "nested_continuous" ? cell.rawValues.length : 0),
            0,
          ),
        ).toBe(40);
      }
    },
  );

  it("manual-5 hands a typed event/censoring surface to the dedicated survival path losslessly", () => {
    const { contract, workspace, handoff } = manualSurvivalFixture();
    expect(selectAdaptiveSurface(contract).surfaceId).toBe("typed_record_table");
    expect(workspace.status).toBe("dedicated_route_required");
    expect(handoff.split("\n")).toHaveLength(13);
    expect(handoff).toContain("Follow-up time\tStatus");
    expect(handoff).toContain("\tCensored");
    expect(handoff).toContain("\tEvent");
  });

  it.each([
    [null, "ADAPTIVE_SURVIVAL_STATUS_MISSING"],
    ["", "ADAPTIVE_SURVIVAL_STATUS_MISSING"],
    ["unknown", "ADAPTIVE_SURVIVAL_STATUS_INVALID"],
    [0, "ADAPTIVE_SURVIVAL_NUMERIC_STATUS_REQUIRES_EXPLICIT_MAPPING"],
    [1, "ADAPTIVE_SURVIVAL_NUMERIC_STATUS_REQUIRES_EXPLICIT_MAPPING"],
  ] as const)(
    "manual-5 stops adaptive status %j before handoff or project creation",
    (status, expectedError) => {
      const { workspace } = manualSurvivalFixture();
      const snapshot = {
        ...workspace.snapshot,
        canonicalObservations: workspace.snapshot.canonicalObservations.map((row, index) =>
          index === 0
            ? {
                ...row,
                values: { ...row.values, survival_event_observed: status },
              }
            : row,
        ),
      };

      expect(() => adaptiveSurvivalPaste(snapshot)).toThrow(expectedError);
      expect(() => createAdaptiveSurvivalProject(snapshot, now)).toThrow(expectedError);
    },
  );

  it("manual-5 reopens exact raw text and an unchanged save creates no false revision", async () => {
    const { workspace } = manualSurvivalFixture();
    const state = createAdaptiveSurvivalProject(workspace.snapshot, now);
    const saveProject = vi.fn<SaveProjectAction>(async (request, target) => ({
      state: request,
      target: target ?? "/tmp/adaptive-survival.lsa",
    }));
    render(
      createElement(OpenProjectPage, {
        onNavigate: vi.fn(),
        openProject: vi.fn(async () => null),
        persistedProject: { state, target: "/tmp/adaptive-survival.lsa" },
        saveProject,
      }),
    );
    expect(screen.getByRole("navigation", { name: "プロジェクトワークスペース" })).toBeVisible();
    expect(screen.getByRole("textbox", { name: "Survival data" })).toHaveValue(
      workspace.snapshot.rawLineage?.rawText,
    );
    expect(screen.getByRole("img", { name: "Kaplan–Meier survival graph" })).toBeVisible();
    expect(
      screen.getByRole("region", { name: "Animal survival Graphワークスペース" }),
    ).toBeVisible();
    expect(screen.getByRole("button", { name: "統計" })).toBeVisible();
    fireEvent.click(screen.getByRole("button", { name: "プロジェクトを保存" }));
    await waitFor(() => expect(saveProject).toHaveBeenCalledTimes(1));
    const unchanged = ProjectStateSchema.parse(saveProject.mock.calls[0]![0]);
    expect(unchanged.rawRevisions).toEqual(state.rawRevisions);
    expect(unchanged.designRevisions).toEqual(state.designRevisions);
    expect(unchanged.adaptiveInput?.rawLineage).toEqual(workspace.snapshot.rawLineage);
  });

  it("manual-5 reaches survival Graph, Statistics, save, and reopen", async () => {
    const { contract, workspace, handoff } = manualSurvivalFixture();
    const analysisRunner = vi.fn(async (request) => ({
      protocolVersion: "0.8.0" as const,
      requestId: request.requestId,
      status: "ok" as const,
      engine: { name: "fixture", version: "1", packages: {} },
      estimates: [],
      tests: [
        {
          name: "log_rank",
          statisticName: "chi-square",
          statistic: 1,
          degreesOfFreedom: [1],
          pValue: 0.3,
          adjustedPValue: null,
          effectSizeName: null,
          effectSize: null,
        },
      ],
      survival: {
        groups: [
          {
            conditionId: "condition.1",
            n: 6,
            events: 4,
            censored: 2,
            curve: [],
            censorTimes: [5, 8],
          },
          {
            conditionId: "condition.2",
            n: 6,
            events: 4,
            censored: 2,
            curve: [],
            censorTimes: [6, 9],
          },
        ],
      },
      diagnostics: [],
      warnings: [],
      completedAt: now,
    }));
    const saveProject = vi.fn<SaveProjectAction>(async (state) => ({
      state,
      target: "/tmp/adaptive-survival.lsa",
    }));
    const firstRender = render(
      createElement(SpecializedCorePage, {
        mode: "survival",
        onBack: vi.fn(),
        initialText: handoff,
        adaptiveInput: workspace.snapshot,
        analysisRunner,
        saveProject,
      }),
    );
    expect(screen.getByRole("img", { name: "Kaplan–Meier survival graph" })).toBeVisible();
    fireEvent.click(screen.getByRole("button", { name: "統計" }));
    fireEvent.click(screen.getByRole("button", { name: "Kaplan–Meier + log-rankを実行" }));
    expect(await screen.findByText(/log-rank検定が完了/)).toBeVisible();
    fireEvent.click(screen.getByRole("button", { name: "プロジェクトを保存" }));
    await waitFor(() => expect(saveProject).toHaveBeenCalledTimes(1));
    const reopened = ProjectStateSchema.parse(
      JSON.parse(JSON.stringify(saveProject.mock.calls[0]![0])),
    );
    expect(reopened.adaptiveInput?.contract).toEqual(contract);
    expect(reopened.observations).toHaveLength(12);
    expect(reopened.observations[0]?.outcomeId).toBe(
      reopened.designRevisions[0]?.design.outcomes[0]?.id,
    );
    expect(reopened.analysisRuns).toHaveLength(1);
    firstRender.unmount();

    const reopenedProject = { state: reopened, target: "/tmp/adaptive-survival.lsa" };
    render(
      createElement(SpecializedCorePage, {
        mode: "survival",
        onBack: vi.fn(),
        initialText: handoff,
        initialProject: reopenedProject,
        analysisRunner,
        saveProject,
      }),
    );
    expect(screen.getByRole("navigation", { name: "プロジェクトワークスペース" })).toBeVisible();
    expect(screen.queryByRole("button", { name: "統計解析を設定" })).toBeNull();
    const editable = screen.getByRole("textbox", { name: "Survival data" });
    fireEvent.change(editable, {
      target: {
        value: handoff.replace("M1-1\tVehicle\t5\tCensored", "M1-1\tVehicle\t7\tCensored"),
      },
    });
    fireEvent.click(screen.getByRole("button", { name: "統計" }));
    fireEvent.click(screen.getByRole("button", { name: "Kaplan–Meier + log-rankを実行" }));
    await waitFor(() => expect(analysisRunner).toHaveBeenCalledTimes(2));
    fireEvent.click(screen.getByRole("button", { name: "プロジェクトを保存" }));
    await waitFor(() => expect(saveProject).toHaveBeenCalledTimes(2));
    expect(saveProject.mock.calls[1]![1]).toBe(reopenedProject.target);
    const edited = ProjectStateSchema.parse(saveProject.mock.calls[1]![0]);
    expect(edited.designRevisions[0]?.design.plannedN).toBe(12);
    expect(edited.adaptiveInput?.rawLineage?.rawText).toContain("M1-1\tVehicle\t7\tCensored");
    expect(edited.adaptiveInput?.canonicalObservations[0]?.values.survival_follow_up).toBe(7);
    const currentObservation = edited.observations.find(
      ({ rawRevisionId, unitInstanceId }) =>
        rawRevisionId === edited.activeRawRevisionId &&
        unitInstanceId === adaptiveSurvivalUnitId("M1-1"),
    );
    expect(currentObservation?.measurement).toEqual({
      kind: "time_to_event",
      followUpTime: 7,
      eventObserved: false,
    });
  });

  it.each(cases)("$id reaches Graph, Statistics, save, and reopen", async ({ contract, text }) => {
    const imported = importForSelectedSurface(
      contract,
      text,
      "clipboard",
      "manual-validation",
      now,
    );
    const workspace = createAdaptiveWorkspace({
      contract,
      observations: imported.observations,
      mapping: imported.mapping,
      lineage: imported.lineage,
      now,
    });
    const saveProject = vi.fn(async (state) => ({ state, target: "/tmp/adaptive-manual.lsa" }));
    render(
      createElement(ExperimentWorkspace, {
        initialDraft: workspace.draft!,
        initialCells: workspace.cells,
        onBack: vi.fn(),
        saveProject,
      }),
    );
    fireEvent.click(screen.getByRole("button", { name: "＋ グラフを作成" }));
    fireEvent.click(screen.getByRole("button", { name: "このグラフを作成" }));
    expect(screen.getByRole("img", { name: /実験単位ごとのグラフ/ })).toBeVisible();
    fireEvent.click(screen.getByRole("button", { name: "統計" }));
    expect(screen.getByRole("region", { name: "統計ワークスペース" })).toBeVisible();
    fireEvent.click(screen.getByRole("button", { name: "プロジェクトを保存" }));
    await waitFor(() => expect(saveProject).toHaveBeenCalledTimes(1));
    const reopened = ProjectStateSchema.parse(
      JSON.parse(JSON.stringify(saveProject.mock.calls[0]![0])),
    );
    expect(reopened.experimentWorkspace?.graphs).toHaveLength(1);
    expect(rehydrateExperimentWorkspace(reopened)?.draft.adaptiveInput?.contract).toEqual(contract);
  });
});

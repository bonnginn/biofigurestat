// @vitest-environment jsdom

import "@testing-library/jest-dom/vitest";
import { cleanup, fireEvent, render, screen, within } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import {
  EXPERIMENT_CANVAS_SCHEMA_VERSION,
  OBSERVATION_PATTERN_SET_SCHEMA_VERSION,
  ExperimentCanvasSchema,
  ObservationPatternSetSchema,
} from "@lsaa/domain";
import {
  progressiveLineageMatchesStagedRecords,
  type ProgressiveExperimentProjectState,
} from "@lsaa/project";

import { ProgressiveSparseExperimentPage } from "./ProgressiveSparseExperimentPage";
import {
  labelForCondition,
  parseSparseClipboard,
  snapshotFromSparseDraft,
  sparseDraftFromSnapshot,
  sparseSheetCompatibility,
} from "./progressiveSparseExperimentModel";

afterEach(cleanup);

function fixture(unknown = false) {
  const canvas = ExperimentCanvasSchema.parse({
    schemaVersion: EXPERIMENT_CANVAS_SCHEMA_VERSION,
    canvasId: "canvas.ui.sparse",
    experimentLabel: "Sparse cell experiment",
    dimensions: [
      {
        key: "treatment",
        label: "Treatment",
        kind: "intervention",
        groups: [],
        values: [
          { key: "control", label: "Control", parentValueKey: null, groupKey: null },
          { key: "drug", label: "Drug", parentValueKey: null, groupKey: null },
        ],
      },
      {
        key: "dox",
        label: "Dox",
        kind: "intervention",
        groups: [],
        values: [
          { key: "minus", label: "−", parentValueKey: null, groupKey: null },
          { key: "plus", label: "+", parentValueKey: null, groupKey: null },
        ],
      },
    ],
    conditionCells: [
      {
        conditionCellId: "cell.control.minus",
        values: { treatment: "control", dox: "minus" },
        status: unknown ? "unknown" : "performed",
      },
      {
        conditionCellId: "cell.control.plus",
        values: { treatment: "control", dox: "plus" },
        status: "not_performed",
      },
      {
        conditionCellId: "cell.drug.minus",
        values: { treatment: "drug", dox: "minus" },
        status: "performed",
      },
      {
        conditionCellId: "cell.drug.plus",
        values: { treatment: "drug", dox: "plus" },
        status: "performed",
      },
    ],
    readouts: [
      { key: "intensity", label: "Intensity", representation: "scalar", componentKeys: ["value"] },
      {
        key: "positive_rate",
        label: "Positive rate",
        representation: "proportion_counts",
        componentKeys: ["positive", "total"],
      },
    ],
  });
  const pattern = ObservationPatternSetSchema.parse({
    schemaVersion: OBSERVATION_PATTERN_SET_SCHEMA_VERSION,
    patternSetId: "pattern.ui.sparse",
    canvasId: canvas.canvasId,
    levels: [
      {
        key: "dish",
        label: "Culture dish",
        kind: "biological_or_experimental_entity",
        parentKey: null,
        plannedMultiplicity: { mode: "from_input" },
      },
    ],
    identities: [
      {
        key: "dish_id",
        label: "Dish ID",
        levelKey: "dish",
        uniquenessScopeLevelKey: null,
        purpose: "both",
        availability: "available",
        origin: "researcher_supplied",
      },
    ],
    axes: [],
    recordSets: [
      {
        key: "dish_records",
        label: "Dish records",
        observedLevelKey: "dish",
        axisUses: [],
        coordinatePlan: "sparse_explicit",
        recordGrain: "one row per dish",
        entryAlignment: { mode: "separate_lists", identityKey: null, completeSets: null },
      },
    ],
    readoutBindings: canvas.readouts.flatMap((readout) =>
      canvas.conditionCells.map((cell) => ({
        readoutKey: readout.key,
        conditionCellId: cell.conditionCellId,
        componentKeys: readout.componentKeys,
        status: cell.status === "performed" ? "measured" : "not_measured",
        recordSetKey: cell.status === "performed" ? "dish_records" : null,
      })),
    ),
  });
  return { canvas, pattern };
}

describe("ProgressiveSparseExperimentPage", () => {
  it("safe-stops before creating a sheet while any condition remains unknown", () => {
    const { canvas, pattern } = fixture(true);
    render(<ProgressiveSparseExperimentPage canvas={canvas} pattern={pattern} />);
    expect(screen.getByText("NEED_MORE_INFORMATION")).toBeInTheDocument();
    expect(screen.queryByRole("heading", { name: "測定値" })).not.toBeInTheDocument();
  });

  it("shows only performed cells as editors, accepts unequal-n scalar paste, graphs, and safe-stops Statistics", async () => {
    const { canvas, pattern } = fixture();
    const saved: ProgressiveExperimentProjectState[] = [];
    const saveProject = vi.fn(async (state: ProgressiveExperimentProjectState) => {
      saved.push(state);
      return { state, target: "sparse.lsa" };
    });
    render(
      <ProgressiveSparseExperimentPage
        canvas={canvas}
        pattern={pattern}
        saveProject={saveProject}
      />,
    );

    expect(screen.getByText(/実施していない：Control \/ \+/)).toBeInTheDocument();
    expect(screen.queryByLabelText(/Control \/ \+ Dish ID/)).not.toBeInTheDocument();

    const controlPaste = screen.getByLabelText("Control / − Intensity 貼り付け");
    fireEvent.change(controlPaste, { target: { value: "dish-1\t1.2\ndish-2\t1.5" } });
    fireEvent.click(
      within(controlPaste.parentElement!).getByRole("button", { name: "貼り付けを反映" }),
    );
    const drugPaste = screen.getByLabelText("Drug / − Intensity 貼り付け");
    fireEvent.change(drugPaste, { target: { value: "dish-3\t2.1" } });
    fireEvent.click(
      within(drugPaste.parentElement!).getByRole("button", { name: "貼り付けを反映" }),
    );

    expect(screen.getByText("Graph: READY")).toBeInTheDocument();
    expect(
      screen.getByRole("img", { name: /Sparse cell experiment descriptive Graph/ }),
    ).toBeInTheDocument();
    expect(screen.getByRole("heading", { name: "Statistics" }).parentElement).toHaveTextContent(
      "NEED_MORE_INFORMATION",
    );
    expect(screen.queryByText(/StructureContract|factorial design/i)).not.toBeInTheDocument();
    const readoutSelector = screen.getByRole("combobox", { name: "表示する測定値" });
    fireEvent.change(readoutSelector, { target: { value: "positive_rate" } });
    expect(screen.getByText("Graph: NEED_MORE_INFORMATION")).toBeInTheDocument();
    expect(screen.queryByRole("img", { name: /descriptive Graph/ })).not.toBeInTheDocument();
    fireEvent.change(readoutSelector, { target: { value: "intensity" } });
    expect(screen.getByText("Graph: READY")).toBeInTheDocument();

    fireEvent.click(screen.getByRole("button", { name: "保存" }));
    expect(await screen.findByRole("status")).toHaveTextContent("保存しました。");
    expect(saveProject).toHaveBeenCalledTimes(1);
    const state = saved[0]!;
    const intensityRecords = state.progressiveEntry.stagedRecords.filter(
      ({ observation }) => observation.readoutKey === "intensity",
    );
    expect(intensityRecords).toHaveLength(3);
    expect(
      intensityRecords.filter(({ conditionCellId }) => conditionCellId === "cell.control.minus"),
    ).toHaveLength(2);
    expect(state.progressiveEntry.canvas.conditionCells[1]?.status).toBe("not_performed");
    expect(state.progressiveEntry.fullContract).toBeNull();
    expect(state.progressiveEntry.scopedContracts).toEqual([]);
    expect(state.progressiveEntry.rawLineage?.rawText).toContain("cell.control.minus");
    expect(state.progressiveEntry.rawLineage?.rawText).toContain("cell.drug.minus");
  });

  it("does not fabricate a scientific-linkage identity for values-only paste", () => {
    const { canvas, pattern } = fixture();
    const section = sparseSheetCompatibility(canvas, pattern).sections[0]!;
    expect(parseSparseClipboard("1.2\n1.5", section).error).toMatch(/Dish ID.*自動生成できません/);
  });

  it("does not inherit prior hidden metadata when pasted rows replace saved rows", () => {
    const { canvas, pattern } = fixture();
    const sections = sparseSheetCompatibility(canvas, pattern).sections;
    const section = sections[0]!;
    const firstDraft = {
      ...sparseDraftFromSnapshot(
        sections,
        snapshotFromSparseDraft({
          snapshotId: "snapshot.paste.base",
          projectId: "project.paste.base",
          savedAt: "2026-08-28T00:00:00.000Z",
          canvas,
          pattern,
          sections,
          draft: {
            ...Object.fromEntries(sections.map(({ sectionKey }) => [sectionKey, []])),
            [section.sectionKey]: [
              {
                rowKey: `${section.sectionKey}|old.1`,
                identity: "old-dish",
                components: ["1.2"],
              },
            ],
          },
          sourceKind: "direct_entry",
        }).snapshot,
      ),
    };
    const base = snapshotFromSparseDraft({
      snapshotId: "snapshot.paste.base",
      projectId: "project.paste.base",
      savedAt: "2026-08-28T00:00:00.000Z",
      canvas,
      pattern,
      sections,
      draft: firstDraft,
      sourceKind: "direct_entry",
    }).snapshot;
    const oldRecord = base.stagedRecords[0]!;
    oldRecord.observation.identities.batch_id = "must-not-leak";
    const replacement = parseSparseClipboard("new-dish\t2.4", section).rows;
    const replacementDraft = { ...firstDraft, [section.sectionKey]: replacement };
    const replaced = snapshotFromSparseDraft({
      snapshotId: base.snapshotId,
      projectId: base.projectId,
      savedAt: "2026-08-28T00:01:00.000Z",
      canvas,
      pattern,
      sections,
      draft: replacementDraft,
      sourceKind: "clipboard",
      baseSnapshot: base,
    }).snapshot;
    const newRecord = replaced.stagedRecords.find(
      ({ observation }) => observation.identities.dish_id === "new-dish",
    )!;
    expect(newRecord.recordId).not.toBe(oldRecord.recordId);
    expect(newRecord.observation.identities.batch_id).toBeUndefined();
  });

  it("safe-stops instead of silently omitting a nested observation grain", () => {
    const { canvas, pattern } = fixture();
    const nestedPattern = structuredClone(pattern);
    nestedPattern.levels.push({
      key: "cell",
      label: "Cell",
      kind: "observed_entity",
      parentKey: "dish",
      plannedMultiplicity: { mode: "variable", suggestedCount: null },
    });
    nestedPattern.identities.push({
      key: "cell_id",
      label: "Cell ID",
      levelKey: "cell",
      uniquenessScopeLevelKey: "dish",
      purpose: "instance_key",
      availability: "to_be_collected",
      origin: "researcher_supplied",
    });
    nestedPattern.recordSets[0]!.observedLevelKey = "cell";
    const parsedPattern = ObservationPatternSetSchema.parse(nestedPattern);
    render(<ProgressiveSparseExperimentPage canvas={canvas} pattern={parsedPattern} />);
    expect(screen.getByText("SAFE_UNSUPPORTED")).toBeInTheDocument();
    expect(screen.queryByRole("heading", { name: "測定値" })).not.toBeInTheDocument();
  });

  it("keeps non-selectable group labels visible when leaf labels repeat", () => {
    const { canvas } = fixture();
    const grouped = structuredClone(canvas);
    grouped.dimensions[0]!.groups = [
      { key: "gene_a", label: "Gene A" },
      { key: "gene_b", label: "Gene B" },
    ];
    grouped.dimensions[0]!.values = [
      { key: "gene_a_1", label: "#1", parentValueKey: null, groupKey: "gene_a" },
      { key: "gene_b_1", label: "#1", parentValueKey: null, groupKey: "gene_b" },
    ];
    grouped.conditionCells[0]!.values.treatment = "gene_a_1";
    grouped.conditionCells[1]!.values.treatment = "gene_a_1";
    grouped.conditionCells[2]!.values.treatment = "gene_b_1";
    grouped.conditionCells[3]!.values.treatment = "gene_b_1";
    const parsed = ExperimentCanvasSchema.parse(grouped);
    expect(labelForCondition(parsed, "cell.control.minus")).toBe("Gene A / #1 / −");
    expect(labelForCondition(parsed, "cell.drug.minus")).toBe("Gene B / #1 / −");
  });

  it("retains positive/total components and restores staged values through open", async () => {
    const { canvas, pattern } = fixture();
    let persisted: ProgressiveExperimentProjectState | null = null;
    const saveProject = vi.fn(async (state: ProgressiveExperimentProjectState) => {
      persisted = state;
      return { state, target: "sparse.lsa" };
    });
    const { unmount } = render(
      <ProgressiveSparseExperimentPage
        canvas={canvas}
        pattern={pattern}
        saveProject={saveProject}
      />,
    );
    const paste = screen.getByLabelText("Drug / + Positive rate 貼り付け");
    fireEvent.change(paste, { target: { value: "dish-9\t8\t10\ndish-10\t7\t9" } });
    fireEvent.click(within(paste.parentElement!).getByRole("button", { name: "貼り付けを反映" }));
    fireEvent.click(screen.getByRole("button", { name: "保存" }));
    expect(await screen.findByRole("status")).toHaveTextContent("保存しました。");
    expect(
      persisted!.progressiveEntry.stagedRecords.find(
        ({ observation }) => observation.readoutKey === "positive_rate",
      )?.observation.values,
    ).toEqual({ positive: 8, total: 10 });

    unmount();
    const reopenedState = structuredClone(persisted!);
    const visibleRecord = reopenedState.progressiveEntry.stagedRecords.find(
      ({ observation }) => observation.readoutKey === "positive_rate",
    )!;
    visibleRecord.observation.identities.batch_id = "batch-preserved";
    const hiddenRecord = structuredClone(visibleRecord);
    hiddenRecord.recordId = "record.hidden.not-performed";
    hiddenRecord.conditionCellId = "cell.control.plus";
    hiddenRecord.eligibility = "excluded_condition_or_binding";
    hiddenRecord.observation.observationId = "observation.hidden.not-performed";
    hiddenRecord.observation.factors = { treatment: "control", dox: "plus" };
    hiddenRecord.observation.identities.dish_id = "hidden-dish";
    reopenedState.progressiveEntry.stagedRecords.push(hiddenRecord);
    const reopenedSaves: ProgressiveExperimentProjectState[] = [];
    render(
      <ProgressiveSparseExperimentPage
        canvas={canvas}
        pattern={pattern}
        initialState={reopenedState}
        saveProject={async (state) => {
          reopenedSaves.push(state);
          return { state, target: "sparse.lsa" };
        }}
      />,
    );
    expect(screen.getByDisplayValue("dish-9")).toBeInTheDocument();
    expect(screen.getByDisplayValue("10")).toBeInTheDocument();
    fireEvent.change(screen.getByLabelText("Drug / + positive 1"), {
      target: { value: "9" },
    });
    fireEvent.click(screen.getByRole("button", { name: "保存" }));
    expect(await screen.findByRole("status")).toHaveTextContent("保存しました。");
    const resaved = reopenedSaves[0]!;
    expect(
      resaved.progressiveEntry.stagedRecords.find(
        ({ recordId }) => recordId === hiddenRecord.recordId,
      ),
    ).toEqual(hiddenRecord);
    expect(
      resaved.progressiveEntry.stagedRecords.find(
        ({ recordId }) => recordId === visibleRecord.recordId,
      )?.observation.identities.batch_id,
    ).toBe("batch-preserved");
    expect(
      resaved.progressiveEntry.stagedRecords.find(
        ({ recordId }) => recordId === visibleRecord.recordId,
      )?.observation.values.positive,
    ).toBe(9);
    expect(progressiveLineageMatchesStagedRecords(resaved.progressiveEntry)).toBe(true);
    expect(resaved.progressiveEntry.rawLineage?.rawText).toContain(hiddenRecord.recordId);
  });

  it("rejects an opened project whose same-looking IDs carry different Canvas semantics", async () => {
    const { canvas, pattern } = fixture();
    let persisted: ProgressiveExperimentProjectState | null = null;
    const first = render(
      <ProgressiveSparseExperimentPage
        canvas={canvas}
        pattern={pattern}
        saveProject={async (state) => {
          persisted = state;
          return { state, target: "sparse.lsa" };
        }}
      />,
    );
    fireEvent.click(screen.getByRole("button", { name: "保存" }));
    first.unmount();
    const mismatched = structuredClone(persisted!);
    mismatched.progressiveEntry.canvas.experimentLabel = "Changed semantics with same Canvas ID";
    render(
      <ProgressiveSparseExperimentPage
        canvas={canvas}
        pattern={pattern}
        openProject={async () => ({ state: mismatched, target: "other.lsa" })}
      />,
    );
    fireEvent.click(screen.getByRole("button", { name: "開く" }));
    expect(await screen.findByText(/異なる条件表または測定構造のproject/)).toBeInTheDocument();
  });
});

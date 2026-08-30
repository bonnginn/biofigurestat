import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";

import type { SpecializedEntryDraftProjectState } from "@lsaa/project";
import type { DedicatedEntryIntent } from "../app/dedicatedEntryIntent";
import type { SaveSpecializedEntryDraftProjectAction } from "../app/projectActions";
import type { CommonCoverageDraft, SpecializedCoreDraft } from "../app/specializedAnalysisDrafts";
import { CommonCoveragePage } from "./CommonCoveragePage";
import { SpecializedCorePage } from "./SpecializedCorePage";

const survivalIntent: DedicatedEntryIntent = {
  schemaVersion: "0.1.0",
  moduleId: "time_to_event",
  destination: "survival",
  sourceContext: "animal",
  entryRouteId: "time_to_event",
  experimentName: "Incomplete animal survival",
  experimentDescription: "Animals were followed until an event or censoring.",
  subjectUnitLabel: "Animal",
  facts: {
    timeToEventPattern: "single_terminal_event_or_censoring",
    subjectUnitRelationship: "unknown",
  },
};

const orderedCurveIntent: DedicatedEntryIntent = {
  schemaVersion: "0.1.0",
  moduleId: "ordered_curve_kinetics",
  destination: "nonlinear-fit",
  sourceContext: "protein_biochemical",
  entryRouteId: "ordered_curve_kinetics",
  experimentName: "Two-axis kinetic draft",
  experimentDescription: "Response was recorded over time at several concentrations.",
  subjectUnitLabel: "Reaction",
  facts: { orderedAxisCount: 2 },
};

function survivalDraft(text: string): SpecializedCoreDraft {
  return {
    text,
    transform: "none",
    rangeMin: "",
    rangeMax: "",
    missingColor: "#d1d5db",
    showCellValues: false,
    showLogRankAnnotation: true,
    statisticsSetupExpanded: true,
    subjectUnitRelationship: "unknown",
    followUpUnit: "days",
    numericStatusMapping: null,
    entryIntent: survivalIntent,
  };
}

function orderedDraft(text: string): CommonCoverageDraft {
  return {
    text,
    contingencyMethod: "fisher_exact",
    display: "count",
    includeIntercept: true,
    xLabel: "Time",
    yLabel: "Response",
    xUnit: "min",
    yUnit: "a.u.",
    xScale: "linear",
    yScale: "linear",
    showBand: true,
    distributionType: "histogram",
    binCount: "",
    nonlinearModel: "one_phase_association",
    nonlinearModelExplicitlySelected: true,
    modelRationale: "Explicit kinetic model",
    fitSettings: {
      baseline: { initial: "", lower: "", upper: "" },
      plateau: { initial: "", lower: "", upper: "" },
      rate: { initial: "", lower: "0", upper: "" },
      vmax: { initial: "", lower: "", upper: "" },
      km: { initial: "", lower: "", upper: "" },
    },
    entryModuleFacts: { orderedAxisCount: 2 },
    entryIntent: orderedCurveIntent,
  };
}

describe("dedicated entry safe-draft UI persistence", () => {
  it("saves and reopens incomplete Survival input without claiming a design", async () => {
    const rawText =
      "Unit ID\tGroup\tFollow-up time\tStatus\nmouse-1\tControl\t4\tEvent\nmouse-2\tDrug\t\tCensored";
    let savedState: SpecializedEntryDraftProjectState | undefined;
    const saveDraft = vi.fn<SaveSpecializedEntryDraftProjectAction>(async (state, target) => {
      savedState = state;
      return { state, target: target ?? "C:/tmp/survival-draft.lsa" };
    });
    const first = render(
      <SpecializedCorePage
        mode="survival"
        onBack={vi.fn()}
        entryIntent={survivalIntent}
        initialDraft={survivalDraft(rawText)}
        saveSpecializedEntryDraftProject={saveDraft}
      />,
    );

    fireEvent.click(screen.getByRole("button", { name: "保存" }));
    await waitFor(() => expect(saveDraft).toHaveBeenCalledOnce());
    expect(savedState?.projectKind).toBe("specialized_entry_draft");
    expect(savedState?.route).toBe("survival");
    expect(savedState?.rawLineage.rawText).toBe(rawText);
    expect(savedState).not.toHaveProperty("designRevisions");

    first.unmount();
    render(
      <SpecializedCorePage
        mode="survival"
        onBack={vi.fn()}
        initialSpecializedEntryDraft={{
          state: savedState!,
          target: "C:/tmp/survival-draft.lsa",
        }}
        saveSpecializedEntryDraftProject={saveDraft}
      />,
    );
    expect(screen.getByLabelText("Survival data")).toHaveValue(rawText);
    expect(screen.getByDisplayValue("days")).toBeVisible();

    const revisedRawText = rawText.replace("\t\tCensored", "\t8\tCensored");
    fireEvent.change(screen.getByLabelText("Survival data"), {
      target: { value: revisedRawText },
    });
    fireEvent.click(screen.getByRole("button", { name: "保存" }));
    await waitFor(() => expect(saveDraft).toHaveBeenCalledTimes(2));
    expect(saveDraft.mock.calls[1]?.[0].rawLineage.rawText).toBe(revisedRawText);
    expect(saveDraft.mock.calls[1]?.[1]).toBe("C:/tmp/survival-draft.lsa");
  });

  it("saves a multiple-axis ordered-curve stop with the entered model and exact table", async () => {
    const rawText =
      "Unit ID\tSeries\tX\tY\nrun-1\tDrug A\t0\t0.1\nrun-1\tDrug A\t5\t0.8";
    let savedState: SpecializedEntryDraftProjectState | undefined;
    const saveDraft = vi.fn<SaveSpecializedEntryDraftProjectAction>(async (state) => {
      savedState = state;
      return { state, target: "C:/tmp/ordered-draft.lsa" };
    });
    render(
      <CommonCoveragePage
        mode="nonlinear-fit"
        onBack={vi.fn()}
        entryIntent={orderedCurveIntent}
        initialDraft={orderedDraft(rawText)}
        saveSpecializedEntryDraftProject={saveDraft}
      />,
    );

    fireEvent.click(screen.getByRole("button", { name: "保存" }));
    await waitFor(() => expect(saveDraft).toHaveBeenCalledOnce());

    expect(savedState?.route).toBe("nonlinear-fit");
    expect(savedState?.rawLineage.rawText).toBe(rawText);
    expect(savedState?.safeStop.status).toBe("safe_unsupported");
    expect(savedState?.answers).toMatchObject({
      kind: "ordered_curve",
      nonlinearModel: "one_phase_association",
      nonlinearModelExplicitlySelected: true,
      facts: { orderedAxisCount: 2 },
    });
    expect(savedState).not.toHaveProperty("analysisRuns");
    expect(savedState).not.toHaveProperty("graphSpecs");
  });
});

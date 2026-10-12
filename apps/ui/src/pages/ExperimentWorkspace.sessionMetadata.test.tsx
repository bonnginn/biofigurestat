import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { buildStructureContract } from "@lsaa/adaptive-input";
import { CanonicalAdaptiveObservationSchema } from "@lsaa/domain";
import { ProjectStateSchema } from "@lsaa/project";
import { createAdaptiveWorkspace } from "../app/adaptiveWorkspace";
import type { SaveProjectAction } from "../app/projectActions";
import { ExperimentWorkspace } from "./ExperimentWorkspace";

function repeatedSharedSource() {
  const contract = buildStructureContract({
    experimentName: "Anonymous donor time course",
    experimentDescription:
      "Each donor is split into condition-specific dishes, followed at two times.",
    experimentalUnitLabel: "Dish",
    identityLabel: "Dish ID",
    readoutLabel: "Signal",
    readoutRepresentation: "scalar",
    factorName: "Treatment",
    factorLevels: ["Vehicle", "Drug"],
    sameIdentityAcrossConditions: false,
    conditionEntityRelationship: {
      kind: "distinct_condition_units_shared_source",
      sourceUnitLabel: "Donor",
      sourceIdentityLabel: "Donor ID",
      sourceRole: "block",
      completeSetsRequired: true,
    },
    orderedAxis: { label: "Time", unit: "h", levels: [0, 6], sameIdentity: true },
  });
  const sourceKey = contract.matching.identityKey!;
  const unitKey = contract.identities.find(
    ({ unitLevelKey }) => unitLevelKey === contract.experimentalUnitLevelKey,
  )!.key;
  const observations = ["D1", "D2"].flatMap((donor) =>
    ["Vehicle", "Drug"].flatMap((treatment) =>
      [0, 6].map((time) =>
        CanonicalAdaptiveObservationSchema.parse({
          observationId: `donor.${donor.toLowerCase()}.${treatment.toLowerCase()}.${time}`,
          readoutKey: contract.readouts[0]!.key,
          identities: { [sourceKey]: donor, [unitKey]: `${donor}-${treatment}` },
          factors: { [contract.factors[0]!.key]: treatment },
          axes: { [contract.orderedAxes[0]!.key]: time },
          hierarchy: {},
          values: { [contract.readouts[0]!.key]: time + 1 },
          missingness: {},
          sourceRow: null,
        }),
      ),
    ),
  );
  const workspace = createAdaptiveWorkspace({
    contract,
    observations,
    mapping: null,
    lineage: null,
    now: "2026-10-09T00:00:00Z",
  });
  if (workspace.status !== "ready" || !workspace.draft)
    throw new Error("Anonymous fixture is not editable");
  return { ...workspace, draft: workspace.draft, observations };
}

describe("explicit session metadata presentation", () => {
  it("keeps an explicitly supplied run ID and leaves an unresolved source label blank", () => {
    const workspace = repeatedSharedSource();
    const draft = {
      ...workspace.draft,
      experiments: workspace.draft.experiments.map((experiment, index) =>
        index === 0
          ? {
              ...experiment,
              label: "Unresolved source",
              stableUnitId: "D2",
              sessionId: "run.explicit",
            }
          : experiment,
      ),
    };
    render(
      <ExperimentWorkspace initialDraft={draft} initialCells={workspace.cells} onBack={vi.fn()} />,
    );
    fireEvent.click(screen.getByRole("tab", { name: "Unresolved source" }));
    fireEvent.click(screen.getByText("実験情報（日付未入力）"));
    expect(screen.getByRole("textbox", { name: "Unresolved sourceのDonor ID" })).toHaveValue("");
    expect(screen.getByRole("textbox", { name: "Unresolved sourceの実験回ID" })).toHaveValue(
      "run.explicit",
    );
    expect(draft.experiments[0]!.stableUnitId).toBe("D2");
  });

  it("shows canonical shared source ID and no invented run ID without changing saved identities", async () => {
    const workspace = repeatedSharedSource();
    const before = JSON.stringify(workspace.draft);
    const saveProject = vi.fn<SaveProjectAction>(async (state) => ({
      state: ProjectStateSchema.parse(state),
      target: "C:/anonymous/session-metadata.lsa",
    }));
    render(
      <ExperimentWorkspace
        initialDraft={workspace.draft}
        initialCells={workspace.cells}
        saveProject={saveProject}
        onBack={vi.fn()}
      />,
    );
    fireEvent.click(screen.getByRole("tab", { name: "D1" }));
    fireEvent.click(screen.getByText("実験情報（日付未入力）"));
    expect(screen.getByRole("textbox", { name: "D1のDonor ID" })).toHaveValue("D1");
    expect(screen.getByRole("textbox", { name: "D1のDonor ID" })).toBeDisabled();
    expect(screen.getByRole("textbox", { name: "D1の実験回ID" })).toHaveValue("");
    expect(screen.getByRole("textbox", { name: "D1の実験日" })).toHaveValue("");
    fireEvent.click(screen.getByRole("button", { name: "プロジェクトを保存" }));
    await waitFor(() => expect(saveProject).toHaveBeenCalledTimes(1));
    const state = saveProject.mock.calls[0]![0];
    expect(state.adaptiveInput!.canonicalObservations).toEqual(workspace.observations);
    expect(state.experimentWorkspace!.experimentSessions).toEqual(workspace.draft.experiments);
    expect(JSON.stringify(workspace.draft)).toBe(before);
  });
});

import { it, expect } from "vitest";
import { buildStructureContract } from "@lsaa/adaptive-input";
import { CanonicalAdaptiveObservationSchema } from "@lsaa/domain";
import { ProjectStateSchema } from "@lsaa/project";
import { updateWorksheetRowMetadata, type ExperimentSetDraft } from "./experimentDraft";
import { createAdaptiveWorkspace } from "./adaptiveWorkspace";
import {
  createExperimentWorkspaceProject,
  rehydrateExperimentWorkspace,
} from "./experimentWorkspaceProject";
it("persists dates on new worksheet rows without changing canonical units or observations", () => {
  const now = "2026-09-09T00:00:00.000Z";
  const contract = buildStructureContract({
    experimentName: "Independent dishes",
    experimentDescription: "Separate dishes",
    experimentalUnitLabel: "dish",
    identityLabel: "Dish ID",
    readoutLabel: "Signal",
    readoutRepresentation: "scalar",
    factorName: "Group",
    factorLevels: ["Control", "Drug"],
    sameIdentityAcrossConditions: false,
  });
  const observations = ["Control", "Drug"].flatMap((group, g) =>
    [0, 1].map((i) =>
      CanonicalAdaptiveObservationSchema.parse({
        observationId: `obs.${g}.${i}`,
        readoutKey: "signal",
        identities: { dishid: `dish.${g}.${i}` },
        factors: { group },
        axes: {},
        hierarchy: {},
        values: { signal: 1 + g + i },
        missingness: {},
        sourceRow: i + 1,
      }),
    ),
  );
  const workspace = createAdaptiveWorkspace({
    contract,
    observations,
    mapping: null,
    lineage: null,
    now,
  });
  if (!workspace.draft) throw new Error("Expected workspace");
  const original = { ...workspace.draft, experiments: workspace.draft.experiments.slice(0, 1) };
  let changed = updateWorksheetRowMetadata(original, 1, { date: "2026-08-26" });
  changed = updateWorksheetRowMetadata(changed, 2, { date: "2026-08-28" });
  const save = (draft: ExperimentSetDraft) =>
    createExperimentWorkspaceProject({ draft, cells: workspace.cells, graphs: [], now });
  const before = save(original);
  const after = save(changed);
  expect(changed.adaptiveInput).toBe(original.adaptiveInput);
  expect(changed.experiments[0]).toEqual(original.experiments[0]);
  expect(after.observations).toEqual(before.observations);
  expect(after.unitInstances).toEqual(before.unitInstances);
  const reopened = rehydrateExperimentWorkspace(
    ProjectStateSchema.parse(JSON.parse(JSON.stringify(after))),
  );
  expect(reopened?.draft.experiments.map(({ date }) => date)).toEqual([
    original.experiments[0].date,
    "2026-08-26",
    "2026-08-28",
  ]);
  expect(reopened?.draft.conditionAssignment.kind).toBe("independent");
  expect(reopened?.draft.adaptiveInput?.canonicalObservations).toEqual(observations);
});

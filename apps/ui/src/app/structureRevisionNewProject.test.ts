import { describe, expect, it } from "vitest";
import { ProjectStateSchema } from "@lsaa/project";
import {
  buildConditionCombinations,
  safelyBuildBiologicalSetup,
  type ConditionEntryBlock,
} from "../components/BiologicalExperimentSetup";
import { createProjectFromEditedConditions } from "./structureRevisionNewProject";
import { rehydrateExperimentWorkspace } from "./experimentWorkspaceProject";
import { isSessionProjectTarget, newSessionProjectTarget } from "./sessionProjectTarget";

function setup(kind: "independent" | "nested" | "paired" | "repeated") {
  const block: ConditionEntryBlock = {
    id: "condition-block.1",
    name: "Condition",
    showGroups: false,
    groupLabels: ["", "", "", "", ""],
    values: [
      ["Control", "Edited drug", "", "", ""],
      ...Array.from({ length: 4 }, () => ["", "", "", "", ""]),
    ],
  };
  const built = safelyBuildBiologicalSetup({
    title: `Edited ${kind} conditions`,
    measurementLabel: "Response",
    valueForm: "single",
    measurementUsesNestedObservation: kind === "nested",
    measurementUsesOrderedAxis: kind === "repeated",
    blocks: [block],
    combinations: buildConditionCombinations([block]),
    statuses: {},
    receiverLabel: "Dish",
    receiverIdLabel: "Dish ID",
    relationship: kind === "paired" ? "shared_source" : "separate",
    sourceLabel: kind === "paired" ? "Donor" : "",
    sourceIdLabel: kind === "paired" ? "Donor ID" : "",
    sharedSourcePairedBlockId: kind === "paired" ? block.id : null,
    childLabel: kind === "nested" ? "Cell" : "",
    ...(kind === "repeated"
      ? { orderedAxis: { label: "Time", unit: "h", levels: [0, 24], sameIdentity: true } }
      : {}),
  });
  if (built.status !== "ready") throw new Error(built.reason);
  return built.result;
}

describe("new project from edited conditions without observation/history reuse", () => {
  it.each(["independent", "nested", "paired", "repeated"] as const)(
    "preserves explicit %s design facts while creating no measured data or results",
    (kind) => {
      const result = setup(kind);
      const before = JSON.stringify(result);
      const state = createProjectFromEditedConditions(result);
      expect(state.metadata.projectName).toBe(result.contract.experimentName);
      expect(state.adaptiveInput?.contract).toEqual(result.contract);
      expect(state.adaptiveInput?.canonicalObservations).toEqual([]);
      expect(state.adaptiveInput?.numericPresentation).toBeUndefined();
      expect(state.adaptiveInput?.mapping).toBeNull();
      expect(state.adaptiveInput?.rawLineage).toBeNull();
      expect(state.observations).toEqual([]);
      expect(state.analysisRuns).toEqual([]);
      expect(state.graphs).toEqual([]);
      expect(state.derivedValues).toEqual([]);
      expect(state.derivedDatasetRevisions).toEqual([]);
      const reopened = rehydrateExperimentWorkspace(
        ProjectStateSchema.parse(JSON.parse(JSON.stringify(state))),
      );
      expect(reopened?.draft.adaptiveInput?.contract).toEqual(result.contract);
      expect(reopened?.graphs).toEqual([]);
      expect(reopened?.cells).toEqual({});
      expect(JSON.stringify(result)).toBe(before);
    },
  );

  it("uses the existing secure project factory for independent projects with identical conditions", () => {
    const result = setup("independent");
    const first = createProjectFromEditedConditions(result);
    const second = createProjectFromEditedConditions(result);
    expect(first.metadata.projectId).toMatch(/^project\.workspace\.[0-9a-f]{32}$/);
    expect(second.metadata.projectId).not.toBe(first.metadata.projectId);
  });

  it("rejects inconsistent edited presentation without mutating the input", () => {
    const valid = setup("independent");
    const result = { ...valid, contract: { ...valid.contract, readouts: [] } };
    const before = JSON.stringify(result);
    expect(() => createProjectFromEditedConditions(result)).toThrow();
    expect(JSON.stringify(result)).toBe(before);
  });

  it("creates distinct process-local targets and distinguishes real save paths", () => {
    const first = newSessionProjectTarget();
    const second = newSessionProjectTarget();
    expect(first).not.toBe(second);
    expect(isSessionProjectTarget(first)).toBe(true);
    expect(isSessionProjectTarget(undefined)).toBe(false);
    expect(isSessionProjectTarget("C:\\Synthetic\\saved.lsa")).toBe(false);
    expect(isSessionProjectTarget("/tmp/saved.lsa")).toBe(false);
  });
});

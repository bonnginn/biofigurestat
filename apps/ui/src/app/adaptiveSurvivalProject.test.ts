import { describe, expect, it } from "vitest";
import { ProjectStateSchema } from "@lsaa/project";

import {
  adaptiveSurvivalUnitId,
  createAdaptiveSurvivalProject,
  parseAdaptiveSurvivalText,
  reviseAdaptiveSurvivalProject,
  synchronizeAdaptiveSurvivalProject,
  updateAdaptiveSurvivalSnapshot,
} from "./adaptiveSurvivalProject";
import { createTimeToEventEntry } from "./timeToEventEntry";
import { createTimeToEventContractProjection } from "./timeToEventProjection";

const importedAt = "2026-08-27T01:00:00.000Z";
const createdAt = "2026-08-27T02:00:00.000Z";
const updatedAt = "2026-08-27T03:00:00.000Z";
const originalText = [
  "Unit ID\tGroup\tFollow-up time\tStatus",
  "M01\tVehicle\t7\tEvent",
  "M02\tVehicle\t11\tCensored",
  "M03\tDrug\t5\tEvent",
  "M04\tDrug\t11\tCensored",
].join("\n");

function initialSnapshot() {
  const result = createTimeToEventEntry({
    experimentName: "Mouse survival study",
    experimentDescription:
      "Each mouse was assigned one treatment and followed to one terminal event or censoring.",
    subjectUnitLabel: "mouse",
    subjectUnitRelationship: "subject_is_experimental_unit",
    tsvText: originalText,
    timeToEventPattern: "single_terminal_event_or_censoring",
    sourceKind: "tsv",
    sourceLabel: "instrument-export.tsv",
    followUpUnit: "day",
    now: importedAt,
  });
  if (result.status !== "surface_ready") throw new Error("fixture did not compile");
  return result.snapshot;
}

describe("adaptive survival editable persistence", () => {
  it("keeps distinct Japanese subject identities distinct in project unit IDs", () => {
    expect(adaptiveSurvivalUnitId("マウス甲")).not.toBe(adaptiveSurvivalUnitId("マウス乙"));
    expect(adaptiveSurvivalUnitId("マウス甲")).toBe(adaptiveSurvivalUnitId("マウス甲"));
  });

  it("parses reordered source columns and keeps extra metadata through the saved mapping", () => {
    const sourceText = [
      "Cage\tSubject ID\tGroup\tEvent\tFollow-up time",
      "C1\tM01\tVehicle\tEvent\t7",
      "C2\tM02\tDrug\tCensored\t11",
    ].join("\n");
    const compiled = createTimeToEventEntry({
      experimentName: "Mapped survival study",
      experimentDescription: "Each mouse was followed until one event or censoring.",
      subjectUnitLabel: "mouse",
      subjectUnitRelationship: "subject_is_experimental_unit",
      tsvText: sourceText,
      timeToEventPattern: "single_terminal_event_or_censoring",
      sourceKind: "tsv",
      sourceLabel: "source-with-cage.tsv",
      now: importedAt,
    });
    if (compiled.status !== "surface_ready") throw new Error("fixture did not compile");

    expect(parseAdaptiveSurvivalText(compiled.snapshot, sourceText)).toEqual([
      {
        unitId: "M01",
        conditionId: "Vehicle",
        followUpTime: 7,
        eventObserved: true,
        metadata: { Cage: "C1" },
      },
      {
        unitId: "M02",
        conditionId: "Drug",
        followUpTime: 11,
        eventObserved: false,
        metadata: { Cage: "C2" },
      },
    ]);
    const updated = updateAdaptiveSurvivalSnapshot(compiled.snapshot, sourceText, updatedAt);
    expect(updated.rawLineage).toEqual(compiled.snapshot.rawLineage);
    expect(updated.canonicalObservations).toEqual(compiled.snapshot.canonicalObservations);
    expect(updated.mapping?.columns.Cage).toMatchObject({ role: "metadata", semanticKey: null });
    expect(updated.mapping?.columns["Follow-up time"]).toMatchObject({
      role: "axis",
      semanticKey: "follow_up",
    });
  });

  it("retains follow-up as both an ordered axis and typed event record after editing", () => {
    const snapshot = initialSnapshot();
    const editedText = originalText.replace("M01\tVehicle\t7\tEvent", "M01\tVehicle\t9\tEvent");
    const updated = updateAdaptiveSurvivalSnapshot(snapshot, editedText, updatedAt);

    expect(updated.canonicalObservations[0]).toMatchObject({
      identities: { mouse_id: "M01" },
      factors: { group: "Vehicle" },
      axes: { follow_up: 9 },
      values: {
        time_to_event_follow_up: 9,
        time_to_event_event_observed: true,
      },
    });
    expect(updated.mapping?.columns["Follow-up time"]).toMatchObject({
      role: "axis",
      semanticKey: "follow_up",
    });
    expect(updated.mapping?.columns.Status).toMatchObject({
      role: "value",
      semanticKey: "time_to_event_event_observed",
    });
    expect(updated.equivalence).toMatchObject({ status: "equivalent", checkedAt: updatedAt });
  });

  it("keeps the follow-up scientific role through project save and open", () => {
    const created = createAdaptiveSurvivalProject(initialSnapshot(), createdAt);
    const reopened = ProjectStateSchema.parse(JSON.parse(JSON.stringify(created)));
    const activeDesign = reopened.designRevisions.find(
      ({ id }) => id === reopened.activeDesignRevisionId,
    )!.design;

    expect(activeDesign.observationFactors?.[0]).toMatchObject({
      key: "follow_up",
      scientificRole: "time",
    });
    expect(reopened.adaptiveInput?.equivalence.designFingerprint).toBe(
      createTimeToEventContractProjection(reopened.adaptiveInput!.contract).assertEquivalent(
        activeDesign,
        createdAt,
      ).designFingerprint,
    );
  });

  it("reuses the persisted explicit 0/1 status mapping after save and open", () => {
    const numericText = originalText.replaceAll("Event", "1").replaceAll("Censored", "0");
    const compiled = createTimeToEventEntry({
      experimentName: "Numeric survival study",
      experimentDescription: "Each mouse was followed to one event or censoring.",
      subjectUnitLabel: "mouse",
      subjectUnitRelationship: "subject_is_experimental_unit",
      tsvText: numericText,
      timeToEventPattern: "single_terminal_event_or_censoring",
      sourceKind: "tsv",
      sourceLabel: "numeric-survival.tsv",
      numericStatusMapping: { event: "1", censored: "0" },
      now: importedAt,
    });
    if (compiled.status !== "surface_ready") throw new Error("fixture did not compile");
    const created = createAdaptiveSurvivalProject(compiled.snapshot, createdAt);
    const reopened = ProjectStateSchema.parse(JSON.parse(JSON.stringify(created)));

    expect(parseAdaptiveSurvivalText(reopened.adaptiveInput!, numericText)).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ unitId: "M01", eventObserved: true }),
        expect.objectContaining({ unitId: "M02", eventObserved: false }),
      ]),
    );
    expect(reopened.adaptiveInput?.targetedConfirmations).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          key: "time_to_event_status_mapping",
          answer: "1=event;0=censored",
        }),
      ]),
    );
  });

  it("keeps original ingress lineage while recording the editable raw TSV", () => {
    const snapshot = initialSnapshot();
    const previousTransformations = snapshot.rawLineage?.transformations ?? [];
    const editedText = originalText.replace(
      "M02\tVehicle\t11\tCensored",
      "M02\tVehicle\t12\tCensored",
    );
    const updated = updateAdaptiveSurvivalSnapshot(snapshot, editedText, updatedAt);

    expect(updated.rawLineage).toMatchObject({
      sourceKind: "tsv",
      sourceLabel: "instrument-export.tsv",
      importedAt,
      rawText: editedText,
      sha256: null,
    });
    expect(updated.rawLineage?.transformations.slice(0, previousTransformations.length)).toEqual(
      previousTransformations,
    );
    expect(updated.rawLineage?.transformations).toEqual(
      expect.arrayContaining([
        expect.stringContaining(`edited in typed survival workspace at ${updatedAt}`),
        "mapped follow-up time to ordered axis follow_up and typed readout value",
      ]),
    );
    expect(updated.mapping?.sourceLabel).toBe("instrument-export.tsv");
  });

  it("appends raw and design revisions instead of rebuilding existing project history", () => {
    const snapshot = initialSnapshot();
    const initial = createAdaptiveSurvivalProject(snapshot, createdAt);
    const originalDesignIds = initial.designRevisions.map(({ id }) => id);
    const originalRawIds = initial.rawRevisions.map(({ id }) => id);
    const originalProvenance = initial.provenanceEvents;
    const editedText = `${originalText}\nM05\tDrug\t9\tEvent`;
    const updated = updateAdaptiveSurvivalSnapshot(snapshot, editedText, updatedAt);
    const revised = reviseAdaptiveSurvivalProject(initial, updated, updatedAt);

    expect(revised.designRevisions).toHaveLength(2);
    expect(revised.designRevisions.slice(0, originalDesignIds.length).map(({ id }) => id)).toEqual(
      originalDesignIds,
    );
    expect(revised.designRevisions[1]?.previousRevisionId).toBe(initial.activeDesignRevisionId);
    expect(revised.designRevisions[1]?.design.plannedN).toBe(5);
    expect(revised.designRevisions[1]?.design.observationFactors?.[0]?.scientificRole).toBe(
      "time",
    );
    expect(revised.rawRevisions).toHaveLength(2);
    expect(revised.rawRevisions.slice(0, originalRawIds.length).map(({ id }) => id)).toEqual(
      originalRawIds,
    );
    expect(revised.rawRevisions[1]).toMatchObject({
      id: "raw.adaptive.2",
      previousRevisionId: initial.activeRawRevisionId,
      sourceKind: "project_edit",
      sourceName: "instrument-export.tsv",
    });
    expect(
      revised.observations.filter(({ rawRevisionId }) => rawRevisionId === "raw.adaptive.1"),
    ).toHaveLength(4);
    expect(
      revised.observations.filter(({ rawRevisionId }) => rawRevisionId === "raw.adaptive.2"),
    ).toHaveLength(5);
    expect(revised.provenanceEvents.slice(0, originalProvenance.length)).toEqual(
      originalProvenance,
    );
    expect(revised.adaptiveInput?.rawLineage?.rawText).toBe(editedText);
    expect(revised.adaptiveInput?.contract).toEqual(
      revised.designRevisions[1]?.design.adaptiveStructure?.contract,
    );
  });

  it("does not create a redundant design revision when only raw values change", () => {
    const snapshot = initialSnapshot();
    const initial = createAdaptiveSurvivalProject(snapshot, createdAt);
    const editedText = originalText.replace("M01\tVehicle\t7\tEvent", "M01\tVehicle\t7\tCensored");
    const updated = updateAdaptiveSurvivalSnapshot(snapshot, editedText, updatedAt);
    const revised = reviseAdaptiveSurvivalProject(initial, updated, updatedAt);

    expect(revised.designRevisions).toHaveLength(1);
    expect(revised.activeDesignRevisionId).toBe(initial.activeDesignRevisionId);
    expect(revised.rawRevisions).toHaveLength(2);
    expect(revised.activeRawRevisionId).toBe("raw.adaptive.2");
    const currentRows = revised.observations.filter(
      ({ rawRevisionId }) => rawRevisionId === revised.activeRawRevisionId,
    );
    expect(currentRows[0]?.measurement).toEqual({
      kind: "time_to_event",
      followUpTime: 7,
      eventObserved: false,
    });
  });

  it("does not attach a different experiment contract to an existing project history", () => {
    const snapshot = initialSnapshot();
    const initial = createAdaptiveSurvivalProject(snapshot, createdAt);
    const mismatched = {
      ...snapshot,
      contract: { ...snapshot.contract, contractId: "contract.different.time_to_event" },
    };

    expect(() => reviseAdaptiveSurvivalProject(initial, mismatched, updatedAt)).toThrow(
      "ADAPTIVE_SURVIVAL_CONTRACT_ID_MISMATCH",
    );
    expect(initial.rawRevisions).toHaveLength(1);
    expect(initial.designRevisions).toHaveLength(1);
  });

  it("revalidates an unchanged save against the active design without inventing a revision", () => {
    const snapshot = initialSnapshot();
    const initial = createAdaptiveSurvivalProject(snapshot, createdAt);
    const updated = updateAdaptiveSurvivalSnapshot(snapshot, originalText, updatedAt);
    const synchronized = synchronizeAdaptiveSurvivalProject(initial, updated, updatedAt);

    expect(synchronized.rawRevisions).toEqual(initial.rawRevisions);
    expect(synchronized.designRevisions).toEqual(initial.designRevisions);
    expect(synchronized.adaptiveInput?.rawLineage).toEqual(snapshot.rawLineage);
    expect(synchronized.adaptiveInput?.rawLineage?.transformations).not.toEqual(
      expect.arrayContaining([expect.stringContaining("edited in typed survival workspace")]),
    );
    expect(synchronized.adaptiveInput?.equivalence.designFingerprint).toBe(
      initial.adaptiveInput?.equivalence.designFingerprint,
    );
    expect(synchronized.designRevisions[0]?.design.observationFactors?.[0]?.scientificRole).toBe(
      "time",
    );
  });
});

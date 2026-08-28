import { describe, expect, it } from "vitest";

import type { DedicatedEntryIntent } from "./dedicatedEntryIntent";
import { scopedSpecializedDraft } from "./specializedAnalysisDrafts";

const animalIntent: DedicatedEntryIntent = {
  schemaVersion: "0.1.0",
  moduleId: "time_to_event",
  destination: "survival",
  sourceContext: "animal",
  entryRouteId: "animal_time_to_event",
  experimentName: "Animal event time",
  experimentDescription: "Animals were followed to a first terminal event or censoring.",
  subjectUnitLabel: "Animal",
  facts: {
    timeToEventPattern: "single_terminal_event_or_censoring",
    subjectUnitRelationship: "unknown",
  },
};

describe("specialized draft scoping", () => {
  it("restores a draft only for the same dedicated experiment entry", () => {
    const draft = { text: "animal rows", entryIntent: animalIntent };
    expect(scopedSpecializedDraft(draft, animalIntent)).toBe(draft);
    expect(
      scopedSpecializedDraft(draft, {
        ...animalIntent,
        sourceContext: "cell_culture",
        entryRouteId: "cell_time_to_event",
      }),
    ).toBeUndefined();
  });

  it("does not leak an adaptive draft into a direct legacy visit", () => {
    expect(scopedSpecializedDraft({ text: "adaptive", entryIntent: animalIntent }, undefined)).toBe(
      undefined,
    );
    const legacyDraft = { text: "legacy" };
    expect(scopedSpecializedDraft(legacyDraft, undefined)).toBe(legacyDraft);
  });
});

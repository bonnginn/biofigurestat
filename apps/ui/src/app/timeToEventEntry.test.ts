import { describe, expect, it } from "vitest";

import { createTimeToEventEntry } from "./timeToEventEntry";

const now = "2026-08-27T02:00:00.000Z";
const standardTsv = [
  "Unit ID\tGroup\tFollow-up time\tStatus\tCage",
  "M01\tVehicle\t7\tEvent\tC1",
  "M02\tVehicle\t11\tCensored\tC1",
  "M03\tDrug\t5\tEvent\tC2",
  "M04\tDrug\t11\tCensored\tC2",
].join("\n");

const base = {
  experimentName: "Mouse survival study",
  experimentDescription:
    "Each mouse received one assigned treatment and was followed until the terminal event or the planned end of observation.",
  subjectUnitLabel: "mouse",
  subjectUnitRelationship: "subject_is_experimental_unit" as const,
  tsvText: standardTsv,
  timeToEventPattern: "single_terminal_event_or_censoring" as const,
  sourceLabel: "mouse-survival.tsv",
  sourceKind: "clipboard" as const,
  followUpUnit: "day",
  now,
};

describe("standard time-to-event dedicated entry", () => {
  it("builds a versioned contract and typed adaptive snapshot with zero extra questions", () => {
    const result = createTimeToEventEntry(base);
    expect(result.status).toBe("surface_ready");
    if (result.status !== "surface_ready") throw new Error("fixture did not compile");

    expect(result.entryResolution.unresolvedTargetedFacts).toEqual([]);
    expect(result.entryResolution.safeAutoInferences).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          semanticPath: "experimentalUnitLevelKey",
          value: "subject_identity_level_from_surface",
        }),
        expect.objectContaining({ semanticPath: "matching.kind", value: "independent" }),
        expect.objectContaining({
          semanticPath: "readouts[].representation",
          value: "event_censoring",
        }),
      ]),
    );
    expect(result.contract).toMatchObject({
      schemaVersion: "0.1.0",
      experimentName: "Mouse survival study",
      experimentalUnitLevelKey: "mouse",
      matching: { kind: "independent", identityKey: null },
      factors: [{ key: "group", levels: ["Vehicle", "Drug"] }],
      orderedAxes: [
        {
          key: "follow_up",
          unit: "day",
          levels: [5, 7, 11],
          sampling: "event_follow_up",
          identityRetained: true,
        },
      ],
      readouts: [
        {
          key: "time_to_event",
          representation: "event_censoring",
          componentKeys: ["follow_up", "event_observed"],
          axisKeys: ["follow_up"],
        },
      ],
    });
    expect(result.snapshot.surface.surfaceId).toBe("typed_record_table");
    expect(result.snapshot.targetedConfirmations).toEqual([
      {
        key: "subject_unit_relationship",
        answer: "subject_is_experimental_unit",
        confirmedAt: now,
      },
    ]);
    expect(result.snapshot.canonicalObservations).toHaveLength(4);
    expect(result.snapshot.canonicalObservations[0]).toMatchObject({
      identities: { mouse_id: "M01" },
      factors: { group: "Vehicle" },
      axes: { follow_up: 7 },
      values: {
        time_to_event_follow_up: 7,
        time_to_event_event_observed: true,
      },
      sourceRow: 2,
    });
    expect(result.snapshot.canonicalObservations[1]?.values).toMatchObject({
      time_to_event_event_observed: false,
    });
    expect(result.snapshot.mapping?.columns).toMatchObject({
      "Unit ID": { role: "identity", semanticKey: "mouse_id" },
      Group: { role: "factor", semanticKey: "group" },
      "Follow-up time": {
        role: "axis",
        semanticKey: "follow_up",
      },
      Status: { role: "value", semanticKey: "time_to_event_event_observed" },
      Cage: { role: "metadata", semanticKey: null },
    });
    expect(result.snapshot.rawLineage?.rawText).toBe(standardTsv);
    expect(result.snapshot.rawLineage?.transformations).toContain(
      "decoded explicit event/censoring status labels",
    );
  });

  it("evaluates the existing design projection and records its dedicated-route diagnostic", () => {
    const result = createTimeToEventEntry(base);
    expect(result.status).toBe("surface_ready");
    if (result.status !== "surface_ready") throw new Error("fixture did not compile");

    expect(result.dualWrite.status).toBe("evaluated");
    expect(result.dualWrite.equivalence).toMatchObject({
      status: "equivalent",
      checkedAt: now,
      diagnostics: [],
    });
    expect(result.snapshot.equivalence).toEqual(result.dualWrite.equivalence);
    expect(result.design.plannedN).toBe(4);
    expect(result.design.observationFactors?.[0]?.scientificRole).toBe("time");
    expect(result.design.adaptiveStructure?.contract).toEqual(result.contract);
    expect(result.dualWrite.diagnostics).toContain(
      "legacy_workspace_uses_dedicated_survival_route",
    );
  });

  it.each([
    ["recurrent_events", "RECURRENT_EVENTS_NOT_REPRESENTABLE"],
    ["competing_events", "COMPETING_EVENTS_NOT_REPRESENTABLE"],
    ["interval_censoring", "INTERVAL_CENSORING_NOT_REPRESENTABLE"],
    ["multi_state", "MULTI_STATE_EVENT_PROCESS_NOT_REPRESENTABLE"],
  ] as const)("preserves raw TSV and safe-stops %s", (pattern, reason) => {
    const result = createTimeToEventEntry({ ...base, timeToEventPattern: pattern });
    expect(result.status).toBe("safe_unsupported");
    expect(result.rawLineage.rawText).toBe(standardTsv);
    expect(result.entryResolution.capabilityReasonCodes).toEqual([reason]);
    expect(result.entryResolution.suggestedAlternativeModuleId).toBeNull();
    expect(result.contract).toBeNull();
    expect(result.snapshot).toBeNull();
    expect(result.dualWrite).toMatchObject({
      status: "stopped_before_projection",
      equivalence: null,
      diagnostics: [reason],
    });
  });

  it.each(["nested_in_parent", "unknown"] as const)(
    "does not promote %s subject rows to biological n",
    (subjectUnitRelationship) => {
      const result = createTimeToEventEntry({ ...base, subjectUnitRelationship });
      expect(result.status).toBe("contract_deferred");
      expect(result.rawLineage.rawText).toBe(standardTsv);
      expect(result.entryResolution.safeAutoInferences).not.toEqual(
        expect.arrayContaining([
          expect.objectContaining({ semanticPath: "experimentalUnitLevelKey" }),
        ]),
      );
      expect(result.contract).toBeNull();
      expect(result.snapshot).toBeNull();
      expect(result.design).toBeNull();
    },
  );

  it("does not infer a numeric event-status convention", () => {
    const numeric = standardTsv.replace("\tEvent\t", "\t1\t");
    const result = createTimeToEventEntry({ ...base, tsvText: numeric });
    expect(result.status).toBe("input_mapping_required");
    expect(result.rawLineage.rawText).toBe(numeric);
    expect(result.contract).toBeNull();
    expect(result.snapshot).toBeNull();
    expect(result.dualWrite.diagnostics.join(" ")).toMatch(/explicit numeric mapping/iu);
  });

  it("compiles numeric status only after the researcher supplies its explicit meaning", () => {
    const numeric = standardTsv.replaceAll("Event", "1").replaceAll("Censored", "0");
    const result = createTimeToEventEntry({
      ...base,
      tsvText: numeric,
      numericStatusMapping: { event: "1", censored: "0" },
    });
    expect(result.status).toBe("surface_ready");
    expect(result.snapshot?.canonicalObservations.map(({ values }) => values.time_to_event_event_observed)).toEqual([
      true,
      false,
      true,
      false,
    ]);
    expect(result.rawLineage.rawText).toBe(numeric);
    expect(result.rawLineage.transformations).toContain(
      "decoded numeric status mapping 1=Event, 0=Censored",
    );
    expect(result.snapshot?.targetedConfirmations).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          key: "subject_unit_relationship",
          answer: "subject_is_experimental_unit",
        }),
        expect.objectContaining({
          key: "time_to_event_status_mapping",
          answer: "1=event;0=censored",
        }),
      ]),
    );
  });

  it("rejects duplicate stable identities without losing the pasted table", () => {
    const duplicate = standardTsv.replace("M04\tDrug", "M03\tDrug");
    const result = createTimeToEventEntry({ ...base, tsvText: duplicate });
    expect(result.status).toBe("input_invalid");
    expect(result.rawLineage.rawText).toBe(duplicate);
    expect(result.contract).toBeNull();
    expect(result.snapshot).toBeNull();
    expect(result.dualWrite.diagnostics.join(" ")).toMatch(/Duplicate survival unit ID 'M03'/u);
  });

  it("compiles CSV with the same semantic mapping as TSV", () => {
    const commaText = standardTsv.replaceAll("\t", ",");
    const result = createTimeToEventEntry({
      ...base,
      tsvText: commaText,
      sourceKind: "csv",
      sourceLabel: "survival.csv",
    });
    expect(result.status).toBe("surface_ready");
    expect(result.rawLineage.rawText).toBe(commaText);
    expect(result.snapshot?.mapping?.delimiter).toBe("comma");
    expect(result.snapshot?.canonicalObservations).toHaveLength(4);
    expect(result.dualWrite.equivalence?.status).toBe("equivalent");
  });

  it.each([
    [
      "quoted comma CSV",
      [
        '"Unit ID","Group","Follow-up time","Status","Note"',
        '"M01","Vehicle, baseline","7","Event","north, cage"',
        '"M02","Drug","11","Censored","south, cage"',
      ].join("\n"),
      "comma",
    ],
    [
      "semicolon table",
      [
        "Unit ID;Group;Follow-up time;Status;Note",
        'M01;"Vehicle, baseline";7;Event;"north, cage"',
        'M02;Drug;11;Censored;"south, cage"',
      ].join("\n"),
      "semicolon",
    ],
  ] as const)("uses one parsed table for %s values and mapping", (_label, text, delimiter) => {
    const result = createTimeToEventEntry({
      ...base,
      tsvText: text,
      sourceKind: "csv",
      sourceLabel: "quoted-survival.csv",
    });
    expect(result.status).toBe("surface_ready");
    if (result.status !== "surface_ready") throw new Error("fixture did not compile");

    expect(result.snapshot.mapping?.delimiter).toBe(delimiter);
    expect(result.contract.factors[0]?.levels).toEqual(["Vehicle, baseline", "Drug"]);
    expect(result.snapshot.canonicalObservations).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          identities: { mouse_id: "M01" },
          factors: { group: "Vehicle, baseline" },
          values: expect.objectContaining({ time_to_event_event_observed: true }),
        }),
        expect.objectContaining({
          identities: { mouse_id: "M02" },
          factors: { group: "Drug" },
          values: expect.objectContaining({ time_to_event_event_observed: false }),
        }),
      ]),
    );
    expect(result.snapshot.mapping?.columns.Note).toMatchObject({
      role: "metadata",
      semanticKey: null,
    });
  });
});

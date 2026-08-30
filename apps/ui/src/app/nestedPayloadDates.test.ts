import { describe, expect, it } from "vitest";

import type { NestedImageJPastePayload } from "../components/NestedImageJPaste";
import { updateNestedPayloadExperimentDate } from "./nestedPayloadDates";

describe("nested payload experiment dates", () => {
  it("updates only cells below the selected experimental unit and advances the raw revision", () => {
    const payload = {
      conditionId: "condition.a",
      outcomeId: "outcome.intensity",
      rawRevisionId: "raw.1",
      method: "mean",
      unitInstances: [
        { id: "dish.1", levelId: "unit.dish", parentUnitId: null, label: "Dish 1", metadata: {} },
        { id: "dish.2", levelId: "unit.dish", parentUnitId: null, label: "Dish 2", metadata: {} },
        {
          id: "cell.1",
          levelId: "unit.cell",
          parentUnitId: "dish.1",
          label: "Cell 1",
          metadata: {},
        },
        {
          id: "cell.2",
          levelId: "unit.cell",
          parentUnitId: "dish.2",
          label: "Cell 2",
          metadata: {},
        },
      ],
      observations: [
        {
          id: "observation.1",
          rawRevisionId: "raw.1",
          unitInstanceId: "cell.1",
          conditionId: "condition.a",
          outcomeId: "outcome.intensity",
          measurement: { kind: "scalar", value: 10 },
          experimentDate: "2026-08-01",
        },
        {
          id: "observation.2",
          rawRevisionId: "raw.1",
          unitInstanceId: "cell.2",
          conditionId: "condition.a",
          outcomeId: "outcome.intensity",
          measurement: { kind: "scalar", value: 20 },
          experimentDate: "2026-08-02",
        },
      ],
      summaries: [
        {
          experimentalUnitId: "dish.1",
          conditionId: "condition.a",
          outcomeId: "outcome.intensity",
          value: 10,
          subsampleCount: 1,
          sourceObservationIds: ["observation.1"],
          sourceUnitIds: ["cell.1"],
        },
        {
          experimentalUnitId: "dish.2",
          conditionId: "condition.a",
          outcomeId: "outcome.intensity",
          value: 20,
          subsampleCount: 1,
          sourceObservationIds: ["observation.2"],
          sourceUnitIds: ["cell.2"],
        },
      ],
      transformation: {
        id: "transformation.1",
        version: "1.0.0",
        method: "replicate_summary",
        inputRevisionIds: ["raw.1"],
        parameters: {},
      },
      source: { columnLabel: "Mean", rowNumbers: [1, 2] },
    } satisfies NestedImageJPastePayload;

    const updated = updateNestedPayloadExperimentDate(payload, "dish.1", "2026-08-19", "raw.2");
    expect(updated.rawRevisionId).toBe("raw.2");
    expect(updated.transformation.inputRevisionIds).toEqual(["raw.2"]);
    expect(
      updated.observations.map(({ rawRevisionId, experimentDate }) => [
        rawRevisionId,
        experimentDate,
      ]),
    ).toEqual([
      ["raw.2", "2026-08-19"],
      ["raw.2", "2026-08-02"],
    ]);
  });
});

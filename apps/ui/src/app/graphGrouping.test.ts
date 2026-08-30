import { describe, expect, it } from "vitest";

import { createExperimentSetDraft, type ExperimentSetDraft } from "./experimentDraft";
import {
  createInitialGraphGrouping,
  normalizeGraphGroupingChannels,
  swapSingleXFactorAndSeries,
} from "./graphGrouping";

function twoFactorDraft(
  input: Readonly<{
    firstLevels: readonly string[];
    secondLevels: readonly string[];
  }>,
): ExperimentSetDraft {
  const base = createExperimentSetDraft("cell_culture", "nested_continuous");
  const conditions = input.firstLevels.flatMap((first) =>
    input.secondLevels.map((second, index) => ({
      id: `condition.${first}.${second}.${index}`.replace(/\s+/g, "-"),
      label: `${first} / ${second}`,
      attributes: { "factor.first": first, "factor.second": second },
    })),
  );
  return {
    ...base,
    attributes: [
      { id: "factor.first", label: "First" },
      { id: "factor.second", label: "Second" },
    ],
    conditions,
  };
}

describe("initial graph grouping", () => {
  it("uses the later factor as series when both factors have the same number of levels", () => {
    const grouping = createInitialGraphGrouping(
      twoFactorDraft({ firstLevels: ["F", "M"], secondLevels: ["HIP", "FFCC"] }),
    );

    expect(grouping).toMatchObject({
      x: { source: "factor", factorId: "factor.first", factorIds: ["factor.first"] },
      series: { source: "factor", factorId: "factor.second" },
    });
  });

  it("uses the factor with fewer levels as series to avoid an unnecessarily wide X axis", () => {
    const grouping = createInitialGraphGrouping(
      twoFactorDraft({
        firstLevels: ["Control", "Gene A #1", "Gene A #2", "Gene B #1"],
        secondLevels: ["Dox -", "Dox +"],
      }),
    );

    expect(grouping).toMatchObject({
      x: { source: "factor", factorId: "factor.first" },
      series: { source: "factor", factorId: "factor.second" },
    });
  });

  it("honors explicit visual roles instead of replacing them with the heuristic", () => {
    const base = twoFactorDraft({ firstLevels: ["A", "B"], secondLevels: ["1", "2"] });
    const draft: ExperimentSetDraft = {
      ...base,
      attributes: [
        { ...base.attributes[0]!, proposedVisualRole: "series" },
        { ...base.attributes[1]!, proposedVisualRole: "x" },
      ],
    };

    expect(createInitialGraphGrouping(draft)).toMatchObject({
      x: { source: "factor", factorId: "factor.second" },
      series: { source: "factor", factorId: "factor.first" },
    });
  });

  it("does not collapse two condition factors into one series when an ordered X axis is active", () => {
    const base = twoFactorDraft({ firstLevels: ["A", "B"], secondLevels: ["1", "2"] });
    const draft: ExperimentSetDraft = {
      ...base,
      time: {
        sampling: "longitudinal",
        unit: "h",
        points: [
          { id: "time.0", value: 0 },
          { id: "time.1", value: 1 },
        ],
      },
    };

    expect(createInitialGraphGrouping(draft)).toMatchObject({
      x: { source: "condition" },
      series: { source: "none" },
    });
  });

  it("swaps a single X factor and factor series without changing any semantic relation", () => {
    const initial = createInitialGraphGrouping(
      twoFactorDraft({ firstLevels: ["F", "M"], secondLevels: ["HIP", "FFCC"] }),
    );

    expect(swapSingleXFactorAndSeries(initial)).toMatchObject({
      x: { source: "factor", factorId: "factor.second", factorIds: ["factor.second"] },
      series: { source: "factor", factorId: "factor.first" },
    });
  });

  it("removes stale series and facet factors from the complete X hierarchy", () => {
    const normalized = normalizeGraphGroupingChannels({
      x: {
        source: "factor",
        factorId: "factor.first",
        factorIds: ["factor.first", "factor.second", "factor.facet", "factor.first"],
      },
      series: { source: "factor", factorId: "factor.second" },
      color: { source: "factor", factorId: "factor.second" },
      shape: { source: "factor", factorId: "factor.second" },
      facet: {
        source: "factor",
        factorId: "factor.facet",
        levelOrder: [],
        axisPolicy: "shared",
      },
    });

    expect(normalized.x).toEqual({
      source: "factor",
      factorId: "factor.first",
      factorIds: ["factor.first"],
    });
  });
});

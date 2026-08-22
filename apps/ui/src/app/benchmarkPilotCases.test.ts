import { describe, expect, it } from "vitest";

import { assessDraftGraphAnalysis } from "./experimentDraftAnalysis";
import { BENCHMARK_PILOT_CASES, mapBenchmarkPilotMeasurements } from "./benchmarkPilotCases";

describe("benchmark pilot case catalog", () => {
  it("defines the five required deterministic scientific structures", () => {
    expect(BENCHMARK_PILOT_CASES.map(({ caseId }) => caseId)).toEqual([
      "pilot_independent_2group",
      "pilot_independent_3group",
      "pilot_paired_2condition",
      "pilot_nested_microscopy",
      "pilot_longitudinal_endpoint",
    ]);
    for (const pilot of BENCHMARK_PILOT_CASES) {
      const first = pilot.fixture();
      const second = pilot.fixture();
      expect(first).toEqual(second);
      expect(first.draft.dataOrigin).toBe("synthetic_demo");
      expect(pilot.requiredArtifacts).toContain("default_graph.png");
      expect(pilot.requiredArtifacts).toContain("statistics.json");
      expect(pilot.expected.biologicalNOnly).toBe(true);
    }
  });

  it("routes every pilot through its declared executable template using biological units", () => {
    for (const pilot of BENCHMARK_PILOT_CASES) {
      const fixture = pilot.fixture();
      const conditionIds =
        pilot.caseId === "pilot_nested_microscopy"
          ? [fixture.draft.conditions[0].id, fixture.draft.conditions[2].id]
          : fixture.draft.conditions.map(({ id }) => id);
      const assessment = assessDraftGraphAnalysis({
        draft: fixture.draft,
        cells: fixture.cells,
        readoutId: fixture.draft.readouts[0].id,
        conditionIds,
        ...(pilot.caseId === "pilot_nested_microscopy"
          ? { timePointId: fixture.draft.time.points[2].id }
          : {}),
        ...(pilot.caseId === "pilot_longitudinal_endpoint"
          ? { timeAnalysis: { kind: "endpoint" as const } }
          : {}),
      });

      expect(assessment.state, pilot.caseId).toBe("ready");
      expect(assessment.request?.templateId, pilot.caseId).toBe(pilot.expected.template);
      expect(assessment.recommendedMethod, pilot.caseId).toBe(pilot.expected.recommendedMethod);
      expect(assessment.nByCondition.every(({ n }) => n === fixture.draft.experiments.length)).toBe(
        true,
      );
    }
  });

  it("loads deterministic values only after the researcher-built design matches the pilot", () => {
    for (const pilot of BENCHMARK_PILOT_CASES) {
      const fixture = pilot.fixture();
      const mapped = mapBenchmarkPilotMeasurements(pilot, {
        ...fixture.draft,
        dataOrigin: "research",
        name: `Researcher design for ${pilot.caseId}`,
      });
      expect(mapped.compatible, pilot.caseId).toBe(true);
      expect(mapped.cells, pilot.caseId).toEqual(fixture.cells);
    }

    const pilot = BENCHMARK_PILOT_CASES[0];
    const fixture = pilot.fixture();
    const mismatch = mapBenchmarkPilotMeasurements(pilot, {
      ...fixture.draft,
      conditions: fixture.draft.conditions.slice(0, 1),
    });
    expect(mismatch.compatible).toBe(false);
    expect(mismatch.reason).toContain("条件数を2");
    expect(mismatch.cells).toEqual({});
  });
});

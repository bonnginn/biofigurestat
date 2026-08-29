import { describe, expect, it } from "vitest";

import { CanonicalAdaptiveObservationSchema } from "@lsaa/domain";
import { buildStructureContract } from "@lsaa/adaptive-input";

import { createAdaptiveWorkspace } from "./adaptiveWorkspace";
import { assessDraftGraphAnalysis } from "./experimentDraftAnalysis";

const now = "2026-08-28T00:00:00.000Z";

describe("adaptive worksheet to analysis continuity", () => {
  it("keeps a scalar value stored at its declared component address", () => {
    const contract = buildStructureContract({
      experimentName: "Scalar component address",
      experimentDescription: "Independent dishes with a scalar measurement.",
      experimentalUnitLabel: "Culture dish",
      identityLabel: "Dish ID",
      readoutLabel: "Signal",
      readoutRepresentation: "scalar",
      factorName: "Treatment",
      factorLevels: ["Control", "Drug"],
      sameIdentityAcrossConditions: false,
    });
    const observations = [
      ["control-1", "Control", 1],
      ["control-2", "Control", 2],
      ["drug-1", "Drug", 3],
      ["drug-2", "Drug", 4],
    ].map(([identity, treatment, value], index) =>
      CanonicalAdaptiveObservationSchema.parse({
        observationId: `component-address.${index + 1}`,
        readoutKey: "signal",
        identities: { dishid: identity },
        factors: { treatment },
        axes: {},
        hierarchy: {},
        // Canonical scalar rows may use the readout component address. Both
        // worksheet projections already resolve this address.
        values: { value },
        missingness: {},
        sourceRow: index + 2,
      }),
    );

    const workspace = createAdaptiveWorkspace({
      contract,
      observations,
      mapping: null,
      lineage: null,
      now,
    });
    expect(workspace.status).toBe("ready");
    expect(workspace.draft).not.toBeNull();
    expect(
      Object.values(workspace.cells).flatMap((cell) =>
        cell?.kind === "nested_continuous" ? cell.rawValues : [],
      ),
    ).toEqual([1, 3, 2, 4]);

    const assessment = assessDraftGraphAnalysis({
      draft: workspace.draft!,
      cells: workspace.cells,
      readoutId: "outcome.signal",
      conditionIds: workspace.draft!.conditions.map(({ id }) => id),
    });
    expect(assessment.state).toBe("ready");
    expect(assessment.request?.observations.map(({ value }) => value)).toEqual([1, 2, 3, 4]);
  });

  it("safe-stops before workspace projection when a scalar row carries two value aliases", () => {
    const contract = buildStructureContract({
      experimentName: "Ambiguous scalar address",
      experimentDescription: "One scalar observation must have one canonical address.",
      experimentalUnitLabel: "Culture dish",
      identityLabel: "Dish ID",
      readoutLabel: "Signal",
      readoutRepresentation: "scalar",
      factorName: "Treatment",
      factorLevels: ["Control", "Drug"],
      sameIdentityAcrossConditions: false,
    });
    const ambiguous = CanonicalAdaptiveObservationSchema.parse({
      observationId: "ambiguous.scalar.1",
      readoutKey: "signal",
      identities: { dishid: "control-1" },
      factors: { treatment: "Control" },
      axes: {},
      hierarchy: {},
      values: { signal: 1, value: 1 },
      missingness: {},
      sourceRow: 2,
    });

    const workspace = createAdaptiveWorkspace({
      contract,
      observations: [ambiguous],
      mapping: null,
      lineage: null,
      now,
    });

    expect(workspace.status).toBe("not_representable");
    expect(workspace.draft).toBeNull();
    expect(workspace.cells).toEqual({});
    expect(workspace.snapshot.canonicalObservations).toEqual([ambiguous]);
    expect(workspace.diagnostics).toContain(
      "adaptive_observation:ambiguous.scalar.1:ambiguous_readout_component_alias:signal:value:signal,value",
    );
  });
});

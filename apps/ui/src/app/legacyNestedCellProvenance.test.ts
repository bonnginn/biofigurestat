import { describe, expect, it } from "vitest";
import { ProjectStateSchema } from "@lsaa/project";
import type { NestedContinuousCellDraft } from "./experimentDraft";
import { createExperimentWorkspaceProject, rehydrateExperimentWorkspace } from "./experimentWorkspaceProject";
import { createSimpleIndependentContinuousFixture } from "./syntheticFixtures";
import {
  LEGACY_NESTED_CELL_PROVENANCE_KEY,
  decodeLegacyNestedCellProvenance,
  encodeLegacyNestedCellProvenance,
  restoreLegacyNestedCellProvenance,
} from "./legacyNestedCellProvenance";

const cellKey = "experiment.1::condition.1::time.none::readout.1";
const measured = (): NestedContinuousCellDraft => ({ kind: "nested_continuous", source: "manual", rawValues: [2, 5, 11] });

function encoded(cell: unknown = measured()): string {
  const value = encodeLegacyNestedCellProvenance({ cellKey, cell });
  if (value === null) throw new Error("Invalid provenance fixture");
  return value;
}

function decoded(cell: unknown = measured()) {
  const value = decodeLegacyNestedCellProvenance(encoded(cell));
  if (value === null) throw new Error("Invalid decoded provenance fixture");
  return value;
}

describe("legacy measured nested cell provenance", () => {
  it("round-trips manual and paste source without replacing canonical measurements", () => {
    for (const source of ["manual", "paste"] as const) {
      const original = { ...measured(), source };
      const canonical = { ...measured(), source: "paste" as const, rawValues: [20, 50, 110] };
      const restored = restoreLegacyNestedCellProvenance({ cellKey, cell: canonical, provenance: decoded(original) });
      expect(restored?.source).toBe(source);
      expect(restored?.rawValues).toBe(canonical.rawValues);
      expect(restored?.rawValues).toEqual([20, 50, 110]);
    }
    expect(LEGACY_NESTED_CELL_PROVENANCE_KEY).toBe("workspaceNestedCellProvenanceV1");
  });

  it("preserves absent optional fields and removes unrelated restored defaults", () => {
    const canonical = { ...measured(), sourceLocations: ["default"], observationUnitIds: ["default"], availability: "planned" as const };
    const restored = restoreLegacyNestedCellProvenance({ cellKey, cell: canonical, provenance: decoded() });
    expect(restored).not.toBeNull();
    for (const key of ["sourceLocations", "observationUnitIds", "availability"]) expect(Object.hasOwn(restored!, key)).toBe(false);
  });

  it("preserves own undefined fields separately from absent fields", () => {
    const original = { ...measured(), sourceLocations: undefined, observationUnitIds: undefined, availability: undefined };
    const restored = restoreLegacyNestedCellProvenance({ cellKey, cell: measured(), provenance: decoded(original) });
    expect(restored).not.toBeNull();
    for (const key of ["sourceLocations", "observationUnitIds", "availability"] as const) {
      expect(Object.hasOwn(restored!, key)).toBe(true);
      expect(restored![key]).toBeUndefined();
    }
  });

  it("retains partial arrays, empty strings and explicit lower-unit order", () => {
    const original = { ...measured(), sourceLocations: ["", "row:3"], observationUnitIds: ["roi.3", "", "roi.1"] };
    const restored = restoreLegacyNestedCellProvenance({ cellKey, cell: measured(), provenance: decoded(original) });
    expect(restored?.sourceLocations).toEqual(["", "row:3"]);
    expect(restored?.observationUnitIds).toEqual(["roi.3", "", "roi.1"]);
  });

  it("keeps planned and empty optional arrays but rejects not-planned measured cells", () => {
    const original = { ...measured(), availability: "planned" as const, sourceLocations: [], observationUnitIds: [] };
    const provenance = decoded(original);
    const restored = restoreLegacyNestedCellProvenance({ cellKey, cell: measured(), provenance });
    expect(restored?.availability).toBe("planned");
    expect(restored?.sourceLocations).toEqual([]);
    expect(restored?.observationUnitIds).toEqual([]);
    const notPlanned = { ...measured(), availability: "not_planned" as const };
    expect(encodeLegacyNestedCellProvenance({ cellKey, cell: notPlanned })).toBeNull();
    expect(restoreLegacyNestedCellProvenance({ cellKey, cell: notPlanned, provenance })).toBeNull();
    expect(decodeLegacyNestedCellProvenance(JSON.stringify({ ...provenance, availability: { state: "value", value: "not_planned" } }))).toBeNull();
  });

  it("stores count but never rawValues or scalar measurements in the JSON snapshot", () => {
    const payload: unknown = JSON.parse(encoded());
    expect(payload).toEqual({ version: "0.1.0", cellKey, rawValueCount: 3, source: "manual", sourceLocations: { state: "absent" }, observationUnitIds: { state: "absent" }, availability: { state: "absent" } });
  });

  it("declines empty, sparse and nonfinite raw cells", () => {
    for (const rawValues of [[], [NaN], [Infinity], [-Infinity], new Array<number>(1)]) {
      expect(encodeLegacyNestedCellProvenance({ cellKey, cell: { ...measured(), rawValues } })).toBeNull();
    }
  });

  it("declines unsupported source and optional payloads without coercion", () => {
    for (const change of [
      { source: "automatic" }, { availability: "unknown" }, { sourceLocations: [1] },
      { observationUnitIds: [undefined] }, { sourceLocations: new Array<string>(1) }, { extra: true },
    ]) expect(encodeLegacyNestedCellProvenance({ cellKey, cell: { ...measured(), ...change } })).toBeNull();
    expect(encodeLegacyNestedCellProvenance({ cellKey: "", cell: measured() })).toBeNull();
  });

  it("safely ignores nonstring metadata and malformed JSON", () => {
    for (const value of [null, undefined, 1, {}, [], "{", "null", "[]", "17"]) expect(decodeLegacyNestedCellProvenance(value)).toBeNull();
  });

  it("rejects unknown fields and invalid versions, counts, source and optional state tags", () => {
    const base = decoded();
    for (const change of [
      { extra: true }, { version: "0.2.0" }, { cellKey: "" }, { rawValueCount: 0 },
      { rawValueCount: 1.5 }, { rawValueCount: "3" }, { source: "automatic" },
      { sourceLocations: { state: "value" } }, { observationUnitIds: { state: "value", value: [null] } },
      { availability: { state: "value", value: "unknown" } },
      { sourceLocations: { state: "absent", value: [] } }, { sourceLocations: { state: "undefined", extra: true } },
    ]) {
      expect(decodeLegacyNestedCellProvenance(JSON.stringify({ ...base, ...change }))).toBeNull();
      expect(restoreLegacyNestedCellProvenance({ cellKey, cell: measured(), provenance: { ...base, ...change } })).toBeNull();
    }
    const { availability: _availability, ...incomplete } = base;
    expect(decodeLegacyNestedCellProvenance(JSON.stringify(incomplete))).toBeNull();
  });

  it("requires the same key and positive finite canonical raw count during restoration", () => {
    const provenance = decoded();
    expect(restoreLegacyNestedCellProvenance({ cellKey: "other.cell", cell: measured(), provenance })).toBeNull();
    for (const rawValues of [[1], [], [2, NaN, 11]]) {
      expect(restoreLegacyNestedCellProvenance({ cellKey, cell: { ...measured(), rawValues }, provenance })).toBeNull();
    }
    expect(restoreLegacyNestedCellProvenance({ cellKey, cell: measured(), provenance: null })).toBeNull();
  });

  it("does not mutate input cells or decoded provenance, including frozen arrays", () => {
    const original = { ...measured(), sourceLocations: Object.freeze(["row:1", "", "row:3"]), observationUnitIds: Object.freeze(["roi.1", "roi.2", "roi.3"]) };
    Object.freeze(original.rawValues);
    Object.freeze(original);
    const provenance = decoded(original);
    if (provenance.sourceLocations.state === "value") Object.freeze(provenance.sourceLocations.value);
    if (provenance.observationUnitIds.state === "value") Object.freeze(provenance.observationUnitIds.value);
    Object.freeze(provenance);
    const before = structuredClone({ original, provenance });
    const restored = restoreLegacyNestedCellProvenance({ cellKey, cell: original, provenance });
    expect(restored?.rawValues).toBe(original.rawValues);
    expect(restored?.sourceLocations).not.toBe(original.sourceLocations);
    expect({ original, provenance }).toEqual(before);
  });

  it("stops corrupted reserved metadata after schema round-trip while preserving old files and the original", () => {
    const fixture = createSimpleIndependentContinuousFixture();
    const fixtureBefore = structuredClone(fixture);
    const firstKey = Object.keys(fixture.cells)[0];
    const cells = {
      ...fixture.cells,
      [firstKey]: {
        kind: "nested_continuous" as const,
        source: "manual" as const,
        rawValues: [2, 5],
        sourceLocations: ["", "image-2"],
        observationUnitIds: ["roi.2", "roi.1"],
        availability: undefined,
      },
    };
    const saved = ProjectStateSchema.parse(JSON.parse(JSON.stringify(createExperimentWorkspaceProject({
      draft: fixture.draft, cells, graphs: [], now: "2026-10-08T07:00:00Z",
    }))));
    const before = structuredClone(saved);
    const reopened = rehydrateExperimentWorkspace(saved);
    expect(reopened).not.toBeNull();
    expect(reopened?.cells).toEqual(cells);
    const target = saved.unitInstances.find((unit) =>
      Object.hasOwn(unit.metadata, LEGACY_NESTED_CELL_PROVENANCE_KEY) &&
      decodeLegacyNestedCellProvenance(unit.metadata[LEGACY_NESTED_CELL_PROVENANCE_KEY])?.cellKey === firstKey,
    );
    if (!target) throw new Error("Reserved metadata fixture is missing");
    const reserved = target.metadata[LEGACY_NESTED_CELL_PROVENANCE_KEY];
    const provenance = decodeLegacyNestedCellProvenance(reserved);
    if (!provenance || typeof reserved !== "string") throw new Error("Reserved metadata fixture is invalid");
    for (const corrupt of [
      "{",
      JSON.stringify({ ...provenance, rawValueCount: provenance.rawValueCount + 1 }),
      JSON.stringify({ ...provenance, cellKey: "different.cell.key" }),
    ]) {
      const copy = structuredClone(saved);
      const copyTarget = copy.unitInstances.find(({ id }) => id === target.id)!;
      copyTarget.metadata[LEGACY_NESTED_CELL_PROVENANCE_KEY] = corrupt;
      expect(rehydrateExperimentWorkspace(copy)).toBeNull();
    }
    const duplicate = structuredClone(saved);
    const siblingObservation = duplicate.observations.find((observation) =>
      observation.unitInstanceId !== target.id &&
      observation.sourceLocation?.split("#source=")[0] === `workspace:${firstKey}`,
    );
    if (!siblingObservation) throw new Error("Same-cell duplicate fixture is missing");
    const sibling = duplicate.unitInstances.find(({ id }) => id === siblingObservation.unitInstanceId)!;
    sibling.metadata[LEGACY_NESTED_CELL_PROVENANCE_KEY] = reserved;
    expect(rehydrateExperimentWorkspace(duplicate)).toBeNull();

    const extraMetadata = structuredClone(saved);
    extraMetadata.unitInstances.find(({ id }) => id === target.id)!.metadata.unrelatedField = "retained";
    expect(rehydrateExperimentWorkspace(extraMetadata)?.cells).toEqual(cells);
    const oldFile = structuredClone(saved);
    oldFile.unitInstances.forEach((unit) => { delete unit.metadata[LEGACY_NESTED_CELL_PROVENANCE_KEY]; });
    const oldReopened = rehydrateExperimentWorkspace(oldFile);
    expect(oldReopened).not.toBeNull();
    const oldCell = oldReopened?.cells[firstKey];
    if (oldCell?.kind !== "nested_continuous") throw new Error("Old-file scalar fallback is missing");
    expect(oldCell.source).toBe("paste");
    expect(oldCell.observationUnitIds).toBeUndefined();
    expect(saved).toEqual(before);
    expect(fixture).toEqual(fixtureBefore);
  });
});

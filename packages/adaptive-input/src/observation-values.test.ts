import { describe, expect, it } from "vitest";

import type { CanonicalAdaptiveObservation, StructureContract } from "@lsaa/domain";

import { resolveCanonicalReadoutValue } from "./observation-values";

const readout = (representation: "scalar" | "proportion_counts") =>
  ({
    key: "signal",
    label: "Signal",
    valueType: "scalar",
    representation,
    componentKeys: representation === "scalar" ? ["value"] : ["numerator", "denominator"],
    referenceRole: "none",
    observationLevelKey: "unit",
    axisKeys: [],
  }) satisfies StructureContract["readouts"][number];

const observation = (values: CanonicalAdaptiveObservation["values"]) => ({ values });

describe("canonical readout value aliases", () => {
  it("resolves scalar readout, component, and namespaced component addresses", () => {
    expect(
      resolveCanonicalReadoutValue(readout("scalar"), observation({ signal: 1 })),
    ).toMatchObject({ status: "resolved", key: "signal", value: 1 });
    expect(
      resolveCanonicalReadoutValue(readout("scalar"), observation({ value: 2 })),
    ).toMatchObject({ status: "resolved", key: "value", value: 2 });
    expect(
      resolveCanonicalReadoutValue(readout("scalar"), observation({ signal_value: 3 })),
    ).toMatchObject({ status: "resolved", key: "signal_value", value: 3 });
  });

  it("resolves namespaced and legacy unprefixed typed components", () => {
    expect(
      resolveCanonicalReadoutValue(
        readout("proportion_counts"),
        observation({ signal_numerator: 3 }),
        "numerator",
      ),
    ).toMatchObject({ status: "resolved", key: "signal_numerator", value: 3 });
    expect(
      resolveCanonicalReadoutValue(
        readout("proportion_counts"),
        observation({ numerator: 4 }),
        "numerator",
      ),
    ).toMatchObject({ status: "resolved", key: "numerator", value: 4 });
  });

  it("does not choose between two aliases in the same record", () => {
    expect(
      resolveCanonicalReadoutValue(readout("scalar"), observation({ signal: 1, value: 2 })),
    ).toEqual({
      status: "ambiguous",
      key: null,
      keys: ["signal", "value"],
      value: undefined,
    });

    expect(
      resolveCanonicalReadoutValue(
        readout("proportion_counts"),
        observation({ signal_numerator: 3, numerator: 3 }),
        "numerator",
      ),
    ).toEqual({
      status: "ambiguous",
      key: null,
      keys: ["signal_numerator", "numerator"],
      value: undefined,
    });
  });
});

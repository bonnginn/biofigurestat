import type { CanonicalAdaptiveObservation, StructureContract } from "@lsaa/domain";

type ContractReadout = StructureContract["readouts"][number];
type CanonicalValue = CanonicalAdaptiveObservation["values"][string];

export type CanonicalValueResolution =
  | Readonly<{ status: "resolved"; key: string; keys: readonly string[]; value: CanonicalValue }>
  | Readonly<{ status: "missing" | "ambiguous"; key: null; keys: readonly string[]; value: undefined }>;

/**
 * Canonical 0.1 rows exist with both namespaced component keys and their older
 * unprefixed aliases. Scalar rows additionally use the readout key itself.
 * Keep that compatibility rule in one place so tables, workspace projection,
 * and analysis do not silently read different values.
 */
export function canonicalReadoutValueCandidates(
  readout: ContractReadout,
  component = readout.componentKeys[0] ?? "value",
): readonly string[] {
  return [
    ...new Set(
      readout.representation === "scalar"
        ? [readout.key, component, `${readout.key}_${component}`]
        : [`${readout.key}_${component}`, component],
    ),
  ];
}

export function resolveCanonicalReadoutValue(
  readout: ContractReadout,
  observation: Pick<CanonicalAdaptiveObservation, "values">,
  component = readout.componentKeys[0] ?? "value",
): CanonicalValueResolution {
  const keys = canonicalReadoutValueCandidates(readout, component).filter((key) =>
    Object.prototype.hasOwnProperty.call(observation.values, key),
  );
  if (keys.length !== 1) {
    return {
      status: keys.length === 0 ? "missing" : "ambiguous",
      key: null,
      keys,
      value: undefined,
    };
  }
  const key = keys[0]!;
  return { status: "resolved", key, keys, value: observation.values[key] };
}

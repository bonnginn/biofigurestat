import { describe, expect, it } from "vitest";
import { CanonicalAdaptiveObservationSchema } from "@lsaa/domain";
import {
  canonicalMatrixDisplayTextKey as key,
  canonicalMatrixLexicalText,
  pruneNumericDisplayTexts,
} from "./canonicalNumericPresentation";

describe("numeric display preservation boundary", () => {
  const row = CanonicalAdaptiveObservationSchema.parse({
    observationId: "o.1",
    readoutKey: "value",
    identities: {},
    factors: {},
    axes: {},
    hierarchy: {},
    values: { value: 1.23 },
    missingness: {},
    sourceRow: null,
  });
  it("prunes changed, missing and orphaned values so old spellings cannot resurface", () => {
    const texts = { [key("o.1", "value")]: "1.2300", [key("deleted", "value")]: "5.00" };
    expect(pruneNumericDisplayTexts([row], texts)).toEqual({ [key("o.1", "value")]: "1.2300" });
    const changed = { ...row, values: { value: 5 } };
    const saved = pruneNumericDisplayTexts([changed], texts);
    expect(saved).toEqual({});
    expect(pruneNumericDisplayTexts([row], saved)).toEqual({});
  });
  it("retains decimal spellings without claiming extra converted digits", () => {
    expect(canonicalMatrixLexicalText(0.5, ".500")).toBe(".500");
    expect(canonicalMatrixLexicalText(1, "+1.0")).toBe("+1.0");
    expect(canonicalMatrixLexicalText(1, "1.0000000000000001")).toBeNull();
    expect(canonicalMatrixLexicalText(1e-7, "0.00000010")).toBeNull();
  });
});

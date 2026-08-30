import { describe, expect, it } from "vitest";

import { buildFactorialDesign, buildTwoByTwoFactorialDesign } from "./factorialDesign";

const baseDraft = {
  purpose: "microscopy" as const,
  experimentalUnitId: "unit.dish",
  experimentalUnitKey: "dish",
  experimentalUnitLabel: "ディッシュ／サンプル",
  plannedN: 3,
  outcome: {
    id: "outcome.microscopy-intensity",
    key: "microscopy_intensity",
    label: "顧微鏡強度",
    type: "continuous" as const,
  },
  factorAName: "siRNA",
  factorALevels: ["対照", "標的"] as [string, string],
  factorBName: "光刺激",
  factorBLevels: ["なし", "あり"] as [string, string],
};

describe("2×2要因配置デザイン", () => {
  it("因子の全組み合わせを独立した4条件として作る", () => {
    const design = buildTwoByTwoFactorialDesign(baseDraft);

    expect(design).not.toBeNull();
    expect(design?.pairing).toEqual({ kind: "independent" });
    expect(design?.factors.map((factor) => factor.label)).toEqual(["siRNA", "光刺激"]);
    expect(design?.conditions.map((condition) => condition.label)).toEqual([
      "対照 / なし",
      "対照 / あり",
      "標的 / なし",
      "標的 / あり",
    ]);
  });

  it("同じ因子内のレベル名重複は受け付けない", () => {
    expect(
      buildTwoByTwoFactorialDesign({ ...baseDraft, factorALevels: ["対照", "対照"] }),
    ).toBeNull();
  });
});

describe("多水準の2因子要因配置デザイン", () => {
  it("ControlとsiRNA 3配列 × 薬剤 −/+ の8条件と上位グループを保持する", () => {
    const design = buildFactorialDesign({
      ...baseDraft,
      factorALevels: ["Control", "siRNA #1", "siRNA #2", "siRNA #3"],
      factorALevelGroups: ["Control group", "Target group", "Target group", "Target group"],
      factorBName: "薬剤",
      factorBLevels: ["−", "+"],
    });

    expect(design?.conditions).toHaveLength(8);
    expect(design?.factors[0]?.levelGroups?.map((group) => group.label)).toEqual([
      "Control group",
      "Target group",
    ]);
    expect(design?.factors[0]?.levels.map((level) => level.groupId)).toEqual([
      "group.a.1",
      "group.a.2",
      "group.a.2",
      "group.a.2",
    ]);
    expect(design?.plannedN).toBe(3);
  });

  it("2〜6水準の範囲外は受け付けない", () => {
    expect(buildFactorialDesign({ ...baseDraft, factorALevels: ["Control"] })).toBeNull();
    expect(
      buildFactorialDesign({
        ...baseDraft,
        factorALevels: ["1", "2", "3", "4", "5", "6", "7"],
      }),
    ).toBeNull();
  });
});

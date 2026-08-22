import { describe, expect, it } from "vitest";

import {
  buildExistingDataWorkspace,
  buildWideExistingDataWorkspace,
  DuplicateImportConflictError,
  parseExistingDataText,
} from "./existingDataImport";

describe("existing data import mapping", () => {
  it("明示的な列割当てから実験・条件・時間とsource rowを保持する", () => {
    const parsed = parseExistingDataText(
      "Experiment\tCondition\tTime\tMean\nE1\tControl\t0\t10\nE1\tTreatment\t0\t14\nE2\tControl\t0\t11\nE2\tTreatment\t0\t16",
    );
    const result = buildExistingDataWorkspace(parsed, {
      experimentColumn: 0,
      conditionColumn: 1,
      timeColumn: 2,
      valueColumn: 3,
      timeSampling: "cross_sectional",
      readoutLabel: "Intensity",
      readoutUnit: "a.u.",
    });
    expect(result.draft.experiments.map(({ label }) => label)).toEqual(["E1", "E2"]);
    expect(result.draft.conditions.map(({ label }) => label)).toEqual(["Control", "Treatment"]);
    expect(result.draft.time.points).toEqual([{ id: "time.import.1", value: 0 }]);
    expect(Object.values(result.cells)[0]).toMatchObject({
      rawValues: [10],
      sourceLocations: ["clipboard:Mean:row:1"],
    });
  });

  it("条件列のあいまいな1群データを勝手に群比較へ変換しない", () => {
    const parsed = parseExistingDataText("Condition\tMean\nControl\t10\nControl\t12");
    expect(() =>
      buildExistingDataWorkspace(parsed, {
        experimentColumn: "row_number",
        conditionColumn: 0,
        timeColumn: null,
        valueColumn: 1,
        timeSampling: "none",
        readoutLabel: "Intensity",
        readoutUnit: "",
      }),
    ).toThrow(/2条件以上/);
  });

  it("列が条件、行がExpのExcel/Prism風矩形表を取り込む", () => {
    const parsed = parseExistingDataText(
      "Experiment\tControl\tsiRNA #1\tsiRNA #2\nE1\t10\t15\t14\nE2\t11\t17\t16",
    );
    const result = buildWideExistingDataWorkspace(parsed, {
      experimentColumn: 0,
      valueColumns: [1, 2, 3],
      readoutLabel: "Intensity",
      readoutUnit: "a.u.",
    });
    expect(result.draft.conditions.map(({ label }) => label)).toEqual([
      "Control",
      "siRNA #1",
      "siRNA #2",
    ]);
    expect(result.draft.experiments.map(({ label }) => label)).toEqual(["E1", "E2"]);
    expect(
      Object.values(result.cells).map((cell) =>
        cell.kind === "nested_continuous" ? cell.rawValues[0] : null,
      ),
    ).toEqual([10, 15, 14, 11, 17, 16]);
    expect(result.draft.importProvenance?.transformations).toContain(
      "各条件列の数値を縦持ちの観測へ変換（元の横持ち表は保持）",
    );
  });

  it("横持ち表でも実験回・生物学的単位・元の日付を別々に保持する", () => {
    const parsed = parseExistingDataText(
      "Session\tUnit\tDate\tControl\tDrug\nExp 1\tMouse 1\t2026-08-01\t10\t15\nExp 1\tMouse 2\t\t11\t17\nExp 2\tMouse 1\t2026-08-08\t12\t18",
    );
    const result = buildWideExistingDataWorkspace(parsed, {
      experimentColumn: 0,
      sessionColumn: 0,
      unitColumn: 1,
      dateColumn: 2,
      valueColumns: [0, 1, 2, 3, 4],
      readoutLabel: "Intensity",
      readoutUnit: "a.u.",
    });

    expect(result.draft.conditions.map(({ label }) => label)).toEqual(["Control", "Drug"]);
    expect(result.draft.experiments.map(({ sessionId }) => sessionId)).toEqual([
      "session.import.1",
      "session.import.1",
      "session.import.2",
    ]);
    expect(result.draft.experiments.map(({ stableUnitId }) => stableUnitId)).toEqual([
      "unit.import.1",
      "unit.import.2",
      "unit.import.1",
    ]);
    expect(result.draft.experiments.map(({ date }) => date)).toEqual([
      "2026-08-01",
      "",
      "2026-08-08",
    ]);
    expect(result.draft.importProvenance?.mapping).toMatchObject({
      sessionColumn: 0,
      unitColumn: 1,
      dateColumn: 2,
    });
  });

  it("実験回と安定した生物学的単位を別々に取り込み、元にない日付は空欄にする", () => {
    const parsed = parseExistingDataText(
      "Session\tUnit\tCondition\tMean\nExp 1\tMouse 1\tControl\t10\nExp 1\tMouse 1\tDrug\t14\nExp 2\tMouse 1\tControl\t11\nExp 2\tMouse 1\tDrug\t16",
    );
    const result = buildExistingDataWorkspace(parsed, {
      experimentColumn: 0,
      sessionColumn: 0,
      unitColumn: 1,
      conditionColumn: 2,
      timeColumn: null,
      valueColumn: 3,
      timeSampling: "none",
      readoutLabel: "Intensity",
      readoutUnit: "a.u.",
      importedAt: "2026-08-21T10:00:00.000Z",
      sourceLabel: "source.tsv",
    });

    expect(result.draft.experiments).toHaveLength(2);
    expect(result.draft.experiments.map(({ sessionId }) => sessionId)).toEqual([
      "session.import.1",
      "session.import.2",
    ]);
    expect(result.draft.experiments.map(({ stableUnitId }) => stableUnitId)).toEqual([
      "unit.import.1",
      "unit.import.1",
    ]);
    expect(result.draft.experiments.every(({ date }) => date === "")).toBe(true);
    expect(result.draft.importProvenance).toMatchObject({
      sourceLabel: "source.tsv",
      importedAt: "2026-08-21T10:00:00.000Z",
      mapping: { sessionColumn: 0, unitColumn: 1 },
    });
  });

  it("同じ単位キーの複数行を黙って平均しない", () => {
    const parsed = parseExistingDataText(
      "Session\tUnit\tCondition\tMean\nExp 1\tU1\tControl\t10\nExp 1\tU1\tControl\t12\nExp 1\tU2\tDrug\t20",
    );
    expect(() =>
      buildExistingDataWorkspace(parsed, {
        experimentColumn: 0,
        sessionColumn: 0,
        unitColumn: 1,
        conditionColumn: 2,
        timeColumn: null,
        valueColumn: 3,
        timeSampling: "none",
        readoutLabel: "Intensity",
        readoutUnit: "",
      }),
    ).toThrow(DuplicateImportConflictError);
  });

  it("研究者が生測定の入れ子と確認した場合だけsource rowを保ってまとめる", () => {
    const parsed = parseExistingDataText(
      "Session\tUnit\tCondition\tMean\nExp 1\tU1\tControl\t10\nExp 1\tU1\tControl\t12\nExp 1\tU2\tDrug\t20",
    );
    const result = buildExistingDataWorkspace(parsed, {
      experimentColumn: 0,
      sessionColumn: 0,
      unitColumn: 1,
      conditionColumn: 2,
      timeColumn: null,
      valueColumn: 3,
      timeSampling: "none",
      readoutLabel: "Intensity",
      readoutUnit: "",
      duplicateHandling: "nested_observations",
    });
    const nested = Object.values(result.cells).find(
      (cell) => cell.kind === "nested_continuous" && cell.rawValues.length === 2,
    );
    expect(nested).toMatchObject({
      rawValues: [10, 12],
      sourceLocations: ["clipboard:Mean:row:1", "clipboard:Mean:row:2"],
    });
    expect(result.draft.importProvenance?.duplicateDecision).toBe("nested_observations");
    expect(result.draft.importProvenance?.transformations).toContain(
      "確認された複数行を同じ生物学的単位内の生測定として保持（自動平均なし）",
    );
  });
});

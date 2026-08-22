import { parseTabularClipboard, type ParsedTabularClipboard } from "@lsaa/data-sheet";

import {
  createExperimentSession,
  experimentCellKey,
  type ExperimentCellMap,
  type ExperimentSetDraft,
  type TimeSampling,
} from "./experimentDraft";

export type ExistingDataColumnMapping = Readonly<{
  experimentColumn: number | "row_number";
  sessionColumn?: number | "row_number";
  unitColumn?: number | "row_number";
  dateColumn?: number | null;
  conditionColumn: number;
  timeColumn: number | null;
  valueColumn: number;
  timeSampling: TimeSampling;
  readoutLabel: string;
  readoutUnit: string;
  duplicateHandling?: "reject" | "nested_observations";
  sourceLabel?: string;
  importedAt?: string;
}>;

export type ExistingDataDuplicateConflict = Readonly<{
  key: string;
  rowNumbers: readonly number[];
}>;

export class DuplicateImportConflictError extends Error {
  constructor(readonly conflicts: readonly ExistingDataDuplicateConflict[]) {
    super("同じ実験回・生物学的単位・条件・時間の組合せが複数行あります。");
    this.name = "DuplicateImportConflictError";
  }
}

export type ExistingDataImportResult = Readonly<{
  draft: ExperimentSetDraft;
  cells: ExperimentCellMap;
}>;

function finiteNumber(value: string): number | null {
  if (!value.trim()) return null;
  const number = Number(value);
  return Number.isFinite(number) ? number : null;
}

export function buildExistingDataWorkspace(
  parsed: ParsedTabularClipboard,
  mapping: ExistingDataColumnMapping,
): ExistingDataImportResult {
  if (!mapping.readoutLabel.trim()) throw new Error("測定項目の名前を入力してください。");
  if (mapping.conditionColumn === mapping.valueColumn) {
    throw new Error("条件列と測定値列は別の列を選んでください。");
  }
  const validRows = parsed.rows.flatMap((row, rowIndex) => {
    const condition = row[mapping.conditionColumn]?.trim() ?? "";
    const value = finiteNumber(row[mapping.valueColumn] ?? "");
    const sessionColumn = mapping.sessionColumn ?? mapping.experimentColumn;
    const unitColumn = mapping.unitColumn ?? mapping.experimentColumn;
    const sessionLabel =
      sessionColumn === "row_number" ? `Exp ${rowIndex + 1}` : (row[sessionColumn]?.trim() ?? "");
    const unitLabel =
      unitColumn === "row_number" ? `Unit ${rowIndex + 1}` : (row[unitColumn]?.trim() ?? "");
    const experimentDate =
      mapping.dateColumn === null || mapping.dateColumn === undefined
        ? ""
        : (row[mapping.dateColumn]?.trim() ?? "");
    const time = mapping.timeColumn === null ? null : finiteNumber(row[mapping.timeColumn] ?? "");
    if (!condition || !sessionLabel || !unitLabel || value === null) return [];
    if (mapping.timeColumn !== null && time === null) return [];
    return [{ rowIndex, condition, sessionLabel, unitLabel, experimentDate, value, time }];
  });
  if (validRows.length === 0) throw new Error("割り当てた列から有効な数値行を作れません。");
  const conditionLabels = [...new Set(validRows.map(({ condition }) => condition))];
  if (conditionLabels.length < 2) {
    throw new Error("現在のCore群比較には、条件列に2条件以上が必要です。");
  }
  const conflicts = [
    ...validRows.reduce((groups, row) => {
      const key = [row.sessionLabel, row.unitLabel, row.condition, row.time ?? "none"].join(" / ");
      groups.set(key, [...(groups.get(key) ?? []), row.rowIndex + 1]);
      return groups;
    }, new Map<string, number[]>()),
  ]
    .filter(([, rows]) => rows.length > 1)
    .map(([key, rowNumbers]) => ({ key, rowNumbers }));
  if (conflicts.length > 0 && mapping.duplicateHandling !== "nested_observations") {
    throw new DuplicateImportConflictError(conflicts);
  }
  const unitEntries = [
    ...new Map(
      validRows.map((row) => [
        `${row.sessionLabel}\u0000${row.unitLabel}`,
        {
          sessionLabel: row.sessionLabel,
          unitLabel: row.unitLabel,
          experimentDate: row.experimentDate,
        },
      ]),
    ).values(),
  ];
  const timeValues = [
    ...new Set(validRows.flatMap(({ time }) => (time === null ? [] : [time]))),
  ].sort((first, second) => first - second);
  const stableIds = new Map<string, string>();
  const experiments = unitEntries.map((entry, index) => ({
    ...createExperimentSession(index + 1),
    label: entry.unitLabel,
    sessionId: `session.import.${[...new Set(unitEntries.map(({ sessionLabel }) => sessionLabel))].indexOf(entry.sessionLabel) + 1}`,
    stableUnitId:
      stableIds.get(entry.unitLabel) ??
      (() => {
        const id = `unit.import.${stableIds.size + 1}`;
        stableIds.set(entry.unitLabel, id);
        return id;
      })(),
    date: /^\d{4}-\d{2}-\d{2}$/.test(entry.experimentDate) ? entry.experimentDate : "",
    note: `既存データから取込・session: ${entry.sessionLabel}`,
  }));
  const conditions = conditionLabels.map((label, index) => ({
    id: `condition.import.${index + 1}`,
    label,
    attributes: { "attribute.import.condition": label },
  }));
  const points = timeValues.map((value, index) => ({ id: `time.import.${index + 1}`, value }));
  const readoutId = "readout.import.1";
  const draft: ExperimentSetDraft = {
    version: "0.1.0",
    dataOrigin: "research",
    context: "existing_data",
    name: "既存データから作成",
    readouts: [
      {
        id: readoutId,
        label: mapping.readoutLabel.trim(),
        shape: "nested_continuous",
        ...(mapping.readoutUnit.trim() ? { unit: mapping.readoutUnit.trim() } : {}),
      },
    ],
    attributes: [
      {
        id: "attribute.import.condition",
        label: parsed.headers[mapping.conditionColumn] || "条件",
      },
    ],
    conditions,
    analysisIntent: { kind: "group_comparison" },
    conditionAssignment: {
      kind: [...new Set(validRows.map(({ unitLabel }) => unitLabel))].some(
        (unitLabel) =>
          new Set(
            validRows
              .filter((row) => row.unitLabel === unitLabel)
              .map(({ condition }) => condition),
          ).size > 1,
      )
        ? "matched"
        : "independent",
      unitLabel: "生物学的単位",
    },
    time: {
      sampling: points.length === 0 ? "none" : mapping.timeSampling,
      unit: "h",
      points,
    },
    experiments,
    importProvenance: {
      sourceLabel: mapping.sourceLabel?.trim() || "clipboard paste",
      importedAt: mapping.importedAt ?? new Date().toISOString(),
      headers: parsed.headers,
      sourceRows: parsed.rows,
      mapping: {
        sessionColumn:
          (mapping.sessionColumn ?? mapping.experimentColumn) === "row_number"
            ? "row_number"
            : (mapping.sessionColumn ?? mapping.experimentColumn),
        unitColumn:
          (mapping.unitColumn ?? mapping.experimentColumn) === "row_number"
            ? "row_number"
            : (mapping.unitColumn ?? mapping.experimentColumn),
        conditionColumn: mapping.conditionColumn,
        timeColumn: mapping.timeColumn,
        valueColumn: mapping.valueColumn,
        dateColumn: mapping.dateColumn ?? null,
      },
      excludedRowNumbers: parsed.rows
        .map((_, index) => index + 1)
        .filter((rowNumber) => !validRows.some(({ rowIndex }) => rowIndex + 1 === rowNumber)),
      duplicateDecision:
        conflicts.length > 0 && mapping.duplicateHandling === "nested_observations"
          ? "nested_observations"
          : "none",
      transformations: [
        "数値列を数値として解釈（元の文字列は取込元の表に保持）",
        ...(conflicts.length > 0 && mapping.duplicateHandling === "nested_observations"
          ? ["確認された複数行を同じ生物学的単位内の生測定として保持（自動平均なし）"]
          : []),
      ],
    },
  };
  const cells: Record<string, ExperimentCellMap[string]> = {};
  validRows.forEach((row) => {
    const experiment = experiments.find(
      ({ label, sessionId }) =>
        label === row.unitLabel &&
        sessionId ===
          `session.import.${[...new Set(unitEntries.map(({ sessionLabel }) => sessionLabel))].indexOf(row.sessionLabel) + 1}`,
    )!;
    const condition = conditions.find(({ label }) => label === row.condition)!;
    const timePoint =
      row.time === null ? undefined : points.find(({ value }) => value === row.time);
    const key = experimentCellKey({
      experimentId: experiment.id,
      conditionId: condition.id,
      readoutId,
      timePointId: timePoint?.id,
    });
    const current = cells[key];
    const rawValues = current?.kind === "nested_continuous" ? current.rawValues : [];
    const sourceLocations =
      current?.kind === "nested_continuous" ? (current.sourceLocations ?? []) : [];
    cells[key] = {
      kind: "nested_continuous",
      source: "paste",
      rawValues: [...rawValues, row.value],
      sourceLocations: [
        ...sourceLocations,
        `clipboard:${parsed.headers[mapping.valueColumn] || `列 ${mapping.valueColumn + 1}`}:row:${row.rowIndex + 1}`,
      ],
    };
  });
  return { draft, cells };
}

export function parseExistingDataText(text: string): ParsedTabularClipboard {
  return parseTabularClipboard(text);
}

export function buildWideExistingDataWorkspace(
  parsed: ParsedTabularClipboard,
  input: Readonly<{
    experimentColumn: number | "row_number";
    sessionColumn?: number | "row_number";
    unitColumn?: number | "row_number";
    dateColumn?: number | null;
    valueColumns: readonly number[];
    readoutLabel: string;
    readoutUnit: string;
    sourceLabel?: string;
    importedAt?: string;
  }>,
): ExistingDataImportResult {
  if (!input.readoutLabel.trim()) throw new Error("測定項目の名前を入力してください。");
  const mappedColumns = new Set(
    [input.experimentColumn, input.sessionColumn, input.unitColumn, input.dateColumn].filter(
      (column): column is number => typeof column === "number",
    ),
  );
  const valueColumns = [...new Set(input.valueColumns)].filter(
    (index) => index >= 0 && index < parsed.headers.length && !mappedColumns.has(index),
  );
  if (valueColumns.length < 2) throw new Error("比較する条件列を2列以上選んでください。");
  const conditions = valueColumns.map((columnIndex, index) => ({
    id: `condition.import.${index + 1}`,
    label: parsed.headers[columnIndex] || `条件 ${index + 1}`,
    attributes: {
      "attribute.import.condition": parsed.headers[columnIndex] || `条件 ${index + 1}`,
    },
  }));
  const validRows = parsed.rows.flatMap((row, rowIndex) => {
    const sessionColumn = input.sessionColumn ?? input.experimentColumn;
    const unitColumn = input.unitColumn ?? input.experimentColumn;
    const sessionLabel =
      sessionColumn === "row_number" ? `Exp ${rowIndex + 1}` : (row[sessionColumn]?.trim() ?? "");
    const unitLabel =
      unitColumn === "row_number" ? `Unit ${rowIndex + 1}` : (row[unitColumn]?.trim() ?? "");
    const experimentDate =
      input.dateColumn === null || input.dateColumn === undefined
        ? ""
        : (row[input.dateColumn]?.trim() ?? "");
    if (!sessionLabel || !unitLabel) return [];
    const values = valueColumns.map((columnIndex) => finiteNumber(row[columnIndex] ?? ""));
    if (values.every((value) => value === null)) return [];
    return [{ rowIndex, sessionLabel, unitLabel, experimentDate, values }];
  });
  if (validRows.length === 0) throw new Error("選択した条件列に有効な数値がありません。");
  if (
    new Set(validRows.map(({ sessionLabel, unitLabel }) => `${sessionLabel}\u0000${unitLabel}`))
      .size !== validRows.length
  ) {
    throw new Error("同じ実験回の中では、生物学的単位IDを各行で重複しない値にしてください。");
  }
  const sessionLabels = [...new Set(validRows.map(({ sessionLabel }) => sessionLabel))];
  const stableIds = new Map<string, string>();
  const experiments = validRows.map((row, index) => ({
    ...createExperimentSession(index + 1),
    label: row.unitLabel,
    sessionId: `session.import.${sessionLabels.indexOf(row.sessionLabel) + 1}`,
    stableUnitId:
      stableIds.get(row.unitLabel) ??
      (() => {
        const id = `unit.import.${stableIds.size + 1}`;
        stableIds.set(row.unitLabel, id);
        return id;
      })(),
    date: /^\d{4}-\d{2}-\d{2}$/.test(row.experimentDate) ? row.experimentDate : "",
    note: `既存データから取込・session: ${row.sessionLabel}`,
  }));
  const readoutId = "readout.import.1";
  const draft: ExperimentSetDraft = {
    version: "0.1.0",
    dataOrigin: "research",
    context: "existing_data",
    name: "既存データから作成",
    readouts: [
      {
        id: readoutId,
        label: input.readoutLabel.trim(),
        shape: "nested_continuous",
        ...(input.readoutUnit.trim() ? { unit: input.readoutUnit.trim() } : {}),
      },
    ],
    attributes: [{ id: "attribute.import.condition", label: "条件" }],
    conditions,
    analysisIntent: { kind: "group_comparison" },
    conditionAssignment: { kind: "independent", unitLabel: "実験単位" },
    time: { sampling: "none", unit: "h", points: [] },
    experiments,
    importProvenance: {
      sourceLabel: input.sourceLabel?.trim() || "clipboard paste",
      importedAt: input.importedAt ?? new Date().toISOString(),
      headers: parsed.headers,
      sourceRows: parsed.rows,
      mapping: {
        layout: "wide",
        experimentColumn:
          input.experimentColumn === "row_number" ? "row_number" : input.experimentColumn,
        sessionColumn:
          (input.sessionColumn ?? input.experimentColumn) === "row_number"
            ? "row_number"
            : (input.sessionColumn ?? input.experimentColumn),
        unitColumn:
          (input.unitColumn ?? input.experimentColumn) === "row_number"
            ? "row_number"
            : (input.unitColumn ?? input.experimentColumn),
        dateColumn: input.dateColumn ?? null,
        valueColumns: valueColumns.join(","),
      },
      excludedRowNumbers: parsed.rows
        .map((_, index) => index + 1)
        .filter((rowNumber) => !validRows.some(({ rowIndex }) => rowIndex + 1 === rowNumber)),
      duplicateDecision: "none",
      transformations: ["各条件列の数値を縦持ちの観測へ変換（元の横持ち表は保持）"],
    },
  };
  const cells: Record<string, ExperimentCellMap[string]> = {};
  validRows.forEach((row, experimentIndex) => {
    row.values.forEach((value, conditionIndex) => {
      if (value === null) return;
      const columnIndex = valueColumns[conditionIndex];
      const key = experimentCellKey({
        experimentId: experiments[experimentIndex].id,
        conditionId: conditions[conditionIndex].id,
        readoutId,
      });
      cells[key] = {
        kind: "nested_continuous",
        source: "paste",
        rawValues: [value],
        sourceLocations: [
          `clipboard:${parsed.headers[columnIndex] || `列 ${columnIndex + 1}`}:row:${row.rowIndex + 1}`,
        ],
      };
    });
  });
  return { draft, cells };
}

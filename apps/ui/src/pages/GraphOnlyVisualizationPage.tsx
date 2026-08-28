import { useMemo, useState, type KeyboardEvent } from "react";

import { parseAdaptiveDelimited, type ParsedAdaptiveInput } from "@lsaa/adaptive-input";
import {
  appendUnresolvedVisualizationDataRevision,
  appendUnresolvedVisualizationGraph,
  createUnresolvedVisualizationProjectState,
  resolveUnresolvedVisualizationIdentityDecision,
  type UnresolvedVisualizationProjectState,
  type UnresolvedVisualizationColumnMapping,
  type UnresolvedVisualizationIdentityDecision,
} from "@lsaa/project";
import type { GraphSpec } from "@lsaa/graph-spec";

import type {
  OpenUnresolvedVisualizationProjectAction,
  SaveUnresolvedVisualizationProjectAction,
} from "../app/projectActions";
import type { AppRoute } from "../app/routes";
import "./GraphOnlyVisualizationPage.css";

type ColumnIndex = number | "";

type ParsedVisualizationInput = Readonly<{
  parsed: ParsedAdaptiveInput;
  error: string | null;
}>;

type EditableVisualizationTable = Readonly<{
  headers: string[];
  rows: string[][];
}>;

type GraphOnlyVisualizationPageProps = Readonly<{
  onNavigate: (route: AppRoute) => void;
  onBack?: () => void;
  saveProject?: SaveUnresolvedVisualizationProjectAction;
  openProject?: OpenUnresolvedVisualizationProjectAction;
  initialState?: UnresolvedVisualizationProjectState | null;
  onStatisticsStructureRequested?: (state: UnresolvedVisualizationProjectState) => void;
}>;

let visualizationIdSequence = 0;

function visualizationId(prefix: string): string {
  visualizationIdSequence += 1;
  return `visualization.${prefix}.${Date.now().toString(36)}.${visualizationIdSequence}`;
}

function nowIso(): string {
  return new Date().toISOString();
}

function parseVisualizationInput(text: string): ParsedVisualizationInput {
  if (!text.trim())
    return { parsed: { headers: [], rows: [], delimiter: "tab", headerRow: 1 }, error: null };
  try {
    const parsed = parseAdaptiveDelimited(text);
    if (parsed.headers.some((header) => !header.trim())) {
      return { parsed, error: "列名が空です。1行目に列名を入れてください。" };
    }
    if (parsed.rows.some((row) => row.length !== parsed.headers.length)) {
      return {
        parsed,
        error: "行ごとの列数がそろっていません。元の表で空欄の列も区切りを残してください。",
      };
    }
    return { parsed, error: null };
  } catch {
    return {
      parsed: { headers: [], rows: [], delimiter: "tab", headerRow: 1 },
      error: "表を読み取れませんでした。1行目を列名にしたCSVまたはTSVを貼り付けてください。",
    };
  }
}

function delimiterCharacter(delimiter: ParsedAdaptiveInput["delimiter"]): string {
  if (delimiter === "comma") return ",";
  if (delimiter === "semicolon") return ";";
  return "\t";
}

function serializeDelimitedCell(value: string, delimiter: string): string {
  // Keep the serialized table parseable when a user enters a delimiter or a
  // quote. Empty rows are handled by serializeDelimitedTable because an empty
  // cell inside a multi-column row is already kept by its delimiters.
  if (
    value.includes(delimiter) ||
    value.includes('"') ||
    value.includes("\r") ||
    value.includes("\n")
  ) {
    return `"${value.replace(/"/g, '""')}"`;
  }
  return value;
}

function serializeDelimitedTable(
  headers: readonly string[],
  rows: readonly (readonly string[])[],
  delimiter: ParsedAdaptiveInput["delimiter"],
): string {
  const character = delimiterCharacter(delimiter);
  const serializeLine = (values: readonly string[]): string => {
    const serialized = values
      .map((value) => serializeDelimitedCell(value, character))
      .join(character);
    // parseAdaptiveDelimited ignores lines whose trimmed contents are empty.
    // Quote the first cell of an all-empty line so an explicitly added blank
    // row (or a table whose headers are being repaired) remains editable.
    if (values.length > 0 && !serialized.trim()) {
      return [`""`, ...values.slice(1).map(() => "")].join(character);
    }
    return serialized;
  };
  const serializedHeaders = serializeLine(headers);
  return [
    serializedHeaders || '""',
    ...rows.map(
      (row) => serializeLine(headers.map((_, columnIndex) => row[columnIndex] ?? "")) || '""',
    ),
  ].join("\n");
}

function editableTableFor(parsed: ParsedAdaptiveInput): EditableVisualizationTable {
  // A malformed pasted row can contain more cells than the header. Keep every
  // parsed cell visible while the user repairs the rectangle instead of
  // truncating it in the editing surface.
  const columnCount = Math.max(parsed.headers.length, ...parsed.rows.map((row) => row.length));
  const headers = [...parsed.headers];
  while (headers.length < columnCount) headers.push("");
  const rows = parsed.rows.map((row) =>
    Array.from({ length: columnCount }, (_, columnIndex) => row[columnIndex] ?? ""),
  );
  return { headers, rows };
}

function focusAdjacentGraphOnlyInput(event: KeyboardEvent<HTMLInputElement>): void {
  if (
    !(["Tab", "Enter", "ArrowLeft", "ArrowRight", "ArrowUp", "ArrowDown"] as string[]).includes(
      event.key,
    )
  ) {
    return;
  }
  const grid = event.currentTarget.closest<HTMLElement>("[data-graph-only-grid]");
  if (!grid) return;

  const inputs = Array.from(
    grid.querySelectorAll<HTMLInputElement>('[data-graph-only-input="true"]'),
  );
  const currentIndex = inputs.indexOf(event.currentTarget);
  if (currentIndex < 0) return;

  if (event.key === "Tab") {
    const nextIndex = currentIndex + (event.shiftKey ? -1 : 1);
    const next = inputs[nextIndex];
    if (!next) return;
    event.preventDefault();
    next.focus();
    next.select();
    return;
  }

  if (event.key === "ArrowLeft" || event.key === "ArrowRight") {
    const { selectionStart, selectionEnd, value } = event.currentTarget;
    // Keep ordinary text editing intact. Horizontal arrows leave the current
    // cell only after the caret reaches the corresponding boundary; Shift+an
    // arrow continues to select text within the input.
    if (
      event.shiftKey ||
      selectionStart === null ||
      selectionEnd === null ||
      selectionStart !== selectionEnd ||
      (event.key === "ArrowLeft" && selectionStart > 0) ||
      (event.key === "ArrowRight" && selectionEnd < value.length)
    ) {
      return;
    }
  }

  const currentRow = Number(event.currentTarget.dataset.gridRow);
  const currentColumn = Number(event.currentTarget.dataset.gridColumn);
  if (!Number.isInteger(currentRow) || !Number.isInteger(currentColumn)) return;

  let nextRow = currentRow;
  let nextColumn = currentColumn;
  if (event.key === "Enter") nextRow += event.shiftKey ? -1 : 1;
  if (event.key === "ArrowLeft") nextColumn -= 1;
  if (event.key === "ArrowRight") nextColumn += 1;
  if (event.key === "ArrowUp") nextRow -= 1;
  if (event.key === "ArrowDown") nextRow += 1;

  const next = grid.querySelector<HTMLInputElement>(
    `[data-graph-only-input="true"][data-grid-row="${nextRow}"][data-grid-column="${nextColumn}"]`,
  );
  if (!next) return;
  event.preventDefault();
  next.focus();
  next.select();
}

function numericValue(raw: string | undefined): number | null {
  const value = raw?.trim() ?? "";
  if (!value || ["NA", "N/A", "—"].includes(value)) return null;
  const number = Number(value);
  return Number.isFinite(number) ? number : null;
}

function sourceKindFor(
  sourceLabel: string,
  delimiter: ParsedAdaptiveInput["delimiter"],
): "clipboard" | "csv" | "tsv" | "generic_file" {
  if (sourceLabel === "clipboard") return "clipboard";
  if (/\.tsv$/i.test(sourceLabel) || delimiter === "tab") return "tsv";
  if (/\.csv$/i.test(sourceLabel) || delimiter === "comma") return "csv";
  return "generic_file";
}

function mappingFor(
  parsed: ParsedAdaptiveInput,
  xColumn: ColumnIndex,
  yColumn: ColumnIndex,
  seriesColumn: ColumnIndex,
  idColumn: ColumnIndex,
  identityDecision: UnresolvedVisualizationIdentityDecision,
  sourceLabel: string,
  confirmedAt: string,
): UnresolvedVisualizationColumnMapping | null {
  if (xColumn === "" || yColumn === "") return null;
  const roles = new Map<number, "x" | "y" | "series" | "id">([
    [xColumn, "x"],
    [yColumn, "y"],
    ...(seriesColumn === "" ? [] : [[seriesColumn, "series"] as const]),
    ...(idColumn === "" ? [] : [[idColumn, "id"] as const]),
  ]);
  return {
    schemaVersion: "0.1.0",
    sourceLabel,
    delimiter: parsed.delimiter,
    headerRow: parsed.headerRow,
    columns: parsed.headers.map((header, index) => ({
      index,
      header,
      role: roles.get(index) ?? "metadata",
    })),
    identityDecision,
    confirmedAt,
  };
}

function graphSpecFor(
  tableId: string,
  revision: string,
  headers: readonly string[],
  xColumn: number,
  yColumn: number,
  seriesColumn: ColumnIndex,
  graphId: string,
): GraphSpec {
  const seriesHeader = seriesColumn === "" ? undefined : headers[seriesColumn];
  return {
    id: graphId,
    version: "0.1.0",
    type: seriesHeader ? "grouped_dot" : "dot_summary",
    dataSource: { kind: "visualization_table", id: tableId, revision },
    analysisResultId: null,
    dataSets: {
      displaySet: { conditionIds: [], timePointIds: [] },
      analysisSet: { conditionIds: [], timePointIds: [] },
      comparisonSet: [],
      annotationSet: [],
    },
    mappings: {
      x: headers[xColumn] ?? `column_${xColumn + 1}`,
      xHierarchy: [],
      y: headers[yColumn] ?? `column_${yColumn + 1}`,
      ...(seriesHeader ? { series: seriesHeader, color: seriesHeader } : {}),
    },
    summary: { center: "none", interval: "none" },
    annotations: [],
    appearance: {
      palette: ["#176f63", "#d27b2c", "#5877a9", "#9b4d8f", "#6f8f3d"],
      pointSize: 5,
      opacity: 0.9,
      showRawPoints: true,
      showPairedLines: false,
      distributionFill: "none",
      distributionFillColor: "#ffffff",
      distributionOutlineColor: "#111111",
      barWidth: 0.72,
      withinGroupSpacing: 0.72,
      betweenGroupSpacing: 1.35,
      barOutline: true,
      barMeanMarker: false,
      boxWhiskerMode: "tukey_1_5_iqr",
      uncertaintyStyle: "none",
      ribbonOpacity: 0.18,
      seriesStyles: {},
    },
    axes: {
      yStartAtZero: false,
      yScale: "linear",
      xLabel: headers[xColumn] ?? "X",
      yLabel: headers[yColumn] ?? "測定値",
      showMinorTicks: true,
      tickDirection: "outside",
      showCategoryGroupSeparators: Boolean(seriesHeader),
    },
  };
}

function newMetadata(projectName: string, timestamp: string) {
  return {
    projectId: visualizationId("project"),
    projectName,
    experimentDate: "" as const,
    operator: "",
    batch: "",
    note: "Graph-only: 実験構造は未確定",
    createdAt: timestamp,
    updatedAt: timestamp,
  };
}

function initialColumn(
  state: UnresolvedVisualizationProjectState | null | undefined,
  role: "x" | "y" | "series" | "id",
): ColumnIndex {
  const column = state?.mapping?.columns.find((candidate) => candidate.role === role);
  return column?.index ?? "";
}

function initialIdentityDecision(
  state: UnresolvedVisualizationProjectState | null | undefined,
): UnresolvedVisualizationIdentityDecision {
  return state?.mapping
    ? resolveUnresolvedVisualizationIdentityDecision(state.mapping)
    : "unanswered";
}

function sameStringRows(
  left: readonly (readonly string[])[],
  right: readonly (readonly string[])[],
): boolean {
  return (
    left.length === right.length &&
    left.every(
      (row, rowIndex) =>
        row.length === right[rowIndex]?.length &&
        row.every((cell, columnIndex) => cell === right[rowIndex]?.[columnIndex]),
    )
  );
}

function sameMappingDefinition(
  left: UnresolvedVisualizationColumnMapping | null,
  right: UnresolvedVisualizationColumnMapping,
): boolean {
  return (
    left !== null &&
    left.sourceLabel === right.sourceLabel &&
    left.delimiter === right.delimiter &&
    left.headerRow === right.headerRow &&
    resolveUnresolvedVisualizationIdentityDecision(left) ===
      resolveUnresolvedVisualizationIdentityDecision(right) &&
    left.columns.length === right.columns.length &&
    left.columns.every((column, index) => {
      const candidate = right.columns[index];
      return (
        candidate !== undefined &&
        column.index === candidate.index &&
        column.header === candidate.header &&
        column.role === candidate.role
      );
    })
  );
}

function sampleText(): string {
  return ["Condition\tValue", "Control\t12.4", "Drug A\t18.1", "Drug B\t20.0"].join("\n");
}

function GraphOnlyPlot({
  parsed,
  xColumn,
  yColumn,
  seriesColumn,
}: {
  parsed: ParsedAdaptiveInput;
  xColumn: number;
  yColumn: number;
  seriesColumn: ColumnIndex;
}) {
  const points = parsed.rows.flatMap((row, rowIndex) => {
    const y = numericValue(row[yColumn]);
    if (y === null) return [];
    const series = seriesColumn === "" ? "" : row[seriesColumn]?.trim() || "（空欄）";
    return [{ x: row[xColumn] || `行 ${rowIndex + 2}`, y, series, rowIndex }];
  });
  if (!points.length) return null;

  const width = 760;
  const height = 360;
  const left = 60;
  const right = 24;
  const top = 24;
  const bottom = 72;
  const plotWidth = width - left - right;
  const plotHeight = height - top - bottom;
  const labels: string[] = [];
  points.forEach(({ x }) => {
    if (!labels.includes(x)) labels.push(x);
  });
  const maxY = Math.max(...points.map(({ y }) => y), 0);
  const minY = Math.min(...points.map(({ y }) => y), 0);
  const range = maxY - minY || 1;
  const seriesLabels: string[] = [];
  points.forEach(({ series }) => {
    if (series && !seriesLabels.includes(series)) seriesLabels.push(series);
  });
  const palette = ["#176f63", "#d27b2c", "#5877a9", "#9b4d8f", "#6f8f3d"];
  const xPosition = (label: string) =>
    left +
    (labels.length <= 1
      ? plotWidth / 2
      : (labels.indexOf(label) / (labels.length - 1)) * plotWidth);
  const yPosition = (value: number) => top + ((maxY - value) / range) * plotHeight;

  return (
    <figure className="graph-only__figure">
      <svg
        className="graph-only__svg"
        viewBox={`0 0 ${width} ${height}`}
        role="img"
        aria-label={`${parsed.headers[yColumn] ?? "測定値"}を${parsed.headers[xColumn] ?? "X"}ごとに表示したGraph`}
      >
        <line x1={left} x2={left} y1={top} y2={top + plotHeight} stroke="currentColor" />
        <line
          x1={left}
          x2={left + plotWidth}
          y1={top + plotHeight}
          y2={top + plotHeight}
          stroke="currentColor"
        />
        {points.map(({ x, y, series, rowIndex }) => {
          const xJitter =
            seriesLabels.length > 1
              ? (seriesLabels.indexOf(series) - (seriesLabels.length - 1) / 2) * 8
              : 0;
          const fill =
            palette[(seriesLabels.length ? seriesLabels.indexOf(series) : 0) % palette.length]!;
          return (
            <circle
              key={`${rowIndex}.${x}.${y}`}
              cx={xPosition(x) + xJitter}
              cy={yPosition(y)}
              r={5}
              fill={fill}
              opacity={0.9}
            />
          );
        })}
        {labels.map((label) => {
          const x = xPosition(label);
          return (
            <text
              key={label}
              x={x}
              y={height - 42}
              textAnchor="end"
              transform={`rotate(-32 ${x} ${height - 42})`}
            >
              {label}
            </text>
          );
        })}
        <text x={left + plotWidth / 2} y={height - 8} textAnchor="middle">
          {parsed.headers[xColumn] ?? "X"}
        </text>
        <text
          x={16}
          y={top + plotHeight / 2}
          textAnchor="middle"
          transform={`rotate(-90 16 ${top + plotHeight / 2})`}
        >
          {parsed.headers[yColumn] ?? "測定値"}
        </text>
      </svg>
      <figcaption>
        これは表の数値をそのまま表示する説明用Graphです。統計的な比較は含みません。
      </figcaption>
    </figure>
  );
}

export function GraphOnlyVisualizationPage({
  onNavigate,
  onBack,
  saveProject,
  openProject,
  initialState = null,
  onStatisticsStructureRequested,
}: GraphOnlyVisualizationPageProps) {
  const compatibleInitialState = initialState?.entryIntent === "graph_only" ? initialState : null;
  const initialIntentError =
    initialState && initialState.entryIntent !== "graph_only"
      ? "このファイルは表からGraph用のprojectではありません。"
      : null;
  const [text, setText] = useState(compatibleInitialState?.rawLineage.rawText ?? "");
  const [sourceLabel, setSourceLabel] = useState(
    compatibleInitialState?.rawLineage.sourceLabel ?? "clipboard",
  );
  const [loadedState, setLoadedState] = useState<UnresolvedVisualizationProjectState | null>(
    compatibleInitialState,
  );
  const [savedTarget, setSavedTarget] = useState<string | undefined>();
  const [xColumn, setXColumn] = useState<ColumnIndex>(initialColumn(compatibleInitialState, "x"));
  const [yColumn, setYColumn] = useState<ColumnIndex>(initialColumn(compatibleInitialState, "y"));
  const [seriesColumn, setSeriesColumn] = useState<ColumnIndex>(
    initialColumn(compatibleInitialState, "series"),
  );
  const [idColumn, setIdColumn] = useState<ColumnIndex>(
    initialColumn(compatibleInitialState, "id"),
  );
  const [identityDecision, setIdentityDecision] = useState<UnresolvedVisualizationIdentityDecision>(
    initialIdentityDecision(compatibleInitialState),
  );
  const [error, setError] = useState<string | null>(initialIntentError);
  const [saveMessage, setSaveMessage] = useState<string | null>(null);
  const [statisticsMessage, setStatisticsMessage] = useState<string | null>(null);
  const [statisticsHandoffVisible, setStatisticsHandoffVisible] = useState(false);
  const [statisticsXMeaning, setStatisticsXMeaning] = useState<
    "" | "condition" | "ordered" | "unknown"
  >("");
  const parsedResult = useMemo(() => parseVisualizationInput(text), [text]);
  const parsed = parsedResult.parsed;
  const editableTable = useMemo(() => editableTableFor(parsed), [parsed]);

  const updateEditableTable = (
    headers: readonly string[],
    rows: readonly (readonly string[])[],
  ) => {
    setText(serializeDelimitedTable(headers, rows, parsed.delimiter));
    setSaveMessage(null);
    setError(null);
  };

  const updateEditableCell = (rowIndex: number | null, columnIndex: number, value: string) => {
    const nextHeaders = [...editableTable.headers];
    const nextRows = editableTable.rows.map((row) => [...row]);
    if (rowIndex === null) {
      nextHeaders[columnIndex] = value;
    } else {
      const row = nextRows[rowIndex];
      if (!row) return;
      row[columnIndex] = value;
    }
    updateEditableTable(nextHeaders, nextRows);
  };

  const addEditableRow = () => {
    if (!editableTable.headers.length) return;
    updateEditableTable(editableTable.headers, [
      ...editableTable.rows,
      editableTable.headers.map(() => ""),
    ]);
  };

  const addEditableColumn = () => {
    const nextHeaders = [...editableTable.headers, ""];
    const nextRows = editableTable.rows.map((row) => [...row, ""]);
    updateEditableTable(nextHeaders, nextRows);
  };

  const finiteYCount =
    yColumn === ""
      ? 0
      : parsed.rows.reduce(
          (count, row) => count + (numericValue(row[yColumn]) === null ? 0 : 1),
          0,
        );
  const skippedYCount = yColumn === "" ? 0 : parsed.rows.length - finiteYCount;
  const duplicateMapping =
    xColumn !== "" &&
    yColumn !== "" &&
    (xColumn === yColumn ||
      (seriesColumn !== "" && (seriesColumn === xColumn || seriesColumn === yColumn)) ||
      (idColumn !== "" &&
        (idColumn === xColumn || idColumn === yColumn || idColumn === seriesColumn)));
  const canGraph =
    !parsedResult.error &&
    parsed.rows.length > 0 &&
    xColumn !== "" &&
    yColumn !== "" &&
    !duplicateMapping &&
    finiteYCount > 0;

  const columns = parsed.headers.map((header, index) => (
    <option key={`${index}.${header}`} value={index}>
      {header || `列 ${index + 1}`}
    </option>
  ));

  const buildState = (): UnresolvedVisualizationProjectState | null => {
    if (!canGraph) return null;
    const selectedX = xColumn as number;
    const selectedY = yColumn as number;
    const timestamp = nowIso();
    const tableId = loadedState?.table.id ?? visualizationId("table");
    const metadata = loadedState?.metadata ?? newMetadata(`表から作成したGraph`, timestamp);
    const lineageSource = sourceKindFor(sourceLabel, parsed.delimiter);
    const candidateMapping = mappingFor(
      parsed,
      selectedX,
      selectedY,
      seriesColumn,
      idColumn,
      identityDecision,
      sourceLabel,
      timestamp,
    );
    if (!candidateMapping) return null;
    const mapping =
      loadedState?.mapping && sameMappingDefinition(loadedState.mapping, candidateMapping)
        ? loadedState.mapping
        : candidateMapping;
    const table = {
      id: tableId,
      headers: [...parsed.headers],
      rows: parsed.rows.map((row) => [...row]),
      delimiter: parsed.delimiter,
      headerRow: parsed.headerRow,
    };
    const sourceUnchanged =
      loadedState?.rawLineage.sourceLabel === sourceLabel &&
      loadedState.rawLineage.sourceKind === lineageSource;
    const rawTextUnchanged = sourceUnchanged && loadedState?.rawLineage.rawText === text;
    const tableUnchanged =
      loadedState !== null &&
      loadedState.table.id === table.id &&
      loadedState.table.delimiter === table.delimiter &&
      loadedState.table.headerRow === table.headerRow &&
      loadedState.table.headers.length === table.headers.length &&
      loadedState.table.headers.every((header, index) => header === table.headers[index]) &&
      sameStringRows(loadedState.table.rows, table.rows);
    const mappingUnchanged =
      loadedState !== null && sameMappingDefinition(loadedState.mapping, mapping);
    const activeGraphRetained =
      loadedState?.activeGraphId !== null &&
      loadedState?.graphSpecs.some(({ id }) => id === loadedState.activeGraphId) === true;
    if (rawTextUnchanged && tableUnchanged && mappingUnchanged && activeGraphRetained) {
      return loadedState;
    }
    const transformations = rawTextUnchanged
      ? [...loadedState!.rawLineage.transformations]
      : [
          ...(loadedState?.rawLineage.transformations ?? []),
          "visualization_table_or_source_updated",
          "explicit_visualization_column_mapping",
        ].filter((value, index, values) => values.indexOf(value) === index);
    const rawLineage = {
      sourceKind: lineageSource,
      sourceLabel,
      importedAt: sourceUnchanged && loadedState ? loadedState.rawLineage.importedAt : timestamp,
      rawText: text,
      sha256: rawTextUnchanged ? (loadedState?.rawLineage.sha256 ?? null) : null,
      transformations,
    };
    const base = loadedState
      ? appendUnresolvedVisualizationDataRevision(loadedState, {
          table,
          rawLineage,
          mapping,
          actor: "researcher",
          createdAt: timestamp,
        })
      : createUnresolvedVisualizationProjectState({
          metadata: { ...metadata, updatedAt: timestamp },
          entryIntent: "graph_only",
          table,
          rawLineage: {
            ...rawLineage,
            transformations: ["delimiter_detection", "explicit_visualization_column_mapping"],
          },
          mapping,
          actor: "researcher",
        });
    const spec = graphSpecFor(
      tableId,
      base.activeDataRevisionId,
      parsed.headers,
      selectedX,
      selectedY,
      seriesColumn,
      visualizationId("graph"),
    );
    return appendUnresolvedVisualizationGraph(base, {
      spec,
      actor: "researcher",
      createdAt: timestamp,
    });
  };

  const applyLoadedState = (state: UnresolvedVisualizationProjectState, target?: string) => {
    if (state.entryIntent !== "graph_only") {
      throw new Error("このファイルは表からGraph用のprojectではありません。");
    }
    setLoadedState(state);
    setSavedTarget(target);
    setText(state.rawLineage.rawText);
    setSourceLabel(state.rawLineage.sourceLabel);
    setXColumn(initialColumn(state, "x"));
    setYColumn(initialColumn(state, "y"));
    setSeriesColumn(initialColumn(state, "series"));
    setIdColumn(initialColumn(state, "id"));
    setIdentityDecision(initialIdentityDecision(state));
    setError(null);
    setSaveMessage(target ? "保存したGraph用データを開きました。" : null);
    setStatisticsMessage(null);
    setStatisticsHandoffVisible(false);
    setStatisticsXMeaning("");
  };

  return (
    <div className="page-stack narrow-page graph-only">
      <button className="back-link" type="button" onClick={onBack ?? (() => onNavigate("home"))}>
        <span aria-hidden="true">←</span> 入口へ戻る
      </button>
      <header className="graph-only__header">
        <p className="experiment-start__eyebrow">表からGraph</p>
        <h1>手元の表からGraphを作る</h1>
        <p>
          表の列を明示的に指定して、数値を説明用Graphとして表示します。実験構造や統計的なnは推測しません。
        </p>
      </header>

      <section className="graph-only__input" aria-labelledby="graph-only-input-heading">
        <div className="graph-only__section-heading">
          <h2 id="graph-only-input-heading">1. 表を貼り付ける</h2>
          <div className="graph-only__actions">
            <button
              className="secondary-button"
              type="button"
              onClick={() => {
                const clipboard = navigator.clipboard;
                if (!clipboard) {
                  setError(
                    "クリップボードを読み取れませんでした。下の欄へ直接貼り付けてください。",
                  );
                  return;
                }
                void clipboard
                  .readText()
                  .then((clipboardText) => {
                    if (clipboardText) {
                      setText(clipboardText);
                      setSourceLabel("clipboard");
                      setXColumn("");
                      setYColumn("");
                      setSeriesColumn("");
                      setIdColumn("");
                      setIdentityDecision("unanswered");
                    }
                  })
                  .catch(() =>
                    setError(
                      "クリップボードを読み取れませんでした。下の欄へ直接貼り付けてください。",
                    ),
                  );
              }}
            >
              クリップボードから貼り付け
            </button>
            {openProject ? (
              <button
                className="secondary-button"
                type="button"
                onClick={() => {
                  void openProject()
                    .then((opened) => {
                      if (opened) applyLoadedState(opened.state, opened.target);
                    })
                    .catch((reason: unknown) =>
                      setError(
                        reason instanceof Error
                          ? reason.message
                          : "保存したGraph用データを開けませんでした。",
                      ),
                    );
                }}
              >
                保存したGraph用データを開く
              </button>
            ) : null}
          </div>
        </div>
        <label className="experiment-start__field" htmlFor="graph-only-table-text">
          <span>CSV / TSVの表</span>
          <textarea
            id="graph-only-table-text"
            aria-label="Graph用の表"
            rows={8}
            value={text}
            placeholder={sampleText()}
            onChange={(event) => {
              setText(event.currentTarget.value);
              setSourceLabel("clipboard");
              setSaveMessage(null);
              setError(null);
              setXColumn("");
              setYColumn("");
              setSeriesColumn("");
              setIdColumn("");
              setIdentityDecision("unanswered");
            }}
          />
        </label>
        <label className="graph-only__file">
          <span>またはCSV / TSV / TXTファイル</span>
          <input
            aria-label="Graph用の表ファイル"
            accept=".csv,.tsv,.txt,text/csv,text/tab-separated-values,text/plain"
            type="file"
            onChange={(event) => {
              const file = event.currentTarget.files?.[0];
              if (!file) return;
              void file
                .text()
                .then((contents) => {
                  setText(contents);
                  setSourceLabel(file.name);
                  setSaveMessage(null);
                  setError(null);
                  setXColumn("");
                  setYColumn("");
                  setSeriesColumn("");
                  setIdColumn("");
                  setIdentityDecision("unanswered");
                })
                .catch(() => setError("表ファイルを読み込めませんでした。"));
            }}
          />
        </label>
        {parsedResult.error ? (
          <p className="graph-only__error" role="alert">
            {parsedResult.error}
          </p>
        ) : null}
        {editableTable.headers.length > 0 ? (
          <section className="graph-only__table-editor" aria-labelledby="graph-only-editor-heading">
            <div className="graph-only__editor-heading">
              <div>
                <h3 id="graph-only-editor-heading">表を直接編集</h3>
                <p className="graph-only__subtle">
                  列名とセルを編集できます。Tab・Enter・矢印キーでセル間を移動できます。
                </p>
              </div>
              <div className="graph-only__actions">
                <button className="secondary-button" type="button" onClick={addEditableRow}>
                  行を追加
                </button>
                <button className="secondary-button" type="button" onClick={addEditableColumn}>
                  列を追加
                </button>
              </div>
            </div>
            <div className="graph-only__table-wrap" data-graph-only-grid>
              <table aria-label="Graph用の表を直接編集">
                <thead>
                  <tr>
                    {editableTable.headers.map((header, columnIndex) => (
                      <th key={columnIndex} scope="col">
                        <input
                          aria-label={`列名 ${columnIndex + 1}`}
                          data-graph-only-input="true"
                          data-grid-row={0}
                          data-grid-column={columnIndex}
                          data-testid={`graph-only-header-${columnIndex}`}
                          type="text"
                          value={header}
                          onChange={(event) =>
                            updateEditableCell(null, columnIndex, event.currentTarget.value)
                          }
                          onKeyDown={focusAdjacentGraphOnlyInput}
                        />
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {editableTable.rows.map((row, rowIndex) => (
                    <tr key={rowIndex}>
                      {editableTable.headers.map((header, columnIndex) => (
                        <td key={columnIndex}>
                          <input
                            aria-label={`表セル ${rowIndex + 1}行目 ${columnIndex + 1}列目${header ? `（${header}）` : ""}`}
                            data-graph-only-input="true"
                            data-grid-row={rowIndex + 1}
                            data-grid-column={columnIndex}
                            data-testid={`graph-only-cell-${rowIndex}-${columnIndex}`}
                            type="text"
                            value={row[columnIndex] ?? ""}
                            onChange={(event) =>
                              updateEditableCell(rowIndex, columnIndex, event.currentTarget.value)
                            }
                            onKeyDown={focusAdjacentGraphOnlyInput}
                          />
                        </td>
                      ))}
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </section>
        ) : null}
      </section>

      <section className="graph-only__mapping" aria-labelledby="graph-only-mapping-heading">
        <h2 id="graph-only-mapping-heading">2. Graphに使う列を指定する</h2>
        <p className="graph-only__subtle">
          列の意味は自動で決めません。表を見て、横軸・測定値・（必要なら）グループ列を選びます。
        </p>
        <div className="graph-only__mapping-grid">
          <label className="experiment-start__field">
            <span>横軸（カテゴリまたはX）</span>
            <select
              aria-label="Graphの横軸"
              value={xColumn}
              onChange={(event) =>
                setXColumn(event.target.value === "" ? "" : Number(event.target.value))
              }
            >
              <option value="">列を選択</option>
              {columns}
            </select>
          </label>
          <label className="experiment-start__field">
            <span>測定値（数値）</span>
            <select
              aria-label="Graphの測定値"
              value={yColumn}
              onChange={(event) =>
                setYColumn(event.target.value === "" ? "" : Number(event.target.value))
              }
            >
              <option value="">列を選択</option>
              {columns}
            </select>
          </label>
          <label className="experiment-start__field">
            <span>グループ（任意）</span>
            <select
              aria-label="Graphのグループ"
              value={seriesColumn}
              onChange={(event) =>
                setSeriesColumn(event.target.value === "" ? "" : Number(event.target.value))
              }
            >
              <option value="">グループなし</option>
              {columns}
            </select>
          </label>
        </div>
        {duplicateMapping ? (
          <p className="graph-only__error" role="alert">
            同じ列を複数の役割には使えません。別の列を選んでください。
          </p>
        ) : null}
        {yColumn !== "" && finiteYCount === 0 && parsed.rows.length > 0 ? (
          <p className="graph-only__error" role="alert">
            測定値の列に数値がありません。数値列を指定してください。
          </p>
        ) : null}
        {yColumn !== "" && finiteYCount > 0 && skippedYCount > 0 ? (
          <p className="graph-only__subtle">
            数値として読めない {skippedYCount} 行はGraphに表示せず、元の表には残します。
          </p>
        ) : null}
      </section>

      <section className="graph-only__result" aria-labelledby="graph-only-result-heading">
        <div className="graph-only__result-heading">
          <h2 id="graph-only-result-heading">3. Graph</h2>
          <span className={canGraph ? "graph-only__ready" : "graph-only__waiting"}>
            {canGraph ? "表示できます" : "列の指定を待っています"}
          </span>
        </div>
        {canGraph ? (
          <GraphOnlyPlot
            parsed={parsed}
            xColumn={xColumn as number}
            yColumn={yColumn as number}
            seriesColumn={seriesColumn}
          />
        ) : (
          <p className="graph-only__subtle">
            表を貼り付け、横軸と測定値を指定するとGraphが表示されます。
          </p>
        )}
        <div className="graph-only__result-actions">
          <button
            className="primary-button"
            type="button"
            disabled={!canGraph || !saveProject}
            aria-describedby={!saveProject ? "graph-only-save-unavailable" : undefined}
            onClick={() => {
              const state = buildState();
              if (!state || !saveProject) return;
              void saveProject(state, savedTarget)
                .then((saved) => {
                  if (!saved) return;
                  setLoadedState(saved.state);
                  setSavedTarget(saved.target);
                  setSaveMessage("Graph用データを保存しました。元の表と列の指定を保持しています。");
                })
                .catch((reason: unknown) =>
                  setError(
                    reason instanceof Error
                      ? reason.message
                      : "Graph用データを保存できませんでした。",
                  ),
                );
            }}
          >
            このGraph用データを保存
          </button>
          <button
            className="secondary-button"
            type="button"
            onClick={() => {
              if (onStatisticsStructureRequested && canGraph) {
                setStatisticsHandoffVisible(true);
                setStatisticsMessage(null);
                return;
              }
              setStatisticsMessage(
                "実験構造が未確定のため、統計解析は開始できません。実験から始める入口で、独立した対象・条件・対応関係を確認してください。",
              );
            }}
          >
            統計を確認
          </button>
        </div>
        {!saveProject ? (
          <p id="graph-only-save-unavailable" className="graph-only__subtle">
            このブラウザレビューではGraph用データを保存できません。デスクトップ版で利用できます。
          </p>
        ) : null}
        {statisticsHandoffVisible ? (
          <section
            className="graph-only__statistics-handoff"
            aria-labelledby="graph-only-statistics-handoff-heading"
          >
            <h3 id="graph-only-statistics-handoff-heading">統計に必要な実験情報を追加</h3>
            <p>
              元の表とGraphはこの画面に保持します。まず、横軸の意味だけ確認してから実験の質問へ進みます。
            </p>
            <fieldset>
              <legend>
                横軸「{xColumn === "" ? "未指定" : parsed.headers[xColumn]}」は何を表しますか？
              </legend>
              <label>
                <input
                  type="radio"
                  name="graph-only-x-meaning"
                  checked={statisticsXMeaning === "condition"}
                  onChange={() => setStatisticsXMeaning("condition")}
                />
                処理・群分け（Control、Drug A、genotypeなど）
              </label>
              <label>
                <input
                  type="radio"
                  name="graph-only-x-meaning"
                  checked={statisticsXMeaning === "ordered"}
                  onChange={() => setStatisticsXMeaning("ordered")}
                />
                時間・濃度・距離など順序のある値
              </label>
              <label>
                <input
                  type="radio"
                  name="graph-only-x-meaning"
                  checked={statisticsXMeaning === "unknown"}
                  onChange={() => setStatisticsXMeaning("unknown")}
                />
                その他、または分からない
              </label>
            </fieldset>
            {statisticsXMeaning === "condition" ? (
              <label className="experiment-start__field">
                <span>各行の対象・試料を示すID列（表にある場合）</span>
                <select
                  aria-label="統計で使う対象ID"
                  value={
                    identityDecision === "unanswered"
                      ? ""
                      : identityDecision === "no_id"
                        ? "no_id"
                        : String(idColumn)
                  }
                  onChange={(event) => {
                    if (event.target.value === "") {
                      setIdentityDecision("unanswered");
                      setIdColumn("");
                    } else if (event.target.value === "no_id") {
                      setIdentityDecision("no_id");
                      setIdColumn("");
                    } else {
                      setIdentityDecision("selected_column");
                      setIdColumn(Number(event.target.value));
                    }
                  }}
                >
                  <option value="">選択してください</option>
                  <option value="no_id">元の表に対象・試料IDの列はない</option>
                  {columns}
                </select>
                <small>
                  DishID・AnimalIDなど、元の表にあるIDは独立した実験でも保持します。ID列を選んだだけでは対応ありと判断せず、次の質問で条件間の関係を確認します。行の順番から対応付けることはありません。
                </small>
              </label>
            ) : null}
            {statisticsXMeaning === "condition" && identityDecision === "unanswered" ? (
              <p className="graph-only__error" role="status">
                対象・試料IDの列があるか回答してください。未回答のまま行番号をIDとして使うことはありません。
              </p>
            ) : null}
            {seriesColumn !== "" ? (
              <p className="graph-only__error" role="alert">
                選択中のグループ列が、処理条件・batch・表示だけの分類のどれか確認する必要があります。現在は自動で無視せず、元の表を保持して停止します。
              </p>
            ) : null}
            {statisticsXMeaning === "ordered" ? (
              <p className="graph-only__error" role="alert">
                順序のあるXを一般実験へ安全に引き継ぐ仕組みは準備中です。別の実験構造へ変換せず、元の表を保持します。
              </p>
            ) : null}
            {statisticsXMeaning === "unknown" ? (
              <p className="graph-only__error" role="alert">
                横軸の意味が決まるまで推測して進みません。元の表は保持されています。
              </p>
            ) : null}
            <button
              className="primary-button"
              type="button"
              disabled={
                statisticsXMeaning !== "condition" ||
                identityDecision === "unanswered" ||
                seriesColumn !== ""
              }
              onClick={() => {
                const state = buildState();
                if (state) onStatisticsStructureRequested?.(state);
              }}
            >
              実験構造の確認へ
            </button>
          </section>
        ) : null}
        {saveMessage ? (
          <p className="graph-only__success" role="status">
            {saveMessage}
          </p>
        ) : null}
        {statisticsMessage ? (
          <p className="graph-only__error" role="alert">
            {statisticsMessage}
          </p>
        ) : null}
        {error ? (
          <p className="graph-only__error" role="alert">
            {error}
          </p>
        ) : null}
      </section>
    </div>
  );
}

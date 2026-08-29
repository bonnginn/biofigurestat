import {
  CONDITION_STATUS,
  READOUT_KIND,
  createPrototypeState,
  deriveGraphDatum,
  evaluateComparisonScopeReadiness,
  evaluateReadiness,
  findObservationCoordinateConflicts,
  mergeExampleObservations,
  partitionObservations,
  setConditionStatus,
  upsertObservation,
} from "./semantic-model.js";
import {
  GUIDED_ENTRY_VERSION,
  buildNestedLevels,
  buildGuidedPrototypeDefinition,
  buildPastedConditionDefinition,
  comparisonScopeSuggestions,
  deriveObservationGuideShape,
  evaluateSourceLinkage,
  mapObservationGuide,
  prepareGuideExampleForVisibleStep,
} from "./guided-entry-model.js";
import {
  applyTabDelimitedPaste,
  createSpreadsheetGrid,
  parseTabDelimitedText,
  serializeSpreadsheetGrid,
  setSpreadsheetCell,
} from "./spreadsheet-grid-model.js";
import {
  MEASUREMENT_VIEW_MODE,
  applyIndependentCompactValues,
  buildMeasurementAxisColumns,
  buildMeasurementRecordView,
  buildConditionMeasurementSheets,
  compactMeasurementEditingDecision,
  describeMeasurementDerivationIssue,
  ensureConditionMeasurementRowCount,
  rowCountWithTrailingEntryRow,
  serializeIndependentCompactValues,
} from "./measurement-sheet-model.js";
import { deriveDesignProgress } from "./design-progress-model.js";
import {
  researchContextIngress,
  researchContextPresentation,
  selectResearchContext,
} from "./research-context-model.js";

const STATUS_ORDER = [
  CONDITION_STATUS.PERFORMED,
  CONDITION_STATUS.NOT_PERFORMED_BY_DESIGN,
  CONDITION_STATUS.UNKNOWN,
];

const STATUS_COPY = {
  [CONDITION_STATUS.PERFORMED]: { symbol: "✓", short: "実施", label: "実施した" },
  [CONDITION_STATUS.NOT_PERFORMED_BY_DESIGN]: { symbol: "—", short: "最初からなし", label: "最初から作らなかった" },
  [CONDITION_STATUS.UNKNOWN]: { symbol: "?", short: "不明", label: "まだ不明" },
};

const observationPatterns = {
  one_per_record: {
    title: "対象ごとに1つの値",
    detail: "各条件で、dish・動物・実験回など1つにつき値を1つ記録した",
    surface: "条件別の観測表",
    summary: "条件、対象の名前、測定値を1行ずつ記録します。条件間で同じ行番号だから同じ対象とは解釈しません。",
  },
  same_entity_conditions: {
    title: "同じ対象を複数条件で測定",
    detail: "同じCell・試料・個体などから、複数条件の値を得た",
    surface: "同じ対象を条件ごとに横へ並べる表",
    summary: "同じ対象のIDを1行に保ち、実際に測定した条件だけを横に並べます。",
  },
  matched_source_conditions: {
    title: "同じ元材料から分けた試料を条件ごとに測定",
    detail: "同じdonor・採取材料などから、条件ごとに別々のdish・試料を用意した",
    surface: "元材料のIDを保って条件ごとに横へ並べる表",
    summary: "同じdonor・採取材料などのIDを1行に保ちます。各条件のdish・試料は別物として記録し、同じ対象を繰り返し測ったとは扱いません。",
  },
  same_entity_sequence: {
    title: "同じ対象を時点などに沿って追跡",
    detail: "同じCell・dish・動物などを、複数の時点や位置で繰り返し測定した",
    surface: "同じ対象を時点ごとに横へ並べる表",
    summary: "対象IDを保ったまま、時点などを横に並べます。途中で値がなくなっても別の対象へつなぎません。",
  },
  distinct_entity_sequence: {
    title: "時点ごとに別の試料を回収",
    detail: "順序はあるが、各時点・濃度などでは別のdish・動物・試料を測定した",
    surface: "順序つき観測表",
    summary: "時点や濃度を記録しますが、異なる対象を反復測定として結びません。",
  },
  nested_records: {
    title: "1つの対象から複数の視野・Cell",
    detail: "1つのdish・動物・試料などの中から、複数の視野・Cell・ROIを測定した",
    surface: "dish・視野・Cellの名前を残す表",
    summary: "dishなどの親の名前と、視野・Cellなどの子の名前を各行に残します。個数は揃えません。",
  },
  nested_sequence: {
    title: "同じCell・ROIなどを時点に沿って追跡",
    detail: "dish内のCell・ROIなどを区別したまま、同じ対象を複数時点で測定した",
    surface: "試料ID・観測対象IDを固定し、時点を横に並べる表",
    summary: "dishなどの試料IDとCellなどの観測対象IDを同じ行に保ち、時点を横に並べます。途中の空欄は0で補いません。",
  },
  typed_record: {
    title: "関連する値を一緒に記録",
    detail: "陽性数と総数、targetとreferenceなど、同じ記録から関連する値を得た",
    surface: "同じ試料から得た元の値を横に並べる表",
    summary: "関連する値を同じ行に保持し、比率などは元の値を残したまま計算します。",
  },
};

function gridFixture({ rows, columns, inactive = [], unknown = [] }) {
  const inactiveSet = new Set(inactive);
  const unknownSet = new Set(unknown);
  return rows.flatMap((row) => columns.map((column) => {
    const id = `${row.id}__${column.id}`;
    return {
      id,
      label: columns.length === 1 ? row.label : `${row.label} / ${column.label}`,
      rowId: row.id,
      columnId: column.id,
      status: inactiveSet.has(id)
        ? CONDITION_STATUS.NOT_PERFORMED_BY_DESIGN
        : unknownSet.has(id)
          ? CONDITION_STATUS.UNKNOWN
          : CONDITION_STATUS.PERFORMED,
    };
  }));
}

function question(id, wording, options, resolvedAnswers) {
  return { id, wording, options, resolvedAnswers, requiredFor: ["statistics"] };
}

const sirnaRows = [
  { id: "control", label: "control" },
  { id: "gene-a-1", label: "Gene A #1" },
  { id: "gene-a-2", label: "Gene A #2" },
  { id: "gene-a-3", label: "Gene A #3" },
  { id: "gene-b-1", label: "Gene B #1" },
  { id: "gene-b-2", label: "Gene B #2" },
  { id: "gene-b-3", label: "Gene B #3" },
];
const doxColumns = [{ id: "minus", label: "Dox −" }, { id: "plus", label: "Dox +" }];
const singleColumn = [{ id: "performed", label: "実施" }];

const templateDefinitions = {
  sirna: {
    title: "siRNA × Dox",
    rowLabel: "siRNA",
    rows: sirnaRows,
    columns: doxColumns,
    help: "各siRNAとDoxの組み合わせを示します。各マスで、実施した・実施していない・まだ不明を選べます。",
    defaultPattern: "typed_record",
    patternCandidates: ["typed_record", "nested_records"],
    axisValues: [],
    fixture: {
      fixtureId: "sirna-dox",
      conditionCells: gridFixture({ rows: sirnaRows, columns: doxColumns, inactive: ["control__plus"] }),
      readouts: [{
        id: "cilia_ratio",
        label: "ciliated cells / total cells",
        kind: READOUT_KIND.POSITIVE_TOTAL,
        numeratorField: "positive",
        denominatorField: "total",
      }],
      observations: [],
      questions: [
        question("independent_runs", "別々に始めた培養実験は何回ありますか？", [
          ["select", "選択してください"], ["three", "3回"], ["four", "4回"], ["five", "5回"], ["six_plus", "6回以上"], ["unknown", "不明"],
        ], ["three", "four", "five", "six_plus"]),
        question("source_split", "同じ実験回では、1つの元の培養を条件ごとに分けましたか？", [
          ["select", "選択してください"], ["split", "分けた"], ["separate", "条件ごとに別々に準備した"], ["unknown", "不明"],
        ], ["split", "separate"]),
        question("receiver", "siRNAとDoxを加えたdish・wellの関係はどれですか？", [
          ["select", "選択してください"], ["dox_after_split", "siRNA後に分けたdishへDoxを追加"], ["separate_from_start", "各組み合わせを最初から別dishで準備"], ["other", "この2つ以外"], ["unknown", "不明"],
        ], ["dox_after_split", "separate_from_start"]),
        question("comparison", "Statisticsでは、まずどの違いを確かめたいですか？", [
          ["select", "選択してください"], ["within_sirna", "各siRNA内のDox − と＋"], ["between_sirna", "siRNA同士"], ["both", "両方"], ["not_decided", "まだ決めていない"],
        ], ["within_sirna", "between_sirna", "both"]),
      ],
    },
    demo(model) {
      const observations = [];
      let index = 0;
      for (const cell of model.conditionCells.filter((item) => item.status === CONDITION_STATUS.PERFORMED)) {
        for (let run = 1; run <= 3; run += 1) {
          index += 1;
          const total = 92 + ((index * 7) % 25);
          const positive = Math.round(total * (0.18 + ((index * 11) % 52) / 100));
          observations.push({ id: `sirna-demo-${index}`, conditionCellId: cell.id, readoutId: "cilia_ratio", entityId: `Exp-${run}`, fields: { positive, total } });
        }
      }
      return observations;
    },
  },
  independent: {
    title: "薬剤4条件",
    rowLabel: "処理",
    rows: [
      { id: "vehicle", label: "Vehicle" }, { id: "drug-a", label: "Drug A" },
      { id: "drug-b", label: "Drug B" }, { id: "drug-c", label: "Drug C" },
    ],
    columns: singleColumn,
    help: "各薬剤条件を実際に行ったか確認します。データ数は条件ごとに違っていて構いません。",
    defaultPattern: "one_per_record",
    patternCandidates: ["one_per_record", "same_entity_conditions"],
    axisValues: [],
    fixture: {
      fixtureId: "four-independent-conditions",
      conditionCells: gridFixture({
        rows: [
          { id: "vehicle", label: "Vehicle" }, { id: "drug-a", label: "Drug A" },
          { id: "drug-b", label: "Drug B" }, { id: "drug-c", label: "Drug C" },
        ],
        columns: singleColumn,
      }),
      readouts: [{ id: "signal", label: "測定値", kind: READOUT_KIND.SCALAR, valueField: "value" }],
      observations: [],
      questions: [
        question("independent_runs", "別々に始めた実験は何回ありますか？", [
          ["select", "選択してください"], ["three", "3回"], ["four", "4回"], ["five", "5回"], ["six_plus", "6回以上"], ["unknown", "不明"],
        ], ["three", "four", "five", "six_plus"]),
        question("source_split", "同じ実験回の材料を4条件へ分けましたか？", [
          ["select", "選択してください"], ["split", "分けた"], ["separate", "条件ごとに独立して準備した"], ["unknown", "不明"],
        ], ["split", "separate"]),
      ],
    },
    demo(model) {
      const counts = [4, 7, 5, 3];
      return model.conditionCells.flatMap((cell, conditionIndex) => Array.from({ length: counts[conditionIndex] }, (_, rowIndex) => ({
        id: `independent-${conditionIndex + 1}-${rowIndex + 1}`,
        conditionCellId: cell.id,
        readoutId: "signal",
        entityId: `${cell.label}-${rowIndex + 1}`,
        fields: { value: 10 + conditionIndex * 4.5 + rowIndex * 0.8 },
      })));
    },
  },
  time: {
    title: "同じ対象の経時測定",
    rowLabel: "処理",
    rows: [{ id: "vehicle", label: "Vehicle" }, { id: "stimulus", label: "Stimulus" }],
    columns: singleColumn,
    help: "処理条件だけをここに示します。測定時点は、各条件の中で値を得た方法として入力表へ反映します。",
    defaultPattern: "same_entity_sequence",
    patternCandidates: ["same_entity_sequence", "distinct_entity_sequence"],
    axisValues: ["0分", "5分", "15分", "30分", "60分"],
    fixture: {
      fixtureId: "same-cell-time-course",
      conditionCells: gridFixture({ rows: [{ id: "vehicle", label: "Vehicle" }, { id: "stimulus", label: "Stimulus" }], columns: singleColumn }),
      readouts: [{ id: "fluorescence", label: "蛍光強度", kind: READOUT_KIND.SCALAR, valueField: "value" }],
      observations: [],
      questions: [
        question("independent_series", "別々に始めた追跡系列は何回ありますか？", [
          ["select", "選択してください"], ["three", "3回"], ["four", "4回"], ["five", "5回"], ["six_plus", "6回以上"], ["unknown", "不明"],
        ], ["three", "four", "five", "six_plus"]),
        question("dropout", "途中から測定できなくなった対象について、理由を記録できますか？", [
          ["select", "選択してください"], ["none", "途中消失はない"], ["recorded", "理由を記録できる"], ["not_recorded", "理由は記録できない"], ["unknown", "不明"],
        ], ["none", "recorded", "not_recorded"]),
      ],
    },
    demo(model) {
      const records = [];
      let id = 0;
      for (const [conditionIndex, cell] of model.conditionCells.entries()) {
        for (let track = 1; track <= 3; track += 1) {
          const times = track === 3 ? templateDefinitions.time.axisValues.slice(0, 3) : templateDefinitions.time.axisValues;
          for (const [timeIndex, time] of times.entries()) {
            id += 1;
            records.push({
              id: `time-demo-${id}`,
              conditionCellId: cell.id,
              readoutId: "fluorescence",
              entityId: `${cell.label}-Cell-${track}`,
              fields: { time, value: 8 + conditionIndex * 3 + track + timeIndex * (conditionIndex ? 2.2 : 0.4) },
            });
          }
        }
      }
      return records;
    },
  },
  microscopy: {
    title: "dish内のCell測定",
    rowLabel: "dishの処理",
    rows: [{ id: "vehicle", label: "Vehicle" }, { id: "drug", label: "Drug" }],
    columns: singleColumn,
    help: "dishへの処理条件を示します。dish内の視野数やCell数は、次の観測パターンで保持します。",
    defaultPattern: "nested_records",
    patternCandidates: ["nested_records", "one_per_record"],
    axisValues: [],
    fixture: {
      fixtureId: "dish-field-cell",
      conditionCells: gridFixture({ rows: [{ id: "vehicle", label: "Vehicle" }, { id: "drug", label: "Drug" }], columns: singleColumn }),
      readouts: [{ id: "cell_area", label: "Cell area", kind: READOUT_KIND.SCALAR, valueField: "value" }],
      observations: [],
      questions: [
        question("independent_cultures", "別々に始めた培養実験は何回ありますか？", [
          ["select", "選択してください"], ["three", "3回"], ["four", "4回"], ["five", "5回"], ["six_plus", "6回以上"], ["unknown", "不明"],
        ], ["three", "four", "five", "six_plus"]),
        question("dish_source", "VehicleとDrugのdishは、同じ元の培養から分けましたか？", [
          ["select", "選択してください"], ["split", "同じ元の培養から分けた"], ["separate", "別々に準備した"], ["unknown", "不明"],
        ], ["split", "separate"]),
      ],
    },
    demo(model) {
      const records = [];
      let id = 0;
      for (const [conditionIndex, cell] of model.conditionCells.entries()) {
        for (let dish = 1; dish <= 2; dish += 1) {
          for (let field = 1; field <= 2; field += 1) {
            const cellCount = 2 + ((conditionIndex + dish + field) % 3);
            for (let cellIndex = 1; cellIndex <= cellCount; cellIndex += 1) {
              id += 1;
              records.push({
                id: `micro-demo-${id}`,
                conditionCellId: cell.id,
                readoutId: "cell_area",
                entityId: `${cell.label}-Dish-${dish}`,
                fields: { dish: `Dish-${dish}`, field: `F${field}`, cell: `C${cellIndex}`, value: 115 + conditionIndex * 18 + dish * 4 + field * 3 + cellIndex * 2 },
              });
            }
          }
        }
      }
      return records;
    },
  },
};

const DEFAULT_GUIDE_ANSWERS = Object.freeze({
  schemaVersion: GUIDED_ENTRY_VERSION,
  experimentLabel: "薬剤処理によるシグナル変化",
  dimensions: [{ label: "処理", kind: "nominal", valuesText: "Control\nDrug" }],
  combinationAnswer: "all_performed",
  measurement: { label: "シグナル強度", form: "scalar" },
  observation: { shape: "unknown", sequenceIdentity: "unknown", identityKind: "unknown", axisValuesText: "" },
});

const initialGuidedBuild = buildGuidedPrototypeDefinition(DEFAULT_GUIDE_ANSWERS);
if (initialGuidedBuild.status !== "ready") throw new Error("default guided entry must build a condition canvas");
templateDefinitions.custom = initialGuidedBuild.definition;

const initialResearchContextIngress = researchContextIngress(
  new URLSearchParams(window.location.search).get("context"),
);

const appState = {
  template: "custom",
  intent: "graph",
  entryMode: initialResearchContextIngress.entryMode,
  researchContext: initialResearchContextIngress.researchContext,
  workspaceView: "design",
  measurementViews: Object.fromEntries(
    Object.keys(templateDefinitions).map((key) => [key, MEASUREMENT_VIEW_MODE.COMPACT]),
  ),
  guideAnswers: null,
  nextObservationId: 1,
  selectedPatterns: Object.fromEntries(Object.entries(templateDefinitions).map(([key, value]) => [key, value.defaultPattern])),
  mappingConflicts: Object.fromEntries(Object.keys(templateDefinitions).map((key) => [key, null])),
  observationGuideIssues: Object.fromEntries(Object.keys(templateDefinitions).map((key) => [key, null])),
  canvasReady: Object.fromEntries(Object.keys(templateDefinitions).map((key) => [key, key !== "custom"])),
  observationReady: Object.fromEntries(Object.entries(templateDefinitions).map(([key, value]) => [key, !value.observationPending])),
  selectedAnalysisScopes: Object.fromEntries(Object.keys(templateDefinitions).map((key) => [key, null])),
  statisticsAnswersByScope: Object.fromEntries(Object.keys(templateDefinitions).map((key) => [key, {}])),
  models: Object.fromEntries(Object.entries(templateDefinitions).map(([key, value]) => [key, createPrototypeState(value.fixture)])),
  directConditionGrid: createSpreadsheetGrid({
    rowCount: 6,
    columnCount: 4,
    cells: [["条件", "", "", ""]],
  }),
  guideLevelGrids: {
    1: createSpreadsheetGrid({ rowCount: 10, columnCount: 6 }),
    2: createSpreadsheetGrid({ rowCount: 10, columnCount: 6 }),
  },
  guideLevelModes: { 1: "simple", 2: "simple" },
  relatedValueGrid: createSpreadsheetGrid({ rowCount: 3, columnCount: 1 }),
  hierarchyLevelGrid: createSpreadsheetGrid({ rowCount: 1, columnCount: 1 }),
  designDisclosureByTemplate: Object.fromEntries(Object.keys(templateDefinitions).map((key) => [key, {
    expandedStep: key === "custom" ? "conditions" : "flow",
    conditionAcknowledged: key !== "custom",
  }])),
  hierarchyExpandedByTemplate: Object.fromEntries(Object.entries(templateDefinitions).map(([key, value]) => [
    key,
    Array.isArray(value.nestedLevels) && value.nestedLevels.length > 1,
  ])),
};

const $ = (selector) => document.querySelector(selector);
const $$ = (selector) => [...document.querySelectorAll(selector)];

function escapeHtml(value) {
  return String(value).replace(/[&<>"']/g, (char) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[char]);
}

function spreadsheetColumnLabel(index) {
  let value = index + 1;
  let label = "";
  while (value > 0) {
    value -= 1;
    label = String.fromCharCode(65 + (value % 26)) + label;
    value = Math.floor(value / 26);
  }
  return label;
}

function directGridCellLabel(rowIndex, columnIndex) {
  if (rowIndex === 0 && columnIndex === 0) return "行方向の条件名または表の左上見出し";
  if (rowIndex === 0) return `${columnIndex}つ目の列条件名`;
  if (columnIndex === 0) return `${rowIndex}つ目の行条件名`;
  return `${rowIndex}行目、${columnIndex}列目の組み合わせの実施状態`;
}

function directGridPlaceholder(rowIndex, columnIndex) {
  if (rowIndex === 0 && columnIndex === 0) return "例：siRNA";
  if (rowIndex === 0) return columnIndex === 1 ? "例：Dox −" : columnIndex === 2 ? "例：Dox +" : "列条件";
  if (columnIndex === 0) return rowIndex === 1 ? "例：control" : rowIndex === 2 ? "例：Gene A #1" : "行条件";
  return "実施 / 最初からなし / 不明";
}

function focusDirectGridCell(rowIndex, columnIndex) {
  requestAnimationFrame(() => {
    const cell = document.querySelector(`[data-direct-grid-row="${rowIndex}"][data-direct-grid-column="${columnIndex}"]`);
    cell?.focus();
    cell?.select();
  });
}

function renderDirectConditionGrid(focus = null) {
  const table = $("#direct-condition-grid");
  if (!table) return;
  const grid = appState.directConditionGrid;
  const coordinateHeaders = Array.from({ length: grid.columnCount }, (_unused, index) => `<th scope="col" class="sheet-coordinate">${spreadsheetColumnLabel(index)}</th>`).join("");
  const rows = grid.cells.map((row, rowIndex) => {
    const cells = row.map((value, columnIndex) => {
      const roleClass = rowIndex === 0 || columnIndex === 0 ? " sheet-heading-cell" : " sheet-status-cell";
      return `<td class="sheet-edit-cell${roleClass}"><input class="spreadsheet-input" data-direct-grid-row="${rowIndex}" data-direct-grid-column="${columnIndex}" aria-label="${escapeHtml(directGridCellLabel(rowIndex, columnIndex))}" placeholder="${escapeHtml(directGridPlaceholder(rowIndex, columnIndex))}" value="${escapeHtml(value)}" autocomplete="off" spellcheck="false"></td>`;
    }).join("");
    return `<tr><th scope="row" class="sheet-coordinate">${rowIndex + 1}</th>${cells}</tr>`;
  }).join("");
  table.innerHTML = `<thead><tr><th class="sheet-corner" aria-hidden="true"></th>${coordinateHeaders}</tr></thead><tbody>${rows}</tbody>`;
  $$('[data-direct-grid-row][data-direct-grid-column]').forEach((input) => {
    input.addEventListener("input", () => {
      appState.directConditionGrid = setSpreadsheetCell(
        appState.directConditionGrid,
        Number(input.dataset.directGridRow),
        Number(input.dataset.directGridColumn),
        input.value.replace(/[\r\n]+/g, " "),
      );
    });
    input.addEventListener("paste", (event) => {
      const text = event.clipboardData?.getData("text/plain");
      if (text == null) return;
      event.preventDefault();
      const rowIndex = Number(input.dataset.directGridRow);
      const columnIndex = Number(input.dataset.directGridColumn);
      const result = applyTabDelimitedPaste(appState.directConditionGrid, {
        startRow: rowIndex,
        startColumn: columnIndex,
        text,
      });
      appState.directConditionGrid = result.grid;
      $("#direct-grid-status").textContent = `${result.range.rowCount}行 × ${result.range.columnCount}列を貼り付けました。条件表を確定するまでは現在の実験データを変更しません。`;
      renderDirectConditionGrid({ rowIndex, columnIndex });
    });
    input.addEventListener("keydown", (event) => {
      if (event.isComposing || event.key === "Process") return;
      const rowIndex = Number(input.dataset.directGridRow);
      const columnIndex = Number(input.dataset.directGridColumn);
      let next = null;
      if (event.key === "ArrowUp") next = [Math.max(0, rowIndex - 1), columnIndex];
      else if (event.key === "ArrowDown" || event.key === "Enter") next = [Math.min(appState.directConditionGrid.rowCount - 1, rowIndex + 1), columnIndex];
      else if (event.key === "ArrowLeft" && input.selectionStart === 0 && input.selectionEnd === 0) next = [rowIndex, Math.max(0, columnIndex - 1)];
      else if (event.key === "ArrowRight" && input.selectionStart === input.value.length && input.selectionEnd === input.value.length) next = [rowIndex, Math.min(appState.directConditionGrid.columnCount - 1, columnIndex + 1)];
      if (!next) return;
      event.preventDefault();
      focusDirectGridCell(next[0], next[1]);
    });
  });
  if (focus) focusDirectGridCell(focus.rowIndex, focus.columnIndex);
}

function directGridExtent() {
  const grid = appState.directConditionGrid;
  const usedRows = Array.from({ length: grid.rowCount - 1 }, (_unused, index) => index + 1)
    .filter((rowIndex) => grid.cells[rowIndex][0].trim());
  const usedColumns = Array.from({ length: grid.columnCount - 1 }, (_unused, index) => index + 1)
    .filter((columnIndex) => grid.cells[0][columnIndex].trim());
  return { usedRows, usedColumns };
}

function updateDirectGridStatuses(value) {
  const { usedRows, usedColumns } = directGridExtent();
  const status = $("#direct-grid-status");
  if (!usedRows.length || !usedColumns.length) {
    status.textContent = "先に1行目と1列目へ条件名を入力してください。";
    return;
  }
  let next = appState.directConditionGrid;
  for (const rowIndex of usedRows) {
    for (const columnIndex of usedColumns) next = setSpreadsheetCell(next, rowIndex, columnIndex, value);
  }
  appState.directConditionGrid = next;
  status.textContent = value ? `${usedRows.length * usedColumns.length}個の組み合わせを「実施」にしました。個別セルはそのまま書き換えられます。` : "組み合わせの状態を空欄（不明）へ戻しました。条件名は残しています。";
  renderDirectConditionGrid();
}

function directConditionMatrixText() {
  let grid = appState.directConditionGrid;
  if (!grid.cells[0][0].trim()) {
    grid = setSpreadsheetCell(grid, 0, 0, $("#direct-row-label").value.trim() || "条件");
  }
  return serializeSpreadsheetGrid(grid, {
    trimTrailingEmptyRows: true,
    trimTrailingEmptyColumns: true,
  });
}

function focusGuideLevelCell(dimensionNumber, rowIndex, columnIndex, { select = true } = {}) {
  requestAnimationFrame(() => {
    const cell = document.querySelector(`[data-guide-level-dimension="${dimensionNumber}"][data-guide-level-row="${rowIndex}"][data-guide-level-column="${columnIndex}"]`);
    cell?.focus();
    if (select) cell?.select();
    else cell?.setSelectionRange?.(cell.value.length, cell.value.length);
  });
}

function guideLevelGridText(dimensionNumber) {
  const grid = appState.guideLevelGrids[dimensionNumber];
  if (appState.guideLevelModes[dimensionNumber] === "simple") {
    return grid.cells.map((row) => row[0].trim()).filter(Boolean).join("\n");
  }
  const lines = [];
  for (const row of grid.cells) {
    const group = row[0].trim();
    const members = row.slice(1).map((value) => value.trim()).filter(Boolean);
    if (group && members.length) lines.push(`${group}: ${members.join(", ")}`);
    else if (group) lines.push(group);
    else lines.push(...members);
  }
  return lines.join("\n");
}

function guideLevelGridEntries(dimensionNumber) {
  const grid = appState.guideLevelGrids[dimensionNumber];
  if (appState.guideLevelModes[dimensionNumber] === "simple") {
    return grid.cells
      .map((row) => row[0].trim())
      .filter(Boolean)
      .map((label) => ({ label, groupLabel: null }));
  }
  const entries = [];
  for (const row of grid.cells) {
    const groupLabel = row[0].trim();
    const members = row.slice(1).map((value) => value.trim()).filter(Boolean);
    if (members.length) {
      for (const label of members) entries.push({ label, groupLabel: groupLabel || null });
    } else if (groupLabel) {
      // A row left over from the simple view remains a concrete condition.
      entries.push({ label: groupLabel, groupLabel: null });
    }
  }
  return entries;
}

function setGuideLevelMode(dimensionNumber, nextMode) {
  const entries = guideLevelGridEntries(dimensionNumber);
  const grouped = nextMode === "grouped";
  const rows = grouped
    ? entries.map((entry) => [entry.groupLabel ?? "", entry.label])
    : entries.map((entry) => [entry.groupLabel ? `${entry.groupLabel} ${entry.label}` : entry.label]);
  appState.guideLevelModes[dimensionNumber] = grouped ? "grouped" : "simple";
  appState.guideLevelGrids[dimensionNumber] = createSpreadsheetGrid({
    rowCount: Math.max(10, rows.length + 1),
    columnCount: 6,
    cells: rows,
  });
  syncGuideLevelText(dimensionNumber);
  renderGuideLevelGrid(dimensionNumber, { rowIndex: 0, columnIndex: grouped ? 1 : 0 });
}

function syncGuideLevelText(dimensionNumber) {
  const legacy = $(`#guide-dimension-${dimensionNumber}-values`);
  if (legacy) legacy.value = guideLevelGridText(dimensionNumber);
}

function renderGuideLevelGrid(dimensionNumber, focus = null) {
  const table = $(`#guide-dimension-${dimensionNumber}-grid`);
  if (!table) return;
  const grid = appState.guideLevelGrids[dimensionNumber];
  const grouped = appState.guideLevelModes[dimensionNumber] === "grouped";
  table.dataset.mode = grouped ? "grouped" : "simple";
  table.closest(".compact-sheet")?.classList.toggle("simple-level-shell", !grouped);
  const toggle = $(`[data-guide-toggle-level-groups="${dimensionNumber}"]`);
  const addColumn = $(`[data-guide-add-level-column="${dimensionNumber}"]`);
  const addRow = $(`[data-guide-add-level-row="${dimensionNumber}"]`);
  const help = $(`[data-guide-level-help="${dimensionNumber}"]`);
  if (toggle) {
    toggle.textContent = grouped ? "通常の一覧へ戻す" : "枝分かれを追加";
    toggle.setAttribute("aria-pressed", String(grouped));
  }
  addColumn?.classList.toggle("hidden", !grouped);
  if (addRow) addRow.textContent = grouped ? "＋ まとめ行" : "＋ 条件";
  if (help) help.textContent = grouped
    ? "左にまとめ名、右に具体的な条件を入力します。例：Gene A｜#1｜#2｜#3。末尾へ入力すると行・列が増えます。"
    : "1行に1条件。Enterで次の行へ進み、末尾まで入力すると行が増えます。Excelからも貼り付けられます。";
  const lastUsedRow = grid.cells.reduce((last, row, index) => row.some((value) => value.trim()) ? index : last, -1);
  const lastUsedColumn = grid.cells.reduce((last, row) => Math.max(last, row.reduce((rowLast, value, index) => value.trim() ? index : rowLast, -1)), -1);
  const visibleRowCount = Math.min(grid.rowCount, Math.max(grouped ? 8 : 10, lastUsedRow + 2, (focus?.rowIndex ?? -1) + 1));
  const visibleColumns = grouped
    ? Math.min(grid.columnCount, Math.max(5, lastUsedColumn + 2, (focus?.columnIndex ?? -1) + 1))
    : 1;
  const rows = grid.cells.slice(0, visibleRowCount).map((row, rowIndex) => `<tr><th scope="row" class="sheet-coordinate">${rowIndex + 1}</th>${row.slice(0, visibleColumns).map((value, columnIndex) => {
    const label = grouped
      ? (columnIndex === 0 ? `${rowIndex + 1}行目のまとめ名（任意）` : `${rowIndex + 1}行目の具体的な条件 ${columnIndex}`)
      : `${rowIndex + 1}行目の条件`;
    const placeholder = grouped
      ? (columnIndex === 0 ? (rowIndex === 0 ? "例：Gene A" : "") : (rowIndex === 0 && columnIndex === 1 ? "例：#1" : ""))
      : (rowIndex === 0 ? "例：Control" : rowIndex === 1 ? "例：Drug" : "");
    return `<td class="sheet-edit-cell${grouped && columnIndex === 0 ? " sheet-group-cell" : ""}"><input class="spreadsheet-input" data-guide-level-dimension="${dimensionNumber}" data-guide-level-row="${rowIndex}" data-guide-level-column="${columnIndex}" aria-label="${escapeHtml(label)}" placeholder="${escapeHtml(placeholder)}" value="${escapeHtml(value)}" autocomplete="off" spellcheck="false"></td>`;
  }).join("")}</tr>`).join("");
  const headers = grouped
    ? `<th scope="col">まとめ名</th>${Array.from({ length: visibleColumns - 1 }, (_unused, index) => `<th scope="col">具体的な条件 ${index + 1}</th>`).join("")}`
    : '<th scope="col">条件</th>';
  table.innerHTML = `<thead><tr><th class="sheet-corner" aria-hidden="true"></th>${headers}</tr></thead><tbody>${rows}</tbody>`;
  $$(`[data-guide-level-dimension="${dimensionNumber}"]`).forEach((input) => {
    input.addEventListener("input", () => {
      const rowIndex = Number(input.dataset.guideLevelRow);
      const columnIndex = Number(input.dataset.guideLevelColumn);
      const nextValue = input.value.replace(/[\r\n]+/g, " ");
      let nextGrid = setSpreadsheetCell(appState.guideLevelGrids[dimensionNumber], rowIndex, columnIndex, nextValue);
      const visibleInputs = $$(`[data-guide-level-dimension="${dimensionNumber}"]`);
      const lastVisibleRow = Math.max(...visibleInputs.map((item) => Number(item.dataset.guideLevelRow)));
      const lastVisibleColumn = Math.max(...visibleInputs.map((item) => Number(item.dataset.guideLevelColumn)));
      const needsRow = Boolean(nextValue.trim()) && rowIndex === lastVisibleRow;
      const needsColumn = grouped && Boolean(nextValue.trim()) && columnIndex === lastVisibleColumn;
      if (needsRow || needsColumn) {
        nextGrid = createSpreadsheetGrid({
          rowCount: Math.max(nextGrid.rowCount, rowIndex + (needsRow ? 5 : 1)),
          columnCount: Math.max(nextGrid.columnCount, columnIndex + (needsColumn ? 4 : 1)),
          cells: nextGrid.cells,
        });
      }
      appState.guideLevelGrids[dimensionNumber] = nextGrid;
      syncGuideLevelText(dimensionNumber);
      if (needsRow || needsColumn) renderGuideLevelGrid(dimensionNumber, { rowIndex, columnIndex, select: false });
    });
    input.addEventListener("paste", (event) => {
      const text = event.clipboardData?.getData("text/plain");
      if (text == null) return;
      event.preventDefault();
      const rowIndex = Number(input.dataset.guideLevelRow);
      const columnIndex = Number(input.dataset.guideLevelColumn);
      if (!grouped) {
        const values = parseTabDelimitedText(text).cells.flat().map((value) => value.trim()).filter(Boolean);
        let next = createSpreadsheetGrid({
          rowCount: Math.max(appState.guideLevelGrids[dimensionNumber].rowCount, rowIndex + values.length + 1),
          columnCount: appState.guideLevelGrids[dimensionNumber].columnCount,
          cells: appState.guideLevelGrids[dimensionNumber].cells,
        });
        values.forEach((value, index) => { next = setSpreadsheetCell(next, rowIndex + index, 0, value); });
        appState.guideLevelGrids[dimensionNumber] = next;
      } else {
        const result = applyTabDelimitedPaste(appState.guideLevelGrids[dimensionNumber], { startRow: rowIndex, startColumn: columnIndex, text });
        appState.guideLevelGrids[dimensionNumber] = createSpreadsheetGrid({
          rowCount: Math.max(result.grid.rowCount, result.range.endRow + 2),
          columnCount: Math.max(result.grid.columnCount, result.range.endColumn + 2),
          cells: result.grid.cells,
        });
      }
      syncGuideLevelText(dimensionNumber);
      renderGuideLevelGrid(dimensionNumber, { rowIndex, columnIndex });
    });
    input.addEventListener("keydown", (event) => {
      if (event.isComposing || event.key === "Process") return;
      const rowIndex = Number(input.dataset.guideLevelRow);
      const columnIndex = Number(input.dataset.guideLevelColumn);
      let next = null;
      if (event.key === "ArrowUp") next = [Math.max(0, rowIndex - 1), columnIndex];
      else if (event.key === "ArrowDown" || event.key === "Enter") next = [Math.min(appState.guideLevelGrids[dimensionNumber].rowCount - 1, rowIndex + 1), columnIndex];
      else if (grouped && event.key === "ArrowLeft" && input.selectionStart === 0 && input.selectionEnd === 0) next = [rowIndex, Math.max(0, columnIndex - 1)];
      else if (grouped && event.key === "ArrowRight" && input.selectionStart === input.value.length && input.selectionEnd === input.value.length) next = [rowIndex, Math.min(appState.guideLevelGrids[dimensionNumber].columnCount - 1, columnIndex + 1)];
      if (!next) return;
      event.preventDefault();
      focusGuideLevelCell(dimensionNumber, next[0], next[1]);
    });
  });
  if (focus) focusGuideLevelCell(dimensionNumber, focus.rowIndex, focus.columnIndex, { select: focus.select !== false });
}

function levelGridFromText(valuesText, mode = "grouped") {
  const rows = String(valuesText ?? "").replace(/\r/g, "").split("\n").map((line) => line.trim()).filter(Boolean).map((line) => {
    if (mode === "simple") return [line];
    const separator = line.search(/[:：]/);
    if (separator < 0) return ["", line];
    const group = line.slice(0, separator).trim();
    const members = line.slice(separator + 1).split(/[、,\t]/).map((value) => value.trim()).filter(Boolean);
    return [group, ...members];
  });
  return createSpreadsheetGrid({ rowCount: Math.max(10, rows.length + 1), columnCount: Math.max(6, ...rows.map((row) => row.length), 2), cells: rows });
}

function relatedValueText() {
  const visibleInputs = $$('[data-related-row]');
  if (visibleInputs.length) return visibleInputs.map((input) => input.value.trim()).filter(Boolean).join("\n");
  return appState.relatedValueGrid.cells.map((row) => row[0].trim()).filter(Boolean).join("\n");
}

function focusRelatedCell(rowIndex) {
  requestAnimationFrame(() => {
    const input = document.querySelector(`[data-related-row="${rowIndex}"]`);
    input?.focus();
    input?.select();
  });
}

function renderRelatedValueGrid(focusRow = null) {
  const table = $("#guide-related-grid");
  if (!table) return;
  const lastUsedRow = appState.relatedValueGrid.cells.reduce((last, row, index) => row[0].trim() ? index : last, -1);
  const visibleRowCount = Math.min(appState.relatedValueGrid.rowCount, Math.max(3, lastUsedRow + 2, (focusRow ?? -1) + 1));
  const rows = appState.relatedValueGrid.cells.slice(0, visibleRowCount).map((row, rowIndex) => `<tr><th scope="row" class="sheet-coordinate">${rowIndex + 1}</th><td class="sheet-edit-cell"><input class="spreadsheet-input" data-related-row="${rowIndex}" aria-label="${rowIndex + 1}つ目の元の測定値" placeholder="${rowIndex === 0 ? "例：pERK" : rowIndex === 1 ? "例：total ERK" : "元の値"}" value="${escapeHtml(row[0])}" autocomplete="off"></td></tr>`).join("");
  table.innerHTML = `<thead><tr><th class="sheet-corner" aria-hidden="true"></th><th scope="col">元の測定値</th></tr></thead><tbody>${rows}</tbody>`;
  $$('[data-related-row]').forEach((input) => {
    input.addEventListener("input", () => {
      appState.relatedValueGrid = setSpreadsheetCell(appState.relatedValueGrid, Number(input.dataset.relatedRow), 0, input.value.replace(/[\r\n]+/g, " "));
    });
    input.addEventListener("paste", (event) => {
      const text = event.clipboardData?.getData("text/plain");
      if (text == null) return;
      event.preventDefault();
      const rowIndex = Number(input.dataset.relatedRow);
      const result = applyTabDelimitedPaste(appState.relatedValueGrid, { startRow: rowIndex, startColumn: 0, text });
      appState.relatedValueGrid = result.grid;
      renderRelatedValueGrid(rowIndex);
    });
    input.addEventListener("keydown", (event) => {
      if (event.isComposing || event.key !== "Enter") return;
      event.preventDefault();
      focusRelatedCell(Math.min(appState.relatedValueGrid.rowCount - 1, Number(input.dataset.relatedRow) + 1));
    });
  });
  if (focusRow != null) focusRelatedCell(focusRow);
}

function hierarchyLevelText() {
  return appState.hierarchyLevelGrid.cells[0].map((value) => value.trim()).filter(Boolean).join(", ");
}

function syncHierarchyLevelText() {
  $("#nested-child-labels").value = hierarchyLevelText();
}

function setHierarchyLevelText(text) {
  const values = String(text ?? "").split(/[、,\t\n]/).map((value) => value.trim()).filter(Boolean);
  appState.hierarchyLevelGrid = createSpreadsheetGrid({
    rowCount: 1,
    columnCount: Math.max(1, values.length + (values.length ? 1 : 0)),
    cells: [values],
  });
  syncHierarchyLevelText();
}

function focusHierarchyLevelCell(columnIndex) {
  requestAnimationFrame(() => {
    const input = document.querySelector(`[data-hierarchy-column="${columnIndex}"]`);
    input?.focus();
    input?.select();
  });
}

function renderHierarchyLevelGrid(focusColumn = null) {
  const table = $("#hierarchy-level-grid");
  if (!table) return;
  const outerLabel = $("#nested-parent-label").value.trim() || "（最初の試料・対象）";
  const headers = appState.hierarchyLevelGrid.cells[0].map((_value, index) => `<th scope="col">次の段階 ${index + 1}</th>`).join("");
  const cells = appState.hierarchyLevelGrid.cells[0].map((value, columnIndex) => `<td class="sheet-edit-cell"><input class="spreadsheet-input" data-hierarchy-column="${columnIndex}" aria-label="測定値までの${columnIndex + 1}つ目の段階" placeholder="${columnIndex === 0 ? "例：視野" : columnIndex === 1 ? "例：Cell" : "次のID"}" value="${escapeHtml(value)}" autocomplete="off" spellcheck="false"></td>`).join("");
  table.innerHTML = `<thead><tr><th scope="col">最初に区別</th>${headers}</tr></thead><tbody><tr><th scope="row" class="sheet-fixed-value" id="hierarchy-outer-value">${escapeHtml(outerLabel)}</th>${cells}</tr></tbody>`;
  $$('[data-hierarchy-column]').forEach((input) => {
    input.addEventListener("input", () => {
      appState.hierarchyLevelGrid = setSpreadsheetCell(appState.hierarchyLevelGrid, 0, Number(input.dataset.hierarchyColumn), input.value.replace(/[\r\n]+/g, " "));
      syncHierarchyLevelText();
      scheduleNestedGuide();
    });
    input.addEventListener("paste", (event) => {
      const text = event.clipboardData?.getData("text/plain");
      if (text == null) return;
      event.preventDefault();
      const pasted = parseTabDelimitedText(text);
      const values = pasted.columnCount === 1 && pasted.rowCount > 1
        ? pasted.cells.map((row) => row[0])
        : pasted.cells[0];
      const startColumn = Number(input.dataset.hierarchyColumn);
      let next = createSpreadsheetGrid({
        rowCount: 1,
        columnCount: Math.max(appState.hierarchyLevelGrid.columnCount, startColumn + values.length),
        cells: appState.hierarchyLevelGrid.cells,
      });
      values.forEach((value, index) => { next = setSpreadsheetCell(next, 0, startColumn + index, value); });
      appState.hierarchyLevelGrid = next;
      syncHierarchyLevelText();
      renderHierarchyLevelGrid(startColumn);
      scheduleNestedGuide();
    });
    input.addEventListener("keydown", (event) => {
      if (event.isComposing || event.key === "Process") return;
      const columnIndex = Number(input.dataset.hierarchyColumn);
      let next = null;
      if (event.key === "ArrowLeft" && input.selectionStart === 0 && input.selectionEnd === 0) next = Math.max(0, columnIndex - 1);
      else if ((event.key === "ArrowRight" && input.selectionStart === input.value.length && input.selectionEnd === input.value.length) || event.key === "Enter") next = Math.min(appState.hierarchyLevelGrid.columnCount - 1, columnIndex + 1);
      if (next == null) return;
      event.preventDefault();
      focusHierarchyLevelCell(next);
    });
  });
  if (focusColumn != null) focusHierarchyLevelCell(focusColumn);
}

function renderHierarchyDisclosure() {
  const layout = $("#observation-layout")?.value ?? "unknown";
  const requiredByLayout = ["multiple_inside", "combined"].includes(layout);
  const expanded = requiredByLayout || Boolean(appState.hierarchyExpandedByTemplate[appState.template]);
  const hasLevels = Boolean(hierarchyLevelText());
  $("#hierarchy-guide").classList.toggle("hidden", !expanded);
  $("#show-hierarchy-guide").classList.toggle("hidden", expanded || requiredByLayout);
  $("#hide-hierarchy-guide").classList.toggle("hidden", requiredByLayout);
  $("#show-hierarchy-guide").setAttribute("aria-expanded", String(expanded));
  $("#show-hierarchy-guide").textContent = hasLevels
    ? "視野・CellなどのIDを編集"
    : "＋ 視野・Cellなどを区別して残す";
}

function definition() { return templateDefinitions[appState.template]; }
function model() { return appState.models[appState.template]; }
function patternId() { return appState.selectedPatterns[appState.template]; }
function pattern() {
  const base = observationPatterns[patternId()];
  if (!["nested_records", "nested_sequence"].includes(patternId())) return base;
  const levels = nestedLevelDefinitions();
  if (patternId() === "nested_sequence") {
    return {
      ...base,
      surface: `${levels.map((level) => level.label).join("・")}を固定し、${definition().axisLabel ?? "時点"}を横へ並べる表`,
      summary: `${levels.map((level) => level.label).join(" → ")}を区別したまま、同じ測定対象を${definition().axisLabel ?? "時点"}に沿って追跡します。空欄は0に変換しません。`,
    };
  }
  return {
    ...base,
    surface: `${levels.map((level) => level.label).join("・")}を残す表`,
    summary: `${levels[0].label}ごとに、${levels.slice(1).map((level) => level.label).join("、")}のIDを各行に残します。測定数が揃っていなくても、そのまま保持します。`,
  };
}
function readout() { return model().readouts[0]; }
function conditionById(id) { return model().conditionCells.find((cell) => cell.id === id); }
function meaningful(observation) {
  if (observation.placeholder === true) return false;
  return Boolean(observation.entityId) || Object.values(observation.fields ?? {}).some((value) => value !== "" && value != null);
}
function mappingConflict() { return appState.mappingConflicts[appState.template]; }
function observationGuideIssue() { return appState.observationGuideIssues[appState.template]; }
function present(value) { return value !== "" && value != null; }

function readoutFieldSpecs() {
  if (readout().kind === READOUT_KIND.POSITIVE_TOTAL) {
    return [
      { key: readout().numeratorField ?? "positive", label: "陽性数" },
      { key: readout().denominatorField ?? "total", label: "総数" },
    ];
  }
  if (readout().kind === READOUT_KIND.RELATED_VALUES) return readout().fields ?? [];
  return [{ key: readout().valueField ?? "value", label: readout().label }];
}

function blankReadoutFields(extra = {}) {
  return { ...extra, ...Object.fromEntries(readoutFieldSpecs().map((field) => [field.key, ""])) };
}

function nestedLevelDefinitions() {
  const configured = definition().nestedLevels;
  if (Array.isArray(configured) && configured.length >= 2) return configured;
  return [
    { key: "dish", label: "dish / 親ID" },
    { key: "field", label: "視野ID" },
    { key: "cell", label: "Cell / ROI ID" },
  ];
}

function coordinateConflicts() {
  const valueFields = readoutFieldSpecs().map((field) => field.key);
  return findObservationCoordinateConflicts(model().observations, {
    patternId: mappingConflict()?.from ?? patternId(),
    valueFields,
  });
}

function mappingCompleteFor(targetPattern) {
  const records = model().observations.filter(meaningful);
  if (!records.length) return true;
  if (targetPattern === "typed_record") return records.every((item) => present(item.fields?.positive) && present(item.fields?.total));
  if (["nested_records", "nested_sequence"].includes(targetPattern)) {
    const baseReady = records.every((item) => {
    const hierarchyReady = nestedLevelDefinitions().every((level) => present(item.fields?.[level.key]));
    const measurementReady = readoutFieldSpecs().some((field) => present(item.fields?.[field.key]));
      return hierarchyReady && measurementReady && (targetPattern !== "nested_sequence" || present(item.fields?.time));
    });
    if (!baseReady || targetPattern !== "nested_sequence") return baseReady;
    const timesByEntity = new Map();
    for (const item of records) {
      const key = `${item.conditionCellId}|${item.entityId}`;
      if (!timesByEntity.has(key)) timesByEntity.set(key, new Set());
      timesByEntity.get(key).add(String(item.fields.time));
    }
    return [...timesByEntity.values()].some((times) => times.size > 1);
  }
  if (targetPattern === "same_entity_sequence") {
    if (!records.every((item) => present(item.entityId) && present(item.fields?.time))) return false;
    const timesByEntity = new Map();
    for (const item of records) {
      if (!timesByEntity.has(item.entityId)) timesByEntity.set(item.entityId, new Set());
      timesByEntity.get(item.entityId).add(String(item.fields.time));
    }
    return [...timesByEntity.values()].some((times) => times.size > 1);
  }
  if (targetPattern === "distinct_entity_sequence") {
    if (!records.every((item) => present(item.entityId) && present(item.fields?.time))) return false;
    const timeByEntity = new Map();
    for (const item of records) {
      const time = String(item.fields.time);
      if (timeByEntity.has(item.entityId) && timeByEntity.get(item.entityId) !== time) return false;
      timeByEntity.set(item.entityId, time);
    }
    return true;
  }
  if (["same_entity_conditions", "matched_source_conditions"].includes(targetPattern)) {
    if (!records.every((item) => present(item.entityId))) return false;
    const conditionsByEntity = new Map();
    for (const item of records) {
      if (!conditionsByEntity.has(item.entityId)) conditionsByEntity.set(item.entityId, new Set());
      conditionsByEntity.get(item.entityId).add(item.conditionCellId);
    }
    return [...conditionsByEntity.values()].some((conditions) => conditions.size > 1);
  }
  return records.every((item) => readoutFieldSpecs().some((field) => present(item.fields?.[field.key])));
}

function newObservation(conditionCellId, fields = {}, entityId = "", placeholder = false) {
  let id;
  do {
    id = `${appState.template}-record-${appState.nextObservationId++}`;
  } while (model().observations.some((observation) => observation.id === id));
  return {
    id,
    conditionCellId,
    readoutId: readout().id,
    entityId,
    fields,
    placeholder,
  };
}

function setModel(next) { appState.models[appState.template] = next; }
function addRecord(record) { setModel(upsertObservation(model(), record)); }

function disclosureState(key = appState.template) {
  if (!appState.designDisclosureByTemplate[key]) {
    appState.designDisclosureByTemplate[key] = {
      expandedStep: appState.canvasReady[key] ? (appState.observationReady[key] ? "flow" : "canvas") : "conditions",
      conditionAcknowledged: Boolean(appState.canvasReady[key] && key !== "custom"),
    };
  }
  return appState.designDisclosureByTemplate[key];
}

function conditionStatusCounts() {
  const conditions = model().conditionCells;
  return {
    performed: conditions.filter((cell) => cell.status === CONDITION_STATUS.PERFORMED).length,
    absent: conditions.filter((cell) => cell.status === CONDITION_STATUS.NOT_PERFORMED_BY_DESIGN).length,
    unknown: conditions.filter((cell) => cell.status === CONDITION_STATUS.UNKNOWN).length,
  };
}

function conditionDefinitionSummary() {
  if (!appState.canvasReady[appState.template]) return "まだ入力していません";
  const dimensions = definition().dimensionMetadata ?? [];
  const conditions = dimensions.length
    ? dimensions.map((dimension) => `${dimension.label} ${dimension.values?.length ?? 0}条件`).join(" × ")
    : "1条件";
  return `${conditions} · ${readout().label}`;
}

function conditionCanvasSummary() {
  if (!appState.canvasReady[appState.template]) return "条件を入力すると表示します";
  const { performed, absent, unknown } = conditionStatusCounts();
  const parts = [`${performed}組を実施`];
  if (absent) parts.push(`${absent}組は最初からなし`);
  if (unknown) parts.push(`${unknown}組は未確認`);
  return parts.join(" · ");
}

function observationDefinitionSummary() {
  if (!appState.canvasReady[appState.template]) return "条件表の確認後に回答します";
  if (!disclosureState().conditionAcknowledged) return "条件表を確認すると回答できます";
  if (!appState.observationReady[appState.template] || observationGuideIssue() || mappingConflict()) return "試料・対象のつながりを回答中";
  const flow = definition().materialFlow;
  const levels = Array.isArray(definition().nestedLevels)
    ? definition().nestedLevels.map((level) => level.label)
    : (flow?.outerLabel ? [flow.outerLabel] : []);
  const path = levels.length ? levels.join(" → ") : (flow?.outerLabel ?? "試料・対象");
  const axis = definition().axisValues?.length
    ? ` · ${definition().axisLabel ?? "時間・位置"} ${definition().axisValues.length}点`
    : "";
  return `${path}${axis} · ${readout().label}`;
}

function focusWithoutScroll(target) {
  requestAnimationFrame(() => target?.focus?.({ preventScroll: true }));
}

function revealWithPreferredMotion(target, block = "center") {
  target?.scrollIntoView?.({
    behavior: window.matchMedia?.("(prefers-reduced-motion: reduce)").matches ? "auto" : "smooth",
    block,
  });
}

function renderDesignDisclosure() {
  const state = disclosureState();
  const canvasReady = Boolean(appState.canvasReady[appState.template]);
  const { unknown } = conditionStatusCounts();
  const progress = deriveDesignProgress({
    expandedStep: state.expandedStep,
    canvasReady,
    conditionAcknowledged: state.conditionAcknowledged,
    unknownConditionCount: unknown,
    observationReady: appState.observationReady[appState.template],
    hasObservationIssue: Boolean(observationGuideIssue()),
    hasMappingConflict: Boolean(mappingConflict()),
  });
  state.expandedStep = progress.expandedStep;
  state.conditionAcknowledged = progress.conditionAcknowledged;

  const orderedSteps = ["conditions", "canvas", "flow"];
  const activeIndex = orderedSteps.indexOf(progress.expandedStep);
  const nextStep = orderedSteps.find((step, index) => index > activeIndex && progress.steps[step] !== "complete") ?? null;
  const stageStatusCopy = {
    current: "現在",
    complete: "完了",
    next: "次",
    pending: "未開始",
  };

  for (const [step, progressState] of Object.entries(progress.steps)) {
    const card = document.querySelector(`[data-progress-step="${step}"]`);
    const content = card?.querySelector(".step-active-content");
    const summary = card?.querySelector(".step-summary-row");
    if (!card || !content || !summary) continue;
    card.dataset.progressState = progressState;
    const active = progressState === "active";
    card.classList.remove("stage-hidden");
    content.toggleAttribute("inert", !active);
    content.setAttribute("aria-hidden", String(!active));
    summary.setAttribute("aria-expanded", String(active));
    summary.disabled = progressState === "upcoming";
    const summaryAction = summary.querySelector(".step-summary-edit");
    if (summaryAction) summaryAction.textContent = progressState === "complete" ? "修正" : progressState === "available" ? "開く" : "";

    const stageButton = document.querySelector(`[data-design-stage="${step}"]`);
    if (stageButton) {
      const available = step === "conditions"
        || (step === "canvas" && canvasReady)
        || (step === "flow" && canvasReady && progress.conditionAcknowledged);
      stageButton.disabled = !available;
      stageButton.classList.toggle("active", active);
      stageButton.classList.toggle("complete", progressState === "complete");
      stageButton.setAttribute("aria-pressed", String(active));
      const stageStatus = active ? "current" : progressState === "complete" ? "complete" : step === nextStep ? "next" : "pending";
      const stageStatusNode = stageButton.querySelector(".design-stage-state");
      const stageLabel = stageButton.querySelector(".design-stage-label")?.textContent?.trim() ?? step;
      stageButton.dataset.stageStatus = stageStatus;
      if (stageStatusNode) stageStatusNode.textContent = stageStatusCopy[stageStatus];
      stageButton.setAttribute("aria-label", `${stageLabel}、${stageStatusCopy[stageStatus]}`);
      if (active) stageButton.setAttribute("aria-current", "step");
      else stageButton.removeAttribute("aria-current");
    }
  }

  $("#conditions-step-summary-copy").textContent = conditionDefinitionSummary();
  $("#canvas-step-summary-copy").textContent = conditionCanvasSummary();
  $("#flow-step-summary-copy").textContent = observationDefinitionSummary();
  for (const [step, progressState] of Object.entries(progress.steps)) {
    const stateNode = $(`#${step}-step-summary-state`);
    if (!stateNode) continue;
    stateNode.textContent = progressState === "active" ? "現在" : progressState === "complete" ? "完了" : step === nextStep ? "次" : progressState === "available" ? "回答待ち" : "未開始";
  }

  const continueButton = $("#continue-to-observation");
  const reviewStatus = $("#condition-review-status");
  continueButton.disabled = !progress.canContinueFromCanvas;
  reviewStatus.textContent = unknown
    ? `「まだ不明」が${unknown}組あります。実施したか、最初から行わなかったかを選んでください。`
    : "違う組み合わせがあれば表のセルを押して修正できます。";
}

function expandDesignStep(step, focusSelector = null) {
  const state = disclosureState();
  if (step === "canvas" && !appState.canvasReady[appState.template]) return;
  if (step === "flow" && !state.conditionAcknowledged) return;
  state.expandedStep = step;
  renderDesignDisclosure();
  if (focusSelector) focusWithoutScroll($(focusSelector));
}

function renderCanvas() {
  const current = definition();
  const card = $(".canvas-card");
  const ready = appState.canvasReady[appState.template];
  card.dataset.state = ready ? "ready" : "pending";
  card.setAttribute("aria-disabled", String(!ready));
  const hasUnknown = ready && model().conditionCells.some((cell) => cell.status === CONDITION_STATUS.UNKNOWN);
  $("#canvas-bulk-actions").classList.toggle("hidden", !hasUnknown);
  if (!ready) {
    $("#canvas-help").textContent = "上の質問に答えるか、条件表を貼り付けると、ここに実際の組み合わせを表示します。";
    $("#condition-table").innerHTML = `<tbody><tr><td class="empty-surface">まだ条件表を作っていません。</td></tr></tbody>`;
    return;
  }
  $("#canvas-help").textContent = current.help;
  const cellMap = new Map(model().conditionCells.map((cell) => [`${cell.rowId}|${cell.columnId}`, cell]));
  const head = `<thead><tr><th scope="col">${escapeHtml(current.rowLabel)}</th>${current.columns.map((column) => `<th scope="col">${escapeHtml(column.displayLabel ?? column.label)}</th>`).join("")}</tr></thead>`;
  let previousGroup = null;
  const rows = [];
  for (const row of current.rows) {
    if (row.groupLabel && row.groupLabel !== previousGroup) {
      rows.push(`<tr class="condition-group-row"><th colspan="${current.columns.length + 1}" scope="rowgroup">${escapeHtml(row.groupLabel)}（まとめ見出し・測定値は混ぜません）</th></tr>`);
    }
    previousGroup = row.groupLabel ?? null;
    const cells = current.columns.map((column) => {
      const cell = cellMap.get(`${row.id}|${column.id}`);
      if (!cell) return `<td><span class="guide-result error">対応する条件を安全に特定できません</span></td>`;
      const copy = STATUS_COPY[cell.status];
      return `<td class="condition-sheet-td"><button type="button" id="condition-${escapeHtml(cell.id)}" class="condition-sheet-state" data-condition-id="${escapeHtml(cell.id)}" data-state="${escapeHtml(cell.status)}" aria-label="${escapeHtml(cell.label)}：${escapeHtml(copy.label)}。押すと次の状態へ切り替えます"><span aria-hidden="true">${escapeHtml(copy.symbol)}</span><strong>${escapeHtml(copy.label)}</strong></button></td>`;
    }).join("");
    rows.push(`<tr><th scope="row">${escapeHtml(row.displayLabel ?? row.label)}</th>${cells}</tr>`);
  }
  const body = `<tbody>${rows.join("")}</tbody>`;
  $("#condition-table").innerHTML = head + body;
  $$('.condition-sheet-state[data-condition-id]').forEach((button) => button.addEventListener("click", () => {
    const cell = conditionById(button.dataset.conditionId);
    const currentIndex = STATUS_ORDER.indexOf(cell.status);
    const nextStatus = STATUS_ORDER[(currentIndex + 1) % STATUS_ORDER.length];
    setModel(setConditionStatus(model(), cell.id, nextStatus));
    disclosureState().conditionAcknowledged = false;
    disclosureState().expandedStep = "canvas";
    appState.selectedAnalysisScopes[appState.template] = null;
    renderAll();
    focusWithoutScroll(document.querySelector(`[data-condition-id="${CSS.escape(cell.id)}"]`));
  }));
}

function setAllConditionStatuses(status) {
  let next = model();
  for (const cell of next.conditionCells) next = setConditionStatus(next, cell.id, status);
  setModel(next);
  disclosureState().conditionAcknowledged = false;
  disclosureState().expandedStep = "canvas";
  appState.selectedAnalysisScopes[appState.template] = null;
  renderAll();
}

function renderPatternPicker() {
  const canvasReady = appState.canvasReady[appState.template];
  $(".observation-card").dataset.state = canvasReady ? "ready" : "pending";
  $(".observation-card").setAttribute("aria-disabled", String(!canvasReady));
  $("#observation-shape").disabled = !canvasReady;
  $("#sequence-identity").disabled = !canvasReady;
  $("#sequence-values").disabled = !canvasReady;
  ["#nested-parent-label", "#outer-unit-count", "#source-relation", "#nested-child-labels", "#has-sequence-axis", "#add-sequence-axis", "#remove-sequence-axis", "#sequence-axis-label", "#sequence-axis-unit"].forEach((selector) => {
    $(selector).disabled = !canvasReady;
  });
  $$('[data-hierarchy-column]').forEach((input) => { input.disabled = !canvasReady; });
  $("#hierarchy-add-level").disabled = !canvasReady;
  renderObservationQuestionVisibility();
  const selected = patternId();
  $("#pattern-picker").toggleAttribute("inert", !canvasReady);
  $("#pattern-picker").innerHTML = definition().patternCandidates.map((id) => {
    const option = observationPatterns[id];
    return `<button type="button" class="pattern-option" role="radio" aria-checked="${id === selected}" tabindex="${id === selected ? "0" : "-1"}" data-pattern-id="${id}"${canvasReady ? "" : " disabled"}><span aria-hidden="true">${id === selected ? "●" : "○"}</span><span><strong>${escapeHtml(option.title)}</strong><small>${escapeHtml(option.detail)}</small></span></button>`;
  }).join("");
  const observationResolved = canvasReady && appState.observationReady[appState.template];
  $("#pattern-badge").textContent = !canvasReady ? "条件表待ち" : observationResolved ? pattern().surface : "回答待ち";
  const retainedCount = model().observations.filter(meaningful).length;
  const conflictCopy = mappingConflict()
    ? " 新しい形へはまだ対応付けていません。元の解釈を保持したまま、必要なID・列を確認します。"
    : "";
  $("#pattern-summary").textContent = observationResolved
    ? `${pattern().summary}${retainedCount ? ` 入力済みデータ${retainedCount}件は、表示を切り替えても削除しません。` : ""}${conflictCopy}`
    : canvasReady ? "回答後に、どの列を持つ入力表になるかをここへ表示します。" : "まず条件表を作ってください。";
  const patternButtons = $$('[data-pattern-id]');
  const activatePattern = (id) => {
    selectObservationPattern(id);
    focusWithoutScroll(document.querySelector(`[data-pattern-id="${CSS.escape(id)}"]`));
  };
  patternButtons.forEach((button, index) => {
    button.addEventListener("click", () => activatePattern(button.dataset.patternId));
    button.addEventListener("keydown", (event) => {
      const lastIndex = patternButtons.length - 1;
      let nextIndex = null;
      if (["ArrowRight", "ArrowDown"].includes(event.key)) nextIndex = index === lastIndex ? 0 : index + 1;
      else if (["ArrowLeft", "ArrowUp"].includes(event.key)) nextIndex = index === 0 ? lastIndex : index - 1;
      else if (event.key === "Home") nextIndex = 0;
      else if (event.key === "End") nextIndex = lastIndex;
      if (nextIndex == null) return;
      event.preventDefault();
      activatePattern(patternButtons[nextIndex].dataset.patternId);
    });
  });
}

function selectObservationPattern(nextPattern) {
  if (!observationPatterns[nextPattern]) return;
  if (["same_entity_sequence", "distinct_entity_sequence", "nested_sequence"].includes(nextPattern) && (definition().axisValues?.length ?? 0) < 2) {
    $("#observation-guide-result").dataset.state = "error";
    $("#observation-guide-result").textContent = "時点・位置を2つ以上入力してから、この入力表を使えます。";
    return;
  }
  if (["nested_records", "nested_sequence"].includes(nextPattern) && (!Array.isArray(definition().nestedLevels) || definition().nestedLevels.length < 2)) {
    $("#observation-guide-result").dataset.state = "error";
    $("#observation-guide-result").textContent = "測定値の由来となる試料・対象と、そこから区別するものを入力してから、この入力表を使えます。";
    return;
  }
  // Placeholders are only display affordances; researcher-entered records are
  // retained and force an explicit remapping decision when the surface changes.
  setModel({ ...model(), observations: model().observations.filter(researcherMeaningful) });
  const previous = appState.selectedPatterns[appState.template];
  if (previous !== nextPattern && model().observations.some(meaningful)) {
    appState.mappingConflicts[appState.template] = { from: previous, to: nextPattern };
  } else if (previous === nextPattern || !model().observations.some(meaningful)) {
    appState.mappingConflicts[appState.template] = null;
  }
  appState.selectedPatterns[appState.template] = nextPattern;
  appState.observationReady[appState.template] = true;
  appState.observationGuideIssues[appState.template] = null;
  appState.selectedAnalysisScopes[appState.template] = null;
  syncObservationControls();
  renderWorkspaceView();
  renderPatternPicker();
  renderDataTable();
  renderSummary();
  renderGraph();
  renderQuestions();
  updateReadiness();
  renderDesignDisclosure();
}

function meaningfulOrExample(observation) {
  return meaningful(observation) || observation.provenance?.sourceKind === "prototype_example";
}

function researcherMeaningful(observation) {
  return meaningful(observation) && observation.provenance?.sourceKind !== "prototype_example";
}

function observationControlsFor(patternName) {
  const configuredLevels = Array.isArray(definition().nestedLevels) ? definition().nestedLevels : [];
  const levels = configuredLevels.length >= 2 ? configuredLevels : (["nested_records", "nested_sequence"].includes(patternName) ? nestedLevelDefinitions() : []);
  const materialFlow = definition().materialFlow ?? {};
  const common = {
    observationLayout: "one_each",
    sequenceIdentity: "unknown",
    sourceLinkage: ["existing_id", "enter_together", "irrecoverable"].includes(materialFlow.linkageAvailability)
      ? materialFlow.linkageAvailability
      : "unknown",
    sourceRelation: materialFlow.sourceRelation ?? "separate",
    nestedParentLabel: materialFlow.outerLabel ?? levels[0]?.label ?? "",
    nestedChildLabels: levels.slice(1).map((level) => level.label).join(", "),
    outerCount: materialFlow.outerCount ?? "",
    hasSequence: false,
  };
  if (patternName === "same_entity_conditions") return { ...common, sourceRelation: "literal_same_entity", sourceLinkage: materialFlow.linkageAvailability ?? "enter_together" };
  if (patternName === "matched_source_conditions") return { ...common, sourceRelation: "shared_source_separate_samples", sourceLinkage: materialFlow.linkageAvailability ?? "enter_together" };
  if (patternName === "nested_records") return { ...common, observationLayout: "multiple_inside" };
  if (patternName === "same_entity_sequence") return { ...common, observationLayout: "sequence", hasSequence: true, sequenceIdentity: "same" };
  if (patternName === "distinct_entity_sequence") return { ...common, observationLayout: "sequence", hasSequence: true, sequenceIdentity: "different" };
  if (patternName === "nested_sequence") return { ...common, observationLayout: "combined", hasSequence: true, sequenceIdentity: "same" };
  return common;
}

function setObservationFollowupVisibility() {
  const layout = $("#observation-layout")?.value ?? "unknown";
  const hasSequence = ["sequence", "combined"].includes(layout);
  $("#has-sequence-axis").checked = hasSequence;
  $("#sequence-guide").classList.toggle("hidden", !hasSequence);
  $("#add-sequence-axis")?.classList.add("hidden");
  $("#add-sequence-axis")?.setAttribute("aria-expanded", String(hasSequence));
  $(".observation-guide")?.classList.toggle("sequence-expanded", hasSequence);
  renderHierarchyDisclosure();
}

function updateObservationSourceCopy() {
  const source = $("#nested-parent-label")?.value.trim() || "試料・対象";
  const layoutSource = $("#observation-layout-source");
  const hierarchySource = $("#hierarchy-source-label");
  if (layoutSource) layoutSource.textContent = `1つの${source}`;
  if (hierarchySource) hierarchySource.textContent = source;
}

function renderObservationQuestionVisibility() {
  const canvasReady = Boolean(appState.canvasReady[appState.template]);
  const hasSource = Boolean($("#nested-parent-label").value.trim());
  const needsRelation = canvasReady && model().conditionCells.length > 1;
  const sourceRelation = $("#source-relation").value;
  const relationResolved = !needsRelation || !["unknown", "mixed"].includes(sourceRelation);
  const needsLinkage = ["literal_same_entity", "shared_source_separate_samples"].includes(sourceRelation);
  const sourceLinkage = $("#source-linkage").value;
  const linkageResolved = !needsLinkage || ["existing_id", "enter_together"].includes(sourceLinkage);
  const layout = $("#observation-layout")?.value ?? "unknown";
  const layoutResolved = layout !== "unknown";
  const visible = {
    source: canvasReady,
    relation: canvasReady && hasSource && needsRelation,
    linkage: canvasReady && hasSource && relationResolved && needsLinkage,
    layout: canvasReady && hasSource && relationResolved && linkageResolved,
    hierarchy: canvasReady && hasSource && relationResolved && linkageResolved && layoutResolved && ["multiple_inside", "combined"].includes(layout),
    axis: canvasReady && hasSource && relationResolved && linkageResolved && layoutResolved && ["sequence", "combined"].includes(layout),
  };
  const visibleSteps = [];
  $(".observation-guide").dataset.relationVisible = String(visible.relation);
  $(".observation-guide").dataset.linkageVisible = String(visible.linkage);
  $(".observation-guide").dataset.layoutVisible = String(visible.layout);
  $(".observation-guide").dataset.hierarchyVisible = String(visible.hierarchy);
  $(".observation-guide").dataset.axisVisible = String(visible.axis);
  $$('[data-flow-question]').forEach((step) => {
    const show = Boolean(visible[step.dataset.flowQuestion]);
    step.classList.toggle("hidden", !show);
    step.toggleAttribute("inert", !show);
    if (show) visibleSteps.push(step);
  });
  visibleSteps.forEach((step, index) => {
    const number = step.querySelector(".flow-number");
    if (number) number.textContent = String(index + 1);
  });
}

function nestedLevelsFromGuide() {
  const parent = $("#nested-parent-label").value.trim();
  const children = $("#nested-child-labels").value
    .split(/[、,\t\n]/)
    .map((value) => value.trim())
    .filter(Boolean);
  if (!parent) return null;
  return buildNestedLevels([parent, ...children]);
}

function observationGuideAnswer() {
  const levels = nestedLevelsFromGuide();
  const layout = $("#observation-layout")?.value ?? "unknown";
  const hasSequence = ["sequence", "combined"].includes(layout);
  const sourceRelation = $("#source-relation").value;
  const sourceLinkage = $("#source-linkage").value;
  const identityKind = sourceRelation === "literal_same_entity"
    ? "literal_same_entity"
    : sourceRelation === "shared_source_separate_samples"
      ? "shared_source_separate_samples"
      : "same_type_only";
  const shape = deriveObservationGuideShape({
    sourceLabel: levels?.[0]?.label ?? "",
    layout,
  });
  return { shape, identityKind, sequenceIdentity: $("#sequence-identity").value, levels, sourceRelation, sourceLinkage, hasSequence, layout };
}

function withDisplayUnit(value, unit) {
  const cleanValue = String(value ?? "").trim();
  const cleanUnit = String(unit ?? "").trim();
  if (!cleanUnit || cleanValue.toLocaleLowerCase().endsWith(cleanUnit.toLocaleLowerCase())) return cleanValue;
  return `${cleanValue} ${cleanUnit}`;
}

function syncObservationControls() {
  const values = appState.observationReady[appState.template]
    ? observationControlsFor(patternId())
    : { observationLayout: "unknown", sequenceIdentity: "unknown", sourceLinkage: "unknown", sourceRelation: "unknown", nestedParentLabel: "", nestedChildLabels: "", outerCount: "", hasSequence: false };
  $("#sequence-identity").value = values.sequenceIdentity;
  $("#source-linkage").value = values.sourceLinkage;
  $("#source-relation").value = values.sourceRelation;
  $("#observation-layout").value = values.observationLayout;
  $("#nested-parent-label").value = values.nestedParentLabel;
  setHierarchyLevelText(values.nestedChildLabels);
  if (values.nestedChildLabels) appState.hierarchyExpandedByTemplate[appState.template] = true;
  renderHierarchyLevelGrid();
  renderHierarchyDisclosure();
  $("#outer-unit-count").value = values.outerCount;
  $("#has-sequence-axis").checked = values.hasSequence;
  $("#sequence-axis-label").value = definition().axisLabel ?? "";
  $("#sequence-axis-unit").value = definition().axisUnit ?? "";
  $("#sequence-values").value = definition().axisRawValues?.join(", ") || definition().axisValues?.join(", ") || "";
  updateObservationSourceCopy();
  const currentAnswer = observationGuideAnswer();
  $("#observation-shape").value = currentAnswer.shape;
  $("#condition-identity-kind").value = currentAnswer.identityKind;
  setObservationFollowupVisibility();
  renderObservationQuestionVisibility();
  const result = $("#observation-guide-result");
  result.dataset.state = appState.observationReady[appState.template] ? "ready" : "pending";
  result.textContent = appState.observationReady[appState.template]
    ? `回答から「${pattern().title}」の入力表を生成しました。`
    : "ここを回答すると、条件表の1マスに合う入力表を自動生成します。";
}

function applyObservationGuide() {
  const result = $("#observation-guide-result");
  const answer = observationGuideAnswer();
  $("#observation-shape").value = answer.shape;
  $("#condition-identity-kind").value = answer.identityKind;
  setObservationFollowupVisibility();
  renderObservationQuestionVisibility();
  const hasRetainedData = model().observations.some(meaningful);
  const stopWithoutChanging = (message, state = "pending", issue = null) => {
    appState.observationReady[appState.template] = hasRetainedData;
    appState.observationGuideIssues[appState.template] = hasRetainedData ? (issue ?? { status: "needs_information" }) : null;
    result.dataset.state = state;
    result.textContent = `${message}${hasRetainedData ? " 現在の入力表・値・Graphは保持します。" : ""}`;
    renderWorkspaceView();
    renderDataTable();
    renderSummary();
    updateReadiness();
    renderDesignDisclosure();
  };
  if (!answer.levels?.[0]?.label) {
    stopWithoutChanging("まず、同じ条件を複数回行ったときに別々に処置を受けた対象・試料を入力してください。例：culture dish、mouse、独立に調製したsample。共有するDonorや調製元は次の質問で別に記録します。", "pending", { questionId: "ASK_OUTER_UNIT" });
    return;
  }
  const outerCount = $("#outer-unit-count").value.trim();
  if (outerCount && (!Number.isInteger(Number(outerCount)) || Number(outerCount) < 1)) {
    stopWithoutChanging("個数は1以上の整数にするか、空欄のまま後でIDを貼り付けてください。", "error", { questionId: "ASK_OUTER_COUNT" });
    return;
  }
  const conditionCount = model().conditionCells.length;
  if (conditionCount > 1 && answer.sourceRelation === "unknown") {
    stopWithoutChanging("最初に区別した試料・対象を、各実験条件へどう使ったか選んでください。ここで表の行の対応が変わります。", "pending", { questionId: "ASK_SOURCE_RELATION" });
    return;
  }
  if (answer.sourceRelation === "mixed") {
    stopWithoutChanging("複数の材料の使い方が混ざるため、1つの対応表へ推測でまとめません。材料の流れを分けて記録できる拡張が必要です。", "error", { status: "safe_unsupported", questionId: "ASK_SOURCE_RELATION" });
    return;
  }
  const linkage = evaluateSourceLinkage(answer);
  if (linkage.status === "needs_information") {
    stopWithoutChanging("条件間で同じ対象・元材料を、IDで対応できるか、これから同じ行へ入力して対応を保てるか選んでください。", "pending", linkage);
    return;
  }
  if (linkage.status === "safe_unsupported") {
    stopWithoutChanging(`${linkage.message} 元データは保持し、対応関係が必要な入力表の生成を停止します。`, "error", linkage);
    return;
  }
  if (answer.shape === "unknown") {
    stopWithoutChanging(`1つの${answer.levels[0].label}・1条件から、値を1つ得たか、複数のCell・視野・時点などを得たか選んでください。`, "pending", { questionId: "ASK_RECORD_SHAPE" });
    return;
  }
  if (answer.shape === "multiple_inside" || answer.shape === "combined") {
    if ((answer.levels?.length ?? 0) < 2) {
      stopWithoutChanging("測定値までに区別して記録するものを、材料の流れに沿って1つ以上入力してください。例：dish → 視野 → Cell。", "pending", { questionId: "ASK_NESTED_LEVEL_NAMES" });
      return;
    }
  }
  const rawAxisValues = answer.hasSequence
    ? $("#sequence-values").value.split(/[、,\t\n]/).map((value) => value.trim()).filter(Boolean)
    : [];
  if (answer.hasSequence && rawAxisValues.length < 2) {
    stopWithoutChanging("時点・位置を2つ以上入力してください。途中の欠測は、入力表で空欄のまま残せます。", "error", { questionId: "ASK_AXIS_VALUES" });
    return;
  }
  const mapped = mapObservationGuide(answer, readout().kind);
  if (mapped.status !== "ready") {
    const message = mapped.status === "safe_unsupported"
      ? mapped.message
      : mapped.questionId === "ASK_SEQUENCE_IDENTITY"
        ? "同じ対象を続けて測ったか、時点ごとに別の試料を回収したか選んでください。"
        : "入力表の意味を決める実験上の事実が不足しています。";
    stopWithoutChanging(message, mapped.status === "safe_unsupported" ? "error" : "pending", mapped);
    return;
  }
  let nextLevels = answer.levels;
  if (["nested_records", "nested_sequence"].includes(mapped.patternId)) {
    const currentLevels = nestedLevelDefinitions();
    if (model().observations.some(meaningful) && currentLevels.length !== nextLevels.length) {
      stopWithoutChanging("入力済みデータの階層数と異なるため、自動変更しません。", "pending", { questionId: "ASK_NESTED_LEVEL_REMAP" });
      return;
    }
    nextLevels = model().observations.some(meaningful)
      ? nextLevels.map((level, index) => ({ ...level, key: currentLevels[index].key }))
      : nextLevels;
  }
  const axisUnit = answer.hasSequence ? $("#sequence-axis-unit").value.trim() : "";
  const axisValues = rawAxisValues.map((value) => withDisplayUnit(value, axisUnit));
  templateDefinitions[appState.template] = {
    ...definition(),
    materialFlow: {
      outerLabel: answer.levels[0].label,
      outerCount: outerCount ? Number(outerCount) : null,
      sourceRelation: conditionCount > 1 ? answer.sourceRelation : (answer.sourceRelation === "unknown" ? "separate" : answer.sourceRelation),
      linkageAvailability: ["literal_same_entity", "shared_source_separate_samples"].includes(answer.sourceRelation)
        ? answer.sourceLinkage
        : "not_applicable",
    },
    nestedLevels: nextLevels?.length > 1 ? nextLevels : undefined,
    axisLabel: answer.hasSequence ? ($("#sequence-axis-label").value.trim() || "時点・順序") : null,
    axisUnit: answer.hasSequence ? axisUnit : null,
    axisRawValues: rawAxisValues,
    axisValues,
    patternCandidates: definition().patternCandidates.includes(mapped.patternId)
      ? definition().patternCandidates
      : [...definition().patternCandidates, mapped.patternId],
  };
  result.dataset.state = "ready";
  result.textContent = `回答から「${observationPatterns[mapped.patternId].title}」の入力表を生成します。入力した材料の流れは表のID列に残します。`;
  selectObservationPattern(mapped.patternId);
}

function activeConditionCells() { return model().conditionCells.filter((cell) => cell.status === CONDITION_STATUS.PERFORMED); }

function inputCell(observation, field, label, value = observation.fields?.[field] ?? "", text = false, disabled = false) {
  return `<input class="data-input spreadsheet-data-input${text ? " text-input" : ""}" ${text ? "" : 'inputmode="decimal"'} data-sheet-editable data-observation-id="${escapeHtml(observation.id)}" data-field="${escapeHtml(field)}" aria-label="${escapeHtml(label)}" value="${escapeHtml(value)}"${disabled ? " disabled" : ""}>`;
}

function identityCell(observation, label = "対象ID", disabled = false) {
  return `<input class="data-input spreadsheet-data-input identity-input text-input" data-sheet-editable data-observation-id="${escapeHtml(observation.id)}" data-property="entityId" aria-label="${escapeHtml(label)}" value="${escapeHtml(observation.entityId ?? "")}"${disabled ? " disabled" : ""}>`;
}

function conditionStateText(cell) {
  const copy = STATUS_COPY[cell.status];
  return `<span class="condition-state-text" data-state="${escapeHtml(cell.status)}"><span aria-hidden="true">${escapeHtml(copy.symbol)}</span>${escapeHtml(copy.label)}</span>`;
}

function ensureLongStarterRows() {
  let next = model();
  const blankFields = patternId() === "nested_records"
    ? blankReadoutFields(Object.fromEntries(nestedLevelDefinitions().map((level) => [level.key, ""])))
    : blankReadoutFields();
  for (const cell of activeConditionCells()) {
    next = ensureConditionMeasurementRowCount(next, {
      conditionCellId: cell.id,
      readoutId: readout().id,
      minimumRowCount: 1,
      blankFields,
    });
  }
  setModel(next);
}

function ensureRepeatedStarterRows() {
  for (const cell of activeConditionCells()) {
    if (model().observations.some((observation) => observation.conditionCellId === cell.id)) continue;
    const entityId = `${cell.label}-1`;
    for (const time of definition().axisValues) {
      const measurementFields = blankReadoutFields();
      addRecord(newObservation(cell.id, { time, ...measurementFields }, entityId, true));
    }
  }
}

function ensureMatchedStarterRows() {
  if (model().observations.length) return;
  const entityId = "Subject-1";
  for (const cell of activeConditionCells()) {
    const fields = blankReadoutFields(patternId() === "matched_source_conditions" ? { sourceSampleId: "" } : {});
    addRecord(newObservation(cell.id, fields, entityId, true));
  }
}

function measurementHeaders() {
  const headers = readoutFieldSpecs().map((field) => field.label);
  if (readout().kind === READOUT_KIND.POSITIVE_TOTAL) headers.push("計算した陽性率");
  return headers;
}

function measurementAxisColumns() {
  return buildMeasurementAxisColumns(
    model().observations.filter((observation) => observation.readoutId === readout().id),
    {
      axisField: "time",
      declaredAxisValues: definition().axisValues ?? [],
    },
  );
}

function axisColumnHeading(column) {
  return column.declared
    ? escapeHtml(column.value)
    : `<span>${escapeHtml(column.value)}</span><small class="unexpected-axis-label">予定外・要確認</small>`;
}

function renderMeasurementCells(observation, labelPrefix, disabled = false) {
  const cells = readoutFieldSpecs().map((field) => inputCell(observation, field.key, `${labelPrefix} ${field.label}`.trim(), undefined, false, disabled));
  if (readout().kind === READOUT_KIND.POSITIVE_TOTAL) {
    const derived = deriveGraphDatum(observation, readout());
    const issue = describeMeasurementDerivationIssue(observation, readout());
    cells.push(`<span class="derived-result-stack"><span class="derived-value" data-derived-id="${escapeHtml(observation.id)}">${derived.ok ? `${derived.percent.toFixed(1)}%` : "—"}</span>${issue ? `<small class="derived-warning">${escapeHtml(issue.message)} Graph・Statisticsには使用しません。raw値は保持しています。</small>` : ""}</span>`);
  }
  return cells;
}

function renderLongObservationTable(kind) {
  ensureLongStarterRows();
  const nestedLevels = nestedLevelDefinitions();
  const valueHeaders = measurementHeaders();
  let headers = ["対象ID", ...valueHeaders];
  if (kind === "nested_records") headers = [...nestedLevels.map((level) => level.label), ...valueHeaders];
  else if (kind === "typed_record") headers = ["測定行の名前", ...valueHeaders];
  else if (kind === "distinct_entity_sequence") headers = [definition().axisLabel ?? "時点・順序", "試料ID", ...valueHeaders];
  const sheets = buildConditionMeasurementSheets(model(), { readoutId: readout().id });
  const body = sheets.groups.filter((group) => group.editable || group.rows.length).map((group) => {
    const cell = group.conditionCell;
    const addButton = group.editable
      ? `<button type="button" class="sheet-add-row" data-add-condition-row="${escapeHtml(cell.id)}">＋ 行</button>`
      : "";
    const groupHeader = `<tr class="measurement-condition-row"><th colspan="${headers.length}" scope="rowgroup"><span><strong>${escapeHtml(cell.label)}</strong>${conditionStateText(cell)}</span>${addButton}</th></tr>`;
    const rows = group.rows.map((observation) => {
      const disabled = !group.editable;
      let cells;
    if (kind === "nested_records") {
      const hierarchy = [
        ...nestedLevels.map((level, index) => inputCell(
          observation,
          level.key,
          level.label,
          observation.fields?.[level.key] ?? (index === 0 ? observation.entityId ?? "" : ""),
          true,
          disabled,
        )),
      ];
      cells = [...hierarchy, ...renderMeasurementCells(observation, readout().label, disabled)];
    } else if (kind === "typed_record") {
      cells = [identityCell(observation, "測定行の名前", disabled), ...renderMeasurementCells(observation, readout().label, disabled)];
    } else if (kind === "distinct_entity_sequence") {
      const prefix = [inputCell(observation, "time", definition().axisLabel ?? "時点または順序", undefined, true, disabled), identityCell(observation, "試料ID", disabled)];
      cells = [...prefix, ...renderMeasurementCells(observation, readout().label, disabled)];
    } else {
      cells = [identityCell(observation, "対象ID", disabled), ...renderMeasurementCells(observation, readout().label, disabled)];
    }
      return `<tr data-sheet-row data-sheet-mode="long" data-condition-id="${escapeHtml(cell.id)}" data-record-row="${escapeHtml(observation.id)}">${cells.map((content, columnIndex) => `<td class="${columnIndex === cells.length - 1 && content.includes("derived-value") ? "sheet-computed-cell" : "sheet-value-cell"}" data-sheet-cell="${columnIndex}">${content}</td>`).join("")}</tr>`;
    }).join("");
    return groupHeader + rows;
  }).join("");
  return `<thead><tr>${headers.map((header) => `<th scope="col">${escapeHtml(header)}</th>`).join("")}</tr></thead><tbody>${body}</tbody>`;
}

function renderCoordinateFieldStack(observations, field, label, disabled = false, text = false) {
  return `<div class="coordinate-stack${observations.length > 1 ? " has-conflict" : ""}">${observations.map((observation, index) => {
    const conflictLabel = observations.length > 1 ? `<small class="coordinate-conflict-label">重複 ${index + 1}/${observations.length}</small>` : "";
    return `<div class="coordinate-value">${conflictLabel}${inputCell(observation, field, label, undefined, text, disabled)}</div>`;
  }).join("")}</div>`;
}

function renderCoordinateDerivedStack(observations) {
  return `<div class="coordinate-stack${observations.length > 1 ? " has-conflict" : ""}">${observations.map((observation, index) => {
    const conflictLabel = observations.length > 1 ? `<small class="coordinate-conflict-label">重複 ${index + 1}/${observations.length}</small>` : "";
    const derived = deriveGraphDatum(observation, readout());
    const issue = describeMeasurementDerivationIssue(observation, readout());
    return `<div class="coordinate-value">${conflictLabel}<span class="derived-result-stack"><span class="derived-value" data-derived-id="${escapeHtml(observation.id)}">${derived.ok ? `${derived.percent.toFixed(1)}%` : "—"}</span>${issue ? `<small class="derived-warning">${escapeHtml(issue.message)} Graph・Statisticsには使用しません。raw値は保持しています。</small>` : ""}</span></div>`;
  }).join("")}</div>`;
}

function coordinateCellHtml(observations, label, startColumn, { disabled = false, createButton = "", includeSampleId = false } = {}) {
  const width = readoutFieldSpecs().length + (readout().kind === READOUT_KIND.POSITIVE_TOTAL ? 1 : 0) + (includeSampleId ? 1 : 0);
  if (!observations.length) {
    return createButton
      ? `<td class="sheet-value-cell sheet-empty-coordinate" data-sheet-cell="${startColumn}" colspan="${width}">${createButton}</td>`
      : `<td class="sheet-computed-cell" data-sheet-cell="${startColumn}" colspan="${width}">—</td>`;
  }
  let columnIndex = startColumn;
  const cells = [];
  if (includeSampleId) {
    cells.push(`<td class="sheet-value-cell" data-sheet-cell="${columnIndex}">${renderCoordinateFieldStack(observations, "sourceSampleId", `${label} 条件別試料ID`, disabled, true)}</td>`);
    columnIndex += 1;
  }
  for (const field of readoutFieldSpecs()) {
    cells.push(`<td class="sheet-value-cell" data-sheet-cell="${columnIndex}">${renderCoordinateFieldStack(observations, field.key, `${label} ${field.label}`, disabled)}</td>`);
    columnIndex += 1;
  }
  if (readout().kind === READOUT_KIND.POSITIVE_TOTAL) cells.push(`<td class="sheet-computed-cell" data-sheet-cell="${columnIndex}">${renderCoordinateDerivedStack(observations)}</td>`);
  return cells.join("");
}

function repeatedGroups() {
  ensureRepeatedStarterRows();
  const groups = new Map();
  for (const observation of model().observations.filter((item) => item.readoutId === readout().id)) {
    const key = `${observation.conditionCellId}|${observation.entityId || observation.id}`;
    if (!groups.has(key)) groups.set(key, { conditionCellId: observation.conditionCellId, entityId: observation.entityId, records: new Map() });
    const axisValue = String(observation.fields?.time ?? "");
    if (!groups.get(key).records.has(axisValue)) groups.get(key).records.set(axisValue, []);
    groups.get(key).records.get(axisValue).push(observation);
  }
  return [...groups.values()];
}

function renderRepeatedTable() {
  const groups = repeatedGroups();
  const axisColumns = measurementAxisColumns();
  const subheaders = measurementHeaders();
  const fieldWidth = subheaders.length;
  const header = fieldWidth > 1
    ? `<thead><tr><th scope="col" rowspan="2">条件</th><th scope="col" rowspan="2">追跡する対象ID</th>${axisColumns.map((column) => `<th scope="colgroup" colspan="${fieldWidth}"${column.declared ? "" : ' class="unexpected-axis-column"'}>${axisColumnHeading(column)}</th>`).join("")}</tr><tr>${axisColumns.map((column) => subheaders.map((label) => `<th scope="col"${column.declared ? "" : ' class="unexpected-axis-column"'}>${escapeHtml(label)}</th>`).join("")).join("")}</tr></thead>`
    : `<thead><tr><th scope="col">条件</th><th scope="col">追跡する対象ID</th>${axisColumns.map((column) => `<th scope="col"${column.declared ? "" : ' class="unexpected-axis-column"'}>${axisColumnHeading(column)}</th>`).join("")}</tr></thead>`;
  const groupedByCondition = new Map();
  for (const group of groups) {
    if (!groupedByCondition.has(group.conditionCellId)) groupedByCondition.set(group.conditionCellId, []);
    groupedByCondition.get(group.conditionCellId).push(group);
  }
  const visibleConditions = model().conditionCells.filter((cell) => cell.status === CONDITION_STATUS.PERFORMED || groupedByCondition.has(cell.id));
  const body = visibleConditions.map((cell) => {
    const conditionGroups = groupedByCondition.get(cell.id) ?? [];
    const disabled = cell.status !== CONDITION_STATUS.PERFORMED;
    return conditionGroups.map((group, rowIndex) => {
      const representative = group.records.values().next().value?.[0];
      const conditionHeading = rowIndex === 0
        ? `<th scope="rowgroup" rowspan="${conditionGroups.length}" class="measurement-condition-heading"><strong>${escapeHtml(cell.label)}</strong>${conditionStateText(cell)}${disabled ? "" : `<button type="button" class="sheet-add-row" data-add-repeated-row="${escapeHtml(cell.id)}">＋ 対象</button>`}</th>`
        : "";
      let columnIndex = 2;
      const valueCells = axisColumns.map((column) => {
        const observations = group.records.get(column.value) ?? [];
        const button = disabled || !column.declared ? "" : `<button class="quiet-button create-coordinate" type="button" data-condition-id="${escapeHtml(group.conditionCellId)}" data-entity-id="${escapeHtml(group.entityId)}" data-time="${escapeHtml(column.value)}" aria-label="${escapeHtml(`${cell.label}、追跡対象${rowIndex + 1}、${column.value}の測定欄を追加`)}">＋</button>`;
        const html = coordinateCellHtml(observations, `${group.entityId} ${column.value}`, columnIndex, { disabled, createButton: button });
        columnIndex += fieldWidth;
        return html;
      }).join("");
      return `<tr data-sheet-row data-sheet-mode="matrix" data-condition-id="${escapeHtml(cell.id)}">${conditionHeading}<td class="sheet-value-cell" data-sheet-cell="1">${identityCell(representative, "追跡する対象ID", disabled)}</td>${valueCells}</tr>`;
    }).join("");
  }).join("");
  return header + `<tbody>${body}</tbody>`;
}

function ensureNestedSequenceStarterRows() {
  for (const cell of activeConditionCells()) {
    if (model().observations.some((observation) => observation.conditionCellId === cell.id)) continue;
    const entityId = `${cell.id}-tracked-1`;
    const hierarchy = Object.fromEntries(nestedLevelDefinitions().map((level) => [level.key, ""]));
    for (const axisValue of definition().axisValues) addRecord(newObservation(cell.id, blankReadoutFields({ ...hierarchy, time: axisValue }), entityId, true));
  }
}

function nestedSequenceGroups() {
  ensureNestedSequenceStarterRows();
  const groups = new Map();
  for (const observation of model().observations.filter((item) => item.readoutId === readout().id)) {
    const entity = observation.entityId || observation.id;
    const key = `${observation.conditionCellId}|${entity}`;
    if (!groups.has(key)) groups.set(key, { conditionCellId: observation.conditionCellId, entityId: entity, records: new Map() });
    const axisValue = String(observation.fields?.time ?? "");
    if (!groups.get(key).records.has(axisValue)) groups.get(key).records.set(axisValue, []);
    groups.get(key).records.get(axisValue).push(observation);
  }
  return [...groups.values()];
}

function renderNestedSequenceTable() {
  const groups = nestedSequenceGroups();
  const axisColumns = measurementAxisColumns();
  const levels = nestedLevelDefinitions();
  const subheaders = measurementHeaders();
  const fieldWidth = subheaders.length;
  const fixedHeaders = levels.map((level) => `<th scope="col" rowspan="${fieldWidth > 1 ? 2 : 1}">${escapeHtml(level.label)}</th>`).join("");
  const header = fieldWidth > 1
    ? `<thead><tr><th scope="col" rowspan="2">条件</th>${fixedHeaders}${axisColumns.map((column) => `<th scope="colgroup" colspan="${fieldWidth}"${column.declared ? "" : ' class="unexpected-axis-column"'}>${axisColumnHeading(column)}</th>`).join("")}</tr><tr>${axisColumns.map((column) => subheaders.map((label) => `<th scope="col"${column.declared ? "" : ' class="unexpected-axis-column"'}>${escapeHtml(label)}</th>`).join("")).join("")}</tr></thead>`
    : `<thead><tr><th scope="col">条件</th>${fixedHeaders}${axisColumns.map((column) => `<th scope="col"${column.declared ? "" : ' class="unexpected-axis-column"'}>${axisColumnHeading(column)}</th>`).join("")}</tr></thead>`;
  const groupedByCondition = new Map();
  for (const group of groups) {
    if (!groupedByCondition.has(group.conditionCellId)) groupedByCondition.set(group.conditionCellId, []);
    groupedByCondition.get(group.conditionCellId).push(group);
  }
  const visibleConditions = model().conditionCells.filter((cell) => cell.status === CONDITION_STATUS.PERFORMED || groupedByCondition.has(cell.id));
  const body = visibleConditions.map((cell) => {
    const conditionGroups = groupedByCondition.get(cell.id) ?? [];
    const disabled = cell.status !== CONDITION_STATUS.PERFORMED;
    return conditionGroups.map((group, rowIndex) => {
      const representative = group.records.values().next().value?.[0];
      const conditionHeading = rowIndex === 0
        ? `<th scope="rowgroup" rowspan="${conditionGroups.length}" class="measurement-condition-heading"><strong>${escapeHtml(cell.label)}</strong>${conditionStateText(cell)}${disabled ? "" : `<button type="button" class="sheet-add-row" data-add-nested-sequence-row="${escapeHtml(cell.id)}">＋ 対象</button>`}</th>`
        : "";
      const hierarchyCells = levels.map((level, index) => `<td class="sheet-value-cell" data-sheet-cell="${index + 1}">${inputCell(representative, level.key, level.label, representative?.fields?.[level.key] ?? "", true, disabled)}</td>`).join("");
      let columnIndex = levels.length + 1;
      const valueCells = axisColumns.map((column) => {
        const observations = group.records.get(column.value) ?? [];
        const button = disabled || !column.declared ? "" : `<button class="quiet-button create-coordinate" type="button" data-condition-id="${escapeHtml(group.conditionCellId)}" data-entity-id="${escapeHtml(group.entityId)}" data-time="${escapeHtml(column.value)}" aria-label="${escapeHtml(`${cell.label}、測定対象${rowIndex + 1}、${column.value}の測定欄を追加`)}">＋</button>`;
        const html = coordinateCellHtml(observations, `${column.value}`, columnIndex, { disabled, createButton: button });
        columnIndex += fieldWidth;
        return html;
      }).join("");
      return `<tr data-sheet-row data-sheet-mode="matrix" data-condition-id="${escapeHtml(cell.id)}">${conditionHeading}${hierarchyCells}${valueCells}</tr>`;
    }).join("");
  }).join("");
  return header + `<tbody>${body}</tbody>`;
}

function renderMatchedTable() {
  ensureMatchedStarterRows();
  const groups = new Map();
  for (const observation of model().observations.filter((item) => item.readoutId === readout().id)) {
    const entity = observation.entityId || observation.id;
    if (!groups.has(entity)) groups.set(entity, new Map());
    if (!groups.get(entity).has(observation.conditionCellId)) groups.get(entity).set(observation.conditionCellId, []);
    groups.get(entity).get(observation.conditionCellId).push(observation);
  }
  const conditions = model().conditionCells.filter((cell) => cell.status === CONDITION_STATUS.PERFORMED || model().observations.some((observation) => observation.conditionCellId === cell.id));
  const identityLabel = patternId() === "matched_source_conditions" ? "同じ元材料・donorなどのID" : "同じ対象のID";
  const includeSampleId = patternId() === "matched_source_conditions";
  const subheaders = [...(includeSampleId ? ["条件別試料ID"] : []), ...measurementHeaders()];
  const fieldWidth = subheaders.length;
  const header = fieldWidth > 1
    ? `<thead><tr><th scope="col" rowspan="2">${identityLabel}</th>${conditions.map((cell) => `<th scope="colgroup" colspan="${fieldWidth}">${escapeHtml(cell.label)}</th>`).join("")}</tr><tr>${conditions.map(() => subheaders.map((label) => `<th scope="col">${escapeHtml(label)}</th>`).join("")).join("")}</tr></thead>`
    : `<thead><tr><th scope="col">${identityLabel}</th>${conditions.map((cell) => `<th scope="col">${escapeHtml(cell.label)}</th>`).join("")}</tr></thead>`;
  const body = [...groups.entries()].map(([entity, records], rowIndex) => {
    const representative = records.values().next().value?.[0];
    let columnIndex = 1;
    const values = conditions.map((cell) => {
    const observations = records.get(cell.id) ?? [];
      const disabled = cell.status !== CONDITION_STATUS.PERFORMED;
      const button = disabled ? "" : `<button class="quiet-button create-matched" type="button" data-condition-id="${escapeHtml(cell.id)}" data-entity-id="${escapeHtml(entity)}" aria-label="${escapeHtml(`${cell.label}、${identityLabel}${rowIndex + 1}の測定欄を追加`)}">＋</button>`;
      const html = coordinateCellHtml(observations, `${entity} ${cell.label}`, columnIndex, { disabled, createButton: button, includeSampleId });
      columnIndex += fieldWidth;
      return html;
    }).join("");
    return `<tr data-sheet-row data-sheet-mode="matrix"><th scope="row" class="sheet-value-cell" data-sheet-cell="0">${identityCell(representative, identityLabel)}</th>${values}</tr>`;
  }).join("");
  return header + `<tbody>${body}</tbody>`;
}

function prepareMeasurementStarterRows(selected) {
  if (selected === "same_entity_sequence") ensureRepeatedStarterRows();
  else if (selected === "nested_sequence") ensureNestedSequenceStarterRows();
  else if (["same_entity_conditions", "matched_source_conditions"].includes(selected)) {
    ensureMatchedStarterRows();
  } else ensureLongStarterRows();
}

function currentMeasurementView() {
  return appState.measurementViews[appState.template] ?? MEASUREMENT_VIEW_MODE.COMPACT;
}

function compactIdentityCopy(group, selected) {
  const parts = [];
  if (group.identity.ids.length) {
    const label = selected === "matched_source_conditions" ? "元材料ID" : "対象ID";
    parts.push(`${label}: ${group.identity.ids.join(", ")}`);
  }
  if (group.identity.missingRecordIds.length) {
    parts.push(`対象ID未入力 ${group.identity.missingRecordIds.length}件`);
  }
  if (selected === "matched_source_conditions") {
    if (group.conditionSampleIdentity.ids.length) {
      parts.push(`条件別試料ID: ${group.conditionSampleIdentity.ids.join(", ")}`);
    }
    if (group.conditionSampleIdentity.missingRecordIds.length) {
      parts.push(`条件別試料ID未入力 ${group.conditionSampleIdentity.missingRecordIds.length}件`);
    }
  }
  return parts.length ? parts.join(" / ") : "対象IDはまだ入力されていません";
}

function compactStructureCopy(group) {
  const parts = [];
  if (group.nesting.paths.length) {
    parts.push(`階層: ${group.nesting.paths.map((path) => path.values.map((value) => value ?? "（空欄）").join(" › ")).join("、")}`);
  }
  if (group.axis.observedValues.length) {
    parts.push(`記録された軸: ${group.axis.observedValues.join(", ")}`);
  }
  if (group.axis.unexpectedValues.length) {
    parts.push(`予定外の軸値: ${group.axis.unexpectedValues.join(", ")}（順序へ自動追加しません）`);
  }
  return parts.join(" / ");
}

function compactValueCopy(group) {
  const partial = group.partialRecordIds.length;
  const missing = group.missingValueRecordIds.length;
  const valid = group.derivation.validRecordIds.length;
  const independent = group.verifiedIndependentUnitCount == null
    ? ""
    : ` / ID確認済みの独立例 ${group.verifiedIndependentUnitCount}`;
  return `入力記録 ${group.observationN}件${independent} / 全欄入力 ${group.completeValueN} / 一部空欄 ${partial} / 全欄空欄 ${missing} / Graph値を計算可能 ${valid}`;
}

function compactGroupSummary(group, selected) {
  const structure = compactStructureCopy(group);
  const invalid = group.derivation.invalid;
  const issueCounts = new Map();
  for (const item of invalid) {
    const message = item.issue?.message ?? "測定値を計算に使用できません。";
    issueCounts.set(message, (issueCounts.get(message) ?? 0) + 1);
  }
  const issueCopy = [...issueCounts.entries()]
    .map(([message, count]) => `${message}（${count}件）`)
    .join(" ");
  return `<div class="compact-record-facts"><strong>${escapeHtml(compactValueCopy(group))}</strong><span>${escapeHtml(compactIdentityCopy(group, selected))}</span>${structure ? `<span${group.axis.unexpectedValues.length ? ' class="compact-warning"' : ""}>${escapeHtml(structure)}</span>` : ""}${invalid.length ? `<span class="compact-warning"><strong>Graph・Statisticsに使わない入力 ${invalid.length}件。</strong> ${escapeHtml(issueCopy)} raw値は保持しています。</span>` : ""}</div>`;
}

function compactAlignmentNotice(view) {
  const alignment = view.alignment;
  const parts = [];
  const labelByKind = {
    same_entity_across_conditions: "同じ対象IDで条件間を対応づけています。",
    shared_source_across_conditions: "同じ元材料IDで対応づけています。条件ごとの試料は別物です。",
    same_entity_across_axis: "同じ対象IDを軸に沿って追跡しています。",
    nested_entity_across_axis: "親子の階層と対象IDを保ったまま軸に沿って追跡しています。",
  };
  if (labelByKind[alignment.kind]) parts.push(labelByKind[alignment.kind]);
  if (alignment.absentCoordinates.length) {
    parts.push(`記録自体がない座標 ${alignment.absentCoordinates.length}か所。`);
  }
  if (alignment.incompleteCoordinates.length) {
    parts.push(`値が空欄の座標 ${alignment.incompleteCoordinates.length}か所。`);
  }
  if (alignment.missingConditionSampleIds.length) {
    parts.push(`条件別試料ID未入力 ${alignment.missingConditionSampleIds.length}件。`);
  }
  if (alignment.duplicateCoordinates.length) {
    parts.push(`同じID×条件・軸に複数recordがある座標 ${alignment.duplicateCoordinates.length}か所。詳細で確認してください。`);
  }
  return parts.length
    ? `<span class="compact-alignment-notice${alignment.duplicateCoordinates.length ? " is-warning" : ""}">${escapeHtml(parts.join(" "))}</span>`
    : "";
}

function renderCompactMeasurementTable(selected) {
  const nestedFieldKeys = ["nested_records", "nested_sequence"].includes(selected)
    ? nestedLevelDefinitions().map((level) => level.key)
    : [];
  const view = buildMeasurementRecordView(model(), {
    readoutId: readout().id,
    mode: MEASUREMENT_VIEW_MODE.COMPACT,
    patternId: selected,
    axisValues: definition().axisValues ?? [],
    nestedFieldKeys,
  });
  const editing = compactMeasurementEditingDecision({
    patternId: selected,
    readoutKind: readout().kind,
    records: model().observations.filter((record) => record.readoutId === readout().id),
  });
  const groups = view.groups.filter((group) =>
    group.conditionCell.status === CONDITION_STATUS.PERFORMED || group.canonicalRecordIds.length,
  );
  const notice = compactAlignmentNotice(view);
  if (editing.status === "editable") {
    const headings = groups.map((group) =>
      `<th scope="col"><strong>${escapeHtml(group.conditionCell.label)}</strong>${conditionStateText(group.conditionCell)}</th>`,
    ).join("");
    const cells = groups.map((group) => {
      const disabled = group.conditionCell.status !== CONDITION_STATUS.PERFORMED;
      const text = serializeIndependentCompactValues(model(), {
        conditionCellId: group.conditionCell.id,
        readoutId: readout().id,
      });
      const rows = Math.max(3, Math.min(10, group.observationN + 1));
      return `<td class="compact-condition-cell"><textarea data-compact-condition-input data-condition-id="${escapeHtml(group.conditionCell.id)}" rows="${rows}" aria-label="${escapeHtml(`${group.conditionCell.label}の測定値を1行1件で入力`)}"${disabled ? " disabled" : ""}>${escapeHtml(text)}</textarea>${compactGroupSummary(group, selected)}</td>`;
    }).join("");
    return `<caption>条件ごとに1行1件で入力できます。横の同じ行番号から条件間の対応は作りません。対象IDの編集は「すべての値を表示」で行います。${notice}</caption><thead><tr>${headings}</tr></thead><tbody><tr>${cells}</tr></tbody>`;
  }

  const rows = groups.map((group) =>
    `<tr><th scope="row"><strong>${escapeHtml(group.conditionCell.label)}</strong>${conditionStateText(group.conditionCell)}</th><td>${compactGroupSummary(group, selected)}</td></tr>`,
  ).join("");
  return `<caption>この構造はID・軸・親子列を保つ必要があるため、まとめ表示から値を編集しません。「すべての値を表示」で同じrecordを編集できます。${notice}</caption><thead><tr><th scope="col">条件</th><th scope="col">保持しているrecord・ID・欠測</th></tr></thead><tbody>${rows}</tbody>`;
}

function replaceObservation(state, nextObservation) {
  return upsertObservation(state, nextObservation);
}

function applySheetValue(state, descriptor, value) {
  const observation = state.observations.find((item) => item.id === descriptor.observationId);
  if (!observation) throw new Error("貼り付け先の観測行を特定できません。");
  if (descriptor.field) {
    if (patternId() === "nested_sequence" && nestedLevelDefinitions().some((level) => level.key === descriptor.field)) {
      let next = state;
      for (const item of state.observations.filter((candidate) => candidate.conditionCellId === observation.conditionCellId && candidate.entityId === observation.entityId)) {
        next = replaceObservation(next, { ...item, placeholder: false, fields: { ...item.fields, [descriptor.field]: value } });
      }
      return next;
    }
    return replaceObservation(state, {
      ...observation,
      ...(patternId() === "nested_records" && descriptor.field === nestedLevelDefinitions()[0]?.key
        ? { entityId: value }
        : {}),
      placeholder: false,
      fields: { ...observation.fields, [descriptor.field]: value },
    });
  }
  if (descriptor.property !== "entityId") throw new Error("この列へは範囲貼り付けできません。");
  const previous = observation.entityId;
  const linked = patternId() === "same_entity_sequence"
    ? state.observations.filter((item) => item.conditionCellId === observation.conditionCellId && item.entityId === previous)
    : ["same_entity_conditions", "matched_source_conditions"].includes(patternId())
      ? state.observations.filter((item) => item.entityId === previous)
      : [observation];
  let next = state;
  for (const item of linked) next = replaceObservation(next, { ...item, placeholder: false, entityId: value });
  return next;
}

function sheetInputDescriptor(input) {
  return {
    observationId: input.dataset.observationId,
    field: input.dataset.field,
    property: input.dataset.property,
  };
}

function sheetCellInput(cell) {
  if (!cell) return null;
  const inputs = [...cell.querySelectorAll('[data-sheet-editable]:not(:disabled)')];
  return inputs.length === 1 ? inputs[0] : null;
}

function measurementRowsFor(input) {
  const row = input.closest("tr[data-sheet-row]");
  if (!row) return [];
  if (row.dataset.sheetMode === "long") {
    return $$(`tr[data-sheet-row][data-sheet-mode="long"][data-condition-id="${CSS.escape(row.dataset.conditionId)}"]`);
  }
  return $$('#data-table tr[data-sheet-row][data-sheet-mode="matrix"]');
}

function ensureLongRowsForPaste(input, requiredRows) {
  const row = input.closest('tr[data-sheet-row][data-sheet-mode="long"]');
  if (!row) return;
  const conditionCellId = row.dataset.conditionId;
  const currentRows = measurementRowsFor(input);
  if (requiredRows <= currentRows.length) return;
  const blankFields = patternId() === "nested_records"
    ? blankReadoutFields(Object.fromEntries(nestedLevelDefinitions().map((level) => [level.key, ""])))
    : blankReadoutFields();
  setModel(ensureConditionMeasurementRowCount(model(), {
    conditionCellId,
    readoutId: readout().id,
    minimumRowCount: requiredRows,
    blankFields,
  }));
}

function applyMeasurementRangePaste(input, text) {
  const parsed = parseTabDelimitedText(text);
  const sourceRow = input.closest("tr[data-sheet-row]");
  const sourceCell = input.closest("[data-sheet-cell]");
  if (!sourceRow || !sourceCell) throw new Error("貼り付け先のセルを特定できません。");
  let rows = measurementRowsFor(input);
  const startRow = rows.indexOf(sourceRow);
  const startColumn = Number(sourceCell.dataset.sheetCell);
  if (startRow < 0 || !Number.isInteger(startColumn)) throw new Error("貼り付け先の座標を特定できません。");

  if (sourceRow.dataset.sheetMode === "long") {
    // Keep one immediately editable row after the pasted range, like a normal
    // spreadsheet. Unequal n remains independent for each condition group.
    ensureLongRowsForPaste(input, rowCountWithTrailingEntryRow({
      currentRowCount: rows.length,
      startRowIndex: startRow,
      enteredRowCount: parsed.rowCount,
    }));
    renderDataTable();
    rows = $$(`tr[data-sheet-row][data-sheet-mode="long"][data-condition-id="${CSS.escape(sourceRow.dataset.conditionId)}"]`);
  } else if (startRow + parsed.rowCount > rows.length) {
    throw new Error("貼り付ける行数が現在の表を超えています。先に対象の行を追加してください。");
  }

  const pending = [];
  for (let rowOffset = 0; rowOffset < parsed.rowCount; rowOffset += 1) {
    const targetRow = rows[startRow + rowOffset];
    if (!targetRow) throw new Error("貼り付ける行数に対応する空行を作れませんでした。");
    for (let columnOffset = 0; columnOffset < parsed.columnCount; columnOffset += 1) {
      const targetColumn = startColumn + columnOffset;
      const targetCell = targetRow.querySelector(`[data-sheet-cell="${targetColumn}"]`);
      const targetInput = targetCell ? sheetCellInput(targetCell) : null;
      if (!targetInput) {
        throw new Error(`${rowOffset + 1}行${columnOffset + 1}列目は、計算列・固定列・重複値のため直接上書きできません。`);
      }
      pending.push({ descriptor: sheetInputDescriptor(targetInput), value: parsed.cells[rowOffset][columnOffset] });
    }
  }

  let next = model();
  for (const item of pending) next = applySheetValue(next, item.descriptor, item.value);
  setModel(next);
  renderDataTable();
  renderSummary();
  renderGraph();
  if (!$("#statistics-questions").classList.contains("hidden")) renderQuestions();
  updateReadiness();
  $("#data-status").textContent = `${parsed.rowCount}行 × ${parsed.columnCount}列を貼り付けました。空欄は空欄のまま保持しています。`;
}

function commitRenderedSheetRow(row) {
  if (!row) return;
  let next = model();
  let changed = false;
  for (const input of row.querySelectorAll('[data-sheet-editable]:not(:disabled)')) {
    const descriptor = sheetInputDescriptor(input);
    const observation = next.observations.find((item) => item.id === descriptor.observationId);
    if (!observation) continue;
    const current = descriptor.field
      ? observation.fields?.[descriptor.field]
      : descriptor.property === "entityId"
        ? observation.entityId
        : undefined;
    if (String(current ?? "") === input.value) continue;
    next = applySheetValue(next, descriptor, input.value);
    changed = true;
  }
  if (changed) setModel(next);
}

function commitRenderedDetailTable() {
  for (const row of $$("#data-table tr[data-sheet-row]")) {
    commitRenderedSheetRow(row);
  }
}

function focusNextSheetCell(input) {
  const row = input.closest("tr[data-sheet-row]");
  const cell = input.closest("[data-sheet-cell]");
  if (!row || !cell) return;
  // Enter/Tab can be handled before the browser dispatches change/blur.
  // Persist every edited coordinate in this row before a render adds the next
  // spreadsheet row, otherwise an identity typed immediately before Tab can
  // be lost while the numeric value survives.
  commitRenderedSheetRow(row);
  const rows = measurementRowsFor(input);
  const rowIndex = rows.indexOf(row);
  let nextRow = rows[rowIndex + 1];
  if (!nextRow && row.dataset.sheetMode === "long") {
    const conditionCellId = row.dataset.conditionId;
    ensureLongRowsForPaste(input, rowCountWithTrailingEntryRow({
      currentRowCount: rows.length,
      startRowIndex: rowIndex,
      enteredRowCount: 1,
    }));
    renderDataTable();
    const expandedRows = $$(`tr[data-sheet-row][data-sheet-mode="long"][data-condition-id="${CSS.escape(conditionCellId)}"]`);
    nextRow = expandedRows[rowIndex + 1];
  }
  const nextCell = nextRow?.querySelector(`[data-sheet-cell="${cell.dataset.sheetCell}"]`);
  sheetCellInput(nextCell)?.focus();
}

function blankMeasurementFields(extra = {}) {
  return blankReadoutFields(extra);
}

function attachDataListeners() {
  $$('[data-observation-id][data-field]').forEach((input) => input.addEventListener("input", () => {
    const observation = model().observations.find((item) => item.id === input.dataset.observationId);
    if (!observation) return;
    if (patternId() === "nested_sequence" && nestedLevelDefinitions().some((level) => level.key === input.dataset.field)) {
      for (const item of model().observations.filter((candidate) => candidate.conditionCellId === observation.conditionCellId && candidate.entityId === observation.entityId)) {
        addRecord({ ...item, placeholder: false, fields: { ...item.fields, [input.dataset.field]: input.value } });
      }
      renderDataStatus();
      updateReadiness();
      return;
    }
    const nextObservation = {
      ...observation,
      ...(patternId() === "nested_records" && input.dataset.field === nestedLevelDefinitions()[0]?.key
        ? { entityId: input.value }
        : {}),
      placeholder: false,
      fields: { ...observation.fields, [input.dataset.field]: input.value },
    };
    addRecord(nextObservation);
    updateDerived(observation.id);
    renderDataStatus();
    renderGraph();
    if (!$("#statistics-questions").classList.contains("hidden")) renderQuestions();
    updateReadiness();
  }));
  $$('[data-observation-id][data-property]').forEach((input) => input.addEventListener("change", () => {
    const observation = model().observations.find((item) => item.id === input.dataset.observationId);
    if (!observation) return;
    const property = input.dataset.property;
    if (patternId() === "same_entity_sequence" && property === "conditionCellId") {
      const previousCondition = observation.conditionCellId;
      for (const item of model().observations.filter((candidate) => candidate.conditionCellId === previousCondition && candidate.entityId === observation.entityId)) {
        addRecord({ ...item, placeholder: false, conditionCellId: input.value });
      }
    } else if (patternId() === "same_entity_sequence" && property === "entityId") {
      const previous = observation.entityId;
      for (const item of model().observations.filter((candidate) => candidate.conditionCellId === observation.conditionCellId && candidate.entityId === previous)) {
        addRecord({ ...item, placeholder: false, entityId: input.value });
      }
    } else if (["same_entity_conditions", "matched_source_conditions"].includes(patternId()) && property === "entityId") {
      const previous = observation.entityId;
      for (const item of model().observations.filter((candidate) => candidate.entityId === previous)) {
        addRecord({ ...item, placeholder: false, entityId: input.value });
      }
    } else {
      addRecord({ ...observation, placeholder: false, [property]: input.value });
    }
    renderDataTable();
    renderSummary();
    renderGraph();
    if (!$("#statistics-questions").classList.contains("hidden")) renderQuestions();
    updateReadiness();
  }));
  $$('.create-coordinate').forEach((button) => button.addEventListener("click", () => {
    const representative = model().observations.find((item) => item.conditionCellId === button.dataset.conditionId && item.entityId === button.dataset.entityId);
    const hierarchy = patternId() === "nested_sequence"
      ? Object.fromEntries(nestedLevelDefinitions().map((level) => [level.key, representative?.fields?.[level.key] ?? ""]))
      : {};
    addRecord(newObservation(button.dataset.conditionId, blankMeasurementFields({ ...hierarchy, time: button.dataset.time }), button.dataset.entityId, true));
    renderDataTable();
  }));
  $$('.create-matched').forEach((button) => button.addEventListener("click", () => {
    addRecord(newObservation(button.dataset.conditionId, blankMeasurementFields(), button.dataset.entityId, true));
    renderDataTable();
  }));
  $$('[data-add-condition-row]').forEach((button) => button.addEventListener("click", () => {
    const group = buildConditionMeasurementSheets(model(), { readoutId: readout().id }).groups
      .find((item) => item.conditionCell.id === button.dataset.addConditionRow);
    if (!group?.editable) return;
    const blankFields = patternId() === "nested_records"
      ? blankReadoutFields(Object.fromEntries(nestedLevelDefinitions().map((level) => [level.key, ""])))
      : blankReadoutFields();
    setModel(ensureConditionMeasurementRowCount(model(), {
      conditionCellId: group.conditionCell.id,
      readoutId: readout().id,
      minimumRowCount: group.rowCount + 1,
      blankFields,
    }));
    renderDataTable();
    const rows = $$(`tr[data-sheet-row][data-sheet-mode="long"][data-condition-id="${CSS.escape(group.conditionCell.id)}"]`);
    sheetCellInput(rows.at(-1)?.querySelector('[data-sheet-cell="0"]'))?.focus();
  }));
  $$('[data-add-repeated-row]').forEach((button) => button.addEventListener("click", () => {
    const conditionCellId = button.dataset.addRepeatedRow;
    const cell = conditionById(conditionCellId);
    const used = new Set(model().observations.filter((item) => item.conditionCellId === conditionCellId).map((item) => item.entityId));
    let ordinal = used.size + 1;
    let entityId = `${cell.label}-${ordinal}`;
    while (used.has(entityId)) { ordinal += 1; entityId = `${cell.label}-${ordinal}`; }
    for (const time of definition().axisValues) addRecord(newObservation(conditionCellId, blankMeasurementFields({ time }), entityId, true));
    renderDataTable();
  }));
  $$('[data-add-nested-sequence-row]').forEach((button) => button.addEventListener("click", () => {
    const conditionCellId = button.dataset.addNestedSequenceRow;
    const used = new Set(model().observations.filter((item) => item.conditionCellId === conditionCellId).map((item) => item.entityId));
    let ordinal = used.size + 1;
    let entityId = `${conditionCellId}-tracked-${ordinal}`;
    while (used.has(entityId)) { ordinal += 1; entityId = `${conditionCellId}-tracked-${ordinal}`; }
    const hierarchy = Object.fromEntries(nestedLevelDefinitions().map((level) => [level.key, ""]));
    for (const axisValue of definition().axisValues) addRecord(newObservation(conditionCellId, blankMeasurementFields({ ...hierarchy, time: axisValue }), entityId, true));
    renderDataTable();
  }));
  $$('[data-sheet-editable]:not(:disabled)').forEach((input) => {
    input.addEventListener("paste", (event) => {
      const text = event.clipboardData?.getData("text/plain");
      if (text == null || (!text.includes("\t") && !/[\r\n]/.test(text))) return;
      event.preventDefault();
      const previous = model();
      try {
        applyMeasurementRangePaste(input, text);
      } catch (error) {
        setModel(previous);
        renderDataTable();
        renderSummary();
        renderGraph();
        updateReadiness();
        $("#data-status").classList.add("warning");
        $("#data-status").textContent = `貼り付けを適用できませんでした（0セル変更）：${error.message}`;
      }
    });
    input.addEventListener("keydown", (event) => {
      if (event.isComposing) return;
      if (event.key === "Enter") {
        event.preventDefault();
        focusNextSheetCell(input);
        return;
      }
      if (event.key !== "Tab" || event.shiftKey) return;
      const row = input.closest('tr[data-sheet-row][data-sheet-mode="long"]');
      if (!row) return;
      const editableInRow = [...row.querySelectorAll('[data-sheet-editable]:not(:disabled)')];
      const rows = measurementRowsFor(input);
      if (editableInRow.at(-1) !== input || rows.at(-1) !== row) return;
      event.preventDefault();
      const firstCell = row.querySelector('[data-sheet-cell="0"]');
      const firstInput = sheetCellInput(firstCell);
      if (firstInput) focusNextSheetCell(firstInput);
    });
  });
}

function updateDerived(observationId) {
  const node = document.querySelector(`[data-derived-id="${CSS.escape(observationId)}"]`);
  if (!node) return;
  const observation = model().observations.find((item) => item.id === observationId);
  const derived = deriveGraphDatum(observation, readout());
  node.textContent = derived.ok ? `${derived.percent.toFixed(1)}%` : "—";
  const stack = node.closest(".derived-result-stack");
  let warning = stack?.querySelector(".derived-warning");
  const issue = describeMeasurementDerivationIssue(observation, readout());
  if (!issue) {
    warning?.remove();
    return;
  }
  if (!warning && stack) {
    warning = document.createElement("small");
    warning.className = "derived-warning";
    stack.append(warning);
  }
  if (warning) {
    warning.textContent = `${issue.message} Graph・Statisticsには使用しません。raw値は保持しています。`;
  }
}

function activeMeasurementDerivationIssues() {
  const { active } = partitionObservations(model());
  return active
    .filter(meaningful)
    .map((observation) => ({
      observation,
      issue: describeMeasurementDerivationIssue(observation, readout()),
    }))
    .filter((item) => item.issue != null);
}

function renderDataStatus() {
  const { active, excluded } = partitionObservations(model());
  const activeCount = active.filter(meaningful).length;
  const sampleCount = active.filter((item) => meaningful(item) && item.provenance?.sourceKind === "prototype_example").length;
  const excludedCount = excluded.filter((item) => meaningful(item.observation)).length;
  const unknownCount = model().conditionCells.filter((cell) => cell.status === CONDITION_STATUS.UNKNOWN).length;
  const status = $("#data-status");
  const conflict = mappingConflict();
  const guideIssue = observationGuideIssue();
  const duplicates = coordinateConflicts();
  const derivationIssues = activeMeasurementDerivationIssues();
  status.classList.toggle("warning", Boolean(conflict) || Boolean(guideIssue) || duplicates.length > 0 || derivationIssues.length > 0 || excludedCount > 0 || unknownCount > 0);
  if (guideIssue) {
    status.innerHTML = `<strong>入力表の変更は適用していません。</strong> 現在の入力表、${activeCount + excludedCount}件の入力値、Graphを保持しています。実験の構造を単純化しません。`;
  } else if (conflict) {
    const ready = mappingCompleteFor(conflict.to);
    status.innerHTML = `<strong>表の形の変更は、まだ入力済みデータへ適用していません。</strong> 元のデータとGraphを保持しています。${ready ? "必要な列がそろっているため、明示的に確定できます。" : "新しい形に必要な対象名・列を入力してください。"}<div class="mapping-actions"><button type="button" class="quiet-button" id="revert-mapping">元の形に戻す</button><button type="button" class="primary-button" id="confirm-mapping"${ready ? "" : " disabled"}>この形への対応付けを確定</button></div>`;
    $("#revert-mapping").addEventListener("click", () => {
      appState.selectedPatterns[appState.template] = conflict.from;
      appState.mappingConflicts[appState.template] = null;
      renderAll();
    });
    $("#confirm-mapping").addEventListener("click", () => {
      appState.mappingConflicts[appState.template] = null;
      renderAll();
    });
  } else if (duplicates.length) {
    const duplicateRecordCount = duplicates.reduce((count, item) => count + item.observationIds.length, 0);
    status.innerHTML = `<strong>${duplicates.length}か所に複数の値があります。</strong> ${duplicateRecordCount}件を消さずにすべて表示しています。どの値を残すか確認し、不要な値を空欄にするまでStatisticsは停止します。Graphには現在のraw値をすべて表示します。`;
  } else if (derivationIssues.length) {
    const counts = new Map();
    for (const item of derivationIssues) {
      counts.set(item.issue.message, (counts.get(item.issue.message) ?? 0) + 1);
    }
    const reasonCopy = [...counts.entries()]
      .map(([message, count]) => `${message}（${count}件）`)
      .join(" ");
    status.innerHTML = `<strong>${derivationIssues.length}件をGraph・Statisticsに使用しません。</strong> ${escapeHtml(reasonCopy)} 入力したraw値は削除していません。`;
  } else if (excludedCount) {
    status.textContent = `${activeCount}件をGraphに使用。${excludedCount}件は元データとして保持していますが、非実施または不明の条件なのでGraph・Statisticsから除外しています。`;
  } else if (unknownCount) {
    status.textContent = `${unknownCount}条件がまだ不明です。入力済みデータは保持しますが、確定するまでその条件は利用しません。`;
  } else {
    status.textContent = activeCount
      ? `${activeCount}件の入力値を保持しています。${sampleCount ? `うち${sampleCount}件は白抜き表示のサンプル値で、ボタンから除けます。` : ""}`
      : "条件ごとにデータ数が異なっていても、そのまま入力できます。";
  }
}

function commitCompactConditionInput(input) {
  if (!input?.matches?.("[data-compact-condition-input]")) return true;
  const previous = model();
  try {
    const result = applyIndependentCompactValues(previous, {
      conditionCellId: input.dataset.conditionId,
      readoutId: readout().id,
      text: input.value,
      patternId: patternId(),
    });
    setModel(result.state);
    input.removeAttribute("aria-invalid");
    delete input.dataset.compactDirty;
    renderSummary();
    renderGraph();
    if (!$("#statistics-questions").classList.contains("hidden")) renderQuestions();
    updateReadiness();
    $("#data-status").classList.remove("warning");
    $("#data-status").textContent = `${result.inputRowCount}件を同じcanonical record表へ反映しました。条件間の対応は作っていません。`;
    return true;
  } catch (error) {
    setModel(previous);
    input.setAttribute("aria-invalid", "true");
    $("#data-status").classList.add("warning");
    $("#data-status").textContent = `まとめ入力を適用できませんでした（0件変更）：${error.message}`;
    return false;
  }
}

function attachCompactDataListeners() {
  $$('[data-compact-condition-input]').forEach((input) => {
    input.addEventListener("input", () => { input.dataset.compactDirty = "true"; });
    input.addEventListener("change", () => commitCompactConditionInput(input));
    input.addEventListener("keydown", (event) => {
      if (!(event.ctrlKey || event.metaKey) || event.key !== "Enter") return;
      event.preventDefault();
      if (!commitCompactConditionInput(input)) return;
      renderDataTable();
      focusWithoutScroll(document.querySelector(
        `[data-compact-condition-input][data-condition-id="${CSS.escape(input.dataset.conditionId)}"]`,
      ));
    });
  });
}

function renderDataTable() {
  const card = $(".measurement-card");
  const ready = appState.canvasReady[appState.template] && appState.observationReady[appState.template];
  card.dataset.state = ready ? "ready" : "pending";
  card.setAttribute("aria-disabled", String(!ready));
  $("#add-row").disabled = !ready;
  $("#paste-table").disabled = !ready;
  $("#paste-demo").disabled = !ready;
  $$('[data-measurement-view]').forEach((button) => {
    const active = button.dataset.measurementView === currentMeasurementView();
    button.classList.toggle("active", active);
    button.setAttribute("aria-pressed", String(active));
    button.disabled = !ready;
  });
  $("#remove-demo").classList.toggle("hidden", !model().observations.some((observation) => observation.provenance?.sourceKind === "prototype_example"));
  if (!ready) {
    const canvasPending = !appState.canvasReady[appState.template];
    $("#data-table").innerHTML = `<tbody><tr><td class="empty-surface">${canvasPending ? "まず条件表を作ってください。" : "上の「値をどのように得ましたか？」に答えると、ここに入力表の例を表示します。"}</td></tr></tbody>`;
    $("#measurement-help").textContent = canvasPending ? "条件表ができた後に、実験に合う入力表を表示します。" : "まだ表の形は決めていません。条件表と入力済みデータは保持されます。";
    $("#data-status").textContent = canvasPending ? "条件表への回答待ちです。" : "観測方法への回答待ちです。";
    return;
  }
  const selected = patternId();
  prepareMeasurementStarterRows(selected);
  const compact = currentMeasurementView() === MEASUREMENT_VIEW_MODE.COMPACT;
  $(".measurement-card .table-scroll").dataset.measurementView = compact ? "compact" : "detail";
  if (compact) $("#data-table").innerHTML = renderCompactMeasurementTable(selected);
  else if (selected === "same_entity_sequence") $("#data-table").innerHTML = renderRepeatedTable();
  else if (selected === "nested_sequence") $("#data-table").innerHTML = renderNestedSequenceTable();
  else if (["same_entity_conditions", "matched_source_conditions"].includes(selected)) $("#data-table").innerHTML = renderMatchedTable();
  else $("#data-table").innerHTML = renderLongObservationTable(selected);
  const conditionGrouped = !["same_entity_sequence", "nested_sequence", "same_entity_conditions", "matched_source_conditions"].includes(selected);
  const compactEditing = compactMeasurementEditingDecision({
    patternId: selected,
    readoutKind: readout().kind,
    records: model().observations.filter((record) => record.readoutId === readout().id),
  });
  $("#measurement-help").textContent = compact
    ? compactEditing.status === "editable"
      ? "条件ごとの欄へ、1行1件で複数値を入力・貼り付けできます。各値は別々のrecordとして保存し、横の行位置から対応を作りません。"
      : `同じcanonical recordを要約しています。${pattern().summary} 編集は「すべての値を表示」で行います。`
    : conditionGrouped
      ? `${pattern().surface}を自動生成しました。入力してEnter、または行末でTabを押すか、Excelから複数行を貼ると、その条件だけ行が増えます。条件ごとの行数が揃っていても、行位置だけで同じ対象とは解釈しません。`
      : `${pattern().surface}を自動生成しました。${pattern().summary}`;
  $("#measurement-sheet-instruction").textContent = compact
    ? compactEditing.status === "editable"
      ? "改行で複数値を入力できます。対象IDを編集するときは「すべての値を表示」へ切り替えます。"
      : "件数・空欄・ID・階層を確認できます。意味が曖昧になるcompact編集は行いません。"
    : "直接入力するか、左上セルを選んでExcelから貼り付けます。空欄は空欄のまま残します。";
  $("#add-row").classList.toggle("hidden", compact || conditionGrouped);
  $("#add-row").textContent = selected === "same_entity_sequence"
    ? "＋ 追跡する対象を追加"
    : selected === "nested_sequence"
    ? "＋ 追跡するCell・ROIを追加"
    : selected === "same_entity_conditions"
    ? "＋ 同じ対象を追加"
    : selected === "matched_source_conditions"
    ? "＋ 元材料を追加"
    : "＋ 観測を追加";
  if (compact) attachCompactDataListeners();
  else attachDataListeners();
  renderDataStatus();
}

function graphRecords() {
  const { active } = partitionObservations(model());
  return active.flatMap((observation) => {
    const datum = deriveGraphDatum(observation, readout());
    return datum.ok ? [{ observation, value: readout().kind === READOUT_KIND.POSITIVE_TOTAL ? datum.percent : datum.value }] : [];
  });
}

function graphValueLabel() {
  if (readout().kind !== READOUT_KIND.RELATED_VALUES) return readout().label;
  return readoutFieldSpecs().find((field) => field.key === readout().graphField)?.label ?? readout().label;
}

function renderTrajectoryGraph(records) {
  const svg = $("#mini-graph");
  const timeIndex = new Map(definition().axisValues.map((value, index) => [value, index]));
  const groups = new Map();
  for (const item of records) {
    const key = `${item.observation.conditionCellId}|${item.observation.entityId}`;
    if (!groups.has(key)) groups.set(key, []);
    groups.get(key).push(item);
  }
  const values = records.map((item) => item.value);
  const min = Math.min(...values, 0);
  const max = Math.max(...values, 1);
  const scaleY = (value) => 185 - ((value - min) / Math.max(max - min, 1)) * 145;
  const scaleX = (time) => 55 + (timeIndex.get(time) ?? 0) * (320 / Math.max(definition().axisValues.length - 1, 1));
  const colors = ["#167463", "#9c6815", "#4d67a7", "#8b4b7d", "#4f7d3d", "#a44b47"];
  const lines = [...groups.values()].map((items, index) => {
    const sorted = items.sort((a, b) => (timeIndex.get(a.observation.fields.time) ?? 0) - (timeIndex.get(b.observation.fields.time) ?? 0));
    const points = sorted.map((item) => `${scaleX(item.observation.fields.time)},${scaleY(item.value)}`).join(" ");
    const color = colors[index % colors.length];
    return `<polyline points="${points}" fill="none" stroke="${color}" stroke-width="2" opacity="0.75"/>${sorted.map((item) => {
      const sample = item.observation.provenance?.sourceKind === "prototype_example";
      return `<circle cx="${scaleX(item.observation.fields.time)}" cy="${scaleY(item.value)}" r="3" fill="${sample ? "#ffffff" : color}" stroke="${color}" stroke-width="${sample ? 2 : 0}"><title>${sample ? "サンプル値 · " : ""}${escapeHtml(item.observation.entityId)} ${escapeHtml(item.observation.fields.time)}: ${item.value}</title></circle>`;
    }).join("")}`;
  }).join("");
  svg.innerHTML = `<line x1="44" y1="190" x2="390" y2="190" stroke="#91a09c"/><line x1="44" y1="26" x2="44" y2="190" stroke="#91a09c"/>${lines}${definition().axisValues.map((time) => `<text x="${scaleX(time)}" y="210" text-anchor="middle" fill="#667371" font-size="9">${escapeHtml(time)}</text>`).join("")}`;
  const sampleCount = records.filter((item) => item.observation.provenance?.sourceKind === "prototype_example").length;
  $("#graph-note").textContent = `${graphValueLabel()} · ${groups.size}対象の経時変化${sampleCount ? `（白抜き${sampleCount}件はサンプル値）` : ""}（欠けた時点は補完しません）`;
}

function renderGroupedGraph(records) {
  const svg = $("#mini-graph");
  const groups = activeConditionCells().map((cell) => ({ cell, values: records.filter((item) => item.observation.conditionCellId === cell.id) })).filter((group) => group.values.length);
  const max = Math.max(...records.map((item) => item.value), 1);
  const groupWidth = 330 / Math.max(groups.length, 1);
  const dots = groups.flatMap((group, groupIndex) => group.values.map((item, itemIndex) => {
    const x = 58 + groupIndex * groupWidth + ((itemIndex % 5) - 2) * 4;
    const y = 185 - (item.value / max) * 145;
    const sample = item.observation.provenance?.sourceKind === "prototype_example";
    return `<circle cx="${x}" cy="${y}" r="4" fill="${sample ? "#ffffff" : "#167463"}" stroke="#167463" stroke-width="${sample ? 2 : 0}" opacity="0.75"><title>${sample ? "サンプル値 · " : ""}${escapeHtml(group.cell.label)}: ${item.value.toFixed(2)}</title></circle>`;
  })).join("");
  const labels = groups.map((group, index) => `<text x="${58 + index * groupWidth}" y="210" text-anchor="middle" fill="#667371" font-size="8">${escapeHtml(group.cell.label.slice(0, 13))}</text>`).join("");
  svg.innerHTML = `<line x1="42" y1="190" x2="392" y2="190" stroke="#91a09c"/><line x1="42" y1="24" x2="42" y2="190" stroke="#91a09c"/>${dots}${labels}<text x="18" y="30" fill="#667371" font-size="10">${max.toFixed(1)}</text>`;
  const sampleCount = records.filter((item) => item.observation.provenance?.sourceKind === "prototype_example").length;
  $("#graph-note").textContent = `${graphValueLabel()} · ${records.length}件を条件別に表示${sampleCount ? `（白抜き${sampleCount}件はサンプル値）` : ""}（行位置から対応を推定しません）`;
}

function renderGraphFieldChoice() {
  const choice = $("#graph-field-choice");
  const select = $("#graph-field-select");
  if (!choice || !select) return;
  const related = readout().kind === READOUT_KIND.RELATED_VALUES;
  choice.classList.toggle("hidden", !related);
  if (!related) { select.innerHTML = ""; return; }
  select.innerHTML = readoutFieldSpecs().map((field) => `<option value="${escapeHtml(field.key)}"${field.key === readout().graphField ? " selected" : ""}>${escapeHtml(field.label)}</option>`).join("");
  select.onchange = () => {
    setModel({ ...model(), readouts: model().readouts.map((item) => item.id === readout().id ? { ...item, graphField: select.value } : item) });
    renderGraph();
    updateReadiness();
  };
}

function renderGraph() {
  renderGraphFieldChoice();
  const svg = $("#mini-graph");
  const records = graphRecords();
  if (!records.length) {
    svg.innerHTML = `<text x="210" y="115" text-anchor="middle" fill="#82908d" font-size="13">測定値を入力すると、ここにGraphが表示されます</text>`;
    $("#graph-note").textContent = "値を入力すると表示します";
    return;
  }
  const effectivePattern = mappingConflict()?.from ?? patternId();
  if (["same_entity_sequence", "nested_sequence"].includes(effectivePattern)) renderTrajectoryGraph(records);
  else renderGroupedGraph(records);
  if (mappingConflict()) $("#graph-note").textContent += " · 入力表の変更は未適用";
  if (observationGuideIssue()) $("#graph-note").textContent += " · 現在の表とGraphを保持中";
  if (coordinateConflicts().length) $("#graph-note").textContent += " · 同じ位置の複数値を確認中";
}

function renderSummary() {
  const conditions = model().conditionCells;
  const performed = conditions.filter((cell) => cell.status === CONDITION_STATUS.PERFORMED).length;
  const absent = conditions.filter((cell) => cell.status === CONDITION_STATUS.NOT_PERFORMED_BY_DESIGN).length;
  const unknown = conditions.filter((cell) => cell.status === CONDITION_STATUS.UNKNOWN).length;
  const { active, excluded } = partitionObservations(model());
  const activeCount = active.filter(meaningful).length;
  const excludedCount = excluded.filter((item) => meaningful(item.observation)).length;
  const orderedConditionNames = (definition().dimensionMetadata ?? [])
    .filter((item) => item.kind === "ordered")
    .map((item) => item.label);
  const flow = definition().materialFlow;
  const sourceRelationCopy = flow?.sourceRelation === "shared_source_separate_samples"
    ? "各対象から、条件ごとの別々の試料へ分けています。"
    : flow?.sourceRelation === "literal_same_entity"
      ? "同じ対象そのものを、条件を変えながら測っています。"
      : flow?.sourceRelation === "separate"
        ? "各対象は1つの条件だけに使い、条件間で同じ対象として結びません。"
        : "";
  const linkageCopy = flow?.linkageAvailability === "existing_id"
    ? " 条件間の対応は、入力するIDで保持します。"
    : flow?.linkageAvailability === "enter_together"
      ? " 条件間の対応は、同じ行へ入力して保持します。"
      : "";
  const flowLevels = Array.isArray(definition().nestedLevels) ? definition().nestedLevels.map((level) => level.label) : [];
  const lines = [
    appState.canvasReady[appState.template]
      ? `${definition().title}として、${performed}組み合わせを実施${absent ? `、${absent}組み合わせは最初から作らず` : ""}${unknown ? `、${unknown}組み合わせは未確認` : ""}として記録しています。`
      : "まだ条件表を作っていません。上の質問または貼り付けから始めます。",
    ...(orderedConditionNames.length
      ? [`${orderedConditionNames.join("、")}は入力した順番を保持します。同じ対象を順に測ったか、各条件で別の試料かは別に記録します。`]
      : []),
    ...(flow ? [`測定値の由来として、最初に${flow.outerLabel}を区別します。${sourceRelationCopy}${linkageCopy}${flowLevels.length > 1 ? ` ${flowLevels.join(" → ")}の順でIDを残します。` : ""}`] : []),
    ...(definition().axisValues?.length ? [`${definition().axisLabel ?? "時点・順序"}は ${definition().axisValues.join("、")} です。欠けた位置は空欄のまま保持します。`] : []),
    !appState.canvasReady[appState.template]
      ? "条件表ができたら、1つの条件の中で値をどのように得たか確認します。"
      : observationGuideIssue()
      ? "入力表の変更候補は現在の構造より複雑なため、自動適用せず、これまでの入力表とGraphを保持しています。"
      : appState.observationReady[appState.template] ? pattern().summary : "次に、1つの条件の中で値をどのように得たか確認します。まだ入力表の形は決めていません。",
    activeCount ? `${activeCount}件の入力値を現在のGraphに使用します。${excludedCount ? `${excludedCount}件は保持したまま利用対象から外しています。` : ""}` : "データを入力すると、まずGraphを作れます。",
    "どれを別々に始めた1回として数えるか、どの違いを確かめるかは、Statisticsを選んだ時点で不足分だけ確認します。",
  ];
  $("#summary-copy").innerHTML = lines.map((line) => `<p>${escapeHtml(line)}</p>`).join("");
}

function questionById(id) { return model().questions.find((item) => item.id === id); }

function comparisonScopes() {
  return comparisonScopeSuggestions(definition(), model(), { patternId: patternId() });
}

function selectedScope() {
  const id = appState.selectedAnalysisScopes[appState.template];
  return comparisonScopes().find((scope) => scope.id === id && !scope.unavailable) ?? null;
}

function statisticsScopeSignature(scope) {
  return JSON.stringify({
    patternId: patternId(),
    readoutId: readout().id,
    axisValues: definition().axisValues ?? [],
    conditionCellIds: scope.conditionCellIds,
  });
}

function statisticsAnswersForScope(scope) {
  const signature = statisticsScopeSignature(scope);
  const byTemplate = appState.statisticsAnswersByScope[appState.template] ?? {};
  return { ...model().answers, ...(byTemplate[signature] ?? {}) };
}

function statisticsStateForScope(scope) {
  return { ...model(), answers: statisticsAnswersForScope(scope) };
}

function setStatisticsAnswerForScope(scope, questionId, answer) {
  const signature = statisticsScopeSignature(scope);
  const byTemplate = appState.statisticsAnswersByScope[appState.template] ?? {};
  appState.statisticsAnswersByScope[appState.template] = {
    ...byTemplate,
    [signature]: { ...(byTemplate[signature] ?? {}), [questionId]: answer },
  };
}

function renderComparisonScopes() {
  const scopes = comparisonScopes();
  const available = scopes.filter((scope) => !scope.unavailable);
  if (!selectedScope() && available.length === 1) appState.selectedAnalysisScopes[appState.template] = available[0].id;
  const selected = selectedScope();
  const list = $("#comparison-scope-list");
  if (!scopes.length) {
    list.innerHTML = `<h3 class="comparison-scope-heading">どの違いを確かめますか？</h3><div class="scope-card unavailable"><div><strong>比較候補をまだ作れません</strong><small>実施した条件を2つ以上にするか、順序に沿った測定を確認してください。</small></div></div>`;
    return;
  }
  list.innerHTML = `<h3 class="comparison-scope-heading">どの違いを確かめますか？</h3><p class="supporting-copy">条件表上で揃っている候補です。選んだ後、その範囲に必要な実験上の事実だけを確認します。</p>${scopes.map((scope) => {
    const active = selected?.id === scope.id;
    const labels = scope.conditionCellIds.map((id) => conditionById(id)?.label).filter(Boolean).join("、");
    if (scope.unavailable) {
      return `<div class="scope-card unavailable" data-state="unavailable"><div><strong>${escapeHtml(scope.label)}</strong><small>${escapeHtml(scope.reason)} 値は削除されず、Graphには残せます。</small></div><button type="button" disabled>現在は選べません</button></div>`;
    }
    return `<div class="scope-card${active ? " selected" : ""}" aria-selected="${active}"><div><strong>${escapeHtml(scope.label)}</strong><small>${escapeHtml(labels)}</small></div><button type="button" class="scope-choice" data-scope-id="${escapeHtml(scope.id)}" aria-pressed="${active}">${active ? "選択中" : "この範囲を選ぶ"}</button></div>`;
  }).join("")}${selected ? `<p class="guide-result ready">今回使う条件：${escapeHtml(selected.conditionCellIds.map((id) => conditionById(id)?.label).filter(Boolean).join("、"))}。選ばない条件と値も削除されません。</p>` : ""}`;
  $$('[data-scope-id]').forEach((button) => button.addEventListener("click", () => {
    appState.selectedAnalysisScopes[appState.template] = button.dataset.scopeId;
    renderQuestions();
    updateReadiness();
  }));
}

function renderQuestions() {
  renderComparisonScopes();
  const scope = selectedScope();
  const duplicates = coordinateConflicts();
  if (mappingConflict() || observationGuideIssue() || duplicates.length) {
    $("#question-count").textContent = "入力済みデータの対応付け待ち";
    $("#question-list").innerHTML = duplicates.length
      ? `<div class="question-item"><strong>先に、同じ対象・条件・時点に入っている複数の値を確認してください。</strong><p class="supporting-copy">raw値とGraphはすべて保持しています。どれかを推測で削除・平均しません。</p></div>`
      : `<div class="question-item"><strong>先に、変更した入力表と既存データの対応を確定してください。</strong><p class="supporting-copy">元のGraphとデータは保持しています。別の実験構造へ自動変換しません。</p></div>`;
    return;
  }
  if (!scope) {
    $("#question-count").textContent = "比較範囲を選択";
    $("#question-list").innerHTML = `<div class="question-item"><strong>まず、上から確かめたい違いを選んでください。</strong><p class="supporting-copy">条件表全体が不完全でも、成立する一部分を明示的に選べます。不足する組み合わせは補いません。</p></div>`;
    return;
  }
  const scopeState = statisticsStateForScope(scope);
  const readiness = evaluateComparisonScopeReadiness(scopeState, { conditionCellIds: scope.conditionCellIds, readoutId: readout().id });
  if (!readiness.graphReady) {
    const missing = [...readiness.unknownConditionCellIds, ...readiness.notPerformedConditionCellIds, ...readiness.unmeasuredConditionCellIds]
      .map((id) => conditionById(id)?.label).filter(Boolean);
    $("#question-count").textContent = "選択範囲のデータ待ち";
    $("#question-list").innerHTML = `<div class="question-item"><strong>この比較に必要な条件のデータがそろっていません。</strong><p class="supporting-copy">確認する条件：${escapeHtml(missing.join("、"))}。0や別条件の値で補いません。</p></div>`;
    return;
  }
  const nextId = readiness.unresolvedQuestionIds[0];
  if (!nextId) {
    $("#question-count").textContent = "必要情報がそろいました";
    $("#question-list").innerHTML = `<div class="question-item"><strong>このprototypeで必要な実験上の事実がそろいました。</strong><p class="supporting-copy">実製品では、ここから解析候補ごとの成立条件を診断します。</p></div>`;
    return;
  }
  const item = questionById(nextId);
  $("#question-count").textContent = `次の1項目 · 残り${readiness.unresolvedQuestionIds.length}`;
  const selected = scopeState.answers[nextId] ?? "select";
  $("#question-list").innerHTML = `<div class="question-item"><label for="question-${escapeHtml(nextId)}">${escapeHtml(item.wording)}</label><select id="question-${escapeHtml(nextId)}" data-question-id="${escapeHtml(nextId)}">${item.options.map(([value, label]) => `<option value="${escapeHtml(value)}"${selected === value ? " selected" : ""}>${escapeHtml(label)}</option>`).join("")}</select>${["unknown", "other", "not_decided", "select"].includes(selected) && selected !== "select" ? '<p class="supporting-copy">この回答では意味を安全に確定できないため、Statisticsは保留します。Graphと入力済みデータはそのまま残ります。</p>' : ""}</div>`;
  $('[data-question-id]')?.addEventListener("change", (event) => {
    setStatisticsAnswerForScope(scope, event.target.dataset.questionId, event.target.value);
    renderQuestions();
    renderSummary();
    updateReadiness();
    $('[data-question-id]')?.focus();
  });
}

function updateReadiness() {
  const retainedCount = model().observations.filter(meaningful).length;
  const retainedRow = $("#data-retention-readiness");
  retainedRow.classList.toggle("ready", retainedCount > 0);
  retainedRow.querySelector("strong").textContent = `${retainedCount}件`;
  const graphState = evaluateReadiness(model(), { intent: "graph", readoutId: readout().id });
  const graphableRecords = graphRecords();
  const graphUsable = graphState.ready && graphableRecords.length > 0;
  const researcherGraphReady = graphableRecords.some((item) => item.observation.provenance?.sourceKind !== "prototype_example");
  const derivationIssueCount = activeMeasurementDerivationIssues().length;
  const sampleOnly = graphUsable && !researcherGraphReady;
  const graphRow = $("#graph-readiness");
  graphRow.classList.toggle("ready", graphUsable);
  graphRow.querySelector("strong").textContent = graphUsable
    ? "準備完了"
    : derivationIssueCount
      ? "入力値を確認"
      : "入力待ち";
  const scope = selectedScope();
  const statsState = scope
    ? evaluateComparisonScopeReadiness(statisticsStateForScope(scope), { conditionCellIds: scope.conditionCellIds, readoutId: readout().id })
    : { ready: false, graphReady: graphState.ready, unresolvedQuestionIds: [], unknownConditionCellIds: [] };
  const statsRow = $("#statistics-readiness");
  const duplicateBlocked = coordinateConflicts().length > 0;
  const mappingBlocked = Boolean(mappingConflict()) || Boolean(observationGuideIssue()) || duplicateBlocked;
  statsRow.classList.toggle("ready", statsState.ready && !mappingBlocked && !sampleOnly);
  const statisticsOpen = appState.intent === "statistics" || !$("#statistics-questions").classList.contains("hidden");
  const unresolved = statsState.unresolvedQuestionIds.length + statsState.unknownConditionCellIds.length;
  statsRow.querySelector("strong").textContent = duplicateBlocked
    ? "重複値を確認"
    : !researcherGraphReady && derivationIssueCount
    ? "入力値を確認"
    : sampleOnly
    ? "実データ待ち"
    : mappingBlocked
    ? "データ対応付け待ち"
    : statsState.ready
    ? "準備完了"
    : statisticsOpen
    ? (scope ? `${unresolved}件を確認` : "比較範囲を選択")
    : "必要時に確認";
  $("#graph-button").disabled = !graphUsable;
  $("#statistics-button").disabled = !researcherGraphReady || !appState.observationReady[appState.template] || Boolean(mappingConflict()) || Boolean(observationGuideIssue()) || duplicateBlocked;
  $("#safety-note").textContent = mappingBlocked
    ? "入力済みデータと元のGraphを残し、新しい構造へは自動変換しません。"
    : sampleOnly
    ? "白抜きのサンプル値はGraphの入力例だけに使います。Statisticsには実データを入力してください。"
    : statsState.ready
    ? "入力済みデータを保持したまま、Statisticsへ進める状態です。"
    : "Graphは先に作れます。Statisticsでは、結論を変える不足情報だけを1件ずつ確認します。";
}

function addBlankObservation() {
  const first = activeConditionCells()[0];
  if (!first) return;
  if (patternId() === "same_entity_sequence") {
    const entityId = `${first.label}-${Date.now().toString().slice(-4)}`;
    for (const time of definition().axisValues) addRecord(newObservation(first.id, blankReadoutFields({ time }), entityId, true));
  } else if (patternId() === "nested_sequence") {
    const entityId = `${first.id}-tracked-${Date.now().toString().slice(-4)}`;
    const hierarchy = Object.fromEntries(nestedLevelDefinitions().map((level) => [level.key, ""]));
    for (const time of definition().axisValues) addRecord(newObservation(first.id, blankReadoutFields({ ...hierarchy, time }), entityId, true));
  } else if (["same_entity_conditions", "matched_source_conditions"].includes(patternId())) {
    const entityId = `Subject-${appState.nextObservationId}`;
    for (const cell of activeConditionCells()) addRecord(newObservation(cell.id, blankReadoutFields(patternId() === "matched_source_conditions" ? { sourceSampleId: "" } : {}), entityId, true));
  } else addRecord(newObservation(first.id, blankReadoutFields(), "", true));
  renderDataTable();
}

function exampleMeasurementFields(index) {
  if (readout().kind === READOUT_KIND.POSITIVE_TOTAL) {
    const total = 48 + (index % 4) * 7;
    return { positive: Math.round(total * (0.25 + (index % 5) * 0.1)), total };
  }
  if (readout().kind === READOUT_KIND.RELATED_VALUES) {
    return Object.fromEntries(readoutFieldSpecs().map((field, fieldIndex) => [field.key, Number((8 + index * 1.7 + fieldIndex * 3.1).toFixed(2))]));
  }
  return { [readout().valueField ?? "value"]: 8 + index * 1.7 };
}

function exampleObservationsForCurrentSurface() {
  const records = [];
  let index = 0;
  const add = (cell, entityId, extra = {}) => {
    index += 1;
    records.push({
      id: `${appState.template}-input-example-${index}`,
      conditionCellId: cell.id,
      readoutId: readout().id,
      entityId,
      fields: { ...extra, ...exampleMeasurementFields(index) },
    });
  };
  if (["same_entity_conditions", "matched_source_conditions"].includes(patternId())) {
    for (let subject = 1; subject <= 3; subject += 1) {
      for (const cell of activeConditionCells()) add(cell, `Example-${subject}`, patternId() === "matched_source_conditions" ? { sourceSampleId: `${cell.label}-sample-${subject}` } : {});
    }
  } else if (patternId() === "same_entity_sequence") {
    for (const cell of activeConditionCells()) {
      for (let track = 1; track <= 2; track += 1) {
        for (const time of definition().axisValues) add(cell, `Example-${track}`, { time });
      }
    }
  } else if (patternId() === "distinct_entity_sequence") {
    for (const cell of activeConditionCells()) {
      for (const time of definition().axisValues) add(cell, `Example-${time}-${index + 1}`, { time });
    }
  } else if (patternId() === "nested_records") {
    const levels = nestedLevelDefinitions();
    const combinations = [];
    const visit = (levelIndex, fields) => {
      if (levelIndex === levels.length) { combinations.push(fields); return; }
      const level = levels[levelIndex];
      for (let valueIndex = 1; valueIndex <= 2; valueIndex += 1) {
        visit(levelIndex + 1, { ...fields, [level.key]: `${level.label}-${valueIndex}` });
      }
    };
    visit(0, {});
    for (const cell of activeConditionCells()) {
      for (const fields of combinations) add(cell, fields[levels[0].key], fields);
    }
  } else if (patternId() === "nested_sequence") {
    const levels = nestedLevelDefinitions();
    for (const cell of activeConditionCells()) {
      for (let track = 1; track <= 2; track += 1) {
        const hierarchy = Object.fromEntries(levels.map((level, levelIndex) => [level.key, `${level.label}-${levelIndex === levels.length - 1 ? track : 1}`]));
        for (const time of definition().axisValues) add(cell, `${cell.id}-track-${track}`, { ...hierarchy, time });
      }
    }
  } else {
    for (const cell of activeConditionCells()) {
      for (let record = 1; record <= 3; record += 1) add(cell, `Example-${record}`);
    }
  }
  return records;
}

function loadDemoData() {
  const current = { ...model(), observations: model().observations.filter(meaningfulOrExample) };
  const examples = exampleObservationsForCurrentSurface();
  setModel(mergeExampleObservations(current, examples, { exampleSetId: `${appState.template}-${patternId()}` }));
  appState.mappingConflicts[appState.template] = null;
  appState.observationGuideIssues[appState.template] = null;
  renderAll();
}

function removeDemoData() {
  setModel({
    ...model(),
    observations: model().observations.filter((observation) => observation.provenance?.sourceKind !== "prototype_example"),
  });
  renderAll();
}

function splitDelimitedLine(line, delimiter) {
  const cells = [];
  let value = "";
  let quoted = false;
  for (let index = 0; index < line.length; index += 1) {
    const char = line[index];
    if (char === '"') {
      if (quoted && line[index + 1] === '"') { value += '"'; index += 1; }
      else quoted = !quoted;
    } else if (char === delimiter && !quoted) { cells.push(value.trim()); value = ""; }
    else value += char;
  }
  cells.push(value.trim());
  return cells;
}

function pasteHeaders() {
  const valueHeaders = readout().kind === READOUT_KIND.POSITIVE_TOTAL
    ? ["Positive", "Total"]
    : readout().kind === READOUT_KIND.RELATED_VALUES
      ? readoutFieldSpecs().map((field) => field.label)
      : ["Value"];
  if (patternId() === "typed_record") return ["Condition", "ID", ...valueHeaders];
  if (patternId() === "nested_records") {
    const levelHeaders = nestedLevelDefinitions().map((level) => level.label);
    return ["Condition", ...levelHeaders, ...valueHeaders];
  }
  if (patternId() === "nested_sequence") return ["Condition", ...nestedLevelDefinitions().map((level) => level.label), definition().axisLabel ?? "Time", ...valueHeaders];
  if (patternId() === "same_entity_sequence") return ["Condition", "ID", definition().axisLabel ?? "Time", ...valueHeaders];
  if (patternId() === "distinct_entity_sequence") return ["Condition", definition().axisLabel ?? "Time", "ID", ...valueHeaders];
  if (patternId() === "matched_source_conditions") return ["Condition", "Source ID", "Condition sample ID", ...valueHeaders];
  return ["Condition", "ID", ...valueHeaders];
}

function pastedMeasurementFields(values, startIndex) {
  return Object.fromEntries(readoutFieldSpecs().map((field, index) => [field.key, values[startIndex + index]]));
}

function applyPastedTable(text) {
  const lines = text.replace(/\r/g, "").split("\n").filter((line) => line.trim());
  if (lines.length < 2) throw new Error("見出しと1行以上のデータが必要です。");
  const delimiter = lines[0].includes("\t") ? "\t" : ",";
  const headers = splitDelimitedLine(lines[0], delimiter);
  const expected = pasteHeaders();
  if (headers.length !== expected.length || expected.some((header, index) => headers[index]?.toLowerCase() !== header.toLowerCase())) {
    throw new Error(`見出しは ${expected.join(" / ")} の順にしてください。`);
  }
  const byLabel = new Map(model().conditionCells.map((cell) => [cell.label.toLowerCase(), cell]));
  const pendingObservations = [];
  let imported = 0;
  for (const line of lines.slice(1)) {
    const values = splitDelimitedLine(line, delimiter);
    if (values.length !== expected.length) throw new Error(`${imported + 2}行目の列数が一致しません。`);
    const cell = byLabel.get(values[0].toLowerCase());
    if (!cell) throw new Error(`${imported + 2}行目の条件「${values[0]}」は条件表にありません。`);
    if (patternId() === "same_entity_sequence") {
      pendingObservations.push(newObservation(cell.id, { time: values[2], ...pastedMeasurementFields(values, 3) }, values[1]));
    } else if (patternId() === "typed_record") {
      pendingObservations.push(newObservation(cell.id, pastedMeasurementFields(values, 2), values[1]));
    } else if (patternId() === "nested_records") {
      const levels = nestedLevelDefinitions();
      const fields = Object.fromEntries(levels.map((level, index) => [level.key, values[index + 1]]));
      const valueStart = levels.length + 1;
      Object.assign(fields, pastedMeasurementFields(values, valueStart));
      pendingObservations.push(newObservation(cell.id, fields, values[1]));
    } else if (patternId() === "nested_sequence") {
      const levels = nestedLevelDefinitions();
      const fields = Object.fromEntries(levels.map((level, index) => [level.key, values[index + 1]]));
      const axisIndex = levels.length + 1;
      fields.time = values[axisIndex];
      Object.assign(fields, pastedMeasurementFields(values, axisIndex + 1));
      const entityId = `${cell.id}|${levels.map((level) => fields[level.key]).join("|")}`;
      pendingObservations.push(newObservation(cell.id, fields, entityId));
    } else if (patternId() === "distinct_entity_sequence") {
      pendingObservations.push(newObservation(cell.id, { time: values[1], ...pastedMeasurementFields(values, 3) }, values[2]));
    } else if (patternId() === "matched_source_conditions") {
      pendingObservations.push(newObservation(cell.id, { sourceSampleId: values[2], ...pastedMeasurementFields(values, 3) }, values[1]));
    } else pendingObservations.push(newObservation(cell.id, pastedMeasurementFields(values, 2), values[1]));
    imported += 1;
  }
  // Paste is atomic: validate and construct every row first. Only after all
  // rows succeed are empty UI placeholders removed and raw records committed.
  let nextState = { ...model(), observations: model().observations.filter(meaningful) };
  for (const observation of pendingObservations) nextState = upsertObservation(nextState, observation);
  setModel(nextState);
  return imported;
}

function readGuideAnswers() {
  const countAnswer = $("#guide-dimension-count").value;
  const count = ["0", "1", "2"].includes(countAnswer) ? Number(countAnswer) : 0;
  const dimensions = Array.from({ length: count }, (_unused, index) => ({
    label: $(`#guide-dimension-${index + 1}-label`).value,
    valuesText: guideLevelGridText(index + 1),
    entries: guideLevelGridEntries(index + 1),
    kind: $(`#guide-dimension-${index + 1}-ordered`).checked ? "ordered" : "nominal",
    unit: $(`#guide-dimension-${index + 1}-ordered`).checked ? $(`#guide-dimension-${index + 1}-unit`).value : "",
  }));
  const observation = observationGuideAnswer();
  return {
    schemaVersion: GUIDED_ENTRY_VERSION,
    conditionChangeCount: countAnswer,
    experimentLabel: $("#guide-experiment-name").value,
    dimensions,
    combinationAnswer: $("#guide-combinations").checked ? "review_each" : "all_performed",
    measurement: {
      label: $("#guide-measurement-name").value,
      form: $("#guide-measurement-form").value,
      relatedFieldsText: relatedValueText(),
    },
    observation: {
      shape: observation.shape,
      sequenceIdentity: observation.sequenceIdentity,
      identityKind: observation.identityKind,
      axisValuesText: $("#sequence-values").value,
      axisUnit: $("#sequence-axis-unit").value,
      axisLabel: $("#sequence-axis-label").value,
      nestedParentLabel: $("#nested-parent-label").value,
      nestedChildLabels: $("#nested-child-labels").value,
      sourceRelation: observation.sourceRelation,
      sourceLinkage: observation.sourceLinkage,
      outerCount: $("#outer-unit-count").value,
    },
  };
}

function updateDimensionVisibility() {
  const raw = $("#guide-dimension-count").value;
  $(".builder").dataset.entryStarted = String(raw !== "unknown");
  const count = ["0", "1", "2"].includes(raw) ? Number(raw) : 0;
  $$('[data-guide-dimension]').forEach((item) => item.classList.toggle("hidden", Number(item.dataset.guideDimension) > count));
  $$('[data-guide-after-conditions]').forEach((item) => item.classList.toggle("hidden", !["0", "1", "2"].includes(raw)));
  $("#guide-related-values-panel").classList.toggle("hidden", $("#guide-measurement-form").value !== "multiple_related");
  const status = $("#guide-build-status");
  if (raw === "3plus") {
    status.dataset.state = "error";
    status.dataset.reason = "unsupported-dimensions";
    status.textContent = "このprototypeの条件表は処理・群分け2種類までです。3種類以上を別の2種類へ読み替えず、ここで安全に停止します。入力内容は保持します。";
  } else if (status.dataset.reason === "unsupported-dimensions") {
    status.dataset.state = "";
    delete status.dataset.reason;
    status.textContent = "";
  }
}

const GUIDE_EXAMPLES = {
  simple: {
    experimentLabel: "薬剤処理によるシグナル変化",
    dimensions: [{ label: "処理", valuesText: "Control\nDrug", kind: "nominal" }],
    combinationAnswer: "all_performed",
    measurement: { label: "シグナル強度", form: "scalar" },
    observation: { outerLabel: "culture dish", outerCount: "", sourceRelation: "separate", childLabels: "", hasSequence: false, sequenceIdentity: "unknown", axisValuesText: "" },
  },
  sirna: {
    experimentLabel: "siRNAとDoxによるciliated cell変化",
    dimensions: [
      { label: "siRNA", valuesText: "control\nGene A: #1, #2, #3\nGene B: #1, #2, #3", kind: "nominal" },
      { label: "Dox", valuesText: "−\n+", kind: "nominal" },
    ],
    combinationAnswer: "review_each",
    measurement: { label: "ciliated cells", form: "positive_total" },
    observation: { outerLabel: "culture dish", outerCount: "", sourceRelation: "separate", childLabels: "視野, Cell", hasSequence: false, sequenceIdentity: "unknown", axisValuesText: "" },
  },
  time: {
    experimentLabel: "live-cell蛍光の経時変化",
    dimensions: [{ label: "処理", valuesText: "Vehicle\nStimulus", kind: "nominal" }],
    combinationAnswer: "all_performed",
    measurement: { label: "蛍光強度", form: "scalar" },
    observation: { outerLabel: "Cell", outerCount: "", sourceRelation: "separate", childLabels: "", hasSequence: true, sequenceIdentity: "same", axisLabel: "時間", axisUnit: "min", axisValuesText: "0, 5, 15, 30, 60" },
  },
};

function writeGuideForm(example) {
  example = prepareGuideExampleForVisibleStep(example);
  $("#guide-experiment-name").value = example.experimentLabel;
  $("#guide-dimension-count").value = String(example.conditionChangeCount ?? example.dimensions.length);
  for (let index = 0; index < 2; index += 1) {
    const dimension = example.dimensions[index];
    if (!dimension) continue;
    $(`#guide-dimension-${index + 1}-label`).value = dimension.label;
    appState.guideLevelModes[index + 1] = Array.isArray(dimension.entries)
      ? (dimension.entries.some((entry) => entry.groupLabel) ? "grouped" : "simple")
      : (/[:：]/.test(dimension.valuesText) ? "grouped" : "simple");
    appState.guideLevelGrids[index + 1] = levelGridFromText(dimension.valuesText, appState.guideLevelModes[index + 1]);
    syncGuideLevelText(index + 1);
    renderGuideLevelGrid(index + 1);
    $(`#guide-dimension-${index + 1}-ordered`).checked = dimension.kind === "ordered";
    $(`#guide-dimension-${index + 1}-unit`).value = dimension.unit ?? "";
    $(`[data-guide-unit="${index + 1}"]`).classList.toggle("hidden", dimension.kind !== "ordered");
  }
  $("#guide-combinations").checked = example.combinationAnswer === "review_each";
  $("#guide-measurement-name").value = example.measurement.label;
  $("#guide-measurement-form").value = example.measurement.form;
  appState.relatedValueGrid = createSpreadsheetGrid({ rowCount: 3, columnCount: 1, cells: String(example.measurement.relatedFieldsText ?? "").split(/\r?\n/).filter(Boolean).map((value) => [value]) });
  renderRelatedValueGrid();
  $("#nested-parent-label").value = "";
  $("#outer-unit-count").value = "";
  $("#source-relation").value = "unknown";
  $("#source-linkage").value = "unknown";
  $("#observation-layout").value = "unknown";
  $("#nested-child-labels").value = "";
  setHierarchyLevelText("");
  renderHierarchyLevelGrid();
  appState.hierarchyExpandedByTemplate[appState.template] = false;
  $("#has-sequence-axis").checked = false;
  $("#sequence-identity").value = "unknown";
  $("#sequence-values").value = "";
  $("#sequence-axis-label").value = "";
  $("#sequence-axis-unit").value = "";
  updateObservationSourceCopy();
  const observation = observationGuideAnswer();
  $("#observation-shape").value = observation.shape;
  $("#condition-identity-kind").value = observation.identityKind;
  setObservationFollowupVisibility();
  updateDimensionVisibility();
}

function clearGuideForm() {
  $("#guide-experiment-name").value = "";
  $("#guide-dimension-count").value = "unknown";
  for (let index = 1; index <= 2; index += 1) {
    $(`#guide-dimension-${index}-label`).value = "";
    appState.guideLevelModes[index] = "simple";
    appState.guideLevelGrids[index] = createSpreadsheetGrid({ rowCount: 10, columnCount: 6 });
    syncGuideLevelText(index);
    renderGuideLevelGrid(index);
    $(`#guide-dimension-${index}-ordered`).checked = false;
    $(`#guide-dimension-${index}-unit`).value = "";
    $(`[data-guide-unit="${index}"]`).classList.add("hidden");
  }
  $("#guide-combinations").checked = false;
  $("#guide-measurement-name").value = "";
  $("#guide-measurement-form").value = "unknown";
  appState.relatedValueGrid = createSpreadsheetGrid({ rowCount: 3, columnCount: 1 });
  renderRelatedValueGrid();
  $("#observation-shape").value = "unknown";
  $("#sequence-identity").value = "unknown";
  $("#condition-identity-kind").value = "unknown";
  $("#source-relation").value = "unknown";
  $("#source-linkage").value = "unknown";
  $("#observation-layout").value = "unknown";
  $("#outer-unit-count").value = "";
  $("#has-sequence-axis").checked = false;
  $("#sequence-axis-label").value = "";
  $("#sequence-axis-unit").value = "";
  $("#sequence-values").value = "";
  $("#nested-parent-label").value = "";
  $("#nested-child-labels").value = "";
  setHierarchyLevelText("");
  renderHierarchyLevelGrid();
  updateObservationSourceCopy();
  setObservationFollowupVisibility();
  updateDimensionVisibility();
}

function modelHasResearcherData(candidate) {
  return candidate?.observations?.some(researcherMeaningful) ?? false;
}

function nextCustomKey() {
  const numeric = Object.keys(templateDefinitions)
    .filter((key) => key === "custom" || key.startsWith("custom-"))
    .map((key) => key === "custom" ? 1 : Number(key.slice(7)))
    .filter(Number.isFinite);
  return `custom-${Math.max(1, ...numeric) + 1}`;
}

function renderRetainedDrafts() {
  const keys = Object.keys(templateDefinitions).filter((key) => key === "custom" || key.startsWith("custom-"));
  const panel = $("#retained-drafts");
  panel.classList.toggle("hidden", keys.length < 2);
  if (keys.length < 2) { panel.innerHTML = ""; return; }
  panel.innerHTML = `<strong>保持している条件表</strong><span>新しい条件表を作っても、以前に入力した値は残ります。</span><div>${keys.map((key) => {
    const count = appState.models[key]?.observations.filter(meaningful).length ?? 0;
    return `<button type="button" class="quiet-button${key === appState.template ? " active" : ""}" data-draft-key="${escapeHtml(key)}" aria-pressed="${key === appState.template}">${escapeHtml(templateDefinitions[key].title)}${count ? `（${count}件）` : ""}</button>`;
  }).join("")}</div>`;
  $$('[data-draft-key]').forEach((button) => button.addEventListener("click", () => {
    cancelScheduledNestedGuide();
    appState.template = button.dataset.draftKey;
    appState.intent = "graph";
    $("#statistics-questions").classList.add("hidden");
    syncObservationControls();
    renderAll();
  }));
}

function applyCustomDefinition(nextDefinition, statusNode) {
  let targetKey = appState.template.startsWith("custom") ? appState.template : "custom";
  if (modelHasResearcherData(appState.models[targetKey])) targetKey = nextCustomKey();
  templateDefinitions[targetKey] = nextDefinition;
  appState.models[targetKey] = createPrototypeState(nextDefinition.fixture);
  appState.selectedPatterns[targetKey] = nextDefinition.defaultPattern;
  appState.mappingConflicts[targetKey] = null;
  appState.observationGuideIssues[targetKey] = null;
  appState.canvasReady[targetKey] = true;
  appState.observationReady[targetKey] = !nextDefinition.observationPending;
  appState.selectedAnalysisScopes[targetKey] = null;
  appState.statisticsAnswersByScope[targetKey] = {};
  appState.measurementViews[targetKey] = MEASUREMENT_VIEW_MODE.COMPACT;
  appState.designDisclosureByTemplate[targetKey] = {
    expandedStep: "canvas",
    conditionAcknowledged: false,
  };
  appState.hierarchyExpandedByTemplate[targetKey] = false;
  appState.template = targetKey;
  appState.intent = "graph";
  appState.nextObservationId = 1;
  $$('.template').forEach((item) => item.classList.remove("active"));
  $("#statistics-questions").classList.add("hidden");
  statusNode.dataset.state = "ready";
  statusNode.textContent = targetKey === "custom"
    ? "条件表を作りました。各マスが実際と合っているか確認してください。"
    : "新しい条件表を別の下書きとして作りました。以前の入力値も保持しています。";
  syncObservationControls();
  renderAll();
  focusWithoutScroll($("#canvas-title"));
}

function reportBuildIssues(result, statusNode) {
  const issue = result.issues?.[0];
  statusNode.dataset.state = "error";
  statusNode.textContent = issue?.message ?? "条件表を作れませんでした。入力内容を確認してください。";
  disclosureState().expandedStep = "conditions";
  renderDesignDisclosure();
  const direct = statusNode.id === "direct-build-status";
  const fieldByQuestion = direct ? {
    ASK_EXPERIMENT_LABEL: "#direct-experiment-name",
    ASK_DIMENSION_1: "#direct-row-label",
    ASK_DIMENSION_2: "#direct-column-label",
    ASK_MEASUREMENT: "#direct-measurement-name",
    ASK_MEASUREMENT_FORM: "#direct-measurement-form",
    ASK_RELATED_FIELDS: "#direct-related-values",
    ASK_DIRECT_MATRIX: "#direct-condition-grid .spreadsheet-input",
  } : {
    ASK_EXPERIMENT_LABEL: "#guide-experiment-name",
    ASK_CONDITION_CHANGE_COUNT: "#guide-dimension-count",
    ASK_DIMENSION_1: "#guide-dimension-1-grid .spreadsheet-input",
    ASK_DIMENSION_2: "#guide-dimension-2-grid .spreadsheet-input",
    ASK_MEASUREMENT: "#guide-measurement-name",
    ASK_MEASUREMENT_FORM: "#guide-measurement-form",
    ASK_RELATED_FIELDS: "#guide-related-grid .spreadsheet-input",
  };
  const field = $(fieldByQuestion[issue?.questionId] ?? "#guide-experiment-name");
  if (field) { field.setAttribute("aria-invalid", "true"); field.focus(); }
}

function renderEntryMode() {
  const mode = appState.entryMode;
  $(".builder").dataset.entryStarted = String(mode !== "guided" || $("#guide-dimension-count").value !== "unknown");
  $$('[data-entry-mode]').forEach((button) => {
    const active = button.dataset.entryMode === mode;
    button.classList.toggle("active", active);
    button.setAttribute("aria-pressed", String(active));
  });
  $("#guided-entry-panel").classList.toggle("hidden", mode !== "guided");
  $("#direct-entry-panel").classList.toggle("hidden", mode !== "direct");
  $("#example-entry-panel").classList.toggle("hidden", mode !== "examples");
  if (mode === "direct") renderDirectConditionGrid();
}

function renderResearchContextPresentation() {
  const presentation = researchContextPresentation(appState.researchContext);
  const selector = $("#research-context");
  selector.value = appState.researchContext;
  $("#research-context-note").textContent = presentation.contextHint;
  $("#guide-experiment-name").placeholder = presentation.experimentPlaceholder;
  $("#guide-measurement-name").placeholder = presentation.measurementPlaceholder;
  $("#nested-parent-label").placeholder = presentation.sourcePlaceholder;
  $("#direct-experiment-name").placeholder = presentation.experimentPlaceholder;
  $("#direct-measurement-name").placeholder = presentation.measurementPlaceholder;
}

function adaptiveSurfaceReady() {
  return Boolean(appState.canvasReady[appState.template] && appState.observationReady[appState.template]);
}

function renderWorkspaceView() {
  const ready = adaptiveSurfaceReady();
  $(".builder").dataset.canvasReady = String(Boolean(appState.canvasReady[appState.template]));
  if (!ready && appState.workspaceView === "data") appState.workspaceView = "design";
  $("main.workspace").dataset.workspaceView = appState.workspaceView;
  $$('.workspace-tab[data-workspace-view]').forEach((button) => {
    const active = button.dataset.workspaceView === appState.workspaceView;
    button.classList.toggle("active", active);
    button.setAttribute("aria-pressed", String(active));
    if (button.dataset.workspaceView === "data") button.disabled = !ready;
  });
  $("#open-data-workspace-inline").disabled = !ready;
}

function renderAll() {
  renderWorkspaceView();
  renderCanvas();
  renderPatternPicker();
  renderDataTable();
  renderSummary();
  renderQuestions();
  renderGraph();
  updateReadiness();
  renderRetainedDrafts();
  renderDesignDisclosure();
}

$$('[data-template]').forEach((button) => button.addEventListener("click", () => {
  cancelScheduledNestedGuide();
  appState.template = button.dataset.template;
  appState.intent = "graph";
  $$('.template').forEach((item) => item.classList.toggle("active", item === button));
  $$('.template').forEach((item) => item.setAttribute("aria-pressed", String(item === button)));
  $("#paste-panel").classList.add("hidden");
  $("#statistics-questions").classList.add("hidden");
  syncObservationControls();
  renderAll();
}));

$$('[data-intent]').forEach((button) => button.addEventListener("click", () => {
  appState.intent = button.dataset.intent;
  $$('.intent').forEach((item) => item.classList.toggle("active", item === button));
  $("#statistics-questions").classList.toggle("hidden", appState.intent !== "statistics");
  renderQuestions();
  updateReadiness();
  if (appState.intent === "statistics") revealWithPreferredMotion($("#statistics-questions"));
}));

$$('[data-entry-mode]').forEach((button) => button.addEventListener("click", () => {
  appState.entryMode = button.dataset.entryMode;
  renderEntryMode();
}));

$("#research-context").addEventListener("change", (event) => {
  Object.assign(appState, selectResearchContext(appState, event.target.value));
  renderResearchContextPresentation();
});

$("#conditions-step-summary").addEventListener("click", () => expandDesignStep("conditions", "#setup-title"));
$("#canvas-step-summary").addEventListener("click", () => expandDesignStep("canvas", "#canvas-title"));
$("#flow-step-summary").addEventListener("click", () => expandDesignStep("flow", "#observation-title"));
$$('[data-design-stage]').forEach((button) => button.addEventListener("click", () => {
  const focusTargets = { conditions: "#setup-title", canvas: "#canvas-title", flow: "#observation-title" };
  expandDesignStep(button.dataset.designStage, focusTargets[button.dataset.designStage]);
}));
$("#continue-to-observation").addEventListener("click", () => {
  const { unknown } = conditionStatusCounts();
  if (unknown) {
    $("#condition-review-status").textContent = `「まだ不明」が${unknown}組あります。先に各組み合わせを確認してください。`;
    return;
  }
  disclosureState().conditionAcknowledged = true;
  disclosureState().expandedStep = "flow";
  renderDesignDisclosure();
  focusWithoutScroll($("#observation-title"));
});

$("#guide-dimension-count").addEventListener("change", updateDimensionVisibility);
for (let dimensionNumber = 1; dimensionNumber <= 2; dimensionNumber += 1) {
  $(`[data-guide-add-level-row="${dimensionNumber}"]`).addEventListener("click", () => {
    const current = appState.guideLevelGrids[dimensionNumber];
    appState.guideLevelGrids[dimensionNumber] = createSpreadsheetGrid({ rowCount: current.rowCount + 1, columnCount: current.columnCount, cells: current.cells });
    renderGuideLevelGrid(dimensionNumber, { rowIndex: current.rowCount, columnIndex: 0 });
  });
  $(`[data-guide-toggle-level-groups="${dimensionNumber}"]`).addEventListener("click", () => {
    const leavingGrouped = appState.guideLevelModes[dimensionNumber] === "grouped";
    const hasGroups = leavingGrouped && guideLevelGridEntries(dimensionNumber).some((entry) => entry.groupLabel);
    if (hasGroups && !window.confirm("まとめ関係を外して、すべてを通常の条件名へ戻しますか？ 入力した条件名は残ります。")) return;
    setGuideLevelMode(dimensionNumber, leavingGrouped ? "simple" : "grouped");
  });
  $(`[data-guide-add-level-column="${dimensionNumber}"]`).addEventListener("click", () => {
    if (appState.guideLevelModes[dimensionNumber] !== "grouped") return;
    const current = appState.guideLevelGrids[dimensionNumber];
    appState.guideLevelGrids[dimensionNumber] = createSpreadsheetGrid({
      rowCount: current.rowCount,
      columnCount: current.columnCount + 1,
      cells: current.cells,
    });
    renderGuideLevelGrid(dimensionNumber, { rowIndex: 0, columnIndex: current.columnCount });
  });
  $(`#guide-dimension-${dimensionNumber}-ordered`).addEventListener("change", (event) => {
    $(`[data-guide-unit="${dimensionNumber}"]`).classList.toggle("hidden", !event.target.checked);
  });
}
$("#guide-related-add-row").addEventListener("click", () => {
  const current = appState.relatedValueGrid;
  appState.relatedValueGrid = createSpreadsheetGrid({ rowCount: current.rowCount + 1, columnCount: 1, cells: current.cells });
  renderRelatedValueGrid(current.rowCount);
});
$("#hierarchy-add-level").addEventListener("click", () => {
  const current = appState.hierarchyLevelGrid;
  appState.hierarchyLevelGrid = createSpreadsheetGrid({
    rowCount: 1,
    columnCount: current.columnCount + 1,
    cells: current.cells,
  });
  renderHierarchyLevelGrid(current.columnCount);
});
$("#show-hierarchy-guide").addEventListener("click", () => {
  appState.hierarchyExpandedByTemplate[appState.template] = true;
  renderHierarchyDisclosure();
  focusHierarchyLevelCell(0);
});
$("#hide-hierarchy-guide").addEventListener("click", () => {
  appState.hierarchyExpandedByTemplate[appState.template] = false;
  renderHierarchyDisclosure();
  focusWithoutScroll($("#show-hierarchy-guide"));
});
$("#guide-measurement-form").addEventListener("change", updateDimensionVisibility);
$("#direct-measurement-form").addEventListener("change", (event) => {
  $("#direct-related-values-panel").classList.toggle("hidden", event.target.value !== "multiple_related");
});
$$('[data-guide-example]').forEach((button) => button.addEventListener("click", () => {
  const example = GUIDE_EXAMPLES[button.dataset.guideExample];
  writeGuideForm(example);
  $$('[data-guide-example]').forEach((item) => item.setAttribute("aria-pressed", String(item === button)));
  const status = $("#guide-build-status");
  status.dataset.state = "ready";
  status.textContent = "例を質問欄に入れました。まだ現在の条件表やデータは変更していません。内容を確認してから条件表を作ってください。";
}));

$("#build-condition-matrix").addEventListener("click", () => {
  try {
    $$('#guided-entry-panel [aria-invalid="true"]').forEach((field) => field.removeAttribute("aria-invalid"));
    const answers = readGuideAnswers();
    const result = buildGuidedPrototypeDefinition(answers);
    if (result.status !== "ready") { reportBuildIssues(result, $("#guide-build-status")); return; }
    appState.guideAnswers = answers;
    const nestedLevels = ["multiple_inside", "combined"].includes(answers.observation.shape) ? nestedLevelsFromGuide() : null;
    const outerCount = $("#outer-unit-count").value.trim();
    const nextDefinition = {
      ...result.definition,
      ...(nestedLevels?.length > 1 ? { nestedLevels } : {}),
      axisLabel: answers.observation.axisLabel?.trim() || result.definition.axisLabel || null,
      materialFlow: answers.observation.nestedParentLabel?.trim() ? {
        outerLabel: answers.observation.nestedParentLabel.trim(),
        outerCount: outerCount && Number.isInteger(Number(outerCount)) ? Number(outerCount) : null,
        sourceRelation: answers.observation.sourceRelation,
        linkageAvailability: answers.observation.sourceLinkage,
      } : undefined,
    };
    applyCustomDefinition(nextDefinition, $("#guide-build-status"));
  } catch (error) {
    const status = $("#guide-build-status");
    status.dataset.state = "error";
    status.textContent = `入力表を生成できませんでした。入力内容は保持しています：${error.message}`;
  }
});

$("#build-pasted-matrix").addEventListener("click", () => {
  $$('#direct-entry-panel [aria-invalid="true"]').forEach((field) => field.removeAttribute("aria-invalid"));
  const result = buildPastedConditionDefinition({
    experimentLabel: $("#direct-experiment-name").value,
    rowLabel: $("#direct-row-label").value,
    columnLabel: $("#direct-column-label").value,
    measurementLabel: $("#direct-measurement-name").value,
    measurementForm: $("#direct-measurement-form").value,
    relatedFieldsText: $("#direct-related-values").value,
    matrixText: directConditionMatrixText(),
  });
  if (result.status !== "ready") { reportBuildIssues(result, $("#direct-build-status")); return; }
  applyCustomDefinition(result.definition, $("#direct-build-status"));
});

$("#direct-grid-add-row").addEventListener("click", () => {
  const current = appState.directConditionGrid;
  appState.directConditionGrid = createSpreadsheetGrid({
    rowCount: current.rowCount + 1,
    columnCount: current.columnCount,
    cells: current.cells,
  });
  renderDirectConditionGrid({ rowIndex: current.rowCount, columnIndex: 0 });
});
$("#direct-grid-add-column").addEventListener("click", () => {
  const current = appState.directConditionGrid;
  appState.directConditionGrid = createSpreadsheetGrid({
    rowCount: current.rowCount,
    columnCount: current.columnCount + 1,
    cells: current.cells,
  });
  renderDirectConditionGrid({ rowIndex: 0, columnIndex: current.columnCount });
});
$("#direct-grid-mark-performed").addEventListener("click", () => updateDirectGridStatuses("実施"));
$("#direct-grid-clear-statuses").addEventListener("click", () => updateDirectGridStatuses(""));

$("#source-relation").addEventListener("change", applyObservationGuide);
$("#source-linkage").addEventListener("change", applyObservationGuide);
$("#observation-layout").addEventListener("change", (event) => {
  const layout = event.target.value;
  if (["multiple_inside", "combined"].includes(layout)) {
    appState.hierarchyExpandedByTemplate[appState.template] = true;
  }
  setObservationFollowupVisibility();
  renderObservationQuestionVisibility();
  applyObservationGuide();
});
$("#has-sequence-axis").addEventListener("change", () => { setObservationFollowupVisibility(); applyObservationGuide(); });
$("#add-sequence-axis").addEventListener("click", () => {
  $("#observation-layout").value = hierarchyLevelText() ? "combined" : "sequence";
  setObservationFollowupVisibility();
  const hasRetainedData = model().observations.some(meaningful);
  appState.observationReady[appState.template] = hasRetainedData;
  appState.observationGuideIssues[appState.template] = hasRetainedData ? { questionId: "ASK_AXIS_VALUES" } : null;
  $("#observation-guide-result").dataset.state = "pending";
  $("#observation-guide-result").textContent = `時間・位置などの名前と値を入力してください。途中の欠測は空欄のまま残せます。${hasRetainedData ? " 現在の入力表・値・Graphは保持します。" : ""}`;
  renderWorkspaceView();
  renderPatternPicker();
  renderDataTable();
  renderSummary();
  updateReadiness();
  renderDesignDisclosure();
  $("#sequence-axis-label").focus();
});
$("#remove-sequence-axis").addEventListener("click", () => {
  $("#observation-layout").value = hierarchyLevelText() ? "multiple_inside" : "one_each";
  setObservationFollowupVisibility();
  applyObservationGuide();
  $("#observation-layout").focus();
});
$("#sequence-identity").addEventListener("change", applyObservationGuide);
$("#sequence-values").addEventListener("change", applyObservationGuide);
$("#sequence-axis-label").addEventListener("change", applyObservationGuide);
$("#sequence-axis-unit").addEventListener("change", applyObservationGuide);
let nestedGuideTimer;
let nestedGuideTemplate;
function cancelScheduledNestedGuide() {
  window.clearTimeout(nestedGuideTimer);
  nestedGuideTimer = undefined;
  nestedGuideTemplate = undefined;
}
const scheduleNestedGuide = () => {
  window.clearTimeout(nestedGuideTimer);
  nestedGuideTemplate = appState.template;
  nestedGuideTimer = window.setTimeout(() => {
    const scheduledTemplate = nestedGuideTemplate;
    nestedGuideTimer = undefined;
    nestedGuideTemplate = undefined;
    if (scheduledTemplate === appState.template) applyObservationGuide();
  }, 350);
};
function flushPendingObservationGuide() {
  if (nestedGuideTimer === undefined) return;
  const scheduledTemplate = nestedGuideTemplate;
  cancelScheduledNestedGuide();
  if (scheduledTemplate !== appState.template) return;
  // The hierarchy grid is the visible source of truth. Synchronize and map it
  // before opening Data so the first compact/help/summary render cannot use a
  // prior debounced hierarchy snapshot.
  syncHierarchyLevelText();
  applyObservationGuide();
}
$("#nested-parent-label").addEventListener("change", applyObservationGuide);
$("#nested-child-labels").addEventListener("change", applyObservationGuide);
$("#outer-unit-count").addEventListener("change", applyObservationGuide);
$("#nested-parent-label").addEventListener("input", () => {
  const outer = $("#hierarchy-outer-value");
  if (outer) outer.textContent = $("#nested-parent-label").value.trim() || "（最初の試料・対象）";
  updateObservationSourceCopy();
  renderObservationQuestionVisibility();
  scheduleNestedGuide();
});
$("#nested-child-labels").addEventListener("input", scheduleNestedGuide);
$("#outer-unit-count").addEventListener("input", scheduleNestedGuide);

$$('.workspace-tab[data-workspace-view]').forEach((button) => button.addEventListener("click", () => {
  if (button.dataset.workspaceView === "data") flushPendingObservationGuide();
  if (button.dataset.workspaceView === "data" && !adaptiveSurfaceReady()) return;
  appState.workspaceView = button.dataset.workspaceView;
  renderWorkspaceView();
  const designFocus = disclosureState().expandedStep === "conditions"
    ? $("#setup-title")
    : disclosureState().expandedStep === "canvas"
      ? $("#canvas-title")
      : $("#observation-title");
  focusWithoutScroll(appState.workspaceView === "data" ? $("#measurement-title") : designFocus);
}));
$$("[data-measurement-view]").forEach((button) => button.addEventListener("click", () => {
  if (!adaptiveSurfaceReady()) return;
  if (currentMeasurementView() === MEASUREMENT_VIEW_MODE.DETAIL) {
    // A view switch can render before blur/change in keyboard and automation
    // paths. Commit the visible stable-ID rows first so an entity ID or raw
    // component typed immediately before switching cannot disappear.
    commitRenderedDetailTable();
  }
  for (const input of $$('[data-compact-condition-input][data-compact-dirty="true"]')) {
    if (!commitCompactConditionInput(input)) {
      focusWithoutScroll(input);
      return;
    }
  }
  appState.measurementViews[appState.template] = button.dataset.measurementView;
  renderDataTable();
  focusWithoutScroll(
    currentMeasurementView() === MEASUREMENT_VIEW_MODE.DETAIL
      ? $("#data-table [data-sheet-editable]:not(:disabled)")
      : $("#data-table [data-compact-condition-input]:not(:disabled)"),
  );
}));
$("#open-data-workspace-inline").addEventListener("click", () => {
  flushPendingObservationGuide();
  if (!adaptiveSurfaceReady()) return;
  appState.workspaceView = "data";
  renderWorkspaceView();
  focusWithoutScroll($("#data-table [data-sheet-editable]:not(:disabled)"));
});

$("#mark-all-performed").addEventListener("click", () => setAllConditionStatuses(CONDITION_STATUS.PERFORMED));
$("#mark-all-unknown").addEventListener("click", () => setAllConditionStatuses(CONDITION_STATUS.UNKNOWN));

$("#add-row").addEventListener("click", addBlankObservation);
$("#paste-demo").addEventListener("click", loadDemoData);
$("#remove-demo").addEventListener("click", removeDemoData);
$("#paste-table").addEventListener("click", () => {
  $("#paste-panel").classList.remove("hidden");
  $("#paste-area").value ||= `${pasteHeaders().join("\t")}\n`;
  $("#paste-area").focus();
});
$("#cancel-paste").addEventListener("click", () => {
  $("#paste-panel").classList.add("hidden");
  focusWithoutScroll($("#paste-table"));
});
$("#apply-paste").addEventListener("click", () => {
  try {
    const imported = applyPastedTable($("#paste-area").value);
    $("#paste-message").textContent = `${imported}行を追加しました。既存データは削除していません。`;
    renderDataTable(); renderSummary(); renderGraph(); updateReadiness();
  } catch (error) {
    $("#paste-message").textContent = `読み取れませんでした（0行を追加）: ${error.message}`;
  }
});
$("#graph-button").addEventListener("click", () => revealWithPreferredMotion($("#mini-graph")));
$("#statistics-button").addEventListener("click", () => {
  appState.intent = "statistics";
  $$('.intent').forEach((item) => item.classList.toggle("active", item.dataset.intent === "statistics"));
  $("#statistics-questions").classList.remove("hidden");
  renderQuestions(); updateReadiness();
  revealWithPreferredMotion($("#statistics-questions"));
});
$("#reset-button").addEventListener("click", () => {
  const hasData = Object.values(appState.models).some(modelHasResearcherData);
  if (hasData && !window.confirm("このprototype内の入力を最初からやり直しますか？ 保存機能はまだありません。")) return;
  cancelScheduledNestedGuide();
  for (const key of Object.keys(templateDefinitions).filter((key) => key.startsWith("custom-"))) {
    delete templateDefinitions[key];
    delete appState.models[key];
    delete appState.selectedPatterns[key];
    delete appState.mappingConflicts[key];
    delete appState.observationGuideIssues[key];
    delete appState.canvasReady[key];
    delete appState.observationReady[key];
    delete appState.selectedAnalysisScopes[key];
    delete appState.statisticsAnswersByScope[key];
    delete appState.measurementViews[key];
    delete appState.designDisclosureByTemplate[key];
    delete appState.hierarchyExpandedByTemplate[key];
  }
  templateDefinitions.custom = initialGuidedBuild.definition;
  for (const key of Object.keys(templateDefinitions)) {
    appState.models[key] = createPrototypeState(templateDefinitions[key].fixture);
    appState.selectedPatterns[key] = templateDefinitions[key].defaultPattern;
    appState.mappingConflicts[key] = null;
    appState.observationGuideIssues[key] = null;
    appState.canvasReady[key] = key !== "custom";
    appState.observationReady[key] = !templateDefinitions[key].observationPending;
    appState.selectedAnalysisScopes[key] = null;
    appState.statisticsAnswersByScope[key] = {};
    appState.measurementViews[key] = MEASUREMENT_VIEW_MODE.COMPACT;
    appState.designDisclosureByTemplate[key] = {
      expandedStep: key === "custom" ? "conditions" : "flow",
      conditionAcknowledged: key !== "custom",
    };
    appState.hierarchyExpandedByTemplate[key] = Array.isArray(templateDefinitions[key].nestedLevels)
      && templateDefinitions[key].nestedLevels.length > 1;
  }
  appState.template = "custom";
  appState.intent = "graph";
  appState.entryMode = initialResearchContextIngress.entryMode;
  appState.workspaceView = "design";
  appState.guideAnswers = null;
  appState.nextObservationId = 1;
  appState.directConditionGrid = createSpreadsheetGrid({ rowCount: 6, columnCount: 4, cells: [["条件", "", "", ""]] });
  clearGuideForm();
  $$('.template').forEach((item) => { item.classList.remove("active"); item.setAttribute("aria-pressed", "false"); });
  $("#statistics-questions").classList.add("hidden");
  $("#paste-panel").classList.add("hidden");
  $("#guide-build-status").textContent = "";
  $("#direct-build-status").textContent = "";
  renderEntryMode();
  syncObservationControls();
  renderAll();
});

updateDimensionVisibility();
renderDirectConditionGrid();
renderGuideLevelGrid(1);
renderGuideLevelGrid(2);
renderRelatedValueGrid();
renderHierarchyLevelGrid();
renderEntryMode();
renderResearchContextPresentation();
syncObservationControls();
renderAll();

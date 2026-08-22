import { useEffect, useMemo, useState } from "react";

import { parseTabularClipboard, type ParsedTabularClipboard } from "@lsaa/data-sheet";

type BulkPasteSheet = {
  conditions: ReadonlyArray<{ id: string; label: string }>;
};

type BulkPasteScalarProps = {
  sheet: BulkPasteSheet;
  onApply: (
    conditionId: string,
    values: number[],
    source: { columnLabel: string; rowNumbers: number[] },
  ) => void;
};

type PasteMode = "imagej" | "excel" | "lines";

const pasteModeCopy: Record<PasteMode, { label: string; help: string; placeholder: string }> = {
  imagej: {
    label: "ImageJの結果表",
    help: "列名のあるタブ区切り表。単位ごとにまとめた平均値（Mean）などを選べます。",
    placeholder: "面積 / 平均値 / 1値",
  },
  excel: {
    label: "Excel・CSVの表",
    help: "ExcelまたはCSVを貼り付け、単位ごとにまとめた数値列を選びます。",
    placeholder: "サンプル,平均値 / A,10.2 / B,11.4",
  },
  lines: {
    label: "1行1値",
    help: "要約済みの値だけを、1行に1つ貼り付けます。",
    placeholder: "10.2 / 11.4 / 12.1",
  },
};

function parseText(text: string): ParsedTabularClipboard {
  return parseTabularClipboard(text);
}

export function BulkPasteScalar({ sheet, onApply }: BulkPasteScalarProps) {
  const [text, setText] = useState("");
  const [pasteMode, setPasteMode] = useState<PasteMode>("imagej");
  const [conditionId, setConditionId] = useState(sheet.conditions[0].id);
  const [parsed, setParsed] = useState<ParsedTabularClipboard>(() => parseText(""));
  const [columnIndex, setColumnIndex] = useState<number | null>(null);
  const [applyError, setApplyError] = useState<string | null>(null);

  useEffect(() => {
    setConditionId((current) =>
      sheet.conditions.some((condition) => condition.id === current)
        ? current
        : sheet.conditions[0].id,
    );
  }, [sheet.conditions]);

  useEffect(() => {
    setColumnIndex(parsed.recommendedColumnIndex);
    setApplyError(null);
  }, [parsed]);

  const selectedColumn = useMemo(
    () => parsed.columns.find((column) => column.index === columnIndex) ?? null,
    [columnIndex, parsed.columns],
  );
  const selectedErrorCount = selectedColumn
    ? selectedColumn.invalidRowNumbers.length + selectedColumn.emptyRowNumbers.length
    : 0;
  const parseErrorColumns = parsed.columns.filter(
    (column) => column.invalidRowNumbers.length > 0 || column.emptyRowNumbers.length > 0,
  );
  const canApply = Boolean(
    selectedColumn && selectedColumn.values.length > 0 && selectedErrorCount === 0,
  );

  const updateText = (nextText: string) => {
    setText(nextText);
    setParsed(parseText(nextText));
  };

  const handleApply = () => {
    if (!selectedColumn) return;
    setApplyError(null);
    try {
      onApply(conditionId, selectedColumn.values, {
        columnLabel: selectedColumn.label || `列 ${selectedColumn.index + 1}`,
        rowNumbers: selectedColumn.valueRowNumbers,
      });
    } catch (error) {
      setApplyError(
        error instanceof Error ? error.message : "貼り付けた値を適用できませんでした。",
      );
    }
  };

  return (
    <section
      className="bulk-paste-card"
      aria-labelledby="bulk-paste-heading"
      data-paste-mode={pasteMode}
    >
      <div className="section-heading-row">
        <div>
          <p className="overline">一括入力（スカラーのみ）</p>
          <h2 id="bulk-paste-heading">ImageJ・Excelの値を貼り付け</h2>
        </div>
        <span className="section-hint">1つの値 = 1つの実験単位のまとめ</span>
      </div>
      <p className="bulk-paste-warning" role="note">
        貼り付ける値は、どの実験単位（ディッシュ、試料、動物など）をまとめたものか確認してください。
        同じディッシュや試料内の細胞・フィールドを、別々の実験単位として自動計上しません。
      </p>
      <fieldset className="bulk-paste-modes">
        <legend>貼り付け形式</legend>
        <div className="bulk-paste-mode-grid">
          {(Object.keys(pasteModeCopy) as PasteMode[]).map((mode) => (
            <label key={mode} className="bulk-paste-mode-option">
              <input
                type="radio"
                name="bulk-paste-mode"
                value={mode}
                checked={pasteMode === mode}
                onChange={() => setPasteMode(mode)}
              />
              <span>
                <strong>{pasteModeCopy[mode].label}</strong>
                <small>{pasteModeCopy[mode].help}</small>
              </span>
            </label>
          ))}
        </div>
      </fieldset>
      <details className="bulk-paste-help">
        <summary>サンプルと対応範囲を表示</summary>
        <p>
          {pasteMode === "imagej"
            ? "ImageJの結果表では、実験単位ごとにまとめた平均値（Mean）などの数値列を選択します。"
            : pasteMode === "excel"
              ? "Excel・CSVの表では、条件名や試料名の列を除き、実験単位ごとにまとめた数値列を選択します。"
              : "1行1値では、貼り付けた順に実験単位へ割り当てます。"}
        </p>
        <p>
          細胞・フィールド単位のネストした行を生物学的nへ変換する取込は、下の「細胞・ROIを単位ごとにまとめる」を使用してください。
          ここでは、すでにまとめた1つの値だけを取り込みます。
        </p>
      </details>
      <label className="bulk-paste-field">
        <span>まとめ済みの値を貼り付け</span>
        <textarea
          aria-label="スカラー値を貼り付け"
          value={text}
          onChange={(event) => updateText(event.target.value)}
          placeholder={pasteModeCopy[pasteMode].placeholder}
          rows={5}
        />
      </label>
      {parsed.columns.length > 0 && (
        <div className="bulk-paste-controls">
          <label>
            <span>貼り付け先の条件</span>
            <select
              aria-label="貼り付け先の条件"
              value={conditionId}
              onChange={(event) => setConditionId(event.target.value)}
            >
              {sheet.conditions.map((condition) => (
                <option key={condition.id} value={condition.id}>
                  {condition.label}
                </option>
              ))}
            </select>
          </label>
          <label>
            <span>数値列</span>
            <select
              aria-label="数値列"
              value={columnIndex ?? ""}
              onChange={(event) =>
                setColumnIndex(event.target.value ? Number(event.target.value) : null)
              }
            >
              <option value="" disabled>
                列を選択
              </option>
              {parsed.columns.map((column) => (
                <option key={column.index} value={column.index}>
                  {column.label || `列 ${column.index + 1}`}
                </option>
              ))}
            </select>
          </label>
        </div>
      )}
      {selectedColumn && (
        <div className="bulk-paste-preview" aria-live="polite">
          <strong>プレビュー</strong>
          <span>{selectedColumn.values.slice(0, 5).join(", ") || "—"}</span>
          <span>合計 {selectedColumn.values.length} 値</span>
        </div>
      )}
      {selectedColumn && selectedErrorCount > 0 && (
        <p className="bulk-paste-error" role="alert">
          数値として読めない行または空欄があります（
          {selectedColumn.invalidRowNumbers.length > 0
            ? `非数値: ${selectedColumn.invalidRowNumbers.join(", ")}行`
            : ""}
          {selectedColumn.invalidRowNumbers.length > 0 && selectedColumn.emptyRowNumbers.length > 0
            ? "、"
            : ""}
          {selectedColumn.emptyRowNumbers.length > 0
            ? `空欄: ${selectedColumn.emptyRowNumbers.join(", ")}行`
            : ""}
          ）。修正してから適用してください。
        </p>
      )}
      {!selectedColumn && parseErrorColumns.length > 0 && (
        <p className="bulk-paste-error" role="alert">
          数値として読めない行または空欄があります。列を修正してから適用してください。
          {parseErrorColumns.map((column) => (
            <span key={column.index}>
              {` ${column.label || `列 ${column.index + 1}`}（非数値 ${column.invalidRowNumbers.length} 行、空欄 ${column.emptyRowNumbers.length} 行）`}
            </span>
          ))}
        </p>
      )}
      {applyError && (
        <p className="bulk-paste-error" role="alert">
          {applyError}
        </p>
      )}
      <button
        className="bulk-paste-apply-button"
        type="button"
        disabled={!canApply}
        onClick={handleApply}
      >
        選択した条件に適用
      </button>
    </section>
  );
}

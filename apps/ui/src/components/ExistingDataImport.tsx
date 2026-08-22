import { useMemo, useState } from "react";

import {
  buildExistingDataWorkspace,
  buildWideExistingDataWorkspace,
  parseExistingDataText,
  DuplicateImportConflictError,
  type ExistingDataDuplicateConflict,
  type ExistingDataImportResult,
} from "../app/existingDataImport";
import type { TimeSampling } from "../app/experimentDraft";

type ColumnChoice = number | "";

export function ExistingDataImport({
  onReady,
}: {
  onReady: (result: ExistingDataImportResult) => void;
}) {
  const [text, setText] = useState("");
  const [sourceLabel, setSourceLabel] = useState("clipboard paste");
  const parsed = useMemo(() => parseExistingDataText(text), [text]);
  const [experimentColumn, setExperimentColumn] = useState<number | "row_number">("row_number");
  const [unitColumn, setUnitColumn] = useState<number | "row_number">("row_number");
  const [dateColumn, setDateColumn] = useState<ColumnChoice>("");
  const [layout, setLayout] = useState<"tidy" | "wide">("tidy");
  const [conditionColumn, setConditionColumn] = useState<ColumnChoice>("");
  const [timeColumn, setTimeColumn] = useState<ColumnChoice>("");
  const [valueColumn, setValueColumn] = useState<ColumnChoice>("");
  const [wideValueColumns, setWideValueColumns] = useState<number[]>([]);
  const [timeSampling, setTimeSampling] = useState<TimeSampling>("cross_sectional");
  const [readoutLabel, setReadoutLabel] = useState("測定値");
  const [readoutUnit, setReadoutUnit] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [conflicts, setConflicts] = useState<readonly ExistingDataDuplicateConflict[]>([]);
  const [duplicateHandling, setDuplicateHandling] = useState<"reject" | "nested_observations">(
    "reject",
  );
  const [pendingResult, setPendingResult] = useState<ExistingDataImportResult | null>(null);

  const loadText = (next: string, nextSourceLabel = "clipboard paste") => {
    const nextParsed = parseExistingDataText(next);
    setText(next);
    setSourceLabel(nextSourceLabel);
    setValueColumn(nextParsed.recommendedColumnIndex ?? "");
    setWideValueColumns(
      nextParsed.columns
        .filter((column) => column.values.length > 0 && !column.looksLikeRowIndex)
        .map(({ index }) => index),
    );
    setConditionColumn("");
    setTimeColumn("");
    setError(null);
    setConflicts([]);
    setPendingResult(null);
  };
  const columnOptions = parsed.headers.map((header, index) => (
    <option key={`${header}.${index}`} value={index}>
      {header}
    </option>
  ));
  const canCreate =
    parsed.rows.length > 0 &&
    (layout === "wide"
      ? wideValueColumns.length >= 2
      : conditionColumn !== "" && valueColumn !== "");

  return (
    <section className="existing-data-import" aria-labelledby="existing-data-import-heading">
      <div className="experiment-start__section-heading">
        <div>
          <p className="experiment-start__eyebrow">既存データ</p>
          <h2 id="existing-data-import-heading">Excel・CSV・ImageJの表を取り込む</h2>
        </div>
        <span className="experiment-start__hint">プレビュー → 列の割り当て</span>
      </div>
      <label className="experiment-start__field">
        <span>表を貼り付け</span>
        <textarea
          aria-label="既存データの表"
          rows={7}
          placeholder={"Experiment\tCondition\tTime\tMean\nExp 1\tControl\t0\t12.4"}
          value={text}
          onChange={(event) => loadText(event.currentTarget.value, "clipboard paste")}
        />
      </label>
      <label className="existing-data-import__file">
        <span>CSV / TSV / TXTファイル</span>
        <input
          aria-label="既存データファイル"
          accept=".csv,.tsv,.txt,text/csv,text/tab-separated-values,text/plain"
          type="file"
          onChange={(event) => {
            const file = event.currentTarget.files?.[0];
            if (!file) return;
            void file
              .text()
              .then((contents) => loadText(contents, file.name))
              .catch(() => setError("ファイルを読み込めませんでした。"));
          }}
        />
      </label>

      {parsed.rows.length > 0 ? (
        <>
          <div className="existing-data-import__preview">
            <table aria-label="取込プレビュー">
              <thead>
                <tr>
                  {parsed.headers.map((header, index) => (
                    <th key={`${header}.${index}`}>{header}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {parsed.rows.slice(0, 8).map((row, rowIndex) => (
                  <tr key={rowIndex}>
                    {parsed.headers.map((_, index) => (
                      <td key={index}>{row[index] || "—"}</td>
                    ))}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <div className="existing-data-import__mapping" aria-label="列の割り当て">
            <fieldset className="experiment-start__fieldset existing-data-import__layout">
              <legend>表の形</legend>
              <label>
                <input
                  checked={layout === "tidy"}
                  name="import-layout"
                  type="radio"
                  onChange={() => setLayout("tidy")}
                />{" "}
                1列に条件名が入っている
              </label>
              <label>
                <input
                  checked={layout === "wide"}
                  name="import-layout"
                  type="radio"
                  onChange={() => setLayout("wide")}
                />{" "}
                条件ごとに列が分かれている
              </label>
            </fieldset>
            <label className="experiment-start__field">
              <span>実験回／session</span>
              <select
                aria-label="実験回／sessionの列"
                value={experimentColumn}
                onChange={(event) => {
                  const value =
                    event.target.value === "row_number" ? "row_number" : Number(event.target.value);
                  setExperimentColumn(value);
                  setUnitColumn(value);
                }}
              >
                <option value="row_number">各行を別のsessionとする</option>
                {columnOptions}
              </select>
            </label>
            <label className="experiment-start__field">
              <span>生物学的／統計的単位ID</span>
              <select
                aria-label="生物学的単位IDの列"
                value={unitColumn}
                onChange={(event) =>
                  setUnitColumn(
                    event.target.value === "row_number" ? "row_number" : Number(event.target.value),
                  )
                }
              >
                <option value="row_number">各行を別の単位とする</option>
                {columnOptions}
              </select>
            </label>
            <label className="experiment-start__field">
              <span>実験日（任意）</span>
              <select
                aria-label="実験日の列"
                value={dateColumn}
                onChange={(event) =>
                  setDateColumn(event.target.value === "" ? "" : Number(event.target.value))
                }
              >
                <option value="">元データに日付なし</option>
                {columnOptions}
              </select>
            </label>
            {layout === "tidy" ? (
              <label className="experiment-start__field">
                <span>条件</span>
                <select
                  aria-label="条件の列"
                  value={conditionColumn}
                  onChange={(event) =>
                    setConditionColumn(event.target.value === "" ? "" : Number(event.target.value))
                  }
                >
                  <option value="">列を選択</option>
                  {columnOptions}
                </select>
              </label>
            ) : null}
            {layout === "tidy" ? (
              <label className="experiment-start__field">
                <span>測定値</span>
                <select
                  aria-label="測定値の列"
                  value={valueColumn}
                  onChange={(event) =>
                    setValueColumn(event.target.value === "" ? "" : Number(event.target.value))
                  }
                >
                  <option value="">列を選択</option>
                  {columnOptions}
                </select>
              </label>
            ) : null}
            {layout === "tidy" ? (
              <label className="experiment-start__field">
                <span>時間（任意）</span>
                <select
                  aria-label="時間の列"
                  value={timeColumn}
                  onChange={(event) =>
                    setTimeColumn(event.target.value === "" ? "" : Number(event.target.value))
                  }
                >
                  <option value="">時間なし</option>
                  {columnOptions}
                </select>
              </label>
            ) : null}
            {layout === "wide" ? (
              <fieldset className="experiment-start__fieldset existing-data-import__wide-columns">
                <legend>条件として取り込む列</legend>
                {parsed.headers.map((header, index) => (
                  <label key={`${header}.${index}`}>
                    <input
                      checked={wideValueColumns.includes(index)}
                      type="checkbox"
                      onChange={(event) =>
                        setWideValueColumns((current) =>
                          event.target.checked
                            ? [...current, index]
                            : current.filter((column) => column !== index),
                        )
                      }
                    />{" "}
                    {header}
                  </label>
                ))}
              </fieldset>
            ) : null}
            <label className="experiment-start__field">
              <span>測定項目名</span>
              <input
                aria-label="取込測定項目名"
                value={readoutLabel}
                onChange={(event) => setReadoutLabel(event.target.value)}
              />
            </label>
            <label className="experiment-start__field">
              <span>単位（任意）</span>
              <input
                aria-label="取込測定単位"
                value={readoutUnit}
                onChange={(event) => setReadoutUnit(event.target.value)}
              />
            </label>
          </div>
          {layout === "tidy" && timeColumn !== "" ? (
            <fieldset className="experiment-start__fieldset">
              <legend>時間ごとの測定対象</legend>
              <label>
                <input
                  checked={timeSampling === "cross_sectional"}
                  name="import-time-sampling"
                  type="radio"
                  onChange={() => setTimeSampling("cross_sectional")}
                />{" "}
                時点ごとに別のサンプル
              </label>
              <label>
                <input
                  checked={timeSampling === "longitudinal"}
                  name="import-time-sampling"
                  type="radio"
                  onChange={() => setTimeSampling("longitudinal")}
                />{" "}
                同じ実験単位を追跡
              </label>
            </fieldset>
          ) : null}
          <p className="experiment-start__subtle">
            列の意味は自動確定しません。プレビューを見て割り当てを確認してください。
          </p>
          {error ? <p role="alert">{error}</p> : null}
          {conflicts.length > 0 ? (
            <section className="existing-data-import__conflicts" aria-label="重複した行の確認">
              <h3>同じ単位・条件・時間の組合せが複数あります</h3>
              {conflicts.map((conflict) => (
                <p key={conflict.key}>
                  {conflict.key}：行 {conflict.rowNumbers.join("、")}
                </p>
              ))}
              <p>これらは同じ生物学的単位内の複数の生測定ですか？</p>
              <button
                type="button"
                onClick={() => {
                  setDuplicateHandling("nested_observations");
                  setConflicts([]);
                  setError("「同じ単位内の複数観測」として再確認してください。");
                }}
              >
                同じ単位内の複数の生測定として扱う
              </button>
              <button type="button" onClick={() => setConflicts([])}>
                IDを修正してから取り込む
              </button>
            </section>
          ) : null}
          {pendingResult ? (
            <section className="existing-data-import__structure" aria-label="取り込む実験構造">
              <h3>この実験構造で取り込みますか？</h3>
              <ul>
                <li>
                  sessions：
                  {
                    new Set(
                      pendingResult.draft.experiments.map(({ sessionId, id }) => sessionId ?? id),
                    ).size
                  }
                </li>
                <li>
                  生物学的単位：
                  {
                    new Set(
                      pendingResult.draft.experiments.map(
                        ({ stableUnitId, id }) => stableUnitId ?? id,
                      ),
                    ).size
                  }
                </li>
                <li>条件：{pendingResult.draft.conditions.length}</li>
                <li>時間点：{pendingResult.draft.time.points.length}</li>
                <li>readouts：{pendingResult.draft.readouts.length}</li>
                <li>
                  同じ単位の反復：
                  {pendingResult.draft.conditionAssignment.kind === "matched" ? "あり" : "なし"}
                </li>
                <li>
                  同じ単位内の複数の生測定：
                  {
                    Object.values(pendingResult.cells).filter(
                      (cell) => cell.kind === "nested_continuous" && cell.rawValues.length > 1,
                    ).length
                  }
                  セル
                </li>
              </ul>
              <button
                className="primary-button"
                type="button"
                onClick={() => onReady(pendingResult)}
              >
                この構造で取り込む
              </button>
              <button type="button" onClick={() => setPendingResult(null)}>
                割り当てを修正
              </button>
            </section>
          ) : null}
          <button
            className="primary-button primary-button--ready"
            disabled={!canCreate}
            type="button"
            onClick={() => {
              try {
                setError(null);
                const result =
                  layout === "wide"
                    ? buildWideExistingDataWorkspace(parsed, {
                        experimentColumn,
                        sessionColumn: experimentColumn,
                        unitColumn,
                        dateColumn: dateColumn === "" ? null : dateColumn,
                        valueColumns: wideValueColumns,
                        readoutLabel,
                        readoutUnit,
                        sourceLabel,
                      })
                    : buildExistingDataWorkspace(parsed, {
                        experimentColumn,
                        sessionColumn: experimentColumn,
                        unitColumn,
                        dateColumn: dateColumn === "" ? null : dateColumn,
                        conditionColumn: conditionColumn as number,
                        timeColumn: timeColumn === "" ? null : timeColumn,
                        valueColumn: valueColumn as number,
                        timeSampling: timeColumn === "" ? "none" : timeSampling,
                        readoutLabel,
                        readoutUnit,
                        duplicateHandling,
                        sourceLabel,
                      });
                setPendingResult(result);
              } catch (reason) {
                if (reason instanceof DuplicateImportConflictError) {
                  setConflicts(reason.conflicts);
                  setError(null);
                  return;
                }
                setError(
                  reason instanceof Error ? reason.message : "取込設定を確認できませんでした。",
                );
              }
            }}
          >
            この割り当てで入力画面を作る
          </button>
        </>
      ) : null}
    </section>
  );
}

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
import { localizedText, useAppLocale } from "../app/appLocale";

type ColumnChoice = number | "";

export function ExistingDataImport({
  onReady,
}: {
  onReady: (result: ExistingDataImportResult) => void;
}) {
  const locale = useAppLocale();
  const t = (ja: string, en: string) => localizedText(locale, ja, en);
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
  const [readoutLabel, setReadoutLabel] = useState(() => t("測定値", "Measurement"));
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
          <p className="experiment-start__eyebrow">{t("既存データ", "Existing data")}</p>
          <h2 id="existing-data-import-heading">{t("Excel・CSV・ImageJの表を取り込む", "Import an Excel, CSV, or ImageJ table")}</h2>
        </div>
        <span className="experiment-start__hint">{t("プレビュー → 列の割り当て", "Preview → assign columns")}</span>
      </div>
      <label className="experiment-start__field">
        <span>{t("表を貼り付け", "Paste a table")}</span>
        <textarea
          aria-label={t("既存データの表", "Existing data table")}
          rows={7}
          placeholder={"Experiment\tCondition\tTime\tMean\nExp 1\tControl\t0\t12.4"}
          value={text}
          onChange={(event) => loadText(event.currentTarget.value, "clipboard paste")}
        />
      </label>
      <label className="existing-data-import__file">
        <span>{t("CSV / TSV / TXTファイル", "CSV / TSV / TXT file")}</span>
        <input
          aria-label={t("既存データファイル", "Existing data file")}
          accept=".csv,.tsv,.txt,text/csv,text/tab-separated-values,text/plain"
          type="file"
          onChange={(event) => {
            const file = event.currentTarget.files?.[0];
            if (!file) return;
            void file
              .text()
              .then((contents) => loadText(contents, file.name))
              .catch(() => setError(t("ファイルを読み込めませんでした。", "The file could not be loaded.")));
          }}
        />
      </label>

      {parsed.rows.length > 0 ? (
        <>
          <div className="existing-data-import__preview">
            <table aria-label={t("取込プレビュー", "Import preview")}>
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
          <div className="existing-data-import__mapping" aria-label={t("列の割り当て", "Column assignments")}>
            <fieldset className="experiment-start__fieldset existing-data-import__layout">
              <legend>{t("表の形", "Table layout")}</legend>
              <label>
                <input
                  checked={layout === "tidy"}
                  name="import-layout"
                  type="radio"
                  onChange={() => setLayout("tidy")}
                />{" "}
                {t("1列に条件名が入っている", "Condition names are in one column")}
              </label>
              <label>
                <input
                  checked={layout === "wide"}
                  name="import-layout"
                  type="radio"
                  onChange={() => setLayout("wide")}
                />{" "}
                {t("条件ごとに列が分かれている", "Each condition has its own column")}
              </label>
            </fieldset>
            <label className="experiment-start__field">
              <span>{t("実験回／session", "Experiment session")}</span>
              <select
                aria-label={t("実験回／sessionの列", "Experiment-session column")}
                value={experimentColumn}
                onChange={(event) => {
                  const value =
                    event.target.value === "row_number" ? "row_number" : Number(event.target.value);
                  setExperimentColumn(value);
                  setUnitColumn(value);
                }}
              >
                <option value="row_number">{t("各行を別のsessionとする", "Treat each row as a separate session")}</option>
                {columnOptions}
              </select>
            </label>
            <label className="experiment-start__field">
              <span>{t("生物学的／統計的単位ID", "Biological/statistical unit ID")}</span>
              <select
                aria-label={t("生物学的単位IDの列", "Biological-unit ID column")}
                value={unitColumn}
                onChange={(event) =>
                  setUnitColumn(
                    event.target.value === "row_number" ? "row_number" : Number(event.target.value),
                  )
                }
              >
                <option value="row_number">{t("各行を別の単位とする", "Treat each row as a separate unit")}</option>
                {columnOptions}
              </select>
            </label>
            <label className="experiment-start__field">
              <span>{t("実験日（任意）", "Experiment date (optional)")}</span>
              <select
                aria-label={t("実験日の列", "Experiment-date column")}
                value={dateColumn}
                onChange={(event) =>
                  setDateColumn(event.target.value === "" ? "" : Number(event.target.value))
                }
              >
                <option value="">{t("元データに日付なし", "No date in source data")}</option>
                {columnOptions}
              </select>
            </label>
            {layout === "tidy" ? (
              <label className="experiment-start__field">
                <span>{t("条件", "Condition")}</span>
                <select
                  aria-label={t("条件の列", "Condition column")}
                  value={conditionColumn}
                  onChange={(event) =>
                    setConditionColumn(event.target.value === "" ? "" : Number(event.target.value))
                  }
                >
                  <option value="">{t("列を選択", "Select a column")}</option>
                  {columnOptions}
                </select>
              </label>
            ) : null}
            {layout === "tidy" ? (
              <label className="experiment-start__field">
                <span>{t("測定値", "Measurement")}</span>
                <select
                  aria-label={t("測定値の列", "Measurement column")}
                  value={valueColumn}
                  onChange={(event) =>
                    setValueColumn(event.target.value === "" ? "" : Number(event.target.value))
                  }
                >
                  <option value="">{t("列を選択", "Select a column")}</option>
                  {columnOptions}
                </select>
              </label>
            ) : null}
            {layout === "tidy" ? (
              <label className="experiment-start__field">
                <span>{t("時間（任意）", "Time (optional)")}</span>
                <select
                  aria-label={t("時間の列", "Time column")}
                  value={timeColumn}
                  onChange={(event) =>
                    setTimeColumn(event.target.value === "" ? "" : Number(event.target.value))
                  }
                >
                  <option value="">{t("時間なし", "No time axis")}</option>
                  {columnOptions}
                </select>
              </label>
            ) : null}
            {layout === "wide" ? (
              <fieldset className="experiment-start__fieldset existing-data-import__wide-columns">
                <legend>{t("条件として取り込む列", "Columns to import as conditions")}</legend>
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
              <span>{t("測定項目名", "Measured-value name")}</span>
              <input
                aria-label={t("取込測定項目名", "Imported measured-value name")}
                value={readoutLabel}
                onChange={(event) => setReadoutLabel(event.target.value)}
              />
            </label>
            <label className="experiment-start__field">
              <span>{t("単位（任意）", "Unit (optional)")}</span>
              <input
                aria-label={t("取込測定単位", "Imported measurement unit")}
                value={readoutUnit}
                onChange={(event) => setReadoutUnit(event.target.value)}
              />
            </label>
          </div>
          {layout === "tidy" && timeColumn !== "" ? (
            <fieldset className="experiment-start__fieldset">
              <legend>{t("時間ごとの測定対象", "Units measured across time")}</legend>
              <label>
                <input
                  checked={timeSampling === "cross_sectional"}
                  name="import-time-sampling"
                  type="radio"
                  onChange={() => setTimeSampling("cross_sectional")}
                />{" "}
                {t("時点ごとに別のサンプル", "Separate samples at each time point")}
              </label>
              <label>
                <input
                  checked={timeSampling === "longitudinal"}
                  name="import-time-sampling"
                  type="radio"
                  onChange={() => setTimeSampling("longitudinal")}
                />{" "}
                {t("同じ実験単位を追跡", "Follow the same experimental unit")}
              </label>
            </fieldset>
          ) : null}
          <p className="experiment-start__subtle">
            {t("列の意味は自動確定しません。プレビューを見て割り当てを確認してください。", "Column meaning is not inferred automatically. Review the preview and confirm each assignment.")}
          </p>
          {error ? <p role="alert">{error}</p> : null}
          {conflicts.length > 0 ? (
            <section className="existing-data-import__conflicts" aria-label={t("重複した行の確認", "Review duplicate rows")}>
              <h3>{t("同じ単位・条件・時間の組合せが複数あります", "Multiple rows share the same unit, condition, and time")}</h3>
              {conflicts.map((conflict) => (
                <p key={conflict.key}>
                  {locale === "ja"
                    ? `${conflict.key}：行 ${conflict.rowNumbers.join("、")}`
                    : `${conflict.key}: rows ${conflict.rowNumbers.join(", ")}`}
                </p>
              ))}
              <p>{t("これらは同じ生物学的単位内の複数の生測定ですか？", "Are these multiple raw measurements within the same biological unit?")}</p>
              <button
                type="button"
                onClick={() => {
                  setDuplicateHandling("nested_observations");
                  setConflicts([]);
                  setError(t("「同じ単位内の複数観測」として再確認してください。", "Review the import as multiple observations within the same unit."));
                }}
              >
                {t("同じ単位内の複数の生測定として扱う", "Treat as multiple raw measurements within one unit")}
              </button>
              <button type="button" onClick={() => setConflicts([])}>
                {t("IDを修正してから取り込む", "Correct the IDs before importing")}
              </button>
            </section>
          ) : null}
          {pendingResult ? (
            <section className="existing-data-import__structure" aria-label={t("取り込む実験構造", "Experiment structure to import")}>
              <h3>{t("この実験構造で取り込みますか？", "Import with this experiment structure?")}</h3>
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
                  {t("生物学的単位", "Biological units")}:
                  {
                    new Set(
                      pendingResult.draft.experiments.map(
                        ({ stableUnitId, id }) => stableUnitId ?? id,
                      ),
                    ).size
                  }
                </li>
                <li>{t("条件", "Conditions")}: {pendingResult.draft.conditions.length}</li>
                <li>{t("時間点", "Time points")}: {pendingResult.draft.time.points.length}</li>
                <li>readouts：{pendingResult.draft.readouts.length}</li>
                <li>
                  {t("同じ単位の反復", "Repeated measurements of the same unit")}:
                  {pendingResult.draft.conditionAssignment.kind === "matched" ? t("あり", "Yes") : t("なし", "No")}
                </li>
                <li>
                  {t("同じ単位内の複数の生測定", "Multiple raw measurements within one unit")}:
                  {
                    Object.values(pendingResult.cells).filter(
                      (cell) => cell.kind === "nested_continuous" && cell.rawValues.length > 1,
                    ).length
                  }
                  {t("セル", "cells")}
                </li>
              </ul>
              <button
                className="primary-button"
                type="button"
                onClick={() => onReady(pendingResult)}
              >
                {t("この構造で取り込む", "Import with this structure")}
              </button>
              <button type="button" onClick={() => setPendingResult(null)}>
                {t("割り当てを修正", "Edit assignments")}
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
                  locale === "ja" && reason instanceof Error ? reason.message : t("取込設定を確認できませんでした。", "The import settings could not be validated."),
                );
              }
            }}
          >
            {t("この割り当てで入力画面を作る", "Create the data-entry screen with these assignments")}
          </button>
        </>
      ) : null}
    </section>
  );
}

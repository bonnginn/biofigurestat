import type {
  UnresolvedVisualizationIdentityDecision,
  UnresolvedVisualizationSourceRowUnitDecision,
} from "@lsaa/project";

import { localizedText, useAppLocale } from "../../app/appLocale";
import type { GraphOnlyColumnIndex as ColumnIndex } from "../../app/graphOnlyVisualizationInput";

export type GraphOnlyStatisticsXMeaning = "" | "condition" | "ordered" | "unknown";

type GraphOnlyStatisticsHandoffProps = Readonly<{
  headers: readonly string[];
  xColumn: ColumnIndex;
  seriesColumn: ColumnIndex;
  idColumn: ColumnIndex;
  identityDecision: UnresolvedVisualizationIdentityDecision;
  sourceRowUnitDecision: UnresolvedVisualizationSourceRowUnitDecision;
  xMeaning: GraphOnlyStatisticsXMeaning;
  onXMeaningChange: (meaning: Exclude<GraphOnlyStatisticsXMeaning, "">) => void;
  onIdentitySelectionChange: (selection: "" | "no_id" | number) => void;
  onSourceRowUnitDecisionChange: (
    decision: Exclude<UnresolvedVisualizationSourceRowUnitDecision, "unanswered">,
  ) => void;
  onContinue: () => void;
}>;

export function GraphOnlyStatisticsHandoff({
  headers,
  xColumn,
  seriesColumn,
  idColumn,
  identityDecision,
  sourceRowUnitDecision,
  xMeaning,
  onXMeaningChange,
  onIdentitySelectionChange,
  onSourceRowUnitDecisionChange,
  onContinue,
}: GraphOnlyStatisticsHandoffProps) {
  const locale = useAppLocale();
  const t = (ja: string, en: string) => localizedText(locale, ja, en);
  const columns = headers.map((header, index) => (
    <option key={`${index}:${header}`} value={index}>
      {header || t(`列 ${index + 1}`, `Column ${index + 1}`)}
    </option>
  ));
  const canContinue =
    xMeaning === "condition" &&
    identityDecision !== "unanswered" &&
    (identityDecision !== "no_id" || sourceRowUnitDecision === "each_row_distinct_unit") &&
    seriesColumn === "";

  return (
    <section
      className="graph-only__statistics-handoff"
      aria-labelledby="graph-only-statistics-handoff-heading"
    >
      <h3 id="graph-only-statistics-handoff-heading">
        {t("統計に必要な実験情報を追加", "Add experiment information required for statistics")}
      </h3>
      <p>
        {t(
          "元の表とGraphはこの画面に保持します。まず、横軸の意味だけ確認してから実験の質問へ進みます。",
          "The source table and Graph remain on this screen. First confirm what the X axis means, then continue to the experiment questions.",
        )}
      </p>
      <fieldset>
        <legend>
          {t(
            `横軸「${xColumn === "" ? "未指定" : headers[xColumn]}」は何を表しますか？`,
            `What does the X axis “${xColumn === "" ? "not selected" : headers[xColumn]}” represent?`,
          )}
        </legend>
        <label>
          <input
            type="radio"
            name="graph-only-x-meaning"
            checked={xMeaning === "condition"}
            onChange={() => onXMeaningChange("condition")}
          />
          {t(
            "処理・群分け（Control、Drug A、genotypeなど）",
            "Treatment or group (for example Control, Drug A, or genotype)",
          )}
        </label>
        <label>
          <input
            type="radio"
            name="graph-only-x-meaning"
            checked={xMeaning === "ordered"}
            onChange={() => onXMeaningChange("ordered")}
          />
          {t(
            "時間・濃度・距離など順序のある値",
            "An ordered value such as time, concentration, or distance",
          )}
        </label>
        <label>
          <input
            type="radio"
            name="graph-only-x-meaning"
            checked={xMeaning === "unknown"}
            onChange={() => onXMeaningChange("unknown")}
          />
          {t("その他、または分からない", "Other or unknown")}
        </label>
      </fieldset>
      {xMeaning === "condition" ? (
        <label className="experiment-start__field">
          <span>
            {t(
              "各行の対象・試料を示すID列（表にある場合）",
              "ID column identifying the subject or sample in each row (if present)",
            )}
          </span>
          <select
            aria-label={t("統計で使う対象ID", "Subject ID used for statistics")}
            value={
              identityDecision === "unanswered"
                ? ""
                : identityDecision === "no_id"
                  ? "no_id"
                  : String(idColumn)
            }
            onChange={(event) => {
              const value = event.target.value;
              onIdentitySelectionChange(value === "" || value === "no_id" ? value : Number(value));
            }}
          >
            <option value="">{t("選択してください", "Select")}</option>
            <option value="no_id">
              {t(
                "元の表に対象・試料IDの列はない",
                "The source table has no subject or sample ID column",
              )}
            </option>
            {columns}
          </select>
          <small>
            {t(
              "DishID・AnimalIDなど、元の表にあるIDは独立した実験でも保持します。ID列を選んだだけでは対応ありと判断せず、次の質問で条件間の関係を確認します。行の順番から対応付けることはありません。ID列がない場合は、各行が別々の対象だと確認できたときだけアプリ内IDを作ります。同じ対象を繰り返し測った実験には、元のID列が必要です。",
              "IDs present in the source table, such as Dish ID or Animal ID, are retained even for independent experiments. Selecting an ID column does not imply matching; the next question confirms the relationship between conditions. Rows are never matched by order. Without an ID column, app-generated IDs are created only after you confirm that every row is a distinct subject. Repeated measurements of the same subject require an ID column in the source table.",
            )}
          </small>
        </label>
      ) : null}
      {xMeaning === "condition" && identityDecision === "no_id" ? (
        <fieldset>
          <legend>
            {t(
              "表の各行は、別々に処置した実験対象・試料ですか？",
              "Is each row a separately treated experimental subject or sample?",
            )}
          </legend>
          <label>
            <input
              type="radio"
              name="graph-only-source-row-unit"
              checked={sourceRowUnitDecision === "each_row_distinct_unit"}
              onChange={() => onSourceRowUnitDecisionChange("each_row_distinct_unit")}
            />
            {t(
              "はい。各行が別々のanimal・dish・wellなどです",
              "Yes. Each row is a different animal, dish, well, or similar unit",
            )}
          </label>
          <label>
            <input
              type="radio"
              name="graph-only-source-row-unit"
              checked={sourceRowUnitDecision === "multiple_rows_per_unit"}
              onChange={() => onSourceRowUnitDecisionChange("multiple_rows_per_unit")}
            />
            {t(
              "いいえ。同じ対象内のCell・ROI・視野などを複数行に記録しています",
              "No. Multiple rows record cells, ROIs, fields, or similar observations within the same subject",
            )}
          </label>
          <label>
            <input
              type="radio"
              name="graph-only-source-row-unit"
              checked={sourceRowUnitDecision === "unknown"}
              onChange={() => onSourceRowUnitDecisionChange("unknown")}
            />
            {t("分からない", "I do not know")}
          </label>
        </fieldset>
      ) : null}
      {xMeaning === "condition" && identityDecision === "unanswered" ? (
        <p className="graph-only__error" role="status">
          {t(
            "対象・試料IDの列があるか回答してください。未回答のまま行番号をIDとして使うことはありません。",
            "Indicate whether a subject or sample ID column exists. Row numbers will not be used as IDs without your answer.",
          )}
        </p>
      ) : null}
      {xMeaning === "condition" &&
      identityDecision === "no_id" &&
      sourceRowUnitDecision === "unanswered" ? (
        <p className="graph-only__error" role="status">
          {t(
            "各行が別々に処置した対象・試料か回答してください。回答前に行を独立したnとして扱うことはありません。",
            "Confirm whether each row is a separately treated subject or sample. Rows will not be treated as independent n before confirmation.",
          )}
        </p>
      ) : null}
      {xMeaning === "condition" &&
      identityDecision === "no_id" &&
      sourceRowUnitDecision === "multiple_rows_per_unit" ? (
        <p className="graph-only__error" role="alert">
          {t(
            "Cell・ROI・視野を独立したnには変換しません。元の表へdish・animalなど共通の由来を示すID列を追加して選ぶまで、元データを保持して停止します。",
            "Cells, ROIs, or fields will not be converted into independent n. The source data are retained and the workflow stops until you add and select an ID column identifying their shared dish, animal, or other origin.",
          )}
        </p>
      ) : null}
      {xMeaning === "condition" &&
      identityDecision === "no_id" &&
      sourceRowUnitDecision === "unknown" ? (
        <p className="graph-only__error" role="alert">
          {t(
            "1行が何を表すか確認できるまで統計へ進みません。元の表とGraphは保持されています。",
            "Statistics will not continue until the meaning of one row is confirmed. The source table and Graph are retained.",
          )}
        </p>
      ) : null}
      {seriesColumn !== "" ? (
        <p className="graph-only__error" role="alert">
          {t(
            "選択中のグループ列が、処理条件・batch・表示だけの分類のどれか確認する必要があります。現在は自動で無視せず、元の表を保持して停止します。",
            "The selected group column must be identified as a treatment condition, batch, or display-only category. BioFigureStat retains the source table and stops instead of ignoring it automatically.",
          )}
        </p>
      ) : null}
      {xMeaning === "ordered" ? (
        <p className="graph-only__error" role="alert">
          {t(
            "順序のあるXを一般実験へ安全に引き継ぐ仕組みは準備中です。別の実験構造へ変換せず、元の表を保持します。",
            "Safe transfer of an ordered X axis into the general experiment workflow is not available yet. The source table is retained without converting it to another experiment structure.",
          )}
        </p>
      ) : null}
      {xMeaning === "unknown" ? (
        <p className="graph-only__error" role="alert">
          {t(
            "横軸の意味が決まるまで推測して進みません。元の表は保持されています。",
            "BioFigureStat will not guess and continue until the meaning of the X axis is known. The source table is retained.",
          )}
        </p>
      ) : null}
      <button className="primary-button" type="button" disabled={!canContinue} onClick={onContinue}>
        {t("実験構造の確認へ", "Continue to experiment structure")}
      </button>
    </section>
  );
}

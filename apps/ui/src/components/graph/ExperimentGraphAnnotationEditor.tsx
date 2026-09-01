import type { Dispatch, SetStateAction } from "react";
import type { AnalysisEngineResult } from "@lsaa/analysis-contracts";

import { localizedText, useAppLocale } from "../../app/appLocale";
import type { ExperimentSetDraft } from "../../app/experimentDraft";
import type { WorkspaceGraphState } from "../../app/experimentWorkspaceProject";
import { analysisTestAnnotationLabel } from "./experimentGraphAnnotations";

type StatisticsAnnotation = NonNullable<WorkspaceGraphState["statisticsAnnotation"]>;
type StatisticsAnnotationEntry = NonNullable<WorkspaceGraphState["statisticsAnnotations"]>[number];

export type ExperimentGraphAnnotationEditorProps = Readonly<{
  /** Parent renders this editor only for a validated successful result. */
  analysisResult: AnalysisEngineResult;
  draft: ExperimentSetDraft;
  baseAnnotationContext: string;
  annotationContext: string;
  adjustedComparisonAnnotations: readonly StatisticsAnnotationEntry[];
  statisticsAnnotation: StatisticsAnnotation;
  statisticsAnnotations: readonly StatisticsAnnotationEntry[];
  setStatisticsAnnotation: Dispatch<SetStateAction<StatisticsAnnotation>>;
  setStatisticsAnnotations: Dispatch<SetStateAction<StatisticsAnnotationEntry[]>>;
  onAddSelectedComparison?: () => void;
  variant?: "full" | "display-only";
}>;

export function ExperimentGraphAnnotationEditor({
  analysisResult,
  draft,
  baseAnnotationContext,
  annotationContext,
  adjustedComparisonAnnotations,
  statisticsAnnotation,
  statisticsAnnotations,
  setStatisticsAnnotation,
  setStatisticsAnnotations,
  onAddSelectedComparison,
  variant = "full",
}: ExperimentGraphAnnotationEditorProps) {
  const locale = useAppLocale();
  const t = (ja: string, en: string) => localizedText(locale, ja, en);

  return (
    <section
      className="experiment-graph-statistics-section"
      aria-label={t("統計注釈", "Statistical annotations")}
    >
      <h3>{t("グラフ上の注釈", "Annotations on the Graph")}</h3>
      {variant === "full" ? (
        <p className="experiment-graph-help">
          {t(
            "Statisticsで保存した解析結果から表示します。まず全比較を一括表示し、不要な比較だけを下の一覧から外せます。ここでは再計算しません。",
            "Annotations use the analysis result saved in Statistics. You can show all comparisons first and remove unneeded comparisons below. No analysis is recalculated here.",
          )}
        </p>
      ) : null}
      {variant === "full" && adjustedComparisonAnnotations.length > 0 ? (
        <fieldset
          className="experiment-graph-condition-fieldset experiment-graph-comparison-visibility"
          aria-label={t("調整済み比較の表示", "Adjusted-comparison visibility")}
        >
          <legend>
            {t("調整済み比較（最初はすべて表示）", "Adjusted comparisons (initially all shown)")}
          </legend>
          {adjustedComparisonAnnotations.map((candidate) => {
            const test = analysisResult.tests[candidate.testIndex]!;
            const checked = statisticsAnnotations.some(
              ({ testIndex }) => testIndex === candidate.testIndex,
            );
            return (
              <label className="experiment-graph-checkbox" key={candidate.id}>
                <input
                  type="checkbox"
                  checked={checked}
                  onChange={(event) =>
                    setStatisticsAnnotations((current) =>
                      event.target.checked
                        ? [
                            ...current.filter(({ testIndex }) => testIndex !== candidate.testIndex),
                            candidate,
                          ]
                        : current.filter(({ testIndex }) => testIndex !== candidate.testIndex),
                    )
                  }
                />
                <span>{analysisTestAnnotationLabel(test, draft, baseAnnotationContext)}</span>
              </label>
            );
          })}
        </fieldset>
      ) : null}
      {analysisResult.tests.length > 1 ? (
        <label className="experiment-graph-field">
          <span>{t("比較結果", "Comparison result")}</span>
          <select
            aria-label={t("統計注釈の比較", "Statistical-annotation comparison")}
            title={
              analysisResult.tests[statisticsAnnotation.testIndex]
                ? analysisTestAnnotationLabel(
                    analysisResult.tests[statisticsAnnotation.testIndex]!,
                    draft,
                    baseAnnotationContext,
                  )
                : undefined
            }
            value={statisticsAnnotation.testIndex}
            onChange={(event) =>
              setStatisticsAnnotation((current) => ({
                ...current,
                testIndex: Number(event.target.value),
              }))
            }
          >
            {analysisResult.tests.map((test, index) => (
              <option key={`${test.name}:${index}`} value={index}>
                {analysisTestAnnotationLabel(test, draft, baseAnnotationContext)}
              </option>
            ))}
          </select>
        </label>
      ) : null}
      <label className="experiment-graph-field">
        <span>{t("表示", "Display")}</span>
        <select
          aria-label={t("統計注釈の表示", "Statistical-annotation display")}
          value={statisticsAnnotation.mode}
          onChange={(event) =>
            setStatisticsAnnotation((current) => ({
              ...current,
              mode: event.target.value as StatisticsAnnotation["mode"],
            }))
          }
        >
          <option value="hidden">{t("表示しない", "Hidden")}</option>
          <option value="exact_p">{t("正確なp値", "Exact p-value")}</option>
          <option value="symbol">{t("有意差記号", "Significance symbol")}</option>
        </select>
      </label>
      {variant === "full" && adjustedComparisonAnnotations.length > 0 ? (
        <button
          type="button"
          aria-label={t(
            "すべての比較をまとめて注釈へ追加",
            "Add all comparisons to the annotations",
          )}
          className="experiment-graph-primary-action"
          onClick={() => {
            const mode: StatisticsAnnotationEntry["mode"] =
              statisticsAnnotation.mode === "symbol" ? "symbol" : "exact_p";
            setStatisticsAnnotations(
              adjustedComparisonAnnotations.map((annotation) => ({ ...annotation, mode })),
            );
          }}
        >
          {t(
            "調整済みの全比較をグラフにまとめて表示",
            "Show all adjusted comparisons on the graph",
          )}
        </button>
      ) : null}
      {variant === "full" && onAddSelectedComparison ? (
        <button type="button" onClick={onAddSelectedComparison}>
          {t("この比較を注釈へ追加", "Add this comparison to the annotations")}
        </button>
      ) : null}
      {variant === "full" && statisticsAnnotations.length > 0 ? (
        <ul className="experiment-graph-annotation-list">
          {statisticsAnnotations.map((annotation) => {
            const test = analysisResult.tests[annotation.testIndex];
            if (!test) return null;
            return (
              <li key={annotation.id}>
                <span>{analysisTestAnnotationLabel(test, draft, baseAnnotationContext)}</span>
                <select
                  aria-label={t(`${test.name}の表示形式`, `${test.name} display style`)}
                  value={annotation.mode}
                  onChange={(event) =>
                    setStatisticsAnnotations((current) =>
                      current.map((item) =>
                        item.id === annotation.id
                          ? { ...item, mode: event.target.value as "exact_p" | "symbol" }
                          : item,
                      ),
                    )
                  }
                >
                  <option value="exact_p">{t("p値", "p-value")}</option>
                  <option value="symbol">{t("記号", "Symbol")}</option>
                </select>
                <select
                  aria-label={t(`${test.name}の配置形式`, `${test.name} placement style`)}
                  value={annotation.presentation ?? "bracket"}
                  onChange={(event) =>
                    setStatisticsAnnotations((current) =>
                      current.map((item) =>
                        item.id === annotation.id
                          ? {
                              ...item,
                              presentation: event.target.value as "bracket" | "symbol_only",
                            }
                          : item,
                      ),
                    )
                  }
                >
                  <option value="bracket">{t("比較線", "Comparison bracket")}</option>
                  <option value="symbol_only">
                    {t("対象群の上に記号のみ", "Symbol above target group only")}
                  </option>
                </select>
                {(annotation.presentation ?? "bracket") === "symbol_only" ? (
                  <input
                    aria-label={t(`${test.name}の統計凡例`, `${test.name} statistical legend`)}
                    placeholder={t(
                      "例：**** adjusted p < 0.0001 vs control",
                      "Example: **** adjusted p < 0.0001 vs control",
                    )}
                    value={annotation.legendLabel ?? ""}
                    onChange={(event) =>
                      setStatisticsAnnotations((current) =>
                        current.map((item) =>
                          item.id === annotation.id
                            ? { ...item, legendLabel: event.target.value || undefined }
                            : item,
                        ),
                      )
                    }
                  />
                ) : null}
                <label className="experiment-graph-checkbox">
                  <input
                    type="checkbox"
                    checked={annotation.showNonSignificant}
                    onChange={(event) =>
                      setStatisticsAnnotations((current) =>
                        current.map((item) =>
                          item.id === annotation.id
                            ? { ...item, showNonSignificant: event.target.checked }
                            : item,
                        ),
                      )
                    }
                  />
                  <span>{t("n.s.表示", "Show n.s.")}</span>
                </label>
                <button
                  type="button"
                  onClick={() =>
                    setStatisticsAnnotations((current) =>
                      current.filter(({ id }) => id !== annotation.id),
                    )
                  }
                >
                  {t("グラフから外す", "Remove from graph")}
                </button>
              </li>
            );
          })}
        </ul>
      ) : null}
      <p className="experiment-graph-help">
        {t("表示内容：", "Displayed result: ")}
        {annotationContext}
        {t(
          "。保存済みのこのグラフの解析結果にだけリンクします。派生値の注釈はそのmetric/windowだけを表し、曲線全体の推論を意味しません。データや比較対象を変更すると注釈も外れます。",
          ". Annotations link only to the saved analysis result for this graph. An annotation for a derived value applies only to that metric and window; it does not imply inference over the whole curve. Changing the data or comparison target removes the annotation.",
        )}
      </p>
    </section>
  );
}

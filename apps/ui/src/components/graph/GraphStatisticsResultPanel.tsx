import { useState } from "react";
import type { AnalysisEngineRequest, AnalysisEngineResult } from "@lsaa/analysis-contracts";

import type { DraftAnalysisAssessment } from "../../app/experimentDraftAnalysis";
import { copyMethodsText } from "../../app/methodsText";
import { PRODUCT_IDENTITY } from "../../app/productIdentity";
import { localizedText, useAppLocale } from "../../app/appLocale";
import { EquivalenceResultPanel } from "./EquivalenceResultPanel";
import {
  comparisonDisplayLabel,
  diagnosticLabel,
  estimateDisplayLabel,
  formatGraphStatisticNumber,
  formatGraphStatisticP,
  isPairwiseComparisonName,
  type MatchedRelationship,
  type StatisticsConditionOption,
} from "./graphStatisticsPresentation";

type GraphStatisticsResultPanelProps = Readonly<{
  assessment: DraftAnalysisAssessment;
  conditionOptions: readonly StatisticsConditionOption[];
  equivalenceComparisonOptions: readonly Readonly<{ id: string; label: string }>[];
  executedRequest: AnalysisEngineRequest | null;
  humanMethodLabel: (method: string | null | undefined) => string;
  matchedRelationship?: MatchedRelationship;
  methodsText?: string | null;
  result: AnalysisEngineResult;
}>;

export function GraphStatisticsResultPanel({
  assessment,
  conditionOptions,
  equivalenceComparisonOptions,
  executedRequest,
  humanMethodLabel,
  matchedRelationship,
  methodsText,
  result,
}: GraphStatisticsResultPanelProps) {
  const locale = useAppLocale();
  const t = (ja: string, en: string) => localizedText(locale, ja, en);
  const [methodsCopyStatus, setMethodsCopyStatus] = useState<string | null>(null);
  const primaryTests = result.tests.filter((test) => !isPairwiseComparisonName(test.name));
  const comparisonRows = result.tests.flatMap((test, index) => {
    if (!isPairwiseComparisonName(test.name)) return [];
    const label = comparisonDisplayLabel(test.name, conditionOptions);
    return label ? [{ test, label, index }] : [];
  });
  const hasNonSignificantDifferenceResult = result.tests.some(
    (test) => (test.adjustedPValue ?? test.pValue) >= 0.05,
  );
  const diagnosticItems = [
    ...result.diagnostics.map((item) => ({ ...item, severity: "diagnostic" as const })),
    ...result.warnings.map((item) => ({ ...item, severity: "warning" as const })),
  ];
  const hasImportantDiagnostic = diagnosticItems.some(
    (item) => item.severity === "warning" || /small|few|n_lt|n_less|underpowered/iu.test(item.code),
  );

  return (
    <div
      className="experiment-graph-analysis-result"
      role="group"
      aria-label={t("統計解析結果", "Statistical analysis results")}
    >
      <div className="experiment-graph-analysis-summary">
        <strong>{t("解析完了（ローカル）", "Analysis complete (local)")}</strong>
        <p>
          {t("解析に用いた実験単位", "Experimental units used in analysis")}:
          {assessment.nDisplay ??
            assessment.nByCondition.map(({ label, n }) => `${label} n=${n}`).join("、")}
        </p>
      </div>
      {result.equivalence ? (
        <EquivalenceResultPanel
          result={result.equivalence}
          comparisonLabels={Object.fromEntries(
            equivalenceComparisonOptions.map(({ id, label }) => [id, label]),
          )}
        />
      ) : null}
      {result.estimates.length > 0 ? (
        <dl aria-label={t("主要な推定値", "Primary estimates")}>
          {result.estimates.map((estimate) => (
            <div key={estimate.name}>
              <dt>{estimateDisplayLabel(estimate.name, conditionOptions)}</dt>
              <dd>
                {t("推定値", "Estimate")} = {formatGraphStatisticNumber(estimate.value)}
                {estimate.standardError === null
                  ? ""
                  : `、SE = ${formatGraphStatisticNumber(estimate.standardError)}`}
                {estimate.confidenceInterval
                  ? `、${estimate.confidenceInterval.level * 100}% CI ${formatGraphStatisticNumber(
                      estimate.confidenceInterval.lower,
                    )}–${formatGraphStatisticNumber(estimate.confidenceInterval.upper)}`
                  : ""}
              </dd>
            </div>
          ))}
        </dl>
      ) : null}
      <dl aria-label={t("主要な検定結果", "Primary test results")}>
        {primaryTests.map((test) => (
          <div key={test.name}>
            <dt>{t("全体／主解析", "Overall / primary analysis")}</dt>
            <dd>
              {test.statisticName} = {formatGraphStatisticNumber(test.statistic)}、p ={" "}
              {formatGraphStatisticP(test.adjustedPValue ?? test.pValue)}
              {test.adjustedPValue !== null
                ? t("（多重比較調整済み）", " (multiplicity-adjusted)")
                : ""}
              {test.degreesOfFreedom ? `、df = ${test.degreesOfFreedom.join(", ")}` : ""}
              {test.effectSizeName && test.effectSize !== null
                ? `、${test.effectSizeName} = ${formatGraphStatisticNumber(test.effectSize)}`
                : ""}
            </dd>
          </div>
        ))}
      </dl>
      {comparisonRows.length > 0 ? (
        <details className="experiment-graph-analysis-comparisons" open>
          <summary>
            {t(
              `条件間比較（${comparisonRows.length}件）`,
              `Condition comparisons (${comparisonRows.length})`,
            )}
          </summary>
          <div className="data-table-scroll">
            <table
              className="data-table"
              aria-label={t("条件間比較の結果", "Condition-comparison results")}
            >
              <thead>
                <tr>
                  <th scope="col">{t("比較", "Comparison")}</th>
                  <th scope="col">{t("検定統計量・自由度", "Test statistic and df")}</th>
                  <th scope="col">{t("p値", "p value")}</th>
                  <th scope="col">{t("調整済みp値", "Adjusted p value")}</th>
                  <th scope="col">{t("効果量", "Effect size")}</th>
                </tr>
              </thead>
              <tbody>
                {comparisonRows.map(({ test, label, index }) => (
                  <tr key={`${test.name}-${index}`}>
                    <th scope="row">{label}</th>
                    <td>
                      {test.statisticName} = {formatGraphStatisticNumber(test.statistic)}
                      {test.degreesOfFreedom ? `、df = ${test.degreesOfFreedom.join(", ")}` : ""}
                    </td>
                    <td>{formatGraphStatisticP(test.pValue)}</td>
                    <td>
                      {test.adjustedPValue === null
                        ? "—"
                        : formatGraphStatisticP(test.adjustedPValue)}
                    </td>
                    <td>
                      {test.effectSizeName && test.effectSize !== null
                        ? `${test.effectSizeName} = ${formatGraphStatisticNumber(test.effectSize)}`
                        : "—"}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </details>
      ) : null}
      {hasNonSignificantDifferenceResult ? (
        <p className="experiment-graph-help" role="note">
          {t(
            "統計学的有意差は検出されませんでした。この結果だけでは、条件が同等であることや影響がないことを示したことにはなりません。",
            "No statistically significant difference was detected. This result does not demonstrate equivalence or absence of an effect.",
          )}
        </p>
      ) : null}
      {diagnosticItems.length > 0 ? (
        <details
          className={`experiment-graph-analysis-diagnostics${
            hasImportantDiagnostic ? " is-important" : ""
          }`}
          open
        >
          <summary>
            {locale === "ja"
              ? `${hasImportantDiagnostic ? "重要な注意" : "診断と注意"}（${diagnosticItems.length}件）`
              : `${hasImportantDiagnostic ? "Important warnings" : "Diagnostics and notes"} (${diagnosticItems.length})`}
          </summary>
          {diagnosticItems.map((item) => (
            <p data-severity={item.severity} key={`${item.code}-${item.message}`}>
              {diagnosticLabel(item.code, matchedRelationship, locale)}
            </p>
          ))}
        </details>
      ) : null}
      <details>
        <summary>{t("解析エンジンと再現情報", "Analysis engine and reproducibility")}</summary>
        <dl>
          <div>
            <dt>{t("検定・モデル", "Test or model")}</dt>
            <dd>{humanMethodLabel(executedRequest?.method ?? assessment.method)}</dd>
          </div>
          <div>
            <dt>{t("エンジン", "Engine")}</dt>
            <dd>
              {result.engine.name} {result.engine.version}
            </dd>
          </div>
          {Object.entries(result.engine.packages).map(([name, version]) => (
            <div key={name}>
              <dt>{t("統計ライブラリ", "Statistical library")}</dt>
              <dd>
                {name} {version}
              </dd>
            </div>
          ))}
          <div>
            <dt>{t("アプリケーション", "Application")}</dt>
            <dd>
              {PRODUCT_IDENTITY.developmentName} {PRODUCT_IDENTITY.version}
            </dd>
          </div>
          <div>
            <dt>{t("多重性の調整", "Multiplicity adjustment")}</dt>
            <dd>
              {executedRequest?.options.multiplicityMethod ??
                assessment.request?.options.multiplicityMethod ??
                t("なし", "None")}
            </dd>
          </div>
          <div>
            <dt>{t("実行リクエスト", "Execution request")}</dt>
            <dd>
              {executedRequest?.templateId ?? assessment.request?.templateId} /{" "}
              {executedRequest?.templateVersion ?? assessment.request?.templateVersion}
            </dd>
          </div>
        </dl>
      </details>
      <p>
        {t(
          "プロジェクト保存時に、使用データと解析条件を再現可能な解析履歴として保存します。",
          "When the project is saved, the data used and analysis settings are stored as reproducible analysis history.",
        )}
      </p>
      {methodsText ? (
        <details>
          <summary>{t("Methodsと再現記録", "Methods and reproducibility record")}</summary>
          <pre className="experiment-graph-methods-text">{methodsText}</pre>
          <button
            type="button"
            onClick={async () => {
              const copied = await copyMethodsText(methodsText);
              setMethodsCopyStatus(
                copied
                  ? t("Methodsをコピーしました。", "Methods copied.")
                  : t("コピーできませんでした。", "Could not copy Methods."),
              );
            }}
          >
            {t("Methodsをコピー", "Copy Methods")}
          </button>
          {methodsCopyStatus ? <p role="status">{methodsCopyStatus}</p> : null}
        </details>
      ) : null}
    </div>
  );
}

import type { AppLocale } from "../../app/appLocale";
import type { WorkspaceGraphAnalysis } from "../../app/experimentWorkspaceProject";

export type AnalysisReviewSetInput = Readonly<{
  locale: AppLocale;
  projectTitle: string;
  readoutLabel: string;
  readoutUnit: string;
  conditionLabels: readonly Readonly<{ id: string; label: string }>[];
  analysis: WorkspaceGraphAnalysis;
  methodsText: string;
  svgText: string;
  displayedDataCsv: string;
}>;

function escapeHtml(value: string): string {
  return value
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#39;");
}

function formatNumber(value: number, locale: AppLocale): string {
  return new Intl.NumberFormat(locale === "ja" ? "ja-JP" : "en-US", {
    maximumSignificantDigits: 8,
  }).format(value);
}

function table(headers: readonly string[], rows: readonly (readonly string[])[]): string {
  if (rows.length === 0) return "";
  return `<table><thead><tr>${headers.map((header) => `<th>${escapeHtml(header)}</th>`).join("")}</tr></thead><tbody>${rows
    .map((row) => `<tr>${row.map((cell) => `<td>${escapeHtml(cell)}</td>`).join("")}</tr>`)
    .join("")}</tbody></table>`;
}

/** Creates a self-contained, read-only review document from one executed Graph analysis. */
export function serializeAnalysisReviewSetHtml(input: AnalysisReviewSetInput): string {
  const ja = input.locale === "ja";
  const { request, result } = input.analysis;
  const labels = new Map(input.conditionLabels.map(({ id, label }) => [id, label]));
  const unitIds = new Map<string, Set<string>>();
  request.observations.forEach((observation) => {
    const units = unitIds.get(observation.conditionId) ?? new Set<string>();
    units.add(observation.experimentalUnitId);
    unitIds.set(observation.conditionId, units);
  });
  const nRows = [...unitIds.entries()].map(([conditionId, units]) => [
    labels.get(conditionId) ?? conditionId,
    String(units.size),
  ]);
  const estimateRows = result.estimates.map((estimate) => [
    estimate.name,
    formatNumber(estimate.value, input.locale),
    estimate.standardError === null ? "—" : formatNumber(estimate.standardError, input.locale),
    estimate.confidenceInterval
      ? `${Math.round(estimate.confidenceInterval.level * 100)}%: ${formatNumber(estimate.confidenceInterval.lower, input.locale)} – ${formatNumber(estimate.confidenceInterval.upper, input.locale)}`
      : "—",
  ]);
  const testRows = result.tests.map((test) => [
    test.name,
    `${test.statisticName} = ${formatNumber(test.statistic, input.locale)}`,
    test.degreesOfFreedom?.map((value) => formatNumber(value, input.locale)).join(", ") ?? "—",
    formatNumber(test.pValue, input.locale),
    test.adjustedPValue === null ? "—" : formatNumber(test.adjustedPValue, input.locale),
    test.effectSizeName && test.effectSize !== null
      ? `${test.effectSizeName} = ${formatNumber(test.effectSize, input.locale)}`
      : "—",
  ]);
  const messageRows = [...result.warnings, ...result.diagnostics].map((item) => [
    item.code,
    item.message,
  ]);
  const inlineSvg = input.svgText.replace(/^<\?xml[^>]*>\s*/u, "");
  const title = ja ? "解析レビューセット" : "Analysis review set";
  const css = `
    :root { color: #142a3d; font-family: Arial, sans-serif; background: #f5f8fa; }
    body { max-width: 1080px; margin: 0 auto; padding: 32px; }
    header, section { background: #fff; border: 1px solid #d8e1e7; border-radius: 12px; padding: 22px; margin-bottom: 18px; }
    h1, h2 { margin-top: 0; } h1 { color: #245f55; }
    dl { display: grid; grid-template-columns: max-content 1fr; gap: 7px 18px; }
    dt { font-weight: 700; } dd { margin: 0; overflow-wrap: anywhere; }
    table { width: 100%; border-collapse: collapse; margin-top: 10px; }
    th { background: #eaf5f2; text-align: left; } th, td { border-bottom: 1px solid #d8e1e7; padding: 8px; vertical-align: top; }
    .graph svg { max-width: 100%; height: auto; } pre { white-space: pre-wrap; overflow-wrap: anywhere; background: #f6f8fa; padding: 14px; }
    .notice { border-left: 4px solid #bd7b16; padding-left: 12px; color: #5c430f; }
    @media print { :root { background: #fff; } body { padding: 0; } section, header { break-inside: avoid; } }
  `;
  return `<!doctype html>
<html lang="${ja ? "ja" : "en"}">
<head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1"><title>${escapeHtml(input.projectTitle)} — ${title}</title><style>${css}</style></head>
<body>
<header><h1>${title}</h1><dl>
<dt>${ja ? "プロジェクト" : "Project"}</dt><dd>${escapeHtml(input.projectTitle)}</dd>
<dt>${ja ? "測定項目" : "Readout"}</dt><dd>${escapeHtml(input.readoutLabel)}${input.readoutUnit.trim() ? ` (${escapeHtml(input.readoutUnit.trim())})` : ""}</dd>
<dt>${ja ? "解析run ID" : "Analysis run ID"}</dt><dd>${escapeHtml(request.requestId)}</dd>
<dt>${ja ? "完了日時" : "Completed at"}</dt><dd>${escapeHtml(result.completedAt)}</dd>
<dt>${ja ? "解析engine" : "Analysis engine"}</dt><dd>${escapeHtml(result.engine.name)} ${escapeHtml(result.engine.version)}</dd>
</dl><p class="notice">${ja ? "共同研究者向けの読取専用review copyです。再編集と完全なprovenanceの保持には元の.lsaプロジェクトを使用してください。" : "This is a read-only review copy for collaborators. Use the original .lsa project for editing and complete provenance."}</p></header>
<section class="graph"><h2>Graph</h2>${inlineSvg}</section>
<section><h2>${ja ? "群別n" : "n by condition"}</h2>${table([ja ? "条件" : "Condition", "n"], nRows)}</section>
<section><h2>${ja ? "推定値と信頼区間" : "Estimates and confidence intervals"}</h2>${estimateRows.length ? table([ja ? "推定対象" : "Estimate", ja ? "値" : "Value", "SE", "CI"], estimateRows) : `<p>${ja ? "推定値はありません。" : "No estimates were returned."}</p>`}</section>
<section><h2>${ja ? "検定" : "Tests"}</h2>${testRows.length ? table([ja ? "検定" : "Test", ja ? "統計量" : "Statistic", "df", "p", ja ? "調整済みp" : "Adjusted p", ja ? "効果量" : "Effect size"], testRows) : `<p>${ja ? "検定結果はありません。" : "No test results were returned."}</p>`}</section>
<section><h2>${ja ? "警告・診断" : "Warnings and diagnostics"}</h2>${messageRows.length ? table([ja ? "コード" : "Code", ja ? "内容" : "Message"], messageRows) : `<p>${ja ? "警告・診断はありません。" : "No warnings or diagnostics."}</p>`}</section>
<section><h2>Methods</h2><pre>${escapeHtml(input.methodsText)}</pre></section>
<section><h2>${ja ? "表示データ（CSV）" : "Displayed data (CSV)"}</h2><details><summary>${ja ? "CSVを表示" : "Show CSV"}</summary><pre>${escapeHtml(input.displayedDataCsv.replace(/^\uFEFF/u, ""))}</pre></details></section>
</body></html>`;
}

import type { AnalysisEngineRequest, AnalysisEngineResult } from "@lsaa/analysis-contracts";

const number = (value: number | null) => (value === null ? "—" : String(value));

/** Read only the accepted execution; current form edits never relabel an old result. */
export function CommonAnalysisResults({
  request,
  result,
}: {
  request: AnalysisEngineRequest;
  result: AnalysisEngineResult;
}) {
  if (request.requestId !== result.requestId || result.status !== "ok") return null;
  const contingency = request.protocolVersion === "0.11.0";
  const regression = request.protocolVersion === "0.13.0";
  if (!contingency && !regression) return null;
  const corrected = contingency && request.cells.some((cell) => cell.count === 0);
  const ratio = (name: string) => contingency && ["odds_ratio", "risk_ratio"].includes(name);
  const estimateLabel = (name: string) => {
    if (ratio(name))
      return `${name === "odds_ratio" ? "オッズ比 OR" : "リスク比 RR"}（${corrected ? "全4セル +0.5補正" : "未補正"}）`;
    return name === "slope" ? "傾き" : name === "intercept" ? "切片" : name;
  };
  return (
    <section aria-label="解析結果の概要">
      <h3>検定結果</h3>
      {result.tests.map((test) => (
        <p key={test.name}>
          {test.name === "fisher_exact_test"
            ? "Fisherの正確検定（両側）"
            : test.name === "slope_hypothesis_test"
              ? "傾きの仮説検定"
              : test.name}
          {": "}
          {test.name === "fisher_exact_test" ? "未補正の標本OR" : test.statisticName} ={" "}
          {number(test.statistic)}、p = {number(test.pValue)}
        </p>
      ))}
      {regression ? (
        <p>
          仮説方向:{" "}
          {request.options.alternative === "two_sided"
            ? "両側"
            : request.options.alternative === "greater"
              ? "傾き > 0"
              : "傾き < 0"}
          。傾きのCIは中央両側区間です。
        </p>
      ) : null}
      {result.estimates.length ? (
        <>
          <h3>推定値と信頼区間</h3>
          <table>
            <thead>
              <tr>
                <th scope="col">推定対象</th>
                <th scope="col">値</th>
                <th scope="col">標準誤差</th>
                <th scope="col">信頼区間</th>
              </tr>
            </thead>
            <tbody>
              {result.estimates.map((estimate) => (
                <tr key={estimate.name}>
                  <th scope="row">{estimateLabel(estimate.name)}</th>
                  <td>{number(estimate.value)}</td>
                  <td>
                    {ratio(estimate.name) ? "log比のSE: " : ""}
                    {number(estimate.standardError)}
                  </td>
                  <td>
                    {estimate.confidenceInterval ? (
                      <>
                        {estimate.confidenceInterval.level * 100}%{" "}
                        {ratio(estimate.name) ? "対数Wald・中央両側CI" : "中央両側CI"}:{" "}
                        {number(estimate.confidenceInterval.lower)} ～{" "}
                        {number(estimate.confidenceInterval.upper)}
                      </>
                    ) : (
                      "定義なし"
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </>
      ) : null}
      {contingency && result.estimates.some((estimate) => ratio(estimate.name)) ? (
        <p>
          {corrected
            ? "原度数に零セルがあるため、OR/RR推定とCIだけ全4セルへ0.5を加えています。"
            : "OR/RR推定とCIに零セル補正はありません。"}
          RRは {request.rowCategoryIds[0]} / {request.rowCategoryIds[1]}、イベントは{" "}
          {request.columnCategoryIds[0]}。
          {request.method === "fisher_exact"
            ? "Fisherのp値は原度数で計算し、このCIはFisherの正確区間ではありません。"
            : ""}
        </p>
      ) : null}
      {regression && result.regression ? (
        <p>
          R² = {number(result.regression.rSquared)}（
          {request.includeIntercept ? "平均Yを基準にした中心化" : "0を基準にした非中心化"}）。切片は
          {request.includeIntercept ? "推定" : "0に固定"}。
        </p>
      ) : null}
      {result.diagnostics.length ? (
        <details>
          <summary>計算条件・診断</summary>
          <ul>
            {result.diagnostics.map((item, i) => (
              <li key={`${item.code}-${i}`}>{item.message}</li>
            ))}
          </ul>
        </details>
      ) : null}
      {result.warnings.map((warning, i) => (
        <p key={i}>{warning.message}</p>
      ))}
      <details>
        <summary>結果データ</summary>
        <pre style={{ whiteSpace: "pre-wrap" }}>
          {JSON.stringify(
            { estimates: result.estimates, tests: result.tests, diagnostics: result.diagnostics },
            null,
            2,
          )}
        </pre>
      </details>
    </section>
  );
}

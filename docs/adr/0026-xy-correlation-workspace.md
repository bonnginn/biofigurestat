# ADR 0026: XY相関を実験単位IDで接続する

## Decision

新しい実験導線に、同じ実験単位から得たXとYの関係を調べるCore workflowを追加する。

- 研究者は統計名ではなく「直線に近い増減」または「順位・単調な関係」を確認する。
- XとYは各Expの安定した実験単位IDで対応づける。行順、日付、batchだけからペアを推定しない。
- Data Sheetは各ExpでXとYを横並びに直接入力し、Excel/Google Sheetsの2セル貼り付けを受け付ける。
- 散布図と相関解析にはXとYが両方そろった完全な組だけを使う。片側欠測は表示して説明し、補完しない。
- 直線的な問いには既存D09 Pearson、順位・単調な問いには既存D09 Spearmanを使う。別の統計実装は作らない。
- 保存時はraw値、実験単位ID、D09 request/result、scatter GraphSpecを同じproject lineageへ記録する。

現行のdomain contractではD09の2変数を2つのmatched conditionとして表現する。画面上ではこれを群比較と呼ばず、X/Y測定変数として提示する。

## Consequences

相関を通常の新規実験と同じworkspaceで作成・保存・再編集できる。非線形回帰、群別相関、測定誤差モデルはこのCore sliceには含めない。

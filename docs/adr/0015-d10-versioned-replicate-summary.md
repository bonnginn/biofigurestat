# ADR 0015: D10を版管理された反復要約として実装する

- 状態: accepted
- 日付: 2026-08-20

## 決定

D10の初期実装はnested mixed modelではなく、ネストしたscalar観測を宣言済みの生物学的実験単位ごとに平均または中央値へ要約する、版管理された前処理とする。要約後の派生値をD01/D02等の検証済み解析へ渡す。

保存対象は以下である。

- 上書きしないraw observation
- 親子関係を持つunit instance
- TransformationSpec 0.2.0
- DerivedDatasetRevision
- source observation/unit IDを持つDerivedScalarValue
- 派生データrevisionを明示するanalysis run

cell/ROI行を直接analysis requestへ渡してはならない。raw変更時には派生データ、解析、グラフをstaleにする。MethodsでD10を記載できるのは、実行requestがcurrentな派生値から再現できる場合だけである。

## 初期の重み付け

初期UIは `equal_observations_within_experimental_unit` のみを扱う。すなわち、1ディッシュ内の貼り付けたcell/ROIを等重みで要約する。field平均を等重みにする多段階要約は、暗黙に行わずLaterとする。

## グラフ

`raw_and_replicate_summary`ではraw cell/ROIを薄い小点、派生した生物学的反復を濃い大点で示す。平均とSD/SEMは派生した反復値だけから計算する。

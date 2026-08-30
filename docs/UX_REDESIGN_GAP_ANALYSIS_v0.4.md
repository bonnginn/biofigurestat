# UX Redesign v0.4 ギャップ分析

Updated: 2026-08-21

## 結論

現行アプリの計算・来歴・保存基盤は再利用する。一方、新規実験の主導線は旧Wizardへの継ぎ足しではなく、研究者言語の新しいUX shellとして再構築する。

## 再利用する資産

- `@lsaa/domain`: condition、outcome、unit hierarchy、observation、raw revision、derived lineage。
- `@lsaa/project`: schema validation、migration、checksum、atomic save/open、stale propagation。
- `@lsaa/analysis-contracts` とPython engine: 検証済み解析とgolden fixture。
- `@lsaa/data-sheet`: numerator/eligible、target/reference、nested replicate summary、clipboard parserの純粋関数。
- `@lsaa/graph-spec`: data source、mapping、summary、appearanceの分離とcore graph model。
- desktop adapter: local engine、file dialog、project package、export。

## 新主導線から退役させるUI

- `ComparisonWizard`: 固定テンプレート選択とplanned Nを一つの長い画面で決める構成。
- `VisualPatternGallery`: 図から内部解析パターンへ直接入る補助導線。
- `DataSheetPage` / `MultiConditionDataSheetPage`: conditionとNを主軸にし、入力・解析・graph・saveを一コンポーネントで結合する旧ワークフロー。
- `AnalysisResultView` の「解析実行後にgraphを1つ作る」前提のUI。

旧コンポーネントは既存projectの互換表示のため当面残すが、新規実験からは呼び出さない。

## 主要ギャップ

1. 新規実験入口がWB/顕微鏡で、指定された5つの生物学的文脈になっていない。
2. Experimentが画面上の第一級オブジェクトではなく、固定Nの入力位置として表現される。
3. design schemaにはordered time plan、longitudinal/cross-sectional、missing/not-planned、condition attributeの科学メタデータが明示されていない。
4. graphはanalysis runと強く結合し、任意個数・複数graph・表示subset・複数layerのユーザー操作がない。
5. 未完了Experimentとmissing/not plannedを安全に表現したまま暫定graphを作る導線がない。
6. nested rawはimportカード中心で、wide sheetの選択cellから開くRaw / summary inspectorになっていない。

## 最小の一貫した再構築

1. `Home -> New experiment` は生物学的文脈の5カテゴリへ入る。
2. 最初のvertical sliceは `Cell / culture` の `Count / proportion` と `Intensity / size / morphology` に限定する。
3. 短いdesign editorでcondition、optional attribute、ordered time、same-unit/separate-sample、readout、予定Experiment数を入力する。
4. 確認画面でCondition / Time構造と軽量なexpected analysis familyを表示する。
5. `Overview | Exp 1 | Exp 2 | Exp 3 | + Experiment` を主シートにする。日付とnoteはExperimentに1つ、wide tableはcondition/time/readoutを表現する。
6. numerator/eligibleは直接値と読取専用percentage、nested continuousは選択cellのRaw / summary inspectorを提供する。
7. `+ New graph` はデータsubsetとlayerからPrism-like simpleのgraphを作る。statisticsは任意の後続操作にする。

## 契約変更の境界

Phase 1は新しいUI draft/view-modelを用い、既存のproject schemaとstatistics contractを変更しない。代表フローの表示・入力・graph作成を通した後、time plan、missingness、任意graphの永続化に必要な正式schema拡張を別ADRで審査する。

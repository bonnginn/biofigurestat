# ADR 0020: 新規実験をExperiment-first UX shellとして再構築する

## 状況

現行UIは測定方法、解析テンプレート、固定planned NからData Sheetを作る。UX Redesign v0.4は、生物学的文脈、条件・時間・readout、独立Experimentを主軸とし、graphとstatisticsを任意かつ分離されたviewとすることを求めている。

## 決定

- 新規実験は新しいresearcher-language UX shellのみを通る。
- 旧 `ComparisonWizard`、`DataSheetPage`、`MultiConditionDataSheetPage`は既存projectの互換経路として当面保持するが、新UXへ例外分岐を追加しない。
- Phase 1ではUI-onlyのversioned draft/view-modelを作り、新flowの構造と操作を確定する。
- canonical project、raw revision、derived lineage、analysis、graphの契約は変更しない。永続化に必要な追加概念はUI検証後に別ADR/schema migrationとして扱う。
- 最初の代表flowはnumerator/eligibleとnested continuousとする。公開論文固有の名前をworkflow名にしない。
- Experiment tabは独立実験セッションを表し、日付・note・condition/time/readoutのwide tableを持つ。
- nested rawはwide table中に全展開せず、選択cellのRaw / summary inspectorで入力・来歴・要約を示す。
- graphは任意個数の独立viewとし、statisticsはgraph必須にしない。

## 結果

旧UIのテストと互換性を保ちながら、新UXを小さな汎用コンポーネントで独立して検証できる。UI draftを正式projectと誤解させないよう、Phase 1の保存操作はcanonical adapterができるまで有効化しない。

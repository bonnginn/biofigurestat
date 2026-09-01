# BioFigureStat 0.1.0-alpha.2 — Release notes

## 日本語

BioFigureStat Public Alphaの日英統合更新です。同じアプリ、同じ`.lsa`保存形式、同じ
ローカル統計エンジンのまま、アプリの表示言語を日本語と英語で切り替えられます。

### 主な更新

- 日本語／英語の表示切替と、再起動後の言語設定保持
- Home、実験設定、Data、Graph、Statistics、Help、不具合報告など主要画面の英語表示
- 以前日本語環境で保存した`.lsa`を英語UIで開いた場合の、アプリ生成メッセージの英語再構成
- Graph-only projectの保存・再読み込み時に、Data、Graph、Statisticsと保存済みGraphを保持
- native保存画面を使ったSVG／PNG書き出しと、未保存終了確認の強化
- Graph描画、Spreadsheet入力、project migration、native UIについての回帰検査を拡充
- 開発用evaluation処理を配布bundleから除外

研究者が入力した実験名、条件名、測定項目名、軸名は自動翻訳しません。統計手法、
biological `n`、pairing、nesting、censoring、ordered identity、raw lineage、`.lsa`保存schemaは
変更していません。

### Alpha版の注意

- 研究データと`.lsa`は必ず別の場所にもバックアップしてください。
- 実験単位、biological `n`、対応・入れ子構造、比較範囲、打ち切りを確認してください。
- 保存したprojectを再度開き、Graphと解析結果を書き出し前に確認してください。
- macOS版はApple notarization未実施、Windows版はcode signing未実施です。

## English

This release updates the BioFigureStat Public Alpha with integrated Japanese and English UI.
It remains the same application, `.lsa` project format, and deterministic local statistical
engine; only the application display language is switched.

### Main changes

- Japanese/English application-language switching with persistence across restart
- English rendering across Home, experiment setup, Data, Graph, Statistics, Help, and reporting
- English reconstruction of application-generated messages when older Japanese-authored `.lsa`
  projects are opened in English mode
- Graph-only save/reopen now retains Data, enabled Graph and Statistics tabs, and the saved Graph
- Stronger native SVG/PNG Save-dialog and unsaved-work exit behavior
- Expanded regression coverage for Graph rendering, spreadsheet entry, project migration, and
  packaged native UI
- Development-only evaluation code is excluded from distributed production bundles

Researcher-authored experiment, condition, readout, and axis labels are not translated. This
update does not change statistical methods, biological `n`, pairing, nesting, censoring, ordered
identity, raw lineage, or the `.lsa` project schema.

### Alpha cautions

- Keep an independent backup of research data and every `.lsa` project.
- Confirm the experimental unit, biological `n`, pairing/nesting, comparison scope, and censoring.
- Reopen saved projects and inspect Graphs and analysis results before relying on exports.
- The macOS build is not Apple-notarized and the Windows build is not code-signed.

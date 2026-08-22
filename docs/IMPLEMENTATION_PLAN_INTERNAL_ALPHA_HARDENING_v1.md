# Internal Alpha Hardening 実装計画 v1

作成日：2026-08-22

## 目的

Graph editorの大幅な再設計をfreezeし、開発の中心を次に移す。

1. project・raw・統計の安全性
2. 独立したStatistics workspace
3. 対照群対各群の適切な多重比較
4. lineageを保つWB背景補正
5. 文脈別の実験入口とadaptive Wizard
6. 数値表と作業対象を主役にする画面密度

## 分類

| 機能                 | 分類                   | 扱い                                        |
| -------------------- | ---------------------- | ------------------------------------------- |
| 単一ファイル`.lsa`   | Core基盤の置換         | schemaとatomic/recovery contractをSolが固定 |
| Statistics workspace | 既存Coreのcomposition  | 統計contractは変えず表示責務を分離          |
| Control-vs-many      | 小さなCore拡張         | package-backed実装とgolden testが条件       |
| 安全な自動再解析     | Core再現性拡張         | methodの自動変更は禁止                      |
| WB背景補正           | 小さなCore拡張         | rawと変換lineageを必須化                    |
| 文脈別入口           | 既存CoreへのUX adapter | canonical designへの変換は1箇所             |
| Survival             | Laterの専用family      | 通常の経時測定に変換しない                  |
| 複数window           | Later                  | project stateの完全分離が先                 |

## 実装順

## 進捗（2026-08-22）

- Stage 1の5契約をADR 0036–0040で固定済み。
- `.lsa`はpin済みSQLiteをcontainerにした実ファイル形式を実装済み。旧directory projectは明示的に取り込み、初回保存時にbackupを残して変換する。
- project navigationに独立した「統計」workspaceを追加済み。Graph Inspectorは外観と表示に限定し、解析実行・結果・Methodsを統計側に分離した。
- SciPy 1.18.0のDunnett APIは候補だが、現行のWelch既定解析と前提が異なる。独立golden validation完了までUI非公開。
- 3条件以上では対照を任意に明示でき、表示名から推測せずstable condition IDをproject・解析request・Methodsへ保持する。現行の検証済み経路はWelch ANOVA + Games–Howell全ペア補正であり、対照指定によってDunnettへ自動変更しない。
- Games–Howellの調整p値と同時信頼区間は、production SciPyとは別のvalidation-only Statsmodels studentized-range実装でも照合済み。
- 構造fingerprint一致時だけ同じrequestをdebounce再実行する安全な自動再解析を実装済み。構造変更時はstale化し、解析法を自動変更しない。
- WBは補正済み値の直接入力と、ImageJ Mean intensity・Mean background・Areaによる明示的背景補正の2 modeを実装済み。元測定値、formula/version、補正値、Target/referenceを保存・再編集・Methods出力できる。
- 新規実験は6入口と文脈別subrouteへ更新済み。顕微鏡を独立入口にし、Cell/ROIの入れ子入力を明示した。WB/X-Yは不要な時間stepを省略し、増殖・顕微鏡連続測定・tracking・動物数値/経時は時間構造を条件より先に確認する。
- Recentは保存・openした`.lsa`のローカル履歴から直接再openできる。Favorite（設計のみ）とは別管理。
- Home/New Experiment/Importの余白、card高、heading scaleを縮小し、文字サイズを落とさず作業対象を上へ移動した。

### Stage 1：contractとADR

- Statistics workspaceの責務境界
- 単一ファイルcontainerとatomic replacement
- Control-vs-manyのpackage採用可否
- analysis fingerprintと自動再実行条件
- WB補正のtransformation contract

### Stage 2：Core実装

- 単一ファイルsave/open/recovery
- project主navigationのStatistics
- 独立したStatistics view
- 安全な自動再解析
- WBの2入力mode
- validation完了後のcontrol-vs-many

### Stage 3：研究者入口

- 細胞・培養
- 顕微鏡・画像解析
- タンパク質・生化学
- 動物
- その他の定量測定
- 既存データの直接import

### Stage 4：workspace density

Home、New Experiment、Wizard、confirmation、Overview、Data、Graph、Statistics、Import、Favoritesを共通基準でauditする。文字を小さくするのではなく、見出し、余白、重複説明、card高を減らす。

### Stage 5：daily-use polish

Methods、Graph style reuse、Recent、ImageJ/Excel入力、AUC説明を仕上げる。

## 完了gate

- 1ファイルprojectがatomicに往復できる。
- StatisticsがGraph Inspectorから分離される。
- 保存済みanalysis resultだけがGraph注釈に使われる。
- Control-vs-manyは検証済みpackage methodがある場合だけ公開される。
- raw変更でstale化し、同一requestが有効な場合だけ再実行される。
- WBの補正済み入力とraw補正入力を混同しない。
- 六つの入口が実際に異なる質問経路を持つ。
- 1360 × 900 pxで主要操作とData Sheetが不要なscrollなしに近い位置へ現れる。

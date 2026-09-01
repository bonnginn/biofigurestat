# BioFigureStat 今後の作業一覧

更新日: 2026-09-01 (JST)

この文書は、今後の作業と完了状況を一か所で確認するための一覧です。
実装や検証が終わるたびに状態と証拠を更新します。

## 状態

- ✅ 完了: 実装・必要な検証・記録まで完了
- 🟡 進行中: 安全に使える部分はあるが、残作業あり
- ⚠️ 環境待ち: 製品不具合ではなく、検証環境または外部設定が必要
- ⬜ 未着手: これから実施
- ⏸ 延期: Alphaでは必須とせずBeta以降へ送った項目

## 次に行う順番

| 順位 | 状態 | 作業                                         | ユーザー確認     | 完了条件                                                                                                                               |
| ---- | ---- | -------------------------------------------- | ---------------- | -------------------------------------------------------------------------------------------------------------------------------------- |
| 1    | ✅   | 日英統合Windows candidateの短い実機確認      | 完了             | `win-review3`で両言語、用語、見切れ、Graph-only保存再読込、タイトル保持がPASS                                                          |
| 2    | ⬜   | 日英統合macOS candidateのbuildと限定実機確認 | 最終確認のみ必要 | native verifier、保存・再読込、書き出し、両言語表示がPASS                                                                              |
| 3    | ⬜   | 日英統合Alpha更新の公開判断                  | 必要             | Windows/macOS証拠、checksum、release noteを揃え、同じBioFigureStatの次candidateとして公開可否を記録                                    |
| 4    | ✅   | Windows native UI harnessの実機scenario      | 不要             | 最新packaged exeで入力、Statistics validation、native export、dirty Close / Cancel / DiscardがPASS                                     |
| 5    | 🟡   | macOS native UI harness                      | 原則不要         | Accessibility adapterは実装済み。permission済みMac runnerで初回PASSを記録                                                              |
| 6    | 🟡   | GraphとSpreadsheetの共通化を再開             | 不要             | tick・zoom・native export controller・Graph state selectorを共通化済み。画面ごとの修正漏れをさらに減らし、既存`.lsa`と科学的意味を維持 |

## 公開・運用

| 状態 | 項目                                 | 証拠・残作業                                                                                               |
| ---- | ------------------------------------ | ---------------------------------------------------------------------------------------------------------- |
| ✅   | 日本語Public Alpha公開               | `v0.1.0-alpha.1`をGitHub Pre-releaseとして公開済み                                                         |
| ✅   | MIT License                          | 公開sourceと配布物へ反映済み                                                                               |
| ✅   | Windows日本語版                      | installer、engine、save/open/exportを検証済み                                                              |
| ✅   | Apple Silicon macOS日本語版          | zip、署名整合、save/open/exportを検証済み                                                                  |
| ✅   | GitHub release説明の日本語・英語併記 | release pageへ反映済み                                                                                     |
| ⚠️   | READMEの日本語・英語案内             | ローカル`7f52c86`は日本語→英語で案内済み。公開`origin/main`の`38bd2d6`は英語中心のままで、push/mergeが必要 |
| ✅   | opt-in利用情報収集                   | 研究データを含めない同意式送信、停止、診断書き出しを実装済み                                               |
| ✅   | 不具合報告                           | 確認後送信、Worker/D1、rate limit、保持期限、report IDを実装済み                                           |
| ✅   | 不具合報告の日次triage               | 別タスクで毎日1回のread-only分類・提案運用を設定済み                                                       |

## 日本語・英語の統合

日本語版と英語版を別アプリにはしません。同じBioFigureStat、同じ保存形式、同じ統計engine
の中で表示言語だけを切り替えます。現在公開中の`0.1.0-alpha.1`は英語UI実装前のbuildで、
次のnative candidateが日英統合buildになります。

| 状態 | 項目                                 | 証拠・残作業                                                                                                   |
| ---- | ------------------------------------ | -------------------------------------------------------------------------------------------------------------- |
| ✅   | 日本語・英語切替                     | localeは`.lsa`外に保持し、科学的semantic keyを変更しない                                                       |
| ✅   | Public Alpha主要画面の英語化         | Home、実験設定、Data、Graph、Statistics、Help、報告を対象化                                                    |
| ✅   | 日本語表示漏れの自動検査             | visible text、aria-label、title、placeholder、altを検査                                                        |
| ✅   | native自動検査で見つけた表示漏れ修正 | New Experiment wrapperとworkspace fallbackを修正                                                               |
| ✅   | 自動回帰                             | UI 162ファイル、1,200テストPASS。共有package等278テスト、typecheck・lintもPASS                                 |
| ✅   | 日英統合Windows build                | `4041e85-alpha.20260901.win-review3`はbundle/engine/release/native UI verifierと人間の両言語・layout確認がPASS |
| ⬜   | 日英統合macOS build                  | candidate buildと限定確認が必要                                                                                |
| ⬜   | 日英統合buildの配布                  | 両native gate後に、同じアプリの次Alpha assetとrelease noteを追加                                               |

## Native不具合検出の自動化

| 状態 | 項目                                   | 証拠・残作業                                                                                   |
| ---- | -------------------------------------- | ---------------------------------------------------------------------------------------------- |
| ✅   | Windows exact-executable harnessの初版 | packaged Tauri exeを直接起動するdependency-free harnessを追加                                  |
| ✅   | native IPC・export byte検査            | architecture IPCと書き出しbyte一致を検査                                                       |
| ✅   | dirty close lifecycle scenario         | 入力、×、保存確認、Cancel保持、再度×、破棄終了をscenario化                                     |
| ✅   | screenshot・JSON evidence              | 成功・失敗stepと画面証拠を`.tmp/native-ui-regression/`へ保存                                   |
| ✅   | 製品FAILとharness環境FAILの分離        | `PRODUCT_REGRESSION`と`HARNESS_INFRASTRUCTURE_BLOCKED`を区別                                   |
| ✅   | Windows WebView2起動・接続             | transient blank targetを待機し、このhostの最新packaged exeでscenario全体がPASS                 |
| ✅   | Graph-only Statistics validation       | 実表入力からGraph/Statisticsへ進み、未回答項目の英語alert表示とfocusをnativeで検査             |
| ⬜   | native file dialog自動操作             | Open、Save、Save As、PNG/SVG/CSVのCancel/保存先を自動確認                                      |
| ⬜   | `.lsa` file association自動確認        | ダブルクリック起動と同名・別名projectの内容一致を検査                                          |
| 🟡   | macOS adapter                          | Accessibilityで入力、Command+Q、Cancel保持、破棄終了を同じreport schemaへ実装。Mac実行証拠待ち |
| ⏸    | 人間の見た目判断                       | graph品質、clipping、font、余白、高DPIは最終的に人間が確認                                     |

### 人の操作が必要な保留項目

- 最新Windows candidateの日本語・英語の用語、文字切れ、余白の短い確認。
- permission済みMacでmacOS adapterを1回実行し、同じdirty終了scenarioを記録。
- 日英統合macOS candidateの保存・再読込・native file dialogの限定確認。
- 日英統合Alpha assetを公開する最終判断。

## BetaまでのUI/UX改善

| 状態 | 項目                                   | 完了条件                                                      |
| ---- | -------------------------------------- | ------------------------------------------------------------- |
| ⏸    | Graph preview品質を完成Graphへ近づける | previewでも軸、font、余白、点、誤差線が実用的に見える         |
| ⏸    | workspace上部をcompact化               | Graph/Data領域をスクロール前から広く表示できる                |
| ⏸    | 実験metadataの再編集                   | Treatment、readout、unit名などをOverviewから安全に変更できる  |
| ⏸    | Kaplan–Meier外観設定の共通化           | 色、font size、軸、legend等を共通Graph相当に編集できる        |
| ⏸    | Statistics結果一覧の改善               | 調整済み比較をStatisticsタブから一覧表示できる                |
| ⏸    | 独立性確認の質問を短くする             | 科学的安全性を保ちつつ、単純実験で過度に厳しく見えない        |
| 🟡   | Graph-onlyの通常workspace統合          | 共通editorは利用可能。完成Graphとの表示差を継続解消           |
| ✅   | 複数projectのタブ管理                  | 同一windowで保持、再Open、dirty checkpointを回帰test済み      |
| ✅   | Excel workbook取込                     | `.xls/.xlsx/.xlsm/.xlsb`、sheet選択、Expとしてstackを実装済み |

## コード整理・堅牢化

| 状態 | 項目                                  | 完了条件                                                                                                                                                                                                                                                                                                       |
| ---- | ------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 🟡   | Graph共通描画                         | 通常・Survival・非線形に加え旧Resultsの独自tickも`createNiceTicks`へ統合。1値rangeの重複tickも共通helperで解消。plot bounds等は継続                                                                                                                                                                            |
| 🟡   | Spreadsheet共通primitive              | keyboard/paste/zoomに加え、旧2条件・多条件表のTab順、最小scroll focus、tablist移動、有限数値parse、割合表示を共通化。draft/commitとcell editor統合は継続                                                                                                                                                       |
| 🟡   | `ExperimentGraphWorkbench`分割        | 各editor、3種renderer、series/lineage投影、factor/facet/legend/readiness投影、localized data summary、Statistics context/注釈/intent、workspace同期、instrumentation、benchmark capture、native export feedbackを分離済み。workbenchは約4,900行から2,614行へ縮小。残るinspector/data-selection部を段階的に分離 |
| ✅   | 未使用prototypeの公開sourceからの分離 | private archiveへ保全し、public sourceには含めない                                                                                                                                                                                                                                                             |
| ✅   | benchmark生成物の公開sourceからの除外 | evaluation/benchmark materialを通常product sourceから分離                                                                                                                                                                                                                                                      |
| ⬜   | route-level code splitting            | 初期bundleと巨大routeの依存を縮小                                                                                                                                                                                                                                                                              |
| ⬜   | 保存format migration fixture基盤      | Public Alphaの既知`.lsa`を将来版でも開ける回帰fixtureを整備                                                                                                                                                                                                                                                    |
| 🟡   | エラー表示の構造化                    | 主要I/O errorは分類済み。内部codeや生traceの残存経路を継続監査                                                                                                                                                                                                                                                 |
| ✅   | 解析timeoutとCancel                   | native engine processをtimeout/cancelできる実装とtestあり                                                                                                                                                                                                                                                      |
| 🟡   | 数値warningの伝播                     | 捕捉済み経路あり。全methodでwarningが失われないか継続監査                                                                                                                                                                                                                                                      |

## 完了判定の原則

- 自動testだけでnative項目を完了にしない。packaged appの証拠も必要です。
- browser previewとnative実機の証拠を混ぜません。
- scientific semantics、biological `n`、pairing、nesting、censoring、ordered identity、raw lineageをUI簡略化のために変更しません。
- Public Alphaで保存された`.lsa`は後方互換対象です。
- 見た目の好みと、data loss・crash・誤解析・保存失敗を分けて優先します。

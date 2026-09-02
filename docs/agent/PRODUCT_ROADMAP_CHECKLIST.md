# BioFigureStat 今後の作業一覧

更新日: 2026-09-02 (JST)

この文書は、今後の作業と完了状況を一か所で確認するための一覧です。
実装や検証が終わるたびに状態と証拠を更新します。

## 状態

- ✅ 完了: 実装・必要な検証・記録まで完了
- 🟡 進行中: 安全に使える部分はあるが、残作業あり
- ⚠️ 環境待ち: 製品不具合ではなく、検証環境または外部設定が必要
- ⬜ 未着手: これから実施
- ⏸ 延期: Alphaでは必須とせずBeta以降へ送った項目

## 次に行う順番

完了した作業はこの表から外し、下の各分野に証拠を残します。

| 順位 | 状態 | 作業 | ユーザー確認 | 完了条件 |
| ---- | ---- | ---- | ------------ | -------- |
| 1 | 🟡 | 正式な同等性解析の次の実行method | paired、shared-run、positive/totalの科学レビュー | 独立2群continuousの単一主比較は完了。次はreview済みのdesignだけ段階的に有効化 |
| 2 | 🟡 | installed `.lsa` file associationの自動確認 | installerとOS関連付けの確認時のみ | 同じexeへのpath指定再起動はpackaged PASS。次にinstaller経由のdouble-clickを再現 |
| 3 | 🟡 | 残るBeta視覚調整 | 最終的な見た目のみ | 通常Graph previewとKaplan–Meierの安全な外観設定は実装済み。Graph-only表示差と最終的な見た目を実機で確認 |
| 4 | ⏸ | 独立性確認文の短文化 | 科学表現の承認が必要 | biological nを曖昧にせず、単純実験で過度に厳しく見えない文面へする |

## 公開・運用

| 状態 | 項目                                 | 証拠・残作業                                                                              |
| ---- | ------------------------------------ | ----------------------------------------------------------------------------------------- |
| ✅   | 日本語Public Alpha公開               | `v0.1.0-alpha.1`をGitHub Pre-releaseとして公開済み                                        |
| ✅   | 日英統合Public Alpha公開             | `v0.1.0-alpha.2`を両OS assetと日英release notes付きPre-releaseとして公開済み              |
| ✅   | MIT License                          | 公開sourceと配布物へ反映済み                                                              |
| ✅   | Windows日本語版                      | installer、engine、save/open/exportを検証済み                                             |
| ✅   | Apple Silicon macOS日本語版          | zip、署名整合、save/open/exportを検証済み                                                 |
| ✅   | GitHub release説明の日本語・英語併記 | release pageへ反映済み                                                                    |
| ✅   | READMEの日本語・英語案内             | `biofigurestat`のREADME先頭に日英説明、Download導線、両OSの直接asset link、checksumを掲載 |
| ✅   | alpha.2公開リンク・checksum整合       | README、final release notes、versioned Help URLを更新し、release/guide/両assetを匿名HTTP確認 |
| ✅   | opt-in利用情報収集                   | 研究データを含めない同意式送信、停止、診断書き出しを実装済み                              |
| ✅   | 不具合報告                           | 確認後送信、Worker/D1、rate limit、保持期限、report IDを実装済み                          |
| ✅   | 不具合報告の日次triage               | 別タスクで毎日1回のread-only分類・提案運用を設定済み                                      |

## 日本語・英語の統合

日本語版と英語版を別アプリにはしません。同じBioFigureStat、同じ保存形式、同じ統計engine
の中で表示言語だけを切り替えます。`0.1.0-alpha.2`は、同じアプリと保存形式のまま
日英統合buildとして公開済みです。

| 状態 | 項目                                 | 証拠・残作業                                                                                                               |
| ---- | ------------------------------------ | -------------------------------------------------------------------------------------------------------------------------- |
| ✅   | 日本語・英語切替                     | localeは`.lsa`外に保持し、科学的semantic keyを変更しない                                                                   |
| ✅   | Public Alpha主要画面の英語化         | Home、実験設定、Data、Graph、Statistics、Help、報告を対象化                                                                |
| ✅   | 日本語表示漏れの自動検査             | visible text、aria-label/description、title、placeholder、altに加え編集欄の現在値も検査。34 files / 347 testsで英語fixtureの残存0件 |
| ✅   | native自動検査で見つけた表示漏れ修正 | New Experiment wrapperとworkspace fallbackを修正                                                                           |
| ✅   | 自動回帰                             | UI 162ファイル、1,200テストPASS。共有package等278テスト、typecheck・lintもPASS                                             |
| ✅   | 日英統合Windows build                | `ab5b012-alpha.20260901.win-refactor2`はbuild/engine/bundle/releaseとexact-executable native harnessがPASS               |
| ✅   | 日英統合macOS build                  | `15aabd0-alpha.20260901.mac-refactor2`はbuild/engine/bundle/releaseと全限定実機確認がPASS。Accessibility harness環境BLOCKは別管理 |
| ✅   | 日英統合buildの配布                  | `v0.1.0-alpha.2`へWindows/macOS assetと日英release notesを掲載済み                                                         |

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
| ✅   | Welch TOST native実行                  | `951b3b7-beta.20260902.win-preview10`でexact executable harnessが実Tauri `run_analysis`→同梱engine→JSON IPCを通過し、protocol `0.15.0`、`ok`、`equivalence_supported`を確認。sidecar、Rust製品process境界、native harnessは同一request fixtureを使用 |
| ✅   | native file dialog自動操作             | Windows実Open、SVG/PNG/CSV Cancel、SVG任意パス保存、project `.lsa`任意パス保存をpackaged PASS。標準Alt+Nでmodern/classic双方のfilename欄へ移動し、UTF-16 `SendInput`で絶対pathを入力。自己test 13/13、証拠は`.tmp/native-ui-regression/win-preview10-save-targets-alt-n4/` |
| 🟡   | `.lsa` file association自動確認        | project保存→同じexeへpathを渡す再起動、Data保持、保存済みGraph、Graph/Statistics有効化はpackaged PASS。installer登録後のdouble-clickのみ未確認 |
| 🟡   | macOS adapter                          | Accessibilityで入力、Command+Q、Cancel保持、破棄終了を同じreport schemaへ実装。Mac実行証拠待ち |
| ⏸    | 人間の見た目判断                       | graph品質、clipping、font、余白、高DPIは最終的に人間が確認                                     |

### 人の操作が必要な保留項目

- 最新Windows candidateの日本語・英語の用語、文字切れ、余白の短い確認。
- permission済みMacでmacOS adapterを1回実行し、同じdirty終了scenarioを記録。

## BetaまでのUI/UX改善

| 状態 | 項目                                   | 完了条件                                                                         |
| ---- | -------------------------------------- | -------------------------------------------------------------------------------- |
| 🟡   | Graph preview品質を完成Graphへ近づける | 通常previewへ共有plot bounds、nice Y ticks、軸title、tick余白を実装し、scatterにも両軸nice ticksとdata paddingを追加。category構成は0–100%軸、条件label、legend、wide scrollを追加。5件の座標・semantic回帰はPASSし、最終的な見た目のみ実機確認待ち |
| ✅   | workspace上部をcompact化               | compact headerと安全な概要導線を実装・回帰test済み                               |
| ✅   | 実験metadataの再編集                   | 既存のstructure revision経路から実験名・条件・測定項目を安全に修正可能           |
| ✅   | Kaplan–Meier外観設定の共通化           | 系列色、全体font size、凡例位置・凡例font size、補助目盛、目盛方向、軸titleを保存・再読込対応。旧`.lsa`は従来defaultで表示。生存確率0–1・linearとfollow-up全域は科学的表示を守るため固定 |
| ✅   | Statistics結果一覧の改善               | 対照群比較を選択でき、調整済み比較familyをStatistics上で展開可能                 |
| 🟡   | 同等性／「意味のある差がない」解析     | 独立goal、通常NHSTへの誤誘導防止、n.s.警告、事前規定marginの保存、90% CI中心の3状態contract、design/outcome別の禁止境界を実装・ADR 0061へ固定。独立2群continuous・raw difference・単一主比較のWelch TOSTはengine/UI/Methods/save-reopenまで実装済み。positive/total、shared-run、paired、複数claimは科学レビューまで安全停止 |
| ✅   | 途中行からの入力と実験回・日付の保持   | 空行を挟んだ入力を同じ行に保持し、canonical observationと実験回・日付を明示的に連結。保存・再読込・Graph・Statisticsで回帰確認済み。日付からpairingは推定しない |
| ✅   | 数値入力の表示桁と表keyboard操作       | `1.00`などの入力表記をcanonical数値と分離して保存・再表示し、数値セルは左右矢印1回で移動。Enterは同列、左端からの連続入力後の右端Enterと右端Tabは次行左端へ移動することを回帰・Windows実機確認済み |
| ✅   | 単純な独立群比較の条件数               | 最初の4欄を保ったまま最大50条件まで追加可能。5条件の作成、Graph、Welch ANOVA＋Games–Howell、4対照比較注釈、save/reopenをWindows packaged appで確認 |
| ✅   | 多条件Statisticsの待ち時間             | SciPyが生成する対角・対称行列25セルのうち製品が保存する上三角10比較だけを計算し、完全に同じ自由度のcritical valueだけを再利用。5条件・各n=3のin-process計算は旧約2.03秒から0.22–0.23秒、warm packaged engineは旧3.268–3.317秒から1.562–1.654秒へ短縮。fresh build直後のcold runは9.545秒だったため配布環境の初回値とは区別する。10比較の調整p値・同時CIを従来SciPy行列と小数14桁で照合し、engine 69 testsと17-case frozen smokeがPASS |
| ⏸    | 独立性確認の質問を短くする             | 科学的安全性を保ちつつ、単純実験で過度に厳しく見えない                           |
| ✅   | SpreadsheetのUndo/Redo                 | bounded canonical履歴を共通化し、Ctrl/Cmd+Z・redo・外部置換時clearを回帰test済み |
| 🟡   | Graph-onlyの通常workspace統合          | 共通editorは利用可能。完成Graphとの表示差を継続解消                              |
| ✅   | 複数projectのタブ管理                  | 同一windowで保持、再Open、dirty checkpointを回帰test済み                         |
| ✅   | 現実的なExcel workbook取込             | `.xls/.xlsx/.xlsm/.xlsb`、複数file、sheet、A1範囲、1–3段見出し、Expとしてstack、source file provenanceを実装・回帰test済み。file数を統計上の`n`にはしない |
| ✅   | 制約付きExcelテンプレート＋取込レシピ  | 独立群、対応・反復、Survival、ordered X/Yを別sheetに分け、ID・実験回・日付・missing・censoringの意味を日英READMEと画面内手順へ固定。native readerとbundle同梱を検証済み |
| ✅   | Homeから始まる5分ガイド                | 1つの合成デモでData→Graph→Statistics→Methodsを順に案内し、日英表示と遷移を回帰test済み |
| ✅   | 共同研究者向け解析レビューセット       | 実行済みrunに限り、Graph、群別n、推定値・CI、検定、警告、Methods、表示データCSV、run IDを読取専用HTMLへ一括出力。日英表示とnative保存境界を回帰test済み |
| ✅   | IT・データ取扱い概要                   | local解析、`.lsa`とexportの保存先、任意telemetry、不具合報告、権限、署名、更新、導入checklistを実装根拠付きの日英1文書に整理しREADMEから案内 |
| ✅   | 保存済みGraphの簡易パネルSVG           | 2件以上の保存済みGraphを再解析せず2列配置し、A/B…label、Graph ID・表示名metadata、個別SVG styleを保持してnative-aware SVG保存。panel layout自体は`.lsa` schemaへ追加しない |

## コード整理・堅牢化

| 状態 | 項目                                  | 完了条件                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                      |
| ---- | ------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| ✅   | Graph共通描画                         | plot rectangle、nice ticks、数値format、text幅とY軸title余白を共通化。Kaplan–Meierのrisk tableなど固有semantic layoutは意図的に分離し、今後は具体的な表示差が出た場合だけ拡張                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                              |
| ✅   | Spreadsheet共通primitive              | keyboard/paste/zoom、Tab順、contextual Enter、数値セルの1回矢印移動、draft/commit、finite parse、表示桁とcanonical数値の同期、selection border、bounded undo/redoを共有。identity・censoring・ordered axis・nested構造の意味固有処理は各surfaceに保持し、追加共通化は具体的な挙動差が出た場合だけ行う                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                 |
| ✅   | shared-source topologyの一元化        | 「同じ由来だが条件別の実験単位」のtyped topology判定をdomain helperへ統合し、workspace・Statistics要約・Graph解析contextが同じsource/unit/roleを利用                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                          |
| ✅   | `ExperimentGraphWorkbench`分割        | renderer、editor、analysis state、export、workspace同期、projectionを責務境界へ分離し、公開Alphaの6,922行から720行へ縮小。保存schema/public contractは不変。分割自体は完了とし、今後は具体的な責務重複が見つかった場合だけ変更 |
| ✅   | 未使用prototypeの公開sourceからの分離 | private archiveへ保全し、public sourceには含めない                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                            |
| ✅   | benchmark生成物の公開sourceからの除外 | evaluation/benchmark materialを通常product sourceから分離                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                     |
| ✅   | route-level code splitting            | Graph workbench、Common coverage、Survival/Heatmap、`ExperimentWorkspace`、Graph-only、新規実験・project open routeを遅延読込し、初期JSを約1.77 MBから264.32 kBへ約85%縮小。build警告を解消し、localized loading/focus、保存・open・handoff回帰を維持                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                         |
| 🟡   | 回帰testの合理化                      | test数を品質目標にせず、`REGRESSION_TEST_POLICY.md`で保持・追加基準を明文化。保存bridgeの4組合せをpure truth tableへ移し、画面はno-bridge/complete-bridge配線だけ残して重いroute caseを10件純減。全UI 193 files / 1,295 tests PASS。Workbench/App/Common Coverage等からも、抽出済みpure contractとの重複を「直接test＋必要なroute統合test」へ継続整理。保存互換性・biological n・pairing・censoring・lineageの層別検証は削らない。adaptive production pathはRTL `waitFor`、evaluation run barは明示的`act`境界へ修正し、23件が警告なしでPASS。変更sourceをimport graphから選ぶ`test:ui:related`を追加し、初回実測は2 files / 23 testsを12.37秒で完了。full UIはbatch・handoff・releaseのmilestone gateとして維持 |
| ✅   | 保存format migration fixture基盤      | 研究データを含まないsynthetic Public Alpha v0.2 packageについて、0.3 migration、unit identity・measurement・実行済みD01解析・解析結果にlinkedしたGraphの保持、current save/reopenをpackage testで固定。Survivalのevent/censoringとordered X/Yのunit・series・X・Y identityも旧版open→現行save/reopenで不変と確認。project package 9 files / 71 testsとtypecheckがPASS                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                     |
| ✅   | エラー表示の構造化                    | 主要I/O errorを分類し、project open/save、Graph-only、legacy Data Sheet、specialist data parse/Graph export、通常Graph export/clipboardの失敗表示をlocale-aware化。英語UIでは日本語internal exceptionを安全なaction-specific fallbackへ置換し、numeric Status mappingの制御判定は表示文から分離。invalid Survival/Heatmapを含むspecialist 31 tests、UI typecheck、focused lintがPASS                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                               |
| ✅   | 解析timeoutとCancel                   | native engine processをtimeout/cancelできる実装とtestあり                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                     |
| ✅   | 数値warningの伝播                     | 全engine moduleが共通result envelopeの`warnings`を使用し、analysis contractで必須配列として検証。Statistics、Methods、解析レビューセットへ表示・出力され、Public Alpha v0.2 open→現行save/reopenでもcode/messageを保持するpackage回帰を追加                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                |

## 完了判定の原則

- 自動testだけでnative項目を完了にしない。packaged appの証拠も必要です。
- browser previewとnative実機の証拠を混ぜません。
- scientific semantics、biological `n`、pairing、nesting、censoring、ordered identity、raw lineageをUI簡略化のために変更しません。
- Public Alphaで保存された`.lsa`は後方互換対象です。
- 見た目の好みと、data loss・crash・誤解析・保存失敗を分けて優先します。

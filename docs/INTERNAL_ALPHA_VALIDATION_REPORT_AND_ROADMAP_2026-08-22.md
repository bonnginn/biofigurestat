# Life Science Analysis App

## Internal Alpha検証報告と今後の開発目標

作成日：2026-08-22  
対象：macOS Apple Silicon版 native `.app`  
判定：**Internal Alpha継続について条件付き合格**  
注意：本判定は公開releaseや実測・未発表データへの利用許可ではない。

## 1. 結論

決定的な合成データを使い、実験設計からの入力、グラフ、ローカル統計、保存、完全終了、再起動、再編集、書き出しまでの主要経路を実画面で確認した。

次の中核動作は確認済みである。

- native appの起動とローカル統計engineの実行
- 独立群と対応ありの統計routing
- 実験単位、安定ID、対応線、複数readoutの独立性
- WBのTargetとreferenceの生値保持と比の派生
- 時系列からのAUC派生、計算根拠、lineage
- Graphと統計結果の保存、Quit、再オープン
- PowerPointに貼り付けられるPNGコピーとSVG export
- `.lsa`のFinder関連付けとダブルクリック起動
- 保存前後の統計数値の一致

一方、単一ファイル保存、統計workspaceの分離、対照群対各群の補正済み比較、WB背景補正、複数projectの同時利用は未完了である。

## 2. 検証範囲と原則

- 検証には合成fixtureまたは一時入力だけを使用した。
- 実測・未発表の研究データは使用していない。
- 統計上の`n`は細胞数やROI数ではなく、宣言された実験単位から計算した。
- raw、派生値、解析結果、Graphの責務を分け、Graphの見た目変更で統計結果を変えない。
- 元の手動確認シートは変更せず、本報告で実施結果を統合した。

## 3. 実画面での検証結果

| 領域                | 結果 | 確認内容                                                      |
| ------------------- | ---- | ------------------------------------------------------------- |
| native起動          | Pass | macOS Apple Siliconで起動                                     |
| 独立3群             | Pass | Dot、生物学的反復点、Mean、SD、独立群解析                     |
| 複数readout         | Pass | `Positive cells`と`Intensity`のsource、見た目、解析状態が独立 |
| 対応あり            | Pass | Before/Afterの同じ個体だけを結び、対応のあるt検定へrouting    |
| 時系列              | Pass | 同一単位のtrajectoryとsummary trend                           |
| AUC                 | Pass | 実験単位ごとのAUC点、window、台形法、元trace、派生値          |
| WB                  | Pass | TargetとGAPDHのsource値、Target/GAPDH比、追加正規化OFF        |
| project保存         | Pass | data、Graph、統計、Methods、metadataを保持                    |
| Quit・再起動        | Pass | 完全終了後に同じprojectを再編集                               |
| raw変更後           | Pass | 旧解析の再確認を促し、現在値と旧結果を混同しない              |
| PNGコピー           | Pass | macOS native clipboard経由でPowerPointへ貼り付け              |
| SVG export          | Pass | 別のvector exportとして保持                                   |
| 横軸の補助目盛り    | Pass | 各条件中央に内向きの短い目盛りを表示                          |
| `.lsa`関連付け      | Pass | Finderのダブルクリックからappと対象projectを直接開いた        |
| 起動中の`.lsa` open | Pass | 現在の単一ウィンドウを対象projectへ切り替え                   |
| Homeの「開く」      | Pass | 直前のprojectではなくfile dialogを表示                        |

## 4. 保存前後の統計数値再現

WB projectで保存前とQuit・再オープン後の表示を比較し、以下が完全に一致した。

| 項目            |             保存前 |       再オープン後 |
| --------------- | -----------------: | -----------------: |
| Control n       |                  3 |                  3 |
| Treatment n     |                  3 |                  3 |
| mean difference |              -0.57 |              -0.57 |
| SE              |             0.0497 |             0.0497 |
| 95% CI          |    -0.7138–-0.4262 |    -0.7138–-0.4262 |
| t               |           -11.4768 |           -11.4768 |
| df              | 3.6192994051553224 | 3.6192994051553224 |
| p               |             0.0006 |             0.0006 |
| Hedges' g       |            -7.4768 |            -7.4768 |

解析はWelchの対応のないt検定である。Welch検定では自由度が小数になることは正常である。

## 5. 検証中に発見し、修正した主な問題

- paired graphの接続線とjitterした点の端点が一致しない
- 狭い画面で「コピー」「SVG」「CSV」が潰れる
- WebViewでコピー成功となってもPowerPointに何も貼られない
- GraphタブにData Sheetが残る
- 開いたprojectの上に大きなopen案内が残る
- Homeの「プロジェクトを開く」が直前のprojectを再表示する
- project内の浮動小数の再現確認が過度に厳密で、機械丸め誤差でopenに失敗する
- WBのGraph作成previewがTarget/reference比に接続されない
- 小標本WBで実体を描けないViolinを選択できる
- AUC派生値は存在するが、raw nested pointがないため空Graphと判定する
- AUC lineage内に元の測定項目名がない
- 横軸の各条件位置に補助目盛りがない
- Graph typeを1回選ぶと選択解除できない

## 6. 現時点の既知の制限

### データとproject

- `.lsa`は現時点でdirectory-backed packageである。Finderでは関連付けたprojectとして開けるが、内部的な単一ファイル化は未実装である。
- 複数projectの同時編集はできない。起動中に別の`.lsa`を開くと同じウィンドウが切り替わる。
- 正式配布用の署名・notarization・installerは未完了である。

### 統計

- 多群解析で、対照群対各群の補正済み比較はまだ一般利用できない。
- 統計の詳細がGraph Inspector内にあり、GraphとStatisticsの責務分離が完了していない。
- raw変更後は旧結果をそのまま有効としないが、同じ解析の安全な自動再実行は未完了である。
- AUCは応答の大きさと持続時間を1値にまとめるが、時間経過の形を失い、開始値の差にも影響される。通常導線で無説明に使わせない。

### WBと入力

- 現行WBは補正済みband valueを直接入力し、Target/reference比を派生する。
- ImageJの`(Intensity - Background) × Area`をraw列から再現するモードは未実装である。
- Mean gray value、Integrated density、RawIntDenの意味を区別する入力案内が必要である。

### UXとGraph

- Data画面は共通ヘッダー、project見出し、合成デモ警告により数値表までの縦寸法が大い。
- ラベルが重なる場合の自動折返し・回転と、見た目の既定値保存は改善の余地がある。
- AUCの意味、単位、制限の説明はsourceに追加済みだが、次回native buildへの反映が必要である。

## 7. 今後の開発目標

### Core、最優先

1. **単一ファイルproject package**
   - canonical manifest、SQLite、checksum、recovery、atomic saveを維持したまま1ファイル化する。
   - 旧prototypeとの互換は必須としない。
2. **Statistics workspaceの分離**
   - Data、Graph、Statisticsを別の表示にする。
   - Graphには保存済み解析結果からp値や記号だけを表示できるようにする。
3. **対照群対各群の比較**
   - 対照群をcondition IDで明示する。
   - omnibus testとDunnett型などの多重比較補正を統計contractに保存する。
   - 無補正のpairwise t検定を既定で並べない。
4. **安全な自動再解析**
   - raw変更時にまず旧結果、注釈、Methodsをstaleにする。
   - design fingerprintと既存requestが一致する場合だけdebounce付きで再実行する。
5. **WB背景補正モード**
   - 補正済み値の直接入力と、Intensity、Background、Areaのraw入力を明示的に選択できるようにする。
   - 補正値からTarget/reference比までのlineageを保存する。

### High priority、日常利用の改善

1. Data workspace上部を圧縮し、数値表を初期viewportの中核にする。
2. ImageJやExcelからの矩形paste、矢印キー移動、複数セル操作を引き続き磨く。
3. AUCや正規化に、何をまとめ、何を失うかを研究者語で表示する。
4. Methodsを、実験単位、要約、検定、contrast、補正、software versionを含む論文向け文章にする。
5. ラベルの自動折返し・回転と、Graph appearanceの既定値保存導線を改善する。
6. Recent projectを実体化し、保存済みprojectへの復帰を短くする。

### Later、配布と拡張

1. 1 project = 1 native windowとした複数projectの並列編集
2. macOSの正式署名・notarization・installer
3. Windows 11 installerとOS固有の保存・clipboard・関連付け確認
4. 更新配布、release site、branding、licensingの仕上げ

## 8. 次の開発マイルストーン

### Milestone A：Internal Alpha hardening

- 上記Core 1–5のcontractとADRをSolが確定する。
- 単一ファイルのatomic save、recovery、corruption testを追加する。
- 多重比較とWB派生式に独立参照値とgolden testを用意する。
- AUC説明をnative buildへ反映する。

完了条件：上流変更で下流が正しくstaleになり、projectを1ファイルで安全に往復でき、主要統計結果を独立参照と一致確認できること。

### Milestone B：研究者の日常利用

- 数値入力までの縦方向の移動を削減する。
- Statisticsを独立したworkspaceにする。
- ImageJ、Excel、WBの実際の入力経路に合わせる。
- 論文向けMethodsと再利用可能なGraph既定値を追加する。

完了条件：陽性細胞割合、顕微鏡intensity、WB target/referenceの3経路を、専門的な統計用語を選ばずに入力・解析・Graph・保存まで完了できること。

### Milestone C：クロスプラットフォームalpha

- macOS配布packageを署名・notarizeする。
- Windows 11で同じproject、engine、Graph、clipboard、file associationを確認する。
- OS固有テストをmilestone smoke testに追加する。

## 9. SolとLunaの担当

### Sol

- 単一ファイルproject schema、migration、atomic save、recovery
- Statistics workspaceとGraphの責務境界
- 多重比較、自動再解析、WB背景補正のcontract
- 統計的正確性、生データ整合性、再現性の最終review
- 複数ウィンドウ化の状態分離設計

### Luna High–Maxへ切り出せる作業

- 確定済みcontractに基づくStatistics画面、WB列、compact UIの実装
- CSS、ラベル折返し・回転、レスポンシブ対応
- 既存patternに沿った入力・コンポーネントテスト
- 決定的fixture、回帰テスト、利用ドキュメント
- installerやOS固有導線の定型実装

Lunaは統計ロジック、raw lineage、project schema、migrationを単独で変更しない。

## 10. 参照資料

- `docs/NATIVE_INTERNAL_ALPHA_VALIDATION.md`：研究者による元の手動確認シート
- `docs/INTERNAL_ALPHA_FINDINGS_2026-08-22.md`：検証中の所見と実装対応の作業記録
- `docs/NATIVE_STATISTICAL_VALIDATION_2026-08-21.md`：native統計engineの検証記録
- `docs/PRE_IMPLEMENTATION_REVIEW_v0.2.md`：実装前reviewとCore定義
- `docs/adr/`：採用済みarchitecture decision records

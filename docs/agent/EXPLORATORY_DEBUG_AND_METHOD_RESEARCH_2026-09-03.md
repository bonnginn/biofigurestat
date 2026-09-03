# Exploratory Debug and Method Research — 2026-09-03

## 目的と境界

人の操作を必要としない範囲で、通常の正常系とは異なる表入力順序を探索し、今後の統計・Graph開発候補を一次資料から整理した。

- Source authority: `aef806b951962348620f7732a55c6a35666ff032`
- 製品コード、保存schema、fixture、恒久テストは変更していない。
- 一時的な探索テストは実行後に削除した。
- native UI操作、Pool D、historical benchmark、外部評価corpusにはアクセスしていない。
- 科学的意味、biological n、pairing、欠測の既存contractは変更していない。

## 実施した検証

既存のfocused regressionを先に実行した。

| 範囲 | 結果 | 時間 |
| --- | ---: | ---: |
| `spreadsheetGrid`、`CanonicalMatrixWorksheet`、adaptive production path、`ExperimentWorkspace` | 107/107 PASS | 81.48 s |
| delimited text、Graph-only、nested measurement sheet | 43/43 PASS | 13.27 s |
| 一時的なmatrix探索6シナリオ | 6/6 PASS | 3.40 s |
| 一時的なsimple-group入口探索3シナリオ | 3/3 PASS | focused runでPASS |

探索したmatrix入力は次を含む。

1. 6行を `6→1→4→2→5→3`、`3→5→1→6→2→4`、`2→6→3→1→4→5` の順で入力。
2. 1、2行目を空け、3行目を起点に2行×2列を貼り付け。
3. 先に入力した値を消し、後の行が詰められないことを確認。
4. 数値でないtokenを含む矩形貼り付けが部分反映されないことを確認。
5. 条件2を空け、条件1と条件3だけで単純独立群worksheetを作成。
6. 前後空白を除くと同じ名前になる2条件を入力。
7. 「最初に表示する行数／条件」に `2.7` を入力。

## 確認できた不変条件

- 3行目から入力しても1行目へ値が移る現象は再現しなかった。
- 飛び飛びの順序で入力しても、値、実験回、行IDは選択した行に残った。
- 3行目からの矩形貼り付けは1、2行目を埋めず、canonicalの行座標も正しかった。
- 中間の値を消しても後続行は上へ詰められなかった。
- 不正な矩形貼り付けはatomicで、既存値を部分的に上書きしなかった。
- 条件欄の途中に空欄があっても、対照群指定は元欄ではなく生成後の正しい条件IDへ対応した。
- observation配列の内部順序は条件ごとになり得るが、row/session identityは保持される。配列順を画面行と解釈してはならない。
- 入力済みセルを空にする操作は、観測を削除せず同じ行の明示的欠測（`value: null`, `missingness: unknown`）にする。これは空欄paddingと欠測を区別する既存仕様であり、不具合ではない。

## 発見した問題

### D1 — 矩形貼り付けで入力表記が失われる

**優先度:** alpha更新前に直す候補。canonical数値は正しいため計算誤りではないが、visible valueと研究者が入力した表記が一致しない。

3行目へ `1.00\t2.50\n3e-2\t-4.00` を貼り付けると、画面は即座に `1`、`2.5`、`0.03`、`-4` と表示した。値と行は正しいが、末尾ゼロと指数表記が失われる。

推定原因は、matrix pasteがtokenを数値へparseしてcanonical observationsだけを更新し、各セルが `String(number)` から再描画されること。単一セル編集時のlocal draftは成功後に入力文字列を保持するが、複数セルpasteには同等のlexical draft経路がない。

修正時に追加すべきfocused regression:

- 3行目起点の複数行・複数列pasteで、visible textとcanonical numeric valueを同時に検証する。
- save/reopen後にどこまで入力表記を保証するかを明文化する。保存互換性を広げないなら、少なくとも同一編集session中の表示保証と区別する。
- CSV importにも同じ保証を適用するか、貼り付けとの差をUIで明示する。

### D2 — 正規化後に同名となる条件を作成できる

**優先度:** alpha更新前に直す候補。数値計算はIDで区別されても、Graph、比較指定、Methodsでは同じラベルに見え、取り違えを招く。

`Vehicle` と ` Vehicle ` を別条件欄へ入れると、trim後に両方 `Vehicle` のままworksheetが作成された。条件IDは別だが、表示上は区別できない。

推定原因は、空欄除去とtrimは行う一方、`populatedConditionEntries` に対する正規化後の一意性検証がないこと。

修正時に追加すべきfocused regression:

- 大文字小文字、全角・半角空白、前後空白を含む重複方針を先に決める。
- 拒否時に元の入力を保持し、該当条件欄へ説明を出す。
- 既存 `.lsa` に同名条件がある場合は開けなくせず、編集時の警告または安全な識別表示を検討する。

### D3 — 初期行数の小数表示と生成行数が食い違う

**優先度:** 次の入力validation整理で直す候補。

「最初に表示する行数／条件」へ `2.7` を入力すると、欄には `2.7` が残るがworksheetは2行で作成された。

推定原因は、inputが `type=number`、`min/max` のみで整数stepを指定せず、stateにも整数化validationがない一方、`Array.from({ length: 2.7 })` が実質2件を生成すること。

修正時に追加すべきfocused regression:

- 小数、負数、0、100超、空文字、指数入力を検証する。
- 画面値と生成行数が常に同じ整数であることを検証する。
- ブラウザのnative validationだけに依存せず、create境界でも整数を保証する。

## Follow-up修正状況

同日、上記3件を製品実装と恒久focused regressionで修正した。

- D1: `e7e1a9a`。矩形貼り付けと単一セル入力のlexical textをworksheet内で保持し、対応するcanonical numberが変わった場合は古い表記を採用しない。保存schemaは変更していない。
- D2: `b313b3e`。前後空白を除いた結果が同じ条件名を、worksheet作成前に日本語／英語の説明付きで拒否する。
- D3: `b313b3e`。初期行数へ整数stepを設定し、state境界でも1〜100の整数へ正規化する。画面値と生成行数を同じ値にした。

検証は修正対象2 test fileの35/35 PASS、対象lint PASS、UI typecheck PASS。native UI、full test、release bundleはこの局所修正では実行していない。

## 追加探索の優先順

次回の非native探索は、次の順が費用対効果に優れる。

1. matrix pasteとCSV importのlexical/canonical一致を、負数、指数、末尾ゼロ、空白、CRLFで横断する。
2. 条件・readout・IDのUnicode正規化、不可視空白、同名、極端に長いlabelを試す。
3. undo/redoの途中にview切替、行追加、保存を挟み、identityと欠測が戻る単位を確認する。
4. 条件数を増やした状態で、対照群、比較、Graph注釈、save/reopenのID参照を確認する。
5. 日付と実験回を飛び入力し、並べ替えや再表示が値の対応を変えないことを確認する。

## 今後実装すべき統計

既存method catalogとの重複を避け、科学的価値、誤用リスク、実装依存関係で並べた。

| 順位 | 候補 | 価値 | 実装難度 | 必須の意味論・gate |
| ---: | --- | --- | --- | --- |
| 1 | 連続値のmixed-effects model | 高 | 高 | 固定効果／random intercept・slope、biological unit、欠測方針、収束、自由度法、estimandを明示。`lme4`等との独立照合が必要。 |
| 2 | estimated marginal meansと事前指定contrast | 高 | 高 | 二要因・mixed modelの後段として実装。参照grid、重み、multiplicity、同時CIを保存し、単純な生平均と混同しない。 |
| 3 | 4 parameter logistic dose-response（単一curveから） | 高 | 高 | doseのscale、0 dose、上下限固定／自由、EC50/IC50定義、bounds、収束、外挿、残差診断が必要。curve間比較は後段。 |
| 4 | ノンパラメトリック効果量とCIの補完 | 中〜高 | 中 | Mann–Whitney、Wilcoxon、Spearmanに対応する推定量をmethodごとに定義。bootstrap単位はcellでなくbiological unit／pair。 |
| 5 | Cox regression | 中 | 高 | event coding、共変量、比例hazard診断、ties、欠測、効果の解釈を先にcontract化。 |
| 6 | competing-risk analysis | 中 | 非常に高 | cumulative incidenceとcause-specific/Fine–Gray estimandを区別。競合eventを通常のcensoringとして扱わない。 |

mixed modelは「繰り返し測定を欠けた組ごと捨てずに扱いたい」という現実的需要に最も直結するが、単独の検定ボタンとして追加してはならない。model specification、診断、Methods、保存履歴、独立engine照合を一体で設計するTier B作業とする。

## 今後実装すべきGraph

| 順位 | 候補 | 価値 | 実装難度 | 必須の意味論・gate |
| ---: | --- | --- | --- | --- |
| 1 | estimation plot / Gardner–Altman型表示 | 高 | 中 | 既存の保存済み推定値とCIだけにlinkし、生データと差のscaleを明示。p値注釈の代替ではなく効果量表示。 |
| 2 | SuperPlot型の階層表示強化 | 非常に高 | 中 | child measurementの分布と実験単位summaryを同時表示し、統計上のnは実験単位だけと明記。既存nested rendererを拡張する。 |
| 3 | residual／fit diagnostic plot | 高 | 中 | 線形・非線形fitのrunへlinkし、raw residual、standardized residual、予測値、外れ値識別の定義を固定。 |
| 4 | raincloud／violin + raw + summary | 中 | 中 | 小さいbiological nでdensityを過剰解釈させない。childとunitの粒度を分け、raw点を隠さない。 |
| 5 | 色覚対応paletteと線・記号preset | 中〜高 | 低〜中 | 色だけに依存せず、線種・記号を併用。screen、SVG、PNGで同じ意味を保つ。 |
| 6 | cumulative incidence plot | 中 | 高 | competing-risk統計contractと同時にのみ提供し、KMの見た目だけを転用しない。 |

最初のGraph実装はestimation plotが適する。既存runに推定値とCIがあり、保存済み解析以外へ注釈を流用しない現行原則を保ちやすい。SuperPlotは新しいGraph種を増やすより、すでにある「生データ／実験単位の点／summary」の階層表示を改善するほうが重複を増やさない。

## 根拠資料

- Weissgerber et al., *Beyond Bar and Line Graphs* — 小標本ではsummaryだけでなく観測値と分布を示す: <https://journals.plos.org/plosbiology/article?id=10.1371/journal.pbio.1002128>
- Lord et al., *SuperPlots* — cell-level variabilityとexperiment-level reproducibilityを区別し、推論単位をexperimentに置く: <https://rupress.org/jcb/article/219/6/e202001064/151717/SuperPlots-Communicating-reproducibility-and>
- Allen et al., *Raincloud plots* — raw data、分布、summaryを組み合わせる: <https://pmc.ncbi.nlm.nih.gov/articles/PMC6480976/>
- Ho et al., *Moving beyond P values: data analysis with estimation graphics*: <https://doi.org/10.1038/s41592-019-0470-3>
- Gardner and Altman, *Confidence intervals rather than P values*: <https://pmc.ncbi.nlm.nih.gov/articles/PMC1339793/>
- Bates et al., *Fitting Linear Mixed-Effects Models Using lme4*: <https://www.jstatsoft.org/article/view/v067i01>
- statsmodels MixedLM documentation: <https://www.statsmodels.org/stable/mixed_linear.html>
- Lenth, *Least-Squares Means: The R Package lsmeans*: <https://www.jstatsoft.org/article/view/v069i01>
- Ritz et al., *Dose-Response Analysis Using R*: <https://pmc.ncbi.nlm.nih.gov/articles/PMC4696819/>
- Fine and Gray, competing-risk subdistribution model: <https://www.tandfonline.com/doi/abs/10.1080/01621459.1999.10474144>
- Wong, *Points of view: Color blindness*: <https://doi.org/10.1038/nmeth.1618>
- ARRIVE 2.0 — experimental unit、exact n、inclusion/exclusion等のreporting要件: <https://arriveguidelines.org/arrive-guidelines>

## 結論

今回の範囲では、懸念された「3行目の入力が1行目に入る」回帰は見つからず、row/session identity境界は強化後のテストに耐えた。一方、異例だが妥当な入力から3件のvalidation／表示整合性問題を再現した。いずれも今回修正せず、再現条件と追加すべきfocused regressionを固定した。

D1〜D3は同日のfollow-upで修正済み。統計・Graphの次期開発は、estimation plotを小さな独立sliceとして先行し、mixed-effects modelは設計・独立照合・保存contractを含む別のTier B計画として扱う。

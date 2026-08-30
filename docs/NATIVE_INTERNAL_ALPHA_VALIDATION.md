# Native Internal Alpha確認手順

対象はmacOSのnative `.app`です。値はすべて決定的な合成値で、実測・未発表データを入力しません。アプリを起動する操作、保存ダイアログ、完全終了、外部アプリへの貼り付けは人が行う必要があります。

## 先に読むもの

- コピー用データ：[COPY_PASTE_DATA.md](fixtures/internal-alpha/COPY_PASTE_DATA.md)
- native統計エンジンの既存検証記録：[NATIVE_STATISTICAL_VALIDATION_2026-08-21.md](NATIVE_STATISTICAL_VALIDATION_2026-08-21.md)

記録欄：実施日 `____________`　アプリversion `____________`　macOS `____________`

## 最短の必須経路（目安10–15分）

### 1. 起動と独立3群（最初に実施）

- [ok] `.app`を起動できた。結果：Pass / Fail
- [ ok] ホーム→「新しい実験」→「合成デモデータですぐ試す」→「Simple 3群（連続値）」を開いた。
- [ ok] OverviewとExp 1–3で、Control/Treatment A/Treatment Bが10–25の値として保持されている。
- [ok ] 「＋ グラフを作成」→Dotを作成し、生物学的反復点、Mean、SDを確認した。
- [ ok] Graph設定→「統計解析」で、独立したdishであることを確認して「推奨解析を実行」した。
- [ ok] 結果に検定名、実際のn、p値、補正の有無が表示された。
- [ok ] 「解析エンジンと再現情報」でengine言語、package名/version、application versionを確認した。
- [ ok] 「Methodsと再現記録」でMethods本文を確認した。

結果・メモ：グラフ作成時にレビュー画面が下の方にあって存在に気がつかない可能性あり。プレビューの横軸が長すぎる。
統計解析は複雑になる可能性があるので、グラフではp値や**などの描画機能に止めてprism同様に別のタブとして整理した方が良さそう。
統計結果が、全体での結果しかなくて、controlと比べてなどの統計結果を表示させられない。
グラフで単独項目なのに上に線が描画されている（fig.1)　グラフの横軸までも距離がある。
右の編集対象などを書いてあるカラムは固定アシズなので、見切れている。（これも統計機能を別にすれば多分問題なし）
Methodsはどうせなら論文にそのまま使えるような文章の方が良いのではないか？

```text右にダブルクリックでグラフの編集対象としていが、シングルクリックで良いかも。

```

### 2. 複数測定項目の独立性

- [ok ] 「Internal Alpha Core確認」合成デモを開いた。このプロジェクトを以降の保存確認にも使う。
- [ ok] Graph 1をMarker X陽性率から作り、名前を `Positive cells` にした。
- [ ok] Graph 2を蛍光強度から作り、名前を `Intensity` にした。
- [ ok] Graph 1とGraph 2で測定項目、Graph type、表示条件のどれかを意図的に変えた。
- [ ok] Graph 2の変更がGraph 1のsource、appearance、解析状態を変えていない。
  グラフの文字サイズを変えると、カテゴリ間隔が広がる。グラフの大きさに対して文字サイズを変えたいのだから、グラフのサイズが変わってはいけない。
  また、文字が重なるあるいは、続いた文字情報となってしまう可能性がある時は文字を回転させる。初期の文字サイズは縦軸も横軸も補助メモリも
  グラフに対してもっと大きい方が良い。
  繰り返し同じレイアウトのグラフを作りたい際に、文字のサイズや、凡例など、デフォルトに登録する機能があっても良いかも。

### 3. 安定単位と派生lineage

- [ ok] 同じ「Internal Alpha Core確認」プロジェクトで作業を続けた。
- [ok ] Reporter intensityのLine GraphでU1–U4の同一単位trajectoryとsummary trendを確認した。
- [ok ] 別Graphを作り、「各生物学的単位から求めた派生値」→AUC（台形法）、window 0–24 hを選んだ。
- [ ok] raw traceのGraphは残り、AUCが別Graph sourceになった。
- [ ] 「派生値の計算根拠を確認」でsource readout、unit、condition、window、method/resultを確認した。

統計解析は実施されなかった。

### 4. 保存→完全終了→再開

- [ ] 「名前を付けて保存」で検証専用プロジェクトを保存した。保存先：`____________________________`
- [ ] アプリを完全終了した（ウィンドウを閉じるだけでなくQuit）。
- [ ] `.app`を再起動し、「プロジェクトを開く」から同じファイルを開いた。
- [ ] raw値とExp/session IDが保持された。
- [ ] U1–U4のstable unit IDと接続相手が変わっていない。
- [ ] readout ID、Graph名、各Graphのsource readoutとappearanceが保持された。
- [ ] 解析仕様、結果、engine/package metadata、Methods、注釈が保持された。
- [ ] AUC datasetとlineageが保持された。
- [ ] `Positive cells`と`Intensity`がそれぞれ元のreadoutを参照し、Graph 2の変更がGraph 1へ波及していない。
- [ ] 保存直後の結果がstaleになっていない。

## 再解析とstale無効化（必須）

- [ ] 再オープン直後の検定名、n、p値を記録した：`____________________________`
- [ ] 同じ設定で再解析し、期待される数値精度内で一致した。
- [ ] raw値を1つだけ変更した。変更箇所：`____________________________`
- [ ] 以前の解析結果、p値注釈、Methodsが現在値に有効なものとして残らず、stale/解除が明示された。
- [ ] 再確認を行わない限り解析ボタンが有効にならない。
- [ ] 再解析後に新しい結果が表示され、保存できた。

メモ：

```text

```

## 追加の対応ありデータ保存確認

- [ ] 「同じ個体の2条件比較」合成デモを開いた。
- [ ] Animal 1–4についてBefore/Afterを結ぶ線を確認した。
- [ ] 対応ありの推奨解析へroutingされた。
- [ ] 保存→Quit→再開→再オープン後も、Animal 1–4が同じ相手とだけ結ばれた。
- [ ] stable unit ID `unit.animal.1`–`unit.animal.4`が再生成・再割当されていない。

## WB確認（Core確認）

- [ ] 「WB target/reference」合成デモを開いた、またはコピー用データFを矩形貼り付けした。
- [ ] TargetとGAPDHのsource値を別々に編集・確認できた。
- [ ] Target/GAPDH比が派生し、source値を上書きしていない。
- [ ] 実験内正規化は既定でOFFだった。
- [ ] Graphと統計解析が派生比を使用した。
- [ ] 保存→再オープン後もsource値、比、選択した場合のみ正規化lineageが保持された。

## native clipboard／SVG確認

- [ ] 代表Graphで「コピー」を実行し、KeynoteまたはPowerPointへ貼り付けた。
- [ ] 文字、凡例、階層label、線幅、色、透明背景が期待どおりだった。
- [ ] SVGを書き出し、再度開いてBar/点/error barが欠落していない。
- [ ] 1つのvector workflowが成功した。使用先：`____________________________`

Affinity Designer、Illustrator、Wordなど全アプリでの確認はInternal Alphaの必須条件ではありません。

## 必須ゲート

- [ ] native appが起動する
- [ ] statistical sidecarが実行される
- [ ] 独立群解析が結果を返す
- [ ] engine/package/versionが画面で見える
- [ ] 保存、Quit、再起動、project再オープンが成功する
- [ ] stable unit identityが保持される
- [ ] 複数readoutのGraph独立性が保持される
- [ ] derived datasetとlineageが保持される
- [ ] raw編集後に古い解析・注釈・Methodsが無効化される

総合判定：Pass / Fail / 条件付きPass

```text
不具合・再現手順・スクリーンショット名：

```

## 公開releaseまで待てる確認

- signed/notarized packageの配布先別挙動
- Windows installer
- すべての外部graphicsアプリでのclipboard互換
- public updater
- release website
- branding/licensing polish

## 自動テスト済みで、人が再確認しなくてよい内部事項

- canonical project/SQLite round tripでGraph、解析metadata、stable identity、derived lineageを保持
- paired/longitudinal requestがstable unit identityを使う
- 複数Graphが個別のreadout、subset、appearance、analysisを保持
- rawまたはunit構造の変更で古いresult、annotation、Methodsを外す
- Bar geometry、生物学的反復点、SD、SVG/clipboard SVGの保持
- Box/Violinを含むactive layer説明とSVG metadataの同期

ただし、最終的なnative `.app`の保存ダイアログ、完全終了、再起動、外部アプリへのclipboardは自動テストだけでは代替しません。

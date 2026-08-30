# Internal Alpha findings（2026-08-22）

この文書は、`NATIVE_INTERNAL_ALPHA_VALIDATION.md` に研究者が直接記録した所見を、実装状況と設計上の扱いに対応付けるための作業記録である。元の確認記録とチェック状態は変更しない。

## 今回の局所修正

- グラフ作成ダイアログでは、現在データによるプレビューを「よい開始点」の直後へ移し、縦寸法を縮小した。2〜3群ではプレビューの横軸をデータ範囲に近い長さにする。
- 単純な1階層・各群1要素の図では、グループ化を意味しない短い横線を描かない。時間のない図では条件ラベルを横軸へ近づける。
- 階層ラベルの文字サイズを変更しても、カテゴリ間隔とグラフ幅を自動的に拡大しない。文字の見た目とキャンバス形状を分離する。
- SVG上の編集対象は1回のクリックでInspectorへ切り替える。既存のダブルクリックも互換操作として残す。
- 狭いGraph workspaceでは、固定Inspectorをグラフ下へ移す。編集列が画面外で切れることを避ける。
- AUCを新規作成するとき、作成ダイアログ内で開始・終了時点を選択できる。開始が終了より後なら作成できない。
- 直前の確認で見つかった、paired pointと接続線の端点不一致、書き出しボタンの圧縮、プロジェクトを開いた後にも大きな案内が残る問題は別の局所修正として対応済み。
- GraphタブでData Sheetが再表示されるCSS競合を修正し、Graph表示中は入力シートを確実に隠す。
- WBの作成時previewをTarget/reference比へ接続し、WBで実体を描けないBox/Violin候補を除外する。
- nativeのGraphコピーはWebView内のSVG clipboard成功判定に依存せず、macOS system clipboardへ透明PNGを明示的に書き込む。SVGは別のvector exportとして維持する。
- `.lsa`をLife Science Analysis ProjectとしてOSに登録し、Finderのダブルクリックからnative appを起動して対象projectを直接開く。macOS Internal Alphaで保存済みWB dataとGraphの復元まで確認済み。
- Homeの「プロジェクトを開く」は直前のprojectを黙って再表示せず、毎回file dialogを開く。
- AUCなどの派生値をGraph sourceにしたとき、派生した実験単位値をdata-presence判定に使う。raw nested pointがないという理由で空のGraphにしない。lineage冒頭に元の測定項目名も明示し、macOS Internal Alphaで点のlineage表示を確認済み。
- Expタブでは実験情報を既定で折りたたみ、数値入力表を初期viewportの上側へ移す。

## 既存機能を分かりやすくする課題

- DataのExp画面は実験情報の折りたたみだけでなく、アプリ共通ヘッダー、プロジェクト名ブロック、ブラウザレビュー用警告が縦に積み重なっている。合成デモの警告とタイトルは安全性を保ちつつツールバー程度に圧縮し、数値表を初期viewportの中核にする。
- Graph typeごとのappearance/layer既定値はFavorite designに保持できるが、通常画面からその関係が分かりにくい。今後は「この見た目を既定にする」をGraph側から明示的に実行できる導線を追加する。
- 文字が重なる場合は、データ数や効果を変えずにラベルを折り返す、または回転する。自動回転の発火条件とSVG exportでの再現をテストする。
- 初期の軸タイトル、目盛、条件ラベルの文字サイズは、native画面とSVG貼り付けの両方で視認性を確認してから既定値を調整する。

## Solの設計確認が必要な課題

### Statistics workspaceの分離

Graphは表示仕様と統計注釈を担当し、検定の選択・比較・診断・Methodsは独立したStatistics表示に分離する案を優先検討する。Graph appearanceの変更が解析結果を変えない既存境界は維持する。

受入条件：

- Graph、Statistics、Dataの移動で同じanalysis run IDとsource revisionを追跡できる。
- Graphには選択済みの解析結果からp値または記号だけを表示できる。
- 統計結果、警告、engine metadata、MethodsをGraphの狭いInspectorへ詰め込まない。

### Control対各群の比較

「全体差」だけでなくControl対各群を表示するには、一次比較、検定族、多重比較補正を明示する必要がある。単純な無補正t検定の列挙は実装しない。独立多群では、設計と仮定に合うomnibus testに続くDunnett型などの対照群比較を第一候補として統計契約・golden testを整備する。

受入条件：

- 対照群をcondition IDで明示し、ラベル文字列から推測しない。
- 実際に実行したcontrast、補正法、adjusted p-valueを結果へ保存する。
- Graphの括弧・記号は保存済みのcontrast resultだけを参照する。

### 自動再解析

raw値変更後の自動再解析は、既存analysis requestを安全に再利用できる場合に限定する。まず旧結果・注釈・Methodsをstale化し、入力検証と設計fingerprintが一致することを確認してからdebounce付きで実行する。設計、実験単位、比較対象、解析法が変わった場合は自動実行せず再確認を求める。

### 単一ファイルproject package

Finder上では1ファイルに見えるproject packageを目標にする。現行のcanonical manifest、SQLite、checksums、recovery、atomic saveを失わず、package内部を一時領域へ安全に展開して検証後に開く。既存prototype形式との互換は要求しないが、現在のInternal Alpha projectからraw exportできることは維持する。

### 複数projectの並列利用

現行は1ウィンドウに1つのworkspaceだけを保持する。別の`.lsa`を開くことと、複数projectを同時に編集できることは分けて扱う。並列化は「1 project = 1 native window」を第一候補とし、保存先、dirty state、raw revision、analysis history、ショートカットをウィンドウ間で共有しない。

### Publication-ready Methods

Methodsは箇条書きの設定表示ではなく、実験単位、要約、検定、contrast、補正、software/engine versionを含む論文向け文章を決定的に生成する。未評価の仮定を「満たした」と記述しない。実行済み結果と同じrequest/result contractから生成し、raw変更時には必ずstale化する。

### WB band quantificationの入力モード

現行のWB sheetは補正済みband valueを直接入力し、Target/reference比を派生する。実際のImageJ workflowに合わせ、別モードとしてIntensity、Background、Areaをraw列で保持し、`(Intensity - Background) × Area`を各bandの補正値として派生した後にTarget/reference比へ接続する。ImageJのMean gray value、Integrated density、RawIntDenを同じ「Intensity」として混同しないよう、入力列の意味と式を明示する。

受入条件：

- 補正済み値の直接入力と、Intensity/Background/Areaからの計算を明示的に選べる。
- Targetとreferenceの各raw列、背景補正値、ratioのlineageを保存する。
- raw値を変更した場合、下流の補正値、ratio、解析、注釈、Methodsを無効化または再計算する。

## 検証を継続する項目

- WB projectの保存→Quit→`.lsa`ダブルクリック再オープンで、Welchの対応のないt検定のControl n=3、Treatment n=3、mean difference = -0.57、SE = 0.0497、95% CI -0.7138–-0.4262、t = -11.4768、df = 3.6192994051553224、p = 0.0006、Hedges' g = -7.4768が保存前後で一致した。
- AUCを含む派生値に対する統計は自動では実行しない。ユーザーがStatisticsで解析対象と比較を確認してから実行する。
- native clipboard、単一ファイル保存、Quit後の再オープンは自動テストだけで完了扱いにしない。
- `NATIVE_INTERNAL_ALPHA_VALIDATION.md` のチェック状態は、実画面で再確認したときだけ更新する。

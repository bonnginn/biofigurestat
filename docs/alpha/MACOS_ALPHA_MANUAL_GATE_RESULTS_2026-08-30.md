# macOS Alpha Manual Gate Results and Required Windows Follow-up — 2026-08-30

## この文書の位置づけ

この文書は、`9cd1335-alpha.20260830.mac3` をApple Silicon Macで実際に操作した結果と、
Windows側の**次回修正で必ず扱う項目**を記録する検証証拠である。

今回再現した問題の多くは、研究者が過去の検証でも繰り返し報告した項目である。したがって、
「既知」「見た目だけ」「後続で検討」として再度先送りしてはならない。Windows側の最新HEADで
すでに修正済みの場合は、項目を削除・無視するのではなく、該当commitとnative動作証拠を添えて
`PASS`へ更新すること。未修正なら次回candidateへ必ず含めること。

本書は、科学的意味を変えずにUIを単純化するよう要求する。biological `n`、対応、入れ子、
反復identity、打ち切り、raw lineageを省略・推測してよいという要求ではない。

## 検証したcandidate

- Branch: `codex/native-hardening-2026-08-28`
- Commit: `9cd1335217cc148acd90c73ae87dd749665b42ad`
- Build revision: `9cd1335-alpha.20260830.mac3`
- macOS: `26.5.2` (`25F84`)
- Architecture: `arm64`
- Node: `26.7.0`
- npm / pnpm: `11.19.0` / `11.19.0`
- Signing: ad-hoc; notarizationは未実施
- App: `apps/desktop/src-tauri/target/release/bundle/macos/BioFigureStat.app`
- Bundle zip SHA-256:
  `1edae1fe5d9cf283b58bafc6890432a0e21033ac4fab7d2058c8693f3377f7ea`
- Pool D: 未アクセス

依存関係install、test、typecheck、lint、Python sidecar build/smoke、Tauri `.app` build、
native bundle verification、`codesign --verify --deep --strict`はすべて成功した。したがって、
以下はbrowser previewや古いbundleではなく、上記native candidateで再現した問題である。

## Gate result

| Gate | Result | Notes |
| --- | --- | --- |
| Native build | PASS | build、sidecar、bundle、署名検証に成功 |
| Task 1 — canonical integrity | PASS | `97 / 60 / 101.5 / 55`、n=2/2、Graph、save/reopenが一致 |
| Task 2 — matched/nested | PASS | 不完全pairを保持し、dish→Cellでもbiological n=2/2 |
| Task 3 — specialist routes | **FAIL** | 科学的保持はPASS、共通shell／spreadsheet／再open後操作が未達 |
| Task 4 — lifecycle/export/support | **FAIL** | Command+Q、dirty-tab遷移、export、report UIに未達 |
| Final | **NATIVE CANDIDATE BLOCKED** | 次回必須項目のnative再検証が必要 |

## Windows側への強い要請

以下を次回修正の必須scopeとする。優先度ラベルを付けてbacklogへ戻すだけでは完了としない。

1. 最新Windows HEADで各項目を再現確認する。
2. すでに修正済みなら、commit、テスト、Windows native screenshotまたは操作記録を残す。
3. 未修正なら、次回candidateへ実装する。科学的意味を近い別構造へ変換して回避しない。
4. 自動テスト成功だけでcloseしない。今回の問題は、テスト成功済みのnative buildで再現している。
5. Windows修正後にMacへ再配布し、同じ手順で研究者が確認できる状態にする。

### P0 — dirty projectの安全性とmulti-project lifecycle

#### 1. Command+Qのsilent exit

dirty projectでapplication-menu Quitを選ぶと確認画面は出たが、`Command+Q`では確認なしに終了した。
Save/Cancel/discard guardがすべてのnative exit経路を覆っていない。これは未保存データ喪失につながる
hard failureである。`9e1f68c`を含むcandidateでも再現したため、過去のfix済み判定を再監査すること。

必須受入条件:

- dirty tabが1つ以上ある場合、Command+Q、メニュー終了、赤ボタン、OS exitのすべてを同じguardへ通す。
- Cancelは終了せず、編集値とactive tabを保持する。
- Saveはatomic save成功後だけ終了する。
- discardは明示選択した対象だけを破棄する。

#### 2. Home / New / Openで保存確認を出さない

研究者の明示要求は次である。

- Homeはdirty projectをtabに保持したまま移動する。
- Newは新しいproject tabを追加し、既存dirty tabを維持する。
- Openは別project tabを追加し、既存dirty tabを維持する。
- 保存確認を出すのは、dirty tabを閉じるとき、windowを閉じるとき、appを終了するときだけである。

今回のcandidateはHome、New、Openのいずれでも保存確認を表示した。複数projectを同時に保持する
設計と矛盾するため修正必須である。旧handoffの「Home/New/Openでunsaved choiceを確認」という文言も、
この明示要求に合わせて更新すること。

#### 3. 閉じたprojectの再open

project tabを閉じた直後、同じ`.lsa`を選択しても再openできなかった。「新しい実験」など別routeへ
移動すると開ける。closed tabがopen-file registryから解除されていない可能性がある。

必須受入条件:

- tab close完了後、同じ`.lsa`を直ちに再openできる。
- inactive/active、clean/dirty、Save/discardの各close経路でregistryを確実に更新する。

### P1 — 今回必ず直す、繰り返し報告済みの入力UX

#### 4. 「単純実験」は折りたたみではなくfast entryである

研究者が求める単純実験とは、必須設計質問を折りたたんで隠すことではない。低曖昧性の定型ケースを、
研究者が理解できる入口から設定済みworksheetへ短く到達させることである。手順2以降を初期状態で
閉じても、結局すべて開くなら操作が増えるだけである。

必須受入条件:

- low-ambiguityな2群独立連続値などは短い入口からworksheetへ到達できる。
- biological relationshipが未確定なら必要な科学的質問だけを行う。
- required sectionを単に初期collapseして「簡易化」と扱わない。
- Treatment level入力欄は十分な横幅がある場合、初期状態で2個ではなく4個程度を表示する。

#### 5. worksheetを一貫したspreadsheetにする

Scalar、Survival、ordered X/Yで入力部品の見た目と操作が異なる。Survivalとordered X/Yは、各セルが
独立した丸枠inputに見え、通常の連続したspreadsheetになっていない。

必須受入条件:

- 同一のcell selection、Tab/Enter/矢印移動、range paste、行追加、header grammarを使う。
- Survival `Status`は基本的に`Event / Censored`の選択式とし、誤入力を防ぐ。
- ordered X/Yの`Unit ID / Series / X / Y`の役割を研究者向けに説明する。
- セル選択枠と内部input枠が二重に見える編集状態をなくす。
- `Treatment / 行`見出し列と値列の間へ、headerを含む連続した縦罫線を表示する。

#### 6. Overviewの「＋入力行」をcontext-sensitiveにする

- Overviewから押した場合は入力行だけを増やし、Overviewに留まる。
- 個別入力行を編集中に押した場合は、新しい入力行tabへ移動してよい。
- 研究者向け用語として、可能な箇所は「入力行」より実験回・実験単位・nested observationを優先する。

#### 7. headerを固定する

BioFigureStat、Home、New、Help、About、問題報告、およびproject tab stripは、縦スクロール後も
操作できる固定headerとして扱う。

### P1 — Graphをreviewとpublicationの両方で読める状態にする

#### 8. previewと軸余白

- 入力後previewはデータ確認に使える大きさ、軸、値域、ラベルを持たせる。
- Y軸title（例: `Response`）がtick labelへ接触しない。
- X軸title（例: `Treatment`）をカテゴリ名から不自然に遠ざけない。
- preview、画面Graph、PNG/SVGで同じlayout grammarを使う。

#### 9. legend、subtitle、annotation

- legendをcurve/pointへ重ねず、右上／右などデータを隠さない位置へ配置する。
- `saved zero_baseline_association fit`のような内部ID風subtitleを研究者向け表現へ変える。
- annotation editorやcheckbox labelをpanel外へ切らない。

### P1 — Statisticsの確認と警告を研究者中心にする

#### 10. 回答済み独立性checkboxを毎回必須にしない

実験設計で独立性、対応、実験単位が明示済みなら、その情報をStatisticsへ引き継ぐ。同じ確認checkboxを
毎回入れなければ実行できない仕様にしない。情報が不足・矛盾するときだけ追加質問する。

#### 11. 重要な「診断と注意」を閉じない

`n < 3`など解釈へ直接影響する警告がある場合、初期状態で折りたたまず、severityに応じた色、icon、
見出しで強調する。研究者が意図的に閉じるまでは表示を維持する。

### P1 — specialist routeを共通project shellへ統合する

#### 12. Survivalとordered X/Yを別製品のように扱わない

科学的専用contractは維持しつつ、操作shellは`File / Data / Graph / Statistics`へ統一する。
今回のcandidateでは次が未達だった。

- Survivalとordered X/Yの入力が専用縦長GUIのまま。
- GraphとStatisticsが独立tabではない。
- save/reopen後のordered X/Y result画面にSave/Save As/export/common tabsがない。
- log-rank表示checkboxの文字列がpanel外へ消える。
- fit modelが説明文のbulletに見え、何を選べるか／選択中か分からない。
- dropdownが内容に対して不必要に全幅である。

必須受入条件:

- 再open後もData、Graph、Statistics、File、Save/Save As、exportへ到達できる。
- fit modelはradio/cardとして選択可能性とselected stateを明示する。
- Survivalのcomparisonは`Vehicle vs Treatment`のように明示する。
- censoring、risk table、ordered coordinates、fit provenanceをsave/reopenで維持する。

### P1 — native packaging、export、support

#### 13. macOS app icon

生成bundleの`Info.plist`にicon指定がなく、`Contents/Resources`にも`.icns`がなかった。Dockで空白iconに
なった。macOS bundleへ正式iconを含め、Finder、Dock、Aboutで確認する。

#### 14. exportはnative save dialogを使う

PNG/SVGは保存先を聞かずDownloadsへ自動保存された。clipboard imageは成功した。CSVは今回の操作後に
recent fileを確認できなかった。

必須受入条件:

- PNG、SVG、CSVは保存先とfilenameを選べるnative dialogを表示する。
- 再open後も同じ順序・位置からexportできる。
- cancelはファイルを作らない。
- clipboardはPNGとnative image形式を維持する。

#### 15. 外部LLMの改善要望を問題報告フォームへ接続する

相談promptの手動copy、回答の手動paste、実装依頼文copyは動作した。しかし研究者の明示要求は、生成した
改善要望を既存の問題／要望formへ引き継ぎ、内容とprivacyを確認後に送信できることである。

- 無確認の自動送信・自動実行はしない。
- 「改善要望として報告」でformへprefillする。
- 利用者の明示sendだけで送信する。
- 測定値、project label、path、clipboard/file内容はdefaultで含めない。

生成promptが示したpublic guide URLは検証時に404だった。release branch上の有効なversioned URLへ直し、
CIでリンク到達性または公開配置を検証する。

#### 16. 問題報告formのresponsive layout

checkbox labelと説明文が右側へ切れ、細い縦列になり、巨大な空白が発生した。送信対象とprivacyを読めない
状態で同意を求めてはならない。今回のprivate Mac buildでreport endpointが未設定なのは想定どおりだが、
formの表示崩れは別問題である。

#### 17. 診断環境情報

privacy-reduced diagnosticは測定値、研究label、path、clipboard/file内容を含まずPASSだった。ただし
Apple Silicon native buildで`platform: MacIntel`、`architecture: unknown`と表示した。privacyを広げず、
診断に有用なnative architectureを正しく記録する。

## 科学的・機能的にPASSした項目

次の項目は今回のcandidateで保持された。UI修正時に退行させてはならない。

- canonical値、Graph、save/reopenの一致。decimal overwriteで値連結やn増加なし。
- explicit Cell identityによる3 complete pairs＋1 unmatched observation。
- unmatched observationはGraphへ残し、paired inferenceからだけ除外。
- dish→Cellでraw pointsが5/6でもbiological nは2/2。
- Event/Censored、Kaplan–Meier、censor marks、risk table、明示的log-rank comparison。
- ordered X/Y座標、Series、zero-baseline association fit、推論を行わないrepeated trajectory boundary。
- `.xlsx`の2 worksheet、internal blank、date、formula result、負値、日本語label。
- legacy BIFF `.xls` import。
- two saved project tabsの切替、inactive close、dirty active Cancel/Save。
- telemetry opt-out表示と`automaticUpload: false`。
- analysis cancel後のspinner終了と入力値保持。
- 将来schema `99.0.0`に対する研究者向けsafe-stop。Zod/internal `PROJECT_*` codeなし。
- external-LLM回答をproduct authorityとして自動実行しない境界。

## 次回candidateの完了条件

次回の修正完了は、次を満たした場合に限る。

1. 上記P0/P1をWindows native buildで確認し、各項目にPASS証拠を付ける。
2. 同じcommit以降をMacへ配布し、build revisionと起動pathを確認して再検証する。
3. Command+Q、dirty tabs、specialist common shell、spreadsheet、warning visibility、export dialog、
   report layout、app iconを最低限のtargeted Mac gateで確認する。
4. 科学的PASS項目のfocused regressionを通す。
5. 未修正項目が残る場合、Alpha candidateをreadyと表現しない。

## 過去candidateとの関係

`27e26f7-alpha.20260829.mac1`のmanual gateではapplication-menu Quitのsilent exitを確認し、
`9e1f68c`で修正したと記録された。今回の`mac3`ではapplication-menu Quitのdialogは動作した一方、
Command+Qがguardを通らなかった。このため、旧結果をもってlifecycleをcloseできない。

今回の結果は、過去の検証証拠を削除するものではない。最新candidateに対する追加native evidenceとして、
Windows側の次回修正とMac再検証のauthorityにする。

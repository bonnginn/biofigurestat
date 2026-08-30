# Internal Alpha Hardening 実装報告

更新日：2026-08-22

## 完了した実装

- `.lsa`をSQLite containerによる単一ファイルへ変更し、atomic replace、checksum、recovery、legacy directory importを維持した。
- GraphとStatisticsをproject navigation上で分離した。統計実行・結果・MethodsはStatisticsを主画面とし、Graphは表示と注釈に限定した。
- raw値だけの変更では、同じ構造fingerprint・method・contrastのrequestだけをdebounce再実行する。構造変更時はstale化し、別解析へ自動rerouteしない。
- WBに次の明示入力modeを追加した。
  - 補正済みTarget/reference値
  - ImageJ Mean intensity・Mean background・Area
- 後者は `(Intensity - Background) * Area` version 0.1.0を明示し、Target/reference双方の元測定値、補正値、式、ratio、任意の追加正規化を保存・復元する。RawIntDenやIntegrated densityを自動的に同義としない。
- New Experimentを6入口へ変更した。
  - 細胞・培養
  - 顕微鏡・画像解析
  - タンパク質・生化学
  - 動物
  - その他の定量測定
  - 既存データを取り込む
- 各入口に研究者語のsubrouteを追加した。顕微鏡はCell/ROIの複数観測と実験単位要約を区別し、Cell/ROI数を生物学的nにしない説明を表示する。
- WBとX/Yでは不要な時間画面を省略する。増殖・tracking・同じ動物の経時測定では時間構造を条件入力より先に確認する。
- Existing Dataは通常Wizardを通さずImport、preview、mapping、確認へ進む。
- Recentを実装し、保存・openしたローカルprojectへ戻れるようにした。Favoriteは引き続き設計だけを保持し、実験データを複製しない。
- Methodsに実験単位、n、変換、正規化、統計、contrast、多重比較、engine/package versionを保持し、WB背景補正式も出力する。
- AUCは大きさと持続時間の要約であり、時間形状・timing・開始値差を失いうることをcontextual helpで示す。
- Home、New Experiment、Importの縦余白とcard高を圧縮し、通常文字サイズを維持した。
- 3条件以上の条件表に任意の「対照」指定を追加した。表示名から推測せずstable condition IDをproject、解析request、再編集、Statistics、Methodsへ保持する。指定しても解析法をDunnettへ自動変更しない。
- 顕微鏡の連続測定と動物の数値測定は、Cell/ROI入力単位の決定後、条件名より先に時間構造を確認するadaptive順序へ修正した。
- 数値セルはspinner非表示に加え、focus中のmouse-wheelで値が変わらないようにした。

## 意図的に公開していない機能

Control-vs-eachのDunnett型比較は、SciPy 1.18.0の候補APIと前提を確認済み。ただし独立した成熟実装によるgolden validationが未完了のためUIへ公開していない。現行のWelch ANOVA + Games-HowellをDunnettとして表示したり、独自実装で代替したりしない。

Survival、advanced mixed models、dose-response、omics、複数window、public plugin APIは本milestoneの範囲外。

## 自動検証

- TypeScript typecheck：合格
- ESLint：合格
- TypeScript/Vitest：349 tests合格
- Python pinned engine：`unittest` 27 tests合格
- Rust/Tauri：9 tests合格、development Python環境依存1件はignored
- production Web build：合格
- production sidecar：D01/D02/D03/D04/D05/D09（Pearson/Spearman）smoke合格
- native macOS `.app`：再build済み。同梱sidecarの全protocol smoke合格、`.lsa` file associationを確認
- macOS bundle：Internal Alpha用ad-hoc署名をbundle全体と同梱resourceへ適用し、`codesign --deep --strict`合格。`pnpm native:verify:mac`で実行ファイル、`.lsa`関連付け、sidecar、署名、全protocolを再検証できる。
- D03 Games–Howell：Statsmodelsの独立studentized-range参照でadjusted p-valueと95%区間を照合

## 残る手動確認

- ポート公開が制限されたCodex実行環境では、1360 × 900 pxのbrowser screenshot確認を再実行できなかった。DOM route testとproduction buildは合格している。
- 同じ実行環境では署名済みbundleもLaunch ServicesからGUI起動できなかった。bundle構造・署名・sidecarはartifact verifierで合格しており、実画面密度と操作は人手のnative確認で判定する。
- native `.app`の次の3経路を手動確認する。手順と合成値は`docs/NATIVE_WORKFLOW_VALIDATION_STAGE_1_6.md`に固定した。
  1. 陽性数・割合：入力 → Statistics → Graph → 保存 → 再open
  2. 顕微鏡強度：Cell/ROI貼り付け → 実験単位要約 → Graph → Statistics → 保存 → 再open
  3. WB背景補正：6列貼り付け → 補正値 → Target/reference → Statistics → 保存 → 再open

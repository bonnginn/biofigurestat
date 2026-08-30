# Stage 1–6 native workflow確認

対象：2026-08-22以降にbuildしたmacOS native `.app`。実測・未発表データは使わず、`docs/fixtures/internal-alpha/COPY_PASTE_DATA.md`のG–Iだけを使う。

事前のartifact確認：`pnpm native:verify:mac`。app bundle署名、実行ファイル、`.lsa`関連付け、同梱sidecar、全protocol smokeを一度に確認する。

## 1. 陽性数・割合

- [ ] 細胞・培養 → 陽性数・割合から開始できる。
- [ ] 3条件を入力すると対照列が現れ、Controlを明示指定できる。
- [ ] Exp 1–3へ2列の矩形貼り付けができ、割合が自動計算される。
- [ ] Statisticsで実験単位n=3/条件、Welch ANOVA、Games–Howell全ペア補正が表示される。
- [ ] 対照群は表示名推測ではなく安定条件IDとしてMethodsへ記録される。
- [ ] Graphを作り、保存・Quit・再起動・再open後もraw counts、割合、解析、Graph、対照指定が保持される。

## 2. 顕微鏡強度・Cell/ROI

- [ ] 顕微鏡・画像解析 → 蛍光強度で、Cell/ROI複数入力を選べる。
- [ ] Cell/ROIの入力単位を決めた直後に時間構造を確認し、その後に条件を入力する。
- [ ] Exp 1–3、Control/TreatmentへCell/ROI値を貼り付けられる。
- [ ] 実験単位ごとの要約値と元のCell/ROI値を別に確認できる。
- [ ] Statisticsのnは各条件3であり、Cell/ROI 12ではない。
- [ ] Graph・Statistics・保存・再open後もraw Cell/ROI、要約lineage、解析、Graphが保持される。

## 3. WB背景補正

- [ ] タンパク質・生化学 → Western blot → Target + referenceへ進める。
- [ ] 背景補正modeは明示的に選ぶまでONにならない。
- [ ] 6列矩形貼り付けができる。
- [ ] `(Mean intensity - Mean background) × Area`のTarget/reference各補正値と比を確認できる。
- [ ] RawIntDenを同義とする説明がない。
- [ ] Statisticsは派生比を使い、Methodsに式versionとlineageが記録される。
- [ ] 保存・Quit・再起動・再open後も6 source値、補正値、比、解析、Graphが保持される。

## 共通の安全確認

- [ ] raw値だけを変更すると、同じrequest構造が有効な場合だけdebounce後に同じ解析を再実行する。
- [ ] 条件、単位、対応、readout、contrastを変えると旧解析・注釈・Methodsがstaleになり、別手法へ自動変更しない。
- [ ] `.lsa`はFinder上で1ファイルである。
- [ ] Home → Recentは保存済みprojectへ戻り、Favoriteは設計だけを再利用する。

記録日：____________　app build時刻：____________　総合判定：Pass / Fail / 条件付きPass

メモ：

```text

```

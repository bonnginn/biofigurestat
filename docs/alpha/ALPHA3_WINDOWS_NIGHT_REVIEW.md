# BioFigureStat v0.1.0-alpha.3 Windows夜間確認

更新日: 2026-09-04 JST

この手順は、人の判断またはcurrent-user installationが必要な残項目だけを対象にする。
通常のexact-executable native harnessはfinal candidateで既にPASSしているため繰り返さない。

## 対象build

- product source: `de71d140bae95f899c05ce8d18c516cf7a09f6e9`
- About表示: `de71d14-alpha.20260904.win-alpha3-enginefix1`
- installer: `BioFigureStat-0.1.0-alpha.3-Windows-x64-Setup.exe`
- SHA-256: `b5650d3af710ad7bfa9e34264a2d11a4ec0703ab1dd485b9b3130770ba9c6fe5`

Aboutのbuild revisionが一致しなければ、その時点で停止する。

## 1. InstallとWindows Shell関連付け

1. 既存のBioFigureStatを終了する。
2. 対象installerをcurrent-userでinstallする。Windowsが発行元警告を出す可能性がある。
3. 保存済みのreview用`.lsa`をダブルクリックする。
4. BioFigureStatが起動し、指定したprojectが開くことを確認する。既にBioFigureStatを起動して
   いる場合に別windowになることは、現行Alphaの既知制限として別途記録する。
5. 開いたprojectで「データ」「グラフ」「統計」が有効で、保存済みGraphが再表示されることを
   確認する。

`.lsa`がBioFigureStat以外で開く、各ボタンが無効、またはGraphが失われた場合は停止する。
この関連付け経路は、install完了後に専用harnessでも1回だけ検証できる。

## 2. 互換性と解析

1. 「データ」で入力値、実験単位ID、`1.00`のような入力桁が保たれていることを確認する。
2. 「グラフ」で保存済みGraphと条件名を確認する。
3. 「統計」で保存済み結果とMethodsを確認する。再計算が必要なprojectでは、同等性marginや
   主比較を変更せずに実行し、「解析完了（ローカル）」が表示されることを確認する。
4. JPとENを1回ずつ選び、研究者が入力した条件名が翻訳・変更されないことを確認する。

科学的意味、実験単位、対応方向、除外された不完全組が変わって見える場合は停止する。

## 3. Exportと終了確認

1. 表示中のGraphからSVGとPNGの保存画面を開き、必要なら保存して表示と一致することを確認する。
2. project内の文字列を1か所だけ変更する。
3. windowを閉じ、「この実験を保存しますか？」を確認する。
4. 「キャンセル」を選び、変更が残っていることを確認する。
5. もう一度windowを閉じ、再表示された同じ確認で「変更を破棄して続ける」を選ぶ。

確認画面が出ない、Cancel後に変更が失われる、または2回目の終了要求を受け付けない場合は停止する。

## 記録する結果

- Aboutのbuild revision
- installer SHA-256
- `.lsa` association: PASS / FAIL
- Data・Graph・Statistics・Methods: PASS / FAIL
- JP / EN: PASS / FAIL
- SVG / PNG: PASS / FAIL
- Cancel保持と2回目のDiscard終了: PASS / FAIL
- 見た目で気づいた文字切れ、重なり、過大な余白

失敗時は再試行で隠さず、最初の失敗画面と操作だけを記録する。

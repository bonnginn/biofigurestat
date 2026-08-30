# ADR 0039: Safe automatic re-analysis

Status: accepted

## Decision

rawまたは派生値の変更時は、まず依存analysis、Graph annotation、Methodsをstaleにする。自動再実行は以下がすべて同一の場合だけ許可する。

- analysis template/versionとmethod
- design revisionのfactor/condition structure
- readoutまたはderived dataset specification
- experimental/statistical unit levelとpair/block semantics
- selected conditions、time point/window、transformation
- contrastとcontrol condition ID
- sidedness、confidence level、multiplicity method

これらをcanonical serializationし、version付きfingerprintを作る。Graph appearanceはfingerprintに含めない。

## Execution

- セル編集の各keystrokeで実行しない。
- paste、Enter/blurによる入力確定、または短いdebounceの後にvalidationする。
- 前回requestがそのまま適用できる場合だけ同じrequestを新しいraw/derived revisionへ再bindする。
- 実験単位の欠損、pair不完全、contrast消失、method適用不可なら自動実行せず理由を表示する。
- pairedからindependentなど、別methodへ自動rerouteしない。

## History

自動再実行も新しいanalysis runとhistory eventを作り、旧resultを上書きしない。

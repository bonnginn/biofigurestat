# BioFigureStat v0.1.0-alpha.4 — draft / 草案

Not published. Artifact identities and final validation are pending. This document does not
authorize creating or changing a remote release.

Planned identity: application 0.1.0 / engine 0.15.1 / MIT License.

## 日本語

Alpha 3を基にした小規模な修正更新です。β向けの新機能は含めません。

- 入力表の2行目以降にも実験日を入力・保持できるよう修正しました。
- 保存された親子カテゴリをグラフに表示し、カテゴリの間隔と親ラベルの余白を整えました。
- 入力表をコンパクトにし、実験日の注釈を表の外へ移動しました。対応する単一因子表では
  親カテゴリを結合見出し、子カテゴリをその下に表示します。
- 計算不能・非有限のエンジン応答を安全なエラーとして返し、一般的な実行失敗を
  非線形フィットの失敗と誤って説明しないよう修正しました。
- IME変換中の意図しないセル移動と、不正なp値への有意差記号の表示を防ぎます。

グラフの親子表示は群を統合しません。日付や行位置から対応・独立性・解析nを推測しません。
既存の`.lsa`形式、測定値、統計手法の範囲は変更しません。公開前に実機互換性を検証します。

## English

A focused maintenance update based on Alpha 3. Beta feature development is not included.

- Fix editing and retaining experiment dates beyond the first worksheet row.
- Render saved parent/child categories in graphs with uniform category spacing and clearer label clearance.
- Make the worksheet more compact and move date guidance outside the table. Supported single-factor
  sheets use merged parent headers with child categories beneath them.
- Return safe errors for undefined or non-finite engine outputs, and avoid describing unrelated
  execution failures as nonlinear-fit nonconvergence.
- Prevent unintended cell navigation during IME composition and significance symbols for invalid p values.

Display hierarchy does not pool groups. Dates and row positions do not establish pairing,
independence or analysis n. The existing `.lsa` format, measurements and supported statistical
methods remain unchanged; native compatibility verification is required before publication.

## Release gate / 公開前の確認

- Same-source Windows and Apple Silicon artifacts, final build/engine identities and hashes: pending.
- Native save/reopen and SVG/PNG parity: pending.
- Inherited D17 reference discrepancy: unresolved; do not claim the numerical release gate passed.
- Existing unsupported workflows and signing limitations remain subject to final artifact review.
- Upload/draft changes and publication each require explicit user approval.

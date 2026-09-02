# BioFigureStat 0.1.0-alpha.3 — Draft release notes

Draft only. Exact contents, artifacts, checksums, and publication remain subject to the candidate
gate and explicit approval.

## 日本語

BioFigureStat Public Alphaの保守更新候補です。実験データをローカルで扱う方針と`.lsa`
保存互換性を維持しながら、実データ入力、限定された同等性解析、複数条件の解析、Graph
編集を改善します。

### 主な更新候補

- 表の途中行から入力しても行の対応を保持し、実験回・実験日をprovenanceとして保存
- `1.00`など入力した表示桁を保ちながら、解析・書き出しには同じcanonical数値を使用
- 矢印、Enter、Tabによる表入力をExcelに近い移動へ修正
- 単純な独立群実験で5条件以上を追加可能にし、多条件Games–Howellの同じ厳密計算を高速化
- 事前指定したraw-difference marginによる独立2群Welch TOSTと、完全な対応組によるpaired
  TOSTを追加
- Graph-only経路でGraph種類を事前選択でき、編集時の不要な見出しと余白を縮小
- 棒の塗り、外枠色・太さ・非表示、quick colorを追加し、画面・SVG・PNG・保存再表示で共有
- Graphの色・線・表示controlを共通化し、今後の修正が各Graph経路へ反映されやすい構造へ整理

同等性marginは観測結果から自動生成しません。positive/total、shared-run、複数の主比較、
未対応のspecialist outcomeは通常のANOVAやt検定へ置き換えず安全に停止します。実験日や
同じrun名からpairingを推定することもありません。

### Alpha版の注意

- 研究データと`.lsa`は必ず別の場所にもバックアップしてください。
- 実験単位、biological `n`、対応・入れ子構造、比較範囲、打ち切りを確認してください。
- 同等性marginはデータを見る前の科学的根拠に基づいて指定してください。
- 保存したprojectを再度開き、Graphと解析結果を書き出し前に確認してください。
- macOS版のnotarizationとWindows版のcode signing状態はcandidate確定時に記載します。

## English

This is a candidate maintenance update for the BioFigureStat Public Alpha. It improves real-data
entry, bounded equivalence analysis, multi-condition analysis, and Graph editing while preserving
local processing and backward compatibility for `.lsa` projects.

### Candidate highlights

- Preserve row identity when entry begins below the first row, and store experiment session/date as
  provenance.
- Retain entered lexical precision such as `1.00` while using the same canonical numeric value for
  analysis and export.
- Correct Arrow, Enter, and Tab movement for a more spreadsheet-like entry workflow.
- Allow more than four conditions in simple independent-group experiments and accelerate the same
  exact Games–Howell calculation for multiple groups.
- Add prespecified raw-difference Welch TOST for two independent groups and paired TOST using only
  complete explicit pairs.
- Let Graph-only workflows choose an initial Graph type and reduce redundant editing chrome.
- Add Bar fill, outline color/width/off controls, and quick colors shared by the live Graph, SVG,
  PNG, and saved presentation.
- Consolidate Graph color, line, and visibility controls so later fixes propagate consistently.

BioFigureStat does not derive an equivalence margin from the observed result. Positive/total,
shared-run, multiple-primary-comparison, and unsupported specialist outcomes stop safely rather
than being substituted with an ordinary ANOVA or t test. A shared date or run label does not imply
pairing.

### Alpha cautions

- Keep an independent backup of research data and every `.lsa` project.
- Confirm the experimental unit, biological `n`, pairing/nesting, comparison scope, and censoring.
- Prespecify equivalence margins from scientific justification before examining the result.
- Reopen saved projects and inspect Graphs and analysis results before relying on exports.
- The exact macOS notarization and Windows code-signing status will be stated when the candidate is
  finalized.

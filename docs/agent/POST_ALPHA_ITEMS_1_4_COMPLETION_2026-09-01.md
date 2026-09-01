# Public Alpha後 項目1–4 完了記録

更新日: 2026-09-01 (JST)

## 1. 公開後の案内整合

- `v0.1.0-alpha.2`の日本語・英語README、download導線、release notes、Help URLを一致させた。
- Windows / Apple Silicon macOS assetとSHA-256を公開案内へ固定した。
- 完了commit: `94e9cbc`。

## 2. Native不具合検出の自動化

- Windowsのpackaged executableを対象に、起動、IPC、Graph-only Statistics、native export、dirty close / Cancel / Discardを自動検査する。
- macOSは`CFBundleExecutable`を解決し、Accessibility環境の失敗を製品回帰と区別する。
- macOSのdirty状態確認は不安定なAX value読み戻しへ依存せず、製品のquit guard lifecycleを検証する。
- 完了commit: `877bf52`。OS管理ポリシーでAccessibilityが遮断される場合は`HARNESS_INFRASTRUCTURE_BLOCKED`として残し、製品FAILに数えない。
- Open/Save As dialogと`.lsa` file associationの追加自動化は次の独立範囲であり、本項目のdirty-lifecycle修正とは分離する。

## 3. コード整理の完了判定

- Graph workbenchは公開Alpha時の6,922行から720行となり、renderer、editor、analysis、export、workspace同期を個別境界へ移した。
- Graphはplot bounds、nice ticks、number format、text width / Y-title spacingを共有する。
- Spreadsheetはdraft/commit、keyboard、paste、finite-number判定、canonical同期、bounded undo/redoを共有する。
- これ以上は行数削減を目的にせず、具体的な重複不具合が見つかった時だけ変更する。
- prototypeと再生成benchmark outputは公開product sourceから分離済み。

## 4. 優先Beta改善

- compact workspace headerと安全な実験詳細修正入口: `f6d1c04`。
- Spreadsheet canonical undo / redo: `f55c483`。
- 対照群比較と調整済み比較一覧へのアクセス回帰: `dc54f53`。
- Kaplan–Meierの保存互換なfont sizeと既存系列色: `f41467a`。
- 通常GraphのY軸titleを表示tick幅に応じて近接配置: `e064c55`。
- 旧日本語`.lsa`由来のmatched-set診断と新規測定フォームは、英語localeで日本語UIを残さないfocused testがPASS。

## 不変として確認したもの

- scientific semantics、biological `n`、pairing、nesting、censoring、ordered identity、raw lineageは変更していない。
- Graphの外観変更は解析結果・canonical measurementを変更しない。
- Graph appearanceの追加fieldはoptionalで、Public Alpha `.lsa`のopen互換を維持する。
- 実験詳細修正は既存のstructure revision経路を使い、保存schemaを変更しない。

## 検証

- 各commitでfocused UI testsとUI typecheckを実行。
- Graph layout / Workbench対象test、legacy Japanese diagnostic localization、新規測定フォーム英語表示はPASS。
- Workbench全体61件の実行では60件PASS、今回と無関係な非同期engine mock 1件が結果待ちで失敗し、同対象レイアウトtestは単独PASSした。製品回帰とは分類しない。
- 最終full gateは本記録更新後に一度だけ実行し、結果を追記する。

## 次の開発範囲

- native file dialog / `.lsa`関連付け自動化。
- Kaplan–Meierの軸・凡例設定とGraph-only visual parity。
- 独立性確認文の短文化はscientific wording判断を伴うため、ユーザー確認付きで行う。

# ADR 0024: Graph Workspace v2を再利用可能なGraph Core拡張として実装する

## Status

Accepted

## Decision

Graph Workspace v2は、既存Graph Coreの小さな再利用可能拡張として実装する。

- グラフ種類はデータ構造を表す骨格とし、raw dots、experiment summary、box、violin、error bar、connecting lineなどの表示層から分離する。
- 各基本形の初期レイヤーは共通関数で定義し、個々の生物学的反復を既定表示する。Violinは十分なnested観測がある場合だけ推奨し、raw観測分布と実験単位点を併記する。
- Graph作成前は固定模式図でfamilyを選び、選択中の一種類だけを現在データと既定レイヤーでpreviewする。previewはGraph stateや解析を変更しない。
- 条件属性は任意階層の軸ラベルとして扱い、複数属性を連結した一つの文字列へ平坦化しない。
- グラフ種類、表示層、appearance、軸設定はworkspace graph stateへ保存し、保存済みプロジェクトには後方互換の既定値を適用する。
- Inspectorは一つの編集対象セレクターを持ち、キャンバス上の要素のダブルクリックでも同じ対象へ移動できる。
- 直接操作のhit targetは表示geometryと分離して十分なクリック幅を持たせ、軸・階層ラベル・点・分布・誤差線・凡例を決定的にInspectorへ対応付ける。
- wide Graphは読みやすい横スクロールを既定とし、同じdata/structureをCSS scaleだけで俯瞰する明示的な全体表示を提供する。
- 横方向のgeometryはviewportへの均等引き伸ばしではなく、安定したカテゴリスロット、階層境界の追加gap、左右余白から決定する。Simple Graphは中央にコンパクトに収まり、複雑Graphは同じ規則で幅を広げる。
- publication stylingの第一弾は既存Graph Coreの小さな再利用可能拡張とし、フォント、文字サイズ、凡例プリセット、制御されたパレット、層ごとの色、線幅、canvas preset、左右余白、nice ticksをworkspace graph appearance/axesに保存する。解析契約には追加しない。
- 通常のGraph textは黒を既定とし、色は主にdata marksの識別に用いる。凡例は既定で非表示とし、上／右／内側／なしのpresetだけを提供する。free draggingは後回しにする。
- Graph clipboard copyは利用可能な環境でSVG vector、次に透過PNG、最後にSVG textをfallbackとする。SVG/CSVの書き出しは維持する。
- アプリケーションが生成するscientific Graph textは英語を既定とするが、ユーザーが入力したcondition/readout名は自動翻訳しない。
- 統計解析結果とグラフ表示設定は分離する。表示変更はraw data、analysis request、statistical resultを変更しない。
- 現行の独立群・単一readout設計で意味を確定できないPaired/Scatterは選択肢を見せつつ無効化し、対応する実験設計が利用可能になるまで自動推定しない。

## Consequences

- 既存のraw data integrity、analysis provenance、stale invalidationの契約は維持される。
- グラフの見た目を変更しても解析を再実行する必要はない。
- 新しいグラフ種類を追加する場合は、骨格と表示層の責務を分けたままworkspace stateの既定値と再編集テストを追加する。

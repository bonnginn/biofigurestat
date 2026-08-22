# ADR 0018: 実験日を観測レコードの版管理属性として保持する

## 状況

細胞実験の `n=3` は、別々の日に行った3回の実験であることが多い。プロジェクト全体に1つだけある `ProjectMetadata.experimentDate` では、この違いを保存・再編集できない。一方、既存の `UnitInstance` はraw revisionをまたいで定義が不変であり、過去プロジェクトのunit metadataへ日付を後付けすると、過去の生データ履歴を暗黙に変更するか、unit不変条件に違反する。

## 決定

- `Observation.experimentDate` に任意のISO日付を保存する。
- 新しい入力シートではプロジェクトの最初の実験日を初期値にし、各実験単位で変更できる。
- 独立群では condition × experimental unit ごとに日付を保持する。
- 対応のある測定・繰り返し測定では、同じexperimental unitに属する全条件の観測が同じ日付を使う。入力スキーマで不一致を拒否する。
- D10のcell/ROI観測は、明示的に割り当てた親experimental unitの日付を引き継ぐ。日付から対応関係や独立性を推測しない。
- 日付の編集は測定値の編集と同じく新しいraw revisionを作り、以前のrevisionを保持する。
- `ProjectMetadata.experimentDate` は後方互換性のある「最初の実験日／初期値」として残す。旧プロジェクトの観測に日付がない場合だけ復元時の初期値に用いる。
- recovery CSVには各active observationの `experiment_date` を出力する。

## 結果

SQLiteは各レコードのJSON全体を保存するため、列追加migrationは不要である。`Observation.experimentDate` はoptionalなので旧プロジェクトを読み込める。再編集時に `UnitInstance` の定義を変えず、raw-data revisionの履歴と整合性を維持できる。

プロジェクト全体の日付だけを解析上のブロックやpairingへ変換してはならない。日付やバッチをモデルへ使う将来機能は、明示的な設計判断と別の解析契約を必要とする。

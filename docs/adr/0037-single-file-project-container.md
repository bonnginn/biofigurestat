# ADR 0037: Single-file project container

Status: accepted for implementation design

## Decision

`.lsa`を一つのnative fileとし、現行のtransport-independent package contractを維持する。containerには`manifest.json`、relational project state、raw export、追加payloadをpath付きentryとして保持する。

containerは既にpin済みの`rusqlite 0.40.2` / bundled SQLiteを用いる。外側SQLiteの`container_entries`にpath、size、BLOBを保存し、内側payloadのSHA-256は既存manifestで検証する。これは独自packerや未検証のarchive実装を追加せず、SQLite transactionとintegrity checkを使える選択である。

## Atomic save

1. 同じvolumeの明示的な隣接temporary fileへ新containerを作る。
2. entryごとのsize/checksumとmanifestを検証する。
3. containerを再オープンし、manifestとproject databaseを検証する。
4. fileと親directoryをdurable flushする。
5. 旧targetをrecovery backupに保全し、atomic replacementする。
6. 失敗時は旧targetを戻し、temporary targetを回復候補として識別できるようにする。

## Open and recovery

オープン時はpath traversal、duplicate entry、上限を超えるentry/total size、checksum不一致、未知schemaを拒否する。raw exportは他の非必須assetが壊れても回復可能な構成にする。

## Migration

現在の安定Internal Alpha directory projectは、明示的な一回性import/migration対象とする。古いprototypeの包括的互換は目標にしない。

### Public Alpha compatibility amendment (2026-08-30)

Public Alphaで保存された既知のproject-state schema versionは、versionごとのfixtureを持つ
migration matrixへ登録し、現行schemaまで非破壊で開けることを回帰testにする。新しいappで
作られたversion、未対応の古いversion、version欠落、schema不整合、project kind不一致は
stableなtyped compatibility errorとして区別する。UIはこのcodeを行動可能な説明へ変換し、
Zod issue、内部project code、migration実装詳細を通常画面へ表示しない。未知versionのfileは
変更せず停止する。

# ADR 0017: スキーマ移行前のプロジェクトを永続バックアップする

- 状態: accepted
- 日付: 2026-08-20

## 背景

通常の保存は、既存の`.lsa`を一時バックアップへ移し、新しいpackageの配置に成功した後に削除する。これは保存失敗からは保護するが、旧SQLite schemaのprojectを新schemaで保存した後に、移行前の完全なpackageは残らない。

## 決定

保存transactionのcommit前に、既存packageとstaging packageの`data/project.sqlite` / `PRAGMA user_version`を読み取る。staging側の版が高い場合だけ、既存packageを次の形式で隣に残す。

`<project>.lsa.pre-migration-v<old>-backup-<transaction-token>`

- バックアップはmanifest、SQLite、recovery exportを含む元package全体である。
- 移行がない通常の上書き保存では永続バックアップを作らない。
- stagingの配置が失敗した場合は、このpackageを元のtargetへ戻す既存ロールバック動作を保つ。
- database版を読み取れないpackageを、推測で移行対象にしない。open/integrity検証で先に停止する。

## 影響

初回のschema更新保存ではディスクを追加使用するが、移行後に不具合が見つかった場合でも、ユーザーは元の研究データとschemaを回復できる。自動削除と古いバックアップの保持数管理は、ユーザー向けの回復UIと同時に別途設計する。

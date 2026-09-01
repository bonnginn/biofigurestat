# BioFigureStat IT・データ取扱い概要 / IT and Data Handling Overview

文書版 / Document version: 2026-09-02  
対象 / Scope: BioFigureStat 0.1.0 Public Alpha and current Beta-bound source

この文書は、大学・病院・企業などで導入可否を検討する担当者向けの技術概要です。認証、
セキュリティ監査、医療機器・GxP適合、または組織固有の承認を表明するものではありません。

This document is a technical summary for institutional IT and data-governance review. It does not
claim certification, an external security audit, medical-device or GxP compliance, or approval under
an institution's own policies.

## 要点 / At a glance

| 項目 / Area | 現在の境界 / Current boundary |
| --- | --- |
| 標準解析 / Standard analysis | 測定データと決定論的な統計処理は端末内に留まります。Measurements and deterministic statistics remain on the local computer. |
| Project保存 / Project storage | `.lsa` projectはユーザーがnative Save画面で指定した場所へ保存します。The user chooses the `.lsa` location through the native Save dialog. |
| 利用情報 / Usage telemetry | 初回の明示的な同意前は記録・送信しません。固定allowlistだけを扱い、測定値・研究者入力文・project識別子・file内容を除外します。Nothing is recorded or sent before explicit consent. The fixed allowlist excludes measurements, researcher-entered text, project identifiers, and file content. |
| 不具合報告 / Problem reports | 送信内容のpreviewと明示的な送信操作が必要です。file、screenshot、project packageは添付できません。A complete preview and explicit Send action are required. Files, screenshots, and project packages cannot be attached. |
| Cloud AI | 標準解析・local Helpにcloud AIを使用しません。外部LLM相談はユーザー自身によるcopy/pasteです。Standard analysis and local Help do not call cloud AI. External-LLM consultation is a user-controlled copy/paste boundary. |
| 権限 / Permissions | main windowのcore機能とnative Open/Save dialogを許可します。書込先は選択されたproject・export・diagnostic pathです。The main window has core capabilities and native Open/Save dialogs; writes target user-selected project, export, or diagnostic paths. |
| 署名 / Signing | Public AlphaのWindows版は未署名、macOS版はad-hoc署名でnotarization未実施です。Public Alpha Windows is unsigned; macOS is ad-hoc signed and not notarized. |
| 更新 / Updates | 現在のPublic Alphaに自動updaterはありません。新versionは公式GitHub Releaseから手動取得します。The current Public Alpha has no automatic updater; new versions are downloaded manually from the official GitHub Release. |

## 1. 研究データの処理と保存 / Research-data processing and storage

- 標準の統計engineはアプリに同梱されたlocal processとして実行されます。通常の解析要求を
  remote analysis serviceへ送りません。
- `.lsa`には、入力データ、実験構造、Graph状態、解析条件とprovenanceが保存されます。
  保存先はユーザーが選択します。共有driveやcloud同期folderを選んだ場合、その同期とaccess
  controlはBioFigureStatではなく、OS・storage provider・所属組織の管理対象です。
- SVG、PNG、CSV、解析レビューHTML、diagnostic JSONもユーザーが選んだ場所へ保存します。
- Public Alphaは研究データの唯一の保管先として使用しないでください。組織のbackup、retention、
  encryption、access-control方針に従って原本と検証済みexportを保全してください。

- The bundled statistical engine runs as a local process. Ordinary analysis requests are not sent to
  a remote analysis service.
- A `.lsa` project stores entered data, experimental structure, Graph state, analysis settings, and
  provenance at a user-selected location. If that location is a shared drive or cloud-synced folder,
  synchronization and access control are governed by the OS, storage provider, and institution—not by
  BioFigureStat.
- SVG, PNG, CSV, analysis-review HTML, and diagnostic JSON exports are also written to locations
  selected by the user.
- Do not use the Public Alpha as the sole copy of research data. Preserve source data and verified
  exports under the institution's backup, retention, encryption, and access-control policies.

## 2. 外部通信 / Network communication

BioFigureStatの研究workflowはofflineでも動作します。現在のproduction経路で外部通信が起こり得る
のは、次の明示的または同意済みの機能です。

The research workflow can operate offline. In the current production boundary, external traffic can
occur only through the following explicit or consented features:

1. **任意の利用情報 / Optional usage telemetry** — 初回画面で同意した場合だけ有効です。random
   installation/session ID、時刻、app/build、OS family、固定route/workflow/category、bounded count、
   固定error codeを扱います。最大120 event、64 KiB、端末内queue最長30日です。送信先はHTTPSの
   BioFigureStat collectorで、collector側eventは90日後に削除します。source IPはevent databaseへ
   保存しませんが、Cloudflareが通常のtransport metadataとして一時処理する可能性があります。
2. **不具合報告 / Problem report** — ユーザーが入力した「試したこと」「起きたこと」と選択項目を、
   preview後に明示送信した場合だけ送ります。任意の返信emailとprivacy-reduced diagnosticは、それぞれ
   入力・checkbox選択時だけ含まれます。研究情報を自由記述欄へ入力しないでください。
3. **ユーザーが開く外部link / User-opened links** — GitHub Release、公開Help guide、または外部LLM
   serviceをユーザーが開いた場合は、通常のbrowser通信と各serviceのpolicyが適用されます。アプリが
   measurementを外部LLMへ自動送信することはありません。

TelemetryをOFFにすると、新しい収集を停止し、未送信queueとrandom installation IDを端末から削除します。
endpoint、public ingestion key、remote noticeのいずれかが不正または欠落したbuildはfail closedとなり、
telemetry uploadを行いません。詳細なfield境界は
[Alpha Privacy and Security](alpha/PRIVACY.md)を参照してください。

Turning telemetry off stops new collection and removes the unsent queue and random installation ID
from the device. A build with a missing or invalid endpoint, public ingestion key, or remote notice
fails closed and performs no telemetry upload. See
[Alpha Privacy and Security](alpha/PRIVACY.md) for the field-level boundary.

## 3. Application・file権限 / Application and file permissions

- Tauri capabilityはmain windowの`core:default`、`dialog:allow-open`、`dialog:allow-save`です。
- `.lsa`のOpen/Save、Excel import、Graph/data export、diagnostic exportはユーザー操作で開始します。
- projectとexportのnative commandは、選択path、許可extension、size・構造などを用途ごとに検証します。
- WebView CSPはdefaultでsame-originとし、object埋込みとframe embeddingを禁止します。remote telemetryを
  組み込むrelease buildでは、承認済みHTTPS originだけを`connect-src`へ追加します。
- アプリは管理者権限が不要であることを保証していません。installation、quarantine解除、endpoint access、
  shared-drive利用は各組織のOS/EDR/network policyで評価してください。

- Tauri grants the main window `core:default`, `dialog:allow-open`, and `dialog:allow-save`.
- Opening/saving `.lsa`, importing Excel, exporting Graph/data, and exporting diagnostics are initiated
  by the user.
- Native project and export commands validate the selected path, permitted extension, size, or
  structure according to the operation.
- The WebView CSP is same-origin by default and blocks object embedding and frame ancestors. A release
  configured for remote telemetry adds only the approved HTTPS origin to `connect-src`.
- BioFigureStat does not guarantee that institutional installation is administrator-free. Installation,
  quarantine overrides, endpoint access, and shared-drive use must be assessed under local OS, EDR,
  and network policy.

## 4. 配布、integrity、support / Distribution, integrity, and support

- 正式な配布元は[GitHub Releases](https://github.com/bonnginn/biofigurestat/releases)です。
- Public Alphaの署名状態により、Windows SmartScreenまたはmacOS Gatekeeperの警告が出る可能性が
  あります。Release notes記載のSHA-256を照合してください。
- source codeはMIT Licenseです。third-party componentは各licenseに従います。
- Alphaはexternal security review未実施です。機微性の高い環境へ導入する前に、所属組織によるsource、
  binary、network、data-flow reviewを推奨します。

- The official distribution source is [GitHub Releases](https://github.com/bonnginn/biofigurestat/releases).
- Because of the Public Alpha signing status, Windows SmartScreen or macOS Gatekeeper may warn. Verify
  the SHA-256 published in the release notes.
- Source code is MIT-licensed; third-party components retain their own licenses.
- The Alpha has not undergone an external security review. Institutions should review source, binaries,
  network access, and data flow before deployment in sensitive environments.

## 5. 導入判定checklist / Institutional review checklist

- [ ] 対象OS・architectureが配布対象（Windows 11 x64 / Apple Silicon macOS）に一致する
- [ ] 未署名または未notarizeのAlphaを許可できる
- [ ] GitHub Releaseから取得し、SHA-256を照合する
- [ ] `.lsa`とexportの保存先、backup、retention、encryption、access controlを定める
- [ ] 任意telemetryを許可するか決める（拒否しても標準解析は利用可能）
- [ ] 許可する場合はBioFigureStat HTTPS collectorへの通信をnetwork policyで確認する
- [ ] 不具合報告へ研究データや識別情報を入力しない運用を周知する
- [ ] Alphaの結果を研究成果へ使用する前に、実験構造、Graph、統計結果、Methods、exportを人が確認する

- [ ] Target OS/architecture matches a distributed build (Windows 11 x64 / Apple Silicon macOS)
- [ ] The institution permits an unsigned or non-notarized Alpha
- [ ] Download is from GitHub Releases and the SHA-256 is verified
- [ ] Storage, backup, retention, encryption, and access control are defined for `.lsa` and exports
- [ ] Optional telemetry is allowed or declined (standard analysis works when declined)
- [ ] If allowed, network policy permits the BioFigureStat HTTPS collector
- [ ] Users are instructed not to enter research data or identifiers in problem reports
- [ ] Experimental structure, Graph, statistics, Methods, and exports receive human review before use

## 実装根拠 / Implementation references

- [Privacy and Security](alpha/PRIVACY.md)
- [Public Alpha README](../README.md)
- Tauri configuration: `apps/desktop/src-tauri/tauri.conf.json`
- Tauri capability allowlist: `apps/desktop/src-tauri/capabilities/default.json`
- Usage allowlist and consent boundary: `apps/ui/src/app/usageTelemetry.ts`
- Problem-report schema and explicit submission: `apps/ui/src/app/problemReports.ts`


# BioFigureStat

BioFigureStatは、生命科学実験の構造整理、データ入力、決定論的な統計解析、研究用Graphの
作成を端末内で行うデスクトップアプリです。

統計手法の名前ではなく、実際に行った実験の事実から始めます。実験単位、biological `n`、
対応、階層、反復測定のidentity、変換、解析provenance、Graphの状態を明示的に保持します。
対応できない、または構造が曖昧な実験は、似た解析へ無理に置き換えず安全に停止します。

BioFigureStat is a local-first desktop application for structuring life-science experiments,
entering data, running deterministic statistics, and creating research graphs.

It starts from experimental facts rather than a test name. Biological units, biological `n`,
pairing, nesting, repeated identity, transformations, analysis provenance, and Graph state remain
explicit. Unsupported or ambiguous scientific structures stop safely instead of being forced into
a superficially similar analysis.

## Download / ダウンロード

BioFigureStat `0.1.0-alpha.2`は、次の
[Public Alphaリリースページ](https://github.com/bonnginn/biofigurestat/releases/tag/v0.1.0-alpha.2)
からダウンロードできます。BioFigureStat `0.1.0-alpha.2` is available from the same release page.

- [Windows 11 x64 installer](https://github.com/bonnginn/biofigurestat/releases/download/v0.1.0-alpha.2/BioFigureStat-0.1.0-alpha.2-Windows-x64-setup.exe)
- [Apple Silicon macOS app (zip)](https://github.com/bonnginn/biofigurestat/releases/download/v0.1.0-alpha.2/BioFigureStat-0.1.0-alpha.2-macOS-Apple-Silicon.zip)

Windows版は現在未署名です。macOS版はad-hoc署名で、Appleのnotarizationは受けていません。
そのためOSのセキュリティ警告が表示されることがあります。上記Releaseページ以外からは
ダウンロードせず、起動前にSHA-256が一致することを確認してください。

Windows builds are currently unsigned. The macOS build is ad-hoc signed and not Apple-notarized.
Your operating system may therefore show a security warning. Download only from the release page
above and compare the SHA-256 digest before opening the file.

| Platform | SHA-256 |
| --- | --- |
| Windows 11 x64 | `F7064981BE4A36EB809C6B6C6F18C974E974771BBE001BEB5D37410C3EF85747` |
| Apple Silicon macOS | `4EE4734D57F703845C38EB00BB8A859D1CB54A2C019E7875F5841D5DFA888722` |

Windowsではinstallerを実行してください。macOSではzipを展開して`BioFigureStat.app`を開きます。
警告が表示された場合は、ファイル名とSHA-256を確認したうえでOSの「開く」または
「このまま開く」を明示的に選択してください。

## Public Alpha / パブリックAlpha

バージョン`0.1.0`は、Windows 11 x64およびApple Silicon macOS向けの最初の限定的な
Public Alphaです。Alpha版には不具合が含まれる可能性があるため、研究データの唯一の保存先
にはしないでください。研究成果へ利用する前に、実験構造、Graph、統計結果、Methods、
書き出したファイルを必ず確認してください。

主なデータ境界：

- 標準の統計解析は決定論的で、端末内で実行されます。
- 測定値およびprojectファイルは自動送信されません。
- 利用情報の収集は任意です。測定値、研究者が入力した文章、ファイル内容、project識別子は
  含みません。
- 不具合報告は、送信内容を確認して明示的に送信した場合だけ送られます。ファイルや
  screenshotは添付されません。
- AI Helpは統計engineではありません。外部LLMへの相談は手動のcopy/paste境界です。
- 未対応のworkflowは安全停止し、既知の制限として明示します。

Version `0.1.0` is the first bounded Public Alpha for Windows 11 x64 and Apple Silicon macOS.
Alpha software may contain defects and should not be the sole copy of research data. Verify the
experimental structure, Graph, statistical result, Methods, and exported files before using them
in research output.

Key boundaries:

- Standard statistics are deterministic and run locally.
- Research measurements and project files are not uploaded automatically.
- Usage collection is opt-in and excludes measurements, researcher text, file content, and project
  identifiers.
- Problem reports require an explicit preview and send action; files and screenshots are not
  attached.
- AI Help is not the statistical engine. External-LLM consultation is a manual copy/paste boundary.
- Unsupported workflows remain visible as safe stops and are listed in the known limitations.

日本語を含む詳細は、[Alpha Quick Start](docs/alpha/QUICK_START.md)、
[release notes / リリースノート](docs/alpha/RELEASE_NOTES_0.1.0-alpha.2.md)、
[privacy notice / プライバシー](docs/alpha/PRIVACY.md)、
[IT・データ取扱い概要 / IT and Data Handling Overview](docs/IT_DATA_HANDLING_OVERVIEW.md)、
[known limitations / 既知の制限](docs/alpha/KNOWN_LIMITATIONS.md)を参照してください。
The relationship between the clean public source snapshots and validated native artifacts is
recorded in the [alpha.1 source provenance note](docs/alpha/PUBLIC_SOURCE_PROVENANCE_0.1.0-alpha.1.md)
and the [bilingual alpha.2 publication record](docs/alpha/BILINGUAL_ALPHA_UPDATE_READINESS_2026-09-01.md).

## Development

The workspace uses pnpm, TypeScript, React, Tauri, Rust, and a pinned local Python statistical
engine. Development and contribution instructions start in [AGENTS.md](AGENTS.md).

```text
pnpm install --frozen-lockfile
pnpm test
pnpm typecheck
pnpm lint
```

Sealed evaluation pools, third-party reference figures, and historical benchmark outputs are not
distributed in this public source repository.

## License

BioFigureStat source code is available under the [MIT License](LICENSE). Third-party components
remain under their respective licenses; see [Third-party software notices](THIRD_PARTY_NOTICES.md).

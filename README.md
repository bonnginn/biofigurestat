# BioFigureStat

[English](#english) | [日本語](#日本語)

## English

BioFigureStat is a local-first desktop application for structuring life-science experiments,
entering data, running deterministic statistics, and creating research graphs.

It starts from experimental facts rather than a test name. Biological units, biological `n`,
pairing, nesting, repeated identity, transformations, analysis provenance, and Graph state remain
explicit. Unsupported or ambiguous scientific structures stop safely instead of being forced into
a superficially similar analysis.

### Download

BioFigureStat `0.1.0-alpha.1` is available from the
[Public Alpha release page](https://github.com/bonnginn/biofigurestat/releases/tag/v0.1.0-alpha.1).

- [Windows 11 x64 installer](https://github.com/bonnginn/biofigurestat/releases/download/v0.1.0-alpha.1/BioFigureStat_0.1.0_x64-setup.exe)
- [Apple Silicon macOS app (zip)](https://github.com/bonnginn/biofigurestat/releases/download/v0.1.0-alpha.1/BioFigureStat-0.1.0-macOS-Apple-Silicon.zip)

Windows builds are currently unsigned. The macOS build is ad-hoc signed; it does not have an
Apple-verified Developer ID signature and is not notarized by Apple. Your operating system may
therefore show a security warning. Download installers only from the official GitHub Release. The
SHA-256 digest for each file is provided on its release page and by GitHub's release-asset metadata.

Run the installer on Windows.

#### Opening the macOS Alpha

Use the following verification and opening procedure for the current Alpha:

1. Download the zip from the official GitHub Release.
2. Compare the downloaded file with the published SHA-256 digest.
3. Extract the zip and try to open `BioFigureStat.app` once.
4. Open **System Settings → Privacy & Security**, find the blocked application notice, and
   explicitly choose **Open Anyway**.

### Public Alpha

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

See the [Alpha Quick Start](docs/alpha/QUICK_START.md),
[release notes](docs/alpha/RELEASE_NOTES_0.1.0-alpha.md),
[privacy notice](docs/alpha/PRIVACY.md), and
[known limitations](docs/alpha/KNOWN_LIMITATIONS.md). The relationship between this clean public
source snapshot and the validated native artifacts is recorded in the
[source provenance note](docs/alpha/PUBLIC_SOURCE_PROVENANCE_0.1.0-alpha.1.md).

### Citation

If you use BioFigureStat in research, please cite the version you used. Citation metadata is
available in [`CITATION.cff`](CITATION.cff).

```text
Inaba, H. (2026). BioFigureStat (Version 0.1.0-alpha.1) [Computer software].
https://github.com/bonnginn/biofigurestat/releases/tag/v0.1.0-alpha.1
```

### Development

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

### License

BioFigureStat source code is available under the [MIT License](LICENSE). Third-party components
remain under their respective licenses; see [Third-party software notices](THIRD_PARTY_NOTICES.md).

## 日本語

BioFigureStatは、生命科学実験の構造整理、データ入力、決定論的な統計解析、研究用Graphの
作成を行う、ローカルファーストのデスクトップアプリケーションです。

統計手法名を選ぶところからではなく、実験で行ったことの確認から始めます。実験単位、
biological `n`、対応、階層、反復測定における同一性、変換、解析の由来、Graphの状態を
明示的に保持します。未対応または曖昧な実験構造を、表面的に似た解析へ無理に当てはめず、
安全に停止します。

### 紹介動画

[![BioFigureStat Alpha 紹介動画](https://img.youtube.com/vi/i6Sf-3Dbg4w/maxresdefault.jpg)](https://youtu.be/i6Sf-3Dbg4w)

[BioFigureStat Alphaの基本操作を動画で見る](https://youtu.be/i6Sf-3Dbg4w)

### ダウンロード

BioFigureStat `0.1.0-alpha.1`は、
[Public Alphaのリリースページ](https://github.com/bonnginn/biofigurestat/releases/tag/v0.1.0-alpha.1)からダウンロードできます。

- [Windows 11 x64 installer](https://github.com/bonnginn/biofigurestat/releases/download/v0.1.0-alpha.1/BioFigureStat_0.1.0_x64-setup.exe)
- [Apple Silicon macOS app (zip)](https://github.com/bonnginn/biofigurestat/releases/download/v0.1.0-alpha.1/BioFigureStat-0.1.0-macOS-Apple-Silicon.zip)

Windows版は現在未署名です。macOS版はad-hoc署名ですが、Appleが確認したDeveloper ID署名はなく、
Appleのnotarization（公証）も受けていません。そのため、OSのセキュリティ警告が表示されることが
あります。インストーラーは必ず公式GitHub Releaseからダウンロードしてください。各ファイルの
SHA-256は、リリースページとGitHubのリリースアセット情報で確認できます。

Windowsではインストーラーを実行してください。

#### macOS Alphaを開く

現在のAlphaでは、次の確認・起動手順を推奨します。

1. 公式GitHub Releaseからzipをダウンロードします。
2. ダウンロードしたファイルを、公開されているSHA-256と照合します。
3. zipを展開し、`BioFigureStat.app`の起動を一度試します。
4. **システム設定 → プライバシーとセキュリティ**を開き、ブロックされたアプリの案内から
   **このまま開く**を明示的に選択します。

### Public Alphaについて

Version `0.1.0`は、Windows 11 x64とApple Silicon macOSを対象とした、範囲を限定した
最初のPublic Alphaです。Alpha版には不具合が含まれる可能性があるため、研究データを
このアプリ内だけに保存しないでください。研究成果へ使用する前に、実験構造、Graph、統計結果、
Methods、書き出したファイルを確認してください。

主な境界は次のとおりです。

- 標準の統計解析は決定論的で、ローカル環境内で実行されます。
- 研究上の測定値やプロジェクトファイルが自動的にアップロードされることはありません。
- 利用情報の収集は明示的な同意制であり、測定値、研究者が入力した文章、ファイル内容、
  プロジェクト識別子は含みません。
- 不具合報告は送信内容のプレビューと明示的な送信操作を必要とし、ファイルやスクリーンショットは
  添付されません。
- AI Helpは統計エンジンではありません。外部LLMへの相談は、利用者が手動でコピー＆ペーストする
  境界になっています。
- 未対応のワークフローは安全停止として明示され、既知の制限に記載されます。

詳細は、[Alphaクイックスタート](docs/alpha/QUICK_START.md)、
[リリースノート](docs/alpha/RELEASE_NOTES_0.1.0-alpha.md)、
[プライバシー説明](docs/alpha/PRIVACY.md)、
[既知の制限](docs/alpha/KNOWN_LIMITATIONS.md)を参照してください。この公開用ソーススナップショットと、
検証済みネイティブ成果物の関係は、
[source provenance note](docs/alpha/PUBLIC_SOURCE_PROVENANCE_0.1.0-alpha.1.md)に記録しています。

### 引用方法

BioFigureStatを研究で使用した場合は、使用したversionを引用してください。引用情報は
[`CITATION.cff`](CITATION.cff)にも記載しています。

```text
Inaba, H. (2026). BioFigureStat (Version 0.1.0-alpha.1) [Computer software].
https://github.com/bonnginn/biofigurestat/releases/tag/v0.1.0-alpha.1
```

### 開発

このワークスペースは、pnpm、TypeScript、React、Tauri、Rust、およびバージョンを固定したローカル
Python統計エンジンを使用します。開発・コントリビューションの手順は[AGENTS.md](AGENTS.md)から
確認してください。

```text
pnpm install --frozen-lockfile
pnpm test
pnpm typecheck
pnpm lint
```

非公開の評価用データ群、第三者の参照figure、過去のbenchmark出力は、この公開ソース
リポジトリには含まれていません。

### ライセンス

BioFigureStatのソースコードは[MIT License](LICENSE)で公開されています。第三者コンポーネントには
それぞれのライセンスが適用されます。詳細は
[Third-party software notices](THIRD_PARTY_NOTICES.md)を参照してください。

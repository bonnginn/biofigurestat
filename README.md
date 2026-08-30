# BioFigureStat

BioFigureStat is a local-first desktop application for structuring life-science experiments,
entering data, running deterministic statistics, and creating research graphs.

It starts from experimental facts rather than a test name. Biological units, biological `n`,
pairing, nesting, repeated identity, transformations, analysis provenance, and Graph state remain
explicit. Unsupported or ambiguous scientific structures stop safely instead of being forced into
a superficially similar analysis.

## Download / ダウンロード

BioFigureStat `0.1.0-alpha.1` is available from the
[Public Alpha release page](https://github.com/bonnginn/life-science-analysis-app/releases/tag/v0.1.0-alpha.1).

- [Windows 11 x64 installer](https://github.com/bonnginn/life-science-analysis-app/releases/download/v0.1.0-alpha.1/BioFigureStat_0.1.0_x64-setup.exe)
- [Apple Silicon macOS app (zip)](https://github.com/bonnginn/life-science-analysis-app/releases/download/v0.1.0-alpha.1/BioFigureStat-0.1.0-macOS-Apple-Silicon.zip)

Windows builds are currently unsigned. The macOS build is ad-hoc signed and not Apple-notarized.
Your operating system may therefore show a security warning. Download only from the release page
above and compare the SHA-256 digest before opening the file.

| Platform | SHA-256 |
| --- | --- |
| Windows 11 x64 | `74D0C98124DE7319EAC623EADD99392E198E5128B4DDFF730F62015D0B615100` |
| Apple Silicon macOS | `9C6FAE3076D1D7BD0E7F249451239675160179CBD37AA6618BE48CC9BD4208B6` |

Windowsではinstallerを実行してください。macOSではzipを展開して`BioFigureStat.app`を開きます。
警告が表示された場合は、ファイル名とSHA-256を確認したうえでOSの「開く」または
「このまま開く」を明示的に選択してください。

## Public Alpha

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

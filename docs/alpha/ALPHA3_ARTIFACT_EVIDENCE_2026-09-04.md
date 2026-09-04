# BioFigureStat v0.1.0-alpha.3 artifact evidence

Recorded: 2026-09-04 JST

This record distinguishes the current Windows candidate from the superseded same-day artifacts.
It is evidence for a draft candidate, not publication approval.

## Source relationship

- Corrected product source for final artifacts:
  `de71d140bae95f899c05ce8d18c516cf7a09f6e9`
- The correction changes only the About engine declaration from stale `0.14.0` to packaged
  `0.15.0`, with a focused UI assertion.
- macOS harness evidence head:
  `e055553210efe62c7c21e412b743fa2967ac3ae3`
- The macOS harness commits after the earlier product source `8b58727` change only
  `scripts/native_ui_regression.mjs` and `scripts/test_native_ui_regression.mjs`. They remain
  separate from the packaged product correction.
- Repository: `https://github.com/bonnginn/biofigurestat.git`

## Artifact identity

| Platform       | File                                                | Build revision                                 |      Bytes | SHA-256                                                            | Signing  |
| -------------- | --------------------------------------------------- | ---------------------------------------------- | ---------: | ------------------------------------------------------------------ | -------- |
| Windows 11 x64 | `BioFigureStat-0.1.0-alpha.3-Windows-x64-Setup.exe` | `de71d14-alpha.20260904.win-alpha3-enginefix1` | 48,088,866 | `b5650d3af710ad7bfa9e34264a2d11a4ec0703ab1dd485b9b3130770ba9c6fe5` | unsigned |

Final Apple Silicon identity is pending a rebuild from `de71d14`. The earlier zip is superseded
and must not be uploaded:

| Platform            | Superseded build revision                    |      Bytes | SHA-256                                                            | Reason                                                       |
| ------------------- | -------------------------------------------- | ---------: | ------------------------------------------------------------------ | ------------------------------------------------------------ |
| macOS Apple Silicon | `8b58727-alpha.20260904.mac-alpha3-quitfix1` | 47,908,904 | `b7f512c80d43061523852eeffec1f3c2028b2fa60933b80a1281cd2e7e8bc496` | About displayed engine `0.14.0` instead of packaged `0.15.0` |

## Automated evidence

Windows:

- the final production bundle contains the exact About revision
  `de71d14-alpha.20260904.win-alpha3-enginefix1` and engine `0.15.0`;
- focused About/diagnostic tests: 11 passed;
- related UI gate: 54 files / 639 tests passed;
- Rust application-exit approval test: passed;
- packaged engine smoke: 18 protocols passed;
- Windows bundle verifier: passed;
- production release verifier: passed;
- native-harness self-tests: 17/17 passed;
- exact-executable native harness: passed on the one final run;
- local report: `.tmp/native-ui-regression/2026-09-04T05-18-03.869Z/report.json`.

An earlier same-source local installer used the wrong build-time environment-variable name, so its
About revision would have been `unavailable`. A post-build string check rejected it before install
or upload. The file was overwritten by the final correctly injected build; its digest is not
release evidence.

The local staging directory also contains
`BioFigureStat-0.1.0-alpha.3-Windows-x64-Setup-r5.exe` (48,015,788 bytes,
SHA-256 `96a59d5ce20211b26f13ed5e8ba949edde867a27965a8c5180f8a18b12fd86b2`). It predates the
corrected candidate, is retained only as local historical output, and must not be installed or
uploaded. Release selection must use the exact unsuffixed filename and digest in the artifact table
above.

Superseded macOS evidence:

- engine build and smoke: passed;
- `.app` build and bundle verifier: passed;
- release verifier: passed;
- strict codesign verification: passed before zipping and after extraction;
- native-harness self-tests: 19/19 passed;
- native harness: passed on the one final run, including Cancel retention and a second Quit
  request followed by explicit Discard;
- `unzip -t`: passed;
- build-host report: `.tmp/native-ui-regression/2026-09-04T02-06-34.869Z/report.json`.

These checks remain valid evidence for the quit-guard implementation, but the artifact itself is
not a release candidate because its About engine declaration is stale. Repeat the build, bundle,
release, strict codesign, native, zip-extraction, and digest gates from `de71d14`.

## Remaining release boundary

The corrected Windows automated artifact gate found no product failure. The following actions remain
deliberately separate:

1. build and validate Apple Silicon macOS from product source `de71d14`;
2. install the exact Windows candidate and run the dedicated Windows Shell `.lsa` association
   scenario;
3. perform the bounded human compatibility and visual review still unchecked in
   `ALPHA3_CANDIDATE_CHECKLIST.md`;
4. verify the final Japanese and English release text against those results;
5. upload both assets to a draft release and compare the remote size and digest;
6. obtain explicit approval before publishing the GitHub Pre-release.

Neither artifact has been uploaded or published as part of this evidence record.

## Remote preflight

A read-only GitHub check on 2026-09-04 JST found no `v0.1.0-alpha.3` release. The existing
`v0.1.0-alpha.2` remains a published Pre-release with its original two assets and digests:

- Windows: `f7064981be4a36eb809c6b6c6f18c974e974771bbe001beb5d37410c3ef85747`;
- macOS: `4ee4734d57f703845c38eb00bb8a859d1cb54a2c019e7875f5841d5dfa888722`.

The Alpha 3 upload must therefore create or target a distinct draft release and must not replace
either Alpha 2 asset.

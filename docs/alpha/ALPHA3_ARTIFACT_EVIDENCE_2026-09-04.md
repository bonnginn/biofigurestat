# BioFigureStat v0.1.0-alpha.3 artifact evidence

Recorded: 2026-09-04 JST

This record separates the immutable product source used for both artifacts from later
harness-only corrections. It is evidence for a draft candidate, not publication approval.

## Source relationship

- Product source for both artifacts:
  `8b587275cc35dc8fe30737851796ab3b9e737f7a`
- macOS harness evidence head:
  `e055553210efe62c7c21e412b743fa2967ac3ae3`
- The commits after `8b58727` change only native-harness behavior and are not part of either
  packaged product. A direct name-only diff contains only
  `scripts/native_ui_regression.mjs` and `scripts/test_native_ui_regression.mjs`.
- Repository: `https://github.com/bonnginn/biofigurestat.git`

## Artifact identity

| Platform | File | Build revision | Bytes | SHA-256 | Signing |
| --- | --- | --- | ---: | --- | --- |
| Windows 11 x64 | `BioFigureStat-0.1.0-alpha.3-Windows-x64-Setup.exe` | `8b58727-alpha.20260904.win-alpha3-quitfix1` | 48,083,576 | `2209f333b843c0152e619ef91a5e73d19dff5bdb52990fc6e93977fed932e116` | unsigned |
| macOS Apple Silicon | `BioFigureStat-0.1.0-alpha.3-macOS-Apple-Silicon.zip` | `8b58727-alpha.20260904.mac-alpha3-quitfix1` | 47,908,904 | `b7f512c80d43061523852eeffec1f3c2028b2fa60933b80a1281cd2e7e8bc496` | ad-hoc; not notarized |

## Automated evidence

Windows:

- the final production bundle contains the exact About revision
  `8b58727-alpha.20260904.win-alpha3-quitfix1`;
- focused UI quit-lifecycle tests: 66 passed;
- Rust application-exit approval test: passed;
- packaged engine smoke: 18 protocols passed;
- Windows bundle verifier: passed;
- production release verifier: passed;
- native-harness self-tests: 17/17 passed;
- exact-executable native harness: passed on the one final run;
- local report: `.tmp/native-ui-regression/2026-09-04T05-09-32.013Z/report.json`.

An earlier same-source local installer used the wrong build-time environment-variable name, so its
About revision would have been `unavailable`. A post-build string check rejected it before install
or upload. The file was overwritten by the final correctly injected build; its digest is not
release evidence.

macOS:

- engine build and smoke: passed;
- `.app` build and bundle verifier: passed;
- release verifier: passed;
- strict codesign verification: passed before zipping and after extraction;
- native-harness self-tests: 19/19 passed;
- native harness: passed on the one final run, including Cancel retention and a second Quit
  request followed by explicit Discard;
- `unzip -t`: passed;
- build-host report: `.tmp/native-ui-regression/2026-09-04T02-06-34.869Z/report.json`.

## Remaining release boundary

The final automated artifact gates found no product failure. The following actions remain
deliberately separate:

1. install the exact Windows candidate and run the dedicated Windows Shell `.lsa` association
   scenario;
2. perform the bounded human compatibility and visual review still unchecked in
   `ALPHA3_CANDIDATE_CHECKLIST.md`;
3. verify the final Japanese and English release text against those results;
4. upload both assets to a draft release and compare the remote size and digest;
5. obtain explicit approval before publishing the GitHub Pre-release.

Neither artifact has been uploaded or published as part of this evidence record.

## Remote preflight

A read-only GitHub check on 2026-09-04 JST found no `v0.1.0-alpha.3` release. The existing
`v0.1.0-alpha.2` remains a published Pre-release with its original two assets and digests:

- Windows: `f7064981be4a36eb809c6b6c6f18c974e974771bbe001beb5d37410c3ef85747`;
- macOS: `4ee4734d57f703845c38eb00bb8a859d1cb54a2c019e7875f5841d5dfa888722`.

The Alpha 3 upload must therefore create or target a distinct draft release and must not replace
either Alpha 2 asset.

# Alpha Packaging Checklist

## Shared

- [x] Final product name and icon selected
- [x] Version and build revision injected into UI/package metadata
- [x] MIT License and repository URL approved
- [ ] Bundle identifier ownership confirmed
- [ ] `.lsa` association verified on a clean machine
- [ ] Save/open/recovery, sidecar, clipboard, SVG, and PNG smoke tests pass
- [x] Production web bundle has an automated evaluation/Gold/tunnel/source-map forbidden-string scan
- [ ] Packaged desktop artifact passes the same scan before distribution
- [ ] Diagnostic export and CSP smoke tests pass

## macOS Apple Silicon

- [x] App bundle and ARM64 engine resource mapping exist
- [x] Existing verifier checks executable, association, sidecar, and code signature
- [ ] Distribution signing identity selected
- [ ] Notarization and stapling documented and tested
- [ ] DMG or approved Alpha delivery format selected
- [ ] Clean external-machine save/quit/reopen smoke passes

## Windows 11 x64

- [x] Icons, version metadata, and `.lsa` association definitions exist in the base config
- [ ] Windows Tauri bundle override enabled
- [ ] x64 packaged engine mapped into `Resources/engine/lsaa-engine.exe`
- [ ] NSIS versus another non-Store installer choice documented
- [ ] WebView2 prerequisite/bootstrap mode documented
- [ ] Native PNG clipboard implemented or explicitly deferred
- [ ] Unsigned internal build smoke passes before certificate procurement
- [ ] Signing certificate/vendor selected

No Store distribution or automatic updater is part of this checklist.

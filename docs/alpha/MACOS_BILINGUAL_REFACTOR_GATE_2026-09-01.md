# macOS bilingual refactor gate — 2026-09-01

## Candidate identity

- Source authority: `039f46a292487380aa56faf8bba566d799f910fc`
- macOS cherry-pick HEAD: `15aabd06c76a85c3e6be43a6bd4a31e43560db09`
- Shared source tree: `018dc9d4fd558b24f015a9f42e0e7a62b10b346d`
- Build revision: `15aabd0-alpha.20260901.mac-refactor2`
- Branch: `codex/mac-refactor-review-20260901`

The commit IDs differ because the reviewed changes were cherry-picked onto the macOS review
branch. The source tree IDs are identical.

## Automated gate

| Check | Result | Evidence |
| --- | --- | --- |
| Working tree | PASS | Clean before and after validation |
| `.app` build | PASS | Apple Silicon application bundle generated |
| Engine build and smoke | PASS | Packaged engine responded normally |
| macOS bundle verifier | PASS | Bundle structure and signature checks passed |
| Release verifier | PASS | Forbidden `benchmark` marker count: 0 |
| Harness self-test | PASS | 9/9 |
| Native UI harness | ENVIRONMENT BLOCK | Accessibility attached, but the runner could not read the typed field value back; no retry |

Native harness report:
`.tmp/native-ui-regression/2026-09-01T11-34-01.466Z/report.json`

The harness result was classified as `HARNESS_INFRASTRUCTURE_BLOCKED`, not a product regression.
The corresponding dirty-input and quit-guard behavior was completed manually below.

## Bounded human review

| Check | Result |
| --- | --- |
| About revision and MIT License | PASS |
| Japanese to English switch and restart persistence | PASS |
| Older Japanese-authored `.lsa` uses English application-generated copy | PASS |
| Graph-only `.lsa` retains Data, enabled Graph/Statistics tabs, and saved Graph | PASS |
| Command+Q unsaved-work guard and Cancel retention | PASS |
| PNG/SVG native Save dialog | PASS |

Researcher-authored Japanese project, condition, readout, and axis labels were intentionally not
translated. No new data loss, crash, save failure, or product regression was observed.

## Final decision

`FINAL_GATE: PASS` for the reviewed macOS candidate, with the native Accessibility automation
environment block retained as a separate infrastructure limitation.

No zip, release publication, release mutation, or push was performed from the Mac review branch.

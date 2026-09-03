# macOS Public Alpha 3 candidate handoff

Prepared: 2026-09-04 (JST)

## Purpose and stop rule

This handoff completes the four missing Darwin-arm64 numerical references, establishes one final
candidate commit, and builds the Apple Silicon application from that commit. Stop at the first
unexpected product, reference, build, verifier, or signature failure. Do not repeatedly rerun the
native harness. Do not publish, replace an existing asset, or delete an older release.

## Starting authority

- Repository: `https://github.com/bonnginn/biofigurestat.git`
- Branch: `codex/alpha3-candidate-20260903`
- Expected starting HEAD: `90c83ce700791b648613ea99d3258a29ad931b89`
- Application: `0.1.0`
- Engine: `0.15.0`
- License: MIT
- Windows R5 validation revision: `90c83ce-alpha.20260903.win-alpha3-r5`

The final release SHA is not `90c83ce`: it will be the commit created after reviewing and adding
the four Darwin-arm64 reference records. The Windows release installer must subsequently be rebuilt
once from that same final SHA.

## Automated sequence on Apple Silicon

1. Fetch the branch, check out `codex/alpha3-candidate-20260903`, and confirm the clean starting
   HEAD equals the full SHA above. Stop if it differs or the worktree is dirty.
2. Install the locked dependencies without modifying the lockfile.
3. Run `pnpm engine:reference:append-missing:mac` once. Confirm the command reports Darwin arm64 and
   adds exactly Welch TOST, paired TOST, Survival, and D17. Review the diff; no existing reference
   case may change.
4. Run `pnpm engine:reference:coverage`. Commit only the reviewed reference update and push the
   candidate branch. Record the resulting full final SHA.
5. From that clean final SHA, run the focused engine/reference checks, `pnpm engine:build:mac`, the
   production UI build with a build revision derived from the final SHA, and `pnpm tauri:build`.
6. Run `pnpm native:verify:mac`, `pnpm release:verify`, and
   `pnpm native:ui-regression:test`.
7. Run `pnpm native:ui-regression:mac` at most once. If Accessibility policy prevents stable value
   retrieval, record `HARNESS_INFRASTRUCTURE_BLOCKED` and use only the bounded manual checks below.
8. After the `.app` passes, create
   `BioFigureStat-0.1.0-alpha.3-macOS-Apple-Silicon.zip` without rebuilding. Run archive integrity,
   extract it to a fresh temporary directory, and run `codesign --verify --deep --strict` against
   the extracted application. Record bytes, SHA-256, architecture, signing state, and build
   revision.

Do not use a documentation or evidence branch as the build source. The About screen and both
artifacts must identify the same final candidate source SHA.

## Bounded manual checks

Before giving click instructions, confirm the About-screen build revision and follow
`docs/agent/MANUAL_VERIFICATION_PROTOCOL.md`. Begin on the visible Home screen; if its heading or
the labels below are absent, stop and report the mismatch.

1. Open an older Alpha `.lsa` through the current **Open** control. Confirm Data, the saved Graph,
   Statistics, Methods, experimental-unit identity, and researcher-entered labels are preserved.
2. In a two-independent-group continuous project, open **Statistics**, select
   **実質的に同等か調べる**, preserve a prespecified margin, include Japanese rationale text, and
   use **Welch TOSTを実行**. Confirm **解析完了（ローカル）** and the equivalence result appear.
3. Reopen the saved project. Confirm the entered lexical form such as `1.00`, the equivalence plan,
   the saved result, Graph, and Methods remain linked.
4. On the Graph editor, choose **グラフ全体**, then inspect the Bar controls. Confirm fill,
   **棒の外枠色**, **塗り色に合わせる**, custom/quick color, width, and off state agree between
   the live Graph and save/reopen.
5. Export SVG, PNG, and CSV using their visible controls. Confirm the native save panels appear and
   the saved files correspond to the visible Graph and canonical values.
6. Make one unsaved title edit and press Command+Q. Confirm the unsaved-work dialog appears, Cancel
   retains the edit, and Discard exits only after explicit selection.
7. Switch JP/EN once. Confirm application-generated copy changes language while researcher-entered
   labels remain unchanged and no material clipping appears at the ordinary review viewport.

## Evidence to return

- final full source SHA and branch;
- clean-worktree result before and after;
- four appended reference case IDs and coverage result;
- build revision, architecture, signing state, `.app` path;
- bundle/release/self-test/native-harness results and report path;
- each bounded manual result;
- zip filename, bytes, SHA-256, extraction test, and extracted strict-signature result;
- explicit statement that no upload, publication, replacement, or deletion occurred.

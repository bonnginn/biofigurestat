# Current Working State

Updated: 2026-08-30

This is the short operational snapshot. It is not a replacement for accepted ADRs, method
references, schemas, or test evidence.

## Product phase

BioFigureStat is a local-first, experiment-first Alpha candidate undergoing native hardening. The
2026-08-30 macOS gate passed canonical integrity, matched/nested semantics, specialist routes, and
native export, but found a release-blocking application-menu Quit path that discarded unsaved work.
The fix is implemented in `9e1f68c` and awaits rebuilt macOS native revalidation. The task-oriented
entry hub and adaptive experiment path remain the intended default; the older compatibility path is
not the intended product route. Public distribution is not approved.

The 2026-08-30 P1 follow-up now also keeps matched-analysis inclusion explicit, bounds violin
geometry to observed values, hardens spreadsheet focus/Tab behavior without page jumps, clarifies
the directly treated experimental target, improves Graph-only descriptive rendering, and uses the
same Graph workspace presentation for Graph-only and specialist routes. Browser review confirmed
the common worksheet and Graph shell for Survival and ordered-curve/enzyme entry; native behavior
still requires the macOS gate below.

The dated engineering evidence and public-distribution blockers are recorded in
`docs/alpha/ALPHA_CANDIDATE_READINESS_2026-08-29.md`.
The executable macOS build and reduced native-human gate are specified in
`docs/alpha/MACOS_ALPHA_CANDIDATE_HANDOFF_2026-08-29.md`.

## Active product boundary

- New Experiment is task-oriented: experiment-first, existing-table Graph, Survival, ordered
  curve/enzyme kinetics, and Heatmap.
- Data may be retained and graphed before every inference fact is known. Statistics unlocks only
  after the necessary biological structure is explicit.
- Compact and expanded worksheets are views over the same canonical observations.
- Existing-table Graph promotion may generate stable local unit IDs only after the researcher
  explicitly confirms that each row is a separate experimental unit. Missing IDs never imply
  pairing; matched/repeated data require recoverable source identity.
- Complete one-factor shared-source runs may use explicit matched/block-role identity. True blocked
  or partial multi-factor matching remains a safe-stop boundary.

## Current gates

The eight semantic UX cases and hard-failure rules in
`docs/alpha/PRODUCTION_UX_ACCEPTANCE_GATE_2026-08-28.md` remain authoritative. Routine revalidation
is reduced to the four composite tasks recorded there. Current automated evidence includes 1,090 UI
tests across 121 files, the semantic-package and experiment-first suites, 63 Python-engine tests,
23 passing Rust native tests (plus one development-environment round trip ignored in the ordinary
run), and a real Rust→Python engine round trip. The current Windows x64 NSIS candidate includes the
BioFigureStat identity, project tabs, native Excel import, and telemetry collector client. It was
built on 2026-08-30 from implementation commit `4a68448` with SHA-256
`B80DE5B6060CE91B7CBBD057132DFCA87B3CDB11DC7B234AD50C7CC7127728A7`; Windows bundle verification
and the packaged Python-sidecar smoke passed. Node 26 test environments install an explicit in-memory Storage for
each isolated jsdom window rather than reading Node's unavailable or process-level localStorage.
The macOS native candidate must also be rebuilt from the current branch before the next native
human gate.

The highest-value remaining evidence is:

- first-time researcher navigation/usability through the reduced four-task gate;
- clean-machine native Statistics, PNG clipboard/export, and save/reopen identity/lineage validation;
- macOS and Windows packaging/smoke/signing/migration checks;
- real assistive-technology and localization validation;
- provider/notice decisions for opt-in remote telemetry and the feedback form;
- lifecycle validation for the remaining bounded semantic gaps.

External-LLM assistance remains a manual, user-controlled boundary. The application can create a
measurement-free consultation prompt and can turn a deliberately pasted answer plus the
researcher's own requested change into a reviewable implementation-request copy. It does not send,
execute, or treat the external answer as product authority.

Browser review does not close native gates. Automated semantic tests do not establish human
navigation success.

The current Alpha branch also contains three newly accepted ingress/lifecycle capabilities awaiting
final packaged validation: a disk-backed project tab strip with the shared unsaved-work guard,
native `.xls`/`.xlsx`/`.xlsm`/`.xlsb` worksheet import through a bounded Rust adapter, and a
strictly allowlisted Cloudflare Workers/D1 telemetry collector. The collector is fail-closed and is
not a production service until its account, endpoint, public ingestion key, CSP/CORS origins,
privacy contact and deployment region are approved and configured. See ADR 0055.

The telemetry release preflight rejects a placeholder D1 ID, non-exact/non-HTTPS endpoints,
wildcard or incomplete native-origin CORS, invalid public ingestion keys, invalid retention, and a
missing privacy contact. Its generated Tauri overlay contains only the approved endpoint origin and
never the key or contact. Collector regression coverage includes exact CORS preflight, schema/key
rejection, request-size and daily-volume limits, research-data-free storage, and scheduled expiry.

The native workbook regression includes a real two-sheet `.xlsx` fixture with internal blanks,
formulas, dates, decimals, negative values and Japanese labels. Legacy `.xls` remains part of the
packaged manual gate because no trustworthy `.xls` authoring runtime is bundled in the Windows
development environment.

## Known bounded gaps

- True blocked/partial multi-factor matching and canonical per-unit date provenance.
- Production-default approval and compatibility-workflow removal.
- Multi-section input for heterogeneous readout grains.
- Human-facing source-history provenance presentation.
- Renderer/performance follow-up, including route-level code splitting.
- The named master product and UX specification files are absent from the repository.

## Working-tree rule

The working tree contains substantial ongoing implementation and documentation changes. Always run
`git status --short` before editing, preserve unrelated changes, and do not use historical test
totals as current proof. Validate the narrow affected surface, then expand checks according to risk.

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

The Graph-only production path now uses separate Data, Graph, and Statistics tabs and the same
full `ExperimentGraphWorkbench` used by experiment-first projects. Source/sample ID has a separate
mapping and is never used as a legend series; a column with one unique value per row is blocked from
the series channel unless the researcher explicitly confirms that intention. The saved unresolved
GraphSpec retains full editor presentation but still contains no ExperimentDesign or analysis
request. Matching Excel worksheets may also be explicitly stacked with worksheet names retained in
an `Experiment / worksheet` source column; this does not by itself declare biological replication.
Windows Graph clipboard output now publishes both PNG and standard CF_DIB image formats for broader
consumer interoperability.

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
24 passing Rust native tests (plus one development-environment round trip ignored in the ordinary
run), and a real Rust→Python engine round trip. The current Windows x64 NSIS candidate includes the
BioFigureStat identity, project tabs, native Excel import, and the deployed telemetry collector
client. It was built on 2026-08-30 from implementation commit `4dabbe5` with SHA-256
`67FFEBF3489804BA68C77ADAF90E26C8EB7FC69A72856103EA9666F7D74D685C`; Windows bundle verification,
the packaged Python-sidecar smoke, and the telemetry release preflight passed. Node 26 test environments install an explicit in-memory Storage for
each isolated jsdom window rather than reading Node's unavailable or process-level localStorage.
The macOS native candidate must also be rebuilt from the current branch before the next native
human gate.

The highest-value remaining evidence is:

- first-time researcher navigation/usability through the reduced four-task gate;
- clean-machine native Statistics, PNG clipboard/export, and save/reopen identity/lineage validation;
- macOS and Windows packaging/smoke/signing/migration checks;
- real assistive-technology and localization validation;
- packaged-native telemetry lifecycle validation and the feedback-form provider/notice decision;
- lifecycle validation for the remaining bounded semantic gaps.

External-LLM assistance remains a manual, user-controlled boundary. The application can create a
measurement-free consultation prompt and can turn a deliberately pasted answer plus the
researcher's own requested change into a reviewable implementation-request copy. It does not send,
execute, or treat the external answer as product authority.

Browser review does not close native gates. Automated semantic tests do not establish human
navigation success.

The user-supplied Claude browser review dated 2026-08-30 reports no new P0. Its sole proposed P1
(Backspace did not clear a wide-grid cell) was subsequently withdrawn by the reviewer after they
confirmed that synthetic key events in the review environment did not perform native editing; a
real input event cleared both views correctly. The revised external verdict is therefore no new
P0/P1 and browser UX suitable for an Alpha candidate, while authoritative native Statistics and
save/reopen remain separate gates. See
`docs/alpha/external-reviews/CLAUDE_PUBLIC_ALPHA_UX_TRIAGE_2026-08-30.md`.

A subsequent external robustness review identified three Alpha-boundary risks that are now closed
in code: project-state compatibility has a compile-time-complete known-version fixture matrix and
typed user-facing failures; native analysis is bounded to 120 seconds and supports request-scoped
cancel; and numerical-library reliability warnings from successful runs are retained in the
canonical result. Project-open UI paths translate compatibility failures without exposing Zod or
internal project codes. Current regression evidence for this change is 1,086 UI tests across 123
files, 65 project-package tests across 9 files, 64 Python-engine tests, and 28 passing Rust native
tests. The normally ignored pinned-development-engine Rust→Python round trip was also run explicitly
and passed. Packaged
timeout/cancel and project-version messages still require the cross-platform native smoke below.

The current Alpha branch also contains four newly accepted ingress/lifecycle capabilities awaiting
final packaged validation: a disk-backed project tab strip with the shared unsaved-work guard,
native `.xls`/`.xlsx`/`.xlsm`/`.xlsb` worksheet import through a bounded Rust adapter, and a
strictly allowlisted Cloudflare Workers/D1 telemetry collector. The collector is now deployed at
`https://biofigurestat-telemetry.biofigurestat.workers.dev/v1/usage`; deployment smoke confirmed
health, rejection of an unapproved origin, accepted synthetic ingestion, APAC/NRT D1 persistence,
and 90-day expiry. The telemetry-enabled Windows bundle uses an exact-origin CSP and shows the
privacy/deletion contact in the consent and About surfaces. Packaged native opt-in/opt-out and
scheduled-expiry operation still require release validation. See ADR 0055.

The same Worker now exposes the separately keyed `/v1/problem-reports` endpoint backed by separate
D1 report and append-only status-history tables. The app requires an outbound preview and explicit
send for every report, never supports files/screenshots/project attachment, and includes a smaller
closed privacy-reduced diagnostic only when selected. Deployment smoke verified `201` plus an
opaque report ID, APAC/NRT persistence, AES-GCM reply-contact ciphertext with no plaintext match,
and cleanup of the exact synthetic row. Reports expire after 90 days. Cloudflare Access team/audience
configuration is not available in the current account session, so `/admin` and `/v1/admin/*` are
deliberately fail-closed until that release gate is configured. See ADR 0056.

The report-enabled Windows x64 NSIS candidate was built from `ec95128` with build revision
`ec95128-alpha.20260830.report1`. The installer is 47,794,362 bytes with SHA-256
`617BF0F3A29610C6B3511B527AA52CFDB0330CEE8DE157B22D741994E79F3109`. Windows bundle verification,
the packaged sidecar smoke, release forbidden-string verification, and release preflight passed.
The public report key compiled into that candidate received a synthetic report as `new` in APAC/NRT
D1 and returned an opaque report ID; the exact synthetic report and history row were then deleted.
The old report key remains valid during the bounded `REPORT_INGEST_KEY_NEXT` rollout window.

The telemetry release preflight rejects a placeholder D1 ID, non-exact/non-HTTPS endpoints,
wildcard or incomplete native-origin CORS, invalid public ingestion keys, invalid retention, and a
missing privacy contact. Its generated Tauri overlay contains only the approved endpoint origin and
never the key or contact. Collector regression coverage includes exact CORS preflight, schema/key
rejection, request-size and daily-volume limits, research-data-free storage, and scheduled expiry.
The preflight now also requires the exact same-origin problem-report endpoint and separate public
report key.

The native workbook regression includes a real two-sheet `.xlsx` fixture with internal blanks,
formulas, dates, decimals, negative values and Japanese labels, plus an attributed MIT-licensed
legacy BIFF `.xls` fixture from Calamine's official test corpus. Real researcher workbooks remain
part of the packaged macOS/Windows manual gate.

## Known bounded gaps

- True blocked/partial multi-factor matching and canonical per-unit date provenance.
- Production-default approval and compatibility-workflow removal.
- Multi-section input for heterogeneous readout grains.
- Human-facing source-history provenance presentation.
- Renderer/performance follow-up, including route-level code splitting.
- Centralize researcher-facing terminology and messages before any English/localization work;
  do not use mechanical JSX string replacement for statistical or biological terms.
- The named master product and UX specification files are absent from the repository.

## Working-tree rule

The working tree contains substantial ongoing implementation and documentation changes. Always run
`git status --short` before editing, preserve unrelated changes, and do not use historical test
totals as current proof. Validate the narrow affected surface, then expand checks according to risk.

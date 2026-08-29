# Current Working State

Updated: 2026-08-30

This is the short operational snapshot. It is not a replacement for accepted ADRs, method
references, schemas, or test evidence.

## Product phase

The application is a local-first, experiment-first Alpha candidate undergoing native hardening. The
2026-08-30 macOS gate passed canonical integrity, matched/nested semantics, specialist routes, and
native export, but found a release-blocking application-menu Quit path that discarded unsaved work.
The fix is implemented in `9e1f68c` and awaits rebuilt macOS native revalidation. The task-oriented
entry hub and adaptive experiment path remain the intended default; the older compatibility path is
not the intended product route. Public distribution is not approved.

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
is reduced to the four composite tasks recorded there. Current automated evidence includes 1,080 UI
tests, 290 semantic-package tests, 190 experiment-first prototype tests, 63 Python-engine tests,
19 passing Rust native tests (plus one development-environment round trip ignored in the ordinary
run), and a real Rust→Python engine round trip. The recorded Windows x64 NSIS candidate predates the
native Quit fix and must be rebuilt before distribution. That earlier candidate contained
the progressive experiment-entry, canonical-value integrity, and current bounded UX changes was
built on 2026-08-29 with SHA-256
`A41033350B86F9E9D7E7108AC259D9BEFB5654EC456ADC25A582D2215582BD19` and build revision
`13c68e6-alpha.20260829.6`. Node 26 test environments now install an explicit in-memory Storage for
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

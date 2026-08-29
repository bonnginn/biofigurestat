# Current Working State

Updated: 2026-08-29

This is the short operational snapshot. It is not a replacement for accepted ADRs, method
references, schemas, or test evidence.

## Product phase

The application is a local-first, experiment-first Alpha candidate ready for a reduced targeted
researcher revalidation. The task-oriented entry hub and adaptive experiment path are the active
production candidate; the older compatibility path remains in code but is not the intended default.
Public distribution is not yet approved because clean-machine, signing, accessibility, telemetry/
feedback-provider, and final product-identity decisions remain external human gates.

The dated engineering evidence and public-distribution blockers are recorded in
`docs/alpha/ALPHA_CANDIDATE_READINESS_2026-08-29.md`.

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
is reduced to the four composite tasks recorded there. Current automated evidence includes 1,075 UI
tests, 290 semantic-package tests, 190 experiment-first prototype tests, 63 Python-engine tests,
Rust native tests, and a real Rust→Python engine round trip. A Windows x64 NSIS candidate containing
the progressive experiment-entry and canonical-value integrity changes was built on 2026-08-29
with SHA-256 `037F8DE573651B709BBE9BD27498C0BBCA07561C213D2534F7AFC8E8E078BF5B`.
The macOS native candidate
must still be rebuilt from the current branch before the next native human gate.

The highest-value remaining evidence is:

- first-time researcher navigation/usability through the reduced four-task gate;
- clean-machine native Statistics, PNG clipboard/export, and save/reopen identity/lineage validation;
- macOS and Windows packaging/smoke/signing/migration checks;
- real assistive-technology and localization validation;
- provider/notice decisions for opt-in remote telemetry and the feedback form;
- lifecycle validation for the remaining bounded semantic gaps.

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

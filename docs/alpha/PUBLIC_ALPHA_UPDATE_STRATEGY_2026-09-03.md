# Public Alpha update strategy

Updated: 2026-09-03 (JST)

## Recommendation

Publish `v0.1.0-alpha.3` as a maintenance Public Alpha after the current Graph and data-entry batch
has one complete Windows and macOS release-candidate gate. Do not wait for every planned Beta
feature, and do not publish each source increment separately.

The appropriate boundary is evidence-based rather than calendar-based. The candidate should
include the fixes and bounded improvements already exercised during real use:

- sparse-row entry and explicit experiment-session/date provenance;
- lexical numeric precision and spreadsheet navigation corrections;
- more than four independent conditions and the optimized exact Games–Howell path;
- independent and paired continuous TOST, with unsupported equivalence designs still stopping
  safely;
- Graph-only workflow compaction and the reviewed Bar outline controls;
- the shared Graph appearance-control foundation, without a persistence-schema change.

Broader Excel workflows, panel composition beyond the current bounded export, and further
Prism-level appearance expansion are Beta work. They should not delay a maintenance Alpha unless
they are already part of the candidate and have equivalent evidence.

The Alpha 3 scope is frozen in `ALPHA3_SCOPE_FREEZE_2026-09-03.md`. Mixed-effects models and
estimation plots are explicitly excluded. The existing independent and paired TOST routes do not
depend on either: TOST conclusions remain based on the prespecified margin, two one-sided tests,
and the corresponding 90% confidence interval.

## Go criteria

Create the release candidate only from a clean, explicitly recorded commit. Publish only when all
of the following are true:

1. Focused tests pass for each changed responsibility, followed by one milestone package/full UI
   gate, workspace typecheck, lint, and production build.
2. Engine smoke and frozen reference checks pass for Welch/paired TOST and multi-condition
   Games–Howell. Expected scientific values and fixtures are not adjusted to make the gate pass.
3. Bundle and release verifiers pass with zero forbidden evaluation markers.
4. Windows and macOS artifacts are built from the same source authority and their build revisions,
   architectures, sizes, and SHA-256 digests are recorded.
5. The executable native verifier passes where the host permits automation. A documented
   infrastructure block may be replaced only by the equivalent bounded human check; it must not be
   recorded as an automated pass.
6. Representative Public Alpha `.lsa` files reopen with Data, saved Graphs, analysis linkage, raw
   lineage, experimental-unit identity, pairing, censoring, and ordered X/Y identity intact.
7. Save/reopen and SVG/PNG/CSV exports agree with the visible canonical values. Japanese and
   English surfaces pass the residue gate.
8. Release notes clearly distinguish fixes, added Alpha capabilities, known limitations, and the
   fact that this remains a Pre-release.

## No-go criteria

Do not publish when there is an unexplained product failure, a dirty working tree, mismatched source
authority between artifacts, an unresolved save/migration failure, an engine/reference mismatch,
or an unreviewed change to scientific semantics. Do not relabel an infrastructure block as a
product pass. Preserve `alpha.2`; upload `alpha.3` as a new release rather than replacing its
assets.

## Timing

The next practical release window is the first session after the current source batch has been
reviewed visually on Windows and the same commit has produced a verified Apple Silicon bundle.
One short period of ordinary experimental use is useful for finding workflow regressions, but a
fixed waiting period is not required. If a crash, data-loss risk, incorrect calculation, or broken
`.lsa` reopen is found first, cut a narrower Alpha maintenance update after its two-platform gate
instead of waiting for appearance work.

Beta naming remains a separate decision. Use Beta when the intended Beta capability set is coherent
and has accumulated real-use evidence; do not infer Beta readiness merely because `alpha.3` passes
its release gate.

# BioFigureStat v0.1.0-alpha.3 scope freeze

Updated: 2026-09-03 (JST)

## Source authority

- Release repository: `https://github.com/bonnginn/biofigurestat.git`
- Candidate branch: `codex/alpha3-candidate-20260903`
- Published baseline: tag `v0.1.0-alpha.2`
- Frozen product-code anchor: `5ba1a9247e2c7a44209e1cd1cc40ab1b36149165`
- Candidate-preparation base: `2d2fc001dec7556fdfccc61b920a2078abe07840`
- Application version: `0.1.0`
- Analysis engine version: `0.15.0`
- Highest accepted analysis protocol in this candidate: `0.16.0`

Windows and Apple Silicon macOS artifacts are to be built directly from the same final commit in
this public repository. The older private development repository is not an Alpha 3 build authority.
No sealed evaluation data, historical benchmark output, or private corpus is copied into this
repository or release bundle.

The exact final candidate commit, build revision, build date, filenames, sizes, architectures,
signing states, and SHA-256 digests remain unset until the source gate passes. A documentation-only
commit after the product-code anchor is allowed, but both platforms must use the same resulting
final commit.

## Included product scope

Alpha 3 is a maintenance Public Alpha. It contains the already-integrated work between the
`v0.1.0-alpha.2` baseline and the frozen product-code anchor; it does not accept further unrelated
features during candidate validation.

### Data entry and persistence

- Preserve sparse and out-of-order worksheet rows, stable experimental-unit/session identity, and
  explicit experiment-date provenance without inferring pairing from row or date.
- Preserve entered lexical numeric text such as `1.00` while the corresponding canonical numeric
  value remains the authority for analysis and export.
- Use the reviewed Arrow, Enter, Shift+Enter, Tab, undo, and redo spreadsheet behavior.
- Permit more than four simple independent-group conditions.
- Reject condition names that collide after trimming and NFKC Unicode normalization, and normalize
  the initial row count to the displayed 1–100 integer.
- Retain backward-compatible `.lsa` save/open, immutable raw revisions, mapping, and source lineage.

### Statistics

- Independent continuous Welch TOST with a prespecified raw-difference equivalence margin.
- Paired continuous TOST using complete explicit pairs, with incomplete pair IDs retained and
  reported.
- Exact multi-condition Games–Howell calculation without duplicate matrix work or numerical
  approximation.
- Existing supported analyses and safe-stop boundaries remain unchanged.

### Graph and workflow

- Compact Graph-only workflow and initial Graph selection.
- Shared Graph appearance controls, including reviewed Bar fill and outline controls.
- Existing Graph SVG/PNG/CSV/clipboard behavior and saved-presentation compatibility.
- Bilingual Japanese/English workflow and deterministic English-residue gate.
- Constrained Excel range/header/multi-file import, bundled workbook template, and five-minute guide.
- Self-contained collaborator review HTML and bounded saved-Graph panel SVG export.
- Native regression-harness hardening and installed `.lsa` association checks.

## Explicitly excluded from Alpha 3

- Mixed-effects models, GLMMs, and any partial implementation of random-effects inference.
- Estimation-plot or Gardner–Altman Graph presentation.
- Further Prism-level appearance expansion beyond controls already in the frozen source.
- New statistical methods, new persistence-schema versions, and new migration behavior.
- Broader Excel automation, arbitrary workbook transformation, and editable panel composition.
- Cox regression, competing-risk inference, and general multi-curve dose-response comparison.

Mixed-effects models and estimation plots remain Beta candidates. Their absence does not block the
existing independent or paired TOST result: equivalence is decided from the prespecified margin,
the two one-sided tests, and the corresponding 90% confidence interval. An estimation plot would
only add a future visualization of that result.

## Change-control rule

After this scope freeze, accept only:

1. a reproducible crash, data-loss, incorrect-calculation, save/open, or visible/canonical mismatch
   fix;
2. a release/build/verifier correction required to produce the same product on both platforms;
3. documentation that accurately records candidate evidence or a known limitation.

Every accepted code correction requires a focused regression and resets only the affected source
gate. It does not trigger repeated full or native runs before the source is frozen again.

## One-pass gate order

To avoid spending six minutes repeatedly on the same broad tests, run the candidate gate once in
this order:

1. affected focused tests;
2. analysis-contract tests, engine unit tests, reference coverage, and packaged-engine smoke;
3. UI/package tests, typecheck, and lint;
4. production build and release-bundle verification;
5. Windows artifact build, bundle verification, one native harness run, and bounded manual checks;
6. macOS artifact build from the exact same commit, bundle/signature verification, one native
   harness run where policy permits, and bounded manual checks only for an infrastructure block;
7. representative Alpha 1/Alpha 2 `.lsa` reopen and Graph/export correspondence;
8. draft asset upload and remote digest inspection without publication;
9. explicit publication approval.

The existing Alpha 1 and Alpha 2 releases and assets must not be deleted or replaced.

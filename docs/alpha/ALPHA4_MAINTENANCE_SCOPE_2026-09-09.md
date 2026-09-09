# Alpha 4 maintenance preparation

Status: local preparation, NOT a frozen source or release candidate.
Base: de71d140bae95f899c05ce8d18c516cf7a09f6e9 (published Alpha 3 product authority).
This maintenance worktree is deliberately separate from the dirty Beta development tree.
Local source commits are permitted; no tag, push, upload, publication or existing asset change.

## Included source changes

- Worksheet date editing in visible padding rows; materialize session metadata only.
- Saved parent/member labels in creation preview and Graph; equal category spacing and line clearance.
- Compact canonical matrix: unchanged font size and fields, reduced row/cell dimensions.
- CLI ArithmeticError containment and atomic serialization failure response. No new statistical
  method, tolerance change, p-value substitution or data-dependent equivalence margin.
- Generic process failures no longer described as nonlinear-fit nonconvergence.
- IME composition does not trigger spreadsheet focus movement.
- Invalid p values cannot produce stars or n.s.

Only the p-symbol safety guard was ported from graphValueFormatting; its Beta numeric-formatting
dependency was deliberately excluded. General Graph semantic-readiness changes were not ported.
Prism, new recovery/persistence features, broader workflow and architecture changes are excluded.
Existing Alpha statistical protocol and schema versions remain unchanged at this checkpoint.
Maintenance identity: application 0.1.0, distribution 0.1.0-alpha.4, engine 0.15.1, MIT License.
The engine patch version identifies CLI safety fixes; numerical formulas and protocol versions
are unchanged. Python distribution metadata is aligned with runtime and About, guarded by a test.

## Evidence from this worktree

### 2026-09-10 update-preparation gate

- After engine identity alignment: engine82 PASS; About/date/hierarchy9 PASS. The preceding
  sidecar evidence identifies engine0.15.0 and must not be reused as evidence for the 0.15.1 build.
  The current engine0.15.1 review sidecar is being rebuilt before Windows packaging.

- All workspace TypeScript checks PASS; engine unit suite freshly rerun: 81/81 PASS.
- Production UI build PASS (401 modules, adaptive input enabled); release bundle verifier PASS.
- Full UI ESLint initially rejected one inline import type in ExperimentWorkspace; changed to
  an explicit type import. Full UI ESLint then PASS. No runtime behavior change in this correction.
- Frozen numerical reference coverage: 18/18 present; comparison: 17 PASS, D17 FAIL.
  Example: parameter standard error 0.018892864721244126 vs 0.01889286476386854.
  This reproduces the recorded D17 discrepancy. D17 implementation is unchanged from the Alpha 3
  base (only cli.py and its tests differ under engine/python). No reference/tolerance change.
- Full workspace test run: non-UI packages PASS (296 tests). UI: 1411 PASS / 1 FAIL, 214 files.
  The one failure expected the former long date header with the note inside it. Updated the
  production-path assertion to the approved short header and the date input's external accessible
  description. That complete regression file then passed 14/14. The full suite was not repeated
  after this test-only correction; do not describe the original full run as all-green.
- Release-candidate packaging/freeze is held at the numerical gate. Native artifacts are not rebuilt.
- Follow-up diagnostic: immutable Alpha 3 CLI loaded from Git, with every other engine module
  verified unchanged, produces exactly the same result as maintenance on all 18 frozen requests
  on this Windows host (excluding completedAt). Alpha 3 itself has the same 24 D17 field differences
  from the Mac reference. This proves no new numerical regression in those cases, not the cause
  of the cross-platform discrepancy and not an override of the frozen reference gate.
- Subsequently built a LOCAL TEST sidecar (not a frozen release artifact) from this worktree.
  Pinned interpreter/dependencies borrowed from staging; explicit maintenance PYTHONPATH and
  PyInstaller Analysis-00.toc confirm maintenance CLI/D17 sources. All 18 sidecar smoke cases PASS.
  The exact sidecar also passes all four constant-rank cases via LSAA_CLI_TEST_EXECUTABLE.
  Executable SHA256: FB78F3959E2CD729D44D540BE6DDDA749021B4E8CC2410164C858F0BF047D7F6.
  No Tauri installer or Mac artifact has been built from this maintenance source.
- Added grouped proportion-count header regression: 12-column parent span, 16 when explicit IDs
  are shown, independent grouping, dates and all six derived percentages retained. Hierarchy suite
  freshly passes 5/5. Native layout/export acceptance is still separate.
- Bilingual notes prepared in RELEASE_NOTES_0.1.0-alpha.4-DRAFT.md; no remote release operation.

- Relevant UI: 54/54 (five files); worksheet, date roundtrip, hierarchy, IME, client errors.
- Engine: 81/81, including four real subprocess constant-rank scenarios and injected non-finite/
  arithmetic failures. Borrowed the pinned Windows interpreter from the development repository,
  explicitly set PYTHONPATH to THIS worktree, and checked lsaa_engine.__file__ before execution.
  This is not a packaged-sidecar build/smoke result.
- UI typecheck PASS; production build PASS (401 modules before final width-only CSS adjustment).
- Focused ESLint PASS and normalized Git diff check PASS.
- Browser: actual CanonicalMatrixWorksheet with synthetic six-group scalar data. Before/after
  table widths 1777/1100.28px; first data row heights 44.19/33.39px at 1280px viewport.
  Before uses the original dimensional CSS overrides; not a screenshot of an installed old app.
  Date and all six values are visible in After. Original research data was not used.
- Review-only files and screenshot are ignored under apps/ui/.tmp/compact-review and .tmp.

## Remaining gates

User accepted the compact worksheet and merged parent headers and authorized isolated Alpha
update preparation. Broader workspace-first UX is future work: maximize editable table/graph area,
reduce surrounding system typography and redundant text, use recognizable accessible icons,
and verify ordinary-window fit. Do not expand this maintenance release into a global redesign.
Publication and uploads still require explicit approval.

Latest review: one-factor sheets now show saved grouped-category parents in merged column headers;
standalone categories span the parent/child header rows. Saved conditionBlocks are passed through
the production worksheet adapter; no label splitting, scientific grouping or persisted schema change.
Missing/ambiguous metadata and multifactor sheets retain their existing headers. Related UI35 PASS,
typecheck and synthetic browser preview checked. Screenshot path remains compact-short-header.png.

September 9 visual follow-up: visible date header is now 実験日* / Experiment date*.
Shared-row/date semantics are retained as one note outside the table, referenced by date inputs'
aria-describedby. Import header aliases and date persistence are unchanged. Independent row-number
columns use a narrower width; matched-ID columns retain their previous width. Table frame fits the
content. Browser synthetic six-group width is now 840.28px. Relevant UI34 and typecheck PASS;
native executable not rebuilt. Latest screenshot: .tmp/compact-short-header.png.

- Compact visual proposal accepted; typed-count/long-label/zoom and keyboard/IME validation remains.
- Complete maintenance-source UI/package gate; exact sidecar build and reference comparison.
- Same-source Windows/Mac packaging and native save/reopen, Graph/SVG/PNG verification.
- Preserve existing .lsa files; do not equate schema tests with native compatibility acceptance.
- Review inherited D17 discrepancy independently; do not alter references/tolerances to pass.
- Clean source commit, identities/versions, bilingual notes and limitation review.
- Explicit approval for upload/draft operations, and separate explicit publication approval.

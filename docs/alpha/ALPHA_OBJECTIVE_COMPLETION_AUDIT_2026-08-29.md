# Alpha Objective Completion Audit — 2026-08-29

## Scope

Audit the active engineering objective against current repository, test, build,
and artifact evidence:

1. safely organize and push the intended changes;
2. establish an executable macOS handoff;
3. mature Graph-only, preview, specialist/common workflow, and UI/UX to an
   Alpha engineering candidate;
4. provide regression evidence and a short final human gate.

This audit does not convert browser evidence into native evidence and does not
approve public distribution.

## Requirement evidence

| Requirement | Current evidence | Status |
| --- | --- | --- |
| Safe Git organization | Branch `codex/native-hardening-2026-08-28`; remote and local HEAD matched at `2dad827` when handoff was prepared; intended product, evidence, and handoff changes were committed explicitly; unrelated historical/evaluation untracked material was not added | Proven |
| Canonical worksheet integrity | `417c024`; visible DOM value committed on blur; sequential Tab, focus/blur, overwrite, decimal, paste, view switching, Graph, and save/rehydration regressions; ordinary browser reproduction retained `97`, `60`, `101.5`, `55` exactly | Proven by automated and browser evidence; native repetition remains in Task 1 |
| Graph-only data boundary | `GraphOnlyVisualizationPage.test.tsx` covers direct entry, CSV, rectangular editing, explicit mapping, numeric X, Graph history, raw lineage, save/open, wrong-intent refusal, Statistics promotion, and unsaved lifecycle | Proven for deterministic UI/project behavior |
| Graph-only presentation | `GraphOnlyDescriptiveWorkbench` uses `GraphWorkspaceFrame`; title, axes, series labels, palette, point/line presentation, export controls, and persisted Graph revisions are covered | Proven by component/workflow evidence; native clipboard/export remains a human gate |
| Browser preview boundary | Browser preview is explicitly labeled and does not pretend to provide native engine or project persistence. Dedicated-entry tests keep descriptive Graph available while unavailable native bridges are explained | Proven |
| Survival common workflow | `SpecializedCorePage` exposes the project workspace navigation and `GraphWorkspaceFrame`; tests cover typed event/censor data, CSV lineage, observed Graph before Statistics, D11, display precision, full-precision persistence, save/reopen, unsupported safe-stop, and button-adjacent reasons for unavailable Statistics | Proven for implemented workflow; native sidecar/export remains in Task 3 |
| Ordered X/Y and enzyme workflow | `CommonCoveragePage` exposes the same workspace tabs and `GraphWorkspaceFrame`; tests cover observed Graph, deliberate model selection, safe-stops, CSV/clipboard lineage, exact reopen, D17 execution, enzyme fit, and save/open | Proven for implemented workflow; native sidecar/export remains in Task 3 |
| Shared Graph layout | `GraphWorkspaceFrame` keeps the inspector available in side-by-side mode and moves it below the expanded Graph without hiding settings | Proven by component test and prior browser QA |
| Researcher-facing entry | Biological questions, live summary, adaptive surface selection, identity/nesting/matching propagation, and safe stops are covered by the production-path and semantic suites. External review supports the direction but does not freeze wording | Engineering evidence complete; first-time human navigation remains external evidence |
| Native Windows candidate | Build revision `13c68e6-alpha.20260829.6`; Windows bundle verifier, release-content verifier, and D01–D17 packaged sidecar smoke passed; installer SHA-256 `A41033350B86F9E9D7E7108AC259D9BEFB5654EC456ADC25A582D2215582BD19` | Engineering artifact proven; clean-machine human gate outstanding |
| macOS handoff | `MACOS_ALPHA_CANDIDATE_HANDOFF_2026-08-29.md` contains exact branch, minimum commit, build commands, verifier, signing/hash evidence fields, hard failures, and four reduced tasks. Commit `3e14935` isolates jsdom storage from Node 26 process-level localStorage, `84dc119` preserves direct X/Y mapping when values are pasted under unchanged Graph-only headers, and `13c68e6` explains disabled Survival Statistics actions without weakening safe-stop behavior | Handoff proven; `.app` build and Mac human evidence not yet available |
| Regression baseline | Full UI: 119 files / 1,079 tests, including execution with a shared Node localStorage file present; focused external-LLM request boundary: 2 files / 6 tests; typecheck, changed-file lint, production Web build, Windows bundle verification, and release-content verification passed | Proven for current Windows-side baseline |
| External-LLM improvement request | Consultation remains copy-only; deliberately pasted external advice is marked unverified, combined with the researcher's explicit requested change, and copied without automatic execution or submission | Proven by focused tests and browser interaction; feedback provider remains a human decision |
| Reduced human gate | Four tasks cover canonical integrity, matched/nested semantics, specialist routes, and lifecycle/native export; hard failures are explicit | Ready to execute |

## Input-surface disposition

- Keep the compact/wide matrix for small scalar and positive/total-count cases.
- Keep identity-aligned matrices for explicit matched/repeated structures.
- Prefer nested raw-observation and all-values surfaces for dish→Cell/ROI and
  large raw inputs.
- Do not infer a different surface's semantics from row alignment, shape, or
  convenience.
- The external review is evidence for surface preference and integrity
  hardening, not evidence to remove the wide grid or pivot the architecture.

## Remaining gates

These are missing evidence, not hidden implementation claims:

1. Apple Silicon `.app` build, macOS bundle verifier, signing identity, and
   artifact hash.
2. The four-task macOS native human result.
3. Windows clean-machine repetition of the same short native gate.
4. Public-distribution decisions for signing/notarization, product identity,
   feedback provider, telemetry operator/region/retention, published external
   LLM guide URL, and named security acceptance.

The first three close the engineering/native-human candidate. The fourth group
is required for public distribution and must not be silently treated as a code
default.

## Audit judgment

**ENGINEERING ALPHA CANDIDATE READY; NATIVE HUMAN EVIDENCE INCOMPLETE**

No further case expansion is justified before the short native gate. A hard
failure in that gate reopens only the affected generic path plus its regression
family; it does not automatically restart every historical case.

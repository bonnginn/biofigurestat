# Claude engine scenario review — evidence triage (2026-08-30)

## Evidence status

This record evaluates the external scenario review supplied by the user. The review targeted
commit `b4e8e47`; the findings were rechecked against branch
`codex/native-hardening-2026-08-28` at `301446d` before implementation. The external report is
supporting evidence, not statistical or product authority.

The referenced `review/engine-scenario-harness/wave2.py` was not present in the supplied files or
the repository. Compact regression cases were therefore added to the maintained engine and UI test
suites instead of importing an unavailable review harness.

## Accepted and fixed now (T1–T3)

1. **CLI output contract — confirmed.** An all-identical Mann–Whitney request previously exited 1
   after writing a truncated JSON document ending at `"pValue":`. The CLI now serializes the full
   result before writing stdout, converts unexpected execution or serialization failures to one
   generic `validation_error` document with diagnostic code `internal_engine_error`, writes internal
   details only to stderr, and exits 0 after producing valid JSON.
2. **All-identical rank tests — confirmed.** Mann–Whitney U, Kruskal–Wallis (including the Dunn
   all-pairs route), and Friedman could return non-finite values or raise an internal numerical
   exception when every analyzed value was identical. Each route now rejects exactly that pooled
   boundary with a deterministic validation message. Groupwise-constant but different groups and a
   single constant group remain accepted where the method is otherwise defined. The UI explains
   the boundary in Japanese and preserves the entered data.
3. **Generic native failure misclassified as D17 — confirmed.** The substring `failed:` in the Rust
   wrapper matched a broad nonlinear-fit rule. Every nonlinear-fit guidance rule is now scoped to a
   `D17` marker. Generic engine failures use the generic recovery message; genuine D17 convergence
   failures retain the specialized message.

## Confirmed next-fix items

These are real current behaviors, but are outside T1–T3 and should be handled in a separate change
with explicit contract decisions and regression tests.

### 1. D16 constant-outcome regression reports misleading R²

With varying X and constant Y, the current engine returned a near-zero slope, `rSquared: 1.0`, and
no warning. The code explicitly substitutes `1.0` when total corrected Y variation is zero. The
review's proposed replacement of `0.0` must not be accepted blindly: conventional R² is undefined
when the denominator is zero. The next change must decide the public contract (for example, a
documented finite sentinel plus warning, or a nullable/schema change) and keep D16/D17 behavior and
the statistical-method reference consistent.

### 2. D14 zero-cell Fisher output conflates two odds ratios

For `[[0, 10], [5, 5]]`, SciPy's Fisher statistic is `0.0`, while the reported estimate named
`odds_ratio` is the Haldane-corrected value `0.047619...`. Both are mathematically explainable but
the shared name hides the different estimands/corrections. The next change should name and document
the raw Fisher statistic and corrected interval estimate separately, then verify the UI labels.

### 3. D14 silently truncates fractional counts

The table is converted directly with `dtype=int` before integer validation. A supplied table
`[[1.9, 8.1], [5, 5]]` was analyzed as `[[1, 8], [5, 5]]`. Validate numeric finiteness,
non-negativity, and integer-valued counts before the integer conversion.

### 4. `confidenceLevel` lacks a shared range guard

Methods convert `confidenceLevel` independently and then pass it to distribution functions. There
is no common finite `0 < confidenceLevel < 1` validation boundary. Add one shared validation rule
and exercise invalid, infinite, and NaN inputs through the real CLI contract.

## Requires measurement or design before classification

The review reports slow Games–Howell confidence intervals as group count grows. The implementation
does ask SciPy to construct the full Tukey/Games–Howell result and confidence interval before
selecting requested pairs, so the performance concern is plausible. However, the external timing
harness was unavailable and no incorrect statistical result was demonstrated. Reproduce native
timings with bounded 4-, 6-, and 8-group fixtures before choosing caching, lazy intervals, a worker
budget, or a documented limit. This remains a performance investigation, not a confirmed
correctness defect.

## Regression evidence added for T1–T3

- Unit-level CLI fallback tests for unexpected exceptions and non-finite serialization.
- Real subprocess CLI tests for all-identical Mann–Whitney, Kruskal–Wallis with Dunn intent, and
  Friedman: exit 0 and exactly one parseable validation JSON document.
- Method tests proving the narrow all-identical rejection boundary and retaining valid
  groupwise-constant/one-constant-group inputs.
- Japanese validation-feedback tests for all three rank tests.
- Error-routing tests for generic Rust wrapper text, unrelated `flat` text, and genuine D17 fit
  failure text.

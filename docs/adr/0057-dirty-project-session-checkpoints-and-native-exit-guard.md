# ADR 0057 — Dirty project session checkpoints and native exit guard

Date: 2026-08-30
Status: Accepted pending macOS human revalidation

## Context

ADR 0055 introduced a disk-backed project tab strip. The macOS Alpha gate showed that requiring the
shared Save / Discard / Cancel guard for every Home, New, Open, or tab-selection action made ordinary
multi-project work unsafe and slow: researchers either had to save prematurely or dismiss a dialog
that did not correspond to closing anything. The same gate found that Command+Q could bypass the
guard because a native exit code was incorrectly treated as proof that the UI had approved exit.

## Decision

An already-saved project may keep one validated, in-memory session checkpoint while its tab remains
open. Home, New, Open, and selection of another project first create that checkpoint and then move
without a save dialog. A checkpoint uses the same parsed project-state contracts as disk save and is
never a second persistence format. It is process-local, is not recovery after a crash, and is removed
after successful save, explicit discard, or tab close.

The Save / Cancel / discard guard is shown only when a dirty tab, window, or application is actually
closed. Closing a dirty inactive tab first activates that tab so the user can see the exact project
covered by the decision. Cancel retains its checkpoint and active state. Save closes only after the
atomic project save succeeds. A closed target is immediately eligible for Open again.

Native process exit is authorized by a one-shot Rust state set only by the guarded
`exit_application` command. Exit codes, including the code supplied by Command+Q on macOS, are not
authorization. Every unapproved `ExitRequested` event is prevented and forwarded to the shared UI
guard.

## Consequences

- ADR 0055's statement that every dirty tab switch must show the guard is superseded.
- Scientific identity, biological `n`, pairing, nesting, censoring, ordered coordinates, raw
  observations, Graph state, and Statistics results remain inside their existing project contracts.
- Session checkpoints improve same-process multi-project workflow but do not replace atomic `.lsa`
  save or crash recovery.
- Home, New, and Open no longer imply discard; actual close and application exit remain explicit.
- macOS Command+Q, menu Quit, window close, and Dock/OS exit still require native human validation.

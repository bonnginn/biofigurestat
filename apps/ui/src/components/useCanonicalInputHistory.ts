import { useEffect, useRef, useState } from "react";
import type { CanonicalAdaptiveObservation } from "@lsaa/domain";
import { pruneNumericDisplayTexts } from "../app/canonicalNumericPresentation";

type Records = readonly CanonicalAdaptiveObservation[];
type DisplayTexts = Readonly<Record<string, string>>;
type Snapshot = Readonly<{ records: Records; displayTexts: DisplayTexts }>;
const fingerprint = (records: Records, displayTexts: DisplayTexts = {}) =>
  JSON.stringify({
    records,
    displayTexts: Object.fromEntries(
      Object.entries(displayTexts).sort(([a], [b]) => a.localeCompare(b)),
    ),
  });

// Session-only edits. An external import/load or scientific context change starts
// a new history, so Undo cannot restore records under a different mapping/design.
export function useCanonicalInputHistory(
  records: Records,
  context: string,
  publish: (next: Records) => void,
  enabled: boolean,
  lexical?: Readonly<{ value: DisplayTexts; publish: (next: DisplayTexts) => void }>,
) {
  const displayTexts = lexical?.value ?? {};
  const snapshot: Snapshot = { records, displayTexts };
  const history = useRef({
    current: fingerprint(records, displayTexts),
    context,
    past: [] as Snapshot[],
    future: [] as Snapshot[],
  });
  const [, refresh] = useState(0);
  const current = fingerprint(records, displayTexts);
  const synchronized = history.current.current === current && history.current.context === context;
  const reset = () => {
    history.current = { current, context, past: [], future: [] };
    refresh((n) => n + 1);
  };
  useEffect(() => {
    if (!synchronized || !enabled) {
      history.current = { current, context, past: [], future: [] };
      // Undo history is session-only. Presentation keyed by observation/value
      // survives view/context changes; the cell checks exact numeric agreement.
      refresh((n) => n + 1);
    }
  }, [current, context, enabled, synchronized]);
  const commit = (next: Records, nextTexts: DisplayTexts = displayTexts) => {
    nextTexts = pruneNumericDisplayTexts(next, nextTexts);
    if (!enabled || fingerprint(next, nextTexts) === current) return;
    // Text-only edits do not change raw measurements or invalidate analysis.
    if (JSON.stringify(next) !== JSON.stringify(records)) publish(next);
    lexical?.publish(nextTexts);
    const past = synchronized ? history.current.past : [];
    history.current = {
      current: fingerprint(next, nextTexts),
      context,
      past: [...past, structuredClone(snapshot)].slice(-40),
      future: [],
    };
    refresh((n) => n + 1);
  };
  const move = (direction: "undo" | "redo") => {
    if (!enabled || !synchronized) return;
    const state = history.current;
    const from = direction === "undo" ? state.past : state.future;
    const next = from.at(-1);
    if (!next) return;
    if (JSON.stringify(next.records) !== JSON.stringify(records))
      publish(structuredClone(next.records));
    lexical?.publish(structuredClone(next.displayTexts));
    history.current = {
      current: fingerprint(next.records, next.displayTexts),
      context,
      past:
        direction === "undo"
          ? state.past.slice(0, -1)
          : [...state.past, structuredClone(snapshot)].slice(-40),
      future:
        direction === "undo"
          ? [...state.future, structuredClone(snapshot)].slice(-40)
          : state.future.slice(0, -1),
    };
    refresh((n) => n + 1);
  };
  return {
    commit,
    reset,
    undo: () => move("undo"),
    redo: () => move("redo"),
    canUndo: enabled && synchronized && history.current.past.length > 0,
    canRedo: enabled && synchronized && history.current.future.length > 0,
  };
}

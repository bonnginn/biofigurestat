import { useEffect, useRef } from "react";

const DEFAULT_HISTORY_LIMIT = 100;

type HistoryPublication<Metadata> =
  | Readonly<{ kind: "commit"; metadata: Metadata }>
  | Readonly<{ kind: "undo" | "redo" }>;

/**
 * Bounded undo/redo for a controlled spreadsheet value.
 *
 * Updates not published through this instance are treated as an external
 * replacement (for example file import or project reopen) and clear history.
 */
export function useControlledSpreadsheetHistory<Value, Metadata = undefined>({
  value,
  publish,
  limit = DEFAULT_HISTORY_LIMIT,
}: Readonly<{
  value: Value;
  publish: (next: Value, publication: HistoryPublication<Metadata>) => void;
  limit?: number;
}>) {
  const undoStackRef = useRef<readonly Value[]>([]);
  const redoStackRef = useRef<readonly Value[]>([]);
  const expectedUpdateRef = useRef<Value | null>(null);
  const previousValueRef = useRef(value);

  const publishExpected = (next: Value, publication: HistoryPublication<Metadata>) => {
    expectedUpdateRef.current = next;
    publish(next, publication);
  };

  useEffect(() => {
    if (Object.is(previousValueRef.current, value)) return;
    if (Object.is(expectedUpdateRef.current, value)) {
      expectedUpdateRef.current = null;
    } else {
      undoStackRef.current = [];
      redoStackRef.current = [];
    }
    previousValueRef.current = value;
  }, [value]);

  return {
    commit(next: Value, metadata: Metadata): boolean {
      if (Object.is(next, value)) return false;
      undoStackRef.current = [...undoStackRef.current.slice(-(limit - 1)), value];
      redoStackRef.current = [];
      publishExpected(next, { kind: "commit", metadata });
      return true;
    },
    undo(): boolean {
      const previous = undoStackRef.current.at(-1);
      if (previous === undefined) return false;
      undoStackRef.current = undoStackRef.current.slice(0, -1);
      redoStackRef.current = [...redoStackRef.current, value];
      publishExpected(previous, { kind: "undo" });
      return true;
    },
    redo(): boolean {
      const next = redoStackRef.current.at(-1);
      if (next === undefined) return false;
      redoStackRef.current = redoStackRef.current.slice(0, -1);
      undoStackRef.current = [...undoStackRef.current, value];
      publishExpected(next, { kind: "redo" });
      return true;
    },
  } as const;
}

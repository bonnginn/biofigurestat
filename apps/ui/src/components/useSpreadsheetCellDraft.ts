import { useEffect, useRef, useState } from "react";

type SpreadsheetCellDraftOptions = Readonly<{
  preserveDirtyOnCanonicalChange?: boolean;
}>;

/**
 * Keeps the text visible in an editor synchronized with its canonical value.
 * Parsing and scientific validation deliberately remain with the owning cell.
 */
export function useSpreadsheetCellDraft(
  canonicalText: string,
  options: SpreadsheetCellDraftOptions = {},
) {
  const preserveDirtyOnCanonicalChange = options.preserveDirtyOnCanonicalChange ?? false;
  const [text, setText] = useState(canonicalText);
  const [dirty, setDirtyState] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const dirtyRef = useRef(false);

  const setDirty = (next: boolean) => {
    dirtyRef.current = next;
    setDirtyState(next);
  };

  useEffect(() => {
    if (preserveDirtyOnCanonicalChange && dirtyRef.current) return;
    setText(canonicalText);
    setDirty(false);
    setError(null);
  }, [canonicalText, preserveDirtyOnCanonicalChange]);

  return {
    text,
    dirty,
    error,
    edit(nextText: string) {
      setText(nextText);
      setDirty(true);
      setError(null);
    },
    accept(nextText?: string) {
      if (nextText !== undefined) setText(nextText);
      setDirty(false);
      setError(null);
    },
    reportError(message: string) {
      setError(message);
    },
    clearError() {
      setError(null);
    },
  } as const;
}

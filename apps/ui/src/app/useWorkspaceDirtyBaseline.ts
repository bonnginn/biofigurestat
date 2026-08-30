import { useCallback, useEffect, useMemo, useRef } from "react";

/**
 * Tracks whether an editable workspace differs from its last stable lifecycle baseline.
 *
 * Initial, restored, and programmatically-normalized state is adopted as the baseline until
 * the researcher first interacts with the page. This prevents hydration/derived-state effects
 * from creating false unsaved-work warnings while still allowing a complete revert to become
 * clean again.
 */
export function useWorkspaceDirtyBaseline(
  snapshot: unknown,
  onDirtyChange?: (dirty: boolean) => void,
) {
  const serializedSnapshot = useMemo(() => JSON.stringify(snapshot), [snapshot]);
  const latestSnapshotRef = useRef(serializedSnapshot);
  latestSnapshotRef.current = serializedSnapshot;
  const baselineRef = useRef(serializedSnapshot);
  const researcherInteractionRef = useRef(false);
  const lastReportedDirtyRef = useRef<boolean | undefined>(undefined);
  const onDirtyChangeRef = useRef(onDirtyChange);
  onDirtyChangeRef.current = onDirtyChange;

  const reportDirty = useCallback((dirty: boolean) => {
    if (lastReportedDirtyRef.current === dirty) return;
    lastReportedDirtyRef.current = dirty;
    onDirtyChangeRef.current?.(dirty);
  }, []);

  useEffect(() => {
    if (!researcherInteractionRef.current) {
      baselineRef.current = serializedSnapshot;
      reportDirty(false);
      return;
    }
    reportDirty(serializedSnapshot !== baselineRef.current);
  }, [reportDirty, serializedSnapshot]);

  const markResearcherInteraction = useCallback(() => {
    researcherInteractionRef.current = true;
  }, []);

  const adoptCurrentAsBaseline = useCallback(() => {
    baselineRef.current = latestSnapshotRef.current;
    researcherInteractionRef.current = false;
    reportDirty(false);
  }, [reportDirty]);

  return {
    adoptCurrentAsBaseline,
    interactionCaptureProps: {
      onChangeCapture: markResearcherInteraction,
      onClickCapture: markResearcherInteraction,
      onInputCapture: markResearcherInteraction,
      onPasteCapture: markResearcherInteraction,
    },
  } as const;
}

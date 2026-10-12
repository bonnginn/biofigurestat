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
  const mountedRef = useRef(true);
  const saveGenerationRef = useRef(0);
  onDirtyChangeRef.current = onDirtyChange;
  useEffect(() => {
    mountedRef.current = true;
    return () => {
      mountedRef.current = false;
      saveGenerationRef.current += 1;
    };
  }, []);

  const reportDirty = useCallback((dirty: boolean) => {
    if (!mountedRef.current) return;
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
    saveGenerationRef.current += 1;
    baselineRef.current = latestSnapshotRef.current;
    researcherInteractionRef.current = false;
    reportDirty(false);
  }, [reportDirty]);

  const captureSaveBaseline = useCallback(() => {
    const savedSnapshot = latestSnapshotRef.current;
    const generation = ++saveGenerationRef.current;
    return () => {
      if (!mountedRef.current || generation !== saveGenerationRef.current) return;
      baselineRef.current = savedSnapshot;
      researcherInteractionRef.current = true;
      reportDirty(latestSnapshotRef.current !== savedSnapshot);
    };
  }, [reportDirty]);

  return {
    adoptCurrentAsBaseline,
    captureSaveBaseline,
    interactionCaptureProps: {
      onChangeCapture: markResearcherInteraction,
      onClickCapture: markResearcherInteraction,
      onInputCapture: markResearcherInteraction,
      onPasteCapture: markResearcherInteraction,
    },
  } as const;
}

import { useEffect, useRef } from "react";
import { diagnosticFingerprint, recordDiagnosticEvent } from "../../app/diagnostics";
import type { WorkspaceGraphState } from "../../app/experimentWorkspaceProject";
import { routeFromPath } from "../../app/routes";
import { recordUsageGraphEdit } from "../../app/usageTelemetry";
import {
  changedGraphUsageCategories,
  type GraphUsageState,
} from "./experimentGraphInstrumentation";

export function useExperimentGraphDiagnosticEffects(input: Readonly<{
  benchmarkRenderedState: string;
  graphType: WorkspaceGraphState["graphType"];
  usageGraphState: GraphUsageState;
}>): void {
  const diagnosticGraphStateRef = useRef<string | null>(null);
  useEffect(() => {
    const fingerprint = diagnosticFingerprint(input.benchmarkRenderedState);
    if (diagnosticGraphStateRef.current === fingerprint) return;
    diagnosticGraphStateRef.current = fingerprint;
    recordDiagnosticEvent("graph_state_changed", {
      graphType: input.graphType,
      graphFingerprint: fingerprint,
    });
  }, [input.benchmarkRenderedState, input.graphType]);

  const usageGraphStateRef = useRef<GraphUsageState | null>(null);
  useEffect(() => {
    const previous = usageGraphStateRef.current;
    usageGraphStateRef.current = input.usageGraphState;
    if (!previous) return;
    const route = routeFromPath(window.location.pathname);
    changedGraphUsageCategories(previous, input.usageGraphState).forEach((category) =>
      recordUsageGraphEdit(route, category),
    );
  }, [input.usageGraphState]);
}

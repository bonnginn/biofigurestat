import { renderHook } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import type { GraphUsageState } from "./experimentGraphInstrumentation";
import { useExperimentGraphDiagnosticEffects } from "./useExperimentGraphDiagnosticEffects";

const recordDiagnosticEvent = vi.fn();
const recordUsageGraphEdit = vi.fn();

vi.mock("../../app/diagnostics", () => ({
  diagnosticFingerprint: (value: unknown) => `fingerprint:${String(value)}`,
  recordDiagnosticEvent: (...args: unknown[]) => recordDiagnosticEvent(...args),
}));
vi.mock("../../app/usageTelemetry", () => ({
  recordUsageGraphEdit: (...args: unknown[]) => recordUsageGraphEdit(...args),
}));

const usageState: GraphUsageState = {
  graphType: "dot",
  series: "series.1",
  axes: "axes.1",
  layers: "layers.1",
  appearance: "appearance.1",
  annotation: "annotation.1",
};

describe("Graph diagnostic effects", () => {
  beforeEach(() => {
    recordDiagnosticEvent.mockClear();
    recordUsageGraphEdit.mockClear();
    window.history.replaceState({}, "", "/experiment/graph");
  });

  it("records fingerprints once and usage edits only after the initial projection", () => {
    const { rerender } = renderHook(
      (props: {
        renderedState: string;
        graphType: GraphUsageState["graphType"];
        usageGraphState: GraphUsageState;
      }) => useExperimentGraphDiagnosticEffects(props),
      {
        initialProps: {
          renderedState: "rendered.1",
          graphType: "dot",
          usageGraphState: usageState,
        },
      },
    );

    expect(recordDiagnosticEvent).toHaveBeenCalledTimes(1);
    expect(recordUsageGraphEdit).not.toHaveBeenCalled();

    rerender({
      renderedState: "rendered.1",
      graphType: "dot",
      usageGraphState: usageState,
    });
    expect(recordDiagnosticEvent).toHaveBeenCalledTimes(1);

    rerender({
      renderedState: "rendered.2",
      graphType: "dot",
      usageGraphState: { ...usageState, axes: "axes.2" },
    });
    expect(recordDiagnosticEvent).toHaveBeenLastCalledWith("graph_state_changed", {
      graphType: "dot",
      graphFingerprint: "fingerprint:rendered.2",
    });
    expect(recordUsageGraphEdit).toHaveBeenCalledTimes(1);
    expect(recordUsageGraphEdit.mock.calls[0]?.[1]).toBe("axes");
  });
});
